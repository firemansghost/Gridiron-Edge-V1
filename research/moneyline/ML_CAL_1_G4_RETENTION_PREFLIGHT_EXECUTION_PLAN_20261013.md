# ML-CAL-1 G4 — Operator Retention Setup + Metadata-Only P-PREFLIGHT Execution Plan

**Date:** October 13, 2026 (America/Chicago)  
**Status:** Planning only — F1 preserved; F2/F3 strengthened; **no** setup, execution, commit, push, or PR  
**Authority:** Bobby authorized preparing/revising this reviewable plan; this document does **not** authorize Phase A setup or Phase B live execution  
**Companion recovery:** `research/moneyline/ML_CAL_1_G4_RETENTION_PREFLIGHT_EXECUTION_PLAN_RECOVERY_20261013.md`  
**Revision:** F1 unchanged; F2 reader contract (package-ID, run↔TX↔design, TX options/completion, timestamps, contradiction, separately supplied expected manifest digest); F3 nonsecret connection-descriptor binding (not profile-name equality)

---

## 0. Resume checkpoint (local facts)

| Item | Value | Class |
|------|-------|--------|
| Worktree | `C:\Users\Bobby\gridiron-edge-v1\Gridiron-Edge-V1-ml-cal-1-g4-preflight-adapter` | observed |
| Branch | `feat/ml-cal-1-g4-pooler-preflight-real-adapter-v1` | observed |
| Local HEAD | `cbb0d25d03294439baccf4da5e4e6e50e36fe035` | observed |
| Expected accepted #254 tip | `cbb0d25d03294439baccf4da5e4e6e50e36fe035` | **match — no difference** |
| Base #253 tip | `7375d9ba1b3e8c1d5b0b337958b537cc0334fc10` | retained pin |
| G5-PRE #252 tip | `1683ce36fbb5a981a2b3ba3d8a9b90ea8da37f25` | retained pin |
| Working tree | clean vs origin (no local edits before this plan) | observed at plan start |
| #254 capability | Offline mocked real-adapter + fixture compatibility only | accepted offline |
| Independent CI (accepted tip) | run `38473481716`, job `115558242527`; synthetic merge `662dc7adaf8660a8fb39be45f7ef550e7eadaec7` of tip into #253 | supplied checkpoint / not re-fetched here |
| Deployed pooler proof | **Not accepted** | observed gap |

### Design pin (Git/LF bytes)

| Source | SHA-256 |
|--------|---------|
| Required pin | `55d4a3d72877abcf154461a6504bb702791339b41721729116472187fab7c95f` |
| `git cat-file -p HEAD:…DESIGN…` (LF, 0 CR) | `55d4a3d72877abcf154461a6504bb702791339b41721729116472187fab7c95f` — **match** |
| Working-tree file bytes (CRLF) | `d4d75759a1c347f81f84082f8963bb110760a32e24c0e832e70f5cceb692ca67` — **not** the pin |

Do not equate Windows CRLF working-tree bytes to the Git/LF pin. Accepted design content remains unchanged by this plan.

### Local dependency inventory (read-only)

| Path | Role |
|------|------|
| `apps/jobs/lib/ml-cal-1-g4-pooler-preflight-real-adapter.ts` | Passive injected-Prisma metadata TX adapter; construction-time enable latch; frozen TX options; RO→metadata latches; awaits `$transaction` |
| `apps/jobs/lib/ml-cal-1-g4-pooler-preflight-fixture.ts` | Fixture runner `runG4FixturePreflight` + seal/validate/copy; **tmpdir-only** retain roots; fixture schemas/kinds |
| `apps/jobs/__tests__/ml-cal-1-g4-pooler-preflight-real-adapter.test.ts` | Offline mocked Prisma |
| `apps/jobs/__tests__/ml-cal-1-g4-pooler-preflight-fixture.test.ts` | Fixture PF + F1–F5 |
| `research/moneyline/ML_CAL_1_G4_NONFIXTURE_OBSERVER_POOLER_PREFLIGHT_PROCEDURE_DESIGN_20261013.md` | Procedure design (LF pin above) |
| `research/moneyline/ML_CAL_1_G4_NONFIXTURE_OBSERVER_POOLER_PREFLIGHT_PROCEDURE_RECOVERY_20261013.md` | Design/fixture recovery |
| `research/moneyline/ML_CAL_1_G4_POOLER_PREFLIGHT_REAL_ADAPTER_RECOVERY_20261013.md` | Adapter recovery |

### Entrypoint audit (critical)

