# Candidate B V1 — Generic Shadow Adapter Contract

**Status:** `GENERIC_SHADOW_ADAPTER_CONTRACT_FROZEN`  
**Model status:** SHADOW / RESEARCH ONLY — NOT OFFICIAL  
**Contract date:** 2026-09-15  
**Companion contracts (unchanged by this file):**
- [`CANDIDATE_B_V1_INPUT_CONTRACT.md`](./CANDIDATE_B_V1_INPUT_CONTRACT.md)
- [`CANDIDATE_B_V1_FORMULA_CONTRACT.md`](./CANDIDATE_B_V1_FORMULA_CONTRACT.md)
- [`CANDIDATE_B_V1_PERSISTENCE_DESIGN.md`](./CANDIDATE_B_V1_PERSISTENCE_DESIGN.md)
- [`CANDIDATE_B_V1_TEAM_RESOLUTION_CONTRACT.md`](./CANDIDATE_B_V1_TEAM_RESOLUTION_CONTRACT.md)
- [`CANDIDATE_B_V1_PERSISTENCE_ENCODING_CONTRACT.md`](./CANDIDATE_B_V1_PERSISTENCE_ENCODING_CONTRACT.md)
- [`CANDIDATE_B_V1_PERSISTENCE_READ_CONTRACT.md`](./CANDIDATE_B_V1_PERSISTENCE_READ_CONTRACT.md)
- [`CANDIDATE_B_V1_NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT.md`](./CANDIDATE_B_V1_NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT.md)

This document freezes the **exact design** for attaching the already-persisted Candidate B V1 feature snapshot to Generic Shadow Model Capture V1.

It is **docs only**. It authorizes **no** adapter implementation, allowlist change, workflow change, PREVIEW, COMMIT, production DB write, or provider call.

Candidate B runtime predictions remain **not enabled**. Feature-snapshot COMMIT authorization is **consumed**. The persisted snapshot must not be altered or rewritten.

---

## Proven production state this contract pins

Production `main`:

```
db422b7a5b16f7e4464f3dc7cba9371a88cc2342
```

Durable Candidate B V1 feature snapshot:

| Gate | Value |
|---|---|
| `snapshotHash` | `0332e24f97c891fd6431280fa7939c467c614714abe207eeb3dc89d466eb1148` |
| Parent rows | `1` |
| Child rows | `138` |
| Stable identity | `PRESENT` |
| `verifyPersistedSnapshotIntegrity` | `true` |
| `classifyExistingSnapshot` | `EXACT_EXISTING` (already-proven persistence evidence only; **not** a runtime call or gate) |

---

## Existing Candidate B identities — not new

These identities already exist. This contract does **not** invent replacements.

| Identity | Frozen value |
|---|---|
| `modelDefinitionId` | `candidate_b_roster_prior_v1` |
| `modelFamily` | `candidate_b_roster_prior` |
| `featureDefinitionId` | `candidate_b_roster_prior_features_v1` |
| `featureDefinitionVersion` | `v1` |
| `featureDefinitionHash` | `6f1f8ecc132cdd87650252d57597a657ece0dd908bdf5010897023cafe988972` |
| `derivationDefinitionId` | `candidate_b_roster_prior_derivation_v1` |
| `derivationDefinitionHash` | `6c04627787edbcc7d1d42549f3cb19c525a6c4c31de572549f01e3efa64a638c` |
| `policyDefinitionId` | `candidate_b_roster_prior_spread_policy_v1` |
| `teamResolutionPolicyId` | `candidate_b_v1_team_resolution_policy_v1` |
| `teamResolutionPolicyHash` | `de627563f2c4c2b1e195182bcd6b66dd3226daf9800e209e5f55244f94ea0efe` |

Unrelated to rejected legacy diagnostic `TALENT_RENORMALIZED` / `talentZ * 14`.

---

## Frozen feature snapshot pin

