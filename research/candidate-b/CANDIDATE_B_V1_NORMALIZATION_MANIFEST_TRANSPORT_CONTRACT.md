# Candidate B V1 — Normalization Manifest Exact Transport Contract

**Status:** `NORMALIZATION_MANIFEST_TRANSPORT_FROZEN`  
**Model status:** SHADOW / RESEARCH ONLY — NOT OFFICIAL  
**Contract date:** 2026-09-14  
**Companion contracts (unchanged by this file):**
- [`CANDIDATE_B_V1_INPUT_CONTRACT.md`](./CANDIDATE_B_V1_INPUT_CONTRACT.md)
- [`CANDIDATE_B_V1_FORMULA_CONTRACT.md`](./CANDIDATE_B_V1_FORMULA_CONTRACT.md)
- [`CANDIDATE_B_V1_PERSISTENCE_DESIGN.md`](./CANDIDATE_B_V1_PERSISTENCE_DESIGN.md)
- [`CANDIDATE_B_V1_TEAM_RESOLUTION_CONTRACT.md`](./CANDIDATE_B_V1_TEAM_RESOLUTION_CONTRACT.md)
- [`CANDIDATE_B_V1_PERSISTENCE_ENCODING_CONTRACT.md`](./CANDIDATE_B_V1_PERSISTENCE_ENCODING_CONTRACT.md)
- [`CANDIDATE_B_V1_PERSISTENCE_READ_CONTRACT.md`](./CANDIDATE_B_V1_PERSISTENCE_READ_CONTRACT.md)

This contract freezes **how Candidate B V1 `normalizationManifest` is persisted in and restored from** `shadow_model_feature_snapshots.normalization_manifest`.

It supersedes **only** the storage/read representation of that one JSONB column.

It does **not** alter Candidate B semantic `normalizationManifest` content.

It is **not**:

- a Candidate B methodology change
- a feature-definition change
- a derivation-definition change
- a formula change
- a `rowHash` algorithm change
- a `snapshotHash` change
- a rewrite of the frozen child float8 write or read contracts
- a Prisma schema change
- a migration
- an implementation

It authorizes **no** production write, COMMIT, provider call, or runtime adapter work by itself.

---

## Why this contract exists

Rollback-only production integrity-verifier isolation proved:

- the exact child writer is bit-exact
- the exact child reader is bit-exact
- child `rowHash` recomputation is exact
- persisted `snapshotHash` recomputation is exact
- verifier gates `01`–`14` and `16`–`24` pass
- **verifier gate 15 alone fails**

Gate 15:

```
sha256CanonicalJson(persisted.normalizationManifest)
===
persisted.normalizationManifestHash
```

Root cause:

```
PARENT_JSONB_STORAGE_SEMANTIC_CHANGE
```

Native persisted JSONB `normalizationManifest` changed five IEEE-754 binary64 values.

A later zero-write feasibility audit proved that storing repository `canonicalJsonString(normalizationManifest)` as a **JSONB string** inside a transport envelope restores those values exactly.

This contract freezes that **normalizationManifest-only** transport.

---

## Failure evidence

Rollback-only production verification established:

| Item | Value |
|---|---|
| First failing verifier gate | `15` |
| Expected `normalizationManifestHash` | `9de2fdbf94581f05671349111ae36e458c94ac637b93e8db0eaea701abdeaa96` |
| Native persisted JSONB rehash | `0c3e0bf6ea510ba852b2a7882438c024321603316ae2bfaf528bc86fb751e309` |

Five affected numeric leaves:

| Path | Expected hex | Native JSONB hex |
|---|---|---|
| `priorCore.populationSD` | `402972b26de15e9e` | `402972b26de15ea0` |
| `talent.populationSD` | `4060ec11a5f9563f` | `4060ec11a5f95640` |
| `returning.populationMean` | `3fdac4d954357d28` | `3fdac4d954357d29` |
| `portal.populationMean` | `bf5b4ad32916c780` | `bf5b4ad32916c781` |
| `portal.populationSD` | `3f8e79bc8d266104` | `3f8e79bc8d266103` |

Explicitly:

- the stored `normalizationManifestHash` **column itself was correct**
- the stored `snapshotHash` was correct
- child rows were correct
- Prisma model JSON matched the already-altered JSONB
- therefore this was **JSONB numeric storage semantic change**, not a second Prisma JSON model-decode defect

---

## Feasibility evidence

Zero-write production SELECT-only envelope feasibility established:

| Item | Value |
|---|---|
| `snapshotHash` | `0332e24f97c891fd6431280fa7939c467c614714abe207eeb3dc89d466eb1148` |
| `normalizationManifestHash` | `9de2fdbf94581f05671349111ae36e458c94ac637b93e8db0eaea701abdeaa96` |
| Canonical text length | `860` |
| Canonical text SHA-256 | `9de2fdbf94581f05671349111ae36e458c94ac637b93e8db0eaea701abdeaa96` |
| Numeric leaf count | `30` |
| Local `canonicalJsonString` → `JSON.parse` bit mismatches | `0` |
| Production JSONB string-envelope `canonicalJson` text exact | `YES` |
| Decoded manifest hash exact | `YES` |
| Envelope numeric bit mismatches | `0` |
| Classification | `CANONICAL_JSON_TEXT_ENVELOPE_EXACT` |

Native JSONB SELECT-only control was **INCONCLUSIVE**.

Do **not** use that control to weaken the already conclusive rollback-production evidence from the actual Prisma JSON-column writer.

---

## Frozen transport identity

```
normalizationManifestTransportContractId =
candidate_b_v1_normalization_manifest_canonical_json_text_v1
```

Canonical contract manifest:

```json
{
  "contractId": "candidate_b_v1_normalization_manifest_canonical_json_text_v1",
  "semanticRole": "NON_SEMANTIC_PERSISTENCE_TRANSPORT",
  "targetTable": "shadow_model_feature_snapshots",
  "targetColumn": "normalization_manifest",
  "targetDatabaseType": "POSTGRESQL_JSONB",
  "semanticInput": "CANDIDATE_B_V1_NORMALIZATION_MANIFEST",
  "canonicalTextEncoding": "REPOSITORY_CANONICAL_JSON_STRING",
  "envelopeEncoding": "JSONB_OBJECT",
  "envelopeEncodingId": "candidate_b_v1_normalization_manifest_canonical_json_text_v1",
  "envelopeCanonicalJsonKey": "canonicalJson",
  "exactEnvelopeKeys": [
    "encodingId",
    "canonicalJson"
  ],
  "readDecode": "JSON_PARSE_CANONICAL_JSON_TEXT",
  "canonicalTextVerification": "CANONICAL_JSON_STRING_ROUNDTRIP_EXACT",
  "semanticHashVerification": "SHA256_CANONICAL_JSON_EQUALS_PERSISTED_NORMALIZATION_MANIFEST_HASH",
  "exactBitRequirement": true,
  "schemaMigrationRequired": false
}
```

```
normalizationManifestTransportContractHash =
sha256CanonicalJson(canonical manifest)
=
e01fca1c21beca6303092cf5f9b45dbabe2007d9ab6766835a1c202d8104859a
```

This hash is computed with the repository `sha256CanonicalJson` helper.

---

## Non-semantic contract

The transport contract ID/hash are implementation/persistence metadata only.

They **MUST NOT** enter:

- `featureDefinitionManifest`
- `derivationDefinitionManifest`
- `sourceManifest`
- `sourceProvenanceManifest`
- `normalizationManifest`
- `populationManifest`
- `featureDefinitionHash`
- `derivationDefinitionHash`
- `sourceManifestHash`
- `sourceProvenanceManifestHash`
- `normalizationManifestHash`
- `populationManifestHash`
- `rowHash`
- `snapshotHash`

Existing semantic hashes remain unchanged.

---

## Semantic identity remains frozen

```
normalizationManifestHash =
9de2fdbf94581f05671349111ae36e458c94ac637b93e8db0eaea701abdeaa96

snapshotHash =
0332e24f97c891fd6431280fa7939c467c614714abe207eeb3dc89d466eb1148
```

Feature and derivation hashes remain unchanged.

No Candidate B formula change exists.

---

## Frozen write transform

Future write behavior must conceptually be:

```
const canonicalJson =
  canonicalJsonString(snapshot.normalizationManifest)
```

Before persistence require:

```
sha256CanonicalJson(JSON.parse(canonicalJson))
===
snapshot.normalizationManifestHash
```

Then store in `normalization_manifest` JSONB:

```json
{
  "encodingId": "candidate_b_v1_normalization_manifest_canonical_json_text_v1",
  "canonicalJson": "<exact canonicalJsonString(normalizationManifest)>"
}
```

The JSONB column **no longer stores semantic normalization numeric leaves directly**.

The numeric semantics remain **inside `canonicalJson` TEXT**.

---

## Exact envelope shape

Frozen envelope keys, and only these keys:

- `encodingId`
- `canonicalJson`

No extra keys.  
No missing keys.

`encodingId` must equal exactly:

```
candidate_b_v1_normalization_manifest_canonical_json_text_v1
```

`canonicalJson` must be a string.

Fail closed otherwise.

---

## Frozen read transform

Future read behavior:

1. obtain `normalization_manifest` envelope
2. require object, not null, not array
3. require exact key set: `encodingId`, `canonicalJson`
4. require exact `encodingId`
5. require `canonicalJson` is a string
6. `JSON.parse(canonicalJson)`
7. require parsed value is a non-null object and not an array
8. require `canonicalJsonString(parsed) === canonicalJson`
9. require `sha256CanonicalJson(parsed) === persisted.normalizationManifestHash`
10. expose parsed object as `PersistedSnapshot.normalizationManifest`

Therefore existing:

```
verifyPersistedSnapshotIntegrity(...)
```

can remain unchanged.

---

## Canonical-text requirement

Do not merely require that `canonicalJson` parses.

Require:

```
canonicalJsonString(JSON.parse(canonicalJson))
===
canonicalJson
```

This prevents alternate textual encodings from silently becoming accepted persistence representations.

---

## Exact numeric semantics

JavaScript JSON numeric parsing is acceptable here because feasibility proved:

```
canonicalJsonString(original semantic manifest)
->
JSON.parse(...)
```

preserved all **30** numeric leaves exactly at binary64 level.

This is specific to the frozen Candidate B V1 `normalizationManifest` and its canonical representation.

No rounding or decimal normalization is allowed.

---

## Forbidden transforms

Never use for semantic normalization numbers:

- native JSONB number leaves
- `parseFloat` on hand-extracted decimals
- `toFixed`
- `toPrecision`
- epsilon comparison
- rounded rehashing
- numeric casts
- PostgreSQL jsonb numeric values as semantic source
- silent tolerance

Do **not** weaken gate 15.

---

## Other five parent manifests unchanged

Keep the current representation for:

- `featureDefinitionManifest`
- `derivationDefinitionManifest`
- `sourceManifest`
- `sourceProvenanceManifest`
- `populationManifest`

Production isolation proved all five roundtrip exactly.

Do **not** envelope them.

---

## Child transports unchanged

Do **not** change:

```
candidate_b_v1_exact_float8_text_encoding_v1
```

or:

```
candidate_b_v1_exact_float8_binary_read_v1
```

Child writer and exact reader are already independently validated.

---

## Schema posture

```
schema migration required = NO
```

Existing column:

```
shadow_model_feature_snapshots.normalization_manifest JSONB
```

can hold the transport envelope.

No Prisma schema change.  
No migration.

---

## Persistence design interpretation

The pre-existing persistence design described `normalizationManifest` as a JSON field.

This remains physically true.

This new contract supersedes **only** the field's persistence representation:

| Era | Representation |
|---|---|
| OLD practical representation | semantic object with numeric JSONB leaves |
| NEW frozen transport representation | JSONB transport envelope containing canonical semantic JSON as TEXT |

Do **not** edit the historical persistence design file.

---

## Current snapshot status

```
AUDITED_IN_MEMORY_SEMANTIC_HASH
WRITE_PATH_CHILD_FLOAT8_BIT_EXACT
EXACT_CHILD_READ_PATH_VERIFIED
PARENT_NORMALIZATION_JSONB_SEMANTIC_CHANGE_CONFIRMED
CANONICAL_JSON_TEXT_ENVELOPE_FEASIBILITY_VERIFIED
NOT_PERSISTED
NOT_AUTHORIZED_FOR_COMMIT
```

No production write authorization exists.

---

## Future implementation gate

Documented here only. **Do not implement in this contract.**

After this docs contract is independently audited and merged, the next PR should be narrow.

Expected implementation work:

- add a normalization-manifest transport helper
- freeze contract ID / manifest / hash in code
- encode only `normalizationManifest` on parent write
- decode only `normalizationManifest` on parent read
- preserve the normal `PersistedSnapshot` semantic shape
- existing verifier unchanged
- writer child path unchanged
- reader child path unchanged
- no schema migration
- no provider calls
- no production writes during implementation
- add unit/regression tests
- do **not** implement a runtime Candidate B adapter
- do **not** retry COMMIT

---

## Expected implementation tests

Future required tests:

- contract hash exact
- exact envelope key set
- wrong `encodingId` fails closed
- extra key fails closed
- missing key fails closed
- `canonicalJson` non-string fails closed
- malformed JSON fails closed
- parsed array/null fails closed
- noncanonical-but-valid JSON text fails closed
- semantic hash mismatch fails closed
- all 30 numeric leaves exact after encode/decode
- five known ULP regressions exact
- existing verifier returns true on exact decoded fixture
- altered semantic value fails integrity
- transport contract does not enter semantic hashes

---

## Out of scope

This contract does **not** authorize:

- Candidate B COMMIT
- schema / migration edits
- child writer or reader redesign
- Generic Shadow allowlisting
- runtime adapter work
- prediction PREVIEW / COMMIT
- CFBD or Odds calls
- operational table writes
- enveloping any parent manifest other than `normalizationManifest`
