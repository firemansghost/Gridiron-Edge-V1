-- Simple check: List all CFBD tables and their row counts
-- Copy and paste this into Supabase SQL Editor

SELECT 
  'cfbd_team_map' as table_name,
  (SELECT COUNT(*) FROM cfbd_team_map) as row_count
UNION ALL
SELECT 'cfbd_games', (SELECT COUNT(*) FROM cfbd_games)
UNION ALL
SELECT 'cfbd_eff_team_game', (SELECT COUNT(*) FROM cfbd_eff_team_game)
UNION ALL
SELECT 'cfbd_eff_team_season', (SELECT COUNT(*) FROM cfbd_eff_team_season)
UNION ALL
SELECT 'cfbd_ppa_team_game', (SELECT COUNT(*) FROM cfbd_ppa_team_game)
UNION ALL
SELECT 'cfbd_ppa_team_season', (SELECT COUNT(*) FROM cfbd_ppa_team_season)
UNION ALL
SELECT 'cfbd_drives_team_game', (SELECT COUNT(*) FROM cfbd_drives_team_game)
UNION ALL
SELECT 'cfbd_priors_team_season', (SELECT COUNT(*) FROM cfbd_priors_team_season)
UNION ALL
SELECT 'cfbd_weather_game', (SELECT COUNT(*) FROM cfbd_weather_game)
ORDER BY table_name;

