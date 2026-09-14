# Candidate B V1 — Team Resolution Policy Contract

**Status:** `TEAM_RESOLUTION_POLICY_FROZEN`  
**Model status:** SHADOW / RESEARCH ONLY — NOT OFFICIAL  
**Contract date:** 2026-09-14  
**Companion contracts:**
- [`CANDIDATE_B_V1_INPUT_CONTRACT.md`](./CANDIDATE_B_V1_INPUT_CONTRACT.md)
- [`CANDIDATE_B_V1_FORMULA_CONTRACT.md`](./CANDIDATE_B_V1_FORMULA_CONTRACT.md)
- [`CANDIDATE_B_V1_PERSISTENCE_DESIGN.md`](./CANDIDATE_B_V1_PERSISTENCE_DESIGN.md)

This contract freezes **provider-team-name resolution semantics** for Candidate B V1.

It does **not** alter:

- the four feature definitions
- the portal formula
- the 50% evidence gate
- the population-SD convention (divisor N)
- composite weights
- the 3.5-point scale
- persistence design
- `featureDefinitionId` / `derivationDefinitionId`
- `featureDefinitionHash` / `derivationDefinitionHash`

It authorizes **no** runtime adapter, workflow, prediction capture, alias-file edit, TeamResolver change, ingest-code change, or feature-snapshot COMMIT.

---

## Why this contract exists

The first real Candidate B V1 feature-snapshot PREVIEW correctly reproduced the frozen structural populations:

| Gate | Observed |
|---|---:|
| Authoritative FBS teams | 138 |
| priorCore available | 136 |
| talent available | 138 |
| returning available | 136 |
| portal available | 104 |
| complete | 103 |
| unavailable | 35 |

Resolution audit then found:

```
California (PA) -> california
```

for **3 portal origin records**.

That mapping is wrong. **California (PA)** is California University of Pennsylvania, not the University of California / Cal FBS program.

The current shared `TeamResolver` produced the mapping only because:

1. the full source string had no explicit CFBD alias
2. there was no general exact alias
3. there was no mis-map guard
4. `postFallbackNormalize` stripped `"(PA)"`
5. the resulting `"california"` matched the CFBD alias for Cal

This was detected **before** any Candidate B feature-snapshot COMMIT.

The provisional PREVIEW `snapshotHash`:

```
7bb754768d32008ade0ad352b69cb8832af7aa893e7be75396a7a58efa76399d
```

is **REJECTED FOR COMMIT**. It must never be treated as Candidate B V1 frozen feature evidence.

---

## Why team-resolution policy identity is required

Candidate B V1 feature persistence already treats `sourceManifestHash` as part of semantic snapshot identity and `snapshotHash`.

Team resolution is upstream of team-level feature construction. A different resolution policy can change:

- transfer counts
- coverage
- `portalRaw`
- normalization populations / statistics
- `zPortal`
- composite
- `teamRatingPoints`
- `rowHash`
- `snapshotHash`

Therefore the team-resolution policy must itself be content-addressed and included in semantic source identity.

Do **not** rely only on:

- prose documentation
- `repoCommitSha`
- implementation source code
- the final row hashes

to identify the resolution semantics.

---

## Authoritative target population

Candidate B V1 canonical targets are only:

- table: `TeamMembership` / `team_membership`
- `season = 2026`
- `level = FBS`

Expected unique count: **138**.

A resolved `teamId` must belong to this exact authoritative population.

Forbidden:

- live provider population
- all-`Team` fallback
- invented IDs

---

## Candidate B V1 CFBD resolution policy

Resolution must be **fail-closed**.

For Candidate B V1, allow only mappings supported by the **FULL provider school identity before parenthetical stripping**.

Permitted harmless pre-normalization includes existing normalization such as:

- trimming
- Unicode / diacritic normalization
- existing A&M token normalization

That pre-normalization **must preserve meaningful parenthetical school qualifiers**.

### Permitted class A — full-string guard

A deliberate mis-map guard operating on the **full** provider school identity may resolve the team.

Examples include reviewed Miami / Texas A&M / San José semantics.

The resulting `teamId` must be in the authoritative 138-team FBS set.

### Permitted class B — full-string CFBD alias

An explicit CFBD alias keyed by the **full pre-normalized provider string** may be accepted.

Examples:

- `"Miami (FL)"` may resolve when an explicit full-string alias exists.
- An explicit full-string alias is evidence.
- A stripped-parenthetical alias is **not**.

