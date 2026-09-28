# Historical Model Development V1 — Independent Audit Closeout

**Date:** 2026-09-28  
**Development run:** `36494166168`  
**Builder source SHA:** `ed57d43ebbfd7b2fdbd68237ec7f41a3832d168f`  
**Workflow:** Run Historical Model Development V1 (Manual, Guarded)

## Bottom line

Historical Model Development V1 passed independent audit.

The one legitimate V1 development run:

- tuned only on 2022;
- froze and hashed Stage A before any 2023 scoring;
- evaluated 2023 exactly once under the frozen confirmation rules;
- passed the pre-registered 2023 development-confirmation gate;
- emitted the final 2022+2023 frozen candidate using the already-selected lambda;
- read no historical market data;
- made no provider calls;
- performed no database access;
- did not open 2024 or 2025 evidence.

Independent recomputation from the accepted Historical Feature V1 and accepted outcome
sidecar reproduced:

- every Stage A lambda result;
- every frozen-fold metric;
- the selected lambdas;
- the full 2022-fitted primary coefficient vector;
- all 750 primary 2023 predictions;
- all 750 Elo-baseline 2023 predictions;
- all 750 HFA-baseline 2023 predictions;
- all three 2023 metric sets;
- the final 1,484-game candidate coefficients;
- the final candidate scaler state.

The final candidate is accepted as **FROZEN DEVELOPMENT CANDIDATE** for a later,
separately contracted 2024 validation.

This result is not production promotion and is not a betting-performance claim.

## Workflow execution boundary

Run `36494166168`:

- event: `workflow_dispatch`
- branch: `main`
- source SHA: `ed57d43ebbfd7b2fdbd68237ec7f41a3832d168f`
- conclusion: **success**
- source SHA guard: **pass**
- exact confirmation guard: **pass**
- frozen Feature V1 artifact download: **pass**
- frozen corpus artifact download: **pass**
- both frozen ZIP hash checks: **pass**
- `npm ci --ignore-scripts`: **pass**
- direct TypeScript compile: **pass**
- model-development run: **pass**
- immutable artifact upload: **pass**

Execution boundaries independently confirmed:

- provider calls: **0**
- database reads: **0**
- database writes: **0**
- Prisma invoked: **no**
- market reads: **0**
- raw corpus predictive reads: **0**
- quarantine reads: **0**
- 2024 included: **no**
- 2025 included: **no**

The repository's existing npm vulnerability warnings during dependency installation are
not model-development evidence and do not change this audit result.

## Frozen source verification

### Historical Feature V1

- source run: `36489184409`
- artifact ID: `11000651389`
- ZIP SHA-256:
  `047220307750b755d1e6d626628802baf818dbd70ffde9252e63768e7a823ad2`
- feature payload SHA-256:
  `9ab89dce2eee84fce0c69bae9bb5511d941a8bef1731adbfd36610703c86e74a`

Independent local digest verification matched the frozen ZIP identity exactly.

The development artifact's recorded Feature V1 metadata digests also matched the
accepted source bytes exactly:

- manifest:
  `f5290ae62eea0fea58030e17f45558c018e8a3b8b3b526adf9f4f113ab367258`
- report:
  `126c95993cd79529638c603e06ae17c7a93aeaec9c57dda98d7aac99bb6c63e9`
- source provenance:
  `fef3d20d8b7214a7684e6a5db7e2f5ac93dd0cd43f5078bdbb0f39a63c7abc80`

### Historical Development Corpus V1 outcomes

- source run: `36479515332`
- artifact ID: `10997010171`
- ZIP SHA-256:
  `cea83762d2b6e492caec680a74a085ef5a5e283c36a402ef4b35acbe2ce22b7d`
- outcome payload SHA-256:
  `9fd9f98d286fa78cabbe13f62ed70289bd2e84fc6b301f2668121fed47f4c549`

Independent local digest verification matched the frozen corpus ZIP exactly.

Recorded corpus metadata digests also matched exactly:

- manifest:
  `2fb0419095d9c870b46737a36f4bf2f8a88002aea2610b5c4f918d917b8fba98`
- report:
  `baa2223e5c81824e5d44a5ec1efc0df3fae71000c4b114de9f9ed0e888d6d465`
- source provenance:
  `ca3c5b6e58a75cc4e5142b8f6bc987de7921b5e41643d22c118b7024f1e3c97b`

## Development artifact integrity

GitHub uploaded:

- artifact ID: `11002393824`
- artifact name: `historical-model-development-v1-36494166168`
- ZIP bytes: **122,629**
- GitHub ZIP SHA-256:
  `bb0a9233c4de18c317b35d13cc6bacefadc4e359fe4de8e52addad3ec523e313`

Independent verification of the downloaded ZIP produced the exact same SHA-256.

The ZIP contains exactly **9 files**:

- **8** files covered by `manifest.json`;
- `manifest.json` itself.

Independent verification found:

- manifested files checked: **8 / 8**
- SHA-256 mismatches: **0**
- byte-count mismatches: **0**
- unexpected files: **0**
- missing files: **0**

Important manifested identities:

- final candidate:
  `candidate/final_candidate.json`
  - bytes: **25,396**
  - SHA-256:
    `8c6f1d053ff85e401f8acda5cba9ace7f54e5aaee6d9b46117a3c4dd690f1a53`
- confirmation report:
  `confirmation/confirmation_report.json`
  - bytes: **568,033**
  - SHA-256:
    `9c93c5c3639876b19ff56c62c538fdad0274edf21eb3a6a275091ac9e8459142`
- Stage A selection:
  `stage_a/stage_a_selection.json`
  - bytes: **82,272**
  - SHA-256:
    `bcc28dbc02b177690136f192bd71f16110a3d05319c91d67ef5e6888f90c5858`

## Stage A freeze audit

Stage A used **2022 only**:

- feature rows: **734**
- outcome rows: **734**
- 2023 rows in Stage A: **0**

The exact frozen rolling-origin folds were reproduced:

| Fold | Train weeks | Validation weeks | Train games | Validation games |
|---|---|---|---:|---:|
| A | 1–4 | 5–6 | 210 | 114 |
| B | 1–6 | 7–8 | 324 | 103 |
| C | 1–8 | 9–10 | 427 | 107 |
| D | 1–10 | 11–12 | 534 | 125 |
| E | 1–12 | 13–15 | 659 | 75 |

Total concatenated validation predictions per lambda: **524**.

### Stage A hash boundary

The builder wrote the Stage A selection before 2023 scoring.

Independent audit found:

- emitted Stage A SHA-256:
  `bcc28dbc02b177690136f192bd71f16110a3d05319c91d67ef5e6888f90c5858`
- independently recomputed SHA-256:
  **exact match**
- companion `.sha256` file:
  **exact match**
- confirmation report Stage A reference:
  **exact same hash**
- final candidate Stage A reference:
  **exact same hash**

This verifies the Stage A selection was frozen and addressable before the 2023
confirmation result.

## 2022 lambda-selection audit

Frozen grid:

```
[0.01, 0.1, 1, 10, 100]
```

### Primary model

| Lambda | 2022 rolling MAE | 2022 rolling RMSE |
|---:|---:|---:|
| 0.01 | 12.758677 | 16.485437 |
| 0.1 | 12.732174 | 16.439475 |
| 1 | 12.559053 | 16.193754 |
| 10 | 12.396292 | 15.954333 |
| 100 | **12.365882** | **15.907253** |

Selected primary lambda: **100**.

### Elo + HFA baseline

| Lambda | 2022 rolling MAE | 2022 rolling RMSE |
|---:|---:|---:|
| 0.01 | 12.607928 | 16.232394 |
| 0.1 | 12.607645 | 16.232027 |
| 1 | 12.604815 | 16.228388 |
| 10 | 12.577694 | 16.194248 |
| 100 | **12.444355** | **16.017803** |

Selected Elo-baseline lambda: **100**.

### HFA-only baseline

2022 rolling aggregate:

- MAE: **14.803867**
- RMSE: **19.131565**

### Independent reproduction

For every lambda and every frozen fold, independent recomputation matched:

- train counts;
- validation counts;
- fold MAE;
- fold RMSE;
- mean error;
- median absolute error;
- descriptive R²;
- coefficient vectors.

Maximum absolute independent-vs-artifact difference was approximately
`1.1e-14` for reported metrics and `7.2e-15` for Stage A coefficients, consistent
with ordinary double-precision arithmetic.

### Boundary observation

Both the primary model and Elo baseline selected the **largest pre-registered lambda,
100**.

Their 2022 rolling MAE/RMSE improved through the frozen grid toward that boundary.

This is a legitimate V1 result, not an authorization to expand the lambda grid after
observing 2023.

V1 remains frozen at lambda 100.

Any future exploration of stronger regularization must be a new model/protocol version
and must acknowledge that 2023 is now observed development evidence.

## One-shot 2023 confirmation

The frozen Stage A state was then fit on all 2022 games and applied to all **750**
2023 games without refitting on 2023.

Independent audit reproduced all 750 prediction rows for all three models.

### Primary candidate

- predictions: **750 / 750**
- MAE: **12.386045**
- RMSE: **15.788118**
- mean error: **−0.493801**
- median absolute error: **10.184768**
- descriptive R²: **0.384827**

### Elo + HFA baseline

- predictions: **750 / 750**
- MAE: **12.860880**
- RMSE: **16.372599**
- mean error: **−0.493403**
- median absolute error: **10.806450**
- descriptive R²: **0.338436**

### HFA-only baseline

- predictions: **750 / 750**
- MAE: **15.768351**
- RMSE: **20.137540**
- mean error: **−0.095060**
- median absolute error: **12.800000**
- descriptive R²: **−0.000805**

