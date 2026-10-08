# ML-CAL-1 Lifecycle Binding Sidecar V1 — Revised Design

**Status:** Revised design (October 7, 2026) + offline offline implementation authorized separately.  
**Not:** live observer, merge, dispatch, DB access, calibration, capture CLI wiring, or PR #244 amendment.  
**Context:** Receipt integrity audit PASS; live/full-weight qualification BLOCKED.  
**Pinned heads:** main `c37b5d367a364398d479c52844466aa4fd3306c2`; draft PR #244 `fc88bc705a0dac0597a068c7c929c28676f51f20` (fixture-only PASS stands; unchanged by binding PR).  
**Schema id:** `ml-cal-1-lifecycle-binding-sidecar-v1`  
**Derived claim id:** `ml-cal-1-lifecycle-binding-derived-receipt-v1`  
**Offline module:** `apps/jobs/lib/ml-cal-1-lifecycle-binding.ts`

This document replaces the prior draft proposal and addresses all five required corrections. Offline helpers implement §§1–8 without live integration.

---

## 0. Purpose, non-goals, and identities

### Purpose

A separate, read-only **lifecycle binding sidecar** that:

1. Leaves the independently accepted lifecycle archive (ZIP + report member) **immutable**.
2. Records a **later** observed `TeamSeasonRating` projection with mandatory timing/lineage.
3. Computes the **unchanged** capture fingerprint via existing `exportRatingInput` / `buildRatingFingerprint`.
4. Separately checks numeric agreement with the writer’s **1e-9** semantics against `report.rows[].finalPowerRating` / `games`.
5. Never creates `trustedAcceptance` / live qualification from self-asserted flags or caller-named trust objects alone.

### Non-goals

- Rewriting accepted ZIPs/reports or embedding a capture fingerprint into COMMIT artifacts.
- Relabeling Week 5 / weight 0.75 as Week 6 / weight 1.00.
- Inferring uninterrupted lineage or freshness from numeric agreement alone.
- Claiming a pure helper can detect every fabricated-but-self-consistent snapshot.
- Amending accepted PR #244 in this task (integration is a **later** capture-code PR).
- Live DB observer, provider calls, merge, workflow enablement, PR #243 registration, 2025 access.

### Three producer identities (always separate)

| Identity | Meaning |
|----------|---------|
| `lifecycleProducerSha` | GitHub Actions producer SHA of the accepted COMMIT workflow |
| `bindingObserverSha` | Repo SHA of the process that performed the later rating readback |
| `captureProducerSha` | Capture runner / planner producer SHA (existing capture envelope field) |

Archive ZIP digest, report-member digest, sidecar byte digest, and any derived-receipt digest are **four distinct digests**. One digest must never stand for another object.

---

## 1. Mandatory observation timing and revision rules

### 1.1 Required time fields (sidecar observation block)

All of the following are **required** on every sidecar (fixtures included):

| Field | Meaning |
|-------|---------|
| `observationStartTime` | ISO-8601 wall clock when the read session began |
| `observationEndTime` | ISO-8601 wall clock when the read session ended (after last row committed into the observation buffer) |
| `snapshotReferenceTime` | ISO-8601 time stamped **after** the rating SELECT completes (binding as-of). Distinct from capture’s market `snapshotReferenceTime`; named `bindingSnapshotReferenceTime` in the schema to avoid collision |
| `dbTransactionTime` | ISO-8601 DB statement/transaction time when the engine exposes it; else `null` with reason `db_transaction_time_unavailable` |
| `rowCreatedAtMin` / `rowCreatedAtMax` | Min/max of observed `createdAt` |
| `rowUpdatedAtMin` / `rowUpdatedAtMax` | Min/max of observed `updatedAt` |

### 1.2 Provenance times (archive metadata — not per-row update times)

Retained as provenance only; **never** used as substitutes for per-row `updatedAt`:

| Field | Source |
|-------|--------|
| `github.workflowRunCompletedAt` | Actions run completion metadata |
| `github.artifactCreatedAt` | Artifact creation metadata |
| `report.execution` flags | `commitSucceeded`, `postWriteVerificationSucceeded` |
| `lifecycleProducerSha` | Workflow producer SHA |

### 1.3 Mandatory order / consistency checks (fail closed)

Let:

- `T_run` = workflow run completion (if present)
- `T_art` = artifact creation (if present)
- `T_obs0` = `observationStartTime`
- `T_snap` = `bindingSnapshotReferenceTime`
- `T_obs1` = `observationEndTime`
- `T_db` = `dbTransactionTime` (optional)
- `U_max` = `rowUpdatedAtMax`
- `C_max` = `rowCreatedAtMax`
- `now_ceiling` = verifier wall clock at verification (fixtures inject a fixed ceiling)

**Required:**

1. `T_obs0 ≤ T_snap ≤ T_obs1`.
2. If `T_db` present: `T_obs0 ≤ T_db ≤ T_obs1`.
3. If `T_run` present: `T_run ≤ T_obs0` (read must not predate source evidence completion).
4. If `T_art` present: `T_art ≤ T_obs0`.
5. Every row `createdAt` / `updatedAt` is a finite parseable time; `createdAt ≤ updatedAt` per row.
6. No row timestamp `> now_ceiling` (reject future/impossible timestamps).
7. `U_max ≤ T_snap` and `C_max ≤ T_snap` (observation must not claim rows updated after its own snapshot).
8. Season/model scope: every observed row `season === report.season` and `modelVersion === 'v1'`.

