/** SELECT-only exact evidence guard. Week10 ledger authorizes Core only; it never repairs records. */
import fs from 'fs';
import path from 'path';
import {createHash} from 'crypto';
import {execFileSync} from 'child_process';
import {Prisma} from '@prisma/client';
import {sha256CanonicalJson} from '../../web/lib/shadow-model-capture-v1';
import {GENERIC_SHADOW_T30_SUPPORTED_MODEL_IDS} from '../../web/lib/shadow-model-t30-closing-v1';

export const W10_LEDGER_FILE='research/generic-shadow/GENERIC_SHADOW_W10_INTEGRITY_DISPOSITION_20261103.json';
export const W10_LEDGER_CANONICAL_SHA256='04bcce864cbe085ac1b2054669534efa2639685b0193d8fab37d926cca78be75';
export const W10_LEDGER_FILE_SHA256='008d6ff24e039fd14809e5149a250d9ab9dc500c92b63a221117476ba9ef24ee';
type Db=Pick<Prisma.TransactionClient,'$queryRaw'>;
export type NativeIntegrityRow={row_text:string};
type Count={total:number;available:number;unavailable:number;selections:number;noSelection:number};
type LedgerCohort={id:string;modelDefinitionId:string;captureContext:string;captureSourceSha:string;
 runRowSha256:string;decision:'ELIGIBLE'|'HOLD';counts:Count;expectedInputHashFailures:number;
 expectedManifestHashFailures:string[];predictions:{id:string;gameId:string;rowSha256:string;inputHashFails:boolean}[]};
export type IntegrityLedger={id:string;version:number;season:number;week:number;captureSourceSha:string;
 counts:{originalPredictions:number;eligiblePredictions:number;heldPredictions:number;directInputHashFailures:number};cohorts:LedgerCohort[]};
export interface IntegrityCohortAudit {
 id:string;modelDefinitionId:string;captureContext:string;captureSourceSha:string;status:string;
 disposition:'ELIGIBLE'|'HOLD'|'BLOCKED';counts:Count;inputHashFailureIds:string[];manifestHashFailures:string[];
 predictions:{id:string;gameId:string;predictionStatus:string;unavailableReasons:string[];selectedSide:string|null}[];
}
export interface GenericShadowIntegrityAudit {
 season:number;week:number;runtimeRepoCommitSha:string;ledgerId:string|null;ledgerVersion:number|null;
 ledgerCanonicalSha256:string|null;ledgerFileSha256:string|null;blockers:string[];
 discoveredRunIds:string[];eligibleCaptureRunIds:string[];heldCaptureRunIds:string[];
 counts:{originalPredictions:number;eligiblePredictions:number;heldPredictions:number;directInputHashFailures:number};
 expectedPopulation?: IntegrityLedger['counts']; missingRunIds?: string[];
 expectedCohorts?: {id:string;counts:Count;predictionIds:string[]}[];
 cohorts:IntegrityCohortAudit[];providerCalls:0;mutationsInvoked:false;
}
const digest=(text:string|Buffer)=>createHash('sha256').update(text).digest('hex');
const sorted=(ids:string[])=>[...ids].sort();
const same=(a:unknown,b:unknown)=>sha256CanonicalJson(a)===sha256CanonicalJson(b);
const timestamp=(v:string)=>Date.parse(/[Zz]|[+-]\d\d:\d\d$/.test(v)?v:v+'Z');
export function readTrustedW10Ledger():IntegrityLedger {
 const raw=fs.readFileSync(path.resolve(process.cwd(),W10_LEDGER_FILE));
 if(digest(raw)!==W10_LEDGER_FILE_SHA256)throw new Error('integrity_ledger_file_hash_mismatch');
 const ledger=JSON.parse(raw.toString('utf8'));
 if(sha256CanonicalJson(ledger)!==W10_LEDGER_CANONICAL_SHA256)throw new Error('integrity_ledger_canonical_hash_mismatch');
 return ledger;
}
function runtimeSha(){const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();if(!/^[a-f0-9]{40}$/.test(sha))throw new Error('runtime_sha_invalid');return sha;}

