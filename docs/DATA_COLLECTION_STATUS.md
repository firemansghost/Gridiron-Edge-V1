# Data Collection Status & Alignment

## Objective

Zero ambiguity on what we're collecting, why, where it lives, and what to do next. Align all tasks with the agreed scope.

---

## ✅ Data Collection Scope (CFBD Endpoints)

### A) Team-Season Advanced Efficiency (Season Priors)

**Status**: ✅ **INGESTED**
- **Table**: `cfbd_eff_team_season`
- **Fields Collected**:
  - `off_epa`, `def_epa` (EPA per play)
  - `off_sr`, `def_sr` (Success rate)
  - `iso_ppp_off`, `iso_ppp_def` (Explosiveness)
  - `ppo_off`, `ppo_def` (Points per opportunity)
  - `run_epa`, `pass_epa`, `run_sr`, `pass_sr` (Rush/pass splits)
  - `havoc_off`, `havoc_def` (Havoc rate)
  - `line_yards_off`, `stuff_rate`, `power_success` (Line metrics)
  - `early_down_epa`, `late_down_epa` (Down splits)
  - `avg_field_position` (Field position)
- **Why**: Stable priors that reduce noise in early/mid-season; anchor the model
- **Coverage**: 100% for FBS teams (130 teams × 1 season = 130 rows)

### B) Team-Game Advanced Efficiency (Per Game)

**Status**: ✅ **INGESTED**
- **Table**: `cfbd_eff_team_game`
- **Fields Collected**: Same as season-level, but per-game
- **Why**: Captures current form; feeds opponent-adjusted nets and recency EWMAs
- **Coverage**: 100% for FBS-vs-FBS games (Weeks 1-11, 2025)

### C) Drives (Pace & Finishing)

**Status**: ❌ **NOT INGESTED** (Tables exist, but empty)
- **Table**: `cfbd_drives_team_game`
- **Fields to Collect**:
  - Raw: `plays`, `yards`, `time_seconds`, `result`
  - Rollups: `sec_per_play`, `plays_per_game`, `points_per_scoring_opp`, `scoring_opps_per_drive`, `avg_start_pos`, `redzone_trips`
- **Why**: Explains pace and red-zone conversion—key drivers of margin/totals tails
- **Action**: Need to ingest drives data (endpoint: `/drives`)

### D) Priors (Talent & Returning Production)

**Status**: ✅ **INGESTED**
- **Table**: `cfbd_priors_team_season`
- **Fields Collected**:
  - `talent_247` (247 Composite talent score)
  - `returning_prod_off` (Returning offensive production %)
  - `returning_prod_def` (Returning defensive production %)
- **Why**: Early-season anchor; improves P5/G5 fit and stabilizes projections
- **Coverage**: 100% for FBS teams (136 rows for 2025)

### E) Public Ratings (QA / Optional Ensembling)

**Status**: ❌ **NOT INGESTED** (No tables exist)
- **Tables Needed**: `cfbd_ratings_sp`, `cfbd_ratings_elo`, `cfbd_ratings_srs`
- **Fields to Collect**:
  - `sp_overall`, `sp_off`, `sp_def` (SP+ ratings)
  - `elo` (ELO rating)
  - `srs` (Simple Rating System)
- **Why**: Sanity checks; optional blend inputs; helps spot internal rating drift
- **Action**: Need to create tables and ingest (endpoints: `/ratings/sp`, `/ratings/elo`, `/ratings/srs`)

### F) Weather (Game-Level)

**Status**: ❌ **NOT INGESTED** (Table exists, but empty)
- **Table**: `cfbd_weather_game`
- **Fields to Collect**:
  - `temperature`, `wind_speed`, `precip_prob`, `condition_text`
- **Why**: Tail-risk inputs for totals and pass-heavy matchups
- **Action**: Need to ingest weather data (endpoint: `/games/weather`)

### G) PPA (Points per Attempt) Metrics

**Status**: ❌ **PARTIALLY INGESTED** (Tables exist, but empty)
- **Tables**: `cfbd_ppa_team_game`, `cfbd_ppa_team_season`
- **Fields to Collect**:
  - `ppa_offense`, `ppa_defense`, `ppa_overall`
- **Why**: Build recency-weighted form without full play-by-play
- **Action**: Need to ingest PPA data (endpoint: `/ppa/games`)

---

## 📍 Where It Lives (Supabase Tables)

### Team-Season (keys: `season`, `team_id`)

| Table | Purpose | Status | Coverage |
|-------|---------|--------|----------|
| `cfbd_eff_team_season` | EPA/SR/Explosiveness/PPA (Off/Def; rush/pass splits) | ✅ Ingested | 100% (130 rows) |
| `cfbd_priors_team_season` | Talent (247 Composite) + Returning Production | ✅ Ingested | 100% (136 rows) |
| `cfbd_ratings_sp` | SP+ ratings | ❌ Not created | 0% |
| `cfbd_ratings_elo` | ELO ratings | ❌ Not created | 0% |
| `cfbd_ratings_srs` | SRS ratings | ❌ Not created | 0% |

