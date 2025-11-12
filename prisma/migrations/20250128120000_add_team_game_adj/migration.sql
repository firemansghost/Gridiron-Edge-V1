-- CreateTable: Team Game Adjusted Features
CREATE TABLE IF NOT EXISTS "team_game_adj" (
    "game_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "feature_version" TEXT NOT NULL,
    
    -- Opponent-adjusted nets (Offense vs Opponent Defense)
    "off_adj_epa" DECIMAL(10,4),
    "off_adj_sr" DECIMAL(10,4),
    "off_adj_explosiveness" DECIMAL(10,4),
    "off_adj_ppa" DECIMAL(10,4),
    "off_adj_havoc" DECIMAL(10,4),
    
    -- Opponent-adjusted nets (Defense vs Opponent Offense)
    "def_adj_epa" DECIMAL(10,4),
    "def_adj_sr" DECIMAL(10,4),
    "def_adj_explosiveness" DECIMAL(10,4),
    "def_adj_ppa" DECIMAL(10,4),
    "def_adj_havoc" DECIMAL(10,4),
    
    -- Matchup edges (off_adj - def_adj)
    "edge_epa" DECIMAL(10,4),
    "edge_sr" DECIMAL(10,4),
    "edge_explosiveness" DECIMAL(10,4),
    "edge_ppa" DECIMAL(10,4),
    "edge_havoc" DECIMAL(10,4),
    
    -- Recency EWMAs (3-game)
    "ewma3_epa" DECIMAL(10,4),
    "ewma3_sr" DECIMAL(10,4),
    "ewma3_explosiveness" DECIMAL(10,4),
    "ewma3_ppa" DECIMAL(10,4),
    "ewma3_off_adj_epa" DECIMAL(10,4),
    "ewma3_def_adj_epa" DECIMAL(10,4),
    
    -- Recency EWMAs (5-game)
    "ewma5_epa" DECIMAL(10,4),
    "ewma5_sr" DECIMAL(10,4),
    "ewma5_explosiveness" DECIMAL(10,4),
    "ewma5_ppa" DECIMAL(10,4),
    "ewma5_off_adj_epa" DECIMAL(10,4),
    "ewma5_def_adj_epa" DECIMAL(10,4),
    
    -- Low sample flags
    "low_sample_3g" BOOLEAN NOT NULL DEFAULT false,
    "low_sample_5g" BOOLEAN NOT NULL DEFAULT false,
    
    -- Pace & finishing (placeholders - NULL until drives ingested)
    "sec_per_play" DECIMAL(10,4),
    "plays_per_game" DECIMAL(10,4),
    "pts_per_scoring_opp" DECIMAL(10,4),
    "scoring_opps_per_drive" DECIMAL(10,4),
    "avg_start_pos" DECIMAL(10,4),
    
    -- Priors as direct features
    "talent_247" DECIMAL(10,4),
    "returning_prod_off" DECIMAL(10,4),
    "returning_prod_def" DECIMAL(10,4),
    
    -- Context flags
    "neutral_site" BOOLEAN NOT NULL DEFAULT false,
    "conference_game" BOOLEAN NOT NULL DEFAULT false,
    "rest_delta" INTEGER,
    "bye_week" BOOLEAN NOT NULL DEFAULT false,
    "is_home" BOOLEAN NOT NULL DEFAULT false,
    "is_fbs" BOOLEAN NOT NULL DEFAULT true,
    "p5_flag" BOOLEAN NOT NULL DEFAULT false,
    "g5_flag" BOOLEAN NOT NULL DEFAULT false,
    "fcs_flag" BOOLEAN NOT NULL DEFAULT false,
    
    -- Metadata
    "source_snapshot" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_game_adj_pkey" PRIMARY KEY ("game_id", "team_id", "feature_version")
);

CREATE INDEX IF NOT EXISTS "team_game_adj_game_id_idx" ON "team_game_adj"("game_id");
CREATE INDEX IF NOT EXISTS "team_game_adj_team_id_season_week_idx" ON "team_game_adj"("team_id", "season", "week");
CREATE INDEX IF NOT EXISTS "team_game_adj_season_week_idx" ON "team_game_adj"("season", "week");
CREATE INDEX IF NOT EXISTS "team_game_adj_feature_version_idx" ON "team_game_adj"("feature_version");

-- Add foreign key constraints
ALTER TABLE "team_game_adj" ADD CONSTRAINT "team_game_adj_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_game_adj" ADD CONSTRAINT "team_game_adj_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

