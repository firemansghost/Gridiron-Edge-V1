# ML-CAL-1 G4 Nonfixture + Pooler-Preflight Procedure Design — Recovery

**Date:** October 13, 2026 (America/Chicago)  
**Status:** Fixture-only preflight runner implemented on draft PR #253; F1–F5 repair applied — stop for independent re-review  
**Companion:** `research/moneyline/ML_CAL_1_G4_NONFIXTURE_OBSERVER_POOLER_PREFLIGHT_PROCEDURE_DESIGN_20261013.md`

---

## Worktree / HEAD (implementation)

| Item | Value |
|------|-------|
| Path | `C:\Users\Bobby\gridiron-edge-v1\Gridiron-Edge-V1-ml-cal-1-g4-preflight` |
| Branch | `feat/ml-cal-1-g4-pooler-preflight-fixture-v1` |
| Draft PR | https://github.com/firemansghost/Gridiron-Edge-V1/pull/253 |
| PR base | `feat/ml-cal-1-trusted-retrieval-lineage-g5-pre-fixture-v1` (#252) |
| Accepted G5-PRE tip (merge-base) | `1683ce36fbb5a981a2b3ba3d8a9b90ea8da37f25` |
| Pre-repair head | `d51fe0a3f511e9969f3e79d18ee496f5815f5e91` |
| Post-repair head | reported in session closeout after commit |
| History | Not amended; repair commits on same draft branch |

Prior local assessment (still uncommitted in g5-pre worktree, preserved):

- `ML_CAL_1_G5_LIVE_PREREQUISITE_REVIEW_20261013.md`
- `ML_CAL_1_G5_LIVE_PREREQUISITE_RECOVERY_20261013.md`

---

## Deliverables

| Path | Role |
|------|------|
| `research/moneyline/ML_CAL_1_G4_NONFIXTURE_OBSERVER_POOLER_PREFLIGHT_PROCEDURE_DESIGN_20261013.md` | Accepted procedure design (unchanged content) |
| `research/moneyline/ML_CAL_1_G4_NONFIXTURE_OBSERVER_POOLER_PREFLIGHT_PROCEDURE_RECOVERY_20261013.md` | This recovery note |
| `apps/jobs/lib/ml-cal-1-g4-pooler-preflight-fixture.ts` | Fixture runner + seal + validator |
| `apps/jobs/__tests__/ml-cal-1-g4-pooler-preflight-fixture.test.ts` | PF-P/N + F1–F5 tests |
| `.github/workflows/test-ml-cal-1-g4-pooler-preflight-fixture-v1.yml` | Secret-free CI |

### Digests (git/LF canonical)

| File | SHA-256 |
|------|---------|
| Design note | `55d4a3d72877abcf154461a6504bb702791339b41721729116472187fab7c95f` |
| Prior CRLF working-tree report (same bytes, CRLF) | `d4d75759a1c347f81f84082f8963bb110760a32e24c0e832e70f5cceb692ca67` |

---

## F1–F5 repair summary (draft #253)

| ID | Repair |
|----|--------|
| F1 | Validator parses every required evidence member; cross-checks tx evidence vs run metadata; enforces schema/kind/identity/pins/provenance/false flags/timing/terminal success; malformed JSON shapes → structured rejection; hash-consistent semantic-tamper regressions |
| F2 | Complete verified staging directory published via atomic rename; exclusive claim lock under `staging/.claim-<id>` separate from final `preflight/<id>`; race-safe no-overwrite; mid-stage failure hooks leave final path absent |
| F3 | Fixture retain roots must resolve under `os.tmpdir()`; reject operator-root hints, symlink/junction roots, and escapes before mutation; containment applied to seal + copy/handoff |
| F4 | `loseTransactionAfterMetadata` rejects after metadata return; runtime metadata types + injected clock validated; structured failure, no success package |
| F5 | `redactError` covers Authorization/Bearer and related forms; synthetic-token tests only |

---

## Retention / chronology (unchanged)

| Item | Content |
|------|---------|
| Recommended initial profile | **`R-LOCAL-FS`** |
| Operator destination | **UNVERIFIED** — never created/probed by fixture runner |
| W6 chronology | Still **UNRESOLVED** |
| Derived timestamp mapping | **Not approved** |
| Fixture success | **Not** deployed pooler acceptance |

---

## Holds

No merge, live DB/pooler, operator-root setup, observation, retrieval, approvals, registration, calibration, G6–G8, or production model/schema changes.

**Stop for independent re-review.**
