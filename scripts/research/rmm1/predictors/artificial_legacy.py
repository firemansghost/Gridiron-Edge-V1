"""Fabricated old-schema inputs. Numeric IDs are fictional, never provider data.

Three weeks/season; two teams. Literal advanced vectors: (2,1,.6,.4),
(4,3,.8,.2), (6,5,1,.0). No RNG, targets, estimator or filesystem access.
"""
from copy import deepcopy
from read_plan_spec import PROJECTIONS


def triple(value, status='AVAILABLE', n=None):
    return {'value':value, 'status':status, 'n':n}


def fixture():
    bundle = {k:[] for k in PROJECTIONS}
    for year in (2022, 2023, 2024):
        for name in ('Fictional Academy', 'Fabricated State'):
            if year < 2024:
                bundle['development_static'].append({'season':year, 'team':name,
                    'talent':{'status':'AVAILABLE', 'row':{'year':year, 'team':name, 'talent':500}},
                    'returningProduction':{'status':'AVAILABLE', 'row':{'season':year, 'team':name, 'percentPPA':.7}},
                    'recruiting':[{'year':year-n, 'status':'AVAILABLE', 'row':{'year':year-n, 'team':name, 'points':100-n}} for n in range(4)]})
        for week in (1, 2, 3):
            gid = year*100+week
            g = {'season':year,'gameId':gid,'week':week, 'startDate':f'{year}-09-{week*7:02d}T18:00:00Z',
                 'homeTeam':'Fictional Academy','awayTeam':'Fabricated State','neutralSite':False}
            frame = deepcopy(g)
            for side in ('home','away'):
                name = g[side+'Team']
                if year < 2024:
                    frame[side+'Elo'] = {'status':'AVAILABLE','value':1500,'sourceRequestId':'elo-preseason' if week == 1 else f'elo-week-{week-1:02d}', 'sourceWeek':None if week == 1 else week-1, 'row':{'year':year,'team':name,'elo':1500}}
                row = {'season':year, 'gameId':gid, 'week':week, 'team':name,
                       'opponent':g['awayTeam'] if side == 'home' else g['homeTeam'], 'seasonType':'regular',
                       'offense':{'ppa':week*2, 'successRate':[.6,.8,1][week-1]},
                       'defense':{'ppa':week*2-1, 'successRate':[.4,.2,0][week-1]},
                       'unapprovedBoxScore':{'points':999, 'result':'MUST_SKIP'}}
                if year < 2024:
                    bundle['development_advanced'].append({'rowId':f'fictional:{year}:{week}:{side}', **{k:row[k] for k in ('season','gameId','week','team')}, 'row':row})
                else:
                    bundle['exploratory_advanced'].append(row)
            old = deepcopy(g)
            # Deliberately literal independent controls; no adapter called here.
            n = week-1
            v = [None]*6 if week == 1 else [2,1,.6,.4,1,.2] if week == 2 else [3,2,.7,.3,1,.4]
            form_status = 'NO_PRIOR_FBS_GAMES' if week == 1 else 'AVAILABLE'
            static_values = [1500,500,.7,100,99,98,97,n]
            v1_names = ('eloRaw','talentRaw','returningPercentPPA','recruitingPointsY0','recruitingPointsY1','recruitingPointsY2','recruitingPointsY3','priorFbsGames','ppaOffMean','ppaDefMean','successOffMean','successDefMean','ppaNet','successNet')
            features = dict(zip(v1_names, [triple(x,n=1 if i<7 else None) for i,x in enumerate(static_values)] + [triple(x, form_status, n if i<4 else None) for i,x in enumerate(v)]))
            for side in ('home','away'):
                if year < 2024:
                    old[side] = deepcopy(features)
                else:
                    v3_names = ('elo','talent','returning','recruitY0','recruitY1','recruitY2','recruitY3','priorFbsGames','ppaNet','successNet')
                    old[side] = {'team':g[side+'Team'], 'features':dict(zip(v3_names, [triple(x,n=1 if i<7 else None) for i,x in enumerate(static_values)]+[triple(v[4], form_status, n),triple(v[5], form_status, n)])),
                        'formAudit':{'priorFbsGames':n,'observedAdvancedGames':n,'missingAdvancedGames':0,'missingPriorGameIds':[], 'sourceProvenanceCounts':{'BULK_ADVANCED_FULL_SEASON_PRIMARY':n, 'BULK_ADVANCED_WEEK_SCOPED_RECOVERY':0}},
                        'standardized':{'doNotRead':1e300}, 'missingFlags':{'doNotRead':False}}
            if year < 2024:
                bundle['development_frames'].append(frame)
                bundle['development_legacy_features'].append(old)
                bundle['development_eligibility'].append({**{k:g[k] for k in ('season','gameId','week','homeTeam','awayTeam')}, 'historyCutoffWeekExclusive':week,
                    **{side+'AdvancedRowIds':[f'fictional:{year}:{w}:{side}' for w in range(1,week)] for side in ('home','away')}, 'homePpaRowIds':['SKIP'], 'awayPpaRowIds':['SKIP']})
            else:
                old['modelInputs'] = {'doNotRead':999}
                bundle['exploratory_legacy_predictive'].append(old)
    return bundle
