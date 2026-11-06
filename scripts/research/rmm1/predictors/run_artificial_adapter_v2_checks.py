"""Isolated exact-source v2 regression checks. No historical execution mode."""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
import sysconfig
import tempfile
import types
import unittest

V2_SHA='e7b6fbd4112db49c262d1ca24f8def6dd2c5e2902a00da33fdb210a3344db564'
REGISTRY_SHA='09159fd46bb49fb6f063cf0ecaa123cac893d730da00ac0e93ed3aeae4a6ba60'
BASE_MANIFEST_SHA='b9982f8be1a4942f5fb693ee34609700b53d17bc25821e59503f54348df880d6'
RAW_RECEIPT_SHA='dfcf4cfa980fc341496a8394f59cc23d6645287de56c60c4d6a65b93fc8bb170'
REPAIR_RECEIPT_SHA='a3f2caac8e5c1f1f92112fb26993f572355038011b56a4b40d6f7db0de6ceb34'
BASE_NAMES=('selective_json','read_plan_spec','archive_reader','real_adapter','artificial_legacy','test_adapter')
NEW_NAMES=('real_adapter_v2','shared_week_fixtures','test_real_adapter_v2','run_artificial_adapter_v2_checks')


def need(ok,code):
    if not ok:raise ValueError(code)


def sha(body):return hashlib.sha256(body).hexdigest()