Descriptively, the primary candidate's 2023 MAE was:

- **0.474834 points lower** than Elo + HFA;
- approximately **3.69% lower** than Elo + HFA;
- **3.382305 points lower** than HFA-only.

Its RMSE was **0.584481 points lower** than Elo + HFA.

These are development-confirmation results only. They are not 2024 validation or
betting-performance results.

## Frozen 2023 confirmation gate

The pre-registered gate required:

1. all 750 primary predictions available;
2. primary MAE strictly below HFA-only MAE;
3. primary MAE strictly below Elo + HFA MAE;
4. primary RMSE <= Elo + HFA RMSE;
5. finite model/scaler state;
6. no source/leakage blocker.

Independent result:

- 750/750 predictions: **PASS**
- MAE beats HFA-only: **PASS**
- MAE beats Elo + HFA: **PASS**
- RMSE no worse than Elo + HFA: **PASS**
- finite state: **PASS**
- source/leakage boundary: **PASS**

Frozen status:

`DEVELOPMENT_CONFIRMATION_PASS`

The V1 confirmation gate therefore passed without post-result rule changes.

## Final 2022+2023 candidate refit

Because the confirmation gate passed, the protocol permitted one final refit on all
development games.

Final state:

- model definition: `historical_ridge_margin_v1`
- lambda: **100**
- training games: **1,484**
- 2022 training games: **734**
- 2023 training games: **750**
- training weeks: **1–15** in each season
- coefficient count: **16**
- continuous scaler count: **10**
- disabled zero-variance scalers: **0**
- Stage A hash linkage:
  `bcc28dbc02b177690136f192bd71f16110a3d05319c91d67ef5e6888f90c5858`

Final coefficients, in frozen order:

| Coefficient | Value |
|---|---:|
| intercept | 0.033061 |
| homeFieldIndicator | 2.605970 |
| eloDeltaZ | 6.130499 |
| talentDeltaZ | 1.073216 |
| returningDeltaZ | 1.301586 |
| recruitY0DeltaZ | 0.123656 |
| recruitY1DeltaZ | 0.712694 |
| recruitY2DeltaZ | 0.810452 |
| recruitY3DeltaZ | 1.821119 |
| priorFbsGamesDeltaZ | −1.779699 |
| ppaNetDeltaZ | −0.016992 |
| successNetDeltaZ | 1.613936 |
| returningMissingDelta | 2.240754 |
| recruitY0MissingDelta | −1.082964 |
| recruitY1MissingDelta | −0.895281 |
| formMissingDelta | 0.142580 |

These coefficients are model state, not causal estimates.

Independent recomputation found:

- coefficient mismatches: **0**
- maximum coefficient difference: **0**
- scaler mean mismatches: **0**
- scaler SD mismatches: **0**
- scaler availability-count mismatches: **0**
- training-game-ID mismatches: **0**

The final candidate artifact is therefore exactly reproducible from the frozen inputs
and protocol.

## Source isolation

The emitted report records exactly the authorized source-member reads:

### Feature artifact

- `manifest.json`: **1**
- `report.json`: **1**
- `source_provenance.json`: **1**
- `features/game_features.json`: **1**

### Corpus artifact

- `manifest.json`: **1**
- `report.json`: **1**
- `source_provenance.json`: **1**
- `outcomes/outcomes.json`: **1**

Forbidden corpus reads:

- market lines: **0**
- raw corpus predictive layers: **0**
- PPA sidecar: **0**
- portal quarantine: **0**

No ATS, CLV, ROI, or historical market metric influenced V1 development.

## Audit conclusion

Historical Model Development V1 is **CLEAN / ACCEPTED**.

The candidate:

`historical_ridge_margin_v1`

is now **FROZEN DEVELOPMENT CANDIDATE** with:

- lambda = **100**
- exact scaler state frozen;
- exact coefficient state frozen;
- exact training universe frozen;
- exact Stage A selection hash frozen.

This is not production authorization.

The candidate has seen:

- 2022 as tuning evidence;
- 2023 as one-shot development confirmation.

It has **not** seen:

- 2024 validation evidence;
- 2025 final holdout evidence;
- historical market evidence under this development protocol.

## Next research boundary

The next step is a separately frozen **2024 Historical Validation V1 contract**.

Before any 2024 provider capture, feature build, outcome read, or candidate scoring,
that validation contract should define:

- exact 2024 source/capture requirements;
- PIT and missingness handling;
- exact reuse of the frozen candidate;
- whether any unseen 2024 missingness is a blocker;
- one-shot validation metrics;
- validation pass/fail criteria;
- whether market evaluation remains separate;
- what happens after validation pass or failure.

The 2024 contract must not permit:

- lambda retuning;
- coefficient refitting;
- scaler refitting on 2024;
- feature-definition changes;
- HFA changes;
- missingness-policy changes based on 2024 outcomes.

2025 remains locked final holdout.
