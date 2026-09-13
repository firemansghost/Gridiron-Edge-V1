-- Shadow Model Capture V1 — additive multi-model prospective evidence storage.
-- Distinct from Hybrid Shadow Snapshot V1 tables. No DML. No operational ALTERs.

-- CreateEnum
CREATE TYPE "ShadowModelMarketType" AS ENUM ('SPREAD', 'TOTAL');

-- CreateTable
CREATE TABLE "shadow_model_capture_runs" (
    "id" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "capture_context" TEXT NOT NULL,
    "evaluation_protocol" TEXT NOT NULL,
    "model_family" TEXT NOT NULL,
    "model_definition_id" TEXT NOT NULL,
    "model_definition_hash" TEXT NOT NULL,
    "model_definition_manifest" JSONB NOT NULL,
    "feature_definition_id" TEXT NOT NULL,
    "feature_definition_version" TEXT NOT NULL,
    "feature_definition_hash" TEXT NOT NULL,
    "feature_definition_manifest" JSONB NOT NULL,
    "policy_definition_id" TEXT NOT NULL,
    "policy_definition_hash" TEXT NOT NULL,
    "policy_definition_manifest" JSONB NOT NULL,
    "repo_commit_sha" TEXT NOT NULL,
    "capture_timestamp" TIMESTAMP(3) NOT NULL,
    "expected_game_ids" JSONB NOT NULL,
    "total_games" INTEGER NOT NULL,
    "available_count" INTEGER NOT NULL,
    "unavailable_count" INTEGER NOT NULL,
    "selection_count" INTEGER NOT NULL,
    "no_selection_count" INTEGER NOT NULL,
    "status" "ShadowCaptureStatus" NOT NULL,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shadow_model_capture_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shadow_model_predictions" (
    "id" TEXT NOT NULL,
    "capture_run_id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "home_team_id" TEXT NOT NULL,
    "away_team_id" TEXT NOT NULL,
    "kickoff_timestamp" TIMESTAMP(3) NOT NULL,
    "neutral_site" BOOLEAN NOT NULL,
    "prediction_timestamp" TIMESTAMP(3) NOT NULL,
    "prediction_status" "ShadowAvailabilityStatus" NOT NULL,
    "unavailable_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "input_payload" JSONB NOT NULL,
    "input_hash" TEXT NOT NULL,
    "feature_provenance" JSONB NOT NULL,
    "model_output" JSONB NOT NULL,
    "market_type" "ShadowModelMarketType" NOT NULL,
    "selected_market_line_id" TEXT,
    "selected_market_team_id" TEXT,
    "selected_market_line_value" DOUBLE PRECISION,
    "canonical_market_value" DOUBLE PRECISION,
    "market_book" TEXT,
    "market_source" TEXT,
    "market_timestamp" TIMESTAMP(3),
    "market_age_seconds" INTEGER,
    "model_value" DOUBLE PRECISION,
    "edge_value" DOUBLE PRECISION,
    "abs_edge_value" DOUBLE PRECISION,
    "selected_side" "ShadowSelectionSide",
    "selected_team_id" TEXT,
    "prediction_pick_value" DOUBLE PRECISION,

    CONSTRAINT "shadow_model_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shadow_model_capture_runs_season_week_idx" ON "shadow_model_capture_runs"("season", "week");

-- CreateIndex
CREATE INDEX "shadow_model_capture_runs_capture_timestamp_idx" ON "shadow_model_capture_runs"("capture_timestamp");

-- CreateIndex
CREATE INDEX "shadow_model_capture_runs_model_definition_id_idx" ON "shadow_model_capture_runs"("model_definition_id");

-- CreateIndex
CREATE INDEX "shadow_model_capture_runs_model_definition_hash_idx" ON "shadow_model_capture_runs"("model_definition_hash");

-- CreateIndex
CREATE INDEX "shadow_model_capture_runs_feature_definition_hash_idx" ON "shadow_model_capture_runs"("feature_definition_hash");

-- CreateIndex
CREATE INDEX "shadow_model_capture_runs_policy_definition_hash_idx" ON "shadow_model_capture_runs"("policy_definition_hash");

-- CreateIndex
CREATE INDEX "shadow_model_capture_runs_capture_context_idx" ON "shadow_model_capture_runs"("capture_context");

-- CreateIndex
CREATE INDEX "shadow_model_capture_runs_status_idx" ON "shadow_model_capture_runs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "shadow_model_capture_runs_cohort_key" ON "shadow_model_capture_runs"("season", "week", "capture_context", "evaluation_protocol", "model_definition_hash", "feature_definition_hash", "policy_definition_hash");

-- CreateIndex
CREATE INDEX "shadow_model_predictions_capture_run_id_idx" ON "shadow_model_predictions"("capture_run_id");

-- CreateIndex
CREATE INDEX "shadow_model_predictions_season_week_idx" ON "shadow_model_predictions"("season", "week");

-- CreateIndex
CREATE INDEX "shadow_model_predictions_game_id_idx" ON "shadow_model_predictions"("game_id");

-- CreateIndex
CREATE INDEX "shadow_model_predictions_prediction_timestamp_idx" ON "shadow_model_predictions"("prediction_timestamp");

-- CreateIndex
CREATE INDEX "shadow_model_predictions_prediction_status_idx" ON "shadow_model_predictions"("prediction_status");

-- CreateIndex
CREATE INDEX "shadow_model_predictions_market_type_idx" ON "shadow_model_predictions"("market_type");

-- CreateIndex
CREATE UNIQUE INDEX "shadow_model_predictions_run_game_key" ON "shadow_model_predictions"("capture_run_id", "game_id");

-- AddForeignKey
ALTER TABLE "shadow_model_predictions" ADD CONSTRAINT "shadow_model_predictions_capture_run_id_fkey" FOREIGN KEY ("capture_run_id") REFERENCES "shadow_model_capture_runs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Append-only enforcement: reject UPDATE and DELETE on both evidence tables.
CREATE FUNCTION shadow_model_capture_v1_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Shadow Model Capture V1 table % is append-only; UPDATE and DELETE are not allowed', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER shadow_model_capture_v1_append_only
  BEFORE UPDATE OR DELETE ON "shadow_model_capture_runs"
  FOR EACH ROW
  EXECUTE PROCEDURE shadow_model_capture_v1_reject_mutation();

CREATE TRIGGER shadow_model_capture_v1_append_only
  BEFORE UPDATE OR DELETE ON "shadow_model_predictions"
  FOR EACH ROW
  EXECUTE PROCEDURE shadow_model_capture_v1_reject_mutation();
