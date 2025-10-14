# Nightly Ingest + Ratings Workflow

The nightly ingest workflow automatically refreshes data and recalculates ratings every night.

## Overview

- **Workflow File**: `.github/workflows/nightly-ingest.yml`
- **Schedule**: Every night at 7:00 UTC (2:00 AM CST / 1:00 AM CDT)
- **Trigger**: Automatic (cron) + Manual dispatch
- **Duration**: ~5-15 minutes

## Execution Flow

The workflow runs in this order:

1. **Setup** - Checkout code, install dependencies, generate Prisma client
2. **Mock Data Ingest** - Load schedules, teams, and baseline market lines
3. **SGO Odds (Optional)** - Fetch real odds if `SGO_API_KEY` is configured
4. **Weather Data (Optional)** - Fetch weather if `VISUALCROSSING_API_KEY` is configured
5. **Ratings Calculation** - Run power ratings and generate implied lines
6. **Summary** - Print execution summary with status

## Step Details

### 1. Mock Data Ingest (Required)
```bash
npm run ingest -- mock --season 2024 --weeks 1
```
- Loads schedules, teams, and market lines from `/data` directory
- **Always runs** - provides baseline data for ratings

### 2. SGO Odds Fetch (Optional)
```bash
npm run ingest -- sgo --season 2024 --weeks 1
```
- **Runs if**: `SGO_API_KEY` secret is set
- **Skips if**: No API key configured
- Fetches real-time spreads, totals, and moneylines from SportsGameOdds API
- Upserts into `market_lines` table

### 3. Weather Data Fetch (Optional)
```bash
npm run ingest -- weatherVc --season 2024 --weeks 1
```
- **Runs if**: `VISUALCROSSING_API_KEY` secret is set
- **Skips if**: No API key configured
- Fetches game-time weather from Visual Crossing API
- Currently logs only (no database writes until weather table is added)

### 4. Ratings Calculation (Required)
```bash
npm run seed:ratings
```
- Calculates power ratings using Elo-based model
- Generates implied spreads and totals
- Updates `matchup_outputs` table
- **Always runs** - ensures ratings are current

## Environment Variables

### Required
- `DATABASE_URL` - Pooled Postgres connection (uses `DIRECT_URL` in workflow)
- `DIRECT_URL` - Direct Postgres connection string

### Optional
- `SGO_API_KEY` - SportsGameOdds API key for real odds
- `VISUALCROSSING_API_KEY` - Visual Crossing API key for weather data

## Configuration in GitHub

### Secrets Setup
Navigate to: **Settings → Secrets and variables → Actions → Repository secrets**

Add:
1. `DIRECT_URL` - Direct Supabase connection string (required)
2. `SGO_API_KEY` - Your SportsGameOdds API key (optional)
3. `VISUALCROSSING_API_KEY` - Your Visual Crossing API key (optional)

### Manual Trigger
1. Go to **Actions** tab in GitHub
2. Select **Nightly Ingest + Ratings** workflow
3. Click **Run workflow** button
4. Select branch (usually `main`)
5. Click green **Run workflow** button

## Example Output

### With All API Keys Configured
```
📥 Starting mock data ingest for 2024 Week 1...
   ✅ Upserted 15 games
   ✅ Upserted 45 market lines
✅ Mock data ingest complete

📈 Fetching odds from SGO...
   ✅ Upserted 12 spreads, 12 totals, 12 moneylines (sgo)
✅ SGO odds fetched

⛅ Updating weather...
   ✅ Weather fetch complete: 11 fetched, 0 skipped, 0 errors
✅ Weather data fetched

📊 Starting ratings calculation...
   ✅ Calculated ratings for 133 teams
   ✅ Generated 15 matchup outputs
✅ Ratings calculation complete

============================================
📊 NIGHTLY INGEST + RATINGS SUMMARY
============================================
Steps executed:
  ✅ Mock data ingest (schedules, teams, lines)
  📈 SGO odds (optional, enabled: true)
  ⛅ Weather data (optional, enabled: true)
  📊 Ratings + implied lines
============================================
```

### Without Optional API Keys
```
📥 Starting mock data ingest for 2024 Week 1...
✅ Mock data ingest complete

⚠️  SGO_API_KEY not set; skipping odds update.

⚠️  VISUALCROSSING_API_KEY not set; skipping weather update.

📊 Starting ratings calculation...
✅ Ratings calculation complete

============================================
📊 NIGHTLY INGEST + RATINGS SUMMARY
============================================
Steps executed:
  ✅ Mock data ingest (schedules, teams, lines)
  📈 SGO odds (optional, enabled: false)
  ⛅ Weather data (optional, enabled: false)
  📊 Ratings + implied lines
============================================
```

## Robustness Features

### Conditional Execution
- Optional steps only run when API keys are present
- Skip messages are logged when API keys are missing
- Workflow completes successfully even without optional steps

### Error Handling
- Each optional step logs clear skip message if disabled
- Main steps (mock ingest, ratings) always execute
- Summary always runs (`if: always()`) to show final status

### Execution Order
The order is important:
1. **Mock first** - Provides schedules/teams that other adapters need
2. **SGO second** - Updates odds for existing games
3. **Weather third** - Fetches weather for existing games
4. **Ratings last** - Uses all available data to calculate ratings

### Concurrency Control
```yaml
concurrency:
  group: nightly-ingest
  cancel-in-progress: false
```
- Only one instance runs at a time
- New runs wait for previous to complete
- Prevents race conditions on database writes

## Monitoring

### View Logs
1. Go to **Actions** tab
2. Click on a workflow run
3. Expand job "ingest-and-rate"
4. Click on individual steps to see detailed logs

### Check Summary
The summary step shows:
- Execution time (UTC and CST/CDT)
- Season and week processed
- Overall job status
- Which optional steps ran

## Troubleshooting

### Workflow Fails on Mock Ingest
- Check that mock data files exist in `/data` directory
- Verify database connection with `DIRECT_URL`

### SGO Step Fails
- Verify `SGO_API_KEY` is correct in GitHub Secrets
- Check API key is valid at sportsgameodds.com
- Review SGO adapter logs for specific error

### Weather Step Fails
- Verify `VISUALCROSSING_API_KEY` is correct
- Check API key is valid at visualcrossing.com
- Ensure games have `city` field populated

### Ratings Calculation Fails
- Ensure games and teams were ingested successfully
- Check for database connection issues
- Review ratings job logs for specific errors

## Related Workflows

- **`odds-poll-3x.yml`** - Polls odds 3x daily using SGO adapter
- **`weather-daily.yml`** - Fetches weather daily using Visual Crossing adapter
- **`prisma-migrate.yml`** - Runs database migrations
- **`prisma-guardrails.yml`** - Validates schema changes

## Future Enhancements

1. **Dynamic Week Detection** - Auto-detect current CFB week instead of hardcoded week 1
2. **Multi-Week Support** - Ingest multiple weeks in one run
3. **Slack/Discord Notifications** - Alert on failures
4. **Performance Metrics** - Track ingestion and calculation times
5. **Data Validation** - Verify data quality after each step
6. **Rollback on Failure** - Restore previous data if ratings calculation fails

