# 2024 Historical Validation V1 — Contract

**Status:** FROZEN VALIDATION DESIGN — 2024 INPUT BLOCKED BEFORE SCORING  
**Frozen candidate:** `historical_ridge_margin_v1`  
**Development seasons already consumed:** 2022 tuning / 2023 one-shot confirmation  
**Validation season:** 2024 only  
**Final holdout:** 2025 — locked  
**Does not authorize:** 2024 provider calls, 2024 capture execution, validation-feature generation, 2024 outcome scoring, market evaluation, candidate refit, retuning, production deployment, or 2025 access

## Purpose

2024 Historical Validation V1 defines the one-shot out-of-sample validation procedure
for the independently audited frozen development candidate:

`historical_ridge_margin_v1`

The contract is frozen **before** any 2024 provider capture or candidate scoring.

Its purpose is to prevent 2024 from becoming another tuning season.

2024 may answer only:

> Does the already-frozen candidate retain value on an unseen season under the same
> feature semantics and pre-registered comparison gate?

2024 must not answer:

- which lambda should have been chosen;
- which coefficients should change;
- which features should be added or removed;
- whether the scaler should change;
- how HFA should be changed;
- whether missingness rules should be rewritten;
- whether market information should enter the model.

Those decisions are frozen for V1.

## Frozen candidate identity

The only candidate authorized for 2024 validation is the independently audited
development candidate emitted by run `36494166168`.

Development artifact:

- artifact ID: `11002393824`
- artifact name: `historical-model-development-v1-36494166168`
- artifact ZIP SHA-256:
  `bb0a9233c4de18c317b35d13cc6bacefadc4e359fe4de8e52addad3ec523e313`

Frozen Stage A selection SHA-256:

`bcc28dbc02b177690136f192bd71f16110a3d05319c91d67ef5e6888f90c5858`

Frozen candidate member:

- file: `candidate/final_candidate.json`
- SHA-256:
  `8c6f1d053ff85e401f8acda5cba9ace7f54e5aaee6d9b46117a3c4dd690f1a53`

Candidate model definition:

- modelDefinitionId: `historical_ridge_margin_v1`
- lambda: **100**
- training games: **1,484**
- development seasons: 2022 and 2023
- coefficient count: **16**
- continuous scaler count: **10**

The validation scorer must verify the exact development artifact ZIP and exact candidate
member SHA before scoring.

No reconstructed, rounded, manually copied, or refit candidate is valid.

## Validation posture

2024 is **one-shot validation evidence**.

The candidate has already seen:

- 2022 as tuning/model-selection evidence;
- 2023 as one-shot development-confirmation evidence.

It has not seen:

- 2024 outcomes;
- 2025 final-holdout outcomes.

Once 2024 validation metrics are revealed:

- V1 may not change and rerun as if 2024 were unseen;
- any new model design becomes a new version;
- 2024 must then be treated as observed evidence for that later version.

## Required validation sequence

The legal V1 sequence is:

1. freeze this 2024 validation contract;
2. implement 2024 snapshot/corpus/feature/validation capability without provider calls;
3. independently review and merge the capability;
4. separately authorize one 2024 historical snapshot capture;
5. independently audit the 2024 snapshot before model use;
6. build a 2024 validation corpus from that exact audited snapshot;
7. independently audit the validation corpus;
8. build Feature V1 for 2024 using the frozen Feature V1 semantics;
9. independently audit the 2024 feature artifact;
10. freeze/hash the exact 2024 validation feature artifact;
11. freeze/hash the deterministic 2022+2023 validation-control baselines;
12. only then read 2024 outcomes and score the frozen candidate once;
13. independently audit the one-shot validation result;
14. only after an audited validation pass may a separate 2025 final-holdout contract be
    considered.

A later step must not be used to repair an earlier failed gate.

## Phase 1 — 2024 historical snapshot

### Capability boundary

A later implementation slice may enable Historical Research Snapshot V1 for season
2024.

Merging this contract does **not** itself authorize the provider run.

The eventual exact manual confirmation must be:

