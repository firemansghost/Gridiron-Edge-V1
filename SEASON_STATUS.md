# Season Status — Gridiron Edge

**Status:** 2026 season active — manual guarded production
**Updated:** 2026-09-25 America/Chicago
**Evidence-producing runtime baseline:** `653eb9d1826954bb3ea6d1eaedb10b41739000eb`
**Official production spread model:** Core V1 / `official_flat_100`
**Hybrid V2:** SHADOW / HELD / NOT OFFICIAL
**Candidate B V1:** SHADOW / RESEARCH ONLY / NOT OFFICIAL

This file is the operator-facing current-state document. Detailed September 8 Phase 4B evidence is in [`docs/2026-09-08-phase4b-closeout.md`](docs/2026-09-08-phase4b-closeout.md). Current workflow authorization is in [`docs/2026-workflow-reactivation-matrix.md`](docs/2026-workflow-reactivation-matrix.md). Generic multi-model Shadow capture notes are in [`docs/SHADOW_MODEL_CAPTURE_V1.md`](docs/SHADOW_MODEL_CAPTURE_V1.md). Candidate B first prospective cohort evidence is in [`docs/2026-09-16-candidate-b-v1-first-prospective-closeout.md`](docs/2026-09-16-candidate-b-v1-first-prospective-closeout.md). Current Week 4 Shadow / T-30 evidence and automation proof is in [`docs/2026-09-25-week4-shadow-t30-closeout.md`](docs/2026-09-25-week4-shadow-t30-closeout.md).

The prior long-form phase archaeology remains available in Git history at the exact pre-closeout baseline:

`git show 56a13bc4ae24472eac4427614143c8bc1c3ddda4:SEASON_STATUS.md`

This consolidation intentionally removes stale historical sections from the live operator document; it does not erase or revise those historical decisions.

---

## CURRENT STATE — 2026-09-25

The project is **not** globally blocked. Core V1 remains the only official spread model. Hybrid V2 remains **SHADOW / HELD / NOT OFFICIAL**; Hybrid Super Tier A remains **SHADOW / HELD**. Candidate B and V4 remain research-only.

Week 4 has **58 games** and **107** persisted `official_flat_100` Bet rows, currently ungraded. TeamGameStat evidence is complete through Week 3 (**314 / 314** participant rows with EPA), and the frozen Candidate A / `GLOBAL_BLEND_W3_W6` lifecycle is at the completed-Week-3 checkpoint (**0.25**); after completed Week 4 the canonical weight becomes **0.50**.

Prospective Week 4 research evidence is frozen for Core V1, Candidate B roster prior, V4 prospective V1, and Hybrid Snapshot V1. The verified Week 4 Hybrid cohort contains **58** snapshots (**57 AVAILABLE / 1 UNAVAILABLE**) with **8** Super Tier A research qualifiers and exact provenance to V4 run `149e59c2-801a-4535-bfc0-1b2d2f4a5198`.

Generic T-30 closing automation is active through the proven Supabase external clock. For Week 4 only, the same coordinator now runs the existing Hybrid T-30 closing writer as Stage E after the Generic Stage C/D cycle. Live proof run **36148638315** passed on `653eb9d1826954bb3ea6d1eaedb10b41739000eb`: Stage E enabled, `writeSafe=true`, providerCalls=0, 57 future / 0 due / 1 legitimate missed game, zero mutations, and verification passed. Advancing the active week away from 4 automatically disables Hybrid Stage E.

No additional Week 4 prediction cohorts should be created. No Hybrid/Candidate B/V4 evidence changes official model status.

### Season posture