| Candidate | Exists? | Can execute complete live P-PREFLIGHT? |
|-----------|---------|----------------------------------------|
| Nonfixture CLI / `apps/jobs/*g4*preflight*.ts` runner outside lib | **No** | N/A |
| `createG4PoolerPreflightRealAdapter` | Yes (library) | **No** — passive adapter; no CLI, no clock ownership, no seal, no credential wiring |
| `runG4FixturePreflight` | Yes | **No for deployed proof** — fixture mode, `os.tmpdir()` retain only, fixture provenance/`liveAccepted:false` forever on that path |

**Conclusion:** A passive adapter is not a CLI/runner. The fixture runner must not be used as deployed pooler proof and must keep its `os.tmpdir()` constraint and fixture provenance. Completing Phase B live execution requires a **new, separately reviewed offline nonfixture runner** (see §Phase B prerequisite) before any live-authority request.

Prior draft existed locally uncommitted; this revision **resumes and amends** that draft for F1–F3 (design-only). HEAD and accepted code/design pins are preserved.

---

## F1–F3 Design revision (required before any future offline runner or live attempt)

These clauses refine the plan only. They do **not** authorize implementation, operator-root setup, or live connection. Accepted fixture schemas/kinds and the real-adapter library remain unchanged on HEAD `cbb0d25…`.

### F1 — Mock / live / probe provenance (mutually exclusive)

Every sealed preflight-related package and every Phase A probe receipt **must** declare exactly one provenance class. Classes must not be relabeled after seal.

| Provenance class | Where used | Required markers | Forbidden claims |
|------------------|------------|------------------|------------------|
| **`mock`** | Offline CI / unit tests using injected Prisma or `createMockPreflightTxAdapter`; disposable layout doubles | `provenanceClass: "mock"`; fixture schema **or** explicit `mockProvenance: true`; retain root under test temp / `os.tmpdir()` (or test double clearly labeled mock) | Deployed pooler proof; `liveAccepted: true`; operator-root seal as live |
| **`live`** | Future authorized single P-PREFLIGHT against intended pooled profile | `provenanceClass: "live"`; **nonfixture** package schema (distinct from fixture-v1); `fixtureProvenance: false`; `mockProvenance: false`; `probeProvenance: false`; runner commit SHA; pooler profile **name** only | Self-set `approved` / `liveAccepted`; fixture schema ids; tmpdir-as-operator-root |
| **`probe`** | Phase A setup-only FS usability packages / receipts | `provenanceClass: "probe"`; `probeProvenance: true`; no TX evidence members claiming real metadata; no Prisma activity | Any TX success; deployed proof; observation binding |

**Hard rules**

1. Fixture packages remain `mock` (or fixture-equivalent) forever on the accepted fixture path — never promoted to `live`.  
2. Phase A disposable packages are `probe` only — never accepted as P-PREFLIGHT success.  
3. A hash-consistent package is still unapproved; provenance class does not grant trust.  
4. Reader and review checklists must reject class mismatch (e.g. fixture schema + `provenanceClass: "live"`).

### F2 — Complete reader verification contract + external digest anchor

#### F2.1 Reader verification contract (proposed nonfixture reader — not implemented)

A future nonfixture reader (separate from fixture `validateG4PreflightPackage`) must fail closed unless **all** of the following pass. Fixture validation remains the fixture-only contract and must not be weakened. **Passing every digest recomputation does not waive semantic/contradiction checks.**

