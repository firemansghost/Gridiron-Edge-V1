# Candidate B V1 — Feature Snapshot Persistence Design

**Status:** `PERSISTENCE_DESIGN_FROZEN`  
**Implementation status:** `NOT_READY_TO_IMPLEMENT_MODEL`  
**Contract date:** 2026-09-14  
**Companion contracts:**
- [`CANDIDATE_B_V1_INPUT_CONTRACT.md`](./CANDIDATE_B_V1_INPUT_CONTRACT.md)
- [`CANDIDATE_B_V1_FORMULA_CONTRACT.md`](./CANDIDATE_B_V1_FORMULA_CONTRACT.md)

This document freezes the **immutable derived team-feature snapshot** architecture needed to make Candidate B V1 runnable from GitHub Actions without private PIT files or live CFBD.

It authorizes **no** schema, migration, ingestion, runtime, workflow, PREVIEW, or COMMIT work by itself.

Candidate B methodology (sources, 50% portal gate, `NO_TRANSFERS` semantics, population SD divisor N, 25/25/25/25, 3.5 scale, full-vector requirement) remains as frozen in the input and formula contracts.

---

## Purpose

Turn private frozen source evidence into a **sanitized, immutable, GHA-accessible** 138-team derived snapshot such that:

1. Raw CFBD PIT payloads remain private and untracked.
2. GitHub Actions does not call CFBD to reconstruct Candidate B.
3. GitHub Actions does not need `.research-data`.
4. Runtime does not re-read mutable `TeamSeasonTalent` for Candidate B V1.
5. All 138 authoritative FBS teams are represented, including unavailable vectors.
6. Missing features remain explicitly unavailable — never zero-filled.
7. Parent and team rows are append-only.
8. Snapshot is content-addressable via `snapshotHash`.
9. Runtime can prove exactly which frozen snapshot produced a prediction.
10. Derived aggregates are sufficient to audit Candidate B without player-level portal payloads.
11. No operational Game / Team / MarketLine / Bet mutation.
12. Future Candidate B versions cannot overwrite V1.

---

## Architecture

Two **new additive append-only** Prisma models:

| Prisma model | Table |
|---|---|
| `ShadowModelFeatureSnapshot` | `shadow_model_feature_snapshots` |
| `ShadowModelFeatureSnapshotTeam` | `shadow_model_feature_snapshot_teams` |

- Parent = one immutable derived team-feature cohort
- Child = exactly one immutable row per authoritative FBS team
- Distinct from `ShadowModelCaptureRun` / `ShadowModelPrediction`
- Distinct from Hybrid Snapshot V1
- Not an operational ratings or talent table
- **No** operational Team / Game / MarketLine / Bet foreign keys

Do not reuse or overload existing capture, Hybrid, or `team_season_talent` tables.

Intended Candidate B V1 identity constants (**stable intended-consumer scope** plus feature/derivation pins; **not** a Generic Shadow `modelDefinitionHash`):

| Field | Frozen intended value |
|---|---|
| `season` | `2026` |
| `snapshotKind` | `IMMUTABLE_DERIVED_TEAM_FEATURES_V1` |
| `modelFamily` | `candidate_b_roster_prior` |
| `modelDefinitionId` | `candidate_b_roster_prior_v1` |
| `featureDefinitionId` | `candidate_b_roster_prior_features_v1` |
| `featureDefinitionVersion` | `v1` |
| `derivationDefinitionId` | `candidate_b_roster_prior_derivation_v1` |

`featureDefinitionHash` and `derivationDefinitionHash` are computed from the **persisted** canonical manifests at ingest time. They are not hardcoded in this design contract.

---

## Snapshot identity boundary

The snapshot identity **must not** depend on the eventual Generic Shadow `modelDefinitionHash`.

Reason:

