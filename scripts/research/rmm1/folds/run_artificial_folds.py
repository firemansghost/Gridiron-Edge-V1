"""Repository-ready closed artificial fold checks. No historical read mode."""
from dataclasses import asdict
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
import sysconfig
import types
import unittest

HERE=Path(__file__).absolute().parent
REPO=HERE.parents[3]
EVIDENCE=REPO/'research/historical/rmm1/folds'
FREEZE=REPO/'research/historical/rmm1/freeze'
MANIFEST=EVIDENCE/'PUBLICATION_MANIFEST.json'
RUNNER=HERE/'run_artificial_folds.py'
SOURCE={'rmm1_builder':HERE.parent/'rmm1_builder.py','synthetic_fixtures':HERE.parent/'synthetic_fixtures.py',
        **{n:HERE/(n+'.py') for n in ('fold_kernel','artificial_inputs','test_fold_kernel')}}
REGISTRY_SHA='09159fd46bb49fb6f063cf0ecaa123cac893d730da00ac0e93ed3aeae4a6ba60'
REVIEW_SHA='12510dd2254c3b007aec0332aaf8584b2b56e45898bc063d1a00fec48c273646'
KERNEL_SHA='b5ffa929d5d2b7aecd9516119ba43984044431dbf6acefe2b9b23789fb81826a'
BASE_PINS={'rmm1_builder':'80e415d38b2e5caf519e3a74a2c6327437d0e975a40fe3ce5c1aa24d09d85a68',
           'synthetic_fixtures':'751a05b9010c474e1026d4e2a3c36514135244db71782ba6295991573708deba'}


def need(ok,code):
    if not ok:raise RuntimeError(code)


def sha(body):return hashlib.sha256(body).hexdigest()


def serialized(value):
    return (json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False,default=lambda x:sorted(x) if isinstance(x,frozenset) else asdict(x))+'\n').encode()


def preview(modules):
    k=modules['fold_kernel'];rows,_,_=modules['artificial_inputs'].make()
    frames=k.ingest(rows,'fictional-integration-v1',tuple(r['gameId'] for r in rows),{y:sum(r['season']==y for r in rows) for y in (2022,2023,2024)})
    result=k.prepare_experiment(frames)
    def view_record(name,view):
        matrices={}
        for key,m in view['matrices'].items():
            matrices[key]={'support':m['support']}
            for role in ('training','evaluation'):
                items=m[role]
                matrices[key][role]={'ids':[x.game_id for x in items],'rows':len(items),'columns':len(items[0].values),
                    'encodedSha256':sha(serialized(items)),
                    'routes':[{'gameId':x.game_id,'status':x.status,'unseenStates':x.unseen_states,'novelJointProfile':x.novel_joint_profile} for x in items]}
        return {'name':name,'preprocessor':asdict(view['preprocessor']),'matrices':matrices}
    return {'status':'ARTIFICIAL_FIT_FREE_INPUT_PREVIEW_ONLY','foldPlan':asdict(result['foldPlan']),
            'views':[view_record(name,view) for name,view in result['views']],
            'finalInputPreview':view_record('UNSELECTED_DEVELOPMENT_TO_EXPLORATORY',result['finalInputPreview']),
            'ledger':result['ledger'],'pooledOofSupport':result['pooledOofSupport'],'exploratorySupport':result['exploratorySupport'],
            'predictionCoverage':'NOT_RUN','historicalPayloadReads':0,'targetReads':0,'estimatorFits':0}


