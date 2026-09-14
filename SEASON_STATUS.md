# Season Status — Gridiron Edge

**Status:** 2026 season active — manual guarded production  
**Updated:** 2026-09-13 America/Chicago  
**Evidence-producing runtime baseline:** `e54196faf18e2f1287e85e12b613e65afbc27ca2`  
**Official production spread model:** Core V1 / `official_flat_100`  
**Hybrid V2:** SHADOW / HELD / NOT OFFICIAL

This file is the operator-facing current-state document. Detailed September 8 Phase 4B evidence is in [`docs/2026-09-08-phase4b-closeout.md`](docs/2026-09-08-phase4b-closeout.md). Current workflow authorization is in [`docs/2026-workflow-reactivation-matrix.md`](docs/2026-workflow-reactivation-matrix.md). Generic multi-model Shadow capture notes are in [`docs/SHADOW_MODEL_CAPTURE_V1.md`](docs/SHADOW_MODEL_CAPTURE_V1.md).

The prior long-form phase archaeology remains available in Git history at the exact pre-closeout baseline:

`git show 56a13bc4ae24472eac4427614143c8bc1c3ddda4:SEASON_STATUS.md`

This consolidation intentionally removes stale historical sections from the live operator document; it does not erase or revise those historical decisions.

---

## CURRENT STATE — 2026-09-13

The project is **not** globally blocked. Week 2 scores are final. Week 3 is active with a completed Sep 13 Live Odds refresh (57/57 spread+total coverage). Core V1 remains official. Hybrid remains held. The first legitimate prospective Hybrid Shadow cohort remains frozen at 49 games. Week 2 T−30 closing evidence is complete (36 captures / 13 misses). The Generic Core V1 Shadow path has a first prospective production capture for Week 3 (research-only; additive; not an Official Card writer).

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
| Week 2 | **CLOSED scores** — **49/49 final**; Official Card **0 Bets** (do not reconstruct) |
| Week 2 Hybrid Shadow prediction cohort | **49** persisted |
| Week 2 T−30 closing | **36 legitimate captures / 13 legitimate misses** |
| Week 3 schedule | **57 games** |
| Week 3 Live Odds (current after COMMIT **34784597710**) | **4,171** MarketLine rows; spread **57/57**; total **57/57**; moneyline **53/57**; **9** books |
| Week 3 Official Card | Market refresh complete; Official Card itself **not yet rewritten/previewed** as a separate guarded step; **no official bets written** |
| 2026 TeamUnitGrades | **COMPLETE / PRODUCTION-PROVEN — 138/138** |
| Phase 4B Hybrid prediction capture | **IMPLEMENTED + FIRST LEGITIMATE COMMIT PROVEN** (Week 2 cohort frozen) |
| Phase 4B T−30 closing | **Week 2 complete** (36 / 13) |
| Phase 4B ATS / CLV / evaluation | **NOT IMPLEMENTED / NOT AUTHORIZED** |
| Generic multi-model Shadow capture | **MIGRATION DEPLOYED + FIRST WEEK 3 PRODUCTION COMMIT PROVEN**; research-only / additive; future COMMITs **not blanket-authorized** |
| Shadow automation | **NOT AUTHORIZED** |
| Recurring production schedules | Operator-stopped unless separately authorized |

## Verified production snapshot

Historical September 8 verification remains valid for Week 1 / TeamUnitGrades / first Hybrid Shadow cohort. September 13 operator truth:

| Metric | Value |
|---|---:|
| Week 2 Game rows final | **49 / 49** |
| Week 2 Official Card bets | **0** (do not reconstruct) |
| Week 2 Hybrid Shadow predictions | **49** |
| Week 2 T−30 captures / misses | **36 / 13** |
| Week 3 scheduled games | **57** |
| Week 3 Live Odds rows after COMMIT **34784597710** | **4,171** |
| Week 3 Live Odds inserted by that COMMIT | **1,965** |
| Week 3 spread / total / ML coverage | **57 / 57 / 53** |
| Week 3 official bets written | **0** |
| Generic Shadow migration deploy | **34779225982** |
| Generic Shadow first capture run | `882cf725-9e83-431e-965d-0e97df2da635` |
| Generic Shadow Week 3 predictions | **57** (AVAILABLE **57** / UNAVAILABLE **0**; selections **57** / NO_SELECTION **0**) |

Historical earlier Week 3 Live Odds state (before the Sep 13 refresh): **469 rows / 46 games**. That is **not** current.


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