### Team-Game (keys: `game_id_cfbd`, `team_id_internal`)

| Table | Purpose | Status | Coverage |
|-------|---------|--------|----------|
| `cfbd_eff_team_game` | Per-game advanced stats | ✅ Ingested | 100% (FBS games) |
| `cfbd_ppa_team_game` | PPA metrics | ❌ Empty | 0% |
| `cfbd_drives_team_game` | Pace & finishing rollups | ❌ Empty | 0% |
| `cfbd_weather_game` | Weather (temp/wind/precip) | ❌ Empty | 0% |

### Derived Features (write-back; versioned)

| Table | Purpose | Status |
|-------|---------|--------|
| `team_game_adj` | Opponent-adjusted nets, EWMAs, pace/finishing, context flags | ❌ **TO BE CREATED** |

**Note**: All engineered features must be persisted to `team_game_adj` (or equivalent) with `feature_version`, `created_at`, `source_snapshot`.

### Mapping / Meta

| Table | Purpose | Status |
|-------|---------|--------|
| `cfbd_team_map` | Canonical mapping from aliases to CFBD team IDs | ✅ Ingested (611 rows) |

---

## 🎯 Training Slices & Weights (LOCKED)

| Set | Weeks | Quality | Coverage | Weight | Rows |
|-----|-------|---------|----------|--------|------|
| **Set A (Core)** | 8-11 | Pre-kick | ~93% (199/213 games) | 1.0 | 199 |
| **Set B (Extended)** | 1-7 | Pre-kick | ~18% (359/1,950 games) | 0.6 | 359 |
| **Set C (Aux)** | All | Closing-fallback | Optional | 0.25 | 0 (disabled) |

**Row Metadata** (stamped on every row):
- `season`, `week`, `source_window` (pre_kick|closing), `quality` (pre_kick|closing_fallback)
- `books` (median unique books count), `window_bounds` (T-60→T+5 or closing timestamp)
- `feature_version` (e.g., "v1.0"), `weight` (1.0|0.6|0.25)

**Artifact**: `reports/train_rows_summary.csv` ✅ Generated

---

## 🔧 Feature Engineering (Task 11) — What to Compute

### 1. Opponent-Adjusted Nets (per game)

**Formula**: 
- **Team Off - Opponent Def**: `epa_off_adj = team_epa_off - opp_epa_def`
- **Opponent Off - Team Def**: `epa_def_adj = opp_epa_off - team_epa_def`

**Metrics to Adjust**:
- EPA (off/def)
- Success Rate (off/def)
- Explosiveness/isoPPP (off/def)
- PPA (off/def)
- Havoc (off/def)

**Storage**: `team_game_adj` table (to be created)

### 2. Recency EWMAs

**3-game EWMA**: `ewma_3 = 0.6 * latest + 0.3 * prev1 + 0.1 * prev2`
**5-game EWMA**: `ewma_5 = 0.4 * latest + 0.3 * prev1 + 0.15 * prev2 + 0.1 * prev3 + 0.05 * prev4`

**Apply to**: All opponent-adjusted nets (EPA, SR, Explosiveness, PPA, Havoc)

**Early-season blending** (Weeks 1-6):
- Blend EWMA with priors (talent + returning production)
- Decay priors to ~0 by Week 6
- Formula: `blended = (1 - prior_weight) * ewma + prior_weight * prior`
- `prior_weight = max(0, (6 - week) / 6)`

**Storage**: `team_game_adj` table

### 3. Pace & Finishing

**From**: `cfbd_drives_team_game` (when available)
- `sec_per_play` (seconds per snap)
- `plays_per_game` (plays per game)
- `points_per_scoring_opp` (finishing efficiency)
- `scoring_opps_per_drive` (red-zone trips per drive)
- `avg_start_pos` (average starting field position)