The future Generic Shadow Candidate B adapter **MUST** consume exactly this persisted snapshot:

```
snapshotHash =
0332e24f97c891fd6431280fa7939c467c614714abe207eeb3dc89d466eb1148
```

Also pin:

| Pin | Frozen value |
|---|---|
| `sourceManifestHash` | `183e07cec8ab146247f8b15eda93331a1dfe03f624b06fd8b0dae886d14b14d6` |
| `sourceProvenanceManifestHash` | `89ea635c89898aa2de5fad66a43e6eca36ef917f6945cc82635536746347f8da` |
| `normalizationManifestHash` | `9de2fdbf94581f05671349111ae36e458c94ac637b93e8db0eaea701abdeaa96` |
| `populationManifestHash` | `ce7a633f3230864c785048047698a3ba55fef1e25339e87db2a090bd65c59f2c` |
| `expectedTeamCount` | `138` |
| `rowCount` | `138` |
| `completeVectorCount` | `103` |
| `unavailableVectorCount` | `35` |
| `portalAvailableCount` | `104` |
| `season` | `2026` |

Runtime must select this snapshot by exact `snapshotHash`. Never query latest / newest `createdAt`.

---

## Runtime feature source — non-negotiable

```
Candidate B runtime feature source =
PERSISTED_CANDIDATE_B_FEATURE_SNAPSHOT_ONLY
```

The future Generic Shadow Candidate B adapter **MUST NOT** derive or refresh Candidate B inputs from:

- private PIT files
- CFBD
- `TeamSeasonTalent`
- current returning-production endpoints
- current portal endpoints
- mutable current research inputs
- `TeamSeasonRating` V1
- Core fallback ratings

The persisted Candidate B snapshot is the **sole** Candidate B team-rating source.  
Its static V1 roster-prior basis must remain immutable.

Candidate B must **not** masquerade as a `TeamSeasonRating` V1 row.

---

## Model-aware frame extension

Current `OperationalShadowModelFrame`:

```
games
ratings
marketLines
```

Core baseline behavior using those three fields **must remain unchanged**.

The previously frozen persistence design requires a **generic** optional container, not a Candidate-B-specific frame field.

`candidateBFeatureSnapshot` is **not** the preferred architecture.

Freeze:

```
OperationalShadowModelFrame {
  games
  ratings
  marketLines
  frozenFeatureSnapshots?: FrozenShadowFeatureSnapshot[]
}
```

Core ignores the optional container.

Candidate B locates the exact entry by pinned:

- `snapshotHash`
- `featureDefinitionId`
- `derivationDefinitionId`

A Candidate B adapter may define a typed view over that generic snapshot. The `OperationalShadowModelFrame` extension itself remains generic.

Conceptual loaded snapshot:

```ts
FrozenShadowFeatureSnapshot {
  parentId
  season
  snapshotHash
  featureDefinitionId
  featureDefinitionVersion
  featureDefinitionHash
  derivationDefinitionId
  derivationDefinitionHash
  sourceManifestHash
  sourceProvenanceManifestHash
  normalizationManifestHash
  populationManifestHash
  expectedTeamCount
  rowCount
  completeVectorCount
  unavailableVectorCount
  portalAvailableCount
  teamsById
}
```

`parentId` is the persisted snapshot DB id. It is provenance, not a substitute for `snapshotHash`.

`teamsById` is a deterministic indexed lookup keyed by `teamId`, or an equivalent generic indexed lookup preserving exactly those semantics, consistent with [`CANDIDATE_B_V1_PERSISTENCE_DESIGN.md`](./CANDIDATE_B_V1_PERSISTENCE_DESIGN.md).

Each team row available to the adapter must expose enough persisted semantic fields to reproduce the previously frozen prediction input contract. These come **ONLY** from the already-persisted exact-decoded snapshot:

```ts
FrozenShadowFeatureTeamRow {
  teamId
  season
  availabilityStatus
  unavailableReasons
  priorCoreRaw
  talentRaw
  returningRaw
  portalRaw
  zCore
  zTalent
  zReturning
  zPortal
  candidateBRawComposite
  candidateBCompositeZ
  candidateBTeamRatingPoints
  rowHash
}
```

Do **not** copy the whole 138-team snapshot into every prediction. Full persisted parent + child integrity still happens at run-level load, using the already-proven exact read path.

---

## Model-aware loading

Prisma loading remains in the **JOB** layer. The pure planner / model evaluation must not issue Prisma queries.

### `core_v1_shadow_baseline_v1`

The current V1 `TeamSeasonRating` loader remains unchanged.

### `candidate_b_roster_prior_v1`

1. Load games and persisted `MarketLine` rows as Generic Shadow already does.
2. Load the persisted Candidate B feature snapshot by the exact pinned `snapshotHash`.
3. Verify it through the already-proven exact read / integrity path.
4. Do **not** use `TeamSeasonRating` as Candidate B signal.
5. No private PIT.
6. No provider call.

Required exact read path:

```
parent Prisma read without include: { teams: true }
  -> child rows via candidate_b_v1_exact_float8_binary_read_v1
  -> normalizationManifest via candidate_b_v1_normalization_manifest_canonical_json_text_v1
  -> verifyPersistedSnapshotIntegrity(...) === true
  -> exact runtime pin gate below
```

Do **not** use ordinary Prisma child `Float` model decoding as the Candidate B semantic source.

`classifyExistingSnapshot(existing, computed, ...)` requires a `DerivedSnapshot` and is an ingest / re-derivation comparison. Candidate B runtime is **forbidden** from re-deriving from PIT, `TeamSeasonTalent`, CFBD, portal, or other mutable / raw sources. Therefore `classifyExistingSnapshot = EXACT_EXISTING` is **not** an executable runtime prerequisite. It remains only the already-proven persistence evidence recorded above.

Runtime verification instead:

```
load exact pinned snapshotHash
verifyPersistedSnapshotIntegrity(...) === true
exact snapshotHash match
exact featureDefinitionId / version / hash match
exact derivationDefinitionId / hash match
exact sourceManifestHash match
exact sourceProvenanceManifestHash match
exact normalizationManifestHash match
exact populationManifestHash match
exact team-resolution policy ID / hash match
exact expectedTeamCount = 138
exact rowCount = 138
exact completeVectorCount = 103
exact unavailableVectorCount = 35
exact portalAvailableCount = 104
```

Pinned `snapshotHash`:

```
0332e24f97c891fd6431280fa7939c467c614714abe207eeb3dc89d466eb1148
```

Any mismatch = **RUN-LEVEL FAIL CLOSED** before planning.

If the parent snapshot is:

- absent
- wrong `snapshotHash`
- wrong semantic hash
- wrong feature identity
- wrong derivation identity
- wrong team-resolution pin
- wrong row count
- corrupt

the **entire** Candidate B capture attempt must **FAIL CLOSED** before prediction planning.

Do **not** create a partial Generic Shadow cohort from an unverified feature snapshot.

---

## Run-level vs game-level failure

### RUN-LEVEL BLOCKER

Any failure of the persisted Candidate B feature-snapshot identity or integrity.

These block the capture attempt. They are **not** per-game `UNAVAILABLE` rows.

Examples:

```
candidate_b_feature_snapshot_absent
candidate_b_feature_snapshot_identity_mismatch
candidate_b_feature_snapshot_integrity_failed
```

### GAME-LEVEL UNAVAILABLE

The exact snapshot is valid, but either game participant does not have a complete Candidate B vector.

Additive Generic Shadow unavailable reason:

```
team_feature_vector_unavailable
```

Do **not** convert incomplete Candidate B vectors into `missing_rating`.  
Do **not** zero-fill them.