| Item | Current state |
|---|---|
| Season | **2026 active** |
| Official spread model | **Core V1** / `official_flat_100` |
| Hybrid V2 | **SHADOW / HELD / NOT OFFICIAL** |
| Hybrid Super Tier A | **SHADOW / HELD**; no production use |
| V4 prospective V1 | **SHADOW / RESEARCH ONLY**; Week 4 prospective cohort frozen |
| Core V1 lifecycle | Candidate A / `GLOBAL_BLEND_W3_W6`; completed Week 3 checkpoint **0.25**; next canonical weight after completed Week 4 = **0.50** |
| Week 1 | **CLOSED** — 51/51 games final; 98/98 official bets graded |
| Week 2 | **CLOSED scores** — **49/49 final**; Official Card **0 Bets** (do not reconstruct) |
| Week 2 Hybrid Shadow prediction cohort | **49** persisted |
| Week 2 T−30 closing | **36 legitimate captures / 13 legitimate misses** |
| Week 3 schedule | **57 games** |
| Week 3 Live Odds (current after COMMIT **35127135613**) | **9,404** MarketLine rows; requested-week matched **57/57**; unmatched_both_fbs **0**; unresolved_expected_fbs **0** |
| Week 4 Official Card | **107** persisted `official_flat_100` Bet rows; currently ungraded |
| 2026 TeamUnitGrades | **COMPLETE / PRODUCTION-PROVEN — 138/138** |
| Phase 4B Hybrid prediction capture | **PROVEN**; Week 4 V4-backed 58-game cohort frozen and independently verified |
| Phase 4B T−30 closing | Week 2 historical closeout **36 / 13**; Generic Week 4 automation active; Hybrid Week 4 Stage E live-proven |
| Phase 4B ATS / CLV / evaluation | Generic `CORE_EVAL_V1` **read-only evaluator implemented**; evaluation persistence remains **NOT AUTHORIZED** |
| Generic Shadow allowlist | Core V1 + Candidate B roster prior + Candidate B Elo Prior (Week 5+) + V4 prospective (Week 4 pinned); COMMIT remains model/week guarded |
| Generic Core V1 Shadow | **FIRST WEEK 3 PRODUCTION COMMIT PROVEN** (research-only / additive; run **34785370466**) |
| Candidate B V1 Generic Shadow | **IMPLEMENTED + FIRST PROSPECTIVE COMMIT PROVEN AND FROZEN**; SHADOW / RESEARCH ONLY; future COMMITs **per-run authorization only** |
| Candidate B Week 3 cohort | **FROZEN / DO NOT REPLACE** — run **35128215811**; UUID `74234d87-bb32-47c6-927b-6de3d24cfc88` |
| Generic T−30 automation | **ACTIVE / PROVEN** via Supabase external clock; prediction automation remains unauthorized |
| Recurring production schedules | Generic T−30 external clock active; Week 4 Hybrid closing inherits that gate only; other recurring production schedules remain stopped unless separately authorized |

## Verified production snapshot

Historical September 8 verification remains valid for Week 1 / TeamUnitGrades / first Hybrid Shadow cohort. September 13 Generic Core Shadow proof remains valid. September 16 operator truth:

| Metric | Value |
|---|---:|
| Week 2 Game rows final | **49 / 49** |
| Week 2 Official Card bets | **0** (do not reconstruct) |
| Week 2 Hybrid Shadow predictions | **49** |
| Week 2 T−30 captures / misses | **36 / 13** |
| Week 3 scheduled games | **57** |
| Week 3 Live Odds rows after COMMIT **35127135613** (current) | **9,404** |
| Week 3 Live Odds inserted by that COMMIT | **2,618** |
| Week 3 requested-week match after that COMMIT | **57 / 57** |
| Week 3 official bets written | **0** |
| Generic Shadow migration deploy | **34779225982** |
| Generic Core Shadow first capture run | `882cf725-9e83-431e-965d-0e97df2da635` |
| Generic Core Shadow Week 3 predictions | **57** (AVAILABLE **57** / UNAVAILABLE **0**; selections **57** / NO_SELECTION **0**) |
| Candidate B first PREVIEW | **35123647114** (zero persisted prediction rows) |
| Candidate B first COMMIT | **35128215811** |
| Candidate B first capture run | `74234d87-bb32-47c6-927b-6de3d24cfc88` |
| Candidate B Week 3 predictions | **57** (AVAILABLE **35** / UNAVAILABLE **22**; selections **34** / NO_SELECTION **1**) |
| Week 4 scheduled games | **58** |
| Week 4 official Core bets | **107**, currently ungraded |
| TeamGameStat through Week 3 | **314 / 314** EPA-complete participant rows |
| Week 4 V4 prospective run | `149e59c2-801a-4535-bfc0-1b2d2f4a5198` — **57 / 58 AVAILABLE** |
| Week 4 Hybrid run | `86505023-0ba6-4838-bbd6-21091c73057f` — **57 / 58 AVAILABLE; 8 Super Tier A** |
| Hybrid idempotent verification | run **36146124407** — existing COMPLETE cohort unchanged |
| Generic T-30 external clock | **ACTIVE / PROVEN** |
| Week 4 Hybrid T-30 Stage E proof | run **36148638315** — enabled, providerCalls=0, zero mutation before first due window |

Historical Week 3 Live Odds states that are **not** current:

- before the Sep 13 refresh: **469 rows / 46 games**
- after Sep 13 COMMIT **34784597710**: **4,171** rows (spread/total 57/57; ML 53/57)

Do not describe **4,171** as the current Week 3 MarketLine count after the Sep 16 refresh.


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

## Week 3 live market — Sep 13 historical refresh

