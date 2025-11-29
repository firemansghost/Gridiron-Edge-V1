# Workflow Overview

This document provides a comprehensive overview of all GitHub Actions workflows in the Gridiron Edge repository. These workflows handle data ingestion, ratings computation, bet grading, and database migrations.

---

## 1. GitHub Actions Workflows

### Nightly Ingest + Ratings (`.github/workflows/nightly-ingest.yml`)

- **Triggers:**
  - `schedule`: Every night at 7:00 UTC (2:00 AM CST / 1:00 AM CDT) - `cron: '0 7 * * *'`
  - `workflow_dispatch`: Manual trigger with optional week input

- **Purpose:** Complete nightly data refresh and rating recomputation for the current season. This is the primary automated pipeline that keeps the production database up-to-date.

- **Key steps:**
  - **ingest-schedules:** 
    - `node apps/jobs/dist/ingest.js cfbd --season 2025 --weeks $POLL_WEEK` → Ingest schedules from CFBD API
    - Falls back to `node apps/jobs/ingest-simple.js mock` if no CFBD key
  - **ingest-odds:**
    - `node apps/jobs/dist/ingest-minimal.js oddsapi --season 2025 --weeks $POLL_WEEK` → Fetch odds from Odds API (primary)
    - Falls back to `node apps/jobs/ingest-simple.js sgo` if Odds API unavailable
  - **ingest-weather:**
    - `node apps/jobs/dist/ingest.js weatherVc --season 2025 --weeks $POLL_WEEK` → Fetch weather data from Visual Crossing
  - **sync-talent:**
    - `node apps/jobs/dist/src/talent/cfbd_team_roster_talent.js --season 2025` → Sync roster talent (conditional, only if data >30 days old)
  - **sync-commits:**
    - `node apps/jobs/dist/src/talent/cfbd_team_class_commits.js --season 2025` → Sync recruiting class commits (conditional, only if data >30 days old)
  - **ingest-injuries:**
    - `node apps/jobs/dist/ingest.js espn-injuries --season 2025 --weeks $POLL_WEEK` → Fetch injury data from ESPN
  - **calculate-ratings:**
    - `node apps/jobs/dist/seed-ratings.js` → Compute power ratings and implied lines

- **Data / systems touched:** CFBD API, Odds API, SGO API, Visual Crossing Weather API, ESPN, Supabase database

- **Notes:** 
  - Uses concurrency control to prevent multiple runs
  - Calculates current week dynamically from database
  - All jobs depend on `ingest-schedules` completing first
  - Ratings calculation depends on all data ingestion jobs

---

### V3 Totals Nightly (`.github/workflows/v3-totals-nightly.yml`)

- **Triggers:**
  - `schedule`: Every night at 8:00 UTC (2:00 AM CST / 1:00 AM CDT) - `cron: '0 8 * * *'`
  - `workflow_dispatch`: Manual trigger with optional season and week inputs

- **Purpose:** Keep V3 Drive-Based Totals model data fresh by syncing drive stats and generating V3 totals bets for the current week. Runs after nightly-ingest to ensure stats are up-to-date.

- **Key steps:**
  - **sync-v3-totals:**
    - `npx tsx apps/jobs/src/sync-drives.ts --season $SEASON` → Ingest/refresh drive stats from CFBD API
    - `npx tsx apps/web/scripts/sync-v3-bets.ts $SEASON $POLL_WEEK` → Generate V3 totals bets for current week

- **Data / systems touched:** CFBD API (drive data), Supabase database (TeamSeasonStat.drive_stats, Bet table with v3_totals strategy)

- **Notes:** 
  - Runs 1 hour after nightly-ingest (8:00 UTC vs 7:00 UTC) to ensure stats are fresh
  - Uses concurrency control to prevent multiple runs
  - Calculates current week dynamically from database (same pattern as nightly-ingest)
  - Only touches V3-related scripts; does not re-run odds/schedules/weather/rankings
  - Requires CFBD_API_KEY for drive stats sync

---

### Ratings v1 Computation (`.github/workflows/ratings-v1.yml`)

- **Triggers:**
  - `workflow_dispatch`: Manual trigger only, with season input (default: 2025)

