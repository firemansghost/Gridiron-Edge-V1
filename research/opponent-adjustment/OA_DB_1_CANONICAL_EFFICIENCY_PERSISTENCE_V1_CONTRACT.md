# OA-DB-1 Canonical Team-Game Efficiency Persistence V1 — Contract

**Status:** FROZEN DATA-PERSISTENCE DESIGN — RESEARCH DATA LAYER ONLY / NO DATABASE MUTATION AUTHORIZED  
**Initial load seasons:** 2022, 2023, 2024, 2025  
**Canonical source:** accepted OA-DATA-1 artifact only  
**2026 posture:** explicitly protected / out of mutation scope  
**Does not authorize:** schema deployment, database writes, legacy `team_game_stats` repair, Core V1 changes, OA model fitting, 2025 outcome scoring, market evaluation, or production promotion

## Purpose

OA-DB-1 defines a safe canonical database representation for the accepted OA-DATA-1
2022–2025 efficiency archive.

The goal is to normalize future historical research access without:

- mutating or pretending to fully repair the malformed legacy `team_game_stats` population;
- fabricating missing 2022–2023 `games` rows;
- inventing box-stat fields that OA-DATA-1 did not preserve;
- losing the eight explicit 2024 source-unavailable team sides;
- touching the clean 2026 production TeamGameStat pipeline;
- weakening 2025 holdout discipline.

This contract is infrastructure / research-data normalization, not a model change.

## Why OA-DB-1 does not write directly into `team_game_stats`

Read-only database audit established several incompatibilities.

### Legacy table requirements

`team_game_stats` requires:

- `game_id` foreign key to `games.id`;
- `team_id` foreign key to `teams.id`;
- non-null `offensive_stats` JSON;
- non-null `defensive_stats` JSON;
- non-null `special_teams` JSON.

The table also supports optional fields that OA-DATA-1 intentionally did not retain,
including YPP, pace, pass YPA, rush YPC, and full raw provider JSON.

### Historical game-table coverage

Current production readback shows:

- `games` contains 2024 and 2025 rows;
- `games` contains no 2022 or 2023 rows at the OA-DB-1 checkpoint.

Therefore 2022–2023 OA-DATA-1 rows cannot be inserted into `team_game_stats`
without first creating unrelated historical `games` records.

### Source-shape mismatch

OA-DATA-1 intentionally preserves only the validated research fields:

- offense PPA;
- defense PPA;
- offense success rate;
- defense success rate;
- canonical provider identity;
- availability status;
- source provenance.

Writing those rows into `team_game_stats` would require either:

1. fabricating required JSON structures and implying unavailable metrics existed; or
2. separately rebuilding historical Game and full advanced-stat payload state.

Neither is authorized by OA-DATA-1.

Decision:

> OA-DB-1 must use a dedicated canonical research-efficiency table. It must not mutate
> legacy `team_game_stats`, `games`, or 2026 production data.

## Target table

Frozen physical table name:

`team_game_efficiency_canonical_v1`

Frozen Prisma model name:

`CanonicalTeamGameEfficiencyV1`

The table is versioned explicitly so a future incompatible semantic revision can use a
new table/version rather than silently rewriting accepted V1 evidence.

## Canonical source binding

The only authorized initial-load source is the accepted OA-DATA-1 artifact:

- run: `37513866192`
- artifact ID: `11436781151`
- artifact name:
  `oa-data-1-canonical-historical-archive-v1-37513866192`
- artifact ZIP SHA-256:
  `0d5371f7dda6f95a14bbd4d40d7a04c442c998daa1a0e47a3459b76364631e10`
- source repo SHA:
  `caff37b8cdb12f0e5f49ab680d976f7d2b258779`
- OA-DATA-1 contract:
  `oa_data_1_canonical_historical_team_game_archive_v1`

Frozen accepted counts:

- canonical games: **2,998**
- canonical team-side rows: **5,996**
- AVAILABLE: **5,988**
- SOURCE_UNAVAILABLE: **8**

No CFBD/provider call is authorized.

## Team identity resolution

Provider team names are resolved through:

`cfbd_team_map.team_name_cfbd -> cfbd_team_map.team_id_internal`

Pre-contract audit established:

- OA-DATA-1 distinct provider team names: **136**
- all 136 resolve in `cfbd_team_map`;
- `cfbd_team_map` rows: **615**
- unique CFBD names: **615**
- unique internal IDs: **615**
- duplicate CFBD names: **0**
- mapping rows whose internal team ID is absent from `teams`: **0**

