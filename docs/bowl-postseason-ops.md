# Bowl & Postseason Ops Checklist

This document provides a step-by-step checklist for bootstrapping bowl games, CFP games, and other postseason weeks (typically Week 16+).

---

## When to use this

Use this checklist for any week that is:

- **Week 16 or later** in the season, OR
- Any week that contains **bowl games or CFP games**

Regular season weeks (1-15) are handled automatically by the "Nightly Ingest + Ratings" workflow. This checklist is for manual one-off bootstrapping of postseason weeks.

---

## Per-week checklist

### Step 1 — Run **Bowl Week Bootstrap** workflow

1. Go to **GitHub Actions** → **"Bowl Week Bootstrap"**
2. Click **"Run workflow"**
3. Set inputs:
   - **season**: `2025` (or the appropriate season)
   - **week**: `16`, `17`, `18`, etc. (depending on what CFBD has available)
4. Click **"Run workflow"**

**What the workflow does:**

- ✅ Ingest CFBD schedule for that specific week
- ✅ Ingest OddsAPI odds for that week (SGO odds as backup if OddsAPI fails)
- ✅ Run ratings calculation for the season
- ✅ Generate Hybrid V2 bets for that week
- ✅ Generate the "Hybrid V2 Card (Flat $100)" official bets for that week
- ✅ Run `check-week-data` sanity script to log counts

**What the workflow does NOT do:**

- ❌ Does NOT run CFBD drive sync (too slow, can timeout)
- ❌ Does NOT run SGO team stats ingestion (Labs-only, separate workflow)
- ❌ Does NOT run multi-week backfills

### Step 2 — Sanity check in the app

After the workflow completes, verify the data in the UI:

1. **Browse Weeks** (`/weeks`):
   - Verify the games and odds show for the new week
   - Check that market lines (spreads, totals, moneylines) are populated

2. **Season Review / Week Review** (`/season-review`, `/weeks/review`):
   - Verify Hybrid V2 bets exist for that week
   - Verify Official Card bets exist for that week
   - Check that the week appears in the week selector dropdown

3. **Current Slate** (`/picks` or `/`):
   - Once the week is the next upcoming week (closest to today), it should automatically show as the current week
   - The header should show the correct week number (e.g., "Week 16 · 2025 Season")
   - Date chips should correspond to the game dates for that week

### Step 3 — Notes

- **SGO usage**: In this workflow, SGO is used only as an **odds backup** (if OddsAPI fails). It is NOT used for team season stats.
- **SGO team stats**: All SGO team stats ingestion is Labs-only and handled by a separate workflow (`sgo-team-stats.yml`). You can safely ignore it if the higher-priced SGO plan is disabled.
- **Drive stats**: This workflow does NOT sync drive stats. Existing `drive_stats` from previous weeks will be used for ratings calculations.

---

## What NOT to do

- ❌ **Don't manually edit weeks in the DB** — Use the Bowl Week Bootstrap workflow instead
- ❌ **Don't run full-season drive syncs during bowl season from GitHub** — They can time out (30+ minutes)
- ❌ **Don't run multiple workflows simultaneously** — Wait for one to complete before starting another

---

## Troubleshooting

If something looks wrong:

1. **Check the workflow logs**:
   - Look at the "Sanity check - Log data counts" step output
   - Verify games, market lines, and bets counts are non-zero

2. **Run the check script locally**:
   ```bash
   npx tsx scripts/check-week-data.ts --season 2025 --week 16
   ```

3. **Check the API directly**:
   - `/api/weeks` should return the correct current week once data exists
   - `/api/weeks/slate?season=2025&week=16` should return games for that week

4. **Verify CFBD has the data**:
   - Check CFBD's API or website to confirm the week number exists
   - Some bowl weeks may be numbered differently (e.g., "Bowl Week 1" vs "Week 16")

---

## Related workflows

- **Nightly Ingest + Ratings** (`nightly-ingest.yml`): Continues to run automatically for regular season weeks
- **Bowl Week Bootstrap** (`bowl-week-bootstrap.yml`): Manual workflow for postseason weeks (this checklist)
- **SGO Team Stats Sync** (`sgo-team-stats.yml`): Separate Labs-only workflow for team stats (not used in this checklist)



