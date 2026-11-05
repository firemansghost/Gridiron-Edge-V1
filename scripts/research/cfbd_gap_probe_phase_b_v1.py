"""Two-query, artifact-only predictor probe. No database, outcomes or model work."""
import argparse
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request

VERSION = 'cfbd_gap_probe_phase_b_v1'
CONFIRMATION = 'FETCH_CFBD_RESEARCH_GAPS_PHASE_B_V1'
BASE = 'https://api.collegefootballdata.com'
REQUESTS = (
    {'id':'talent-2025-predictor-only','path':'/talent','query':{'year':2025},'targets':['Air Force','Navy'],'field':'talent'},
    {'id':'elo-2025-preseason-predictor-only','path':'/ratings/elo','query':{'year':2025,'seasonType':'regular','preseason':True},'targets':['UNLV'],'field':'elo'},
)

def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf-8')

def digest(body):
    return hashlib.sha256(body).hexdigest()

def plan():
    return {'version':VERSION,'baseUrl':BASE,'requests':list(REQUESTS),'maximumProviderCalls':2,'automaticRetries':0,'redirectsAllowed':False,'phaseB2025Allowed':True,'outcomeAccess':False,'databaseAccess':False,'originalEvidenceOverwrite':False}

def plan_sha():
    return digest(canonical(plan()))

def finite(value):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        return None

def transport(url,key):
    req=urllib.request.Request(url,headers={'Authorization':'Bearer '+key,'Accept':'application/json','User-Agent':VERSION},method='GET')
    opener=urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(req,timeout=60) as response:
            return response.status,response.read(),response.headers.get('Content-Type','')
    except urllib.error.HTTPError as error:
        return error.code,error.read(),error.headers.get('Content-Type','')

def write_json(path,value):
    with path.open('x',encoding='utf-8',newline='\n') as stream:
        stream.write(json.dumps(value,indent=2,ensure_ascii=False,allow_nan=False)+'\n')

def inspect_response(spec,data):
    if not isinstance(data,list) or any(not isinstance(row,dict) for row in data):
        raise ValueError('RESPONSE_NOT_OBJECT_ARRAY')
    for row in data:
        if row.get('year') != 2025 or isinstance(row.get('year'),bool):
            raise ValueError('RESPONSE_QUERY_IDENTITY_MISMATCH')
        if spec['path']=='/ratings/elo':
            if ('week' in row and row['week'] not in [None,0]) or ('seasonType' in row and row['seasonType']!='regular') or ('preseason' in row and row['preseason'] is not True):
                raise ValueError('RESPONSE_QUERY_IDENTITY_MISMATCH')
    results=[]
    for target in spec['targets']:
        found=[row for row in data if row.get('team')==target]
        valid=len(found)==1 and finite(found[0].get(spec['field']))
        results.append({'target':target,'matchingRows':len(found),'status':'AVAILABLE' if valid else 'NOT_FOUND' if not found else 'INVALID_OR_INCOMPLETE','rows':found})
    return {'responseRows':len(data),'targets':results}

def request_url(spec):
    query={k: str(v).lower() if isinstance(v,bool) else v for k,v in spec['query'].items()}
    return BASE+spec['path']+'?'+urllib.parse.urlencode(sorted(query.items()))