- **Purpose:** Compute V1 power ratings for a specific season. Used for manual recalculation or backtesting.

- **Key steps:**
  - `npm run test:ratings:v1` → Run unit tests
  - `node apps/jobs/dist/src/ratings/compute_ratings_v1.js --season=$SEASON` → Compute V1 ratings
  - Verification queries to ensure ≥98% coverage of FBS teams

- **Data / systems touched:** Supabase database (team_season_ratings table)

- **Notes:** 
  - Requires DATABASE_URL and DIRECT_URL secrets
  - Validates that ratings were computed for at least 98% of FBS teams
  - Shows summary and sample ratings after completion

---

### Ratings v2 Computation (`.github/workflows/ratings-v2.yml`)

- **Triggers:**
  - `workflow_dispatch`: Manual trigger only, with season input (default: 2025)

- **Purpose:** Compute V2 power ratings (with SoS adjustments and shrinkage regularization) for a specific season.

- **Key steps:**
  - `node apps/jobs/dist/src/ratings/compute_ratings_v2.js --season=$SEASON` → Compute V2 ratings
  - Verification queries to ensure ≥98% coverage with `model_version='v2'`

- **Data / systems touched:** Supabase database (team_season_ratings table with model_version='v2')

- **Notes:** 
  - Similar structure to V1 workflow but writes to V2 model version
  - No unit tests (unlike V1 workflow)

---

### Grade Bets (`.github/workflows/grade-bets.yml`)

- **Triggers:**
  - `schedule`: 
    - Hourly on Saturday and Sunday - `cron: '0 * * * 6,0'`
    - Nightly at 3:00 UTC on weekdays - `cron: '0 3 * * 1-5'`
  - `workflow_dispatch`: Manual trigger with optional season/week inputs and force flag

- **Purpose:** Grade bets (win/loss/push) based on final game scores. Runs frequently during game days to catch completed games quickly.

- **Key steps:**
  - `npm run grade:bets -- $ARGS` → Grade bets (calls `node apps/jobs/dist/grade-bets.js`)

- **Data / systems touched:** Supabase database (Bet table, Game table for scores)

- **Notes:** 
  - Uses concurrency control to prevent overlapping runs
  - Supports optional season/week filtering and force regrade flag
  - Runs hourly on weekends when most games finish

---

### CFBD Scores Sync (`.github/workflows/cfbd-scores-sync.yml`)

- **Triggers:**
  - `schedule`: 
    - Every 2 hours on Friday-Sunday (game days) - `cron: '0 0,2,4,6,8,10,12,14,16,18,20,22 * * 5,6,0'`
    - Nightly at 2:00 AM UTC - `cron: '0 2 * * *'`
  - `workflow_dispatch`: Manual trigger with season/weeks/force inputs

- **Purpose:** Sync final game scores from CFBD API. Updates games with homeScore/awayScore and sets status='final'.

- **Key steps:**
  - `node apps/jobs/dist/src/cfbd-game-results.js --season $SEASON --weeks $WEEKS` → Sync scores from CFBD

- **Data / systems touched:** CFBD API, Supabase database (Game table)

- **Notes:** 
  - Runs frequently on game days to catch score updates quickly
  - Supports force flag to update games even if already marked final
  - Requires CFBD_API_KEY secret

---

### CFBD Rankings Sync (`.github/workflows/cfbd-rankings-sync.yml`)

- **Triggers:**
  - `schedule`: Every Monday at 9:00 UTC (3:00 AM CST) - `cron: '0 9 * * 1'`
  - `workflow_dispatch`: Manual trigger with season/weeks inputs

- **Purpose:** Sync weekly rankings (AP Poll, Coaches Poll, etc.) from CFBD API.

- **Key steps:**
  - `node apps/jobs/dist/src/rankings/cfbd_rankings_etl.js --season $SEASON --weeks "$WEEKS"` → Sync rankings
  - Verification query to show poll types and week ranges

- **Data / systems touched:** CFBD API, Supabase database (team_rankings table)

- **Notes:** 
  - Runs weekly on Monday when rankings are typically updated
  - Supports "all" weeks or comma-separated week list
  - Does not cancel in-progress runs (allows multiple concurrent syncs)

