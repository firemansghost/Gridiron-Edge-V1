-- Candidate B V1 immutable derived team-feature snapshot storage.
-- Additive only: two empty tables, indexes, internal FK, append-only triggers.
-- No DML. No operational ALTERs. No Generic Shadow trigger reuse.

-- CreateTable
CREATE TABLE "shadow_model_feature_snapshots" (
    "id" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "snapshot_kind" TEXT NOT NULL,
    "model_family" TEXT NOT NULL,
    "model_definition_id" TEXT NOT NULL,
    "feature_definition_id" TEXT NOT NULL,
    "feature_definition_version" TEXT NOT NULL,
    "feature_definition_manifest" JSONB NOT NULL,
    "feature_definition_hash" TEXT NOT NULL,
    "derivation_definition_id" TEXT NOT NULL,
    "derivation_definition_manifest" JSONB NOT NULL,
    "derivation_definition_hash" TEXT NOT NULL,
    "source_manifest" JSONB NOT NULL,
    "source_manifest_hash" TEXT NOT NULL,
    "source_provenance_manifest" JSONB NOT NULL,
    "source_provenance_manifest_hash" TEXT NOT NULL,
    "normalization_manifest" JSONB NOT NULL,
    "normalization_manifest_hash" TEXT NOT NULL,
    "population_manifest" JSONB NOT NULL,
    "population_manifest_hash" TEXT NOT NULL,
    "expected_team_count" INTEGER NOT NULL,
    "row_count" INTEGER NOT NULL,
    "complete_vector_count" INTEGER NOT NULL,
    "unavailable_vector_count" INTEGER NOT NULL,
    "portal_available_count" INTEGER NOT NULL,
    "repo_commit_sha" TEXT NOT NULL,
    "derived_at" TIMESTAMP(3) NOT NULL,
    "snapshot_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shadow_model_feature_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shadow_model_feature_snapshot_teams" (
    "id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "availability_status" TEXT NOT NULL,
    "unavailable_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prior_core_raw" DOUBLE PRECISION,
    "talent_raw" DOUBLE PRECISION,
    "returning_raw" DOUBLE PRECISION,
    "portal_raw" DOUBLE PRECISION,
    "z_core" DOUBLE PRECISION,
    "z_talent" DOUBLE PRECISION,
    "z_returning" DOUBLE PRECISION,
    "z_portal" DOUBLE PRECISION,
    "candidate_b_raw_composite" DOUBLE PRECISION,
    "candidate_b_composite_z" DOUBLE PRECISION,
    "candidate_b_team_rating_points" DOUBLE PRECISION,
    "inbound_transfer_count" INTEGER NOT NULL,
    "inbound_rated_count" INTEGER NOT NULL,
    "inbound_rated_coverage" DOUBLE PRECISION,
    "inbound_direction_status" TEXT NOT NULL,
    "inbound_mean_rating" DOUBLE PRECISION,
    "outbound_transfer_count" INTEGER NOT NULL,
    "outbound_rated_count" INTEGER NOT NULL,
    "outbound_rated_coverage" DOUBLE PRECISION,
    "outbound_direction_status" TEXT NOT NULL,
    "outbound_mean_rating" DOUBLE PRECISION,
    "row_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shadow_model_feature_snapshot_teams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shadow_model_feature_snapshots_snapshot_hash_key" ON "shadow_model_feature_snapshots"("snapshot_hash");

-- CreateIndex
CREATE UNIQUE INDEX "shadow_model_feature_snapshots_v1_identity_key" ON "shadow_model_feature_snapshots"("season", "feature_definition_id", "feature_definition_version", "derivation_definition_id");

-- CreateIndex
CREATE INDEX "shadow_model_feature_snapshots_season_idx" ON "shadow_model_feature_snapshots"("season");

-- CreateIndex
CREATE INDEX "shadow_model_feature_snapshots_feature_definition_hash_idx" ON "shadow_model_feature_snapshots"("feature_definition_hash");

-- CreateIndex
CREATE INDEX "shadow_model_feature_snapshots_derivation_definition_hash_idx" ON "shadow_model_feature_snapshots"("derivation_definition_hash");

-- CreateIndex
CREATE INDEX "shadow_model_feature_snapshots_source_manifest_hash_idx" ON "shadow_model_feature_snapshots"("source_manifest_hash");

-- CreateIndex
CREATE UNIQUE INDEX "shadow_model_feature_snapshot_teams_snapshot_team_key" ON "shadow_model_feature_snapshot_teams"("snapshot_id", "team_id");

-- CreateIndex
CREATE INDEX "shadow_model_feature_snapshot_teams_snapshot_id_idx" ON "shadow_model_feature_snapshot_teams"("snapshot_id");

-- CreateIndex
CREATE INDEX "shadow_model_feature_snapshot_teams_team_season_idx" ON "shadow_model_feature_snapshot_teams"("team_id", "season");

-- CreateIndex
CREATE INDEX "shadow_model_feature_snapshot_teams_row_hash_idx" ON "shadow_model_feature_snapshot_teams"("row_hash");

-- AddForeignKey
ALTER TABLE "shadow_model_feature_snapshot_teams" ADD CONSTRAINT "shadow_model_feature_snapshot_teams_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "shadow_model_feature_snapshots"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Append-only enforcement: reject UPDATE and DELETE on both feature-snapshot tables.
CREATE FUNCTION shadow_model_feature_snapshot_v1_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Shadow Model Feature Snapshot V1 table % is append-only; UPDATE and DELETE are not allowed', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER shadow_model_feature_snapshot_v1_append_only
  BEFORE UPDATE OR DELETE ON "shadow_model_feature_snapshots"
  FOR EACH ROW
  EXECUTE PROCEDURE shadow_model_feature_snapshot_v1_reject_mutation();

CREATE TRIGGER shadow_model_feature_snapshot_v1_append_only
  BEFORE UPDATE OR DELETE ON "shadow_model_feature_snapshot_teams"
  FOR EACH ROW
  EXECUTE PROCEDURE shadow_model_feature_snapshot_v1_reject_mutation();
