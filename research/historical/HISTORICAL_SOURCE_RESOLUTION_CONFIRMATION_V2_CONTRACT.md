# Historical Source Resolution & Confirmation V2 — Contract

**Status:** FROZEN DESIGN — NO V2 PROVIDER RUN / NO 2024 MODEL SCORE YET  
**Prior V1 status:** `HISTORICAL_VALIDATION_INPUT_BLOCKED`  
**Development seasons:** 2022–2023  
**Observed source season:** 2024  
**Final holdout:** 2025 — locked  
**Does not authorize:** provider calls, 2024 outcome scoring, 2025 access, production deployment, database persistence, market evaluation, or model promotion

## Purpose

Historical Source Resolution & Confirmation V2 exists because Historical Validation V1
stopped correctly before scoring.

V1 was input-blocked by source/missingness constraints that became visible only after the
first 2024 snapshot was captured and independently audited.

V2 must therefore acknowledge two facts simultaneously:

1. 2024 **source characteristics are now observed** and may inform a new generic source
   and missingness contract.
2. 2024 **model-performance evidence remains unobserved** because the frozen V1 candidate
   was never legally scored.

V2 is not allowed to pretend that 2024 is still a pristine source-blind validation season.

Its role is:

> define a generic source-resolution and model-missingness version using only
> 2022–2023 model-development evidence plus already-observed 2024 source-availability
> facts, then permit at most one source-informed 2024 confirmation score.

2025 remains the later final holdout and must not influence V2 design.

## Frozen V1 evidence

### Development candidate

Historical Model Development V1 remains immutable:

- model: `historical_ridge_margin_v1`
- lambda: **100**
- development artifact ID: `11002393824`
- development ZIP SHA-256:
  `bb0a9233c4de18c317b35d13cc6bacefadc4e359fe4de8e52addad3ec523e313`
- candidate payload SHA-256:
  `8c6f1d053ff85e401f8acda5cba9ace7f54e5aaee6d9b46117a3c4dd690f1a53`
- Stage A selection SHA-256:
  `bcc28dbc02b177690136f192bd71f16110a3d05319c91d67ef5e6888f90c5858`

V1 remains research evidence and is not modified in place.

### 2024 source artifact

The observed 2024 source artifact is:

- run: `36508377627`
- source SHA:
  `e1b27f6c5681f6ab4f8d24e50f88e387c64657a7`
- artifact ID: `11008470975`
- artifact name:
  `historical-research-snapshot-v1-2024-36508377627`
- ZIP SHA-256:
  `b41e934b26952100e7e056a56114dc81df6bbe77f5c787f28b75b646ae7ea544`

Independent audit found:

- 28 / 28 CFBD calls succeeded;
- zero DB reads/writes;
- exact manifest/hash integrity;
- 752 completed canonical regular-season FBS-vs-FBS games;
- 134 canonical teams.

The V1 audit is recorded in:

`docs/2026-09-29-historical-validation-v1-input-blocked-audit.md`

## Known 2024 source facts allowed to influence V2

V2 may acknowledge only source-availability / schema facts already observed.

### Advanced-game gaps

The bulk `/stats/game/advanced` response omitted four completed canonical games:

- `401641034` — New Mexico State @ Sam Houston — Week 4
- `401645328` — Rice @ Army — Week 4
- `401644689` — Kent State @ Miami (OH) — Week 12
- `401644780` — Eastern Michigan @ Western Michigan — Week 14

### PPA-sidecar gaps

The `/ppa/games` response omitted three completed canonical games:

- `401641034`
- `401644689`
- `401644780`

### Static-prior gaps

2024 Feature V1 source coverage exposed:

- talent: 134/134;
- preseason Elo: 134/134;
- returning production: 133/134, missing Kennesaw State;
- recruiting Y0 / 2024: 134/134;
- recruiting Y1 / 2023: 134/134;
- recruiting Y2 / 2022: 132/134, missing Florida International and Kennesaw State;
- recruiting Y3 / 2021: 134/134.

These facts may motivate **generic** source/missingness rules.

They may not justify team-name-specific exceptions.

## What 2024 evidence remains prohibited for V2 design

Do not use:

- 2024 prediction residuals;
- 2024 candidate MAE/RMSE;
- 2024 baseline comparison;
- ATS/CLV/ROI;
- sportsbook lines;
- market prices;
- game-by-game model winners/losers;
- error-driven game exclusions.

The V2 contract must be frozen before any 2024 model score is produced.

## V2 architecture

V2 consists of four separately gated stages:

1. **Source equivalence qualification**
2. **Model V2 construction and backward-compatibility audit**
3. **2024 V2 feature/input freeze**
4. **One-shot source-informed 2024 confirmation**

Each stage must complete and be independently audited before the next stage may execute.

