# Calibration Post-Run Verification & Actions (Core → Extended)

## Purpose
This document provides a systematic checklist for verifying Phase C (Core) and Phase D (Extended) calibration results, with clear triage steps if gates fail. **Do not proceed to Extended until Core passes all gates.**

---

## Phase C: Core Verification (cal_v1_core)

### Inputs / Data Set Verification

**Expected:**
- ✅ Training rows in DB: **876 total**
  - Set A: 197 rows @ weight 1.0 (Weeks 8-11)
  - Set B: 679 rows @ weight 0.6 (Weeks 1-7)
- ✅ Target frame = **HMA (home − away)**, not favorite-centric
  - Mixed positive/negative targets (≥25% negatives = away favorites)
- ✅ Features:
  - `rating_blend` (w=0.05 = 5% V2 + 95% MFTR-ridge)
  - `hfaPoints` explicit (not baked into ratings)
  - No double-counting

**Verification:**
```bash
# Check row counts
SELECT set_label, COUNT(*) FROM game_training_rows 
WHERE season=2025 AND feature_version='fe_v1' 
GROUP BY set_label;

# Check target distribution (should be mixed signs)
SELECT 
  COUNT(*) FILTER (WHERE target_spread_hma > 0) as positive,
  COUNT(*) FILTER (WHERE target_spread_hma < 0) as negative,
  COUNT(*) FILTER (WHERE target_spread_hma = 0) as zero
FROM game_training_rows 
WHERE season=2025 AND feature_version='fe_v1';
```

---

### Gates (MUST PASS - All of Them)

#### 1. Raw Variance Gate (Pre-Calibration Head)
**Gate:** `std(ŷ_raw)/std(y) ∈ [0.6, 1.2]`

**Location:** Check `core_variance_pre_post.csv` → `ratio_raw` column

**If FAILS:**
- ❌ **DO NOT** apply calibration head yet
- Lower `α` (less regularization) in grid search
- Widen grid: try `α ∈ [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005]`
- Re-run until variance ratio ∈ [0.6, 1.2]
- **Root cause:** Over-regularization or collinearity crushing signal

#### 2. Post-Head Gates (Final ŷ*)
All must pass on walk-forward validation:

| Gate | Target | Check Location |
|------|--------|----------------|
| **RMSE** | ≤ 8.8 | `core_metrics.csv` → walk_forward row |
| **Slope** | 0.90–1.10 | `cal_fit_core.json` → `gates.slope` |
| **Pearson** | ≥ 0.30 | `cal_fit_core.json` → `gates.pearson` |
| **Spearman** | ≥ 0.30 | `cal_fit_core.json` → `gates.spearman` |
| **β(rating_blend)** | > 0 | `cal_fit_core.json` → `gates.coefficientSanity.ratingDiff` |
| **β(hfaPoints)** | > 0 | `cal_fit_core.json` → `gates.coefficientSanity.hfaPoints` |
| **Residual buckets** | \|mean\| ≤ 2.0 | `core_residual_buckets.csv` → all buckets |

**Residual Buckets:**
- 0–7: `|mean| ≤ 2.0`
- 7–14: `|mean| ≤ 2.0`
- 14–28: `|mean| ≤ 2.0`
- >28: `|mean| ≤ 2.0`

---

### Artifacts (Must Exist in `reports/`)

**Required Files:**
- ✅ `core_metrics.csv` (train + walk-forward metrics)
- ✅ `core_variance_pre_post.csv` (std(y), std(ŷ_raw), std(ŷ*), ratios)
- ✅ `core_residual_buckets.csv` (bucket means)
- ✅ `core_top_outliers.csv` (top 20 by |residual|)
- ✅ `core_10game_sanity.csv` (10-game sample: game, market HMA, ŷ*, residual, rating_blend, HFA)
- ✅ `cal_fit_core.json` (full fit report)
- ✅ `docs/MODEL_CARD_CAL_V1_CORE.md` (model card)

**Verification:**
```bash
# Check all artifacts exist
ls reports/core_*.csv reports/cal_fit_core.json docs/MODEL_CARD_CAL_V1_CORE.md
```

---

### If Core PASSES ✅

**Actions:**
1. **Persist to Database:**
   ```sql
   -- Verify model_calibration row exists
   SELECT model_version, fit_label, gates_passed, slope, rmse, pearson, spearman
   FROM model_calibration 
   WHERE model_version='cal_v1_core' AND fit_label='core';
   ```
   - Store: blend weight (w=0.05), head type/params, random seeds, all metrics
   - `gates_passed=true` only if ALL gates pass