- Candidate B runtime adapter / model manifest does not exist yet
- Generic Shadow `modelDefinitionHash` is a **runtime model-manifest** identity
- the frozen feature artifact must not change because of a later harmless adapter/runtime-manifest change
- Candidate B team-feature values are fully pinned by their **feature** and **derivation** definitions

The snapshot **MUST** be bound to:

- `featureDefinitionId`
- `featureDefinitionVersion`
- `featureDefinitionHash`
- `derivationDefinitionId`
- `derivationDefinitionHash`
- `sourceManifestHash`
- `normalizationManifestHash`
- `populationManifestHash`
- `snapshotHash`

`modelFamily` and `modelDefinitionId` are **stable intended-consumer scope**. They **ARE** part of Candidate B V1 snapshot semantic scope — and therefore part of `snapshotHash` — because the snapshot contains Candidate-B-specific derived composite / rating values.

They are **not** supporting provenance. They are also **not** a runtime adapter identity:

- runtime `modelDefinitionHash` remains excluded
- the feature artifact does not depend on a future adapter implementation hash
- the eventual runtime model must pin the exact `snapshotHash`

Do **NOT** store or require `modelDefinitionHash` as part of persistence identity.

`sourceProvenanceManifestHash` is supporting operator/source timing metadata. It **MUST NOT** participate in snapshot semantic identity, `snapshotHash`, stable uniqueness, or semantic conflict determination.

The eventual Candidate B runtime **MODEL** manifest must instead pin the exact:

- `featureDefinitionHash`
- `derivationDefinitionHash`
- `snapshotHash`

One-way dependency:

```
frozen feature artifact
        ↓
Candidate B runtime model pins exact artifact
```

not:

```
runtime model hash required to create feature artifact
```

---

## Feature identity

```
featureDefinitionId = candidate_b_roster_prior_features_v1
featureDefinitionVersion = v1
featureDefinitionHash = sha256CanonicalJson(featureDefinitionManifest)
```

The parent **must persist** `featureDefinitionManifest` as the exact semantic JSON payload used to produce `featureDefinitionHash`.

Do **not** rely on repository docs alone, a future runtime adapter, or a source-code file hash to reconstruct this identity.

The feature manifest should identify, at the appropriate feature-definition level:

- the four frozen source feature concepts (`priorCore`, `talent`, `returning`, `portal`)
- availability / unavailability semantics for those features
- that missing numeric components remain null and are never zero-filled

---

## Derivation identity

```
derivationDefinitionId = candidate_b_roster_prior_derivation_v1
derivationDefinitionHash = sha256CanonicalJson(derivationDefinitionManifest)
```

The parent **must persist** `derivationDefinitionManifest` as the exact semantic JSON payload used to produce `derivationDefinitionHash`.

Do **not** use a source-code file hash as the derivation definition.
Do **not** rely on repository docs alone or a future runtime adapter to reconstruct this identity.

The derivation manifest must pin at least:

- portal `muPortal` calculation semantics
- portal `NO_TRANSFERS` centered-neutral rule
- portal `ratedCoverage >= 0.50` rule
- population SD divisor `N`
- four feature normalization semantics
- exact `0.25 / 0.25 / 0.25 / 0.25` weights
- complete-vector requirement
- second-stage population z-score
- `3.5` point scale
- null / unavailable semantics
- deterministic hash / canonicalization rules

---

## Parent model — `ShadowModelFeatureSnapshot`

