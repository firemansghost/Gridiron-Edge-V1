# GitHub Workflows Guide

## Overview
This document provides recommendations for managing GitHub Actions workflows based on their purpose and usage patterns.

## Game Times / Schedules
**Answer:** The **"Nightly Ingest + Ratings"** workflow fetches game schedules (including times) from CFBD. Specifically:
- Job: `ingest-schedules`
- Step: "Ingest schedules via CFBD"
- Command: `node apps/jobs/ingest-simple.js cfbd --season 2025 --weeks $POLL_WEEK`

This workflow runs nightly at 2 AM CST and fetches schedules for the current week.

---

## Workflow Categories & Recommendations

### ✅ **KEEP ON AUTO-RUN** (Essential Production Workflows)

#### 1. **Nightly Ingest + Ratings** (`nightly-ingest.yml`)
- **Status**: ✅ **ENABLED** (runs nightly at 2 AM CST)
- **Purpose**: 
  - Fetches schedules from CFBD (game times)
  - Fetches odds from Odds API
  - Calculates ratings
- **Why keep**: Core pipeline that keeps data fresh daily
- **Recommendation**: ✅ Keep auto-run enabled

#### 2. **Prisma Migrate** (`prisma-migrate.yml`)
- **Status**: ✅ **AUTO-RUN** (on push to main when schema changes)
- **Purpose**: Applies database migrations automatically
- **Why keep**: Critical for deployments - ensures DB schema stays in sync
- **Recommendation**: ✅ Keep auto-run enabled

#### 3. **Prisma Guardrails** (`prisma-guardrails.yml`)
- **Status**: ✅ **AUTO-RUN** (on pull requests)
- **Purpose**: Validates Prisma schema format on PRs
- **Why keep**: Prevents bad schema changes from being merged
- **Recommendation**: ✅ Keep auto-run enabled

#### 4. **CFBD Scores Sync** (`cfbd-scores-sync.yml`)
- **Status**: ⚠️ **AUTO-RUN** (every 2 hours on Fri-Sun, nightly otherwise)
- **Purpose**: Updates game scores and final status
- **Why keep**: Keeps game results updated during game days
- **Recommendation**: ✅ Keep auto-run enabled (but you could reduce frequency if needed)

#### 5. **Grade Bets** (`grade-bets.yml`)
- **Status**: ⚠️ **AUTO-RUN** (hourly on weekends, nightly weekdays)
- **Purpose**: Grades bets based on game results
- **Why keep**: Automatically updates bet outcomes
- **Recommendation**: ✅ Keep auto-run enabled

---

### 🔄 **SEASONAL/PERIODIC AUTO-RUN** (Data Updates)

#### 6. **CFBD Team Season Stats Sync** (`stats-season-cfbd.yml`)
- **Status**: ⚠️ **AUTO-RUN** (nightly at 2 AM UTC)
- **Purpose**: Aggregates season-level stats (YPP, pace, etc.)
- **Why keep**: Needed for ratings calculations
- **Recommendation**: ✅ Keep auto-run enabled (runs after games complete)

#### 7. **CFBD Advanced Stats Sync** (`stats-advanced-cfbd.yml`)
- **Status**: ⚠️ **AUTO-RUN** (nightly at 3 AM UTC)
- **Purpose**: Aggregates advanced stats (success rate, EPA)
- **Why keep**: Enhances ratings accuracy
- **Recommendation**: ✅ Keep auto-run enabled (runs after season stats)

#### 8. **CFBD Team Talent Sync** (`talent-cfbd.yml`)
- **Status**: ⚠️ **AUTO-RUN** (yearly in February)
- **Purpose**: Fetches recruiting/talent data
- **Why keep**: Useful for preseason predictions
- **Recommendation**: ✅ Keep auto-run enabled (low frequency, high value)

---

### 📋 **KEEP FOR MANUAL USE** (On-Demand Workflows)

#### 9. **Ratings v1 Computation** (`ratings-v1.yml`)
- **Status**: Manual only
- **Purpose**: Computes power ratings for a specific season
- **When to run**: 
  - After major data updates
  - When testing rating changes
  - Periodically to refresh ratings
- **Recommendation**: ✅ Keep for manual use

#### 10. **Backfill Historical Odds** (`backfill-odds-historical.yml`)
- **Status**: Manual only
- **Purpose**: Backfills odds for past seasons/weeks
- **When to run**: When you need historical data for backtesting
- **Recommendation**: ✅ Keep for manual use (rarely needed)