### Permitted class C — full-string general exact alias

An existing general exact alias may be accepted only when the **full pre-normalized provider school identity** matches without removing a parenthetical qualifier.

The result must be in the authoritative 138-team FBS set.

---

## Forbidden for Candidate B V1

Reject:

- fuzzy matching
- mascot / name fuzzy inference
- parenthetical stripping followed by alias lookup
- any alias hit that exists **ONLY** after `postFallbackNormalize` removes `"(...)"`
- silent non-FBS → similarly named FBS conversion
- invented aliases
- manual one-off remapping inside the derived feature calculation

Candidate B should fail closed rather than infer.

---

## `normalized_alias` posture

For Candidate B V1, do **not** depend on the generic `normalized_alias` stage.

Provider CFBD school names used by this frozen PIT must resolve through:

- reviewed guard
- full-string CFBD alias
- full-string general exact alias

or remain unresolved.

If implementation discovers that a frozen CORE or returning row requires `normalized_alias`, **STOP** for explicit review rather than broadening this contract.

Current audited CORE and returning populations required **no** `normalized_alias` and **no** fuzzy matches.

---

## Parenthetical rule

Freeze the exact rule:

> A parenthetical qualifier is identity-bearing unless an explicit reviewed full-string alias or guard says otherwise.

Therefore:

```
"California (PA)"
```

must **NOT** resolve to:

```
"california"
```

merely because `"(PA)"` is removed.

It remains unresolved / non-FBS for Candidate B V1.

By contrast:

```
"Miami (OH)"
```

may resolve because its full school identity is explicitly supported by an existing reviewed guard and/or full-string mapping.

Future parenthetical provider names must follow the same rule. Do **not** solve them by automatic qualifier deletion.

---

## Portal side-independence remains frozen

Do **not** change Candidate B V1 portal transfer semantics.

Resolve origin and destination independently.

If origin resolves to authoritative FBS and destination is:

- null
- unresolved
- non-FBS
- denylisted

the valid FBS **origin** still counts as that team's outbound transfer.

If destination resolves to authoritative FBS and origin is unresolved / non-FBS, the valid FBS **destination** still counts as that team's inbound transfer.

A bad or unresolved counterparty must never erase the legitimate FBS side.

This is essential.

The diagnostic `BOTH_SIDES_REQUIRED` procedure produced portal availability **134** instead of the frozen **104** and is **not** Candidate B V1 behavior.

---

## California (PA) correction semantics

For the three known portal records whose origin is `California (PA)`:

- treat the origin as unresolved / non-FBS
- the three destination schools remain independently eligible for resolution
- their inbound transfer evidence remains intact
- do **not** discard the whole transfer record

Expected direct Cal effect from the reconciliation diagnostic (reference only; implementation must recompute from the frozen source):

| Item | Current PREVIEW | After unresolved origin |
|---|---|---|
| California inbound | unchanged | unchanged |
| California outbound transfer count | 39 | 36 |
| California outbound rated count | 22 | 20 |
| California outbound rated coverage | ≈ 0.564 | ≈ 0.556 |
| California outbound mean | ≈ 0.8645 | ≈ 0.867 |
| California `portalRaw` | ≈ 0.005455 | ≈ 0.003000 |
| California portal availability | AVAILABLE | remains AVAILABLE |

---

## Denylist

Existing denylist semantics remain valid.

Known examples observed in the portal audit:

- `Alabama A&M`
- `North Carolina A&T`
- `San Diego`

must remain unresolved when denylisted / non-authoritative under the current mapping policy.

Do not change denylist entries in this contract.

---

## CORE / returning policy

CORE and returning are team-level FBS feature sources.

Every source row must resolve deterministically to one unique authoritative 2026 FBS team.

| Source | Source rows | Unique resolved FBS teams |
|---|---:|---:|
| CORE | 136 | 136 |
| returning | 136 | 136 |

Any unresolved row: **FAIL CLOSED**.  
Any duplicate target team: **FAIL CLOSED**.  
Any fuzzy mapping: **FAIL CLOSED**.

Do not silently drop team-level source rows.

---

## Portal policy

Portal is different because counterparties may legitimately be non-FBS.

For portal:

- unresolved / non-FBS names are allowed
- player-level records are never persisted
- each valid FBS side is retained independently
- mapping ambiguity must not be guessed
- a wrong FBS assignment is worse than leaving the side unresolved

---

## Historical approximate audit references

