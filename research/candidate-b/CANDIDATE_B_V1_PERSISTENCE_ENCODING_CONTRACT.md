# Candidate B V1 — Exact Float8 Persistence Encoding Contract

**Status:** `PERSISTENCE_ENCODING_FROZEN`  
**Model status:** SHADOW / RESEARCH ONLY — NOT OFFICIAL  
**Contract date:** 2026-09-14  
**Companion contracts (unchanged by this file):**
- [`CANDIDATE_B_V1_INPUT_CONTRACT.md`](./CANDIDATE_B_V1_INPUT_CONTRACT.md)
- [`CANDIDATE_B_V1_FORMULA_CONTRACT.md`](./CANDIDATE_B_V1_FORMULA_CONTRACT.md)
- [`CANDIDATE_B_V1_PERSISTENCE_DESIGN.md`](./CANDIDATE_B_V1_PERSISTENCE_DESIGN.md)
- [`CANDIDATE_B_V1_TEAM_RESOLUTION_CONTRACT.md`](./CANDIDATE_B_V1_TEAM_RESOLUTION_CONTRACT.md)

This contract freezes **how already-derived Candidate B V1 semantic floating values are transported into PostgreSQL `float8`** without changing their IEEE-754 binary64 value.

It is **not**:

- a Candidate B methodology change
- a feature-definition change
- a derivation-definition change
- a source-identity change
- a team-resolution change
- a schema change
- a `snapshotHash` change

It authorizes **no** implementation, schema/migration, runtime adapter, workflow, PREVIEW, or COMMIT work by itself.

---

## Why this contract exists

The corrected Candidate B V1 semantic snapshot was independently audited in memory with:

```
snapshotHash = 0332e24f97c891fd6431280fa7939c467c614714abe207eeb3dc89d466eb1148
```

The first explicitly authorized COMMIT attempt failed closed:

```
post_write_integrity_failed
```

The serializable transaction rolled back completely. Production state after the failed attempt:

| Table | Count |
|---|---:|
| `shadow_model_feature_snapshots` | 0 |
| `shadow_model_feature_snapshot_teams` | 0 |

The failure was a **persistence transport** problem, not Candidate B methodology.

---

## Failure evidence

Root-cause investigation found:

1. Candidate B child numerics are Prisma `Float?` / PostgreSQL `double precision` (`float8`).
2. Direct Prisma/raw JavaScript `Number` parameterization can be represented as PostgreSQL `numeric` before conversion to `float8`.
3. `numeric -> float8` moved some values by one ULP.
4. Prisma result decoding of an already-correct `float8` preserved the database binary bits exactly.

Example — California `portalRaw`:

| Path | Value | binary64 hex |
|---|---|---|
| Semantic JS | `0.0029999999999997806` | `3f689374bc6a7d00` |
| Lossy numeric-parameter path | neighboring 1-ULP value | `3f689374bc6a7d01` |

Those are distinct IEEE-754 double values. They are **not** equivalent for hashing. Candidate B does **not** use epsilon comparison, rounded `rowHash` comparison, tolerance, silent number normalization, or `parseFloat` hacks.

---

## Feasibility audit evidence

A later production SELECT-only audit tested every finite Candidate B V1 child float through:

```
finite JS Number
-> JSON.stringify(value)
-> JavaScript string parameter
-> PostgreSQL TEXT
-> explicit ::double precision
-> PostgreSQL float8
-> Prisma decode
```

No JS numeric SQL parameters were used for the float values.

| Gate | Result |
|---|---:|
| Total finite child float values | 1846 |
| Distinct binary64 values | 1683 |
| Negative-zero count | 0 |
| Local roundtrip mismatches | 0 |
| DB float8 mismatches | 0 |
| Prisma decoded-bit mismatches | 0 |

Field-class totals, every class zero mismatches:

| Class | Total | Mismatches |
|---|---:|---:|
| raw features | 514 | 0 |
| z-scores | 514 | 0 |
| composite values | 206 | 0 |
| rating points | 103 | 0 |
| rated coverage | 273 | 0 |
| mean rating | 236 | 0 |

Parent semantic JSON manifests also survived:

```
TEXT -> ::jsonb -> Prisma decode -> sha256CanonicalJson
```

with all existing parent hashes unchanged.

Classification:

```
TEXT_TO_FLOAT8_EXACT_FOR_ALL_CANDIDATE_B_VALUES
```

---

## Frozen persistence-encoding identity

```
persistenceEncodingContractId = candidate_b_v1_exact_float8_text_encoding_v1
```

This identity is an **implementation / persistence invariant only**.

It **MUST NOT** be inserted into:

- `featureDefinitionManifest`
- `derivationDefinitionManifest`
- `sourceManifest`
- `sourceProvenanceManifest`
- `normalizationManifest`
- `populationManifest`
- `rowHash`
- `snapshotHash`

It **MUST NOT** change Candidate B semantic identity.

---

## Canonical persistence-encoding contract manifest

Call this object `PERSISTENCE_ENCODING_CONTRACT_MANIFEST`.

It contains only stable semantic strings and booleans. It does **not** include timestamps, repo SHA, `snapshotHash`, runtime paths, or implementation filenames.

```json
{
  "contractId": "candidate_b_v1_exact_float8_text_encoding_v1",
  "semanticRole": "NON_SEMANTIC_PERSISTENCE_TRANSPORT",
  "targetDatabaseType": "POSTGRESQL_DOUBLE_PRECISION",
  "sourceNumericType": "JAVASCRIPT_NUMBER_BINARY64",
  "finiteRequired": true,
  "negativeZeroEncoding": "POSITIVE_ZERO",
  "nullEncoding": "SQL_NULL",
  "decimalTextEncoding": "JSON_STRINGIFY_FINITE_NUMBER",
  "sqlParameterType": "TEXT",
  "postgresConversion": "EXPLICIT_TEXT_TO_DOUBLE_PRECISION_CAST",
  "postReadRepresentation": "PRISMA_NUMBER",
  "integrityRequirement": "EXACT_BINARY64_EQUALITY",
  "rowHashVerification": "EXACT_138_OF_138",
  "snapshotHashVerification": "EXACT",
  "schemaMigrationRequired": false
}
```

---

## Canonical persistence-encoding contract hash

```
persistenceEncodingContractHash = sha256CanonicalJson(PERSISTENCE_ENCODING_CONTRACT_MANIFEST)
```

Use the repository helper `sha256CanonicalJson` (`canonicalJsonString` of key-sorted JSON, then SHA-256 hex). Do **not** use raw `JSON.stringify`, the markdown-file SHA, a git blob SHA, or a source-code SHA.

Frozen value:

```
644f51274d1630746e579f861ebd22f4e82921be7adb8372cf2fef9d9dbcd343
```

---

## Canonical float storage-text function

Freeze the conceptual encoding:

```ts
function candidateBFloat8StorageText(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error('non_finite_float8_storage_value');
  }
  if (Object.is(value, -0)) {
    return '0';
  }
  const text = JSON.stringify(value);
  if (typeof text !== 'string') {
    throw new Error('float8_storage_text_generation_failed');
  }
  return text;
}
```

Semantics:

- `null` is **not** passed through this function
- `null` persists as SQL `NULL`
- `NaN` rejected
- `+Infinity` rejected
- `-Infinity` rejected
- `-0` normalized to `+0` because Candidate B canonical JSON hashing already serializes `-0` as `0`
- no `toFixed`
- no `toPrecision`
- no locale formatting
- no `parseFloat` canonicalization
- no epsilon / tolerance comparison
- no decimal rounding policy

This function is frozen here as contract text. It is **not** implemented by this contract.

---

## Fields covered

The exact TEXT → `float8` transport applies to every nullable Float child field participating in Candidate B persisted semantics:

- `priorCoreRaw`
- `talentRaw`
- `returningRaw`
- `portalRaw`
- `zCore`
- `zTalent`
- `zReturning`
- `zPortal`
- `candidateBRawComposite`
- `candidateBCompositeZ`
- `candidateBTeamRatingPoints`
- `inboundRatedCoverage`
- `inboundMeanRating`
- `outboundRatedCoverage`
- `outboundMeanRating`

Integer count fields are **not** part of this float8 encoding rule.

---

## PostgreSQL write requirement

For Candidate B V1 child persistence:

**DO NOT** supply the semantic float value to SQL as a JavaScript numeric parameter.

Instead:

```
semantic JS Number
-> canonical decimal string
-> string / TEXT SQL parameter
-> explicit ::double precision
```

