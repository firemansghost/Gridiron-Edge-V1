# 2026 Workflow Reactivation Matrix — Current Operator Overlay

**Updated:** 2026-09-25 America/Chicago
**Evidence-producing runtime baseline:** `653eb9d1826954bb3ea6d1eaedb10b41739000eb`
**Status:** manual guarded production; Core V1 official; Hybrid V2 SHADOW / HELD / NOT OFFICIAL; Candidate B V1 SHADOW / RESEARCH ONLY / NOT OFFICIAL

This file is the current operator matrix. It answers **what is safe to run now, what has been production-proven, and what remains held**.

Detailed September 8 evidence is in [`2026-09-08-phase4b-closeout.md`](./2026-09-08-phase4b-closeout.md). Season-wide operator truth is in [`../SEASON_STATUS.md`](../SEASON_STATUS.md). Generic Shadow notes are in [`SHADOW_MODEL_CAPTURE_V1.md`](./SHADOW_MODEL_CAPTURE_V1.md). Candidate B first prospective cohort evidence is in [`2026-09-16-candidate-b-v1-first-prospective-closeout.md`](./2026-09-16-candidate-b-v1-first-prospective-closeout.md). Current Week 4 Shadow / T-30 evidence is in [`2026-09-25-week4-shadow-t30-closeout.md`](./2026-09-25-week4-shadow-t30-closeout.md).

The prior long-form workflow inventory/audit remains in Git history at:

`git show 56a13bc4ae24472eac4427614143c8bc1c3ddda4:docs/2026-workflow-reactivation-matrix.md`

That version retains the detailed 2C-2J historical inventory. This current overlay intentionally does **not** pretend the old 49-file count is a live inventory after later guarded workflows were added.

---

## What this overlay does not authorize

This documentation change does **not**:

- enable or reactivate any additional recurring production schedule beyond the already-proven Supabase external T-30 clock
- authorize official Hybrid V2 production
- authorize Hybrid Bet writes
- authorize Super Tier A production use
- authorize Shadow ATS/CLV/evaluation persistence
- authorize Shadow prediction automation
- authorize blanket future Generic Shadow **prediction** COMMITs or a recurring Generic prediction schedule
- authorize Candidate B promotion or official use
- classify Candidate B as blanket `MANUAL_SAFE` for future COMMITs
- authorize WEPA / PassMatch / Totals V2 / Portal / ensemble adapters
- authorize future-week Hybrid T−30 automation beyond the explicit Week 4 Stage E scope
- change Core V1, Hybrid V2, or lifecycle formulas
- change `CORE_EVAL_V1`
- change the 30-minute prediction freshness rule
- change the kickoff-minus-30-minute closing rule
- imply Official Card or Hybrid activation from Generic Shadow evidence
- call a provider
- write a production database row

## Current operator lanes

| Lane | Status |
|---|---|
| Core V1 / `official_flat_100` | **OFFICIAL / PRODUCTION-PROVEN** |
| Hybrid V2 | **SHADOW / HELD / NOT OFFICIAL** |
| Hybrid Super Tier A | **SHADOW / HELD** |
| V4 prospective V1 | **SHADOW / RESEARCH ONLY**; Week 4 cohort frozen |
| Week 1 scores | **CLOSED — 51/51 final** |
| Week 1 grading | **CLOSED — 98/98 graded; 29–67–2** |
| Week 2 Live Odds | **PROVEN — 2,533 persisted MarketLine rows** |
| Week 4 Official Core card | **107 persisted `official_flat_100` bets; currently ungraded** |
| 2026 TeamUnitGrades | **PROVEN — 138/138 persisted** |
| Phase 4B Hybrid prediction capture | **PROVEN — Week 4 V4-backed 58-game cohort frozen / verified** |
| Phase 4B T−30 closing | Generic external-clock automation **ACTIVE / PROVEN**; Week 4 Hybrid Stage E **ACTIVE / LIVE-PROVEN** |
| Phase 4B Generic Shadow capture | **PROVEN / RESEARCH ONLY** — Week 4 Core, Candidate B roster prior, and V4 cohorts frozen; Candidate B Elo remains Week 5+ only |
| Candidate B V1 | **SHADOW / RESEARCH ONLY / NOT OFFICIAL** — first prospective cohort frozen; no blanket future COMMIT authorization |
| Phase 4B ATS / CLV / evaluation | Generic `CORE_EVAL_V1` read-only evaluator **IMPLEMENTED**; persistence remains **NOT AUTHORIZED** |
| TeamGameStat / lifecycle | **314/314 EPA-complete participant rows through Week 3**; canonical lifecycle checkpoint **0.25**; next after completed Week 4 = **0.50** |
| Recurring production schedules | Supabase Generic T−30 clock **ACTIVE / PROVEN**; Week 4 Hybrid Stage E inherits that gate only; other recurring production schedules remain stopped |

