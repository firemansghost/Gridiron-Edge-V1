# Workflow Dependency Order

## Logical Execution Order

For a complete data pipeline, workflows should run in this order:

### 1. **Foundation Data** (Run Once Per Season or Weekly)
- **Team Membership Seed** (`seed-team-membership.ts`)
  - Prerequisite: None
  - Purpose: Populate `team_membership` table with FBS teams for the season
  - Frequency: Once at start of season
  - ⚠️ **No workflow yet** - run manually or add to setup

- **Roster Talent Sync** (`talent-roster-sync.yml`)
  - Prerequisite: Team membership
  - Purpose: Fetch roster talent composite (Team Talent Composite)
  - Frequency: Once per season (before ratings start), or monthly during season
  - Data: `team_season_talent` table

- **Recruiting Commits Sync** (`talent-commits-sync.yml`)
  - Prerequisite: Team membership
  - Purpose: Fetch recruiting class commits
  - Frequency: Once per season (recruiting data is static), or monthly
  - Data: `team_class_commits` table

### 2. **Game & Schedule Data** (Run Daily/Weekly)
- **Schedules Ingest** (`nightly-ingest.yml` → `ingest-schedules`)
  - Prerequisite: Team membership
  - Purpose: Fetch game schedules from CFBD or mock data
  - Frequency: Daily (for current week) or weekly
  - Data: `games` table

### 3. **Statistical Data** (Run Weekly, After Games Complete)
- **Season Stats Sync** (CFBD `/stats/season` endpoint)
  - ⚠️ **No workflow yet** - should run weekly after games
  - Purpose: Aggregate season-level statistics
  - Data: `team_season_stats` table
  - Prerequisite: Games exist

- **Game Stats Sync** (CFBD `/stats/game/advanced` endpoint)
  - ⚠️ **No workflow yet** - should run weekly after games
  - Purpose: Individual game advanced statistics
  - Data: `team_game_stats` table
  - Prerequisite: Games exist

### 4. **Ratings Calculation** (Run After Stats Available)
- **Ratings v1/v2** (`nightly-ingest.yml` → `calculate-ratings`)
  - Prerequisites:
    - ✅ Schedules (games exist)
    - ✅ Team membership (FBS teams defined)
    - ✅ Season stats OR game stats (for features)
    - ✅ **Talent data** (after Phase 3 integration)
  - Frequency: Daily (recalculates with new data)
  - Data: `team_season_rating` table

### 5. **Auxiliary Data** (Can Run in Parallel)
- **Odds Ingest** (`nightly-ingest.yml` → `ingest-odds`)
  - Prerequisite: Schedules (games exist)
  - Frequency: Daily
  - Can run in parallel with ratings

- **Weather Ingest** (`nightly-ingest.yml` → `ingest-weather`)
  - Prerequisite: Schedules (games exist)
  - Frequency: Daily
  - Can run in parallel with ratings

- **Injury Ingest** (`nightly-ingest.yml` → `ingest-injuries`)
  - Prerequisite: Schedules (games exist)
  - Frequency: Daily
  - Can run in parallel with ratings

## Current Workflow Status

### ✅ Integrated in `nightly-ingest.yml`:
1. `ingest-schedules` - ✅ Daily
2. `ingest-odds` - ✅ Daily (depends on schedules)
3. `ingest-weather` - ✅ Daily (depends on schedules)
4. `ingest-injuries` - ✅ Daily (depends on schedules)
5. `calculate-ratings` - ✅ Daily (depends on schedules + odds)

### ⚠️ Separate Workflows (Not Integrated):
- `talent-roster-sync.yml` - Runs yearly in February (manual trigger)
- `talent-commits-sync.yml` - Runs yearly in February (manual trigger)

### ❌ Missing Workflows:
- Season stats sync (CFBD `/stats/season`)
- Game stats sync (CFBD `/stats/game/advanced`)
- Team membership seed (one-time per season)

## Recommendations

### Option 1: Integrate Talent Syncs into Nightly Ingest (Recommended)
- Add `sync-talent` and `sync-commits` jobs to `nightly-ingest.yml`
- Make them conditional (run once per season, or weekly)
- Set as dependencies for `calculate-ratings`
- **Pros**: Automatic, ensures data exists before ratings
- **Cons**: Adds time to nightly run (but talent syncs are fast ~30 seconds)

### Option 2: Keep Separate, Add Dependency Check
- Keep talent workflows separate
- Add validation step in `calculate-ratings` that checks if talent data exists
- If missing, fail with clear message
- **Pros**: Keeps workflows focused
- **Cons**: Manual coordination required

### Option 3: Pre-Season Setup Workflow
- Create a one-time "Season Setup" workflow
- Runs: Team membership seed → Talent syncs → Commits syncs
- Trigger manually at start of season
- **Pros**: Clear separation of one-time vs daily tasks
- **Cons**: Easy to forget to run

## Recommended Implementation (Phase 3)

For Phase 3, integrate talent syncs into `nightly-ingest.yml` with these conditions:

1. **Talent/Commits Sync** (new jobs in nightly-ingest):
   - Run condition: If talent data is missing OR it's been >30 days since last sync
   - Dependencies: None (can run in parallel with schedules)
   - Execution: Check DB first, skip if recent data exists

2. **Ratings Calculation**:
   - Dependencies: Add `sync-talent` and `sync-commits` as dependencies
   - This ensures talent data exists before ratings calculate

3. **Season Stats** (future enhancement):
   - Add weekly job that runs after games complete
   - Populates `team_season_stats` from CFBD

## Example Workflow Structure (After Integration)

```yaml
jobs:
  ingest-schedules:
    # ... existing ...

  sync-talent:
    needs: []  # Can run independently
    # Run if: talent data missing OR >30 days old
    # Fetch: team_season_talent

  sync-commits:
    needs: []  # Can run independently
    # Run if: commits data missing OR >30 days old
    # Fetch: team_class_commits

  ingest-odds:
    needs: [ingest-schedules]
    # ... existing ...

  calculate-ratings:
    needs: [ingest-schedules, sync-talent, sync-commits]
    # Now guaranteed to have talent data
```

