# Historical Development Corpus V1 — Construction Contract

**Status:** FROZEN CORPUS DESIGN — RESEARCH ONLY  
**Development seasons:** 2022 and 2023 only  
**Validation season:** 2024 — reserved, not captured/authorized here  
**Final holdout:** 2025 — locked, not available for development decisions  
**Does not authorize:** feature computation, normalization, model fitting, tuning, backtest claims, database writes, 2024 provider capture, or 2025 development use

## Purpose

Historical Development Corpus V1 defines the deterministic, leakage-controlled raw
research corpus that may later support model development on the audited 2022 and 2023
historical snapshots.

This contract freezes **corpus construction before feature construction**.

It deliberately does **not** freeze:

- a model formula;
- feature weights;
- z-scores or other normalization;
- rolling-window formulas;
- HFA points;
- market-edge formulas;
- selection thresholds;
- imputation;
- feature selection;
- training procedure;
- cross-validation procedure;
- a production persistence schema.

Those require later, separately reviewed contracts.

The corpus must preserve the distinction between:

1. facts allowed on the predictive-input side of a historical game;
2. outcome labels available only after the game;
3. market evidence used only for later evaluation;
4. captured evidence that is not yet authorized as a predictive source.

## Frozen source evidence

The only authorized source snapshots for V1 are the exact audited GitHub Actions
artifacts below.

### 2022 development source

- workflow run: `36464140881`
- source repo SHA: `e8a2b184c88f39866f29b865a3fd65ad82f99ec0`
- artifact: `historical-research-snapshot-v1-2022-36464140881`
- artifact ZIP SHA-256:
  `7a5b76b681b0ef1873853956cdc5b39cb3581675cf84e6ca6f972141ea2dfe99`
- manifested files independently verified: **28 / 28**
- canonical FBS-vs-FBS regular-season games: **734**
- canonical teams: **131**

### 2023 development source

- workflow run: `36470674904`
- source repo SHA: `7150e263284255e67adf87521fcb710ec97a91a9`
- artifact: `historical-research-snapshot-v1-2023-36470674904`
- artifact ZIP SHA-256:
  `479d5dc4481a6f7ab7b2c034976b8845814121cfc0f11c0b18a8166c61fc5bd4`
- manifested files independently verified: **28 / 28**
- canonical FBS-vs-FBS regular-season games: **750**
- canonical teams: **133**

### Combined development universe

- seasons: **2022 + 2023**
- canonical completed games: **1,484**
- postseason games: excluded
- FBS-vs-FCS games: excluded
- 2024: excluded
- 2025: excluded from development

The implementation must consume the exact hash-verified source bytes above.

It must **not** refetch CFBD to repair, refresh, or fill a historical source.

If the exact archived bytes are unavailable, hash verification fails, or a source file
is missing, corpus construction must fail closed.

A future durability copy may move the same verified bytes to another private storage
location. A transport change does not change corpus identity if the bytes and hashes
remain exact.

## Corpus grain and canonical game universe

The primary corpus grain is:

**one record per canonical completed regular-season FBS-vs-FBS game**.

Primary identity:

- season;
- provider game ID.

The canonical game set comes only from the captured CFBD `/games` payload for that
season using the already-audited filter:

- `season == target season`;
- `seasonType == regular`;
- `homeClassification == fbs`;
- `awayClassification == fbs`;
- completed game required for development labels.

The implementation must reproduce exactly:

- 2022: **734** games;
- 2023: **750** games;
- combined: **1,484** games.

Any duplicate game ID, missing canonical game, unexpected added game, or changed game
set is a blocker.

## Game identity and structural metadata

The predictive-side game identity record may contain pregame-known structural fields
from the canonical games payload, including:

- season;
- provider week;
- provider game ID;
- home team identity;
- away team identity;
- home/away designation;
- neutral-site flag;
- scheduled/start timestamp when present in the captured payload.

These fields define identity, sequencing, and matchup structure.

They do not authorize a specific HFA formula or point value.

### Team identity rule

The historical snapshot audit derived canonical team membership from exact provider
team strings in the canonical games payload.

V1 preserves that conservative behavior:

- trim leading/trailing whitespace only for identity comparison;
- otherwise require exact provider team identity;
- no fuzzy matching;
- no mascot inference;
- no conference-based rescue;
- no invented alias;
- no manual team substitution.

