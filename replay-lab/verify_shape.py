"""Cross-check sample movement modes against named replay gameplay target tags."""
import argparse
import bisect
from collections import Counter, defaultdict
import json
from pathlib import Path

from parse_replay import Reader


def verify(directory):
    fields = json.loads((directory / 'netfields.json').read_text(encoding='utf-8'))
    group = next(g for g in fields if g['path'] == 'NetworkGameplayTagNodeIndex')
    names = {int(handle): field['name'] for handle, field in group['fields'].items()}
    data = json.loads((directory / 'playback.json').read_text(encoding='utf-8'))
    players = {p['uid']: p for p in data['players']}
    modes = defaultdict(list)
    for player in data['players']:
        for state in player['states']:
            if state['name'] == 'ReplicatedMovementMode':
                modes[player['uid'], state['actor']].append(state)
    for samples in modes.values():
        samples.sort(key=lambda s: s['time_ms'])
    times = {key: [s['time_ms'] for s in samples] for key, samples in modes.items()}
    observed = defaultdict(Counter)
    containers = 0
    invalid_tags = 0
    for event in data['timeline']:
        for parameter in event.get('parameters', []):
            if parameter['name'] not in ('AggregatedSourceTags', 'AggregatedTargetTags'):
                continue
            if 'raw' not in parameter:
                continue
            reader = Reader(bytes.fromhex(parameter['raw']), parameter['bits'], bit_mode=True)
            indices = [] if reader.bit() else [reader.packed() for _ in range(reader.uint(6))]
            assert reader.left == 0, 'gameplay tag container has trailing bits'
            assert all(index in names or index == 65535 for index in indices), 'unexported tag'
            invalid_tags += indices.count(65535)
            containers += 1
            # Source tags are snapshots of the effect source, not necessarily event.uid.
            if parameter['name'] != 'AggregatedTargetTags':
                continue
            player = players.get(event.get('uid'))
            if not player:
                continue
            appearance = next((a for a in player['appearances']
                               if a['from_ms'] <= event['time_ms'] <= a['to_ms']), None)
            if not appearance:
                continue
            key = player['uid'], appearance['actor']
            index = bisect.bisect_right(times.get(key, []), event['time_ms']) - 1
            if index < 0:
                continue
            sample = modes[key][index]
            if sample['time_ms'] < appearance['from_ms']:
                continue
            for tag in (names.get(i, '') for i in indices):
                if tag.startswith('State.Shape.'):
                    observed[tag][sample['value']] += 1
    expected = {'State.Shape.2D.Side': {19}, 'State.Shape.2D.Flying': {20},
                'State.Shape.2D.Wall': {21}, 'State.Shape.3D': {0, 1, 3}}
    for tag, values in expected.items():
        counts = observed[tag]
        total = sum(counts.values())
        assert total >= 20, f'insufficient independent target tags for {tag}'
        assert sum(counts[v] for v in values) / total >= .95, f'mode/tag disagreement: {tag}'
    return {'status': 'passed', 'source_sha256': data['source']['sha256'],
            'tag_containers_exactly_consumed': containers, 'invalid_tag_sentinels': invalid_tags,
            'target_shape_tags_by_current_mode': {tag: dict(counts) for tag, counts in observed.items()},
            'limitation': 'Sample-specific correlation; separate replication streams may differ near transitions.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.directory), ensure_ascii=False, indent=2))
