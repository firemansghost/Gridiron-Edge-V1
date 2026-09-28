# Historical Feature V1 — Independent Audit Closeout

**Date:** 2026-09-28  
**Build run:** `36489184409`  
**Builder source SHA:** `743738eea6dfd0852cf28c5941aa998be300b0c9`  
**Workflow:** Build Historical Feature V1 (Manual, Guarded)

## Bottom line

Historical Feature V1 passed independent audit.

The build consumed only the accepted Historical Development Corpus V1 artifact,
verified the frozen corpus ZIP SHA-256 before parsing, opened only the explicitly
authorized predictive/source-metadata members, performed no provider or database
activity, applied no normalization or model fitting, and emitted exactly the frozen
1,484-game feature universe.

Independent recomputation from the accepted corpus reproduced every emitted Feature V1
row and every team-side feature object exactly.

This audit accepts the feature artifact as the immutable input to the next research
phase: a separately frozen Historical Model Development / Tuning Protocol V1.

It does **not** authorize model fitting, tuning, 2024 validation use, or 2025 holdout
access.

## Workflow execution boundary

Run `36489184409`:

- event: `workflow_dispatch`
- branch: `main`
- source SHA: `743738eea6dfd0852cf28c5941aa998be300b0c9`
- conclusion: **success**
- source SHA guard: **pass**
- exact confirmation guard: **pass**
- frozen corpus artifact download: **pass**
- frozen corpus ZIP hash verification: **pass**
- `npm ci --ignore-scripts`: **pass**
- direct TypeScript compile: **pass**
- Historical Feature V1 build: **pass**
- immutable artifact upload: **pass**

Execution boundaries verified from the workflow, builder code, job log, and emitted
report:

- source provider calls during build: **0**
- database reads: **0**
- database writes: **0**
- Prisma invoked: **no**
- normalization invoked: **no**
- model fitting invoked: **no**
- 2024 included: **no**
- 2025 included: **no**

The install step emitted the repository's existing npm vulnerability warnings. Those
warnings did not alter the guarded research execution path or the feature-artifact
audit result and are not treated as Feature V1 evidence.

## Frozen source-corpus verification

The build used exactly the accepted Historical Development Corpus V1 artifact:

- source corpus run: `36479515332`
- artifact ID: `10997010171`
- source artifact name: `historical-development-corpus-v1-36479515332`
- corpus builder repo SHA:
  `3d553b0925f55321d53c3048544aa16a047e41c8`
- corpus ZIP SHA-256:
  `cea83762d2b6e492caec680a74a085ef5a5e283c36a402ef4b35acbe2ce22b7d`

Independent audit recomputed the local source ZIP digest and matched the frozen value
exactly.

Feature provenance also records the accepted corpus metadata-file digests:

- corpus `manifest.json` SHA-256:
  `2fb0419095d9c870b46737a36f4bf2f8a88002aea2610b5c4f918d917b8fba98`
- corpus `report.json` SHA-256:
  `baa2223e5c81824e5d44a5ec1efc0df3fae71000c4b114de9f9ed0e888d6d465`
- corpus `source_provenance.json` SHA-256:
  `ca3c5b6e58a75cc4e5142b8f6bc987de7921b5e41643d22c118b7024f1e3c97b`

All three were independently recomputed from the accepted corpus ZIP and matched
Feature V1 provenance exactly.

## Source-read isolation audit

The Feature V1 builder report records exactly one read of each authorized source member:

- `manifest.json`: **1**
- `report.json`: **1**
- `source_provenance.json`: **1**
- `predictive/game_frames.json`: **1**
- `predictive/static_priors.json`: **1**
- `predictive/history_advanced.json`: **1**
- `predictive/history_eligibility.json`: **1**

Forbidden source-member reads are all zero:

- `predictive/history_ppa.json`: **0**
- `outcomes/outcomes.json`: **0**
- `evaluation/market_lines.json`: **0**
- `quarantine/transfer_portal_2022.json`: **0**
- `quarantine/transfer_portal_2023.json`: **0**

The builder implementation on the audited SHA also whitelists source-member reads and
fails closed on an attempted non-whitelisted read.

Therefore Feature V1 does not consume outcome, market, alternate PPA-sidecar, or portal
evidence.