---

### CFBD Feature Ingest (`.github/workflows/cfbd-feature-ingest.yml`)

- **Triggers:**
  - `workflow_dispatch`: Manual trigger only, with extensive inputs (season, weeks, endpoints, dry_run, max_concurrency)

- **Purpose:** Ingest CFBD feature data (teamSeason, teamGame, priors) for specified weeks. Uses matrix strategy to process multiple weeks in parallel.

- **Key steps:**
  - `npx tsx scripts/backfill-cfbd-season-stats.ts` → Backfill season stats (if teamSeason in endpoints)
  - `npx tsx apps/jobs/src/cfbd/ingest-cfbd-features.ts --season $SEASON --weeks $WEEK --endpoints "$ENDPOINTS"` → Ingest features per week (matrix job)
  - `npx tsx scripts/check-cfbd-gates.ts` → Check data quality gates
  - `npx tsx scripts/generate-cfbd-summary.ts` → Generate job summary

- **Data / systems touched:** CFBD API, Supabase database (cfbd_* tables)

- **Notes:** 
  - Uses matrix strategy to process weeks in parallel (configurable concurrency)
  - Uploads artifacts (CSV reports) for each week
  - Includes gate checking and summary generation
  - Supports dry-run mode

---

### CFBD Team Stats Sync (`.github/workflows/stats-cfbd.yml`)

- **Triggers:**
  - `workflow_dispatch`: Manual trigger only (schedule is commented out/disabled)

- **Purpose:** Sync per-game team stats from CFBD API. Currently disabled from scheduled runs (per-game stats not needed for ratings which use season stats).

- **Key steps:**
  - `node apps/jobs/dist/src/stats/cfbd_team_stats.js --season $SEASON --weeks $WEEKS` → Sync team game stats

- **Data / systems touched:** CFBD API, Supabase database (team_game_stats table)

- **Notes:** 
  - Schedule is commented out with note: "Per-game stats not needed for ratings"
  - Kept for manual use if needed for game-level analysis
  - Uses Node 18 (older version than most workflows)

---

### CFBD Team Season Stats Sync (`.github/workflows/stats-season-cfbd.yml`)

- **Triggers:**
  - `schedule`: Nightly at 2:00 AM UTC - `cron: '0 2 * * *'`
  - `workflow_dispatch`: Manual trigger with season input

- **Purpose:** Sync season-aggregated team stats from CFBD API. These are the stats used for power ratings.

- **Key steps:**
  - `node apps/jobs/dist/src/stats/cfbd_team_season_stats.js --season=$SEASON` → Sync season stats
  - Verification queries to check row counts and advanced stats fill rates

- **Data / systems touched:** CFBD API, Supabase database (team_season_stats table)

- **Notes:** 
  - Validates that row count matches expected FBS team count
  - Checks fill rates for advanced stats (success_off, epa_off)
  - Runs nightly to keep season stats current

---

### CFBD Advanced Stats Sync (`.github/workflows/stats-advanced-cfbd.yml`)

- **Triggers:**
  - `schedule`: Nightly at 3:00 AM UTC - `cron: '0 3 * * *'`
  - `workflow_dispatch`: Manual trigger with season input

- **Purpose:** Sync advanced stats (success rate, EPA) derived from game-level data. Runs after season stats sync.

- **Key steps:**
  - `node apps/jobs/dist/src/stats/season_from_game_advanced.js --season=$SEASON` → Compute advanced stats from game data

- **Data / systems touched:** Supabase database (team_season_stats table, advanced stats columns)

- **Notes:** 
  - Runs after season stats sync (3 AM vs 2 AM)
  - Populates success_off, epa_off, and other advanced metrics
  - Uses Node 18

---

### CFBD Team Talent Sync (`.github/workflows/talent-cfbd.yml`)

- **Triggers:**
  - `schedule`: Yearly on February 1st at 2:00 AM UTC - `cron: '0 2 1 2 *'`
  - `workflow_dispatch`: Manual trigger with season input

- **Purpose:** Sync roster talent composite data from CFBD API. Runs yearly during recruiting season.

