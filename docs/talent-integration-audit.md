# Team Talent & Recruiting Integration - Audit Report

## Executive Summary

The codebase has **partial implementation** of talent/recruiting data:
- ✅ Database table exists (`recruiting`) but mixes roster talent with class commits (should be separate)
- ✅ ETL job exists (`cfbd_talent.ts`) but only fetches roster talent composite (not separate commits endpoint)
- ❌ FeatureLoader does NOT expose talent features (no `talent_z`, `blue_chip_z`, `TalentComponent`)
- ❌ Ratings computation does NOT use talent as prior (only Base + HFA)
- ✅ UI columns exist for Model Spread/Total but are populated from Base + HFA only
- ❌ No talent contribution shown in "Top Factors"
- ❌ No dedicated workflows for talent sync

## Detailed Audit Checklist

### 1. DB Schema

| Item | Status | Details |
|------|--------|---------|
| `team_membership` (season-aware FBS) | ✅ **COMPLETE** | Exists with (season, team_id) PK and FK → teams.id |
| `team_season_talent` (roster-level) | ⚠️ **PARTIAL** | Data exists in `recruiting` table mixed with commits. Need separate table per spec. |
| `team_class_commits` (class-level) | ❌ **MISSING** | Should be separate table. Currently mixed into `recruiting` table. |
| PK constraints `(season, team_id)` | ✅ **COMPLETE** | `recruiting` has unique constraint on (team_id, season) |
| FK → teams.id | ✅ **COMPLETE** | `recruiting.team_id` references `teams.id` |

**Current Schema (`recruiting` table):**
```prisma
model Recruiting {
  teamId          String   @map("team_id")      // FK → teams.id
  season          Int                          // Part of PK
  teamTalentIndex Float?   @map("team_talent_index")  // ✅ Roster talent
  fiveStar        Int?     @map("five_star")    // ❌ Should be in commits table
  fourStar        Int?     @map("four_star")    // ❌ Should be in commits table
  threeStar       Int?     @map("three_star")   // ❌ Should be in commits table
  class_rank      Int                          // ✅ Commits data
  avg_rating      Float                        // ✅ Commits data
  commit_count    Int                          // ✅ Commits data
  five_stars      Int                          // ❌ Duplicate of fiveStar
  four_stars      Int                          // ❌ Duplicate of fourStar
  three_stars     Int                          // ❌ Duplicate of threeStar
  // Missing: blue_chips_pct, unrated count, source_updated_at for talent
  // Missing: avg_commit_rating, source_updated_at for commits
}
```

**Fix Plan:** Create two separate tables per spec: `team_season_talent` (roster) and `team_class_commits` (class).

---

### 2. ETL Jobs

| Item | Status | Details |
|------|--------|---------|
| CFBD `/stats/season` ingestion | ✅ **COMPLETE** | `cfbd_team_season_stats.ts` exists |
| CFBD `/stats/game/advanced` ingestion | ✅ **COMPLETE** | `cfbd_team_stats.ts` exists |
| CFBD `/talent/teams` (roster) ingestion | ✅ **COMPLETE** | `cfbd_talent.ts` exists, fetches from `/talent` endpoint |
| CFBD `/recruiting/teams` (class) ingestion | ❌ **MISSING** | `cfbd_talent.ts` only fetches roster talent, not separate commits endpoint |
| FBS filtering via `TeamResolver` | ✅ **COMPLETE** | Uses `TeamResolver.resolveTeam()` with FBS checks |
| Team name resolution | ✅ **COMPLETE** | Uses `TeamResolver` with CFBD provider |

**Current ETL (`cfbd_talent.ts`):**
- ✅ Fetches from `/talent?year={season}` endpoint
- ✅ Maps `talent` → `teamTalentIndex`
- ✅ Maps `recruiting.fiveStars/fourStars/threeStars` → star counts
- ❌ Does NOT fetch from `/recruiting/teams` endpoint (separate commits data)
- ❌ Stores everything in one `recruiting` table (should be split)

**Fix Plan:** 
1. Split `cfbd_talent.ts` into two jobs: `cfbd_team_roster_talent.ts` (roster) and `cfbd_team_class_commits.ts` (commits)
2. Add `/recruiting/teams` endpoint fetching for class commits

