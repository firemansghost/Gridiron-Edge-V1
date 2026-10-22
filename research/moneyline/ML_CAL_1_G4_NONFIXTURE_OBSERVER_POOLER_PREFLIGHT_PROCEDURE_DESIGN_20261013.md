# ML-CAL-1 G4 Nonfixture Observer Distribution + Deployed Pooler-Preflight Procedure Design

**Date:** October 13, 2026 (America/Chicago)  
**Status:** Offline **procedure design only** — F1–F3 accepted at design scope; **retention-profile decision proposal appended** — stop for independent review  
**Authority:** Design/planning. **No** implementation, tests, commit/push, PR amend/merge, live retrieval, credentials, DB/pooler access, observation execution, dispatch, approval issuance, registration, calibration, 2025 access, or Week 7 operational actions.

| Dependency | Identity |
|------------|----------|
| Accepted G5-PRE tip (this worktree) | `1683ce36fbb5a981a2b3ba3d8a9b90ea8da37f25` |
| Accepted G4 tip / fixture capability | `6c2b31069b8805c7f2d171da1e04bf47885f237d` |
| G4 design (on-disk pin) | `ML_CAL_1_LIFECYCLE_BINDING_OBSERVER_G4_DESIGN.md` |
| G5 design pin | `bc292e06ce78531b7290833922abe4add9be3af854fe15c599d9bcd1dc1c7a8b` |
| Live-prerequisite gap inventory (accepted) | `ML_CAL_1_G5_LIVE_PREREQUISITE_REVIEW_20261013.md` |
| W6 ops retain (identity only; not research-approved) | ZIP `781c9cbf…` / report `b03114a4…` / producer `c37b5d3…` |

Live research remains **BLOCKED**. This note does **not** select a production prospective target week.

**Prior revision (accepted at design scope):** F1 chronology provenance; F2 hard P-PREFLIGHT gate; F3 destination gate; lifecycle-report wording.  
**This append:** §5.5 retention-profile **decision proposal** recommending `R-LOCAL-FS` as the initial profile (proposed layout only — **not** a verified usable destination; no directories created; no durability checks claimed).

---

## 0. Purpose and non-goals

### Purpose

Specify the **procedure design** for:

1. **Nonfixture G4 observer distribution** — how a later, separately authorized implementation would differ from today’s fixture-only observer at accepted G4 tip `6c2b310…`, how packages are retained/distributed, and what one-off observation requires.  
2. **Deployed pooler preflight** — a **separate** read-only procedure proving Prisma RepeatableRead + in-transaction `SET TRANSACTION READ ONLY` + verified transaction metadata + mandatory `dbTransactionTime` on the intended pooled path — **without** performing a binding observation.

### Non-goals

- Implementing or testing either procedure now.  
- Connecting to any database or pooler.  
- Running an observation or emitting a live package.  
- Issuing registry / reviewed-effect / archive research pins.  
- Merging or amending #244–#252.  
- Opening G6 registration, G7 enablement, or G8 publication.  
- Choosing or rolling a production target week.  
- Authoring a separate chronology-planning document in this revision.  
- Week 7 ops (dispatch, markets, cohorts, clock claims).

---

## 1. Fixture → nonfixture: implementation differences and source identity

### 1.1 What is accepted today (fixture capability)

At G4 tip `6c2b310…`, `apps/jobs/lib/ml-cal-1-lifecycle-binding-observer.ts` provides:

| Surface | Fixture behavior |
|---------|------------------|
| TX adapter | Injectable `MlCal1G4ObserverTxAdapter`; `createMockRepeatableReadAdapter` sequences mock isolation / READ ONLY / metadata / SELECT |
| `readMode` | `fixture_injected` |
| Sidecar mode | `fixture_hypothetical` / fixture provenance |
| `dbTransactionTime` | May be null with fixture unavailable reason; `dbTransactionTimeRequired: false` on fixture path |
| `liveAccepted` | Always `false` |
| Archive pins | Operator/fixture-supplied; chronology fields required in contract but often fixture-synthesized |
| Package seal | Local self-contained manifest; optional `PROVENANCE.json` for fixtures |
| Proof | Adapter sequencing + fail-closed offline tests — **not** deployed pooler proof (G4 design §3.7) |

### 1.2 Required nonfixture differences (design target; not implemented)

