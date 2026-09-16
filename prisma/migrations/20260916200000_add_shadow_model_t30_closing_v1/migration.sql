-- Generic Shadow T-30 Closing V1 — additive closing-market evidence storage.
-- Distinct from Hybrid ShadowClosingMarketSnapshot / shadow_closing_market_snapshots.
-- One closing row per ShadowModelPrediction (prediction_id UNIQUE).
-- Internal FK only. No DML. No operational ALTERs. No @updatedAt.
-- Dedicated append-only trigger; do not reuse Generic capture or feature-snapshot guards.

-- CreateTable
CREATE TABLE "shadow_model_closing_market_snapshots" (
    "id" TEXT NOT NULL,
    "prediction_id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "evaluation_protocol" TEXT NOT NULL,
    "closing_definition_id" TEXT NOT NULL,
    "closing_definition_hash" TEXT NOT NULL,
    "market_type" "ShadowModelMarketType" NOT NULL,
    "prediction_kickoff_timestamp" TIMESTAMP(3) NOT NULL,
    "closing_kickoff_timestamp" TIMESTAMP(3) NOT NULL,
    "target_timestamp" TIMESTAMP(3) NOT NULL,
    "status" "ShadowAvailabilityStatus" NOT NULL,
    "unavailable_reason" TEXT,
    "selected_home_market_line_id" TEXT,
    "selected_away_market_line_id" TEXT,
    "selected_home_line_value" DOUBLE PRECISION,
    "selected_away_line_value" DOUBLE PRECISION,
    "selected_display_team_id" TEXT,
    "selected_display_line_value" DOUBLE PRECISION,
    "canonical_market_hma" DOUBLE PRECISION,
    "book" TEXT,
    "source" TEXT,
    "market_observation_timestamp" TIMESTAMP(3),
    "market_age_to_target_seconds" INTEGER,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shadow_model_closing_market_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shadow_model_closing_market_snapshots_prediction_id_key" ON "shadow_model_closing_market_snapshots"("prediction_id");

-- CreateIndex
CREATE INDEX "shadow_model_closing_market_snapshots_game_id_idx" ON "shadow_model_closing_market_snapshots"("game_id");

-- CreateIndex
CREATE INDEX "shadow_model_closing_market_snapshots_target_timestamp_idx" ON "shadow_model_closing_market_snapshots"("target_timestamp");

-- CreateIndex
CREATE INDEX "shadow_model_closing_market_snapshots_status_idx" ON "shadow_model_closing_market_snapshots"("status");

-- CreateIndex
CREATE INDEX "shadow_model_closing_market_snapshots_closing_def_hash_idx" ON "shadow_model_closing_market_snapshots"("closing_definition_hash");

-- AddForeignKey
ALTER TABLE "shadow_model_closing_market_snapshots" ADD CONSTRAINT "shadow_model_closing_market_snapshots_prediction_id_fkey" FOREIGN KEY ("prediction_id") REFERENCES "shadow_model_predictions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Append-only enforcement: reject UPDATE and DELETE on Generic T-30 closing evidence.
CREATE FUNCTION shadow_model_t30_closing_v1_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Generic Shadow T-30 Closing V1 table % is append-only; UPDATE and DELETE are not allowed',
    TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER shadow_model_t30_closing_v1_append_only
  BEFORE UPDATE OR DELETE ON "shadow_model_closing_market_snapshots"
  FOR EACH ROW
  EXECUTE PROCEDURE shadow_model_t30_closing_v1_reject_mutation();
