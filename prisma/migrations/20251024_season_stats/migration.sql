-- TEAM SEASON STATS TABLE (create if missing)
CREATE TABLE IF NOT EXISTS public.team_season_stats (
  season int NOT NULL,
  team_id text NOT NULL REFERENCES public.teams(id),
  ypp_off numeric,
  success_off numeric,
  pass_ypa_off numeric,
  rush_ypc_off numeric,
  pace_off numeric,
  ypp_def numeric,
  success_def numeric,
  pass_ypa_def numeric,
  rush_ypc_def numeric,
  pace_def numeric,
  epa_off numeric,
  epa_def numeric,
  raw_json jsonb,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (season, team_id)
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS team_season_stats_season_idx ON public.team_season_stats(season);
CREATE INDEX IF NOT EXISTS team_season_stats_team_idx ON public.team_season_stats(team_id);
