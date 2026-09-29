# Historical Final Holdout V1 — Contract

**Status:** FROZEN DESIGN — 2025 OUTCOMES REMAIN SEALED  
**Primary model:** `historical_ridge_margin_v3`  
**Development seasons:** 2022–2023  
**Observed confirmation season:** 2024  
**2024 status:** `HISTORICAL_V3_CONFIRMATION_PASS`  
**Final holdout:** 2025 only  
**Does not authorize:** 2025 outcome scoring, candidate refit, lambda retuning, scaler refit, feature changes, market evaluation, production deployment, provider calls, or database persistence

## Purpose

Historical Final Holdout V1 defines the only permitted path for evaluating the frozen
Historical Model V3 candidate on the untouched 2025 final holdout.

The contract exists to preserve a clean distinction between:

- model-development evidence: 2022–2023;
- observed source-informed confirmation evidence: 2024;
- final untouched model-performance evidence: 2025.

The contract must be frozen before any 2025 model prediction, residual, or final-holdout
metric is observed.

Previously completed 2025 pipeline, source-coverage, missingness, and endpoint-semantic
audits may be used only as source-integrity facts. They must not be used to change the
V3 model, its predictor set, missingness semantics, baselines, or performance gate.

## Frozen prerequisite — V3 PASS

The 2025 holdout is eligible for contract design only because Historical V3 completed
an independently audited 2024 PASS.

Audit record:

`docs/2026-09-29-historical-v3-confirmation-pass-audit.md`

Frozen confirmation evidence:

- run: `36597352222`
- artifact ID: `11045859672`
- ZIP SHA-256:
  `e79872ec4763c71c4d9844bfd6087d214f8c42f0504f51800ff1d03da9b32476`
- status: `HISTORICAL_V3_CONFIRMATION_PASS`
- frozen 2024 input-manifest SHA-256:
  `763626bebd8a8a80cea37c48cef342b147382f498f332ae286666606170fdc15`

The holdout path must verify this prerequisite identity before any 2025 scoring.

The 2024 prediction rows and residuals are not holdout inputs and must not be read by
the 2025 scorer.

## Frozen V3 candidate

The final holdout uses the exact V3 candidate that passed 2024.

- model identity: `historical_ridge_margin_v3`
- lambda: **100**
- V3 artifact ID: `11045955232`
- V3 ZIP SHA-256:
  `dfa1bb276d6aa353bbf89db800c9185487f4b77b21f4b5b98d819d69b0ae1257`
- candidate member:
  `candidate/v3_candidate.json`
- candidate member SHA-256:
  `bae9d7962bfdbe6c268a627ba2e9be396c48f586f5c7b45d550c5a1bde3632fb`
- V1-vs-V3 backcompat member SHA-256:
  `8bb6b51af4fe67b168c5d0808c9a01c6f2289e61649f60ea64373265bb78d8e7`

No coefficient, scaler, lambda, feature, or HFA term may be recomputed from 2024 or
2025.

## Frozen control baselines

The final holdout reuses the exact validation-control baseline states frozen before the
2024 confirmation.

Prescore artifact:

- artifact ID: `11045563374`
- ZIP SHA-256:
  `125b8128148844280291eb8372ad1c9580f3c4bed2a344e3c63adc890972a5b6`

Baseline members:

- HFA-only:
  - member: `baselines/hfa.json`
  - member SHA-256:
    `34ed91ea0923911b1957bb19457b7a4d494ebc7ccb73fc236419799811bd407e`
- Elo + HFA:
  - member: `baselines/elo_hfa.json`
  - member SHA-256:
    `0424b8cbb5f1fb425fca3dc80d0086a1c5aece01f7f04c19374868da59625a70`

Both baselines were fit only on the accepted 1,484-game 2022–2023 development corpus.

Do not refit either control before 2025.

## Sealed 2025 source artifact

The final holdout must use only the already-captured immutable 2025 Historical Research
Snapshot V1 artifact.

- run: `36433016296`
- source SHA:
  `f17b6876ddc8d660ce6b5572ef8742f4e7f9cea7`
- artifact ID: `10973848747`
- artifact name:
  `historical-research-snapshot-v1-2025-36433016296`
- ZIP SHA-256:
  `fda9a410faf3f648de1135a7ed841a497d947d844978513e0bfcd88aea9d0b22`

