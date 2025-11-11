# Workflow Guide: Ingesting Market Line Data for Calibration

## 🎯 Goal
Ingest historical market lines (spreads, totals, moneylines) for weeks 1-12 of season 2025 to improve model calibration.

## 📊 Current Data Status (as of check)
- **Total final games**: 2,115
- **Games with market lines**: 136 (6.4%) - Only weeks 8, 10, 11
- **Coverage by week**:
  - Weeks 1-7: **0 games** with lines (0%)
  - Week 8: 36/58 games (62%)
  - Week 9: 0/4 games (0%)
  - Week 10: 50/52 games (96%)
  - Week 11: 50/51 games (98%)
  - Week 12: 0 games (not started yet)

## ✅ Available Workflows

### 1. **Historical Odds Backfill** (Recommended for weeks 1-7, 9)
**File**: `.github/workflows/backfill-odds-historical.yml`

**What it does**:
- Fetches historical odds data from The Odds API
- Handles past weeks/seasons
- Uses HISTORICAL mode to fetch closed events
- Supports dry-run for testing

**Requirements**:
- `ODDS_API_KEY` secret (paid tier with historical access)
- ~10-50 API requests per week

**How to run**:
1. Go to GitHub **Actions** tab
2. Select "**Historical Odds Backfill**" workflow
3. Click "**Run workflow**"
4. Fill in parameters:

```yaml
Season: 2025
Weeks: 1-7           # Or: 1,2,3,4,5,6,7 or individual: 1
Markets: spreads,totals,h2h  # h2h = moneylines
Regions: us
Credits limit: 1200   # Adjust based on your API quota
Dry run: false        # Set true to test without DB writes
Historical strict: true
Max events: (leave empty for all)
Enable season fallback: true
Concurrency: 1        # Increase to 2-3 for faster processing
```

**Cost estimate (The Odds API)**:
- **Historical data**: ~10 requests per week per region
- **Weeks 1-7**: ~70 requests total
- **Week 9**: ~10 requests
- **Total**: ~80 requests (~$8-16 depending on tier)

**Recommended runs**:

```yaml
# Run 1: Weeks 1-7
Season: 2025
Weeks: 1-7
Markets: spreads,totals,h2h
Regions: us
Credits limit: 800
Concurrency: 2

# Run 2: Week 9 only
Season: 2025
Weeks: 9
Markets: spreads,totals,h2h
Regions: us
Credits limit: 100
Concurrency: 1
```

---

### 2. **Nightly Ingest** (For current/recent weeks)
**File**: `.github/workflows/nightly-ingest.yml`

**What it does**:
- Fetches live odds for the current week
- Runs automatically every night at 2 AM CST
- Can be manually triggered for any week

**Requirements**:
- `ODDS_API_KEY` secret (live tier is sufficient)
- Works for weeks that haven't closed yet

**How to run**:
1. Go to GitHub **Actions** tab
2. Select "**Nightly Ingest + Ratings**" workflow
3. Click "**Run workflow**"
4. Enter week number (or leave empty for current week)

```yaml
Week: 12   # Or leave empty to auto-detect current week
```

**Best for**:
- Week 12 (current week, not yet final)
- Future weeks as they come up
- Re-polling recent weeks to update closing lines

**Note**: This workflow uses the **live** Odds API endpoint, which is cheaper but only works for games that are scheduled/in-progress (not completed).

---

### 3. **Manual Script** (Alternative for local testing)
**File**: `apps/jobs/backfill-odds-oddsapi.js`

**What it does**:
- Command-line script for backfilling odds
- Can run locally or in CI
- More control over parameters

**How to run locally**:

```bash
# Weeks 1-7
ODDS_API_KEY=your_key_here \
DATABASE_URL=your_db_url \
HISTORICAL_STRICT=true \
HISTORICAL_ALLOWED_SEASON=2025 \
HISTORICAL_ALLOWED_WEEKS=1-7 \
npm run backfill:oddsapi -- \
  --seasons 2025 \
  --weeks 1-7 \
  --dryRun

# Remove --dryRun when ready to write to DB
```

