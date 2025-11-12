# Phase 2 Roadmap: Model Track

## ✅ Completed Phases

### Phase 1: Trust-Market Mode (Complete)
- Overlay logic with ±3.0 caps
- ML sanity constraints
- Totals honest UI (three-state)
- Range guidance always shown
- Sign sanity checks

### Phase 2.1: Talent Gap (Complete) ✅
- Added 247 Composite talent data
- Calculate `talent_diff = talent_home - talent_away`
- Z-score normalization within season
- FCS imputation (G5 p10)
- Stability guards
- Exposed in `model_view.features.talent`

### Phase 2.2: Matchup Class (Complete) ✅
- Classify games: P5_P5, P5_G5, P5_FCS, G5_G5, G5_FCS
- Season-aware tier classification
- Exposed in `model_view.features.matchup_class`
- Calibration wiring with one-hot dummies

### Phase 2.3: Team-Specific HFA (Complete) ✅
- Compute HFA_raw from game residuals
- Empirical-Bayes shrinkage to league mean
- Caps [0.5, 5.0] with guardrails
- Persisted to `team_season_ratings`
- Exposed in `model_view.features.hfa`
- UI: "Home Edge" chip
- **Database verified and fixed**

---

## 🎯 Next Phases

### Phase 2.4: Recency Weights (Complete) ✅

**Goal**: Weight recent games more heavily to capture current form

**Implementation**:
1. **Recency-weighted stats**:
   - ✅ Last 3 games: weight ×1.5
   - ✅ Season-to-date: weight ×1.0
   - ✅ Recompute EPA Off/Def, YPP, Success Rate with these weights

2. **Rebuild z-scores** from weighted stats:
   - ✅ Recalculate z-scores using recency-weighted values
   - ✅ Use in power rating calculation

3. **Expose in API**:
   - ✅ `model_view.features.recency`: `{ games_last3, games_total, effective_weight_sum, stats_weighted }`
   - ✅ `model_view.ratings`: `{ rating_base, rating_weighted, rating_used, recencyEffectPts }`
   - ✅ `model_view.spread_lineage`: Full breakdown with favorite-centric spreads
   - ✅ `picks.moneyline.calc_basis`: Complete calculation transparency

4. **Guardrails**:
   - ✅ If team has <3 recent games, scale weights proportionally
   - ✅ No NaNs or division by zero

5. **UI Integration**:
   - ✅ Recency chip with tooltip showing effect
   - ✅ Canary assertions for regression testing

**Acceptance Criteria**:
- ✅ Recency-weighted stats computed correctly
- ✅ Z-scores rebuilt from weighted stats
- ✅ Power ratings reflect recent form
- ✅ Unit tests for <3 games case
- ✅ API fully exposes recency data
- ✅ UI shows recency status

**Status**: ✅ **COMPLETE**

---

### Phase 2.5: Full Quadratic Calibration (After 2.4)

**Goal**: Improve model accuracy with quadratic terms and ridge regularization

**Implementation**:
1. **Design matrix**:
   ```
   y := market_spread
   X := [
     Δrating,              // Linear term
     (Δrating)²,           // Quadratic term
     talent_diff_z,        // Normalized talent gap
     matchup_class_dummies, // P5_P5 baseline
     hfa_team_home         // Team-specific HFA
   ]
   ```

2. **Ridge regularization**:
   - Tune α via cross-validation on prior 4 weeks
   - Fit per-week (walk-forward validation)
   - Predict current week using previous weeks only

3. **Persist coefficients**:
   - Store by week in database or file
   - Track `calibration_r2_week`
   - Monitor `sample_size` and `coefficients`

4. **Expose in API**:
   - `diagnostics.calibration`: `{ r2_week, sample_size, coefficients, calibrated_spread_demo }`

**Targets**:
- R² ≥ 0.35 in-sample (diagnostic)
- R² ≥ 0.30 6-week out-of-sample

**Acceptance Criteria**:
- ✅ Quadratic model fits correctly
- ✅ Ridge regularization prevents overfitting
- ✅ Walk-forward validation works
- ✅ R² targets met or documented why not
- ✅ Coefficients persisted and accessible

**Estimated Effort**: 4-6 hours

---

### Phase 2.6: Totals Model (After 2.5)

**Goal**: Create separate totals model with pace & weather