2. **Proceed to Extended v0 (Phase D)**
   - Script will auto-run Extended after Core
   - Extended must beat Core on same gates to be kept

---

### If Core MISSES ❌ (Triage in Order)

#### Triage Step 1: Raw Variance < 0.6
**Symptom:** `ratio_raw < 0.6` in `core_variance_pre_post.csv`

**Actions:**
1. Lower `α` grid (less regularization)
2. Try: `α ∈ [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01]`
3. Prefer `l1_ratio ∈ [0.0, 0.05]` (ridge-heavy)
4. Re-run until `ratio_raw ∈ [0.6, 1.2]`
5. **DO NOT** apply calibration head until this passes

#### Triage Step 2: Slope Off But Variance OK
**Symptom:** `ratio_raw ∈ [0.6, 1.2]` but `slope < 0.90` or `slope > 1.10`

**Actions:**
1. Try **isotonic head** (monotone remap)
2. Keep linear head as default if slope already 0.90–1.10
3. Check `core_variance_pre_post.csv` → `ratio_cal` (should stay ∈ [0.6, 1.2])

#### Triage Step 3: Correlations < 0.30
**Symptom:** `pearson < 0.30` or `spearman < 0.30`

**Actions (in order):**
1. **Confirm rating_blend:**
   - Check `rating_blend_config.json` → `optimalWeight` should be 0.05
   - Verify using MFTR-ridge (not raw MFTR)
   - Check `mftr_ratings_ridge.csv` exists

2. **Sanity check frame:**
   - Sample 50 rows from `core_10game_sanity.csv`
   - Verify: `target = HMA` (positive = home better, negative = away better)
   - Verify: `rating_blend = home - away` (positive = home better)

3. **Confirm HFA:**
   - Check `β(hfaPoints) > 0` (should be ~2–3)
   - Verify HFA not baked into ratings (check `team_season_rating.hfa_team`)

4. **Diagnostic: Unweighted A+B**
   - Run with `useWeights=false` (all rows = 1.0)
   - Compare gates (Pearson, Spearman, RMSE)
   - **DO NOT** ship unweighted if it hurts Set B validation

#### Triage Step 4: Still Stuck
**Symptom:** All triage steps attempted, gates still fail

**Actions:**
1. **STOP** - Do not bulldoze with fancier heads
2. Save all artifacts (even failed runs)
3. Document failure in `docs/CALIBRATION_FAILURE_REPORT.md`:
   - Which gates failed
   - Triage steps attempted
   - Observed metrics vs targets
   - Root cause hypothesis
4. **Do NOT** proceed to Extended

---

## Phase D: Extended v0 Verification (cal_v1_ext)

### Prerequisites
- ✅ Core must pass ALL gates first
- ✅ Extended auto-runs after Core (if Core passes)

### What Changes
**Added Features:**
- Opponent-adjusted diffs: EPA, Success Rate, Explosiveness, PPA, Havoc (front7, db) (off/def) + edges
- EWMA 3-game & 5-game on key adjusted metrics
- Priors: Talent 247, Returning Production (separate, not collapsed)

**Collinearity Defense:**
- Extended blocks are **residualized against rating_blend** within train folds
- This prevents `β(rating_blend)` from flipping negative

### Gates (Same as Core)
All Core gates apply, plus:
- ✅ **Stop Rule:** If `β(rating_blend) ≤ 0` at any point → **KILL RUN**
- ✅ Extended must beat Core on same gates to be kept

### Artifacts (Must Exist in `reports/`)

**Required Files:**
- ✅ `extended_metrics.csv` (train + walk-forward)
- ✅ `extended_residual_buckets.csv` (bucket means)
- ✅ `extended_top_outliers.csv` (top 20 outliers)
- ✅ `extended_variance_pre_post.csv` (variance ratios)
- ✅ Correlation matrix pre/post residualization (in `cal_fit_extended.json`)
- ✅ `cal_fit_extended.json` (full report)
- ✅ `docs/MODEL_CARD_CAL_V1_EXT.md` (model card)

### If Extended PASSES ✅

**Actions:**
1. **Persist to Database:**
   ```sql
   SELECT model_version, fit_label, gates_passed, slope, rmse, pearson, spearman
   FROM model_calibration 
   WHERE model_version='cal_v1_extended' AND fit_label='extended';
   ```
   - Store: residualization notes, all metrics
   - `gates_passed=true` only if ALL gates pass

