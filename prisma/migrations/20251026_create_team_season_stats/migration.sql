-- 20251026_create_team_season_stats.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.team_season_stats (
  season INT NOT NULL,
  team_id TEXT NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  -- Offense
  ypp_off NUMERIC,
  success_off NUMERIC,
  pass_ypa_off NUMERIC,
  rush_ypc_off NUMERIC,
  pace_off NUMERIC,
  epa_off NUMERIC,
  -- Defense
  ypp_def NUMERIC,
  success_def NUMERIC,
  pass_ypa_def NUMERIC,
  rush_ypc_def NUMERIC,
  pace_def NUMERIC,
  epa_def NUMERIC,
  -- Raw
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season, team_id)
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS team_season_stats_season_idx ON public.team_season_stats(season);
CREATE INDEX IF NOT EXISTS team_season_stats_team_idx ON public.team_season_stats(team_id);

COMMIT;