- **Key steps:**
  - `node apps/jobs/dist/src/talent/cfbd_team_roster_talent.js --season $SEASON` → Sync roster talent

- **Data / systems touched:** CFBD API, Supabase database (team_season_talent table)

- **Notes:** 
  - Yearly schedule aligns with recruiting season
  - Uses Node 18
  - Also called by nightly-ingest workflow (conditional, only if data >30 days old)

---

### CFBD Team Class Commits Sync (`.github/workflows/talent-commits-sync.yml`)

- **Triggers:**
  - `schedule`: Yearly on February 1st at 3:00 AM UTC - `cron: '0 3 1 2 *'`
  - `workflow_dispatch`: Manual trigger with season input

- **Purpose:** Sync recruiting class commit data from CFBD API. Runs yearly during recruiting season.

- **Key steps:**
  - `node apps/jobs/dist/src/talent/cfbd_team_class_commits.js --season $SEASON` → Sync class commits

- **Data / systems touched:** CFBD API, Supabase database (team_class_commits table)

- **Notes:** 
  - Yearly schedule aligns with recruiting season
  - Also called by nightly-ingest workflow (conditional, only if data >30 days old)

---

### CFBD Team Roster Talent Sync (`.github/workflows/talent-roster-sync.yml`)

- **Triggers:**
  - `schedule`: Yearly on February 1st at 2:00 AM UTC - `cron: '0 2 1 2 *'`
  - `workflow_dispatch`: Manual trigger with season input

- **Purpose:** Sync roster talent data from CFBD API. Appears to be a duplicate/alternative to `talent-cfbd.yml` workflow.

- **Key steps:**
  - `node apps/jobs/dist/src/talent/cfbd_team_roster_talent.js --season $SEASON` → Sync roster talent

- **Data / systems touched:** CFBD API, Supabase database (team_season_talent table)

- **Notes:** 
  - **Potential Issue:** This workflow appears to be a duplicate of `talent-cfbd.yml` - both sync the same data using the same script
  - Uses Node 20 (newer than talent-cfbd.yml which uses Node 18)
  - Consider consolidating these workflows

---

### Historical Odds Backfill (`.github/workflows/backfill-odds-historical.yml`)

- **Triggers:**
  - `workflow_dispatch`: Manual trigger only, with extensive inputs (season, weeks, markets, regions, credits_limit, dry_run, etc.)

- **Purpose:** Backfill historical odds data from Odds API for past seasons/weeks. Used for data recovery or initial population.

- **Key steps:**
  - Extensive validation steps (team aliases, FBS index, denylist checks)
  - `node apps/jobs/dist/ingest-minimal.js oddsapi --season "$SEASON" --weeks "$WEEKS"` → Backfill odds
  - `npx tsx scripts/check-odds-gates.ts` → Check data quality gates
  - `npx tsx scripts/phase2-consensus-coverage.ts` → Generate coverage report

- **Data / systems touched:** Odds API, Supabase database (market_line table)

- **Notes:** 
  - Includes extensive pre-flight validation
  - Supports credits limit to control API usage
  - Supports historical strict mode and season fallback
  - Uploads artifacts (reports) after completion

---

### Backfill Scores 2025 (`.github/workflows/backfill-scores-2025.yml`)

- **Triggers:**
  - `workflow_dispatch`: Manual trigger only, with season/weeks/force inputs

- **Purpose:** Backfill final game scores for past weeks. Used to populate historical data for bet grading.

- **Key steps:**
  - `node apps/jobs/dist/src/cfbd-game-results.js --season $SEASON --weeks $WEEKS` → Backfill scores
  - Verification query to check completion rate

- **Data / systems touched:** CFBD API, Supabase database (Game table)

- **Notes:** 
  - Similar to CFBD Scores Sync but for historical backfill
  - Includes verification step to show completion rate
  - Supports force flag

---

### Prisma Schema Guardrails (`.github/workflows/prisma-guardrails.yml`)

- **Triggers:**
  - `pull_request`: On PRs to main branch

- **Purpose:** Validate Prisma schema changes and ensure migrations are included when schema changes.

