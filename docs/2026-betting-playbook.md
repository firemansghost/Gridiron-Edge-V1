# 2026 Betting Playbook – Hybrid V2, Conflict Tags, and Fade V4

_Last updated: prepping for the 2026 season._

This document defines how we actually **use** the Gridiron Edge models in 2026, not just how they're computed.

The core ideas:

- **Hybrid V2** is the **only production spread model**.

- **Conflict tags** (`hybrid_strong`, `hybrid_weak`, `hybrid_only`) tell us **when to trust Hybrid more or less**.

- **V4 / Fade V4** remain **Labs-only**, but fading V4 has shown consistent positive ROI and helps define our "strong" vs "weak" buckets.

---

## 1. Models: Production vs Labs

**Production:**

- **Hybrid V2** (`strategyTag = 'hybrid_v2'`)

  - This is the model used for **My Picks** and live recommendation logic.

**Labs / Experimental:**

- **V4 (Labs)** (`strategyTag = 'v4_labs'`)

  - SP+/FEI-inspired drive-based spread model.

  - Standalone performance has been **unprofitable** in backtests.

- **Fade V4 (Labs)** (`strategyTag = 'fade_v4_labs'`)

  - Takes the opposite side of every V4 bet.

  - Has shown **positive ROI** in both 2024 and 2025.

  - Still treated as **experimental**, not production.

All non-Hybrid strategies are informational overlays and **do not** drive My Picks directly.

---

## 2. Key Concepts

### Edge

- `edge` = model spread vs closing line (HMA format).

- We use `|edge|` (absolute value) to group bets into tiers.

### CLV (Closing Line Value)

- How much the market moved in our favor between open and close.

- Positive CLV = market agrees with us.

- Strong Super Tier A performance comes with **strongly positive CLV**.

### Conflict Types (`hybridConflictType`)

Stored on every Bet row as `hybrid_conflict_type`:

- `hybrid_strong`

- `hybrid_weak`

- `hybrid_only`

These are **diagnostic labels** computed using 2025 behavior of:

- Hybrid results

- Fade V4 results

- CLV behavior

Rough intuition:

- **`hybrid_strong`**  

  Games where Hybrid's signal has historically converted to **high ROI with supportive CLV**, and Fade V4 behavior is consistent with that strength.

- **`hybrid_weak`**  

  Games where Hybrid's edges look big on paper, but ROI and/or CLV have been **much weaker or flat**.

- **`hybrid_only`**  

  Games where only Hybrid has a bet (rare in 2025).

Exact formulas live in `sync-hybrid-conflict-tags.ts`. This doc is about **how to use** the labels.

---

## 3. 2025 Snapshot – Why Super Tier A Exists

Using 2025 Hybrid V2 spread bets:

### 3.1 Super Tier Candidate

Filter:

- `strategyTag = 'hybrid_v2'`

- `hybridConflictType = 'hybrid_strong'`

- `|edge| >= 4.0`

Results (2025):

- **274 bets**

- **Record:** 215–58–1 (78.8% win rate)

- **ROI:** **+50.16%**

- **Avg edge:** 18.49

- **Avg CLV:** +15.96

This is the basis for the **Super Tier A** concept.

### 3.2 Hybrid Strong vs Hybrid Weak (All Edges)

**Hybrid Strong (all edge sizes):**

- 357 bets  

- 73.2% win rate  

- +39.34% ROI  

- Positive CLV

**Hybrid Weak (all edge sizes):**

- 351 bets  

- 52.8% win rate  

- +0.69% ROI  

- Slightly negative CLV

Conclusion:

- **Hybrid Strong** is where the model is genuinely sharp.

- **Hybrid Weak** is essentially a breakeven bucket.

### 3.3 V4 and Fade V4

Across 2024–2025:

- **V4 (Labs) standalone:**  

  - Unprofitable in both seasons (negative ROI, sub-40% win rate).

- **Fade V4 (Labs):**  

  - 2024: ~10% ROI  

  - 2025: ~18% ROI  

Fade V4's profitability helps separate **strong vs weak Hybrid games**, but V4 itself remains experimental and is **not** used as a standalone strategy.

---

## 4. 2026 Tiering Rules

