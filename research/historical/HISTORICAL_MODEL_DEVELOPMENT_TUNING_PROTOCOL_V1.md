# Historical Model Development / Tuning Protocol V1

**Status:** FROZEN DEVELOPMENT PROTOCOL — EXECUTED AND INDEPENDENTLY AUDITED  
**Development feature artifact:** Historical Feature V1  
**Development seasons:** 2022 and 2023 only  
**2022 role:** tuning / model-selection season  
**2023 role:** one-shot development confirmation season  
**Validation season:** 2024 — reserved, not authorized here  
**Final holdout:** 2025 — locked  
**Does not authorize:** implementation, training execution, tuning run, 2024 capture/use, 2025 access, market optimization, betting thresholds, production writes, or model promotion

## Purpose

Historical Model Development / Tuning Protocol V1 pre-registers the first historical
model-development procedure before any model is fit.

The protocol intentionally separates:

1. feature construction — already frozen and audited;
2. model representation;
3. 2022-only hyperparameter tuning;
4. one-shot 2023 development confirmation;
5. final 2022+2023 refit only if the confirmation gate passes;
6. later 2024 validation under a separate contract.

The goal is to prevent repeated retrospective optimization against 2023, historical
market lines, 2024, or the locked 2025 holdout.

## Frozen input evidence

### Historical Feature V1

Only the accepted Feature V1 artifact is authorized as the predictive feature source:

- build run: `36489184409`
- builder SHA: `743738eea6dfd0852cf28c5941aa998be300b0c9`
- artifact ID: `11000651389`
- artifact name: `historical-feature-v1-36489184409`
- ZIP SHA-256:
  `047220307750b755d1e6d626628802baf818dbd70ffde9252e63768e7a823ad2`
- feature payload SHA-256:
  `9ab89dce2eee84fce0c69bae9bb5511d941a8bef1731adbfd36610703c86e74a`

Expected feature rows:

- 2022: **734**
- 2023: **750**
- combined: **1,484**

### Historical outcomes

The only authorized target source is the accepted Historical Development Corpus V1
outcome sidecar:

- corpus run: `36479515332`
- corpus artifact ID: `10997010171`
- corpus ZIP SHA-256:
  `cea83762d2b6e492caec680a74a085ef5a5e283c36a402ef4b35acbe2ce22b7d`
- outcome member: `outcomes/outcomes.json`

Target:

```
homeMargin = finalHomePoints - finalAwayPoints
```

The development implementation may read only:

- Feature V1 metadata + `features/game_features.json`;
- corpus metadata + `outcomes/outcomes.json`.

It must not read:

- `evaluation/market_lines.json`;
- raw corpus predictive layers;
- PPA sidecar;
- transfer-portal quarantine;
- 2024 evidence;
- 2025 evidence.

No provider refresh or database rescue is allowed.

## Model identity

Frozen candidate family:

| Field | Value |
|---|---|
| modelDefinitionId | `historical_ridge_margin_v1` |
| modelFamily | `historical_ridge_margin` |
| featureDefinitionId | `historical_feature_v1` |
| target | `homeMargin` |
| model class | linear ridge regression |
| market type | none during development |
| status | research only |

This protocol defines exactly one primary candidate model family.

There is no feature-subset search and no alternate nonlinear model search in V1.

## Target sign convention

```
homeMargin = home score - away score
```

Therefore:

- positive prediction -> home team expected to win by that many points;
- negative prediction -> away team expected to win by the absolute value;
- zero -> expected tie margin.

This development target is not a betting spread.

No market line is subtracted from it in V1 development.

## Frozen game-level representation

Feature V1 preserves separate home and away team-side bundles.

The model protocol converts them to game-level predictors using standardized
home-minus-away differences plus a non-neutral home-field indicator.

### Continuous team-side sources

Use only these Feature V1 values:

1. `eloRaw`
2. `talentRaw`
3. `returningPercentPPA`
4. `recruitingPointsY0`
5. `recruitingPointsY1`
6. `recruitingPointsY2`
7. `recruitingPointsY3`
8. `priorFbsGames`
9. `ppaNet`
10. `successNet`

Feature V1 component means remain audit/provenance evidence.

V1 model fitting uses the two frozen net dynamic fields rather than separately fitting
offense/defense means. This keeps the first historical model intentionally compact and
avoids double-counting the already-derived directional net information.