Failures emit stable reasons, e.g. `observation_time_order_invalid`, `observation_predates_archive`, `row_timestamp_in_future`, `row_updated_after_binding_snapshot`, `observation_scope_mismatch`.

### 1.4 Revision / lineage invalidation (mandatory semantics)

Numeric agreement at 1e-9 **does not** prove uninterrupted lineage or freshness.

**Self-declared lineage is forbidden.** A sidecar field such as `lineageEvidenceStatus: 'present'` (or any boolean inside the sidecar) **cannot** prove that no later revision occurred. Lineage for live qualification must come from **externally verified lineage evidence** supplied beside the sidecar (registry pin / reviewed lineage attestation), not from the sidecar’s own declaration.

#### External lineage attestation (required for live qualification)

```ts
/**
 * Separately reviewed. NOT embedded as a self-asserted flag inside the sidecar.
 * The verifier recomputes acceptance from this object + pins; it never trusts
 * sidecar.lineage.* declarations as proof.
 */
interface MlCal1LifecycleBindingLineageAttestation {
  schemaVersion: 'ml-cal-1-lifecycle-binding-lineage-attestation-v1';
  kind: 'lifecycle-binding-lineage-attestation';

  /** Sidecar file this attestation covers. */
  approvedSidecarDigest: string;

  /**
   * Exclusive upper bound of the lineage search window (ISO-8601).
   * Attests: “as of checkedThroughTime, no superseding lifecycle COMMIT /
   * rating revision for season+v1 was found in the reviewed evidence set.”
   */
  checkedThroughTime: string;

  /** Instant the lineage check was performed (ISO-8601); must be >= checkedThroughTime. */
  attestationTime: string;

  season: number;
  modelVersion: 'v1';

  /** Digest of the reviewed evidence inventory / query log bytes (external). */
  lineageEvidenceInventorySha256: string;

  /**
   * Outcome of the reviewed search through checkedThroughTime:
   * - none_found: no superseding lifecycle artifact / binding-invalidating revision
   * - superseded: at least one superseding artifact identified (blocks)
   */
  searchOutcome: 'none_found' | 'superseded';

  supersedingArtifacts: Array<{
    workflowRunId: string;
    zipSha256: string;
    completedThroughWeek: number;
    artifactCreatedAt: string | null;
  }>;

  pinProvenance: {
    registryId: string;
    registrySha256: string;
    reviewedAt: string;
    reviewer: string;
  };
}
```

**Mandatory verifier rules for live qualification:**

1. An external `MlCal1LifecycleBindingLineageAttestation` must be supplied; absence → `lineage_attestation_missing` → `liveQualifying=false`.
2. `attestation.approvedSidecarDigest === sha256(sidecarBytes)`.
3. `checkedThroughTime` is finite and `attestationTime >= checkedThroughTime`.
4. `checkedThroughTime >= bindingSnapshotReferenceTime` (lineage window must cover at least through the observation snapshot). Prefer `checkedThroughTime >= observationEndTime`.
5. `searchOutcome === 'none_found'` and `supersedingArtifacts.length === 0`; else `binding_invalidated_by_later_lifecycle`.
6. Attestation `pinProvenance` must verify like other registry pins (not caller-bootstrap).
7. Sidecar-echoed lineage fields, if present, are **ignored for decisions**; disagreement with attestation may emit `declared_lineage_mismatch` notes but never grants qualification.

**Additional invalidating events** (any one blocks until a **new** sidecar + **new** lineage attestation + trust pin):

| Event | Detection | Reason |
|-------|-----------|--------|
| Later lifecycle COMMIT for same season/v1 within checked-through window | Attestation lists superseding artifact(s) | `binding_invalidated_by_later_lifecycle` |
| Observed `updatedAt` set differs from an earlier approved binding’s observation | Compare to externally approved prior binding observation digest | `binding_invalidated_by_row_revision` |
| Cohort membership change vs verified report planned set | Recomputed cohort mismatch | `binding_cohort_mismatch` |
| Fingerprint differs from externally approved observed fingerprint | Trust pin comparison | `binding_fingerprint_mismatch_vs_approved` |
| Lineage attestation missing, expired relative to study policy, or `checkedThroughTime` too early | External attestation checks | `lineage_attestation_missing` / `lineage_checked_through_too_early` |

**If lineage attestation is unavailable:**

- Structural archive + observation checks may still run.
- `liveQualifying = false` with reason `lineage_revision_evidence_unavailable`.
- Offline fixtures exercise both “attestation none_found → may proceed to other gates” and “attestation absent/superseded → block live” without a live read.

### 1.5 Distinction from capture / COMMIT clocks

| Clock | Used for |
|-------|----------|
| Lifecycle COMMIT / report / artifact times | Provenance only |
| Binding observation times (§1.1) | Binding validity |
| Capture `snapshotReferenceTime` / `publicationTime` | Capture market/publication only — **out of scope** for this sidecar |

---

## 2. Recompute all qualification facts from verified bytes

### 2.1 Principle