A prior-source row that does not resolve under this rule remains unavailable.

## Physical separation of corpus layers

V1 must be constructed as logically and physically separable layers.

At minimum the implementation must produce distinct artifacts or independently hashed
sections for:

1. **game identity / prediction frame**
2. **static prior source rows**
3. **prior-week game-history source rows**
4. **outcome labels**
5. **market evaluation evidence**
6. **quarantined / non-predictive captured evidence**
7. **manifest / provenance**

Outcome, market, and quarantined evidence must not be embedded inside the predictive
input record merely for convenience.

A downstream feature builder must be able to read the predictive layers without
loading outcome or market sidecars.

## Predictive-source eligibility classes

Captured evidence is not automatically a model feature.

V1 assigns source families to one of four eligibility classes.

### Class A — point-in-time-safe structural or frozen-PIT sources

These source facts may be present on the predictive side of the corpus.

#### Game structural metadata

- game identity;
- provider week;
- home/away identity;
- neutral-site status;
- scheduled/start timestamp.

#### Historical Elo

Historical Elo follows the already-frozen
[`HISTORICAL_ELO_PIT_V1_CONTRACT.md`](./HISTORICAL_ELO_PIT_V1_CONTRACT.md):

- Week 1 -> preseason Elo;
- Week N, N >= 2 -> Week N-1 weekly Elo;
- same-week Week N Elo is prohibited.

The games payload's `homePregameElo` / `awayPregameElo` fields are not the feature
source.

The 2023 audit found **90 / 1,500** canonical team-games where game-level pregame Elo
differed from the frozen preseason/prior-week source. Those differences are not errors
to repair.

#### Prior-week completed-game history

CFBD advanced-game-stat and PPA rows may enter the corpus only as raw historical source
rows from provider weeks **strictly less than the target game's provider week**.

For a target game in Week N:

- allowed history: source games with provider week < N;
- prohibited history: source games with provider week >= N.

This rule intentionally forbids earlier games from the same provider week, even if an
exact kickoff timestamp would place them before the target game.

Reason:

- the historical corpus is frozen on a conservative provider-week clock;
- 2022 and 2023 both contain multi-game Week 1 team-weeks;
- same-week inclusion would create a second timing convention and a new leakage surface.

For Week 1, in-season advanced/PPA history is therefore structurally empty.

V1 stores eligible prior advanced/PPA rows as source history only.

It does not yet authorize:

- season-to-date averages;
- exponentially weighted averages;
- opponent adjustment;
- recency weights;
- minimum-game thresholds;
- offense/defense composites;
- EPA/PPA blends;
- clipping or winsorization.

Those are feature-definition decisions for a later contract.

### Class B — season-static candidate prior sources

The following captured season-level source rows may be carried into the corpus as
**raw candidate prior evidence**, subject to their explicit missingness:

- CFBD team talent for the target season;
- CFBD returning production for the target season;
- the four captured recruiting-team classes ending in the target season.

These are included because the historical snapshot program intentionally captured them
as season-level prior evidence, not as target-game outcomes.

However, V1 does not claim that the 2026 retrospective retrieval reproduces the exact
historical wall-clock publication timestamp at which each provider row first became
available.

Therefore:

- the raw rows may be attached to the development corpus;
- exact predictive fields are **not selected by this contract**;
- no normalization or composite is authorized;
- a later feature-definition contract must name the exact fields consumed.

Known missingness must remain explicit.

#### 2022 known prior missingness

- talent: complete **131 / 131**
- returning production:
  - James Madison unavailable
- preseason Elo: complete **131 / 131**
- recruiting 2019: complete
- recruiting 2020: complete
- recruiting 2021: complete
- recruiting 2022:
  - Florida International unavailable

#### 2023 known prior missingness

- talent: complete **133 / 133**
- returning production:
  - Jacksonville State unavailable
  - Sam Houston unavailable
- preseason Elo: complete **133 / 133**
- recruiting 2020: complete
- recruiting 2021: complete
- recruiting 2022:
  - Florida International unavailable
- recruiting 2023: complete

Do not repair these gaps from another season, another endpoint, a later snapshot, a
population average, or zero.

### Class C — evaluation-only evidence

The following evidence must remain outside the predictive input layers.

#### Target-game outcomes

