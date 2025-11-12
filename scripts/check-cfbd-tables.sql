-- Check if all CFBD feature tables exist in Supabase
-- Run this in Supabase SQL Editor or via psql

SELECT 
  table_name,
  CASE 
    WHEN table_name IN (
      'cfbd_team_map',
      'cfbd_games',
      'cfbd_eff_team_game',
      'cfbd_eff_team_season',
      'cfbd_ppa_team_game',
      'cfbd_ppa_team_season',
      'cfbd_drives_team_game',
      'cfbd_priors_team_season',
      'cfbd_weather_game'
    ) THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'cfbd_%'
ORDER BY table_name;

-- Also show row counts for each table (if they exist)
SELECT 
  'cfbd_team_map' as table_name,
  COUNT(*) as row_count
FROM cfbd_team_map
UNION ALL
SELECT 'cfbd_games', COUNT(*) FROM cfbd_games
UNION ALL
SELECT 'cfbd_eff_team_game', COUNT(*) FROM cfbd_eff_team_game
UNION ALL
SELECT 'cfbd_eff_team_season', COUNT(*) FROM cfbd_eff_team_season
UNION ALL
SELECT 'cfbd_ppa_team_game', COUNT(*) FROM cfbd_ppa_team_game
UNION ALL
SELECT 'cfbd_ppa_team_season', COUNT(*) FROM cfbd_ppa_team_season
UNION ALL
SELECT 'cfbd_drives_team_game', COUNT(*) FROM cfbd_drives_team_game
UNION ALL
SELECT 'cfbd_priors_team_season', COUNT(*) FROM cfbd_priors_team_season
UNION ALL
SELECT 'cfbd_weather_game', COUNT(*) FROM cfbd_weather_game
ORDER BY table_name;

