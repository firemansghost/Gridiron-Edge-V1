import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const CONTRACT = path.join(
  ROOT,
  'research/generic-shadow/GENERIC_SHADOW_T30_CLOSING_V1_CONTRACT.md'
);
const SCHEMA = path.join(ROOT, 'prisma/schema.prisma');
const MIGRATION = path.join(
  ROOT,
  'prisma/migrations/20260916200000_add_shadow_model_t30_closing_v1/migration.sql'
);

const FROZEN_CLOSING_DEFINITION_ID = 'generic_shadow_t30_closing_v1';
const FROZEN_CLOSING_DEFINITION_HASH =
  '1a2b01a893e0d8811d5ffe0c78af2f8a15dc9d4eb165b19ef5f14a9e1e8be898';

function modelBlock(schema: string, name: string): string {
  const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
  if (!match) throw new Error(`missing model ${name}`);
  return match[0];
}

function stripCommentsAndStrings(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\$\$[\s\S]*?\$\$/g, '$$');
}

describe('Generic Shadow T-30 Closing V1 — Slice A storage contract', () => {
  const contract = fs.readFileSync(CONTRACT, 'utf8');
  const schema = fs.readFileSync(SCHEMA, 'utf8');
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  const sqlBare = stripCommentsAndStrings(sql);
  const closingModel = modelBlock(schema, 'ShadowModelClosingMarketSnapshot');
  const predictionModel = modelBlock(schema, 'ShadowModelPrediction');

  it('frozen contract identity remains generic_shadow_t30_closing_v1 with exact hash', () => {
    expect(contract).toContain(FROZEN_CLOSING_DEFINITION_ID);
    expect(contract).toContain(FROZEN_CLOSING_DEFINITION_HASH);
  });

  it('Prisma model maps to the Generic closing table with no @updatedAt', () => {
    expect(closingModel).toContain('@@map("shadow_model_closing_market_snapshots")');
    expect(closingModel).not.toContain('@updatedAt');
    expect(closingModel).toContain('predictionId');
    expect(closingModel).toMatch(
      /@unique\(map: "shadow_model_closing_market_snapshots_prediction_id_key"\)/
    );
    expect(closingModel).toContain('prediction ShadowModelPrediction');
    expect(closingModel).toMatch(/references:\s*\[id\]/);
    expect(closingModel).toContain('onDelete: Restrict');
    expect(closingModel).toContain('onUpdate: Restrict');
    expect(closingModel).toContain(
      '@@index([gameId], map: "shadow_model_closing_market_snapshots_game_id_idx")'
    );
    expect(closingModel).toContain(
      '@@index([targetTimestamp], map: "shadow_model_closing_market_snapshots_target_timestamp_idx")'
    );
    expect(closingModel).toContain(
      '@@index([status], map: "shadow_model_closing_market_snapshots_status_idx")'
    );
    expect(closingModel).toContain(
      '@@index([closingDefinitionHash], map: "shadow_model_closing_market_snapshots_closing_def_hash_idx")'
    );
    expect(closingModel).toMatch(/marketType\s+ShadowModelMarketType/);
    expect(closingModel).toMatch(/status\s+ShadowAvailabilityStatus/);
    for (const field of [
      'id',
      'predictionId',
      'gameId',
      'evaluationProtocol',
      'closingDefinitionId',
      'closingDefinitionHash',
      'marketType',
      'predictionKickoffTimestamp',
      'closingKickoffTimestamp',
      'targetTimestamp',
      'status',
      'unavailableReason',
      'selectedHomeMarketLineId',
      'selectedAwayMarketLineId',
      'selectedHomeLineValue',
      'selectedAwayLineValue',
      'selectedDisplayTeamId',
      'selectedDisplayLineValue',
      'canonicalMarketHma',
      'book',
      'source',
      'marketObservationTimestamp',
      'marketAgeToTargetSeconds',
      'capturedAt',
      'createdAt',
    ]) {
      expect(closingModel).toContain(field);
    }
  });

  it('ShadowModelPrediction has optional inverse relation and no new persisted column', () => {
    expect(predictionModel).toContain(
      'closingMarketSnapshot ShadowModelClosingMarketSnapshot?'
    );
    expect(predictionModel).not.toContain('@map("closing_market_snapshot")');
    expect(predictionModel).not.toContain('closingMarketSnapshotId');
  });

  it('new model has no operational Prisma relations', () => {
    expect(closingModel).not.toMatch(/\bGame(\?|\[\])?\s+@relation/);
    expect(closingModel).not.toMatch(/\bTeam(\?|\[\])?\s+@relation/);
    expect(closingModel).not.toMatch(/\bMarketLine(\?|\[\])?\s+@relation/);
    expect(closingModel).not.toMatch(/\bBet(\?|\[\])?\s+@relation/);
    expect(closingModel).not.toContain('MatchupOutput');
    expect(closingModel).not.toContain('ShadowClosingMarketSnapshot');
    expect(closingModel).not.toContain('ShadowEvaluationResult');
    expect(closingModel).toContain(
      'prediction ShadowModelPrediction @relation(fields: [predictionId], references: [id], onDelete: Restrict, onUpdate: Restrict)'
    );
  });

  it('migration creates the Generic table, unique prediction_id, indexes, and RESTRICT FK', () => {
    expect(sql).toContain('CREATE TABLE "shadow_model_closing_market_snapshots"');
    expect(sql).toContain('"id" TEXT NOT NULL');
    expect(sql).toContain('"prediction_id" TEXT NOT NULL');
    expect(sql).toContain('"game_id" TEXT NOT NULL');
    expect(sql).toContain('"evaluation_protocol" TEXT NOT NULL');
    expect(sql).toContain('"closing_definition_id" TEXT NOT NULL');
    expect(sql).toContain('"closing_definition_hash" TEXT NOT NULL');
    expect(sql).toContain('"market_type" "ShadowModelMarketType" NOT NULL');
    expect(sql).toContain('"prediction_kickoff_timestamp" TIMESTAMP(3) NOT NULL');
    expect(sql).toContain('"closing_kickoff_timestamp" TIMESTAMP(3) NOT NULL');
    expect(sql).toContain('"target_timestamp" TIMESTAMP(3) NOT NULL');
    expect(sql).toContain('"status" "ShadowAvailabilityStatus" NOT NULL');
    expect(sql).toContain('"unavailable_reason" TEXT');
    expect(sql).toContain('"selected_home_market_line_id" TEXT');
    expect(sql).toContain('"selected_away_market_line_id" TEXT');
    expect(sql).toContain('"selected_home_line_value" DOUBLE PRECISION');
    expect(sql).toContain('"selected_away_line_value" DOUBLE PRECISION');
    expect(sql).toContain('"selected_display_team_id" TEXT');
    expect(sql).toContain('"selected_display_line_value" DOUBLE PRECISION');
    expect(sql).toContain('"canonical_market_hma" DOUBLE PRECISION');
    expect(sql).toContain('"book" TEXT');
    expect(sql).toContain('"source" TEXT');
    expect(sql).toContain('"market_observation_timestamp" TIMESTAMP(3)');
    expect(sql).toContain('"market_age_to_target_seconds" INTEGER');
    expect(sql).toContain('"captured_at" TIMESTAMP(3) NOT NULL');
    expect(sql).toContain('"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP');
    expect(sql).toContain('CONSTRAINT "shadow_model_closing_market_snapshots_pkey" PRIMARY KEY ("id")');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "shadow_model_closing_market_snapshots_prediction_id_key"'
    );
    expect(sql).toContain('CREATE INDEX "shadow_model_closing_market_snapshots_game_id_idx"');
    expect(sql).toContain(
      'CREATE INDEX "shadow_model_closing_market_snapshots_target_timestamp_idx"'
    );
    expect(sql).toContain('CREATE INDEX "shadow_model_closing_market_snapshots_status_idx"');
    expect(sql).toContain(
      'CREATE INDEX "shadow_model_closing_market_snapshots_closing_def_hash_idx"'
    );
    expect(sql).toContain(
      'CONSTRAINT "shadow_model_closing_market_snapshots_prediction_id_fkey"'
    );
    expect(sql).toContain('REFERENCES "shadow_model_predictions"("id")');
    expect(sql).toContain('ON DELETE RESTRICT');
    expect(sql).toContain('ON UPDATE RESTRICT');
  });

  it('migration uses a dedicated append-only function and trigger', () => {
    expect(sql).toContain('shadow_model_t30_closing_v1_reject_mutation');
    expect(sql).toContain(
      'BEFORE UPDATE OR DELETE ON "shadow_model_closing_market_snapshots"'
    );
    expect(sql).toContain('shadow_model_t30_closing_v1_append_only');
    expect(sql).not.toContain('shadow_model_capture_v1_reject_mutation');
    expect(sql).not.toContain('shadow_model_feature_snapshot_v1_reject_mutation');
  });

  it('migration is additive: no DML and no operational-table ALTER', () => {
    expect(sqlBare).not.toMatch(/INSERT\s+INTO/i);
    expect(sqlBare).not.toMatch(/DELETE\s+FROM/i);
    expect(sqlBare).not.toMatch(/TRUNCATE/i);
    expect(sqlBare).not.toMatch(/UPDATE\s+"/);
    expect(sqlBare).not.toMatch(/DROP\s+TABLE/i);
    expect(sqlBare).not.toMatch(/DROP\s+COLUMN/i);
    expect(sql).not.toContain('ALTER TABLE "shadow_model_predictions"');
    expect(sql).not.toContain('ALTER TABLE "shadow_model_capture_runs"');
    expect(sql).not.toContain('ALTER TABLE "shadow_closing_market_snapshots"');
    expect(sql).not.toContain('ALTER TABLE "shadow_prediction_snapshots"');
    expect(sql).not.toContain('ALTER TABLE "Bet"');
    expect(sql).not.toContain('ALTER TABLE "MatchupOutput"');
    expect(sql).not.toContain('ALTER TABLE "Game"');
    expect(sql).not.toContain('ALTER TABLE "MarketLine"');
    const alterTables = [...sql.matchAll(/ALTER TABLE "([^"]+)"/g)].map((m) => m[1]);
    expect(alterTables).toEqual(['shadow_model_closing_market_snapshots']);
  });

  it('migration does not create a new enum', () => {
    expect(sql).not.toMatch(/CREATE TYPE "ShadowModel/);
    expect(sql).not.toMatch(/CREATE TYPE "/);
  });

  it('Hybrid closing storage remains untouched', () => {
    expect(sql).not.toContain('CREATE TABLE "shadow_closing_market_snapshots"');
    expect(sql).not.toContain('ALTER TABLE "shadow_closing_market_snapshots"');
    expect(sql).not.toMatch(
      /CREATE TRIGGER[\s\S]*ON "shadow_closing_market_snapshots"/
    );
  });
});
