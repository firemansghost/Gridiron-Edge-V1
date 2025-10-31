-- Add missing FBS teams found in team_season_stats but not in team_membership
-- These teams exist in the database and have stats, but weren't included in the initial seed

-- Teams to add:
-- - old-dominion (Old Dominion Monarchs)
-- - massachusetts (UMass Minutemen) 
-- - uconn (Connecticut Huskies)
-- - uab (UAB Blazers)
-- - app-state (Appalachian State - note: may also exist as appalachian-state)

-- Step 1: Add missing teams to team_membership for 2024
INSERT INTO team_membership (season, team_id, level)
VALUES 
  (2024, 'old-dominion', 'fbs'),
  (2024, 'massachusetts', 'fbs'),
  (2024, 'uconn', 'fbs'),
  (2024, 'uab', 'fbs'),
  (2024, 'app-state', 'fbs')
ON CONFLICT (season, team_id) DO NOTHING;

-- Step 2: Add missing teams to team_membership for 2025
INSERT INTO team_membership (season, team_id, level)
VALUES 
  (2025, 'old-dominion', 'fbs'),
  (2025, 'massachusetts', 'fbs'),
  (2025, 'uconn', 'fbs'),
  (2025, 'uab', 'fbs'),
  (2025, 'app-state', 'fbs')
ON CONFLICT (season, team_id) DO NOTHING;

-- Step 3: Check for appalachian-state (if it exists separately from app-state)
INSERT INTO team_membership (season, team_id, level)
SELECT season, 'appalachian-state', 'fbs'
FROM (VALUES (2024), (2025)) AS s(season)
WHERE EXISTS (SELECT 1 FROM teams WHERE id = 'appalachian-state')
ON CONFLICT (season, team_id) DO NOTHING;

-- Step 4: Verify updated counts
SELECT 
    season,
    COUNT(*) as fbs_teams
FROM team_membership
WHERE level = 'fbs'
  AND season IN (2024, 2025)
GROUP BY season
ORDER BY season;

-- Should now show:
-- 2024: ~132 teams
-- 2025: ~134 teams

-- Step 5: Verify no more mismatches
SELECT s.season, s.team_id
FROM team_season_stats s
LEFT JOIN team_membership m
  ON m.season = s.season 
  AND m.team_id = s.team_id 
  AND m.level = 'fbs'
WHERE s.season IN (2024, 2025)
  AND m.team_id IS NULL
ORDER BY s.season, s.team_id;

-- Should return 0 rows (or only teams that truly aren't FBS)

