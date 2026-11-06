"""Fictional distinct games sharing a provider week; no data acquisition."""
from copy import deepcopy
import json
from artificial_legacy import fixture
from read_plan_spec import PROJECTIONS
from selective_json import project_bytes


def shared_week_bundle():
    data=fixture()
    for alias in ('development_frames','development_legacy_features','development_eligibility','exploratory_legacy_predictive'):
        for row in data[alias]:
            if row['week']!=2:continue
            row['week']=1
            first=next(x for x in data[alias] if x['season']==row['season'] and x['gameId']==row['season']*100+1)
            if alias=='development_frames':
                row['homeElo']=deepcopy(first['homeElo']);row['awayElo']=deepcopy(first['awayElo'])
            elif alias=='development_eligibility':
                row['historyCutoffWeekExclusive']=1;row['homeAdvancedRowIds']=[];row['awayAdvancedRowIds']=[]
            else:
                row['home']=deepcopy(first['home']);row['away']=deepcopy(first['away'])
    for row in data['development_advanced']:
        if row['week']==2:row['week']=1;row['row']['week']=1
    for row in data['exploratory_advanced']:
        if row['week']==2:row['week']=1
    return data


def projected(bundle):
    return {alias:project_bytes(json.dumps(rows,allow_nan=False).encode(),PROJECTIONS[alias])[0] for alias,rows in bundle.items()}