The verifier **never** treats the following sidecar declarations as acceptance inputs:

- `archiveIntegrityVerified`
- `plannedNumericAgreement.ok`
- `fullWeightEligible`
- `usableRowCount`
- `ratingFingerprint` / per-team hashes when presented as “already computed”
- `sidecarSelfAccepted` / any local acceptance flag

It may **echo** recomputed values in the result object for audit, but decisions use only:

1. Verified archive bytes + external archive pins  
2. Verified sidecar observation bytes (or reconstructed observation)  
3. Independently recomputed facts  
4. Separately reviewed registry/pin trust records  

Reject when declared ≠ recomputed (`declared_*_mismatch`).

### 2.2 Archive verification (from ZIP + member bytes)

Given external pins `{ expectedZipSha256, expectedReportMemberSha256, expectedLifecycleProducerSha }`:

1. Hash ZIP bytes → must equal `expectedZipSha256`.
2. Extract single JSON member → hash → must equal `expectedReportMemberSha256`; byte count recorded.
3. Parse report JSON.
4. **Recompute / require from report bytes:**
   - `season`, `completedThroughWeek`, `selectedPolicy`, `canonicalWeight`, `modelVersion`
   - `execution.commitSucceeded === true`
   - `execution.postWriteVerificationSucceeded === true`
   - `verification.ok === true`, `verification.afterRows`, `verification.verifiedTeams`, `verification.reasons`
   - Planned team set = unique sorted `report.rows[].teamId`
   - Planned count = `EXPECTED_FBS_COUNT` (**138**)
5. Reject duplicates in `report.rows`, missing/extra teams vs 138, wrong season/model.
6. **Recompute** policy weight: `recomputedWeight = b1CanonicalWeight(completedThroughWeek)` (unchanged production function). Reject if `report.canonicalWeight !== recomputedWeight`.
7. `lifecycleProducerSha` must equal `expectedLifecycleProducerSha` (from workflow metadata pin, not invented into the old JSON).

### 2.3 Observation → export → fingerprint (recomputed)

1. Reconstruct each raw row into `MlCal1RawRatingRow` per §3 (preserve Decimal-like truthiness).
2. Call **unchanged** `exportRatingInput` per row; then `buildRatingFingerprint`.
3. Recompute usable count from exported `inputUsable` flags.
4. Reject if sidecar-declared fingerprint/usableCount/hashes disagree with recomputed values.

### 2.4 Numeric agreement (recomputed; distinct from fingerprint)

For each planned team id:

- Let `P = report.rows[i].finalPowerRating`, `G = report.rows[i].games`.
- Let observed numeric `power = Number(powerRatingRaw trimmed)` only **after** export path / or apply the same `decimalLikeToNumber` semantics as `verifyCoreV1LifecyclePostWrite`.
- Require `abs(power - P) ≤ 1e-9`, `abs(rating - P) ≤ 1e-9`, `abs(games - G) ≤ 1e-9`.
- Exact cohort: observed unique team set == planned unique team set == 138 FBS.
- Emit writer-aligned reasons: `powerRating_mismatch:id`, `rating_mismatch:id`, `games_mismatch:id`, `duplicate_after_write:id`, `after_write_team_set_mismatch`, etc.

**Success of numeric agreement does not imply fingerprint identity or lineage.**

### 2.5 Full-weight / prospective qualification (recomputed)

Inputs (external, not trusted from sidecar):

- `prospectiveTargetWeek` (integer ≥ 1) — separately supplied by the capture/study window registration

Recompute:

```
fullWeightByPolicy = (completedThroughWeek >= 6) && (recomputedWeight === 1)
prospectiveOk = (completedThroughWeek < prospectiveTargetWeek)
fullWeightEligible = fullWeightByPolicy && prospectiveOk && archiveOk && observationOk && numericOk
```

**Week ≥ 6 / weight = 1 alone does not establish eligibility for an earlier target week** (e.g. completedThroughWeek=7 cannot qualify a study whose prospective target is week 7).

Live primary also requires lineage evidence availability (§1.4) and external trust (§2.6).

### 2.6 External trust / registry pin comparisons (all mandatory for live)

#### Trust objects (separately reviewed; not caller-bootstrap)

```ts
/** Registry / pin provenance — NOT a field inside the sidecar JSON. */
interface MlCal1LifecycleBindingRegistryPin {
  /** How this pin entered the reviewed set (human review, signed registry file, etc.). */
  pinProvenance: {
    registryId: string;           // e.g. reviewed path or registry document id
    registrySha256: string;       // digest of the registry document bytes
    reviewedAt: string;
    reviewer: string;
  };
  approvedSidecarDigest: string;          // sha256 of exact sidecar file bytes
  approvedZipSha256: string;
  approvedReportMemberSha256: string;
  approvedLifecycleProducerSha: string;
  approvedBindingObserverSha: string;
  approvedRatingFingerprint: string;      // fingerprint of APPROVED observation
  approvedSeason: number;
  approvedCompletedThroughWeek: number;
  approvedSelectedPolicy: 'GLOBAL_BLEND_W3_W6';
  approvedCanonicalWeight: number;
  approvedProspectiveTargetWeek: number;
}
```

#### Mandatory comparisons when loading a stored sidecar for live qualification

