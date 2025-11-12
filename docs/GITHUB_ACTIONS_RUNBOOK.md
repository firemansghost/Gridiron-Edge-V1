# GitHub Actions Runbook

## Overview

All data ingestion and calibration processes have been moved to GitHub Actions for reproducibility, observability, and proper secret management.

## Workflows

### 1. Historical Odds Backfill

**Workflow:** `.github/workflows/backfill-odds-historical.yml`

**Purpose:** Backfill historical odds data for specified weeks with normalized bookmaker names and pre-kick consensus windows.

**Trigger:** Manual dispatch (`workflow_dispatch`)

**Inputs:**
- `season`: Season year (default: 2024)
- `weeks`: Week range, comma-separated (e.g., `1,2,3,4,5,6,7,8,9,10,11`)
- `markets`: Markets to fetch (default: `spreads,totals`)
- `regions`: Regions (default: `us`)
- `credits_limit`: Max credits (default: `1200`)
- `dry_run`: Dry run mode (default: `false`)
- `historical_strict`: Strict historical mode (default: `true`)
- `enable_season_fallback`: Season fallback for date mismatches (default: `true`)
- `concurrency`: Concurrency control 1-5 (default: `1`)

**Gates (must pass):**
- Pre-kick coverage ≥ 80% overall
- Median unique books ≥ 5
- Zero games with consensus spread = 0.0

**Artifacts:**
- `consensus_coverage_by_week.csv`
- `reports/historical/` (mapping and error logs)

**Usage:**
1. Go to Actions → Historical Odds Backfill
2. Click "Run workflow"
3. Set inputs:
   - `season`: `2025`
   - `weeks`: `1,2,3,4,5,6,7,8,9,10,11`
   - `markets`: `spreads,totals,h2h`
   - `regions`: `us`
   - `credits_limit`: `800`
   - `concurrency`: `2`
4. Monitor logs for progress
5. Check gates pass at end
6. Download artifacts

### 2. CFBD Feature Ingest

**Workflow:** `.github/workflows/cfbd-feature-ingest.yml`

**Purpose:** Ingest CFBD advanced stats, PPA, drives, priors (talent + returning production) for specified weeks.

**Trigger:** Manual dispatch (`workflow_dispatch`)

**Inputs:**
- `season`: Season year (default: `2025`)
- `weeks`: Week range, comma-separated (default: `1,2,3,4,5,6,7,8,9,10,11`)
- `endpoints`: Endpoints to ingest, comma-separated (default: `teamSeason,teamGame,priors`)
  - Options: `teamSeason`, `teamGame`, `priors`
- `dry_run`: Dry run mode (default: `false`)
- `max_concurrency`: Max concurrent week jobs 1-4 (default: `2`)

**Execution Model:**
- Matrix strategy: One job per week (parallelized)
- Max parallel: Configurable (default: 2 concurrent weeks)
- Per-job throttles: Rate limiting via `RATE_MAX_RPS` and `RATE_CONCURRENCY` secrets
- Idempotent: All upserts use unique composite keys

**Gates (must pass):**
- Feature completeness ≥ 95% across required tables
- Team mapping mismatches = 0 (or allowlisted FCS)
- Rating variance sanity (std ≥ 2.0, zeros ≤ 2%)

**Artifacts:**
- `team_mapping_mismatches.csv`
- `feature_completeness.csv`
- `feature_store_stats.csv`
- `cfbd_job_summary.md`

**Usage:**
1. Go to Actions → CFBD Feature Ingest
2. Click "Run workflow"
3. Set inputs:
   - `season`: `2025`
   - `weeks`: `1,2,3,4,5,6,7,8,9,10,11`
   - `endpoints`: `teamSeason,teamGame,priors`
   - `max_concurrency`: `2`
4. Monitor logs for progress (one job per week)
5. Check gates pass in `check-gates` job
6. Download artifacts

## Secrets Required

Set in: **Settings → Secrets and variables → Actions**

- `ODDS_API_KEY` - Odds API key (required for odds backfill)
- `CFBD_API_KEY` - CFBD API key (required for CFBD ingest)
- `DATABASE_URL` - Supabase pooled connection string
- `DIRECT_URL` - Supabase direct connection string (for migrations)
- `RATE_MAX_RPS` - (Optional) Max requests per second for CFBD (default: 10)
- `RATE_CONCURRENCY` - (Optional) Max concurrent requests for CFBD (default: 3)