`CAPTURE_2024_HISTORICAL_RESEARCH_SNAPSHOT_PREVIEW`

The run must:

- execute from `refs/heads/main`;
- require exact current `expected_main_sha`;
- use CFBD only;
- preserve the existing hard maximum of **32 provider calls**;
- write exact provider bytes before parsing;
- remain artifact-only;
- perform zero production database reads/writes;
- invoke no Prisma path;
- invoke no Odds API, SGO, weather, or other provider.

### 2024 request plan

Use the same Historical Research Snapshot V1 request family already frozen for prior
seasons:

1. regular-season FBS games;
2. historical lines;
3. advanced game stats;
4. PPA games;
5. team talent;
6. returning production;
7. transfer portal;
8–11. four recruiting classes;
12. preseason Elo;
13+. one weekly Elo snapshot for each observed regular-season FBS-vs-FBS provider week.

For 2024, recruiting classes are:

- 2021;
- 2022;
- 2023;
- 2024.

Historical lines remain evaluation-only evidence and are not model inputs.

Transfer portal remains quarantined and is not a Feature V1 input.

### Canonical 2024 universe

Do **not** hard-code a pre-capture number of FBS teams or games.

The authoritative 2024 validation universe is derived from the exact 2024 CFBD games
payload captured by the guarded snapshot run.

Canonical target game criteria:

- season = 2024;
- regular season;
- home classification = FBS;
- away classification = FBS;
- game completed.

The snapshot audit must freeze:

- exact canonical game count;
- exact canonical team count;
- observed provider weeks;
- exact provider game IDs;
- exact provider team identities.

No fuzzy team matching is allowed.

### Snapshot acceptance

The 2024 snapshot is usable for validation only after independent audit confirms:

- source ZIP hash;
- every manifested raw file hash/byte count;
- provider-call accounting;
- all intended calls succeeded;
- no call-budget breach;
- canonical game universe is non-empty and completed;
- canonical advanced coverage is exactly two team-game rows per canonical game;
- canonical PPA coverage is exactly two team-game rows per canonical game;
- talent/returning/recruiting/preseason-Elo missingness is reported explicitly;
- weekly Elo files exist for each observed provider week;
- zero database activity;
- zero prohibited-provider activity.

Historical-line coverage is reported but is **not** a validation acceptance criterion
for the predictive candidate because market evidence is not used.

If the snapshot audit fails, V1 stops before corpus/feature/scoring.

## Historical Elo mapping

Historical Elo PIT V1 remains unchanged for 2024:

- target Week 1 -> 2024 preseason Elo;
- target Week N, N >= 2 -> 2024 Week N-1 Elo;
- same-week Week N Elo -> prohibited.

The 2024 snapshot audit must check that the captured weekly Elo family does not reveal a
semantic contradiction to the already-frozen provider-week interpretation.

If 2024 provider behavior materially contradicts the frozen Elo semantics, validation
is blocked before scoring.

No game-payload pregame/postgame Elo substitution is allowed.

## Phase 2 — 2024 validation corpus

The validation corpus is a separate 2024 artifact.

It must not modify the accepted 2022–2023 development corpus.

### Validation-corpus layers

Preserve the same logical separation used by Historical Development Corpus V1:

#### Predictive

- game identity / prediction frame;
- static priors;
- eligible prior-game advanced history;
- prior-game eligibility references.

#### Outcome

- final home points;
- final away points;
- `homeMargin = finalHomePoints - finalAwayPoints`.

#### Evaluation-only

- historical market-line evidence.

#### Quarantine

- transfer-portal evidence.

The predictive validation builder must not read target outcomes or market evidence.

### Prior-game history

The 2024 corpus may preserve captured FBS-team rows from regular-season FBS-vs-FCS
games as raw historical evidence if the source endpoint contains them.

That does **not** make those games canonical validation targets.

Feature V1 continues to exclude FBS-vs-FCS history from model form.

### Timing

A target game's in-season history may reference only source rows with:

`source provider week < target provider week`

Same-week rows are prohibited even when their kickoff was earlier in the same provider
week.