## Canonical guarded entrypoints

All workflows below are `workflow_dispatch` / manual unless a row explicitly says otherwise.

| Workflow | Role | Provider calls | Production writes | Current posture |
|---|---|---:|---|---|
| `write-live-odds-2026.yml` | Live Odds PREVIEW/COMMIT | **Yes** — Odds API | MarketLine | **PROVEN / MANUAL_SAFE** |
| `write-core-v1-weekly-card-2026.yml` | Core V1 Official Card PREVIEW/COMMIT | 0 after market exists | Bet / strategy-run scope | **PROVEN / MANUAL_SAFE** |
| `cfbd-scores-2026-manual.yml` | CFBD scores PREVIEW/COMMIT | **Yes** — CFBD | Game score/status only | **PROVEN / MANUAL_SAFE** |
| `grade-bets-2026-manual.yml` | Official bet grading PREVIEW/COMMIT | 0 | Bet settlement fields | **PROVEN / MANUAL_SAFE** |
| `cfbd-team-game-stats-2026-manual.yml` | TeamGameStat PREVIEW/COMMIT | **Yes** — CFBD advanced stats | TeamGameStat only | **PROVEN through Week 3 — 314/314 EPA-complete participant rows**; Week 4 after games complete |
| `write-core-v1-lifecycle-ratings.yml` | Core V1 lifecycle ratings PREVIEW/COMMIT | 0 | Core V1 ratings | Guarded; completed Week 3 canonical weight **0.25**; after completed Week 4 next weight **0.50** |
| `audit-2026-unit-grade-source-readiness.yml` | Same-season unit-grade source/readiness audit | 0 | none | **PROVEN / READ-ONLY** |
| `write-cfbd-unit-grade-sources-2026-manual.yml` | Same-season CFBD unit-grade source PREVIEW/COMMIT | **Yes** — CFBD | `cfbd_*` source tables only | **PROVEN / MANUAL_SAFE** |
| `preview-team-unit-grades-2026-manual.yml` | TeamUnitGrades planner PREVIEW | 0 | none | **PROVEN / READ-ONLY** |
| `write-team-unit-grades-2026-manual.yml` | TeamUnitGrades PREVIEW/COMMIT | 0 | TeamUnitGrades only | **PROVEN — 138/138 persisted** |
| `capture-shadow-snapshot-v1-2026-manual.yml` | Prospective Hybrid Shadow prediction PREVIEW/COMMIT | 0 | ShadowCaptureRun + ShadowPredictionSnapshot | **PROVEN — Week 4 V4-backed 58-game cohort frozen / verified** |
| `capture-shadow-model-predictions-2026-manual.yml` | Generic multi-model Shadow PREVIEW/COMMIT | 0 | ShadowModelCaptureRun + ShadowModelPrediction only | **PROVEN / MANUAL_GUARDED / RESEARCH ONLY** — Core + Candidate B roster prior + Candidate B Elo (Week 5+) + V4 Week 4 pinned; future prediction COMMITs remain model/week guarded |
| `capture-shadow-t30-closing-v1-2026-manual.yml` | Hybrid Snapshot V1 T−30 PREVIEW/COMMIT | 0 | ShadowClosingMarketSnapshot only | **PROVEN** manual fallback; Week 4 also protected by Stage E |
| `run-generic-shadow-t30-automation-v1-scheduled-2026.yml` | Supabase-dispatched T−30 coordinator | Stage C only when T-45..T-35 refresh is needed | MarketLine; ShadowModelClosingMarketSnapshot; Week 4 only ShadowClosingMarketSnapshot | **ACTIVE / PROVEN** — Supabase sole clock; Week 4 Hybrid Stage E auto-disables when active week != 4 |
| `audit-prisma-migration-history.yml` | Migration-history audit | 0 | none | **MANUAL_SAFE / READ-ONLY** |
| `write-cfbd-schedules-2026-manual.yml` | Guarded weekly schedule rollover | **Yes** — CFBD | Game schedule scope | Manual guarded; do not infer recurring authorization |