## Feature artifact integrity

GitHub uploaded:

- artifact ID: `11000651389`
- artifact name: `historical-feature-v1-36489184409`
- ZIP bytes: **375,745**
- GitHub SHA-256:
  `047220307750b755d1e6d626628802baf818dbd70ffde9252e63768e7a823ad2`

Independent verification of the downloaded ZIP produced the exact same SHA-256.

The ZIP contains exactly four files:

- `features/game_features.json`
- `report.json`
- `source_provenance.json`
- `manifest.json`

The first three files are covered by `manifest.json`.

Independent verification found:

- manifested files checked: **3 / 3**
- SHA-256 mismatches: **0**
- byte-count mismatches: **0**
- unexpected files: **0**
- missing files: **0**

Manifested payload identities:

- `features/game_features.json`
  - bytes: **4,942,223**
  - SHA-256:
    `9ab89dce2eee84fce0c69bae9bb5511d941a8bef1731adbfd36610703c86e74a`
- `report.json`
  - bytes: **5,884**
  - SHA-256:
    `126c95993cd79529638c603e06ae17c7a93aeaec9c57dda98d7aac99bb6c63e9`
- `source_provenance.json`
  - bytes: **681**
  - SHA-256:
    `fef3d20d8b7214a7684e6a5db7e2f5ac93dd0cd43f5078bdbb0f39a63c7abc80`

## Target universe

Feature rows:

- 2022: **734**
- 2023: **750**
- combined: **1,484**

Team sides:

- combined: **2,968**

Independent checks found:

- duplicate season/game keys: **0**
- target seasons outside 2022/2023: **0**
- structural frame mismatches versus accepted corpus: **0**

Each feature row independently matched the source corpus on:

- season;
- game ID;
- provider week;
- start timestamp;
- home team;
- away team;
- neutral-site flag.

## Complete independent feature recomputation

The audit rebuilt Feature V1 independently from the accepted corpus using the frozen
contract semantics.

For every target side it independently recomputed:

- `eloRaw`
- `talentRaw`
- `returningPercentPPA`
- `recruitingPointsY0`
- `recruitingPointsY1`
- `recruitingPointsY2`
- `recruitingPointsY3`
- `priorFbsGames`
- `ppaOffMean`
- `ppaDefMean`
- `ppaNet`
- `successOffMean`
- `successDefMean`
- `successNet`

There are **14** frozen feature objects per team side.

Across:

- **1,484** games;
- **2,968** team sides;
- **41,552** feature objects;

the independent audit found:

- value mismatches: **0**
- status mismatches: **0**
- observation-count mismatches: **0**

The emitted Feature V1 artifact therefore exactly reproduces the frozen feature
definitions from the accepted corpus.

## Static-prior audit

### Historical Elo

- available: **2,968 / 2,968**
- unavailable: **0**

Every emitted Elo value matched the corpus-selected historical Elo value exactly.

Feature V1 did not substitute game-payload pregame/postgame Elo.

### Team talent

- available: **2,968 / 2,968**
- unavailable: **0**

Observed numeric zero values remain legitimate available data.

The accepted source includes zero-valued talent observations for service academies;
Feature V1 preserves those as `AVAILABLE`, not missing.

### Returning production

- available team sides: **2,936**
- source-row unavailable team sides: **32**

The unavailable sides map exactly to the frozen missing teams:

- 2022 James Madison: **10** target-game appearances
- 2023 Jacksonville State: **11**
- 2023 Sam Houston: **11**

No replacement or zero-fill occurred.

### Recruiting points

`recruitingPointsY0`:

- available: **2,957**
- source-row unavailable: **11**
- missing source: 2022 Florida International 2022 class

`recruitingPointsY1`:

- available: **2,957**
- source-row unavailable: **11**
- missing source: 2023 Florida International 2022 class

`recruitingPointsY2`:

- available: **2,968**

`recruitingPointsY3`:

- available: **2,968**

The feature artifact uses recruiting `points`, not recruiting rank.

## Dynamic-history audit

### Canonical FBS-vs-FBS inclusion

Independent reconstruction followed the frozen rule:

- source reference must resolve;
- source season must equal target season;
- source team must equal exact target-side provider team identity;
- source week must be strictly less than target week;
- source game ID must belong to the canonical FBS-vs-FBS target-game universe.

Results:

- canonical history references used: **15,229**
  - 2022: **7,505**
  - 2023: **7,724**
- FBS-vs-FCS references excluded: **2,230**
  - 2022: **1,113**
  - 2023: **1,117**
- same-week-or-later references used: **0**

The independent reference counts exactly match the builder report.

### Prior FBS game count

Team sides with zero prior canonical FBS-vs-FBS games:

- combined: **278**
- 2022: **140**
- 2023: **138**

By provider week:

- 2022 Week 1: **106**
- 2023 Week 1: **104**
- 2022 Week 2: **34**
- 2023 Week 2: **34**

The Week 2 zeros are legitimate: those teams still had no eligible earlier-week
canonical FBS-vs-FBS history under the frozen contract.

No Week 1 target side has a nonzero prior-FBS count.

### PPA and success-rate aggregation

For each selected dynamic field, Feature V1 uses the simple unweighted arithmetic mean
over eligible canonical prior games.

Availability:

- `ppaOffMean`: **2,690 available / 278 NO_PRIOR_FBS_GAMES**
- `ppaDefMean`: **2,690 / 278**
- `ppaNet`: **2,690 / 278**
- `successOffMean`: **2,690 / 278**
- `successDefMean`: **2,690 / 278**
- `successNet`: **2,690 / 278**

There are no real-data `FIELD_VALUE_UNAVAILABLE` cases in the selected dynamic
fields.

For every one of the **2,690** team sides with prior FBS history:

- `ppaOffMean.n == priorFbsGames`
- `ppaDefMean.n == priorFbsGames`
- `successOffMean.n == priorFbsGames`
- `successDefMean.n == priorFbsGames`

So the accepted 2022–2023 corpus has complete selected PPA/success-rate coverage for
every eligible canonical history row.

Independent recomputation of the complete observation-count distributions matched the
builder report exactly.

## Output contamination scan

The emitted feature rows were recursively scanned for the contract's prohibited
outcome, market, game-level-Elo, normalization, and model-output keys.

Result:

- prohibited keys found: **0**

The scan explicitly covered target score/margin fields, market spread/total/moneyline
fields, game-level pregame/postgame Elo, z-score fields, model prediction fields, and
edge fields.

Feature V1 contains no 2024 or 2025 target rows.

## Report reconciliation

The emitted `report.json` was independently reconciled with the actual feature file
and accepted corpus.

Verified:

- game rows: **1,484**
- team sides: **2,968**
- static-prior rows: **264**
- advanced-history source rows: **3,206**
- zero-prior-FBS team sides: **278**
- excluded FBS-vs-FCS references: **2,230**
- canonical history references used: **15,229**
- same-week-or-later references: **0**
- source-provider calls: **0**
- database reads: **false**
- database writes: **false**
- outcome reads: **0**
- market reads: **0**
- PPA-sidecar reads: **0**
- quarantine reads: **0**
- normalization: **false**
- model fitting: **false**
- 2024 included: **false**
- 2025 included: **false**

The report's feature availability counts and all four dynamic observation-count
distributions independently reconcile exactly to `game_features.json`.

## Audit conclusion

Historical Feature V1 is **CLEAN / ACCEPTED** as the immutable 2022–2023 feature
artifact.

The acceptance is limited to feature construction, source isolation, missingness,
temporal gating, and reproducibility.

It does not decide:

- model family;
- home/away representation;
- feature scaling;
- regularization;
- missing-data model policy;
- training folds;
- objective/loss;
- HFA treatment;
- coefficient search;
- hyperparameter search;
- calibration;
- promotion criteria;
- market evaluation;
- betting thresholds.

Those remain intentionally unfrozen.

## Next research boundary

The next step is a separately frozen **Historical Model Development / Tuning Protocol
V1**.

That protocol must be reviewed before any model fit or tuning run is executed.

Development must remain confined to the accepted 2022–2023 feature artifact and the
already accepted 2022–2023 outcome sidecar under explicit read boundaries.

2024 remains reserved for later out-of-sample validation.

2025 remains locked as the final holdout.
