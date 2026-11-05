"""RMM1 artificial-only reference builder. No estimator, provider or target reader."""
from dataclasses import dataclass
from datetime import datetime,timedelta
import hashlib
import json
import math
from pathlib import Path
import re
import statistics

AVAILABLE='AVAILABLE'
REASONS=('NO_PRIOR_FBS_GAMES','SOURCE_HISTORY_INCOMPLETE','SOURCE_ROW_UNAVAILABLE','SOURCE_VALUE_INVALID')
F14=('elo','talent','returningPercentPPA','recruitingPointsY0','recruitingPointsY1','recruitingPointsY2','recruitingPointsY3','priorFbsGames','ppaOffMean','ppaDefMean','successOffMean','successDefMean','ppaNet','successNet')
COMPONENTS=('ppaOffMean','ppaDefMean','successOffMean','successDefMean')
FORM=COMPONENTS+('ppaNet','successNet')
F10=tuple(x for x in F14 if x not in COMPONENTS)
CONFIGURATIONS=('RIDGE_100','RIDGE_10','RIDGE_1','HGB_3_10','HGB_3_1','HGB_7_10','HGB_7_1')
FROZEN_REGISTRY_SHA='09159fd46bb49fb6f063cf0ecaa123cac893d730da00ac0e93ed3aeae4a6ba60'
RESEARCH_FIT_PLAN=(49,7,7,3)
SYNTHETIC_FIT_CAP=4

class IntegrityStop(ValueError):
    pass

def require(condition,code):
    if not condition:raise IntegrityStop(code)

def finite(x):
    return type(x) in (int,float) and math.isfinite(x)

def integer(x):
    return type(x) is int

def exact_keys(row,keys):
    require(type(row) is dict and set(row)==set(keys),'SCHEMA_MISMATCH')

def synthetic_id(value,prefix):
    require(type(value) is str and value.startswith(prefix) and len(value)>len(prefix),'ARTIFICIAL_ID_REQUIRED')

