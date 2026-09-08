# 2026 Workflow Reactivation Matrix — Current Operator Overlay

**Updated:** 2026-09-08 America/Chicago  
**Verified operational code baseline:** `56a13bc4ae24472eac4427614143c8bc1c3ddda4`  
**Status:** manual guarded production; Core V1 official; Hybrid V2 SHADOW / HELD / NOT OFFICIAL

This file is the current operator matrix. It answers **what is safe to run now, what has been production-proven, and what remains held**.

Detailed September 8 evidence is in [`2026-09-08-phase4b-closeout.md`](./2026-09-08-phase4b-closeout.md). Season-wide operator truth is in [`../SEASON_STATUS.md`](../SEASON_STATUS.md).

The prior long-form workflow inventory/audit remains in Git history at:

`git show 56a13bc4ae24472eac4427614143c8bc1c3ddda4:docs/2026-workflow-reactivation-matrix.md`

That version retains the detailed 2C-2J historical inventory. This current overlay intentionally does **not** pretend the old 49-file count is a live inventory after later guarded workflows were added.

---

## What this overlay does not authorize

This documentation change does **not**:

- enable or reactivate any GitHub Actions schedule
- authorize official Hybrid V2 production
- authorize Hybrid Bet writes
- authorize Super Tier A production use
- authorize Shadow ATS/CLV/evaluation persistence
- authorize Shadow prediction automation
- authorize T−30 closing automation
- change Core V1, Hybrid V2, or lifecycle formulas
- change `CORE_EVAL_V1`
- change the 30-minute prediction freshness rule
- change the kickoff-minus-30-minute closing rule
- call a provider
- write a production database row

## Current operator lanes

| Lane | Status |
|---|---|
| Core V1 / `official_flat_100` | **OFFICIAL / PRODUCTION-PROVEN** |
| Hybrid V2 | **SHADOW / HELD / NOT OFFICIAL** |
| Hybrid Super Tier A | **SHADOW / HELD** |
| V4 / Fade | Labs / backtest only |
| Week 1 scores | **CLOSED — 51/51 final** |
| Week 1 grading | **CLOSED — 98/98 graded; 29–67–2** |
| Week 2 Live Odds | **PROVEN — 2,533 persisted MarketLine rows** |
| 2026 TeamUnitGrades | **PROVEN — 138/138 persisted** |
| Phase 4B prediction capture | **PROVEN — first legitimate 49-game cohort persisted** |
| Phase 4B T−30 closing | **PREVIEW PROVEN; first COMMIT pending due window** |
| Phase 4B ATS / CLV / evaluation | **NOT IMPLEMENTED / NOT AUTHORIZED** |
| TeamGameStat / lifecycle | Prepared; canonical lifecycle weight remains 0 through completed Week 2 |
| Recurring production schedules | **KEEP STOPPED unless separately authorized** |

## Canonical guarded entrypoints

All workflows below are `workflow_dispatch` / manual unless a row explicitly says otherwise.

| Workflow | Role | Provider calls | Production writes | Current posture |
|---|---|---:|---|---|
| `write-live-odds-2026.yml` | Live Odds PREVIEW/COMMIT | **Yes** — Odds API | MarketLine | **PROVEN / MANUAL_SAFE** |
| `write-core-v1-weekly-card-2026.yml` | Core V1 Official Card PREVIEW/COMMIT | 0 after market exists | Bet / strategy-run scope | **PROVEN / MANUAL_SAFE** |
| `cfbd-scores-2026-manual.yml` | CFBD scores PREVIEW/COMMIT | **Yes** — CFBD | Game score/status only | **PROVEN / MANUAL_SAFE** |
| `grade-bets-2026-manual.yml` | Official bet grading PREVIEW/COMMIT | 0 | Bet settlement fields | **PROVEN / MANUAL_SAFE** |
| `cfbd-team-game-stats-2026-manual.yml` | TeamGameStat PREVIEW/COMMIT | **Yes** — CFBD advanced stats | TeamGameStat only | Prepared; use only when lifecycle evidence is needed |
| `write-core-v1-lifecycle-ratings.yml` | Core V1 lifecycle ratings PREVIEW/COMMIT | 0 | Core V1 ratings | Guarded; **do not COMMIT merely because Week 2 is complete** |
| `audit-2026-unit-grade-source-readiness.yml` | Same-season unit-grade source/readiness audit | 0 | none | **PROVEN / READ-ONLY** |
| `write-cfbd-unit-grade-sources-2026-manual.yml` | Same-season CFBD unit-grade source PREVIEW/COMMIT | **Yes** — CFBD | `cfbd_*` source tables only | **PROVEN / MANUAL_SAFE** |
| `preview-team-unit-grades-2026-manual.yml` | TeamUnitGrades planner PREVIEW | 0 | none | **PROVEN / READ-ONLY** |
| `write-team-unit-grades-2026-manual.yml` | TeamUnitGrades PREVIEW/COMMIT | 0 | TeamUnitGrades only | **PROVEN — 138/138 persisted** |
| `capture-shadow-snapshot-v1-2026-manual.yml` | Prospective Shadow prediction PREVIEW/COMMIT | 0 | ShadowCaptureRun + ShadowPredictionSnapshot | **PROVEN — first 49-game cohort persisted** |
| `capture-shadow-t30-closing-v1-2026-manual.yml` | T−30 closing PREVIEW/COMMIT | 0 | ShadowClosingMarketSnapshot only | **PREVIEW PROVEN; COMMIT due-window only** |
| `audit-prisma-migration-history.yml` | Migration-history audit | 0 | none | **MANUAL_SAFE / READ-ONLY** |
| `write-cfbd-schedules-2026-manual.yml` | Guarded weekly schedule rollover | **Yes** — CFBD | Game schedule scope | Manual guarded; do not infer recurring authorization |

