/** Real PostgreSQL + pinned Prisma integration. Explicit loopback fixture URL required. */
import fs from 'fs';
import path from 'path';
import assert from 'assert/strict';
import {randomUUID} from 'crypto';
import {PrismaClient} from '@prisma/client';
import {createPrismaPersistence} from '../capture-shadow-model-predictions-2026';
import {assertStoredShadowHashes} from '../src/shadow-model-exact-json-persistence';
import {executeShadowModelCapture,expectedShadowModelWriteConfirmation,sha256CanonicalJson} from '../../web/lib/shadow-model-capture-v1';

const url=process.env.SHADOW_INTEGRITY_FIXTURE_URL;
if(!url)throw new Error('SHADOW_INTEGRITY_FIXTURE_URL required; never falls back to production environment');
const parsed=new URL(url);
if(!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname) || parsed.pathname!='/gridiron_integrity_fixture')
  throw new Error('Only loopback gridiron_integrity_fixture database is permitted');
const db=new PrismaClient({datasourceUrl:url});
const fixtures=JSON.parse(fs.readFileSync(process.argv[2]??path.join(__dirname,'fixtures/shadow-model-exact-json.json'),'utf8'));
const prefix='integration_'+randomUUID().replace(/-/g,'').slice(0,12);
const passed:string[]=[];
function hydrate(source:any,label:string){
 const plan=structuredClone(source.plan);plan.captureContext=`${prefix}_${label}`;plan.run.captureContext=plan.captureContext;
 plan.run.id=randomUUID();plan.run.captureTimestamp=new Date(plan.run.captureTimestamp);
 for(const row of plan.predictions){row.id=randomUUID();row.captureRunId=plan.run.id;
  for(const key of ['kickoffTimestamp','predictionTimestamp','marketTimestamp'])if(row[key])row[key]=new Date(row[key]);}
 const r=plan.run;
 const model={modelDefinitionId:r.modelDefinitionId,modelDefinitionHash:r.modelDefinitionHash,
  featureDefinitionId:r.featureDefinitionId,featureDefinitionVersion:r.featureDefinitionVersion,
  featureDefinitionHash:r.featureDefinitionHash,policyDefinitionId:r.policyDefinitionId,policyDefinitionHash:r.policyDefinitionHash};
 const persistence=createPrismaPersistence(db,{season:2026,week:10,captureContext:r.captureContext,model:model as any,now:()=>r.captureTimestamp});
 return {plan,model,persistence};
}
async function write(f:any){await f.persistence.runTransaction(async(tx:any)=>{await tx.createRun(f.plan.run);await tx.createPredictions(f.plan.predictions);});}
async function absent(f:any){assert.equal(await db.shadowModelCaptureRun.count({where:{id:f.plan.run.id}}),0);assert.equal(await db.shadowModelPrediction.count({where:{captureRunId:f.plan.run.id}}),0);}
async function executeExisting(f:any){return executeShadowModelCapture({season:2026,week:10,mode:'COMMIT',captureContext:f.plan.captureContext,confirmation:expectedShadowModelWriteConfirmation(10,f.plan.run.modelDefinitionId),repoCommitSha:f.plan.run.repoCommitSha,model:f.model as any,persistence:f.persistence});}
async function main(){
 const positive:ReturnType<typeof hydrate>[]=[];
 for(const fixture of fixtures){
  const f=hydrate(fixture,fixture.model);await write(f);positive.push(f);await assertStoredShadowHashes(db,f.plan.run.id);
  const rows=await db.$queryRawUnsafe<Array<{id:string;payload:string}>>('SELECT id,input_payload::text payload FROM shadow_model_predictions WHERE capture_run_id=$1',f.plan.run.id);
  for(const row of rows){const expected=f.plan.predictions.find((x:any)=>x.id===row.id);assert.equal(sha256CanonicalJson(JSON.parse(row.payload)),expected.inputHash);}
  const again=await executeExisting(f);assert.equal(again.execution.transactionalIdempotentNoOp,true);assert.equal(again.execution.insertedPredictionCount,0);
  passed.push(`${fixture.model}: ${rows.length} exact payloads/all JSON/scalars; valid existing cohort no-op`);
 }
 // Only this isolated database gets a deliberately corrupting trigger. Unique table-level fixture name.
 const trigger=`integrity_fault_${prefix}`;
 await db.$executeRawUnsafe(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
   IF NEW.capture_run_id LIKE 'fault-payload-%' THEN NEW.input_payload=NEW.input_payload||'{"injected":true}'::jsonb; END IF;
   IF NEW.capture_run_id LIKE 'fault-provenance-%' THEN NEW.feature_provenance=NEW.feature_provenance||'{"injected":true}'::jsonb; END IF;
   IF NEW.capture_run_id LIKE 'fault-scalar-%' THEN NEW.model_value=123.456; END IF;
   RETURN NEW; END $$`);
 await db.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON shadow_model_predictions FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
 try{
  for(const kind of ['payload','provenance','scalar']){const f=hydrate(fixtures[0],`bad_${kind}`);f.plan.run.id=`fault-${kind}-${randomUUID()}`;for(const row of f.plan.predictions)row.captureRunId=f.plan.run.id;
   await assert.rejects(()=>write(f),/stored_(input_hash|planned_field|prediction_json)_mismatch/);await absent(f);passed.push(`${kind} corruption rolls back run and every prediction`);}
 }finally{await db.$executeRawUnsafe(`DROP TRIGGER ${trigger} ON shadow_model_predictions`);await db.$executeRawUnsafe(`DROP FUNCTION ${trigger}()`);}
 const manifestTrigger=`manifest_fault_${prefix}`;
 await db.$executeRawUnsafe(`CREATE FUNCTION ${manifestTrigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.feature_definition_manifest=NEW.feature_definition_manifest||'{"injected":true}'::jsonb; RETURN NEW; END $$`);
 await db.$executeRawUnsafe(`CREATE TRIGGER ${manifestTrigger} BEFORE INSERT ON shadow_model_capture_runs FOR EACH ROW EXECUTE FUNCTION ${manifestTrigger}()`);
 try{const f=hydrate(fixtures[0],'bad_manifest');await assert.rejects(()=>write(f),/stored_feature_manifest_hash_mismatch/);await absent(f);passed.push('manifest corruption rolls back complete transaction');}
 finally{await db.$executeRawUnsafe(`DROP TRIGGER ${manifestTrigger} ON shadow_model_capture_runs`);await db.$executeRawUnsafe(`DROP FUNCTION ${manifestTrigger}()`);}
 const badPlan=hydrate(fixtures[0],'bad_plan');badPlan.plan.predictions[0].inputHash='0'.repeat(64);
 await assert.rejects(()=>write(badPlan),/planned_input_hash_mismatch/);await absent(badPlan);passed.push('invalid planned input hash rejected with atomic rollback');
 // Local fixture only: emulate an old malformed COMPLETE cohort without rewriting production evidence.
 const badExisting=hydrate(fixtures[1],'existing_bad');await write(badExisting);
 await db.$executeRaw`UPDATE shadow_model_predictions SET input_payload=input_payload||'{"injected":true}'::jsonb WHERE capture_run_id=${badExisting.plan.run.id}`;
 await assert.rejects(()=>executeExisting(badExisting),/stored_input_hash_mismatch/);passed.push('corrupt existing COMPLETE cohort rejects idempotent no-op');
 const badManifestExisting=hydrate(fixtures[1],'existing_bad_manifest');await write(badManifestExisting);
 await db.$executeRaw`UPDATE shadow_model_capture_runs SET feature_definition_manifest=feature_definition_manifest||'{"injected":true}'::jsonb WHERE id=${badManifestExisting.plan.run.id}`;
 await assert.rejects(()=>executeExisting(badManifestExisting),/stored_feature_manifest_hash_mismatch/);passed.push('corrupt existing manifest rejects idempotent no-op');
 for(const f of positive)await assertStoredShadowHashes(db,f.plan.run.id);
 assert.equal(await db.bet.count(),0);passed.push('positive fixtures remain intact; zero official-card rows');
 const result={fixtureOnly:true,rowsTested:fixtures.reduce((n:number,f:any)=>n+f.plan.predictions.length,0),passed};
 console.log(JSON.stringify(result,null,2));
 if(process.env.SHADOW_INTEGRITY_RESULT_PATH)fs.writeFileSync(process.env.SHADOW_INTEGRITY_RESULT_PATH,JSON.stringify(result,null,2));
}
main().finally(()=>db.$disconnect()).catch(e=>{console.error(e);process.exitCode=1;});