| Check id | Requirement |
|----------|-------------|
| R1 | Package directory exists; required members present exactly once (no extras that fail allowlist if allowlist is declared) |
| R2 | Each member byte SHA-256 and byteCount match `PACKAGE_MANIFEST.json` |
| R3 | `PACKAGE_MANIFEST.sha256` matches the canonical bytes of `PACKAGE_MANIFEST.json` |
| R4 | Schema/kind ids are the **nonfixture** live schema set (not fixture-v1) when claiming `provenanceClass: "live"`; probe/mock schemas accordingly |
| R5 | `credentialsPresent: false`; secretish scan clean; no connection strings / bearer / password / raw URL material in any member |
| R6 | `liveAccepted: false` and `approved: false` at seal time |
| R7 | Provenance class markers consistent (F1); `fixtureProvenance` false for live |
| R8 | Design correspondence carries design Git/LF pin `55d4a3d7…` and does not contradict accepted design |
| R9 | **Safe package-ID agreement:** directory basename `<preflightId>/`, manifest `preflightId` / package id field, and every member that carries an id **agree exactly** (safe-id charset; no path segments; no `..`) |
| R10 | **Run ↔ TX ↔ design correspondence:** `preflight-run-metadata` fields that name design pin, runner commit, adapter kind, TX options, isolation/RO results, and timestamps are consistent with `preflight-tx-evidence` and `design-correspondence` (same pin, same adapter kind, same option values, no conflicting success/failure claims) |
| R11 | **Exact transaction options** recorded and equal to the frozen contract: isolation `RepeatableRead`, `maxWait=10000`, `timeout=15000` (and match adapter `transactionOptions` identity in evidence) |
| R12 | **Successful awaited TX completion** asserted for live success packages: evidence shows the interactive `$transaction` completed successfully after RO+validated metadata (not merely that hashes exist); failure/abandoned TX cannot present as success |
| R13 | **Finite valid timestamps and clock bounds:** `preflightStartTime`, `dbTransactionTime`, `preflightEndTime` (and any sealed server-clock diagnostics used in bounds) are finite, parseable instants; `preflightStartTime ≤ dbTransactionTime ≤ preflightEndTime`; reject NaN/Inf/unparseable/out-of-order |
| R14 | Isolation/RO fields match contract (`repeatable read` / `on`) for live success |
| R15 | Source identity present for live: runner commit (40-hex), adapter kind |
| R16 | **Contradictory evidence rejection:** if any semantic contradiction is detected among members (e.g. success flag with failure reason, TX options ≠ contract, id mismatch, timing impossible, provenance class conflict), **reject even when all member and manifest hashes recomputed successfully** |
| R17 | **External digest anchor** (F2.2): `externallyAnchored` only when a **separately supplied expected** `PACKAGE_MANIFEST.sha256` matches the on-disk manifest digest — see F2.2 |
| R18 | Expected-versus-actual target binding (F3) for live; probe/mock use their own expected descriptors |

Reader outputs a structured result: `internallyConsistent` / `externallyAnchored` / `targetBound` / `rejected` with reasons. None of these flags equal independent research approval or deployed-proof acceptance.

#### F2.2 External digest anchor (separately supplied expected digest)

Internal re-hash of package members is necessary but **insufficient** for `externallyAnchored`.

| Anchor kind | Definition | Status in this plan |
|-------------|------------|---------------------|
| **Internal manifest anchor** | `PACKAGE_MANIFEST.sha256` + per-member digests inside the package | Required for every sealed package; yields at most `internallyConsistent` |
| **External digest anchor** | A **separately supplied expected** manifest digest (operator/review pin or authority receipt field), compared to the recomputed on-disk `PACKAGE_MANIFEST.sha256` | Required for `externallyAnchored` |

**Rules**

1. `externallyAnchored = true` only if the caller/review process supplies `expectedManifestSha256` **independently of discovering it by reading the package or a co-located handoff file in the same trust step**.  
2. **Discovered handoff bytes are untrusted until independently pinned.** Finding `review-handoff/.../HANDOFF.json` (or similar) next to a package and reading `manifestSha256` from it does **not** by itself create an external anchor. That handoff may be copied, stale, or adversarial relative to the package under review.  
3. After an independent pin exists (e.g. recorded in a reviewed authority note, offline review checklist, or previously accepted receipt held outside the package tree), the reader may compare: `expectedManifestSha256 === onDiskManifestSha256` (and optionally verify handoff copy digests against that same expected value).  
4. Recomputing digests only inside the package never creates an external anchor.  
5. Mismatch → reject; do not “repair” in place.  
6. External anchor ≠ deployed pooler proof and ≠ registry approval.  
7. No credentials in any anchor carrier.

### F3 — Expected-versus-actual target binding (nonsecret connection descriptor)

Live packages must bind **what was intended** to **what was used to construct the client**, without credentials, without added SQL, and **without treating pooler profile-name equality as target proof**.

#### F3.1 What is not sufficient

| Insufficient as target proof | Why |
|------------------------------|-----|
| Equality of `expectedPoolerProfileName` vs a recorded profile-name label alone | Names are operator labels; they do not prove which host/port/database/user the client was built from |
| Any password, full URL, or query-string secret comparison | Forbidden in packages; must not be used as proof |
| Database-observed session/role from extra SQL | Fixed metadata SQL does not establish role; adding SQL is forbidden |

Optional nonsecret **labels** (profile name, retain-root label) may still be recorded for humans but are **not** the F3 binding predicate for live TX target.

#### F3.2 Independently supplied expected nonsecret connection descriptor

Before live TX, the operator/review process supplies an **expected** descriptor (not read back from the package under test as its own proof):

| Field | Included | Excluded |
|-------|----------|----------|
| `host` | yes | — |
| `port` | yes | — |
| `database` | yes | — |
| `configuredUsername` | yes (configured user name only) | password; auth tokens |
| URL query / SSL option secrets | **no** | all query parameters and secret-bearing options |
| Full connection string / `DATABASE_URL` | **no** | never sealed or compared as a raw string |

