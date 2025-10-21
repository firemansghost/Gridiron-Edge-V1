# Missing Games Backfill - 2024 Week 2

## Overview
Two games from 2024 Week 2 are missing from the `games` table, preventing odds mapping.
Both teams resolve correctly to FBS slugs, but no schedule rows exist.

---

## Missing Games

### 1. San Jose State @ Air Force
- **Away**: San Jose State (`san-jose-state`)
- **Home**: Air Force (`air-force`)
- **Expected Date**: September 7, 2024 (~6:00 PM MT)
- **Week**: 2
- **Season**: 2024

### 2. Appalachian State @ Clemson
- **Away**: Appalachian State (`appalachian-state`)
- **Home**: Clemson (`clemson`)
- **Expected Date**: September 7, 2024 (~8:00 PM ET)
- **Week**: 2
- **Season**: 2024

---

## How to Fix

### Option 1: Run CFBD Schedule Backfill (Recommended)
Run your normal schedule ingestion job for 2024 Week 2:
```bash
npm run ingest -- cfbd --season 2024 --weeks 2 --data-type schedules
```

This will fetch the official schedule from CFBD and insert all Week 2 games with correct IDs, dates, and metadata.

### Option 2: Manual SQL Insert (Quick Patch)
If you need to unblock odds ingestion immediately:

```sql
-- Insert missing games (adjust IDs/dates to match your convention)
INSERT INTO games (
  id, 
  season, 
  week, 
  date, 
  home_team_id, 
  away_team_id,
  neutral_site,
  conference_game
)
VALUES
  (
    '2024-wk2-sjsu-air-force', 
    2024, 
    2, 
    '2024-09-07T18:00:00-06:00', 
    'air-force', 
    'san-jose-state',
    false,
    false
  ),
  (
    '2024-wk2-app-state-clemson', 
    2024, 
    2, 
    '2024-09-07T20:00:00-04:00', 
    'clemson', 
    'appalachian-state',
    false,
    false
  )
ON CONFLICT (id) DO NOTHING;
```

**Note**: Adjust `date` values to match actual kickoff times if known. Timezone-aware timestamps recommended.

---

## Validation

After backfilling, re-run the historical odds workflow:
```bash
Season: 2024
Weeks: 2
Enable season fallback: true
```

**Expected Results**:
- Mapped events: **48-49 / 49** (up from 46)
- `RESOLVED_TEAMS_BUT_NO_GAME`: **0-1** (down from 2)
- Logs show:
  ```
  [MATCH-FALLBACK] Season-only nearest match: san-jose-state@air-force | delta=X.Xd | gameId=...
  [MATCH-FALLBACK] Season-only nearest match: appalachian-state@clemson | delta=X.Xd | gameId=...
  ```

---

## Why These Games Are Missing

Possible causes:
1. **CFBD schedule ingest ran before Week 2 was finalized** (games added later)
2. **Partial backfill** (only certain weeks ingested)
3. **Data source gap** (CFBD temporarily missing these games)

**Solution**: Run a full 2024 schedule backfill to ensure complete coverage.

---

## Related Files
- Odds mapping logic: `apps/jobs/adapters/OddsApiAdapter.ts` (line ~1345)
- Team aliases: `apps/jobs/config/team_aliases.yml`
- Historical workflow: `.github/workflows/backfill-odds-historical.yml`