| Field | Type | Notes |
|---|---|---|
| `id` | String cuid PK | DB identity; not the runtime pin |
| `season` | Int | 2026 |
| `snapshotKind` | String | `IMMUTABLE_DERIVED_TEAM_FEATURES_V1` |
| `modelFamily` | String | stable intended-consumer scope; in `snapshotHash` |
| `modelDefinitionId` | String | stable intended-consumer scope; in `snapshotHash` |
| `featureDefinitionId` | String | |
| `featureDefinitionVersion` | String | `v1` |
| `featureDefinitionManifest` | Json | exact payload hashed into `featureDefinitionHash` |
| `featureDefinitionHash` | String | `sha256CanonicalJson(featureDefinitionManifest)` |
| `derivationDefinitionId` | String | `candidate_b_roster_prior_derivation_v1` |
| `derivationDefinitionManifest` | Json | exact payload hashed into `derivationDefinitionHash` |
| `derivationDefinitionHash` | String | `sha256CanonicalJson(derivationDefinitionManifest)` |
| `sourceManifest` | Json | semantic source identity only |
| `sourceManifestHash` | String | `sha256CanonicalJson(sourceManifest)`; in `snapshotHash` |
| `sourceProvenanceManifest` | Json | supporting operator/source timing metadata |
| `sourceProvenanceManifestHash` | String | excluded from `snapshotHash` and semantic conflict |
| `normalizationManifest` | Json | |
| `normalizationManifestHash` | String | |
| `populationManifest` | Json | |
| `populationManifestHash` | String | |
| `expectedTeamCount` | Int | 138 |
| `rowCount` | Int | must equal 138 |
| `completeVectorCount` | Int | 103 |
| `unavailableVectorCount` | Int | 35 |
| `portalAvailableCount` | Int | 104 |
| `repoCommitSha` | String | derivation-code provenance; excluded from `snapshotHash` |
| `derivedAt` | DateTime | wall-clock; excluded from `snapshotHash` |
| `snapshotHash` | String | content pin; runtime selector |
| `createdAt` | DateTime default now | excluded from hashes |

**NO:**

- `@updatedAt`
- mutable status
- operational foreign keys
- `modelDefinitionHash` requirement

---

## Team model — `ShadowModelFeatureSnapshotTeam`

Exactly one row per authoritative 2026 FBS team.

| Field | Type | Notes |
|---|---|---|
| `id` | String cuid PK | excluded from `rowHash` |
| `snapshotId` | String | internal FK to parent |
| `teamId` | String | evidence identity; **no Team FK** |
| `season` | Int | 2026 |
| `availabilityStatus` | String | `AVAILABLE` / `UNAVAILABLE` |
| `unavailableReasons` | String[] | contract codes |
| `priorCoreRaw` | Float? | null if unavailable |
| `talentRaw` | Float? | null if unavailable |
| `returningRaw` | Float? | null if unavailable |
| `portalRaw` | Float? | null if unavailable |
| `zCore` | Float? | |
| `zTalent` | Float? | |
| `zReturning` | Float? | |
| `zPortal` | Float? | |
| `candidateBRawComposite` | Float? | null unless complete vector |
| `candidateBCompositeZ` | Float? | null unless complete |
| `candidateBTeamRatingPoints` | Float? | null unless complete |
| `inboundTransferCount` | Int | |
| `inboundRatedCount` | Int | |
| `inboundRatedCoverage` | Float? | null if `NO_TRANSFERS` |
| `inboundDirectionStatus` | String | |
| `inboundMeanRating` | Float? | finite-rated mean only |
| `outboundTransferCount` | Int | |
| `outboundRatedCount` | Int | |
| `outboundRatedCoverage` | Float? | |
| `outboundDirectionStatus` | String | |
| `outboundMeanRating` | Float? | |
| `rowHash` | String | |
| `createdAt` | DateTime default now | excluded from hashes |

**NO:**

- `@updatedAt`
- Team FK
- player-level portal records
- stars fallback
- fabricated numeric values

---

## Availability

Every authoritative FBS team gets one row.

`availabilityStatus`:

- `AVAILABLE`
- `UNAVAILABLE`

Root reasons:

- `PRIOR_SEASON_CORE_UNAVAILABLE`
- `CURRENT_TALENT_UNAVAILABLE`
- `RETURNING_PRODUCTION_UNAVAILABLE`
- `PORTAL_FEATURE_UNAVAILABLE`
- `TEAM_FEATURE_VECTOR_UNAVAILABLE`