A complete Candidate B vector for a game participant requires:

- a matching `teamsById` (or equivalent indexed) row for that `teamId` / `season`
- `availabilityStatus = AVAILABLE`
- finite `candidateBTeamRatingPoints`

Otherwise the game is `UNAVAILABLE` with `team_feature_vector_unavailable`.

---

## Unavailable reason order

Current Generic Shadow order:

```
post_kickoff
missing_rating
rating_provenance_unavailable
missing_market
incoherent_market
stale_market
invalid_model_output
market_selector_unimplemented
```

The future implementation may extend this deterministic order with:

```
team_feature_vector_unavailable
```

Place it **after** existing feature/rating availability reasons and **before** market failures:

```
post_kickoff
missing_rating
rating_provenance_unavailable
team_feature_vector_unavailable
missing_market
incoherent_market
stale_market
invalid_model_output
market_selector_unimplemented
```

Do **not** reorder existing Core reasons unnecessarily.  
Core baseline historical behavior must remain unchanged. Core does not emit `team_feature_vector_unavailable`.

---

## Candidate B matchup formula

Freeze exact:

```
modelHomeMargin =
  homeCandidateBTeamRatingPoints
  - awayCandidateBTeamRatingPoints
  + computeEffectiveHfa(homeTeamId, neutralSite).effectiveHfa
```

HFA applied **exactly once**.

No:

- Core rating blend
- Hybrid blend
- lifecycle blend
- unit-grade blend
- missing-value fallback
- silent zero-fill

---

## HFA

Reuse:

```
apps/web/lib/core-v1-spread.ts#computeEffectiveHfa
```

Frozen semantics:

| Item | Value |
|---|---|
| `baseHfaPoints` | `2` |
| `clipRange` | `[0.5, 3.5]` |
| Neutral site `effectiveHfa` | `0` |
| Config source | `apps/web/lib/data/core_v1_hfa_config.json` |
| Candidate B-specific HFA tuning | **none** |

True home: `clip(base + teamAdjustment)`.  
Sign: positive `modelHomeMargin` = home favored.

---

## Shared market policy

Candidate B reuses the already-frozen Generic Core Shadow non-model policy.

| Item | Frozen value |
|---|---|
| Market type | spread only |
| Source | persisted `MarketLine` only |
| Authorized market source | `oddsapi` |
| Selector | `core_v1_coherent_spread_pair_v1` |
| Coherent home/away pair | required |
| `marketTimestamp <= predictionTimestamp` | required |
| `marketAgeSeconds <= 1800` | required |
| Future fallback | **none** |
| Lone team row | **not sufficient** |
| Provider fetch | **none** |
| Stale-market rescue | **none** |
| Post-kickoff | `UNAVAILABLE` |
| Retrospective prediction backfill | **none** |

Reuse modules:

- `apps/web/lib/market-line-snapshot.ts#selectBookSpreadSnapshots`
- `apps/web/lib/market-line-snapshot.ts#pickDisplaySpread`

---

## Edge / pick policy

Freeze parity with Generic Core Shadow.

```
SPREAD_EDGE_FLOOR = 0.1
selection source = apps/web/lib/core-v1-spread.ts#getATSPick
```

```
edgeValue = modelHomeMargin - canonicalMarketValue
```

If `abs(edgeValue) < 0.1`:

```
selectedSide = NO_SELECTION
```

Otherwise choose `HOME` or `AWAY` through existing `getATSPick` semantics.

Team-sided persisted line semantics remain the Generic Shadow semantics:

| Side | `predictionPickValue` |
|---|---|
| `HOME` | `-canonicalMarketValue` |
| `AWAY` | `+canonicalMarketValue` |
| `NO_SELECTION` | `null` |

Candidate B differs from Core Shadow **ONLY** through the rating signal.

---

## Feature manifest posture

