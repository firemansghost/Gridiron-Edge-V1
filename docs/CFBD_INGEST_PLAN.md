# CFBD Feature Ingest Plan

## Overview

Ingest advanced football statistics from College Football Data (CFBD) API to provide the model with features that markets actually price: efficiency, explosiveness, finishing drives, pace, and priors.

**Target**: 95% coverage for odds-eligible games (Weeks 1-11, 2025; include 2024 if convenient)

## Data Sources

### 1. Advanced Efficiency Stats

**Endpoints**:
- `/stats/season/advanced` - Team-season aggregates
- `/stats/game/advanced` - Game-level stats

**Key Metrics**:
- **EPA** (Expected Points Added): Off/Def, overall and by down (early/late)
- **Success Rate**: % of plays with positive EPA
- **Explosiveness (isoPPP)**: Average EPA on successful plays
- **Points per Opportunity**: Scoring efficiency
- **Line Yards**: Offensive line performance
- **Stuff Rate**: % of runs stopped at or behind line
- **Power Success**: % of short-yardage conversions
- **Havoc**: % of plays with TFL, INT, or PBU
- **Run/Pass Splits**: EPA, success rate, explosiveness by play type
- **Field Position**: Average starting field position

**Rate Limits**: 1000 requests/day (free tier), 10,000/day (paid)
**Params**: `year`, `team`, `week` (optional), `seasonType` (regular/postseason)

### 2. PPA (Points per Attempt) Metrics

**Endpoints**:
- `/ppa/players/season` - Player-level PPA (aggregate to team)
- `/ppa/games` - Game-level PPA

**Use Case**: Build recency-weighted form without full play-by-play

**Rate Limits**: Same as above
**Params**: `year`, `team`, `week` (optional)

### 3. Drives Data

**Endpoint**: `/drives`

**Key Metrics**:
- **Pace**: Plays per minute, seconds per snap
- **Scoring Opportunities per Drive**: Red-zone trips
- **Points per Opportunity**: Finishing efficiency
- **Average Starting Field Position**: Drive start location

**Rate Limits**: Same as above
**Params**: `year`, `team`, `week` (optional), `seasonType`

### 4. Priors (Talent & Returning Production)

**Talent Endpoint**: `/talent`
- **247 Composite**: Team talent rating
- **Blue Chip %**: % of roster with 4-5 star recruits

**Returning Production Endpoint**: `/player/returning`
- **Offensive Returning Production**: % of production returning
- **Defensive Returning Production**: % of production returning

**Rate Limits**: Same as above
**Params**: `year`, `team`

### 5. Weather Data

**Endpoint**: `/games/weather` (or use existing weather table)

**Metrics**: Temperature, wind speed, precipitation probability

**Use Case**: Context/sanity checks, not primary features

## Database Schema

### Tables to Create/Extend

#### `cfbd_advanced_season`
```sql
CREATE TABLE cfbd_advanced_season (
  id TEXT PRIMARY KEY,
  season INT NOT NULL,
  team_id TEXT NOT NULL,
  team_cfbd TEXT, -- CFBD team name for mapping
  offense_epa DECIMAL,
  defense_epa DECIMAL,
  offense_success_rate DECIMAL,
  defense_success_rate DECIMAL,
  offense_explosiveness DECIMAL,
  defense_explosiveness DECIMAL,
  points_per_opportunity_off DECIMAL,
  points_per_opportunity_def DECIMAL,
  line_yards DECIMAL,
  stuff_rate DECIMAL,
  power_success DECIMAL,
  havoc_off DECIMAL,
  havoc_def DECIMAL,
  -- Run/Pass splits
  run_epa DECIMAL,
  pass_epa DECIMAL,
  run_success_rate DECIMAL,
  pass_success_rate DECIMAL,
  -- Early/Late downs
  early_down_epa DECIMAL,
  late_down_epa DECIMAL,
  -- Field position
  avg_field_position DECIMAL,
  -- Metadata
  as_of TIMESTAMP,
  source TEXT DEFAULT 'cfbd',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(season, team_id)
);
```

#### `cfbd_advanced_game`
```sql
CREATE TABLE cfbd_advanced_game (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL, -- Join to internal game
  season INT NOT NULL,
  week INT NOT NULL,
  team_id TEXT NOT NULL,
  opponent_id TEXT NOT NULL,
  home_away TEXT, -- 'home' or 'away'
  -- Same metrics as season but game-level
  offense_epa DECIMAL,
  defense_epa DECIMAL,
  -- ... (same fields as season)
  as_of TIMESTAMP,
  source TEXT DEFAULT 'cfbd',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(game_id, team_id)
);
```

#### `cfbd_ppa_season`
```sql
CREATE TABLE cfbd_ppa_season (
  id TEXT PRIMARY KEY,
  season INT NOT NULL,
  team_id TEXT NOT NULL,
  team_cfbd TEXT,
  ppa_offense DECIMAL,
  ppa_defense DECIMAL,
  ppa_overall DECIMAL,
  as_of TIMESTAMP,
  source TEXT DEFAULT 'cfbd',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(season, team_id)
);
```

#### `cfbd_ppa_game`
```sql
CREATE TABLE cfbd_ppa_game (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  season INT NOT NULL,
  week INT NOT NULL,
  team_id TEXT NOT NULL,
  opponent_id TEXT NOT NULL,
  ppa_offense DECIMAL,
  ppa_defense DECIMAL,
  as_of TIMESTAMP,
  source TEXT DEFAULT 'cfbd',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(game_id, team_id)
);
```

