# Season Status — Gridiron Edge

**Status:** 2026 season active — manual guarded production  
**Updated:** 2026-09-08 America/Chicago  
**Verified operational code baseline:** `56a13bc4ae24472eac4427614143c8bc1c3ddda4` (PR #110 merge)  
**Official production spread model:** Core V1 / `official_flat_100`  
**Hybrid V2:** SHADOW / HELD / NOT OFFICIAL

This file is the operator-facing current-state document. Detailed September 8 Phase 4B evidence is in [`docs/2026-09-08-phase4b-closeout.md`](docs/2026-09-08-phase4b-closeout.md). Current workflow authorization is in [`docs/2026-workflow-reactivation-matrix.md`](docs/2026-workflow-reactivation-matrix.md).

The prior long-form phase archaeology remains available in Git history at the exact pre-closeout baseline:

`git show 56a13bc4ae24472eac4427614143c8bc1c3ddda4:SEASON_STATUS.md`

This consolidation intentionally removes stale historical sections from the live operator document; it does not erase or revise those historical decisions.

---

## CURRENT STATE — 2026-09-08

The project is **not** globally blocked. Week 1 is fully closed. Week 2 is active. Core V1 remains official. The same-season TeamUnitGrades dependency is satisfied, the first legitimate prospective Hybrid Shadow cohort is persisted, and the T−30 closing-market read path is production-proven.

The next real Phase 4B evidence event is the first due-window T−30 closing capture. There is no reason to manufacture additional engineering work before that operational window.

### Season posture

| Item | Current state |
|---|---|
| Season | **2026 active** |
| Official spread model | **Core V1** / `official_flat_100` |
| Hybrid V2 | **SHADOW / HELD / NOT OFFICIAL** |
| Hybrid Super Tier A | **SHADOW / HELD**; no production use |
| V4 / Fade | Labs / backtest only |
| Core V1 lifecycle | Candidate A / `GLOBAL_BLEND_W3_W6`; canonical weight **0 through completed Week 2**; first nonzero weight after completed Week 3 |
| Week 1 | **CLOSED** — 51/51 games final; 98/98 official bets graded |
| Week 2 | **ACTIVE** — 49 games; live market persisted; one legitimate 49-game Shadow prediction cohort persisted |
| 2026 TeamUnitGrades | **COMPLETE / PRODUCTION-PROVEN — 138/138** |
| Phase 4B prediction capture | **IMPLEMENTED + FIRST LEGITIMATE COMMIT PROVEN** |
| Phase 4B T−30 closing | **IMPLEMENTED; production PREVIEW proven; first COMMIT not yet run** |
| Phase 4B ATS / CLV / evaluation | **NOT IMPLEMENTED / NOT AUTHORIZED** |
| Shadow automation | **NOT AUTHORIZED** |
| Recurring production schedules | Operator-stopped unless separately authorized; no schedule reactivation from this closeout |

## Verified production snapshot

Read-only production verification on September 8:

| Metric | Value |
|---|---:|
| Week 1 Game rows | **51** |
| Week 1 scored/final | **51 / 51** |
| Week 1 official bets | **98** |
| Week 1 graded / pending | **98 / 0** |
| Week 1 record | **29–67–2** |
| Week 1 stake | **$9,800** |
| Week 1 PnL | **-$1,175.0130763340988** |
| Week 1 ROI | **-11.9899%** |
| 2026 TeamUnitGrades rows / teams | **138 / 138** |
| Week 2 Shadow capture runs | **1** |
| Week 2 Shadow prediction rows / games | **49 / 49** |
| Shadow closing rows | **0** |
| Shadow evaluation rows | **0** |

## Week 1 — formally closed

Final grading COMMIT run **34237744851** closed the complete persisted Official Card:

- official bets: **98**
- graded: **98**
- pending: **0**
- record: **29 wins / 67 losses / 2 pushes**
- stake: **$9,800**
- PnL: **-$1,175.0130763340988**
- ROI: **-11.9899%**
- Week 1 games final: **51 / 51**

Week 1 is no longer a score-maintenance or grading workstream. Historical intermediate Week 1 score/grade snapshots are chronology only.

## 2026 TeamUnitGrades — complete

The September 4 `SOURCE_PARTIAL 31/138` hold is obsolete.

The production chain reached complete same-season evidence and persisted **138/138** TeamUnitGrades through the guarded writer.

Key implementation sequence:

| PR / run | Result |
|---|---|
| PR #107 | Added guarded 2026 TeamUnitGrades PREVIEW/COMMIT writer |
| First COMMIT | Rolled back safely on exact-float comparison mismatch |
| PR #108 | Added rollback-only persistence diagnostics |
| Diagnostic run | Isolated floating-point delta near `2.22e-16` |
| PR #109 | Added canonical float persistence/comparison |
| Run **34265184909** | **COMMIT SUCCESS — 138 rows; exact post-write match** |

Canonical writer:

`.github/workflows/write-team-unit-grades-2026-manual.yml`

It is manual-only and provider-free. It writes TeamUnitGrades only from the proven planner/parity path.

`apps/jobs/src/v2/compute_unit_grades.ts` remains **UNSAFE / NOT AUTHORIZED** as a production entrypoint. Do not substitute it for the guarded writer.

## Week 2 live market

Guarded Live Odds COMMIT run **34268896159** persisted the Week 2 market:

- games: **49**
- inserted MarketLine rows: **2,533**
- spread rows: **1,062**
- moneyline rows: **938**
- total rows: **533**
- spread coverage: **49 / 49** games
- total coverage: **49 / 49** games
- moneyline coverage: **47 / 49** games
- books: **11**

Live Odds remains a separate provider-backed stage. Shadow prediction and T−30 capture do not fetch odds themselves.

## Phase 4B — prospective Shadow evidence

### Frozen contract still in force

- evaluation protocol: `CORE_EVAL_V1`
- prediction-time market freshness: **≤ 30 minutes**
- closing target: **kickoff − 30 minutes**
- no retrospective/backdated Shadow evidence
- no after-target fallback for T−30 closing evidence
- append-only evidence storage
- Core V1 remains official
- Hybrid remains held

### First legitimate prediction cohort

Prediction PREVIEW run **34270050350** passed read-only.

Prediction COMMIT run **34270648352** established the first legitimate prospective cohort:

- capture run ID: `fde1ec24-80fa-4393-8de8-611b135b480b`
- capture context: `weekly_post_refresh`
- capture timestamp: `2026-09-08T19:44:31.116Z`
- games: **49**
- Hybrid AVAILABLE: **49**
- Hybrid UNAVAILABLE: **0**
- selected sides: **35 AWAY / 14 HOME**
- provider calls during capture: **0**
- persisted prediction snapshots: **49**

Qualification state:

- QUALIFIED: **0**
- NOT_QUALIFIED: **8**
- UNAVAILABLE: **41**
- V4 comparison provenance unavailable: **49**

V4 absence does not invalidate the Hybrid prediction. It conservatively prevents Super Tier A qualification where frozen rules require V4 decision provenance.

No official Bet rows were created. Hybrid remains **SHADOW / HELD / NOT OFFICIAL**.

### T−30 closing layer

PR #110 merged the guarded closing writer on SHA:

`56a13bc4ae24472eac4427614143c8bc1c3ddda4`

Canonical workflow:

`.github/workflows/capture-shadow-t30-closing-v1-2026-manual.yml`

First production PREVIEW run **34279785108** passed on that exact SHA:

- total games: **49**
- existing closings: **0**
- FUTURE: **49**
- DUE: **0**
- MISSED: **0**
- planned inserts: **0**
- `writeSafe=true`
- mutations: **false**
- provider calls: **0**

Artifact:

- `shadow-t30-closing-v1-2026-w2-PREVIEW`
- ID **10077155535**
- SHA-256 `8894ffa2a2f7746c706634ad879efa61453581ea3c260361ae23a8e5b970a364`

The T−30 read path is therefore **PRODUCTION-PROVEN**. The first T−30 COMMIT has not yet occurred.

## Week 2 T−30 operating sequence

The closing writer uses persisted MarketLine rows only. It does not call a provider.

For each due window:

1. run Week 2 Live Odds PREVIEW shortly before T−30;
2. independently audit it;
3. run Live Odds COMMIT before T−30 if clean;
4. after the T−30 target, run T−30 PREVIEW;
5. audit the chosen persisted MarketLine row and verify no fall-forward;
6. only then run a separately authorized T−30 COMMIT before kickoff.

First Friday windows:

| Game | Kickoff CT | T−30 CT |
|---|---|---|
| Rutgers @ Boston College | Fri Sep 11, **6:30 PM** | **6:00 PM** |
| Missouri @ Kansas | Fri Sep 11, **7:00 PM** | **6:30 PM** |

Do **not** run T−30 COMMIT early. Do **not** backfill after kickoff if a due window is missed.

## Canonical guarded operator entrypoints

All entries below are manual unless explicitly stated otherwise.

| Workflow | Role | Current posture |
|---|---|---|
| `write-live-odds-2026.yml` | Provider-backed Live Odds PREVIEW/COMMIT | **PROVEN** |
| `write-core-v1-weekly-card-2026.yml` | Official Core V1 card | **PROVEN** |
| `cfbd-scores-2026-manual.yml` | Scores PREVIEW/COMMIT | **PROVEN** |
| `grade-bets-2026-manual.yml` | Official grading PREVIEW/COMMIT | **PROVEN** |
| `cfbd-team-game-stats-2026-manual.yml` | TeamGameStat / lifecycle EPA feed | Prepared; lifecycle weight remains 0 through completed Week 2 |
| `write-core-v1-lifecycle-ratings.yml` | Core V1 lifecycle ratings | Do not COMMIT merely because Week 2 is complete; first nonzero canonical weight after completed Week 3 |
| `audit-2026-unit-grade-source-readiness.yml` | Unit-grade source/readiness audit | **PROVEN** |
| `write-cfbd-unit-grade-sources-2026-manual.yml` | Same-season unit-grade source PREVIEW/COMMIT | **PROVEN** |
| `preview-team-unit-grades-2026-manual.yml` | Read-only TeamUnitGrades planner | **PROVEN** |
| `write-team-unit-grades-2026-manual.yml` | Guarded TeamUnitGrades PREVIEW/COMMIT | **PROVEN — 138/138 persisted** |
| `capture-shadow-snapshot-v1-2026-manual.yml` | Prospective Shadow prediction PREVIEW/COMMIT | **PROVEN — first 49-game cohort persisted** |
| `capture-shadow-t30-closing-v1-2026-manual.yml` | T−30 closing PREVIEW/COMMIT | **PREVIEW PROVEN; first COMMIT pending due window** |
| `audit-prisma-migration-history.yml` | Read-only migration-history audit | MANUAL_SAFE |

No Shadow cron is authorized. No score/grading automation is authorized by this document. Do not infer recurring cadence from a manual workflow being present.

## Not implemented / not authorized

- Shadow ATS evaluation persistence
- Shadow CLV evaluation persistence
- Shadow research ROI persistence
- Shadow prediction automation
- T−30 closing automation
- official Hybrid activation
- Hybrid Bet writes
- Super Tier A production use
- retrospective Shadow backfill

## Deferred maintenance — separate workstreams

These are real issues but are **not** blockers for the current Week 2 Shadow/T−30 path:

- npm audit: **21 vulnerabilities** (2 low, 1 moderate, 17 high, 1 critical)
- GitHub Actions Node 20 deprecation / Node 24 forcing warning on some actions
- TeamUnitGrades production schema drift: intended `(teamId, season)` uniqueness should be audited/remediated through a guarded migration path
- Supabase RLS posture across public tables requires policy design before enabling; do not toggle RLS ad hoc

## Frozen boundaries

This status closeout does **not** change:

- Core V1 formula
- Hybrid V2 formula
- Core V1 official status
- Hybrid held status
- `CORE_EVAL_V1`
- 30-minute prediction freshness rule
- kickoff-minus-30-minute closing rule
- Candidate A / `GLOBAL_BLEND_W3_W6` lifecycle policy
- provider pricing/cadence
- official card selections
- production workflow schedules
- any production database row

## Historical archaeology

The previous `SEASON_STATUS.md` contained the detailed preseason-through-September-4 chronology. It remains immutable in Git history at:

`56a13bc4ae24472eac4427614143c8bc1c3ddda4`

Use that version when researching old phase decisions. Use **this** version for current operator guidance.