Normalization rules (host case, default port elision, etc.) are an implementation-review detail; missing required fields → `TARGET_INCOMPLETE`.

#### F3.3 Actual descriptor (derived from exact client-construction configuration)

| Field | Source (allowed) | Forbidden |
|-------|------------------|-----------|
| `actualHost` / `actualPort` / `actualDatabase` / `actualConfiguredUsername` | Parsed **locally** from the exact nonsecret configuration object/env material used to construct the Prisma/parent client for this attempt — password and query secrets stripped before any seal or compare | Opening a DB connection “to see who I am”; `SELECT current_user` / `inet_server_addr()` / other **added** queries; writing password or full URL into evidence |
| `actualRetainRootResolved` | OS final path of retain root used for seal (probe and live) | Credential store dump |
| `actualRunnerCommit` / `actualDesignPin` / `actualProvenanceClass` / `actualAdapterKind` | Local runner/design/seal facts | Invented SHA; fixture mock labeled as live adapter |
| `databaseObservedRole` | **Must be recorded as `UNVERIFIED`** under the fixed metadata SQL allowlist (isolation / read_only / timestamps only) | Claiming `current_user` / session role was verified; using metadata timestamps as role proof |

The allowlisted preflight metadata SELECT remains the **only** live SQL. F3 must not add queries.

#### F3.4 Binding verdict and non-claims

| Verdict | Rule |
|---------|------|
| `TARGET_BOUND` | Independently supplied expected nonsecret connection descriptor equals actual descriptor derived from client-construction config (host/port/database/configuredUsername); provenance class matches; retain-root expected/actual agree when applicable |
| `TARGET_MISMATCH` | Any required expected≠actual → fail closed; no success seal (live) or setup “VERIFIED_USABLE” claim (probe path binding) |
| `TARGET_INCOMPLETE` | Required expected/actual field missing → fail closed |

**Explicit non-claims (even when `TARGET_BOUND`):**

1. The descriptor does **not** prove the server’s true network identity (no TLS channel binding / no reverse DNS / no live probe of the far end beyond the single authorized metadata TX).  
2. The descriptor does **not** prove the effective database role; `databaseObservedRole` remains **`UNVERIFIED`**.  
3. `TARGET_BOUND` does not set `liveAccepted` / `approved` and is not deployed pooler proof.

---

## 1. Gate distinctions (do not collapse)

| Gate | Role in this plan |
|------|-------------------|
| **Phase A** | Operator retention setup only — separate authority from any DB touch |
| **Phase B** | One metadata-only **P-PREFLIGHT** attempt — separate authority from Phase A and from P-OBSERVE |
| **P-OBSERVE** | Later; needs reviewed successful deployed preflight + usable retention + resolved W6 chronology + reviewed observer — **out of scope to execute** |
| W6 archive chronology | Still **UNRESOLVED** — does **not** block drafting/assessing this metadata-only plan; **does** remain an observation/binding prerequisite |
| G5 live trust/lineage, G6 registration, G7 enablement, G8 publication | Later gates — not selected here |
| Production target week | **None** selected |
| #243 | Remains unregistered; live research **BLOCKED**; 2025 sealed |

### W6 operational pins only (not research-approved; chronology unresolved)

| Pin | Value |
|-----|-------|
| Run | `38294539460` |
| Artifact | `11768795102` |
| Lifecycle producer | `c37b5d367a364398d479c52844466aa4fd3306c2` |
| ZIP SHA-256 | `781c9cbf3efdddff0b9182cbe419b7097a273927aa0a945b861d26c366b102d3` |
| Report SHA-256 | `b03114a43ac1347c7e8559efb0c807a08922e70350d8ee1b5206165a34ae635a` |

Workflow completion provenance remains **UNRESOLVED**. Do not assume a workflow-run REST `completed_at` or substitute job/log/artifact timestamps.

### Production ops lane (context only; not redone here)

| Fact | Value |
|------|-------|
| Last verified `main` | `1f5b6324767f8a5832726d5828247ad022961b2b` |
| Betting Ticket W7 | Observed refreshes (prior readback) |
| Generic Stage C | run `38476722318` — market refresh |
| Generic Stage D | run `38478426603` — three closing inserts (Core/roster/Elo) |
| Full W7 coverage | **Not** claimed |
| Frozen official card | Prior accepted 102 / $10,200 — do not reconnect DB from this plan |

---

## Phase A — Operator retention setup only