| Concern | Fixture | Nonfixture (required later) |
|---------|---------|-------------------------------|
| Source identity | Mock rows / synthetic or retained fixture ZIP | Genuine COMMIT ZIP + report member bytes whose digests match **independently reviewed** archive pins |
| `lifecycleProducerSha` | Fixture or pinned producer | Exact workflow `head_sha` / producer of the genuine archive — **never** equalized with observer/capture by role collapse |
| `bindingObserverSha` | Fixture observer identity | Executable nonfixture observer commit SHA (40-hex), distinct **role** from producer (values may coincide only if same commit truly served both roles) |
| TX path | Mock adapter | Real Prisma interactive TX on intended **pooled** `DATABASE_URL` path (credentials not in package) |
| Isolation / READ ONLY | Mock returns | Real `RepeatableRead` + in-TX `SET TRANSACTION READ ONLY` (no session-level RO substitute via pooler) |
| Metadata | Mock | Real allowlisted metadata query: isolation, read_only, `transaction_timestamp()`, server-clock diagnostics |
| `dbTransactionTime` | Optional null + reason | **Mandatory** from `transaction_timestamp()`; unconditional `observationStartTime ≤ dbTransactionTime ≤ observationEndTime` |
| `readMode` | `fixture_injected` | `repeatable_read_readonly` |
| Sidecar mode | fixture_* | `binding_observation` for genuine live reads |
| Provenance | `PROVENANCE.json` / fixture flags | **No** fixture provenance that could be relabeled as live; `liveAccepted` remains `false` until later gates |
| Chronology inputs | Fixture ISO strings | Independently evidenced `workflowRunCompletedAt` **and** `artifactCreatedAt` with labeled provenance (§6) — unresolved → block |
| Retention destination | Test temp dirs | **Chosen** retain profile + **usable** destination path/key (§5) — unresolved → **block P-OBSERVE before TX open** |
| Preflight gate | N/A (fixture mocks) | **Reviewed successful P-PREFLIGHT** required before P-OBSERVE (§2) |
| Authority | Offline CI / fixture PR | Separate **preflight** authority and separate **one-off observation** authority (§2) |

### 1.3 Source-identity rules (immutable)

1. **Producer ≠ observer ≠ capture** as **roles**. Do not substitute digests across ZIP / report / sidecar / attestation / inventory / receipt kinds.  
2. Archive ZIP and lifecycle **report member** are read-only evidence; observer must not rewrite COMMIT artifacts.  
3. Ops COMMIT success (e.g. W6 run `38294539460`) is **not** research binding acceptance and does **not** mint registry pins.  
4. Synthetic Week ≥ 6 fixtures remain test-only; Week 5 weight-0.75 remains full-weight-ineligible.

---

## 2. Separate procedures and separate authority

**Do not bundle preflight permission with observation permission.**

| Procedure | Goal | Writes | Uses genuine archive? | Emits observation package? | Authority required |
|-----------|------|--------|----------------------|----------------------------|--------------------|
| **P-PREFLIGHT** — Deployed pooler preflight | Prove TX contract on intended pooler | None (`businessDataWrites=0`, `providerCalls=0`) | **No** (archive out of scope) | **No** | Explicit **read-only pooler preflight** authority |
| **P-OBSERVE** — One-off G4 nonfixture observation | Bind genuine Week ≥ 6 archive to RO rating observation; emit **unapproved** package | None | **Yes** — pins + chronology + retain destination resolved first | **Yes** — unapproved self-contained package only | Explicit **one-off G4 observation** authority **after** design review **and** reviewed successful P-PREFLIGHT |

### 2.1 Authority gates (ordered)

1. Independent review accepts **this procedure design**.  
2. Separately authorized **implementation** of nonfixture adapter + distribution (later PR; not this note).  
3. Separately authorized **P-PREFLIGHT** execution → retain successful preflight proof package (§3.4).  
4. **Independent review accepts** that preflight proof as successful for the intended pooler profile.  
5. Separately authorized **P-OBSERVE** one-off execution — **only if** step 4 is complete **and** §4.1 / §5.3 preconditions hold (including chosen usable retain destination).  
6. Independent review of emitted observation package (still **not** G5 approval).  
7. G5 / G6 / G7 / G8 each require **their own** later authorities (§7). **G8 checks are required before publication.**

Bobby may authorize execution steps; **approved pins** require independent review (G4 design U5/U8). Acceptance of G5-PRE or this design does **not** authorize steps 2–7.

**P-PREFLIGHT → P-OBSERVE (hard):** A reviewed successful P-PREFLIGHT is a **consistent prerequisite** for opening a P-OBSERVE transaction. This procedure contains **no** optional, recommended, or waiver path around that gate. Any future exception would require a **separate reviewed change proposal** to this design — not an operator override inside P-OBSERVE.

### 2.2 Hard separation rules

- Preflight **must not** SELECT the nine `TeamSeasonRating` business columns (or any business table). **Metadata-only.**  
- Observation performs the business-row SELECT under the TX contract in §4.2 — never during preflight.  
- Observation **must not** treat preflight success as lineage, registry, or `liveAccepted`.  
- Neither procedure may dispatch workflows, mutate registry, or enable capture schedules (G7).

---

## 3. Deployed pooler preflight procedure (P-PREFLIGHT) — specification only

### 3.1 Preconditions

