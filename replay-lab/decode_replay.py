"""Turn lossless network exports into readable values and a static playback bundle."""
from __future__ import annotations

import argparse
from bisect import bisect_right
from collections import Counter, defaultdict
import csv
import json
import math
from pathlib import Path

from parse_replay import Reader, ParseError, dump
from combat import enrich_combat


REFERENCES = set('Owner Instigator PlayerState Controller InstigatorPlayerState InstigatorState AvatarActor OwnerActor '
    'Rescuer RevengePlayerState AttachParent AttachComponent SourceActor TargetPointComponent '
    'InstigatedActor DamageCauser DamageTypeCDO Def Ability SourceObject HitActor LastSourcePlayerState'.split())
FLOATS = set('ReplayLastTransformUpdateTimeStamp ReplicatedWorldTimeSeconds CurrentValue BaseValue '
    'LastDeathTime Timestamp StartServerWorldTime Duration Period Level AbilityLevel '
    'LifeEndStamp LifeEndTimeStamp LifeEndTime PredictDistance MoveSpeed BeginTime BeginDist '
    'MaxDistance AutoBreakDistance AutoBreakDistanceOnWall TotalMagnitude EvaluatedMagnitude'.split())
INTEGERS = set('playerId CampID PlayerSerial TeamIndex SelectRoleId RoleSkinId PlayerPing NumKills NumRoundKills '
    'NumCauseInjured NumHeadshot NumDeaths NumAssist TotalDamage TotalRealDamage NumRoundDeaths '
    'NumRoundHeadshot NumRoundAssists RoundTotalDamage Round KillNum DeathNum AssistNum DamageNum TakeDamageNum '
    'CompositeScore PersonalScore TeamworkScore StrategyScore TotalDamageFloat10 AmmoRemain AmmoInMagazine '
    'Handle InputID StackCount SkinID AttributeSkinID WeaponSkinId WeaponID AttributeLevel ArousalLevel'.split())
VECTORS = set('Pos FixedSourceLocation InFoundPosition'.split())


def read_rows(path):
    with path.open(encoding='utf-8') as file:
        for line in file:
            yield json.loads(line)


def movement(r):
    sleep, physics = r.bit(), r.bit()
    value = dict(location=r.vector(100, 30), rotation=r.rotation(8), velocity=r.vector(1, 24),
                 sleeping=bool(sleep), physics=bool(physics))
    if physics:
        value['angular_velocity'] = r.vector(1, 24)
    return value


def decode(row):
    r = Reader(bytes.fromhex(row['raw']), row['bits'], bit_mode=True)
    name, group = row.get('name'), row.get('group', '')
    encoding = None
    if name == 'ReplicatedMovement' and '/Characters/' in group:
        value, encoding = movement(r), 'FRepMovement_location100_rotation8_velocity1'
    elif name in REFERENCES:
        value, encoding = r.packed(), 'NetGUID'
    elif name in ('UID', 'TargetUid', 'player_uid') and r.end == 64:
        value, encoding = str(r.uint(64)), 'uint64_string'
    elif name == 'PlayerNamePrivate':
        value, encoding = r.string(), 'FString'
    elif name in FLOATS and r.end == 32:
        value, encoding = r.f32(), 'float32'
        if not math.isfinite(value):
            raise ParseError('non-finite float')
    elif name in INTEGERS and r.end == 32:
        value, encoding = r.i32(), 'int32'
    elif name in VECTORS and r.end == 96:
        value, encoding = [r.f32() for _ in range(3)], 'FVector_float32'
    elif name in ('TargetViewRotation', 'RotationOffset'):
        value, encoding = r.rotation(16), 'FRotator_short'
    elif name in ('MovementInput', 'LocationOffset', 'RelativeScale3D'):
        value, encoding = r.vector(100, 30), 'FVector_NetQuantize100'
    elif name == 'RemoteViewPitch' and r.end == 8:
        # Engine network 14 predates HISTORY_PAWN_REMOTEVIEWPITCH (24).
        value, encoding = r.uint(8) * 360 / 255, 'legacy_pitch_byte_255_degrees'
    elif name == 'CompressedControllerRotation' and r.end == 32:
        packed = r.uint(32)
        yaw, pitch = packed & 65535, packed >> 16
        yaw = yaw - 65536 if yaw >= 32768 else yaw
        pitch = pitch - 65536 if pitch >= 32768 else pitch
        if not (-3600 <= yaw <= 3600 and -3600 <= pitch <= 3600):
            raise ParseError('controller rotation outside validated signed decimal-degree range')
        value = dict(yaw=yaw / 10, pitch=pitch / 10, packed=packed)
        encoding = 'int16_yaw_pitch_tenths_degree_sample_validated'
    elif name and name.startswith('b') and r.end == 1:
        value, encoding = bool(r.bit()), 'bool'
    elif name and 0 < r.end <= 8:
        value, encoding = r.uint(r.end), 'unsigned_code'
    else:
        return None
    if r.left:
        raise ParseError(f'{name}: {r.left} unconsumed bits')
    return dict(value=value, encoding=encoding)