**Future authority required.** This phase creates/verifies a local evidence root. It does **not** authorize any database/pooler connection, credential probe, or P-PREFLIGHT TX.

### A.1 Proposed root (PROPOSED / UNVERIFIED)

| Field | Value |
|-------|-------|
| Profile | `R-LOCAL-FS` (design §5.5 recommendation) |
| Proposed root | `C:\Users\Bobby\GridironResearchEvidence` |
| Status | **PROPOSED / UNVERIFIED** — not inspected, created, or tested in this planning task |
| Role | Evidence storage under R-LOCAL-FS — **not** an approved trust-anchor store |

Proposed layout (creation deferred):

```text
C:\Users\Bobby\GridironResearchEvidence\          # PROPOSED root — UNVERIFIED
  ml-cal-1\
    g4\
      preflight\          # sealed P-PREFLIGHT packages
      observations\       # later P-OBSERVE only (not Phase B)
      staging\            # ephemeral seal only
      review-handoff\     # digest-verified copies for review
```

Exact subdirectories under `ml-cal-1/g4/`: `preflight/`, `observations/`, `staging/`, `review-handoff/`.

### A.2 Future physical-location resolution (proposed checks — do not run now)

When separately authorized, setup must resolve and record:

1. **Canonical absolute path** of the root (Win32 GetFinalPathName / equivalent) after rejecting reparse points.  
2. **Exclusion:** path must not resolve inside any Gridiron git worktree/clone, Cursor AgentStores (`…\AgentStores\…`), OS temp (`%TEMP%` / `os.tmpdir()`), CI scratch, or browser download cache.  
3. **Symlink / junction / reparse / escape:** refuse if root or any `ml-cal-1/g4` subtree component is a symlink/junction/reparse point, or if a probe path escapes the resolved root via `..` / alternate streams.  
4. **Local volume only:** confirm the volume is a fixed local disk (not mapped network drive / cloud-synced folder / subst to remote) using OS volume attributes — record volume label/serial **without** credentials. If sync-client markers are detected (e.g. OneDrive/Dropbox roots), fail closed unless a later reviewed exception.  
5. **No credential material** at or under the root (no `.env`, connection strings, key files).  
6. **Not a trust store:** success of FS checks never issues research approval, registry pins, or `liveAccepted`.

### A.3 Proposed create / write / read / hash / atomic-publish / no-overwrite checks

All commands below are **proposed operations only** — not executed by this task.

Safe disposable test IDs (examples): `preflight-setupprobe-20261013a`, `handoff-setupprobe-20261013a` — charset/length must satisfy existing `isSafeG4PreflightId` / observation-id safety class; reject path separators and `..`.

| Step | Proposed check | Pass criteria |
|------|----------------|---------------|
| A3.1 | Resolve + record root final path | Outside repo/AgentStores/temp; local volume; no reparse |
| A3.2 | Create `ml-cal-1/g4/{preflight,observations,staging,review-handoff}/` if absent | Directories exist; unrelated sibling files untouched |
| A3.3 | Write probe under `staging/.probe-<uuid>` then read back + SHA-256 | Byte-identical read; then **narrow delete of probe only** |
| A3.4 | Refuse publish to existing `preflight/<id>/` | No-overwrite enforced |
| A3.5 | Stage tiny dummy members under `staging/.tmp-<id>-<uuid>/`, hash, atomic rename into `preflight/<id>/`, re-hash; members must declare `provenanceClass: "probe"` (F1) | Manifest digests match post-publish; not readable as live |
| A3.6 | Copy sealed probe package to `review-handoff/<handoffId>/` + verify every member digest; write `HANDOFF.json` with observed `manifestSha256` | Copy digests match; **handoff bytes remain untrusted as external anchor until independently pinned** (F2.2) |
| A3.7 | Expected-versus-actual retain-root path binding for probe (no DB); record that live F3 connection-descriptor binding is N/A for probe | Path `TARGET_BOUND` or fail closed; no VERIFIED_USABLE on mismatch |
| A3.8 | Narrow cleanup of **only** the disposable probe package + handoff ids | No recursive wipe of root; preserve unrelated files |
| A3.9 | Record free space + path-length headroom | Sufficient for future real packages |

**Durability limit (must be stated in setup receipt):** a single local disk has no independent replica; disk failure or silent local corruption can lose evidence. Backup/handoff verification (§A3.6) mitigates distribution risk but is **not** multi-site durability.

### A.4 Proposed command sketch (illustrative — not run)

