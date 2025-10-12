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
| `--minEdge` | float | `2.0` | Minimum edge in points to qualify a bet |
| `--confidence` | string | `A,B,C` | Confidence tiers to include (comma-separated) |
| `--bet` | string | `spread,total` | Bet types to include (`spread`, `total`, or `both`) |
| `--price` | int | `-110` | American odds price (e.g., `-110`) |
| `--kelly` | float | `0` | Kelly fraction (0 = flat 1 unit, 0.5 = half Kelly) |
| `--injuries` | string | `off` | Enable injury adjustments (`on` or `off`) |
| `--weather` | string | `off` | Enable weather adjustments (`on` or `off`) |

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

## Walk-Forward Protocol

The backtest follows a strict walk-forward approach:

1. **For each (season, week) in range:**
   - Fetch games from database for that week
   - Pull `matchup_outputs` for model lines (implied spread/total)
   - Pull `market_lines` for closing lines
   - Apply M6 adjustments if flags are ON

2. **Filter qualifying bets:**
   - Check edge >= `minEdge` (spread OR total)
   - Check confidence in allowed tiers
   - Check bet type matches filter

3. **Calculate stake:**
   - If `kelly=0`: flat 1 unit
   - Else: Kelly fraction capped at 5 units max

4. **Determine result:**
   - If `home_score` and `away_score` exist: compute W/L/Push
   - Else: mark as PENDING (excluded from ROI)

5. **Track metrics:**
   - Per-bet: result, P/L, CLV, edge, confidence
   - Cumulative: equity, drawdown, ROI

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
  "parameters": { ... },
  "totalBets": 15,
  "completedBets": 15,
  "pendingBets": 0,
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
  "confidenceBreakdown": { "A": 5, "B": 8, "C": 2 }
}
```

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