**Note**: If drives data not available, mark as null (don't block feature engineering)

**Storage**: `team_game_adj` table

### 4. Priors as Features

**From**: `cfbd_priors_team_season`
- `talent_247` (247 Composite)
- `returning_prod_off`, `returning_prod_def` (Returning production %)

**Usage**: Separate inputs; do not overwrite nets

**Storage**: `team_game_adj` table

### 5. Context Flags & Controls

- `neutral_site` (Boolean, from `games.neutralSite`)
- `conference_game` (Boolean, from `games.conferenceGame`)
- `rest_delta` (Days of rest difference: home_rest - away_rest)
- `bye_week` (Boolean: team had bye week before this game)
- `p5_flag`, `g5_flag`, `fcs_flag` (Conference tier flags)

**Storage**: `team_game_adj` table

### 6. Hygiene

**Winsorization**: Winsorize extremes at 1st/99th percentile
**Standardization**: Standardize all features to mean=0, std=1 (use Set A stats)
**Zero-variance check**: Drop features with zero variance; log dropped features

**Artifacts**:
- `reports/feature_completeness.csv` ✅ (from CFBD ingest)
- `reports/feature_store_stats.csv` ✅ (from CFBD ingest)
- `reports/ewma_correlation.csv` (to be generated)

---

## 📊 Calibration (After Task 11)

### Model Fits

1. **Fit #1 (Core)**: Train on Set A only (Weeks 8-11, pre-kick, weight=1.0)
2. **Fit #2 (Core+Extended)**: Train on Set A + Set B (weights 1.0/0.6)
   - Optional Set C (0.25) if `INCLUDE_CLOSING_FALLBACK=true`

### Holdout

- 10-20% stratified by week
- Time-based split (earlier weeks → train, later weeks → holdout)

### Acceptance Gates (on holdout)

| Gate | Target | Fit #1 (Core) | Fit #2 (Extended) |
|------|--------|----------------|------------------|
| **Slope** (ŷ vs market) | 0.90-1.10 | Must pass | Must pass |
| **RMSE** | ≤ 8.8 / ≤ 9.0 | ≤ 8.8 | ≤ 9.0 |
| **Sign agreement** | ≥ 70% | Must pass | Must pass |
| **Pearson r** | ≥ 0.30 | Must pass | Must pass |
| **Spearman r** | ≥ 0.30 | Must pass | Must pass |
| **Residual slices** | No systematic tilt | Must pass | Must pass |

### Artifacts

- `reports/calibration_core.json` / `.csv`
- `reports/calibration_extended.json` / `.csv`
- `reports/residual_slices_core.csv`
- `reports/residual_slices_extended.csv`
- `reports/parity_plot_core.csv`
- `reports/parity_plot_extended.csv`
- `reports/model_card.md`

---

## 🚦 Guardrails (Keep On)

- ✅ Per-book dedupe
- ✅ Favorite-centric normalization
- ✅ Zero-median prevention
- ✅ Team mapping sanity (no null levels, no orphan IDs)
- ✅ Version integrity checks on derived tables
- ✅ Fail fast if training mixes pre_kick and closing_fallback without weights

---

## 📋 Immediate Action Items

### 1. Complete Data Collection (If Needed)

**Optional** (can proceed without):
- [ ] Ingest drives data (`cfbd_drives_team_game`)
- [ ] Ingest PPA data (`cfbd_ppa_team_game`)
- [ ] Ingest weather data (`cfbd_weather_game`)
- [ ] Create and ingest public ratings (`cfbd_ratings_sp`, `cfbd_ratings_elo`, `cfbd_ratings_srs`)

**Note**: Feature engineering can proceed with available data (efficiency stats + priors). Missing data will be null.

### 2. Feature Engineering (Task 11) — **START HERE**

**Script**: `scripts/engineer-features.ts` (to be created)

**Steps**:
1. Create `team_game_adj` table (if not exists)
2. Compute opponent-adjusted nets for all games
3. Compute recency EWMAs (3-game, 5-game)
4. Extract pace & finishing (if drives data available)
5. Add priors as features
6. Add context flags
7. Apply hygiene (winsorize, standardize, zero-variance check)
8. Persist to `team_game_adj` with `feature_version`

**Deliverables**:
- `reports/feature_completeness.csv` (updated)
- `reports/feature_store_stats.csv` (updated)
- `reports/ewma_correlation.csv` (new)

### 3. Calibration (After Task 11)

**Script**: `scripts/calibrate-model-ridge-en.ts` (to be created)

**Steps**:
1. Load training datasets (Set A, Set B, Set C if enabled)
2. Fit #1 (Core): Set A only
3. Fit #2 (Core+Extended): Set A + Set B
4. Validate gates on holdout
5. Generate residual analysis
6. Generate model card

**Deliverables**: All artifacts listed above

---

## ✅ Current Status Summary

| Component | Status | Notes |
|-----------|--------|-------|
| **Odds Data** | ✅ Complete | Weeks 1-7: 18% coverage, Weeks 8-11: 93% coverage |
| **CFBD Efficiency** | ✅ Complete | 100% coverage for FBS games |
| **CFBD Priors** | ✅ Complete | 100% coverage (136 teams) |
| **CFBD PPA** | ❌ Empty | Tables exist, not ingested |
| **CFBD Drives** | ❌ Empty | Tables exist, not ingested |
| **CFBD Weather** | ❌ Empty | Tables exist, not ingested |
| **Public Ratings** | ❌ Not created | Tables don't exist |
| **Dataset Assembly** | ✅ Complete | Set A: 199, Set B: 359, Set C: 0 |
| **Feature Engineering** | ❌ Not started | **NEXT STEP** |
| **Calibration** | ❌ Not started | After feature engineering |

---

## 🎯 Next Step: Task 11 (Feature Engineering)

**Ready to proceed**: Yes (have efficiency stats + priors, can proceed without drives/PPA/weather)

**Blockers**: None (missing data will be null, feature engineering can handle it)

**Action**: Create `scripts/engineer-features.ts` and implement opponent-adjusted nets + EWMAs