## Stage 1 — Source equivalence qualification

### Candidate fallback endpoint

Current CFBD documentation exposes:

`GET /game/box/advanced?id=<gameId>`

as a game-ID advanced-box-score endpoint.

V2 does **not** assume that this endpoint is semantically interchangeable with
`/stats/game/advanced`.

A provider qualification run is required before it may be used as a fallback.

### Authorization boundary

Merging this contract does **not** authorize provider calls.

A later source-equivalence capability must be reviewed and merged first.

The provider qualification run then requires a separate explicit user authorization.

### Calibration universe

Qualification uses **2022–2023 only**.

Do not calibrate equivalence on the four known 2024 missing games.

The calibration cohort is deterministic and outcome-independent.

For each development season, select the lowest positive canonical game ID from each of
these provider-week buckets when available:

- Week 1;
- Week 6;
- Week 12;
- the season's final observed regular-season provider week.

This yields at most **8 calibration games**.

Selection uses only accepted development-corpus game identity.

Do not choose games based on score, model residual, market line, team strength, or data
agreement.

### Provider-call budget

A combined qualification/recovery workflow may make at most **12** CFBD calls:

- up to 8 development calibration calls;
- exactly 4 2024 recovery calls, but only if calibration passes.

If calibration fails, the workflow must stop before any 2024 recovery call.

### Raw evidence

Every response must be stored as exact provider bytes before parsing.

Record:

- endpoint;
- game ID;
- HTTP status;
- byte count;
- SHA-256;
- returned team identities;
- schema fields used for equivalence.

### Required semantic fields

Fallback qualification is relevant only if the game-ID response provides team-level
values semantically corresponding to the four fields used by the frozen historical
form feature family:

- offensive PPA/EPA-per-play equivalent;
- defensive PPA/EPA-per-play equivalent;
- offensive success rate;
- defensive success rate.

The response must also provide enough exact game/team identity to bind both teams
without fuzzy matching.

### Candidate pairing rule

If the endpoint reports each team's offensive efficiency and success rate rather than
explicit offense/defense objects, V2 may construct a candidate team row only as:

- team offense metric = that team's reported offensive value;
- team defense metric = opponent's reported offensive value;
- team offense success = that team's reported success value;
- team defense success = opponent's reported success value.

This pairing rule is only a **candidate mapping** until equivalence passes.

### Equivalence gate

For every calibration game and both team sides:

- exact game identity must match;
- exact provider team identity must match;
- all four selected metrics must be finite in both source families.

Compare the candidate fallback row with the accepted bulk advanced row.

Maximum allowed absolute difference per scalar:

`1e-9`

No scaling, rounding, sign flip, regression, offset, or fitted transformation is allowed.

Qualification passes only if **every compared scalar** is within tolerance.

If any comparison fails, status:

`HISTORICAL_V2_SOURCE_EQUIVALENCE_REJECTED`

Then:

- do not call the four 2024 fallback games;
- do not build V2 2024 features;
- do not score 2024;
- keep 2025 locked.

### 2024 recovery rule

Only after equivalence passes may the workflow call the four exact missing 2024 game IDs.

Fallback is allowed only where the bulk advanced source has **no row** for that exact
canonical game/team.

Fallback must never replace an existing bulk advanced row.

Every recovered row records source provenance:

`ADVANCED_BOX_EQUIVALENT_FALLBACK`

Existing bulk rows retain:

`BULK_ADVANCED_PRIMARY`

If any of the four 2024 games still lacks two complete equivalent team rows, V2 remains
input-blocked.

## PPA sidecar policy in V2

Historical Feature V1 explicitly excluded the separate PPA sidecar from model inputs.

V2 therefore changes the **snapshot acceptance role** of that sidecar:

- capture and preserve it when available;
- report coverage gaps;
- do not use it as a predictive feature;
- do not make missing sidecar games a V2 model-input blocker.

This is a versioned V2 source-policy change.

It does not rewrite the V1 result.

No PPA-sidecar value may substitute for the selected advanced-game fields unless a
future contract explicitly authorizes a new feature/source family.

## Stage 2 — Historical Model V2

V2 must be a new model identity.

Do not mutate `historical_ridge_margin_v1`.

Model definition:

`historical_ridge_margin_v2`

### Development evidence

Training uses exactly the accepted 2022–2023 development universe:

- 1,484 games;
- no 2024 outcomes;
- no 2025 data;
- no market data.

### Continuous feature families

Retain the same ten continuous team-side families:

1. Elo
2. talent
3. returning production
4. recruiting Y0
5. recruiting Y1
6. recruiting Y2
7. recruiting Y3
8. prior FBS games
9. PPA net
10. success net

Scaling remains development-only population z-scoring.

### Missingness policy

V2 broadens missingness generically across **all recruiting slots**.

