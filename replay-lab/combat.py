"""Resolve vital attributes from UE replication checksums and describe damage calls.

Compatible checksums include the parent attribute name, FGameplayAttributeData,
the child member name, float, and each static array index. No field numbers are
assumed. Opaque EventData is never interpreted as a per-hit damage amount.
"""
from bisect import bisect_left, bisect_right
from collections import Counter, defaultdict
import zlib


ATTRIBUTE_GROUP = '/Script/PMGame.CyCharacterAttributeSet'
VITALS = ('Health', 'HealthMax', 'Armor', 'ArmorMax')


def compatible_checksum(name, cpp_type, parent=0):
    # UE FCrc::StrCrc32 zero-extends each character to four bytes.
    value = zlib.crc32(name.lower().encode('utf-32-le'), parent)
    value = zlib.crc32(cpp_type.lower().encode('utf-32-le'), value)
    return zlib.crc32(b'\0' * 4, value)


def resolve_vital_fields(groups):
    candidates = {}
    for attribute in VITALS:
        parent = compatible_checksum(attribute, 'FGameplayAttributeData')
        for member in ('BaseValue', 'CurrentValue'):
            candidates[compatible_checksum(member, 'float', parent)] = (attribute, member)
    result = []
    for group in groups:
        if group['path'] != ATTRIBUTE_GROUP:
            continue
        for handle, field in group['fields'].items():
            match = candidates.get(field['checksum'])
            if match and field['name'] == match[1]:
                result.append(dict(group=ATTRIBUTE_GROUP, handle=int(handle), attribute=match[0],
                    member=match[1], checksum=field['checksum'], method='ue_compatible_checksum'))
    return sorted(result, key=lambda field: field['handle'])


def enrich_combat(players, timeline, groups):
    semantics = resolve_vital_fields(groups)
    fields = {field['handle']: field['attribute'] for field in semantics if field['member'] == 'CurrentValue'}
    by_uid = {p['uid']: p for p in players}
    changes_by_uid = defaultdict(list)
    counts = Counter()
    for player in players:
        player['vitals'] = []
        previous = {}
        grouped = {}
        for state in player['states']:
            # The player-state attribute set is authoritative for this player.
            # Owned projectiles, summons and other attribute instances are excluded.
            if state.get('group') != ATTRIBUTE_GROUP or state['actor'] != player['state_actor']:
                continue
            attribute = fields.get(state.get('handle'))
            if not attribute:
                continue
            state['attribute'] = attribute
            sample = dict(time_ms=state['time_ms'], attribute=attribute, value=state['value'],
                actor=state['actor'], object=state['object'], handle=state['handle'],
                source_bit=state.get('source_bit'))
            player['vitals'].append(sample)
            counts['vital_updates'] += 1
            old = previous.get(attribute)
            previous[attribute] = state['value']
            if attribute not in ('Health', 'Armor') or old is None or old == state['value']:
                continue
            event = grouped.setdefault(state['time_ms'], dict(time_ms=state['time_ms'], kind='vital_change',
                uid=player['uid'], actor=player['state_actor'], changes=[],
                note='Replicated attribute change; may combine hits, healing or other effects. Not a per-hit damage amount.'))
            event['changes'].append(dict(attribute=attribute, before=old, after=state['value'],
                delta=state['value']-old, object=state['object'], handle=state['handle'],
                source_bit=state.get('source_bit')))
        changes_by_uid[player['uid']] = sorted(grouped.values(), key=lambda e: e['time_ms'])
        counts['vital_sync_events'] += len(grouped)
    change_times = {uid: [e['time_ms'] for e in events] for uid, events in changes_by_uid.items()}
    for event in timeline:
        if event.get('name') != 'MulticastDamageEventData':
            continue
        counts['damage_calls'] += 1
        parameters = {p['name']: p for p in event['parameters']}
        source = parameters.get('InstigatedActor', {})
        causer = parameters.get('DamageCauser', {})
        damage_type = parameters.get('DamageTypeCDO', {})
        owner_uid = event.get('uid')
        owner = by_uid.get(owner_uid)
        is_player = owner and any(a['actor'] == event['actor'] and a['from_ms'] <= event['time_ms'] <= a['to_ms']
            for a in owner['appearances'])
        target_uid = owner_uid if is_player else None
        combat = dict(attacker_uid=source.get('uid'), attacker_actor=source.get('value'),
            target_uid=target_uid, target_owner_uid=owner_uid, target_actor=event['actor'],
            target_kind='player_character' if is_player else 'owned_object' if owner else 'unknown_object',
            damage_type=damage_type.get('object_path'), damage_causer=causer.get('object_path'),
            amount=None, amount_status='opaque_event_data_unresolved', nearby_vital_syncs=[])
        if source.get('uid'):
            counts['damage_calls_with_attacker'] += 1
        if is_player:
            counts['damage_calls_on_player_characters'] += 1
            times = change_times[target_uid]
            lo, hi = bisect_left(times, event['time_ms']), bisect_right(times, event['time_ms'] + 200)
            combat['nearby_vital_syncs'] = changes_by_uid[target_uid][lo:hi]
        event['combat'] = combat
    for events in changes_by_uid.values():
        timeline.extend(events)
    timeline.sort(key=lambda event: event['time_ms'])
    report = dict(resolved_fields=semantics, counts=dict(counts), per_hit_amounts_decoded=0,
        note='Nearby attribute syncs are shown for comparison and are not attributed to a single hit.')
    return semantics, report
