-- OA-DB-1 Canonical Team-Game Efficiency Persistence V1.
-- Additive research-data table only. No DML. No changes to team_game_stats, games, ratings, bets, or 2026 data.

CREATE TABLE "team_game_efficiency_canonical_v1" (
    "season" INTEGER NOT NULL,
    "provider_game_id" TEXT NOT NULL,
    "provider_week" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3),
    "neutral_site" BOOLEAN,
    "home_team_name_cfbd" TEXT NOT NULL,
    "away_team_name_cfbd" TEXT NOT NULL,
    "team_name_cfbd" TEXT NOT NULL,
    "opponent_name_cfbd" TEXT NOT NULL,
    "team_id_internal" TEXT NOT NULL,
    "opponent_team_id_internal" TEXT NOT NULL,
    "is_home" BOOLEAN NOT NULL,
    "availability_status" TEXT NOT NULL,
    "ppa_off" DOUBLE PRECISION,
    "ppa_def" DOUBLE PRECISION,
    "success_off" DOUBLE PRECISION,
    "success_def" DOUBLE PRECISION,
    "source_season" INTEGER NOT NULL,
    "source_artifact_id" TEXT NOT NULL,
    "source_artifact_zip_sha256" TEXT NOT NULL,
    "source_endpoint" TEXT NOT NULL,
    "source_raw_member" TEXT NOT NULL,
    "source_method" TEXT NOT NULL,
    "archive_contract_version" TEXT NOT NULL,
    "archive_run_id" TEXT NOT NULL,
    "archive_artifact_id" TEXT NOT NULL,
    "archive_artifact_zip_sha256" TEXT NOT NULL,
    "record_fingerprint_sha256" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_game_efficiency_canonical_v1_pkey"
      PRIMARY KEY ("season", "provider_game_id", "team_id_internal"),

    CONSTRAINT "team_game_efficiency_canonical_v1_status_check"
      CHECK ("availability_status" IN ('AVAILABLE', 'SOURCE_UNAVAILABLE')),

    CONSTRAINT "team_game_efficiency_canonical_v1_source_method_check"
      CHECK ("source_method" IN ('DIRECT_PROVIDER_ROW', 'SOURCE_UNAVAILABLE')),

    CONSTRAINT "team_game_efficiency_canonical_v1_metric_nullability_check"
      CHECK (
        (
          "availability_status" = 'AVAILABLE'
          AND "ppa_off" IS NOT NULL
          AND "ppa_def" IS NOT NULL
          AND "success_off" IS NOT NULL
          AND "success_def" IS NOT NULL
        )
        OR
        (
          "availability_status" = 'SOURCE_UNAVAILABLE'
          AND "ppa_off" IS NULL
          AND "ppa_def" IS NULL
          AND "success_off" IS NULL
          AND "success_def" IS NULL
        )
      )
);

CREATE INDEX "team_game_efficiency_canonical_v1_season_week_idx"
  ON "team_game_efficiency_canonical_v1"("season", "provider_week");

CREATE INDEX "team_game_efficiency_canonical_v1_team_season_idx"
  ON "team_game_efficiency_canonical_v1"("team_id_internal", "season");

CREATE INDEX "team_game_efficiency_canonical_v1_status_idx"
  ON "team_game_efficiency_canonical_v1"("availability_status");

-- Research-only table in public: private by default for Data API roles.
ALTER TABLE "team_game_efficiency_canonical_v1" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "team_game_efficiency_canonical_v1" FROM anon, authenticated;