No second 2025 provider capture is authorized or required.

The original snapshot audit documented two workflow/reporting defects:

1. repository postinstall invoked `prisma generate`, but no Prisma client was
   instantiated and no database connection/read/write occurred;
2. broad provider advanced/PPA counts were reported before canonical intersection.

Those defects do not invalidate the raw artifact. The artifact itself was independently
hash-verified and the canonical coverage facts below were derived from it.

## Previously observed 2025 source facts

The following facts were already documented before final-holdout model performance was
opened and therefore may be used only for source-integrity planning.

Canonical universe:

- regular-season completed FBS-vs-FBS games: **762**
- canonical teams: **136**
- observed provider weeks: **1–16**

Advanced efficiency:

- canonical games: **762 / 762**
- canonical team-game rows: **1,524 / 1,524**

PPA sidecar:

- canonical games: **762 / 762**
- canonical team-game rows: **1,524 / 1,524**

Static-prior availability:

- talent: **134 / 136**
  - missing: Air Force, Navy
- returning production: **134 / 136**
  - missing: Delaware, Missouri State
- preseason Elo: **135 / 136**
  - missing: UNLV
- recruiting 2022: **133 / 136**
  - missing: Delaware, Florida International, Kennesaw State
- recruiting 2023: **134 / 136**
  - missing: Delaware, Missouri State
- recruiting 2024: **135 / 136**
  - missing: Missouri State
- recruiting 2025: **136 / 136**

These facts must not create team-specific exceptions.

In particular, the V3 model has no talent-missingness predictor. Talent remains
required available under the frozen V3 semantics.

If required talent is unavailable for any canonical target side, the final holdout must
stop before outcome scoring with `HISTORICAL_FINAL_HOLDOUT_INPUT_BLOCKED`.

Do not repair required talent with:

- prior-season talent;
- zero;
- team average;
- conference average;
- recruiting points;
- another provider;
- manual game exclusion.

The same principle applies to required Elo.

## Holdout architecture

Historical Final Holdout V1 has four separately gated stages:

1. 2025 predictive-input construction;
2. pre-score holdout freeze;
3. one-shot 2025 final-holdout scoring;
4. independent artifact audit.

A later stage may not repair a failed earlier stage.

If Stage 1 or Stage 2 is blocked, 2025 outcomes remain sealed.

## Stage 1 — 2025 predictive-input construction

### Execution boundary

The predictive-input builder is artifact-only and offline.

It may read only the exact sealed 2025 snapshot members required for:

- canonical game identity;
- provider week;
- home/away team identity;
- neutral-site state;
- static priors;
- weekly Elo;
- full-season advanced history.

It must not use:

- final score fields;
- historical line members;
- portal members;
- PPA sidecar;
- 2024 prediction/residual evidence;
- any provider call;
- database/Prisma access.

It must record:

- `providerCalls = 0`;
- `marketReads = 0`;
- `ppaSidecarReads = 0`;
- `portalReads = 0`;
- `outcomeFieldsUsed = false`;
- `modelPredictionsComputed = false`;
- `databaseReads = false`;
- `databaseWrites = false`.

Reading the games payload for identity/schedule fields does not authorize reading or
using its score fields.

The implementation must make outcome fields irrelevant to the predictive artifact.
Synthetic tests should verify that changing score fields does not change predictive
outputs.

### Canonical target

Use exactly:

- season = 2025;
- season type = regular;
- home classification = FBS;
- away classification = FBS;
- completed = true.

Expected:

- canonical games: **762**
- canonical teams: **136**

Any canonical count or identity inconsistency with the exact sealed snapshot blocks the
holdout before scoring.

### Frozen feature semantics

Use the exact V3 19-term coefficient ordering and V3 scaler state.

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
17. `formSourceGapDelta`

Structural terms remain:

- intercept;
- home-field indicator.

No new predictor or missingness term is permitted.

### Elo

Elo remains required available and finite.

Use the frozen Historical Elo PIT rule:

- target Week 1 -> 2025 preseason Elo;
- target Week N >= 2 -> 2025 Week N-1 Elo;
- same-week Elo prohibited.

A missing preseason Elo value blocks only if that unavailable value is actually required
for a canonical target side under the frozen timing rule.

Do not reconstruct Elo from:

