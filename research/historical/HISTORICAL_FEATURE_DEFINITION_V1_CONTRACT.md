# Historical Feature Definition V1 — Contract

**Status:** FROZEN FEATURE DEFINITION — BUILT AND INDEPENDENTLY AUDITED  
**Source corpus:** Historical Development Corpus V1  
**Development seasons:** 2022 and 2023 only  
**Validation season:** 2024 — reserved, not authorized here  
**Final holdout:** 2025 — locked  
**Does not authorize:** feature-matrix generation, model fitting, tuning, backtest claims, market optimization, database writes, 2024 capture/use, or 2025 development use

## Purpose

Historical Feature Definition V1 freezes the first deterministic feature vocabulary
that may be computed from the independently audited Historical Development Corpus V1.

This contract answers only:

- which raw corpus fields may become candidate features;
- how prior-game history is filtered;
- how selected prior-game rate fields are aggregated;
- how missingness remains explicit;
- which captured evidence is deliberately excluded from Feature V1.

It does **not** choose:

- a model family;
- model coefficients;
- feature weights;
- regularization;
- feature-selection criteria;
- train/test folds;
- hyperparameter search;
- HFA points;
- spread calibration;
- betting edge;
- market thresholds;
- promotion criteria.

Those belong to later model-development contracts.

## Frozen source identity

Feature V1 may be computed only from the accepted Historical Development Corpus V1
artifact:

- build run: `36479515332`
- builder SHA: `3d553b0925f55321d53c3048544aa16a047e41c8`
- artifact ID: `10997010171`
- artifact name: `historical-development-corpus-v1-36479515332`
- artifact ZIP SHA-256:
  `cea83762d2b6e492caec680a74a085ef5a5e283c36a402ef4b35acbe2ce22b7d`

The feature builder must verify this exact ZIP identity before parsing.

No provider refresh, database rescue, or source substitution is allowed.

## Feature artifact grain

The primary Feature V1 grain is:

**one row per canonical target game**.

Expected rows:

- 2022: **734**
- 2023: **750**
- combined: **1,484**

Primary identity:

- season;
- provider game ID.

Each row must preserve:

- provider week;
- start timestamp;
- home team;
- away team;
- neutral-site flag.

The feature row may contain separate `home` and `away` feature bundles.

No target score, target-game outcome, historical line, market price, or target-game
game-level Elo field may appear in the predictive feature artifact.

## Design posture

Feature V1 is intentionally **atomic and minimally transformed**.

The goal is to expose point-in-time-safe candidate information while deferring
normalization, weighting, and model representation to later contracts.

Feature V1 therefore does **not** compute:

- z-scores;
- rank transforms;
- min-max scaling;
- winsorization;
- clipping;
- feature interactions;
- home-minus-away matchup deltas;
- composite ratings;
- preseason/in-season blends;
- recency weights;
- opponent adjustments.

A later model contract may transform the frozen Feature V1 values only under a
separately reviewed protocol.

## Selected feature families

Feature V1 selects four season-static/PIT prior families and one in-season history
family.

### Season-static timing caveat

Talent, returning production, and recruiting are treated as **season-static retrospective
candidate priors** under the already-frozen corpus contract.

Their inclusion does not claim that the 2026 retrospective retrieval timestamp
recreates the exact historical wall-clock publication timestamp at which each source
became available.

Accordingly:

- these rows may be used for 2022–2023 development under this research contract;
- they must be labeled as retrospective season-static priors in provenance;
- they must not be described as timestamp-perfect historical live snapshots;
- no in-season refresh of these source families is allowed in Feature V1;
- a future prospective/validation implementation must separately prove or freeze its
  own source-time posture before using an equivalent feature family.

Historical Elo is different: its provider-week mapping is separately frozen by
Historical Elo PIT V1.

### Family 1 — Historical Elo

Source:

- `predictive/game_frames.json`
- `homeElo` / `awayElo`

Feature:

- `eloRaw`

Definition:

```
eloRaw = selected historical Elo value
```

The corpus has already frozen the source mapping:

- Week 1 -> preseason Elo;
- Week N, N >= 2 -> Week N-1 Elo;
- same-week Week N Elo prohibited.

Feature V1 must use the selected corpus Elo value exactly.

Forbidden:

- game payload `pregameElo`;
- game payload `postgameElo`;
- same-week Elo;
- later-week Elo;
- interpolation;
- normalization at this stage.