- Intended connection profile identified by **name only**: pooled `DATABASE_URL` (Prisma `url`); `DIRECT_URL` is **not** the preflight path unless a future reviewed exception says otherwise.  
- Credentials available to the **authorized operator environment** only — never written into evidence packages.  
- No providers; timeout bound declared in preflight metadata.  
- Explicit P-PREFLIGHT authority recorded (who/when/scope).  
- Preflight proof destination under the chosen retain profile (§5 / §5.5): for the recommended `R-LOCAL-FS` proposal, the **`preflight/`** subtree of a **verified usable** root — layout proposal alone is insufficient (§5.5.7).

### 3.2 Exact TX steps (fail closed)

1. Record host `preflightStartTime`.  
2. Open Prisma interactive transaction at `Prisma.TransactionIsolationLevel.RepeatableRead`.  
3. **Before any other statement:** `SET TRANSACTION READ ONLY` on the **same** transaction client.  
4. Same client: allowlisted metadata query verifying and retaining:  
   - `transaction_isolation = 'repeatable read'`  
   - `transaction_read_only = 'on'`  
   - `transaction_timestamp()` → mandatory `dbTransactionTime`  
   - server-clock diagnostics (evidence only; never waive)  
5. Confirm `businessDataWrites = 0`, `providerCalls = 0`, no DDL/mutation APIs.  
6. End transaction; record host `preflightEndTime`.  
7. Require `preflightStartTime ≤ dbTransactionTime ≤ preflightEndTime` unconditionally when `dbTransactionTime` is non-null (live path: always non-null).

**Abort** if isolation/RO wrong, metadata missing/unverifiable, timeout/lost TX, any write/provider attempt, or clock inequality fails. Retries = **new complete attempt** with new timing evidence; never stitch attempts.

### 3.3 What preflight does **not** prove

- Cohort correctness, fingerprint parity, or archive binding.  
- Absence of later rating revisions (**MVCC caveat:** Repeatable Read snapshot may be fixed at the first non-control statement, often the metadata query; preflight never claims database freshness beyond verified metadata).  
- G5 lineage completeness or registry approval.  
- Pooler behavior under observation SELECT load (observation is a separate procedure).  
- Authorization to run P-OBSERVE (still requires separate observation authority **plus** review of this successful proof).

### 3.4 Retained preflight proof (proposed members)

Unapproved, credential-free:

| Member | Content |
|--------|---------|
| `preflight-run-metadata.json` | Authority id, start/end, `dbTransactionTime`, isolation/RO results, server-clock diagnostics, pooler profile **name** (not secret), zero writes/providers |
| `preflight-tx-evidence.json` | Redacted metadata query results (no connection strings) |
| `PACKAGE_MANIFEST.json` / `.sha256` | Digests, `liveAccepted: false`, `approved: false`, `credentialsPresent: false` |
| `design-correspondence.json` | Pointers to this design note + G4 tip `6c2b310…` |

No `archive.zip`, no lifecycle report, no binding sidecar in preflight packages.

A preflight proof is **successful** only when the TX contract passes and the sealed proof package is retained. Independent review must accept that success before P-OBSERVE may proceed (§2.1).

---

## 4. One-off nonfixture observation procedure (P-OBSERVE) — specification only

### 4.1 Preconditions (all required — any missing → do not open TX)

1. This design independently reviewed.  
2. Nonfixture implementation fixture-green + reviewed (later).  
3. **Reviewed successful P-PREFLIGHT** for the intended pooler profile — proof retained and independently accepted (§2.1 / §3). **No exception path in this procedure.**  
4. Genuine Week ≥ 6 / weight 1.00 COMMIT archive bytes retained locally; ZIP + report member digests match reviewed pins.  
5. **Both** archive chronology fields populated for the sidecar/pins from **accepted, labeled provenance** (§6) — else **abort** (`archive_chronology_missing`). W6 remains unresolved today.  
6. Explicit one-off P-OBSERVE authority; safe `observationId`.  
7. **Chosen retention profile** (§5.2) **and usable destination** for this observation package (§5.3) — if destination is unresolved, unusable, or unwritable, **block execution before any transaction opens**.  
8. No production prospective target required for raw emission; if a target is supplied it must be fixture-only or G6-approved — **this design selects none**.

### 4.2 Observation TX contract (same as G4 design §3.3)

**Only after §4.1 is fully satisfied:**

1. Host `observationStartTime` **before** TX open.  
2. RepeatableRead interactive TX → in-TX `SET TRANSACTION READ ONLY` → metadata verify (isolation, RO, `transaction_timestamp()`, diagnostics).  
3. Same TX: SELECT exactly the nine allowlisted `TeamSeasonRating` scalars with `season=2026` and `modelVersion='v1'`.  
4. After SELECT completion: stamp `bindingSnapshotReferenceTime` (**observer host** wall clock).  
5. End TX; host `observationEndTime`.  
6. Mandatory live `dbTransactionTime`; unconditional `observationStartTime ≤ dbTransactionTime ≤ observationEndTime`.  
7. Cohort / Decimal / fingerprint / timing rules per accepted binding verifier + G4 design §4 — fail closed on mismatch.  
8. `businessDataWrites=0`, `providerCalls=0`.