Allowed unavailable continuous families:

- returning production;
- recruiting Y0;
- recruiting Y1;
- recruiting Y2;
- recruiting Y3;
- dynamic form.

For an allowed unavailable value:

- standardized continuous value = 0;
- activate the corresponding signed home-minus-away missingness indicator.

Required available families remain:

- Elo;
- talent;
- priorFbsGames.

Dynamic PPA/success availability must still match.

### V2 predictor vector

Continuous deltas:

1. `eloDeltaZ`
2. `talentDeltaZ`
3. `returningDeltaZ`
4. `recruitY0DeltaZ`
5. `recruitY1DeltaZ`
6. `recruitY2DeltaZ`
7. `recruitY3DeltaZ`
8. `priorFbsGamesDeltaZ`
9. `ppaNetDeltaZ`
10. `successNetDeltaZ`

Missingness deltas:

11. `returningMissingDelta`
12. `recruitY0MissingDelta`
13. `recruitY1MissingDelta`
14. `recruitY2MissingDelta`
15. `recruitY3MissingDelta`
16. `formMissingDelta`

Structural unpenalized terms:

- intercept;
- home-field indicator.

Total coefficients: **18**.

### Regularization

Do not retune.

V2 lambda is fixed at the already-observed V1 selection:

**100**

No new lambda grid is permitted.

### Development refit

Fit V2 once on all accepted 2022–2023 development games.

The two new Y2/Y3 missingness columns are expected to be zero across the accepted
development universe because Y2/Y3 were fully available there.

Their fitted coefficients must therefore be zero to numerical tolerance.

Required:

`abs(coefficient) <= 1e-12`

### Backward-compatibility gate

Before any 2024 V2 score:

- produce V2 predictions for all 1,484 development games;
- compare against the frozen V1 candidate's predictions on the same rows.

Maximum permitted absolute prediction difference:

`1e-9`

Also compare all shared V1 coefficient/scaler state.

If V2 changes any development prediction beyond tolerance for reasons other than the two
new zero missingness columns, status:

`HISTORICAL_V2_BACKCOMPAT_FAILED`

and stop before 2024 scoring.

This gate prevents the source/missingness repair from silently becoming a new tuned model.

## Stage 3 — 2024 V2 feature/input freeze

### Canonical universe

Use the corrected shared definition:

- season 2024;
- regular;
- FBS vs FBS;
- `completed=true`.

Expected from the audited source artifact:

**752 games**

Any mismatch requires explicit audit before scoring.

### Advanced history

Build 2024 history using:

1. bulk advanced rows as primary;
2. source-qualified box fallback only for exact missing bulk rows.

No fuzzy team match.

No fallback overwrite of a bulk row.

### Recruiting Y2/Y3

Any unavailable recruiting slot uses the generic V2 missingness rule.

No team-specific exception.

No alternate provider.

No rank substitution.

No team average.

No zero raw value.

### Feature identity

V2 may reuse the Historical Feature V1 raw feature definitions for available values, but
the emitted validation feature artifact must identify itself as a **V2 validation input**
because source provenance and recruiting missingness eligibility changed.

Do not overwrite Historical Feature V1 artifacts.

### Source-read isolation

Predictive feature construction may read:

- 2024 games identity;
- static priors;
- frozen Elo PIT source;
- bulk advanced history;
- qualified equivalent fallback rows.

It may not read:

- 2024 target outcomes as feature inputs;
- 2024 market lines;
- PPA sidecar as model input;
- portal quarantine;
- 2025 data.

### Pre-score manifest

Before any 2024 target score, freeze/hash:

- V2 contract version;
- V2 candidate bytes/hash;
- development source identities;
- source-equivalence artifact/hash;
- 2024 base snapshot artifact/hash;
- recovered advanced rows/hash;
- 2024 V2 feature artifact/hash;
- canonical 752 game IDs;
- availability/missingness counts;
- baseline states/hashes;
- exact repo SHA;
- source-member read ledger.

The scorer must re-read and verify the exact manifest bytes.

## Stage 4 — 2024 source-informed confirmation

2024 is not labeled a pristine holdout in V2.

Use:

**SOURCE-INFORMED CONFIRMATION**

because V2 source/missingness design was motivated by observed 2024 source gaps.

### Baselines

Use the same pre-registered controls as V1, fit on 2022–2023 only:

1. HFA-only
2. Elo + HFA with lambda 100

No 2024 row may influence baseline fit or scaling.

### Metrics

For V2 primary and both controls report:

- prediction count;
- MAE;
- RMSE;
- mean error;
- median absolute error;
- descriptive R².

Week-level diagnostics may be reported descriptively.

No market/ATS/CLV/ROI metric is allowed.

### V2 statuses

Use exactly:

- `HISTORICAL_V2_CONFIRMATION_INPUT_BLOCKED`
- `HISTORICAL_V2_CONFIRMATION_PASS`
- `HISTORICAL_V2_CONFIRMATION_FAIL`

### Input-blocked status

Use INPUT_BLOCKED if any source/input gate fails, including:

- source equivalence rejected;
- incomplete recovery of the four missing advanced games;
- required Elo/talent/priorFbsGames missingness;
- dynamic-form availability mismatch;
- candidate/backward-compatibility gate failure;
- source hash mismatch;
- leakage blocker.

No partial score is allowed.

### Confirmation PASS gate

Input-valid V2 passes only if:

1. V2 predicts **100% of all 752 canonical 2024 games**;
2. Elo baseline predicts 100%;
3. HFA baseline predicts 100%;
4. V2 MAE < HFA-only MAE;
5. V2 MAE < Elo+HFA MAE;
6. V2 RMSE <= Elo+HFA RMSE;
7. candidate/source state is finite and exact;
8. market reads = 0;
9. 2025 reads = 0;
10. no leakage blocker exists.

This intentionally preserves the V1 performance gate.

Do not alter the gate after seeing V2 2024 results.

### Confirmation FAIL

If inputs are valid but a metric gate fails:

`HISTORICAL_V2_CONFIRMATION_FAIL`

Do not repair V2 and rerun V2 as though 2024 were unseen.

## What happens after V2 PASS

An independently audited V2 PASS permits only the next design step:

a separate **2025 Final Holdout contract**.

Do not refit V2 on 2024 before final holdout.

Do not use 2024 residuals to retune lambda/features before 2025.

The 2025 contract must freeze:

- exact V2 candidate bytes;
- exact source/missingness semantics;
- exact final-holdout gate;
- exact permitted 2025 source artifacts;
- exact no-market predictive boundary.

A separate explicit authorization is required before any 2025 final-holdout scoring.

## What happens after V2 BLOCK or FAIL

If V2 source qualification is blocked/rejected or 2024 confirmation fails:

- do not open 2025;
- do not iterate V2 using 2024 model-performance evidence and rerun under the same version;
- any further model requires V3;
- V3 must explicitly acknowledge all observed 2024 source and performance evidence then available.

## 2025 lock

The already-captured 2025 artifact remains sealed from V2 design and scoring decisions.

Do not inspect 2025 outcomes, market relationships, candidate residuals, or model metrics.

Previously recorded 2025 pipeline/endpoint-semantic facts may remain as historical plumbing
evidence only.

## Market isolation

Market data is never a predictive V2 input.

Historical lines may remain archived but:

- source-equivalence qualification reads 0 market members;
- V2 model build reads 0 market members;
- 2024 V2 feature build reads 0 market members;
- 2024 confirmation reads 0 market members.

## Determinism

All V2 selection/build/scoring behavior is deterministic.

Forbidden:

- random calibration sampling;
- random game exclusion;
- bootstrap model selection;
- stochastic tuning;
- manual fallback selection after reviewing values;
- team-name-specific missingness exceptions;
- residual-driven source substitution.

## Required artifacts

A completed V2 program must preserve, as separate immutable artifacts:

1. source-equivalence qualification report;
2. exact raw advanced-box calibration/recovery bytes;
3. recovered-row provenance artifact;
4. V2 development candidate artifact;
5. V1-vs-V2 backward-compatibility report;
6. 2024 V2 feature/input artifact;
7. frozen pre-score manifest;
8. one-shot 2024 V2 confirmation predictions/metrics;
9. independent audit closeout.

## What remains unauthorized

Merging this contract does **not** authorize:

- any CFBD provider call;
- advanced-box qualification;
- 2024 fallback recovery;
- V2 model execution;
- 2024 feature build;
- 2024 outcome scoring;
- 2025 access;
- database persistence;
- production promotion.

## Next sequence after contract merge

1. implement source-equivalence qualification capability and deterministic calibration
   selection;
2. implement V2 model construction/backward-compatibility tests;
3. implement V2 2024 input builder and one-shot confirmation engine;
4. review/merge capability with synthetic/offline tests only;
5. separately authorize the <=12-call CFBD source-equivalence/recovery run;
6. audit source equivalence and recovered rows;
7. build/audit V2 candidate and 2024 input artifacts;
8. separately authorize one 2024 V2 source-informed confirmation score;
9. audit result;
10. only after audited PASS may a 2025 final-holdout contract be designed.

## Versioning

Any change to these items requires a new contract version:

- source-equivalence cohort selection;
- source-equivalence tolerance;
- fallback endpoint;
- fallback mapping;
- recruiting missingness policy;
- V2 predictor vector;
- lambda;
- development universe;
- backward-compatibility tolerance;
- 2024 confirmation gate;
- 2025 lock rule.
