-- TEAM GAME STATS (game-level; per team)
-- Safe migration with IF NOT EXISTS guards
CREATE TABLE IF NOT EXISTS public.team_game_stats (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          text NOT NULL,
  team_id          text NOT NULL,
  season           int NOT NULL,
  week             int NOT NULL,
  opponent_id      text,
  is_home          boolean DEFAULT false,

  -- core derived/atomic features
  plays_off        int,
  yards_off        int,
  ypp_off          double precision,
  success_off      double precision,
  epa_off          double precision,
  pace_plays_gm    double precision, -- plays per game proxy

  pass_yards_off   int,
  rush_yards_off   int,
  pass_att_off     int,
  rush_att_off     int,
  pass_ypa_off     double precision,
  rush_ypc_off     double precision,

  -- defense mirrors (nullable if unavailable)
  plays_def        int,
  yards_def        int,
  ypp_def          double precision,
  success_def      double precision,
  epa_def          double precision,
  pass_yards_def   int,
  rush_yards_def   int,
  pass_att_def     int,
  rush_att_def     int,
  pass_ypa_def     double precision,
  rush_ypc_def     double precision,

  raw_json         jsonb,
  created_at       timestamp without time zone DEFAULT now(),
  updated_at       timestamp without time zone DEFAULT now()
);

-- Guarded FKs (optional if games/teams live in same DB and ids match)
-- ALTER TABLE public.team_game_stats
--   ADD CONSTRAINT tgs_game_fk FOREIGN KEY (game_id) REFERENCES public.games (id) ON DELETE CASCADE;

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_tgs_game ON public.team_game_stats (game_id);
CREATE INDEX IF NOT EXISTS idx_tgs_team_season ON public.team_game_stats (team_id, season);
CREATE INDEX IF NOT EXISTS idx_tgs_season_week ON public.team_game_stats (season, week);

-- de-dup guard if desired (comment out if you prefer multiple versions)
-- CREATE UNIQUE INDEX IF NOT EXISTS uniq_tgs_game_team ON public.team_game_stats (game_id, team_id);

-----------------------------------------------------------------------

-- RECRUITING / TALENT (seasonal)
CREATE TABLE IF NOT EXISTS public.recruiting (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id             text NOT NULL,
  season              int NOT NULL,
  team_talent_index   double precision, -- CFBD "team talent" composite
  five_star           int,
  four_star           int,
  three_star          int,
  commits             int,
  points              double precision,
  national_rank       int,
  conference_rank     int,
  raw_json            jsonb,
  created_at          timestamp without time zone DEFAULT now(),
  updated_at          timestamp without time zone DEFAULT now()
);

-- If teams table exists:
-- ALTER TABLE public.recruiting
--   ADD CONSTRAINT recruiting_team_fk FOREIGN KEY (team_id) REFERENCES public.teams (id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_recruiting_team_season ON public.recruiting (team_id, season);
CREATE INDEX IF NOT EXISTS idx_recruiting_season ON public.recruiting (season);