**MVCC snapshot caveat (preserved):** Under PostgreSQL Repeatable Read, the MVCC snapshot may be fixed at the first non-transaction-control statement (often the metadata query), which can precede the business SELECT. Therefore `bindingSnapshotReferenceTime` (post-SELECT **host** time) is the accepted **observation reference** for binding as-of — it is **not** proof of database row freshness at that host instant, and it does **not** prove absence of later rating revisions. Later G5+ lineage / fingerprint gates remain mandatory for qualification; **G8 checks are required before publication.**

### 4.3 Failure handling

| Failure | Outcome |
|---------|---------|
| Missing reviewed successful P-PREFLIGHT | **Do not open TX** |
| Unresolved / unusable retain destination | **Do not open TX** |
| Archive/pin/chronology/TX/cohort/timing fail | **Abort** — no successful observer sidecar; optional `*.diagnostic-failure.json` only |
| Missing G5 anchors | Does **not** block raw emission under P-OBSERVE authority; blocks later qualification |
| Clock disagreement host vs server | Retain diagnostics; **no** clamp/offset/waiver; fail closed if accepted inequalities cannot be validated |
| Retry | New attempt identity + new times only |

### 4.4 Complete observation package members

Atomic seal, no overwrite, no credentials (`credentialsPresent: false`), `liveAccepted: false`, `approved: false`.

| Member | Required | Notes |
|--------|----------|-------|
| `archive.zip` | **Yes** | Exact COMMIT ZIP bytes |
| Lifecycle **report** member (basename of sidecar `acceptedArchive.github.reportMemberPath`, e.g. `core-v1-lifecycle-2026-through-week-6-COMMIT.json`) | **Yes** | Exact report JSON bytes |
| `binding-sidecar.json` | **Yes** | Observation + timing + raw rows; mode `binding_observation` |
| `observer-run-metadata.json` | **Yes** | Observer SHA, readMode, TX diagnostics, allowlist echo, zero writes/providers |
| `design-correspondence.json` | **Yes** | Design/on-disk pins + base tips |
| `PACKAGE_MANIFEST.json` | **Yes** | Member digests + sidecarDigest |
| `PACKAGE_MANIFEST.sha256` | **Yes** | Manifest digest |
| `PROVENANCE.json` | **Forbidden** on nonfixture live emission | Fixture-only |

**Lifecycle report requirement (corrected):** The lifecycle report member is required by **both**:

1. **G5-PRE package validation** at accepted tip `1683ce3…` — sidecar-declared `reportMemberPath` / `reportMemberSha256` / `reportByteCount` must resolve to retained package bytes whose digest and byte count match (not merely an optional extra beyond named manifests).  
2. **G4 observation package seal** — report member bytes are sealed beside `archive.zip` as first-class retained evidence.

Fixed-name members (`archive.zip`, `binding-sidecar.json`, `observer-run-metadata.json`, `design-correspondence.json`, manifests) plus the **sidecar-resolved report basename** together constitute the complete required package set for nonfixture observation destined for later G5-PRE checks.

---

## 5. Credential redaction and retention / distribution profiles

### 5.1 Redaction rules (all packages)

**Never** embed: `DATABASE_URL`, `DIRECT_URL`, `SHADOW_DATABASE_URL`, Supabase keys, provider API keys, `Authorization` / bearer tokens, raw connection strings, pooled password material, `.env` contents.  
Retain only: profile **names**, redacted host labels if reviewed, digests, timestamps, isolation/RO booleans, allowlist echoes.  
Manifest must assert `credentialsPresent: false`; scanners should fail closed if secretish patterns appear (as in G5-PRE CI scan spirit).

### 5.2 Proposed retention / distribution profiles

| Profile id | Location class | Pros | Cons | Status |
|------------|----------------|------|------|--------|
| `R-LOCAL-FS` | Operator local immutable path under research retain root | Simple; offline review | Single-machine durability | **RECOMMENDED INITIAL** — decision proposal §5.5 (layout not yet verified usable) |
| `R-AGENTSTORE` | Cursor AgentStores evidence folders | Already holds ops W6 bytes | Transient / not a reviewed research trust store | **PROPOSED** (ops evidence only — **not** initial research destination) |
| `R-GH-ARTIFACT` | GitHub Actions artifacts | Source of archive identity | Ephemeral expiry; not sole durable store | **PROPOSED** (source only — not a durable observation destination) |
| `R-OBJECT-DB` | Future object/table store via named Supabase/Postgres config | Shared review | Needs separate RLS/redaction design; **no** credentials in this note | **PROPOSED** (unchosen) |

**Choosing** a profile and proving a **usable destination** remain prerequisites for execution (§5.3 / §5.5.7). Accepting this decision proposal records the **recommended** profile and layout; it does **not** by itself create directories or certify usability.

### 5.3 Destination gate before P-OBSERVE TX