- game-payload pregame/postgame fields;
- another week chosen after inspection;
- another provider;
- interpolation;
- manual override.

### Talent

Talent is required available and finite for every canonical target side.

There is no V3 talent-missingness term.

Any required unavailable talent blocks the final holdout before outcome scoring.

### Returning production

Returning production may be unavailable under the frozen V3 rule.

If unavailable:

- standardized returning value = 0;
- returning missing flag = 1.

### Recruiting

For 2025:

- Y0 = 2025;
- Y1 = 2024;
- Y2 = 2023;
- Y3 = 2022.

Any slot may be unavailable under the frozen V3 rule.

If unavailable:

- standardized slot value = 0;
- the corresponding slot missing flag = 1.

No carry-forward/backward, zero raw points, team average, or alternate provider is
permitted.

### priorFbsGames

For each target team side:

`priorFbsGames`

is the exact count of earlier completed canonical 2025 FBS-vs-FBS games whose provider
week is strictly less than the target provider week.

Same-week earlier kickoff does not qualify.

The value is schedule/game-frame derived and required available.

### Dynamic form

Use only prior completed canonical 2025 FBS-vs-FBS games with provider week strictly
less than the target provider week.

For each eligible prior game/team, use the frozen V3 advanced fields from:

`/stats/game/advanced`

full-season snapshot evidence.

No new provider recovery call is permitted for the final holdout.

The exact sealed snapshot was previously audited as complete for all 762 canonical
games. Therefore any contradiction in raw artifact identity/coverage is an
artifact-integrity blocker.

Natural form unavailability:

- if `priorFbsGames = 0`, set PPA/success standardized values to 0 and
  `formMissing = 1`;
- `formSourceGap = 0`.

Source-history incompleteness:

- the V3 model semantics remain defined;
- however, because the exact sealed 2025 full-season advanced artifact was already
  audited as complete, an unexpected missing canonical advanced row indicates evidence
  inconsistency and blocks the holdout rather than authorizing a new recovery path.

### Predictive-input status

The Stage 1 artifact must end in one of:

- `HISTORICAL_FINAL_HOLDOUT_INPUTS_READY`
- `HISTORICAL_FINAL_HOLDOUT_INPUT_BLOCKED`

If blocked:

- emit exact blocker identities;
- emit no 2025 model predictions;
- do not create Stage 2 scoring authorization;
- do not open outcome fields.

Expected blocker examples include:

- required talent unavailable;
- required Elo unavailable;
- canonical identity mismatch;
- non-finite required feature;
- snapshot ZIP/member hash mismatch;
- advanced canonical coverage contradiction;
- same-week history leakage.

A blocker is a valid final research outcome for this V3/holdout contract.

Do not weaken the contract to force a score.

## Stage 2 — pre-score holdout freeze

Stage 2 may run only if Stage 1 status is:

`HISTORICAL_FINAL_HOLDOUT_INPUTS_READY`

The pre-score freeze must record and hash at minimum:

- contract path and SHA-256;
- exact repo SHA;
- V3 artifact ID/ZIP SHA;
- V3 candidate member SHA;
- V3 backcompat member SHA;
- exact 2024 V3 PASS prerequisite artifact ID/ZIP SHA/report status;
- exact 2025 snapshot artifact ID/ZIP SHA;
- exact 2025 predictive-input artifact ZIP SHA;
- exact predictive-input member SHA;
- canonical 2025 game count;
- sorted exact canonical game IDs;
- canonical team count;
- static missingness counts;
- dynamic-form missingness/source-gap counts;
- HFA baseline member SHA;
- Elo + HFA baseline member SHA;
- source-member read ledger.

The freeze must assert:

- candidate identity unchanged;
- coefficient ordering unchanged;
- all candidate coefficients finite;
- V3 scaler state unchanged;
- lambda = 100;
- baseline states unchanged;
- provider calls = 0;
- market reads = 0;
- PPA-sidecar reads = 0;
- portal reads = 0;
- outcome fields used = false;
- 2025 model predictions computed = false;
- database/Prisma operations = false.

The freeze must not read 2025 outcomes.

## Stage 3 — one-shot 2025 final-holdout score

A score may occur only after:

1. this contract is merged and frozen;
2. Stage 1 is independently audited READY;
3. Stage 2 is independently audited READY;
4. the exact score workflow/capability is reviewed and merged;
5. a separate explicit human authorization is given for the one-shot 2025 score.