/** Pure review/test seam. Production always supplies the source-pinned ledger above. */
export function evaluateIntegrityRows(input:{season:number;week:number;runs:NativeIntegrityRow[];predictions:NativeIntegrityRow[];
 runtimeRepoCommitSha:string;ledger?:IntegrityLedger;ledgerError?:string}):GenericShadowIntegrityAudit {
 const w10=input.season===2026&&input.week===10;
 const ledger=input.ledger;
 const blockers:string[]=[];
 if(input.season!==2026)blockers.push('integrity_unsupported_season');
 if(input.ledgerError)blockers.push(input.ledgerError);
 if(w10&&(!ledger||sha256CanonicalJson(ledger)!==W10_LEDGER_CANONICAL_SHA256))blockers.push('integrity_ledger_untrusted');
 const audit:GenericShadowIntegrityAudit={season:input.season,week:input.week,runtimeRepoCommitSha:input.runtimeRepoCommitSha,
  ledgerId:w10&&ledger?ledger.id:null,ledgerVersion:w10&&ledger?ledger.version:null,
  ledgerCanonicalSha256:w10?W10_LEDGER_CANONICAL_SHA256:null,ledgerFileSha256:w10?W10_LEDGER_FILE_SHA256:null,
  blockers,discoveredRunIds:[],eligibleCaptureRunIds:[],heldCaptureRunIds:[],
  counts:{originalPredictions:input.predictions.length,eligiblePredictions:0,heldPredictions:0,directInputHashFailures:0},cohorts:[],providerCalls:0,mutationsInvoked:false};
 const runs=input.runs.map(x=>({raw:x.row_text,value:JSON.parse(x.row_text)}));
 const predictions=input.predictions.map(x=>({raw:x.row_text,value:JSON.parse(x.row_text)}));
 audit.discoveredRunIds=sorted(runs.map(x=>x.value.id));
 if(new Set(audit.discoveredRunIds).size!==runs.length)blockers.push('integrity_duplicate_run');
 if(new Set(predictions.map(x=>x.value.id)).size!==predictions.length)blockers.push('integrity_duplicate_prediction');
 if(w10&&ledger&&!same(audit.discoveredRunIds,sorted(ledger.cohorts.map(x=>x.id))))blockers.push('integrity_unexpected_run_population');
 const expectedRunIds=new Set(audit.discoveredRunIds);
 if(predictions.some(x=>!expectedRunIds.has(x.value.capture_run_id)))blockers.push('integrity_orphan_prediction');
 for(const {raw,value:r} of runs){
  const errors:string[]=[];const rule=w10?ledger?.cohorts.find(x=>x.id===r.id):undefined;
  const children=predictions.filter(x=>x.value.capture_run_id===r.id);
  const counts:Count={total:children.length,available:children.filter(x=>x.value.prediction_status==='AVAILABLE').length,
   unavailable:children.filter(x=>x.value.prediction_status==='UNAVAILABLE').length,
   selections:children.filter(x=>x.value.prediction_status==='AVAILABLE'&&['HOME','AWAY','OVER','UNDER'].includes(x.value.selected_side)).length,
   noSelection:children.filter(x=>x.value.prediction_status==='AVAILABLE'&&x.value.selected_side==='NO_SELECTION').length};
  if(r.season!==input.season||r.week!==input.week||r.status!=='COMPLETE'||r.failure_reason!==null||r.evaluation_protocol!=='CORE_EVAL_V1')errors.push('run_identity_or_state');
  if(!(GENERIC_SHADOW_T30_SUPPORTED_MODEL_IDS as readonly string[]).includes(r.model_definition_id))errors.push('unsupported_model');
  if(!/^[a-f0-9]{40}$/.test(r.repo_commit_sha||''))errors.push('capture_source_invalid');
  if(!Array.isArray(r.expected_game_ids)||!same(sorted(r.expected_game_ids||[]),sorted(children.map(x=>x.value.game_id)))||new Set(children.map(x=>x.value.game_id)).size!==children.length)errors.push('game_population');
  const declared={total:r.total_games,available:r.available_count,unavailable:r.unavailable_count,selections:r.selection_count,noSelection:r.no_selection_count};
  if(!same(counts,declared)||counts.available+counts.unavailable!==counts.total||counts.selections+counts.noSelection!==counts.available)errors.push('counts');
  const manifestFailures=['model','feature','policy'].filter(prefix=>sha256CanonicalJson(r[`${prefix}_definition_manifest`])!==r[`${prefix}_definition_hash`]);
  const inputFailures=children.filter(x=>sha256CanonicalJson(x.value.input_payload)!==x.value.input_hash).map(x=>x.value.id);
  for(const {raw:childRaw,value:p} of children){
   if(p.season!==r.season||p.week!==r.week||p.capture_run_id!==r.id||!p.home_team_id||!p.away_team_id||p.market_type!=='SPREAD'||p.prediction_timestamp!==r.capture_timestamp||!(timestamp(p.prediction_timestamp)<timestamp(p.kickoff_timestamp)))errors.push(`prediction_identity:${p.id}`);
   if(p.input_payload.gameId!==p.game_id||p.input_payload.season!==p.season||p.input_payload.week!==p.week||p.input_payload.homeTeamId!==p.home_team_id||p.input_payload.awayTeamId!==p.away_team_id||timestamp(p.input_payload.predictionTimestamp)!==timestamp(p.prediction_timestamp)||timestamp(p.input_payload.kickoffTimestamp)!==timestamp(p.kickoff_timestamp))errors.push(`input_identity:${p.id}`);
   if(p.prediction_status==='UNAVAILABLE'&&(!p.unavailable_reasons?.length||['model_value','edge_value','abs_edge_value','selected_side','selected_team_id','prediction_pick_value'].some(k=>p[k]!==null)))errors.push(`unavailable_outputs:${p.id}`);
   if(rule){const pin=rule.predictions.find(x=>x.id===p.id);if(!pin||pin.gameId!==p.game_id||pin.rowSha256!==digest(childRaw))errors.push(`prediction_bytes:${p.id}`);}
  }
  if(w10){
   if(!rule)errors.push('unknown_ledger_run');
   else{
    if(rule.runRowSha256!==digest(raw)||rule.modelDefinitionId!==r.model_definition_id||rule.captureContext!==r.capture_context||rule.captureSourceSha!==r.repo_commit_sha||r.repo_commit_sha!==ledger!.captureSourceSha)errors.push('run_bytes_or_source');
    if(!same(counts,rule.counts)||!same(sorted(children.map(x=>x.value.id)),sorted(rule.predictions.map(x=>x.id))))errors.push('ledger_population');
    if(!same(sorted(manifestFailures),sorted(rule.expectedManifestHashFailures))||inputFailures.length!==rule.expectedInputHashFailures||!same(sorted(inputFailures),sorted(rule.predictions.filter(x=>x.inputHashFails).map(x=>x.id))))errors.push('unexpected_integrity_failures');
   }
  }else if(manifestFailures.length||inputFailures.length)errors.push('persisted_hash_mismatch');
  const disposition=errors.length?'BLOCKED':rule?.decision==='HOLD'?'HOLD':'ELIGIBLE';
  if(disposition==='ELIGIBLE'&&(manifestFailures.length||inputFailures.length))errors.push('eligible_hash_mismatch');
  const row:IntegrityCohortAudit={id:r.id,modelDefinitionId:r.model_definition_id,captureContext:r.capture_context,captureSourceSha:r.repo_commit_sha,status:r.status,
   disposition:errors.length?'BLOCKED':disposition,counts,inputHashFailureIds:sorted(inputFailures),manifestHashFailures:manifestFailures,
   predictions:children.map(x=>({id:x.value.id,gameId:x.value.game_id,predictionStatus:x.value.prediction_status,unavailableReasons:x.value.unavailable_reasons,selectedSide:x.value.selected_side}))};
  audit.cohorts.push(row);audit.counts.directInputHashFailures+=inputFailures.length;
  if(rule?.decision==='HOLD'){audit.heldCaptureRunIds.push(r.id);audit.counts.heldPredictions+=children.length;}
  if(row.disposition==='ELIGIBLE'){audit.eligibleCaptureRunIds.push(r.id);audit.counts.eligiblePredictions+=children.length;}
  blockers.push(...errors.map(x=>`integrity:${r.id}:${x}`));
 }
 if(w10&&ledger){audit.expectedPopulation=ledger.counts;audit.expectedCohorts=ledger.cohorts.map(x=>({id:x.id,counts:x.counts,predictionIds:x.predictions.map(p=>p.id)}));audit.missingRunIds=ledger.cohorts.filter(x=>!expectedRunIds.has(x.id)).map(x=>x.id);}
 if(w10&&ledger&&!same(audit.counts,ledger.counts))blockers.push('integrity_ledger_coverage_mismatch');
 if(blockers.length){audit.eligibleCaptureRunIds=[];audit.counts.eligiblePredictions=0;}
 audit.blockers=[...new Set(blockers)].sort();audit.eligibleCaptureRunIds.sort();audit.heldCaptureRunIds.sort();return audit;
}

