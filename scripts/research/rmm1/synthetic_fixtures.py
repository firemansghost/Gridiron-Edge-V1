"""Fixed artificial generators only; no filesystem/network/estimator imports."""
from datetime import datetime,timedelta,timezone
import rmm1_builder as b

def game(gid,year,week,pair,neutral=False):
    when=datetime(year,8,1,tzinfo=timezone.utc)+timedelta(days=7*(week-1),hours=pair)
    return {'gameId':gid,'season':year,'week':week,'kickoffUtc':when.isoformat().replace('+00:00','Z'),'home':f'SYNTEAM-{2*pair:03d}','away':f'SYNTEAM-{2*pair+1:03d}','neutral':neutral,'canonicalFbs':True}

def assemble(games,fixture_id):
    years=sorted({g['season'] for g in games});teams=sorted({t for g in games for t in (g['home'],g['away'])})
    static=[];advanced=[]
    for year in years:
        for team in teams:
            i=int(team.split('-')[-1])
            static.extend([
                {'family':'talent','year':year,'team':team,'talent':200+i,'sourceRef':f'synthetic://talent/{year}/{team}'},
                {'family':'returning','season':year,'team':team,'percentPPA':.3+.01*i,'sourceRef':f'synthetic://returning/{year}/{team}'},
                {'family':'elo','year':year,'team':team,'elo':1500+7*i,'sourceWeek':None,'preseason':True,'seasonType':'regular','sourceRef':f'synthetic://elo/{year}/preseason/{team}'},
            ])
            for week in range(1,max(g['week'] for g in games if g['season']==year)):
                static.append({'family':'elo','year':year,'team':team,'elo':1500+7*i+week,'sourceWeek':week,'preseason':False,'seasonType':'regular','sourceRef':f'synthetic://elo/{year}/{week}/{team}'})
    for year in sorted({y-k for y in years for k in range(4)}):
        for team in teams:
            i=int(team.split('-')[-1])
            static.append({'family':'recruiting','year':year,'team':team,'points':10+2*(year-2019)+i,'sourceRef':f'synthetic://recruiting/{year}/{team}'})
    for g in games:
        for team,opp in ((g['home'],g['away']),(g['away'],g['home'])):
            i=int(team.split('-')[-1]);w=g['week']
            advanced.append({'gameId':g['gameId'],'season':g['season'],'week':w,'team':team,'opponent':opp,'offense':{'ppa':.05*i+.01*w,'successRate':.3+.001*i+.002*w},'defense':{'ppa':.03*i+.005*w,'successRate':.25+.001*i+.001*w},'sourceRef':f'synthetic://advanced/{g["gameId"]}/{team}'})
    return {'synthetic':True,'fixtureId':fixture_id,'canonicalIds':[g['gameId'] for g in games if g['canonicalFbs']],'games':games,'staticRows':static,'advancedRows':advanced}

def repeatability_fixture():
    """Exactly128 artificial games, first96 training and final32 validation.

    This generator is fixed before any future estimator verification. Building,
    encoding and hashing it does not instantiate or fit a model.
    """
    games=[game(f'SYN-REPEAT-{i:04d}',2022,1+i//8,i%8,neutral=i%5==0) for i in range(128)]
    return assemble(games,'SYNFIX-RMM1-REPEATABILITY-V1')

def fold_fixture():
    """170 artificial games:100 warmup and10 in each of seven validation blocks."""
    games=[];i=0
    for week in range(1,5):
        for pair in range(25):
            games.append(game(f'SYN-FOLD-{i:04d}',2022,week,pair,neutral=i%5==0));i+=1
    for year,week in ((2022,5),(2022,9),(2022,13),(2023,1),(2023,5),(2023,9),(2023,13)):
        for pair in range(10):
            games.append(game(f'SYN-FOLD-{i:04d}',year,week,pair,neutral=i%5==0));i+=1
    return assemble(games,'SYNFIX-RMM1-FOLDS-V1')

def toy_fixture():
    games=[game(f'SYN-TOY-{i:04d}',2022,i+1,0) for i in range(3)]
    bundle=assemble(games,'SYNFIX-RMM1-TOY-V1')
    for row in bundle['advancedRows']:
        w=row['week']
        row['offense']={'ppa':2*(w-1),'successRate':.2*w}
        row['defense']={'ppa':w-1,'successRate':.1*w}
    return bundle

def labels_for(frames):
    """Artificial arithmetic labels for plumbing only, never historical targets."""
    frames=b.ordered(frames)
    entries=[]
    for f in frames:
        i=int(f.game.game_id.split('-')[-1])
        value=(i%17)-8+3*int(not f.game.neutral)+.25*(i%3)
        entries.append((f.game.game_id,value))
    return b.SyntheticLabels(frames[0].fixture_id,tuple(entries))