### 4.1 Tier Definitions (Hybrid V2)

We tier Hybrid V2 bets by **absolute edge**:

- **Tier C:** `|edge| < 2.0`  

  - Default: **ignore**. Info only.

- **Tier B:** `2.0 ≤ |edge| < 3.0`  

  - "Leans / action plays".

  - Requires other confirmation (e.g., Barnes, Crick, matchup notes).

- **Tier A:** `3.0 ≤ |edge| < 4.0`  

  - Serious plays.

- **Super Tier A:** `|edge| ≥ 4.0` **AND** `hybridConflictType = 'hybrid_strong'`  

  - Top-shelf, hammer-worthy bucket.

  - Origin: 2025 backtest (78.8% win rate, +50.16% ROI).

### 4.2 Conflict Type Usage

For **Hybrid V2** bets:

- **`hybrid_strong`**

  - Forms the backbone of 2026 ATS strategy.

  - Used for:

    - **Super Tier A**: `|edge| ≥ 4.0`

    - **Tier A (Strong)**: `3.0 ≤ |edge| < 4.0`

    - **Tier B (Strong)**: `2.0 ≤ |edge| < 3.0` (optional, needs external confirmation)

- **`hybrid_weak`**

  - Not auto-bet in 2026, regardless of edge size.

  - May be used as "consider only with strong external confirmation".

- **`hybrid_only`**

  - Rare; treat case-by-case.

---

## 5. Fade V4 in 2026

Fade V4 remains **Labs-only**, but:

- Has shown consistent positive ROI as a standalone backtest.

- Performs best in **Hybrid Strong** games.

- Underperforms in **Hybrid Weak** games.

**Usage guideline:**

- Only use Fade V4 as **confirmation** or **secondary Labs overlay** in games tagged `hybrid_strong`.

- Ignore V4/Fade V4 in `hybrid_weak` games.

---

## 6. My Picks UI Semantics

To make the 2026 playbook usable from the couch:

For each Hybrid V2 pick shown on **My Picks**:

- Show a **Conflict badge**:

  - `Strong`, `Weak`, or `Only`

  - Color-coded (e.g., green / yellow / neutral)

- Show a **Tier label** based on `|edge|`:

  - `Super Tier A` (Strong + `|edge| ≥ 4.0`)

  - `Tier A (Strong)` (`3.0–3.99`, Strong)

  - `Tier B (Strong)` (`2.0–2.99`, Strong)

  - No label for weaker edges

- Provide UI filters:

  - "Show only **Super Tier A**"

  - "Show only **Hybrid Strong**"

This keeps the **highest-value plays** front and center without hiding the rest of the model output.

---

## 7. Operational Notes

To keep this playbook valid during the season:

1. **Normal workflows** (nightly ingest, grading, etc.) must stay green.

2. **Conflict tags** must be kept up to date:

   - Run `sync-hybrid-conflict-tags.ts` after grading for each week/season as needed.

3. Fade V4 remains **Labs-only**:

   - May be exposed in Labs screens and export tools.

   - Not used to drive My Picks directly.

---

## 8. Continuity Guardrails (Labs Only – Based on 2025 Backtest)

Continuity Score is a 0–100 roster stability metric built from CFBD returning production + portal churn. High = stable/veteran, Low = chaos/new pieces. It is not in the production Hybrid V2 model yet, but we use it as a tactical overlay.

**What 2025 showed:**

- Hybrid V2 was profitable across all continuity bands (Low/Mid/High).

- The big pattern was **favorites vs dogs**, not "high good, low bad."

- **Low-continuity dogs were consistently terrible.**

- **Low-, mid-, and high-continuity favorites all crushed.**

**Soft rules for 2026 (subject to further testing):**

1. **Low-continuity dogs (<0.60): yellow flag.**

   - Avoid unless the game is Super Tier A and other context supports it.

   - These profiles were -14% to -21% ROI in 2025 backtests.

2. **Favor favorites.**

   - Favorites performed extremely well across all bands, especially low-continuity favorites (~+50–60% ROI).

   - Continuity should not scare us off a strong favorite if Hybrid likes the number.

3. **Be picky on 14+ point spreads with mid/high continuity.**

   - These were roughly breakeven in 2025.

   - Treat them as lower priority or require stronger edge / conflict alignment.