export async function loadIntegrityScope(db:Db,args:{season:number;week:number}):Promise<GenericShadowIntegrityAudit>{
 if(args.season!==2026)return evaluateIntegrityRows({...args,runs:[],predictions:[],runtimeRepoCommitSha:runtimeSha(),ledgerError:'integrity_unsupported_season'});
 let runs:NativeIntegrityRow[]=[];let predictions:NativeIntegrityRow[]=[];let error:string|undefined;let ledger:IntegrityLedger|undefined;
 try{if(args.season===2026&&args.week===10)ledger=readTrustedW10Ledger();}catch(e){error=e instanceof Error?e.message:String(e);}
 try{
  runs=await db.$queryRaw<NativeIntegrityRow[]>`SELECT to_jsonb(r)::text AS row_text FROM shadow_model_capture_runs r WHERE season=${args.season} AND week=${args.week} ORDER BY id`;
  predictions=await db.$queryRaw<NativeIntegrityRow[]>`SELECT to_jsonb(p)::text AS row_text FROM shadow_model_predictions p WHERE season=${args.season} AND week=${args.week} ORDER BY capture_run_id,game_id,id`;
  return evaluateIntegrityRows({...args,runs,predictions,ledger,ledgerError:error,runtimeRepoCommitSha:runtimeSha()});
 }catch(e){return {season:args.season,week:args.week,runtimeRepoCommitSha:'UNAVAILABLE',ledgerId:ledger?.id??null,ledgerVersion:ledger?.version??null,ledgerCanonicalSha256:null,ledgerFileSha256:null,
  expectedPopulation:ledger?.counts,expectedCohorts:ledger?.cohorts.map(x=>({id:x.id,counts:x.counts,predictionIds:x.predictions.map(p=>p.id)})),discoveredRunIds:runs.map(x=>JSON.parse(x.row_text).id),eligibleCaptureRunIds:[],heldCaptureRunIds:[],counts:{originalPredictions:predictions.length,eligiblePredictions:0,heldPredictions:0,directInputHashFailures:0},cohorts:[],
  blockers:[`integrity_read_failed:${e instanceof Error?e.message:String(e)}`],providerCalls:0,mutationsInvoked:false};}
}
export async function auditIntegrityForRun(db:Db,id:string){
 const rows=await db.$queryRaw<NativeIntegrityRow[]>`SELECT jsonb_build_object('season',r.season,'week',r.week)::text AS row_text FROM shadow_model_capture_runs r WHERE id=${id}`;
 if(!rows.length){
  const ledger=readTrustedW10Ledger();
  if(ledger.cohorts.some(x=>x.id===id)){const audit=await loadIntegrityScope(db,{season:ledger.season,week:ledger.week});audit.blockers.push(`capture_run_not_found:${id}`);return audit;}
  throw new Error(`capture_run_not_found:${id}`);
 }
 const run=JSON.parse(rows[0].row_text);return loadIntegrityScope(db,{season:run.season,week:run.week});
}
export class IntegrityBlockedError extends Error{constructor(public audit:GenericShadowIntegrityAudit,public captureRunId:string){super(audit.blockers.length?audit.blockers.join('; '):`cohort_integrity_HOLD:${captureRunId}`);}}
export async function requireRunEligibility(db:Db,id:string){const audit=await auditIntegrityForRun(db,id);if(audit.blockers.length||!audit.eligibleCaptureRunIds.includes(id))throw new IntegrityBlockedError(audit,id);return audit;}
export function attachIntegrityAudit<T extends object>(report:T,audit?:GenericShadowIntegrityAudit):T&{integrityAudit?:GenericShadowIntegrityAudit}{return audit?{...report,integrityAudit:audit}:report;}
