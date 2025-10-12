# Backtesting Documentation

## Overview

The backtesting CLI enables walk-forward testing of betting strategies using historical data. It supports flexible parameters for edge thresholds, stake sizing (flat or Kelly), and M6 adjustments (injuries/weather).

## CLI Usage

### Basic Command

```bash
npm run backtest -- [options]
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `--season` | string | `2024` | Single season (`2024`) or range (`2022-2024`) |
| `--weeks` | string | `1-1` | Week range (`1-13`) or list (`1,3,6`) |
| `--market` | string | `closing` | Market line type (closing only for now) |
| `--minEdge` | float | `0` | Minimum edge in points to qualify a bet (default: 0) |
| `--confidence` | string | `all` | Confidence tiers to include (e.g., `A,B` or omit for all) |
| `--bet` | string | `both` | Bet types: `spread`, `total`, or `both` (UNION logic) |
| `--price` | int | `-110` | American odds price (e.g., `-110`) |
| `--kelly` | float | `0` | Kelly fraction (0 = flat 1 unit, 0.5 = half Kelly) |
| `--model` | string | `latest` | Model version (e.g., `v0.0.1` or omit for latest available) |
| `--verbose` | flag | `false` | Enable detailed logging (funnel counts, summaries) |
| `--injuries` | string | `off` | Enable injury adjustments (`on` or `off`) |
| `--weather` | string | `off` | Enable weather adjustments (`on` or `off`) |

**Notes:**
- **UNION Selection:** When `--bet both` is used, the CLI evaluates spread and total bets independently. A game with both a qualifying spread edge AND a qualifying total edge will generate TWO bets (not just one).
- **Default Behavior:** If `--minEdge` is omitted, it defaults to 0 (all edges qualify). If `--confidence` is omitted, all tiers (A/B/C) are included.
- **Pending Bets:** All qualifying bets are written to the CSV, even if scores are missing. Pending bets have `result=PENDING`, `pnl=0`, and are excluded from ROI/hit-rate calculations but included in opportunity counts.

## Examples

### Example 1: Flat Stakes, A/B Tier Only

```bash
npm run backtest -- --season 2024 --weeks 1 --bet both --minEdge 2.0 --confidence A,B --price -110 --kelly 0
```

**Expected Output:**
- Uses flat 1-unit stakes on all qualifying bets
- Only bets with 2+ point edge and A or B confidence
- Both spread and total bets included

### Example 2: Kelly Sizing with Adjustments

```bash
npm run backtest -- --season 2024 --weeks 1 --bet spread --minEdge 2.5 --confidence A --kelly 0.5 --injuries on --weather on --price -110
```

**Expected Output:**
- Half-Kelly stake sizing (conservative)
- Injury and weather adjustments applied to model lines
- Only A-tier spread bets with 2.5+ edge
- Stakes vary by edge size (capped at 5 units)

### Example 3: Multi-Week Test

```bash
npm run backtest -- --season 2024 --weeks 1-4 --bet both --minEdge 2.0 --confidence A,B,C --price -110 --kelly 0
```

**Expected Output:**
- Tests weeks 1-4 of 2024 season
- Flat stakes across all confidence tiers
- Chronological equity curve over 4 weeks

### Example 4: Verbose Mode with All Edges

```bash
npm run backtest -- --season 2024 --weeks 1-1 --minEdge 0 --verbose
```

**Expected Output:**
- Shows detailed funnel counts at each stage:
  - Total matchups found
  - After model output filter
  - After confidence filter
  - Spread/total edge qualifications
  - Union bets written
  - Games with/without scores
- Includes comprehensive summary with opportunities, settled, and pending counts

### Example 5: Specific Model Version

```bash
npm run backtest -- --season 2024 --weeks 1-1 --model v0.0.1 --minEdge 2.5 --confidence A --verbose
```

**Expected Output:**
- Uses only model version `v0.0.1` outputs
- Shows model version in verbose logging
- Only A-tier bets with 2.5+ edge

## Walk-Forward Protocol

The backtest follows a strict walk-forward approach:

1. **For each (season, week) in range:**
   - Fetch games from database for that week
   - Determine model version (use specified `--model` or latest available)
   - Pull `matchup_outputs` for model lines (implied spread/total)
   - Pull `market_lines` for closing lines
   - Apply M6 adjustments if flags are ON

2. **Filter qualifying bets (UNION logic):**
   - Check confidence tier in allowed list (or all if omitted)
   - **For spread:** Check spread edge >= `minEdge`
   - **For total:** Check total edge >= `minEdge`
   - If both qualify for a single game, BOTH bets are written (union, not intersection)

3. **Calculate stake:**
   - If `kelly=0`: flat 1 unit
   - Else: Kelly fraction based on edge and price, capped at 5 units max

4. **Determine result:**
   - If `home_score` and `away_score` exist: compute W/L/Push
   - Else: mark as `PENDING` and set `pnl=0`
   - **PENDING bets are written to CSV** but excluded from ROI/hit-rate denominators

5. **Track metrics:**
   - Per-bet: result, P/L, CLV, edge, confidence, bet type
   - Summary: opportunities (all bets), settled (with scores), pending (without scores)
   - Cumulative: equity, drawdown, ROI (calculated only on settled bets)

6. **Verbose logging (if `--verbose` flag):**
   - Funnel counts: total matchups → model output → confidence filter → edge qualifications → union bets
   - Scores status: games with scores vs. pending
   - Summary: opportunities, settled, pending, W/L/Push, ROI, confidence/bet-type breakdowns

## Outputs

All outputs are written to `./reports/` directory:

### 1. CSV Report (`backtest_<timestamp>.csv`)

Per-bet rows with columns:
- `season`, `week`, `gameId`, `matchup`
- `betType`, `pickLabel`, `line`, `marketLine`
- `edge`, `confidence`, `price`, `stake`
- `result`, `pnl`, `clv`
- `homeScore`, `awayScore`

**Use Case:** Import into Excel/Sheets for detailed analysis

### 2. Summary JSON (`backtest_<timestamp>_summary.json`)

Aggregate statistics:
```json
{
  "filters": {
    "season": "2024",
    "weeks": "1-1",
    "model": "v0.0.1",
    "minEdge": 2.0,
    "confidence": ["A", "B", "C"],
    "betTypes": ["spread", "total"],
    "market": "closing",
    "price": -110,
    "kelly": 0,
    "injuries": false,
    "weather": false
  },
  "opportunities": 18,
  "settled": 15,
  "pending": 3,
  "wins": 9,
  "losses": 5,
  "pushes": 1,
  "hitRate": "60.00%",
  "totalRisked": "15.00",
  "totalProfit": "3.50",
  "roi": "23.33%",
  "avgClv": "2.45",
  "avgStake": "1.00",
  "maxDrawdown": "2.50",
  "confidenceBreakdown": { "A": 6, "B": 9, "C": 3 },
  "betTypeBreakdown": { "spread": 10, "total": 8 },
  "timestamp": "2024-10-12T12:34:56.789Z"
}
```

**New Fields:**
- `filters`: Echo of all input parameters for reproducibility
- `opportunities`: Total bets written to CSV (including pending)
- `settled`: Bets with scores (used in ROI/hit-rate calculations)
- `pending`: Bets without scores (excluded from performance metrics)
- `betTypeBreakdown`: Count of spread vs. total bets

### 3. Chart Data JSON Files

- **`backtest_<timestamp>_equity.json`**: Equity curve data
- **`backtest_<timestamp>_drawdown.json`**: Drawdown over time
- **`backtest_<timestamp>_edge_hist.json`**: Edge distribution histogram

**Use Case:** Import into charting tools (future: auto-generate PNGs)

## Interpreting Results

### Key Metrics

**Hit Rate**
- % of winning bets (excluding pushes)
- Breakeven at -110: ~52.4%
- Target: 55%+ for profitable strategy

**ROI (Return on Investment)**
- (Total Profit / Total Risked) × 100
- Measures efficiency of capital
- Target: 5%+ is good, 10%+ is excellent

**CLV (Closing Line Value)**
- Average edge between model line and market close
- Positive CLV = betting better than market
- Target: 1.5+ pts average

**Max Drawdown**
- Largest peak-to-trough decline in units
- Measures risk/volatility
- Lower is better (aim for < 10 units)

### Confidence Tier Analysis

Review `confidenceBreakdown` to see bet distribution:
- **A Tier**: Should have highest hit rate and ROI
- **B Tier**: Medium performance
- **C Tier**: Lowest (consider excluding if underperforming)

### Equity Curve

Ideal equity curve:
- ✅ Consistent upward trend
- ✅ Shallow drawdowns
- ❌ Avoid: long flat periods or steep drops

## Assumptions & Limitations

### Current Implementation (Seed/Mock Mode)

1. **Historical Data**:
   - Uses `games.home_score` and `games.away_score` for results
   - PENDING bets excluded from ROI (no score data)
   - Assumes closing lines in `market_lines.closing_line`

2. **Stake Sizing**:
   - Kelly formula simplified (no bankroll tracking)
   - Stakes capped at 5 units max
   - No compounding (each bet independent)

3. **Price**:
   - Single price for all bets (typically -110)
   - No line shopping or best-price logic
   - No juice variation by book

4. **Adjustments**:
   - M6 lite adjustments (injury/weather heuristics)
   - Mock data only (no real injury reports)
   - Applied uniformly (no game-specific nuance)

### Future Enhancements (V2+)

- Multi-price support (track best line per game)
- Compounding Kelly (adjust stakes by bankroll)
- Real injury/weather APIs
- Intraday line movement analysis
- Correlation analysis (avoid same-game parlays)
- Book-specific juice modeling
- PNG chart generation (equity, drawdown, histograms)
- Multi-season trend analysis
- Confidence tier-specific calibration

## Troubleshooting

### No Bets Qualified

**Issue**: `totalBets: 0` in summary

**Solutions**:
- Lower `--minEdge` (try 1.5 or 1.0)
- Expand `--confidence` to include C tier
- Check `--weeks` range has data
- Verify `market_lines` exist for season/week

### All Bets PENDING

**Issue**: `completedBets: 0`, all marked PENDING

**Solutions**:
- Run seed scores: `npm run seed:ratings`
- Check `games.home_score` / `games.away_score` populated
- Verify season/week has final scores in database

### Low Hit Rate (<50%)

**Issue**: Losing money consistently

**Solutions**:
- Review edge distribution (might be too low)
- Check confidence tier mix (C tier may be unprofitable)
- Verify model assumptions (HFA, adjustments)
- Consider higher `--minEdge` threshold

### High Drawdown

**Issue**: `maxDrawdown` > 15 units

**Solutions**:
- Reduce Kelly fraction (try 0.25 instead of 0.5)
- Filter to higher confidence tiers only
- Increase `--minEdge` threshold
- Review bet sizing strategy

## Best Practices

1. **Start Conservative**:
   - Use flat stakes (`--kelly 0`) first
   - Test A/B tiers only initially
   - Single week before multi-week

2. **Validate Model**:
   - Positive CLV is essential
   - Hit rate should exceed breakeven
   - Equity curve should trend up

3. **Iterate Parameters**:
   - Test multiple `minEdge` values
   - Compare A vs A/B vs A/B/C mixes
   - Evaluate Kelly vs flat stakes

4. **Track Over Time**:
   - Save all backtest results
   - Compare week-to-week consistency
   - Monitor model degradation

5. **Separate Train/Test**:
   - Don't optimize on same data used for validation
   - Use early weeks to calibrate, later weeks to test
   - Avoid overfitting to historical quirks

---

## Viewer CSV Format

The backtest viewer (`/backtests` page) accepts CSV files from `/reports/backtest_*.csv`. The CSV must include the following columns:

### Required Columns

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `gameId` | string | Unique game identifier | `game-1` |
| `betType` | string | Type of bet (spread/total) | `spread` |
| `pickLabel` | string | Human-readable pick | `Alabama -30.0` |
| `edge` | number | Points edge vs market | `1.50` |
| `confidence` | string | Tier (A/B/C) | `A` |

### Optional Columns

| Column | Type | Description |
|--------|------|-------------|
| `season` | number | Season year |
| `week` | number | Week number |
| `matchup` | string | Matchup string |
| `line` | number | Model line |
| `marketLine` | number | Market closing line |
| `price` | number | American odds |
| `stake` | number | Bet size |
| `result` | string | WIN/LOSS/PUSH/PENDING |
| `pnl` | number | Profit/loss |
| `clv` | number | Closing line value |
| `homeScore` | number | Final home score |
| `awayScore` | number | Final away score |

### Header Normalization

The viewer automatically normalizes common header variants:
- `bettype`, `bet_type` → `betType`
- `marketline`, `market_line` → `marketLine`
- `picklabel`, `pick_label` → `pickLabel`
- `homescore`, `home_score` → `homeScore`
- `awayscore`, `away_score` → `awayScore`
- `gameid`, `game_id` → `gameId`
- `p/l`, `pl` → `pnl`
- `conf` → `confidence`

### Common Pitfalls

**1. Excel CSV Encoding**
- Excel may add BOM (Byte Order Mark) or use non-standard line endings
- Solution: Save as "CSV UTF-8 (Comma delimited)" or use Text Editor

**2. Commas in Fields**
- Matchup strings with commas (e.g., "Team A, Team B @ Team C") can break parsing
- Solution: Ensure fields are properly quoted or replace commas with " vs "

**3. Missing Headers**
- The first row must contain column headers
- Headers are case-insensitive and will be normalized

**4. Empty Rows**
- Empty rows or rows with blank `gameId` are automatically skipped
- A warning will show if any rows were skipped

**5. Numeric Parsing**
- All numeric fields are coerced (invalid values → empty string)
- NaN values won't cause errors but will display as "—" in the table

### Example CSV

```csv
season,week,gameId,matchup,betType,pickLabel,line,marketLine,edge,confidence,price,stake,result,pnl,clv,homeScore,awayScore
2024,1,game-1,Away @ Home,spread,Home -30.0,-30.0,-28.5,1.50,C,-110,1.00,WIN,0.91,1.50,63,0
2024,1,game-1,Away @ Home,total,Over 56.5,56.5,58.0,1.50,C,-110,1.00,LOSS,-1.00,1.50,63,0
```

### Testing Your CSV

1. **Download Header Template**: Click "Download Header Template" on the viewer page
2. **Load Demo**: Click "Load Demo CSV" to see a working example
3. **Validate**: Upload your CSV and check for error messages
4. **Debug**: Check browser console for first 3 parsed rows if issues persist
