# ML-CAL-1 G4 Observer Design — Recovery Note

**Date:** October 8, 2026 (America/Chicago).  
**Purpose:** Recover context for independent re-review of the G4 read-only lifecycle binding-observer **design** after F1–F4 repairs and the remaining F3 timing correction. Design only — no implementation.

---

## Worktree snapshot (this repair session)

| Item | Value |
|------|-------|
| Worktree | `Gridiron-Edge-V1-ml-cal-1-g3` |
| HEAD | `955cb46bad0ccca40d073a10d2c0aea3adf236a2` |
| Status | Untracked: G4 design + this recovery note only; no staged changes; accepted history untouched |
| Design doc | `research/moneyline/ML_CAL_1_LIFECYCLE_BINDING_OBSERVER_G4_DESIGN.md` |
| Prior binding sidecar design | `research/moneyline/ML_CAL_1_LIFECYCLE_BINDING_SIDECAR_V1_DESIGN.md` |
| Prior integration design (G1) | `research/moneyline/ML_CAL_1_CAPTURE_BINDING_INTEGRATION_DESIGN_V1.md` |
| Binding verifier (accepted offline) | `apps/jobs/lib/ml-cal-1-lifecycle-binding.ts` — non-null `dbTransactionTime` must lie in `[observationStartTime, observationEndTime]`; both `workflowRunCompletedAt` and `artifactCreatedAt` required |

---

## Correction progress log

| Step | Status | Notes |
|------|--------|-------|
| Record HEAD/status | **DONE** | `955cb46…`; only G4 md untracked |
| F1 prospective comparison | **CLOSED** | Polarity fixed; fixtures 6/7 pass, 7/7 & 8/7 fail; missing target → no eligibility invent |
| F2 archive schema mapping | **CLOSED** | Week 5 planned-row + verification shape; games exact; ratings 1e-9 |
| F3 TX API / READ ONLY / MVCC / preflight | **CLOSED** (prior) | Prisma RepeatableRead + SET TRANSACTION READ ONLY + metadata verify retained |
| F3 remaining timing correction | **DONE** | Unconditional host/DB bounds; mandatory both archive chronology fields; §9 stamp order; diagnostics never waive; fixtures N26–N32 |
| F4 emission vs approval stages | **CLOSED** | Three-stage table; lineage digest triad |
| §5 producer-role wording | **DONE** | Forbid role substitution / forced equality; distinct-SHA fixture is example only |
| U1–U9 dispositions | **CLOSED** | Unchanged from prior accepted disposition text |
| Fixture matrix extension (timing) | **DONE** | N26–N32 added; prior fixtures preserved |
| Final hashes for re-review | **DONE** | See § File hashes / session closeout |

---

## This session change summary (F3 timing + §5)

1. **§2.2 / §4.3 / §7:** Both `workflowRunCompletedAt` and `artifactCreatedAt` mandatory; missing either → `archive_chronology_missing` blocks G4 read; both ≤ `observationStartTime` and ≤ `nowCeiling`.  
2. **§3.5:** Replaced “when comparable” / optional archive chronology with unconditional live-path `observationStartTime ≤ dbTransactionTime ≤ observationEndTime`; diagnostics never waive/clamp/offset-correct; failure receipt ≠ successful sidecar.  
3. **§9:** Record `observationStartTime` **before** opening TX; `bindingSnapshotReferenceTime` after rating SELECT; `observationEndTime` after attempt ends; never restamp start after rows.  
4. **§8:** Added G4-N26–N32 (DB time outside either bound; unverifiable comparability; each missing archive timestamp; archive after start/ceiling).  
5. **§5 / G4-P3:** Roles independent; forbid substitution and forced equality; equal SHAs allowed if same commit legitimately fills multiple roles; distinct-SHA fixture is example only.

**Preserved closed repairs:** F1, F2, F4, and the non-timing F3 TX/MVCC/preflight contract.

