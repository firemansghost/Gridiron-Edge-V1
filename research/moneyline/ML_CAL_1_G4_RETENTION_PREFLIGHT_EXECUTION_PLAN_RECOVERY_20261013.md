# ML-CAL-1 G4 Retention + Preflight Execution Plan — Recovery

**Date:** October 13, 2026 (America/Chicago)  
**Status:** Local uncommitted planning notes — F1 preserved; F2/F3 strengthened; stop for independent re-review  
**Companion plan:** `research/moneyline/ML_CAL_1_G4_RETENTION_PREFLIGHT_EXECUTION_PLAN_20261013.md`

---

## Worktree / HEAD

| Item | Value |
|------|-------|
| Path | `C:\Users\Bobby\gridiron-edge-v1\Gridiron-Edge-V1-ml-cal-1-g4-preflight-adapter` |
| Branch | `feat/ml-cal-1-g4-pooler-preflight-real-adapter-v1` |
| Local HEAD (preserved) | `cbb0d25d03294439baccf4da5e4e6e50e36fe035` |
| Expected #254 tip | `cbb0d25d03294439baccf4da5e4e6e50e36fe035` — **identical** |
| Base #253 | `7375d9ba1b3e8c1d5b0b337958b537cc0334fc10` |
| G5-PRE #252 | `1683ce36fbb5a981a2b3ba3d8a9b90ea8da37f25` |
| Design Git/LF pin | `55d4a3d72877abcf154461a6504bb702791339b41721729116472187fab7c95f` |
| Git status of plan files | **Untracked / uncommitted** (by design) |

No reset, rebase, cherry-pick, amend, fetch, connection, setup, implementation, commit, push, PR amendment, or accepted-source changes.

---

## Deliverables (local only)

| Path | Role |
|------|------|
| `research/moneyline/ML_CAL_1_G4_RETENTION_PREFLIGHT_EXECUTION_PLAN_20261013.md` | Plan + F1 (preserved) + F2/F3 revision |
| `research/moneyline/ML_CAL_1_G4_RETENTION_PREFLIGHT_EXECUTION_PLAN_RECOVERY_20261013.md` | This recovery note |

---

## F1–F3 revision summary (this pass)

| ID | Status |
|----|--------|
| F1 | **Preserved** — `mock` / `live` / `probe` mutually exclusive; no relabel |
| F2 | **Strengthened** — package-ID agreement; run↔TX↔design correspondence; exact TX options; awaited TX completion; finite clock bounds; contradiction reject after hash recompute; `externallyAnchored` needs separately supplied `expectedManifestSha256`; discovered handoff untrusted until independently pinned |
| F3 | **Strengthened** — profile-name equality **not** target proof; independently supplied expected nonsecret connection descriptor (host/port/database/configuredUsername) vs actual from client-construction config; password/query excluded; `databaseObservedRole=UNVERIFIED`; no server-identity or effective-role claim |

Live execution and operator-root setup remain **held**.

---

## Completed sections

| Section | Content |
|---------|---------|
| Resume | HEAD `cbb0d25…` preserved |
| F1 | Unchanged |
| F2 | R1–R18 + F2.2 separately supplied expected digest |
| F3 | Connection-descriptor binding + UNVERIFIED role |
| Phase A/B cross-refs | Updated for handoff untrusted / F3 non-claims |
| Holds | Setup/live/connection/commit still forbidden |

---

## Tested / executed vs proposed

| Class | Items |
|-------|-------|
| **Executed** | Confirm HEAD; edit local uncommitted plan + recovery only; recompute SHA-256 |
| **Not executed** | Setup; DB connect; added SQL; implementation; commit/push/PR; accepted-source edits |

---

## Unresolved decisions (resume list)

1. Accept/reject proposed retain root path.  
2. Order: Phase A setup authority vs offline runner PR.  
3. Final nonfixture schema/CLI/reader names.  
4. Branch/merge base for offline runner PR.  
5. Independently supplied expected nonsecret connection descriptor under live authority.  
6. W6 workflow completion provenance (still UNRESOLVED).  
7. Independent acceptance of any future live package as deployed proof.  
8. Where/how `expectedManifestSha256` is independently pinned (handoff discovery never enough).  
9. Normalization rules for connection-descriptor and path compare.

---

## Smallest next task

Offline nonfixture runner + sealer + reader with F1–F3 regressions (mocked Prisma only). No operator-root mutation; no live connection.

---

## Holds

No setup, live preflight, observation, dispatch, DB access, commit/push/PR amendment, or production changes.

**Stop for independent re-review.**

---

## Closeout digests (plan pair)

| File | Bytes | SHA-256 |
|------|------:|---------|
| `ML_CAL_1_G4_RETENTION_PREFLIGHT_EXECUTION_PLAN_20261013.md` | 37202 | `1db298dba6188cb4b4d3d6bd45af4239211418c5c47a93f02d501bf43f691ffd` |
