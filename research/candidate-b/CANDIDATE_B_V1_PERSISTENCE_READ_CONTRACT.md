# Candidate B V1 — Exact Float8 Persistence Read Contract

**Status:** `PERSISTENCE_READ_CONTRACT_FROZEN`  
**Model status:** SHADOW / RESEARCH ONLY — NOT OFFICIAL  
**Contract date:** 2026-09-14  
**Companion contracts (unchanged by this file):**
- [`CANDIDATE_B_V1_INPUT_CONTRACT.md`](./CANDIDATE_B_V1_INPUT_CONTRACT.md)
- [`CANDIDATE_B_V1_FORMULA_CONTRACT.md`](./CANDIDATE_B_V1_FORMULA_CONTRACT.md)
- [`CANDIDATE_B_V1_PERSISTENCE_DESIGN.md`](./CANDIDATE_B_V1_PERSISTENCE_DESIGN.md)
- [`CANDIDATE_B_V1_TEAM_RESOLUTION_CONTRACT.md`](./CANDIDATE_B_V1_TEAM_RESOLUTION_CONTRACT.md)
- [`CANDIDATE_B_V1_PERSISTENCE_ENCODING_CONTRACT.md`](./CANDIDATE_B_V1_PERSISTENCE_ENCODING_CONTRACT.md)

This contract freezes **how already-persisted Candidate B V1 child `float8` values are read back into JavaScript** without changing their IEEE-754 binary64 value.

It is a **read-path correction only**. It is **not**:

- a Candidate B methodology change
- a feature-definition change
- a derivation-definition change
- a `rowHash` algorithm change
- a `snapshotHash` change
- a rewrite of the frozen write-encoding contract
- a Prisma schema change
- a migration
- an implementation

It authorizes **no** production write, COMMIT, provider call, or runtime adapter work by itself.

---

## Why this contract exists

New production rollback evidence has conclusively shown:

- PostgreSQL stores the Candidate B child `float8` values bit-exactly
- ordinary Prisma **model** decoding of those `Float` columns changes some values by one ULP
- `383 / 1846` finite values were affected in the audited snapshot
- therefore Candidate B semantic integrity **MUST NOT** rely on Prisma model `Float` decoding for persisted child rows

The merged exact write transport remains valid. The remaining repair is read-side only.

---

## Corrected forensic evidence

### A. Read-only pipeline audit

```
semantic JS Number
-> JSON.stringify decimal text
-> TEXT parameter
-> ::jsonb
-> ->>
-> ::double precision
```

| Gate | Result |
|---|---:|
| Finite values | 1846 |
| Mismatches | 0 |

### B. Actual rollback-only INSERT verification

Inside one `SERIALIZABLE` transaction:

- actual merged parent writer exercised
- actual merged child writer exercised
- 138 children inserted
- direct PostgreSQL `float8send(column)` read
- ordinary Prisma model reread
- deliberate rollback
- final durable state `0 / 0`

Direct PostgreSQL storage:

| Gate | Result |
|---|---:|
| Finite comparisons | 1846 |
| Bit mismatches | 0 |
| Null mismatches | 0 |

Ordinary Prisma model reread:

| Gate | Result |
|---|---:|
| Finite comparisons | 1846 |
| Bit mismatches | 383 |
| Null mismatches | 0 |
| DB-vs-Prisma mismatches | 383 |

Primary classification:

```
PRISMA_MODEL_DECODE_LOSS
```

California `portalRaw`:

| Path | binary64 hex |
|---|---|
| Semantic expected | `3f689374bc6a7d00` |
| Direct PostgreSQL stored | `3f689374bc6a7d00` |
| Ordinary Prisma model reread | `3f689374bc6a7d01` |

Representative additional evidence:

| Team / field | Expected / direct DB | Prisma |
|---|---|---|
| Air Force `zTalent` | `c0079df37676fdec` | `c0079df37676fdeb` |
| Akron `portalRaw` | `bf87a647313fe080` | `bf87a647313fe081` |

Those are distinct IEEE-754 double values. They are **not** equivalent for hashing. Candidate B does **not** use epsilon comparison, rounded `rowHash` comparison, tolerance, silent number normalization, or `parseFloat` reconstruction.

---

## Mismatch distribution

Observed Prisma model mismatch counts on this snapshot:

| Field | Mismatches |
|---|---:|
| `portalRaw` | 47 |
| `zCore` | 49 |
| `zTalent` | 49 |
| `zReturning` | 49 |
| `zPortal` | 40 |
| `candidateBRawComposite` | 41 |
| `candidateBCompositeZ` | 50 |
| `candidateBTeamRatingPoints` | 44 |
| `outboundRatedCoverage` | 14 |

Zero mismatches on this snapshot:

- `priorCoreRaw`
- `talentRaw`
- `returningRaw`
- `inboundRatedCoverage`
- `inboundMeanRating`
- `outboundMeanRating`

Total: **383**

This distribution is observational evidence only. The exact reader **MUST** cover all 15 nullable Float fields, not merely the fields that happened to exhibit mismatches in this snapshot.

---

## Superseded read-side assumptions

This evidence supersedes the following **READ-SIDE** assumptions in [`CANDIDATE_B_V1_PERSISTENCE_ENCODING_CONTRACT.md`](./CANDIDATE_B_V1_PERSISTENCE_ENCODING_CONTRACT.md). That historical frozen write-transport file is **not rewritten**.

Its frozen write identity remains:

```
persistenceEncodingContractId =
candidate_b_v1_exact_float8_text_encoding_v1

persistenceEncodingContractHash =
644f51274d1630746e579f861ebd22f4e82921be7adb8372cf2fef9d9dbcd343
```

Its write requirement remains valid:

```
semantic JS binary64
-> canonical JSON-number text
-> TEXT SQL parameter
-> explicit ::double precision
-> exact PostgreSQL float8 bits
```

### Superseded assumption 1

> "Prisma result decoding of an already-correct float8 preserved the database binary bits exactly."

**Correction:** That was true for the raw-query forensic path tested at the time, but is **false** for ordinary Prisma **MODEL** decoding of Candidate B child `Float` columns.

### Superseded assumption 2

Future implementation requirement:

> "reread through Prisma normally"

**Correction:** Ordinary Prisma model `Float` decoding **MUST NOT** be used as the semantic source for Candidate B child float values during:

- persisted integrity verification
- existing snapshot classification
- future runtime Candidate B feature loading

Parent Prisma reads are **not** prohibited by this correction.

---

## Frozen persistence-read identity

```
persistenceReadContractId = candidate_b_v1_exact_float8_binary_read_v1
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

Existing `snapshotHash` remains:

```
0332e24f97c891fd6431280fa7939c467c614714abe207eeb3dc89d466eb1148
```

---

## Canonical persistence-read contract manifest

Call this object `PERSISTENCE_READ_CONTRACT_MANIFEST`.

It contains only stable semantic strings, booleans, and integers. It does **not** include timestamps, repo SHA, `snapshotHash`, runtime paths, or implementation filenames.

```json
{
  "contractId": "candidate_b_v1_exact_float8_binary_read_v1",
  "semanticRole": "NON_SEMANTIC_PERSISTENCE_READ_TRANSPORT",
  "sourceDatabaseType": "POSTGRESQL_DOUBLE_PRECISION",
  "databaseExtraction": "ENCODE_FLOAT8SEND_HEX",
  "wireRepresentation": "LOWERCASE_HEX_16",
  "nullEncoding": "SQL_NULL",
  "jsDecode": "BUFFER_READ_DOUBLE_BE",
  "exactBitRequirement": true,
  "childFloatFieldCount": 15,
  "parentReadPath": "PRISMA_PARENT_JSON_VERIFIED",
  "rowHashVerification": "EXACT_138_OF_138",
  "snapshotHashVerification": "EXACT",
  "schemaMigrationRequired": false
}
```

---

## Canonical persistence-read contract hash

```
persistenceReadContractHash = sha256CanonicalJson(PERSISTENCE_READ_CONTRACT_MANIFEST)
```

Use the repository helper `sha256CanonicalJson` (`canonicalJsonString` of key-sorted JSON, then SHA-256 hex). Do **not** use raw `JSON.stringify`, the markdown-file SHA, a git blob SHA, or a source-code SHA.

Frozen value:

```
88e6f3ac4b2761cf56509842be8c9d52f342d3b9f611cf3add655b68f448592e
```

---

## Exact database extraction

Freeze the conceptual child Float extraction as:

```sql
CASE
  WHEN <column> IS NULL THEN NULL
  ELSE encode(float8send(<column>), 'hex')