#### 11. **Backfill Scores 2025** (`backfill-scores-2025.yml`)
- **Status**: Manual only
- **Purpose**: One-time backfill of scores for specific weeks
- **When to run**: When you need to fill in missing scores
- **Recommendation**: ✅ Keep for manual use (one-time per season)

#### 12. **Monitor 2025 Archival Availability** (`monitor-2025-archival.yml`)
- **Status**: ⚠️ **AUTO-RUN** (daily at 2 AM UTC)
- **Purpose**: Monitors when historical odds become available
- **Recommendation**: ⚠️ **Disable auto-run** (only needed when you're actively backfilling)
- **Action**: Change to manual-only

---

### ❌ **DISABLE/DELETE** (Redundant or Unused)

#### 13. **Odds Poll (3x daily)** (`odds-poll-3x.yml`)
- **Status**: ⚠️ **DISABLED** (schedule commented out)
- **Purpose**: Polls odds 3x daily (redundant with nightly-ingest)
- **Recommendation**: ❌ **DELETE** - Duplicates `nightly-ingest.yml`

#### 14. **Weather Daily** (`weather-daily.yml`)
- **Status**: ⚠️ **DISABLED** (schedule commented out)
- **Purpose**: Fetches weather data (not yet implemented)
- **Recommendation**: ❌ **DELETE** - Not implemented, can recreate later if needed

#### 15. **One-Week Odds Test** (`odds-one-week.yml`)
- **Status**: Manual only
- **Purpose**: Test workflow for odds ingestion
- **Recommendation**: ❌ **DELETE** - Use `nightly-ingest.yml` for testing

#### 16. **Backfill Odds** (`backfill-odds.yml`)
- **Status**: Manual only
- **Purpose**: Similar to `backfill-odds-historical.yml`
- **Recommendation**: ⚠️ **REVIEW** - Check if it's different from historical one. If duplicate, delete one.

#### 17. **CFBD Team Stats Sync** (`stats-cfbd.yml`)
- **Status**: ⚠️ **AUTO-RUN** (nightly)
- **Purpose**: Fetches per-game stats (different from season stats)
- **Recommendation**: ⚠️ **REVIEW** - Check if this overlaps with `stats-season-cfbd.yml`. If you're using season stats for ratings, you may not need this.
- **Action**: Consider disabling auto-run and keeping for manual use only

---

## Summary of Actions

### Immediate Actions:
1. ✅ **Keep enabled**: `nightly-ingest.yml`, `prisma-migrate.yml`, `prisma-guardrails.yml`
2. ✅ **Keep enabled**: `cfbd-scores-sync.yml`, `grade-bets.yml`
3. ✅ **Keep enabled**: `stats-season-cfbd.yml`, `stats-advanced-cfbd.yml`
4. ⚠️ **Disable auto-run**: `monitor-2025-archival.yml` (change to manual-only)
5. ⚠️ **Review & potentially disable**: `stats-cfbd.yml` (check if needed)
6. ❌ **Delete**: `odds-poll-3x.yml`, `weather-daily.yml`, `odds-one-week.yml`

### Workflow Count:
- **Current**: 17 workflows
- **After cleanup**: ~13 workflows
- **Auto-running**: ~7-8 workflows
- **Manual only**: ~5 workflows

---

## Workflow Dependencies & Schedule

### Daily Pipeline (in order):
1. **2:00 AM UTC** (7:00 PM CST previous day): `nightly-ingest.yml`
   - Fetches schedules (game times)
   - Fetches odds
   - Calculates ratings
2. **2:00 AM UTC**: `stats-season-cfbd.yml` (season stats)
3. **3:00 AM UTC**: `stats-advanced-cfbd.yml` (advanced stats)
4. **Throughout day**: `cfbd-scores-sync.yml` (every 2 hours on game days)
5. **Hourly (weekends) / Nightly (weekdays)**: `grade-bets.yml`

### Manual Workflows (run as needed):
- `ratings-v1.yml` - After major updates
- `backfill-odds-historical.yml` - For historical data
- `backfill-scores-2025.yml` - One-time backfills

---

## Notes

- **Game Times**: Fetched by `nightly-ingest.yml` via CFBD schedules endpoint
- **Ratings**: Calculated in `nightly-ingest.yml` using `seed-ratings.js`
- **Season Stats**: Run daily to keep season aggregates fresh
- **Scores**: Updated frequently during game days to catch final scores quickly