## Week 3 live market — Sep 13 refresh

Fresh Live Odds PREVIEW **34784449263** and COMMIT **34784597710** on evidence-producing runtime SHA `e54196faf18e2f1287e85e12b613e65afbc27ca2`:

- scheduled games: **57**
- inserted MarketLine rows: **1,965**
- total MarketLine rows after COMMIT: **4,171**
- spread rows: **1,948**
- moneyline rows: **1,248**
- total rows: **975**
- spread coverage: **57 / 57**
- total coverage: **57 / 57**
- moneyline coverage: **53 / 57**
- books: **9**

Four games lacked moneyline only: Buffalo @ Penn State; Kent State @ Ohio State; UTEP @ Michigan; Western Kentucky @ Indiana.

Earlier historical Week 3 Live Odds state before this refresh was **469 rows / 46 games**. That is not current.

Market refresh complete does **not** by itself mean the Official Card has been rewritten. Official Card work remains a separate guarded operator step. No Week 3 official bets have been written.

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
- Hybrid Snapshot V1 evidence remains frozen; generic multi-model capture is additive only (see [`docs/SHADOW_MODEL_CAPTURE_V1.md`](docs/SHADOW_MODEL_CAPTURE_V1.md))

### First legitimate Hybrid prediction cohort

Prediction PREVIEW run **34270050350** passed read-only.

Prediction COMMIT run **34270648352** established the first legitimate prospective Hybrid cohort:

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

### Generic Core V1 Shadow — first Week 3 production proof

Migration deploy run **34779225982** created the additive Generic tables. After PR #113 DB-env repair, PREVIEW **34785048578** and COMMIT **34785370466** established the first prospective Generic cohort on SHA `e54196faf18e2f1287e85e12b613e65afbc27ca2`:

- model: `core_v1_shadow_baseline_v1`
- capture context: `weekly_post_refresh`
- capture run ID: `882cf725-9e83-431e-965d-0e97df2da635`
- games: **57**
- AVAILABLE / UNAVAILABLE: **57 / 0**
- selections / NO_SELECTION: **57 / 0**
- sides: **39 AWAY / 18 HOME**
- market age: **1,011 seconds** (ceiling 1,800)
- providerCalls: **0**
- verificationOk: **true**
- official_flat_100 Bet fingerprint unchanged
- Bet / MatchupOutput / Hybrid / closing / evaluation writes: **false**

This is SHADOW / RESEARCH evidence only. It does not rewrite Hybrid Snapshot V1 and does not make Generic Shadow an Official Card writer. Future Generic COMMITs remain guarded/manual and are **not** blanket-authorized.

### T−30 closing layer

Week 2 T−30 closing evidence is complete:

- legitimate captures: **36**
- legitimate misses: **13**

Canonical workflow:

`.github/workflows/capture-shadow-t30-closing-v1-2026-manual.yml`

Earlier historical production PREVIEW run **34279785108** on SHA `56a13bc4ae24472eac4427614143c8bc1c3ddda4` remains the first T−30 read-path proof. Do not revise frozen Week 2 Hybrid prediction evidence.

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
| `capture-shadow-snapshot-v1-2026-manual.yml` | Prospective Hybrid Shadow prediction PREVIEW/COMMIT | **PROVEN — first 49-game cohort persisted** |
| `capture-shadow-t30-closing-v1-2026-manual.yml` | T−30 closing PREVIEW/COMMIT | **Week 2 complete — 36 captures / 13 misses** |
| `capture-shadow-model-predictions-2026-manual.yml` | Generic multi-model Shadow PREVIEW/COMMIT | **PROVEN / MANUAL_GUARDED / RESEARCH ONLY** — first Week 3 COMMIT proven; future COMMITs not blanket-authorized |
| `audit-prisma-migration-history.yml` | Read-only migration-history audit | MANUAL_SAFE |

No Shadow cron is authorized. No score/grading automation is authorized by this document. Do not infer recurring cadence from a manual workflow being present.

## Not implemented / not authorized

- Shadow ATS evaluation persistence
- Shadow CLV evaluation persistence
- Shadow research ROI persistence
- Shadow prediction automation
- T−30 closing automation
- blanket future Generic Shadow COMMIT authorization / recurring Generic schedule
- Candidate B / WEPA / other research-model adapters
- official Hybrid activation
- Hybrid Bet writes
- Super Tier A production use
- retrospective Shadow backfill
- reconstructing Week 2 Official Card bets (0 persisted; do not invent)

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