### Explicitly not an entrypoint

`apps/jobs/src/v2/compute_unit_grades.ts` remains **UNSAFE / NOT AUTHORIZED** for 2026 production execution. The guarded `write-team-unit-grades-2026-manual.yml` workflow is the production TeamUnitGrades path.

## Current production proofs

### Week 1 closeout

Final grading run **34237744851**:

- games final: **51 / 51**
- official bets: **98**
- graded / pending: **98 / 0**
- record: **29–67–2**
- stake: **$9,800**
- PnL: **-$1,175.0130763340988**
- ROI: **-11.9899%**

Week 1 is closed. Do not continue the old September 4 score/grade maintenance loop.

### TeamUnitGrades

Production writer run **34265184909**:

- 2026 TeamUnitGrades: **138 / 138**
- exact post-write verification: passed
- provider calls: 0
- unrelated writes: none

The old `SOURCE_PARTIAL 31/138` hold is obsolete.

### Week 2 Live Odds

COMMIT run **34268896159**:

- games: **49**
- MarketLine rows inserted: **2,533**
- spread / ML / total: **1,062 / 938 / 533**
- spread coverage: **49 / 49**
- total coverage: **49 / 49**
- moneyline coverage: **47 / 49**
- books: **11**

### First legitimate Shadow prediction cohort

PREVIEW run **34270050350**: passed read-only.

COMMIT run **34270648352**:

- capture context: `weekly_post_refresh`
- games: **49**
- Hybrid AVAILABLE: **49**
- prediction snapshots: **49**
- provider calls: **0**
- official Bet writes: none

Hybrid remains held.

### T−30 closing PREVIEW

PR #110 merged the closing writer at:

`56a13bc4ae24472eac4427614143c8bc1c3ddda4`

Production PREVIEW run **34279785108**:

- total: **49**
- existing: **0**
- FUTURE: **49**
- DUE: **0**
- MISSED: **0**
- planned: **0**
- `writeSafe=true`
- mutations: **false**
- provider calls: **0**

The read path is proven. No closing rows exist yet.

## Phase 4B operating contract

### Prediction capture

- prediction timestamp is system-observed; operator does not supply it
- selected persisted market observation must be at or before prediction timestamp
- prediction market age must be **≤ 30 minutes**
- deterministic recency order: timestamp DESC, id DESC
- no retrospective/backdated evidence
- append-only capture run and prediction snapshots

### T−30 closing capture

- target = kickoff − 30 minutes
- choose latest persisted eligible spread MarketLine at or before target
- deterministic timestamp DESC, id DESC
- **never fall forward** to a row after target
- unsnapshotted game at/after kickoff = **MISSED**, not backfilled
- missing eligible row freezes an UNAVAILABLE close
- existing closing row = immutable/idempotent no-op
- provider calls = 0

The closing writer depends on a separate Live Odds persistence step. A fresh provider response obtained **after** T−30 cannot be used to repair a missed benchmark.

## Week 2 first closing windows

