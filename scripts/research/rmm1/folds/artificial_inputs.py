"""Fictional normalized-schema fixtures; never transforms historical data."""
from copy import deepcopy
import rmm1_builder as reference
import synthetic_fixtures as fixtures


def make(shared=False):
    bundle=fixtures.fold_fixture()
    extra=[fixtures.game('SYN-EXPLORATORY-'+str(i),2024,1,25+i,neutral=i%2==0) for i in range(10)]
    if shared:
        extra.append(fixtures.game('SYN-SHARED-EXTRA',2022,1,0))
        extra[-1]['kickoffUtc']='2022-08-01T00:30:00Z'
    bundle=fixtures.assemble(bundle['games']+extra,'SYNFIX-FITFREE-INTEGRATION-V1')
    original=reference.build(bundle)
    ids={f.game.game_id:i+1 for i,f in enumerate(original)}
    rows=[]
    for f in original:
        g=f.game
        row={'season':g.season,'gameId':ids[g.game_id],'week':g.week,'startDate':g.kickoff_utc,'homeTeam':g.home,'awayTeam':g.away,'neutralSite':g.neutral}
        for name in ('home','away'):
            s=getattr(f,name);a=s.audit
            row[name]={'team':s.team,'features':{key:{'value':v.value,'state':v.state,'n':v.n,'sources':list(v.sources)} for key,v in zip(reference.F14,s.features)},
                       'formAudit':{'expected':a.expected,'complete':a.complete,'missingRowGameIds':[],'incompleteGameIds':[ids[x] for x in a.missing_ids],'finiteComponentCounts':list(a.finite_counts)},
                       'legacyControls':{'opaque':'FICTIONAL_NOT_FEATURES'},
                       'sourceTimingQualification':'PACKAGED_UNSTANDARDIZED_NOMINAL_TIMING_ONLY' if g.season==2024 else 'PINNED_WEEKLY_REFERENCE_NOT_PUBLICATION_PROOF'}
            # The normalized historical schema retains no n on priorFbsGames.
            row[name]['features']['priorFbsGames']['n']=None
        rows.append(row)
    return rows,original,ids


def missing(rows,index,feature,state='SOURCE_ROW_UNAVAILABLE',side='home'):
    rows=deepcopy(rows)
    rows[index][side]['features'][feature].update(value=None,state=state)
    return rows