2. **Compare to Core:**
   - Extended should have lower RMSE or higher correlations
   - If Extended doesn't beat Core, keep Core as production baseline

### If Extended MISSES ❌

**Actions:**
1. **DO NOT** persist Extended
2. Keep Core as production baseline
3. Document why Extended failed in model card
4. Extended artifacts still saved for analysis

---

## Deployment (Only After a PASS)

### Freeze Versions
- Store Git SHA in model card(s)
- Store random seeds (`RANDOM_SEED=42`)
- Store blend weight (w=0.05)
- Store calibration head params (if used)

### API Wiring
1. **Prediction Route:**
   - Use `rating_blend` (w=0.05) from `rating_blend_config.json`
   - Use explicit `hfaPoints` (not baked into ratings)
   - Use Core coefficients + head by default
   - Read from `model_calibration` where `gates_passed=true`

2. **Optional Toggle:**
   - Expose Core vs Extended comparison behind a feature flag
   - Use Extended only if it passes gates and beats Core

### Monitoring
- **Nightly Append:**
  - Out-of-sample RMSE, slope, residual buckets → rolling CSV
  - Alert if any gate drifts:
    - Slope outside 0.90–1.10
    - RMSE > 9.0
    - Pearson < 0.30
    - Residual bucket |mean| > 2.0

---

## Timeouts & Batching (If Job is Slow)

### Batching Strategy
If calibration times out:
1. Break into week bins:
   - Weeks 1–2 → checkpoint
   - Weeks 3–4 → checkpoint
   - Weeks 5–6 → checkpoint
   - Week 7 → checkpoint
   - Weeks 8–11 → checkpoint
2. Resume-safe: Each batch writes artifacts
3. Final merge: Combine all batches for final fit

### Weights
- Keep Set A=1.0, Set B=0.6 (default)
- Only test unweighted during triage (diagnostic only)

### Artifacts Flag
- Verify `--noArtifacts` flag works (should be fixed)
- Use during compute, generate artifacts after

---

## Definition of Done ✅

### Core (cal_v1_core)
- [ ] All gates passed (raw variance, RMSE, slope, correlations, β signs, residual buckets)
- [ ] Persisted to `model_calibration` as `cal_v1_core`
- [ ] All artifacts generated and verified
- [ ] Model card complete with metrics + limitations

### Extended (cal_v1_ext)
- [ ] Either:
  - **PASSES:** All gates passed, persisted as `cal_v1_ext`, beats Core
  - **REJECTED:** Cleanly rejected with artifacts explaining why
- [ ] Model card complete (pass or failure documented)

### API Integration
- [ ] Prediction routes updated to read active calibration
- [ ] Core model used by default
- [ ] Extended available behind feature flag (if it passed)

### Documentation
- [ ] One-page "Calibration Release Notes" committed:
  - Metrics (RMSE, slope, correlations)
  - Known limitations
  - Blend weight (w=0.05)
  - Calibration head params (if used)
  - Git SHA + seeds

---

## TL;DR

1. **Core must pass** with healthy variance (0.6–1.2) and correct β signs
2. **Extended is gravy**, not a crutch
3. **If anything smells off** (variance crushed, β flipped, correlations weak):
   - **STOP** and report
   - **DO NOT** paper over with calibration head
   - Document failure and root cause
4. **Only deploy** if gates pass and artifacts are complete

---

## Quick Reference: Gate Targets

| Gate | Core Target | Extended Target |
|------|-------------|-----------------|
| Raw Variance Ratio | 0.6–1.2 | 0.6–1.2 |
| RMSE | ≤ 8.8 | ≤ 9.0 |
| Slope | 0.90–1.10 | 0.90–1.10 |
| Pearson | ≥ 0.30 | ≥ 0.30 |
| Spearman | ≥ 0.30 | ≥ 0.30 |
| β(rating_blend) | > 0 | > 0 (STOP if ≤ 0) |
| β(hfaPoints) | > 0 | > 0 |
| Residual Buckets | \|mean\| ≤ 2.0 | \|mean\| ≤ 2.0 |

---

## Emergency Contacts

If calibration fails and you're stuck:
1. Check `docs/CALIBRATION_DIAGNOSTIC.md` for known issues
2. Review `reports/core_10game_sanity.csv` for frame issues
3. Check `rating_blend_config.json` for blend weight
4. Verify MFTR files exist: `mftr_ratings_ridge.csv`

---

**Last Updated:** 2025-01-29
**Version:** 1.0

