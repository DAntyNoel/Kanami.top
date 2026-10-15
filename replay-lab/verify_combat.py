import copy
import unittest

from combat import ATTRIBUTE_GROUP, enrich_combat, resolve_vital_fields


def export_group():
    # Independent values recorded in the supplied replay's NetField exports.
    return dict(path=ATTRIBUTE_GROUP, fields={
        '2': dict(name='BaseValue', checksum=674980314),
        '3': dict(name='CurrentValue', checksum=1941375516),
        '4': dict(name='BaseValue', checksum=761730184),
        '5': dict(name='CurrentValue', checksum=3309114295),
        '6': dict(name='BaseValue', checksum=2482061864),
        '7': dict(name='CurrentValue', checksum=1641239401),
        '8': dict(name='BaseValue', checksum=1057181181),
        '9': dict(name='CurrentValue', checksum=538822671)})


class CombatTests(unittest.TestCase):
    def test_names_match_recorded_checksums_including_both_struct_members(self):
        fields = resolve_vital_fields([export_group()])
        self.assertEqual([(f['handle'], f['attribute'], f['member']) for f in fields], [
            (2, 'Health', 'BaseValue'), (3, 'Health', 'CurrentValue'),
            (4, 'HealthMax', 'BaseValue'), (5, 'HealthMax', 'CurrentValue'),
            (6, 'Armor', 'BaseValue'), (7, 'Armor', 'CurrentValue'),
            (8, 'ArmorMax', 'BaseValue'), (9, 'ArmorMax', 'CurrentValue')])

    def test_changed_checksum_or_group_is_not_silently_named(self):
        group = export_group()
        group['fields']['3']['checksum'] ^= 1
        self.assertNotIn(3, [f['handle'] for f in resolve_vital_fields([group])])
        group['path'] = '/Script/Other.CharacterAttributeSet'
        self.assertEqual(resolve_vital_fields([group]), [])

    def test_handles_are_discovered_not_hardcoded(self):
        group = export_group()
        group['fields']['71'] = group['fields'].pop('3')
        field = next(f for f in resolve_vital_fields([group]) if f['handle'] == 71)
        self.assertEqual(field['attribute'], 'Health')

    def test_player_object_binding_and_damage_ambiguity(self):
        def state(time, handle, value, actor=28):
            return dict(time_ms=time, actor=actor, object=30, group=ATTRIBUTE_GROUP,
                handle=handle, value=value, source_bit=time * 8)
        player = dict(uid='1', state_actor=28, appearances=[dict(actor=100, from_ms=0, to_ms=1000)],
            states=[state(0, 3, 130), state(0, 5, 130), state(0, 7, 80), state(0, 9, 80),
                state(100, 3, 0, actor=200), state(120, 7, 38), state(130, 3, 100), state(140, 3, 110)])
        damage = dict(time_ms=100, actor=100, uid='1', name='MulticastDamageEventData',
            parameters=[dict(name='InstigatedActor', uid='2', value=110),
                dict(name='DamageTypeCDO', object_path='Default__BP_VECTOR_DamageType_C')])
        summon_damage = {**copy.deepcopy(damage), 'actor': 200}
        timeline = [damage, summon_damage]
        _, report = enrich_combat([player], timeline, [export_group()])
        self.assertEqual(len(player['vitals']), 7)
        self.assertNotIn(200, [v['actor'] for v in player['vitals']])
        self.assertIsNone(damage['combat']['amount'])
        self.assertEqual(damage['combat']['target_uid'], '1')
        self.assertEqual(len(damage['combat']['nearby_vital_syncs']), 3)
        changes = damage['combat']['nearby_vital_syncs']
        self.assertEqual([e['changes'][0]['delta'] for e in changes], [-42, -30, 10])
        self.assertEqual(summon_damage['combat']['target_kind'], 'owned_object')
        self.assertIsNone(summon_damage['combat']['target_uid'])
        self.assertEqual(summon_damage['combat']['nearby_vital_syncs'], [])
        self.assertEqual(report['per_hit_amounts_decoded'], 0)


if __name__ == '__main__':
    unittest.main()
