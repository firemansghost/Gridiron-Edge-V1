# OA-1 Opponent-Adjusted Efficiency Feature V1 — Contract

**Status:** FROZEN FEATURE / TRANSFORMATION DESIGN — RESEARCH ONLY  
**Canonical source:** `team_game_efficiency_canonical_v1`  
**Development seasons:** 2022 and 2023 only  
**Validation season:** 2024 — reserved, no validation scoring authorized here  
**Final holdout:** 2025 — locked from OA model-performance use  
**Prospective season:** 2026 — shadow/prospective only; no outcome-guided selection  
**Does not authorize:** provider calls, database writes, model fitting, coefficient search, feature-subset search, 2024 validation scoring, 2025 performance access, 2026 outcome use, market reads, betting rules, Core V1 modification, or model promotion

## Purpose

OA-1 freezes the first opponent-adjusted transformation vocabulary over the accepted
canonical historical efficiency table.

This contract answers only:

- which canonical efficiency rows may be read;
- how prior-game history is selected at a target game's information boundary;
- how an opponent baseline is defined;
- how the four selected efficiency fields are residualized against opponent baseline;
- how adjusted team-side aggregates are calculated;
- how missingness and observation counts are preserved;
- which data sources and research seasons are forbidden.

It deliberately does **not** choose:

- a predictive model family;
- model coefficients;
- feature weights;
- regularization;
- HFA;
- normalization / z-scoring;
- matchup deltas;
- feature subsets;
- betting thresholds;
- market comparison rules;
- promotion criteria.

Those require later, separately frozen research contracts.

## Canonical source identity

OA-1 may read only the accepted OA-DB-1 canonical table:

`team_game_efficiency_canonical_v1`

OA-DB-1 closeout evidence:

- successful schema deploy run: `37542378895`;
- final reviewed PREVIEW run: `37604945054`;
- reviewed PREVIEW artifact ID: `11474034118`;
- reviewed PREVIEW ZIP SHA-256:
  `65c8dee8e1a2bea44fa27b49bc9f7089c8789a341d63ffec8c04bf7338cebadb`;
- successful COMMIT run: `37608802206`;
- COMMIT artifact ID: `11475674123`;
- COMMIT ZIP SHA-256:
  `2deb8c524978c17ff5e33934a2c27cd4ae1243f0d66643f87481236bf2ad6819`;
- accepted total rows: **5,996**;
- accepted games: **2,998**;
- accepted AVAILABLE rows: **5,988**;
- accepted SOURCE_UNAVAILABLE rows: **8**;
- accepted season-2026 rows: **0**.

Accepted whole-table natural-key + record-fingerprint SHA-256:

`f38781aa328c2c4e3804d1a6f9ab58e35c04506ad499d85bbaa61adb382d9532`

Serialization for that identity:

1. sort rows by `season`, `providerGameId`, `teamIdInternal`;
2. one line per row:
   `season|providerGameId|teamIdInternal|recordFingerprintSha256`;
3. join lines with LF and no trailing semantic field;
4. SHA-256 the UTF-8 bytes.

Accepted per-season natural-key + fingerprint SHA-256:

- 2022 — **1,468 rows**  
  `f2aa64e9b19aa29b8ef12ecb3b1ed0712837150609b0e039e17be27e654edeb3`
- 2023 — **1,500 rows**  
  `f17635c153caff8cfe85f704054bef40625cbae80317db40ad5ba32f81e663f0`
- 2024 — **1,504 rows**  
  `bafb5c589ed144f7f7ef9634829fb4b5fb6ad8c408b9e0f3cd560615a3464c22`
- 2025 — **1,524 rows**  
  `f771b0d8ac2bc2c0594e7ac0e56d90b18165c392173a2f25967641f44d123cf6`

The development builder must verify only the exact authorized season identities it
reads. It must not scan 2025 or 2026 merely to prove table-wide identity.

## Canonical fields authorized for OA-1

OA-1 may consume only these canonical row fields:

### Identity / structure

- `season`
- `providerGameId`
- `providerWeek`
- `startDate`
- `neutralSite`
- `homeTeamNameCfbd`
- `awayTeamNameCfbd`
- `teamNameCfbd`
- `opponentNameCfbd`
- `teamIdInternal`
- `opponentTeamIdInternal`
- `isHome`
- `availabilityStatus`
- `recordFingerprintSha256`

