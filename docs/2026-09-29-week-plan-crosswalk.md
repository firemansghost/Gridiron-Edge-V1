# 2026-09-29 Week Plan Crosswalk — Live Track vs Historical Research

**Status:** continuity checkpoint / no authorization changes  
**Repository base:** `fc4d4858f888a0ec822c1725123d8354c4ca3a8b`  
**Purpose:** preserve the September 26 weekend game plan while the historical-research lane continues.

## Weekend operating rule

The weekend plan established two separate tracks:

### LIVE TRACK

Week 5 Core V1 -> usable betting ticket -> prospective shadow observations.

### RESEARCH TRACK

Historical data -> clean backtest framework -> challenger models -> evidence.

Research may earn its way into the live track later.

It must not displace the weekly operating product.

## Weekend Monday finish-line checklist

The weekend plan defined five concrete Monday targets.

### 1. Week 4 fully closed and 0.50 lifecycle transition ready/complete

**Current evidence in repository docs:** NOT VERIFIED COMPLETE.

Current repository documentation still records:

- Week 4 Official Card: **107 persisted `official_flat_100` bets**
- status: **currently ungraded**
- post-Week-4 required chain:
  - Scores PREVIEW -> audit -> COMMIT
  - grade 107 bets
  - TeamGameStat PREVIEW -> audit -> COMMIT
  - lifecycle PREVIEW with `completedThroughWeek=4`
  - audit canonical weight **0.50**
  - lifecycle COMMIT only after explicit authorization

No repository documentation located in this cross-check establishes a completed Week 4
lifecycle COMMIT.

**Continuity status:** LIVE-TRACK BACKLOG / VERIFY BEFORE CLAIMING COMPLETE.

### 2. Week 5 production path established

**Current evidence:** PARTIAL / NOT VERIFIED COMPLETE.

Repository capability exists for normal production workflows.

Candidate B Elo Prior V1 is:

- frozen;
- Generic Shadow allowlisted;
- Week 5+ only;
- per-run COMMIT authorization only.

This cross-check did not locate a documented Week 5 Candidate B Elo prospective COMMIT or
a complete Week 5 production closeout.

**Continuity status:** LIVE-TRACK BACKLOG / VERIFY CURRENT WEEK 5 STATE.

### 3. T-30 scheduler cost/value audit

The weekend plan requested measurement of:

- total workflow executions;
- total GitHub Actions minutes;
- no-op runs;
- market-refresh runs;
- Generic close captures;
- Hybrid close captures;
- meaningful failure/miss detections;
- average runtime;
- useful cycles / total cycles;
- comparison of 5-minute continuous, reduced cadence, and window-aware scheduling.

This cross-check found no completed cost/value analysis in repository continuity docs.

**Continuity status:** OUTSTANDING.

Do not redesign cadence from intuition before measuring.

### 4. Authoritative historical-data inventory

**Status:** SUBSTANTIALLY COMPLETE, WITH SOURCE LIMITATIONS DISCOVERED.

Historical research established durable source evidence for:

- 2022
- 2023
- 2024 observed source season
- 2025 captured but sealed final holdout

The research program then discovered source limitations rather than assuming coverage:

- V1: 2024 input blocked
- V2: alternate advanced-box source rejected
- V3: source-resilient contract frozen

This satisfies the intent of the weekend inventory task more rigorously than the initial
matrix alone.

### 5. Frozen backtest protocol and first research queue

**Status:** COMPLETE / EVOLVED.

The core time-series split remains:

- 2022–2023: development
- 2024: confirmation/validation
- 2025: untouched final holdout
- 2026: prospective evidence, not tuning data

Historical Model Development V1 produced a frozen candidate and one-shot 2023 development
confirmation PASS.

2024 performance remains unobserved.

The research path evolved:

- V1 -> `HISTORICAL_VALIDATION_INPUT_BLOCKED`
- V2 -> `HISTORICAL_V2_SOURCE_EQUIVALENCE_REJECTED`
- V3 -> frozen source-resilient confirmation contract

These pivots are source-integrity responses, not performance tuning.

## Challenger-model ladder crosswalk

The weekend plan proposed:

1. market baseline
2. Core V1
3. Elo challenger
4. roster/talent prior
5. efficiency model
6. drive-based model
7. ensemble only after independent signal

### Current posture

- Market evidence remains evaluation-only and is intentionally excluded from current
  historical predictive construction.
- Core V1 remains the live incumbent.
- Candidate B roster prior exists as prospective shadow research.
- Candidate B Elo Prior V1 exists and is Week 5+ prospective shadow research.
- Historical V1/V3 work is currently the interpretable efficiency/talent/form research
  lane.
- Drive/PBP expansion remains intentionally deferred.
- Ensemble work remains premature.

This preserves the weekend principle:

> simple challengers first; ensemble only after independent signal is demonstrated.

## Research scoring crosswalk

The weekend plan listed broader eventual model evaluation:

- margin MAE;
- market error;
- ATS;
- ROI;
- CLV;
- edge buckets;
- stability;
- splits;
- drawdown;
- bet count;
- untouched-season survival.

The historical V1/V2/V3 confirmation contracts intentionally narrowed the **pre-holdout
model gate** to margin prediction only:

- prediction count;
- MAE;
- RMSE;
- mean error;
- median absolute error;
- descriptive R-squared.

Market/ATS/ROI/CLV are deferred until predictive integrity is established.

This is a deliberate sequencing change, not a forgotten requirement.

The broader evaluation list remains future research work after a model clears the
source/prediction gate.

## Current highest-priority research sequence

After PR #201 merged:

1. implement Historical Model V3 + V1 backward-compatibility capability offline;
2. implement 2024 source-resilient predictive-input builder offline;
3. implement same-endpoint qualification/recovery capability;
4. implement baseline freezer + pre-score manifest + one-shot scorer capability;
5. merge/audit capability slices;
6. separately authorize <=11 CFBD same-endpoint qualification/recovery run;
7. audit recovered/unresolved source history;
8. build/freeze V3 candidate and 2024 predictive inputs;
9. separately authorize one 2024 V3 confirmation score;
10. only after audited PASS design 2025 Final Holdout contract.

## Explicit items not to lose

### Live-track backlog

- verify/complete Week 4 score/grading closeout;
- verify/complete Week 4 TeamGameStat;
- verify/complete Core V1 0.50 lifecycle transition;
- establish/verify Week 5 production state;
- obtain first legitimate Week 5 Candidate B Elo prospective observation if still due;
- perform T-30 Actions cost/value audit;
- preserve betting-day product goal: short BET / WATCH / PASS ticket with pricing ranges.

### Research backlog after V3 confirmation

- broader market baseline comparison;
- ATS/ROI where legitimate market evidence exists;
- CLV evaluation;
- stability/split diagnostics;
- drawdown/losing-streak analysis;
- challenger comparison;
- drive-based research only if justified;
- ensemble only after independent signal is established.

## Boundary

This crosswalk changes no production or research authorization.

It exists so the historical-research pivot cannot erase the original weekly-product
goals.