### Training-only standardization

For each continuous team-side source `f`, a training set defines:

```
mu_f =
  mean(available team-side f values across training games)

sigma_f =
  sqrt(
    sum((f_i - mu_f)^2)
    /
    N_available
  )
```

Use **population** standard deviation with divisor N.

Only available values participate in `mu_f` and `sigma_f`.

For an available side value:

```
z_f(side) =
  (f(side) - mu_f) / sigma_f
```

For an unavailable side value:

```
z_f(side) = 0
```

That zero is explicitly **training-mean imputation in standardized space**.

It is not a claim that the raw value equals zero.

If `sigma_f <= 1e-12`:

- set all standardized values for that feature to zero in that training fit;
- record `SCALER_DISABLED_ZERO_VARIANCE`;
- do not invent another scale.

Validation/confirmation data never contributes to training means or standard deviations.

### Game-level continuous deltas

For each continuous feature:

```
fDeltaZ =
  z_f(home) - z_f(away)
```

Frozen continuous predictor names:

- `eloDeltaZ`
- `talentDeltaZ`
- `returningDeltaZ`
- `recruitY0DeltaZ`
- `recruitY1DeltaZ`
- `recruitY2DeltaZ`
- `recruitY3DeltaZ`
- `priorFbsGamesDeltaZ`
- `ppaNetDeltaZ`
- `successNetDeltaZ`

Do not add ratios, absolute gaps, polynomial terms, interactions, conference terms, or
matchup classes in V1.

## Missingness representation

The accepted 2022–2023 Feature V1 artifact has:

- complete Elo;
- complete talent;
- complete recruiting Y2/Y3;
- complete prior-game count;
- dynamic form missing only when no prior FBS history;
- returning-production gaps for three frozen teams;
- recruiting Y0/Y1 gaps tied to Florida International's missing 2022 class.

V1 uses signed missingness indicators only where missingness exists in the frozen
development artifact.

### Returning production

```
returningMissingDelta =
    I(home returning unavailable)
  - I(away returning unavailable)
```

### Recruiting Y0

```
recruitY0MissingDelta =
    I(home Y0 unavailable)
  - I(away Y0 unavailable)
```

### Recruiting Y1

```
recruitY1MissingDelta =
    I(home Y1 unavailable)
  - I(away Y1 unavailable)
```

### Dynamic form

The accepted Feature V1 audit established that `ppaNet` and `successNet` share the
same availability boundary in 2022–2023.

V1 therefore defines:

```
formMissingDelta =
    I(home dynamic form unavailable)
  - I(away dynamic form unavailable)
```

A development row is a blocker if one of `ppaNet` / `successNet` is available and
the other is unavailable for the same side.

### Unexpected missingness

Under V1 development:

- Elo unavailable -> blocker;
- talent unavailable -> blocker;
- recruiting Y2/Y3 unavailable -> blocker;
- priorFbsGames unavailable -> blocker.

Do not silently extend V1 missingness rules to new source gaps.

A later validation protocol must explicitly address any 2024 missingness pattern that
was not observed/frozen here.

## Home-field representation

Define:

```
homeFieldIndicator =
  neutralSite ? 0 : 1
```

No team-specific HFA or conference-specific HFA is authorized.

The model has:

- an unpenalized intercept;
- an unpenalized `homeFieldIndicator` coefficient.

The fitted `homeFieldIndicator` coefficient is the V1 research estimate of generic
non-neutral home-field effect after controlling for the frozen predictors.

No 2.0-point or other legacy HFA constant is injected into this historical model.

The older repository methodology/HFA notes remain legacy context and are not the V1
development rule.

## Frozen design matrix

Primary candidate columns, excluding intercept:

### Penalized continuous deltas

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

### Penalized signed missingness indicators

11. `returningMissingDelta`
12. `recruitY0MissingDelta`
13. `recruitY1MissingDelta`
14. `formMissingDelta`

### Unpenalized structural term

15. `homeFieldIndicator`

Plus one unpenalized intercept.

No column may be dropped based on fitted coefficient, p-value, feature importance,
2022 validation performance, or 2023 confirmation performance.

## Model formula

For game i:

```
predictedHomeMargin_i =
    beta_0
  + beta_HFA * homeFieldIndicator_i
  + sum(beta_j * X_ij)
```

