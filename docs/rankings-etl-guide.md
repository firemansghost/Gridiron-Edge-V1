# CFBD Rankings ETL Guide

## Overview

The CFBD Rankings ETL fetches poll rankings (AP, Coaches, CFP) from the CFBD API and stores them in the `team_rankings` table. This data is used to display rank chips on the game detail page.

## How to Run

### Option 1: Via ingest.js (Recommended for Local)

After building the jobs:
```bash
# From repo root
npm run build:jobs

# Then run rankings ETL
node apps/jobs/dist/ingest.js cfbd-rankings --season 2025 --weeks 11

# Or for multiple weeks
node apps/jobs/dist/ingest.js cfbd-rankings --season 2025 --weeks "1,2,3,4,5,6,7,8,9,10,11"

# Or for all weeks (1-15)
node apps/jobs/dist/ingest.js cfbd-rankings --season 2025 --weeks all
```

### Option 2: Direct Script (After Building)

```bash
# From repo root
npm run build:jobs

# Then run directly
node apps/jobs/dist/src/rankings/cfbd_rankings_etl.js --season 2025 --weeks 11

# Or for all weeks
node apps/jobs/dist/src/rankings/cfbd_rankings_etl.js --season 2025 --weeks all
```

### Option 3: GitHub Actions Workflow (Recommended)

1. Go to **GitHub Actions** → **CFBD Rankings Sync**
2. Click **Run workflow**
3. Enter:
   - **Season**: `2025`
   - **Weeks**: `11` (or `all` for all weeks, or `1,2,3` for specific weeks)
4. Click **Run workflow**

The workflow runs automatically every Monday at 3:00 AM CST, but you can trigger it manually anytime.

## Parameters

- `--season`: Season year (required, e.g., `2025`)
- `--weeks`: Comma-separated week numbers or `all` (required)
  - Examples: `11`, `1,2,3`, `all` (fetches weeks 1-15)

## Environment Variables Required

- `DATABASE_URL` - Database connection string
- `CFBD_API_KEY` - CFBD API key (from GitHub Secrets)

## What It Does

1. Fetches rankings from CFBD `/rankings` endpoint
2. Resolves team names to database IDs using TeamResolver
3. Maps poll names to `PollType` enum (AP, COACHES, CFP)
4. Upserts into `team_rankings` table
5. Verifies counts and logs summary

## Integration with Nightly Ingest

The rankings ETL is **NOT** currently integrated into the nightly-ingest workflow. It runs separately:
- **Automatically**: Every Monday at 3:00 AM CST
- **Manually**: Via GitHub Actions UI or command line

## Verification

After running, check the game detail page - you should see rank chips (AP #X, CFP #X, Coaches #X) in the team header strips.

## Troubleshooting

If rankings don't appear:
1. Verify the workflow/script ran successfully
2. Check that rankings exist for the specific week in CFBD
3. Verify team names resolved correctly (check logs for "Could not resolve team" warnings)
4. Check database: `SELECT * FROM team_rankings WHERE season = 2025 AND week = 11;`

