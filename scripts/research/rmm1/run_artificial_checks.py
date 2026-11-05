"""Run artificial-only boundary checks with a read ledger; never run estimators."""
import hashlib
import io
import json
from pathlib import Path
import sys
import sysconfig
import tempfile
import types
import unittest

def canonical(obj):return json.dumps(obj,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
def digest(body):return hashlib.sha256(body).hexdigest()

def main():
    here=Path(__file__).resolve().parent;step=here.parents[2]
    out=(step/'reports/research-rmm1'/(sys.argv[1] if len(sys.argv)==2 else 'run-01')).resolve()
    if not out.is_relative_to(step.resolve()):raise ValueError('REPORT_PATH_OUTSIDE_STEP')
    out.mkdir(parents=True,exist_ok=False)
    (out/'temporary').mkdir()
    tempfile.tempdir=str(out/'temporary')
    freeze=step/'research/historical/rmm1/freeze'
    allowed_freeze={freeze/n for n in ('FROZEN_CONTRACT.json','SOURCE_SPECIFICATION.md','ADOPTION_RECORD.md','FREEZE_MANIFEST.json','INDEPENDENT_FREEZE_ACCEPTANCE.md')}
    stdlib=Path(sysconfig.get_paths()['stdlib']).resolve()
    temporary=[];reads=[];blocked=[]
    def audit(event,args):
        if event=='tempfile.mkdtemp':temporary.append(Path(args[0]).resolve())
        if event.startswith('socket.') and event in ('socket.connect','socket.getaddrinfo') or event=='subprocess.Popen':
            blocked.append(event);raise RuntimeError('NETWORK_OR_SUBPROCESS_FORBIDDEN')
        if event=='import' and str(args[0]).split('.')[0] in ('sklearn','numpy','scipy'):
            blocked.append('estimator-import');raise RuntimeError('ESTIMATOR_IMPORT_FORBIDDEN')
        if event=='open' and isinstance(args[0],(str,bytes)):
            path=Path(args[0]).resolve();mode=args[1]
            reading=mode is None or 'r' in mode or '+' in mode
            if reading:
                standard=path.is_relative_to(stdlib) and not path.is_relative_to(stdlib/'site-packages')
                allowed=path.is_relative_to(here) or path in allowed_freeze or path.is_relative_to(out) or standard or any(path.is_relative_to(t) for t in temporary)
                if not allowed:
                    blocked.append(str(path));raise RuntimeError('UNDECLARED_FILE_READ')
                reads.append(str(path))
    sys.addaudithook(audit)
    executed={}
    def load_source(name):
        path=here/(name+'.py');body=path.read_bytes()
        module=types.ModuleType(name);module.__file__=str(path)
        sys.modules[name]=module;executed[path.name]=digest(body)
        exec(compile(body,str(path),'exec'),module.__dict__)
        return module
    b=load_source('rmm1_builder')
    fixtures=load_source('synthetic_fixtures')
    test_module=load_source('test_rmm1_builder')
    binding=b.bind_frozen_contract(freeze)
    suite=unittest.defaultTestLoader.loadTestsFromModule(test_module)
    stream=io.StringIO();result=unittest.TextTestRunner(stream=stream,verbosity=2).run(suite)
    (out/'tests.txt').write_text(stream.getvalue(),encoding='utf-8')
    fixture=fixtures.repeatability_fixture();frames=b.build(fixture)
    labels=fixtures.labels_for(frames)
    raw=canonical(fixture);label_bytes=canonical({'synthetic':True,'fixtureId':labels.fixture_id,'entries':labels.entries})
    (out/'fixed-artificial-fixture.json').write_bytes(raw)
    (out/'fixed-artificial-labels.json').write_bytes(label_bytes)
    source=[]
    for path in sorted(here.iterdir()):
        if path.is_file():
            body=path.read_bytes();source.append({'path':path.name,'bytes':len(body),'sha256':digest(body)})
            if path.name in executed:b.require(digest(body)==executed[path.name],'SOURCE_CHANGED_DURING_RUN')
    report={'scope':'ARTIFICIAL_ONLY_MODEL_FREE_STEP2','contractVersion':binding,'frozenRegistrySha256':b.FROZEN_REGISTRY_SHA,'testsRun':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped),'success':result.wasSuccessful(),'sourceFiles':source,'executedSourceSha256':executed,'fixtures':{'repeatability':{'games':len(frames),'training':96,'validation':32,'bytes':len(raw),'sha256':digest(raw)},'artificialLabels':{'bytes':len(label_bytes),'sha256':digest(label_bytes)},'foldStructure':{'games':170,'warmup':100,'validationBlocks':7,'validationGames':70}},'readPaths':sorted(set(reads)),'blockedOperations':blocked,'syntheticEstimatorFits':0,'researchEstimatorFits':0,'providerCalls':0,'historicalTargetReads':0,'realPredictorProcessing':False,'sourcePublished':False,'estimatorEnvironmentQualified':False,'full2025Qualified':False}
    (out/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:report[k] for k in ('scope','testsRun','failures','errors','success','syntheticEstimatorFits','researchEstimatorFits')}))
    return 0 if result.wasSuccessful() and not blocked else 1

if __name__=='__main__':raise SystemExit(main())