The earlier formula-contract distribution table remains **approximate audit evidence**, not a machine gate.

Historical values include:

- portal mean ≈ `-0.001666`
- portal population SD ≈ `0.014881`
- raw composite mean ≈ `0.081464`
- raw composite population SD ≈ `0.670770`
- final rating distribution references

These values are **not**:

- semantic source identities
- hash inputs
- COMMIT equality gates
- authorization to preserve a known wrong school mapping

The formula contract already labels these values as approximate audit references / evidence rather than calculation inputs. This contract does not edit that file.

### Reconciliation evidence

Current provisional PREVIEW:

| Item | Value |
|---|---|
| portal n | 104 |
| mean | `-0.0015307047333678336` |
| population SD | `0.01506459479426055` |
| complete | 103 |

`California (PA)` unresolved diagnostic:

| Item | Value |
|---|---|
| portal n | 104 |
| mean | `-0.0015543061319692303` |
| population SD | `0.015055552684869236` |
| complete | 103 |

This proves:

- `California (PA)` is a real mapping defect
- correcting it does not explain all historical approximate-reference drift
- historical approximate distribution references must not override the correct team-resolution policy

Do not use ATS, scores, markets, or outcomes in this reasoning.

---

## COMMIT gates after implementation repair

A future Candidate B V1 feature snapshot may become COMMIT-eligible only after a fresh PREVIEW satisfies all frozen semantic gates, including:

- exact frozen raw payload SHAs
- exact `muPortal` parity
- exact `featureDefinitionHash`
- exact `derivationDefinitionHash`
- authoritative 138-team population
- Candidate B V1 team-resolution policy in this contract
- priorCore available 136
- talent available 138
- returning available 136
- portal available 104
- complete 103
- unavailable 35
- population SD divisor N
- final rating population SD 3.5
- deterministic two-run semantic hashes
- deterministic 138 row hashes
- `blockers = []`
- existing state `ABSENT` before first COMMIT
- zero provider calls
- zero operational writes

Do **not** require equality to rounded historical portal / composite / rating audit references.

Any meaningful discrepancy must still be reviewed; rounded historical values are not a machine gate.

---

## Version / identity posture

This contract is a correction of Candidate B V1 **implementation resolution behavior** discovered before first feature-snapshot persistence.

It is **not**:

- Candidate B V2
- a formula change
- a source change
- a portal-gate change
- a change to one-sided transfer semantics
- a change to `featureDefinitionId`
- a change to `derivationDefinitionId`

This docs-only contract does **not** change:

- `featureDefinitionHash`
- `derivationDefinitionHash`

The rejected provisional snapshot was never persisted, so no immutable V1 feature evidence is being rewritten.

---

## Frozen team-resolution policy identity

```
teamResolutionPolicyId = candidate_b_v1_team_resolution_policy_v1
```

The canonical semantic policy manifest is exactly this object. It contains only stable semantic strings and counts. It does **not** include timestamps, repo SHA, provisional `snapshotHash`, historical rounded statistics, runtime paths, or implementation filenames.

```json
{
  "policyId": "candidate_b_v1_team_resolution_policy_v1",
  "provider": "cfbd",
  "authoritativePopulation": {
    "source": "TeamMembership",
    "season": 2026,
    "level": "FBS",
    "expectedUniqueCount": 138
  },
  "preNormalization": {
    "trim": true,
    "unicodeDiacriticNormalization": true,
    "normalizeAandMToken": true,
    "preserveParentheticalQualifier": true
  },
  "acceptedResolutionClasses": [
    "FULL_STRING_GUARD",
    "FULL_STRING_CFBD_ALIAS",
    "FULL_STRING_GENERAL_EXACT_ALIAS"
  ],
  "rejectedResolutionClasses": [
    "FUZZY",
    "NORMALIZED_ALIAS",
    "PARENTHETICAL_STRIPPING_ALIAS",
    "SILENT_NON_FBS_TO_FBS_INFERENCE",
    "INVENTED_ALIAS",
    "MANUAL_DERIVATION_REMAP"
  ],
  "parentheticalRule": "IDENTITY_BEARING_UNLESS_EXPLICIT_FULL_STRING_ALIAS_OR_GUARD",
  "teamLevelSources": {
    "priorCore": {
      "requireEverySourceRowResolved": true,
      "expectedSourceRows": 136,
      "requireUniqueTargetTeamIds": true
    },
    "returning": {
      "requireEverySourceRowResolved": true,
      "expectedSourceRows": 136,
      "requireUniqueTargetTeamIds": true
    }
  },
  "portal": {
    "resolveOriginAndDestinationIndependently": true,
    "unresolvedCounterpartyAllowed": true,
    "retainValidFbsSideWhenCounterpartyUnresolved": true,
    "bothSidesRequired": false
  },
  "knownDisposition": {
    "California (PA)": "UNRESOLVED_NON_FBS",
    "Miami (OH)": "EXPLICIT_FULL_IDENTITY_RESOLUTION_ALLOWED"
  }
}
```

