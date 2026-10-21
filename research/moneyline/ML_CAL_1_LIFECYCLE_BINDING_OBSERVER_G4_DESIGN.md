# ML-CAL-1 G4 — Read-Only Lifecycle Binding Observer Design V1

**Status:** Design only (offline). F1 / F2 / F4 **CLOSED** on prior revision; this revision applies the remaining **F3 timing** correction and §5 producer-role wording clarification. Not authorized for implementation, DB connection, provider calls, workflow dispatch, merge, calibration, or 2025 access.  
**Date:** October 8, 2026 (America/Chicago).  
**Revision:** F3 timing bounds + mandatory archive chronology (post–F1/F2/F4 closed); §5 role-equality wording.  
**Accepted G3 head (design base):** `955cb46bad0ccca40d073a10d2c0aea3adf236a2`  
**Authoring worktree HEAD (this repair):** `955cb46bad0ccca40d073a10d2c0aea3adf236a2` (recorded; unchanged).  
**Schema / contract lineage:** `ml-cal-1-lifecycle-binding-sidecar-v1` + G1–G3 integration designs; this document does **not** amend accepted PRs #244 / #245 / #246 / #247 / #248 or main.

**Related (prior, independently reviewed where accepted):**

| Artifact | Role | Notes |
|----------|------|-------|
| Binding sidecar design + offline PR #245 | Verify helpers, Week 5 negative, synthetic full-weight gates | Head `881c219d83c0250f4a60546e7f904e5fa49dd697` — **not** live observation |
| Capture fixture PR #244 | Capture planner/qualifier fixture PASS | Head `fc88bc705a0dac0597a068c7c929c28676f51f20` — **not** live capture |
| Integration design (G1) | Capture ↔ binding seam, gates G0–G8 | Offline design |
| G2 offline helpers | `verifyBindingThenQualifyCaptureLifecycle` + fixtures | Pure; no DB |
| G3 fixture capture wiring (PR #248) | Fixture path + F1-A full G2 replay / correspondence | Tip `955cb46…` — **fixture-scoped**; not live enablement |
| Binding verifier (accepted offline) | `prospectiveOk = completedThroughWeek < prospectiveTargetWeek`; rating eps `1e-9`; games **exact integer** | `apps/jobs/lib/ml-cal-1-lifecycle-binding.ts` |

Live research readiness remains **BLOCKED**.

**Noted dependency wording (not amended):** Sidecar design §2.4 text still says `abs(games - G) ≤ 1e-9`. Accepted binding verifier code uses **exact integer equality** for games (`games !== plannedGames` → `games_mismatch`). This G4 design follows the **accepted verifier + F2 review**. No accepted code or prior design PR is changed here.

---

## 0. Purpose and non-goals

### Purpose

Define the **Gate G4** deliverable: a **read-only** lifecycle binding observer that, **only after** independent review of this design, fixture-green implementation, and **explicit one-off execution authority**, may observe `TeamSeasonRating` rows for season **2026** / model **`v1`** against a **genuine completed Week ≥ 6** Core V1 lifecycle COMMIT archive and **emit an unapproved, self-contained observation package** for later independent review.

G4 answers: *how* a genuine post–Week-5 archive is bound to a later read-only rating observation, with parity to accepted capture/binding export semantics — **without** claiming retrieval/registry acceptance (G5), prospective registration (G6), or prospective capture/workflow enablement (G7).

### Non-goals (explicit)

- Implementation, CI wiring, or merge of an observer binary/workflow.
- Any DATABASE_URL / DIRECT_URL connection, Prisma live session, or provider call in this design task.
- Manufacturing registry approval, lineage attestation coverage, or “future as-of” lineage for a capture that does not exist.
- Claiming `prospectiveOk` / `fullWeightEligible` without an independently approved prospective target (G6 owns registration).
- Relabeling Week 5 / weight 0.75 as Week ≥ 6 / weight 1.00.
- Amending accepted PR heads (#244–#248) or reopening 2025.
- Calibration evaluation, prospective cohort registration (G6), or default-on / scheduled live observer enablement (G7).
- Capture-specific lineage for a future `T_capture` (that remains **G8**, after a capture exists).
- Deployed pooler isolation preflight (separately authorized later; not now).

---

## 1. Gate position and three distinct outcomes (F4)

| Gate | Deliverable | This design |
|------|-------------|-------------|
| **G3** | Capture-code fixture wiring + independent acceptance of fixture path | **Prerequisite tip:** `955cb46…` |
| **G4** | Genuine Week ≥ 6 COMMIT archive prerequisites + **read-only observer design** + fixture tests **before** any live read; **evidence emission** of an unapproved observation package when separately authorized | **This document** |
| **G5** | Reviewed **retrieval / pin / registry mechanism** + binding-window lineage attestation for the **reviewed binding observation** | **Later** |
| **G6** | Prospective cohort/protocol registration | **Later** |
| **G7** | Prospective capture / workflow enablement (if ever) | **Later** — distinct from a one-off G4 observation |
| **G8** | Per-capture runtime lineage + fingerprint + approved receipt compare before publication | **Later** (requires capture existence) |

### 1.1 Three-stage outcomes (do not collapse)

| Stage | Required / allowed |
|-------|-------------------|
| **Before a G4 read** | Accepted G4 design; fixture-green observer implementation; **explicit one-off execution authority**; genuine full-weight-by-policy archive + independently reviewed archive pins; executable observer identity (`bindingObserverSha`); verified read-only transaction constraints (§3) |
| **G4 evidence emission** | Retain a **self-contained, unapproved** observation package for independent review. **No** portable `liveAccepted`, registry approval, prospective eligibility claim, or manufactured lineage. Missing G5 sidecar approval / lineage **does not** block creation of raw observation bytes |
| **G5 / G6 / G7 / G8** | Independent approval retrieval and binding-window lineage; prospective registration; prospective capture/workflow enablement; per-capture checks — each remains its own gate |

**Order invariants:**

1. Approving this G4 *observer design* does **not** authorize live DB observation.  
2. Emitting a G4 observation package does **not** approve G5 retrieval/registry, G6 registration, or G7 enablement.  
3. Missing later sidecar approval or lineage blocks **qualification/promotion**, not raw evidence creation under separate one-off authority.  
4. Invalid archive / scope / transaction still **aborts** the read.  
5. No operator-supplied trust object bootstraps acceptance.  
6. Fixture / synthetic packages retain fixture provenance and **cannot** export portable `liveAccepted`.

---

## 2. Genuine completed-Week-6-or-later COMMIT archive prerequisites

### 2.1 Authoritative report schema mapping (F2)

Authentic retained Week 5 COMMIT report (schema exemplar; still **full-weight-ineligible**) proves the planned-row and verification shape. **Do not populate absent archive fields.**

**Planned row fields present:**

```text
teamId, candidateA, canonicalRating, canonicalWeight, finalPowerRating, games
```

**Verification object shape:**

```text
{ ok: true, reasons: [], afterRows: 138, verifiedTeams: 138 }
```

| Check | Authoritative fields |
|-------|----------------------|
| Model | `report.modelVersion` (must be `'v1'`) **and** each **observed** row’s `modelVersion === 'v1'`. Planned archive rows do **not** carry `modelVersion` |
| Cohort | Unique `report.rows[].teamId` set equals unique observed `teamId` set; both exactly **138**; no duplicates |
| Verification | `verification.ok === true`; empty valid `reasons`; `afterRows === 138`; `verifiedTeams === 138` |
| Numeric targets | `rows[].finalPowerRating` for **both** observed rating scalars (`powerRating` / `rating`); `rows[].games` for games |
| COMMIT | `execution.commitSucceeded === true`; `execution.postWriteVerificationSucceeded === true`; established producer readiness / pin checks |

If a genuine future artifact has a different schema, review an **explicit versioned mapping** before use. Week 5 remains the negative / schema exemplar only.

### 2.2 What counts as a G4-eligible archive (integrity + full-weight-by-policy)

A G4 candidate archive is a **genuine** Core V1 lifecycle **COMMIT** artifact (ZIP + single JSON report member) that independently satisfies **all** of:

| Requirement | Fail-closed if |
|-------------|----------------|
| `execution.commitSucceeded === true` | PREVIEW-only, failed COMMIT, or flag absent/false |
| `execution.postWriteVerificationSucceeded === true` | Post-write verification failed / missing |
| `verification.ok === true`, empty valid `reasons`, `afterRows === 138`, `verifiedTeams === 138` | Verification incomplete or inconsistent |
| `report.season === 2026` | Any other season (including 2025) |
| `report.modelVersion === 'v1'` | Report model drift |
| `completedThroughWeek >= 6` (integer) | Week ≤ 5 (incl. accepted Week 5 integrity archive) |
| `selectedPolicy === 'GLOBAL_BLEND_W3_W6'` | Policy drift |
| Recomputed `b1CanonicalWeight(completedThroughWeek) === 1` and equals `report.canonicalWeight` | Weight ≠ 1 or report/recompute mismatch |
| Planned cohort = **exactly 138** unique `report.rows[].teamId`s; no duplicates | Count/set mismatch |
| External archive pins available: `expectedZipSha256`, `expectedReportMemberSha256`, `expectedLifecycleProducerSha`, workflow run / artifact metadata | Any pin missing or digest mismatch |
| **Both** `workflowRunCompletedAt` and `artifactCreatedAt` present and parseable (accepted verifier: missing either → `archive_chronology_missing`) | Missing archive chronology **blocks the G4 read** |
| Both archive times ≤ `observationStartTime` and ≤ `nowCeiling` | `observation_predates_archive` / `archive_time_after_ceiling` |

**Recomputed full-weight-by-policy fact (always reportable when archive parses):**

```text
fullWeightByPolicy = (completedThroughWeek >= 6) && (recomputedWeight === 1)
```

This fact alone is **not** prospective qualification and **not** `fullWeightEligible`.

### 2.3 Prospective comparison (F1) — polarity matches accepted verifier

Accepted binding verifier:

```text
prospectiveOk = (completedThroughWeek < prospectiveTargetWeek)
fullWeightEligible = fullWeightByPolicy && prospectiveOk && archiveOk && observationOk && numericOk
  (+ lineage / trust gates on live qualification paths)
```

| completedThroughWeek | prospectiveTargetWeek | prospectiveOk |
|----------------------|-----------------------|---------------|
| 6 | 7 | **PASS** |
| 7 | 7 | **FAIL** |
| 8 | 7 | **FAIL** |

**G4 production rule:** Do **not** choose or invent a production prospective target week. With **no** approved target:

- Report `fullWeightByPolicy` (and other integrity/numeric facts) separately.  
- Do **not** claim `prospectiveOk` or `fullWeightEligible`.  
- G6 owns registration of any production target.

Fixture packages may supply **explicit fixture-only** targets to exercise the three comparisons above and a **missing-target** path (§8).

### 2.4 Explicitly ineligible / negative evidence

| Artifact | Status for G4 |
|----------|---------------|
| Week 5 COMMIT run `37336589699`, ZIP `b0177de0…`, member `c20b789c…`, producer `ee436b91…`, weight **0.75** | Integrity-positive / **full-weight-ineligible**; schema exemplar; never a G4 qualifying archive |
| PREVIEW siblings | Not COMMIT qualification evidence |
| Synthetic / `fixture_hypothetical` Week ≥ 6 packages | May exercise structural/`fullWeightByPolicy` offline; **`liveAccepted` forced false**; not production G4 evidence |
| `completedThroughWeek >= prospectiveTargetWeek` **when a target is supplied** | `prospectiveOk=false` (e.g. 7/7, 8/7) even if `fullWeightByPolicy` |

### 2.5 Archive immutability

- ZIP bytes and report member bytes are **read-only evidence**.  
- Observer **must not** rewrite COMMIT artifacts, embed capture fingerprints into archives, mutate report rows, or invent absent planned-row fields.  
- Binding observation is a **later sibling** sidecar package referencing archive digests by pin.

### 2.6 Prerequisites before a separately authorized G4 read (not G7)

1. Independent review accepts this G4 design (post–F1–F4).  
2. Implementation (separate PR, when authorized) is **fixture-green** per §8.  
3. Explicit **one-off** execution authority (Bobby authorizes execution; independent review before approved pins — §12 U5/U8).  
4. Operator supplies a genuine Week ≥ 6 COMMIT archive with independently reviewed pins — identity checked offline against digests **before** DB read.  
5. Executable observer identity and verified TX constraints (§3) ready.  
6. G5/G6/G7 remain unauthorized; no registry self-approval; no default-on workflow.  
7. If archive is missing, Week ≤ 5, weight ≠ 1, cohort/verification invalid, pins incomplete, or TX contract cannot be verified → **abort**; no observation session.

---

## 3. Exact allowlisted 2026/v1 projection and verifiable read-only transaction (F3)

### 3.1 Model and filter (hard scope)

| Constraint | Value |
|------------|--------|
| Business table | `TeamSeasonRating` only for the rating observation |
| `season` | `2026` exactly (must equal `report.season`) |
| `modelVersion` | `'v1'` exactly |
| Row set | All rows matching season+v1 for cohort check (expect 138); no silent subset |

No other seasons, model versions, relations, other business tables, or extrapolated rows. No 2025 read path.

### 3.2 Exact scalar allowlist (nine approved columns)

Projection **must** match `ML_CAL_1_SELECT_ALLOWLIST.teamSeasonRating.scalars` exactly:

```text
season
teamId
modelVersion
powerRating
rating
games
dataSource
createdAt
updatedAt
```

`relations: {}`. No mutation APIs, DDL, write probes, or providers.

**Documented exception (same transaction only):** a narrowly allowlisted **server-metadata** query (§3.3) that is **not** permission to expand the business-table projection.

### 3.3 Intended PostgreSQL / Prisma transaction contract

`readMode: 'repeatable_read_readonly'` is a **sidecar declaration**, not isolation proof. The intended live contract is:

1. **Bounded interactive transaction** with `Prisma.TransactionIsolationLevel.RepeatableRead`.  
2. Inside that transaction, **before the first business SELECT:** execute `SET TRANSACTION READ ONLY`.  
   - **No** session-level read-only substitute through a pooler.  
3. **Same transaction client:** run a narrowly allowlisted server-metadata query that verifies and retains:
   - `transaction_isolation = 'repeatable read'`
   - `transaction_read_only = 'on'`
   - `transaction_timestamp()` (source of mandatory `dbTransactionTime` on this path)
   - server-clock diagnostics (retained as evidence; see §3.5)  
4. **Same transaction client:** `SELECT` the nine approved `TeamSeasonRating` columns with mandatory `season = 2026` and `modelVersion = 'v1'` predicates.  
5. Commit/end the transaction; confirm `businessDataWrites = 0`, `providerCalls = 0`.

**Abort (fail closed; do not emit a live observation package)** if:

- Wrong isolation or read-only settings  
- Metadata query missing / unverifiable  
- Timeout or lost transaction  
- Allowlist / predicate violation  
- Any write/DDL/provider attempt  

**Retries:** Never combine rows from separate attempts. Any allowed retry starts a **new complete attempt** with **new** timing and identity evidence.

**Official references (for implementers / reviewers):** PostgreSQL `SET TRANSACTION`, transaction isolation, date/time functions; Prisma v6 interactive transactions; Prisma PgBouncer notes.

### 3.4 Fixture vs live `dbTransactionTime`

| Path | `dbTransactionTime` |
|------|---------------------|
| Intended live PostgreSQL path (§3.3) | **Mandatory** — from `transaction_timestamp()` in the verified metadata query |
| Fixtures (`readMode: 'fixture_injected'`) | May be null with explicit fixture reason |
| Separately reviewed unsupported-engine exception | Null + reason only under that reviewed exception — **not** a silent live bypass |

### 3.5 Clock domains and `bindingSnapshotReferenceTime`

| Clock / field | Domain | Role |
|---------------|--------|------|
| `observationStartTime` / `observationEndTime` | Observer **host** wall clock | Session bounds — start **before** TX open; end **after** attempt completes (§9) |
| `dbTransactionTime` | **Database** `transaction_timestamp()` | Mandatory on live PG path |
| Server-clock diagnostics | Database server | Retained evidence; explain failures only |
| `bindingSnapshotReferenceTime` | Observer host wall clock, stamped **after** rating SELECT completes | Accepted **observation reference** (binding as-of) |
| Row `createdAt` / `updatedAt` | Values as stored/returned for observed rows | Cohort timing; must parse; per-row `createdAt ≤ updatedAt` |
| `workflowRunCompletedAt` / `artifactCreatedAt` | Archive / Actions metadata | **Required** chronology inputs (not optional); never substitute for row `updatedAt` |

**Validation rules (align with accepted offline binding verifier; no waivers):**

For the intended live PostgreSQL path, retain the original host and database timestamps and diagnostics. Require `observationStartTime ≤ dbTransactionTime ≤ observationEndTime` **unconditionally**, as the accepted binding verifier does when `dbTransactionTime` is non-null. If the timestamps cannot be validated, or the inequality fails, **fail closed**; do not omit the check or alter timestamps. Require **both** `workflowRunCompletedAt` and `artifactCreatedAt` to be present, parseable, at or before `observationStartTime`, and at or before `nowCeiling`. Missing archive chronology **blocks the G4 read**. Clock-domain diagnostics never override, waive, clamp, offset-correct, or bypass these accepted timing checks.

Additional ordering (unchanged intent):

1. `observationStartTime ≤ bindingSnapshotReferenceTime ≤ observationEndTime`.  
2. Observation and binding snapshot times ≤ `nowCeiling` (`observation_time_after_ceiling` if violated).  
3. No row timestamp `> nowCeiling`.  
4. `rowUpdatedAtMax ≤ bindingSnapshotReferenceTime` and `rowCreatedAtMax ≤ bindingSnapshotReferenceTime`.  
5. Retain host and server clock evidence even when they disagree; disagreement is diagnostic evidence, **not** auto-repair and **not** a successful observer sidecar.  
6. A separate diagnostic failure receipt may retain original evidence of a failed attempt, but it **must not** be presented as a successful observer sidecar.

### 3.6 MVCC snapshot limitation (preserve later gates)

PostgreSQL **Repeatable Read** fixes its MVCC snapshot at the **first non-transaction-control statement** in the transaction. Under this contract that may be the **metadata query**, which can precede the business SELECT.

Therefore:

- `bindingSnapshotReferenceTime` (after SELECT completion) remains the accepted **observation reference**.  
- SELECT completion is **not** the instant the MVCC snapshot was acquired.  
- This contract does **not** prove absence of later rating revisions after the snapshot.  
- Later **lineage** and **fingerprint** gates (G5+ / binding verifier) remain mandatory for qualification; G4 must not claim revision-proof from TX isolation alone.

### 3.7 Fixture mocks vs pooler preflight

Fixture mocks prove **adapter sequencing** and fail-closed behavior only — **not** deployed pooler compatibility. Actual connection/isolation compatibility remains **unverified** until a **separately authorized** read-only preflight. **No such preflight is authorized now.**

---

## 4. Raw Decimal preservation, cohort validation, observation timestamps, fingerprint parity

### 4.1 Raw Decimal / text preservation and numeric agreement (F2)

| Rule | Detail |
|------|--------|
| Storage | Persist `powerRatingRaw` / `ratingRaw` as **exact Decimal/text** as read — never pre-coerce to JS `number` for sidecar storage |
| Reconstruction | `reconstructRawRatingRow` → Decimal-like `{ toString: () => raw }` so string `'0'` remains truthy (not numeric `0`) |
| Export path | **Unchanged** `exportRatingInput` / `buildRatingFingerprint` only |
| Forbidden | `Number(raw)` before export; inventing `dataSource`; blank/NaN/nonfinite treated usable; replacing null with `0` |
| Ratings vs `finalPowerRating` | `abs(power - finalPowerRating) ≤ 1e-9` and `abs(rating - finalPowerRating) ≤ 1e-9` |
| Games vs `rows[].games` | **Exact integer equality** (`games === plannedGames`); **not** 1e-9 tolerance |

### 4.2 Cohort validation

1. Observed unique `teamId` set === planned unique set from `report.rows[].teamId`.  
2. Both sets size === **138**.  
3. Every **observed** row `season === report.season` and `modelVersion === 'v1'` (and equals `report.modelVersion`).  
4. No duplicate `teamId`s after read.  

Do **not** require `modelVersion` on planned archive rows (absent in authentic schema).

Mismatch → `binding_cohort_mismatch` / set reasons; blocks qualification paths; still may retain structural failure evidence per fail-closed rules — live read aborts if cohort cannot be completed under TX contract.

### 4.3 Observation timestamps

Required on every sidecar (including fixtures): `observationStartTime`, `observationEndTime`, `bindingSnapshotReferenceTime`, `dbTransactionTime` (+ unavailable reason when null on fixture/exception paths), `rowCreatedAtMin/Max`, `rowUpdatedAtMin/Max`, and **both** `workflowRunCompletedAt` and `artifactCreatedAt` (mandatory archive chronology — missing either fails closed). Ordering per §3.5 and accepted binding verifier O1/O2.

### 4.4 Fingerprint parity with accepted capture/binding exports

```text
for each observed season/v1 row:
  reconstructRawRatingRow → exportRatingInput → ratingsByTeamId map
ratingFingerprint = buildRatingFingerprint(ratingsByTeamId)
```

| Surface | Field |
|---------|--------|
| Binding recompute | Verifier output `ratingFingerprint` |
| Sidecar echo (non-authoritative) | Must match recompute or `declared_*_mismatch` |
| Future registry pin (G5) | `approvedRatingFingerprint` — **compare only**; not manufactured in G4 |
| Capture export (when capture exists) | `bundle.inputs.ratingFingerprint` — **not** `sha256(inputs.json)` |
| Adapted derived claim | `adapted.claims.ratingFingerprint` |

ZIP / member / sidecar / adapted receipt digests are **different objects**. Numeric agreement ≠ fingerprint identity ≠ lineage.

---

## 5. Separate lifecycle producer, observer, and capture identities

| Identity | Owner surface | Must equal |
|----------|---------------|------------|
| `lifecycleProducerSha` | Archive / report provenance / later `captureClaim.sourceSha` | COMMIT workflow producer SHA of the **accepted archive** |
| `bindingObserverSha` | Sidecar `bindingObservation.bindingObserverSha` + derived core | Repo SHA of the process that performed the rating readback |
| `captureProducerSha` | Capture envelope / `qualifyLifecycleReceipt` `producerRepositorySha` only | Capture runner SHA when a capture exists — **not** set by G4 |

These are **independent roles**. Forbid **substituting** one role for another (e.g. treating observer SHA as lifecycle producer, or writing `captureProducerSha` into the binding sidecar as the observer). Forbid imposing a rule that any two role fields **must** be equal. Independent roles do **not** require unequal SHA values: if the same reviewed commit legitimately performs more than one role, identical hex strings may appear in more than one field. A distinct-SHA fixture (e.g. G4-P3) is an **example** that roles are tracked separately — **not** a universal inequality gate.

Also forbid substituting digest **objects** across kinds: ZIP ≠ member ≠ sidecar ≠ attestation ≠ inventory ≠ derived core ≠ adapted receipt.

G4 packages record **`lifecycleProducerSha` + `bindingObserverSha` only**.

---

## 6. Retained evidence bytes and independently supplied approval anchors

### 6.1 G4 package contents (self-contained, unapproved)

Retain exact bytes under a **local manifest package** (U4):

| Bytes | Role |
|-------|------|
| Archive ZIP | Immutable COMMIT artifact |
| Report member JSON | Single member extracted/verified |
| Sidecar JSON | Observation + timing + raw rows (`mode: 'binding_observation'` for genuine live reads; fixtures: `fixture_hypothetical` / `fixture_injected`) |
| Observer run metadata | Observer SHA, timing, readMode declaration, allowlist echo, TX metadata diagnostics, zero writes/providers |
| Manifest | Safe capture/observation ID, digests of all members, atomic seal, **no overwrite**, **no credentials** |

Durable review destination may be resolved before execution; package itself must remain self-contained for review. Digests are recorded for later pin comparison. **Self-hashes do not grant review authority.**

### 6.2 Independently supplied approval anchors (G5+; not observer-minted)

Anchors are loaded **by digest** from an independently reviewed registry / operator pin store **outside** the artifact. G4 **emits** bytes; G5+ **approves** by external anchors.

| Bytes | External approval anchor |
|-------|--------------------------|
| Registry document | `approvedRegistryDocumentDigest` |
| Lineage attestation bytes | `approvedLineageAttestationDigest` |
| Lineage inventory bytes | `approvedLineageInventorySha256` |
| Sidecar file | `approvedSidecarDigest` (when reviewed) |
| Archive ZIP / member / producer | `approvedZipSha256` / `approvedReportMemberSha256` / `approvedLifecycleProducerSha` |
| Observer identity | `approvedBindingObserverSha` |
| Rating fingerprint | `approvedRatingFingerprint` |
| Adapted capture receipt body (later) | `trustedAcceptance.approvedReceiptDigest` |
| Derived envelope (recommended later) | `approvedDerivedCoreDigest` |

**G4 observer must never:** self-assign `approvedReceiptDigest` from a just-computed digest; embed self-declared lineage “present” as proof; invent future-capture `checkedThroughTime`; treat fixture registry ids as production approval; require G5 objects to exist before emitting raw observation bytes.

Missing anchors on a path that claims **live qualification / promotion** → fail closed. G4 **evidence emission** does not require those anchors to exist yet (§1.1).

### 6.3 What G4 may claim vs defer

| Claim | G4 |
|-------|----|
| Archive digests match retained ZIP/member bytes | Allowed when recomputed |
| Observation consistency / fingerprint recompute / `fullWeightByPolicy` | Allowed as recomputed facts |
| `prospectiveOk` / `fullWeightEligible` without approved target | **Forbidden** |
| Registry / lineage acceptance | **Deferred to G5** |
| Prospective registration | **Deferred to G6** |
| Prospective capture/workflow enablement | **Deferred to G7** |
| Portable `liveAccepted` | **Forbidden** from G4 emission |

---

## 7. Fail-closed behavior

### 7.0 Scope of abort vs qualification block (F4)

| Class | Effect |
|-------|--------|
| Invalid archive / scope / allowlist / TX contract / lost TX / write attempt | **Abort read** — no live observation package |
| Missing/unparseable archive chronology (`workflowRunCompletedAt` or `artifactCreatedAt`) | **Abort G4 read** — `archive_chronology_missing`; no successful observer sidecar |
| Live-path `dbTransactionTime` missing, unparseable, or outside `[observationStartTime, observationEndTime]` | **Fail closed** — `observation_time_order_invalid` / `db_transaction_time_invalid`; diagnostics do not waive |
| Unverifiable clock comparability / attempt to clamp or offset-correct timestamps | **Fail closed**; optional diagnostic failure receipt only — never a successful sidecar |
| Missing G5 sidecar approval / lineage anchors | Blocks **qualification/promotion**; does **not** automatically forbid separately authorized **raw G4 evidence emission** |
| Operator-supplied trust object without registry provenance | Never bootstraps acceptance |

### 7.1 Missing or full-weight-ineligible evidence

| Condition | Outcome |
|-----------|---------|
| No genuine Week ≥ 6 COMMIT archive / pins incomplete | Abort read |
| Week ≤ 5 or weight ≠ 1 / recomputed weight ≠ 1 | `fullWeightByPolicy=false`; Week 5 negative exemplar |
| COMMIT/post-write/verification shape fails §2.1 | Archive integrity fail / abort |
| No approved prospective target | Do not claim `prospectiveOk` or `fullWeightEligible`; may still emit unapproved package if one-off authority + integrity allow |
| Fixture provenance retained | `liveAccepted=false` always |
| Approval anchors missing on **qualification** path | `*_approval_anchor_missing`; no bootstrap |

### 7.2 Conflicting lineage (qualification path; digest objects are distinct) (F4)

Compare **separate** objects — do **not** require attestation digest === sidecar digest:

| Check | Compare |
|-------|---------|
| Attestation bytes authenticity | `sha256(lineageAttestationBytes) === approvedLineageAttestationDigest` |
| Attestation covers this sidecar | `attestation.approvedSidecarDigest === sha256(sidecarBytes)` |
| Inventory bytes authenticity | `sha256(lineageInventoryBytes) === approvedLineageInventorySha256` |

| Condition | Reason (stable) |
|-----------|-----------------|
| External lineage attestation absent on qualification path | `lineage_attestation_missing` / `lineage_revision_evidence_unavailable` |
| Any of the three digest checks above fail | Corresponding digest mismatch reason |
| `searchOutcome === 'superseded'` **or** nonempty `supersedingArtifacts` | `binding_invalidated_by_later_lifecycle` |
| `checkedThroughTime < bindingSnapshotReferenceTime` (prefer also vs `observationEndTime`) | `lineage_checked_through_too_early` |
| Sidecar self-declared lineage “present” without external attestation | Echo ignored; qualification blocked |
| Observed `updatedAt` set conflicts with prior **approved** binding observation | `binding_invalidated_by_row_revision` |
| Unknown / missing lineage | Never qualifies |

**G4 must not** mint lineage attestations or future-capture coverage. Binding-window attestation is a **G5** concern covering observation end / binding snapshot only.

### 7.3 Changed ratings / fingerprint / cohort / numeric drift

| Condition | Reason |
|-----------|--------|
| Recomputed fingerprint ≠ declared echo | `declared_*_mismatch` |
| Fingerprint ≠ externally approved fingerprint (when pin present) | `binding_fingerprint_mismatch_vs_approved` / `fingerprint_mismatch_vs_registry` |
| Cohort set/count mismatch vs `report.rows[].teamId` | `binding_cohort_mismatch` |
| Rating disagreement vs `finalPowerRating` beyond 1e-9 | `powerRating_mismatch:*` / `rating_mismatch:*` |
| Games not exact integer equal to `rows[].games` | `games_mismatch:*` |
| Row timestamps after binding snapshot or future vs ceiling | timing fail-closed |
| `dbTransactionTime` &lt; `observationStartTime` or &gt; `observationEndTime` (live path) | `observation_time_order_invalid` |
| Missing either archive chronology field | `archive_chronology_missing` — blocks G4 read |
| Archive time &gt; `observationStartTime` | `observation_predates_archive` |
| Archive time &gt; `nowCeiling` | `archive_time_after_ceiling` |
| Clock clamp / offset-correct / omit timing check | Reject / fail closed |
| Allowlist / season / observed modelVersion drift | `observation_scope_mismatch` |

### 7.4 Identity / digest / TX confusion

| Condition | Outcome |
|-----------|---------|
| Observer SHA missing or mismatched vs pin (when pin present) | `observer_sha_mismatch_vs_registry` |
| ZIP/member/producer pin mismatch | `archive_pin_mismatch` |
| Equating ZIP hash with fingerprint or receipt digest | Reject |
| Substituting producer **roles** (not merely equal SHA values) | Reject |
| TX metadata proves wrong isolation/read-only; or metadata missing on live path | Abort attempt |
| Combining rows across retry attempts | Forbidden / abort |

---

## 8. Fixture tests required before any live observation

**Hard gate:** No live DB observation until an implementation PR (separate, later) is independently reviewed **and** the following fixture suites are green. Fixtures use injected rows / synthetic archives only — **no DATABASE_URL**. Fixtures prove sequencing/fail-closed — **not** pooler compatibility.

### 8.1 Negative fixtures (required)

| ID | Intent | Expect |
|----|--------|--------|
| G4-N1 | Week 5 authentic pins + any observation | Integrity may PASS; weight 0.75; `fullWeightByPolicy=false`; no `fullWeightEligible` claim; live blocked |
| G4-N2 | Missing ZIP/member/producer pin | Fail closed; no observation success |
| G4-N3 | Allowlist violation (extra/missing scalar) | Fail closed |
| G4-N4 | Season ≠ 2026 or **observed** modelVersion ≠ `v1` | `observation_scope_mismatch` |
| G4-N5 | Cohort ≠ 138 or set ≠ `report.rows[].teamId` | Cohort fail-closed |
| G4-N6 | Decimal `'0'` raw preserved → usable zero via unchanged export | PASS usability |
| G4-N7 | Blank/NaN/nonfinite raw | Unusable; no zero-fill |
| G4-N8 | Observation predates archive completion | Fail closed |
| G4-N9 | Row `updatedAt` > binding snapshot | Fail closed |
| G4-N10 | Fingerprint echo ≠ recompute | `declared_*_mismatch` |
| G4-N11 | Rating 1e-9 fail vs `finalPowerRating` | numericOk=false |
| G4-N11b | Games disagree by non-integer or unequal integer | `games_mismatch:*` (exact equality) |
| G4-N12 | `readMode: fixture_injected` / `mode: fixture_hypothetical` | Fixture provenance; `liveAccepted=false` |
| G4-N13 | Caller trust object without registry `pinProvenance` | No bootstrap |
| G4-N14 | Lineage attestation missing / superseded / nonempty superseding / too early **on qualification path** | Qualification blocked with stable reasons |
| G4-N15 | Confusable digests (ZIP as fingerprint; attestation digest forced == sidecar digest) | Reject wrong object equality |
| G4-N16 | Write attempted / non-readonly | Fail closed |
| G4-N17 | TX metadata shows isolation ≠ repeatable read or read_only ≠ on | Abort attempt |
| G4-N18 | Lost TX / timeout mid-read | Abort; no partial package from combined attempts |
| G4-N19 | Retry stitching rows from attempt A + B | Reject |
| G4-N20 | Live-path null `dbTransactionTime` without reviewed exception | Fail closed |
| G4-N21 | Silent host/DB clock clamp to force ordering | Reject / fail closed |
| G4-N22 | Claim `fullWeightEligible` with missing prospective target | Reject claim |
| G4-N23 | Prospective fixture: completed=7, target=7 | `prospectiveOk=false` |
| G4-N24 | Prospective fixture: completed=8, target=7 | `prospectiveOk=false` |
| G4-N25 | Require G5 lineage bytes before allowing raw package emit under one-off authority | Must **not** block emission solely for missing later anchors (emission vs qualification separation) |
| G4-N26 | Live-path `dbTransactionTime` &lt; `observationStartTime` | `observation_time_order_invalid`; no successful sidecar |
| G4-N27 | Live-path `dbTransactionTime` &gt; `observationEndTime` | `observation_time_order_invalid`; no successful sidecar |
| G4-N28 | Unverifiable clock comparability (cannot validate inequality without altering timestamps) | Fail closed; diagnostic receipt only if any — not a successful sidecar |
| G4-N29 | Missing `workflowRunCompletedAt` only | `archive_chronology_missing`; G4 read blocked |
| G4-N30 | Missing `artifactCreatedAt` only | `archive_chronology_missing`; G4 read blocked |
| G4-N31 | `workflowRunCompletedAt` or `artifactCreatedAt` after `observationStartTime` | `observation_predates_archive` |
| G4-N32 | Archive chronology timestamp after `nowCeiling` | `archive_time_after_ceiling` |

### 8.2 Positive / structured fixtures (offline hypothetical only)

| ID | Intent | Expect |
|----|--------|--------|
| G4-P1 | Synthetic Week ≥ 6 / weight 1 + injected observation + test registry | `fullWeightByPolicy` may be true; fixture provenance; **`liveAccepted=false`** |
| G4-P2 | Fingerprint parity with capture-style `buildRatingFingerprint` | Exact hex equality |
| G4-P3 | Example: three role fields populated with distinct SHAs; capture SHA unset | PASS as **role-separation example** — not a universal inequality gate (§5) |
| G4-P4 | Timing order valid; Decimal raw round-trip | PASS |
| G4-P5 | Prospective fixture: completed=6, target=7 | `prospectiveOk=true` (fixture target only) |
| G4-P6 | Missing prospective target | Report `fullWeightByPolicy` only; no `prospectiveOk`/`fullWeightEligible` claim |
| G4-P7 | Adapter sequences: RepeatableRead TX → `SET TRANSACTION READ ONLY` → metadata verify → allowlisted SELECT | Ordering asserted in mock |
| G4-P8 | Digest triad: attestation digest vs approved attestation; `approvedSidecarDigest` vs sidecar hash; inventory vs approved inventory — all independent | PASS when each matches its own anchor |
| G4-P9 | Unapproved self-contained manifest seal (no credentials; atomic; no overwrite) | Package structure PASS |
| G4-P10 | Authentic Week 5 planned-row field set (no invented `modelVersion` on planned rows) | Schema mapping PASS; still full-weight-ineligible |

Green fixtures **do not** constitute independent production acceptance of any real Week ≥ 6 archive or observation.

### 8.3 Sequencing relative to a one-off G4 read

```text
design ACCEPTED (post F1–F4 closed + F3 timing correction)
  → implementation PR (authorized separately) + §8 fixtures green
    → independent review of implementation
      → explicit one-off execution authority + archive pins + TX contract readiness
        → G4 evidence emission (unapproved package)
          → independent review of package (still not G5/G6/G7)
```

This sequence is **not** G7 prospective capture/workflow enablement.

---

## 9. Observer process shape (design contract only — not authorized to run)

When later authorized as a **manual one-off**:

```text
1. Load external archive pins + ZIP/member bytes; verify digests; parse report via §2.1 mapping.
2. Require both workflowRunCompletedAt and artifactCreatedAt present/parseable; missing either aborts
   (archive_chronology_missing). Require fullWeightByPolicy (Week≥6 / weight=1) + 2026 +
   report.modelVersion v1 + verification shape + 138 teamIds.
3. Do not invent prospectiveTargetWeek; do not claim fullWeightEligible without approved target.
4. Record observationStartTime on the host clock BEFORE opening the transaction.
   Do not stamp a new observation start after reading rows.
5. Open Prisma interactive TX at RepeatableRead; SET TRANSACTION READ ONLY; verify metadata
   (isolation, read_only, transaction_timestamp, server-clock diagnostics).
6. SELECT nine allowlisted TeamSeasonRating columns WHERE season=2026 AND modelVersion='v1'
   on the same TX client.
7. Buffer rows; record bindingSnapshotReferenceTime AFTER the rating SELECT completes;
   set mandatory dbTransactionTime from transaction_timestamp() (original value retained).
8. Persist powerRatingRaw/ratingRaw as text; do not Number()-coerce.
9. End TX; confirm businessDataWrites=0, providerCalls=0. On any TX failure: abort; new attempt = full restart.
10. Record observationEndTime AFTER the attempt ends (success or structured abort path that still
    emits only a diagnostic failure receipt — never a successful sidecar on timing/TX failure).
11. Unconditionally require observationStartTime ≤ dbTransactionTime ≤ observationEndTime;
    require archive times ≤ observationStartTime and ≤ nowCeiling. Fail closed on any violation;
    diagnostics never waive/clamp/offset-correct.
12. Reconstruct → exportRatingInput → buildRatingFingerprint; cohort; rating 1e-9; games exact integer.
13. Emit sidecar mode=binding_observation, readMode=repeatable_read_readonly (declaration),
    lifecycleProducerSha + bindingObserverSha; seal self-contained unapproved manifest.
14. Do NOT mint registry approvals, lineage attestations, captureProducerSha, prospectiveOk without target,
    or portable liveAccepted.
```

---

## 10. Holdings

- Design base / worktree HEAD: `955cb46bad0ccca40d073a10d2c0aea3adf236a2`.  
- No implementation, DB connection, provider call, workflow dispatch, merge, calibration, or 2025 reopening in this task.  
- Do not amend accepted PRs #244 / #245 / #246 / #247 / #248 or main; #243 remains draft/unregistered.  
- Week 5 authentic archive remains full-weight-**ineligible** and schema exemplar.  
- G5 retrieval/lineage, G6 registration, G7 prospective enablement preserved as **later** gates.  
- No manufactured approval anchors or future-capture lineage coverage.  
- Live research readiness **BLOCKED**.  
- If these markdown files are later committed under separate authority: expect Vercel **BUILD** unless the full diff qualifies for established safe-skip rules.

---

## 11. Review checklist (G4 design re-acceptance)

- [ ] F1: `prospectiveOk = completedThroughWeek < prospectiveTargetWeek`; no production target chosen; missing target → no `fullWeightEligible` claim  
- [ ] F2: Archive checks use authentic report schema mapping; games exact integer; ratings 1e-9  
- [ ] F3: Prisma RepeatableRead + `SET TRANSACTION READ ONLY` + metadata verify; mandatory live `dbTransactionTime` with **unconditional** host/DB bounds; mandatory both archive chronology fields; §9 stamp order; MVCC limitation; no pooler preflight; diagnostics never waive timing  
- [ ] F4: Three-stage outcomes; emission ≠ approval; lineage digest triad corrected (**CLOSED** prior revision)  
- [ ] Allowlisted nine-column 2026/v1 projection preserved  
- [ ] Producer **roles** independent (no role substitution / no forced equality); distinct-SHA fixture is example only  
- [ ] Fixture matrix covers prospective trio + missing target + TX fail-closed + DB-time bounds + archive chronology negatives  
- [ ] U1–U9 dispositions recorded without inventing production values  
- [ ] G5 / G6 / G7 / G8 explicitly deferred  

---

## 12. U1–U9 dispositions (review recommendations; not operational authorization)

| ID | Disposition |
|----|-------------|
| **U1** | **Deferred:** identify and independently review a genuine Week ≥ 6 COMMIT run/artifact. None selected here |
| **U2** | **Deferred to G6** for production registration; explicit **fixture-only** targets permitted; apply corrected `completedThroughWeek < prospectiveTargetWeek` comparison |
| **U3** | **Set F3 transaction contract now**; actual pooler proof remains a **later authorized** read-only preflight (not now) |
| **U4** | Use a **self-contained local manifest package** with safe observation ID, exact ZIP/member/sidecar/run metadata bytes, atomic seal, no overwrite, no credentials. Durable review destination can be resolved before execution |
| **U5** | **Bobby** authorizes execution; independent review precedes approved pins. Identify reviewer/approval record before operational acceptance; do **not** invent signing keys or observer self-approval |
| **U6** | Server `transaction_timestamp()` **mandatory** for intended live PostgreSQL, with explicit clock-domain rules (§3.4–§3.5) |
| **U7** | **Deferred to G5** inventory/search review; unknown or missing lineage **never** qualifies |
| **U8** | Design a **manual one-off** G4 observation under separate authority. **No** default-on or scheduled workflow. G7 prospective capture enablement remains later |
| **U9** | Separate observer implementation branch/PR inheriting accepted G3 dependencies; record ancestry and actual clean executable source pins, including imported dependencies. **Do not** amend or merge accepted drafts |

---

## 13. Document control

| Field | Value |
|-------|-------|
| Document | `research/moneyline/ML_CAL_1_LIFECYCLE_BINDING_OBSERVER_G4_DESIGN.md` |
| Recovery note | `research/moneyline/ML_CAL_1_LIFECYCLE_BINDING_OBSERVER_G4_RECOVERY.md` |
| G3 / worktree base | `955cb46bad0ccca40d073a10d2c0aea3adf236a2` |
| Authorization | Design re-review only |
| Prior disposition | Acceptance withheld pending F1–F4 (addressed in this revision) |
