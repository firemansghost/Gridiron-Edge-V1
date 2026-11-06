"""Outcome-free in-memory RMM1 fold/preprocessing kernel. No file or fit API.

New namespace for accepted raw schema. The original SYN-only builder is intact.
The caller must separately authenticate the raw payload and manifest before use.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta
import math
import re
import statistics

AVAILABLE='AVAILABLE'
REASONS=('NO_PRIOR_FBS_GAMES','SOURCE_HISTORY_INCOMPLETE','SOURCE_ROW_UNAVAILABLE','SOURCE_VALUE_INVALID')
F14=('elo','talent','returningPercentPPA','recruitingPointsY0','recruitingPointsY1','recruitingPointsY2','recruitingPointsY3','priorFbsGames','ppaOffMean','ppaDefMean','successOffMean','successDefMean','ppaNet','successNet')
COMPONENTS=('ppaOffMean','ppaDefMean','successOffMean','successDefMean')
FORM=COMPONENTS+('ppaNet','successNet')
F10=tuple(x for x in F14 if x not in COMPONENTS)
CONFIGURATIONS=('RIDGE_100','RIDGE_10','RIDGE_1','HGB_3_10','HGB_3_1','HGB_7_10','HGB_7_1')
class IntegrityStop(ValueError):
    pass

def require(condition,code):
    if not condition:raise IntegrityStop(code)

def finite(x):
    
    try:return type(x) in (int,float) and math.isfinite(x)
    except OverflowError:return False

def integer(x):
    return type(x) is int

def exact_keys(row,keys):
    require(type(row) is dict and set(row)==set(keys),'SCHEMA_MISMATCH')

def kickoff(value):
    require(type(value) is str and re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z',value) is not None,'KICKOFF_UTC_REQUIRED')
    try:result=datetime.fromisoformat(value.replace('Z','+00:00'))
    except ValueError:raise IntegrityStop('KICKOFF_INVALID') from None
    require(result.tzinfo is not None and result.utcoffset()==timedelta(0),'KICKOFF_UTC_REQUIRED')
    return result

@dataclass(frozen=True)
class Game:
    game_id:str
    season:int
    week:int
    kickoff_utc:str
    home:str
    away:str
    neutral:bool

@dataclass(frozen=True)
class Feature:
    value:object
    state:str
    sources:tuple=()
    n:object=None

@dataclass(frozen=True)
class FormAudit:
    expected:int
    complete:int
    missing_ids:tuple
    finite_counts:tuple
    sources:tuple

@dataclass(frozen=True)
class Side:
    team:str
    features:tuple
    audit:FormAudit

@dataclass(frozen=True)
class RawGame:
    game:Game
    home:Side
    away:Side
    dataset_id:str


# Schema validation and ingress below.
def identity(value):
    return type(value) is str and bool(value) and value == value.strip()


def check_feature(name, f):
    require(isinstance(f, Feature) and f.state in (AVAILABLE,)+REASONS, 'FEATURE_STATE_INVALID')
    require(finite(f.value) if f.state == AVAILABLE else f.value is None, 'STATUS_VALUE_CONTRADICTION')
    require(type(f.sources) is tuple and all(identity(s) for s in f.sources), 'SOURCE_REFS_INVALID')
    if name in FORM:
        require(f.state in (AVAILABLE,)+REASONS[:2] and integer(f.n) and f.n >= 0, 'FORM_STATE_OR_COUNT_INVALID')
    else:
        require(f.state not in REASONS[:2] and f.n is None, 'STATIC_STATE_OR_COUNT_INVALID')
    if name == 'priorFbsGames':
        require(f.state == AVAILABLE and integer(f.value) and f.value >= 0, 'PRIOR_COUNT_INVALID')


def check_raw(frame):
    require(isinstance(frame, RawGame) and identity(frame.dataset_id), 'RAW_IDENTITY_INVALID')
    g=frame.game
    require(isinstance(g, Game) and integer(g.game_id) and g.game_id > 0, 'GAME_ID_INVALID')
    require(integer(g.season) and g.season in (2022,2023,2024), 'SEASON_NOT_ALLOWED')
    require(integer(g.week) and g.week > 0 and type(g.neutral) is bool, 'GAME_CONTEXT_INVALID')
    require(identity(g.home) and identity(g.away) and g.home != g.away, 'TEAM_IDENTITY_INVALID')
    kickoff(g.kickoff_utc)
    for side, team in ((frame.home,g.home),(frame.away,g.away)):
        require(isinstance(side,Side) and side.team == team and type(side.features) is tuple and len(side.features)==14, 'SIDE_SCHEMA_INVALID')
        for name,f in zip(F14,side.features):check_feature(name,f)
        a=side.audit
        require(isinstance(a,FormAudit) and integer(a.expected) and integer(a.complete) and 0 <= a.complete <= a.expected, 'FORM_AUDIT_INVALID')
        require(type(a.missing_ids) is tuple and len(a.missing_ids)==a.expected-a.complete and len(set(a.missing_ids))==len(a.missing_ids), 'FORM_MISSING_IDS_INVALID')
        require(all(integer(x) and x>0 for x in a.missing_ids), 'FORM_MISSING_IDS_INVALID')
        require(type(a.finite_counts) is tuple and len(a.finite_counts)==4 and all(integer(x) and a.complete<=x<=a.expected for x in a.finite_counts), 'FORM_COUNTS_INVALID')
        require(type(a.sources) is tuple and all(identity(x) for x in a.sources), 'FORM_SOURCES_INVALID')
        require(side.features[7].value==a.expected, 'PRIOR_AUDIT_MISMATCH')
        state=AVAILABLE if a.expected and a.complete==a.expected else REASONS[0] if not a.expected else REASONS[1]
        for f in side.features[8:]:
            require(f.state==state and f.n==a.complete and f.sources==a.sources, 'FORM_COHERENCE_INVALID')
        if state==AVAILABLE:
            require(side.features[12].value==side.features[8].value-side.features[9].value and side.features[13].value==side.features[10].value-side.features[11].value, 'FORM_NET_MISMATCH')
    return frame


def ordered(frames):
    frames=tuple(frames)
    require(bool(frames), 'EMPTY_POPULATION')
    for f in frames:check_raw(f)
    require(len({f.game.game_id for f in frames})==len(frames), 'DUPLICATE_GAME_ID')
    require(len({f.dataset_id for f in frames})==1, 'MIXED_DATASET_IDENTITIES')
    return tuple(sorted(frames,key=lambda f:(f.game.season,f.game.week,kickoff(f.game.kickoff_utc),f.game.game_id)))


def ingest(rows, dataset_id, expected_ids, expected_counts):
    """Project only context/F14/audit fields from already authenticated memory.

    legacyControls is an opaque retained producer field, never read or modeled.
    This function grants no historical read capability and accepts no file path.
    """
    require(type(rows) is list and identity(dataset_id), 'RAW_LIST_AND_DATASET_REQUIRED')
    require(type(expected_ids) is tuple and all(integer(x) and x>0 for x in expected_ids) and len(set(expected_ids))==len(expected_ids), 'EXPECTED_IDS_INVALID')
    require(type(expected_counts) is dict and set(expected_counts)=={2022,2023,2024} and all(integer(x) and x>0 for x in expected_counts.values()), 'EXPECTED_COUNTS_INVALID')
    frames=[]
    for row in rows:
        exact_keys(row,('season','gameId','week','startDate','homeTeam','awayTeam','neutralSite','home','away'))
        g=Game(row['gameId'],row['season'],row['week'],row['startDate'],row['homeTeam'],row['awayTeam'],row['neutralSite'])
        sides=[]
        for name in ('home','away'):
            s=row[name]
            exact_keys(s,('team','features','formAudit','legacyControls','sourceTimingQualification'))
            require(s['sourceTimingQualification']==('PACKAGED_UNSTANDARDIZED_NOMINAL_TIMING_ONLY' if g.season==2024 else 'PINNED_WEEKLY_REFERENCE_NOT_PUBLICATION_PROOF'), 'TIMING_LABEL_INVALID')
            exact_keys(s['features'],F14)
            cells=[]
            for key in F14:
                f=s['features'][key];exact_keys(f,('value','state','n','sources'))
                require(type(f['sources']) is list, 'SOURCE_REFS_INVALID')
                cells.append(Feature(f['value'],f['state'],tuple(f['sources']),f['n']))
            a=s['formAudit'];exact_keys(a,('expected','complete','missingRowGameIds','incompleteGameIds','finiteComponentCounts'))
            require(all(type(a[k]) is list for k in ('missingRowGameIds','incompleteGameIds','finiteComponentCounts')), 'AUDIT_ARRAY_REQUIRED')
            require(len(set(a['missingRowGameIds']))==len(a['missingRowGameIds']) and set(a['missingRowGameIds'])<=set(a['incompleteGameIds']), 'MISSING_ROW_IDS_INVALID')
            sides.append(Side(s['team'],tuple(cells),FormAudit(a['expected'],a['complete'],tuple(a['incompleteGameIds']),tuple(a['finiteComponentCounts']),tuple(cells[8].sources))))
        frames.append(RawGame(g,*sides,dataset_id))
    frames=ordered(frames)
    require(tuple(f.game.game_id for f in frames)==expected_ids, 'CANONICAL_POPULATION_ORDER_MISMATCH')
    require({y:sum(f.game.season==y for f in frames) for y in expected_counts}==expected_counts, 'SEASON_COUNT_MISMATCH')
    for f in frames:
        for s in (f.home,f.away):
            history=[p for p in frames if p.game.season==f.game.season and p.game.week<f.game.week and s.team in (p.game.home,p.game.away)]
            require(s.audit.expected==len(history) and set(s.audit.missing_ids)<={p.game.game_id for p in history}, 'CANONICAL_HISTORY_MISMATCH')
            require(all(kickoff(p.game.kickoff_utc)<kickoff(f.game.kickoff_utc) for p in history), 'HISTORY_KICKOFF_NOT_EARLIER')
    return frames


def profile(frame):
    return tuple(f.state for side in (frame.home,frame.away) for f in side.features)

@dataclass(frozen=True)
class ColumnStats:
    median:float
    mean:float
    scale:float
    observed_states:frozenset

@dataclass(frozen=True)
class Preprocessor:
    columns:tuple
    training_ids:frozenset
    training_profiles:frozenset
    dataset_id:str

def fit_preprocessor(training):
    training=ordered(training);stats=[]
    require(all(f.game.season in (2022,2023) for f in training),'TRAINING_SEASONS_REQUIRED')
    for i,name in enumerate(F14):
        cells=[side.features[i] for frame in training for side in (frame.home,frame.away)]
        available=[c.value for c in cells if c.state==AVAILABLE]
        require(bool(available),'NO_AVAILABLE_TRAINING_VALUES:'+name)
        median=statistics.median(available)
        imputed=[c.value if c.state==AVAILABLE else median for c in cells]
        try:mean=statistics.fmean(imputed);scale=statistics.pstdev(imputed)
        except (ValueError,OverflowError):raise IntegrityStop('TRANSFORM_NUMERIC_FAILURE') from None
        require(all(finite(x) for x in (median,mean,scale)),'TRANSFORM_NUMERIC_FAILURE')
        stats.append(ColumnStats(median,mean,scale or 1.0,frozenset(c.state for c in cells if c.state!=AVAILABLE)))
    return Preprocessor(tuple(stats),frozenset(f.game.game_id for f in training),frozenset(profile(f) for f in training),training[0].dataset_id)

def column_names(family):
    require(family in ('F14','F10','B2'),'FEATURE_FAMILY_INVALID')
    features=F14 if family=='F14' else F10 if family=='F10' else ('elo',)
    return tuple(f'{s}.{f}' for s in ('home','away') for f in features)+tuple(f'{s}.{f}.{r}' for s in ('home','away') for f in features for r in REASONS)+('homeVenue',)

@dataclass(frozen=True)
class EncodedGame:
    game_id:str
    values:tuple
    status:str
    unseen_states:tuple
    novel_joint_profile:bool
    family:str
    learner:str

def encode(frame,preprocessor,family='F14',learner='ridge'):
    check_raw(frame)
    require(isinstance(preprocessor,Preprocessor) and frame.dataset_id==preprocessor.dataset_id and len(preprocessor.columns)==14,'TRANSFORM_IDENTITY_MISMATCH')
    require(family in ('F14','F10','B2') and learner in ('ridge','tree'),'ENCODER_KIND_INVALID')
    require(family!='B2' or learner=='ridge','B2_RIDGE_REQUIRED')
    names=F14 if family=='F14' else F10 if family=='F10' else ('elo',)
    numeric=[];flags=[];unseen=[]
    for side_name,side in (('home',frame.home),('away',frame.away)):
        for i,name in enumerate(F14):
            cell=side.features[i];stat=preprocessor.columns[i]
            if (family!='B2' or name=='elo') and cell.state!=AVAILABLE and cell.state not in stat.observed_states:unseen.append((side_name,name,cell.state))
            if name in names:
                x=cell.value if cell.state==AVAILABLE else stat.median
                numeric.append((x-stat.mean)/stat.scale if learner=='ridge' else x)
                flags.extend(int(cell.state==r) for r in REASONS)
    vector=tuple(numeric+flags+[int(not frame.game.neutral)])
    require(len(vector)==len(column_names(family)) and all(finite(x) for x in vector),'ENCODED_MATRIX_INVALID')
    return EncodedGame(frame.game.game_id,vector,'HFA_FALLBACK_UNSEEN_STATE' if unseen else 'MODEL',tuple(unseen),profile(frame) not in preprocessor.training_profiles,family,learner)

@dataclass(frozen=True)
class Fold:
    name:str
    training_ids:tuple
    validation_ids:tuple

@dataclass(frozen=True)
class FoldPlan:
    folds:tuple
    warmup_ids:tuple
    population_ids:tuple

def fold_plan(frames):
    frames=ordered(frames)
    require(all(f.game.season in (2022,2023) for f in frames),'DEVELOPMENT_SEASONS_REQUIRED')
    folds=[];seen=set()
    for season,start,end in ((2022,5,8),(2022,9,12),(2022,13,None),(2023,1,4),(2023,5,8),(2023,9,12),(2023,13,None)):
        val=tuple(f for f in frames if f.game.season==season and f.game.week>=start and (end is None or f.game.week<=end))
        train=tuple(f for f in frames if f.game.season<season or f.game.season==season and f.game.week<start)
        require(bool(val) and len(train)>=100,'EMPTY_FOLD_OR_SHORT_TRAINING')
        require(max(kickoff(f.game.kickoff_utc) for f in train)<min(kickoff(f.game.kickoff_utc) for f in val),'FOLD_KICKOFF_ORDER_INVALID')
        ids=tuple(f.game.game_id for f in val)
        require(not seen.intersection(ids),'REPEATED_VALIDATION_GAME')
        seen.update(ids);folds.append(Fold(f'{season}-{start}-{end or "later"}',tuple(f.game.game_id for f in train),ids))
    warmup=tuple(f.game.game_id for f in frames if f.game.season==2022 and f.game.week<5)
    require(seen.isdisjoint(warmup) and len(seen)+len(warmup)==len(frames),'FOLD_DENOMINATOR_MISMATCH')
    return FoldPlan(tuple(folds),warmup,tuple(f.game.game_id for f in frames))

def fold_views(frames,fold):
    frames=ordered(frames);index={f.game.game_id:f for f in frames}
    require(isinstance(fold,Fold) and len(set(fold.training_ids))==len(fold.training_ids) and len(set(fold.validation_ids))==len(fold.validation_ids),'FOLD_IDENTITY_INVALID')
    require(set(fold.training_ids).isdisjoint(fold.validation_ids),'TRAIN_VALIDATION_OVERLAP')
    require(set(fold.training_ids+fold.validation_ids)<=set(index),'FOLD_UNKNOWN_GAME')
    require(fold in fold_plan(frames).folds,'FOLD_NOT_DECLARED')
    train=tuple(index[x] for x in fold.training_ids);val=tuple(index[x] for x in fold.validation_ids)
    require(len(train)>=100 and bool(val),'EMPTY_FOLD_OR_SHORT_TRAINING')
    require(max(kickoff(f.game.kickoff_utc) for f in train)<min(kickoff(f.game.kickoff_utc) for f in val),'FOLD_KICKOFF_ORDER_INVALID')
    return train,val

def prepare_fold(frames,fold,family='F14',learner='ridge'):
    train,val=fold_views(frames,fold)
    params=fit_preprocessor(train)
    return params,tuple(encode(f,params,family,learner) for f in train),tuple(encode(f,params,family,learner) for f in val)


def summarize(encoded):
    require(bool(encoded) and len({e.game_id for e in encoded})==len(encoded), 'LEDGER_DENOMINATOR_INVALID')
    native=sum(e.status=='MODEL' for e in encoded)
    require(all(e.status in ('MODEL','HFA_FALLBACK_UNSEEN_STATE') for e in encoded), 'ROUTE_STATUS_INVALID')
    return {'denominator':len(encoded),'native':native,'fallback':len(encoded)-native,
            'nativeCoverage':native/len(encoded),
            'supportStatus':'NATIVE_SUPPORT_AT_LEAST_90_PERCENT' if 10*native>=9*len(encoded) else 'COVERAGE_LIMITED',
            'predictionCoverage':'NOT_RUN','targetsRead':False,'estimatorFits':0}


def prepare_view(training, evaluation):
    """One fixed-origin transform per view; no outcome or estimator exists."""
    training=ordered(training);evaluation=ordered(evaluation)
    require(set(f.game.game_id for f in training).isdisjoint(f.game.game_id for f in evaluation), 'TRAIN_EVALUATION_OVERLAP')
    require(max(kickoff(f.game.kickoff_utc) for f in training)<min(kickoff(f.game.kickoff_utc) for f in evaluation), 'VIEW_KICKOFF_ORDER_INVALID')
    params=fit_preprocessor(training)
    matrices={}
    for family,learner in (('F14','ridge'),('F14','tree'),('F10','ridge'),('F10','tree'),('B2','ridge')):
        train=tuple(encode(f,params,family,learner) for f in training)
        val=tuple(encode(f,params,family,learner) for f in evaluation)
        matrices[family+'_'+learner]={'training':train,'evaluation':val,'support':summarize(val)}
    reference=matrices['F14_ridge']['evaluation']
    for key in ('F14_tree','F10_ridge','F10_tree'):
        require([(e.game_id,e.status,e.unseen_states) for e in matrices[key]['evaluation']]==[(e.game_id,e.status,e.unseen_states) for e in reference], 'COMMON_F14_MASK_MISMATCH')
    return {'preprocessor':params,'matrices':matrices}


def prepare_experiment(frames):
    frames=ordered(frames)
    development=tuple(f for f in frames if f.game.season in (2022,2023))
    exploratory=tuple(f for f in frames if f.game.season==2024)
    require(bool(exploratory), 'EXPLORATORY_POPULATION_REQUIRED')
    plan=fold_plan(development);views=[]
    for fold in plan.folds:
        training,validation=fold_views(development,fold)
        views.append((fold.name,prepare_view(training,validation)))
    final=prepare_view(development,exploratory)
    ledger=tuple({'gameId':f.game.game_id,'role':'WARMUP_ONLY' if f.game.game_id in plan.warmup_ids else 'EXPLORATORY_2024' if f.game.season==2024 else 'OOF', 'targetStatus':'NOT_READ','predictionStatus':'NOT_RUN'} for f in frames)
    oof=tuple(e for _,view in views for e in view['matrices']['F14_ridge']['evaluation'])
    require(len(oof)+len(plan.warmup_ids)==len(development), 'OOF_DENOMINATOR_INVALID')
    return {'status':'FIT_FREE_INPUT_PREVIEW_ONLY','foldPlan':plan,'views':tuple(views),'finalInputPreview':final,
            'ledger':ledger,'pooledOofSupport':summarize(oof),
            'exploratorySupport':final['matrices']['F14_ridge']['support'],
            'targetsRead':False,'estimatorFits':0,'modelsSelected':False}