### Explicitly not an entrypoint

`apps/jobs/src/v2/compute_unit_grades.ts` remains **UNSAFE / NOT AUTHORIZED** for 2026 production execution. The guarded `write-team-unit-grades-2026-manual.yml` workflow is the production TeamUnitGrades path.

## Current production proofs

### Week 4 current checkpoint

See [`2026-09-25-week4-shadow-t30-closeout.md`](./2026-09-25-week4-shadow-t30-closeout.md) for the full evidence ledger.

- Week 4 games: **58**
- official Core card: **107** persisted bets, currently ungraded
- TeamGameStat through Week 3: **314 / 314** EPA-complete participant rows
- Week 4 V4 run: `149e59c2-801a-4535-bfc0-1b2d2f4a5198` (**57 / 58 AVAILABLE**)
- Week 4 Hybrid run: `86505023-0ba6-4838-bbd6-21091c73057f` (**57 / 58 AVAILABLE; 8 Super Tier A research qualifiers**)
- Hybrid idempotent verification: run **36146124407**
- Week 4 Hybrid T-30 Stage E live proof: run **36148638315**
- Generic T-30 external clock: **ACTIVE / PROVEN**


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

### T−30 closing — Week 2 complete

Historical first production PREVIEW (read-path proof) on SHA `56a13bc4ae24472eac4427614143c8bc1c3ddda4`, run **34279785108**:

- total: **49**
- existing: **0**
- FUTURE: **49**
- DUE: **0**
- MISSED: **0**
- planned: **0**
- `writeSafe=true`
- mutations: **false**
- provider calls: **0**

That PREVIEW is historical read-path proof only. Week 2 T−30 evidence is now **complete**:

- legitimate captures: **36**
- legitimate misses: **13**

Do not describe Week 2 T−30 as incomplete, and do not claim that closing evidence has not yet been written.

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

### Generic Shadow capture

- research-only additive tables (`ShadowModelCaptureRun` / `ShadowModelPrediction`)
- provider calls = 0
- current allowlist/capability: `core_v1_shadow_baseline_v1`, `candidate_b_roster_prior_v1`, `candidate_b_elo_prior_v1` (Week 5+), `v4_prospective_v1` (Week 4 pinned)
- workflow remains `workflow_dispatch` only; default PREVIEW; no schedule
- Core first Week 3 production proof: migration **34779225982**, PREVIEW **34785048578**, COMMIT **34785370466**, capture run `882cf725-9e83-431e-965d-0e97df2da635`
- Candidate B first PREVIEW: **35123647114** (zero persisted prediction rows)
- Candidate B first separately authorized COMMIT: **35128215811**, capture run `74234d87-bb32-47c6-927b-6de3d24cfc88` (57 / 35 available / 22 unavailable / 34 selections / 1 NO_SELECTION; market age 651s)
- Candidate B remains **SHADOW / RESEARCH ONLY / NOT OFFICIAL**
- Candidate B Week 3 cohort is frozen; do not replace it
- future Generic COMMITs remain **PER-RUN AUTHORIZATION** / manual-guarded and are **not** blanket-authorized
- do **not** globally classify Candidate B as `MANUAL_SAFE` in a way that implies blanket future COMMIT permission