For the target game itself:

- final home score;
- final away score;
- winner;
- final score margin;
- target-game postgame Elo;
- target-game advanced/PPA outcome rows;
- any other postgame field.

These may be used only as outcome/evaluation evidence after predictive inputs are
constructed.

#### Historical betting lines

All CFBD historical line rows remain **evaluation-only**.

They must not be predictive features.

V1 does not authorize:

- a historical closing-line reconstruction;
- market-implied features;
- line movement features;
- sportsbook consensus as model input;
- tuning model coefficients against a line timestamp treated as historically
  point-in-time-safe.

A separate historical market point-in-time/evaluation contract is required before
market evidence can be used for anything beyond descriptive/evaluation sidecars.

### Class D — quarantined captured evidence

#### Transfer portal

The captured `/player/portal?year=Y` payloads remain quarantined from predictive
Historical Development Corpus V1.

Reason:

- the year-level historical payload contains transfer-date and roster-movement evidence
  across the portal cycle;
- V1 has not frozen a historical cutoff rule proving which records were knowable before
  each season/game;
- rating coverage is materially incomplete;
- the 2022 and 2023 audits explicitly deferred portal aggregation semantics.

The raw portal payload may be preserved in a quarantine/descriptive sidecar.

It must not enter:

- feature construction;
- imputation;
- team availability rescue;
- normalization populations;
- model tuning.

A future portal feature requires a separate PIT contract/version.

## Missingness contract

Missing is not zero.

For every source family, corpus construction must distinguish:

- source row available;
- source row unavailable;
- structurally no prior history;
- field present but null/non-finite;
- identity resolution failure.

At minimum, downstream artifacts must preserve enough provenance to distinguish
specific reason codes such as:

- `SOURCE_ROW_UNAVAILABLE`
- `FIELD_VALUE_UNAVAILABLE`
- `TEAM_IDENTITY_UNRESOLVED`
- `NO_PRIOR_GAMES`
- `RETURNING_PRODUCTION_UNAVAILABLE`
- `RECRUITING_CLASS_UNAVAILABLE`
- `ELO_UNAVAILABLE`

Exact code spelling may be implemented later, but the semantic distinctions above are
frozen.

Forbidden:

- zero-fill;
- mean imputation;
- median imputation;
- conference imputation;
- copying another season;
- forward-filling from a future weekly snapshot;
- game-level Elo substitution for the frozen Elo source;
- dropping a row silently because one candidate prior is missing.

A later feature/model contract may decide that a model requires a complete vector and
therefore declares a game unavailable. That decision belongs to the model layer, not
the raw corpus builder.

## Outcome label sidecar

For each canonical completed game, V1 may preserve the raw final scores in a separate
outcome artifact.

The only derived development label frozen by this corpus contract is:

```
homeMargin = finalHomePoints - finalAwayPoints
```

Positive = home team scored more.  
Negative = away team scored more.  
Zero = tied regulation/final score if such a completed provider record exists.

This label definition does not authorize a model objective, regression loss, point
scale, or betting selection rule.

No ATS, ROI, closing-line, or market-adjusted label is part of Historical Development
Corpus V1.

## Market evaluation sidecar

Historical line rows may be attached only by provider game ID to a physically separate
evaluation artifact.

Preserve:

- raw provider identity;
- raw spread/total/moneyline fields as captured;
- all available books/aggregators;
- missing book coverage;
- raw row provenance.

Do not collapse to a single "closing" value in V1.

The 2022 and 2023 audits show different historical book depth. That variability must
remain visible rather than being hidden by a synthetic consensus.

## No feature engineering in Corpus V1

Historical Development Corpus V1 must preserve raw eligible source facts.

The builder must **not** calculate model features such as:

- z-scores;
- standardized ratings;
- rolling averages;
- weighted moving averages;
- opponent-adjusted metrics;
- recruiting composites;
- roster composites;
- continuity scores;
- portal metrics;
- power ratings;
- matchup deltas;
- HFA-adjusted margins;
- edge;
- probabilities;
- confidence tiers.

Even apparently harmless transforms belong in the subsequent feature-definition
contract so that they can be reviewed without changing corpus identity.

Simple deterministic bookkeeping is allowed:

- exact joins;
- week filtering;
- source availability flags;
- raw-row selection;
- row counts;
- hashes;
- source provenance;
- the separately stored `homeMargin` label.