```text
# PROPOSED ONLY — future authorized setup operator
# 1) Resolve path / volume / reparse (PowerShell Get-Item, GetFinalPathNameByHandle, Win32_Volume)
# 2) New-Item -ItemType Directory for ml-cal-1/g4/{preflight,observations,staging,review-handoff}
# 3) Probe write/read/hash/delete under staging only
# 4) Atomic publish probe package; copy-away verify; delete only probe ids
# 5) Write SETUP_RECEIPT.json (profile, root label, check pass/fail, host time) — credentialsPresent:false
```

Forbidden in Phase A: recursive deletion of the root, credential copying, broad environment dumps, automatic trust issuance, any Prisma/DB connect “to see if credentials work,” network fetch of secrets.

### A.5 Authorization boundary

| Allowed under Phase A authority | Forbidden under Phase A alone |
|--------------------------------|-------------------------------|
| Create/verify local directories under the proposed root | Any DATABASE_URL / DIRECT_URL / pooler connection |
| Disposable probe seal + handoff verify + narrow cleanup | P-PREFLIGHT TX / metadata SELECT |
| Record UNVERIFIED→VERIFIED_USABLE setup receipt after checks | Setting `approved` / `liveAccepted` / deployed-proof claims |

**No success claim** that the root is usable until A3 checks execute under separate authority and are independently reviewed.

---

## Phase B — One metadata-only P-PREFLIGHT attempt

**Future authority required** (distinct from Phase A). Requires Phase A destination **verified usable** first.

### B.1 Prospective runner identity (audit result)

| Field | Current status |
|-------|----------------|
| Exact prospective runner path | **MISSING** — no nonfixture CLI/entrypoint exists on HEAD `cbb0d25…` |
| Library adapter path | `apps/jobs/lib/ml-cal-1-g4-pooler-preflight-real-adapter.ts` (`createG4PoolerPreflightRealAdapter`) — not a runner |
| Fixture runner path | `apps/jobs/lib/ml-cal-1-g4-pooler-preflight-fixture.ts` (`runG4FixturePreflight`) — **not** deployed proof |
| Source commit for a future live attempt | The **eventual implemented runner’s exact commit** (40-hex) after offline review — **not** fabricated here; **not** assumed equal to `cbb0d25…` merely because the adapter exists |
| Design pin | `55d4a3d72877abcf154461a6504bb702791339b41721729116472187fab7c95f` |
| Endpoint / role identity | Nonsecret descriptor only: intended Prisma pooled profile name for `DATABASE_URL` (pooler); `DIRECT_URL` is **not** the preflight path absent a reviewed exception — **never** connect in this planning task to discover endpoint |
| Strict opt-in gate | Construction-time `enabled === true` latch on real adapter; runner must add a separate explicit live opt-in that cannot default on |
| Clock owner | **Runner** (not adapter): host start before TX open; host end after TX completion/failure |
| Proof package sealer / reader | Fixture sealer exists but is tmpdir+fixture-schema bound; **nonfixture** sealer/reader **MISSING** |
| Error handling / shutdown | Adapter latches RO/metadata failures and redacts; runner must fail closed, write failure receipt, close Prisma, no retry stitch |

**Do not propose executing an invented command.** Do not remove the fixture runner’s `os.tmpdir()` constraint or fixture provenance.

### B.2 Smallest offline implementation prerequisite (before live authority)

Recorded for separate review — **not implemented in this task**.

#### Proposed new files (smallest set)

| Proposed path | Purpose |
|---------------|---------|
| `apps/jobs/lib/ml-cal-1-g4-pooler-preflight-live-runner.ts` (name illustrative) | Nonfixture P-PREFLIGHT orchestration: clock, single TX via real adapter, F1–F3 seal fields, seal to **operator** R-LOCAL-FS root, failure receipts |
| `apps/jobs/lib/ml-cal-1-g4-pooler-preflight-live-reader.ts` (name illustrative) | Nonfixture reader implementing F2.1 + F2.2 + F3 — distinct from fixture validator |
| `apps/jobs/run-ml-cal-1-g4-pooler-preflight-live.ts` (CLI entry; illustrative) | Thin argv/env opt-in CLI — still offline-testable with injected prisma/fs |
| `apps/jobs/__tests__/ml-cal-1-g4-pooler-preflight-live-runner.test.ts` | Offline mocked Prisma + temp **operator-layout** root (not production root); provenance/reader/binding regressions |

Optional shared seal helpers may be factored from fixture code **without** relaxing fixture tmpdir rules or relabeling fixture packages as live.

#### Proposed nonfixture schema distinction