---

### 3. CI Workflows

| Item | Status | Details |
|------|--------|---------|
| Talent (Roster) Sync workflow | ❌ **MISSING** | No dedicated GH Action found |
| Talent (Commits) Sync workflow | ❌ **MISSING** | No dedicated GH Action found |
| FORCE_DB_TEAMS=true param | ❌ **MISSING** | Not implemented |
| Season parameterization | ❌ **MISSING** | Workflows don't exist |
| Summary logging | ❌ **MISSING** | Workflows don't exist |

**Fix Plan:** Create two GH Actions workflows for talent and commits sync with season param and logging.

---

### 4. Feature Layer

| Item | Status | Details |
|------|--------|---------|
| `FeatureLoader` exposes `talent_z` | ❌ **MISSING** | `TeamFeatures` interface has no talent fields |
| `FeatureLoader` exposes `blue_chip_z` | ❌ **MISSING** | Not computed or exposed |
| `FeatureLoader` exposes `TalentComponent` | ❌ **MISSING** | Not computed with decay |
| Z-score computation for talent | ❌ **MISSING** | No z-score calculation across FBS teams |
| Decay function (1 - weeks/8) | ❌ **MISSING** | No temporal decay implemented |
| HFA + basics only | ✅ **COMPLETE** | Current state: only game/season stats + HFA |

**Current `FeatureLoader` (`feature-loader.ts`):**
```typescript
export interface TeamFeatures {
  // ✅ Offensive features
  yppOff, successOff, epaOff, paceOff, passYpaOff, rushYpcOff
  // ✅ Defensive features  
  yppDef, successDef, epaDef, paceDef, passYpaDef, rushYpcDef
  // ❌ Missing: talent_z, blue_chip_z, TalentComponent, commits_signal
}
```

**Fix Plan:** Extend `FeatureLoader` to:
1. Load talent data from `team_season_talent` table
2. Compute z-scores (`talent_z`, `blue_chip_z`, `commits_signal`)
3. Compute `TalentPrior` = 1.0*talent_z + 0.3*blue_chip_z + 0.15*commits_signal
4. Apply decay: `decay = max(0, 1 - weeks_played / 8)`
5. Compute `TalentComponent = decay * TalentPrior`

---

### 5. Model Integration

| Item | Status | Details |
|------|--------|---------|
| Score = Base + TalentComponent + HFA | ❌ **MISSING** | Current: Score = Base + HFA only |
| TalentComponent in power rating | ❌ **MISSING** | Ratings v1/v2 don't include talent prior |
| Early-season fallback (talent-only) | ❌ **MISSING** | No fallback if Base features missing |
| `model_spread` computation | ✅ **COMPLETE** | Computed but without TalentComponent |
| `model_total` computation | ✅ **COMPLETE** | Computed but without TalentComponent |

**Current Ratings (`compute_ratings_v1.ts`):**
```typescript
// ✅ Loads features from FeatureLoader
const features = await loader.loadTeamFeatures(teamId, season);
// ✅ Computes z-scores for stats features
const zStats = { yppOff: calculateZScores(...), ... };
// ✅ Computes power rating from stats only
const powerRating = computePowerRating(features, zStats, modelConfig);
// ❌ Does NOT include TalentComponent in calculation
```

**Fix Plan:** Modify `compute_ratings_v1.ts` to:
1. Load talent features from `FeatureLoader`
2. Include `TalentComponent` in power rating: `Score = Base + TalentComponent + HFA`
3. Add early-season fallback: if Base missing, use `Score = TalentComponent + HFA`

---

### 6. UI Display

| Item | Status | Details |
|------|--------|---------|
| "This Week's Slate" MODEL SPREAD column | ✅ **COMPLETE** | Column exists in `SlateTable.tsx` |
| "This Week's Slate" MODEL TOTAL column | ✅ **COMPLETE** | Column exists in `SlateTable.tsx` |
| Columns populated with data | ⚠️ **PARTIAL** | Populated but from Base + HFA only (no talent) |
| Matchup page "Top Factors" shows Talent | ❌ **MISSING** | `computeTopFactors()` doesn't include talent contribution |
| Talent Differential chip | ❌ **MISSING** | Not displayed on matchup page |
| Talent decay sparkline | ❌ **MISSING** | Not shown |