## Season split and contamination boundaries

### Development

Only:

- 2022;
- 2023.

These seasons may later be used for feature research and model tuning after separate
contracts authorize those activities.

### Validation

2024 is reserved for validation after the development feature/model specification is
frozen.

Historical Development Corpus V1 does not authorize a 2024 provider capture.

### Final holdout

2025 remains locked for the final holdout.

2025 may not be used to decide:

- feature inclusion;
- missing-data handling;
- normalization;
- rolling windows;
- coefficients;
- point scale;
- HFA;
- thresholds;
- favorite/dog segmentation;
- ensemble weights;
- model promotion criteria.

The existing 2025 artifact remains usable only for pipeline/coverage/endpoint-semantic
work already allowed by the historical snapshot contract until the final holdout is
explicitly unlocked.

## No cross-season future leakage

A target game in season Y may not use dynamic game-history evidence from a later season.

Season-static candidate prior rows must use the target season's captured source family
and the specifically captured recruiting class history ending in that season.

No 2023 value may fill a missing 2022 value.

No 2025 value may participate in 2022/2023 construction or normalization.

## Reproducibility and artifact contract

The future corpus builder must be deterministic and artifact-only.

It must:

- make **zero provider calls**;
- make **zero database reads/writes** unless a later transport contract explicitly
  authorizes a read-only source;
- verify exact source artifact hashes before parsing;
- record builder repo SHA;
- record source run IDs and source SHA-256 identities;
- record exact canonical game counts;
- record exact source-row counts;
- record missingness counts and team identities;
- record all generated artifact byte counts and SHA-256 digests;
- fail on duplicate canonical game IDs;
- fail on unexpected source-season mixing;
- fail if outcome/market fields appear in predictive input artifacts;
- fail if same-week advanced/PPA history is attached to a target game;
- fail if Week N Elo is used for a Week N target game;
- fail if a quarantined portal source enters the predictive input layer.

The implementation should prefer immutable files over database persistence for this
research stage.

## Expected corpus QA invariants

At minimum, implementation QA must assert:

### 2022

- canonical games = **734**
- completed games = **734**
- canonical teams = **131**
- advanced canonical team-games = **1,468**
- PPA canonical team-games = **1,468**
- historical line games = **734**
- talent missing canonical teams = **0**
- returning-production missing canonical teams =
  **James Madison**
- preseason Elo missing canonical teams = **0**
- recruiting 2022 missing canonical teams =
  **Florida International**

### 2023

- canonical games = **750**
- completed games = **750**
- canonical teams = **133**
- advanced canonical team-games = **1,500**
- PPA canonical team-games = **1,500**
- historical line games = **750**
- talent missing canonical teams = **0**
- returning-production missing canonical teams =
  **Jacksonville State, Sam Houston**
- preseason Elo missing canonical teams = **0**
- recruiting 2022 missing canonical teams =
  **Florida International**

### Elo

The builder must assert source selection semantics, not refit them:

- Week 1 -> preseason;
- Week N >= 2 -> Week N-1;
- same-week Elo never selected.

The 2022/2023 semantic-audit match statistics remain audit references, not builder
inputs.

## What may happen after this contract is merged

Merging this contract may authorize a later, separately reviewed implementation slice
that builds and audits Historical Development Corpus V1 from the exact frozen source
artifacts.

It does **not** authorize model feature computation in the same slice.

The recommended sequence after corpus construction is:

1. implement artifact-only corpus builder;
2. independently verify corpus hashes, counts, temporal gates, missingness, and layer
   separation;
3. freeze a Historical Feature Definition V1 contract;
4. compute candidate features only after that feature contract is frozen;
5. freeze a model-development/tuning protocol;
6. tune only on 2022–2023;
7. freeze the candidate model;
8. separately capture/use 2024 for validation;
9. only after validation, explicitly unlock 2025 for final holdout evaluation.

## Versioning

Any semantic change to the following requires a new contract version:

- canonical game universe;
- same-week history rule;
- Elo source mapping;
- source eligibility class;
- missingness semantics;
- outcome label definition;
- market evidence posture;
- transfer-portal posture;
- season split;
- 2025 holdout boundary.

A documentation correction that does not change any generated corpus bytes may be
recorded without changing the V1 identity.