where `X_ij` are the 14 penalized predictors.

Fit by minimizing:

```
sum_i (homeMargin_i - predictedHomeMargin_i)^2
+
lambda * sum_j beta_j^2
```

Penalty applies only to the 14 penalized predictors.

Do not penalize:

- intercept;
- `homeFieldIndicator`.

No coefficient sign constraints are imposed.

## Frozen lambda search space

Lambda is the **only** tunable hyperparameter in V1.

Allowed grid:

```
[0.01, 0.1, 1, 10, 100]
```

Forbidden:

- adding grid points after seeing results;
- continuous optimizer searches;
- separate lambda by feature family;
- feature-specific penalties;
- elastic net / lasso mixing;
- Bayesian optimization;
- manual coefficient editing.

Any expanded search requires a new protocol version.

## 2022 tuning procedure

All hyperparameter selection occurs using **2022 only**.

2023 outcomes must not influence lambda selection.

### Frozen rolling-origin folds

Use provider week:

#### Fold A

- train: Weeks 1–4
- validate: Weeks 5–6

#### Fold B

- train: Weeks 1–6
- validate: Weeks 7–8

#### Fold C

- train: Weeks 1–8
- validate: Weeks 9–10

#### Fold D

- train: Weeks 1–10
- validate: Weeks 11–12

#### Fold E

- train: Weeks 1–12
- validate: Weeks 13–15

For every fold:

- scaler statistics are fit only on that fold's training games;
- ridge coefficients are fit only on that fold's training outcomes;
- validation rows use the frozen training scaler and coefficients;
- no later week contributes to an earlier fold.

Do not randomize or reshuffle games.

### Lambda-selection metric

For each lambda, concatenate all validation predictions from Folds A–E.

Primary metric:

```
MAE =
  mean(abs(predictedHomeMargin - homeMargin))
```

Secondary metric:

```
RMSE =
  sqrt(mean((predictedHomeMargin - homeMargin)^2))
```

Tie-break rule:

1. lower aggregate MAE;
2. if MAE differs by <= `1e-12`, lower aggregate RMSE;
3. if both differ by <= `1e-12`, choose the **larger lambda**.

The selected lambda is then frozen before 2023 confirmation metrics are calculated.

### Required 2022 diagnostics

Report for every lambda:

- each fold's train/validation game count;
- each fold MAE;
- each fold RMSE;
- aggregate validation MAE;
- aggregate validation RMSE;
- aggregate mean error;
- disabled-scaler features;
- coefficient vector per fold.

R² may be reported descriptively but is not a selection metric.

## Baselines

Two pre-registered baselines are required.

They are comparison controls, not alternate candidates to cherry-pick.

### Baseline 1 — home-field-only

Formula:

```
predictedHomeMargin =
    alpha
  + hfa * homeFieldIndicator
```

Both terms are unpenalized.

Fit separately on each training fold for 2022 tuning diagnostics and on full 2022 for
2023 confirmation.

### Baseline 2 — Elo + home field

Predictors:

- `eloDeltaZ`;
- `homeFieldIndicator`;
- intercept.

Elo baseline uses the same lambda grid:

```
[0.01, 0.1, 1, 10, 100]
```

Its lambda is selected independently using the same 2022 rolling-origin folds, MAE,
RMSE, and tie-break rules.

The Elo baseline exists to test whether the full V1 feature set adds value beyond the
strongest single frozen prior.

## One-shot 2023 development confirmation

After:

- primary candidate lambda is selected using 2022 only;
- Elo-baseline lambda is selected using 2022 only;
- a machine-readable Stage A selection manifest is written and hashed;

then the implementation may evaluate 2023.

The Stage A manifest must include:

- protocol ID/version;
- feature artifact identity;
- corpus outcome identity;
- selected primary lambda;
- selected Elo-baseline lambda;
- exact predictor list;
- missingness rules;
- scaling rules;
- 2022 CV metrics;
- code/repo SHA;
- SHA-256 of the manifest itself or an enclosing immutable artifact.

No V1 rule may change after that Stage A selection is frozen.

### 2023 training state

For 2023 confirmation:

- fit primary candidate on **all 2022 games**;
- fit all scaler statistics from 2022 only;
- fit Elo baseline on all 2022 games;
- fit home-field-only baseline on all 2022 games;
- apply those frozen 2022 states directly to all 750 2023 games;
- do not refit on any 2023 outcome before scoring all 2023 rows.

