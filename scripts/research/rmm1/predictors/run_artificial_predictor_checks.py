"""Exact-source fabricated predictor tests. No historical execution interface."""
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

REGISTRY_SHA = '09159fd46bb49fb6f063cf0ecaa123cac893d730da00ac0e93ed3aeae4a6ba60'
ACCEPTED_MANIFEST_SHA = 'b9982f8be1a4942f5fb693ee34609700b53d17bc25821e59503f54348df880d6'
ACCEPTED_RECEIPT_SHA = 'cfae4f3ed5a759a068f4dc2582a26e27dbc464b32e01f2c91dde5ff7d7bab08c'
PLAN_SHA = '5cacbc3344946fe3f713354d69981012ce04941e56e4ba2b2db6a5835dbf84a5'
NAMES = ('selective_json','read_plan_spec','archive_reader','real_adapter','artificial_legacy','test_adapter')


def require(ok, code):
    if not ok:
        raise ValueError(code)


def sha(body):
    return hashlib.sha256(body).hexdigest()


def main():
    require(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode, 'ISOLATED_NO_SITE_NO_BYTECODE_REQUIRED')
    require(len(sys.argv) == 2 and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}',sys.argv[1]) is not None, 'SIMPLE_REPORT_LABEL_REQUIRED')
    here = Path(__file__).resolve().parent
    repo = here.parents[3]
    evidence = repo/'research/historical/rmm1/predictors'
    freeze = repo/'research/historical/rmm1/freeze'
    out = repo/'reports/research-rmm1'/sys.argv[1]
    # Refuse reused report directories and any existing symlinked parent.
    for folder in (repo/'reports',repo/'reports/research-rmm1',out):
        require(not folder.is_symlink(), 'REPORT_SYMLINK_FORBIDDEN')
    require(out.resolve().is_relative_to(repo), 'REPORT_OUTSIDE_REPOSITORY')
    out.mkdir(parents=True,exist_ok=False)
    (out/'temporary').mkdir()
    tempfile.tempdir = str(out/'temporary')
    source_paths = {here/(name+'.py') for name in NAMES} | {here/'run_artificial_predictor_checks.py'}
    evidence_paths = {evidence/name for name in ('EXACT_PREDICTOR_READ_PLAN.json','ACCEPTED_LOCAL_SOURCE_MANIFEST.json','INDEPENDENT_PREPARATION_ACCEPTANCE.md','INDEPENDENT_PREPARATION_ACCEPTANCE.json','README.md')}
    manifest_path = evidence/'ADAPTER_SOURCE_MANIFEST.json'
    workflow = repo/'.github/workflows/check-rmm1-predictor-adapter-v1.yml'
    expected_package = source_paths | evidence_paths | {workflow}
    freeze_paths = {freeze/name for name in ('FROZEN_CONTRACT.json','SOURCE_SPECIFICATION.md','ADOPTION_RECORD.md','FREEZE_MANIFEST.json','INDEPENDENT_FREEZE_ACCEPTANCE.md')}
    stdlib = Path(sysconfig.get_paths()['stdlib']).resolve()
    allowed_reads = {p.resolve() for p in expected_package | freeze_paths | {manifest_path}}
    reads, blocked = [], []

    def audit(event,args):
        if event.startswith('socket.') or event in ('subprocess.Popen','os.system','os.posix_spawn'):
            blocked.append(event)
            raise RuntimeError('NETWORK_OR_SUBPROCESS_FORBIDDEN')
        if event == 'import' and str(args[0]).split('.')[0] in ('sklearn','numpy','scipy','joblib','cloudpickle','narwhals','threadpoolctl'):
            blocked.append('scientific-import:'+str(args[0]))
            raise RuntimeError('SCIENTIFIC_IMPORT_FORBIDDEN')
        if event == 'open' and isinstance(args[0],(str,bytes)):
            path = Path(os.fsdecode(args[0])).resolve()
            mode,flags = args[1],args[2]
            writing = isinstance(mode,str) and any(x in mode for x in 'wax+') or isinstance(flags,int) and bool(flags & (os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC|os.O_APPEND))
            if writing and not path.is_relative_to(out.resolve()):
                blocked.append('write:'+str(path))
                raise RuntimeError('UNDECLARED_WRITE')
            reading = not isinstance(mode,str) or 'r' in mode or '+' in mode
            if reading:
                standard = path.is_relative_to(stdlib) and not path.is_relative_to(stdlib/'site-packages')
                if path not in allowed_reads and not path.is_relative_to(out.resolve()) and not standard:
                    blocked.append('read:'+str(path))
                    raise RuntimeError('UNDECLARED_READ')
                reads.append(str(path))
    sys.addaudithook(audit)
    # Verify package files before compiling any candidate implementation.
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    items = manifest['members']
    paths = [(repo/item['path']).resolve() for item in items]
    require(len(paths) == len(set(paths)) and set(paths) == {p.resolve() for p in expected_package}, 'EXACT_PACKAGE_MANIFEST_REQUIRED')
    for path,item in zip(paths,items):
        body = path.read_bytes()
        require(len(body) == item['bytes'] and sha(body) == item['sha256'], 'PACKAGE_SOURCE_HASH_MISMATCH')
    accepted_bytes = (evidence/'ACCEPTED_LOCAL_SOURCE_MANIFEST.json').read_bytes()
    require(sha(accepted_bytes) == ACCEPTED_MANIFEST_SHA, 'LOCAL_ACCEPTED_MANIFEST_MISMATCH')
    accepted = json.loads(accepted_bytes)
    old_sources = {item['path'][len('proposed/'):]:item for item in accepted['members'] if item['path'].startswith('proposed/')}
    require(set(old_sources) == {name+'.py' for name in NAMES}, 'ACCEPTED_SOURCE_SET_MISMATCH')
    for name,item in old_sources.items():
        body = (here/name).read_bytes()
        require(len(body) == item['bytes'] and sha(body) == item['sha256'], 'ACCEPTED_SOURCE_BYTES_CHANGED')
    require(sha((evidence/'INDEPENDENT_PREPARATION_ACCEPTANCE.md').read_bytes()) == ACCEPTED_RECEIPT_SHA, 'ACCEPTED_RECEIPT_CHANGED')
    acceptance = json.loads((evidence/'INDEPENDENT_PREPARATION_ACCEPTANCE.json').read_bytes())
    require(acceptance['status'] == 'PASS_LOCAL_PREPARATION_ONLY' and acceptance['sourceManifestSha256'] == ACCEPTED_MANIFEST_SHA and acceptance['exactReadPlanSha256'] == PLAN_SHA, 'LOCAL_PREPARATION_ACCEPTANCE_MISMATCH')
    plan_bytes = (evidence/'EXACT_PREDICTOR_READ_PLAN.json').read_bytes()
    require(sha(plan_bytes) == PLAN_SHA, 'EXACT_PLAN_CHANGED')
    registry_bytes = (freeze/'FROZEN_CONTRACT.json').read_bytes()
    require(sha(registry_bytes) == REGISTRY_SHA, 'FROZEN_REGISTRY_CHANGED')
    registry = json.loads(registry_bytes)
    require(registry['effectiveStatus'] == 'FROZEN_DESIGN' and registry['experimentId'] == 'retrospective_margin_missingness_v1', 'FROZEN_IDENTITY_MISMATCH')
    for item in registry['operativeMembers']+[registry['preparationManifest'],registry['independentAcceptance']]:
        path = (freeze/item['path']).resolve()
        require(path in {p.resolve() for p in freeze_paths}, 'FROZEN_MEMBER_NOT_ALLOWED')
        body = path.read_bytes()
        require(sha(body) == item['sha256'] and ('bytes' not in item or len(body) == item['bytes']), 'FROZEN_MEMBER_CHANGED')
    executed = {}
    modules = {}
    for name in NAMES:
        path = here/(name+'.py');body = path.read_bytes()
        module = types.ModuleType(name);module.__file__ = str(path)
        sys.modules[name] = module
        exec(compile(body,str(path),'exec'),module.__dict__)
        executed[path.name] = sha(body);modules[name] = module
    require(modules['read_plan_spec'].plan() == json.loads(plan_bytes), 'GENERATED_PLAN_MISMATCH')
    suite = unittest.defaultTestLoader.loadTestsFromModule(modules['test_adapter'])
    stream = io.StringIO()
    result = unittest.TextTestRunner(stream=stream,verbosity=2).run(suite)
    (out/'tests.txt').write_text(stream.getvalue(),encoding='utf-8')
    projected = modules['test_adapter'].project_fixture()
    raw,summary = modules['test_adapter'].build(projected)
    fixture_body = json.dumps({'fixture':'FABRICATED_OLD_SCHEMA_ONLY','rawGames':raw,'summary':summary},sort_keys=True,allow_nan=False).encode()
    (out/'fabricated-raw-predictors.json').write_bytes(fixture_body)
    for path,item in zip(paths,items):
        require(sha(path.read_bytes()) == item['sha256'], 'SOURCE_CHANGED_DURING_RUN')
    report = {'scope':'ARTIFICIAL_LEGACY_SCHEMA_ONLY_NO_HISTORICAL_EXECUTION',
        'success':result.wasSuccessful() and not blocked,'testsRun':result.testsRun,
        'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped),
        'frozenRegistrySha256':REGISTRY_SHA,'acceptedLocalManifestSha256':ACCEPTED_MANIFEST_SHA,
        'exactReadPlanSha256':PLAN_SHA,'packageManifestSha256':sha(manifest_bytes),
        'executedSourceSha256':executed,'runnerSha256':sha(Path(__file__).read_bytes()),
        'fabricatedFixture':{'games':len(raw),'bytes':len(fixture_body),'sha256':sha(fixture_body)},
        'pythonVersion':sys.version,'isolated':bool(sys.flags.isolated),'noSite':bool(sys.flags.no_site),
        'readPaths':sorted(set(reads)),'blockedOperations':blocked,
        'historicalPayloadReads':0,'historicalTargetReads':0,'sealed2025Reads':0,
        'syntheticEstimatorFits':0,'researchEstimatorFits':0,'providerQueries':0,
        'realPredictorExecutionAccepted':False,'realMatrixQualified':False}
    (out/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({key:report[key] for key in ('scope','success','testsRun','failures','errors','syntheticEstimatorFits','researchEstimatorFits')}))
    return 0 if report['success'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
