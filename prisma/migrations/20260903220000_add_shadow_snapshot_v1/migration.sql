-- Phase 4B: Shadow Snapshot V1 empty append-only storage.
-- Additive only: new enums, four evidence tables, internal FKs, indexes, triggers.
-- No operational-table ALTERs, no DML, no _prisma_migrations repair.

-- CreateEnum
CREATE TYPE "ShadowCaptureStatus" AS ENUM ('COMPLETE', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ShadowAvailabilityStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "ShadowSelectionSide" AS ENUM ('HOME', 'AWAY', 'NO_SELECTION');

-- CreateEnum
CREATE TYPE "ShadowTeamSide" AS ENUM ('HOME', 'AWAY');

-- CreateEnum
CREATE TYPE "ShadowV4ComparisonStatus" AS ENUM ('SIDE_AVAILABLE', 'VERIFIED_NO_SELECTION', 'PROVENANCE_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "ShadowQualificationStatus" AS ENUM ('QUALIFIED', 'NOT_QUALIFIED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "ShadowAtsResult" AS ENUM ('WIN', 'LOSS', 'PUSH', 'NOT_APPLICABLE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "ShadowMarketType" AS ENUM ('SPREAD');

-- CreateTable
CREATE TABLE "shadow_capture_runs" (
    "id" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "evaluation_protocol" TEXT NOT NULL,
    "capture_context" TEXT NOT NULL,
    "model_family" TEXT NOT NULL,
    "model_definition_id" TEXT NOT NULL,
    "model_definition_hash" TEXT NOT NULL,
    "model_definition_manifest" JSONB NOT NULL,
    "policy_definition_id" TEXT NOT NULL,
    "policy_definition_hash" TEXT NOT NULL,
    "policy_definition_manifest" JSONB NOT NULL,
    "repo_commit_sha" TEXT NOT NULL,
    "capture_timestamp" TIMESTAMP(3) NOT NULL,
    "expected_game_ids" JSONB NOT NULL,
    "total_games" INTEGER NOT NULL,
    "hybrid_available_count" INTEGER NOT NULL,
    "hybrid_unavailable_count" INTEGER NOT NULL,
    "qualification_qualified_count" INTEGER NOT NULL,
    "qualification_not_qualified_count" INTEGER NOT NULL,
    "qualification_unavailable_count" INTEGER NOT NULL,
    "v4_side_available_count" INTEGER NOT NULL,
    "v4_verified_no_selection_count" INTEGER NOT NULL,
    "v4_provenance_unavailable_count" INTEGER NOT NULL,
    "status" "ShadowCaptureStatus" NOT NULL,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shadow_capture_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shadow_prediction_snapshots" (
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
    "home_v1_rating" DOUBLE PRECISION,
    "away_v1_rating" DOUBLE PRECISION,
    "rating_provenance" JSONB,
    "home_unit_grades" JSONB,
    "away_unit_grades" JSONB,
    "unit_grade_provenance" JSONB,
    "weather_state" JSONB,
    "input_payload" JSONB NOT NULL,
    "input_hash" TEXT NOT NULL,
    "core_v1_hma" DOUBLE PRECISION,
    "v2_hma" DOUBLE PRECISION,
    "hybrid_hma" DOUBLE PRECISION,
    "prediction_market_hma" DOUBLE PRECISION,
    "spread_edge_hma" DOUBLE PRECISION,
    "abs_spread_edge" DOUBLE PRECISION,
    "selected_side" "ShadowSelectionSide",
    "selected_team_id" TEXT,
    "prediction_pick_line" DOUBLE PRECISION,
    "selected_market_line_id" TEXT,
    "selected_market_team_id" TEXT,
    "selected_market_line_value" DOUBLE PRECISION,
    "market_book" TEXT,
    "market_source" TEXT,
    "market_timestamp" TIMESTAMP(3),
    "market_age_seconds" INTEGER,
    "market_favorite_team_id" TEXT,
    "v4_comparison_status" "ShadowV4ComparisonStatus",
    "v4_comparison_side" "ShadowTeamSide",
    "v4_provenance" JSONB,
    "hybrid_conflict_type" TEXT,
    "tier_bucket" TEXT,
    "qualification_status" "ShadowQualificationStatus",
    "qualification_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_super_tier_a" BOOLEAN,

    CONSTRAINT "shadow_prediction_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shadow_closing_market_snapshots" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "evaluation_protocol" TEXT NOT NULL,
    "policy_definition_id" TEXT NOT NULL,
    "policy_definition_hash" TEXT NOT NULL,
    "market_type" "ShadowMarketType" NOT NULL,
    "target_timestamp" TIMESTAMP(3) NOT NULL,
    "status" "ShadowAvailabilityStatus" NOT NULL,
    "unavailable_reason" TEXT,
    "selected_market_line_id" TEXT,
    "selected_market_team_id" TEXT,
    "selected_market_line_value" DOUBLE PRECISION,
    "canonical_market_hma" DOUBLE PRECISION,
    "book" TEXT,
    "source" TEXT,
    "market_observation_timestamp" TIMESTAMP(3),
    "captured_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shadow_closing_market_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shadow_evaluation_results" (
    "id" TEXT NOT NULL,
    "prediction_snapshot_id" TEXT NOT NULL,
    "closing_market_snapshot_id" TEXT,
    "revision" INTEGER NOT NULL,
    "final_home_score" INTEGER,
    "final_away_score" INTEGER,
    "ats_result" "ShadowAtsResult" NOT NULL,
    "side_margin" DOUBLE PRECISION,
    "cover_margin" DOUBLE PRECISION,
    "clv_points" DOUBLE PRECISION,
    "shadow_stake" DECIMAL(65,30),
    "shadow_pnl" DECIMAL(65,30),
    "evaluated_at" TIMESTAMP(3) NOT NULL,
    "result_source" TEXT,
    "result_provenance" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shadow_evaluation_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shadow_capture_runs_season_week_idx" ON "shadow_capture_runs"("season", "week");

-- CreateIndex
CREATE INDEX "shadow_capture_runs_capture_timestamp_idx" ON "shadow_capture_runs"("capture_timestamp");

-- CreateIndex
CREATE INDEX "shadow_capture_runs_model_definition_hash_idx" ON "shadow_capture_runs"("model_definition_hash");

-- CreateIndex
CREATE INDEX "shadow_capture_runs_policy_definition_hash_idx" ON "shadow_capture_runs"("policy_definition_hash");

-- CreateIndex
CREATE INDEX "shadow_capture_runs_capture_context_idx" ON "shadow_capture_runs"("capture_context");

-- CreateIndex
CREATE INDEX "shadow_capture_runs_status_idx" ON "shadow_capture_runs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "shadow_capture_runs_cohort_key" ON "shadow_capture_runs"("season", "week", "evaluation_protocol", "model_definition_hash", "policy_definition_hash", "capture_context");

-- CreateIndex
CREATE INDEX "shadow_prediction_snapshots_capture_run_id_idx" ON "shadow_prediction_snapshots"("capture_run_id");

-- CreateIndex
CREATE INDEX "shadow_prediction_snapshots_season_week_idx" ON "shadow_prediction_snapshots"("season", "week");

-- CreateIndex
CREATE INDEX "shadow_prediction_snapshots_game_id_idx" ON "shadow_prediction_snapshots"("game_id");

-- CreateIndex
CREATE INDEX "shadow_prediction_snapshots_prediction_timestamp_idx" ON "shadow_prediction_snapshots"("prediction_timestamp");

-- CreateIndex
CREATE INDEX "shadow_prediction_snapshots_prediction_status_idx" ON "shadow_prediction_snapshots"("prediction_status");

-- CreateIndex
CREATE INDEX "shadow_prediction_snapshots_qualification_status_idx" ON "shadow_prediction_snapshots"("qualification_status");

-- CreateIndex
CREATE INDEX "shadow_prediction_snapshots_is_super_tier_a_idx" ON "shadow_prediction_snapshots"("is_super_tier_a");

-- CreateIndex
CREATE UNIQUE INDEX "shadow_prediction_snapshots_run_game_key" ON "shadow_prediction_snapshots"("capture_run_id", "game_id");

-- CreateIndex
CREATE INDEX "shadow_closing_market_snapshots_game_id_idx" ON "shadow_closing_market_snapshots"("game_id");

-- CreateIndex
CREATE INDEX "shadow_closing_market_snapshots_target_timestamp_idx" ON "shadow_closing_market_snapshots"("target_timestamp");

-- CreateIndex
CREATE INDEX "shadow_closing_market_snapshots_policy_definition_hash_idx" ON "shadow_closing_market_snapshots"("policy_definition_hash");

-- CreateIndex
CREATE INDEX "shadow_closing_market_snapshots_status_idx" ON "shadow_closing_market_snapshots"("status");

-- CreateIndex
CREATE UNIQUE INDEX "shadow_closing_market_snapshots_identity_key" ON "shadow_closing_market_snapshots"("game_id", "evaluation_protocol", "policy_definition_hash", "market_type", "target_timestamp");

-- CreateIndex
CREATE INDEX "shadow_evaluation_results_prediction_snapshot_id_idx" ON "shadow_evaluation_results"("prediction_snapshot_id");

-- CreateIndex
CREATE INDEX "shadow_evaluation_results_closing_market_snapshot_id_idx" ON "shadow_evaluation_results"("closing_market_snapshot_id");

-- CreateIndex
CREATE INDEX "shadow_evaluation_results_ats_result_idx" ON "shadow_evaluation_results"("ats_result");

-- CreateIndex
CREATE INDEX "shadow_evaluation_results_evaluated_at_idx" ON "shadow_evaluation_results"("evaluated_at");

-- CreateIndex
CREATE UNIQUE INDEX "shadow_evaluation_results_revision_key" ON "shadow_evaluation_results"("prediction_snapshot_id", "revision");

-- AddForeignKey
ALTER TABLE "shadow_prediction_snapshots" ADD CONSTRAINT "shadow_prediction_snapshots_capture_run_id_fkey" FOREIGN KEY ("capture_run_id") REFERENCES "shadow_capture_runs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "shadow_evaluation_results" ADD CONSTRAINT "shadow_evaluation_results_prediction_snapshot_id_fkey" FOREIGN KEY ("prediction_snapshot_id") REFERENCES "shadow_prediction_snapshots"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "shadow_evaluation_results" ADD CONSTRAINT "shadow_evaluation_results_closing_market_snapshot_id_fkey" FOREIGN KEY ("closing_market_snapshot_id") REFERENCES "shadow_closing_market_snapshots"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Append-only enforcement: reject UPDATE and DELETE on all four evidence tables.
-- Writers must INSERT a complete run; they cannot draft-and-update.
CREATE FUNCTION shadow_snapshot_v1_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Shadow Snapshot V1 table % is append-only; UPDATE and DELETE are not allowed', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER shadow_snapshot_v1_append_only
  BEFORE UPDATE OR DELETE ON "shadow_capture_runs"
  FOR EACH ROW
  EXECUTE PROCEDURE shadow_snapshot_v1_reject_mutation();

CREATE TRIGGER shadow_snapshot_v1_append_only
  BEFORE UPDATE OR DELETE ON "shadow_prediction_snapshots"
  FOR EACH ROW
  EXECUTE PROCEDURE shadow_snapshot_v1_reject_mutation();

CREATE TRIGGER shadow_snapshot_v1_append_only
  BEFORE UPDATE OR DELETE ON "shadow_closing_market_snapshots"
  FOR EACH ROW
  EXECUTE PROCEDURE shadow_snapshot_v1_reject_mutation();

CREATE TRIGGER shadow_snapshot_v1_append_only
  BEFORE UPDATE OR DELETE ON "shadow_evaluation_results"
  FOR EACH ROW
  EXECUTE PROCEDURE shadow_snapshot_v1_reject_mutation();