Week 1 in-season history is empty.

## Phase 3 — 2024 Feature V1

The 2024 validation feature artifact must apply **Historical Feature Definition V1
exactly**.

No Feature V2 is permitted inside this validation.

### Frozen team-side feature families

Use:

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

For 2024:

- Y0 = 2024;
- Y1 = 2023;
- Y2 = 2022;
- Y3 = 2021.

Dynamic form remains:

- canonical FBS-vs-FBS prior history only;
- strict earlier-provider-week history;
- equal-game arithmetic means;
- no recency weighting;
- no opponent adjustment;
- no market feature;
- no portal feature;
- no outcome-derived feature.

### Season-static timing caveat

Talent, returning production, and recruiting remain retrospective season-static
candidate priors.

The 2024 validation claim must not be described as a timestamp-perfect reconstruction
of what was publicly available at every historical 2024 kickoff.

This validation is retrospective out-of-sample model validation under the frozen
source semantics, not a claim of a live 2024 trading backtest.

## 2024 missingness policy

The candidate's missingness behavior is frozen before 2024 is opened.

### Allowed missingness families

The already-frozen model has explicit missingness handling for:

- returning production;
- recruiting Y0;
- recruiting Y1;
- dynamic form.

For those families, a recognized Feature V1 non-available state is allowed for any
2024 team identity.

Allowed behavior:

- raw continuous standardized value = **0** using the frozen candidate scaler space;
- the corresponding signed home-minus-away missingness indicator remains active.

This rule is feature-family based, not team-name based.

A 2024 team does not need to be one of the specific 2022–2023 teams that originally
exhibited the missingness.

### Dynamic-form missingness

`ppaNet` and `successNet` must have the same availability state for each team side.

If both are unavailable:

- both standardized continuous values = 0;
- `formMissingDelta` handles the missingness.

If one is available and the other unavailable:

- validation input status = **BLOCKED**.

### Required available families

The following must be available and finite for every 2024 team side:

- Elo;
- talent;
- recruiting Y2;
- recruiting Y3;
- priorFbsGames.

`priorFbsGames = 0` is a valid available value.

It is not missingness.

Any unavailable required family blocks validation before outcomes are scored.

### Recognized statuses

Only Feature V1's frozen statuses are legal:

- `AVAILABLE`
- `SOURCE_ROW_UNAVAILABLE`
- `FIELD_VALUE_UNAVAILABLE`
- `NO_PRIOR_FBS_GAMES`

A new status requires a new contract/version.

### Out-of-range values

An available 2024 raw value outside the 2022–2023 development range is **not** clipped
and is not a blocker by itself.

Apply the frozen candidate scaler exactly.

The validation report should record descriptive counts of large absolute standardized
values, for example:

- `|z| > 4`;
- `|z| > 6`.

Those diagnostics must not change scoring rules.

## Frozen candidate application

The final candidate's scaler and coefficients are reused exactly.

Do not:

- recompute scaler means from 2024;
- recompute scaler standard deviations from 2024;
- refit any coefficient;
- change lambda;
- re-estimate HFA;
- add/remove predictors;
- clip feature deltas;
- recalibrate predictions against 2024 outcomes.

For every continuous feature:

```
z_2024 =
  (raw_2024 - frozen_development_mean)
  /
  frozen_development_population_sd
```

For allowed unavailable continuous values:

```
z_2024 = 0
```

Game predictor remains:

```
home z - away z
```

using the frozen coefficient ordering in the final candidate artifact.

## Validation control baselines

2024 validation uses two pre-registered controls.

They are not alternate candidates and cannot be chosen after seeing 2024.

### Validation baseline 1 — HFA-only

Before any 2024 outcome scoring:

- fit intercept + non-neutral home-field indicator on all accepted 2022+2023
  development games;
- no penalty;
- emit and hash the baseline state.

### Validation baseline 2 — Elo + HFA

Before any 2024 outcome scoring:

- use the already-selected Elo-baseline lambda = **100**;
- fit Elo scaler on all accepted 2022+2023 development team sides only;
- fit intercept + home-field indicator + Elo delta on all 1,484 development games;
- intercept and HFA remain unpenalized;
- Elo coefficient receives lambda 100;
- emit and hash the baseline state.

No 2024 row may influence baseline fitting or scaling.

The two baseline-state hashes must be frozen before 2024 outcomes are read by the
validation scorer.

## Pre-score validation-input freeze

Before one-shot 2024 scoring, create an immutable validation-input manifest that records
at minimum:

- validation-contract version;
- candidate artifact ZIP SHA;
- candidate member SHA;
- Stage A SHA;
- audited 2024 snapshot artifact/hash;
- audited 2024 validation corpus artifact/hash;
- audited 2024 Feature V1 artifact/hash;
- canonical 2024 game count and game IDs;
- 2024 Feature V1 availability/missingness counts;
- frozen HFA-baseline state/hash;
- frozen Elo-baseline state/hash;
- repo SHA;
- explicit assertions that candidate lambda/scaler/coefficients are unchanged.

Write and hash this manifest before 2024 outcomes are opened by the scoring stage.

The scorer must re-read and verify the exact frozen manifest bytes.

## Validation outcome source

The only target is:

```
homeMargin = finalHomePoints - finalAwayPoints
```

from the audited 2024 validation corpus outcome sidecar.

The scorer may open the outcome sidecar only after:

- snapshot audit passes;
- validation corpus audit passes;
- 2024 Feature V1 audit passes;
- pre-score validation-input manifest is frozen and hashed;
- baseline states are frozen and hashed.

## One-shot 2024 metrics

For:

- frozen primary candidate;
- frozen Elo + HFA validation baseline;
- frozen HFA-only validation baseline;

report:

- prediction count;
- MAE;
- RMSE;
- mean error;
- median absolute error;
- descriptive R².

Also report by provider week descriptively:

- game count;
- MAE;
- mean error.

Week-level metrics are diagnostics only and cannot alter the pass/fail rule.

No ATS, CLV, ROI, spread-error-to-market, or betting metric is permitted.

## 2024 validation statuses

### VALIDATION_INPUT_BLOCKED

Use:

`HISTORICAL_VALIDATION_INPUT_BLOCKED`

if any pre-score source/input requirement fails, including:

- snapshot audit failure;
- corpus audit failure;
- feature audit failure;
- required-feature missingness;
- dynamic-form availability mismatch;
- non-finite candidate state;
- candidate hash mismatch;
- baseline-state freeze failure;
- source/read leakage blocker.

If input is blocked:

- do not score outcomes;
- do not produce partial validation metrics;
- 2025 remains locked.

### HISTORICAL_VALIDATION_PASS

Use:

`HISTORICAL_VALIDATION_PASS`

only if all pre-score input gates pass **and** all conditions below hold:

1. primary predictions are available for **100% of the audited canonical 2024 games**;
2. Elo-baseline predictions are available for 100%;
3. HFA-baseline predictions are available for 100%;
4. primary 2024 MAE is **strictly lower** than HFA-only baseline MAE;
5. primary 2024 MAE is **strictly lower** than Elo + HFA baseline MAE;
6. primary 2024 RMSE is **less than or equal to** Elo + HFA baseline RMSE;
7. every candidate/scaler/coefficient value is finite;
8. frozen candidate hash is unchanged;
9. no source/read/leakage blocker exists.

### HISTORICAL_VALIDATION_FAIL

If the validation inputs are valid but any metric gate above fails, use:

`HISTORICAL_VALIDATION_FAIL`

Do not weaken the gate after observing 2024.

## No 2024 refit or tuning

Regardless of validation result, V1 forbids:

- lambda retuning;
- coefficient refitting;
- scaler refitting;
- HFA adjustment;
- feature removal;
- feature addition;
- feature reweighting;
- changing the missingness policy;
- changing the validation baselines;
- changing the pass/fail gate.

The accepted 2024 result is a test of the frozen candidate, not a development input for
V1.

## Market isolation