### 2023 confirmation metrics

For primary candidate and both baselines report:

- available prediction count;
- MAE;
- RMSE;
- mean error;
- median absolute error;
- R², descriptive only.

No ATS, CLV, ROI, market-spread error, or betting metric is permitted.

### 2023 confirmation gate

Primary candidate is `DEVELOPMENT_CONFIRMATION_PASS` only if all conditions hold:

1. predictions are available for all **750 / 750** 2023 games;
2. primary 2023 MAE is **strictly lower** than home-field-only baseline MAE;
3. primary 2023 MAE is **strictly lower** than Elo+HFA baseline MAE;
4. primary 2023 RMSE is **less than or equal to** Elo+HFA baseline RMSE;
5. all fitted/scaler values are finite;
6. no source/read/leakage blocker exists.

Otherwise status is:

`DEVELOPMENT_CONFIRMATION_FAIL`

and V1 stops before a 2022+2023 final refit.

Do not weaken the gate after observing results.

## Final 2022+2023 candidate refit

Only if the 2023 confirmation gate passes:

1. preserve the already-selected primary lambda;
2. combine all 1,484 development games;
3. fit scaler statistics on 2022+2023 Feature V1 only;
4. fit the primary ridge model once on all 1,484 `homeMargin` outcomes;
5. emit the frozen candidate model artifact.

No hyperparameter is retuned on the combined data.

Required frozen candidate state:

- selected lambda;
- 10 continuous scaler means;
- 10 continuous scaler population SDs;
- any disabled-scaler flags;
- intercept;
- HFA coefficient;
- 14 penalized coefficients;
- exact predictor ordering;
- missingness rules;
- source artifact identities;
- repo SHA;
- training game IDs;
- training season/week coverage;
- model definition hash.

The resulting candidate is **not production**.

Its next legal use is a separately contracted 2024 validation.

## No repeated 2023 optimization

V1 permits one legitimate 2023 confirmation evaluation after Stage A is frozen.

If the gate fails:

- do not tweak lambda;
- do not drop features;
- do not alter missingness;
- do not change HFA treatment;
- do not change folds;
- do not add interactions;
- do not re-run V1 as though 2023 were unseen.

Any subsequent development design must be a new protocol/model version and must
explicitly acknowledge that 2023 has become observed development evidence.

## Source-read boundary

The future development implementation may read only:

### Feature artifact

- `manifest.json`
- `report.json`
- `source_provenance.json`
- `features/game_features.json`

### Corpus artifact

- `manifest.json`
- `report.json`
- `source_provenance.json`
- `outcomes/outcomes.json`

It must not open corpus:

- `evaluation/market_lines.json`;
- `predictive/game_frames.json`;
- `predictive/static_priors.json`;
- `predictive/history_advanced.json`;
- `predictive/history_ppa.json`;
- `predictive/history_eligibility.json`;
- transfer-portal quarantine.

The model-development report must include a source-file read ledger.

## Market isolation

Historical betting lines are forbidden throughout V1 model development.

Do not use market evidence for:

- feature scaling;
- lambda selection;
- candidate gate;
- coefficient interpretation;
- residual filtering;
- game exclusion;
- HFA estimation;
- any model-design decision.

The old repository calibration notes that regress ratings against market spreads are
legacy context only and are **not** part of this protocol.

Later market evaluation requires a separately frozen evaluation/validation contract.

## 2024 and 2025 boundaries

### 2024

2024 remains untouched validation evidence.

This protocol does not authorize:

- 2024 provider calls;
- 2024 feature construction;
- 2024 outcome reads;
- 2024 market reads;
- 2024 model evaluation.

If V1 passes development confirmation and final refit is independently audited, the
next research contract should define a one-shot 2024 validation procedure.

### 2025

2025 remains locked final holdout.

It must not influence:

- lambda;
- scaling;
- predictor representation;
- missingness policy;
- HFA treatment;
- confirmation gates;
- candidate freeze;
- 2024 validation criteria.

## Determinism

V1 is deterministic.

Forbidden:

- random folds;
- random initialization;
- stochastic optimizer;
- random feature subsampling;
- bootstrap selection;
- repeated random cross-validation.