| Concern | Fixture (accepted; unchanged) | Proposed nonfixture |
|---------|-------------------------------|---------------------|
| Package schema id | `ml-cal-1-g4-pooler-preflight-package-fixture-v1` | New distinct id, e.g. `…-package-live-v1` (final string chosen at implementation review) |
| Provenance schema | `…-provenance-fixture-v1` / `fixtureProvenance: true` | **No** fixture provenance; `fixtureProvenance: false`; `provenanceClass: "live"` (F1) |
| `readMode` | `fixture_injected` | Live metadata path (not fixture) |
| Retain root | Must be under `os.tmpdir()` | Verified Phase A operator root only |
| Reader | `validateG4PreflightPackage` (fixture) | Separate live reader (F2) — must not accept fixture packages as live |
| Target binding | N/A / fixture | Expected-versus-actual nonsecret binding (F3) |
| `liveAccepted` / `approved` / deployed flags | Always false | Always false at seal time — independent review may later accept deployed proof; runner never self-approves |

Fixture contract and evidence remain unchanged and must not be accepted as deployed pooler proof.

#### Acceptance criteria (offline PR — before any live request)

1. Mocked Prisma: exactly one `$transaction`, RepeatableRead, `maxWait=10000`, `timeout=15000`, same client `SET TRANSACTION READ ONLY` then fixed metadata SELECT.  
2. Construction-time enable + runner opt-in both required; mutation of caller options cannot enable.  
3. Latched RO/metadata/validation failures cannot produce success seal; TX completion awaited.  
4. Host start ≤ `dbTransactionTime` ≤ host end enforced; fail closed on timing/metadata/TX loss — no clock clamp, offset correction, fallback query, or success seal after failure.  
5. Seals only under a test root mimicking R-LOCAL-FS layout **or** a disposable directory under a test double of Phase A — never auto-writes the real proposed root in CI.  
6. Atomic staging → publish, no overwrite, post-publish re-hash, copy-away verify, secretish redaction.  
7. Success package never sets `approved` / `liveAccepted` / self-declared deployed proof.  
8. Failure receipt path distinct; credentials never in members.  
9. Fixture suite still passes unchanged; no removal of tmpdir gate.  
10. **F1:** mock vs live vs probe provenance markers enforced; cross-class rejection tests (unchanged).  
11. **F2:** reader implements R1–R18 including package-ID agreement, run↔TX↔design correspondence, exact TX options, awaited TX completion, finite clock bounds, contradiction rejection after hash recompute; `externallyAnchored` requires separately supplied `expectedManifestSha256`; discovered handoff untrusted until independently pinned.  
12. **F3:** binding uses independently supplied expected nonsecret connection descriptor vs actual from client-construction config (host/port/database/configuredUsername); profile-name equality alone insufficient; `databaseObservedRole=UNVERIFIED`; no credentials; no SQL beyond fixed metadata allowlist; mismatch → no success seal.

**Distribution/merge** of that offline PR into `main` or into #253/#254 stacks is an **explicit later review item** — not required merely to keep this plan as local uncommitted notes.

### B.3 Future live attempt procedure (after offline runner + Phase A usable + separate live authority)

#### B.3.1 Preconditions

- Phase A setup receipt: destination **VERIFIED_USABLE**.  
- Offline nonfixture runner merged/available at a recorded exact commit SHA.  
- Explicit P-PREFLIGHT live authority (who/when/scope/profile name).  
- Operator environment holds credentials; **never** written into packages.  
- Strict runner opt-in + adapter `enabled: true` at construction.  
- Target package id unused under `…/g4/preflight/<preflightId>/`.

#### B.3.2 TX contract (exact)

1. Record host `preflightStartTime`.  
2. Exactly one interactive Prisma `$transaction`: isolation `RepeatableRead`, `maxWait=10000` ms, `timeout=15000` ms.  
3. Same TX client: fixed `SET TRANSACTION READ ONLY`, then fixed allowlisted metadata SELECT (adapter SQL constants).  
4. Validate isolation = repeatable read, read_only = on, mandatory `transaction_timestamp()` → `dbTransactionTime`.  
5. `businessDataWrites=0`, `providerCalls=0`; no business tables, ratings, games, outcomes, bets, markets, providers, DDL, persistent DB writes.  
6. Await TX completion; record host `preflightEndTime`.  
7. Require `preflightStartTime ≤ dbTransactionTime ≤ preflightEndTime`.  
8. Fail closed on timing/metadata/transaction loss; **no** automatic retries, workflow dispatch, clock clamp, offset correction, fallback query, or success seal after failure. New attempt = new id + new timing evidence.

Keep adapter failure latches and construction-time enablement.

#### B.3.3 Retained nonfixture preflight package members (success)

Unapproved, credential-free (design §3.4 + nonfixture schema):

