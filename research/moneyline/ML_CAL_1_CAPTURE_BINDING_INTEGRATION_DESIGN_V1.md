# ML-CAL-1 Capture ↔ Lifecycle Binding Integration Design V1

**Status:** Design only (offline).  
**Date:** October 8, 2026 (America/Chicago).  
**Not:** capture code merge, live observer, workflow enablement, genuine full-weight evidence review, prospective registration, calibration, or production change.

## 0. Preconditions (independently accepted)

| Artifact | Identity | Scope of acceptance |
|----------|----------|---------------------|
| Binding sidecar offline (PR #245) | head `881c219d83c0250f4a60546e7f904e5fa49dd697` | Pure verify helpers, Week 5 integrity/full-weight-negative fixture, synthetic full-weight gates, derived receipt + adapter. **Not** live observation/approval. |
| Capture fixture-only (PR #244) | head `fc88bc705a0dac0597a068c7c929c28676f51f20` | Fixture planner/qualifier PASS. **Not** live capture. |
| Main / base | `c37b5d367a364398d479c52844466aa4fd3306c2` | Unchanged by this design. |
| Week 5 authentic archive | ZIP `b0177de0…` / member `c20b789c…` / run `37336589699` | Integrity-positive; weight 0.75; **full-weight-ineligible**. |

Live research readiness remains **BLOCKED**.

---

## 1. Purpose

Define the **offline** capture-integration seam so a later, separately authorized capture-code PR can:

1. Retrieve approvals only by independently reviewed digests (never caller-bootstrap).
2. Compare binding observation identity to the **actual capture-export fingerprint** (registry pin cannot substitute for recomputed export).
3. Keep three producer identities distinct end-to-end.
4. Retain fixture provenance so synthetic packages never export portable `liveAccepted`.
5. Separate **binding-window** lineage approval from **per-capture** runtime coverage of the capture’s actual as-of (`T_capture`) before final eligibility/publication.

This document does **not** authorize wiring, merge, or live enablement.

---

## 2. Dependency sequence (ordered gates)

Each gate requires independent review before the next is authorized.

**Separation rule:** approving the *retrieval / verification mechanism* is not the same as verifying a *specific capture’s* as-of lineage. Capture-specific lineage coverage is a **runtime** check after a capture exists (publication / final eligibility), not a pre-capture gate that invents a future window.

| Gate | Deliverable | Depends on | Explicitly does **not** include |
|------|-------------|------------|--------------------------------|
| **G0** | Binding offline ACCEPTED (done: PR #245) | — | Live observation, registry, merge |
| **G1** | This integration design ACCEPTED | G0 + PR #244 fixture semantics | Code changes to capture or binding |
| **G2** | Offline integration helpers + fixture tests (separate PR) | G1 | Live DB, workflow, prospective registration |
| **G3** | Capture-code PR wires adapter into `qualifyLifecycleReceipt` / CLI (**fixture path first**) | G2 + PR #244 still fixture-scoped or merged by separate authority | Live mode default-on; real capture enablement |
| **G4** | Genuine completed Week ≥ 6 archive + binding observation independently reviewed | G3 offline green | Auto liveAccepted from fixtures; capture enablement |
| **G5** | Reviewed **retrieval / pin / registry mechanism** (how anchors are loaded and compared) + binding-window lineage attestation for the **reviewed binding observation** (covers binding snapshot / observation end — **not** a future capture as-of) | G4 | Capture-specific lineage for a capture that does not yet exist; prospective registration; live enablement |
| **G6** | Prospective cohort/protocol registration (PR #243 path) authorized separately | G5 | Calibration evaluation; live capture |
| **G7** | Live observer / workflow enablement (if ever) — may produce captures | G6 + operator authority | Skipping prospective registration; treating pre-capture lineage as capture coverage |
| **G8** | **Per-capture runtime:** after a capture exists, verify lineage `checkedThroughTime` covers that capture’s actual `T_capture` (§6), compare fingerprints (§5), and compare `trustedAcceptance.approvedReceiptDigest` from **independently approved evidence** to the computed adapted digest (§4 / §9) **before** final eligibility / publication | G7 capture artifact + G5 mechanism | Self-assigning `approvedReceiptDigest` from the just-computed digest; publishing without capture-specific lineage |

**Order invariants:**

1. **Prospective registration (G6) precedes capture enablement (G7).**  
2. **Capture-specific lineage and final eligibility (G8) follow capture existence** — they cannot be “pre-approved” at G5 for a capture that has not run.  
3. G5 may approve *how* lineage attestations and registry anchors are retrieved and bound; G8 *applies* that mechanism to the concrete capture as-of.

**Merge of PR #245 or #244 is not implied by G1–G2.** Merge remains a separately authorized action.

---

## 3. Producer identity invariant

| Identity | Owner surface | Must equal |
|----------|---------------|------------|
| `lifecycleProducerSha` | Archive / `captureClaim.sourceSha` / `trustedAcceptance.lifecycleSourceSha` | COMMIT workflow producer |
| `bindingObserverSha` | Sidecar observation + derived core | Process that read ratings after COMMIT |
| `captureProducerSha` | Capture envelope / `qualifyLifecycleReceipt` `producerRepositorySha` only | Capture runner SHA |

**Forbidden:** requiring `captureProducerSha === lifecycleProducerSha` or substituting any one digest for another object (ZIP ≠ member ≠ sidecar ≠ attestation ≠ derived core ≠ adapted receipt).

---

## 4. Approval retrieval model (fail closed)

### 4.1 Inputs loaded by digest, not by trust flags

Offline and (later) live loaders must accept **bytes + independently supplied approval anchors**:

| Bytes | External approval anchor |
|-------|--------------------------|
| Registry document | `approvedRegistryDocumentDigest` |
| Lineage attestation | `approvedLineageAttestationDigest` |
| Lineage inventory | `approvedLineageInventorySha256` |
| Adapted capture receipt body | `trustedAcceptance.approvedReceiptDigest` |
| Derived envelope (recommended) | `approvedDerivedCoreDigest` |

Self-hashes inside a document **do not** grant review authority. Anchors come from a reviewed registry / operator pin store outside the artifact being verified.

### 4.2 Retrieval algorithm (design contract)

```text
1. Resolve registry document by approvedRegistryDocumentDigest (exact bytes).
2. Parse document; field-bind to pin; refuse empty/unrelated JSON.
3. Resolve lineage attestation by approvedLineageAttestationDigest.
4. verifyLifecycleBindingSidecar({ ...anchors, zip, member, sidecar... }).
5. Require liveQualifying === true AND fixtureProvenanceRetained === false
   for any path that may set capture liveAccepted.
6. Build derived envelope from verified facts (no self-digest in core).
7. adaptDerivedReceiptToCaptureLifecycleInput(envelope).
8. Load trustedAcceptance (including approvedReceiptDigest) from independently
   reviewed evidence — never set approvedReceiptDigest := adapted.pinnedReceiptDigest.
9. Require trustedAcceptance.approvedReceiptDigest === adapted.pinnedReceiptDigest
   (compare only).
10. Require expectedRatingFingerprint === adapted.claims.ratingFingerprint
    AND === pin.approvedRatingFingerprint
    AND === bundle.inputs.ratingFingerprint  (exact field; see §5 — not sha256(inputs.json)).
11. When a capture exists (G8): require lineage checkedThroughTime covers T_capture (§6.2).
12. qualifyLifecycleReceipt({ mode, receiptBytes, pinnedReceiptDigest, claims, trustedAcceptance, ... }).
```

Any missing anchor → fail closed (`*_approval_anchor_missing` / capture trust missing).

---

## 5. Capture-export fingerprint comparison

### 5.1 Exact field (do not confuse objects)

The capture rating identity compared here is **only**:

| Object | Exact field / computation | Role |
|--------|---------------------------|------|
| Capture planner output | `bundle.inputs.ratingFingerprint` | Result of `buildRatingFingerprint(ratingsByTeamId)` after `exportRatingInput` per team |
| Sealed member | Value of `ratingFingerprint` **inside** the JSON object written as `inputs.json` | Same string as `bundle.inputs.ratingFingerprint` when sealed without mutation |
| Capture qualifier input | `qualifyLifecycleReceipt` → `expectedRatingFingerprint` | Must equal that same string |
| Binding / pin / adapted claim | Binding recomputed fingerprint; `pin.approvedRatingFingerprint`; `adapted.claims.ratingFingerprint` | Must equal that same string |

**Different objects — never compare interchangeably:**

| Object | What it is | Not equal to |
|--------|------------|--------------|
| `sha256(inputs.json member bytes)` | Digest of the entire sealed member (HFA hash + `ratingsByTeamId` + `ratingFingerprint` serialization) | `ratingFingerprint` |
| `sha256Canonical(bundle.inputs)` without extracting the field | Hash of the whole inputs object | `ratingFingerprint` |
| Package / ZIP digests, sidecar digest, adapted `pinnedReceiptDigest` | Other artifacts | `ratingFingerprint` |

A registry pin **cannot** substitute for recomputing / reading `inputs.ratingFingerprint` (or the live equivalent before seal).

### 5.2 Rule

For live (and for offline integration fixtures that claim capture parity):

1. Binding verifier recomputes fingerprint via unchanged `exportRatingInput` / `buildRatingFingerprint` on observed rows.
2. Capture path independently obtains `captureRatingFingerprint = bundle.inputs.ratingFingerprint` (or the pre-seal variable of the same name from `buildRatingFingerprint`).
3. All of the following must be **identical hex strings** (same object class — rating fingerprint only):
   - binding recomputed fingerprint  
   - `pin.approvedRatingFingerprint`  
   - `adapted.claims.ratingFingerprint`  
   - `expectedRatingFingerprint` passed into `qualifyLifecycleReceipt`  
   - `bundle.inputs.ratingFingerprint` (and the `ratingFingerprint` field inside sealed `inputs.json` when present)

Mismatch → `fingerprint_mismatch_vs_capture_export` (or existing capture reason) and **no** liveAccepted.

### 5.3 Decimal / zero semantics

Preserve accepted capture + binding behavior: Decimal-like `'0'` remains usable; blank/NaN/nonfinite rejected; games exact; ratings 1e-9 vs `finalPowerRating`.

---

## 6. Lineage coverage: binding window vs capture as-of

### 6.1 Binding-window lineage (Gate G5 / binding verifier)

Binding already requires (and G5 may review attestations for):

`checkedThroughTime >= bindingSnapshotReferenceTime` (prefer `>= observationEndTime`).

This attests the binding observation / archive window — **not** a capture that has not been taken.

### 6.2 Capture-specific lineage (Gate G8 — runtime, after capture exists)

Let `T_capture` be the capture’s authoritative as-of for rating identity: capture envelope / planner `snapshotReferenceTime` (prediction reference — **not** market publication salvage, not `captureStartTime`).

**Only after** a concrete capture artifact exists, require:

```text
checkedThroughTime >= max(bindingSnapshotReferenceTime, observationEndTime, T_capture)
```

- Approving the retrieval mechanism at G5 does **not** satisfy this check for a future capture.  
- A new or extended lineage attestation (still digest-anchored per §4) may be required if the binding-window attestation’s `checkedThroughTime` is earlier than `T_capture`.  
- If `T_capture` is unavailable on a fixture path, fixture provenance must remain retained and `liveAccepted` forced false.

Missing coverage → `lineage_checked_through_too_early` / `lineage_does_not_cover_capture` and **block final eligibility / publication** (G8).

---

## 7. Fixture provenance retention

| Signal | Effect |
|--------|--------|
| `mode: fixture_hypothetical` | `liveAccepted=false` |
| `readMode: fixture_injected` | `liveAccepted=false` |
| `fixture-registry://` / `test-only://` registry ids | `fixtureProvenanceRetained=true` |
| Registry document `provenance: 'test-only'` | same |

**Portable live acceptance** requires all of:

- binding `liveAccepted` path (non-fixture provenance)  
- capture `mode: 'live'`  
- trustedAcceptance anchors match  
- fingerprint parity (§5)  
- lineage covers capture (§6)  

Offline integration tests may set binding `liveQualifying=true` with fixtures; exported receipts/results must still carry fixture provenance and must not be filed as production evidence.

---

## 8. Offline integration PR shape (Gate G2 — later)

**In scope (when authorized):**

- Thin orchestration helper, e.g. `verifyBindingThenQualifyCaptureLifecycle(...)`, pure, no DB.
- Fixture packages: Week 5 negative; synthetic Week 6 hypothetical (fixture provenance).
- Tests: approval-anchor missing/tamper; fingerprint mismatch vs capture export; lineage short of `T_capture`; fixture cannot liveAccept; adapter still consumed by PR #244 `qualifyLifecycleReceipt` with `liveAccepted=false`.

**Out of scope:**

- Amending PR #244 / #243 / #245 accepted heads without separate authority  
- Live DB observer, provider calls, workflow dispatch, merge  
- Relabeling Week 5 as full weight  
- Prospective registration / calibration  

**Shared helper note:** Until #244 and #245 land on main, G2 may continue the reviewed semantic mirror of `exportRatingInput` / `buildRatingFingerprint` **or** extract a shared module in the same offline PR with explicit parity tests against both accepted heads.

---

## 9. Capture-code PR shape (Gate G3 fixture wiring / G8 live eligibility — later)

Minimal wiring sketch (not authorized now). **Critical:** `trustedAcceptance.approvedReceiptDigest` is loaded from **independently approved evidence** (registry / reviewed pin store). It is **never** assigned from `adapted.pinnedReceiptDigest` in the same step that computes that digest (that would recreate self-approved trust). §4 step 8 remains: *compare* the external approval to the computed digest.

```text
if binding_path_enabled:
  # --- Approval retrieval (external anchors only) ---
  load registryDocumentBytes by approvedRegistryDocumentDigest
  load lineageAttestationBytes by approvedLineageAttestationDigest
  load trustedAcceptance from independently reviewed evidence
       including trustedAcceptance.approvedReceiptDigest  # NOT from adapted.*
  load approvedDerivedCoreDigest when required by registry

  bindingResult = verifyLifecycleBindingSidecar({ ...external anchors... })
  if !bindingResult.liveQualifying || bindingResult.fixtureProvenanceRetained:
    block live primary; may still emit fixture_hypothetical capture

  envelope = buildDerivedReceiptEnvelope(...)
  # Optional: require sha256(envelope.coreBytes) === approvedDerivedCoreDigest

  adapted = adaptDerivedReceiptToCaptureLifecycleInput(envelope)

  # Compare — never self-assign:
  require trustedAcceptance.approvedReceiptDigest === adapted.pinnedReceiptDigest
  require adapted.claims.ratingFingerprint === bundle.inputs.ratingFingerprint
  require adapted.claims.ratingFingerprint === trustedAcceptance.ratingFingerprint
  require expectedRatingFingerprint === bundle.inputs.ratingFingerprint

  # Capture-specific lineage only when T_capture is known (G8 / publication path):
  if capture_exists:
    require lineage.checkedThroughTime >= max(bindingSnap, obsEnd, T_capture)
  else:
    # fixture / pre-capture paths cannot claim capture-window lineage
    retain fixture provenance; liveAccepted forced false

  lifecycle = qualifyLifecycleReceipt({
    mode: captureMode,
    receiptBytes: adapted.receiptBytes,
    pinnedReceiptDigest: adapted.pinnedReceiptDigest,
    claims: adapted.claims,
    trustedAcceptance,  # approvedReceiptDigest already from external evidence
    expectedRatingFingerprint: bundle.inputs.ratingFingerprint,
    captureProducerSha,
    ...
  })
```

CLI / planner remain fail-closed when anchors or genuine full-weight evidence are absent.

---

## 10. Review checklist for G1 acceptance of this design

- [ ] Approval retrieval is digest-anchored; no self-bootstrap  
- [ ] `trustedAcceptance.approvedReceiptDigest` comes from independent evidence and is **compared** to `adapted.pinnedReceiptDigest` (never copied from it in §9)  
- [ ] Exact fingerprint field is `inputs.ratingFingerprint` / `bundle.inputs.ratingFingerprint`; not `sha256(inputs.json)`  
- [ ] Capture-export fingerprint compared; pin alone insufficient  
- [ ] Three producer identities preserved  
- [ ] Fixture provenance retained; no portable liveAccepted from synthetics  
- [ ] Binding-window lineage (G5) separated from capture-as-of lineage (G8 runtime)  
- [ ] Prospective registration (G6) precedes capture enablement (G7); capture-specific lineage precedes final eligibility/publication (G8)  
- [ ] Dependency sequence keeps merge / live / prospective / calibration as later gates  
- [ ] Week 5 authentic pins remain full-weight-negative  

---

## 11. Holdings

- PR #245 offline ACCEPTED at `881c219…`; do not amend for this design.  
- PR #244 fixture-only PASS intact at `fc88bc7…`.  
- PR #243 unregistered.  
- No merge, live dispatch, DB observer, provider call, business write, calibration, or 2025 reopening.  
- Genuine Week ≥ 6 evidence + reviewed registry/lineage remain required before live readiness.  
- Green tests (when G2 lands) will not constitute independent production acceptance.
