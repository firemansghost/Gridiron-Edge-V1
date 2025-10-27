-- Add guardrails to team_season_stats table
-- Ensure season and team_id are NOT NULL and add unique constraint

-- Make season and team_id NOT NULL
ALTER TABLE team_season_stats
  ALTER COLUMN season SET NOT NULL,
  ALTER COLUMN team_id SET NOT NULL;

-- Add unique index on (season, team_id) if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public'
    AND indexname='ux_team_season_stats_season_team'
  ) THEN
    CREATE UNIQUE INDEX ux_team_season_stats_season_team
    ON team_season_stats (season, team_id);
  END IF;
END$$;
