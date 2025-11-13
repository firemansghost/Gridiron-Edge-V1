-- Add havoc front7 and db fields to cfbd_eff_team_game
ALTER TABLE "cfbd_eff_team_game" 
ADD COLUMN IF NOT EXISTS "havoc_front7_off" DECIMAL(10,4),
ADD COLUMN IF NOT EXISTS "havoc_db_off" DECIMAL(10,4),
ADD COLUMN IF NOT EXISTS "havoc_front7_def" DECIMAL(10,4),
ADD COLUMN IF NOT EXISTS "havoc_db_def" DECIMAL(10,4);

-- Add havoc front7 and db fields to cfbd_eff_team_season
ALTER TABLE "cfbd_eff_team_season" 
ADD COLUMN IF NOT EXISTS "havoc_front7_off" DECIMAL(10,4),
ADD COLUMN IF NOT EXISTS "havoc_db_off" DECIMAL(10,4),
ADD COLUMN IF NOT EXISTS "havoc_front7_def" DECIMAL(10,4),
ADD COLUMN IF NOT EXISTS "havoc_db_def" DECIMAL(10,4);

-- Add havoc front7 and db fields to team_game_adj
ALTER TABLE "team_game_adj"
ADD COLUMN IF NOT EXISTS "off_adj_havoc_front7" DECIMAL(10,4),
ADD COLUMN IF NOT EXISTS "off_adj_havoc_db" DECIMAL(10,4),
ADD COLUMN IF NOT EXISTS "def_adj_havoc_front7" DECIMAL(10,4),
ADD COLUMN IF NOT EXISTS "def_adj_havoc_db" DECIMAL(10,4),
ADD COLUMN IF NOT EXISTS "edge_havoc_front7" DECIMAL(10,4),
ADD COLUMN IF NOT EXISTS "edge_havoc_db" DECIMAL(10,4);

-- Create game_training_rows table
CREATE TABLE IF NOT EXISTS "game_training_rows" (
    "game_id" TEXT NOT NULL,
    "feature_version" TEXT NOT NULL,
    
    -- Meta
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "home_team_id" TEXT NOT NULL,
    "away_team_id" TEXT NOT NULL,
    "set_label" TEXT,
    "row_weight" DECIMAL(10,4) DEFAULT 1.0,
    
    -- Target (home-minus-away consensus pre-kick)
    "target_spread_hma" DECIMAL(10,4),
    "books_spread" INTEGER,
    "window_start" TIMESTAMP(3),
    "window_end" TIMESTAMP(3),
    "used_pre_kick" BOOLEAN NOT NULL DEFAULT true,
    
    -- Core diffs (home - away)
    "rating_diff_v2" DECIMAL(10,4),
    "hfa_points" DECIMAL(10,4),
    "off_adj_sr_diff" DECIMAL(10,4),
    "off_adj_expl_diff" DECIMAL(10,4),
    "off_adj_ppa_diff" DECIMAL(10,4),
    "havoc_front7_diff" DECIMAL(10,4),
    "havoc_db_diff" DECIMAL(10,4),
    
    -- EWMA diffs
    "ewma3_off_adj_ppa_diff" DECIMAL(10,4),
    "ewma5_off_adj_ppa_diff" DECIMAL(10,4),
    "ewma3_off_adj_sr_diff" DECIMAL(10,4),
    "ewma5_off_adj_sr_diff" DECIMAL(10,4),
    
    -- Context
    "neutral_site" BOOLEAN NOT NULL DEFAULT false,
    "rest_delta_diff" INTEGER,
    "bye_home" BOOLEAN NOT NULL DEFAULT false,
    "bye_away" BOOLEAN NOT NULL DEFAULT false,
    "same_conf" BOOLEAN NOT NULL DEFAULT false,
    "tier_gap" INTEGER,
    "p5_vs_g5" BOOLEAN NOT NULL DEFAULT false,
    
    -- Metadata
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "game_training_rows_pkey" PRIMARY KEY ("game_id", "feature_version")
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "game_training_rows_season_week_feature_version_idx" ON "game_training_rows"("season", "week", "feature_version");
CREATE INDEX IF NOT EXISTS "game_training_rows_set_label_idx" ON "game_training_rows"("set_label");
CREATE INDEX IF NOT EXISTS "game_training_rows_feature_version_idx" ON "game_training_rows"("feature_version");

-- Add foreign keys
ALTER TABLE "game_training_rows" 
ADD CONSTRAINT "game_training_rows_game_id_fkey" 
FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "game_training_rows" 
ADD CONSTRAINT "game_training_rows_home_team_id_fkey" 
FOREIGN KEY ("home_team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "game_training_rows" 
ADD CONSTRAINT "game_training_rows_away_team_id_fkey" 
FOREIGN KEY ("away_team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