### Selected efficiency fields

- `ppaOff`
- `ppaDef`
- `successOff`
- `successDef`

### Source provenance allowed for audit only

- `sourceSeason`
- `sourceArtifactId`
- `sourceArtifactZipSha256`
- `sourceEndpoint`
- `sourceRawMember`
- `sourceMethod`
- `archiveContractVersion`
- `archiveRunId`
- `archiveArtifactId`
- `archiveArtifactZipSha256`

Persistence timestamps are not OA-1 predictive features.

## Read boundary by research stage

### Development execution

The first OA-1 feature build may read only:

- season 2022 canonical rows;
- season 2023 canonical rows.

It must not query or load:

- 2024 rows;
- 2025 rows;
- 2026 rows;
- target-game outcomes;
- scores;
- historical market lines;
- bets;
- closing lines;
- T-30 evidence;
- Core / Hybrid / Candidate B / V4 prediction outputs;
- recruiting / talent / Elo / portal sources;
- legacy historical `team_game_stats`.

### Validation execution

A later, separately authorized validation feature build may read 2024 canonical rows
under the exact same OA-1 feature semantics.

Opening 2024 **features** does not authorize 2024 **outcome scoring**. Validation scoring
requires a separately frozen validation protocol.

### Final holdout

2025 source features are already persisted for infrastructure continuity, but OA-1
development and validation code must not read them.

2025 may be opened only after:

1. the OA-1 feature semantics are frozen;
2. the OA model-development protocol is frozen;
3. development is complete;
4. 2024 validation is scored under a frozen one-shot protocol;
5. the final OA challenger is frozen;
6. a separate 2025 holdout contract explicitly authorizes the one-shot read.

### 2026

2026 does not exist in the OA-DB-1 V1 table at this checkpoint.

Any future 2026 OA implementation is prospective/shadow evidence only.

No 2026 outcome may be used to select:

- OA formulas;
- weights;
- missingness rules;
- model family;
- scaling;
- HFA;
- thresholds;
- promotion gates.

## Canonical game frame

The OA-1 feature grain is:

**one row per canonical target game**, containing separate home-side and away-side
feature bundles.

Primary game identity:

- season;
- provider game ID.

Expected development game counts:

- 2022: **734**
- 2023: **750**
- total: **1,484**

A canonical target game must have exactly:

- two canonical team-side rows;
- one `isHome=true`;
- one `isHome=false`;
- matching season, provider game ID, provider week, home team, and away team identity.

A target game may still be represented when its own selected efficiency source status
is `SOURCE_UNAVAILABLE`, because OA-1 target-game features use only **prior-game**
history.

The target game's own postgame efficiency values are never predictive inputs for that
same game.

## Point-in-time history boundary

For a target game in season `Y`, provider week `W`, and target side/team `T`:

a team-history row is eligible only when:

1. row season = `Y`;
2. row team = `T`;
3. row provider week < `W`;
4. row belongs to the accepted canonical FBS-vs-FBS table;
5. row selected efficiency value is finite and its row status is `AVAILABLE`.

Same-week history is prohibited even when an earlier kickoff occurred in the same
provider week.

Cross-season history is prohibited.

Week 1 therefore has no in-season OA history.

This preserves the existing historical research convention:

`source provider week < target provider week`

## Why OA-1 uses target-week opponent baselines

For a target game in Week `W`, every prior source game with week < `W` is known by
the target information boundary.

OA-1 therefore evaluates each prior team performance against an opponent baseline
constructed from information available **before the target game**, not necessarily only
information available before the old source game itself.

This permits the opponent baseline for a Week `W` target to use any accepted opponent
game with provider week < `W`, subject to the source-game exclusion below.

This is point-in-time safe for the **target prediction** because no Week `W` or later
information enters the transform.

It is intentionally simpler than a nested historical replay clock.

## Opponent baseline definition

Consider an eligible prior source game `g` for target team `T`.

Let `O` be T's opponent in source game `g`.

For target week `W`, an opponent-baseline row for `O` is eligible only when:

1. same season as target;
2. row team = `O`;
3. row provider week < `W`;
4. row availability status = `AVAILABLE`;
5. selected baseline metric is finite;
6. row provider game ID != source game `g`.

The source game itself is excluded from the opponent baseline.

Reason:

including source game `g` would make T's own observed performance mechanically
contribute to the baseline against which it is judged.

No iterative or recursive opponent adjustment is allowed in V1.

Opponent baselines are simple arithmetic means of **raw canonical metrics**.

## Metric direction

Raw canonical direction:

- higher `ppaOff` = better offense;
- lower `ppaDef` = better defense;
- higher `successOff` = better offense;
- lower `successDef` = better defense.

OA-1 orients all residuals so:

**positive = favorable performance relative to opponent baseline**.

## Source-game residual formulas

For source game `g`, target-side team `T`, opponent `O`, target week `W`:

### PPA offense

Opponent defensive baseline:

`oppPpaDefBaseline(g,W) = mean(O.ppaDef over eligible opponent-baseline rows)`

Residual:

`ppaOffResidual(g,W) = T.ppaOff(g) - oppPpaDefBaseline(g,W)`

Positive means T's offense produced more PPA than the opponent defense typically
allowed before the target week.

### PPA defense

Opponent offensive baseline:

`oppPpaOffBaseline(g,W) = mean(O.ppaOff over eligible opponent-baseline rows)`

Favorable defensive residual:

`ppaDefResidual(g,W) = oppPpaOffBaseline(g,W) - T.ppaDef(g)`

Positive means T's defense held the opponent below that opponent's typical offensive
PPA before the target week.

### Success-rate offense

Opponent defensive baseline:

`oppSuccessDefBaseline(g,W) = mean(O.successDef over eligible opponent-baseline rows)`

Residual:

`successOffResidual(g,W) = T.successOff(g) - oppSuccessDefBaseline(g,W)`

Positive means T's offense achieved a higher success rate than that defense typically
allowed before the target week.

### Success-rate defense

Opponent offensive baseline:

`oppSuccessOffBaseline(g,W) = mean(O.successOff over eligible opponent-baseline rows)`

Favorable defensive residual:

`successDefResidual(g,W) = oppSuccessOffBaseline(g,W) - T.successDef(g)`

Positive means T's defense held the opponent below that opponent's typical offensive
success rate before the target week.

## Baseline observation counts

Every source-game residual must record its opponent-baseline observation count.

Required counts:

- `oppPpaDefBaselineN`
- `oppPpaOffBaselineN`
- `oppSuccessDefBaselineN`
- `oppSuccessOffBaselineN`

A residual is unavailable when its corresponding baseline count is zero.

Do not substitute:

- the source game itself;
- a season average containing the source game;
- another season;
- a conference mean;
- a population mean;
- zero.

## Team-side raw reference aggregates

For target team `T` entering target week `W`, OA-1 must also emit unadjusted
point-in-time reference aggregates from eligible T history.

Equal-game arithmetic means:

- `rawPpaOffMean`
- `rawPpaDefMean`
- `rawSuccessOffMean`
- `rawSuccessDefMean`

Directional raw nets:

`rawPpaNet = rawPpaOffMean - rawPpaDefMean`

`rawSuccessNet = rawSuccessOffMean - rawSuccessDefMean`

Required observation counts:

- `rawPpaOffN`
- `rawPpaDefN`
- `rawSuccessOffN`
- `rawSuccessDefN`

These reference aggregates allow later evaluation of whether opponent adjustment adds
information beyond the same canonical raw form.

They are not model coefficients or point-scale values.

## Team-side opponent-adjusted aggregates

For target team `T` entering target week `W`, aggregate available source-game
residuals using simple arithmetic means.

Required features:

- `oppAdjPpaOffMean`
- `oppAdjPpaDefMean`
- `oppAdjSuccessOffMean`
- `oppAdjSuccessDefMean`

Required residual observation counts:

- `oppAdjPpaOffN`
- `oppAdjPpaDefN`
- `oppAdjSuccessOffN`
- `oppAdjSuccessDefN`

Directional adjusted nets:

`oppAdjPpaNet = oppAdjPpaOffMean + oppAdjPpaDefMean`