If the corpus Elo status is unavailable, `eloRaw` remains unavailable.

### Family 2 — CFBD team talent

Source:

- `predictive/static_priors.json`
- `talent.row.talent`

Feature:

- `talentRaw`

Definition:

```
talentRaw = finite numeric talent.row.talent
```

A source row with numeric zero is a legitimate observed value and must not be treated as
missing merely because the value is zero.

Feature V1 does not z-score or rescale talent.

### Family 3 — Returning production

Source:

- `predictive/static_priors.json`
- `returningProduction.row.percentPPA`

Feature:

- `returningPercentPPA`

Definition:

```
returningPercentPPA =
  finite numeric returningProduction.row.percentPPA
```

This field selection follows the existing Candidate B roster-prior precedent.

Feature V1 deliberately excludes:

- `percentPassingPPA`;
- `percentReceivingPPA`;
- `percentRushingPPA`;
- usage fields;
- total PPA volume fields.

Known source-row missingness remains unavailable:

- 2022 James Madison;
- 2023 Jacksonville State;
- 2023 Sam Houston.

No zero-fill or substitute is allowed.

### Family 4 — Recruiting class points

Source:

- `predictive/static_priors.json`
- each target-season team's four captured recruiting class rows
- selected field: `row.points`

Features:

- `recruitingPointsY0`
- `recruitingPointsY1`
- `recruitingPointsY2`
- `recruitingPointsY3`

Where:

- `Y0` = target-season recruiting class;
- `Y1` = one season before target;
- `Y2` = two seasons before target;
- `Y3` = three seasons before target.

Examples:

- 2022 -> Y0=2022, Y1=2021, Y2=2020, Y3=2019
- 2023 -> Y0=2023, Y1=2022, Y2=2021, Y3=2020

Feature V1 uses raw `points`, not recruiting `rank`.

Reason:

- `points` preserves the continuous provider score;
- `rank` is an ordinal restatement of the same class population and is not added as a
  second V1 feature.

No four-year weighted composite is authorized in Feature V1.

Known missingness remains explicit:

- Florida International 2022 recruiting class is unavailable in both applicable
  season-static prior bundles.

Do not infer the missing class from rank, another season, another provider, or a team
average.

## Family 5 — prior canonical FBS-vs-FBS form

Source:

- `predictive/history_advanced.json`
- `predictive/history_eligibility.json`
- canonical target-game identity from `predictive/game_frames.json`

### Canonical-history filter

The corpus deliberately preserved some FBS-team rows from FBS-vs-FCS games.

Feature V1 does **not** use those rows.

For a target game, a history row is eligible only if all conditions hold:

1. row season equals target season;
2. row team equals the target-side exact provider team identity;
3. row provider week is strictly less than target provider week;
4. row game ID belongs to that season's canonical FBS-vs-FBS target-game universe;
5. row ID is present in the corresponding corpus history-eligibility references.

This rule aligns historical feature construction with the prospective 2026
TeamGameStat canonical FBS-vs-FBS lane.

No FBS-vs-FCS history contributes to Feature V1.

### Prior-game count

Feature:

- `priorFbsGames`

Definition:

```
priorFbsGames =
  count(distinct eligible canonical FBS-vs-FBS history game IDs)
```

This is a legitimate integer count.

For Week 1 it must equal zero.

A team may also have zero prior FBS-vs-FBS games after Week 1 because of byes or an
opening schedule consisting only of excluded FBS-vs-FCS games.

Zero prior games is not missingness.

### Selected advanced-stat fields

Feature V1 selects only fields that align with the current prospective TeamGameStat
managed efficiency lane:

- `row.offense.ppa`
- `row.defense.ppa`
- `row.offense.successRate`
- `row.defense.successRate`

Feature V1 deliberately does not select:

- explosiveness;
- power success;
- stuff rate;
- line yards;
- second-level yards;
- open-field yards;
- passing/rushing sub-splits;
- standard-down/passing-down sub-splits.

Those fields remain available for a future feature version but are not part of V1.

### Equal-game aggregation

For each selected field, use a simple arithmetic mean across finite eligible canonical
history rows.

No game recency weighting is applied.

For a field `x`:

```
xMean =
  sum(finite x_i across eligible canonical prior games)
  /
  count(finite x_i)
```

Feature values:

- `ppaOffMean`
- `ppaDefMean`
- `successOffMean`
- `successDefMean`

Companion observation counts:

- `ppaOffN`
- `ppaDefN`
- `successOffN`
- `successDefN`

No missing field is silently converted to zero.

### Directional net features

Feature V1 also defines two deterministic directional differences.

```
ppaNet =
  ppaOffMean - ppaDefMean

successNet =
  successOffMean - successDefMean
```

A net feature is available only when both component means are available.

These differences mirror the existing project convention that higher offensive
efficiency and lower defensive efficiency are favorable.

No point-scale interpretation is attached to these net features.

### No-prior-history behavior

If `priorFbsGames == 0`:

- `ppaOffMean` unavailable;
- `ppaDefMean` unavailable;
- `ppaNet` unavailable;
- `successOffMean` unavailable;
- `successDefMean` unavailable;
- `successNet` unavailable;
- all dynamic observation counts = 0;
- reason = `NO_PRIOR_FBS_GAMES`.

Do not write zero rate values for a team with no prior canonical history.

### Partial field coverage

If `priorFbsGames > 0` but a selected raw field is non-finite in one or more eligible
games:

- mean only the finite observations for that field;
- record the exact field observation count;
- do not impute the missing field values;
- do not drop the target game merely because a field count is below
  `priorFbsGames`.

The future model contract must decide whether partial field coverage is acceptable.

Feature V1 itself only reports the facts.

## Explicitly excluded source families

### PPA history sidecar

`predictive/history_ppa.json` is **not selected** for Feature V1.

Reason:

- the advanced-game-stat PPA fields already provide the primary efficiency signal used
  by the current TeamGameStat path;
- adding the separate PPA endpoint in the same version would introduce highly related
  alternate representations without a pre-registered reason to prefer or combine them.

The PPA history corpus remains preserved for future research/versioning.

### Target outcomes

`outcomes/outcomes.json` is never read by the Feature V1 builder.

Therefore Feature V1 does not include:

- wins;
- win percentage;
- points for;
- points against;
- net points per game;
- margin;
- target result.

This is deliberate even though the current Balanced V1 production rating uses
win percentage and net points.

Adding prior-score outcome features would require a separately reviewed corpus/feature
version because the accepted V1 corpus physically isolates outcomes from predictive
inputs.

### Historical market evidence

`evaluation/market_lines.json` is never read by the Feature V1 builder.

No market feature, closing line, spread, total, price, consensus, or line movement is
authorized.

### Transfer portal

The quarantined transfer-portal artifacts are never read by the Feature V1 builder.

No portal feature is authorized.

## Matchup representation boundary

Feature V1 freezes team-side values only.

For each game, preserve separate:

- home feature bundle;
- away feature bundle.

Feature V1 does **not** derive:

- home minus away deltas;
- ratios;
- interactions;
- absolute differences;
- favorite/underdog orientation;
- HFA-adjusted values.

Those are model-input representation decisions for the later model-development
protocol.

## Structural game fields

The feature artifact may preserve:

- season;
- game ID;
- provider week;
- start timestamp;
- home team;
- away team;
- neutral-site flag.

`neutralSite` is structural metadata only.

Feature V1 does not assign a home-field point value.

## Missingness representation

Every candidate numeric feature must be represented with enough metadata to distinguish:

- `AVAILABLE`;
- `SOURCE_ROW_UNAVAILABLE`;
- `FIELD_VALUE_UNAVAILABLE`;
- `NO_PRIOR_FBS_GAMES`.

Do not encode unavailable values as numeric zero.

Recommended artifact shape:

```
{
  "value": number | null,
  "status": "...",
  "n": number | null
}
```

Static fields may omit `n` or use `n=1`.

Dynamic means must include their actual finite observation count.

The exact serialization may differ if semantically equivalent and independently tested.

## No normalization in Feature V1

Feature V1 emits raw feature values.

It does not compute population or sample z-scores.

Reason:

- normalization is part of model training/representation;
- normalization statistics must later be frozen with a development-only protocol;
- fold-aware or train-only scaling must not be precluded by a corpus-wide transform;
- 2024 validation and 2025 holdout values must never influence development
  normalization.

The later model-development contract must specify exactly how any normalization is fit
and applied.

## No outcome-guided feature selection

The selected Feature V1 vocabulary was chosen from:

- the frozen corpus eligibility rules;
- existing prospective Candidate B input precedent;
- existing TeamGameStat managed efficiency fields;
- existing Core/Balanced directional efficiency semantics.

It was not selected by inspecting:

- 2022/2023 score correlation;
- ATS results;
- closing-line fit;
- ROI;
- feature importance from fitted models;
- 2024;
- 2025.

The feature-definition artifact must not include outcome correlations or model
performance rankings.

## Feature artifact QA invariants

A future Feature V1 builder must assert at minimum:

### Universe

- game rows = **1,484**
- 2022 rows = **734**
- 2023 rows = **750**
- duplicate season/game keys = **0**

### Source isolation

- source corpus ZIP SHA matches frozen identity
- outcomes file read count = **0**
- market-evaluation file read count = **0**
- portal/quarantine file read count = **0**
- provider calls = **0**
- database reads = **0**
- database writes = **0**

### Static priors

- home/away Elo comes only from frozen selected corpus Elo
- talent source field is exactly `talent.row.talent`
- returning source field is exactly `returningProduction.row.percentPPA`
- recruiting source field is exactly `row.points`
- no recruiting rank is emitted as a V1 feature
- known static missingness is preserved exactly

### Dynamic history

- only canonical FBS-vs-FBS history game IDs are used
- all history weeks are < target week
- Week 1 prior FBS game count = 0 for every target side
- FBS-vs-FCS history references used = 0
- no future/same-week row is used
- selected raw fields are limited to PPA and success rate
- arithmetic means are unweighted by recency
- dynamic observation counts reconcile exactly to included finite rows

### Forbidden content

The feature artifact must contain no:

- target final scores;
- target margin;
- target winner;
- target postgame metrics;
- historical market lines;
- transfer-portal data;
- game-level pregame/postgame Elo;
- z-scores;
- model weights;
- model predictions;
- betting edges.

## Reproducibility

The future Feature V1 builder must be deterministic and artifact-only.

It must:

- consume only the frozen corpus artifact;
- verify source ZIP SHA before parsing;
- record builder repo SHA;
- record source artifact ID/run/hash;
- record feature row counts;
- record field availability counts;
- record dynamic observation-count distributions;
- hash every emitted file;
- fail closed on source identity mismatch;
- fail closed on duplicate target keys;
- fail closed if forbidden source layers are opened;
- fail closed if any same-week/FBS-vs-FCS history row contributes to a dynamic feature.

Preferred research transport remains immutable files, not database persistence.

## Audited Feature V1 build

Historical Feature V1 was built from the accepted corpus in GitHub Actions run
`36489184409` at builder SHA
`743738eea6dfd0852cf28c5941aa998be300b0c9`.

Independent audit closeout is recorded in
[`docs/2026-09-28-historical-feature-v1-audit.md`](../../docs/2026-09-28-historical-feature-v1-audit.md).

Accepted Feature V1 artifact:

- artifact ID: `11000651389`
- artifact name: `historical-feature-v1-36489184409`
- ZIP SHA-256:
  `047220307750b755d1e6d626628802baf818dbd70ffde9252e63768e7a823ad2`

The audit independently reproduced every one of the **41,552** team-side feature
objects from the accepted corpus with zero value, status, or observation-count
mismatches.

## What remains unauthorized

The audited Feature V1 artifact does **not** authorize:

- database persistence;
- z-score computation;
- model training;
- coefficient search;
- HFA calibration;
- train/validation split experiments;
- market evaluation;
- 2024 capture/use;
- 2025 access.

## Next authorization boundary

Historical Model Development / Tuning Protocol V1 is now frozen separately in
[`HISTORICAL_MODEL_DEVELOPMENT_TUNING_PROTOCOL_V1.md`](./HISTORICAL_MODEL_DEVELOPMENT_TUNING_PROTOCOL_V1.md).

Merging that protocol does not fit or tune a model.

The next reviewed engineering slice may implement the deterministic artifact-only V1
development engine and guarded workflow. A separate explicit authorization is still
required before the one legitimate model-development run.

Development remains confined to the accepted 2022–2023 Feature V1 artifact and the
accepted 2022–2023 outcome labels under the protocol's source-read boundaries.

2024 remains reserved for later validation and 2025 remains locked as the final
holdout.

## Versioning

A new feature-contract version is required to add or change:

- source families;
- selected raw fields;
- FBS-vs-FCS inclusion;
- history timing;
- aggregation method;
- recency weighting;
- opponent adjustment;
- recruiting composite logic;
- normalization;
- matchup deltas;
- outcome-derived prior features;
- portal features;
- market features.

Feature V1 semantics must not drift silently.