The PREVIEW must re-run these checks at execution time.

Any missing or duplicate provider-team mapping is a write blocker.

## Table grain and natural key

One row represents one canonical team side of one provider game.

Frozen natural key:

`(season, provider_game_id, team_id_internal)`

Required uniqueness:

- exactly one row per natural key;
- exactly two canonical rows per provider game in the accepted initial archive;
- exactly one `is_home=true` and one `is_home=false` row per provider game.

`provider_game_id` is stored as text to avoid coupling to provider numeric-width assumptions.

## Frozen columns

The V1 table must contain at minimum:

### Identity

- `season INTEGER NOT NULL`
- `provider_game_id TEXT NOT NULL`
- `provider_week INTEGER NOT NULL`
- `start_date TIMESTAMP NULL`
- `neutral_site BOOLEAN NULL`
- `home_team_name_cfbd TEXT NOT NULL`
- `away_team_name_cfbd TEXT NOT NULL`
- `team_name_cfbd TEXT NOT NULL`
- `opponent_name_cfbd TEXT NOT NULL`
- `team_id_internal TEXT NOT NULL`
- `opponent_team_id_internal TEXT NOT NULL`
- `is_home BOOLEAN NOT NULL`

### Availability

- `availability_status TEXT NOT NULL`

Allowed values:

- `AVAILABLE`
- `SOURCE_UNAVAILABLE`

### Selected efficiency fields

Nullable:

- `ppa_off DOUBLE PRECISION NULL`
- `ppa_def DOUBLE PRECISION NULL`
- `success_off DOUBLE PRECISION NULL`
- `success_def DOUBLE PRECISION NULL`

Rules:

- AVAILABLE -> all four selected metrics finite / non-null;
- SOURCE_UNAVAILABLE -> all four selected metrics null.

### Row provenance

- `source_season INTEGER NOT NULL`
- `source_artifact_id TEXT NOT NULL`
- `source_artifact_zip_sha256 TEXT NOT NULL`
- `source_endpoint TEXT NOT NULL`
- `source_raw_member TEXT NOT NULL`
- `source_method TEXT NOT NULL`
- `archive_contract_version TEXT NOT NULL`
- `archive_run_id TEXT NOT NULL`
- `archive_artifact_id TEXT NOT NULL`
- `archive_artifact_zip_sha256 TEXT NOT NULL`
- `record_fingerprint_sha256 TEXT NOT NULL`

### Persistence metadata

- `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at TIMESTAMP NOT NULL`

The implementation may add a deterministic surrogate `id` if Prisma requires one, but
the natural key above remains the semantic identity.

## Source-method rules

Allowed values:

- `DIRECT_PROVIDER_ROW`
- `SOURCE_UNAVAILABLE`

Do not create a mirror-reconstruction source method in V1.

The paired 2026 offense/defense symmetry proof remains QA evidence, not a license to
manufacture an entirely absent 2024 game.

## Record fingerprint

Each planned row must have a deterministic SHA-256 fingerprint over the canonical
semantic payload.

The fingerprint must include at minimum:

- season;
- provider game ID;
- provider week;
- start date;
- neutral-site value;
- provider home/away names;
- target/opponent provider names;
- target/opponent internal IDs;
- isHome;
- availability status;
- four selected efficiency values;
- source artifact identity/hash;
- source endpoint/member/method;
- archive contract/run/artifact identity/hash.

The canonical serialization rules must be frozen in implementation tests.

Timestamps generated by persistence are not fingerprint inputs.

## Initial-load season boundary

OA-DB-1 V1 initial load is restricted to:

- 2022
- 2023
- 2024
- 2025

The accepted archive contains exactly:

| Season | Rows | AVAILABLE | SOURCE_UNAVAILABLE |
|---|---:|---:|---:|
| 2022 | 1,468 | 1,468 | 0 |
| 2023 | 1,500 | 1,500 | 0 |
| 2024 | 1,504 | 1,496 | 8 |
| 2025 | 1,524 | 1,524 | 0 |
| **Total** | **5,996** | **5,988** | **8** |

The exact source-unavailable 2024 provider game IDs remain:

- `401641034`
- `401645328`
- `401644689`
- `401644780`

Both team sides for each remain persisted with
`availability_status=SOURCE_UNAVAILABLE` and null selected metrics.

## 2026 protection

The OA-DB-1 initial-load planner and writer must never create, update, delete, or
otherwise mutate a season-2026 row.

Required PREVIEW assertions:

- `targetSeasonMin=2022`
- `targetSeasonMax=2025`
- `planned2026Mutations=0`
- any existing 2026 target-table row count is reported separately;
- 2026 rows, if they ever exist under a later contract, are excluded from V1 write plans.

No mutation of:

- `team_game_stats`
- `games`
- `bets`
- ratings tables
- market tables
- shadow tables
- any 2026 source table

is authorized.

## PREVIEW semantics

PREVIEW is mandatory before schema or data COMMIT.

PREVIEW may read:

- the accepted OA-DATA-1 artifact;
- `cfbd_team_map`;
- `teams`;
- `information_schema` / `pg_catalog` for target-table existence;
- the target table if it already exists.

PREVIEW must not read:

- final scores for model evaluation;
- market lines;
- bets;
- T−30 evidence;
- 2025 OA model performance.

PREVIEW must perform **zero writes**.

### Required PREVIEW classifications

For every accepted OA-DATA-1 row, classify:

- `CREATE` — natural key absent from target table;
- `IDENTICAL` — natural key present and fingerprint matches exactly;
- `CONFLICT` — natural key present but fingerprint differs.

For V1:

- `UPDATE` count must be reported but is frozen to **0**;
- differing accepted evidence is a CONFLICT, not an automatic update.

Also report:

- `SOURCE_UNAVAILABLE` row count;
- unexpected existing target rows in seasons 2022–2025 not represented in the accepted artifact;
- duplicate target-table natural keys;
- team-map missing/duplicate blockers;
- team-ID existence blockers;
- target-table existence;
- schema-deployed status;
- 2026 existing rows;
- 2026 planned mutations.

### Required expected first PREVIEW if target table does not exist

If the target table is absent and all identity checks pass:

- planned CREATE: **5,996**
- IDENTICAL: **0**
- UPDATE: **0**
- CONFLICT: **0**
- SOURCE_UNAVAILABLE: **8**
- planned 2026 mutations: **0**

This is a plan, not authorization to create the schema or rows.

## Schema deployment boundary

Merging a migration or implementation capability does not deploy the schema.

A future schema deployment is a production database mutation and requires explicit
authorization.

If PREVIEW is run before schema deployment, it must report:

- `targetTableExists=false`
- `schemaDeploymentRequired=true`

After an explicitly authorized schema deployment, PREVIEW must be run again before
data COMMIT.

## COMMIT semantics

No COMMIT is authorized by this contract.

A future guarded COMMIT may proceed only when:

1. target schema is already deployed and independently verified;
2. a post-schema PREVIEW is clean;
3. blockers = 0;
4. conflicts = 0;
5. unexpected existing rows = 0;
6. planned 2026 mutations = 0;
7. exact expected source artifact/hash matches;
8. Bobby provides explicit COMMIT authorization.

Frozen exact confirmation string for a future data COMMIT:

`WRITE_OA_DB_1_CANONICAL_EFFICIENCY_2022_2025`

The writer must be transactional.

V1 COMMIT behavior:

- create missing accepted rows;
- leave IDENTICAL rows unchanged;
- never update CONFLICT rows;
- never delete rows;
- never mutate 2026.

## Post-COMMIT verification

After any future authorized COMMIT, independently verify:

- total target rows for 2022–2025 = **5,996**;
- AVAILABLE = **5,988**;
- SOURCE_UNAVAILABLE = **8**;
- per-season counts exactly match the frozen table above;
- duplicate natural keys = 0;
- fingerprint mismatches vs accepted artifact = 0;
- unexpected existing rows = 0;
- 2026 mutation count = 0;
- legacy `team_game_stats` unchanged by OA-DB-1;
- `games` unchanged by OA-DB-1.

## Research-use boundary

The V1 canonical efficiency table is a research data layer.

Its existence does not authorize:

- Core V1 to read it;
- production ratings to switch sources;
- OA model fitting before OA-1 is frozen;
- 2025 outcome access;
- market feature use;
- challenger promotion.

Future research code must name this table explicitly and preserve the frozen
development/validation/holdout roles:

- 2022–2023 development
- 2024 source-informed validation
- 2025 final one-shot holdout
- 2026 prospective / shadow

## Next authorization boundary

After this contract is merged, the next engineering slice may implement:

1. Prisma/schema definition and migration artifact;
2. pure deterministic row/fingerprint planner;
3. guarded PREVIEW workflow;
4. unit tests and schema guardrails.

Merging that implementation does not deploy the database schema and does not write any
canonical efficiency rows.

The first execution after implementation should be PREVIEW only.