| Game | Kickoff CT | T−30 CT |
|---|---|---|
| Rutgers @ Boston College | Fri Sep 11, **6:30 PM** | **6:00 PM** |
| Missouri @ Kansas | Fri Sep 11, **7:00 PM** | **6:30 PM** |

Recommended manual sequence for each due window:

1. Live Odds PREVIEW shortly before T−30;
2. audit;
3. Live Odds COMMIT before T−30 if clean;
4. after T−30, T−30 PREVIEW;
5. audit selected persisted MarketLine provenance / no fall-forward;
6. separately authorize T−30 COMMIT before kickoff.

The first T−30 COMMIT is **not** pre-authorized by this matrix.

## Lifecycle timing

Canonical policy remains Candidate A / `GLOBAL_BLEND_W3_W6`:

- completed Week ≤2: **0.00** canonical in-season blend weight
- completed Week 3: **0.25**
- completed Week 4: **0.50**
- completed Week 5: **0.75**
- completed Week ≥6: **1.00**

Therefore TeamGameStat/lifecycle work is not a Week 2 card blocker. Do not run lifecycle COMMIT merely because Week 2 games exist or finish.

## Recurring schedule posture

No recurring schedule is reactivated by this overlay.

Historical static inventory at the September 4 document state recorded **8 YAML files with active `schedule:` blocks** and `scheduleReactivationRecommended=true` for **0**. Later guarded manual workflows were added after the older compact inventory, so its old workflow-file count is not a live total.

Recommendation remains: **keep recurring production workflows operator-stopped unless a separate workflow-specific review explicitly authorizes scheduling.**

## Legacy workflows — do not reactivate as-is

### REPLACE

- `nightly-ingest.yml` — 2025-era monolith; odds wipe/replace and ratings side effects
- `ratings-v1.yml` — legacy ratings engine; not the 2026 Core V1 lifecycle path
- `ratings-v2.yml` — old `modelVersion=v2`; not Hybrid V2 spread production
- `sync-weekly-bets.yml` — dual Hybrid/Core sync invalid while Hybrid is held

### BLOCKED

- `v3-totals-nightly.yml` — references missing `sync-v3-bets.ts`

### REPAIR_BEFORE_USE

- `cfbd-feature-ingest.yml`
- `cfbd-rankings-sync.yml`
- `stats-cfbd.yml`
- `stats-season-cfbd.yml`
- `stats-advanced-cfbd.yml`
- `roster-churn-cfbd.yml`
- `talent-commits-sync.yml`
- `sgo-team-stats.yml`

Do not confuse these historical/parallel paths with the guarded 2026 entrypoints above.

## Provider-cost discipline

Before running a manual workflow, remember whether PREVIEW itself consumes a provider call:

| Workflow / stage | PREVIEW provider cost |
|---|---|
| Live Odds | **Yes** — Odds API |
| Core card | **0** |
| CFBD Scores | **Yes** — CFBD `/games` |
| TeamGameStat | **Yes** — CFBD advanced stats |
| Unit-grade source ingestion | **Yes** — CFBD reads |
| Unit-grade readiness audit | **0** |
| TeamUnitGrades planner/writer PREVIEW | **0** |
| Shadow prediction capture | **0** |
| T−30 closing capture | **0** |

Do not spend provider calls merely to make a dashboard look busy.

## Still held / not authorized

- official Hybrid V2 activation
- Hybrid Bet writes
- Super Tier A production use
- Shadow ATS evaluation persistence
- Shadow CLV evaluation persistence
- Shadow research ROI persistence
- recurring Shadow prediction cadence
- recurring T−30 closing cadence
- retrospective Shadow inserts/backfill

## Deferred maintenance

Separate from current Week 2 operations:

- npm audit findings: **21 vulnerabilities** (2 low, 1 moderate, 17 high, 1 critical)
- GitHub Actions Node 20 deprecation / Node 24 forcing warnings
- TeamUnitGrades `(teamId, season)` uniqueness schema drift audit/remediation
- Supabase public-table RLS policy design; do not enable RLS without required policies

## Historical inventory / phase archaeology

For the detailed pre-September-8 workflow inventory, classifications, scheduled-workflow table, and 2C phase chronology, use the exact pre-closeout version:

`git show 56a13bc4ae24472eac4427614143c8bc1c3ddda4:docs/2026-workflow-reactivation-matrix.md`

That history remains authoritative for what was known **at those phase closes**. This file is authoritative for current operator guidance as of September 8.