The score uses exact confirmation:

`SCORE_2025_HISTORICAL_FINAL_HOLDOUT_ONCE`

### Technical one-shot guard

The scoring workflow must be newly dedicated to Final Holdout V1 and must require:

- execution from `refs/heads/main`;
- exact expected `main` SHA;
- exact confirmation string;
- `github.run_number == 1`;
- `github.run_attempt == 1`;
- concurrency group with `cancel-in-progress: false`.

If the first scoring dispatch fails operationally, do not rerun the same holdout
workflow under V1.

Any later attempt requires a new contract/version and explicit contamination review.

This deliberately makes the one-shot rule technical rather than merely procedural.

### Verification before outcome access

Before opening any 2025 score field, the scorer must verify:

- sealed 2025 snapshot ZIP hash;
- pre-score freeze ZIP hash;
- complete pre-score manifest/member hashes;
- V3 model ZIP/member hashes;
- predictive-input ZIP/member hashes;
- frozen baseline member hashes;
- V3 PASS prerequisite identity;
- exact canonical 762-game ID set;
- frozen contract hash;
- scorer repo SHA.

Only after every check passes may the scorer read the single archived 2025 games
payload's final score fields.

If any check fails:

- status = `HISTORICAL_FINAL_HOLDOUT_INPUT_BLOCKED`;
- no partial metrics;
- no retry under V1.

### Outcome target

The only outcome target is:

`homeMargin = finalHomePoints - finalAwayPoints`

for all 762 canonical games.

No market outcome or spread result is part of Final Holdout V1.

### Predictions

Compute all three models on the exact same 762-game universe:

1. frozen V3;
2. frozen Elo + HFA control;
3. frozen HFA-only control.

No recalibration is permitted.

### Metrics

For each model report:

- n;
- MAE;
- RMSE;
- mean error;
- median absolute error;
- descriptive R².

Provider-week diagnostics may additionally report:

- game count;
- MAE;
- mean error.

Week diagnostics are descriptive only.

Do not compute or expose as a holdout gate:

- ATS;
- CLV;
- ROI;
- sportsbook spread error;
- betting thresholds;
- BET/WATCH/PASS.

## Final holdout statuses

Use exactly:

- `HISTORICAL_FINAL_HOLDOUT_INPUT_BLOCKED`
- `HISTORICAL_FINAL_HOLDOUT_PASS`
- `HISTORICAL_FINAL_HOLDOUT_FAIL`

### INPUT_BLOCKED

Use INPUT_BLOCKED if any pre-score or score-integrity requirement fails, including:

- Stage 1 not READY;
- canonical universe not exactly 762 games;
- required talent unavailable;
- required Elo unavailable;
- priorFbsGames cannot be derived;
- candidate/hash mismatch;
- predictive/hash mismatch;
- baseline/hash mismatch;
- frozen contract mismatch;
- non-finite predictor/state;
- market leakage;
- provider call;
- database access;
- source/read leakage.

If blocked before outcome access, 2025 model performance remains unobserved.

### PASS

Input-valid Final Holdout V1 passes only if all conditions hold:

1. V3 predicts **762 / 762** canonical 2025 games;
2. Elo + HFA predicts **762 / 762**;
3. HFA-only predicts **762 / 762**;
4. V3 MAE < HFA-only MAE;
5. V3 MAE < Elo + HFA MAE;
6. V3 RMSE <= Elo + HFA RMSE;
7. all candidate/scaler/baseline state is finite;
8. frozen candidate and source hashes are exact;
9. market reads = 0;
10. provider calls = 0;
11. database reads/writes = false;
12. no leakage blocker exists.

This is deliberately the same comparative performance gate used for the 2024 V3
confirmation.

Do not loosen or strengthen it after observing 2025.

### FAIL

If all inputs are valid and 2025 outcomes are scored but any PASS condition fails:

`HISTORICAL_FINAL_HOLDOUT_FAIL`

Do not modify V3 and rerun V3 on 2025.

## What PASS means

A PASS means only:

> The frozen Historical Model V3 candidate, unchanged after its 2024 confirmation,
> satisfied the pre-registered final-holdout margin-prediction gate on the untouched
> 2025 season against the same frozen development-only controls.

