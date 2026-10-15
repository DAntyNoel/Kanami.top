"""Attach confirmed round results and sample-inferred active phases to playback.

CyGMachine's custom layout remains opaque: only the complete, observed 139-bit
signatures and their sequence are recognized. No fixed preparation delay is used.
"""
from bisect import bisect_right
from collections import Counter

from parse_replay import Reader, ParseError


GAME_STATE_CLASS = 'Default__BP_PMGameState_BombMatch_C'
MACHINE_GROUP = '/Script/PMGame.CyGMachine'
WINNER_GROUP = '/Script/PMGame.CyGameState:MulticastWinnerTeam'


def signature(row):
    if row.get('bits') != 139 or row.get('name') != 'SyncStateData':
        return None
    raw = bytes.fromhex(row['raw'])
    if len(raw) != 18 or raw[-1] & 0xf8:
        return None
    return int.from_bytes(raw[:12], 'little')


def winner_array(row, child_handle):
    """Read a complete UE compatible-layout byte array; reject partial/unknown data."""
    if child_handle is None or 'raw' not in row:
        return None
    try:
        raw = bytes.fromhex(row['raw'])
        if row['bits'] != len(raw) * 8:
            return None
        reader = Reader(raw, row['bits'], bit_mode=True)
        count = reader.packed()
        if count > 2:
            return None
        values = [None] * count
        while True:
            index = reader.packed()
            if index == 0:
                break
            index -= 1
            if index >= count or values[index] is not None:
                return None
            if reader.packed() != child_handle + 1 or reader.packed() != 8:
                return None
            value = reader.uint(8)
            if value not in (0, 1) or reader.packed() != 0:
                return None
            values[index] = value
        if reader.left or any(value is None for value in values):
            return None
        return values
    except (ValueError, ParseError):
        return None


def add_round_scores(rounds, timeline):
    """Count one confirmed winner per round; missing history makes totals unknown."""
    score = [0, 0]
    for index, round_ in enumerate(rounds, 1):
        suffix = round_.get('id', '').rsplit('_', 1)[-1]
        if suffix != str(index):
            score = None
        round_['score_before'] = score.copy() if score is not None else None
        teams = round_['winner_teams']
        if round_['ended_ms'] is None or len(teams) != 1:
            score = None
            round_['score_after'] = None
        else:
            if score is not None:
                score[teams[0]] += 1
            round_['score_after'] = score.copy() if score is not None else None
    for event in timeline:
        phase = event.get('round_phase')
        if phase:
            round_ = rounds[phase['round_number'] - 1]
            phase['score_before'] = round_['score_before']
            if phase['phase'] == 'ended':
                phase['score_after'] = round_['score_after']
        elif event.get('group') == 'BombRound' and event.get('round_number'):
            event['score_before'] = rounds[event['round_number'] - 1]['score_before']


def enrich_rounds(markers, timeline, machine_rows, game_states, groups, duration):
    rounds = [dict(marker, round_number=i + 1, active_ms=None,
                   active_confidence=None, ended_ms=None, winner_teams=[])
              for i, marker in enumerate(sorted(markers, key=lambda e: e['time_ms']))]
    times = [r['time_ms'] for r in rounds]
    counts = Counter()
    group = next((g for g in groups if g['path'] == WINNER_GROUP), None)
    handles = [] if not group else sorted(int(h) for h, f in group['fields'].items()
                                          if f['name'] == 'InWinnerTeams')
    child_handle = handles[1] if len(handles) == 2 else None
    for event in timeline:
        if event.get('group') == 'BombRound' and event['time_ms'] in times:
            event['round_number'] = bisect_right(times, event['time_ms'])
    active = []
    previous = {}
    for row in sorted(machine_rows, key=lambda r: r['time_ms']):
        if row.get('actor') not in game_states or row.get('group') != MACHINE_GROUP:
            continue
        key = row['actor'], row['object']
        old = previous.get(key)
        previous[key] = row
        index = bisect_right(times, row['time_ms']) - 1
        if index < 0 or signature(row) != 10 or not old or signature(old) != 9:
            continue
        round_ = rounds[index]
        if not 0 <= old['time_ms'] - round_['time_ms'] <= 1000:
            continue
        active.append((index, row))
    by_round = Counter(index for index, _ in active)
    for index, row in active:
        if by_round[index] != 1:
            counts['ambiguous_active_phases'] += 1
            continue
        round_ = rounds[index]
        round_['active_ms'] = row['time_ms']
        round_['active_confidence'] = 'inferred'
        timeline.append(dict(time_ms=row['time_ms'], kind='round_phase', uid=None,
            actor=row['actor'], object=row['object'],
            round_phase=dict(phase='active', round_number=index + 1, confidence='inferred'),
            evidence={k: row[k] for k in ('group', 'name', 'bits', 'raw', 'source_bit', 'source_spans') if k in row},
            note='Observed global 139-bit state transition. Active-round meaning is inferred; barrier release is not independently decoded.'))
        counts['active_phase_candidates'] += 1
    for event in timeline:
        if event.get('name') != 'MulticastWinnerTeam' or event.get('actor') not in game_states:
            continue
        event['uid'] = None
        parameters = {p['name']: p for p in event.get('parameters', [])}
        if not parameters and event.get('bits') == 9 and int(event.get('raw', '1'), 16) == 0:
            counts['winner_resets'] += 1
            continue
        teams = winner_array(parameters.get('InWinnerTeams', {}), child_handle)
        if teams is None:
            counts['unrecognized_winner_payloads'] += 1
            continue
        if not teams:
            counts['winner_resets'] += 1
            continue
        index = bisect_right(times, event['time_ms']) - 1
        if index < 0:
            continue
        round_ = rounds[index]
        if round_['ended_ms'] is not None:
            counts['duplicate_winner_notifications'] += 1
            continue
        round_['ended_ms'] = event['time_ms']
        round_['winner_teams'] = teams
        reason = parameters.get('InReason', {}).get('value')
        round_['end_reason_code'] = reason
        event['round_phase'] = dict(phase='ended', round_number=index + 1,
            confidence='confirmed', winner_teams=teams, reason_code=reason)
        counts['confirmed_round_ends'] += 1
    for round_ in rounds:
        assert round_['time_ms'] <= duration
        if round_['active_ms'] is not None and round_['ended_ms'] is not None:
            assert round_['active_ms'] <= round_['ended_ms']
    add_round_scores(rounds, timeline)
    counts['scored_round_ends'] = sum(r['score_after'] is not None for r in rounds)
    timeline.sort(key=lambda event: event['time_ms'])
    return rounds, dict(counts)
