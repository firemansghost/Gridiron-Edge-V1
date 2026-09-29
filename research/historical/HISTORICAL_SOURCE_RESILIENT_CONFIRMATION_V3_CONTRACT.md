# Historical Source-Resilient Confirmation V3 — Contract

**Status:** FROZEN DESIGN — NO V3 PROVIDER RUN / NO 2024 MODEL SCORE YET  
**V1 status:** `HISTORICAL_VALIDATION_INPUT_BLOCKED`  
**V2 status:** `HISTORICAL_V2_SOURCE_EQUIVALENCE_REJECTED`  
**Development seasons:** 2022–2023  
**Observed source season:** 2024  
**2024 model-performance status:** UNOBSERVED  
**Final holdout:** 2025 — LOCKED  
**Does not authorize:** provider calls, 2024 outcome scoring, 2025 access, production deployment, database persistence, market evaluation, play-by-play expansion, or drives-based reconstruction

## Purpose

V3 is the first historical-confirmation version that treats source incompleteness as an
explicit model-input condition rather than requiring every missing historical advanced
row to be reconstructed from a substitute endpoint.

V3 exists because:

1. Historical Validation V1 stopped correctly before scoring when 2024 source gaps and
   required recruiting Y2 missingness were discovered.
2. V2 tested `/game/box/advanced` as a possible lossless replacement for missing bulk
   advanced rows and rejected it before any 2024 recovery call.
3. 2024 model-performance evidence remains unobserved.
4. 2025 remains sealed.

V3 therefore uses only:

- the frozen 2022–2023 development evidence;
- already-observed 2024 source-availability facts;
- already-observed V2 cross-endpoint source evidence;
- the original CFBD `/stats/game/advanced` source family.

V3 must not tune against 2024 outcomes.

## Frozen prior evidence

### Historical Model V1

Frozen development candidate:

- model: `historical_ridge_margin_v1`
- lambda: **100**
- development artifact ID: `11002393824`
- development ZIP SHA-256:
  `bb0a9233c4de18c317b35d13cc6bacefadc4e359fe4de8e52addad3ec523e313`
- candidate payload SHA-256:
  `8c6f1d053ff85e401f8acda5cba9ace7f54e5aaee6d9b46117a3c4dd690f1a53`
- Stage A selection SHA-256:
  `bcc28dbc02b177690136f192bd71f16110a3d05319c91d67ef5e6888f90c5858`
- development games: **1,484**
- development seasons: **2022–2023**

### Observed 2024 source artifact

- run: `36508377627`
- source SHA:
  `e1b27f6c5681f6ab4f8d24e50f88e387c64657a7`
- artifact ID: `11008470975`
- ZIP SHA-256:
  `b41e934b26952100e7e056a56114dc81df6bbe77f5c787f28b75b646ae7ea544`

Audited canonical 2024 universe:

- completed regular-season FBS-vs-FBS games: **752**
- canonical teams: **134**

Observed source gaps:

Bulk `/stats/game/advanced` missing exact completed games:

- `401641034` — New Mexico State @ Sam Houston — Week 4
- `401645328` — Rice @ Army — Week 4
- `401644689` — Kent State @ Miami (OH) — Week 12
- `401644780` — Eastern Michigan @ Western Michigan — Week 14

Static-prior gaps relevant to the frozen feature family:

- returning production missing Kennesaw State;
- recruiting Y2 / 2022 class missing Florida International;
- recruiting Y2 / 2022 class missing Kennesaw State.

### Rejected V2 source-equivalence evidence

- run: `36569502741`
- source SHA:
  `49fa04db10c3b11c0dac4f7e334aee0515189c05`
- artifact ID: `11033760438`
- ZIP SHA-256:
  `cdfb0c533c8ae6ffc44a29b6929185fd30229a73e18f87635227e5b8ecc3237c`
- calibration games: **8**
- scalar comparisons: **64**
- comparisons passing `1e-9`: **0**
- 2024 recovery calls: **0**

V3 must not retry, reinterpret, transform, or loosen the rejected advanced-box mapping.

## 2024 evidence allowed to influence V3

Allowed:

- missing source-row identities;
- endpoint/schema behavior;
- static-prior availability;
- completed-game identity;
- weekly source coverage;
- V2 equivalence diagnostics.

