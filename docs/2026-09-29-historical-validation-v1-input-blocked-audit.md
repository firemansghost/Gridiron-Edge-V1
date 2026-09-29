# 2024 Historical Validation V1 — Input-Blocked Audit

**Date:** 2026-09-29  
**Snapshot run:** `36508377627`  
**Source SHA:** `e1b27f6c5681f6ab4f8d24e50f88e387c64657a7`  
**Workflow:** Capture 2024 Historical Research Snapshot V1 (Manual, Guarded)

## Bottom line

2024 Historical Validation V1 is **input-blocked before scoring**.

Frozen status:

`HISTORICAL_VALIDATION_INPUT_BLOCKED`

The frozen candidate:

`historical_ridge_margin_v1`

was **not scored on 2024**.

No validation MAE/RMSE, no baseline comparison, no candidate refit, and no 2025
holdout action is authorized from this run.

The block is source/input-related, not a model-performance failure.

## Run execution

The authorized 2024 snapshot run:

- executed from `refs/heads/main`;
- used the exact approved source SHA;
- passed the source-SHA guard;
- passed the exact confirmation guard;
- used CFBD only;
- attempted **28** provider calls;
- succeeded on **28 / 28** provider calls;
- stayed below the **32-call** hard ceiling;
- performed zero database reads/writes;
- invoked no Prisma path;
- invoked no Odds API, SGO, or weather provider.

The workflow failed only after the complete raw snapshot was written and QA was
evaluated.

The raw artifact was uploaded despite the QA failure.

## Failed snapshot artifact identity

- artifact ID: `11008470975`
- artifact name:
  `historical-research-snapshot-v1-2024-36508377627`
- ZIP bytes: **1,126,348**
- GitHub ZIP SHA-256:
  `b41e934b26952100e7e056a56114dc81df6bbe77f5c787f28b75b646ae7ea544`

Independent download verification reproduced the exact ZIP SHA-256.

The ZIP contains exactly **30 files**:

- `manifest.json`;
- `report.json`;
- 28 raw provider-response files.

The manifest covers exactly **29** non-manifest files.

Independent manifest verification found:

- byte-count mismatches: **0**
- SHA-256 mismatches: **0**
- missing manifested files: **0**
- unexpected files: **0**

Key internal hashes:

- `manifest.json`
  - bytes: **4,881**
  - SHA-256:
    `a3c36f7b41ae5883376f03e800d3635480b3780ffa9e25f1add023e029bfab6d`
- `report.json`
  - bytes: **19,715**
  - SHA-256:
    `094cf5d9644b5a4429e70651e9ffc2a72ddd7371759c320f491992a60cdd84f2`

## Canonical-game audit

The games payload contains:

- provider game rows: **874**
- regular FBS-vs-FBS rows: **753**
- completed regular FBS-vs-FBS rows: **752**
- canonical completed FBS team count: **134**
- observed provider weeks: **1–16**

The one incomplete FBS-vs-FBS row is:

- game ID `401640992`
- Week 5
- Liberty @ App State
- `completed=false`

Under the already-frozen 2024 validation contract, canonical validation targets are
**completed** regular-season FBS-vs-FBS games.

Therefore the contract-defined canonical target universe is **752 games**, not 753.

The current snapshot implementation incorrectly treated the presence of any incomplete
FBS-vs-FBS row as a QA failure and included the incomplete game in its canonical
coverage denominator.

That is an implementation bug to repair separately.

Repairing that bug does **not** unblock Validation V1 because independent provider
coverage and required-feature blockers remain.

## Advanced-game source coverage

Against the **752 completed canonical games**, the bulk advanced-game endpoint returned
complete two-team coverage for **748** games.

Exactly four completed canonical games are absent entirely from the advanced-game
payload:

| Game ID | Week | Matchup |
|---:|---:|---|
| `401641034` | 4 | New Mexico State @ Sam Houston |
| `401645328` | 4 | Rice @ Army |
| `401644689` | 12 | Kent State @ Miami (OH) |
| `401644780` | 14 | Eastern Michigan @ Western Michigan |

Observed canonical advanced rows:

- unique games: **748**
- team-game rows: **1,496**

This is exactly two rows for every advanced-covered canonical game.

No rows from the four games above were present.

The frozen snapshot-acceptance gate required exact advanced coverage for every
canonical completed game, so the snapshot cannot be accepted for V1.

## PPA sidecar coverage

Against the **752 completed canonical games**, the PPA endpoint returned two-team
coverage for **749** games.

Exactly three canonical games are absent entirely:

| Game ID | Week | Matchup |
|---:|---:|---|
| `401641034` | 4 | New Mexico State @ Sam Houston |
| `401644689` | 12 | Kent State @ Miami (OH) |
| `401644780` | 14 | Eastern Michigan @ Western Michigan |

Observed canonical PPA rows:

- unique games: **749**
- team-game rows: **1,498**

The separate PPA sidecar is not selected by Historical Feature V1, but the frozen
snapshot contract still required exact PPA coverage as a snapshot-acceptance gate.

No V1 gate is weakened after observing this result.

## Static-prior coverage

Independent raw-provider reconciliation against the 134 canonical 2024 teams found:

### Talent

- rows: **134**
- canonical coverage: **134 / 134**
- missing: **none**

### Returning production

- rows: **133**
- canonical coverage: **133 / 134**
- missing:
  - Kennesaw State

Returning-production missingness is an allowed frozen model missingness family and is
not by itself a validation-input blocker.

### Recruiting classes

2024 Feature V1 maps:

- Y0 -> 2024
- Y1 -> 2023
- Y2 -> 2022
- Y3 -> 2021

Coverage:

| Class | Feature slot | Canonical coverage | Missing canonical teams |
|---:|---|---:|---|
| 2024 | Y0 | 134 / 134 | none |
| 2023 | Y1 | 134 / 134 | none |
| 2022 | **Y2** | **132 / 134** | **Florida International, Kennesaw State** |
| 2021 | Y3 | 134 / 134 | none |

The raw 2022 recruiting payload contains no alternate exact provider row for either
Florida International or Kennesaw State.

The frozen 2024 validation contract requires **recruiting Y2 to be available and finite
for every validation team side**.

Unlike Y0/Y1, Y2 has no authorized missingness indicator or imputation path.

Therefore this Y2 source gap is independently sufficient to produce:

`HISTORICAL_VALIDATION_INPUT_BLOCKED`

even if all advanced-game coverage defects were later recoverable.

### Preseason Elo

- rows: **134**
- canonical coverage: **134 / 134**
- missing: **none**

## Games affected by required Y2 missingness

Florida International and Kennesaw State appear in **21** completed canonical 2024
games.

Those target games cannot legally produce a complete V1 model input because recruiting
Y2 is required-available.

No team-average, rank substitution, alternate provider, later-season value, zero-fill,
or inferred recruiting score is authorized.

No subset validation that silently drops those games is authorized because the frozen
validation gate requires predictions for **100% of the audited canonical 2024 games**.

## Snapshot QA findings

The workflow reported:

- `incomplete_fbs_vs_fbs_regular_games_present`
- `incomplete_canonical_advanced_game_coverage`
- `incomplete_canonical_ppa_game_coverage`

Independent audit interpretation:

1. `incomplete_fbs_vs_fbs_regular_games_present`
   - implementation defect relative to the frozen completed-game canonical definition;
   - should be repaired for future correctness;
   - does not change the blocked V1 outcome.

2. `incomplete_canonical_advanced_game_coverage`
   - real CFBD source gap for four completed games;
   - frozen snapshot gate fails.

3. `incomplete_canonical_ppa_game_coverage`
   - real CFBD source gap for three completed games;
   - frozen snapshot gate fails.

A fourth independent blocker exists downstream of snapshot QA:

4. 2022 recruiting/Y2 required-feature coverage is only 132/134 canonical teams.

## Validation result boundary

No one-shot 2024 validation score is permitted.

Do not:

- build a partial-game validation set;
- drop FIU or Kennesaw State games;
- impute recruiting Y2;
- substitute recruiting rank;
- expand Y2 missingness handling;
- alter the frozen candidate;
- refit candidate scaler or coefficients;
- change lambda;
- weaken the 100% prediction gate;
- use 2024 results to redesign V1 and rerun V1 as though 2024 were unseen.

The correct V1 status is:

`HISTORICAL_VALIDATION_INPUT_BLOCKED`

This is distinct from:

`HISTORICAL_VALIDATION_FAIL`

because the frozen candidate was never legally scored.

## 2025 boundary

2025 remains locked.

An input-blocked 2024 validation does not authorize direct progression to the 2025
final holdout.

Any revised research path must use a new model/validation protocol version and must
explicitly acknowledge that 2024 source evidence has now been observed.

The 2025 final-holdout evidence must remain excluded from that redesign.

## Implementation follow-up

A separate implementation repair should align Historical Research Snapshot V1's
canonical QA denominator with the already-frozen contract:

- canonical target game = completed regular-season FBS-vs-FBS game;
- incomplete/canceled FBS-vs-FBS rows remain archived but are not target games;
- coverage denominators use completed canonical games only.

That repair is correctness work only.

It must not be used to relabel the failed 2024 V1 snapshot as accepted or to bypass the
independent advanced/recruiting blockers.

## Audit conclusion

The failed 2024 run is valid preserved research evidence.

Historical Validation V1 status:

**INPUT BLOCKED — NO MODEL SCORE**

The frozen development candidate remains unchanged:

`historical_ridge_margin_v1`

No evidence from this run supports a production, betting, or final-holdout claim.