Generic Shadow `featureDefinitionId` / `version` / `hash` for Candidate B **must remain** the exact persisted Candidate B feature identity:

```
candidate_b_roster_prior_features_v1
v1
6f1f8ecc132cdd87650252d57597a657ece0dd908bdf5010897023cafe988972
```

Do **NOT** invent:

```
candidate_b_shadow_features_v1
```

or another wrapper feature definition.

The Generic Shadow run's `featureDefinitionManifest` must semantically equal the already-frozen Candidate B `FEATURE_DEFINITION_MANIFEST` in:

```
apps/jobs/src/research/candidate-b/candidate-b-v1-feature-snapshot.ts
```

Any implementation extraction / shared-module refactor **must** preserve that exact canonical hash:

```
sha256CanonicalJson(featureDefinitionManifest)
=
6f1f8ecc132cdd87650252d57597a657ece0dd908bdf5010897023cafe988972
```

---

## Model definition manifest

Call this object `CANDIDATE_B_GENERIC_SHADOW_MODEL_DEFINITION_MANIFEST`.

It contains only stable semantic strings, booleans, numbers, and pinned hashes. It excludes timestamps, repo SHA, DB ids, and runtime-observed values. It **may** contain frozen stable module / config identifiers matching Generic Core Shadow precedent, such as:

```
apps/web/lib/core-v1-spread.ts#computeEffectiveHfa
apps/web/lib/data/core_v1_hfa_config.json
```

```json
{
  "id": "candidate_b_roster_prior_v1",
  "version": "shadow_model_capture_v1",
  "family": "candidate_b_roster_prior",
  "official": false,
  "productionHold": true,
  "status": "SHADOW / RESEARCH ONLY — NOT OFFICIAL",
  "marketType": "spread",
  "formula": {
    "identity": "candidate_b_roster_prior_v1_matchup",
    "candidateBTeamRatingPointsSource": "PERSISTED_CANDIDATE_B_FEATURE_SNAPSHOT_ONLY",
    "expression": "homeCandidateBTeamRatingPoints - awayCandidateBTeamRatingPoints + computeEffectiveHfa(homeTeamId, neutralSite).effectiveHfa",
    "hfaAppliedExactlyOnce": true,
    "sourceModule": "apps/web/lib/core-v1-spread.ts#computeEffectiveHfa",
    "noFallback": true,
    "noSilentZeroFill": true,
    "noCoreRatingBlend": true,
    "noHybridBlend": true,
    "noLifecycleBlend": true,
    "noUnitGradeBlend": true,
    "noMissingValueFallback": true
  },
  "hfa": {
    "source": "apps/web/lib/core-v1-spread.ts#computeEffectiveHfa",
    "configSource": "apps/web/lib/data/core_v1_hfa_config.json",
    "baseHfaPoints": 2,
    "clipRange": [0.5, 3.5],
    "neutralSite": 0,
    "candidateBSpecificTuning": false
  },
  "frozenFeatureSnapshot": {
    "season": 2026,
    "snapshotHash": "0332e24f97c891fd6431280fa7939c467c614714abe207eeb3dc89d466eb1148",
    "featureDefinitionId": "candidate_b_roster_prior_features_v1",
    "featureDefinitionVersion": "v1",
    "featureDefinitionHash": "6f1f8ecc132cdd87650252d57597a657ece0dd908bdf5010897023cafe988972",
    "derivationDefinitionId": "candidate_b_roster_prior_derivation_v1",
    "derivationDefinitionHash": "6c04627787edbcc7d1d42549f3cb19c525a6c4c31de572549f01e3efa64a638c",
    "teamResolutionPolicyId": "candidate_b_v1_team_resolution_policy_v1",
    "teamResolutionPolicyHash": "de627563f2c4c2b1e195182bcd6b66dd3226daf9800e209e5f55244f94ea0efe",
    "sourceManifestHash": "183e07cec8ab146247f8b15eda93331a1dfe03f624b06fd8b0dae886d14b14d6",
    "sourceProvenanceManifestHash": "89ea635c89898aa2de5fad66a43e6eca36ef917f6945cc82635536746347f8da",
    "normalizationManifestHash": "9de2fdbf94581f05671349111ae36e458c94ac637b93e8db0eaea701abdeaa96",
    "populationManifestHash": "ce7a633f3230864c785048047698a3ba55fef1e25339e87db2a090bd65c59f2c",
    "expectedTeamCount": 138,
    "completeVectorCount": 103,
    "unavailableVectorCount": 35
  },
  "runtimeFeatureSource": "PERSISTED_CANDIDATE_B_FEATURE_SNAPSHOT_ONLY"
}
```