def decode_delta(row, group):
    """UE fast-array delta, using the containing component's exported handles."""
    r = Reader(bytes.fromhex(row['raw']), row['bits'], bit_mode=True)
    support = r.bit()
    key, base, deleted, changed = [r.i32() for _ in range(4)]
    if not 0 <= deleted <= 10000 or not 0 <= changed <= 10000:
        raise ParseError('invalid fast array count')
    result = dict(key=key, base=base, support=bool(support), deleted=[r.i32() for _ in range(deleted)], changed=[])
    for _ in range(changed):
        element = dict(id=r.i32(), fields=[])
        while True:
            handle = r.packed()
            if not handle:
                break
            handle -= 1
            bits = r.packed()
            sub = r.sub(bits)
            field = group['fields'].get(str(handle))
            if not field:
                raise ParseError(f'unknown fast-array handle {handle}')
            item = dict(name=field['name'],handle=handle,bits=bits,raw=sub.data.hex(),group=group['path'])
            # AbilitySpec.Level is int32; GameplayEffectSpec.Level is float32.
            if row['name']=='ActivatableAbilities' and field['name']=='Level' and bits==32:
                value = dict(value=sub.i32(),encoding='int32')
            else:
                value = decode(item)
            element['fields'].append({**item,**(value or {})})
        result['changed'].append(element)
    if r.left:
        raise ParseError(f'fast array has {r.left} trailing bits')
    return result