Portal direction states:

- `NO_TRANSFERS`
- `SUFFICIENT_RATED_COVERAGE`
- `INSUFFICIENT_RATED_COVERAGE`

Use **validated strings** rather than Candidate-B-specific Prisma enums unless implementation review finds a compelling repository-level reason otherwise.

Unavailable numeric components remain **NULL**. Never encode unavailable as zero.

---

## Source identity vs supporting provenance

Semantic source identity and supporting provenance **must not** be mixed in the same hashed manifest.

### A. `sourceManifest` — semantic source identity

This is the **semantic source-identity** manifest. It contains only data that defines the frozen Candidate B numerical evidence.

#### 2025 CFBD CORE

- provider
- endpoint
- year
- field (`overall`)
- frozen private snapshot ID
- raw payload SHA-256

#### Sep 1 returning

- provider
- source / endpoint identity
- designation `ONE_TIME_OPENING_WEEK_BASELINE`
- frozen private snapshot ID
- field `percentPPA`
- raw payload SHA-256

#### Sep 1 portal

- provider
- source identity
- designation `ONE_TIME_OPENING_WEEK_BASELINE`
- frozen private snapshot ID
- raw payload SHA-256
- calculated `muPortal`
- `muPortal` parity reference

#### Talent

- source table identity (`team_season_talent`)
- season 2026
- field `talentComposite`
- n = 138
- `talentValueHash`

```
sourceManifestHash = sha256CanonicalJson(sourceManifest)
```

`sourceManifestHash` **IS** part of:

- semantic snapshot identity
- `snapshotHash`
- conflict detection

### B. `sourceProvenanceManifest` — supporting provenance

This is **supporting** operator / source timing metadata. It may contain:

- CFBD retrieval timestamps
- local / private snapshot retrieval metadata
- optional raw local file paths
- `talentProvenanceHash`
- talent row `createdAt` / `updatedAt` provenance semantics
- any other non-numerical operator / source timing metadata

Raw local file paths **MAY** be recorded here for operator provenance but **must not** be required runtime identifiers.

```
sourceProvenanceManifestHash = sha256CanonicalJson(sourceProvenanceManifest)
```

`sourceProvenanceManifestHash` **MUST NOT** participate in:

- `sourceManifestHash`
- `snapshotHash`
- stable semantic uniqueness
- semantic conflict determination

Reason: supporting provenance may differ without changing the exact frozen numerical feature artifact.

---

## Talent hashing

Do **not** make operational timestamps part of the numerical source identity.

```
talentValueHash =
sha256CanonicalJson(
  rows sorted lexicographically by teamId:
  {
    teamId,
    season: 2026,
    talentComposite
  }
)
```

This hash pins the exact 138 numerical values used by Candidate B V1.

Separately:

```
talentProvenanceHash =
sha256CanonicalJson(
  rows sorted lexicographically by teamId:
  {
    teamId,
    season: 2026,
    createdAt,
    updatedAt,
    sourceUpdatedAt   // JSON null if unavailable
  }
)
```

Use explicit JSON `null` for unavailable provenance fields.

Candidate B **semantic source identity** depends on `talentValueHash`, which lives in `sourceManifest`.  
`talentProvenanceHash` lives only in `sourceProvenanceManifest`. It is supporting provenance and **MUST NOT** cause a numerically identical talent population to become a different semantic source solely because an operational timestamp changed.

---

## Normalization manifest

For each of `priorCore`, `talent`, `returning`, `portal` store exact:

- `n`
- `populationMean`
- `populationSD`
- `divisor` = `"N"`
- `min`
- `max`
- `unavailableCount`

Also store complete composite:

- `completeN`
- `rawCompositePopulationMean`
- `rawCompositePopulationSD`
- `divisor` = `"N"`
- `ratingScale` = `3.5`

Also store:

- `muPortal` calculated value
- `muPortal` parity expected value (`0.8533690393918453`)