```
candidateBGenericShadowModelDefinitionHash =
sha256CanonicalJson(CANDIDATE_B_GENERIC_SHADOW_MODEL_DEFINITION_MANIFEST)
```

Use the repository helper `sha256CanonicalJson` (`canonicalJsonString` of key-sorted JSON, then SHA-256 hex). Do **not** use raw `JSON.stringify`, the markdown-file SHA, a git blob SHA, or a source-code SHA.

Frozen value:

```
1e5bbf0119832caf10e7b769afe5e8c02dbcda1b358022ec31803df40bca3d8c
```

This Generic Shadow `modelDefinitionHash` is a **runtime model-manifest** identity. It is **not** part of Candidate B `snapshotHash`. The runtime model pins the already-persisted feature artifact; the feature artifact does not depend on this adapter hash.

---

## Policy definition manifest

Call this object `CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_MANIFEST`.

It encodes the exact shared Generic Core Shadow non-model semantics under Candidate B's already-frozen policy id.

```json
{
  "id": "candidate_b_roster_prior_spread_policy_v1",
  "version": "shadow_model_capture_v1",
  "evaluationProtocol": "CORE_EVAL_V1",
  "predictionMarket": {
    "marketType": "spread",
    "selectorId": "core_v1_coherent_spread_pair_v1",
    "authorizedSource": "oddsapi",
    "coherentHomeAwayPairRequired": true,
    "reuseModules": [
      "apps/web/lib/market-line-snapshot.ts#selectBookSpreadSnapshots",
      "apps/web/lib/market-line-snapshot.ts#pickDisplaySpread"
    ],
    "freshnessMaxSeconds": 1800,
    "freshnessMaxMilliseconds": 1800000,
    "eligibility": "marketTimestamp <= predictionTimestamp",
    "ordering": ["timestamp DESC", "homeRowId DESC (via pickDisplaySpread)"],
    "noFutureMarketFallback": true,
    "loneTeamRowNotSufficient": true
  },
  "selection": {
    "source": "apps/web/lib/core-v1-spread.ts#getATSPick",
    "edgeFloor": 0.1,
    "edgeFormula": "edgeValue = modelValue - canonicalMarketValue (HMA)",
    "sides": {
      "noSelection": "abs(edgeValue) < 0.1",
      "home": "edgeValue >= +0.1 (via getATSPick edge > 0 after floor)",
      "away": "edgeValue <= -0.1 (via getATSPick edge < 0 after floor)"
    },
    "noSelectionRemainsAvailable": true,
    "teamSidedPickValue": {
      "HOME": "-canonicalMarketValue",
      "AWAY": "+canonicalMarketValue",
      "NO_SELECTION": null
    },
    "officialCardParity": {
      "planner": "apps/web/lib/core-v1-weekly-card.ts#planSpreadBet",
      "edgeFloorConstant": "SPREAD_EDGE_FLOOR",
      "note": "Shadow baseline freezes selection semantics; does not write Bet rows."
    }
  },
  "postKickoff": "unavailable",
  "noRetrospectiveBackfill": true,
  "researchOnly": true
}
```