def main():
    need(sys.implementation.name=='cpython' and sys.version_info[:3]==(3,13,7),'CPYTHON_3137_REQUIRED')
    need(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode and sys.flags.optimize==0,'ISOLATED_NO_SITE_NO_BYTECODE_NO_OPTIMIZE_REQUIRED')
    need(len(sys.argv)==2 and re.fullmatch('[a-z0-9-]{1,48}',sys.argv[1]),'EXACT_FRESH_LABEL_REQUIRED')
    out=REPO/'reports/research-rmm1-folds'/sys.argv[1]
    workflow=REPO/'.github/workflows/check-rmm1-fitfree-folds.yml'
    metadata=[MANIFEST,EVIDENCE/'README.md',EVIDENCE/'IMPLEMENTATION_PLAN.md',EVIDENCE/'ACCEPTED_LOCAL_SOURCE_MANIFEST.json',
              EVIDENCE/'INDEPENDENT_IMPLEMENTATION_ACCEPTANCE.md',EVIDENCE/'INDEPENDENT_IMPLEMENTATION_ACCEPTANCE.json',workflow,RUNNER]
    frozen=[FREEZE/name for name in ('FROZEN_CONTRACT.json','SOURCE_SPECIFICATION.md','ADOPTION_RECORD.md','FREEZE_MANIFEST.json','INDEPENDENT_FREEZE_ACCEPTANCE.md')]
    paths=[*SOURCE.values(),*metadata,*frozen]
    for p in (out,*paths):
        for parent in (p,*p.parents):need(not parent.is_symlink() and not parent.is_junction(),'LINK_OR_JUNCTION_REFUSED')
    need(out.resolve().is_relative_to(REPO.resolve()) and out.resolve()==out.absolute(),'OUTPUT_SCOPE_REFUSED')
    out.mkdir(parents=True,exist_ok=False)
    allowed={p.resolve() for p in paths};stdlib=Path(sysconfig.get_path('stdlib')).resolve()
    reads=[];blocked=[]
    def guard(event,args):
        if event.startswith(('socket.','subprocess.','os.system','os.exec','os.spawn','os.posix_spawn','os.fork','pty.spawn','ctypes.')):
            blocked.append(event);raise RuntimeError('NETWORK_OR_PROCESS_REFUSED')
        if event=='import' and args[0].split('.')[0] in ('numpy','scipy','sklearn','joblib','cloudpickle','narwhals','threadpoolctl','requests','urllib','http','ctypes'):
            blocked.append(event+':'+args[0]);raise RuntimeError('SCIENTIFIC_OR_NETWORK_IMPORT_REFUSED')
        if event=='open':
            path=args[0]
            if isinstance(path,int):blocked.append('fd-open');raise RuntimeError('FD_OPEN_REFUSED')
            p=Path(path).resolve();mode,flags=args[1:3]
            writing=isinstance(mode,str) and any(c in mode for c in 'wax+') or isinstance(flags,int) and bool(flags&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC|os.O_APPEND))
            reading=not writing or isinstance(mode,str) and ('r' in mode or '+' in mode) or isinstance(flags,int) and flags&os.O_RDWR
            if writing and not p.is_relative_to(out.resolve()):blocked.append(str(p));raise RuntimeError('UNDECLARED_WRITE')
            if reading:
                standard=p.is_relative_to(stdlib) and not p.is_relative_to(stdlib/'site-packages')
                if p not in allowed and not standard:blocked.append(str(p));raise RuntimeError('UNDECLARED_READ')
                reads.append(str(p))
    sys.addaudithook(guard)
    manifest_body=MANIFEST.read_bytes();pins=json.loads(manifest_body)
    need(pins['historicalExecutionAllowed'] is False and pins['targetsAllowed'] is False and pins['estimatorFitsAllowed'] is False,'ARTIFICIAL_SCOPE_REQUIRED')
    need(set(pins['sources'])==set(SOURCE),'EXACT_SOURCE_SET_REQUIRED')
    need({(REPO/x['path']).absolute() for x in pins['members']}==set(paths)-{MANIFEST},'EXACT_PACKAGE_REQUIRED')
    member_pins={}
    for item in pins['members']:
        p=REPO/item['path'];body=p.read_bytes()
        need(sha(body)==item['sha256'] and len(body)==item['bytes'],'PACKAGE_PIN_CHANGED')
        member_pins[p]=sha(body)
    need(sha((EVIDENCE/'INDEPENDENT_IMPLEMENTATION_ACCEPTANCE.md').read_bytes())==REVIEW_SHA,'ACCEPTED_REVIEW_CHANGED')
    review=json.loads((EVIDENCE/'INDEPENDENT_IMPLEMENTATION_ACCEPTANCE.json').read_bytes())
    need(review['status']=='PASS_ARTIFICIAL_FIT_FREE_IMPLEMENTATION_ONLY' and review['reviewReceiptSha256']==REVIEW_SHA and review['sourceManifestSha256']==sha((EVIDENCE/'ACCEPTED_LOCAL_SOURCE_MANIFEST.json').read_bytes()),'ACCEPTED_REVIEW_SCOPE_CHANGED')
    accepted=json.loads((EVIDENCE/'ACCEPTED_LOCAL_SOURCE_MANIFEST.json').read_bytes())
    for n in SOURCE:need(pins['sources'][n]['sha256']==accepted['sources'][n]['sha256'],'ACCEPTED_SOURCE_CHANGED')
    registry_body=(FREEZE/'FROZEN_CONTRACT.json').read_bytes()
    need(sha(registry_body)==REGISTRY_SHA,'FROZEN_REGISTRY_CHANGED')
    registry=json.loads(registry_body)
    for item in registry['operativeMembers']+[registry['preparationManifest'],registry['independentAcceptance']]:
        p=(FREEZE/item['path']).absolute();need(p in frozen,'FREEZE_PATH_REFUSED')
        need(sha(p.read_bytes())==item['sha256'],'FROZEN_MEMBER_CHANGED')
    executed={};modules={}
    for name,p in SOURCE.items():
        body=p.read_bytes();digest=sha(body);item=pins['sources'][name]
        need(item['path']==p.relative_to(REPO).as_posix() and digest==item['sha256'] and len(body)==item['bytes'],'SOURCE_PIN_CHANGED')
        if name in BASE_PINS:need(digest==BASE_PINS[name],'ORIGINAL_REFERENCE_CHANGED')
        if name=='fold_kernel':need(digest==KERNEL_SHA,'ACCEPTED_KERNEL_CHANGED')
        m=types.ModuleType(name);m.__file__=str(p);sys.modules[name]=m
        exec(compile(body,str(p),'exec'),m.__dict__);executed[name]=digest;modules[name]=m
    stream=io.StringIO();suite=unittest.defaultTestLoader.loadTestsFromModule(modules['test_fold_kernel'])
    result=unittest.TextTestRunner(stream=stream,verbosity=2).run(suite)
    artifacts={}
    if result.wasSuccessful() and not blocked:
        data=serialized(preview(modules));(out/'artificial-fold-preview.json').write_bytes(data)
        artifacts['artificial-fold-preview.json']={'bytes':len(data),'sha256':sha(data)}
    for p,digest in member_pins.items():need(sha(p.read_bytes())==digest,'POSTRUN_PACKAGE_CHANGED')
    for name,p in SOURCE.items():need(sha(p.read_bytes())==executed[name],'POSTRUN_SOURCE_CHANGED')
    need(MANIFEST.read_bytes()==manifest_body,'POSTRUN_MANIFEST_CHANGED')
    success=result.wasSuccessful() and not blocked
    report={'status':'PASS' if success else 'FAIL','tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped),
            'publicationManifestSha256':sha(manifest_body),'registrySha256':REGISTRY_SHA,'reviewReceiptSha256':REVIEW_SHA,
            'sources':executed,'artifacts':artifacts,'reads':reads,'blocked':blocked,'historicalPayloadReads':0,'targetReads':0,'estimatorFits':0,'syntheticFitsUsed':0,'researchFitsUsed':0}
    (out/'tests.txt').write_text(stream.getvalue(),encoding='utf8')
    (out/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    print(json.dumps({k:v for k,v in report.items() if k not in ('sources','reads')}))
    if not success:raise SystemExit(1)


if __name__=='__main__':main()
