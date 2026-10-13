# ML-CAL-1 G4 Nonfixture + Pooler-Preflight Procedure Design — Recovery

**Date:** October 13, 2026 (America/Chicago)  
**Status:** Offline procedure design — F1–F3 accepted at design scope; **`R-LOCAL-FS` retention decision proposal appended** — stop for independent review  
**Companion:** `research/moneyline/ML_CAL_1_G4_NONFIXTURE_OBSERVER_POOLER_PREFLIGHT_PROCEDURE_DESIGN_20261013.md`

---

## Worktree / HEAD

| Item | Value |
|------|-------|
| Path | `C:\Users\Bobby\gridiron-edge-v1\Gridiron-Edge-V1-ml-cal-1-g5-pre` |
| Branch | `feat/ml-cal-1-trusted-retrieval-lineage-g5-pre-fixture-v1` |
| Local HEAD | `1683ce36fbb5a981a2b3ba3d8a9b90ea8da37f25` |
| Accepted G5-PRE tip | `1683ce36fbb5a981a2b3ba3d8a9b90ea8da37f25` |
| Match | **HEAD_OK** — history not amended |
| Commit/push this design | **Forbidden** — local untracked markdown only |

Prior local assessment (still uncommitted, preserved):

- `ML_CAL_1_G5_LIVE_PREREQUISITE_REVIEW_20261013.md`
- `ML_CAL_1_G5_LIVE_PREREQUISITE_RECOVERY_20261013.md`

---

## Deliverables

| Path | Role |
|------|------|
| `research/moneyline/ML_CAL_1_G4_NONFIXTURE_OBSERVER_POOLER_PREFLIGHT_PROCEDURE_DESIGN_20261013.md` | Procedure design + §5.5 retention proposal |
| `research/moneyline/ML_CAL_1_G4_NONFIXTURE_OBSERVER_POOLER_PREFLIGHT_PROCEDURE_RECOVERY_20261013.md` | This recovery note |

### Digests (closeout)

| File | SHA-256 |
|------|---------|
| Design note | `d4d75759a1c347f81f84082f8963bb110760a32e24c0e832e70f5cceb692ca67` |
| Recovery note | reported in session closeout after finalize |

---

## Append summary — retention-profile decision proposal

| Item | Content |
|------|---------|
| Recommended initial profile | **`R-LOCAL-FS`** |
| Proposed root | `<OPERATOR_RESEARCH_RETAIN_ROOT>/ml-cal-1/g4/…` — **outside** git repos and **outside** AgentStores |
| Subtrees | Separate `preflight/`, `observations/`, plus `staging/`, `review-handoff/` |
| Seal rules | Safe ids; staging → atomic publish; no overwrite; digest verify pre/post publish |
| Handoff | Digest-verified copies + `HANDOFF.json` only after seal |
| Credentials | Excluded from retain tree and package members |
| Usability | §5.5.7 checks required before execution |
| Directories created this task | **No** |
| Usability/durability checks run | **No** — destination remains **PROPOSED / UNVERIFIED** |
| W6 chronology | Still **UNRESOLVED** |
| Derived timestamp mapping | **Not approved** |

---

## Prior F1–F3 (still in force)

Hard P-PREFLIGHT gate; destination gate; chronology provenance classes; lifecycle report required by G5-PRE validation and observation seal; mandatory live `dbTransactionTime`; MVCC caveat; G8 before publication.

---

## Key unresolved prerequisites

- Acceptance of §5.5 `R-LOCAL-FS` proposal.  
- Operator root config + **actual** usability verification (not done).  
- Offline preflight-runner implementation (§11) not started.  
- Live P-PREFLIGHT / P-OBSERVE not authorized.  
- W6 `workflowRunCompletedAt` **UNRESOLVED**.  
- G5 trust / G6–G8 closed.

---

## Smallest subsequent offline task (not implemented now)

**Preflight-runner implementation (fixture-only):** mock RepeatableRead metadata-only path; seal to test temp root under `R-LOCAL-FS` layout rules; pass §10.1 fixture tests PF-P1–P3 and PF-N1–N11. No real DB/pooler, no operator retain-root creation, no observation, no chronology resolution.

---

## Holds

No implementation/tests, commit/push, merge, retrieval, DB/pooler, observation, approvals, registration, calibration, operational changes, evidence-directory creation, or claimed durability checks.

**Stop for independent review.**
