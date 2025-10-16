## ✅ Post-Run Expectations (CFBD → Odds API, Week N)

### What should exist in the DB (example: 2025, week 8)
- **Sources present:** `oddsapi` for `spread`, `total`, `moneyline`.
- **Counts (order of magnitude):**  
  Expect **~2.6k rows per type** (spread/total/moneyline) for a full FBS slate with ~10–12 books. Exact numbers vary by book coverage and timing.

**Quick checks (paste into Supabase SQL):**
```sql
-- 1) Per-type counts by source
select season, week, line_type, source, count(*) as rows
from market_lines
where season = 2025 and week = 8
group by 1,2,3,4
order by 1,2,3,4;

-- 2) Totals by line type
select
  count(*) filter (where line_type = 'moneyline') as ml_rows,
  count(*) filter (where line_type = 'spread')    as spread_rows,
  count(*) filter (where line_type = 'total')     as total_rows
from market_lines
where season = 2025 and week = 8;

-- 3) Recent sample rows (closing_line fallback to line_value)
select
  game_id, season, week, line_type,
  coalesce(closing_line, line_value) as line_val,
  book_name, source, "timestamp"
from market_lines
where season = 2025 and week = 8
order by "timestamp" desc
limit 30;

-- 4) Moneylines look like American odds (-175 / +150)
select
  game_id, coalesce(closing_line, line_value) as moneyline_price,
  book_name, source, "timestamp"
from market_lines
where season = 2025 and week = 8
  and line_type = 'moneyline'
order by "timestamp" desc
limit 30;

-- 5) Book coverage by type
select line_type, source, book_name, count(*) as rows
from market_lines
where season = 2025 and week = 8
group by 1,2,3
order by 1,2,3;
```

Healthy example signatures:

Per-type rows: spread≈2679, total≈2696, moneyline≈2640 (source=oddsapi)

Books represented: DK, FD, Caesars, BetMGM, Bovada, BetOnline.ag, BetRivers, Fanatics, LowVig.ag, MyBookie.ag, BetUS, etc.

Sample row values show sensible numbers (e.g., spreads -17.5, totals 53, moneylines -1000) with recent timestamps.

### What the UI should show

**Home & Weeks tables**
- Market Close columns for Spread and Total populated.
- ML column populated for many games.
- Source badges like (ODDSAPI) next to numbers; hovering ML shows implied probability and a tooltip with timestamp.

**Game Detail page**
- Moneyline card appears when ML exists (Price, Implied Prob %, Source badge).
- If no ML exists, the ML column shows an em dash and the Moneyline card is hidden.

### What workflows/logs should show

**Odds Poll (3× daily) and Nightly Ingest:**
- CFBD step: "Parsed ~295 games for week N (FBS filtered)"
- Odds step: "Found ~50–60 events" per fetch and parsed counts for spreads/totals/moneylines.
- Chunked upserts logs like: ✅ Upserted XXX market lines in chunks of 500 and [DEDUP] Removed 0 duplicate lines…

**One-Week Odds Test:** same as above but only the requested week.

### If results look off

- **Zero rows:** confirm filters (season, week) and that odds were polled for that week.
- **No ML:** rerun odds poll; some books delay ML. Verify with query #4.
- **Badges missing:** ensure API responses include marketMeta.*.source; rebuild web if you just pulled changes.
- **Timeouts:** workflows should target a single week; chunked upserts are already enabled.

### Sanity math (why ~2.6k rows/type?)

~295 FBS games × ~9–11 books × 1 row per game/book/type → ~2,600–3,200 rows per type.