Before P-OBSERVE may record `observationStartTime` or open a transaction:

1. A retention profile from §5.2 (or a future reviewed addition) must be **chosen** and recorded.  
2. A **usable destination** under that profile must exist for this `observationId` (path/key writable, no overwrite collision, credential-free layout) — verified by §5.5.7 checks, not by layout proposal alone.  
3. If the profile is unchosen, the destination is missing, unwritable, or otherwise unresolved → **block execution** — do not open a TX, do not SELECT ratings.

Preflight proof retention likewise requires a chosen usable destination before sealing success proof (§3.1 / §5.5.7).

### 5.4 Distribution

- One-off packages are sealed **into** the chosen usable destination (atomic rename / equivalent).  
- No overwrite of existing `observationId` / `preflightId` directory.  
- Versioning: id + manifest `sealedAt` + content digests; do not mutate sealed members.

### 5.5 Retention-profile decision proposal — `R-LOCAL-FS` (recommended initial)

**Decision proposed (design scope):** Adopt **`R-LOCAL-FS`** as the **recommended initial** research retention profile for P-PREFLIGHT proof packages and (later) P-OBSERVE packages.

| Statement | Status after this append |
|-----------|--------------------------|
| Recommended profile id | `R-LOCAL-FS` |
| Proposed directory layout | Specified below — **proposal only** |
| Evidence directories created on disk | **No** — not created in this task |
| Durability / usability checks executed | **No** — not claimed |
| Destination certified usable for execution | **No** — remains **UNVERIFIED** until §5.5.7 passes under separate authority |
| W6 `workflowRunCompletedAt` | Still **UNRESOLVED** (§6.5) |
| Derived / upper-bound timestamp mapping | **Not approved** |

#### 5.5.1 Proposed root (outside repo and AgentStores)

Proposed root pattern (operator machine; concrete path chosen at setup time, not in-repo):

```text
<OPERATOR_RESEARCH_RETAIN_ROOT>/
  ml-cal-1/
    g4/
      preflight/
      observations/
      review-handoff/
      staging/
```

**Constraints on `<OPERATOR_RESEARCH_RETAIN_ROOT>`:**

- **Outside** any Gridiron Edge git worktree / repository clone (including this G5-PRE worktree).  
- **Outside** Cursor AgentStores paths (e.g. `…/AgentStores/cursor_agent_stores/…`) — those remain ops/transient evidence locations, not the research retain root.  
- Not under OS temp, browser download cache, or CI workspace scratch.  
- Operator-controlled local filesystem; single-machine durability acknowledged.

Example shape only (illustrative, **not** created here):  
`C:\Users\Bobby\gridiron-research-retain\ml-cal-1\g4\…`

#### 5.5.2 Separate preflight and observation directories

| Subtree | Purpose | Package ids |
|---------|---------|-------------|
| `…/g4/preflight/<preflightId>/` | Sealed P-PREFLIGHT success (or failure receipt sibling outside package) | `preflightId` — safe id (§5.5.3) |
| `…/g4/observations/<observationId>/` | Sealed P-OBSERVE packages | `observationId` — `isSafeG4ObservationId` rules |
| `…/g4/staging/` | Ephemeral `.tmp-*` dirs during atomic seal only | Must not be treated as retained evidence |
| `…/g4/review-handoff/<handoffId>/` | Digest-verified copies prepared for independent review | Copy manifests only after §5.5.6 |

Preflight and observation trees **must not** share a package directory. A preflight proof is never sealed into `observations/`; an observation package is never sealed into `preflight/`.

#### 5.5.3 Safe IDs

- `observationId`: must satisfy accepted G4 `isSafeG4ObservationId` (no path separators, no `..`, no absolute paths, charset/length as implemented at G4 tip).  
- `preflightId`: same safety class as observation ids (recommend prefix `preflight-` + safe token); reject unsafe ids before any filesystem write.  
- Final package path = `<subtree>/<safeId>/` only — never operator-supplied relative segments outside the id.

#### 5.5.4 Staging, atomic seal, no overwrite, digest verification

1. Refuse if `<subtree>/<safeId>/` already exists (**no overwrite**).  
2. Write all members under `…/g4/staging/.tmp-<safeId>-<uuid>/`.  
3. Compute per-member SHA-256 + byte counts; write `PACKAGE_MANIFEST.json` and `PACKAGE_MANIFEST.sha256`.  
4. Re-read staged bytes; verify each digest/byteCount matches the manifest (**digest verification before publish**).  
5. Atomically publish: rename/move staging dir → `<subtree>/<safeId>/` (fail if destination exists).  
6. After publish, re-hash published members against the sealed manifest; mismatch → mark package failed for review (do not “repair” in place).

#### 5.5.5 Credential exclusion

Under the retain root and in every sealed member:

- No `.env`, connection strings, API keys, tokens, or pooled password material.  
- Manifest `credentialsPresent: false` required.  
- Secretish-pattern scan on members before publish (fail closed).  
- Profile records store **root path labels** and profile id only — never secrets.

