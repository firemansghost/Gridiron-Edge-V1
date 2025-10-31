-- Seed team_membership table with all FBS teams for 2024 and 2025
-- This populates the canonical FBS universe per season

-- Step 1: Ensure Delaware and Missouri State exist (2025 FBS additions)
INSERT INTO teams (id, name, conference, division, updated_at)
VALUES 
  ('delaware', 'Delaware', 'C-USA', NULL, NOW()),
  ('missouri-state', 'Missouri State', 'C-USA', NULL, NOW())
ON CONFLICT (id) DO UPDATE SET updated_at = NOW();

-- Step 2: Insert all current teams as FBS for 2024
-- (This gets all teams from your teams table)
INSERT INTO team_membership (season, team_id, level)
SELECT 2024, id, 'fbs'
FROM teams
WHERE id IS NOT NULL
ON CONFLICT (season, team_id) DO NOTHING;

-- Step 3: Insert all current teams as FBS for 2025
INSERT INTO team_membership (season, team_id, level)
SELECT 2025, id, 'fbs'
FROM teams
WHERE id IS NOT NULL
ON CONFLICT (season, team_id) DO NOTHING;

-- Step 4: Verify the seed
SELECT 
    season,
    COUNT(*) as fbs_teams
FROM team_membership
WHERE level = 'fbs'
  AND season IN (2024, 2025)
GROUP BY season
ORDER BY season;

-- Should show counts like:
-- 2024: ~130 teams
-- 2025: ~130-136 teams (depending on if Delaware/Missouri State are included)

