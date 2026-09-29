# 2026-09-29 Week Plan Crosswalk — Reconciled Live Track vs Historical Research

**Status:** RECONCILED / live backlog refreshed from GitHub Actions + production DB evidence  
**Reconciliation base:** `c8587a8157af0993a41a66e14117ecfb7c34f2be`  
**Detailed live audit:** `docs/2026-09-29-live-track-reconciliation-t30-audit.md`  
**Week 5 T-30 activation:** `docs/2026-09-29-week5-t30-window-gated-activation.md`

## Operating rule

The project still has two separate tracks:

### LIVE TRACK

Core V1 weekly production -> usable betting ticket -> prospective shadow observations.

### RESEARCH TRACK

Historical data -> controlled challenger evaluation -> evidence.

Research may inform the live track later. It must not silently rewrite the weekly
production model or displace the betting-day product.

## September 29 finish-line reconciliation

### 1. Week 4 fully closed and 0.50 lifecycle transition

**Status: COMPLETE / VERIFIED.**

Scores:

- 58 / 58 Week 4 games final;
- PREVIEW `36352798068`;
- COMMIT `36353220075`;
- 58 game rows updated.

Official Core card:

- 107 / 107 bets graded;
- record: **34-70-3**;
- stake: **$10,700**;
- PnL: **-$3,330.1447138820751**;
- ROI: **-31.1228%**;
- grading PREVIEW `36359119653`;
- grading COMMIT `36359432340`.

TeamGameStat:

- Week 4: **116 / 116** EPA-complete participant rows;
- cumulative through Week 4: **430 / 430**;
- PREVIEW `36359708847`;
- COMMIT `36360246463`.

Lifecycle:

- policy: `GLOBAL_BLEND_W3_W6`;
- completedThroughWeek: **4**;
- canonical weight: **0.5000**;
- expected/actual EPA participant rows: **430 / 430**;
- persisted Core V1 ratings: **138 / 138**;
- PREVIEW `36360695897`;
- COMMIT `36361081446`.

### 2. Week 5 production path

**Status: ESTABLISHED / VERIFIED.**

Current production state:

- scheduled games: **56**;
- market coverage: **56 / 56 games**;
- MarketLine rows: **8,406** after the Sep 29 fresh-odds COMMIT;
- official Core V1 bets: **96**;
- official stake: **$9,600**;
- first kickoff: `2026-10-02 00:00 UTC`.

Candidate B Elo Prior V1 first prospective Week 5 observation is complete:

- model: `candidate_b_elo_prior_v1`;
- context: `week5_elo_first_prospective_observation`;
- UUID: `396e8213-7317-4678-b9b2-a982d2d487ed`;
- status: COMPLETE;
- total / available: **56 / 56**;
- selections: **56**.

Do not create a replacement "first" observation.

### 3. T-30 scheduler cost/value audit

**Status: COMPLETE / WINDOW-GATED WEEK 5 ACTIVATION LIVE / OUT-OF-WINDOW PROVEN.**

Recurring Supabase clock history:

- first tick: `2026-09-22 16:32 UTC`;
- last tick: `2026-09-28 13:07 UTC`;
- ticks: **1,688**;
- successful Supabase dispatch executions: **1,688 / 1,688**;
- historical audit-end cron state: **active=false**;
- current Week 5 cron state after optimized activation: **active=true**.

Coordinator interval:

- **1,704** total GitHub workflow executions;
- **1,688** external-clock dispatches;
- **15** recovered native-GitHub schedule executions before native schedule removal;
- **1** off-grid manual/live-proof execution.

Observed useful recurring activity:

- external market-refresh cycles: **19**;
- Generic closing-write cycles: **17**;
- one meaningful transient DB-connectivity failure;
- external useful/failure-signal cycles: **37 / 1,688 = 2.19%**;
- external no-op cycles: **1,651 / 1,688 = 97.81%**.

Closing evidence:

- Generic T-30 rows: **174 AVAILABLE**;
- Hybrid Week 4 rows: **57 AVAILABLE**;
- one legitimate Hybrid pre-cohort miss remains unfilled.

Runtime proxy:

- 90-run no-op sample average: **59.79 sec**;
- projected external runner time: **~1,682 minutes / ~28.0 hours**;
- this is an engineering runtime estimate, not billing-grade GitHub usage.

Implemented recommendation:

- blind 10/15-minute cadence rejected;
- five-minute Supabase phase preserved;
- GitHub dispatch gated to **20–55 minutes before kickoff**;
- active week moved to version-controlled Week 5 config because both automation credentials correctly lacked GitHub repository-variable settings permission;
- Hybrid Stage E remains disabled for Week 5.

Week 4 replay:

- continuous: **1,688** external dispatches;
- 25–50 minute gate: **85**;
- 20–55 minute safety gate: **114**.

Week 5 simulation, aligned to the actual cron phase (`:02/:07/:12/...`):

- 25–50 minute gate: **95**;
- 20–55 minute gate: **123**.

The wider 20–55 band still removes >93% of Week 4 dispatch overhead while retaining
extra timing safety.

Week 5 explicit proof run **36614235554** passed with Week 5 loaded from version control, providerCalls=0, zero mutations, and Hybrid Stage E disabled. The first live post-reactivation Supabase tick, run **1689** at `2026-09-29 18:52 UTC`, succeeded with **`0 rows`** and created no GitHub coordinator run. Out-of-window suppression is therefore live-proven. The first legitimate in-window Week 5 dispatch remains pending.