#### 5.5.6 Backup / copy verification and independent-review handoff

1. Optional backup/copy into `review-handoff/<handoffId>/` **after** successful seal.  
2. Copy is valid for handoff only when **every** member digest matches the source sealed package (byte-identical verify).  
3. Handoff bundle includes: package tree + a small `HANDOFF.json` listing source path label, package id, manifest SHA-256, copy-verified-at host time, and `liveAccepted: false` / `approved: false`.  
4. Independent review consumes the handoff or the sealed primary path by digest — self-hashes do not grant approval.

#### 5.5.7 Destination usability checks (required before execution)

**Proposed layout ≠ usable destination.** Before P-PREFLIGHT seals a success package, and before P-OBSERVE opens a transaction, an authorized setup/check step must record a pass for:

| Check | Requirement |
|-------|-------------|
| Profile chosen | `R-LOCAL-FS` (or later reviewed replacement) recorded |
| Root configured | `<OPERATOR_RESEARCH_RETAIN_ROOT>` set, outside repo + outside AgentStores |
| Subtrees present | `preflight/`, `observations/`, `staging/`, `review-handoff/` exist **or** creatable by the authorized setup step (creation is a **separate** setup action — **not** performed by this design append) |
| Writable | Process can create+delete a probe file under `staging/` and remove it |
| No overwrite collision | Target `<safeId>` does not already exist |
| Credential-free | Root listing scan finds no `.env` / secret files in retain tree |
| Space / path length | Sufficient free space; paths within OS limits for the safe id |

Until these checks are **actually run and recorded** under separate authority, the destination remains **PROPOSED / UNVERIFIED**. This append does **not** run them and does **not** create evidence directories.

#### 5.5.8 Relationship to other profiles

- `R-AGENTSTORE` may continue to hold **ops** W6 retain bytes; it is **not** the recommended research seal destination.  
- `R-GH-ARTIFACT` remains a possible **source** of archive identity, not durable research retain.  
- Migrating later to `R-OBJECT-DB` requires a separate reviewed change.

---

## 6. Required archive chronology and evidence provenance (F1)

## 6. Required archive chronology and evidence provenance (F1)

Accepted verifier / G4 contract: **both** `workflowRunCompletedAt` and `artifactCreatedAt` must be present, parseable, ≤ `observationStartTime`, ≤ `nowCeiling`. Missing either → `archive_chronology_missing` → **block G4 read**.

This design does **not** assume that any single GitHub Actions REST resource field (including a workflow-run `completed_at`) is present, stable, or already retained. Fields that populate sidecar chronology must cite **exact retained metadata bytes** and a **labeled provenance class**.

### 6.1 Timestamp classes (keep distinct — never collapse)

| Class | Meaning | Example retain surfaces (illustrative) | May silently fill `workflowRunCompletedAt`? |
|-------|---------|------------------------------------------|-----------------------------------------------|
| **Run status** | Workflow run’s reported status/conclusion (e.g. success/failure) without a verified completion instant | Run status in logs/checkpoints; conclusion flags | **No** — status ≠ completion time |
| **Job completion** | A single job (e.g. `write`) finished as observed in runner logs or job objects | Actions log “Complete job” lines; job-level timestamps if retained | **No** — job ≠ run unless a separately accepted mapping says so |
| **API observation time** | When an operator/tool observed or downloaded metadata (`asOfUtc`, checkpoint time) | `CHECKPOINT-SUMMARY.json` `asOfUtc` | **No** — observation-of-API ≠ run completion |
| **Artifact creation** | Artifact object `created_at` / `updated_at` | Artifact meta / artifacts-list JSON | Fills **`artifactCreatedAt` only** when bytes verify — still not run completion |
| **Runner log lines** | Hosted-runner log wall times | `COMMIT-*.log` “Complete job” stamps | **No** — never automatic substitute for `workflowRunCompletedAt` |
| **Derived completion / conservative upper bound** | A value computed from other classes (e.g. max(job end, artifact created_at) labeled as upper bound) | Explicit derivation record + source digests | **No silent fill** — see §6.3 |

### 6.2 Supported provenance for pin fields

| Sidecar / pin field | How it may be populated | Required retain evidence |
|---------------------|-------------------------|--------------------------|
| `artifactCreatedAt` | Exact artifact metadata field `created_at` (or synonymous artifact-resource creation timestamp) from retained artifact meta / artifacts-list bytes | Digest of those bytes; field path documented; matches ZIP identity of the same artifact |
| `workflowRunCompletedAt` | **Only** from a provenance class that independent review has accepted as supplying that pin field for the **exact run/attempt** (run id + attempt if multi-attempt). This design **does not** pre-declare that a workflow-run REST `completed_at` exists or is the authority | Retained source bytes + provenance label + field path; or an **explicitly labeled** derived/upper-bound mapping accepted under §6.3 |