```
candidateBGenericShadowPolicyDefinitionHash =
sha256CanonicalJson(CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_MANIFEST)
```

Frozen value:

```
b1b292c0ea01ed692dcbfdfd7f6adf28b951d20786f08dac0993444c8b1e1fba
```

This policy differs from `core_v1_shadow_baseline_policy_v1` by **identity only**. Shared HFA / market / freshness / edge / pick semantics are unchanged.

---

## Adapter contract identity

```
adapterContractId =
candidate_b_v1_generic_shadow_adapter_contract_v1
```

Call this object `CANDIDATE_B_V1_GENERIC_SHADOW_ADAPTER_CONTRACT_MANIFEST`.

```json
{
  "contractId": "candidate_b_v1_generic_shadow_adapter_contract_v1",
  "modelDefinitionId": "candidate_b_roster_prior_v1",
  "modelDefinitionHash": "1e5bbf0119832caf10e7b769afe5e8c02dbcda1b358022ec31803df40bca3d8c",
  "featureDefinitionId": "candidate_b_roster_prior_features_v1",
  "featureDefinitionVersion": "v1",
  "featureDefinitionHash": "6f1f8ecc132cdd87650252d57597a657ece0dd908bdf5010897023cafe988972",
  "derivationDefinitionId": "candidate_b_roster_prior_derivation_v1",
  "derivationDefinitionHash": "6c04627787edbcc7d1d42549f3cb19c525a6c4c31de572549f01e3efa64a638c",
  "policyDefinitionId": "candidate_b_roster_prior_spread_policy_v1",
  "policyDefinitionHash": "b1b292c0ea01ed692dcbfdfd7f6adf28b951d20786f08dac0993444c8b1e1fba",
  "frozenFeatureSnapshotHash": "0332e24f97c891fd6431280fa7939c467c614714abe207eeb3dc89d466eb1148",
  "teamResolutionPolicyHash": "de627563f2c4c2b1e195182bcd6b66dd3226daf9800e209e5f55244f94ea0efe",
  "runtimeFeatureSource": "PERSISTED_CANDIDATE_B_FEATURE_SNAPSHOT_ONLY",
  "providerCalls": 0,
  "marketFreshnessMaxSeconds": 1800,
  "runLevelSnapshotIntegrityRequired": true,
  "gameLevelIncompleteVectorReason": "team_feature_vector_unavailable",
  "runtimePredictionWritesAuthorized": false
}
```

```
adapterContractHash =
sha256CanonicalJson(CANDIDATE_B_V1_GENERIC_SHADOW_ADAPTER_CONTRACT_MANIFEST)
```

Frozen value:

```
89ea502df175846f7d942dc485779e33fdd15fe17cd2bcaebba5b3926274ebf6
```

This adapter-contract hash is **not** part of Candidate B `snapshotHash`.

---

## Per-prediction feature provenance

Required Candidate B `featureProvenance` fields, at minimum:

```
snapshotParentId
snapshotHash
featureDefinitionHash
derivationDefinitionHash
sourceManifestHash
sourceProvenanceManifestHash
normalizationManifestHash
populationManifestHash
home:
  teamId
  availabilityStatus
  unavailableReasons
  candidateBTeamRatingPoints
  rowHash
away:
  teamId
  availabilityStatus
  unavailableReasons
  candidateBTeamRatingPoints
  rowHash
hfa:
  existing computeEffectiveHfa provenance/result
    effectiveHfa
    baseHfa
    teamAdjustment
    rawHfa
```

Do **not** copy the whole 138-team snapshot into every prediction.

---

## Input payload

Required Candidate B `inputPayload` fields:

```
gameId
season
week
homeTeamId
awayTeamId
neutralSite
kickoffTimestamp
predictionTimestamp
featureSnapshotHash
modelDefinitionId
featureDefinitionId
policyDefinitionId
home:
  teamId
  rowHash
  priorCoreRaw
  talentRaw
  returningRaw
  portalRaw
  zCore
  zTalent
  zReturning
  zPortal
  candidateBRawComposite
  candidateBCompositeZ
  candidateBTeamRatingPoints
away:
  teamId
  rowHash
  priorCoreRaw
  talentRaw
  returningRaw
  portalRaw
  zCore
  zTalent
  zReturning
  zPortal
  candidateBRawComposite
  candidateBCompositeZ
  candidateBTeamRatingPoints
hfa:
  inputs / result needed to reproduce the matchup
    homeTeamId
    neutralSite
    effectiveHfa
    baseHfa
    teamAdjustment
    rawHfa
market:
  existing Generic Shadow selected market structure
    selectedMarketLineId
    selectedMarketTeamId
    selectedMarketLineValue
    canonicalMarketValue
    marketTimestamp
    marketAgeSeconds
    marketBook
    marketSource
    marketProvenance
    homeRowId
    awayRowId
    homeLine
    awayLine
```

Home / away numeric fields come **ONLY** from the already-persisted exact-decoded snapshot rows.  
Do **not** copy all 138 teams into a prediction.

`market` is `null` when no coherent eligible market was selected.

The resulting Generic Shadow `inputHash` remains:

```
sha256CanonicalJson(inputPayload)
```

---

## Coverage reference — audit only

Document as **AUDIT REFERENCE ONLY**. These are **not** universal machine gates.

| Reference | Value |
|---|---|
| Candidate B complete teams | **103 / 138** |
| Week 3 both-complete games from frozen research audit | **35 / 57** |
| Week 3 feature-unavailable games | **22 / 57** |

Do **not** use `35/57` as a universal machine gate.

Actual prospective capture can also lose games to:

- post-kickoff
- missing market
- incoherent market
- stale market

Never weaken the portal or feature-availability contract to improve coverage.

---

## Matched comparison rule

Preserve the formula-contract rule:

Any future Candidate B vs Core evaluation **must** include a matched-game comparison restricted to games where Candidate B had a legitimate prospective prediction.

Do **not** compare Candidate B partial coverage directly with Core full-slate results and attribute the difference solely to model quality.

Reason: Candidate B availability is non-random because portal data quality removes a material subset of teams/games.

---

## Implementation boundary

The future implementation PR is expected to touch narrowly:

- Generic Shadow frame typing
- model-aware frame loading
- Candidate B adapter
- deterministic unavailable reason extension
- tests

It **must not** require:

- Prisma schema change
- migration
- Candidate B feature rewrite
- feature snapshot mutation
- provider code
- Generic closing / evaluation
- Official Card changes

---

## No allowlist / workflow change yet

This contract does **NOT** authorize adding Candidate B to:

```
SHADOW_MODEL_ALLOWLIST
```

or:

```
.github/workflows/capture-shadow-model-predictions-2026-manual.yml
```

Those remain separate after adapter implementation / audit.

The current production allowlist remains Core-only in this PR:

```
core_v1_shadow_baseline_v1
```

---

## No production capture

Do **NOT** run:

- Candidate B Generic Shadow PREVIEW
- Candidate B Generic Shadow COMMIT

No `ShadowModelCaptureRun` writes.  
No `ShadowModelPrediction` writes.

```
runtimePredictionWritesAuthorized = false
providerCalls = 0
```

---

## What this contract does not authorize

- adapter implementation
- Generic Shadow allowlisting
- workflow enablement
- Candidate B prediction PREVIEW / COMMIT
- feature snapshot rewrite
- schema / migration
- CFBD or Odds calls
- Official Card / Bet writes
- Hybrid activation
- evaluator work
- official promotion

---

## Next gate

After this contract is independently audited and merged, a **separate** implementation PR may attach Candidate B to Generic Shadow using this frozen design.

That later PR still does **not** by itself authorize allowlist / workflow enablement or production capture.