**Current UI (`SlateTable.tsx`):**
- ✅ Has columns for Model Spread/Total (lines 1218-1227)
- ✅ Displays values when available (lines 1348-1354)
- ❌ Values computed without TalentComponent (from `/api/weeks/slate`)

**Current UI (`game/[gameId]/page.tsx`):**
- ✅ Shows "Top Factors" section
- ❌ `computeTopFactors()` only includes stat features, not talent

**Fix Plan:** 
1. Update `computeTopFactors()` in `/api/game/[gameId]/route.ts` to include talent contribution
2. Add "Talent Differential" chip to matchup page
3. Ensure model spread/total columns reflect talent-adjusted ratings

---

### 7. Status/Audit Endpoints

| Item | Status | Details |
|------|--------|---------|
| `/api/etl/heartbeat` includes talent counts | ❌ **MISSING** | Endpoint not found |
| `/api/etl/audit` includes talent freshness | ❌ **MISSING** | Endpoint not found |
| `/docs/status` shows talent tiles | ⚠️ **UNKNOWN** | Need to check status page |

**Fix Plan:** Add talent/commits counts and freshness to status/audit endpoints.

---

### 8. Data Checks

| Item | Status | Details |
|------|--------|---------|
| One row per FBS team in `team_season_talent` | ⚠️ **PARTIAL** | Data in `recruiting` table, need to verify coverage |
| One row per FBS team in `team_class_commits` | ❌ **MISSING** | Table doesn't exist |
| Non-NULL `success_off`/`epa_off` for 2024/2025 | ⚠️ **UNKNOWN** | Need to verify data quality |

**Fix Plan:** After schema changes, verify data coverage with SQL:
```sql
SELECT season, COUNT(*) FROM team_season_talent GROUP BY 1;
-- Should match FBS count for each season
```

---

## Implementation Priority

### Phase 1: Schema Separation (Critical)
1. Create `team_season_talent` table (roster composite)
2. Create `team_class_commits` table (recruiting class)
3. Migrate existing data from `recruiting` table
4. Update Prisma schema

### Phase 2: ETL Split (Critical)
1. Split `cfbd_talent.ts` into two jobs
2. Add `/recruiting/teams` endpoint fetching
3. Create GH Actions workflows

### Phase 3: Feature Engineering (Critical)
1. Extend `FeatureLoader` with talent features
2. Add z-score computation
3. Implement decay function
4. Compute `TalentComponent`

### Phase 4: Model Integration (Critical)
1. Update ratings computation to include `TalentComponent`
2. Add early-season fallback
3. Verify `model_spread`/`model_total` reflect changes

### Phase 5: UI Enhancement (Important)
1. Add talent to "Top Factors"
2. Display talent differential
3. Update status/audit endpoints

### Phase 6: Validation (Nice to have)
1. Quick backtest grid search
2. Data coverage verification
3. Documentation updates

---

## Key Files to Modify

1. **Schema**: `prisma/schema.prisma` - Add `TeamSeasonTalent` and `TeamClassCommits` models
2. **ETL**: `apps/jobs/src/talent/cfbd_team_roster_talent.ts` (new)
3. **ETL**: `apps/jobs/src/talent/cfbd_team_class_commits.ts` (new)
4. **Features**: `apps/jobs/src/ratings/feature-loader.ts` - Add talent fields
5. **Model**: `apps/jobs/src/ratings/compute_ratings_v1.ts` - Include TalentComponent
6. **UI API**: `apps/web/app/api/game/[gameId]/route.ts` - Add talent to Top Factors
7. **Workflows**: `.github/workflows/talent-sync.yml` (new)
8. **Workflows**: `.github/workflows/commits-sync.yml` (new)

---

## Notes

- The existing `cfbd_talent.ts` job is a good starting point but needs to be split
- The `recruiting` table currently mixes two concepts that should be separate
- Talent data appears to be fetched but not used in ratings (missing integration)
- Model spread/total are computed but don't reflect talent prior
- Need to verify CFBD `/recruiting/teams` endpoint structure before implementing