#### `cfbd_drives`
```sql
CREATE TABLE cfbd_drives (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  season INT NOT NULL,
  week INT NOT NULL,
  team_id TEXT NOT NULL,
  opponent_id TEXT NOT NULL,
  drives_count INT,
  plays_per_minute DECIMAL,
  seconds_per_snap DECIMAL,
  scoring_opps_per_drive DECIMAL,
  points_per_opp DECIMAL,
  avg_starting_field_position DECIMAL,
  redzone_trips INT,
  as_of TIMESTAMP,
  source TEXT DEFAULT 'cfbd',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(game_id, team_id)
);
```

#### `cfbd_talent`
```sql
CREATE TABLE cfbd_talent (
  id TEXT PRIMARY KEY,
  season INT NOT NULL,
  team_id TEXT NOT NULL,
  team_cfbd TEXT,
  talent_composite DECIMAL, -- 247 Composite
  blue_chip_pct DECIMAL,
  as_of TIMESTAMP,
  source TEXT DEFAULT 'cfbd',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(season, team_id)
);
```

#### `cfbd_returning_production`
```sql
CREATE TABLE cfbd_returning_production (
  id TEXT PRIMARY KEY,
  season INT NOT NULL,
  team_id TEXT NOT NULL,
  team_cfbd TEXT,
  returning_offense_pct DECIMAL,
  returning_defense_pct DECIMAL,
  as_of TIMESTAMP,
  source TEXT DEFAULT 'cfbd',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(season, team_id)
);
```

## Team Mapping

**Critical**: CFBD uses different team names/IDs than our internal system.

**Strategy**:
1. Maintain explicit mapping table: `cfbd_team_mapping`
   - `cfbd_name` → `internal_team_id`
   - `cfbd_id` (if available) → `internal_team_id`
2. Use existing `team_aliases_cfbd.yml` if available
3. Log all mismatches to `reports/team_mapping_mismatches.csv`
4. Manual review required for any unmatched teams

**Mapping Table**:
```sql
CREATE TABLE cfbd_team_mapping (
  cfbd_name TEXT PRIMARY KEY,
  cfbd_id TEXT,
  internal_team_id TEXT NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Ingest Workflow

### Step 1: Team Mapping
1. Fetch all CFBD teams for season
2. Match against internal teams using:
   - Exact name match
   - Alias file (`team_aliases_cfbd.yml`)
   - Fuzzy matching (fallback)
3. Log mismatches for manual review

### Step 2: Season-Level Data (Talent, Returning Production, Advanced Season)
1. For each team in mapping:
   - Fetch talent data
   - Fetch returning production
   - Fetch advanced season stats
2. Store with `as_of` timestamp
3. Handle rate limits (1000/day free, 10k/day paid)

### Step 3: Game-Level Data (Advanced Game, PPA Game, Drives)
1. For each game in Weeks 1-11:
   - Fetch advanced game stats (both teams)
   - Fetch PPA game stats (both teams)
   - Fetch drives data (both teams)
2. Join to internal `game_id` via team mapping
3. Store with `as_of` timestamp

### Step 4: Completeness Check
1. For each odds-eligible game:
   - Check if all required feature blocks are present
   - Compute completeness % per block
   - Target: ≥95% overall

## Rate Limit Handling

**Free Tier**: 1000 requests/day
- Season-level: ~136 teams × 3 endpoints = 408 requests
- Game-level: ~2000 games × 3 endpoints × 2 teams = 12,000 requests
- **Total**: ~12,400 requests → **Requires paid tier or multi-day backfill**

**Paid Tier**: 10,000 requests/day
- Can complete in 2 days with batching

**Strategy**:
1. Batch requests (e.g., 50 teams at a time)
2. Add delays between batches (respect rate limits)
3. Retry with exponential backoff on 429 errors
4. Cache responses to avoid duplicate requests

## Join Keys & Hygiene

**Keys**:
- Season-level: `(season, team_id)` or `(season, team_cfbd)`
- Game-level: `(game_id, team_id)` or `(season, week, team_cfbd)`

**Hygiene**:
- Enforce NOT NULL on join keys
- Record `as_of` timestamp for all rows
- Record `source` (always 'cfbd')
- Handle missing/null values gracefully (store as NULL, not 0)

## Completeness Metrics

**Target**: ≥95% of odds-eligible games have complete feature rows

**Blocks**:
1. Advanced Season (team-level)
2. Advanced Game (game-level)
3. PPA Season (team-level)
4. PPA Game (game-level)
5. Drives (game-level)
6. Talent (team-level, season-level)
7. Returning Production (team-level, season-level)
8. Weather (game-level, optional)

**Report Format** (`reports/feature_completeness.csv`):
```
feature_block,season,week,games_total,games_complete,completeness_pct
advanced_season,2025,all,136,136,100.0
advanced_game,2025,8,58,56,96.6
ppa_season,2025,all,136,135,99.3
...
```

## Deliverables

1. **`docs/CFBD_INGEST_PLAN.md`** (this document)
2. **`reports/feature_completeness.csv`** (overall + by feature block)
3. **`reports/team_mapping_mismatches.csv`** (should be empty or each mismatch explained)

## Implementation Notes

- Use existing CFBD adapter pattern if available
- Store raw API responses for debugging
- Implement idempotent upserts (don't duplicate on re-run)
- Add data quality checks (e.g., EPA should be reasonable range)
- Log all API errors and retries

## Next Steps

1. Create database schema (migrations)
2. Build team mapping layer
3. Implement CFBD API client with rate limiting
4. Run ingest for 2025 Weeks 1-11
5. Generate completeness report
6. Fix any mapping mismatches
7. Re-run completeness check until ≥95%

