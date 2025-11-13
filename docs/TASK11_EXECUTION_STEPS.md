# Task 11 Execution Steps

## Pre-Flight Checklist

- [ ] GitHub Actions secrets confirmed: `DATABASE_URL`, `DIRECT_URL`, `CFBD_API_KEY`
- [ ] Feature version: `fe_v1`

## Step 0: Apply Migration

**Action**: Run Prisma migrate workflow or apply migration SQL manually

**Migration File**: `prisma/migrations/20250128120000_add_team_game_adj/migration.sql`

**Post-Migrate Verification**:
```sql
-- Check table exists
SELECT COUNT(*) FROM team_game_adj; -- Should be 0 (fresh table)

-- Check unique index exists
SELECT indexname FROM pg_indexes 
WHERE tablename = 'team_game_adj' 
AND indexname LIKE '%game_id%team_id%feature_version%';
```

## Step 1: Smoke Test

**Command**:
```bash
npx tsx scripts/smoke_prisma.ts
```

**Expected Output**:
- ✅ Database connection successful
- ✅ All required tables exist
- ✅ team_game_adj is empty (fresh table)
- ✅ Unique index/primary key exists
- ✅ Data available (efficiency stats, priors)

**Exit Code**: 0 on success, non-zero on failure

## Step 2: Feature Engineering - Set A (Vertical Slice)

**Command**:
```bash
npm run build:jobs
npx tsx scripts/engineer-features.ts --season 2025 --weeks "8,9,10,11" --featureVersion fe_v1 --sourceWindow pre_kick
```

**What It Does**:
1. Loads CFBD games + efficiency stats + priors (FBS only)
2. Computes opponent-adjusted nets (off_adj, def_adj, edges)
3. Computes recency EWMAs (3-game, 5-game with prior blending)
4. Adds context flags (rest_delta, bye_week, tier flags)
5. Applies hygiene (winsorize 1st/99th, standardize, zero-variance check)
6. Persists to `team_game_adj` with `feature_version=fe_v1`
7. Generates artifacts (completeness, stats, dictionary, frame check)
8. Checks gates (must pass)

**Expected Output**:
- Frame check sample (10 home team rows)
- Distribution stats (mean≈0, std>0)
- All gates pass:
  - Nulls < 5% for Set A
  - Zero-variance features = 0
  - Sign agreement ≥ 70%
  - DB rows persisted (2 rows per game)
  - No NaN/Inf

**Artifacts Generated**:
- `reports/feature_completeness.csv`
- `reports/feature_store_stats.csv`
- `reports/feature_dictionary.csv`
- `reports/frame_check_sample.csv`

## Step 3: Expand to Set B (Weeks 1-7)

**Command**:
```bash
npx tsx scripts/engineer-features.ts --season 2025 --weeks "1,2,3,4,5,6,7" --featureVersion fe_v1 --sourceWindow pre_kick
```

**Gates** (same as Set A, but null threshold is 15% instead of 5%):
- Nulls < 15% for Set B
- Zero-variance features = 0
- Sign agreement ≥ 70%
- DB rows persisted
- No NaN/Inf

## Step 4: Pair-Level Assembly (Post-Task 11 Ready-Check)

**Command** (to be created):
```bash
npx tsx scripts/assemble-pair-level-features.ts --season 2025 --featureVersion fe_v1
```

**What It Does**:
- Assembles pair rows (home - away) for Set A & Set B
- Confirms no NaN/Inf
- Validates target orientation matches frame
- Logs row counts for both sets

**Expected Output**:
- Set A: N pair rows
- Set B: M pair rows
- No NaN/Inf detected
- Frame alignment confirmed

## Step 5: Calibration (After Task 11 Passes)

**Fit #1 (Core)**:
- Train on Set A only (Weeks 8-11, pre-kick, weight=1.0)

**Fit #2 (Core+Extended)**:
- Train on Set A + Set B (weights 1.0/0.6)

**Gates** (on holdout):
- Slope: 0.90-1.10
- RMSE: ≤ 8.8 (Core) / ≤ 9.0 (Extended)
- Sign agreement: ≥ 70%
- Pearson & Spearman: ≥ 0.30
- Residual slices: No systematic tilt

---

## Red-Flag Checklist

- ❌ Unique index missing → Add it; upserts will duplicate
- ❌ EWMAs include current game → Leakage; fix windowing
- ❌ Frame mismatch (target vs features) → Flip and re-validate
- ❌ Tons of nulls → Mapping mismatch or missing CFBD rows; print offenders

---

## Quick Reference

**Smoke Test**: `npx tsx scripts/smoke_prisma.ts`

**Set A (Weeks 8-11)**: 
```bash
npx tsx scripts/engineer-features.ts --season 2025 --weeks "8,9,10,11" --featureVersion fe_v1 --sourceWindow pre_kick
```

**Set B (Weeks 1-7)**:
```bash
npx tsx scripts/engineer-features.ts --season 2025 --weeks "1,2,3,4,5,6,7" --featureVersion fe_v1 --sourceWindow pre_kick
```

**Feature Version**: `fe_v1` (stamped on all rows, allows side-by-side versions)


