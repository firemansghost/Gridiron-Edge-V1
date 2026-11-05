"""Qualify exact wheel/runtime/API/matrix boundaries WITHOUT estimator fits."""
import argparse
import base64
import contextlib
import csv
import hashlib
import importlib.metadata as md
import io
import json
import os
from pathlib import Path
import platform
import sys
import types

THREAD_KEYS=('OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS','BLIS_NUM_THREADS','VECLIB_MAXIMUM_THREADS','NUMEXPR_NUM_THREADS')

def require(condition,message):
    if not condition:raise RuntimeError(message)

def digest(body):return hashlib.sha256(body).hexdigest()

def load_source(folder,name):
    path=folder/(name+'.py');body=path.read_bytes()
    module=types.ModuleType(name);module.__file__=str(path);sys.modules[name]=module
    exec(compile(body,str(path),'exec'),module.__dict__)
    return module,digest(body)

def verify_installed_record(name):
    dist=md.distribution(name)
    text=dist.read_text('RECORD');require(text is not None,'MISSING_INSTALLED_RECORD:'+name)
    checked=0;unhashed=0
    for relative,encoded,size in csv.reader(io.StringIO(text)):
        path=Path(dist.locate_file(relative)).resolve()
        require(path.is_relative_to(Path(sys.prefix).resolve()),'PACKAGE_OUTSIDE_VENV:'+name)
        if not encoded:
            unhashed+=1;continue
        algorithm,expected=encoded.split('=',1)
        require(algorithm=='sha256','UNSUPPORTED_RECORD_HASH')
        body=path.read_bytes()
        actual=base64.urlsafe_b64encode(hashlib.sha256(body).digest()).rstrip(b'=').decode()
        require(actual==expected and len(body)==int(size),'INSTALLED_PACKAGE_HASH_MISMATCH:'+name)
        checked+=1
    require(checked>0,'EMPTY_PACKAGE_RECORD:'+name)
    return {'version':dist.version,'installedRecordSha256':digest(text.encode()),'hashedFilesVerified':checked,'unhashedGeneratedEntries':unhashed}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--wheel-dir',required=True)
    parser.add_argument('--out',required=True)
    args=parser.parse_args()
    here=Path(__file__).resolve().parent;repo=here.parents[2]
    out=Path(args.out).resolve()
    require(out.is_relative_to(repo),'REPORT_OUTSIDE_REPO')
    out.mkdir(parents=True,exist_ok=False)
    require(platform.python_implementation()=='CPython' and platform.python_version()=='3.13.7','PYTHON_VERSION_MISMATCH')
    require(sys.prefix!=sys.base_prefix,'ISOLATED_VENV_REQUIRED')
    require(md.version('pip')=='25.2','INSTALLER_VERSION_MISMATCH')
    require(all(os.environ.get(k)=='1' for k in THREAD_KEYS),'THREAD_ENV_MUST_BE_ONE')
    system=platform.system();require(system in ('Windows','Linux'),'PLATFORM_NOT_LOCKED')
    key='windows' if system=='Windows' else 'linux'
    manifest_path=here/'environment/wheel-manifest.json'
    manifest=json.loads(manifest_path.read_bytes());wheels=manifest['platforms'][key]
    directory=Path(args.wheel_dir).resolve();actual={p.name for p in directory.glob('*.whl')}
    require(actual=={r['filename'] for r in wheels},'WHEEL_POPULATION_MISMATCH')
    for r in wheels:
        body=(directory/r['filename']).read_bytes()
        require(len(body)==r['bytes'] and digest(body)==r['sha256'],'WHEEL_HASH_MISMATCH')
        require(md.version(r['name'])==r['version'],'INSTALLED_VERSION_MISMATCH:'+r['name'])
    installed={r['name']:verify_installed_record(r['name']) for r in wheels}
    expected_names={r['name'].lower().replace('_','-') for r in wheels}|{'pip'}
    require({d.metadata['Name'].lower().replace('_','-') for d in md.distributions()}==expected_names,'UNDECLARED_INSTALLED_DISTRIBUTION')
    import numpy as np
    import scipy
    import sklearn
    from sklearn.linear_model import Ridge
    from sklearn.ensemble import HistGradientBoostingRegressor
    from threadpoolctl import threadpool_info,threadpool_limits
    fit_attempts=[]
    def forbidden_fit(*unused_args,**unused_kwargs):
        fit_attempts.append('FORBIDDEN_ESTIMATOR_FIT');raise RuntimeError('ESTIMATOR_FIT_FORBIDDEN_IN_STEP3')
    Ridge.fit=forbidden_fit
    HistGradientBoostingRegressor.fit=forbidden_fit
    parameters=[]
    for alpha in (100,10,1):
        estimator=Ridge(alpha=alpha,fit_intercept=True,copy_X=True,max_iter=None,tol=1e-4,solver='svd',positive=False,random_state=None)
        estimator._validate_params()
        require(not hasattr(estimator,'coef_'),'UNEXPECTED_FITTED_ESTIMATOR')
        p=estimator.get_params(deep=False)
        require(p['alpha']==alpha and p['fit_intercept'] is True and p['solver']=='svd','RIDGE_PARAMETERS_MISMATCH')
        parameters.append({'configuration':f'RIDGE_{alpha}','resolvedParameters':p})
    for leaves,l2 in ((3,10),(3,1),(7,10),(7,1)):
        explicit={'loss':'squared_error','quantile':None,'learning_rate':.05,'max_iter':200,'max_leaf_nodes':leaves,'max_depth':None,'min_samples_leaf':20,'l2_regularization':l2,'max_features':1.0,'max_bins':63,'categorical_features':None,'monotonic_cst':None,'interaction_cst':None,'warm_start':False,'early_stopping':False,'scoring':'loss','validation_fraction':None,'n_iter_no_change':10,'tol':1e-7,'verbose':0,'random_state':20261105}
        estimator=HistGradientBoostingRegressor(**explicit)
        estimator._validate_params()
        require(not hasattr(estimator,'n_iter_'),'UNEXPECTED_FITTED_ESTIMATOR')
        p=estimator.get_params(deep=False)
        require(all(p[k]==v and (type(p[k]) is type(v)) for k,v in explicit.items()),'HGB_PARAMETERS_MISMATCH')
        parameters.append({'configuration':f'HGB_{leaves}_{l2}','resolvedParameters':p})
    baseline=Ridge(alpha=1,fit_intercept=True,copy_X=True,max_iter=None,tol=1e-4,solver='svd',positive=False,random_state=None)
    baseline._validate_params()
    parameters.append({'configuration':'B2_FIXED_RIDGE_1','resolvedParameters':baseline.get_params(deep=False)})
    builder,builder_sha=load_source(here,'rmm1_builder')
    fixtures,fixture_sha=load_source(here,'synthetic_fixtures')
    contract=builder.bind_frozen_contract(repo/'research/historical/rmm1/freeze')
    frames=builder.build(fixtures.repeatability_fixture());train=frames[:96];val=frames[96:]
    preprocessor=builder.fit_preprocessor(train)
    matrices={}
    with threadpool_limits(limits=1):
        for family,columns in (('F14',141),('F10',101),('B2',11)):
            for split,rows in (('train',train),('validation',val)):
                values=tuple(builder.encode(f,preprocessor,family,'ridge').values for f in rows)
                matrix=np.ascontiguousarray(values,dtype=np.float64)
                require(matrix.dtype==np.dtype('float64') and matrix.flags['C_CONTIGUOUS'] and matrix.shape==(len(rows),columns) and np.isfinite(matrix).all(),'DENSE_FLOAT64_MATRIX_INVALID')
                matrices[family+'-'+split]={'shape':list(matrix.shape),'dtype':str(matrix.dtype),'cContiguous':bool(matrix.flags['C_CONTIGUOUS']),'bytesSha256':digest(matrix.tobytes(order='C'))}
        require(all(item['num_threads']==1 for item in threadpool_info()),'NATIVE_THREAD_LIMIT_NOT_ONE')
        pools=threadpool_info()
    labels=fixtures.labels_for(frames)
    y=np.ascontiguousarray([v for _,v in labels.entries],dtype=np.float64)
    require(y.shape==(128,) and np.isfinite(y).all(),'ARTIFICIAL_LABEL_MARSHAL_INVALID')
    require(not fit_attempts,'FIT_ATTEMPTED')
    versions=io.StringIO()
    with contextlib.redirect_stdout(versions):sklearn.show_versions()
    config=io.StringIO()
    with contextlib.redirect_stdout(config):np.show_config()
    report={'status':'IMPORT_CONSTRUCTOR_PARAMETER_FLOAT64_PASS_NO_FITS','contractVersion':contract,'frozenRegistrySha256':builder.FROZEN_REGISTRY_SHA,'platformKey':key,'python':{'version':platform.python_version(),'fullVersion':sys.version,'implementation':platform.python_implementation(),'executable':sys.executable,'compiler':platform.python_compiler(),'build':platform.python_build()},'system':{'platform':platform.platform(),'machine':platform.machine(),'libc':platform.libc_ver()},'threadEnvironment':{k:os.environ[k] for k in THREAD_KEYS},'nativeThreadPools':pools,'wheelManifestSha256':digest(manifest_path.read_bytes()),'lockFileSha256':digest((here/'environment'/f'requirements-{key}.lock').read_bytes()),'installedPackages':installed,'installerPipVersion':md.version('pip'),'resolvedEstimatorParameters':parameters,'builderSourceSha256':builder_sha,'fixtureSourceSha256':fixture_sha,'matrixMarshalling':matrices,'syntheticLabels':{'shape':list(y.shape),'dtype':str(y.dtype),'bytesSha256':digest(y.tobytes())},'sklearnShowVersions':versions.getvalue(),'numpyBuildConfiguration':config.getvalue(),'fitAttempts':fit_attempts,'syntheticEstimatorFits':0,'researchEstimatorFits':0,'realPredictorProcessing':False,'historicalTargetReads':0,'providerCalls':0,'dataReadinessQualified':False,'sameEnvironmentRepeatabilityProved':False,'crossPlatformBitwiseIdentityClaimed':False}
    with (out/'environment-report.json').open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(report,indent=2,allow_nan=False)+'\n')
    print(json.dumps({k:report[k] for k in ('status','platformKey','syntheticEstimatorFits','researchEstimatorFits')}))
    return 0

if __name__=='__main__':raise SystemExit(main())
