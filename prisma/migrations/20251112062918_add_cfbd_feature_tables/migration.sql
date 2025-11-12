-- CreateTable: CFBD Team Mapping
CREATE TABLE IF NOT EXISTS "cfbd_team_map" (
    "team_id_internal" TEXT NOT NULL,
    "team_name_cfbd" TEXT NOT NULL,
    "season_first_seen" INTEGER,
    "season_last_seen" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cfbd_team_map_pkey" PRIMARY KEY ("team_id_internal")
);

CREATE INDEX IF NOT EXISTS "cfbd_team_map_team_name_cfbd_idx" ON "cfbd_team_map"("team_name_cfbd");

-- CreateTable: CFBD Games
CREATE TABLE IF NOT EXISTS "cfbd_games" (
    "game_id_cfbd" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "home_team_id_internal" TEXT NOT NULL,
    "away_team_id_internal" TEXT NOT NULL,
    "neutral_site" BOOLEAN NOT NULL DEFAULT false,
    "venue" TEXT,
    "home_conference" TEXT,
    "away_conference" TEXT,
    "source" TEXT NOT NULL DEFAULT 'cfbd',
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "as_of" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version_tag" TEXT,

    CONSTRAINT "cfbd_games_pkey" PRIMARY KEY ("game_id_cfbd")
);

CREATE INDEX IF NOT EXISTS "cfbd_games_season_week_idx" ON "cfbd_games"("season", "week");
CREATE INDEX IF NOT EXISTS "cfbd_games_home_team_id_internal_idx" ON "cfbd_games"("home_team_id_internal");
CREATE INDEX IF NOT EXISTS "cfbd_games_away_team_id_internal_idx" ON "cfbd_games"("away_team_id_internal");

-- CreateTable: CFBD Efficiency Team Game
CREATE TABLE IF NOT EXISTS "cfbd_eff_team_game" (
    "game_id_cfbd" TEXT NOT NULL,
    "team_id_internal" TEXT NOT NULL,
    "off_epa" DECIMAL(10,4),
    "off_sr" DECIMAL(10,4),
    "iso_ppp_off" DECIMAL(10,4),
    "ppo_off" DECIMAL(10,4),
    "line_yards_off" DECIMAL(10,4),
    "havoc_off" DECIMAL(10,4),
    "def_epa" DECIMAL(10,4),
    "def_sr" DECIMAL(10,4),
    "iso_ppp_def" DECIMAL(10,4),
    "ppo_def" DECIMAL(10,4),
    "stuff_rate" DECIMAL(10,4),
    "power_success" DECIMAL(10,4),
    "havoc_def" DECIMAL(10,4),
    "run_epa" DECIMAL(10,4),
    "pass_epa" DECIMAL(10,4),
    "run_sr" DECIMAL(10,4),
    "pass_sr" DECIMAL(10,4),
    "early_down_epa" DECIMAL(10,4),
    "late_down_epa" DECIMAL(10,4),
    "avg_field_position" DECIMAL(10,4),
    "source" TEXT NOT NULL DEFAULT 'cfbd',
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "as_of" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version_tag" TEXT,

    CONSTRAINT "cfbd_eff_team_game_pkey" PRIMARY KEY ("game_id_cfbd", "team_id_internal")
);

CREATE INDEX IF NOT EXISTS "cfbd_eff_team_game_game_id_cfbd_idx" ON "cfbd_eff_team_game"("game_id_cfbd");
CREATE INDEX IF NOT EXISTS "cfbd_eff_team_game_team_id_internal_idx" ON "cfbd_eff_team_game"("team_id_internal");

-- CreateTable: CFBD Efficiency Team Season
CREATE TABLE IF NOT EXISTS "cfbd_eff_team_season" (
    "season" INTEGER NOT NULL,
    "team_id_internal" TEXT NOT NULL,
    "off_epa" DECIMAL(10,4),
    "off_sr" DECIMAL(10,4),
    "iso_ppp_off" DECIMAL(10,4),
    "ppo_off" DECIMAL(10,4),
    "line_yards_off" DECIMAL(10,4),
    "havoc_off" DECIMAL(10,4),
    "def_epa" DECIMAL(10,4),
    "def_sr" DECIMAL(10,4),
    "iso_ppp_def" DECIMAL(10,4),
    "ppo_def" DECIMAL(10,4),
    "stuff_rate" DECIMAL(10,4),
    "power_success" DECIMAL(10,4),
    "havoc_def" DECIMAL(10,4),
    "run_epa" DECIMAL(10,4),
    "pass_epa" DECIMAL(10,4),
    "run_sr" DECIMAL(10,4),
    "pass_sr" DECIMAL(10,4),
    "early_down_epa" DECIMAL(10,4),
    "late_down_epa" DECIMAL(10,4),
    "avg_field_position" DECIMAL(10,4),
    "source" TEXT NOT NULL DEFAULT 'cfbd',
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "as_of" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version_tag" TEXT,

    CONSTRAINT "cfbd_eff_team_season_pkey" PRIMARY KEY ("season", "team_id_internal")
);

