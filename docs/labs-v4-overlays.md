# V4 (Labs) & Fade V4 Overlay Strategy

## Overview

V4 is an experimental spread rating model inspired by SP+ and FEI methodologies. It uses drive-based metrics (Finishing Drives, Available Yards %) and advanced efficiency statistics to generate spread predictions. V4 is **not used in production** and is available only in Labs for research and backtesting purposes.

## What is V4?

V4 (Labs) is a spread rating model that:

- Uses drive-level data to calculate team efficiency metrics
- Incorporates "Finishing Drives" (points per scoring opportunity)
- Uses "Available Yards %" (fraction of possible field gained per drive)
- Applies z-score normalization and weighted offense/defense ratings
- Generates spread predictions similar to SP+ and FEI-style models

**Status:** Experimental / Labs-only. Not used for live picks or production recommendations.

## What is Fade V4?

Fade V4 (Labs) is an overlay strategy that:

- **Strategy Tag:** `fade_v4_labs`
- Takes the **opposite side** of every V4 bet
- Uses the same stake and closing line as the original V4 bet
- Flips the model price and side to create a "fade" bet

**Example:** If V4 picks Team A -3.5, Fade V4 picks Team B +3.5.

## Backtest Results

### Summary Table

| Season | Strategy       | Bets | Win Rate | ROI      | Tier A ROI |
|--------|----------------|------|----------|----------|------------|
| 2024   | V4 (Labs)      | 372  | 35.1%    | -32.75%  | -35.08%    |
| 2024   | Fade V4 (Labs) | 372  | 58.0%    | +10.43%  | +7.48%     |
| 2025   | V4 (Labs)      | 709  | 39.1%    | -24.96%  | -26.88%    |
| 2025   | Fade V4 (Labs) | 671  | 61.8%    | +17.81%  | +18.93%    |

### 2024 Season Details

**V4 Labs (standalone):**
- 372 graded bets
- Win rate: 35.1% (130W-240L-2P)
- ROI: -32.75%
- Tier A ROI (edge ≥ 3.0 pts): -35.08%
- Average CLV: +0.50 points

**Fade V4 (Labs):**
- 372 graded bets
- Win rate: 58.0% (211W-153L-8P)
- ROI: +10.43%
- Tier A ROI: +7.48%
- Average CLV: -2.43 points

### 2025 Season Details

**V4 Labs (standalone):**
- 709 graded bets
- Win rate: 39.1% (274W-426L-9P)
- ROI: -24.96%
- Tier A ROI (edge ≥ 3.0 pts): -26.88%
- Average CLV: +2.12 points

**Fade V4 (Labs):**
- 671 graded bets
- Win rate: 61.8% (412W-255L-4P)
- ROI: +17.81%
- Tier A ROI: +18.93%
- Average CLV: -1.96 points

## Key Observations

1. **V4 Standalone Performance:** V4 as a standalone model is consistently unprofitable across both seasons, with win rates below 40% and negative ROI.

2. **Fade V4 Performance:** Fade V4 has shown positive ROI in both 2024 (+10.43%) and 2025 (+17.81%), suggesting that V4's predictions are systematically biased in a way that makes fading profitable.

3. **Consistency:** The fade strategy has been profitable in both seasons tested, indicating a potentially robust pattern rather than random variation.

4. **Tier A Performance:** Fade V4 remains profitable even when filtering to only high-confidence bets (edge ≥ 3.0 points), though ROI is slightly lower in 2024.

## Important Disclaimers

- **All results are backtests, not guarantees.** Past performance does not guarantee future results.
- **Fade V4 is Labs-only** and is not part of the main "My Picks" flow.
- **Hybrid V2 remains the only official spread model** used for production recommendations.
- **V4 is experimental** and subject to ongoing refinement. The model may be updated or deprecated in future versions.
- **Regression risk:** The profitable fade pattern may not persist as the model evolves or market conditions change.

## Technical Details

### V4 Model Components

- **Finishing Drives:** Points per scoring opportunity (drives reaching opponent's 40-yard line or closer)
- **Available Yards %:** Fraction of possible field gained per drive
- **Success Rate:** When available from CFBD
- **IsoPPP:** Explosiveness metric (when available)
- **Z-score normalization:** All features normalized to standard deviations from mean
- **Weighted offense/defense ratings:** Separate ratings combined into final spread

### Fade V4 Implementation

- Strategy tag: `fade_v4_labs`
- For each V4 bet with strategy tag `v4_labs`:
  - Flip the side (Home ↔ Away)
  - Flip the model price (multiply by -1)
  - Use the same stake and closing line
  - Create a new bet with strategy tag `fade_v4_labs`

## Related Documentation

- [Methodology](/docs/methodology) - Full modeling approach and data sources
- [Backtesting Guide](/docs/backtest) - How to run backtests and analyze results

## Future Work

V4 is under active development. Potential improvements include:

- Refinement of drive-based metrics
- Better integration of finishing drives data
- Calibration adjustments to improve standalone performance
- Investigation into why fading is profitable (systematic bias vs. model limitations)

---

**Last Updated:** 2025-12-01  
**Status:** Experimental / Labs-only