def kickoff(value):
    require(type(value) is str and re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z',value) is not None,'KICKOFF_UTC_REQUIRED')
    try:result=datetime.fromisoformat(value.replace('Z','+00:00'))
    except ValueError:raise IntegrityStop('KICKOFF_INVALID') from None
    require(result.tzinfo is not None and result.utcoffset()==timedelta(0),'KICKOFF_UTC_REQUIRED')
    return result

def bind_frozen_contract(folder):
    """Only permitted filesystem input: explicitly pinned freeze metadata/text."""
    folder=Path(folder)
    raw=(folder/'FROZEN_CONTRACT.json').read_bytes()
    require(hashlib.sha256(raw).hexdigest()==FROZEN_REGISTRY_SHA,'FROZEN_REGISTRY_HASH_MISMATCH')
    record=json.loads(raw)
    require(record['effectiveStatus']=='FROZEN_DESIGN' and record['experimentId']=='retrospective_margin_missingness_v1','FROZEN_IDENTITY_MISMATCH')
    for item in record['operativeMembers']+[record['preparationManifest'],record['independentAcceptance']]:
        require('/' not in item['path'] and '\\' not in item['path'],'FREEZE_MEMBER_PATH_INVALID')
        data=(folder/item['path']).read_bytes()
        require(hashlib.sha256(data).hexdigest()==item['sha256'],'FREEZE_MEMBER_HASH_MISMATCH')
    return record['version']

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
    fixture_id:str

def check_feature(name,feature):
    require(isinstance(feature,Feature) and feature.state in (AVAILABLE,)+REASONS,'FEATURE_STATE_INVALID')
    require(finite(feature.value) if feature.state==AVAILABLE else feature.value is None,'STATUS_VALUE_CONTRADICTION')
    require(type(feature.sources) is tuple,'SOURCE_REFS_NOT_IMMUTABLE')
    for ref in feature.sources:synthetic_id(ref,'synthetic://')
    if name in FORM:
        require(feature.state in (AVAILABLE,'NO_PRIOR_FBS_GAMES','SOURCE_HISTORY_INCOMPLETE'),'FORM_STATE_INVALID')
        require(integer(feature.n) and feature.n>=0,'FORM_N_INVALID')
    else:
        require(feature.state not in REASONS[:2],'STATIC_HISTORY_REASON_INVALID')
    if name=='priorFbsGames':
        require(feature.state==AVAILABLE and integer(feature.value) and feature.value>=0,'PRIOR_COUNT_INVALID')

def check_raw(frame):
    require(isinstance(frame,RawGame),'RAW_GAME_REQUIRED')
    synthetic_id(frame.fixture_id,'SYNFIX-')
    g=frame.game
    require(isinstance(g,Game),'GAME_SCHEMA_INVALID')
    synthetic_id(g.game_id,'SYN-')
    require(integer(g.season) and g.season in (2022,2023,2024),'SEASON_NOT_IN_STEP2')
    require(integer(g.week) and g.week>=1,'PROVIDER_WEEK_UNRESOLVED')
    require(type(g.neutral) is bool,'VENUE_INVALID')
    kickoff(g.kickoff_utc)
    require(g.home!=g.away,'SAME_TEAM_GAME')
    for side,team in ((frame.home,g.home),(frame.away,g.away)):
        synthetic_id(team,'SYNTEAM-')
        require(isinstance(side,Side) and type(side.features) is tuple and side.team==team and len(side.features)==14,'SIDE_IDENTITY_OR_SCHEMA_INVALID')
        for name,feature in zip(F14,side.features):check_feature(name,feature)
        a=side.audit
        require(isinstance(a,FormAudit) and integer(a.expected) and integer(a.complete) and 0<=a.complete<=a.expected,'FORM_AUDIT_INVALID')
        require(side.features[7].value==a.expected,'PRIOR_COUNT_AUDIT_MISMATCH')
        require(len(a.missing_ids)==a.expected-a.complete and len(set(a.missing_ids))==len(a.missing_ids),'MISSING_IDS_AUDIT_INVALID')
        for gid in a.missing_ids:synthetic_id(gid,'SYN-')
        require(len(a.finite_counts)==4 and all(integer(n) and a.complete<=n<=a.expected for n in a.finite_counts),'COMPONENT_COUNTS_INVALID')
        require(type(a.sources) is tuple and type(a.missing_ids) is tuple and type(a.finite_counts) is tuple,'FORM_AUDIT_NOT_IMMUTABLE')
        for ref in a.sources:synthetic_id(ref,'synthetic://')
        state=AVAILABLE if a.expected>0 and a.complete==a.expected else 'NO_PRIOR_FBS_GAMES' if a.expected==0 else 'SOURCE_HISTORY_INCOMPLETE'
        for f in side.features[8:]:require(f.state==state and f.n==a.complete and f.sources==a.sources,'FORM_COHERENCE_INVALID')
        if state==AVAILABLE:
            require(side.features[12].value==side.features[8].value-side.features[9].value,'NET_PPA_MISMATCH')
            require(side.features[13].value==side.features[10].value-side.features[11].value,'NET_SUCCESS_MISMATCH')
    return frame

def ordered(frames):
    frames=tuple(frames)
    require(bool(frames),'EMPTY_POPULATION')
    for f in frames:check_raw(f)
    require(len({f.game.game_id for f in frames})==len(frames),'DUPLICATE_GAME_ID')
    require(len({f.fixture_id for f in frames})==1,'MIXED_FIXTURE_IDENTITIES')
    return tuple(sorted(frames,key=lambda f:(f.game.season,f.game.week,kickoff(f.game.kickoff_utc),f.game.game_id)))

def feature_value(value,source):
    state='SOURCE_ROW_UNAVAILABLE' if value is None else AVAILABLE if finite(value) else 'SOURCE_VALUE_INVALID'
    return Feature(value if state==AVAILABLE else None,state,(source,) if source else ())

def build(bundle):
    """Normalize only in-memory synthetic schema; cannot fetch/read real source files."""
    exact_keys(bundle,('synthetic','fixtureId','canonicalIds','games','staticRows','advancedRows'))
    require(bundle['synthetic'] is True,'ARTIFICIAL_BUNDLE_REQUIRED')
    fixture_id=bundle['fixtureId'];synthetic_id(fixture_id,'SYNFIX-')
    require(type(bundle['canonicalIds']) is list and bool(bundle['canonicalIds']),'CANONICAL_ID_MANIFEST_REQUIRED')
    for gid in bundle['canonicalIds']:synthetic_id(gid,'SYN-')
    require(len(set(bundle['canonicalIds']))==len(bundle['canonicalIds']),'DUPLICATE_CANONICAL_ID')
    require(all(type(bundle[k]) is list for k in ('games','staticRows','advancedRows')),'ARRAY_SCHEMA_REQUIRED')
    games={};excluded=set()
    for row in bundle['games']:
        exact_keys(row,('gameId','season','week','kickoffUtc','home','away','neutral','canonicalFbs'))
        synthetic_id(row['gameId'],'SYN-')
        require(row['gameId'] not in games,'DUPLICATE_GAME_ID')
        require(integer(row['season']) and row['season'] in (2022,2023,2024),'SEASON_NOT_IN_STEP2')
        require(integer(row['week']) and row['week']>=1,'PROVIDER_WEEK_UNRESOLVED')
        require(type(row['neutral']) is bool and type(row['canonicalFbs']) is bool,'GAME_BOOLEAN_INVALID')
        kickoff(row['kickoffUtc'])
        for team in (row['home'],row['away']):synthetic_id(team,'SYNTEAM-')
        require(row['home']!=row['away'],'SAME_TEAM_GAME')
        games[row['gameId']]=Game(row['gameId'],row['season'],row['week'],row['kickoffUtc'],row['home'],row['away'],row['neutral'])
        if not row['canonicalFbs']:excluded.add(row['gameId'])
    canonical=tuple(g for gid,g in games.items() if gid not in excluded)
    require(bool(canonical),'EMPTY_CANONICAL_POPULATION')
    require({g.game_id for g in canonical}==set(bundle['canonicalIds']),'CANONICAL_POPULATION_MISMATCH')
    seasons={g.season for g in canonical};teams={t for g in games.values() for t in (g.home,g.away)}
    static={}
    definitions={'talent':('year','talent'),'returning':('season','percentPPA'),'recruiting':('year','points'),'elo':('year','elo')}
    for row in bundle['staticRows']:
        require(type(row) is dict and row.get('family') in definitions,'STATIC_FAMILY_INVALID')
        family=row['family'];year_key,value_key=definitions[family]
        keys=('family',year_key,'team',value_key,'sourceRef')+(('sourceWeek','preseason','seasonType') if family=='elo' else ())
        exact_keys(row,keys)
        year=row[year_key]
        require(integer(year) and (year in seasons if family!='recruiting' else year in {s-k for s in seasons for k in range(4)}),'SOURCE_YEAR_MISMATCH')
        require(row['team'] in teams,'SOURCE_TEAM_MISMATCH')
        synthetic_id(row['sourceRef'],'synthetic://')
        if family=='elo':
            require(type(row['preseason']) is bool and row['seasonType']=='regular','ELO_TIMING_INVALID')
            require(row['sourceWeek'] is None if row['preseason'] else integer(row['sourceWeek']) and row['sourceWeek']>=1,'ELO_WEEK_INVALID')
        key=(family,year,row.get('sourceWeek'),row.get('preseason'),row['team'])
        require(key not in static,'DUPLICATE_SOURCE_IDENTITY')
        static[key]=feature_value(row[value_key],row['sourceRef'])
    advanced={}
    for row in bundle['advancedRows']:
        exact_keys(row,('gameId','season','week','team','opponent','offense','defense','sourceRef'))
        require(row['gameId'] in games,'ADVANCED_GAME_ID_UNKNOWN')
        g=games[row['gameId']]
        require(integer(row['season']) and integer(row['week']) and row['season']==g.season and row['week']==g.week,'ADVANCED_YEAR_WEEK_MISMATCH')
        require(row['team'] in (g.home,g.away) and row['opponent']==(g.away if row['team']==g.home else g.home),'ADVANCED_TEAM_OPPONENT_MISMATCH')
        for name in ('offense','defense'):exact_keys(row[name],('ppa','successRate'))
        synthetic_id(row['sourceRef'],'synthetic://')
        key=(g.game_id,row['team']);require(key not in advanced,'DUPLICATE_ADVANCED_IDENTITY')
        advanced[key]=row
    def static_feature(family,year,team,week=None,preseason=None):
        return static.get((family,year,week,preseason,team),Feature(None,'SOURCE_ROW_UNAVAILABLE'))
    def side(g,team):
        h=sorted((p for p in canonical if p.season==g.season and p.week<g.week and team in (p.home,p.away)),key=lambda p:(p.week,kickoff(p.kickoff_utc),p.game_id))
        require(all(kickoff(p.kickoff_utc)<kickoff(g.kickoff_utc) for p in h),'HISTORY_KICKOFF_NOT_EARLIER')
        values=[];counts=[0]*4;missing=[];sources=[]
        for p in h:
            row=advanced.get((p.game_id,team))
            v=[row[s][k] for s,k in (('offense','ppa'),('defense','ppa'),('offense','successRate'),('defense','successRate'))] if row else [None]*4
            for i,x in enumerate(v):counts[i]+=int(finite(x))
            if row:sources.append(row['sourceRef'])
            if all(finite(x) for x in v):values.append(v)
            else:missing.append(p.game_id)
        n=len(h);complete=len(values)
        state=AVAILABLE if n and complete==n else 'NO_PRIOR_FBS_GAMES' if not n else 'SOURCE_HISTORY_INCOMPLETE'
        means=[statistics.fmean(v[i] for v in values) for i in range(4)] if state==AVAILABLE else [None]*4
        net=[means[0]-means[1],means[2]-means[3]] if state==AVAILABLE else [None]*2
        require(state!=AVAILABLE or all(finite(x) for x in means+net),'FORM_NUMERIC_OVERFLOW')
        features=[static_feature('elo',g.season,team,None if g.week==1 else g.week-1,g.week==1),static_feature('talent',g.season,team),static_feature('returning',g.season,team)]
        features.extend(static_feature('recruiting',g.season-k,team) for k in range(4))
        features.append(Feature(n,AVAILABLE,tuple('synthetic://history/'+p.game_id for p in h),n))
        features.extend(Feature(x,state,tuple(sources),complete) for x in means+net)
        return Side(team,tuple(features),FormAudit(n,complete,tuple(missing),tuple(counts),tuple(sources)))
    return ordered(RawGame(g,side(g,g.home),side(g,g.away),fixture_id) for g in canonical)

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
    fixture_id:str

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
    return Preprocessor(tuple(stats),frozenset(f.game.game_id for f in training),frozenset(profile(f) for f in training),training[0].fixture_id)

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
    require(isinstance(preprocessor,Preprocessor) and frame.fixture_id==preprocessor.fixture_id and len(preprocessor.columns)==14,'TRANSFORM_IDENTITY_MISMATCH')
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

@dataclass(frozen=True)
class SyntheticLabels:
    fixture_id:str
    entries:tuple

def label_index(labels,frames):
    frames=ordered(frames)
    require(isinstance(labels,SyntheticLabels) and labels.fixture_id==frames[0].fixture_id,'SYNTHETIC_LABEL_IDENTITY_REQUIRED')
    require(len(labels.entries)==len(frames),'LABEL_DENOMINATOR_MISMATCH')
    result={}
    for gid,value in labels.entries:
        synthetic_id(gid,'SYN-');require(gid not in result and finite(value),'LABEL_INVALID_OR_DUPLICATE');result[gid]=value
    require(set(result)=={f.game.game_id for f in frames},'LABEL_POPULATION_MISMATCH')
    return result

@dataclass(frozen=True)
class MeanBaselines:
    global_mean:float
    nonneutral_mean:float
    neutral_mean:float
    training_ids:frozenset
    fixture_id:str

def mean_baselines(training,labels):
    training=ordered(training);values=label_index(labels,training)
    require(all(f.game.season in (2022,2023) for f in training),'TRAINING_SEASONS_REQUIRED')
    global_mean=statistics.fmean(values.values())
    groups=[]
    for neutral in (False,True):
        group=[values[f.game.game_id] for f in training if f.game.neutral==neutral]
        groups.append(statistics.fmean(group) if group else global_mean)
    require(all(finite(x) for x in (global_mean,*groups)),'BASELINE_NONFINITE')
    return MeanBaselines(global_mean,*groups,frozenset(values),training[0].fixture_id)

@dataclass(frozen=True)
class Prediction:
    game_id:str
    value:float
    status:str

def route_predictions(frames,encoded,model_values,baseline,preprocessor):
    """Model-free synthetic plumbing: callers supply artificial stand-in outputs."""
    frames=ordered(frames)
    require(isinstance(baseline,MeanBaselines) and baseline.fixture_id==frames[0].fixture_id,'BASELINE_IDENTITY_MISMATCH')
    require(isinstance(preprocessor,Preprocessor) and baseline.training_ids==preprocessor.training_ids,'BASELINE_TRAINING_SET_MISMATCH')
    require(type(model_values) is dict,'MODEL_VALUES_MAPPING_REQUIRED')
    require(len(encoded)==len(frames) and len({x.game_id for x in encoded})==len(frames),'ENCODED_DENOMINATOR_MISMATCH')
    index={x.game_id:x for x in encoded}
    require(set(index)=={f.game.game_id for f in frames},'ENCODED_POPULATION_MISMATCH')
    for f in frames:
        item=index[f.game.game_id]
        require(encode(f,preprocessor,item.family,item.learner)==item,'ENCODED_INPUT_OR_MASK_CHANGED')
    require(all(x.status in ('MODEL','HFA_FALLBACK_UNSEEN_STATE') and bool(x.unseen_states)==(x.status=='HFA_FALLBACK_UNSEEN_STATE') for x in encoded),'ENCODED_STATUS_INVALID')
    require(set(model_values)=={x.game_id for x in encoded if x.status=='MODEL'},'MODEL_OUTPUT_DENOMINATOR_MISMATCH')
    result=[]
    for frame in frames:
        item=index[frame.game.game_id]
        value=model_values[item.game_id] if item.status=='MODEL' else baseline.neutral_mean if frame.game.neutral else baseline.nonneutral_mean
        require(finite(value),'PREDICTION_NONFINITE')
        result.append(Prediction(item.game_id,value,item.status))
    return tuple(result)

def synthetic_metrics(frames,predictions,labels):
    frames=ordered(frames);truth=label_index(labels,frames)
    require(len(predictions)==len(frames) and len({p.game_id for p in predictions})==len(frames),'PREDICTION_DENOMINATOR_MISMATCH')
    require({p.game_id for p in predictions}==set(truth),'PREDICTION_POPULATION_MISMATCH')
    require(all(finite(p.value) and p.status in ('MODEL','HFA_FALLBACK_UNSEEN_STATE') for p in predictions),'PREDICTION_INVALID')
    errors=[p.value-truth[p.game_id] for p in predictions]
    require(all(finite(x) for x in errors),'METRIC_NUMERIC_FAILURE')
    try:mae=statistics.fmean(abs(x) for x in errors);rmse=math.sqrt(statistics.fmean(x*x for x in errors));bias=statistics.fmean(errors)
    except (ValueError,OverflowError):raise IntegrityStop('METRIC_NUMERIC_FAILURE') from None
    require(all(finite(x) for x in (mae,rmse,bias)),'METRIC_NUMERIC_FAILURE')
    native=sum(p.status=='MODEL' for p in predictions)
    return {'syntheticOnly':True,'denominator':len(frames),'native':native,'fallback':len(frames)-native,'finiteCoverage':1.0,'nativeCoverage':native/len(frames),'mae':mae,'rmse':rmse,'biasPredictionMinusActual':bias,'coverageStatus':'SYNTHETIC_COVERAGE_LIMITED' if native/len(frames)<.9 else 'SYNTHETIC_COVERAGE_COMPLETE'}

def select_configuration(maes):
    require(type(maes) in (list,tuple) and len(maes)==7 and all(finite(x) and x>=0 for x in maes),'ALL_SEVEN_FINITE_MAES_REQUIRED')
    minimum=min(maes)
    return next(name for name,value in zip(CONFIGURATIONS,maes) if value<=minimum+1e-6)
