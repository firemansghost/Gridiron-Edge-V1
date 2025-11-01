# Re-ingesting Schedules to Fix Game Times

## The Problem
Game times are stored incorrectly because CFBD returns times in **venue local time**, but we were storing them as **UTC** without conversion.

Example:
- **CFBD returns**: `2025-11-01T18:30:00` (6:30 PM Central Time)
- **We stored**: `2025-11-01T18:30:00Z` (6:30 PM UTC - WRONG!)
- **Should be**: `2025-11-02T00:30:00Z` (12:30 AM UTC next day - CORRECT)

## The Fix
The `CFBDAdapter` now properly converts venue local time to UTC using venue timezone information from CFBD.

## How to Re-ingest Schedules

### Option 1: Run Nightly Ingest Workflow (Recommended)
This will automatically fetch schedules for the current week:

1. Go to GitHub Actions → **"Nightly Ingest + Ratings"** workflow
2. Click **"Run workflow"**
3. Leave the week field empty (it will auto-calculate the current week)
4. Click **"Run workflow"** button

**OR** wait for the automatic nightly run at 2 AM CST.

### Option 2: Manual Command (For Specific Week)
If you want to re-ingest a specific week:

```bash
# From the repository root
node apps/jobs/ingest-simple.js cfbd --season 2025 --weeks 10
```

### Option 3: Re-ingest Current Week Only
The nightly workflow automatically calculates the current week, so just running it will update week 10.

## What Happens During Re-ingestion
1. **Fetches schedules** from CFBD for the specified week
2. **Detects venue timezones** from CFBD venue data
3. **Converts local times to UTC** using proper timezone conversion
4. **Upserts games** to database with correct UTC times
5. **Logs conversions** so you can see what's happening

## Expected Results
After re-ingestion, you should see:
- ✅ **Correct dates**: Games on Saturday will show as Saturday, not Friday
- ✅ **Correct times**: 6:30 PM CT will display as 6:30 PM CT (not 11:00 PM the previous day)
- ✅ **Conversion logs**: In workflow logs, you'll see messages like:
  ```
  [CFBD] Converted Oklahoma Sooners @ Tennessee from America/Chicago local time to UTC: 2025-11-01T18:30:00 -> 2025-11-02T00:30:00.000Z
  ```

## Verification
After running the workflow, check:
1. **GitHub Actions logs** - Look for timezone conversion messages
2. **Database** - Check a specific game:
   ```sql
   SELECT id, date, (date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago') as cst_time
   FROM games 
   WHERE id = '2025-wk10-oklahoma-tennessee';
   ```
3. **UI** - The game should now show as Saturday, November 1 at 6:30 PM CT

## Notes
- The timezone conversion uses JavaScript's `Intl.DateTimeFormat` API
- It properly handles Daylight Saving Time (DST) transitions
- Venue timezones come from CFBD's `/venues` endpoint
- If a venue doesn't have timezone info, it falls back to treating the time as UTC