Historical lines may be present in the 2024 snapshot/corpus for evidence durability.

They remain inaccessible to:

- 2024 Feature V1 construction;
- baseline-state construction;
- candidate scoring;
- validation gating.

The validation scorer must record market-member reads = **0**.

No betting interpretation may be attached to the validation result.

## What a validation pass means

A pass means only:

> The frozen 2022–2023 candidate satisfied the pre-registered out-of-sample 2024
> margin-prediction gate against the frozen control baselines.

It does not mean:

- production-ready;
- profitable against betting markets;
- calibrated to sportsbook spreads;
- approved for official picks;
- approved for deployment.

## What happens after PASS

After an independently audited validation pass is merged into repository truth:

1. the candidate remains byte-for-byte unchanged;
2. 2024 is permanently marked observed validation evidence;
3. a separate **2025 Final Holdout V1 contract** may be designed;
4. 2025 remains locked until that separate contract is frozen and its execution is
   explicitly authorized.

Do not refit the candidate on 2024 before final holdout.

## What happens after FAIL

If 2024 validation fails:

- V1 candidate does not proceed automatically to 2025;
- 2025 remains locked;
- do not repair V1 using 2024 and rerun V1;
- any revised model must use a new model/protocol version;
- that new protocol must explicitly acknowledge that 2023 and 2024 are observed
  evidence.

A later new-version design may choose to use 2022–2024 as development evidence, but it
must be frozen before any 2025 final-holdout outcome is opened.

## 2025 boundary

2025 remains unavailable for:

- feature selection;
- lambda selection;
- coefficient changes;
- scaler changes;
- validation-gate design;
- baseline selection;
- HFA changes;
- market-threshold design.

The already-captured 2025 snapshot remains sealed from model-development and validation
decisions except for its previously completed pipeline/endpoint-semantic audits.

## Source-read requirements

### Snapshot capture

Provider access is CFBD-only.

### Validation corpus / feature build

May read only the exact audited 2024 snapshot members required by the frozen corpus and
Feature V1 semantics.

Must not use historical lines, portal evidence, or target outcomes as predictive inputs.

### Pre-score baseline build

May read only:

- accepted 2022–2023 Feature V1;
- accepted 2022–2023 outcome sidecar.

May not read 2024 outcomes.

### Validation scorer

May read only:

- frozen development candidate;
- frozen validation-input manifest;
- audited 2024 Feature V1;
- audited 2024 outcome sidecar;
- frozen validation baseline states.

Must not read:

- 2024 historical lines;
- portal quarantine;
- raw 2024 provider predictive files;
- 2025 data.

Each stage must emit a source-member read ledger.

## Determinism

All validation construction/scoring is deterministic.

Forbidden:

- random subsampling;
- bootstrap evaluation;
- random baseline fitting;
- stochastic optimizer;
- random game exclusion;
- manual game deletion after reviewing errors.

No game may be excluded based on prediction residual or result.

## Required immutable validation evidence

The completed V1 validation program must ultimately preserve:

1. audited 2024 historical snapshot;
2. audited 2024 validation corpus;
3. audited 2024 Feature V1 artifact;
4. frozen validation-control baseline states;
5. frozen pre-score validation-input manifest/hash;
6. one-shot 2024 prediction rows for all three models;
7. one-shot 2024 metrics;
8. validation status;
9. source-read ledgers;
10. final manifest with byte counts/SHA-256 for every emitted file.

## What remains unauthorized

Merging this contract does **not** authorize:

- enabling/calling the 2024 provider workflow;
- 2024 provider calls;
- 2024 snapshot execution;
- 2024 corpus construction;
- 2024 feature generation;
- baseline-state execution;
- 2024 outcome scoring;
- market evaluation;
- candidate refitting;
- production deployment;
- 2025 access.

## Next sequence after contract merge

1. implement 2024 snapshot authorization/capability and guarded workflow;
2. implement artifact-only 2024 validation corpus/Feature V1 builders;
3. implement deterministic validation baseline/scoring engine;
4. add synthetic tests for unseen missingness, candidate-hash locks, baseline freezes,
   source isolation, and pass/fail/input-blocked outcomes;