Implementation **calculates** `muPortal` from frozen portal bytes; the expected value is a parity assertion, not an input.

---

## Population manifest

Canonical population manifest must contain at minimum:

- `season` = 2026
- `authoritativeFbsCount` = 138
- `teamIds` = all 138 team IDs sorted lexicographically
- `completeVectorCount` = 103
- `unavailableVectorCount` = 35
- `portalAvailableCount` = 104

```
populationManifestHash = sha256CanonicalJson(populationManifest)
```

---

## Hashing implementation contract

All semantic hashes must use the repository’s existing:

```
sha256CanonicalJson
```

Do **not** substitute:

- raw `JSON.stringify` with insertion-order dependence
- SQL-side JSON hashing
- Python JSON hashing with different number serialization
- locale-dependent number formatting

Candidate B derived values are JS finite double semantics persisted as Prisma `Float`.

Canonical hashes must be generated from the stable semantic payload **BEFORE** DB identity / timestamps are added.

---

## rowHash

```
rowHash =
sha256CanonicalJson({
  teamId,
  season,
  availabilityStatus,
  unavailableReasons sorted lexicographically,
  priorCoreRaw,
  talentRaw,
  returningRaw,
  portalRaw,
  zCore,
  zTalent,
  zReturning,
  zPortal,
  candidateBRawComposite,
  candidateBCompositeZ,
  candidateBTeamRatingPoints,
  inboundTransferCount,
  inboundRatedCount,
  inboundRatedCoverage,
  inboundDirectionStatus,
  inboundMeanRating,
  outboundTransferCount,
  outboundRatedCount,
  outboundRatedCoverage,
  outboundDirectionStatus,
  outboundMeanRating
})
```

Null values **MUST** appear explicitly as JSON `null`.

Exclude: `id`, `snapshotId`, `createdAt`.

---

## snapshotHash

```
snapshotHash =
sha256CanonicalJson({
  season,
  snapshotKind,
  modelFamily,
  modelDefinitionId,
  featureDefinitionId,
  featureDefinitionVersion,
  featureDefinitionHash,
  derivationDefinitionId,
  derivationDefinitionHash,
  sourceManifestHash,
  normalizationManifestHash,
  populationManifestHash,
  expectedTeamCount,
  rowCount,
  completeVectorCount,
  unavailableVectorCount,
  portalAvailableCount,
  teamRowHashes:
    [{ teamId, rowHash }, ...]
    sorted lexicographically by teamId
})
```

Exclude:

- `sourceProvenanceManifestHash`
- DB `id`
- `createdAt`
- `derivedAt`
- `repoCommitSha`

`snapshotHash` includes only **hashes** of the semantic manifests, not the bulky manifests themselves.

`repoCommitSha` is derivation-code provenance. `sourceProvenanceManifestHash` is supporting operator/source timing metadata. `snapshotHash` is semantic content identity. Two machines deriving identical numbers from the same frozen semantic sources must produce the same `snapshotHash` even if retrieval timestamps or talent operational timestamps differ.

---

## Uniqueness

```
UNIQUE(snapshotHash)
```

and a stable V1 semantic identity constraint equivalent to:

```
UNIQUE(
  season,
  featureDefinitionId,
  featureDefinitionVersion,
  derivationDefinitionId
)
```

Child uniqueness equivalent to:

```
UNIQUE(snapshotId, teamId)
```

The exact Prisma index names may be chosen during implementation.

`sourceProvenanceManifestHash` is **not** part of this uniqueness constraint.

This uniqueness key **must not** allow a changed `sourceManifestHash` or `derivationDefinitionHash` to create a second snapshot under the **same** V1 identity.

A changed source or derivation must use a **NEW** feature / derivation version.

Do not allow two competing Candidate B V1 snapshots to coexist merely because their hashes differ.

---

## Append-only