| Check | Failure reason |
|-------|----------------|
| `sha256(sidecarBytes) === pin.approvedSidecarDigest` | `sidecar_digest_mismatch_vs_registry` |
| ZIP / member / producer pins match archive | `archive_pin_mismatch` |
| Recomputed fingerprint === `pin.approvedRatingFingerprint` | `fingerprint_mismatch_vs_registry` |
| `bindingObserverSha` === `pin.approvedBindingObserverSha` | `observer_sha_mismatch_vs_registry` |
| Season / week / policy / weight / prospective week match pin | `archive_claims_mismatch_vs_registry` |
| Registry pin provenance present and registry digest verifies | `registry_pin_provenance_missing` / `registry_digest_mismatch` |

#### Explicit non-bootstrap rule

A caller-supplied object named `trustedBinding`, `trustedAcceptance`, or similar **must not** bootstrap acceptance by itself. Acceptance requires:

1. Structural recomputation PASS, and  
2. A **registry pin** whose `pinProvenance` is independently reviewed (outside the sidecar), and  
3. All digest/claim comparisons above.

Fixture mode (`mode: 'fixture_hypothetical'`) **cannot** produce `liveAccepted=true` even if synthetic trust objects are supplied.

---

## 3. Exact field and Decimal mapping

### 3.1 Accepted report → numeric agreement

Report shape from `finalizeCoreV1LifecycleReport` / `CoreV1LifecycleRow`:

| Report field | Used as |
|--------------|---------|
| `report.season` | Season scope |
| `report.completedThroughWeek` | Week claim |
| `report.selectedPolicy` | Policy claim |
| `report.canonicalWeight` | Weight claim (must match `b1CanonicalWeight(week)`) |
| `report.modelVersion` | Must be `'v1'` |
| `report.rows[].teamId` | Planned cohort |
| `report.rows[].finalPowerRating` | **Only** planned rating scalar for 1e-9 checks |
| `report.rows[].games` | Planned games |
| `report.execution.commitSucceeded` | COMMIT success flag |
| `report.execution.postWriteVerificationSucceeded` | Post-write success flag |
| `report.verification.ok` / `afterRows` / `verifiedTeams` / `reasons` | Aggregate COMMIT verification |

There is **no** `planned.powerRating` field on report rows. Persist mapping in production is `powerRating: r.finalPowerRating` via `toPersistRows`; the binding numeric check therefore compares:

```
observed.powerRating  ≈ report.rows[].finalPowerRating   (eps 1e-9)
observed.rating       ≈ report.rows[].finalPowerRating   (eps 1e-9)
observed.games        ≈ report.rows[].games              (eps 1e-9)
```

Same semantics as `verifyCoreV1LifecyclePostWrite` (which compares after-write `powerRating`/`rating` to **persist** `powerRating`, itself sourced from `finalPowerRating`).

### 3.2 Observed row storage (sidecar) → capture reconstruction

Stored observation row (exact projection):

```ts
interface MlCal1BindingObservedRatingRow {
  season: number;
  teamId: string;
  modelVersion: string;
  /** Exact Decimal/text as read — never pre-coerced to JS number for storage. */
  powerRatingRaw: string | null;
  ratingRaw: string | null;
  games: number;
  dataSource: string | null;     // as observed; do not invent
  createdAt: string;             // ISO
  updatedAt: string;             // ISO
}
```

### 3.3 Deterministic reconstruction to `MlCal1RawRatingRow`

Fixture-tested helper (design contract):

```ts
function reconstructRawRatingRow(obs: MlCal1BindingObservedRatingRow): MlCal1RawRatingRow {
  return {
    season: obs.season,
    teamId: obs.teamId,
    modelVersion: obs.modelVersion,
    // Preserve truthiness: string '0' must remain a truthy Decimal-like, NOT numeric 0
    powerRating: obs.powerRatingRaw == null ? null : { toString: () => obs.powerRatingRaw as string },
    rating: obs.ratingRaw == null ? null : { toString: () => obs.ratingRaw as string },
    games: obs.games,
    dataSource: obs.dataSource,
    createdAt: obs.createdAt,
    updatedAt: obs.updatedAt,
  };
}
```

Then:

```ts
const exported = exportRatingInput(reconstructRawRatingRow(obs)); // UNCHANGED helper
```

**Forbidden:** `Number(obs.powerRatingRaw)` before `exportRatingInput`; replacing null with `0`; inventing `dataSource`; normalizing whitespace that alters `rowContentHash` inputs beyond what `exportRatingInput` itself does.

### 3.4 Required reconstruction tests (fixture)

| Case | Stored raw | Expect |
|------|------------|--------|
| Valid Decimal zero | `powerRatingRaw: '0'` | `chosenField=powerRating`, `valueUsed=0`, `inputUsable=true` |
| Numeric-zero trap | Must not store/pass JS `0` as the sole representation when testing Decimal zero | Production precedence preserved |
| Fallback to rating | `powerRatingRaw: null`, `ratingRaw: '4.25'` | Uses rating |
| Whitespace invalid | `powerRatingRaw: ' '` | Unavailable; no zero forecast |
| Null/null | both null | `default_zero` / unusable |
| Raw identity | round-trip `powerRatingRaw` through reconstruction → `exportRatingInput.powerRatingRaw` equal | Byte/text identity |

