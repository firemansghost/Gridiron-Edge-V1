-- Fix team_membership: Remove all entries and reseed with ONLY FBS teams
-- This ensures we only track actual FBS programs (not FCS or other divisions)

-- Step 1: Delete ALL existing entries for 2024 and 2025
DELETE FROM team_membership
WHERE season IN (2024, 2025);

-- Step 2: Insert only FBS teams for 2024
-- Using the canonical FBS team list from fbs_slugs.json
-- Note: Some IDs may vary (e.g., san-jose-state vs san-jos-state, fau vs florida-atlantic)
INSERT INTO team_membership (season, team_id, level)
SELECT 2024, id, 'fbs'
FROM teams
WHERE id IN (
  'air-force', 'akron', 'alabama', 'appalachian-state', 'arizona', 'arizona-state',
  'arkansas', 'arkansas-state', 'army', 'auburn', 'ball-state', 'baylor',
  'boise-state', 'boston-college', 'bowling-green', 'buffalo', 'byu', 'california',
  'central-michigan', 'charlotte', 'cincinnati', 'clemson', 'coastal-carolina',
  'colorado', 'colorado-state', 'connecticut', 'duke', 'east-carolina',
  'eastern-michigan', 'florida-atlantic', 'fau', 'florida-international', 'fiu',
  'florida', 'florida-state', 'fresno-state', 'georgia', 'georgia-southern',
  'georgia-state', 'georgia-tech', 'hawaii', 'houston', 'illinois', 'indiana',
  'iowa', 'iowa-state', 'james-madison', 'kansas', 'kansas-state', 'kent-state',
  'kennesaw-state', 'kentucky', 'liberty', 'louisiana', 'louisiana-monroe',
  'ul-monroe', 'louisiana-tech', 'louisville', 'lsu', 'marshall', 'maryland',
  'memphis', 'miami', 'miami-oh', 'michigan', 'michigan-state', 'middle-tennessee',
  'minnesota', 'mississippi-state', 'missouri', 'navy', 'nebraska', 'nevada',
  'new-mexico', 'new-mexico-state', 'north-carolina', 'north-texas',
  'northern-illinois', 'northwestern', 'notre-dame', 'ohio', 'ohio-state',
  'oklahoma', 'oklahoma-state', 'ole-miss', 'oregon', 'oregon-state',
  'penn-state', 'pittsburgh', 'purdue', 'rice', 'rutgers', 'sam-houston',
  'san-diego-state', 'san-jos-state', 'san-jose-state', 'smu', 'south-alabama',
  'south-carolina', 'south-florida', 'southern-miss', 'stanford', 'syracuse',
  'tcu', 'temple', 'tennessee', 'texas', 'texas-a-m', 'texas-am', 'texas-state',
  'texas-tech', 'toledo', 'troy', 'tulane', 'tulsa', 'ucf', 'ucla', 'unlv',
  'usc', 'utah', 'utah-state', 'utep', 'utsa', 'vanderbilt', 'virginia',
  'virginia-tech', 'wake-forest', 'washington', 'washington-state',
  'west-virginia', 'western-kentucky', 'western-michigan', 'wisconsin',
  'wyoming', 'nc-state'
)
AND id IS NOT NULL
ON CONFLICT (season, team_id) DO NOTHING;

-- Step 3: Insert only FBS teams for 2025 (same list + 2025 additions)
INSERT INTO team_membership (season, team_id, level)
SELECT 2025, id, 'fbs'
FROM teams
WHERE id IN (
  'air-force', 'akron', 'alabama', 'appalachian-state', 'arizona', 'arizona-state',
  'arkansas', 'arkansas-state', 'army', 'auburn', 'ball-state', 'baylor',
  'boise-state', 'boston-college', 'bowling-green', 'buffalo', 'byu', 'california',
  'central-michigan', 'charlotte', 'cincinnati', 'clemson', 'coastal-carolina',
  'colorado', 'colorado-state', 'connecticut', 'delaware', 'duke', 'east-carolina',
  'eastern-michigan', 'florida-atlantic', 'fau', 'florida-international', 'fiu',
  'florida', 'florida-state', 'fresno-state', 'georgia', 'georgia-southern',
  'georgia-state', 'georgia-tech', 'hawaii', 'houston', 'illinois', 'indiana',
  'iowa', 'iowa-state', 'james-madison', 'kansas', 'kansas-state', 'kent-state',
  'kennesaw-state', 'kentucky', 'liberty', 'louisiana', 'louisiana-monroe',
  'ul-monroe', 'louisiana-tech', 'louisville', 'lsu', 'marshall', 'maryland',
  'memphis', 'miami', 'miami-oh', 'michigan', 'michigan-state', 'middle-tennessee',
  'minnesota', 'mississippi-state', 'missouri', 'missouri-state', 'navy', 'nebraska',
  'nevada', 'new-mexico', 'new-mexico-state', 'north-carolina', 'north-texas',
  'northern-illinois', 'northwestern', 'notre-dame', 'ohio', 'ohio-state',
  'oklahoma', 'oklahoma-state', 'ole-miss', 'oregon', 'oregon-state',
  'penn-state', 'pittsburgh', 'purdue', 'rice', 'rutgers', 'sam-houston',
  'san-diego-state', 'san-jos-state', 'san-jose-state', 'smu', 'south-alabama',
  'south-carolina', 'south-florida', 'southern-miss', 'stanford', 'syracuse',
  'tcu', 'temple', 'tennessee', 'texas', 'texas-a-m', 'texas-am', 'texas-state',
  'texas-tech', 'toledo', 'troy', 'tulane', 'tulsa', 'ucf', 'ucla', 'unlv',
  'usc', 'utah', 'utah-state', 'utep', 'utsa', 'vanderbilt', 'virginia',
  'virginia-tech', 'wake-forest', 'washington', 'washington-state',
  'west-virginia', 'western-kentucky', 'western-michigan', 'wisconsin',
  'wyoming', 'nc-state'
)
AND id IS NOT NULL
ON CONFLICT (season, team_id) DO NOTHING;

-- Step 4: Verify - should show ~133 for 2024, ~135 for 2025
SELECT 
    season,
    COUNT(*) as fbs_teams
FROM team_membership
WHERE level = 'fbs'
  AND season IN (2024, 2025)
GROUP BY season
ORDER BY season;

-- Should now show:
-- 2024: ~133 teams (all FBS)
-- 2025: ~135 teams (all FBS + Delaware + Missouri State)

