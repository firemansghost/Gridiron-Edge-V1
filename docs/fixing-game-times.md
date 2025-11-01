# Fixing Game Times Issue

## Problem
Game times are displaying incorrectly. For example:
- **Actual game**: November 1, 2025 at 6:30 PM CT (7:30 PM ET)
- **Displayed**: Friday, October 31 at 11:00 PM

## Root Cause
CFBD API returns `startDate` in **venue local time**, but our code is treating it as **UTC**. 

When CFBD returns `2025-11-01T18:30:00` (6:30 PM), we're storing it as `2025-11-01T18:30:00Z` (UTC), which is wrong. The correct UTC time should be approximately `2025-11-02T00:30:00Z` (12:30 AM UTC next day, accounting for CDT = UTC-5).

## Current Status
The `CFBDAdapter` now detects venue timezones but doesn't yet fully convert them. It logs warnings for suspicious times.

## Solutions

### Option 1: Re-ingest Schedules (Recommended)
After fixing the timezone conversion, re-run the schedule ingestion:

1. **Fix the timezone conversion** in `CFBDAdapter.ts` (see TODO in code)
2. **Re-run nightly-ingest workflow** or manually:
   ```bash
   node apps/jobs/ingest-simple.js cfbd --season 2025 --weeks 10
   ```

### Option 2: Manual Database Update
For a quick fix, update specific games directly in the database:

```sql
-- Example: Fix Oklahoma @ Tennessee (should be Nov 1, 6:30 PM CT = Nov 2, 00:30 UTC)
UPDATE games 
SET date = '2025-11-02 00:30:00'::timestamp
WHERE id = '2025-wk10-oklahoma-tennessee';
```

### Option 3: SQL Batch Fix (Advanced)
Create a script to adjust all times based on venue timezones. This requires:
- Venue timezone mapping
- Date offset calculations (accounting for DST)

## Next Steps
1. ✅ Added timezone detection in CFBDAdapter
2. ⚠️ Need to implement full timezone conversion
3. ⚠️ Need to test with sample games
4. ⚠️ Need to re-ingest schedules after fix

## Notes
- CFBD provides venue timezone in the `/venues` endpoint
- Most venues are in US timezones (Eastern, Central, Mountain, Pacific)
- Must account for Daylight Saving Time (DST) which changes offsets
- Central Time in November 2025 is CST (UTC-6) or CDT (UTC-5) depending on DST end date