END
```

Requirements:

- source column remains PostgreSQL `double precision`
- do **NOT** use `column::text`
- do **NOT** use `numeric`
- do **NOT** round
- do **NOT** use `to_char`
- do **NOT** use epsilon comparison
- do **NOT** route child Float semantics through Prisma model decoding

PostgreSQL `float8send` is the authoritative persisted-bit representation.

---

## Exact JavaScript decode

Freeze conceptual decoding:

```ts
function candidateBFloat8FromHex(hex: string): number {
  if (!/^[0-9a-f]{16}$/.test(hex)) {
    throw new Error('candidate_b_float8_hex_invalid');
  }
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.length !== 8) {
    throw new Error('candidate_b_float8_byte_length_invalid');
  }
  return bytes.readDoubleBE(0);
}
```

Nullable rule:

```
null -> null
```

Never:

- `parseFloat`
- `Number(decimalText)`
- epsilon comparison
- rounding
- `float8::text` reconstruction

This function is frozen here as contract text. It is **not** implemented by this contract.

---

## Fields covered

The exact binary read path applies to every nullable Float child field participating in Candidate B persisted semantics:

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

No field may fall back to ordinary Prisma model Float decoding merely because it had zero mismatches in the current forensic sample.

Integer count fields are **not** part of this float8 read rule.

---

## Future parent read posture

Parent snapshot metadata may continue to use Prisma model reads.

Reason: the parent contains text identities, integer counts, dates, and JSON semantic manifests. The prior parent JSON roundtrip audit reproduced all canonical parent manifest hashes exactly.

Future implementation must still verify those parent hashes. No parent schema change is required.

---

## Future child read posture

The future exact reader should conceptually:

1. load parent by stable identity through Prisma **WITHOUT** `include: { teams: true }`
2. obtain `parent.id`
3. query the 138 child rows using static raw SQL keyed by `snapshot_id`
4. retrieve non-Float child fields normally in the same raw row
5. retrieve each of the 15 Float fields as `encode(float8send(column), 'hex')` or `NULL`
6. decode every non-null 16-character hex value with `Buffer.readDoubleBE(0)`
7. construct `PersistedTeamRow` objects
8. sort deterministically by `teamId` or query `ORDER BY team_id ASC`
9. pass those exact-decoded `PersistedTeamRow` values into the existing `verifyPersistedSnapshotIntegrity()` and `classifyExistingSnapshot()`

No `rowHash` or `snapshotHash` algorithm changes.

---

## Integrity source of truth

For Candidate B persisted child Floats, integrity semantics come from the exact PostgreSQL stored binary64 value.

They do **NOT** come from ordinary Prisma model Float decoding.

Therefore the required integrity path is:

```
direct float8send bits
-> exact JS binary64 reconstruction
-> computeRowHash
-> computeSnapshotHash
```

---

## Future runtime posture

The same exact child reader should be reusable by the future Candidate B runtime adapter.

The runtime adapter must read the persisted Candidate B feature snapshot. It must **NOT**:

- reread mutable PIT inputs
- call providers
- use ordinary Prisma child Float model decoding as semantic input

Do not implement runtime work in this contract.

---

## No schema change

```
schema migration required = NO
```

Do not change:

- Prisma schema
- PostgreSQL column types
- migration SQL
- append-only triggers

PostgreSQL is already storing the exact intended `float8` bits.

---

## Existing write contract remains valid

The merged exact write transport is validated. The direct-storage rollback forensic proved:

```
1846 / 1846 finite values stored with exact semantic binary64 bits
```

Therefore do **NOT** revert or redesign:

```
candidate_b_v1_exact_float8_text_encoding_v1
```

The remaining repair is read-side only.

---

## Semantic identity boundary

Persistence read encoding is **below** the Candidate B semantic identity boundary.

If two read implementations reconstruct the exact same:

- persisted `float8` binary values
- persisted semantic JSON
- row hashes
- `snapshotHash`

they represent the same Candidate B feature artifact.

Therefore `persistenceReadContractId` / `persistenceReadContractHash` are **not** part of `snapshotHash`.

This preserves:

```
snapshotHash = 0332e24f97c891fd6431280fa7939c467c614714abe207eeb3dc89d466eb1148
```

Existing semantic hashes remain frozen:

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
```

---

## Authorization status

All rollback-only production-write authorizations used for diagnosis are **consumed**.

Current snapshot status:

```
AUDITED_IN_MEMORY_SEMANTIC_HASH
WRITE_PATH_BIT_EXACT
PRISMA_MODEL_DECODE_LOSS_CONFIRMED
NOT_PERSISTED
NOT_AUTHORIZED_FOR_COMMIT
```

This contract authorizes **no** production write.

---

## Future implementation gate

Documented here only. **Do not implement in this contract.**

After this contract is merged, the next PR should:

- add one narrow exact-float8 child reader helper
- replace Candidate B `loadExisting()` child model decoding
- parent remains Prisma-read
- child rows come from exact raw binary extraction
- preserve writer unchanged
- preserve semantic hashes unchanged
- add exact binary decode tests
- add malformed/null tests
- add tests that deliberately demonstrate a one-ULP model value would fail while exact binary data reconstructs the expected value
- retain existing integrity/classification functions
- no DB writes
- no provider calls
- no runtime adapter yet

---

## Out of scope

This contract does **not** authorize:

- Candidate B COMMIT
- schema / migration edits
- writer redesign
- Generic Shadow allowlisting
- runtime adapter work
- prediction PREVIEW / COMMIT
- CFBD or Odds calls
- operational table writes