---

## 4. Bridge to the existing capture verifier

### 4.1 Gap

Existing capture `MlCal1LifecycleReceipt` expects:

- receipt bytes + pinned digest  
- `ratingFingerprint`  
- policy/week/weight/immutable/season fields  
- `sourceSha` (lifecycle producer)

The old COMMIT **report does not contain** `ratingFingerprint` or capture-style `receiptDigest`. Therefore the COMMIT member cannot be passed verbatim as `receiptBytes` for fingerprint-bearing live acceptance.

### 4.2 Versioned integration seam (sibling interface)

**Do not amend PR #244 in this design task.** Integration lands in a **later capture-code PR**.

#### 4.2.1 No self-referencing digest

A document **must not** contain `receiptDigest` equal to the hash of bytes that include that same `receiptDigest` field. Same rule as the existing capture lifecycle receipt: claims are hashed **without** embedding their own digest; the digest is supplied **beside** the bytes as `pinnedReceiptDigest` / `claims.receiptDigest` after hashing.

#### 4.2.2 Hashed core vs envelope

```ts
/**
 * Bytes that are hashed. Contains NO receiptDigest field.
 * schema: ml-cal-1-lifecycle-binding-derived-receipt-v1
 */
interface MlCal1LifecycleBindingDerivedReceiptCoreV1 {
  schemaVersion: 'ml-cal-1-lifecycle-binding-derived-receipt-v1';
  kind: 'lifecycle-binding-derived-receipt-core';

  bindingObservationDeclared: true;
  readbackWasNotExportedAtCommit: true;

  originalArchive: {
    zipSha256: string;
    reportMemberSha256: string;
    reportByteCount: number;
    lifecycleProducerSha: string;
    githubRunId: string;
    githubArtifactId: string;
  };

  sidecarDigest: string;

  /** Capture-compatible claims — digest lives OUTSIDE these hashed bytes. */
  captureClaim: {
    sourceSha: string;                 // === lifecycleProducerSha
    completedThroughWeek: number;
    selectedPolicy: string;
    canonicalWeight: number;           // recomputed via b1CanonicalWeight
    season: number;
    acceptedImmutable: true;
    ratingFingerprint: string;         // from LATER observation via unchanged helpers
    // NO receiptDigest here
  };

  bindingObserverSha: string;
  lineageAttestationDigest: string;    // sha256 of external lineage attestation bytes
  lineageCheckedThroughTime: string;   // copied from attestation for audit; verified externally
}

/** Envelope: core bytes + digest beside them (digest not inside hashed payload). */
interface MlCal1LifecycleBindingDerivedReceiptEnvelopeV1 {
  schemaVersion: 'ml-cal-1-lifecycle-binding-derived-receipt-envelope-v1';
  kind: 'lifecycle-binding-derived-receipt-envelope';
  /** Exact UTF-8 serialization of DerivedReceiptCoreV1 (stableStringify(core) + '\n'). */
  coreBytes: string;
  /** sha256(coreBytes) — OUTSIDE the hashed core. */
  coreDigest: string;
}
```

Construction:

```text
core = { ...DerivedReceiptCoreV1 fields, no digest... }
coreBytes = stableStringify(core) + '\n'
coreDigest = sha256(coreBytes)
envelope = { coreBytes, coreDigest }
// Never write coreDigest into core before hashing.
```

Digest separation:

| Object | Digest field | Inside hashed object? |
|--------|--------------|------------------------|
| Original ZIP | `originalArchive.zipSha256` | N/A (pin) |
| Original report member | `originalArchive.reportMemberSha256` | N/A (pin) |
| Sidecar file | `sidecarDigest` | referenced from core; value is hash of other bytes |
| Lineage attestation | `lineageAttestationDigest` | referenced from core; hash of attestation bytes |
| Derived receipt **core** | `envelope.coreDigest` | **No** — outside core |

#### 4.2.3 Adapter to existing `qualifyLifecycleReceipt` / `MlCal1LifecycleReceipt`

Existing capture verifier expects `MlCal1LifecycleReceipt`-shaped claims where `claims.receiptDigest === sha256(receiptBytes)` and `receiptBytes` serialize the claim **body** such that hashing those bytes yields that digest (digest field on claims is bound to bytes, with comparison ignoring self-inclusion per capture’s `omitReceiptDigest` rule).

**Adapter (pure, deterministic):**

```ts
function adaptDerivedReceiptToCaptureLifecycleInput(
  envelope: MlCal1LifecycleBindingDerivedReceiptEnvelopeV1
): {
  receiptBytes: string;
  pinnedReceiptDigest: string;
  claims: MlCal1LifecycleReceipt;
} {
  // 1. Verify envelope.coreDigest === sha256(envelope.coreBytes)
  // 2. Parse core from envelope.coreBytes
  const core = JSON.parse(envelope.coreBytes) as MlCal1LifecycleBindingDerivedReceiptCoreV1;

  // 3. Build capture-facing claim BODY without digest (matches capture’s omitReceiptDigest hashing model)
  const claimBody = {
    sourceSha: core.captureClaim.sourceSha,
    completedThroughWeek: core.captureClaim.completedThroughWeek,
    selectedPolicy: core.captureClaim.selectedPolicy,
    canonicalWeight: core.captureClaim.canonicalWeight,
    season: core.captureClaim.season,
    acceptedImmutable: core.captureClaim.acceptedImmutable,
    ratingFingerprint: core.captureClaim.ratingFingerprint,
  };

  // 4. receiptBytes = canonical serialization of claimBody ONLY
  //    (not the full derived core — so capture verifier stays on its existing surface)
  const receiptBytes = stableStringify(claimBody) + '\n';
  const pinnedReceiptDigest = sha256(receiptBytes);

  const claims: MlCal1LifecycleReceipt = {
    ...claimBody,
    receiptDigest: pinnedReceiptDigest, // set AFTER hash; equals sha256(receiptBytes)
  };

  return { receiptBytes, pinnedReceiptDigest, claims };
}
```