CREATE INDEX IF NOT EXISTS "cfbd_eff_team_season_team_id_internal_idx" ON "cfbd_eff_team_season"("team_id_internal");

-- CreateTable: CFBD PPA Team Game
CREATE TABLE IF NOT EXISTS "cfbd_ppa_team_game" (
    "game_id_cfbd" TEXT NOT NULL,
    "team_id_internal" TEXT NOT NULL,
    "ppa_offense" DECIMAL(10,4),
    "ppa_defense" DECIMAL(10,4),
    "ppa_overall" DECIMAL(10,4),
    "source" TEXT NOT NULL DEFAULT 'cfbd',
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "as_of" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version_tag" TEXT,

    CONSTRAINT "cfbd_ppa_team_game_pkey" PRIMARY KEY ("game_id_cfbd", "team_id_internal")
);

CREATE INDEX IF NOT EXISTS "cfbd_ppa_team_game_game_id_cfbd_idx" ON "cfbd_ppa_team_game"("game_id_cfbd");
CREATE INDEX IF NOT EXISTS "cfbd_ppa_team_game_team_id_internal_idx" ON "cfbd_ppa_team_game"("team_id_internal");

-- CreateTable: CFBD PPA Team Season
CREATE TABLE IF NOT EXISTS "cfbd_ppa_team_season" (
    "season" INTEGER NOT NULL,
    "team_id_internal" TEXT NOT NULL,
    "ppa_offense" DECIMAL(10,4),
    "ppa_defense" DECIMAL(10,4),
    "ppa_overall" DECIMAL(10,4),
    "source" TEXT NOT NULL DEFAULT 'cfbd',
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "as_of" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version_tag" TEXT,

    CONSTRAINT "cfbd_ppa_team_season_pkey" PRIMARY KEY ("season", "team_id_internal")
);

CREATE INDEX IF NOT EXISTS "cfbd_ppa_team_season_team_id_internal_idx" ON "cfbd_ppa_team_season"("team_id_internal");

-- CreateTable: CFBD Drives Team Game
CREATE TABLE IF NOT EXISTS "cfbd_drives_team_game" (
    "game_id_cfbd" TEXT NOT NULL,
    "team_id_internal" TEXT NOT NULL,
    "plays_per_minute" DECIMAL(10,4),
    "seconds_per_snap" DECIMAL(10,4),
    "scoring_opps_per_drive" DECIMAL(10,4),
    "points_per_scoring_opp" DECIMAL(10,4),
    "avg_start_pos" DECIMAL(10,4),
    "redzone_trips" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'cfbd',
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "as_of" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version_tag" TEXT,

    CONSTRAINT "cfbd_drives_team_game_pkey" PRIMARY KEY ("game_id_cfbd", "team_id_internal")
);

CREATE INDEX IF NOT EXISTS "cfbd_drives_team_game_game_id_cfbd_idx" ON "cfbd_drives_team_game"("game_id_cfbd");
CREATE INDEX IF NOT EXISTS "cfbd_drives_team_game_team_id_internal_idx" ON "cfbd_drives_team_game"("team_id_internal");

-- CreateTable: CFBD Priors Team Season
CREATE TABLE IF NOT EXISTS "cfbd_priors_team_season" (
    "season" INTEGER NOT NULL,
    "team_id_internal" TEXT NOT NULL,
    "talent_247" DECIMAL(10,4),
    "returning_prod_off" DECIMAL(10,4),
    "returning_prod_def" DECIMAL(10,4),
    "source" TEXT NOT NULL DEFAULT 'cfbd',
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "as_of" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version_tag" TEXT,

    CONSTRAINT "cfbd_priors_team_season_pkey" PRIMARY KEY ("season", "team_id_internal")
);

CREATE INDEX IF NOT EXISTS "cfbd_priors_team_season_team_id_internal_idx" ON "cfbd_priors_team_season"("team_id_internal");

-- CreateTable: CFBD Weather Game
CREATE TABLE IF NOT EXISTS "cfbd_weather_game" (
    "game_id_cfbd" TEXT NOT NULL,
    "temperature" DECIMAL(10,4),
    "wind_speed" DECIMAL(10,4),
    "precip_prob" DECIMAL(10,4),
    "source" TEXT NOT NULL DEFAULT 'cfbd',
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "as_of" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version_tag" TEXT,

    CONSTRAINT "cfbd_weather_game_pkey" PRIMARY KEY ("game_id_cfbd")
);

CREATE INDEX IF NOT EXISTS "cfbd_weather_game_game_id_cfbd_idx" ON "cfbd_weather_game"("game_id_cfbd");