A PASS does not establish:

- betting profitability;
- ATS edge;
- production readiness;
- live 2026 calibration;
- market-threshold validity.

Any production or betting use remains a separate decision supported primarily by the
2026 prospective program.

## What FAIL means

A FAIL means:

- V3 did not satisfy the final-holdout performance gate;
- do not tune V3 on 2025 and rerun V3;
- any future historical model must use a new version;
- that new version must treat 2024 and 2025 model-performance evidence as observed.

## What INPUT_BLOCKED means

An INPUT_BLOCKED result means the frozen V3 semantics cannot produce the complete
pre-registered holdout evaluation from the frozen 2025 source artifact.

If the block occurs before outcome access:

- 2025 model-performance evidence remains unobserved;
- a future model/source contract may acknowledge the observed 2025 source-availability
  facts;
- the blocked V1 holdout may not be repaired by changing V3 in place.

If the block occurs after authorized outcome access, 2025 must be considered
model-performance-observed for future protocol design.

## Market isolation

The sealed 2025 snapshot contains historical line evidence.

Final Holdout V1 must not read it.

Market-member reads must be **0** in:

- predictive input construction;
- pre-score freeze;
- scoring.

No betting interpretation belongs in the final-holdout PASS/FAIL decision.

## Provider and database isolation

Final Holdout V1 is artifact-only.

No:

- CFBD calls;
- Odds API calls;
- SGO calls;
- weather calls;
- database reads;
- database writes;
- Prisma client generation or invocation.

The already-captured 2025 artifact is the complete source boundary.

## Determinism

All stages are deterministic.

Forbidden:

- random subsampling;
- bootstrap selection;
- stochastic fitting;
- random game exclusions;
- residual-driven exclusions;
- manual exclusions;
- team-specific exceptions;
- post-outcome gate changes.

## Required immutable evidence

A completed Final Holdout V1 program must preserve:

1. this frozen contract;
2. audited V3 2024 PASS evidence;
3. frozen V3 candidate evidence;
4. frozen baseline states;
5. sealed 2025 snapshot identity;
6. 2025 predictive-input artifact or INPUT_BLOCKED artifact;
7. pre-score freeze artifact if Stage 1 is READY;
8. one-shot 2025 prediction rows if scoring is authorized and reached;
9. final-holdout metrics if scoring is reached;
10. final status;
11. source-read ledgers;
12. final manifest with byte counts and SHA-256 for every emitted member.

## Authorization boundaries

Merging this contract authorizes **no 2025 outcome access**.

After contract merge, implementation may proceed for:

- predictive-input construction;
- blocker detection;
- pre-score freeze;
- synthetic tests;
- one-shot scoring capability.

Executing Stage 1/Stage 2 may occur under a separate research execution authorization
provided no 2025 outcome fields or predictions are opened.

Executing Stage 3 always requires a separate explicit authorization after Stage 1 and
Stage 2 are independently audited READY.

## Recommended execution sequence after contract freeze

1. implement Final Holdout V1 predictive-input / blocker capability;
2. implement pre-score freeze;
3. implement the dedicated technically one-shot scorer;
4. add synthetic tests for:
   - candidate/hash locks;
   - baseline reuse;
   - required talent/Elo blocking;
   - permitted V3 missingness;
   - outcome-field isolation;
   - market isolation;
   - exact 762-game identity;
   - one-shot run-number/run-attempt guard;
   - PASS/FAIL/INPUT_BLOCKED status logic;
5. merge capability without opening 2025 outcomes;
6. execute and independently audit Stage 1;
7. if Stage 1 blocks, stop with 2025 outcomes still sealed;
8. if Stage 1 is READY, execute and independently audit Stage 2;
9. only then request/confirm the separate explicit Stage 3 scoring authorization;
10. execute the one-shot 2025 score once;
11. independently audit final status and evidence.

## Versioning

Any change to the following requires a new Final Holdout contract version:

- V3 candidate identity;
- candidate scaler/coefficient state;
- lambda;
- 2025 canonical-universe definition;
- Elo timing;
- talent availability requirement;
- V3 missingness semantics;
- dynamic-form source semantics;
- baseline identities;
- metrics;
- PASS/FAIL gate;
- market isolation;
- source-read boundary;
- one-shot execution rule.

Final Holdout V1 must not drift after merge.