**Why two layers:**

| Layer | Role |
|-------|------|
| Derived **core** + **envelope.coreDigest** | Binds archive pins, sidecar digest, lineage attestation digest, observer SHA, and capture claim fields together as one reviewed derived object |
| Adapted `receiptBytes` / `pinnedReceiptDigest` / `claims` | Exact input shape for unchanged `qualifyLifecycleReceipt` |

Registry / trust for capture live path must approve **`pinnedReceiptDigest` of the adapted claimBytes** (and/or `envelope.coreDigest` with a recorded mapping). Approving only an inner field while the envelope changes is insufficient.

Optional stronger binding (recommended in the later capture PR): require

`trustedAcceptance.approvedReceiptDigest === adapted.pinnedReceiptDigest`

and registry also lists `approvedDerivedCoreDigest === envelope.coreDigest`.

### 4.3 How capture would consume it (later PR)

```text
live path (future):
  1. Load registry pin + sidecar bytes + ZIP/member bytes + lineage attestation bytes
  2. verifyLifecycleBindingSidecar(...) including external lineage attestation
     (checkedThroughTime, searchOutcome none_found, digests)
  3. If liveQualifying: build DerivedReceiptCoreV1 (no self-digest) → envelope.coreDigest
  4. adaptDerivedReceiptToCaptureLifecycleInput(envelope)
       → { receiptBytes, pinnedReceiptDigest, claims }
  5. Pass to qualifyLifecycleReceipt({
       mode: 'live',
       receiptBytes,
       pinnedReceiptDigest,
       claims,
       trustedAcceptance: {
         approvedReceiptDigest: <registry-approved adapted claim digest>,
         season, selectedPolicy, completedThroughWeek, canonicalWeight,
         ratingFingerprint: pin.approvedRatingFingerprint,
         lifecycleSourceSha: pin.approvedLifecycleProducerSha,
       },
       expectedRatingFingerprint: <capture export or pin>,
       ...
     })
  6. Fixture mode: hypothetical derived envelopes allowed; liveAccepted forced false
```

`captureProducerSha` remains on the capture envelope only.  
`bindingObserverSha` remains on the derived core / sidecar.  
`lifecycleProducerSha` remains the archive producer.

### 4.4 PR boundary

| Item | This design task | Later PR |
|------|------------------|----------|
| Design + fixture specs | ✅ | |
| Sidecar verify helpers + offline fixtures | Future implementation PR (still offline) | |
| Wire derived receipt into `qualifyLifecycleReceipt` / CLI | | Capture integration PR (after design approval + offline impl review) |
| Amend PR #244 fixture PASS scope | ❌ Not now | Only if separately authorized |

---

## 5. Enforceable metadata / provenance tests (replaces vague N6)

A pure helper **cannot** prove rows were read from a live database merely because metadata looks plausible. Tests must distinguish:

- **Structural validity** (schema, digests, recomputation consistency)  
- **Independently reviewed observed provenance** (registry pin / approved observation digest)

### 5.1 Explicit negative checks

| ID | Scenario | Required failure / outcome |
|----|----------|----------------------------|
| N6a | Sidecar missing required observation provenance block (`observationStartTime` / archive pins / observer SHA) | `observation_provenance_missing` |
| N6b | Sidecar bytes digest ≠ registry `approvedSidecarDigest` | `sidecar_digest_mismatch_vs_registry` |
| N6c | Observation content altered (e.g. `dataSource` or `updatedAt` changed) but structural self-hashes updated to match → without registry pin | Structural may pass; `liveQualifying=false`; with registry pin → `fingerprint_mismatch_vs_registry` or `sidecar_digest_mismatch` |
| N6d | Synthetic observation labeled `fixture_hypothetical` | May be structurally valid; **`liveAccepted` / `liveQualifying` always false** |
| N6e | Caller passes `trustedBinding: { ... }` without registry `pinProvenance` | `registry_pin_provenance_missing`; no bootstrap |
| N6f | Fabricated self-consistent snapshot claiming `archiveIntegrityVerified: true` while ZIP pin wrong | Archive recompute fails; ignore self-declared flag |

**Documented limit:** Self-contained verification detects pin/digest/recompute disagreements; it does **not** claim to detect every fabricated-but-self-consistent snapshot that also fools an external registry. Registry review remains human/process.

---

## 6. Revised sidecar schema (storage shape)

Declared fields are **evidence payloads**, not trusted decision inputs. Verifier recomputes outcomes.

