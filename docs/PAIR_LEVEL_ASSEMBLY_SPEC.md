# Pair-Level Assembly Spec (Post-Set A)

## Go/No-Go

**DO NOT BUILD** until Set A feature engineering passes all gates:
- Nulls < 5% per primary feature
- Zero-variance features = 0
- Frame-check sign agreement ≥ 70%
- DB persistence: 2 rows per FBS game
- No NaN/Inf stored

**Once Set A passes**: Build `scripts/assemble-training-pairs.ts` per spec below.

---

## Goal

Create one game-level training row per FBS game with `home_minus_away` target and features, persisted in DB and mirrored to CSV artifacts.

---

## Inputs

- `team_game_adj` rows (features) for `feature_version = 'fe_v1'`
- Pre-kick market consensus from `market_snapshot` / diagnostics
- Game meta (season, week, neutral, tiers, conferences)

---

## Target (Precise Sign Rules)

We calibrate in `home_minus_away` (HMA) units.

**Rules**:
- Let `favoriteLine_fc` be the favorite-centric spread (always ≤ 0)
- If home is favorite: `target_spread_hma = favoriteLine_fc` (e.g., home -7 → -7)
- If away is favorite: `target_spread_hma = -favoriteLine_fc` (e.g., away -7 → +7)
- If consensus missing, exclude row from Set A; allow Set B fallback only if explicitly flagged

**Also persist**:
- `books_spread` (median unique books count)
- `window_start` (T-60 timestamp)
- `window_end` (T+5 timestamp)
- `used_pre_kick` (boolean)

---

## Features (Diffs in HMA Orientation)

For each numeric feature `x` produced in `team_game_adj`:

### Continuous Metrics → Difference: `x_diff = home_x - away_x`

**Opponent-adjusted nets**:
- `off_adj_epa_diff`, `off_adj_sr_diff`, `off_adj_explosiveness_diff`, `off_adj_ppa_diff`, `off_adj_havoc_diff`
- `def_adj_epa_diff`, `def_adj_sr_diff`, `def_adj_explosiveness_diff`, `def_adj_ppa_diff`, `def_adj_havoc_diff`
- `edge_epa_diff`, `edge_sr_diff`, `edge_explosiveness_diff`, `edge_ppa_diff`, `edge_havoc_diff`

**Recency form** (EWMAs):
- `ewma3_off_adj_epa_diff`, `ewma3_def_adj_epa_diff`
- `ewma5_off_adj_epa_diff`, `ewma5_def_adj_epa_diff`
- Include SR/Explosiveness if present in `team_game_adj`

**Priors**:
- `talent_247_diff`
- `returning_prod_off_diff`, `returning_prod_def_diff`

**Pace/finishing** (if/when populated):
- `sec_per_play_diff`, `plays_per_game_diff`, `pts_per_scoring_opp_diff`

### Context Flags

- `neutral_site` (boolean, keep as is)
- `rest_delta_diff = home_rest_days - away_rest_days`
- `bye_flag_home`, `bye_flag_away` (booleans)
- **Tier/conference**:
  - `tier_gap = home_tier - away_tier` (e.g., P5=2, G5=1, FCS=0)
  - `same_conf` (boolean)
  - `p5_vs_g5` (boolean)

**Note**: Hygiene already applied in `team_game_adj` (winsorize → standardize). Do NOT re-standardize diffs here; simply compute diffs of the standardized features (keeps scale consistent).

---

## Persistence (DB is SSOT)

**Table**: `game_training_rows`

**Primary Key**: `(game_id, feature_version)`

**Columns** (minimum):
- `game_id`, `season`, `week`
- `feature_version` (e.g., 'fe_v1')
- `set_label` ('A' for Weeks 8-11, 'B' for Weeks 1-7)
- `target_spread_hma`, `books_spread`, `window_start`, `window_end`, `used_pre_kick`
- All `_diff` features listed above
- Context flags: `neutral_site`, `same_conf`, `p5_vs_g5`, `rest_delta_diff`, `bye_flag_home`, `bye_flag_away`, `tier_gap`

**Idempotent upsert** on `(game_id, feature_version)`

---

## Artifacts

Write to `/reports/`:
- `train_rows_setA.csv` (no PII, no nulls)
- `train_rows_setB.csv` (no PII, no nulls)
- `train_rows_summary.csv` (row counts, missing counts, basic stats)
- `frame_check_pairs_sample.csv` (10 random games with home/away names, target, 6-8 key feature diffs)

---

## Pair-Level Gates

- **Row count** = number of eligible FBS games with pre-kick spreads in the set (no dupes, no drops)
- **No NaN/Inf**; null ratio per column 0% (pairs stage should be fully concrete)
- **Quick correlation canary**: `corr(|rating_proxy|, |target|) >= 0.15` (weak but non-zero); log only, don't fail on this
- **Frame sanity**: sign agreement sample ≥ 70%

---

## Commands

