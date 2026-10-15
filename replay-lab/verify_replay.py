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
    for i,row in enumerate(read_rows(directory/'properties.jsonl')):
        if row['kind'] in ('property','rpc_parameter'):
            field_count+=1
            unknown_handles+=row['name'].startswith('handle_')
        spans=row.get('source_spans',[])
        if spans and (i%997==0 or len(spans)>1):
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
                check('http_'+route,response.status==200 and int(response.headers['Content-Length'])>0)
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