Fresh Live Odds PREVIEW **34784449263** and COMMIT **34784597710** on then-current evidence-producing runtime SHA `e54196faf18e2f1287e85e12b613e65afbc27ca2`:

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

Earlier historical Week 3 Live Odds state before this refresh was **469 rows / 46 games**. The Sep 13 **4,171** total is **not** current after the Sep 16 refresh below.

Market refresh complete does **not** by itself mean the Official Card has been rewritten. Official Card work remains a separate guarded operator step. No Week 3 official bets have been written.

## Week 3 live market — Sep 16 current checkpoint

A failed Live Odds Week 3 COMMIT **35048532226** fail-closed on `unmatched_both_fbs` after legacy substring resolution mapped **East Texas A&M Lions** → `texas-a-m`. `writeSafe=false`; no production persistence; no DB mutation. PR #130 repaired the identity layer rather than weakening the blocker.

Post-repair COMMIT **35120508141** matched **57 / 57** requested-week games (`unmatched_both_fbs=0`; `unresolved_expected_fbs=0`; `providerCalls=1`; **2,615** rows inserted; post-write verification passed). That refresh supported the Candidate B PREVIEW gate.

Current Week 3 Live Odds checkpoint is COMMIT **35127135613** on SHA `60e5735c820dbd53e3f07de28d5c4c44b8f46b38`, captured immediately before the first Candidate B COMMIT because Generic Shadow itself is `providerCalls=0`:

- scheduled games: **57**
- matched requested-week: **57**
- out-of-scope FBS/FCS: **17**
- outside requested week: **1**
- unmatched_both_fbs: **0**
- unresolved_expected_fbs: **0**
- ambiguous / fuzzy-required: **0 / 0**
- writeSafe: **true**
- providerCalls: **1**
- Odds API credits: **3**
- rows proposed / inserted: **2,618 / 2,618**
- postWriteVerificationSucceeded: **true**
- Week 3 MarketLine total after write: **9,404**

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

### Candidate B V1 Generic Shadow — first Week 3 prospective research cohort

Candidate B remains **SHADOW / RESEARCH ONLY / NOT OFFICIAL**. Implementation sequence: adapter contract PR #127, implementation PR #128, PREVIEW enablement PR #129, Live Odds identity repair PR #130, COMMIT-path enablement PR #131. PR #131 enabled the guarded technical path; it did **not** itself authorize a production run.

Frozen feature basis: snapshotHash `0332e24f97c891fd6431280fa7939c467c614714abe207eeb3dc89d466eb1148` (138 rows; 103 complete / 35 unavailable). Runtime pins that exact snapshot. Do not rerun, update, or delete it.

Independent PREVIEW **35123647114** on SHA `611bb4c13663e6b49b648ef9333797461a493ca5`:

- model: `candidate_b_roster_prior_v1`
- capture context: `candidate_b_w3_first_observation`
- games: **57**
- AVAILABLE / UNAVAILABLE: **35 / 22**
- selections / NO_SELECTION: **34 / 1**
- all 22 unavailable: `team_feature_vector_unavailable`
- unexpected market/runtime reasons: **0**
- providerCalls: **0**
- mutationsInvoked: **false**
- PREVIEW wrote **zero** Shadow prediction rows

Separately authorized COMMIT **35128215811** on SHA `60e5735c820dbd53e3f07de28d5c4c44b8f46b38`:

- exact confirmation: `CAPTURE_2026_WEEK_3_SHADOW_MODEL_candidate_b_roster_prior_v1`
- capture run UUID: `74234d87-bb32-47c6-927b-6de3d24cfc88`
- prediction timestamp: `2026-09-16T17:27:24Z`
- selected market timestamp: `2026-09-16T17:16:34Z`
- market age: **651 seconds** (ceiling 1,800)
- games persisted: **57**
- AVAILABLE / UNAVAILABLE: **35 / 22**
- selections / NO_SELECTION: **34 / 1**
- sides: **21 AWAY / 13 HOME**
- all 22 unavailable: `team_feature_vector_unavailable`
- providerCalls: **0**
- verificationOk: **true**
- writes: `ShadowModelCaptureRun` + `ShadowModelPrediction` only
- Bet / MatchupOutput / Official Card / Hybrid / closing / evaluation / feature-snapshot writes: **false**

The North Carolina @ Clemson NO_SELECTION is legitimate frozen-floor behavior (edge 0.0876 < 0.1). This cohort is **frozen evidence**. Do not rerun, replace, delete, overwrite, or backdate it. Full ledger: [`docs/2026-09-16-candidate-b-v1-first-prospective-closeout.md`](docs/2026-09-16-candidate-b-v1-first-prospective-closeout.md).

