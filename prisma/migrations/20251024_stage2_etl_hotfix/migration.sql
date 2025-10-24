-- TEAM GAME STATS TABLE (create if missing)
CREATE TABLE IF NOT EXISTS public.team_game_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  team_id text NOT NULL REFERENCES public.teams(id),
  season int NOT NULL,
  week int NOT NULL,
  -- offensive derived
  ypp_off double precision,
  success_off double precision,
  epa_off double precision,
  pace double precision,
  pass_ypa_off double precision,
  rush_ypc_off double precision,
  -- defensive mirrors
  ypp_def double precision,
  success_def double precision,
  epa_def double precision,
  pass_ypa_def double precision,
  rush_ypc_def double precision,
  raw_json jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Unique key so upserts are clean
DO $$ BEGIN
  ALTER TABLE public.team_game_stats
  ADD CONSTRAINT team_game_stats_game_team_unique UNIQUE (game_id, team_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS team_game_stats_season_week_idx ON public.team_game_stats(season, week);
CREATE INDEX IF NOT EXISTS team_game_stats_team_season_idx ON public.team_game_stats(team_id, season);

-- RECRUITING / TALENT TABLE (create if missing)
CREATE TABLE IF NOT EXISTS public.recruiting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id text NOT NULL REFERENCES public.teams(id),
  season int NOT NULL,
  team_talent_index double precision,
  five_star int DEFAULT 0,
  four_star int DEFAULT 0,
  three_star int DEFAULT 0,
  raw_json jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Unique and indexes
DO $$ BEGIN
  ALTER TABLE public.recruiting
  ADD CONSTRAINT recruiting_team_season_unique UNIQUE (team_id, season);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS recruiting_season_idx ON public.recruiting(season);
CREATE INDEX IF NOT EXISTS recruiting_team_idx ON public.recruiting(team_id);

-- If table existed but columns didn't, add them
ALTER TABLE public.recruiting
  ADD COLUMN IF NOT EXISTS team_talent_index double precision,
  ADD COLUMN IF NOT EXISTS five_star int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS four_star int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS three_star int DEFAULT 0;

-- If team_game_stats existed but columns didn't, add them
ALTER TABLE public.team_game_stats
  ADD COLUMN IF NOT EXISTS ypp_off double precision,
  ADD COLUMN IF NOT EXISTS success_off double precision,
  ADD COLUMN IF NOT EXISTS epa_off double precision,
  ADD COLUMN IF NOT EXISTS pace double precision,
  ADD COLUMN IF NOT EXISTS pass_ypa_off double precision,
  ADD COLUMN IF NOT EXISTS rush_ypc_off double precision,
  ADD COLUMN IF NOT EXISTS ypp_def double precision,
  ADD COLUMN IF NOT EXISTS success_def double precision,
  ADD COLUMN IF NOT EXISTS epa_def double precision,
  ADD COLUMN IF NOT EXISTS pass_ypa_def double precision,
  ADD COLUMN IF NOT EXISTS rush_ypc_def double precision,
  ADD COLUMN IF NOT EXISTS raw_json jsonb;