**After Set A features pass gates**:
```bash
npx tsx scripts/assemble-training-pairs.ts --season 2025 --weeks "8,9,10,11" --featureVersion fe_v1 --set A
```

**Then expand to Set B**:
```bash
# First run feature engineering for Set B
npx tsx scripts/engineer-features.ts --season 2025 --weeks "1,2,3,4,5,6,7" --featureVersion fe_v1 --sourceWindow pre_kick

# Then assemble pairs for Set B
npx tsx scripts/assemble-training-pairs.ts --season 2025 --weeks "1,2,3,4,5,6,7" --featureVersion fe_v1 --set B
```

---

## Implementation Notes

1. **Target Calculation**:
   - Get pre-kick consensus spread (favorite-centric, negative)
   - Determine if home or away is favorite
   - Convert to HMA frame: `target_spread_hma = home_is_favorite ? favoriteLine_fc : -favoriteLine_fc`

2. **Feature Diffs**:
   - Load home team features from `team_game_adj` where `isHome = true`
   - Load away team features from `team_game_adj` where `isHome = false`
   - Compute `home_x - away_x` for all numeric features

3. **Tier Calculation**:
   - P5 = 2, G5 = 1, FCS = 0
   - `tier_gap = home_tier - away_tier`

4. **Conference Flags**:
   - `same_conf = home_conference === away_conference`
   - `p5_vs_g5 = (home_tier === 2 && away_tier === 1) || (home_tier === 1 && away_tier === 2)`

---

## Schema (To Be Created)

```prisma
model GameTrainingRow {
  gameId         String   @map("game_id")
  featureVersion String   @map("feature_version")
  season         Int
  week           Int
  setLabel       String   @map("set_label") // 'A' or 'B'
  
  // Target
  targetSpreadHma Decimal? @map("target_spread_hma")
  booksSpread     Int?     @map("books_spread")
  windowStart     DateTime? @map("window_start")
  windowEnd       DateTime? @map("window_end")
  usedPreKick     Boolean  @default(false) @map("used_pre_kick")
  
  // Feature diffs (opponent-adjusted)
  offAdjEpaDiff          Decimal? @map("off_adj_epa_diff")
  offAdjSrDiff           Decimal? @map("off_adj_sr_diff")
  offAdjExplosivenessDiff Decimal? @map("off_adj_explosiveness_diff")
  offAdjPpaDiff          Decimal? @map("off_adj_ppa_diff")
  offAdjHavocDiff        Decimal? @map("off_adj_havoc_diff")
  defAdjEpaDiff          Decimal? @map("def_adj_epa_diff")
  defAdjSrDiff           Decimal? @map("def_adj_sr_diff")
  defAdjExplosivenessDiff Decimal? @map("def_adj_explosiveness_diff")
  defAdjPpaDiff          Decimal? @map("def_adj_ppa_diff")
  defAdjHavocDiff        Decimal? @map("def_adj_havoc_diff")
  edgeEpaDiff            Decimal? @map("edge_epa_diff")
  edgeSrDiff             Decimal? @map("edge_sr_diff")
  edgeExplosivenessDiff  Decimal? @map("edge_explosiveness_diff")
  edgePpaDiff            Decimal? @map("edge_ppa_diff")
  edgeHavocDiff          Decimal? @map("edge_havoc_diff")
  
  // Recency EWMAs
  ewma3OffAdjEpaDiff Decimal? @map("ewma3_off_adj_epa_diff")
  ewma3DefAdjEpaDiff Decimal? @map("ewma3_def_adj_epa_diff")
  ewma5OffAdjEpaDiff Decimal? @map("ewma5_off_adj_epa_diff")
  ewma5DefAdjEpaDiff Decimal? @map("ewma5_def_adj_epa_diff")
  
  // Priors
  talent247Diff        Decimal? @map("talent_247_diff")
  returningProdOffDiff Decimal? @map("returning_prod_off_diff")
  returningProdDefDiff Decimal? @map("returning_prod_def_diff")
  
  // Context
  neutralSite   Boolean  @default(false) @map("neutral_site")
  sameConf      Boolean  @default(false) @map("same_conf")
  p5VsG5        Boolean  @default(false) @map("p5_vs_g5")
  restDeltaDiff Int?     @map("rest_delta_diff")
  byeFlagHome   Boolean  @default(false) @map("bye_flag_home")
  byeFlagAway   Boolean  @default(false) @map("bye_flag_away")
  tierGap       Int?     @map("tier_gap")
  
  // Metadata
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  
  game Game @relation(fields: [gameId], references: [id], onDelete: Cascade)
  
  @@id([gameId, featureVersion])
  @@index([season, week])
  @@index([setLabel])
  @@index([featureVersion])
  @@map("game_training_rows")
}
```

---

## Status

**NOT YET IMPLEMENTED** - Waiting for Set A feature engineering gates to pass.

**When Set A passes**: Build `scripts/assemble-training-pairs.ts` per this spec.