```ts
interface MlCal1LifecycleBindingSidecarV1 {
  schemaVersion: 'ml-cal-1-lifecycle-binding-sidecar-v1';
  kind: 'lifecycle-binding-sidecar';
  mode: 'fixture_hypothetical' | 'binding_observation';

  acceptedArchive: {
    github: {
      workflowRunId: string;
      artifactId: string;
      artifactName: string;
      workflowRunCompletedAt: string | null;
      artifactCreatedAt: string | null;
      zipSha256: string;              // must match external pin when verified
      reportMemberPath: string;
      reportMemberSha256: string;
      reportByteCount: number;
    };
    lifecycleProducerSha: string;
    // Optional echoed claims for humans; verifier re-parses report bytes
    declaredSeason?: number;
    declaredCompletedThroughWeek?: number;
    declaredSelectedPolicy?: string;
    declaredCanonicalWeight?: number;
  };

  bindingObservation: {
    observationStartTime: string;
    observationEndTime: string;
    bindingSnapshotReferenceTime: string;
    dbTransactionTime: string | null;
    dbTransactionTimeUnavailableReason: string | null;
    bindingObserverSha: string;
    readMode: 'repeatable_read_readonly' | 'fixture_injected';
    season: number;
    modelVersion: 'v1';
    rows: MlCal1BindingObservedRatingRow[];
    rowCreatedAtMin: string;
    rowCreatedAtMax: string;
    rowUpdatedAtMin: string;
    rowUpdatedAtMax: string;
  };

  // Optional human-facing echoes — NEVER used as acceptance inputs
  declaredEcho?: {
    ratingFingerprint?: string;
    usableRowCount?: number;
    plannedNumericAgreementOk?: boolean;
    fullWeightEligible?: boolean;
    archiveIntegrityVerified?: boolean;
  };

  /** Hard constants for clarity in stored bytes */
  fingerprintComputedFromLaterReadback: true;
  readbackWasNotExportedAtCommit: true;
  sidecarSelfAccepted: false;

  /**
   * Optional human-facing lineage echo ONLY. Never proof.
   * Live qualification requires external MlCal1LifecycleBindingLineageAttestation (§1.4).
   * Do NOT use lineageEvidenceStatus: 'present' as a decision input.
   */
  lineageEcho?: {
    priorApprovedBindingDigest: string | null;
    note: string;
  };

  providerCalls: 0;
  businessDataWrites: 0;
}
```

**Lineage lives outside the sidecar** as `MlCal1LifecycleBindingLineageAttestation` bytes + registry pin (§1.4).

---

## 7. Verifier decision table

External inputs: archive ZIP bytes, report member bytes, sidecar bytes, `prospectiveTargetWeek`, optional registry pin, optional `now_ceiling`, mode.

| Step | Recomputed check | On failure |
|------|------------------|------------|
| A1 | ZIP digest == expected pin | fail closed |
| A2 | Member digest/bytes == pin; parse report | fail closed |
| A3 | execution + verification success flags | fail closed |
| A4 | cohort 138 unique; season/model; weight == `b1CanonicalWeight(week)` | fail closed |
| O1 | Observation timing order + archive precedence (§1.3) | fail closed |
| O2 | Row timestamp sanity; scope season/v1 | fail closed |
| O3 | Reconstruct → `exportRatingInput` → fingerprint | fail closed on throw/mismatch vs echo |
| N1 | 1e-9 vs `finalPowerRating` / games; cohort equality | numericOk=false; live blocked |
| Q1 | `fullWeightByPolicy && completedThroughWeek < prospectiveTargetWeek` | fullWeightEligible=false |
| L1 | External lineage attestation present; digests match; `checkedThroughTime` covers observation; `searchOutcome=none_found` (§1.4) | live blocked if missing/superseded/too-early |
| L2 | Sidecar `lineageEcho` / any self-declared “present” flag ignored for decisions | never grants live |
| T1 | If live path: registry pin provenance + all digest/claim matches (§2.6) | live blocked |
| T2 | mode==fixture_hypothetical ⇒ liveAccepted=false always | forced |
| D1 | If declaredEcho present, every echoed flag/value == recomputed | `declared_*_mismatch` |
| R1 | Derived envelope: `coreDigest === sha256(coreBytes)`; core contains no self `receiptDigest` | fail closed |
| R2 | Adapter: `claims.receiptDigest === sha256(receiptBytes)` with digest set only after hashing claim body | fail closed |

**Outputs (recomputed only):**

```ts
interface MlCal1LifecycleBindingVerifyResult {
  structuralConsistencyVerified: boolean;
  archiveIntegrityVerified: boolean;          // recomputed
  plannedNumericAgreementOk: boolean;         // recomputed
  ratingFingerprint: string;                  // recomputed
  usableRowCount: number;                     // recomputed
  fullWeightEligible: boolean;                // recomputed
  independentlyPinned: boolean;               // registry pin matched
  liveQualifying: boolean;                    // all of the above + lineage + full weight + pins
  liveAccepted: boolean;                      // === liveQualifying && mode!==fixture_hypothetical
  reasons: string[];
  notes: string[];
}
```

---

## 8. Fixture expectations

### 8.1 Negative (required)

