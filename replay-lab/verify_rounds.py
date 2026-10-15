"""Boundary checks for inferred round starts and confirmed winner notifications."""
import copy
import unittest

from rounds import MACHINE_GROUP, WINNER_GROUP, enrich_rounds, winner_array


GROUPS = [dict(path=WINNER_GROUP, fields={
    '0': dict(name='InWinnerTeams'), '1': dict(name='InWinnerTeams')})]


def machine(time, state, actor=2, bits=139):
    return dict(time_ms=time, kind='property', actor=actor, object=6,
                name='SyncStateData', group=MACHINE_GROUP, bits=bits,
                raw=(state.to_bytes(12, 'little') + b'\0' * 6).hex(),
                source_bit=time * 8, source_spans=[dict(bit=time * 8, count=bits)])


def winner(time, team=1):
    return dict(time_ms=time, kind='rpc', actor=2, object=2, uid='wrong-owner',
                name='MulticastWinnerTeam', parameters=[
                    dict(name='InWinnerTeams', raw=f'02020410{team:02x}0000', bits=56),
                    dict(name='InReason', value=3)])


class RoundTests(unittest.TestCase):
    def test_array_and_empty_reset(self):
        for team in (0, 1):
            self.assertEqual(winner_array(winner(0, team)['parameters'][0], 1), [team])
        self.assertEqual(winner_array(dict(raw='0000', bits=16), 1), [])
        self.assertEqual(winner_array(dict(raw='02025010010000', bits=56), 39), [1])

    def test_reject_unknown_or_partial_array(self):
        row = winner(0)['parameters'][0]
        self.assertIsNone(winner_array(row, 2))
        self.assertIsNone(winner_array({**row, 'bits': 48}, 1))
        self.assertIsNone(winner_array({**row, 'raw': row['raw'][:-2]}, 1))
        self.assertIsNone(winner_array({**row, 'raw': '02020410020000'}, 1))
        self.assertIsNone(winner_array(dict(raw='0200', bits=16), 1))

    def test_actual_transition_time_and_confirmed_end(self):
        timeline = [winner(9000)]
        source = [machine(1008, 9), machine(7777, 10)]
        rounds, counts = enrich_rounds([dict(time_ms=1000)], timeline, source, {2}, GROUPS, 20000)
        self.assertEqual(rounds[0]['active_ms'], 7777)  # no fixed 35-second delay
        self.assertEqual(rounds[0]['active_confidence'], 'inferred')
        self.assertEqual(rounds[0]['ended_ms'], 9000)
        self.assertEqual(rounds[0]['winner_teams'], [1])
        self.assertEqual(counts['confirmed_round_ends'], 1)
        self.assertEqual(timeline[1]['uid'], None)
        self.assertEqual(timeline[0]['evidence']['source_spans'], source[1]['source_spans'])

    def test_missing_state_is_not_fabricated(self):
        timeline = [winner(9000)]
        rounds, _ = enrich_rounds([dict(time_ms=1000)], timeline, [], {2}, GROUPS, 20000)
        self.assertIsNone(rounds[0]['active_ms'])
        self.assertEqual(rounds[0]['ended_ms'], 9000)
        self.assertFalse(any(e['kind'] == 'round_phase' for e in timeline))

    def test_reset_and_duplicate_are_not_new_round_ends(self):
        timeline = [winner(9000), winner(9100), dict(time_ms=10000, kind='rpc', actor=2,
            name='MulticastWinnerTeam', parameters=[], raw='0000', bits=9)]
        rounds, counts = enrich_rounds([dict(time_ms=1000), dict(time_ms=10001)], timeline, [], {2}, GROUPS, 20000)
        self.assertEqual(sum('round_phase' in e for e in timeline), 1)
        self.assertIsNone(rounds[1]['ended_ms'])
        self.assertEqual(counts['winner_resets'], 1)
        self.assertEqual(counts['duplicate_winner_notifications'], 1)

    def test_actor_layout_sequence_and_round_boundaries(self):
        for states in ([machine(1008, 9, actor=28), machine(7777, 10, actor=28)],
                       [machine(1008, 9), machine(7777, 10, bits=140)],
                       [machine(1008, 9), machine(2000, 7), machine(7777, 10)],
                       [machine(8, 9), machine(7777, 10)]):
            rounds, _ = enrich_rounds([dict(time_ms=1000)], [], copy.deepcopy(states), {2}, GROUPS, 20000)
            self.assertIsNone(rounds[0]['active_ms'])


if __name__ == '__main__':
    unittest.main()