The resulting PostgreSQL `float8` bits **MUST** equal the original semantic JavaScript binary64 bits exactly.

The implementation may batch rows or insert individually. Batch mechanics are **not** part of this frozen contract. The exact transport semantics **are** frozen.

---

## Parent JSON posture

Do not redefine parent manifest semantics.

Existing parent semantic hashes remain authoritative.

Any implementation path used to persist parent JSON must satisfy the existing post-write canonical hash verification.

This persistence-encoding contract does **not** alter:

- `featureDefinitionHash`
- `derivationDefinitionHash`
- `sourceManifestHash`
- `sourceProvenanceManifestHash`
- `normalizationManifestHash`
- `populationManifestHash`

No new parent field is required.

---

## Semantic identity boundary

Persistence encoding is **below** the Candidate B semantic identity boundary.

If two storage implementations produce the exact same:

- persisted `float8` binary values
- persisted semantic JSON
- row hashes
- `snapshotHash`

they represent the same Candidate B feature artifact.

Therefore `persistenceEncodingContractId` / `persistenceEncodingContractHash` are **not** part of `snapshotHash`.

This preserves:

```
snapshotHash = 0332e24f97c891fd6431280fa7939c467c614714abe207eeb3dc89d466eb1148
```

provided all stored semantic values remain bit-exact.

---

## Existing semantic hashes remain frozen

Require unchanged:

```
teamResolutionPolicyHash =
de627563f2c4c2b1e195182bcd6b66dd3226daf9800e209e5f55244f94ea0efe

featureDefinitionHash =
6f1f8ecc132cdd87650252d57597a657ece0dd908bdf5010897023cafe988972

derivationDefinitionHash =
6c04627787edbcc7d1d42549f3cb19c525a6c4c31de572549f01e3efa64a638c

sourceManifestHash =
183e07cec8ab146247f8b15eda93331a1dfe03f624b06fd8b0dae886d14b14d6

sourceProvenanceManifestHash =
89ea635c89898aa2de5fad66a43e6eca36ef917f6945cc82635536746347f8da

normalizationManifestHash =
9de2fdbf94581f05671349111ae36e458c94ac637b93e8db0eaea701abdeaa96

populationManifestHash =
ce7a633f3230864c785048047698a3ba55fef1e25339e87db2a090bd65c59f2c

snapshotHash =
0332e24f97c891fd6431280fa7939c467c614714abe207eeb3dc89d466eb1148
```

---

## No schema change

```
schema migration required = NO
```

Do not change:

- Prisma schema
- migration SQL
- column types
- append-only triggers

The existing PostgreSQL `double precision` columns are sufficient when exact TEXT → `double precision` transport is used.

---

## Future implementation requirements

Documented here only. **Do not implement in this contract.**

A future writer-repair PR must:

1. retain the existing serializable transaction
2. create exactly one parent
3. stop using Prisma nested numeric child create for Candidate B V1
4. insert exactly 138 child rows using the frozen exact-float8 transport
5. send every nullable Float value as: finite `Number` → canonical text → TEXT parameter → `::double precision`
6. persist `null` as SQL `NULL`
7. reread through Prisma normally
8. verify persisted parent JSON hashes
9. recompute 138 / 138 row hashes
10. recompute exact `snapshotHash`
11. require post-write classification `EXACT_EXISTING`
12. rollback the transaction on any mismatch
13. preserve append-only triggers
14. no updates
15. no deletes
16. no upsert-overwrite

No runtime adapter or prediction work is part of that PR.

---

## Authorization status

The prior COMMIT authorization was **consumed** by the failed attempt.

Current snapshot status:

```
AUDITED_IN_MEMORY_SEMANTIC_HASH
NOT_PERSISTED
NOT_AUTHORIZED_FOR_RETRY
```

No future COMMIT is authorized by this contract.

After:

```
contract merge
-> implementation repair PR
-> independent audit
-> merge
-> exact PREVIEW / storage-path verification
```

the user must **explicitly authorize** another COMMIT attempt.

---

## Out of scope

This contract does **not** authorize:

- Candidate B COMMIT retry
- schema / migration edits
- Generic Shadow allowlisting
- runtime adapter work
- prediction PREVIEW / COMMIT
- CFBD or Odds calls
- operational table writes