Not allowed before V3 scoring:

- 2024 model residuals;
- 2024 candidate MAE/RMSE;
- 2024 baseline comparison;
- ATS;
- CLV;
- ROI;
- sportsbook lines;
- any game exclusion based on expected model difficulty.

## V3 architecture

V3 has five separately gated stages:

1. same-endpoint query qualification and optional recovery;
2. Historical Model V3 construction;
3. 2024 source-resilient predictive-input construction;
4. pre-score freeze;
5. one-shot 2024 source-informed confirmation.

A later stage may not repair a failed earlier stage by changing frozen semantics.

## Stage 1 — Same-endpoint query qualification and optional recovery

### Source family

V3 may use only:

`GET /stats/game/advanced`

for advanced-game predictive source data.

No alternate advanced endpoint is permitted.

Specifically prohibited:

- `/game/box/advanced`;
- play-by-play reconstruction;
- drive reconstruction;
- a second analytics provider;
- a fitted transformation from another source family.

### Why week-scoped queries are eligible

The accepted historical snapshot used:

`/stats/game/advanced?year=Y&seasonType=regular`

V3 permits a narrower query to the **same endpoint** by adding only the documented
`week` filter.

The intended recovery query shape is:

`/stats/game/advanced?year=Y&week=W&seasonType=regular`

Do not add:

- `excludeGarbageTime=true`;
- alternate classification semantics;
- team-name remapping;
- opponent remapping;
- any parameter that changes the metric definition.

### Qualification cohort

Use the same deterministic development calibration identities already frozen in V2:

For each of 2022 and 2023:

- Week 1 — lowest canonical game ID;
- Week 6 — lowest canonical game ID;
- Week 12 — lowest canonical game ID;
- final observed regular-season provider week — lowest canonical game ID.

Expected calibration games: **8**.

Selection must not use outcome, residual, market, or source-agreement information.

### Qualification requests

Issue exactly one week-scoped request for each selected season/week pair.

Maximum development qualification calls:

**8**

Each raw response must be stored byte-for-byte before parsing.

### Qualification comparison

For the selected calibration game inside each week response, require:

- exact game ID;
- exact two team identities;
- exact opponent identities;
- finite:
  - offense PPA;
  - defense PPA;
  - offense success rate;
  - defense success rate.

Compare against the accepted 2022–2023 bulk advanced rows.

Tolerance per scalar:

`1e-12`

Qualification passes only if every one of the expected **64** scalar comparisons is
within tolerance.

No:

- rounding repair;
- scale transform;
- regression;
- offset;
- selective-game exclusion;
- selective-metric exclusion.

Qualification status:

- `HISTORICAL_V3_WEEK_QUERY_QUALIFIED`
- `HISTORICAL_V3_WEEK_QUERY_REJECTED`

### Qualification rejection behavior

A qualification rejection means:

- make zero 2024 recovery calls;
- preserve the qualification artifact;
- continue V3 using the original observed 2024 bulk source plus explicit source-gap
  handling.

Unlike V2, same-endpoint recovery is an **optional information-preservation path**, not
a prerequisite for V3 model construction.

### 2024 recovery weeks

Only if qualification passes, issue exactly three 2024 week-scoped calls:

- Week 4;
- Week 12;
- Week 14.

Maximum total provider calls:

**11**

The Week 4 response may recover both missing Week 4 games.

### Accepted recovery rows

A week-scoped row may be accepted only if:

- its game ID is one of the four already-known missing bulk game IDs;
- its team/opponent identities match the audited 2024 game frame exactly;
- the original full-season bulk advanced payload had no row for that game/team;
- offense/defense PPA and success-rate fields are finite.

Recovery provenance:

`BULK_ADVANCED_WEEK_SCOPED_RECOVERY`

Original bulk provenance:

`BULK_ADVANCED_FULL_SEASON_PRIMARY`

A recovery row must never overwrite an existing full-season bulk row.

### Recovery completeness

Recovery may be:

- complete;
- partial;
- zero.

Incomplete recovery does **not** block V3 by itself.

Any unresolved source gap is handled by the source-resilient feature rule below.

### Provider authorization boundary

Merging this V3 contract does not authorize provider calls.

A future qualification/recovery capability must be implemented and reviewed first.