| Member | Content |
|--------|---------|
| `preflight-run-metadata.json` | Authority id, safe `preflightId`, source commit SHA, design pin, exact TX options, start/end, `dbTransactionTime`, isolation/RO, server-clock diagnostics, zero writes/providers, F1 `provenanceClass: "live"`, F3 nonsecret connection descriptors (expected+actual; no password/query), `databaseObservedRole: "UNVERIFIED"`, `liveAccepted:false`, `approved:false` |
| `preflight-tx-evidence.json` | Redacted allowlisted metadata only; TX completion/options correspondence fields |
| `design-correspondence.json` | Design note path + Git/LF pin `55d4a3d7…` + runner/adapter identity |
| `PACKAGE_MANIFEST.json` | Per-member SHA-256 + byte counts; schema/kind ids; package id; `credentialsPresent:false`; provenance class |
| `PACKAGE_MANIFEST.sha256` | Manifest digest (internal anchor only) |

No `archive.zip`, lifecycle report, or binding sidecar in preflight packages.

**Atomic seal:** stage under `…/g4/staging/.tmp-<id>-<uuid>/` → digest verify → rename to `…/g4/preflight/<id>/` → re-hash. No overwrite. Directory id must equal sealed package id (F2 R9).

**Copy-away:** optional `review-handoff/<handoffId>/` with full digest match + `HANDOFF.json`. Handoff is **untrusted as external anchor** until its `manifestSha256` is independently pinned and supplied as `expectedManifestSha256` (F2.2).

**Target binding:** F3 nonsecret connection-descriptor compare (not profile-name equality); no added live queries; role remains UNVERIFIED.

**Failure receipt:** structured redacted failure under a non-success path — never a success manifest.

#### B.3.4 Success vs deployed proof

| State | Meaning |
|-------|---------|
| Internally hash-consistent sealed package | Digests + semantic F2 checks (incl. contradiction rejection); still unapproved |
| Externally anchored | Internal consistency **plus** separately supplied `expectedManifestSha256` match (F2.2); discovered handoff alone insufficient |
| Target-bound | F3 `TARGET_BOUND` on nonsecret connection descriptor (host/port/database/configuredUsername) |
| Runner/`liveAccepted`/`approved` | Remain **false** |
| “Deployed pooler proof” | Only after **actual** live execution **and** independent review acceptance — never self-set; F1–F3 alone are insufficient |

### B.4 Explicit non-actions for Phase B planning/live (until authorized)

No invented CLI invocation now; no fixture-as-live; no real connection to check credentials or discover endpoint; no workflow dispatch; no P-OBSERVE; no W6 chronology “fix”; no production target selection.

---

## 2. Unresolved decisions (explicit)

1. Independent acceptance of proposed root `C:\Users\Bobby\GridironResearchEvidence` vs an alternate operator path.  
2. Whether Phase A setup authority is granted before or after offline nonfixture runner implementation.  
3. Final nonfixture package schema string ids and CLI filename.  
4. Whether the offline runner PR targets #254 tip, #253 tip, or a new branch from which base — **distribution/merge choice deferred**.  
5. Independently supplied expected nonsecret connection descriptor (host/port/database/configuredUsername) under live authority — not profile-name equality.  
6. W6 `workflowRunCompletedAt` provenance — remains UNRESOLVED (blocks P-OBSERVE, not this plan draft).  
7. Independent review of any future live success package before calling it deployed proof.  
8. Where/how `expectedManifestSha256` is independently pinned for F2.2 (authority receipt vs offline review checklist); handoff discovery never sufficient alone.  
9. Normalization rules for connection-descriptor and retain-root path comparison (case, default port, Win32 final-path form).

---

## 3. Smallest next implementation / setup task

**Single smallest next offline task (recommended):** Implement and test the **nonfixture P-PREFLIGHT runner + sealer + reader** (§B.2) against mocked Prisma and a disposable R-LOCAL-FS layout double — including F1 provenance, F2 reader/external-anchor, and F3 binding regressions — without touching the proposed operator root, without live DB, without removing fixture tmpdir constraints.

Phase A setup remains a **separately authorized** ops task and may proceed in parallel only under its own authority; it still does not unlock live TX. **Live execution and operator-root setup remain held.**

---

## 4. Holds

No commit/push/PR from this planning revision. No operator-root create/probe. No DB/pooler/credential access. No added live queries. No dispatch, refresh, repair, backfill, P-OBSERVE, registration, calibration, G6–G8, or production model/card/cohort/routing changes. Accepted design/adapter/fixture sources and HEAD `cbb0d25…` unchanged.

**Stop for independent re-review.**