**Implementation**:
1. **Features**:
   - `model_points` (internal total pts)
   - `pace` (plays per game, seconds per play)
   - `explosiveness_proxy` (EPA percentile)
   - `weather` (wind, precip, temp; clamp wind > 15 mph)
   - Optional: garbage-time down-weights

2. **Regression**:
   ```
   market_total ≈ γ + δ₁×model_points + δ₂×pace + δ₃×weather_terms + interactions
   ```
   - Ridge regularization
   - Walk-forward (same as spread)

3. **Re-enable totals picks**:
   - When R² ≥ 0.30 OOS for two consecutive weeks
   - Flip `SHOW_TOTALS_PICKS=true`
   - Keep edge floor 2.0, cap ±3.0 (until Calibrated mode)

**Acceptance Criteria**:
- ✅ Totals model fits with pace + weather
- ✅ R² ≥ 0.30 OOS for two weeks
- ✅ Totals picks re-enabled
- ✅ UI shows totals picks correctly

**Estimated Effort**: 4-5 hours

---

### Phase 2.7: Recompute Performance Bins (After 2.6)

**Goal**: Update confidence bins based on final overlay edges

**Implementation**:
1. **Bin by final edge size** (after overlay):
   - A: ≥ 55% hit rate (N ≥ 150)
   - B: 53–55% hit rate
   - C: 51–53% hit rate

2. **Use last full season + YTD**:
   - Calculate hit rates per bin
   - Store in `confidence_bins` table or similar

3. **Surface on UI**:
   - Show bin badges (A/B/C)
   - Display hit rate percentages

**Acceptance Criteria**:
- ✅ Bins computed from overlay edges
- ✅ Hit rates calculated correctly
- ✅ UI shows bin badges
- ✅ Minimum sample sizes met

**Estimated Effort**: 2-3 hours

---

### Phase 2.8: Validate Calibration (After 2.7)

**Goal**: Validate model meets R² targets

**Implementation**:
1. **Six-week rolling window**:
   - Spread R², MAE, hit-rate by bin
   - Totals R², MAE, hit-rate by bin

2. **Sanity charts**:
   - Create `/docs/validation.md`
   - Plot R² over time
   - Show error distributions

3. **Iterate if needed**:
   - If targets not met, adjust features or regularization
   - Re-run calibration

**Targets**:
- Spread R² ≥ 0.35
- Totals R² ≥ 0.30

**Acceptance Criteria**:
- ✅ Validation report generated
- ✅ R² targets met or documented
- ✅ Charts show model performance
- ✅ Action plan if targets not met

**Estimated Effort**: 3-4 hours

---

### Phase 2.9: "Calibrated" Mode (After 2.8)

**Goal**: Create user toggle for calibrated mode when targets are met

**Implementation**:
1. **Feature flag**:
   - `MODEL_MODE = 'calibrated'` (vs `'trust_market'`)
   - User toggle in UI (settings or game page)

2. **Relax constraints**:
   - Raise overlay caps to ±5.0 (from ±3.0)
   - Keep all safety banners
   - Keep ML gates but allow within ±9 if value strong

3. **Totals picks**:
   - Already enabled in Phase 2.6
   - Keep edge floor 2.0

**Acceptance Criteria**:
- ✅ Mode toggle works
- ✅ Overlay caps relaxed in calibrated mode
- ✅ ML gates adjusted appropriately
- ✅ UI clearly shows current mode

**Estimated Effort**: 2-3 hours

---

## Summary

**Completed**: Phases 1, 2.1, 2.2, 2.3, 2.4 ✅

**Next**: Phase 2.5 (Full Quadratic Calibration) - 3-4 hours remaining

**Remaining**: Phases 2.5 (partial), 2.6, 2.7, 2.8, 2.9 - ~14-19 hours total

**Total Phase 2 Effort**: ~25-30 hours (5 phases complete, 1 partial, 4 remaining)

---

## Recommended Order

1. **2.4 Recency Weights** (capture current form)
2. **2.5 Quadratic Calibration** (improve spread accuracy)
3. **2.6 Totals Model** (enable totals picks)
4. **2.7 Performance Bins** (update confidence)
5. **2.8 Validation** (verify targets)
6. **2.9 Calibrated Mode** (user toggle)

This order ensures:
- Features are added before calibration
- Spread model is calibrated before totals
- Validation happens before mode toggle
- Each phase builds on the previous