- no `@updatedAt`
- no UPDATE
- no DELETE
- internal parent/child FK only
- `onDelete RESTRICT`
- `onUpdate RESTRICT`
- append-only trigger for **BOTH** tables
- no operational Team FK

Follow the Generic Shadow Capture V1 trigger precedent (`restrict_violation` on UPDATE/DELETE). Do not ALTER existing Generic Shadow triggers.

---

## Atomic ingest — guarded LOCAL

Derivation + first persist run on the operator machine that already holds private PIT. After COMMIT, GHA only SELECTs the frozen snapshot.

### PREVIEW

- `providerCalls = 0`
- read private PIT
- verify frozen raw SHA-256 values
- SELECT exact 2026 talent population
- compute `talentValueHash` + `talentProvenanceHash`
- derive all 138 rows
- calculate manifests / hashes
- assert frozen invariants
- query DB only to detect identity / conflicts
- **write nothing**
- print `snapshotHash` and exact confirmation

### COMMIT

- `providerCalls = 0`
- recompute from same source inputs
- serializable DB transaction
- confirmation must match **CURRENT** computed `snapshotHash`
- recheck conflicts in transaction
- insert exactly one parent
- insert exactly 138 child rows
- verify row counts / hashes / invariants
- commit atomically
- mismatch / error → rollback with **no** partial parent

**No:** UPDATE, DELETE, overwrite-upsert, FAILED/PARTIAL persistence.

---

## COMMIT confirmation

```
INGEST_2026_CANDIDATE_B_V1_FEATURE_SNAPSHOT_<FULL_64_CHAR_SNAPSHOT_HASH>
```

Use the full 64-character `snapshotHash`, not a prefix.

---

## Idempotency / conflict behavior

Semantic V1 conflict is based on:

- stable V1 identity
- `featureDefinitionHash`
- `derivationDefinitionHash`
- `sourceManifestHash`
- `normalizationManifestHash`
- `populationManifestHash`
- `snapshotHash`
- team row hashes

A `sourceProvenanceManifestHash`-only difference is **NOT** a semantic conflict.

| Case | Behavior |
|---|---|
| Exact stable identity + exact semantic hashes + exact `snapshotHash` + 138 exact row hashes | **VERIFIED NO-OP** |
| Same as above, but later local re-derivation observes a different `sourceProvenanceManifestHash` only | **VERIFIED NO-OP** |
| Stable V1 identity + any semantic / hash difference | **FAIL CLOSED** |
| Existing partial / corrupt state | **FAIL CLOSED** |

Provenance-only rerun rule:

If an already-persisted snapshot has:

- same stable V1 identity
- same `sourceManifestHash`
- same `featureDefinitionHash`
- same `derivationDefinitionHash`
- same `normalizationManifestHash`
- same `populationManifestHash`
- same `snapshotHash`
- exact 138 row hashes

but a later local re-derivation observes a different `sourceProvenanceManifestHash` only:

- **VERIFIED NO-OP**
- Do **NOT** update the persisted provenance
- Report the provenance-only difference diagnostically
- It is **NOT** a competing semantic Candidate B V1 snapshot

This specifically prevents later `TeamSeasonTalent` timestamp changes from creating a false V1 conflict.

Specifically FAIL CLOSED when the V1 identity already exists and any of these semantic identities differ:

- `sourceManifestHash`
- `derivationDefinitionHash`
- `featureDefinitionHash`
- `normalizationManifestHash`
- `populationManifestHash`
- `snapshotHash`

Never silently supersede Candidate B V1.

---

## Runtime pinning

Runtime must **NEVER** query:

- latest snapshot
- newest `createdAt`
- current `TeamSeasonTalent`
- private PIT
- provider API

Candidate B V1 runtime must receive / configure the exact `snapshotHash` and verify `featureDefinitionHash` and `derivationDefinitionHash` against its expected manifest.

Missing exact snapshot → **FAIL CLOSED**.  
Mismatched hash → **FAIL CLOSED**.