`oppAdjSuccessNet = oppAdjSuccessOffMean + oppAdjSuccessDefMean`

The defense residuals are already oriented positive=favorable, so adjusted net uses
addition rather than raw offense-minus-defense subtraction.

An adjusted net is available only when both adjusted component means are available.

## No weighting in OA-1 Feature V1

V1 uses equal-game arithmetic means only.

Forbidden in this feature contract:

- recency weighting;
- exponential decay;
- opponent-quality weighting beyond the frozen residual formula;
- margin-of-victory weighting;
- score weighting;
- garbage-time weighting;
- snap weighting;
- conference weighting;
- home/away weighting;
- neutral-site weighting;
- reliability shrinkage;
- Bayesian priors;
- iterative SRS;
- fixed-point rating solving;
- PageRank-style recursion;
- ridge / regression coefficient fitting.

Those require a new feature or model contract.

## Missingness and partial coverage

Missing is not zero.

### Target with no prior canonical games

If a target side has no prior canonical game with provider week < target week:

- all raw means unavailable;
- all raw counts = 0;
- all opponent-adjusted means unavailable;
- all opponent-adjusted counts = 0;
- status = `NO_PRIOR_FBS_GAMES`.

### Prior games exist but source metric unavailable

A source row with `SOURCE_UNAVAILABLE` does not contribute numeric values.

The feature artifact must count such prior rows separately:

- `priorCanonicalGames`
- `priorAvailableMetricGames`
- `priorSourceUnavailableGames`

Do not zero-fill the missing game.

### Opponent baseline unavailable

If T has an available source-game metric but the opponent baseline has zero eligible
observations after excluding source game `g`:

- that source-game residual is unavailable;
- the raw T metric may still contribute to its raw reference mean;
- the opponent-adjusted residual count does not increase.

### Partial opponent-baseline coverage

If at least one residual is available but fewer residuals are available than raw T
metric observations:

- compute the opponent-adjusted mean over available residuals only;
- preserve exact raw and adjusted observation counts;
- aggregate status = `PARTIAL_OPPONENT_BASELINE`.

If all eligible raw metric observations have residuals:

- aggregate status = `AVAILABLE`.

If raw history exists but zero residuals are available:

- aggregate status = `NO_OPPONENT_BASELINE`.

The future model contract decides whether partial coverage is acceptable.

Feature V1 does not drop the game solely because adjusted history is partial.

## Frozen 2024 SOURCE_UNAVAILABLE semantics

The four canonical 2024 unavailable provider games remain:

- `401641034`
- `401644689`
- `401644780`
- `401645328`

Both team sides for those games remain `SOURCE_UNAVAILABLE`.

For future 2024 OA feature construction:

- the target frame for one of those games may still exist from identity fields;
- that target game's own missing efficiency values are not predictive inputs;
- if one of those games is prior history for a later target, it contributes no numeric
  raw or adjusted metric;
- it increments explicit source-unavailable prior-history counts;
- it must not be zero-filled, mirrored, reconstructed, or silently dropped from game
  universe accounting.

## Matchup representation boundary

OA-1 Feature V1 emits separate home-side and away-side feature bundles.

It does **not** compute:

- home-minus-away deltas;
- ratios;
- absolute gaps;
- interactions;
- favorite / underdog orientation;
- point spreads;
- HFA-adjusted values.

Those belong to the later OA model-development protocol.

## No outcome / market use

The OA-1 feature builder must not read:

- home score;
- away score;
- final margin;
- winner;
- target-game postgame fields;
- historical market lines;
- spreads;
- totals;
- moneylines;
- sportsbook prices;
- CLV;
- ATS;
- ROI;
- bets.

The feature artifact must contain no target outcome or market field.

Historical outcomes may be joined only later under a separately frozen model-development
or validation scorer.

## Development output artifact

The first implementation should emit an immutable 2022–2023 development feature
artifact.

Recommended members:

1. `features/oa_1_game_features.json`
2. `audit/source_identity.json`
3. `audit/feature_availability.json`
4. `audit/opponent_baseline_coverage.json`
5. `audit/source_unavailable_history.json`
6. `report.json`
7. `manifest.json`

The feature payload should contain:

- game identity / structural metadata;
- home team bundle;
- away team bundle;
- raw reference aggregates;
- opponent-adjusted aggregates;
- exact observation counts;
- availability statuses;
- no outcomes;
- no markets.

## Initial development builder QA invariants

The first 2022–2023 builder must assert:

### Source identity

- 2022 rows = **1,468**
- 2023 rows = **1,500**
- 2022 fingerprint-set SHA-256 =
  `f2aa64e9b19aa29b8ef12ecb3b1ed0712837150609b0e039e17be27e654edeb3`
- 2023 fingerprint-set SHA-256 =
  `f17635c153caff8cfe85f704054bef40625cbae80317db40ad5ba32f81e663f0`

### Target universe

- 2022 games = **734**
- 2023 games = **750**
- combined target games = **1,484**
- duplicate target game keys = **0**
- bad two-sided game frames = **0**

### Timing

- every team-history source week < target week;
- every opponent-baseline source week < target week;
- every opponent-baseline source game != residual source game;
- same-week source rows used = **0**;
- cross-season history rows used = **0**.

### Source isolation

- provider calls = **0**
- database writes = **0**
- 2024 row reads = **0**
- 2025 row reads = **0**
- 2026 row reads = **0**
- legacy `team_game_stats` reads = **0**
- outcome reads = **0**
- market reads = **0**
- bet reads = **0**
- model prediction reads = **0**

### Numeric integrity

- all emitted numeric means / residuals finite;
- unavailable values serialized as null plus status/count metadata;
- no unavailable value encoded as zero unless zero is an actual observed arithmetic
  result;
- adjusted count never exceeds corresponding raw metric count;
- raw and adjusted component/net availability obeys the frozen rules.

## Execution boundary

Merging this contract does not execute a builder and does not read production data.

The next engineering slice may implement:

- pure deterministic OA-1 transformation helpers;
- a read-only 2022–2023 database adapter restricted to
  `team_game_efficiency_canonical_v1`;
- unit tests;
- a manual guarded workflow;
- immutable artifact output.

The first execution after implementation must be:

- 2022–2023 only;
- read-only;
- zero provider calls;
- zero DB writes;
- zero 2024/2025/2026 row reads;
- zero outcome / market reads.

That development feature build must be independently audited before any OA model
development protocol is frozen.

## Future 2024 validation feature build

After the 2022–2023 OA-1 feature artifact is independently accepted, a separate
validation-stage authorization may build 2024 OA-1 features.

The 2024 builder must verify:

- rows = **1,504**
- games = **752**
- fingerprint-set SHA-256 =
  `bafb5c589ed144f7f7ef9634829fb4b5fb6ad8c408b9e0f3cd560615a3464c22`
- SOURCE_UNAVAILABLE rows = **8**
- exact frozen unavailable game IDs.

That build still must not read 2024 outcomes.

A separate validation scorer freezes and controls the one-shot 2024 outcome read.

## Future 2025 holdout boundary

The 2025 source-set identity is frozen for future holdout continuity:

- rows = **1,524**
- games = **762**
- fingerprint-set SHA-256 =
  `f771b0d8ac2bc2c0594e7ac0e56d90b18165c392173a2f25967641f44d123cf6`

Recording that source identity does not authorize OA-1 development or validation code
to read 2025 rows.

## Research interpretation boundary

A successful OA-1 feature build proves only:

- the canonical historical DB can deterministically produce the frozen
  opponent-adjusted feature vocabulary;
- point-in-time history boundaries are respected;
- missingness is explicit;
- no prohibited source is read.

It does **not** prove:

- opponent adjustment improves prediction accuracy;
- OA features beat raw form;
- OA features beat Core V1;
- profitability;
- ATS edge;
- CLV;
- calibration;
- production readiness.

Those are later model/validation questions.

## Versioning

Any semantic change requires a new OA feature-contract version, including changes to:

- history timing;
- same-week policy;
- opponent-baseline timing;
- source-game exclusion;
- baseline weighting;
- residual direction;
- raw feature vocabulary;
- adjusted feature vocabulary;
- missingness handling;
- partial-coverage handling;
- aggregation;
- source table;
- source-set identity;
- target-game grain;
- permitted research seasons.

OA-1 Feature V1 must not drift silently.