def main():
    need(sys.implementation.name=='cpython' and sys.version_info[:3]==(3,13,7),'CPYTHON_3137_REQUIRED')
    need(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode and sys.flags.optimize==0,'ISOLATED_NO_SITE_NO_BYTECODE_NO_OPTIMIZE_REQUIRED')
    need(len(sys.argv)==2 and re.fullmatch('[A-Za-z0-9][A-Za-z0-9_-]{0,79}',sys.argv[1]) is not None,'SIMPLE_FRESH_REPORT_LABEL_REQUIRED')
    here=Path(__file__).resolve().parent;repo=here.parents[3]
    evidence=repo/'research/historical/rmm1/predictors-v2'
    freeze=repo/'research/historical/rmm1/freeze'
    out=repo/'reports/research-rmm1'/sys.argv[1]
    for p in (repo/'reports',repo/'reports/research-rmm1',out):
        need(not p.is_symlink() and not p.is_junction(),'REPORT_REDIRECTION_FORBIDDEN')
    need(out.resolve().is_relative_to(repo),'REPORT_OUTSIDE_REPOSITORY')
    out.mkdir(parents=True,exist_ok=False);(out/'temporary').mkdir();tempfile.tempdir=str(out/'temporary')
    source_paths={here/(name+'.py') for name in NEW_NAMES}
    evidence_paths={evidence/name for name in ('README.md','ADAPTER_REPAIR.diff','RAW_ARTIFACT_ACCEPTANCE.md','RAW_ARTIFACT_ACCEPTANCE.json','INDEPENDENT_REPAIR_REVIEW.md','INDEPENDENT_REPAIR_REVIEW.json')}
    workflow=repo/'.github/workflows/check-rmm1-predictor-adapter-v2.yml'
    expected_package=source_paths|evidence_paths|{workflow}
    manifest_path=evidence/'V2_PUBLICATION_MANIFEST.json'
    old_manifest=repo/'research/historical/rmm1/predictors/ACCEPTED_LOCAL_SOURCE_MANIFEST.json'
    base_paths={here/(name+'.py') for name in BASE_NAMES}
    freeze_paths={freeze/name for name in ('FROZEN_CONTRACT.json','SOURCE_SPECIFICATION.md','ADOPTION_RECORD.md','FREEZE_MANIFEST.json','INDEPENDENT_FREEZE_ACCEPTANCE.md')}
    allowed={p.resolve() for p in expected_package|base_paths|freeze_paths|{manifest_path,old_manifest}}
    stdlib=Path(sysconfig.get_paths()['stdlib']).resolve();reads=[];blocked=[]
    def guard(event,args):
        if event.startswith('socket.') or event in ('subprocess.Popen','os.system','os.posix_spawn'):
            blocked.append(event);raise RuntimeError('NETWORK_OR_SUBPROCESS_FORBIDDEN')
        if event=='import' and str(args[0]).split('.')[0] in ('sklearn','numpy','scipy','joblib','cloudpickle','narwhals','threadpoolctl'):
            blocked.append('scientific-import:'+str(args[0]));raise RuntimeError('SCIENTIFIC_IMPORT_FORBIDDEN')
        if event=='open' and isinstance(args[0],(str,bytes)):
            p=Path(os.fsdecode(args[0])).resolve();mode,flags=args[1:3]
            writing=isinstance(mode,str) and any(c in mode for c in 'wax+') or isinstance(flags,int) and bool(flags&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC|os.O_APPEND))
            if writing and not p.is_relative_to(out.resolve()):
                blocked.append('write:'+str(p));raise RuntimeError('UNDECLARED_WRITE')
            if not isinstance(mode,str) or 'r' in mode or '+' in mode:
                standard=p.is_relative_to(stdlib) and not p.is_relative_to(stdlib/'site-packages')
                if p not in allowed and not p.is_relative_to(out.resolve()) and not standard:
                    blocked.append('read:'+str(p));raise RuntimeError('UNDECLARED_READ')
                reads.append(str(p))
    sys.addaudithook(guard)
    package_body=manifest_path.read_bytes();package=json.loads(package_body);members=package['members']
    paths=[(repo/x['path']).resolve() for x in members]
    need(len(paths)==len(set(paths)) and set(paths)=={p.resolve() for p in expected_package},'EXACT_PUBLICATION_PACKAGE_REQUIRED')
    pins={}
    for p,item in zip(paths,members):
        body=p.read_bytes();need(len(body)==item['bytes'] and sha(body)==item['sha256'],'PUBLICATION_SOURCE_CHANGED');pins[p]=item['sha256']
    need(sha((here/'real_adapter_v2.py').read_bytes())==V2_SHA,'ACCEPTED_V2_BYTES_CHANGED')
    base_body=old_manifest.read_bytes();need(sha(base_body)==BASE_MANIFEST_SHA,'BASE_MANIFEST_CHANGED')
    old={Path(x['path']).name:x for x in json.loads(base_body)['members'] if x['path'].startswith('proposed/')}
    need(set(old)=={name+'.py' for name in BASE_NAMES},'EXACT_BASE_SOURCE_SET_REQUIRED')
    for name,item in old.items():
        p=here/name;body=p.read_bytes();need(sha(body)==item['sha256'] and len(body)==item['bytes'],'ORIGINAL_BASE_SOURCE_CHANGED');pins[p.resolve()]=item['sha256']
    need(sha((evidence/'RAW_ARTIFACT_ACCEPTANCE.md').read_bytes())==RAW_RECEIPT_SHA,'RAW_ACCEPTANCE_CHANGED')
    need(sha((evidence/'INDEPENDENT_REPAIR_REVIEW.md').read_bytes())==REPAIR_RECEIPT_SHA,'REPAIR_REVIEW_CHANGED')
    raw_accept=json.loads((evidence/'RAW_ARTIFACT_ACCEPTANCE.json').read_bytes())
    repair=json.loads((evidence/'INDEPENDENT_REPAIR_REVIEW.json').read_bytes())
    need(raw_accept['rawQualification'] is True and raw_accept['overlaySha256']==V2_SHA and raw_accept['trainingMatrixQualified'] is False and raw_accept['fitsAllowed'] is False,'RAW_RECEIPT_SCOPE_CHANGED')
    need(repair['status']=='PASS_NARROW_IMPLEMENTATION_REPAIR_ONLY' and repair['overlaySha256']==V2_SHA,'REPAIR_RECEIPT_SCOPE_CHANGED')
    need(raw_accept['reviewReceiptSha256']==RAW_RECEIPT_SHA and repair['reviewReceiptSha256']==REPAIR_RECEIPT_SHA,'EVIDENCE_PAIR_MISMATCH')
    registry_body=(freeze/'FROZEN_CONTRACT.json').read_bytes();need(sha(registry_body)==REGISTRY_SHA,'FROZEN_REGISTRY_CHANGED')
    registry=json.loads(registry_body);need(registry['effectiveStatus']=='FROZEN_DESIGN','FROZEN_STATUS_CHANGED')
    for item in registry['operativeMembers']+[registry['preparationManifest'],registry['independentAcceptance']]:
        p=(freeze/item['path']).resolve();need(p in {p.resolve() for p in freeze_paths},'FROZEN_MEMBER_PATH_INVALID')
        need(sha(p.read_bytes())==item['sha256'],'FROZEN_MEMBER_CHANGED')
    executed={}
    def load(name):
        p=here/(name+'.py');body=p.read_bytes();need(sha(body)==pins[p.resolve()],'COMPILE_SOURCE_CHANGED')
        m=types.ModuleType(name);m.__file__=str(p);sys.modules[name]=m;exec(compile(body,str(p),'exec'),m.__dict__);executed[p.name]=sha(body);return m
    modules={}
    for name in ('selective_json','read_plan_spec','archive_reader','real_adapter','real_adapter_v2','artificial_legacy','shared_week_fixtures','test_real_adapter_v2'):modules[name]=load(name)
    original=modules['real_adapter']
    # Only the unchanged artificial test module's imported references select v2.
    # Original source stays exact and its module object is restored immediately.
    sys.modules['real_adapter']=modules['real_adapter_v2']
    try:old_tests=load('test_adapter')
    finally:sys.modules['real_adapter']=original
    suite=unittest.TestSuite([unittest.defaultTestLoader.loadTestsFromModule(old_tests),unittest.defaultTestLoader.loadTestsFromModule(modules['test_real_adapter_v2'])])
    stream=io.StringIO();result=unittest.TextTestRunner(stream=stream,verbosity=2).run(suite)
    (out/'tests.txt').write_text(stream.getvalue(),encoding='utf-8')
    fixture=modules['shared_week_fixtures'];raw,summary=modules['real_adapter_v2'].normalize(fixture.projected(fixture.shared_week_bundle()),{2022:3,2023:3,2024:3},{2022:2,2023:2,2024:2})
    body=json.dumps({'scope':'FABRICATED_SHARED_PROVIDER_WEEK_ONLY','games':raw,'summary':summary},sort_keys=True,separators=(',',':'),allow_nan=False).encode()
    (out/'shared-week-raw.json').write_bytes(body)
    for p,digest in pins.items():need(sha(p.read_bytes())==digest,'SOURCE_CHANGED_DURING_RUN')
    report={'scope':'ARTIFICIAL_V2_REPAIR_REGRESSION_ONLY','success':result.wasSuccessful() and not blocked,'testsRun':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped),
            'legacyRegressionTests':unittest.defaultTestLoader.loadTestsFromModule(old_tests).countTestCases(),'v2RegressionTests':unittest.defaultTestLoader.loadTestsFromModule(modules['test_real_adapter_v2']).countTestCases(),
            'v2SourceSha256':V2_SHA,'frozenRegistrySha256':REGISTRY_SHA,'baseManifestSha256':BASE_MANIFEST_SHA,'packageManifestSha256':sha(package_body),'executedSourceSha256':executed,'runnerSha256':sha(Path(__file__).read_bytes()),
            'fictionalFixture':{'games':len(raw),'bytes':len(body),'sha256':sha(body)},'python':sys.version,'isolated':True,'noSite':True,'noBytecode':True,'optimize':0,
            'readPaths':sorted(set(reads)),'blockedOperations':blocked,'historicalArchiveReads':0,'historicalPredictorExecution':False,'targetsRead':0,'sealed2025Read':False,'providerQueries':0,'databaseActions':0,'syntheticEstimatorFits':0,'researchEstimatorFits':0,'trainingMatrixQualified':False}
    (out/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:report[k] for k in ('scope','success','testsRun','failures','errors','syntheticEstimatorFits','researchEstimatorFits')}))
    return 0 if report['success'] else 1


if __name__=='__main__':raise SystemExit(main())