5. review/merge capability without executing provider/scoring runs;
6. explicitly authorize one 2024 snapshot capture;
7. audit snapshot;
8. build/audit 2024 corpus and Feature V1;
9. explicitly authorize one one-shot 2024 validation scoring run;
10. audit validation;
11. only after an audited PASS may 2025 holdout-contract work begin.

## Audited 2024 input-blocked result

The first authorized 2024 snapshot capture was executed in GitHub Actions run
`36508377627` at source SHA
`e1b27f6c5681f6ab4f8d24e50f88e387c64657a7`.

Independent audit is recorded in:

[`docs/2026-09-29-historical-validation-v1-input-blocked-audit.md`](../../docs/2026-09-29-historical-validation-v1-input-blocked-audit.md)

Preserved failed snapshot artifact:

- artifact ID: `11008470975`
- artifact name:
  `historical-research-snapshot-v1-2024-36508377627`
- ZIP SHA-256:
  `b41e934b26952100e7e056a56114dc81df6bbe77f5c787f28b75b646ae7ea544`
- provider calls: **28 / 28 successful**
- database reads/writes: **0 / 0**

The frozen V1 status is:

`HISTORICAL_VALIDATION_INPUT_BLOCKED`

The candidate was **not scored on 2024**.

Independent blockers include:

1. advanced-game coverage missing four completed canonical games;
2. PPA sidecar coverage missing three completed canonical games;
3. required recruiting Y2 / 2022-class coverage missing for:
   - Florida International;
   - Kennesaw State.

The Y2 gap alone blocks V1 because recruiting Y2 was pre-registered as
required-available for every validation side and the validation pass/fail gate requires
predictions for 100% of canonical games.

The 2024 snapshot also exposed one implementation defect:

- Liberty @ App State is present as `completed=false`;
- the shared snapshot QA used all regular FBS-vs-FBS rows rather than only completed
  rows as its canonical denominator.

That implementation defect should be repaired separately for correctness, but fixing
it does not unblock V1.

No V1 rule may be weakened after this observed result.

2025 remains locked.

Any revised model/validation path requires a new version and must explicitly acknowledge
that 2024 source evidence is now observed.

## Retired V1 2024 capture workflow

After the audited V1 input-block closeout, the manual workflow:

`.github/workflows/capture-historical-research-snapshot-v1-2024.yml`

is retired and removed from the active repository.

This retirement does **not** delete or invalidate historical evidence.

The canonical preserved V1 attempt remains:

- run: `36508377627`
- artifact ID: `11008470975`
- artifact ZIP SHA-256:
  `b41e934b26952100e7e056a56114dc81df6bbe77f5c787f28b75b646ae7ea544`

V1 must not expose a new 2024 provider-dispatch path after its status became
`HISTORICAL_VALIDATION_INPUT_BLOCKED`.

Any new provider work belongs to a separately versioned research path.

## Future research path after V1 input block

Historical Validation V1 is closed as:

`HISTORICAL_VALIDATION_INPUT_BLOCKED`

Future research must not modify or rerun V1 as if 2024 source evidence were unseen.

The separately versioned continuation is frozen in:

[`HISTORICAL_SOURCE_RESOLUTION_CONFIRMATION_V2_CONTRACT.md`](./HISTORICAL_SOURCE_RESOLUTION_CONFIRMATION_V2_CONTRACT.md)

V2 explicitly treats 2024 source availability as observed while preserving the fact that
no legal 2024 V1 model-performance score occurred.

2025 remains locked.

## Versioning

Any change to the following requires a new validation contract version:

- canonical 2024 game definition;
- snapshot source family;
- Elo timing;
- Feature V1 semantics;
- missingness policy;
- frozen candidate identity;
- candidate scaler/coefficient state;
- validation baseline definitions;
- validation metrics;
- validation pass/fail gate;
- market isolation;
- source-read boundary;
- 2025 unlock rule.

Validation V1 must not drift after 2024 evidence is observed.