- **Key steps:**
  - `npx prisma format --schema=prisma/schema.prisma` → Format schema
  - `npx prisma validate --schema=prisma/schema.prisma` → Validate schema
  - Check that migrations exist if schema changed

- **Data / systems touched:** None (validation only, no DB connection)

- **Notes:** 
  - Prevents schema changes without migrations
  - Uses dummy DATABASE_URL for validation (doesn't connect to real DB)

---

### Prisma Migrate (`.github/workflows/prisma-migrate.yml`)

- **Triggers:**
  - `workflow_dispatch`: Manual trigger
  - `push`: On pushes to main branch when prisma/** files change

- **Purpose:** Deploy Prisma migrations to production database.

- **Key steps:**
  - Wait for database connectivity (pooled and direct connections)
  - Clean up problematic migration (`20251027_t6q_fixup_missing_teams`)
  - `npx prisma migrate deploy --schema=prisma/schema.prisma` → Deploy migrations
  - `npx prisma generate --schema=prisma/schema.prisma` → Generate Prisma client

- **Data / systems touched:** Supabase database (migrations table, schema changes)

- **Notes:** 
  - Includes workaround for a specific problematic migration
  - Waits for both pooled (6543) and direct (5432) connections
  - Runs automatically on schema changes to main branch

---

## 2. Related Jobs / Scripts

### Job Scripts (apps/jobs/dist/)

The following compiled job scripts are called by workflows:

- **`ingest.js`** – Main ingestion orchestrator (schedules, odds, weather, injuries)
- **`ingest-minimal.js`** – Minimal odds ingestion (used by backfill workflows)
- **`ingest-simple.js`** – Simple fallback ingestion (mock data, SGO)
- **`seed-ratings.js`** – Compute power ratings and implied lines
- **`grade-bets.js`** – Grade bets based on final scores
- **`src/cfbd-game-results.js`** – Sync game scores from CFBD
- **`src/rankings/cfbd_rankings_etl.js`** – Sync rankings from CFBD
- **`src/stats/cfbd_team_stats.js`** – Sync per-game team stats
- **`src/stats/cfbd_team_season_stats.js`** – Sync season-aggregated stats
- **`src/stats/season_from_game_advanced.js`** – Compute advanced stats from game data
- **`src/talent/cfbd_team_roster_talent.js`** – Sync roster talent
- **`src/talent/cfbd_team_class_commits.js`** – Sync recruiting class commits
- **`src/ratings/compute_ratings_v1.js`** – Compute V1 power ratings
- **`src/ratings/compute_ratings_v2.js`** – Compute V2 power ratings
- **`src/cfbd/ingest-cfbd-features.ts`** – Ingest CFBD feature data (TypeScript, not compiled)

### NPM Scripts (package.json)

- **`build:jobs`** – Compile TypeScript jobs and copy assets (`tsc -p apps/jobs/tsconfig.build.json && node scripts/validate-aliases.mjs && node scripts/copy-job-assets-simple.mjs`)
- **`grade:bets`** – Grade bets (`node apps/jobs/dist/grade-bets.js`)
- **`prisma:generate`** – Generate Prisma client (`prisma generate --schema=prisma/schema.prisma`)
- **`db:generate`** – Alias for `prisma:generate`
- **`test:ratings:v1`** – Run V1 ratings unit tests (`jest apps/jobs/__tests__/compute_ratings_v1.test.ts`)

### Helper Scripts (scripts/)

- **`get-current-week.mjs`** – Calculate current week from database (used by nightly-ingest and V3 Totals Nightly)
- **`backfill-cfbd-season-stats.ts`** – Backfill season stats (used by CFBD Feature Ingest)
- **`check-cfbd-gates.ts`** – Check data quality gates for CFBD ingest
- **`generate-cfbd-summary.ts`** – Generate summary report for CFBD ingest
- **`check-odds-gates.ts`** – Check data quality gates for odds backfill
- **`phase2-consensus-coverage.ts`** – Generate consensus coverage report

### V3 Totals Scripts

- **`apps/jobs/src/sync-drives.ts`** – Ingest CFBD drive data and populate TeamSeasonStat.rawJson.drive_stats (used by V3 Totals Nightly)
- **`apps/web/scripts/sync-v3-bets.ts`** – Generate v3_totals strategy bets for a given season/week (used by V3 Totals Nightly)

---

## 3. Potential Issues / Follow-Ups

### Missing Scripts / Paths

- ✅ All referenced scripts appear to exist
- ✅ All NPM scripts are defined in package.json

### Workflow Issues

1. **Duplicate Talent Sync Workflows:**
   - `talent-cfbd.yml` and `talent-roster-sync.yml` both sync the same data using the same script
   - Both run on the same yearly schedule (Feb 1, 2 AM UTC)
   - **Recommendation:** Consolidate into a single workflow

2. **Disabled Schedule:**
   - `stats-cfbd.yml` has its schedule commented out with note "Per-game stats not needed for ratings"
   - This is intentional, but workflow is kept for manual use

3. **Node Version Inconsistency:**
   - Most workflows use Node 20
   - Some older workflows (`stats-cfbd.yml`, `stats-season-cfbd.yml`, `stats-advanced-cfbd.yml`, `talent-cfbd.yml`) use Node 18
   - **Recommendation:** Standardize on Node 20 for all workflows

4. **Prisma Migration Workaround:**
   - `prisma-migrate.yml` includes a workaround for problematic migration `20251027_t6q_fixup_missing_teams`
   - This suggests a technical debt item that should be resolved

### Workflow Dependencies

- **Nightly Ingest** is the primary pipeline and depends on multiple data sources
- **Ratings computation** depends on data ingestion completing first
- **Bet grading** depends on scores being synced (via CFBD Scores Sync or backfill)
- **CFBD Feature Ingest** is independent and can run in parallel with other workflows

### Cron Schedule Summary

- **Nightly (7:00 UTC):** Nightly Ingest + Ratings
- **Nightly (8:00 UTC):** V3 Totals Nightly (drive stats + V3 bets)
- **Nightly (2:00 UTC):** CFBD Team Season Stats Sync
- **Nightly (3:00 UTC):** CFBD Advanced Stats Sync, Grade Bets (weekdays)
- **Weekly (Monday 9:00 UTC):** CFBD Rankings Sync
- **Hourly (Sat/Sun):** Grade Bets
- **Every 2 hours (Fri-Sun):** CFBD Scores Sync
- **Yearly (Feb 1):** Talent sync workflows (2 AM and 3 AM UTC)

### For V4 Model Work

Before starting V4 model work, consider:

1. **Ratings Computation:**
   - V1 and V2 workflows exist and can be used as templates for V4
   - V4 will need its own workflow similar to `ratings-v1.yml` and `ratings-v2.yml`
   - Consider adding V4 to the nightly ingest pipeline if it becomes production

2. **Data Dependencies:**
   - V4 may require additional data sources (drive stats, red zone data, etc.)
   - Ensure any new data ingestion workflows are added to nightly pipeline
   - Consider if V4 needs its own scheduled computation or can run alongside V1/V2

3. **Testing:**
   - V1 workflow includes unit tests (`test:ratings:v1`)
   - V2 workflow does not include tests
   - Consider adding tests for V4 before making it production

4. **Database Schema:**
   - V4 may require new tables or columns
   - Ensure Prisma guardrails workflow will catch missing migrations
   - Plan migration strategy before deploying V4

---

## Summary

The repository has **17 active workflows** covering:

- **Data Ingestion:** Schedules, odds, weather, injuries, scores, stats, rankings, talent, drive stats
- **Ratings Computation:** V1 and V2 power ratings (V4 will need to be added)
- **Totals Model:** V3 Drive-Based Totals (nightly sync and bet generation)
- **Bet Management:** Bet grading (frequent during game days)
- **Database:** Schema validation and migration deployment
- **Backfills:** Historical odds and scores

The **Nightly Ingest + Ratings** workflow is the primary automated pipeline, running every night at 2:00 AM CST to keep production data current. Most other workflows are either scheduled for specific times (weekly rankings, yearly talent) or manual-only (backfills, feature ingest).

All workflows appear to reference valid scripts and paths. The main follow-up items are consolidating duplicate talent sync workflows and standardizing Node versions.


