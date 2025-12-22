# GitHub Actions Workflows - Auto-Runner Report
**Date:** Dec 22, 2025  
**Purpose:** Identify workflows that run automatically (schedule/push triggers) for manual disabling during offseason

## Workflows with Automatic Triggers

### 🔄 **FREQUENT AUTO-RUNNERS** (Disable These)

#### 1. `nightly-ingest.yml` - **Nightly Ingest + Ratings**
- **Triggers:**
  - `schedule`: `0 7 * * *` (Every night at 7:00 UTC / 2:00 AM CST)
- **Purpose:** ETL - Ingest schedules, compute ratings, sync data
- **Frequency:** Daily

#### 2. `cfbd-scores-sync.yml` - **CFBD Scores Sync**
- **Triggers:**
  - `schedule`: 
    - Every 2 hours on Friday: `0 0,2,4,6,8,10,12,14,16,18,20,22 * * 5`
    - Every 2 hours on Saturday: `0 0,2,4,6,8,10,12,14,16,18,20,22 * * 6`
    - Every 2 hours on Sunday: `0 0,2,4,6,8,10,12,14,16,18,20,22 * * 0`
    - Nightly: `0 2 * * *` (2:00 AM UTC)
- **Purpose:** ETL - Sync game scores from CFBD API
- **Frequency:** Every 2 hours on game days (Fri-Sun), nightly otherwise

#### 3. `grade-bets.yml` - **Grade Bets**
- **Triggers:**
  - `schedule`:
    - Hourly on Saturday/Sunday: `0 * * * 6,0`
    - Nightly Mon-Fri: `0 3 * * 1-5` (3:00 AM UTC)
- **Purpose:** ETL - Grade completed bets and calculate PnL
- **Frequency:** Hourly on weekends, nightly on weekdays

#### 4. `cfbd-rankings-sync.yml` - **CFBD Rankings Sync**
- **Triggers:**
  - `schedule`: `0 9 * * 1` (Every Monday at 9:00 UTC / 3:00 AM CST)
- **Purpose:** ETL - Sync team rankings from CFBD API
- **Frequency:** Weekly (Mondays)

#### 5. `stats-season-cfbd.yml` - **CFBD Team Season Stats Sync**
- **Triggers:**
  - `schedule`: `0 2 * * *` (Nightly at 2:00 AM UTC)
- **Purpose:** ETL - Sync season-level team statistics
- **Frequency:** Daily

#### 6. `stats-advanced-cfbd.yml` - **CFBD Advanced Stats Sync**
- **Triggers:**
  - `schedule`: `0 3 * * *` (Nightly at 3:00 AM UTC)
- **Purpose:** ETL - Sync advanced team statistics
- **Frequency:** Daily

#### 7. `v3-totals-nightly.yml` - **V3 Totals Nightly**
- **Triggers:**
  - `schedule`: `0 8 * * *` (Every night at 8:00 UTC / 2:00 AM CST)
- **Purpose:** ETL - Compute v3 totals after nightly ingest
- **Frequency:** Daily

### 📅 **YEARLY AUTO-RUNNERS** (Consider Disabling)

#### 8. `sgo-team-stats.yml` - **SGO Team Stats**
- **Triggers:**
  - `schedule`: `0 4 20 2 *` (Feb 20 @ 04:00 UTC - yearly)
- **Purpose:** ETL - Sync SGO team stats for previous season wrap-up
- **Frequency:** Yearly (February)

#### 9. `roster-churn-cfbd.yml` - **Roster Churn CFBD**
- **Triggers:**
  - `schedule`: `0 3 15 2 *` (Feb 15 @ 03:00 UTC - yearly)
- **Purpose:** ETL - Sync roster churn data (offseason)
- **Frequency:** Yearly (February)

#### 10. `talent-cfbd.yml` - **CFBD Team Talent Sync**
- **Triggers:**
  - `schedule`: `0 2 1 2 *` (Feb 1 @ 02:00 UTC - yearly)
- **Purpose:** ETL - Sync team talent ratings (recruiting season)
- **Frequency:** Yearly (February)

#### 11. `talent-roster-sync.yml` - **CFBD Team Roster Talent Sync**
- **Triggers:**
  - `schedule`: `0 2 1 2 *` (Feb 1 @ 02:00 UTC - yearly)
- **Purpose:** ETL - Sync roster talent data (recruiting season)
- **Frequency:** Yearly (February)

#### 12. `talent-commits-sync.yml` - **CFBD Team Class Commits Sync**
- **Triggers:**
  - `schedule`: `0 3 1 2 *` (Feb 1 @ 03:00 UTC - yearly)
- **Purpose:** ETL - Sync recruiting commit data
- **Frequency:** Yearly (February)

### 🔧 **PUSH-TRIGGERED** (Consider Disabling)

#### 13. `prisma-migrate.yml` - **Prisma Migrate**
- **Triggers:**
  - `push`: `branches: ["main"]`, `paths: ["prisma/**"]`
- **Purpose:** Database - Auto-run migrations on schema changes
- **Frequency:** On push to main when prisma files change
- **Note:** May want to keep this enabled for safety, or disable if no schema changes expected

## Workflows WITHOUT Auto-Triggers (Safe to Leave Enabled)

These workflows only run via `workflow_dispatch` (manual trigger):

- `backfill-drives.yml` - Manual backfill only
- `backfill-odds-historical.yml` - Manual backfill only
- `backfill-scores-2025.yml` - Manual backfill only
- `bowl-week-bootstrap.yml` - Manual trigger only
- `cfbd-feature-ingest.yml` - Manual trigger only
- `ratings-v1.yml` - Manual trigger only
- `ratings-v2.yml` - Manual trigger only
- `stats-cfbd.yml` - Manual trigger only (schedule commented out)
- `prisma-guardrails.yml` - Manual trigger only

## Summary

**Total auto-running workflows:** 13
- **Daily/Frequent:** 7 workflows
- **Weekly:** 1 workflow
- **Yearly (February):** 5 workflows
- **Push-triggered:** 1 workflow

**Recommendation:** Disable all 13 auto-running workflows in GitHub UI during offseason. Re-enable as needed for 2026 season prep.