### 4. Authoritative historical-data inventory

**Status: COMPLETE FOR THE V1/V2/V3 PROGRAM.**

The historical program established:

- 2022–2023 development evidence;
- 2024 source-informed confirmation evidence;
- 2025 sealed source artifact;
- 2026 prospective-only boundary.

Source-integrity outcomes:

- V1 -> `HISTORICAL_VALIDATION_INPUT_BLOCKED`;
- V2 -> `HISTORICAL_V2_SOURCE_EQUIVALENCE_REJECTED`;
- V3 -> source-resilient candidate with exact development backcompat.

### 5. Frozen backtest protocol / historical result

**Status: CURRENT PROGRAM CLOSED AT A VALID SOURCE BLOCK.**

2024 V3 confirmation:

- status: `HISTORICAL_V3_CONFIRMATION_PASS`;
- games: **752 / 752**;
- V3 MAE: **13.0513901417**;
- Elo + HFA MAE: **13.3118215052**;
- HFA-only MAE: **15.9022103243**;
- V3 RMSE: **16.6117675026**;
- Elo + HFA RMSE: **16.7387117980**.

2025 Final Holdout V1:

- status: `HISTORICAL_FINAL_HOLDOUT_INPUT_BLOCKED`;
- canonical games: **762**;
- canonical teams: **136**;
- blockers:
  - Air Force required talent unavailable;
  - Navy required talent unavailable;
  - UNLV Week 1 required preseason Elo unavailable.

No 2025 model prediction or performance metric was produced.

2025 model performance therefore remains unobserved.

Do not repair Final Holdout V1 in place. Any future historical continuation requires a
new versioned model/source contract that acknowledges the observed 2025 source
availability facts.

## Challenger-model ladder

Current posture remains:

- Core V1: official live incumbent;
- Candidate B roster prior: prospective shadow research;
- Candidate B Elo Prior V1: Week 5+ prospective shadow research, first Week 5 cohort now frozen;
- V4 prospective: research-only;
- Hybrid V2 / Super Tier A: shadow/held;
- historical V3: passed 2024 but final holdout V1 source-blocked;
- drive/PBP expansion: deferred;
- ensemble: premature until independent signal is established.

The principle remains:

> simple challengers first; ensemble only after independent signal is demonstrated.

## Remaining live-track backlog

The original live verification backlog is now closed through out-of-window T-30 activation proof.

Remaining live priorities:

1. use the live Betting Ticket operator hierarchy:
   - **7 Primary**
   - **12 Secondary**
   - **2 same-game Alternates**
   - WATCH and PASS remain separate price/actionability states;
2. verify the first natural Betting Ticket odds-refresh operator-clock tick;
3. audit the **first in-window Week 5 T-30 dispatch** when the first real target window arrives;
4. keep Hybrid Stage E disabled for Week 5 unless separately reviewed;
5. add Barnes / Crick only as a separate operator overlay after their picks arrive.

The betting-day product goal is now implemented: short BET / WATCH / PASS, explicit
playable-to ranges, fresh-market protection, and a compressed Primary / Secondary card.

## Betting Ticket operator checkpoint

**Status: LIVE / PRIORITY CARD + SMART REFRESH ACTIVE.**

Production ticket:

- official wagers: **96**
- BET NOW: **21**
- WATCH: **43**
- PASS / NO CHASE: **32**
- Primary Card: **7**
- Secondary Plays: **12**
- same-game Alternates: **2**

Freshness service:

- Betting Ticket display stale gate: **180 minutes**
- refresh planner stale threshold: **150 minutes**
- final-hour T-30 handoff: **60 minutes**
- proof run: **36629755387**
- proof outcome: **BOARD_FRESH**
- provider calls: **0**
- inserted rows: **0**
- artifact: **11061657135**
- artifact SHA:
  `f2813031e59716af30e55c10f379b4ad701df6a828035cb619189c07777ae170`
- Supabase job **2**:
  `betting-ticket-odds-refresh-github-dispatch-v1`
- active: **true**

Primary / Secondary / Alternate is an operator-priority overlay only. It does not alter
Core V1 grades, official flat stakes, or model status.

## Research backlog

Do not restart 2025 Final Holdout V1.

Future research, only if justified, may include:

- a separately versioned source-resilient historical contract;
- market-baseline comparison where legitimate evidence exists;
- ATS/ROI/CLV evaluation;
- stability/split diagnostics;
- drawdown/losing-streak analysis;
- challenger comparison;
- drive-based research;
- ensemble work only after independent signal is demonstrated.

## Security maintenance item

Live-state verification surfaced a separate Supabase advisory:

- **41 public-schema tables currently have RLS disabled**.

Do not flip RLS on globally. A safe remediation requires:

1. access inventory;
2. policy design;
3. non-production testing;
4. guarded rollout;
5. application/service-role verification.

This is a security workstream, not a Week 5 model change.

## Boundary

This crosswalk records verified state and recommendations.

It does not:

- broaden the T-30 timing semantics beyond the proven 20–55 minute dispatch gate;
- authorize Hybrid Week 5 closing automation;
- authorize model promotion;
- authorize historical 2025 scoring;
- change Core V1 formula/policy.