If no accepted provenance exists for `workflowRunCompletedAt`, the field remains **UNRESOLVED** and P-OBSERVE is blocked.

### 6.3 Derived completion or conservative upper bound (optional proposal class only)

A later proposal **may** define a derived value or conservative upper bound for research use (for example: “upper_bound_from_artifact_created_at”, “upper_bound_from_named_job_complete_log”). Any such proposal must:

1. Label the value explicitly as **`derived`** or **`conservative_upper_bound`** (never as raw API completion).  
2. List exact source timestamp classes and retained byte digests.  
3. State the mapping formula and whether it is an upper/lower bound.  
4. Receive **independent acceptance** of that mapping **before** any use.  
5. **Must not** silently write the derived value into `workflowRunCompletedAt` as if it were a native run-completion field. If accepted for use, store it under a distinct reviewed field/annotation **or** only copy into `workflowRunCompletedAt` after the accepted mapping document explicitly authorizes that assignment.

Until such a mapping is independently accepted, derived/upper-bound constructions remain **non-authoritative** and do not resolve chronology.

### 6.4 Exact run / attempt identity

Chronology evidence must identify:

- `workflow_run.id` (e.g. `38294539460`)  
- Head SHA / producer when present  
- Artifact id when tying artifact creation  
- **Attempt number** when the platform distinguishes attempts — do not mix timestamps across attempts  

Mismatch of run/attempt vs archive pins → reject chronology.

### 6.5 W6 retain status (dated 2026-10-13; unchanged unresolved)

| Field / class | Local status |
|---------------|--------------|
| `artifactCreatedAt` candidates | **OBSERVED** artifact `created_at` `2026-10-12T19:00:39Z` in retained artifact meta (usable for artifact class only) |
| Run status / conclusion | Recorded as success in checkpoint — **not** a completion instant |
| Job completion (runner log) | “Complete job” ≈ `2026-10-12T19:00:40.052Z` — **job/log class only** |
| API observation time | Checkpoint `asOfUtc` ≈ `2026-10-12T19:02:21Z` — **not** run completion |
| `workflowRunCompletedAt` | **UNRESOLVED** — no accepted provenance populated for this pin; no retrieval in this task |
| ZIP / report / producer digests | Locally verified MATCH (ops retain) — still **not** research-approved pins |

**No retrieval now.** W6 chronology remains **UNRESOLVED**. P-OBSERVE against W6 is blocked until §6.2 is satisfied under separate future authority.

---

## 7. Later-gate dependencies (do not collapse)

| Gate | Dependency on this design | This design authorizes? |
|------|---------------------------|-------------------------|
| **G5** trust / lineage | Observation package bytes + external anchors (registry, attestation, inventory, sidecar, reviewed-effect pins by candidateKey→evidence SHA); retrieval order; coverage through binding snapshot **and** observation end; unknown effects block `none_found` | **No** — G5 instance application + pin issuance are separate |
| **G6** registration | Independently approved production prospective target | **No** — **no target selected** |
| **G7** enablement | Prospective capture / workflow enablement | **No** — one-off observe ≠ G7 |
| **G8** before publication | Lineage through actual `T_capture` + fingerprint + approved receipt compare | **No** — requires capture existence; **publication must not proceed without G8** |

G4 emission remains unapproved evidence only. Portable `liveAccepted` forbidden from G4.

---

## 8. Decisions log (this note)

| ID | Decision | Status |
|----|----------|--------|
| D1 | Preflight and observation are separate procedures with separate authorities | **Decided (design)** |
| D2 | Preflight is metadata-only; no `TeamSeasonRating` SELECT | **Decided (design)** |
| D3 | Live observation requires mandatory `dbTransactionTime` and unconditional clock bounds | **Decided (design)** — inherits accepted G4 |
| D4 | Lifecycle report member is required by G5-PRE package validation and by observation seal | **Decided (design)** |
| D5 | Chronology provenance classes are distinct; runner logs / API observation time / run status are not automatic `workflowRunCompletedAt` | **Decided (design)** |
| D5b | No assumed workflow-run REST `completed_at`; derived/upper-bound values require labeled independent acceptance and must not silently fill the pin | **Decided (design)** |
| D6 | Durable retain profile must be **chosen** and destination **usable** before P-OBSERVE TX | **Decided (design)** |
| D6b | **Recommend** `R-LOCAL-FS` as initial profile with proposed root/layout §5.5 | **Decision proposal** — not a verified usable destination |
| D7 | Reviewed successful P-PREFLIGHT is a **hard** prerequisite for P-OBSERVE throughout; no waiver in this procedure | **Decided (design)** |
| D8 | Production prospective target week | **Not selected** (forbidden here) |
| D9 | Derived / conservative-upper-bound timestamp mapping for W6 | **Not approved** |
| D10 | W6 `workflowRunCompletedAt` | Remains **UNRESOLVED** |

---

## 9. Unresolved prerequisites