## Week 2 first closing windows (historical operating notes)

| Game | Kickoff CT | T−30 CT |
|---|---|---|
| Rutgers @ Boston College | Fri Sep 11, **6:30 PM** | **6:00 PM** |
| Missouri @ Kansas | Fri Sep 11, **7:00 PM** | **6:30 PM** |

Recommended manual sequence for each due window remained:

1. Live Odds PREVIEW shortly before T−30;
2. audit;
3. Live Odds COMMIT before T−30 if clean;
4. after T−30, T−30 PREVIEW;
5. audit selected persisted MarketLine provenance / no fall-forward;
6. separately authorize T−30 COMMIT before kickoff.

Week 2 T−30 is now complete (36 captures / 13 misses). Generic Week 4 T−30 is protected by the active Supabase external clock. Hybrid Week 4 T−30 is protected by Stage E on that same cycle. Future-week Hybrid automation requires separate reviewed authorization.

## Lifecycle timing

Canonical policy remains Candidate A / `GLOBAL_BLEND_W3_W6`:

- completed Week ≤2: **0.00** canonical in-season blend weight
- completed Week 3: **0.25**
- completed Week 4: **0.50**
- completed Week 5: **0.75**
- completed Week ≥6: **1.00**

Week 3 TeamGameStat is complete and the canonical completed-Week-3 lifecycle checkpoint is 0.25. After Week 4 is fully complete, run guarded Week 4 TeamGameStat PREVIEW/COMMIT first, then lifecycle PREVIEW/audit, then COMMIT only if the 0.50 gates pass.

## Recurring schedule posture

The **Supabase external clock is active and authoritative** for the Generic Shadow T-30 coordinator. Native GitHub cron is intentionally disabled for that coordinator.

During Week 4 only, Hybrid closing Stage E inherits the already-proven Generic gate and active-week value. Advancing the configured week away from 4 disables Hybrid Stage E automatically.

Historical static inventory at the September 4 document state recorded older GitHub `schedule:` blocks; that inventory is chronology only and is not the current scheduling posture.

All other recurring production workflows remain operator-stopped unless separately reviewed and authorized.

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
| Generic Shadow model capture | **0** |
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
- recurring Generic Shadow **prediction** cadence / blanket future Generic prediction COMMIT authorization
- future-week Hybrid T−30 cadence beyond the explicit Week 4 scope
- retrospective Shadow inserts/backfill
- replacing or rerunning the frozen Candidate B Week 3 cohort
- Candidate B promotion / official use
- WEPA / PassMatch / Totals V2 / Portal / ensemble adapters

## Deferred maintenance

Separate from current Week 4 operations:

- npm audit findings: **21 vulnerabilities** (2 low, 1 moderate, 17 high, 1 critical)
- GitHub Actions Node 20 deprecation / Node 24 forcing warnings
- TeamUnitGrades `(teamId, season)` uniqueness schema drift audit/remediation
- Supabase public-table RLS policy design; do not enable RLS without required policies

## Historical inventory / phase archaeology

For the detailed pre-September-8 workflow inventory, classifications, scheduled-workflow table, and 2C phase chronology, use the exact pre-closeout version:

`git show 56a13bc4ae24472eac4427614143c8bc1c3ddda4:docs/2026-workflow-reactivation-matrix.md`

That history remains authoritative for what was known **at those phase closes**. This file is authoritative for current operator guidance as of September 25, 2026.