These are **guardrails, not hard filters**. They inform human review of the card and Labs experiments (e.g., re-running 2025 portfolios with low-continuity dogs removed). Any hard-coded model changes belong in a future Hybrid V5 cycle.

### 8.1 2025 Portfolio Experiment: Dropping Low-Continuity Dogs

We simulated the 2025 official card (`official_flat_100`) with and without low-continuity dogs:

**Baseline (all bets):**
- 937 bets, 59.5% win rate, +13.53% ROI, +$12,676.80 PnL

**Removed subset (low-continuity dogs only):**
- 316 bets, 40.8% win rate, **-22.04% ROI**, -$6,964.80 PnL

**Filtered card (dropping low-continuity dogs):**
- 621 bets, 69.2% win rate, **+31.63% ROI**, +$19,641.60 PnL

**Impact:**
- Removing 316 low-continuity dog bets would have improved PnL by **+$6,964.80** and ROI by **+18.10 percentage points** (from +13.53% to +31.63%).

This is **Labs-only evidence** and not yet a hard rule, but it strongly supports the guardrail: low-continuity dogs were a significant drag on the 2025 official card. The experiment suggests that avoiding these bets in 2026 card construction could meaningfully improve performance.

### 8.2 Hybrid V2 Portfolio Experiment: Dropping Low-Continuity Dogs (Labs)

We simulated the 2025 Hybrid V2 portfolio (`hybrid_v2`) with and without low-continuity dogs:

**Baseline (all bets):**
- 710 bets, 63.2% win rate, +20.38% ROI, +$14,468.70 PnL

**Removed subset (low-continuity dogs only):**
- 239 bets, 44.7% win rate, **-14.50% ROI**, -$3,464.60 PnL

**Filtered portfolio (dropping low-continuity dogs):**
- 471 bets, 72.6% win rate, **+38.07% ROI**, +$17,933.30 PnL

**Impact:**
- Removing 239 low-continuity dog bets would have improved PnL by **+$3,464.60** and ROI by **+17.70 percentage points** (from +20.38% to +38.07%).

**Observations:**
- The pattern matches the official card: low-continuity dogs were a significant drag on Hybrid V2 performance.
- Hybrid V2's baseline ROI (+20.38%) was already strong, but filtering low-continuity dogs would have pushed it to **+38.07% ROI**.
- The filtered portfolio would have achieved a **72.6% win rate** (vs 63.2% baseline).

This is **Labs-only evidence** and not yet a hard production rule, but it strongly supports the guardrail for both the official card and Hybrid V2 strategies. Avoiding low-continuity dogs in 2026 could meaningfully improve performance across both portfolios.

---

## 9. Future Model Enhancements (V5+)

We're planning to add Portal & NIL Meta Indices as Labs overlays, with potential integration into a future V5 Hybrid model:

- **Continuity Score v1** ✅ **Now Available**
  - Measures roster stability (returning production + transfer portal activity)
  - Stored in `team_season_stats.raw_json.portal_meta.continuityScore` (0-1 scale)
  - Available in Labs page `/labs/portal` and CLI histogram tool
  - **Not yet used in Hybrid V2 production model**; candidate feature for future Hybrid V5

- **Positional Shock Index**: Flags teams with extreme turnover at key positions (QB, OL, DL) — *Planned*

- **Mercenary Index**: Identifies teams heavily reliant on short-term transfers — *Planned*

- **Portal Aggressor Flag**: Flags teams that aggressively use the transfer portal (net talent gain) — *Planned*

These will initially live as **Labs overlays** to test their predictive value. If they prove stable and additive in backtests, they may be folded into the core Hybrid model in a future V5 release.

See [Data Inventory](/docs/data-inventory) for current data structures, and [Bowl & Postseason Ops](/docs/bowl-postseason-ops) for the operations side.

---

## 10. Disclaimer

All numbers above are based on historical backtests (2024–2025).  

Performance can and will regress. The rules here are designed to:

- Lean into the **strongest, most stable buckets** we've observed so far.

- Avoid overreacting to noisy or weak buckets.

- Keep the UI honest about what is "hammer-worthy" vs "just interesting."