The provider run then requires a separate explicit authorization.

## Stage 2 — Historical Model V3

V3 uses a new immutable identity:

`historical_ridge_margin_v3`

### Development evidence

Exactly:

- accepted 2022–2023 Historical Feature V1 rows;
- accepted 2022–2023 outcome sidecar;
- 1,484 games.

Do not use:

- 2024 outcomes;
- 2024 market data;
- 2025 data.

### Continuous features

Retain exactly the V1 ten continuous feature families:

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

Scaling remains population z-scoring fit on 2022–2023 development data only.

### Lambda

Do not retune.

V3 lambda is fixed:

**100**

### Missingness families

V3 permits explicit missingness for:

- returning production;
- recruiting Y0;
- recruiting Y1;
- recruiting Y2;
- recruiting Y3;
- natural form unavailability;
- source-history form incompleteness.

Required available:

- Elo;
- talent;
- priorFbsGames.

### V3 predictor vector

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

Structural unpenalized terms:

- intercept;
- home-field indicator.

Total coefficient count:

**19**

Penalized predictors:

**17**

### Existing V1 missingness semantics

The first four missingness deltas retain their V1 interpretation:

- returning unavailable -> standardized returning = 0 + returning indicator;
- recruiting Y0 unavailable -> standardized Y0 = 0 + Y0 indicator;
- recruiting Y1 unavailable -> standardized Y1 = 0 + Y1 indicator;
- natural form unavailable -> standardized PPA/success = 0 + formMissing indicator.

### New recruiting missingness

Y2 and Y3 use the same generic rule:

If source row/value is unavailable:

- standardized value = 0;
- corresponding missingness flag = 1 for that team side.

No:

- zero raw recruiting points;
- rank substitution;
- team average;
- alternate recruiting provider;
- class carry-forward/backward.

### Development zero-column gate

In accepted 2022–2023 development data:

- `recruitY2MissingDelta` must be identically 0;
- `recruitY3MissingDelta` must be identically 0;
- `formSourceGapDelta` must be identically 0.

Their fitted ridge coefficients must satisfy:

`abs(coefficient) <= 1e-12`

### Backward-compatibility gate

Fit V3 once on all 1,484 accepted development games with lambda 100.

Before any 2024 model score:

- score all 1,484 development games with V3;
- score the same games with frozen V1 candidate;
- require maximum absolute prediction difference <= `1e-9`.

Also require:

- shared continuous scaler means/SDs match V1 within `1e-12`;
- all shared coefficients match V1 within `1e-9`;
- new zero-development coefficients satisfy the zero-column gate.

Failure status:

`HISTORICAL_V3_BACKCOMPAT_FAILED`

If failed, stop before 2024 scoring.

## Stage 3 — 2024 source-resilient predictive inputs

### Canonical universe

Use exactly:

- season 2024;
- regular season;
- FBS vs FBS;
- completed = true.

Expected canonical games:

**752**

Expected canonical teams:

**134**

Any identity mismatch must stop before scoring.

### Static prior rules

#### Elo

Required available and finite.

Use frozen Historical Elo PIT V1 semantics:

- Week 1 -> preseason Elo;
- Week N >= 2 -> Week N-1 Elo;
- same-week Elo prohibited.

#### Talent

Required available and finite.

#### Returning production

Unavailable is permitted.

Use:

- standardized returning = 0;
- returning missing flag = 1.

#### Recruiting Y0–Y3

Unavailable is permitted for any slot.

Use:

- standardized slot value = 0;
- corresponding recruiting missing flag = 1.

No team-specific exception.

### Prior FBS game count

For each team side:

`priorFbsGames`

is the exact count of prior completed canonical 2024 FBS-vs-FBS games with provider
week strictly less than the target provider week.

It is schedule/game-frame derived.

It does **not** shrink when an advanced source row is missing.

It remains required available and finite.

### Advanced history source hierarchy

For each prior canonical game/team:

1. full-season 2024 bulk advanced row, if present;
2. accepted V3 week-scoped recovery row, if qualification passed and exact row recovered;
3. otherwise unresolved source gap.

No other source is permitted.

### Natural no-prior form

If:

`priorFbsGames = 0`

then:

- PPA net = unavailable with natural no-prior status;
- success net = unavailable with natural no-prior status;
- standardized PPA net = 0;
- standardized success net = 0;
- `formMissingFlag = 1`;
- `formSourceGapFlag = 0`.

This preserves the V1 natural-form missingness semantics.

### Complete prior form

If:

`observedAdvancedGames = priorFbsGames > 0`

and all selected fields are finite:

- compute equal-game arithmetic means using the frozen Feature V1 definitions;
- compute PPA net and success net normally;
- `formMissingFlag = 0`;
- `formSourceGapFlag = 0`.

### Source-incomplete prior form

If:

`observedAdvancedGames < priorFbsGames`

for a team side:

- do not compute predictive PPA/success means from the partial subset;
- PPA net = unavailable with status `SOURCE_HISTORY_INCOMPLETE`;
- success net = unavailable with status `SOURCE_HISTORY_INCOMPLETE`;
- standardized PPA net = 0;
- standardized success net = 0;
- `formMissingFlag = 0`;
- `formSourceGapFlag = 1`.

This is intentionally conservative.

V3 does not pretend a partial history mean is equivalent to a complete history mean.

### Field-level source defect

If the row exists but any selected PPA/success field is nonfinite or absent, treat that
prior game as unresolved source history for the affected team side.

Do not average around a malformed row.

### Audit-only form coverage fields

The 2024 V3 predictive-input artifact must report, for each team side:

- `priorFbsGames`;
- `observedAdvancedGames`;
- `missingAdvancedGames`;
- exact missing prior game IDs;
- source provenance counts.

These are audit metadata.

Only the frozen predictor vector enters the model.

### PPA sidecar

The separate `/ppa/games` artifact remains archival/evaluation-only.

It is not:

- a predictive source;
- a recovery source;
- a V3 input blocker.

### Portal

Transfer portal remains quarantined and unread by V3 predictive construction.

### Market

Historical betting lines are unread by V3 predictive construction and scoring.

### Play-by-play and drives

V3 does not use:

- `/plays`;
- `/drives`;
- passing-play reconstruction;
- rushing-play reconstruction.

Those remain outside this version.

## Stage 4 — Pre-score freeze

Before any 2024 outcome score, freeze and hash:

1. V3 contract version;
2. frozen V1 candidate identity;
3. V3 candidate bytes/hash;
4. V1-vs-V3 backward-compatibility report/hash;
5. observed 2024 V1 snapshot artifact/hash;
6. V2 rejected source artifact/hash;
7. V3 same-endpoint qualification/recovery artifact/hash, if a run occurred;
8. 2024 V3 predictive-input artifact/hash;
9. canonical 752 game IDs;
10. static missingness counts;
11. source-gap form counts and affected game/team IDs;
12. HFA baseline state/hash;
13. Elo+HFA baseline state/hash;
14. exact repo SHA;
15. source-member read ledger.

The pre-score manifest must be written and hashed before the scoring stage reads 2024
outcomes.

The scorer must re-verify all exact bytes/hashes.

## Stage 5 — One-shot 2024 source-informed confirmation

2024 is labeled:

**SOURCE-INFORMED, SOURCE-RESILIENT CONFIRMATION**

It is not labeled a pristine holdout.

Reason:

- V3 source/missingness rules were motivated by observed 2024 source availability.

However, 2024 model-performance evidence remains unseen until this one-shot score.

### Baselines

Use the same controls frozen for V1:

1. HFA-only;
2. Elo + HFA with lambda 100.

Both fit on accepted 2022–2023 development games only.

No 2024 row affects baseline fitting/scaling.

### Metrics

For V3 primary and both baselines:

- prediction count;
- MAE;
- RMSE;
- mean error;
- median absolute error;
- descriptive R².

Week diagnostics may report:

- count;
- MAE;
- mean error.

No:

- ATS;
- CLV;
- ROI;
- sportsbook evaluation.

### Final V3 statuses

Use exactly:

- `HISTORICAL_V3_CONFIRMATION_INPUT_BLOCKED`
- `HISTORICAL_V3_CONFIRMATION_PASS`
- `HISTORICAL_V3_CONFIRMATION_FAIL`

### INPUT_BLOCKED

Use INPUT_BLOCKED if:

