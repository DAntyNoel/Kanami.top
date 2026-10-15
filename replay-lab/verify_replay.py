"""Integration audit against the original replay, not a synthetic demo."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen

from decode_replay import read_rows
from parse_replay import Reader, ParseError, dump
from combat import ATTRIBUTE_GROUP, resolve_vital_fields
from rounds import GAME_STATE_CLASS, MACHINE_GROUP, winner_array, signature


def verify(source, directory, url=None):
    raw=Path(source).read_bytes()
    directory=Path(directory)
    manifest=json.loads((directory/'manifest.json').read_text(encoding='utf-8'))
    decoded=json.loads((directory/'decode-report.json').read_text(encoding='utf-8'))
    playback=json.loads((directory/'playback.json').read_text(encoding='utf-8'))
    checks={}
    def check(name,condition):
        if not condition:
            raise AssertionError(name)
        checks[name]=True
    groups=json.loads((directory/'netfields.json').read_text(encoding='utf-8'))
    semantics=resolve_vital_fields(groups)
    check('vital_field_checksums_match_exports',playback['attribute_semantics']==semantics)
    vital_fields={f['handle']:f['attribute'] for f in semantics if f['member']=='CurrentValue'}
    check('four_vital_attributes_identified',set(vital_fields.values())=={'Health','HealthMax','Armor','ArmorMax'})
    check('source_hash_matches',hashlib.sha256(raw).hexdigest()==manifest['sha256']==playback['source']['sha256'])
    check('zero_protocol_errors',not any(v for k,v in manifest['counts'].items() if k.endswith('_errors')))
    check('zero_decode_errors',not decoded['failures'] and not any(v for k,v in decoded['counts'].items() if k.endswith('_errors')))
    check('no_pending_partial_bunches',manifest['pending_partial_bunches']==0)
    check('container_to_eof',manifest['chunks'][-1]['offset']+8+manifest['chunks'][-1]['size']==len(raw))
    frames=packets=0
    previous=-1
    for frame in read_rows(directory/'packets.jsonl'):
        check('monotonic_frame_times',frame['time_ms']>=previous)
        previous=frame['time_ms'];frames+=1;packets+=frame['packets']
    check('frames_count',frames==manifest['counts']['frames'])
    check('packets_count',packets==manifest['counts']['packets'])
    check('last_frame_equals_duration',previous==manifest['info']['duration_ms'])
    source_checks=multi_checks=field_count=unknown_handles=0
    actors=json.loads((directory/'actors.json').read_text(encoding='utf-8'))
    game_states={a['guid'] for a in actors if a.get('path')==GAME_STATE_CLASS}
    round_source=[]
    for i,row in enumerate(read_rows(directory/'properties.jsonl')):
        if row['kind'] in ('property','rpc_parameter'):
            field_count+=1
            unknown_handles+=row['name'].startswith('handle_')
        spans=row.get('source_spans',[])
        is_round_source=row['actor'] in game_states and row.get('name') in (
            'SyncStateData','MulticastWinnerTeam','InWinnerTeams','WinnerTeams','RoundResult','NowRound')
        if is_round_source:
            round_source.append(row)
        if spans and (i%997==0 or len(spans)>1 or is_round_source):
            value=0;shift=0
            for span in spans:
                bit,count=span['bit'],span['count']
                check('source_spans_inside_file',0<=bit<=bit+count<=len(raw)*8)
                begin,offset=divmod(bit,8)
                n=int.from_bytes(raw[begin:(bit+count+7)//8],'little')>>offset
                value|=(n&((1<<count)-1))<<shift
                shift+=count
            check('raw_property_bits_equal_source',shift==row['bits'] and value==int.from_bytes(bytes.fromhex(row['raw']),'little'))
            source_checks+=1;multi_checks+=len(spans)>1
    check('property_count_matches',field_count==manifest['counts']['properties'])
    check('all_property_handles_named',unknown_handles==0)
    active_events=[e for e in playback['timeline'] if e.get('round_phase',{}).get('phase')=='active']
    end_events=[e for e in playback['timeline'] if e.get('round_phase',{}).get('phase')=='ended']
    check('round_active_and_end_counts',len(active_events)==len(end_events)==len(playback['rounds']))
    original_active={(r['time_ms'],r['actor']):r for r in round_source
        if r.get('group')==MACHINE_GROUP and signature(r)==10}
    original_winners={r['time_ms']:r for r in round_source if r.get('name')=='InWinnerTeams'}
    winner_group=next(g for g in groups if g['path'].endswith('BP_PMGameState_BombMatch.BP_PMGameState_BombMatch_C'))
    winner_child=max(int(h) for h,f in winner_group['fields'].items() if f['name']=='WinnerTeams')
    replicated_winners={r['time_ms']:winner_array(r,winner_child) for r in round_source if r.get('name')=='WinnerTeams'}
    for index,(round_,active,end) in enumerate(zip(playback['rounds'],active_events,end_events)):
        next_time=playback['rounds'][index+1]['time_ms'] if index+1<len(playback['rounds']) else playback['duration_ms']
        check('round_phase_order_and_boundaries',round_['time_ms']<round_['active_ms']==active['time_ms']<round_['ended_ms']==end['time_ms']<=next_time)
        check('active_phase_uses_original_sync_record',active['evidence']['raw']==original_active[active['time_ms'],active['actor']]['raw'] and active['round_phase']['confidence']=='inferred')
        check('round_end_has_original_winner_parameters',any(p.get('raw')==original_winners[end['time_ms']]['raw'] for p in end['parameters'] if p['name']=='InWinnerTeams'))
        check('winner_matches_independent_replicated_property',round_['winner_teams']==end['round_phase']['winner_teams']==replicated_winners[end['time_ms']])
        check('round_phase_events_are_global',active['uid'] is None and end['uid'] is None and end['round_phase']['confidence']=='confirmed')
    check('winner_resets_are_not_round_ends',all('round_phase' not in e for e in playback['timeline']
        if e.get('name')=='MulticastWinnerTeam' and not e.get('parameters')))
    event_deaths=Counter(e['fields'][1] for e in playback['timeline'] if e.get('group')=='PlayerDeath')
    event_players={e['fields'][1]:e['fields'][0] for e in playback['timeline'] if e.get('group')=='PlayerRespawn'}
    check('players_match_respawn_events',{p['uid']:p['name'] for p in playback['players']}==event_players)
    death_matches=[]
    for p in playback['players']:
        check('all_players_have_movement',len(p['samples'])>0)
        check('movement_is_sorted',all(a[0]<=b[0] for a,b in zip(p['samples'],p['samples'][1:])))
        check('movement_in_replay_time',all(0<=s[0]<=playback['duration_ms'] for s in p['samples']))
        check('movement_has_player_binding',all(any(a['actor']==s[6] and a['from_ms']<=s[0]<=a['to_ms'] for a in p['appearances']) for s in p['samples']))
        check('death_totals_match_event_metadata',p['stats'].get('NumDeaths',0)==event_deaths[p['uid']])
        death_updates=[s for s in p['states'] if s['name']=='NumDeaths']
        for event in playback['timeline']:
            if event.get('group')=='PlayerDeath' and event['fields'][1]==p['uid']:
                nearby=[s['time_ms']-event['time_ms'] for s in death_updates if 0<=s['time_ms']-event['time_ms']<=250]
                if nearby:
                    death_matches.append(min(nearby))
    check('all_death_events_time_correlated',len(death_matches)==sum(event_deaths.values()))
    activations=[e for e in playback['timeline'] if e.get('name')=='MulticastNotifyAbilityActivated']
    check('all_activations_resolve_to_ability_paths',all(e.get('ability',{}).get('path') for e in activations))
    # Independent replicated pitch is much coarser than controller rotation.
    # Zero-valued reset frames are reported separately, not treated as aim evidence.
    orientation = {}
    controller_count = 0
    original_vitals={}
    player_states={p['state_actor'] for p in playback['players']}
    for row in read_rows(directory/'decoded-properties.jsonl'):
        if row['name']=='CurrentValue' and row.get('group')==ATTRIBUTE_GROUP and row['actor'] in player_states and row.get('handle') in vital_fields:
            original_vitals[(row['actor'],row['time_ms'],row['object'],row['handle'])]=row['value']
        if row['name'] not in ('CompressedControllerRotation','RemoteViewPitch'):
            continue
        value=row['value']
        orientation.setdefault((row['time_ms'],row['actor']),{})[row['name']]=value
        if row['name']=='CompressedControllerRotation':
            packed=(round(value['yaw']*10)&65535)|((round(value['pitch']*10)&65535)<<16)
            check('controller_rotation_roundtrips_raw_uint32',packed==value['packed']==int.from_bytes(bytes.fromhex(row['raw']),'little'))
            controller_count+=1
    pitch_errors=[]
    zero_pairs=0
    for fields in orientation.values():
        if 'CompressedControllerRotation' not in fields or 'RemoteViewPitch' not in fields:
            continue
        if fields['RemoteViewPitch']==0:
            zero_pairs+=1
            continue
        pitch_errors.append(abs((fields['CompressedControllerRotation']['pitch']-fields['RemoteViewPitch']+180)%360-180))
    check('controller_pitch_matches_independent_nonzero_remote_pitch',len(pitch_errors)>1000 and max(pitch_errors)<1.6)
    for p in playback['players']:
        check('all_players_have_controller_aim',bool(p['aim_samples']))
        check('aim_samples_sorted',all(a[0]<=b[0] for a,b in zip(p['aim_samples'],p['aim_samples'][1:])))
        check('aim_samples_bound_to_player',all(any(a['actor']==s[3] and a['from_ms']<=s[0]<=a['to_ms'] for a in p['appearances']) for s in p['aim_samples']))
        check('all_players_have_vitals',bool(p['vitals']) and set(s['attribute'] for s in p['vitals'])==set(vital_fields.values()))
        check('vital_samples_sorted',all(a['time_ms']<=b['time_ms'] for a,b in zip(p['vitals'],p['vitals'][1:])))
        for sample in p['vitals']:
            check('vitals_match_authoritative_player_state',sample['actor']==p['state_actor'] and
                vital_fields[sample['handle']]==sample['attribute'] and
                original_vitals[(sample['actor'],sample['time_ms'],sample['object'],sample['handle'])]==sample['value'])
        for death in (e for e in playback['timeline'] if e.get('group')=='PlayerDeath' and e['fields'][1]==p['uid']):
            latest={s['attribute']:s['value'] for s in p['vitals'] if s['time_ms']<=death['time_ms']+150}
            check('death_events_correlate_with_zero_health_and_armor',latest['Health']==latest['Armor']==0)
    damage_calls=[e for e in playback['timeline'] if e.get('name')=='MulticastDamageEventData']
    for event in damage_calls:
        combat=event['combat']
        check('per_hit_amount_not_invented',combat['amount'] is None)
        if combat['target_uid']:
            target=next(p for p in playback['players'] if p['uid']==combat['target_uid'])
            check('damage_target_is_actual_player_character',any(a['actor']==event['actor'] and a['from_ms']<=event['time_ms']<=a['to_ms'] for a in target['appearances']))
            check('nearby_vital_sync_window',all(s['uid']==target['uid'] and 0<=s['time_ms']-event['time_ms']<=200 for s in combat['nearby_vital_syncs']))
        else:
            check('owned_object_damage_has_no_player_vital_attribution',not combat['nearby_vital_syncs'])
    # Guard rails for binary truncation and invalid FString lengths.
    for value,operation in [(b'\x01',lambda r:r.uint(9)),(b'\xff'*5,lambda r:r.packed()),(b'\xff\xff\xff\x7f',lambda r:r.string())]:
        try:
            operation(Reader(value))
        except ParseError:
            pass
        else:
            raise AssertionError('truncation guard accepted invalid input')
    checks['binary_bounds_guards']=True
    if url:
        for route in ('/','/app.js','/style.css','/shared/header.js','/shared/header.css','/shared/logo.png','/shared/kanami.jpg','/playback.json'):
            with urlopen(url.rstrip('/')+route,timeout=30) as response:
                payload=response.read()
                check('http_'+route,response.status==200 and len(payload)==int(response.headers['Content-Length'])>0)
                if route=='/playback.json':
                    check('http_playback_complete_hash',hashlib.sha256(payload).digest()==hashlib.sha256((directory/'playback.json').read_bytes()).digest())
        with urlopen(url.rstrip('/')+'/health') as response:
            check('minimal_health',json.load(response)=={'status':'ok'})
        for route in ('/files/','/../AGENTS.md','/%2e%2e/AGENTS.md','/manifest.json','/properties.jsonl','/__reload','/__reload/state','/__reload/trigger','/.git/config'):
            try:
                urlopen(url.rstrip('/')+route,timeout=5)
            except HTTPError as exc:
                check('not_exposed_'+route,exc.code==404)
            else:
                raise AssertionError('unexpected public file route: '+route)
    report=dict(checks=checks,source_bit_checks=source_checks,multi_packet_span_checks=multi_checks,
        death_event_correlations=len(death_matches),max_death_event_delay_ms=max(death_matches,default=0),
        ability_activations=len(activations),movement_samples=sum(len(p['samples']) for p in playback['players']),
        controller_rotation_records=controller_count,controller_aim_samples=sum(len(p['aim_samples']) for p in playback['players']),
        vital_updates=sum(len(p['vitals']) for p in playback['players']),damage_calls=len(damage_calls),
        active_phase_candidates=len(active_events),confirmed_round_ends=len(end_events),round_source_bit_checks=len(round_source),
        independent_pitch_pairs=len(pitch_errors),max_pitch_difference_degrees=max(pitch_errors),zero_pitch_pairs_excluded=zero_pairs,
        notes=['Browser visual verification is recorded separately; this audit does not claim to verify rendering.',
               'Unknown protocol content remains explicitly preserved in raw records.'])
    dump(directory/'verification.json',report)
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__':
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('source',type=Path)
    cli.add_argument('directory',type=Path)
    cli.add_argument('--url')
    args=cli.parse_args()
    verify(args.source,args.directory,args.url)