1. Independent acceptance of §5.5 `R-LOCAL-FS` decision proposal.  
2. Operator configuration of `<OPERATOR_RESEARCH_RETAIN_ROOT>` + **actual** §5.5.7 usability verification (directories not created by this note).  
3. Offline **preflight-runner** implementation (§11) — not started.  
4. Deployed pooler preflight **execution** (requires implementation + usable destination + separate authority) + independent review of success proof.  
5. Nonfixture observer implementation (after preflight path exists).  
6. W6 `workflowRunCompletedAt` provenance (**UNRESOLVED** — §6.5); no derived mapping approved.  
7. Independently reviewed research archive pins (ops hash match ≠ pin).  
8. External trust-store / reviewed-effect approval process for genuine candidates (G5).  
9. Live lineage source-format adapters (G5-PRE gap inventory).  
10. G6 / G7 / G8 entirely closed (G8 still required before any publication).  
11. Integration/release plan for merging accepted research tips (acceptance ≠ merge).

---

## 10. Proposed tests (for a later implementation PR — not authored now)

### 10.1 Preflight runner + retain seal (required for §11 task)

| ID | Intent |
|----|--------|
| PF-P1 | Mock adapter: RepeatableRead → SET RO → metadata → success evidence seal into **fixture temp root** mimicking `R-LOCAL-FS` layout |
| PF-P2 | Manifest digests match re-hashed staged and published members |
| PF-P3 | Atomic publish: staging dir absent after success; package dir present |
| PF-N1 | Wrong isolation → abort; no success package under `preflight/` |
| PF-N2 | READ ONLY not on → abort |
| PF-N3 | Missing `transaction_timestamp` → abort |
| PF-N4 | `dbTransactionTime` outside preflight host bounds → abort |
| PF-N5 | Any business SELECT attempted → abort |
| PF-N6 | Secretish string in package members → fail closed |
| PF-N7 | Overwrite existing `preflightId` → reject |
| PF-N8 | Unsafe `preflightId` → reject before write |
| PF-N9 | Usability gate fail (missing root / not writable) → refuse before TX |
| PF-N10 | Seal into `observations/` tree → reject (wrong subtree) |
| PF-N11 | Handoff copy digest mismatch → handoff invalid |

### 10.2 Nonfixture observation (later; after preflight path)

| ID | Intent |
|----|--------|
| NF-P1 | Seal package with ZIP + **report member** + sidecar + metadata + correspondence + manifests under `observations/` |
| NF-N1 | Live path null `dbTransactionTime` → fail closed |
| NF-N2/N3 | `dbTransactionTime` &lt; start or &gt; end → fail closed |
| NF-N4/N5 | Missing `workflowRunCompletedAt` or `artifactCreatedAt` → `archive_chronology_missing` |
| NF-N6 | Runner-log-only or unlabeled derived value rejected as `workflowRunCompletedAt` |
| NF-N7 | `PROVENANCE.json` forbidden on nonfixture seal path |
| NF-N8 | Credentials pattern in members → reject |
| NF-N9 | Fixture `liveAccepted` promotion attempt → reject |
| NF-N10 | P-OBSERVE without reviewed successful P-PREFLIGHT → refuse before TX |
| NF-N11 | Unchosen / unusable retain destination → refuse before TX |
| NF-N12 | G5-PRE package check fails when report member missing or digest mismatch |

Inherited G4 fixture suite at `6c2b310…` remains the offline baseline; nonfixture tests are additive and separately authorized.

---

## 11. Smallest subsequent offline task (do not implement now)

**Task:** Offline **preflight-runner implementation** (fixture-only) that:

1. Implements metadata-only P-PREFLIGHT against the **mock** RepeatableRead adapter (no real DB/pooler).  
2. Seals success/failure evidence using the **`R-LOCAL-FS` layout rules** of §5.5 against a **test temp root** (not the operator research root; not AgentStores).  
3. Enforces safe ids, staging/atomic publish, no overwrite, digest verification, credential exclusion, and usability-gate refusals.  
4. Passes the **required fixture tests** in §10.1 (PF-P1–P3, PF-N1–N11).

**Out of scope for that task:** real pooler connection, P-PREFLIGHT production execution, P-OBSERVE, directory creation under the operator research root, W6 chronology resolution, derived timestamp mapping, registry approvals, merges, G6–G8, Week 7 ops.

**Still blocked after that implementation (until separate authorities):** live P-PREFLIGHT execution; any P-OBSERVE (hard preflight review gate + unresolved W6 chronology + unverified operator destination).

---

## 12. Holds

No implementation/tests; no commit/push; no PR changes/merge; no live retrieval; no credentials; no DB/pooler access; no observation; no dispatch; no approval issuance; no registration; no calibration; no 2025 access; no Week 7 operational actions; no production target selection; no evidence-directory creation; no durability/usability checks claimed run; no derived timestamp mapping approved; W6 chronology remains unresolved.

**Stop for independent review.**