**Noted (not amended):** Sidecar design §2.4 still texts games ≤ 1e-9; accepted verifier uses exact integer games equality. No accepted code changed.

---

## Prior F1–F4 summary (still in force)

1. **F1:** `prospectiveOk = completedThroughWeek < prospectiveTargetWeek`; no production target in G4.  
2. **F2:** Authentic report schema; games exact integer; ratings 1e-9.  
3. **F3 (API):** Prisma RepeatableRead + in-TX `SET TRANSACTION READ ONLY` + metadata verify; mandatory live `dbTransactionTime`; MVCC caveat; fixtures ≠ pooler proof.  
4. **F4:** Emission ≠ approval; lineage digest triad.

---

## What was / is not done

- No implementation, DB connection, credentials, providers, workflow dispatch, commit/push, merge, registration, calibration, or 2025 access.  
- No amendment of accepted PRs #244 / #245 / #246 / #247 / #248 or main; #243 remains draft/unregistered.  
- No registry approval, lineage attestation, or live observation package produced.  
- No candidate Week ≥ 6 COMMIT run selected (U1 deferred).  
- No pooler preflight (U3 proof deferred).

---

## Unresolved external prerequisites (still outside this design)

| Item | Owner / gate |
|------|----------------|
| Genuine Week ≥ 6 COMMIT run/artifact identity | U1 — independent pin review |
| Production prospective target week | U2 / G6 |
| Deployed pooler RepeatableRead + READ ONLY preflight | U3 — later authorized only |
| Reviewer/approval record for first non-fixture package | U5 |
| Lineage inventory/search definition | U7 / G5 |
| Explicit one-off execution authority when implementation is ready | U5 / U8 |

---

## Holds (unchanged)

- Live research readiness **BLOCKED**.  
- Week 5 COMMIT (`37336589699`, ZIP `b0177de0…`, weight 0.75) = integrity-positive / **full-weight-ineligible**; schema exemplar.  
- Fixture green ≠ production acceptance. Planned tests are not executed tests.  
- Do not collapse G4 evidence emission into G5/G6/G7/G8.  
- If research markdown is later committed under separate authority: expect Vercel **BUILD** unless the full diff qualifies for established safe-skip rules.

---

## File hashes (re-review anchors)

Prior design bytes matched review evidence `bc61f2a8bb9d0453cc6c3c5f56d53f1da31f67dc3343ada4ca52f27533f44f9f` before this timing revision. Fresh hashes after this edit are recorded in the session closeout response (embedding this recovery file’s own digest here would change it).

| File | Prior hash (pre–timing fix) | Fresh hash |
|------|----------------------------|------------|
| `ML_CAL_1_LIFECYCLE_BINDING_OBSERVER_G4_DESIGN.md` | `bc61f2a8…33f44f9f` | See session closeout |
| `ML_CAL_1_LIFECYCLE_BINDING_OBSERVER_G4_RECOVERY.md` | `98f1bcd0…dac581ed` (reported) | See session closeout |

---

## Absolute paths

- `C:\Users\Bobby\gridiron-edge-v1\Gridiron-Edge-V1-ml-cal-1-g3\research\moneyline\ML_CAL_1_LIFECYCLE_BINDING_OBSERVER_G4_DESIGN.md`
- `C:\Users\Bobby\gridiron-edge-v1\Gridiron-Edge-V1-ml-cal-1-g3\research\moneyline\ML_CAL_1_LIFECYCLE_BINDING_OBSERVER_G4_RECOVERY.md`

---

## Resume checklist

1. Progress log: F1/F2/F4 CLOSED; F3 timing + §5 DONE.  
2. Confirm HEAD still `955cb46…` or record intentional successor tip **without** amending accepted PR history.  
3. Do **not** open DB / dispatch workflows unless a later task explicitly authorizes implementation **after** design acceptance + fixture-green plan.
