/** Exact JSON transport for Prisma 6.17: bind JSON as TEXT, never numeric Json arguments. */
import { Prisma } from '@prisma/client';
import {
  canonicalJsonString, sha256CanonicalJson,
  type PlannedShadowModelCaptureRun, type PlannedShadowModelPrediction,
} from '../../web/lib/shadow-model-capture-v1';

type Db = Pick<Prisma.TransactionClient, '$executeRaw' | '$queryRaw'>;
const RUN_KEYS = ['id','season','week','captureContext','evaluationProtocol','modelFamily',
  'modelDefinitionId','modelDefinitionHash','modelDefinitionManifest','featureDefinitionId',
  'featureDefinitionVersion','featureDefinitionHash','featureDefinitionManifest','policyDefinitionId',
  'policyDefinitionHash','policyDefinitionManifest','repoCommitSha','captureTimestamp','expectedGameIds',
  'totalGames','availableCount','unavailableCount','selectionCount','noSelectionCount','status','failureReason'] as const;
const PREDICTION_KEYS = ['id','captureRunId','gameId','season','week','homeTeamId','awayTeamId',
  'kickoffTimestamp','neutralSite','predictionTimestamp','predictionStatus','unavailableReasons',
  'inputPayload','inputHash','featureProvenance','modelOutput','marketType','selectedMarketLineId',
  'selectedMarketTeamId','selectedMarketLineValue','canonicalMarketValue','marketBook','marketSource',
  'marketTimestamp','marketAgeSeconds','marketProvenance','modelValue','edgeValue','absEdgeValue',
  'selectedSide','selectedTeamId','predictionPickValue'] as const;
const RUN_JSON = ['modelDefinitionManifest','featureDefinitionManifest','policyDefinitionManifest','expectedGameIds'] as const;
const PREDICTION_JSON = ['inputPayload','featureProvenance','modelOutput','marketProvenance'] as const;
const snake = (key: string) => key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
// Identifiers come exclusively from the closed constants above, never operator/model data.
const column = (key: string) => Prisma.raw(`"${snake(key)}"`);

async function insertRows(db: Db, table: 'shadow_model_capture_runs' | 'shadow_model_predictions',
  rows: object[], keys: readonly string[]): Promise<number> {
  if (!rows.length) return 0;
  const body = JSON.stringify(rows.map(row => Object.fromEntries(keys.map(key =>
    [snake(key), (row as Record<string, unknown>)[key]]))));
  const columns = Prisma.join(keys.map(column));
  const tableSql = Prisma.raw(table);
  return db.$executeRaw(Prisma.sql`INSERT INTO ${tableSql} (${columns})
    SELECT ${columns} FROM jsonb_populate_recordset(NULL::${tableSql}, ${body}::text::jsonb)`);
}

export async function insertExactShadowRun(db: Db, run: PlannedShadowModelCaptureRun): Promise<void> {
  for (const prefix of ['model','feature','policy'] as const) {
    if (sha256CanonicalJson(run[`${prefix}DefinitionManifest`]) !== run[`${prefix}DefinitionHash`])
      throw new Error(`planned_${prefix}_manifest_hash_mismatch`);
  }
  const count = await insertRows(db, 'shadow_model_capture_runs', [run], RUN_KEYS);
  if (count !== 1) throw new Error('exact_run_insert_count_mismatch');
}

export async function insertExactShadowPredictions(db: Db, rows: PlannedShadowModelPrediction[]): Promise<number> {
  for (const row of rows) if (sha256CanonicalJson(row.inputPayload) !== row.inputHash)
    throw new Error(`planned_input_hash_mismatch:${row.id}`);
  return insertRows(db, 'shadow_model_predictions', rows, PREDICTION_KEYS);
}

function jsonTextColumns(keys: readonly string[]) {
  return Prisma.join(keys.map(key => Prisma.sql`${column(key)}::text AS ${Prisma.raw(`"${key}"`)}`));
}
type TextRow = Record<string, string>;
async function storedEvidence(db: Db, runId: string) {
  const runs = await db.$queryRaw<TextRow[]>(Prisma.sql`SELECT id, row_to_json(r)::text AS whole,
    model_definition_hash AS "modelDefinitionHash", feature_definition_hash AS "featureDefinitionHash",
    policy_definition_hash AS "policyDefinitionHash", ${jsonTextColumns(RUN_JSON)}
    FROM shadow_model_capture_runs r WHERE id=${runId}`);
  const predictions = await db.$queryRaw<TextRow[]>(Prisma.sql`SELECT id, row_to_json(p)::text AS whole,
    input_hash AS "inputHash", ${jsonTextColumns(PREDICTION_JSON)}
    FROM shadow_model_predictions p WHERE capture_run_id=${runId}`);
  return {run:runs[0], predictions};
}

/** Used before an existing cohort can be called an accepted idempotent no-op. SELECTs only. */
export async function assertStoredShadowHashes(db: Db, runId: string): Promise<void> {
  const stored = await storedEvidence(db, runId);
  if (!stored.run) throw new Error('stored_run_missing');
  for (const prefix of ['model','feature','policy'] as const) {
    if (sha256CanonicalJson(JSON.parse(stored.run[`${prefix}DefinitionManifest`])) !== stored.run[`${prefix}DefinitionHash`])
      throw new Error(`stored_${prefix}_manifest_hash_mismatch:${runId}`);
  }
  for (const row of stored.predictions) if (sha256CanonicalJson(JSON.parse(row.inputPayload)) !== row.inputHash)
    throw new Error(`stored_input_hash_mismatch:${row.id}`);
}

/** Must run on the same transaction connection as the INSERTs, before transaction resolution. */
export async function verifyExactShadowWrite(db: Db, run: PlannedShadowModelCaptureRun,
  predictions: PlannedShadowModelPrediction[]): Promise<void> {
  await assertStoredShadowHashes(db, run.id);
  const stored = await storedEvidence(db, run.id);
  assertPlannedFields(JSON.parse(stored.run.whole), run, RUN_KEYS);
  for (const key of RUN_JSON) {
    if (canonicalJsonString(JSON.parse(stored.run[key])) !== canonicalJsonString(run[key]))
      throw new Error(`stored_run_json_mismatch:${key}`);
  }
  if (stored.predictions.length !== predictions.length) throw new Error('stored_prediction_count_mismatch');
  const byId = new Map(stored.predictions.map(row => [row.id,row]));
  for (const planned of predictions) {
    const row = byId.get(planned.id);
    if (!row) throw new Error(`stored_prediction_missing:${planned.id}`);
    assertPlannedFields(JSON.parse(row.whole), planned, PREDICTION_KEYS);
    for (const key of PREDICTION_JSON) {
      if (canonicalJsonString(JSON.parse(row[key])) !== canonicalJsonString(planned[key]))
        throw new Error(`stored_prediction_json_mismatch:${planned.id}:${key}`);
    }
  }
}

function assertPlannedFields(stored: Record<string, unknown>, planned: object, keys: readonly string[]) {
  for (const key of keys) {
    const expected = (planned as Record<string, unknown>)[key];
    let actual = stored[snake(key)];
    // Prisma DateTime is timestamp without time zone; stored values are UTC by contract.
    if (expected instanceof Date && typeof actual === 'string')
      actual = new Date(/[Zz]|[+-]\d\d:\d\d$/.test(actual) ? actual : actual + 'Z').toISOString();
    const value = expected instanceof Date ? expected.toISOString() : expected;
    if (canonicalJsonString(actual) !== canonicalJsonString(value))
      throw new Error(`stored_planned_field_mismatch:${key}`);
  }
}