Candidate B success proves evidence plumbing and establishes prospective research data. It does **not** prove predictive superiority and does **not** change Core V1 official status. Future Candidate B prediction COMMITs require separate current operator authorization. No recurring Shadow **prediction** schedule is authorized.

### T−30 closing layer

Current recurring clock authority is **Supabase external**. The Generic coordinator is active every five minutes and preserves the frozen Stage C T-45..T-35 refresh window plus Stage D T-30 closing semantics. During Week 4 only, Stage E invokes the existing Hybrid closing writer after Stage D; moving the active week away from 4 disables Stage E automatically.

Week 4 live proof: **36148638315**. Full current evidence: [`docs/2026-09-25-week4-shadow-t30-closeout.md`](docs/2026-09-25-week4-shadow-t30-closeout.md).

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
| `cfbd-team-game-stats-2026-manual.yml` | TeamGameStat / lifecycle EPA feed | **PROVEN through Week 3 — 314/314 EPA-complete participant rows**; Week 4 runs after games complete |
| `write-core-v1-lifecycle-ratings.yml` | Core V1 lifecycle ratings | Guarded; completed Week 3 canonical weight **0.25**; after completed Week 4 next canonical weight **0.50** |
| `audit-2026-unit-grade-source-readiness.yml` | Unit-grade source/readiness audit | **PROVEN** |
| `write-cfbd-unit-grade-sources-2026-manual.yml` | Same-season unit-grade source PREVIEW/COMMIT | **PROVEN** |
| `preview-team-unit-grades-2026-manual.yml` | Read-only TeamUnitGrades planner | **PROVEN** |
| `write-team-unit-grades-2026-manual.yml` | Guarded TeamUnitGrades PREVIEW/COMMIT | **PROVEN — 138/138 persisted** |
| `capture-shadow-snapshot-v1-2026-manual.yml` | Prospective Hybrid Shadow prediction PREVIEW/COMMIT | **PROVEN — Week 4 V4-backed 58-game cohort frozen / verified** |
| `capture-shadow-t30-closing-v1-2026-manual.yml` | Hybrid Snapshot V1 T−30 PREVIEW/COMMIT | **PROVEN**; retained as manual fallback; Week 4 also protected by gated Stage E |
| `capture-shadow-model-predictions-2026-manual.yml` | Generic multi-model Shadow PREVIEW/COMMIT | **PROVEN / MANUAL_GUARDED / RESEARCH ONLY / PER-RUN AUTHORIZATION** — Core + Candidate B allowlisted; first Core Week 3 COMMIT proven; first Candidate B Week 3 COMMIT proven and frozen; future COMMITs not blanket-authorized |
| `run-generic-shadow-t30-automation-v1-scheduled-2026.yml` | External-clock Generic T−30 coordinator + Week 4 Hybrid Stage E | **ACTIVE / PROVEN**; Supabase is sole recurring clock; Stage E auto-disables when active week != 4 |
| `audit-prisma-migration-history.yml` | Read-only migration-history audit | MANUAL_SAFE |

Generic T−30 recurring automation is authorized and active through the Supabase external clock. Week 4 Hybrid closing Stage E inherits that active gate only while the configured week equals 4. No score/grading automation or recurring prediction capture is authorized.

## Not implemented / not authorized

- Shadow ATS evaluation persistence
- Shadow CLV evaluation persistence
- Shadow research ROI persistence
- Shadow prediction automation
- future-week Hybrid T−30 automation beyond the explicit Week 4 scope
- blanket future Generic Shadow prediction COMMIT authorization / recurring Generic prediction schedule
- WEPA / PassMatch / Totals V2 / Portal / ensemble adapters
- official Hybrid activation
- Hybrid Bet writes
- Super Tier A production use
- retrospective Shadow backfill
- replacing or rerunning the frozen Candidate B Week 3 cohort
- reconstructing Week 2 Official Card bets (0 persisted; do not invent)
- Candidate B promotion / official use

## Deferred maintenance — separate workstreams

These are real issues but are **not** blockers for current Week 4 operations:

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
- Candidate B research-only status
- `CORE_EVAL_V1`
- 30-minute prediction freshness rule
- kickoff-minus-30-minute closing rule
- Candidate A / `GLOBAL_BLEND_W3_W6` lifecycle policy
- provider pricing/cadence
- official card selections
- production workflow schedules
- any production database row
- the frozen Candidate B Week 3 prospective cohort

## Historical archaeology

The previous `SEASON_STATUS.md` contained the detailed preseason-through-September-4 chronology. It remains immutable in Git history at:

`56a13bc4ae24472eac4427614143c8bc1c3ddda4`

Use that version when researching old phase decisions. Use **this** version for current operator guidance.