**Not recommended** - Use GitHub workflow instead for better logging and artifact uploads.

---

## 📋 Recommended Execution Plan

### Step 1: Test with one week (dry run)
```yaml
Workflow: Historical Odds Backfill
Season: 2025
Weeks: 1
Markets: spreads,totals,h2h
Regions: us
Credits limit: 100
Dry run: true          # ← Test mode
Historical strict: true
Enable season fallback: true
Concurrency: 1
```

**Expected output**:
- No database writes
- Log shows matched games
- Artifact uploaded with mapping report

### Step 2: Ingest weeks 1-3 (pilot)
```yaml
Workflow: Historical Odds Backfill
Season: 2025
Weeks: 1-3
Markets: spreads,totals,h2h
Regions: us
Credits limit: 300
Dry run: false         # ← Write to DB
Historical strict: true
Enable season fallback: true
Concurrency: 1
```

**Monitor**:
- Check workflow logs for errors
- Verify data: `npm run check:data` (see verification below)

### Step 3: Ingest weeks 4-7
```yaml
Workflow: Historical Odds Backfill
Season: 2025
Weeks: 4-7
Markets: spreads,totals,h2h
Regions: us
Credits limit: 500
Dry run: false
Historical strict: true
Enable season fallback: true
Concurrency: 2          # ← Faster with parallel processing
```

### Step 4: Ingest week 9
```yaml
Workflow: Historical Odds Backfill
Season: 2025
Weeks: 9
Markets: spreads,totals,h2h
Regions: us
Credits limit: 100
Dry run: false
Historical strict: true
Enable season fallback: true
Concurrency: 1
```

### Step 5: Re-run data availability check
```bash
npx tsx scripts/check-data-availability.ts
```

**Expected output after all runs**:
```
📊 Season 2025 Data Availability

  Final games: 2115
  V1 ratings: 693
  Total spread lines: ~15,000+
  Games with spread lines: ~1,800+/2115 (~85%)

📅 Data by Week:

  Week  1: 196 games, ~180 with lines (90%+)
  Week  2: 313 games, ~280 with lines (90%+)
  Week  3: 296 games, ~270 with lines (90%+)
  Week  4: 300 games, ~270 with lines (90%+)
  Week  5: 266 games, ~240 with lines (90%+)
  Week  6: 292 games, ~260 with lines (90%+)
  Week  7: 287 games, ~260 with lines (90%+)
  Week  8: 58 games, 36 with lines (62%)
  Week  9: 4 games, 3-4 with lines (75-100%)
  Week 10: 52 games, 50 with lines (96%)
  Week 11: 51 games, 50 with lines (98%)
  Week 12: 0 games, 0 with lines (0%)
```

### Step 6: Re-run calibration
```bash
npm run calibrate:ridge 2025 1-11
```

**Expected improvement**:
- **Sample size**: ~136 → **~1,800+ games** (13x increase!)
- **R² improvement**: ~11% → **~30-40%** (more predictive)
- **RMSE reduction**: ~11.2 → **~8-9 points** (better fit)
- **Better P5 coverage**: More balanced P5_P5, P5_G5 matchups

---

## 🔍 Verification After Ingestion

### Quick Check
```bash
# Run data availability check
npx tsx scripts/check-data-availability.ts

# Check specific week
npx tsx -e "
const { prisma } = require('./apps/web/lib/prisma.js');
(async () => {
  const count = await prisma.marketLine.count({
    where: { season: 2025, week: 1, lineType: 'spread' }
  });
  console.log('Week 1 spread lines:', count);
  await prisma.\$disconnect();
})();
"
```

### Detailed Verification
```bash
# Check line coverage by week
for week in {1..11}; do
  echo "Week $week:"
  npx tsx -e "
  const { prisma } = require('./apps/web/lib/prisma.js');
  (async () => {
    const games = await prisma.game.count({ where: { season: 2025, week: $week, status: 'final' } });
    const withLines = await prisma.game.count({
      where: {
        season: 2025,
        week: $week,
        status: 'final',
        marketLines: { some: { lineType: 'spread' } }
      }
    });
    console.log(\`  Games: \${games}, With lines: \${withLines} (\${((withLines/games)*100).toFixed(0)}%)\`);
    await prisma.\$disconnect();
  })();
  "
done
```

