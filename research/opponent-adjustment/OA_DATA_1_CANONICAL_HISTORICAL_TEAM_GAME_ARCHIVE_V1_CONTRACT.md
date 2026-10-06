# OA-DATA-1 Canonical Historical Team-Game Archive V1 — Contract

**Status:** FROZEN DATA-LAYER DESIGN — RESEARCH ONLY / NO BUILD EXECUTED YET  
**Seasons:** 2022–2025  
**Development:** 2022–2023  
**Validation:** 2024 — source-informed, not pristine  
**Final holdout:** 2025 — OA model-performance outcomes remain unobserved  
**Does not authorize:** provider calls, database writes, TeamGameStat mutation, model fitting, formula selection, 2025 outcome scoring, market evaluation, or production changes.

## Purpose

Create one deterministic, two-sided historical advanced-stat archive for opponent-adjustment research without trusting the flawed legacy historical `team_game_stats` ingest, re-downloading already frozen source data, silently filling gaps, or changing Core V1.

OA-DATA-1 is a research data product, not a model.

## Historical DB defect

Read-only audit established that the legacy historical `team_game_stats` population is not authoritative:

- 2024: 633 rows / 633 games and every persisted row is the actual AWAY team.
- 2025: 588 rows and every persisted row is the actual AWAY team.
- 2024/2025 raw payloads have no `homeAway` field.
- the legacy mapper assumed `homeAway`; absent values therefore flowed through its non-home branch.
- the guarded 2026 writer explicitly treats canonical Game orientation plus provider team/opponent identity as authoritative.

The existing table schema supports two rows per game through the `(game_id, team_id)` unique key. The defect is historical ingest behavior, not a required one-row frame.

## Frozen source identities

Only these exact immutable artifacts are authorized.

### 2022

- run `36464140881`
- artifact ID `10988661299`
- source SHA `e8a2b184c88f39866f29b865a3fd65ad82f99ec0`
- ZIP SHA-256 `7a5b76b681b0ef1873853956cdc5b39cb3581675cf84e6ca6f972141ea2dfe99`
- canonical games: 734
- canonical advanced team-game rows: 1,468 / 1,468

### 2023

- run `36470674904`
- artifact ID `10990949531`
- source SHA `7150e263284255e67adf87521fcb710ec97a91a9`
- ZIP SHA-256 `479d5dc4481a6f7ab7b2c034976b8845814121cfc0f11c0b18a8166c61fc5bd4`
- canonical games: 750
- canonical advanced team-game rows: 1,500 / 1,500

### 2024

Primary snapshot:

- run `36508377627`
- artifact ID `11008470975`
- source SHA `e1b27f6c5681f6ab4f8d24e50f88e387c64657a7`
- ZIP SHA-256 `b41e934b26952100e7e056a56114dc81df6bbe77f5c787f28b75b646ae7ea544`
- canonical games: 752
- canonical advanced team-game rows: 1,496 / 1,504

Exact missing games:

- `401641034` — New Mexico State @ Sam Houston — Week 4
- `401645328` — Rice @ Army — Week 4
- `401644689` — Kent State @ Miami (OH) — Week 12
- `401644780` — Eastern Michigan @ Western Michigan — Week 14

Qualified same-endpoint recovery evidence:

- resolution run directory `36590634515`
- artifact ID `11043269261`
- ZIP SHA-256 `c0c307af5b008b0e35baabc89f5ea743dae496991dcb83ead679478b6b109444`
- status `HISTORICAL_V3_WEEK_QUERY_QUALIFIED`
- qualification comparisons 64 / 64 exact
- recovery calls: 3
- accepted recovery rows: 0
- recovery completeness: `ZERO`
- unresolved game IDs: the same four games above

OA-DATA-1 must not repeat this same-endpoint recovery attempt.

### 2025

- run `36433016296`
- artifact ID `10973848747`
- source SHA `f17b6876ddc8d660ce6b5572ef8742f4e7f9cea7`
- ZIP SHA-256 `fda9a410faf3f648de1135a7ed841a497d947d844978513e0bfcd88aea9d0b22`
- canonical games: 762
- canonical advanced team-game rows: 1,524 / 1,524

No second 2025 provider capture is authorized or required.

## Canonical archive universe

The archive grain is one row per canonical completed regular-season FBS-vs-FBS game/team side.

| Season | Games | Team-side rows | AVAILABLE | SOURCE_UNAVAILABLE |
|---|---:|---:|---:|---:|
| 2022 | 734 | 1,468 | 1,468 | 0 |
| 2023 | 750 | 1,500 | 1,500 | 0 |
| 2024 | 752 | 1,504 | 1,496 | 8 |
| 2025 | 762 | 1,524 | 1,524 | 0 |
| **Total** | **2,998** | **5,996** | **5,988** | **8** |

The eight unavailable rows are the two team sides for the four unresolved 2024 games. They remain in the archive with null metrics and explicit `SOURCE_UNAVAILABLE` status.

## Canonical identity

For every row preserve:

- season
- provider game ID
- provider week
- scheduled/start timestamp when present
- home team provider identity
- away team provider identity
- target team provider identity
- opponent provider identity
- `isHome`
- neutral-site flag