def execute(mode,out,source_sha,expected_plan='',confirmation='',key='',fetch=transport):
    if mode not in ['PLAN','FETCH']:
        raise ValueError('MODE_INVALID')
    if not re.fullmatch('[0-9a-f]{40}',source_sha):
        raise ValueError('SOURCE_SHA_INVALID')
    if mode=='FETCH':
        if expected_plan!=plan_sha(): raise ValueError('PLAN_SHA_MISMATCH')
        if confirmation!=CONFIRMATION: raise ValueError('CONFIRMATION_MISMATCH')
        if not key or key.strip()!=key: raise ValueError('PROVIDER_KEY_MISSING_OR_INVALID')
    out=Path(out)
    out.mkdir(parents=True,exist_ok=False)
    write_json(out/'request-plan.json',plan())
    report={'version':VERSION,'mode':mode,'sourceSha':source_sha,'planSha256':plan_sha(),'startedAt':utc(),'providerCallsAttempted':0,'providerResponsesReceived':0,'requests':[],'outcome':'PLAN_ONLY' if mode=='PLAN' else 'IN_PROGRESS','databaseReads':False,'databaseWrites':False,'outcomeAccess':False,'phaseB2025Access':mode=='FETCH','originalEvidenceOverwrite':False}
    if mode=='PLAN':
        report['finishedAt']=utc();write_json(out/'report.json',report)
        return report
    raw_dir=out/'raw';raw_dir.mkdir()
    def journal(event):
        with (out/'progress.jsonl').open('a',encoding='utf-8',newline='\n') as stream:
            stream.write(json.dumps(event,allow_nan=False)+'\n');stream.flush();os.fsync(stream.fileno())
    for spec in REQUESTS:
        url=request_url(spec)
        record={'id':spec['id'],'url':url,'requestStartedAt':utc(),'httpStatus':None,'rawFile':None,'error':None}
        report['providerCallsAttempted']+=1
        journal({'event':'REQUEST_STARTED','id':spec['id'],'at':record['requestStartedAt']})
        try:
            status,body,content_type=fetch(url,key)
            record.update({'responseReceivedAt':utc(),'httpStatus':status,'contentType':content_type})
            report['providerResponsesReceived']+=1
            if not isinstance(body,bytes): raise ValueError('RESPONSE_BYTES_REQUIRED')
            if key.encode('utf-8') in body: raise ValueError('SECRET_REFLECTION_REJECTED')
            relative='raw/'+spec['id']+'.body'
            with (out/relative).open('xb') as stream: stream.write(body)
            record.update({'rawFile':relative,'rawBytes':len(body),'rawSha256':digest(body)})
            if status!=200: raise ValueError('HTTP_NON_200')
            data=json.loads(body.decode('utf-8'),parse_constant=lambda _: (_ for _ in ()).throw(ValueError('NONFINITE_JSON')))
            record.update(inspect_response(spec,data))
        except Exception as error:
            allowed={'RESPONSE_NOT_OBJECT_ARRAY','RESPONSE_QUERY_IDENTITY_MISMATCH','RESPONSE_BYTES_REQUIRED','SECRET_REFLECTION_REJECTED','HTTP_NON_200','NONFINITE_JSON'}
            record['error']=str(error) if isinstance(error,ValueError) and str(error) in allowed else 'TRANSPORT_OR_RESPONSE_PARSE_FAILURE'
            report['outcome']='FETCH_FAILED'
        report['requests'].append(record)
        journal({'event':'REQUEST_FINISHED','record':record})
        if record['error']: break
    if report['outcome']!='FETCH_FAILED':
        states=[t['status'] for r in report['requests'] for t in r['targets']]
        report['outcome']='COMPLETE_ALL_TARGETS_AVAILABLE' if all(s=='AVAILABLE' for s in states) else 'COMPLETE_WITH_GAPS'
    report['finishedAt']=utc()
    report['notAttemptedRequestIds']=[s['id'] for s in REQUESTS[len(report['requests']):]]
    assert report['providerCallsAttempted']<=2
    write_json(out/'report.json',report)
    return report

def source_guard(expected):
    if os.environ.get('GITHUB_REPOSITORY')!='firemansghost/Gridiron-Edge-V1' or os.environ.get('GITHUB_REF')!='refs/heads/main' or os.environ.get('GITHUB_EVENT_NAME')!='workflow_dispatch':
        raise ValueError('REPOSITORY_REF_EVENT_GUARD_FAILED')
    actual=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
    if not re.fullmatch('[0-9a-f]{40}',expected) or actual!=expected:
        raise ValueError('SOURCE_SHA_GUARD_FAILED')
    return actual

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--mode',choices=['PLAN','FETCH'],required=True)
    parser.add_argument('--out',required=True)
    parser.add_argument('--expected-source-sha',required=True)
    parser.add_argument('--expected-plan-sha',default='')
    parser.add_argument('--confirm',default='')
    args=parser.parse_args()
    try:
        actual=source_guard(args.expected_source_sha)
        result=execute(args.mode,args.out,actual,args.expected_plan_sha,args.confirm,os.environ.get('CFBD_API_KEY','') if args.mode=='FETCH' else '')
    except Exception:
        print('Probe refused or failed before a complete report; inspect only saved nonsecret artifacts.')
        return 1
    print(json.dumps({k:result[k] for k in ['mode','sourceSha','planSha256','outcome','providerCallsAttempted','providerResponsesReceived']}))
    return 1 if result['outcome']=='FETCH_FAILED' else 0

if __name__=='__main__':
    raise SystemExit(main())