- canonical game identity is not exactly 752;
- required Elo is unavailable;
- required talent is unavailable;
- priorFbsGames cannot be derived;
- V3 candidate/backcompat gate fails;
- source artifact/hash mismatch exists;
- pre-score freeze fails;
- market leakage occurs;
- 2025 is read;
- any predictor cannot be produced under the frozen missingness rules.

Source-history gaps alone are **not** an input blocker when they are represented by the
frozen source-gap rule.

Recruiting missingness alone is **not** an input blocker when represented by the frozen
slot-specific missingness rule.

### PASS

Input-valid V3 passes only if:

1. V3 predicts **100% of all 752 canonical 2024 games**;
2. Elo+HFA predicts 100%;
3. HFA-only predicts 100%;
4. V3 MAE < HFA-only MAE;
5. V3 MAE < Elo+HFA MAE;
6. V3 RMSE <= Elo+HFA RMSE;
7. all candidate/source state is finite;
8. candidate/backcompat hashes are exact;
9. market reads = 0;
10. 2025 reads = 0;
11. no leakage blocker exists.

This preserves the V1/V2 performance gate.

### FAIL

If inputs are valid but any performance gate fails:

`HISTORICAL_V3_CONFIRMATION_FAIL`

Do not alter V3 and rerun V3 as though 2024 remained unseen.

## What happens after V3 PASS

An independently audited V3 PASS permits only:

design of a separate **2025 Final Holdout contract**.

Do not:

- refit V3 on 2024;
- retune lambda using 2024;
- redesign source-gap rules using 2024 residuals;
- change predictors before 2025.

The exact V3 candidate and source-resilient feature semantics must be frozen before
2025 scoring.

A separate explicit authorization is required before any 2025 final-holdout score.

## What happens after V3 BLOCK or FAIL

If V3 is input-blocked or fails:

- 2025 remains locked;
- V3 is not rerun as unseen;
- any further model version must be V4;
- V4 must acknowledge all 2024 source and model-performance evidence observed by then.

## 2025 lock

The already-captured 2025 artifact remains sealed from V3 design.

Do not inspect:

- V3 predictions on 2025;
- 2025 model residuals;
- 2025 market relationships;
- 2025 final-holdout metrics.

Previously documented 2025 plumbing/source-semantic facts do not authorize use of its
model-performance evidence.

## Determinism

All V3 selection/build/scoring behavior is deterministic.

Forbidden:

- random source qualification;
- random source recovery;
- bootstrap feature selection;
- stochastic optimization;
- residual-driven exclusions;
- team-specific missingness rules;
- manual game exclusions;
- post-score gate changes.

## Required artifacts

A completed V3 program must preserve:

1. V3 same-endpoint qualification/recovery artifact, if provider run occurs;
2. V3 candidate artifact;
3. V1-vs-V3 backward-compatibility artifact;
4. 2024 V3 predictive-input artifact;
5. source-gap audit report;
6. frozen baseline artifacts;
7. pre-score manifest/hash;
8. one-shot 2024 predictions/metrics;
9. independent V3 audit closeout.

## Authorization boundaries

Merging this contract does not authorize:

- provider calls;
- same-endpoint qualification;
- 2024 recovery calls;
- 2024 model scoring;
- 2025 access;
- DB persistence;
- production promotion.

Provider calls and model scoring remain separate explicit authorization boundaries.

## Recommended implementation sequence

1. merge this contract;
2. implement V3 model construction and backward-compatibility engine offline;
3. implement 2024 source-resilient predictive-input builder offline;
4. implement same-endpoint qualification/recovery capability;
5. implement pre-score freeze and scorer capability without executing the score;
6. review/merge all capability slices;
7. separately authorize the <=11-call same-endpoint provider run;
8. audit qualification/recovery;
9. build/audit V3 candidate and 2024 predictive inputs;
10. freeze pre-score manifest;
11. separately authorize one 2024 V3 confirmation score;
12. audit the result;
13. only after audited PASS may a 2025 final-holdout contract be designed.

## Versioning

Any change to these items requires a new version:

- source endpoint family;
- qualification cohort;
- qualification tolerance;
- recovery weeks;
- source hierarchy;
- source-history incomplete rule;
- recruiting missingness rule;
- predictor vector;
- lambda;
- development universe;
- backward-compatibility tolerance;
- confirmation gate;
- 2025 lock rule.