Linear solves must use deterministic ordering and fixed numerical tolerances.

Report all non-finite or singular-system failures explicitly.

Do not silently switch algorithms.

## Development metrics are not betting claims

MAE/RMSE development results measure final-score-margin fit.

They do not establish:

- ATS profitability;
- CLV;
- sportsbook edge;
- betting ROI;
- calibration to a market spread;
- official-card suitability.

No betting label or recommendation may be derived from this development run.

## Required development artifact

A future V1 development run must emit an immutable artifact containing at minimum:

1. source provenance;
2. Stage A 2022 tuning report;
3. Stage A frozen selection manifest/hash;
4. 2023 one-shot confirmation report;
5. baseline reports;
6. confirmation-gate result;
7. final 2022+2023 model state **only if gate passes**;
8. source-file read ledger;
9. QA/report file;
10. manifest with bytes and SHA-256 for every emitted file.

## QA / blockers

The implementation must fail closed on at least:

- feature ZIP hash mismatch;
- corpus ZIP hash mismatch;
- missing or duplicate target keys;
- Feature V1 / outcome target-key mismatch;
- season outside 2022/2023;
- non-finite available feature values;
- unexpected missingness state;
- dynamic PPA/success availability mismatch;
- non-finite target margin;
- unauthorized source member read;
- 2023 use before Stage A selection freeze;
- lambda outside frozen grid;
- fold membership outside frozen week ranges;
- scaler fitted using validation rows;
- any market-member read;
- any 2024/2025 row;
- coefficient/scaler non-finite;
- repeated Stage A selection within one purported immutable V1 run.

## Audited V1 development run

Historical Model Development V1 was executed once in GitHub Actions run
`36494166168` at builder SHA
`ed57d43ebbfd7b2fdbd68237ec7f41a3832d168f`.

Independent audit closeout is recorded in
[`docs/2026-09-28-historical-model-development-v1-audit.md`](../../docs/2026-09-28-historical-model-development-v1-audit.md).

Accepted development artifact:

- artifact ID: `11002393824`
- artifact name: `historical-model-development-v1-36494166168`
- ZIP SHA-256:
  `bb0a9233c4de18c317b35d13cc6bacefadc4e359fe4de8e52addad3ec523e313`

Frozen Stage A selection SHA-256:

`bcc28dbc02b177690136f192bd71f16110a3d05319c91d67ef5e6888f90c5858`

Frozen development result:

- selected primary lambda: **100**
- selected Elo-baseline lambda: **100**
- 2023 confirmation status: `DEVELOPMENT_CONFIRMATION_PASS`
- final 2022+2023 candidate emitted: **yes**
- final candidate payload SHA-256:
  `8c6f1d053ff85e401f8acda5cba9ace7f54e5aaee6d9b46117a3c4dd690f1a53`

The independently audited frozen candidate is:

`historical_ridge_margin_v1`

It is a **development candidate only**, not a production model.

## What remains unauthorized

The audited V1 result does **not** authorize:

- production deployment;
- database persistence;
- Generic Shadow changes;
- official prediction changes;
- lambda retuning;
- coefficient/scaler changes;
- feature-definition changes;
- 2024 capture/use;
- 2025 access;
- market evaluation.

## Next authorization boundary

2024 Historical Validation V1 is now frozen separately in
[`HISTORICAL_VALIDATION_V1_CONTRACT.md`](./HISTORICAL_VALIDATION_V1_CONTRACT.md).

Merging that validation contract does not authorize a 2024 provider call or validation
score.

The next reviewed engineering slice may implement the 2024 capture/corpus/feature and
validation-scoring capability while preserving the frozen candidate exactly:

- lambda unchanged;
- coefficients unchanged;
- scaler unchanged;
- feature semantics unchanged;
- HFA treatment unchanged.

A separate explicit authorization remains required before the first 2024 provider
capture, and another explicit authorization remains required before the one-shot 2024
outcome-scoring run.

2025 remains locked as the final holdout.

## Versioning

Any change to the following requires a new protocol version:

- model family;
- predictor list;
- home/away representation;
- standardization;
- missing-value handling;
- HFA treatment;
- lambda grid;
- CV folds;
- primary/secondary metric;
- tie-break rule;
- baselines;
- 2023 confirmation gate;
- final-refit rule;
- source-read boundary.

V1 must not drift after development results are observed.