## Runbook: Complete Phase 2 & 3

### Step 1: Run Odds Backfill

1. Navigate to Actions → Historical Odds Backfill
2. Run with:
   - `season`: `2025`
   - `weeks`: `1,2,3,4,5,6,7,8,9,10,11`
   - `markets`: `spreads,totals,h2h`
   - `regions`: `us`
   - `credits_limit`: `800`
   - `concurrency`: `2`
3. Wait for completion
4. Verify gates pass:
   - Pre-kick coverage ≥ 80%
   - Median books ≥ 5
   - Zero consensus spreads = 0.0
5. Download `consensus_coverage_by_week.csv` artifact

### Step 2: Run CFBD Feature Ingest

1. Navigate to Actions → CFBD Feature Ingest
2. Run with:
   - `season`: `2025`
   - `weeks`: `1,2,3,4,5,6,7,8,9,10,11`
   - `endpoints`: `teamSeason,teamGame,priors`
   - `max_concurrency`: `2`
3. Monitor progress (matrix jobs run in parallel)
4. Wait for `check-gates` job
5. Verify gates pass:
   - Game stats completeness ≥ 95%
   - Season stats completeness ≥ 95%
   - Priors completeness ≥ 95%
   - Team mapping mismatches = 0
6. Download artifacts:
   - `team_mapping_mismatches.csv`
   - `feature_completeness.csv`
   - `feature_store_stats.csv`
   - `cfbd_job_summary.md`

### Step 3: Verify Deliverables

**Odds:**
- `reports/consensus_coverage_by_week.csv` exists
- 10-game spot check shows proper format:
  ```
  CONSENSUS: spread=X.X (books=Y, deduped=true) • total=Z.Z (books=W) • ML=fav:A/dog:B (books=V) • window T-60→T+5
  ```

**CFBD:**
- `team_mapping_mismatches.csv` is empty or contains only allowlisted FCS teams
- `feature_completeness.csv` shows ≥95% for all blocks
- `feature_store_stats.csv` has sane distributions (no zero-variance features)

## Troubleshooting

### Odds Backfill Fails Gates

**Low books (< 5):**
- Check `ODDS_API_KEY` is set correctly
- Verify API plan/rate limits
- Re-run with lower `concurrency` (1-2)

**Pre-kick coverage low (< 80%):**
- Verify `game.date` field is populated (not `scheduledDate`)
- Check timezone handling (UTC in DB)
- Re-run specific weeks that failed

**Consensus = 0.0:**
- Verify per-book deduplication is working
- Check favorite-centric normalization
- Ensure median calculation uses deduped values

### CFBD Ingest Fails Gates

**Completeness < 95%:**
- Check which endpoint is sparse (EPA vs PPA vs drives)
- Verify team mapping (check `team_mapping_mismatches.csv`)
- Re-run specific weeks that failed
- Check for rate limiting (429 errors in logs)

**Team mapping mismatches:**
- Review `team_mapping_mismatches.csv`
- Add aliases to `apps/jobs/config/team_aliases_cfbd.yml`
- Re-run mapping step (idempotent)

**Rate limiting (429):**
- Reduce `max_concurrency` to 1
- Increase delays between requests
- Check API plan limits

## Next Steps After Both Pass

1. **Feature Engineering (Phase 4):**
   - Build opponent-adjusted nets
   - Recency-weighted form (EWMA)
   - Pace & finishing features
   - Winsorize + standardize

2. **Calibration (Phase 5):**
   - Run Elastic Net on Set A (Weeks 8-11)
   - Run Elastic Net on Set B (Weeks 1-11, P5-heavy)
   - Verify gates:
     - Slope 0.9-1.1
     - Walk-forward RMSE ≤ 9.0
     - Sign agreement ≥ 70%
     - Pearson r ≥ 0.30

3. **Forensic Audit:**
   - Run audit scripts against DB
   - Verify sign agreement, correlation, slope
   - Check residual buckets

## Guardrails

- **SSOT:** All reads/writes go to Supabase; CSVs are reports only
- **No dotenv:** Scripts use `process.env` only (Actions supplies env vars)
- **Fail fast:** Workflows fail if gates don't pass
- **Idempotency:** All upserts use unique composite keys
- **Concurrency groups:** Per-season to prevent overlapping runs