---

## Generic Shadow frame

`OperationalShadowModelFrame` gains an **optional generic** frozen-feature container, not Candidate-B-specific scalar fields.

Conceptually:

```
frozenFeatureSnapshots?: FrozenShadowFeatureSnapshot[]
```

Each loaded snapshot includes:

- `snapshotHash`
- `featureDefinitionId` / hash
- `derivationDefinitionId` / hash
- `teamsById`

Prisma loading remains in the **JOB** layer. The pure planner / model evaluation must not issue Prisma queries.

Core Shadow ignores the optional container. Candidate B requires its exact pinned snapshot.

This direction is frozen as design; this contract does **not** authorize implementing it.

---

## Prediction provenance mapping

Do not duplicate full source / normalization manifests into every prediction.

### `inputPayload`

- `snapshotHash`
- home `teamId` + `rowHash`
- away `teamId` + `rowHash`
- exact home / away raw components
- exact home / away normalized components
- exact composite / `teamRatingPoints`
- HFA inputs
- selected market identity / timestamp

### `inputHash`

Existing `sha256CanonicalJson(inputPayload)`.

### `featureProvenance`

- snapshot DB id
- `snapshotHash`
- `featureDefinitionId` / hash
- `derivationDefinitionId` / hash
- `sourceManifestHash`
- `normalizationManifestHash`
- `populationManifestHash`
- home `rowHash`
- away `rowHash`

### `modelOutput`

- `homeRatingPoints`
- `awayRatingPoints`
- `effectiveHfa`
- `modelHomeMargin`
- eventual edge / pick outputs

---

## Migration design (future implementation only)

Future implementation migration must be:

- additive only
- two empty tables
- indexes / uniqueness constraints
- internal FK only
- `RESTRICT` / `RESTRICT`
- append-only trigger(s)
- no DML
- no data backfill
- no operational ALTER
- no destructive SQL

This contract does **not** create that migration.

---

## Candidate B V1 invariants

Ingest derivation must assert:

| Invariant | Value |
|---|---|
| Authoritative teams | 138 |
| Rows | 138 |
| Portal available | 104 |
| Complete vectors | 103 |
| Incomplete vectors | 35 |
| CORE SHA-256 | `d1b80a1b98518355bc6a887d08610a4ce5cf592efeaadb4c7a40f266184e0aae` |
| Returning SHA-256 | `fedfbe805fb628452fdfe9d5ea97da917a4f591b5320c8af448abcca38751449` |
| Portal SHA-256 | `8ba75badc9f7e8c106e49fa489f2c3f4989a14019ff5f8e720b44f7384003e77` |
| `muPortal` parity | `0.8533690393918453` |
| Population SD divisor | `N` |
| Complete rating population SD | `3.5` |
| `providerCalls` | `0` |

---

## Future models

The parent / child storage pattern may inform Candidate B V2, Elo, WEPA, and PassMatch research.

Candidate B V1 schema must **not** add Elo or other future inputs now.

Do not claim that Candidate-B-shaped child columns automatically form a universal feature EAV framework.

If another model materially differs in shape, schema evolution or a separate derived-row representation may be preferable.

---

## What this contract does not authorize

- Prisma schema edit
- migration
- database deployment
- feature snapshot PREVIEW
- feature snapshot COMMIT
- Generic Shadow runtime extension
- Candidate B adapter
- workflow changes
- Candidate B prediction PREVIEW
- Candidate B prediction COMMIT
- evaluator changes
- official promotion

---

## Next gate

After this contract is independently audited and merged, authorize a **separate** implementation PR containing **ONLY**:

1. additive Prisma schema / migration for the two snapshot tables
2. append-only enforcement
3. local guarded Candidate B V1 feature-snapshot ingest CLI
4. focused tests / docs

Do **not** include Candidate B runtime adapter or Generic Shadow workflow changes in that same first implementation PR.