Call this object `TEAM_RESOLUTION_POLICY_MANIFEST`.

These known-disposition strings freeze the already-stated California / Miami rules; they do not change them:

- `California (PA)` remains `UNRESOLVED_NON_FBS`.
- `Miami (OH)` remains allowed only because its full identity is explicitly supported.
- Parenthetical stripping is never sufficient evidence.

---

## Canonical policy hash

```
teamResolutionPolicyHash = sha256CanonicalJson(TEAM_RESOLUTION_POLICY_MANIFEST)
```

Use the repository helper `sha256CanonicalJson` (`canonicalJsonString` of key-sorted JSON, then SHA-256 hex). Do **not** use raw `JSON.stringify`, the markdown-file SHA, a git blob SHA, or a source-code SHA.

Frozen value:

```
de627563f2c4c2b1e195182bcd6b66dd3226daf9800e209e5f55244f94ea0efe
```

---

## SourceManifest pin

The future corrected Candidate B V1 ingest **MUST** include this object in the semantic `sourceManifest`:

```json
{
  "teamResolution": {
    "policyId": "candidate_b_v1_team_resolution_policy_v1",
    "policyHash": "de627563f2c4c2b1e195182bcd6b66dd3226daf9800e209e5f55244f94ea0efe"
  }
}
```

Then:

```
sourceManifestHash = sha256CanonicalJson(sourceManifest)
```

continues to be part of:

- semantic snapshot identity
- conflict detection
- `snapshotHash`

No new Prisma column is required. `sourceManifest` is already persisted JSON.

---

## Identity boundary

`featureDefinitionHash` remains unchanged.  
`derivationDefinitionHash` remains unchanged.

Reason:

- the four feature concepts are unchanged
- the numerical formula is unchanged
- the new hash pins source-name → canonical-team resolution semantics as a **separate** semantic source / canonicalization identity

The **next** corrected PREVIEW is expected to produce a **NEW**:

- `sourceManifestHash`
- `normalizationManifestHash`
- `snapshotHash`
- affected `rowHash` values

because:

1. the team-resolution policy is now semantically pinned
2. `California (PA)` is no longer assigned to Cal

This is expected and correct.

The old provisional snapshot remains rejected.

---

## No schema change

No schema migration is needed for this policy identity.

The existing parent already persists:

- `sourceManifest`
- `sourceManifestHash`

and `snapshotHash` already includes `sourceManifestHash`.

---

## Future implementation requirement

After this PR is merged, the ingest-only repair must:

1. define the exact same canonical `TEAM_RESOLUTION_POLICY_MANIFEST`
2. assert `sha256CanonicalJson(manifest) ===` frozen `teamResolutionPolicyHash`
3. add the ID + hash into `sourceManifest`
4. implement Candidate-B-specific strict CFBD resolution acceptance
5. keep default shared `TeamResolver` behavior unchanged for other workflows
6. reject parenthetical-strip-only mappings such as `California (PA) -> california`
7. preserve explicit full-string / guard mapping such as `Miami (OH) -> miami-oh`
8. rerun two real PREVIEWs
9. require deterministic new semantic hashes

Still **no COMMIT** until separately authorized.

The shared `TeamResolver` may retain its existing behavior for other workflows.

Candidate B V1 must invoke a stricter CFBD resolution mode or equivalent Candidate-B-specific acceptance layer that can distinguish:

- full-string alias / guard acceptance

from

- parenthetical-stripping fallback

Default behavior for existing production workflows must not change accidentally.

Preferred future implementation should be additive / backward-compatible.

Do **not** implement it in this contract.

---

## What remains unauthorized

- Candidate B feature-snapshot COMMIT
- Candidate B runtime adapter
- Generic Shadow frame modification
- workflow enablement
- prediction PREVIEW / COMMIT
- evaluator work
- official promotion
- TeamResolver / alias / ingest-code changes by this document alone
