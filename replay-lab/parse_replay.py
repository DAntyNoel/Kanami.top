"""Bounded, loss-preserving Strinova UE4.25 replay reader (Python stdlib only).

Protocol reference: Shiqan/FortniteReplayDecompressor (MIT), Unreal.Core.
This implementation deliberately retains unknown property bits rather than guessing types.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import math
from pathlib import Path
import struct

NAMES = json.loads(Path(__file__).with_name('unreal_names.json').read_text(encoding='utf-8'))


class ParseError(ValueError):
    pass


class Reader:
    def __init__(self, data, bits=None, origin=0, bit_mode=False, spans=None):
        self.data = data
        self.pos = 0
        self.end = len(data) * 8 if bits is None else bits
        self.origin = origin
        self.bit_mode = bit_mode
        self.spans = spans if spans is not None else [(0, self.end, origin)]

    @property
    def left(self):
        return self.end - self.pos

    def uint(self, n):
        if n < 0 or n > self.left:
            raise ParseError(f"read {n} bits at {self.origin}+{self.pos}, only {self.left} left")
        start, shift = divmod(self.pos, 8)
        self.pos += n
        return (int.from_bytes(self.data[start:(self.pos + 7) // 8], 'little') >> shift) & ((1 << n) - 1)

    def bit(self):
        return self.uint(1)

    def boolean(self):
        return self.uint(1 if self.bit_mode else 8)

    def raw(self, n):
        return self.uint(n * 8).to_bytes(n, 'little')

    def sub(self, n, bit_mode=True):
        origin = self.origin + self.pos
        begin, end = self.pos, self.pos + n
        spans = []
        for start, count, source in self.spans:
            lo, hi = max(start, begin), min(start + count, end)
            if hi > lo:
                spans.append((lo-begin, hi-lo, source+lo-start))
        return Reader(self.uint(n).to_bytes((n + 7) // 8, 'little'), n, origin, bit_mode, spans)

    def provenance(self):
        return dict(source_bit=self.spans[0][2] if len(self.spans)==1 else None,
                    source_spans=[dict(bit=source, count=count) for _,count,source in self.spans])

    def i32(self):
        n = self.uint(32)
        return n - 2**32 if n >= 2**31 else n

    def f32(self):
        return struct.unpack('<f', self.raw(4))[0]

    def packed(self):
        value = 0
        for shift in range(0, 35, 7):
            b = self.uint(8)
            value |= (b >> 1) << shift
            if not b & 1:
                if value > 0xffffffff:
                    raise ParseError('packed uint32 overflow')
                return value
        raise ParseError('packed uint32 too long')

    def serial(self, maximum):
        value, mask = 0, 1
        while value + mask < maximum:
            if self.bit():
                value |= mask
            mask <<= 1
        return value

    def string(self):
        n = self.i32()
        size = n if n >= 0 else -2 * n
        if size > 1024 * 1024:
            raise ParseError(f'oversize FString {n}')
        data = self.raw(size)
        if n == 0:
            return ''
        terminator = b'\0' if n > 0 else b'\0\0'
        if not data.endswith(terminator):
            raise ParseError('unterminated FString')
        return data[:-len(terminator)].decode('utf-8' if n > 0 else 'utf-16le')

    def name(self):
        if self.boolean():
            index = str(self.packed())
            return NAMES.get(index, '#' + index)
        value = self.string()
        number = self.i32()
        return value if not number else f'{value}_{number-1}'

    def vector(self, scale=1, max_bits=24):
        width = self.serial(max_bits)
        bias = 1 << (width + 1)
        return [(self.uint(width + 2) - bias) / scale for _ in range(3)]

    def rotation(self, width=16):
        return [self.uint(width) * 360 / (1 << width) if self.bit() else 0 for _ in range(3)]

    def spawn_vector(self, default):
        if not self.bit():
            return default
        return self.vector(10, 24) if self.bit() else [self.f32() for _ in range(3)]

    def remaining_hex(self):
        count = self.left
        return self.uint(count).to_bytes((count + 7) // 8, 'little').hex()


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')


class ReplayParser:
    def __init__(self, source, output):
        self.source, self.output = Path(source), Path(output)
        self.output.mkdir(parents=True, exist_ok=True)
        self.groups, self.guids, self.channels, self.partial = {}, {}, {}, {}
        self.object_types = {}
        self.actor_index = {}
        self.actors, self.events, self.chunks, self.errors = [], [], [], []
        self.counts = collections.Counter()
        self.fields = collections.Counter()
        self.time = 0
        self.properties_file = (self.output / 'properties.jsonl').open('w', encoding='utf-8')
        self.packets_file = (self.output / 'packets.jsonl').open('w', encoding='utf-8')

    def write(self, file, value):
        file.write(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')

    def error(self, layer, exc, **context):
        self.counts[f'{layer}_errors'] += 1
        if len(self.errors) < 500:
            self.errors.append(dict(layer=layer, time_ms=self.time, error=str(exc), **context))

    def object(self, r, exporting=False, depth=0):
        if depth > 16:
            raise ParseError('NetGUID nesting exceeds 16')
        guid = r.packed()
        if guid and (guid == 1 or exporting):
            flags = r.uint(8)
            if flags & 1:
                outer = self.object(r, True, depth + 1)
                name = r.string()
                checksum = r.uint(32) if flags & 4 else None
                self.guids[guid] = dict(guid=guid, outer=outer, path=name, checksum=checksum)
        return guid

    def exports(self, r):
        count = r.packed()
        if count > 100000:
            raise ParseError('too many field exports')
        for _ in range(count):
            idx = r.packed()
            if r.packed():
                path, size = r.string(), r.packed()
                self.groups[idx] = dict(path=path, size=size, fields={})
            if r.boolean():
                handle, checksum, name = r.packed(), r.uint(32), r.name()
                self.groups[idx]['fields'][handle] = dict(name=name, checksum=checksum)
        for _ in range(r.packed()):
            size = r.i32()
            sub = r.sub(size * 8)
            self.object(sub, True)
            if sub.left > 7:
                raise ParseError('NetGUID export has trailing bytes')

    def group_for(self, guid):
        guid = self.object_types.get(guid, guid)
        path = self.guids.get(guid, {}).get('path', '')
        if not path:
            return None
        leaf = path.rsplit('.', 1)[-1].rsplit('/', 1)[-1].removeprefix('Default__')
        outer_path = self.guids.get(self.guids.get(guid, {}).get('outer'), {}).get('path', '')
        full_path = outer_path + '.' + leaf
        exact = [g for g in self.groups.values() if g['path'] == full_path]
        if len(exact) == 1:
            return exact[0]
        candidates = [g for g in self.groups.values() if g['path'].rsplit('.', 1)[-1].rsplit('/', 1)[-1] == leaf]
        if len(candidates) == 1:
            return candidates[0]
        aliases = {'AbilitySystemComponent': 'CyAbilitySystemComponent', 'CyAbilitySystem': 'CyAbilitySystemComponent',
                   'PartMagazine': 'CyPartMagazine', 'AnimationComp': 'PMAnimationComponent',
                   'SwitcherHold': 'CyFHoldSwitcher', 'SwitcherAttack': 'CyFFireSwitcher'}
        if leaf == 'Machine':
            owner = self.actor_index.get(self.guids.get(guid, {}).get('outer'), {}).get('path', '')
            alias = 'CyCMachine' if 'BP_Character_' in owner else 'CyGMachine' if 'GameState' in owner else 'CyFMachine'
        else:
            alias = aliases.get(leaf)
        alternatives = {alias} if alias else {leaf+'Component', 'Cy'+leaf, 'Cy'+leaf+'Component', leaf+'_C'}
        candidates = [g for g in self.groups.values() if g['path'].rsplit('.', 1)[-1] in alternatives]
        if len(candidates) == 1:
            return {**candidates[0], 'mapping': 'component_name_alias'}
        # Some components export only RPCs, with no replicated property layout.
        caches = [g for g in self.groups.values() if g['path'].removesuffix('_ClassNetCache') in alternatives | {leaf} and g['path'].endswith('_ClassNetCache')]
        if len(caches) == 1:
            return dict(path=caches[0]['path'].removesuffix('_ClassNetCache'), size=0, fields={}, mapping='rpc_component_alias')
        return None

    def properties(self, r, group, actor, obj, kind='property'):
        r.bit()  # checksum flag; modern replay layouts carry compatible checksums in exports
        while True:
            handle = r.packed()
            if handle == 0:
                return
            handle -= 1
            size = r.packed()
            field = group['fields'].get(handle)
            if handle >= group['size']:
                raise ParseError(f'property handle {handle} outside {group["path"]}')
            sub = r.sub(size)
            name = field['name'] if field else f'handle_{handle}'
            row = dict(time_ms=self.time, actor=actor['guid'], channel=actor['channel'], object=obj,
                       group=group['path'], kind=kind, name=name, handle=handle, bits=size, raw=sub.data.hex(),
                       **sub.provenance())
            if 'mapping' in group:
                row['mapping'] = group['mapping']
            self.fields[(group['path'], name, size)] += 1
            self.counts['properties'] += 1
            self.write(self.properties_file, row)

    def actor_bunch(self, r, b):
        channel = b['channel']
        if b['mapped']:
            for _ in range(r.uint(16)):
                r.packed()
        actor = self.channels.get(channel)
        if actor is None:
            if not b['open']:
                self.counts['unopened_bunches'] += 1
                return
            guid = self.object(r)
            actor = dict(guid=guid, channel=channel, start_ms=self.time)
            if not guid & 1:
                if not r.left:
                    return
                actor.update(archetype=self.object(r), level=self.object(r))
                actor['location'] = r.spawn_vector([0, 0, 0])
                actor['rotation'] = r.rotation() if r.bit() else [0, 0, 0]
                actor['scale'] = r.spawn_vector([1, 1, 1])
                actor['velocity'] = r.spawn_vector([0, 0, 0])
            actor['path'] = self.guids.get(actor.get('archetype', guid), {}).get('path', '')
            self.channels[channel] = actor
            self.actors.append(actor)
            self.actor_index[guid] = actor
            if 'PlayerController' in actor['path']:
                r.uint(8)
        while r.left:
            layout, is_actor = r.bit(), r.bit()
            obj = actor['guid']
            typ = actor.get('archetype', obj)
            if not is_actor:
                obj = self.object(r)
                if r.bit():
                    typ = obj
                else:
                    typ = self.object(r)
                    if not typ:
                        self.object_types.pop(obj, None)
                        continue
                    self.object_types[obj] = typ
            size = r.packed()
            sub = r.sub(size)
            if not size:
                continue
            group = self.group_for(typ)
            if not group:
                self.counts['unmapped_blocks'] += 1
                self.write(self.properties_file, dict(time_ms=self.time, actor=actor['guid'], object=obj,
                    type_guid=typ, kind='unmapped_block', has_layout=layout, bits=size, raw=sub.data.hex(), **sub.provenance()))
                continue
            try:
                if layout:
                    self.properties(sub, group, actor, obj)
                if sub.left:
                    cache_name = group['path'].rsplit('.', 1)[-1].rsplit('/', 1)[-1] + '_ClassNetCache'
                    caches = [g for g in self.groups.values() if g['path'] == cache_name]
                    if not caches:
                        self.counts['uncached_rpc_blocks'] += 1
                        continue
                    cache = caches[0]
                    while sub.left:
                        handle = sub.serial(max(cache['size'], 2))
                        rpc = sub.sub(sub.packed())
                        name = cache['fields'].get(handle, {}).get('name', f'handle_{handle}')
                        self.write(self.properties_file, dict(time_ms=self.time, actor=actor['guid'], object=obj,
                            group=cache_name, kind='rpc', name=name, bits=rpc.end, raw=rpc.data.hex(), **rpc.provenance()))
                        self.counts['rpc'] += 1
                        functions = [g for g in self.groups.values() if g['path'].endswith(':' + name)]
                        if len(functions) == 1:
                            self.properties(rpc, functions[0], actor, obj, kind='rpc_parameter')
                            if rpc.left:
                                raise ParseError(f'RPC parameters trailing {rpc.left} bits: {name}')
            except (ParseError, UnicodeError, KeyError) as exc:
                self.error('properties', exc, actor=actor['guid'], group=group['path'])
        if b['close']:
            actor['end_ms'] = self.time
            actor['close_reason'] = b['reason']
            self.channels.pop(channel, None)

    def packet(self, r):
        while r.left:
            self.counts['bunches'] += 1
            control = r.bit()
            b = dict(open=bool(control and r.bit()), close=bool(control and r.bit()))
            b['reason'] = r.serial(15) if b['close'] else None
            b['paused'], b['reliable'] = r.bit(), r.bit()
            b['channel'] = r.packed()
            b['exports'], b['mapped'], b['partial'] = r.bit(), r.bit(), r.bit()
            b['initial'] = b['partial'] and r.bit()
            b['final'] = b['partial'] and r.bit()
            b['name'] = r.name() if b['open'] or b['reliable'] else None
            sub = r.sub(r.serial(16384))
            if b['exports']:
                if sub.bit():
                    raise ParseError('legacy NetFieldExport bunch unsupported')
                for _ in range(sub.i32()):
                    self.object(sub, True)
            if b['partial']:
                channel = b['channel']
                if b['initial']:
                    self.partial[channel] = (b.copy(), 0, 0, sub.origin, [])
                if channel not in self.partial:
                    raise ParseError('orphan partial bunch')
                first, value, bits, origin, spans = self.partial[channel]
                if not b['exports']:
                    count = sub.left
                    part = sub.sub(count)
                    spans.extend((offset+bits,length,source) for offset,length,source in part.spans)
                    value |= int.from_bytes(part.data,'little') << bits
                    bits += count
                self.partial[channel] = first, value, bits, origin, spans
                if not b['final']:
                    continue
                sub = Reader(value.to_bytes((bits + 7) // 8, 'little'), bits, origin, True, spans)
                first.update(close=b['close'], reason=b['reason'])
                b = first
                del self.partial[channel]
            try:
                self.actor_bunch(sub, b)
            except (ParseError, UnicodeError, KeyError) as exc:
                self.error('bunch', exc, channel=b['channel'], origin=sub.origin, name=b['name'])

    def frames(self, r):
        while r.left:
            start = r.pos
            level, seconds = r.i32(), r.f32()
            if not math.isfinite(seconds) or not 0 <= seconds <= 1e6:
                raise ParseError(f'invalid frame time {seconds}')
            self.time = round(seconds * 1000)
            self.exports(r)
            for _ in range(r.packed()):
                r.string(), r.string(), r.raw(40)
            while True:
                bits = r.packed()
                if not bits:
                    break
                guid = r.packed()
                data = r.raw((bits + 7) // 8)
                self.write(self.properties_file, dict(time_ms=self.time, actor=guid, kind='external', bits=bits, raw=data.hex()))
                self.counts['external'] += 1
            packets = 0
            while True:
                size = r.i32()
                if size == 0:
                    break
                if not 0 < size <= 2048:
                    raise ParseError(f'invalid packet length {size}')
                origin = r.origin + r.pos
                data = r.raw(size)
                self.counts['packets'] += 1
                packets += 1
                if not data[-1]:
                    raise ParseError('packet missing terminator bit')
                bits = (size - 1) * 8 + data[-1].bit_length() - 1
                try:
                    self.packet(Reader(data, bits, origin, True))
                except (ParseError, UnicodeError, KeyError) as exc:
                    self.error('packet', exc, origin=origin)
            self.counts['frames'] += 1
            self.write(self.packets_file, dict(time_ms=self.time, level=level, source_byte=(r.origin + start)//8,
                size_bytes=(r.pos-start)//8, packets=packets))

    def run(self):
        data = self.source.read_bytes()
        r = Reader(data)
        if r.uint(32) != 0x1ca2e27f:
            raise ParseError('not a UE local replay')
        info = dict(version=r.uint(32), duration_ms=r.uint(32), network_version=r.uint(32), changelist=r.uint(32),
                    friendly_name=r.string().rstrip(), live=r.uint(32), timestamp_ticks=str(r.uint(64)),
                    compressed=r.uint(32), encrypted=r.uint(32))
        key = r.raw(r.i32())
        if info['version'] != 6 or info['compressed'] or info['encrypted'] or key:
            raise ParseError('supported profile: uncompressed, unencrypted local file version 6')
        headers = []
        while r.left:
            offset = r.pos // 8
            typ, size = r.uint(32), r.i32()
            chunk = r.sub(size*8, False)
            self.chunks.append(dict(type=typ, offset=offset, size=size))
            if typ == 0:
                if chunk.uint(32) != 0x2cf5a13d:
                    raise ParseError('invalid network header')
                h = dict(version=chunk.uint(32), checksum=chunk.uint(32), engine_network_version=chunk.uint(32),
                    game_network_version=chunk.uint(32), guid=chunk.raw(16).hex(), engine=[chunk.uint(16) for _ in range(3)],
                    changelist=chunk.uint(32), branch=chunk.string())
                h['levels'] = [dict(name=chunk.string(), time_ms=chunk.uint(32)) for _ in range(chunk.uint(32))]
                h['flags'] = chunk.uint(32)
                h['game_data'] = [chunk.string() for _ in range(chunk.uint(32))]
                if h['version'] != 14 or h['engine_network_version'] != 14 or h['flags'] != 0:
                    raise ParseError('supported network profile: version 14, engine 14, flags 0')
                if chunk.left:
                    raise ParseError('network header trailing data')
                headers.append(h)
            elif typ == 3:
                event = dict(id=chunk.string(), group=chunk.string(), metadata=chunk.string(),
                    time_ms=chunk.uint(32), end_ms=chunk.uint(32))
                event['payload_hex'] = chunk.raw(chunk.i32()).hex()
                event['fields'] = event['metadata'].split('|')
                event['source_byte'] = offset
                self.events.append(event)
                if chunk.left:
                    raise ParseError('event trailing bytes')
            elif typ == 1:
                begin, end, length, memory = [chunk.uint(32) for _ in range(4)]
                self.chunks[-1].update(start_ms=begin, end_ms=end, data_bytes=length, memory_bytes=memory)
                stream = chunk.sub(length * 8, False)
                if chunk.left:
                    raise ParseError('replay data trailing bytes')
                try:
                    self.frames(stream)
                except (ParseError, UnicodeError, KeyError) as exc:
                    self.error('frame', exc, chunk=offset)
            else:
                self.counts['unknown_chunks'] += 1
        self.properties_file.close()
        self.packets_file.close()
        dump(self.output / 'events.json', self.events)
        dump(self.output / 'actors.json', self.actors)
        dump(self.output / 'netguids.json', list(self.guids.values()))
        dump(self.output / 'object-types.json', self.object_types)
        dump(self.output / 'netfields.json', list(self.groups.values()))
        dump(self.output / 'field-stats.json', [dict(group=k[0], name=k[1], bits=k[2], count=v) for k,v in self.fields.most_common()])
        dump(self.output / 'errors.json', self.errors)
        report = dict(schema='strinova-replay-v1', file=self.source.name, sha256=hashlib.sha256(data).hexdigest(),
            bytes=len(data), info=info, headers=headers, chunks=self.chunks, counts=dict(self.counts),
            actors=len(self.actors), guids=len(self.guids), field_groups=len(self.groups), events=len(self.events),
            pending_partial_bunches=len(self.partial))
        dump(self.output / 'manifest.json', report)
        print(json.dumps({k:v for k,v in report.items() if k not in ('chunks','headers')}, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('replay', type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    ReplayParser(args.replay, args.out).run()


if __name__ == '__main__':
    main()