def build(directory):
    directory = Path(directory)
    manifest = json.loads((directory / 'manifest.json').read_text(encoding='utf-8'))
    actors = json.loads((directory / 'actors.json').read_text(encoding='utf-8'))
    groups = json.loads((directory / 'netfields.json').read_text(encoding='utf-8'))
    ability_group = next(g for g in groups if g['path']=='/Script/PMGame.CyAbilitySystemComponent')
    events = json.loads((directory / 'events.json').read_text(encoding='utf-8'))
    guids = {g['guid']: g for g in json.loads((directory / 'netguids.json').read_text(encoding='utf-8'))}
    actor_map = {a['guid']: a for a in actors}
    players, ownership, bindings = {}, defaultdict(list), defaultdict(list)
    valid_uids = {e['fields'][1] for e in events if e['group'] == 'PlayerRespawn' and len(e['fields']) >= 2}
    stats, failures = Counter(), []
    decoded_file = (directory / 'decoded-properties.jsonl').open('w', encoding='utf-8')
    for row in read_rows(directory / 'properties.jsonl'):
        try:
            result = decode(row)
        except (ValueError, UnicodeError) as exc:
            stats['decode_errors'] += 1
            if len(failures) < 100:
                failures.append(dict(name=row.get('name'), bits=row['bits'], error=str(exc), source_bit=row.get('source_bit')))
            continue
        if result is None:
            stats['raw_only_records'] += 1
            continue
        stats['decoded_records'] += 1
        row.update(result)
        decoded_file.write(json.dumps(row, ensure_ascii=False, separators=(',', ':'), allow_nan=False)+'\n')
        actor, name, value, time = row['actor'], row.get('name'), row['value'], row['time_ms']
        if name in ('Owner', 'Instigator', 'InstigatorPlayerState', 'InstigatorState', 'PlayerState'):
            ownership[actor].append((time, value))
        if name == 'PlayerState' and '/Characters/' in row.get('group', ''):
            bindings[actor].append((time, value))
        if 'BP_PlayerState_Bomb' in row.get('group', '') and row['kind'] == 'property':
            player = players.setdefault(actor, dict(state_actor=actor, stats={}, samples=[], aim_samples=[], appearances=[], states=[]))
            if name == 'UID':
                player['uid'] = value
            elif name == 'PlayerNamePrivate':
                player['name'] = value
            elif name in ('AttributeTeamID', 'TeamIndex', 'CampID'):
                player[name] = value
            elif name in ('NumKills', 'NumDeaths', 'NumAssist', 'TotalDamage', 'TotalRealDamage'):
                player['stats'][name] = value
    decoded_file.close()
    players = {a:p for a,p in players.items() if p.get('uid') in valid_uids}
    for player in players.values():
        player.setdefault('name', player['uid'])
    duration = manifest['info']['duration_ms']
    for actor, entries in bindings.items():
        a = actor_map[actor]
        for i,(time,state) in enumerate(entries):
            end = min(a.get('end_ms', duration), entries[i+1][0] if i+1<len(entries) else duration)
            if state in players and time <= end:
                players[state]['appearances'].append(dict(actor=actor, from_ms=time, to_ms=end,
                    character=a['path'].removeprefix('Default__BP_Character_').removesuffix('_C')))

    def owner(actor, time, depth=0):
        if actor in players:
            return actor
        if depth > 8:
            return None
        entries = bindings.get(actor) or ownership.get(actor)
        if entries:
            index = bisect_right(entries, (time, 2**64))-1
            if index >= 0 and entries[index][1] != actor:
                return owner(entries[index][1], time, depth+1)
        outer = guids.get(actor, {}).get('outer')
        if outer and outer != actor:
            return owner(outer, time, depth+1)
        return None

    timeline, movement_rows, state_rows = [], 0, 0
    cumulative = {}
    aim = {}
    with (directory / 'movement.csv').open('w', encoding='utf-8-sig', newline='') as csv_file, \
            (directory / 'aim.csv').open('w', encoding='utf-8-sig', newline='') as aim_file:
        writer = csv.writer(csv_file)
        aim_writer = csv.writer(aim_file)
        writer.writerow(['time_ms','uid','actor','x_cm','y_cm','z_cm','yaw_deg','pitch_deg','roll_deg','vx_cm_s','vy_cm_s','vz_cm_s'])
        aim_writer.writerow(['time_ms','uid','actor','yaw_deg','pitch_deg','packed_uint32','source_bit'])
        for row in read_rows(directory / 'decoded-properties.jsonl'):
            time, actor, name, value = row['time_ms'], row['actor'], row.get('name'), row['value']
            state = owner(actor,time)
            player = players.get(state)
            if name == 'RemoteViewPitch':
                aim[actor] = value
            if name == 'CompressedControllerRotation':
                stats['controller_rotation_records'] += 1
                aim_writer.writerow([time,player['uid'] if player else '',actor,value['yaw'],value['pitch'],value['packed'],row.get('source_bit')])
                if player and any(a['actor']==actor and a['from_ms']<=time<=a['to_ms'] for a in player['appearances']):
                    sample = [time,value['yaw'],value['pitch'],actor]
                    if player['aim_samples'] and player['aim_samples'][-1][0] == time:
                        player['aim_samples'][-1] = sample
                    else:
                        player['aim_samples'].append(sample)
                else:
                    stats['controller_rotation_outside_player_character'] += 1
            if name == 'ReplicatedMovement':
                movement_rows += 1
                loc, rot, vel = value['location'], value['rotation'], value['velocity']
                writer.writerow([time,player['uid'] if player else '',actor,*loc,rot[1],rot[0],rot[2],*vel])
                if player:
                    sample = [time, *loc, rot[1], aim.get(actor,rot[0]), actor]
                    if player['samples'] and player['samples'][-1][0] == time:
                        player['samples'][-1] = sample
                    else:
                        player['samples'].append(sample)
                    stats['player_movement_samples'] += 1
            elif player and row['kind'] == 'property' and name in (
                'ReplicatedMovementMode','AmmoRemain','AmmoInMagazine','MagazineState','ArousalLevel',
                'AttributeTeamID','NumKills','NumDeaths','NumAssist','TotalDamage','TotalRealDamage',
                'bIsSpectator','bBleeding','Rescuer','SelectRoleId'):
                entry = dict(time_ms=time, kind='state', uid=player['uid'], actor=actor,
                    name=name, value=value, source_bit=row.get('source_bit'))
                player['states'].append(entry)
                state_rows += 1
                if name == 'TotalDamage':
                    old = cumulative.get(state,0)
                    cumulative[state] = value
                    if value > old:
                        timeline.append(dict(time_ms=time, kind='damage_total_delta', uid=player['uid'],
                            amount=value-old, total=value, source_bit=row.get('source_bit'),
                            note='Replicated cumulative damage increase; may combine multiple hits.'))
            elif player and row['kind']=='property' and name in ('CurrentValue','BaseValue'):
                # Exported child names repeat. Handle must remain part of the key.
                leaf=row['group'].rsplit('.',1)[-1]
                player['states'].append(dict(time_ms=time,kind='attribute',uid=player['uid'],actor=actor,
                    object=row['object'],group=row['group'],handle=row['handle'],
                    name=f'{leaf}.{name}[{row["handle"]}]',value=value,source_bit=row.get('source_bit')))
                state_rows += 1
    # Keep RPC invocation plus its named parameters. An exact per-hit damage amount
    # is not invented from a cumulative counter or an opaque custom EventData struct.
    pending = None
    abilities, effects = {}, {}
    delta_file = (directory / 'ability-effects.jsonl').open('w',encoding='utf-8')
    for row in read_rows(directory / 'properties.jsonl'):
        if row.get('name') in ('SyncStateData','SyncSwitchData') and row['kind']=='property':
            state=owner(row['actor'],row['time_ms'])
            if state in players:
                leaf=row['group'].rsplit('.',1)[-1]
                players[state]['states'].append(dict(time_ms=row['time_ms'],kind='state_raw',uid=players[state]['uid'],
                    actor=row['actor'],object=row['object'],name=f'{leaf}.{row["name"]}',
                    value=dict(bits=row['bits'],raw=row['raw'],meaning='custom serialization unresolved'),source_bit=row.get('source_bit')))
                state_rows += 1
        if row.get('name') in ('ActivatableAbilities','ActiveGameplayEffects'):
            if pending:
                timeline.append(pending)
                pending = None
            try:
                delta = decode_delta(row, ability_group)
                stats['decoded_delta_arrays'] += 1
                state = owner(row['actor'],row['time_ms'])
                uid = players[state]['uid'] if state in players else None
                for element in delta['deleted']:
                    if row['name']=='ActivatableAbilities':
                        abilities.pop((row['actor'],element),None)
                    else:
                        old=effects.pop((row['actor'],element),{})
                        timeline.append(dict(time_ms=row['time_ms'],kind='effect_removed',uid=uid,actor=row['actor'],
                            element=element,effect=old.get('DefPath'),source_bit=row.get('source_bit')))
                for item in delta['changed']:
                    vals = {f['name']:f.get('value') for f in item['fields'] if 'value' in f}
                    if row['name']=='ActivatableAbilities':
                        previous = abilities.setdefault((row['actor'],item['id']),{})
                        previous.update(vals)
                    else:
                        key=(row['actor'],item['id'])
                        kind='effect_updated' if key in effects else 'effect_added'
                        previous=effects.setdefault(key,{})
                        previous.update(vals)
                        previous['DefPath']=guids.get(previous.get('Def'),{}).get('path','')
                        timeline.append(dict(time_ms=row['time_ms'],kind=kind,uid=uid,actor=row['actor'],element=item['id'],
                            effect=previous['DefPath'],duration=previous.get('Duration'),level=previous.get('Level'),
                            parameters=item['fields'],source_bit=row.get('source_bit')))
                delta_file.write(json.dumps(dict(time_ms=row['time_ms'],actor=row['actor'],object=row['object'],
                    name=row['name'],value=delta,source_bit=row.get('source_bit')),ensure_ascii=False,separators=(',',':'))+'\n')
            except (ValueError,KeyError) as exc:
                stats['delta_decode_errors'] += 1
                if len(failures)<100:
                    failures.append(dict(name=row['name'],source_bit=row.get('source_bit'),error=str(exc)))
            continue
        if row['kind'] == 'rpc':
            if pending:
                timeline.append(pending)
            state = owner(row['actor'],row['time_ms'])
            pending = dict(time_ms=row['time_ms'],kind='rpc',name=row['name'],actor=row['actor'],
                object=row['object'],uid=players[state]['uid'] if state in players else None,
                parameters=[],source_bit=row.get('source_bit'))
        elif row['kind'] == 'rpc_parameter' and pending:
            try:
                value = decode(row)
            except (ValueError, UnicodeError):
                value = None
            pending['parameters'].append(dict(name=row['name'],handle=row.get('handle'),
                **(value or dict(raw=row['raw'],bits=row['bits']))))
            if value and value['encoding']=='NetGUID':
                target=owner(value['value'],row['time_ms'])
                param=pending['parameters'][-1]
                param['object_path']=guids.get(value['value'],actor_map.get(value['value'],{})).get('path','')
                if target in players:
                    param['uid']=players[target]['uid']
            if pending['name']=='MulticastNotifyAbilityActivated' and row['name']=='Handle' and value:
                handle=value['value']
                matches=[v for (actor,element),v in abilities.items() if actor==row['actor'] and v.get('Handle')==handle]
                if len(matches)==1:
                    guid=matches[0].get('Ability')
                    pending['ability']=dict(handle=handle,guid=guid,path=guids.get(guid,{}).get('path',''),input_id=matches[0].get('InputID'))
                    stats['named_ability_activations'] += 1
    if pending:
        timeline.append(pending)
    delta_file.close()
    for event in events:
        entry={**event, 'kind':'event'}
        if event['group']=='PlayerDeath' and len(event['fields'])==4:
            entry.update(victim_uid=event['fields'][1],attacker_uid=event['fields'][3],
                         interpretation='victim first; verified against NumDeaths replication in sample')
        timeline.append(entry)
    timeline.sort(key=lambda e:e['time_ms'])
    for player in players.values():
        player['states'].sort(key=lambda s:s['time_ms'])
    attribute_semantics, combat_report = enrich_combat(list(players.values()), timeline, groups)
    rounds = [e for e in events if e['group']=='BombRound']
    bundle = dict(schema='kanami-replay-playback-v1', source=dict(file=manifest['file'],sha256=manifest['sha256']),
        duration_ms=duration, map=manifest['headers'][0]['levels'][0]['name'],
        coordinate_system=dict(units='Unreal centimeters',axes='X/Y horizontal, Z up',yaw='degrees around Z'),
        sample_columns=['time_ms','x','y','z','yaw','pitch','actor'],players=list(players.values()),
        aim_columns=['time_ms','yaw','pitch','actor'],
        timeline=timeline,rounds=rounds,attribute_semantics=attribute_semantics,
        limitations=['Map collision/geometry and character models are not embedded in this export.',
            'Body yaw comes from ReplicatedMovement. Separate controller aim uses sample-validated signed 16-bit tenths of a degree; raw packed values remain in aim.csv.',
            'Damage total deltas may aggregate hits. Opaque damage EventData is retained with the RPC.',
            'Unknown properties and custom state structures remain in properties.jsonl; ability/effect deltas are in ability-effects.jsonl.'],
        counts=dict(movement_records=movement_rows,state_updates=state_rows,timeline=len(timeline),players=len(players)))
    (directory / 'playback.json').write_text(json.dumps(bundle,ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf-8')
    dump(directory / 'timeline.json', timeline)
    dump(directory / 'combat-report.json', combat_report)
    dump(directory / 'decode-report.json',dict(counts=dict(stats),failures=failures,
        **bundle['counts'],combat=combat_report['counts'],player_summary=[dict(uid=p['uid'],name=p['name'],samples=len(p['samples']),appearances=len(p['appearances']),stats=p['stats']) for p in players.values()]))
    print(json.dumps(dict(stats=stats,**bundle['counts']),ensure_ascii=False,indent=2))


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('directory',type=Path)
    build(cli.parse_args().directory)
