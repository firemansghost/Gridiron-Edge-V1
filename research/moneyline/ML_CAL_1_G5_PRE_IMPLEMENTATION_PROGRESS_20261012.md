# ML-CAL-1 G5-PRE Offline Implementation — Progress / Recovery

**Date:** October 13, 2026 (America/Chicago)  
**Status:** Offline R2-A concrete proof-path repair on draft PR #252 — stop for independent re-review  
**Commit/push:** Draft PR only; no merge authorized

## Worktree

| Item | Value |
|------|--------|
| Path | `C:\Users\Bobby\gridiron-edge-v1\Gridiron-Edge-V1-ml-cal-1-g5-pre` |
| Branch | `feat/ml-cal-1-trusted-retrieval-lineage-g5-pre-fixture-v1` |
| Prior reviewed head | `46d8751229fbfb50572452583b0b4a83d1749f1a` |
| Base / ancestry | Exact accepted G4 `6c2b31069b8805c7f2d171da1e04bf47885f237d` |
| Draft PR | #252 (base G4 branch) |
| Ops main (record only) | `1f5b6324767f8a5832726d5828247ad022961b2b` — not rebased onto |

## Preserved repairs

F1–F6, R1, R3, R4, R5-A, and F2/F5 remain in force. Inherited binding/G2/G3/G4 helpers and fixture bytes unchanged.

## R2-A concrete proof path (this tip)

| Path | Rule |
|------|------|
| **Retained contents** | `candidateContentsDigest` must be supported write-effect artifact bytes (`ml-cal-1-g5-candidate-artifact-write-effect-v1`). Affect on the bound cohort/snapshot is **derived** from write facts + rating fingerprint vs sidecar-derived fingerprint. Artifact identity/timing bound to the listed candidate. Legacy boolean contents envelopes → `candidate_contents_boolean_only` / unresolved / block `none_found`. |
| **Independent effect** | Reviewed conclusions require separately supplied `approvedIndependentEffectEvidenceDigests[evidenceSha256]` (must not equal evidence self-hash; must not appear in the envelope). Evidence must bind `boundSidecarDigest`, `boundRatingFingerprint`, and an interval covering the search window. Matching booleans alone are not proof. |
| **Positives** | Derivation fixture (non-writing artifact) and separately approved reviewed-effect fixture (test-only synthetic approval). |

## Local results (pre-push)

- G5-PRE suite: 71/71 pass
- Inherited binding/G2/G3/G4: 136/136 pass

## Holds

No merge, live retrieval, DB, credentials, providers, pooler, observation/capture dispatch, registry mutation, prospective registration, calibration, 2025 access, production pointer/card/cohort changes. No inherited verifier changes.