---

## 💰 Cost Estimates

### The Odds API Pricing (Historical Data)
- **Standard plan**: $50/month (~500 requests)
- **Professional plan**: $150/month (~1,500 requests)
- **Historical requests**: ~10 per week per region

**For your use case** (weeks 1-7, 9 = 8 weeks):
- **Total requests**: ~80-100
- **Cost**: Well within Standard plan ($50/month)
- **One-time backfill**: Can downgrade after completion

### Alternative: SGO (SportsGameOdds)
If you have SGO API access:
- Check if they support historical data
- May be cheaper for bulk backfills
- Update workflow to use SGO adapter instead

---

## ⚠️ Important Notes

### API Rate Limits
- **The Odds API**: 60 requests/min (free), 500 requests/min (paid)
- **Concurrency setting**: Controls parallel game fetches
- **Credits limit**: Hard cap to prevent over-billing

### Historical vs. Live Endpoints
- **Historical** (paid): Closed events, weeks 1-7, 9
- **Live** (cheaper): In-progress/scheduled events, week 12+

### Data Quality
- Not all games have complete market line coverage
- Some books may not offer lines for G5_G5 matchups
- FCS games typically have no lines
- **Expected coverage**: 80-95% of FBS games

### Workflow Artifacts
- **Reports uploaded**: `reports/historical/`
- **Retention**: 30 days
- **Contents**: Mapping logs, error logs, statistics
- **Download**: Actions tab → Workflow run → Artifacts section

---

## 🎯 Summary: What to Run

**To get data for calibration on weeks 1-11**:

1. **Week 1-7** (historical, biggest data gain):
   ```
   Workflow: Historical Odds Backfill
   Season: 2025, Weeks: 1-7
   Dry run: false (after testing with true)
   ```

2. **Week 9** (historical, small gap):
   ```
   Workflow: Historical Odds Backfill
   Season: 2025, Weeks: 9
   Dry run: false
   ```

3. **Verify**:
   ```bash
   npx tsx scripts/check-data-availability.ts
   ```

4. **Re-calibrate**:
   ```bash
   npm run calibrate:ridge 2025 1-11
   ```

**Expected timeline**:
- Each workflow run: 5-15 minutes
- Total: ~30-45 minutes for all data
- Plus verification and re-calibration: ~1 hour total

**Expected outcome**:
- **1,800+ calibration points** (vs. 136 currently)
- **Much better model fit** (R² ~30-40% vs. 11%)
- **Reliable coefficients** for production use
- **Validation on held-out week 12** data when it becomes available

---

## 🆘 Troubleshooting

### Workflow fails with "No historical data"
- **Cause**: The Odds API free tier doesn't include historical access
- **Fix**: Upgrade to paid tier or use live endpoint for recent weeks

### Games not matching
- **Cause**: Team name mismatches in aliases
- **Fix**: Check `apps/jobs/config/team_aliases.yml`
- **Enable**: `enable_season_fallback: true` to allow ±8 day matching

### Low line coverage (<50%)
- **Cause**: G5_G5 games often don't have lines
- **Expected**: Normal for lower-tier matchups
- **Fix**: Filter calibration to P5 games only (future enhancement)

### API quota exceeded
- **Cause**: Hit credits_limit or monthly cap
- **Fix**: Increase credits_limit or wait for next billing cycle
- **Monitor**: Check Odds API dashboard for usage

---

## 📚 Related Documentation
- [Nightly Ingest Workflow](./workflows-nightly-ingest.md)
- [Backfill Missing Games](../apps/jobs/BACKFILL_MISSING_GAMES.md)
- [Phase 2.5: Ridge Regularization](./phase2-5-ridge-regularization.md)
- [Data Availability Check Script](../scripts/check-data-availability.ts)