Do not emit target final score, winner, margin, postgame Elo, or other outcome values.

## Selected raw efficiency fields

For `AVAILABLE` rows:

- `ppaOff = offense.ppa`
- `ppaDef = defense.ppa`
- `successOff = offense.successRate`
- `successDef = defense.successRate`

No new predictive feature family is created in OA-DATA-1.

## Two-sided semantic parity

The paired 2026 audit established across 271 / 271 games:

- home offense PPA == away defense PPA exactly
- away offense PPA == home defense PPA exactly
- home offense success == away defense success exactly
- away offense success == home defense success exactly

Maximum absolute difference for each tested relationship: 0.

This is QA evidence only. OA-DATA-1 uses direct provider rows whenever a source-available canonical game already contains both rows. It does not mirror values to invent a game that is absent entirely.

## Status and missingness

Allowed row statuses:

- `AVAILABLE`
- `SOURCE_UNAVAILABLE`

`AVAILABLE` requires exact game/team/opponent identity and all four selected metrics finite.

`SOURCE_UNAVAILABLE` requires a valid canonical team side with no authorized exact advanced row.

Unavailable numeric values are null.

Forbidden:

- zero-fill
- mean/conference imputation
- interpolation
- alternate-provider substitution
- rejected `/game/box/advanced` substitution
- play-by-play or drive reconstruction
- future-season copying
- silent game exclusion
- another provider refetch of the four known 2024 gaps

## Provenance

Every row must record:

- source season
- source artifact ID
- source artifact ZIP SHA-256
- source endpoint `/stats/game/advanced`
- source method
- exact source member or frozen source reference
- builder repo SHA
- contract version

Allowed `sourceMethod` values in V1:

- `DIRECT_PROVIDER_ROW`
- `SOURCE_UNAVAILABLE`

## PIT boundary

OA-DATA-1 itself computes no target-game feature.

Any later OA feature builder may use only historical rows whose provider week is strictly less than the target game's provider week. Same-week earlier kickoffs remain excluded under the established conservative historical clock.

## 2025 holdout boundary

2025 may be opened only for the frozen source rows needed to construct this archive. It remains unavailable for OA formula selection or model-performance inspection.

Before OA model scoring on 2025:

1. develop only on 2022–2023;
2. validate under the frozen 2024 protocol;
3. freeze the final OA candidate;
4. freeze a separate 2025 scoring contract;
5. obtain separate explicit authorization for one-shot 2025 scoring.

OA-DATA-1 must report:

- `outcomeFieldsUsed=false`
- `modelPredictionsComputed=false`
- `modelPerformanceComputed=false`

## Market, provider, and DB boundaries

Required for the OA-DATA-1 builder:

- provider calls = 0
- database reads = 0
- database writes = 0
- Prisma invoked = false
- market reads = 0

Historical lines are not read or emitted.

No historical `team_game_stats` repair is authorized by this contract.

## Required artifact set

A future deterministic builder must emit at minimum:

1. `archive/canonical_team_games.json`
2. `audit/source_coverage.json`
3. `audit/source_gaps.json`
4. `source_provenance.json`
5. `report.json`
6. `manifest.json`

Every emitted file must be hashed.

## QA invariants

Build acceptance requires all of the following:

- exact source ZIP hashes verified
- no unlisted artifact opened
- canonical games = 2,998
- canonical team-side rows = 5,996
- duplicate season/game/team-side keys = 0
- 2022 rows = 1,468
- 2023 rows = 1,500
- 2024 rows = 1,504
- 2025 rows = 1,524
- AVAILABLE rows = 5,988
- SOURCE_UNAVAILABLE rows = 8
- all 8 unavailable rows belong only to the four frozen 2024 missing games
- exactly one HOME and one AWAY row per canonical game
- every AVAILABLE row has four finite selected metrics
- target/opponent orientation reconciles to the frozen games frame
- no provider `homeAway` field is required
- provider calls = 0
- database reads/writes = 0
- Prisma invoked = false
- market reads = 0
- outcome fields used = false
- model fit/predictions = false
- 2025 model-performance reads = 0

## Research roles after acceptance

After an independently audited OA-DATA-1 build:

- 2022–2023 may support OA development under OA-1;
- 2024 may support source-informed validation under OA-1;
- 2025 remains the one-shot final holdout for the final frozen OA candidate;
- 2026 remains prospective/shadow evidence.

## Future historical DB repair

Only after OA-DATA-1 passes independent audit may a separate guarded database persistence/backfill capability be designed.

That later capability must:

- use the accepted OA-DATA-1 artifact as its only data source;
- PREVIEW before writes;
- report create/update/unchanged/conflict counts;
- preserve the eight 2024 source gaps rather than fabricating stats;
- never mutate 2026 rows;
- require an exact explicit COMMIT confirmation;
- verify natural keys and values after COMMIT.

Merging this contract does not authorize DB mutation.

## Next boundary

After merge, the next engineering slice may implement the artifact-only deterministic OA-DATA-1 builder, tests, and guarded manual workflow.

Merging that capability does not execute the build. The build must be independently audited before OA-1 model development begins.
