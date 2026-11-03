/** Unmocked production guard/adapters against an explicitly disposable loopback database. */
import fs from 'fs';import path from 'path';import os from 'os';import zlib from 'zlib';
import assert from 'assert/strict';import {createHash,randomUUID} from 'crypto';import {spawnSync} from 'child_process';
import {PrismaClient,Prisma} from '@prisma/client';
import {W10_LEDGER_FILE,readTrustedW10Ledger,evaluateIntegrityRows,loadIntegrityScope,type NativeIntegrityRow} from '../src/generic-shadow-integrity-disposition';
import {discoverGenericShadowT30AutomationFrames} from '../src/generic-shadow-t30-automation-v1-adapter';
import {createPrismaGenericShadowT30Adapter,executeGenericShadowT30ClosingCapture} from '../src/shadow-model-t30-closing-v1-adapter';
import {expectedGenericShadowT30WriteConfirmation} from '../../web/lib/shadow-model-t30-closing-v1';
import {planGenericShadowT30Automation} from '../../web/lib/generic-shadow-t30-automation-v1';
import {sha256CanonicalJson} from '../../web/lib/shadow-model-capture-v1';
import {loadGenericShadowCoreEvalFrame} from '../src/generic-shadow-core-eval-v1-adapter';
import {runGenericShadowT30MarketRefreshCycle} from '../src/generic-shadow-t30-automation-v1-market-refresh-adapter';
import {runGenericShadowT30ClosingCommitCycle} from '../src/generic-shadow-t30-automation-v1-closing-commit-adapter';
import {expectedGenericShadowT30MarketRefreshConfirmation} from '../../web/lib/generic-shadow-t30-automation-v1-market-refresh';
import {expectedGenericShadowT30ClosingCommitConfirmation} from '../../web/lib/generic-shadow-t30-automation-v1-closing-commit';
const url=process.env.CORE_ONLY_FIXTURE_URL;if(!url)throw new Error('CORE_ONLY_FIXTURE_URL required; no production fallback');
const parsed=new URL(url);if(!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname)||parsed.pathname!='/gridiron_core_only_fixture')throw new Error('Only loopback gridiron_core_only_fixture allowed');
const db=new PrismaClient({datasourceUrl:url});const passed:string[]=[];
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/week10-native-immutable-frames.json'),'utf8'));
const bytes=zlib.gunzipSync(Buffer.from(fixture.data,'base64'));
assert.equal(createHash('sha256').update(bytes).digest('hex'),fixture.rawSha256);
const native=JSON.parse(bytes.toString('utf8')) as {runs:NativeIntegrityRow[];predictions:NativeIntegrityRow[]};
const ledger=readTrustedW10Ledger();const core=ledger.cohorts.find(x=>x.decision==='ELIGIBLE')!;const held=ledger.cohorts.filter(x=>x.decision==='HOLD');
const first=native.predictions.map(x=>JSON.parse(x.row_text)).filter(x=>x.capture_run_id===core.id).sort((a,b)=>a.kickoff_timestamp.localeCompare(b.kickoff_timestamp))[0];
const utc=(s:string)=>new Date(/[Zz]|[+-]\d\d:\d\d$/.test(s)?s:s+'Z');
const kickoff=utc(first.kickoff_timestamp);const target=new Date(+kickoff-30*60_000);const opening=new Date(+kickoff-40*60_000);
async function seed(){
 const count=await db.shadowModelCaptureRun.count();
 if(count===0){
  const rawRuns='['+native.runs.map(x=>x.row_text).join(',')+']';const rawPredictions='['+native.predictions.map(x=>x.row_text).join(',')+']';
  await db.$transaction(async tx=>{
   await tx.$executeRaw`INSERT INTO shadow_model_capture_runs SELECT * FROM jsonb_populate_recordset(NULL::shadow_model_capture_runs,${rawRuns}::text::jsonb)`;
   await tx.$executeRaw`INSERT INTO shadow_model_predictions SELECT * FROM jsonb_populate_recordset(NULL::shadow_model_predictions,${rawPredictions}::text::jsonb)`;
  });
 }
 const audit=await loadIntegrityScope(db,{season:2026,week:10});assert.deepEqual(audit.blockers,[]);assert.deepEqual(audit.counts,ledger.counts);
 const ps=native.predictions.map(x=>JSON.parse(x.row_text));const teams=[...new Set(ps.flatMap(x=>[x.home_team_id,x.away_team_id]))];
 await db.team.createMany({data:teams.map(id=>({id,name:id,conference:'fixture'})),skipDuplicates:true});
 const games=[...new Map(ps.map(x=>[x.game_id,x])).values()];
 await db.game.createMany({data:games.map(p=>({id:p.game_id,homeTeamId:p.home_team_id,awayTeamId:p.away_team_id,season:2026,week:10,date:utc(p.kickoff_timestamp),status:'scheduled',venue:'isolated fixture',city:'fixture',neutralSite:p.neutral_site})),skipDuplicates:true});
 await db.marketLine.createMany({data:[{id:'fixture-close-home',gameId:first.game_id,lineType:'spread' as const,lineValue:-3,teamId:first.home_team_id},{id:'fixture-close-away',gameId:first.game_id,lineType:'spread' as const,lineValue:3,teamId:first.away_team_id}].map(x=>({...x,closingLine:x.lineValue,season:2026,week:10,source:'oddsapi',bookName:'fixture',timestamp:new Date(+target-30_000)})),skipDuplicates:true});
}
function pure(data=structuredClone(native),override:any={}){return evaluateIntegrityRows({season:2026,week:10,runtimeRepoCommitSha:'d'.repeat(40),ledger,...data,...override});}
async function reversible(fn:(tx:Prisma.TransactionClient)=>Promise<void>){const sentinel=new Error('fixture-rollback');try{await db.$transaction(async tx=>{await fn(tx);throw sentinel;},{timeout:30_000});}catch(e){if(e!==sentinel)throw e;}}
function clientProxy(onTransaction:()=>void,inject?:(tx:Prisma.TransactionClient)=>Promise<void>){return new Proxy(db,{get(t,k){if(k==='$transaction')return (fn:any,options:any)=>{onTransaction();return t.$transaction(async tx=>{if(inject)await inject(tx);return fn(tx);},options);};const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v;}});}
const reportDir=path.join(os.tmpdir(),'gridiron-core-integrity-'+randomUUID());fs.mkdirSync(reportDir,{recursive:true});
async function main(){
 await seed();const initial=await loadIntegrityScope(db,{season:2026,week:10});assert.deepEqual(initial.counts,ledger.counts);assert.deepEqual(initial.eligibleCaptureRunIds,[core.id]);assert.equal(initial.cohorts.find(x=>x.id===core.id)!.counts.noSelection,2);assert.equal(initial.cohorts.find(x=>x.modelDefinitionId==='candidate_b_roster_prior_v1')!.counts.unavailable,26);passed.push('all3native runs/186exact rows; Core62 eligible,124held,122direct failures;2NO_SELECTION/26UNAVAILABLE retained');
 const mutations:[string,(x:typeof native)=>void][]=[
  ['unsupported fourth run',x=>{const r=JSON.parse(x.runs[0].row_text);r.id='unexpected-run';r.model_definition_id='unsupported_model';x.runs.push({row_text:JSON.stringify(r)});}],
  ['missing held run',x=>{x.runs=x.runs.filter(r=>JSON.parse(r.row_text).id!==held[0].id);}],
  ['missing held child',x=>{x.predictions=x.predictions.filter((_,i)=>i!==0);}],
  ['duplicate child',x=>{x.predictions.push(x.predictions[0]);}],
  ['changed Core count',x=>{const r=x.runs.find(x=>JSON.parse(x.row_text).id===core.id)!;r.row_text=r.row_text.replace('\"total_games\": 62','\"total_games\": 61');}],
  ['changed Core source',x=>{const r=x.runs.find(r=>JSON.parse(r.row_text).id===core.id)!;r.row_text=r.row_text.replace(ledger.captureSourceSha,'0'.repeat(40));}],
  ['changed held native numeric below one ULP',x=>{const row=x.runs.find(r=>r.row_text.includes('1498.760869565217'))!;const before=JSON.parse(row.row_text);row.row_text=row.row_text.replace('1498.760869565217','1498.7608695652170000001');assert.deepEqual(JSON.parse(row.row_text),before);}],
  ['changed child identity',x=>{x.predictions[0].row_text=x.predictions[0].row_text.replace('"game_id": "','"game_id": "wrong-');}],
 ];
 for(const [name,change]of mutations){const x=structuredClone(native);change(x);assert(pure(x).blockers.length,name);assert.equal(pure(x).eligibleCaptureRunIds.length,0);passed.push(name+' blocks whole scope');}
 assert(pure(native,{ledger:undefined}).blockers.length);assert(pure(native,{ledger:{...ledger,version:99}}).blockers.length);passed.push('missing/tampered/untrusted ledger fails closed');
 const discovery=await discoverGenericShadowT30AutomationFrames(db,{season:2026,week:10});assert.equal(discovery.frames.length,1);assert.equal(discovery.frames[0].predictions.length,62);assert.deepEqual(discovery.integrityAudit!.counts,ledger.counts);passed.push('unmocked production discovery retains186audit and loads only full62Coreframe');
 let transactionCalls=0;const counted=clientProxy(()=>transactionCalls++);const before=await db.shadowModelClosingMarketSnapshot.count();
 for(const h of held){
  const closed=await executeGenericShadowT30ClosingCapture({season:2026,week:10,captureRunId:h.id,mode:'COMMIT',confirmation:expectedGenericShadowT30WriteConfirmation(10,h.id),adapter:createPrismaGenericShadowT30Adapter(counted,{captureRunId:h.id,now:()=>target})});
  assert.equal(closed.plan.writeSafe,false);assert.equal(closed.execution.transactionStarted,false);assert.deepEqual(closed.report.integrityAudit!.counts,ledger.counts);
  const evaluated=await loadGenericShadowCoreEvalFrame(db,h.id);assert.equal(evaluated.frame,null);assert.equal(evaluated.integrityAudit!.cohorts.find(x=>x.id===h.id)!.predictions.length,62);
  for(const [name,script,args]of [['eval','evaluate-generic-shadow-core-eval-v1-2026.ts',['--capture-run-id',h.id]],['close','capture-shadow-model-t30-closing-v1-2026.ts',['--season','2026','--week','10','--capture-run-id',h.id,'--mode','PREVIEW']]] as const){
   const report=path.join(reportDir,`${name}-${h.id}.json`);const child=spawnSync(process.execPath,[require.resolve('tsx/cli'),path.join('apps/jobs',script),...args,'--report',report],{env:{...process.env,DIRECT_URL:url,DATABASE_URL:url},encoding:'utf8',windowsHide:true});
   assert.equal(child.status,1,child.stderr||child.stdout);assert(fs.existsSync(report),child.stderr||child.stdout);const r=JSON.parse(fs.readFileSync(report,'utf8'));assert.deepEqual(r.integrityAudit.counts,ledger.counts);
   if(name==='close'){assert.equal(r.blockedCaptureFrame.predictions.length,62);assert.equal(r.countsMeaning,'BLOCKED_PLAN_NOT_ORIGINAL_POPULATION');}
   if(name==='eval'){assert.equal(r.perPrediction.length,62);assert.equal(r.counts.totalPredictions,62);assert.equal(r.researchRoi,null);assert.equal(r.totalResearchPnl,null);}
  }
 }
 assert.equal(transactionCalls,0);assert.equal(await db.shadowModelClosingMarketSnapshot.count(),before);passed.push('both held manual closing/evaluation adapters AND CLI artifacts block;62originalstates/global186audit,zero transactions/closing rows/no metrics');
 const refreshBase={season:2026,week:10,mode:'COMMIT' as const,confirmation:expectedGenericShadowT30MarketRefreshConfirmation(10),repoCommitSha:'d'.repeat(40),githubRef:'refs/heads/main',liveOddsReportPath:path.join(reportDir,'odds.json'),now:()=>opening};
 const blockedRefresh=async(client:PrismaClient)=>{let calls=0;const r=await runGenericShadowT30MarketRefreshCycle({...refreshBase,discover:()=>discoverGenericShadowT30AutomationFrames(client,{season:2026,week:10}),runLiveOddsCommit:async()=>{calls++;throw Error('must not invoke');}});assert.equal(calls,0);assert((r as any).integrityAudit.blockers.length);};
 await reversible(async tx=>{const r=JSON.parse(native.runs.find(x=>JSON.parse(x.row_text).id===core.id)!.row_text);r.id='unexpected-fourth';r.capture_context='unexpected_fixture';r.model_definition_id='unsupported_model';const raw=JSON.stringify(r);await tx.$executeRaw`INSERT INTO shadow_model_capture_runs SELECT * FROM jsonb_populate_recordset(NULL::shadow_model_capture_runs,('['||${raw}::text||']')::jsonb)`;await blockedRefresh(tx as PrismaClient);});
 await reversible(async tx=>{await tx.$executeRaw`DELETE FROM shadow_model_predictions WHERE id=${held[0].predictions[0].id}`;await blockedRefresh(tx as PrismaClient);});
 const ledgerPath=path.resolve(W10_LEDGER_FILE);const originalLedger=fs.readFileSync(ledgerPath);
 try{fs.writeFileSync(ledgerPath,Buffer.concat([originalLedger,Buffer.from(' ')]));await blockedRefresh(db);}finally{fs.writeFileSync(ledgerPath,originalLedger);}
 passed.push('unmocked StageC rejects unsupported fourth run, missing held child and tampered ledger before provider');

 await reversible(async tx=>{
  await tx.$executeRaw`UPDATE shadow_model_predictions SET input_payload=input_payload||'{"injected":true}'::jsonb WHERE id=${held[0].predictions[0].id}`;
  let providerCalls=0;const trustedOldPlan=planGenericShadowT30Automation({season:2026,week:10,observedTimestamp:opening,frames:discovery.frames});
  const report=await runGenericShadowT30MarketRefreshCycle({...refreshBase,initialPlan:trustedOldPlan,initialDiscoveryBlockers:[],discover:()=>discoverGenericShadowT30AutomationFrames(tx as PrismaClient,{season:2026,week:10}),runLiveOddsCommit:async()=>{providerCalls++;throw Error('must not invoke');}});
  assert.equal(providerCalls,0);
  let childCalls=0;const blockedCycle=await runGenericShadowT30ClosingCommitCycle({season:2026,week:10,mode:'COMMIT',confirmation:expectedGenericShadowT30ClosingCommitConfirmation(10),repoCommitSha:'d'.repeat(40),githubRef:'refs/heads/main',childReportDir:reportDir,now:()=>target,initialPlan:trustedOldPlan,discover:()=>discoverGenericShadowT30AutomationFrames(tx as PrismaClient,{season:2026,week:10}),runClosingCommit:async()=>{childCalls++;throw Error('must not invoke');}});assert.equal(childCalls,0);assert((blockedCycle as any).integrityAudit.blockers.length);
  assert.equal((report as any).integrityAudit.eligibleCaptureRunIds.length,0);assert((report as any).integrityAudit.blockers.length);
 });passed.push('changed held native row blocks actual StageC before provider invocation');
 let txCalls=0;const faultClient=clientProxy(()=>txCalls++,async tx=>{await tx.$executeRaw`UPDATE shadow_model_predictions SET input_payload=input_payload||'{"injected":true}'::jsonb WHERE id=${held[0].predictions[0].id}`;});
 const fault=await executeGenericShadowT30ClosingCapture({season:2026,week:10,captureRunId:core.id,mode:'COMMIT',confirmation:expectedGenericShadowT30WriteConfirmation(10,core.id),adapter:createPrismaGenericShadowT30Adapter(faultClient,{captureRunId:core.id,now:()=>target})});
 assert.equal(txCalls,1);assert.equal(fault.execution.rolledBack,true);assert.equal(fault.execution.persistenceCommitted,false);assert.equal(await db.shadowModelClosingMarketSnapshot.count(),before);assert.deepEqual((await loadIntegrityScope(db,{season:2026,week:10})).blockers,[]);passed.push('Core transaction revalidation detects intervening held drift and rolls back every change');
 const closingInput={season:2026,week:10,mode:'COMMIT' as const,confirmation:expectedGenericShadowT30ClosingCommitConfirmation(10),repoCommitSha:'d'.repeat(40),githubRef:'refs/heads/main',childReportDir:reportDir,now:()=>target,discover:()=>discoverGenericShadowT30AutomationFrames(db,{season:2026,week:10})};
 await reversible(async tx=>{await tx.$executeRaw`DELETE FROM shadow_model_closing_market_snapshots WHERE prediction_id=${first.id}`;const called:string[]=[];const cycle=await runGenericShadowT30ClosingCommitCycle({...closingInput,discover:()=>discoverGenericShadowT30AutomationFrames(tx as PrismaClient,{season:2026,week:10}),runClosingCommit:async req=>{called.push(req.captureRunId);throw Error('isolated child boundary only');}});assert.deepEqual(called,[core.id]);assert.deepEqual((cycle as any).integrityAudit.counts,ledger.counts);});passed.push('actual StageD coordinator invokes only exact Core child and reports all186 rows');
 const positive=await executeGenericShadowT30ClosingCapture({season:2026,week:10,captureRunId:core.id,mode:'COMMIT',confirmation:expectedGenericShadowT30WriteConfirmation(10,core.id),adapter:createPrismaGenericShadowT30Adapter(db,{captureRunId:core.id,now:()=>target})});assert.equal(positive.execution.commitSucceeded,true,positive.execution.error??'');
 const repeat=await executeGenericShadowT30ClosingCapture({season:2026,week:10,captureRunId:core.id,mode:'COMMIT',confirmation:expectedGenericShadowT30WriteConfirmation(10,core.id),adapter:createPrismaGenericShadowT30Adapter(db,{captureRunId:core.id,now:()=>target})});assert.equal(repeat.execution.transactionalNoOp,true);passed.push('real in-window Core closing uses existing selector and remains idempotent');
 await reversible(async tx=>{
  await tx.$executeRaw`UPDATE games SET date=date+interval '5 minutes' WHERE id=${first.game_id}`;
  const result=await executeGenericShadowT30ClosingCapture({season:2026,week:10,captureRunId:core.id,mode:'PREVIEW',confirmation:'',adapter:createPrismaGenericShadowT30Adapter(tx as PrismaClient,{captureRunId:core.id,now:()=>new Date(+target-60_000)})});
  assert.equal(result.report.integrityAudit!.blockers.length,0);assert(result.plan.counts.futureCount>0);assert.equal(result.execution.mutationsInvoked,false);
 });passed.push('current Game kickoff drift is not mistaken for frozen prediction corruption; future PREVIEW stays read-only');
 await reversible(async tx=>{
  await tx.$executeRaw`DELETE FROM shadow_model_closing_market_snapshots WHERE prediction_id=${first.id}`;
  const missed=await executeGenericShadowT30ClosingCapture({season:2026,week:10,captureRunId:core.id,mode:'PREVIEW',confirmation:'',adapter:createPrismaGenericShadowT30Adapter(tx as PrismaClient,{captureRunId:core.id,now:()=>new Date(+kickoff+60_000)})});assert(missed.plan.counts.missedCount>0);assert.equal(missed.plan.rowsToInsert.length,0);
 });passed.push('missed first target after kickoff creates no retrospective close');
 await reversible(async tx=>{
  await tx.$executeRaw`DELETE FROM shadow_model_closing_market_snapshots WHERE prediction_id=${first.id}`;
  await tx.$executeRaw`DELETE FROM market_lines WHERE game_id=${first.game_id}`;
  await tx.marketLine.createMany({data:[{id:'future-only-home',teamId:first.home_team_id,lineValue:-3},{id:'future-only-away',teamId:first.away_team_id,lineValue:3}].map(x=>({...x,gameId:first.game_id,season:2026,week:10,lineType:'spread' as const,closingLine:x.lineValue,bookName:'future-only',source:'oddsapi',timestamp:new Date(+target+60_000)}))});
  const result=await executeGenericShadowT30ClosingCapture({season:2026,week:10,captureRunId:core.id,mode:'PREVIEW',confirmation:'',adapter:createPrismaGenericShadowT30Adapter(tx as PrismaClient,{captureRunId:core.id,now:()=>new Date(+target+120_000)})});
  assert.equal(result.plan.rowsToInsert.find(x=>x.predictionId===first.id)?.status,'UNAVAILABLE');
 });passed.push('later-than-target quote cannot become a target closing observation');
 const outsideRun=JSON.parse(native.runs.find(x=>JSON.parse(x.row_text).id===core.id)!.row_text);
 const outsidePrediction=JSON.parse(native.predictions.find(x=>JSON.parse(x.row_text).capture_run_id===core.id)!.row_text);
 outsideRun.id='outside-fixture';outsideRun.week=5;outsideRun.total_games=1;outsideRun.available_count=1;outsideRun.unavailable_count=0;outsideRun.selection_count=outsidePrediction.selected_side==='NO_SELECTION'?0:1;outsideRun.no_selection_count=outsidePrediction.selected_side==='NO_SELECTION'?1:0;outsideRun.expected_game_ids=['outside-game'];
 outsidePrediction.id='outside-prediction';outsidePrediction.capture_run_id=outsideRun.id;outsidePrediction.week=5;outsidePrediction.game_id='outside-game';outsidePrediction.input_payload={...outsidePrediction.input_payload,week:5,gameId:'outside-game'};outsidePrediction.input_hash=sha256CanonicalJson(outsidePrediction.input_payload);
 const outside={runs:[{row_text:JSON.stringify(outsideRun)}],predictions:[{row_text:JSON.stringify(outsidePrediction)}]};assert.deepEqual(pure(outside,{week:5,ledger:undefined}).blockers,[]);
 outsidePrediction.input_payload.injected=true;outside.predictions[0].row_text=JSON.stringify(outsidePrediction);assert(pure(outside,{week:5,ledger:undefined}).blockers.length);passed.push('other2026weeks receive exact hash checks without an implicit waiver');
 let forbiddenReads=0;const forbidden=await loadIntegrityScope({$queryRaw:async()=>{forbiddenReads++;throw Error('must not read');}} as any,{season:2025,week:5});assert.equal(forbiddenReads,0);assert(forbidden.blockers.includes('integrity_unsupported_season'));passed.push('unsupported season rejected before any payload/outcome query');
 assert.deepEqual((await loadIntegrityScope(db,{season:2026,week:10})).counts,ledger.counts);assert.equal(await db.bet.count(),0);
 const result={fixtureOnly:true,nativeRows:186,passed};console.log(JSON.stringify(result,null,2));if(process.env.CORE_ONLY_RESULT_PATH)fs.writeFileSync(process.env.CORE_ONLY_RESULT_PATH,JSON.stringify(result,null,2));
}
main().finally(()=>db.$disconnect()).catch(e=>{console.error(e);process.exitCode=1;});