| ID | Fixture intent | Expect |
|----|----------------|--------|
| N1 | Real Week 5 COMMIT pins (run `37336589699`, ZIP `b0177de0…`, member `c20b789c…`, producer `ee436b91…`) + later synthetic/observed projection | Archive integrity PASS; weight 0.75; `fullWeightEligible=false`; primary/live blocked |
| N2 | Self-declared `fullWeightEligible=true` / `archiveIntegrityVerified=true` on Week 5 bytes | Echo ignored; recomputed false; fail or non-qualifying |
| N3 | Wrong `prospectiveTargetWeek` (e.g. completedThroughWeek=6 but targetWeek=6) | `prospectiveOk=false` even if weight=1 |
| N4 | Missing observation provenance or observation predates artifact | fail closed |
| N5 | Registry pin digest ≠ sidecar bytes | `sidecar_digest_mismatch_vs_registry` |
| N6a–f | Metadata / synthetic trust cases (§5.1) | as specified |
| N7 | Changed raw metadata (`dataSource` / timestamps) vs approved fingerprint | registry mismatch / non-live |
| N8 | Decimal zero reconstruction (`'0'` raw) | usable zero via unchanged helpers |
| N9 | Fabricated synthetic trust object without registry provenance | no bootstrap |
| N10 | Numeric 1e-9 pass but lineage attestation unavailable | structural/numeric may pass; `liveQualifying=false` (`lineage_attestation_missing`) |
| N11 | Lineage attestation `searchOutcome=superseded` | `binding_invalidated_by_later_lifecycle` |
| N12 | Sidecar declares lineage “present” / echo only; no external attestation | `liveQualifying=false`; echo ignored |
| N13 | Attestation `checkedThroughTime` &lt; `bindingSnapshotReferenceTime` | `lineage_checked_through_too_early` |
| N14 | Derived core embeds `receiptDigest` equal to hash of bytes including that field | reject / construction forbidden (`self_referencing_digest`) |
| N15 | Envelope `coreDigest` ≠ `sha256(coreBytes)` | fail closed |
| N16 | Adapter builds claim body, hashes, then sets `receiptDigest`; tampering claim body without updating pin | capture verifier / pin mismatch |

### 8.2 Positive (offline hypothetical only)

| ID | Fixture intent | Expect |
|----|----------------|--------|
| P1 | Explicitly hypothetical Week 6 / weight 1 archive + observation + registry pin, `mode=fixture_hypothetical` | Structural + fullWeightEligible may be true; **`liveAccepted=false`** |
| P2 | Same as P1 but `mode=binding_observation` **only in offline tests with a test registry document** | May set `liveQualifying=true` inside the test harness; **not** authorization for production live capture |

No historical accepted receipt is rewritten to add a capture fingerprint. Full-weight success against **real** Week 6 evidence remains a future independent audit.

---

## 9. Week 5 accepted archive pins (integrity-positive / full-weight-negative)

| Item | COMMIT |
|------|--------|
| Run | `37336589699` |
| Artifact | `11356512878` |
| Producer SHA | `ee436b910177bbf2120b9ab6bf2551197d739129` |
| ZIP SHA-256 | `b0177de089237876c2e258fb97d84af3803ef7d1e7402cae853670ee8a6cd316` |
| Report member SHA-256 | `c20b789ce45b58362a23b2ab2a69184fda2a39377c99d58db6268376b79a2e1e` |
| Claims | season 2026, completedThroughWeek=5, policy `GLOBAL_BLEND_W3_W6`, canonicalWeight=0.75, 138 rows |

PREVIEW sibling (not primary qualification evidence): run `37335784708`, ZIP `85bb6049…`, member `13fd60a7…` — planned rows equal COMMIT; retained for parity fixtures only.

---

## 10. Holdings

- Offline implementation may ship helpers + fixtures only; **no** live observer / capture wiring in the binding PR.
- PR #244 fixture-only PASS intact; do not amend in the binding PR.
- PR #243 unregistered.
- Live research readiness **BLOCKED** pending genuine full-weight evidence + independent binding approval.
- Merge / live dispatch / calibration holds unchanged.
- Core V1 official; OA-3 failed validation; 2025 sealed.
- Green fixture tests are not independent production acceptance.

---

## 11. Review checklist mapping (items 1–5)

| Review item | Section(s) |
|-------------|------------|
| 1. Mandatory timing / revision | §1, §7 O1–O2, L1–L2, fixtures N4/N10–N13 |
| 2. Recompute; trust comparisons; fixture cannot liveAccept | §2, §5, §7, §8 |
| 3. `finalPowerRating` mapping; Decimal reconstruction | §3 |
| 4. Capture bridge; digest outside hashed bytes; adapter; later PR | §4 (esp. §4.2.1–4.2.3), §7 R1–R2, fixtures N14–N16 |
| 5. Enforceable provenance / N6 | §5, fixtures N6a–f |

### Follow-up design blockers addressed

| Blocker | Resolution |
|---------|------------|
| Self-referencing `captureClaim.receiptDigest` | Digest kept **outside** hashed core (`envelope.coreDigest`); capture adapter hashes claim body then sets `receiptDigest` (§4.2) |
| Self-declared `lineageEvidenceStatus: 'present'` | Removed as decision input; external `MlCal1LifecycleBindingLineageAttestation` with `checkedThroughTime` required; unavailable blocks live (§1.4) |
