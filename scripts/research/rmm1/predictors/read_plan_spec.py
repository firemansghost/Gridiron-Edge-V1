"""Exact seven-member planning policy; constructing it never opens archives."""
from selective_json import scalar,array,obj

S=scalar()
CONTEXT={k:S for k in ('season','gameId','week','startDate','homeTeam','awayTeam','neutralSite')}
TRIPLE=obj({k:S for k in ('value','status','n')})
V1_NAMES=('eloRaw','talentRaw','returningPercentPPA','recruitingPointsY0','recruitingPointsY1','recruitingPointsY2','recruitingPointsY3','priorFbsGames','ppaOffMean','ppaDefMean','successOffMean','successDefMean','ppaNet','successNet')
V3_NAMES=('elo','talent','returning','recruitY0','recruitY1','recruitY2','recruitY3','priorFbsGames','ppaNet','successNet')
COMPONENTS={side:obj({'ppa':S,'successRate':S},nullable=True) for side in ('offense','defense')}
ADVANCED_ROW=obj({**{k:S for k in ('gameId','season','seasonType','week','team','opponent')},**COMPONENTS},nullable=True)
ELO=obj({**{k:S for k in ('status','value','sourceRequestId','sourceWeek')},'row':obj({k:S for k in ('year','team','elo')},nullable=True)})
def availability(year_key,value_key):return obj({'status':S,'row':obj({year_key:S,'team':S,value_key:S},nullable=True)})

PROJECTIONS={
 'development_frames':array(obj({**CONTEXT,'homeElo':ELO,'awayElo':ELO})),
 'development_advanced':array(obj({**{k:S for k in ('rowId','season','week','gameId','team')},'row':ADVANCED_ROW})),
 'development_eligibility':array(obj({**{k:S for k in ('season','gameId','week','historyCutoffWeekExclusive','homeTeam','awayTeam')},'homeAdvancedRowIds':array(S),'awayAdvancedRowIds':array(S)})),
 'development_static':array(obj({'season':S,'team':S,'talent':availability('year','talent'),'returningProduction':availability('season','percentPPA'),'recruiting':array(obj({'year':S,'status':S,'row':obj({'year':S,'team':S,'points':S},nullable=True)}))})),
 'development_legacy_features':array(obj({**CONTEXT,'home':obj({k:TRIPLE for k in V1_NAMES}),'away':obj({k:TRIPLE for k in V1_NAMES})})),
 'exploratory_legacy_predictive':array(obj({**CONTEXT,**{side:obj({'team':S,'features':obj({k:TRIPLE for k in V3_NAMES}),'formAudit':obj({'priorFbsGames':S,'observedAdvancedGames':S,'missingAdvancedGames':S,'missingPriorGameIds':array(S),'sourceProvenanceCounts':obj({'BULK_ADVANCED_FULL_SEASON_PRIMARY':S,'BULK_ADVANCED_WEEK_SCOPED_RECOVERY':S})})}) for side in ('home','away')}})),
 'exploratory_advanced':array(ADVANCED_ROW),
}

MEMBERS=(
 ('development_frames','corpus','36479515332/predictive/game_frames.json',1086131,'3f13b5bfac463cf7f40d7aeee497305091e09f43a4ed69f30bfae0b0cd82549f'),
 ('development_advanced','corpus','36479515332/predictive/history_advanced.json',9161794,'254e038334a5624b0cf099808b34b2d5aab967f0eec51810bcd646a023f57944'),
 ('development_eligibility','corpus','36479515332/predictive/history_eligibility.json',1856134,'fbaf7dd72e2fe4b90731c067da4afece33056e7736dbf859758eb6247d184509'),
 ('development_static','corpus','36479515332/predictive/static_priors.json',419785,'ddebbdae0be39c9e417a627d95c4652e74b9753139aa527763880964c3f6660c'),
 ('development_legacy_features','features','36489184409/features/game_features.json',4942223,'9ab89dce2eee84fce0c69bae9bb5511d941a8bef1731adbfd36610703c86e74a'),
 ('exploratory_legacy_predictive','predictive2024','36595470751/predictive/v3_game_inputs.json',3947642,'cd708dfcadf7403aaf466e8c4b5f4206a7736b50e7f308bbacc720b28bdef726'),
 ('exploratory_advanced','advanced2024','2024-36508377627/raw/003-advanced-game-stats.json',5757323,'87b50a31b309aba3523cfba57cc7db2508cee0863368236dd0fef1b57c741517'),
)
ARCHIVES={
 'corpus':{'sha256':'cea83762d2b6e492caec680a74a085ef5a5e283c36a402ef4b35acbe2ce22b7d','bytes':1676040,'artifactId':10997010171,'runId':36479515332},
 'features':{'sha256':'047220307750b755d1e6d626628802baf818dbd70ffde9252e63768e7a823ad2','bytes':375745,'artifactId':11000651389,'runId':36489184409},
 'predictive2024':{'sha256':'3d1ffdff9018c002f28526725101ee91f4250d9649879b3318567600e4dfe422','bytes':403236,'artifactId':11046410430,'runId':36595470751},
 'advanced2024':{'sha256':'b41e934b26952100e7e056a56114dc81df6bbe77f5c787f28b75b646ae7ea544','bytes':1126348,'artifactId':11008470975,'runId':36508377627},
}

def plan():
    return {'version':'RMM1_REAL_PREDICTOR_PROJECTION_V1','status':'REQUIRES_INDEPENDENT_EXECUTION_GATE','archives':ARCHIVES,'members':[{'alias':a,'archive':z,'member':m,'bytes':n,'sha256':h,'projection':PROJECTIONS[a]} for a,z,m,n,h in MEMBERS],'expectedGameCounts':{'2022':734,'2023':750,'2024':752},'expectedTeamCounts':{'2022':131,'2023':133,'2024':134},'allowedSeasons':[2022,2023,2024],'maxCatalogMembers':128,'maxTotalUncompressedBytes':134217728,'maxMemberBytes':16777216,'maxJsonDepth':64,'maxJsonNodes':5000000,'semanticReadPolicy':'Only exact projected fields; unknown/forbidden scalar values syntax-skipped without materializing. Duplicate keys/malformed/trailing JSON fail globally.','actualHistoricalReadPerformedByPreparation':False,'historicalTargetsAllowed':False,'estimatorFitsAllowed':False,'providerQueriesAllowed':False,'sealed2025Allowed':False,'featureReadinessInherited':False}
