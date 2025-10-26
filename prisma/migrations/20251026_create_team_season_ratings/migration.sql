-- 20251026_create_team_season_ratings.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.team_season_ratings (
  season INT NOT NULL,
  team_id TEXT NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  games INT NOT NULL DEFAULT 0,
  points_for INT,
  points_against INT,
  mov_avg NUMERIC,
  rating NUMERIC,              -- centered ~0
  offense_rating NUMERIC,      -- derived (points_for adj.)
  defense_rating NUMERIC,      -- derived (points_against adj.)
  sigma NUMERIC,               -- residual spread for confidence
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season, team_id)
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS team_season_ratings_season_idx ON public.team_season_ratings(season);
CREATE INDEX IF NOT EXISTS team_season_ratings_team_idx ON public.team_season_ratings(team_id);
CREATE INDEX IF NOT EXISTS team_season_ratings_rating_idx ON public.team_season_ratings(season, rating DESC);

COMMIT;
