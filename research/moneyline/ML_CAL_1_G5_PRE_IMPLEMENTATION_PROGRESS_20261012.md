# ML-CAL-1 G5-PRE Offline Implementation — Progress / Recovery

**Date:** October 13, 2026 (America/Chicago)  
**Status:** Offline R2-A approval-pin + contents-quarantine repair on draft PR #252 — stop for independent re-review  
**Commit/push:** Draft PR only; no merge authorized

## Worktree

| Item | Value |
|------|--------|
| Path | `C:\Users\Bobby\gridiron-edge-v1\Gridiron-Edge-V1-ml-cal-1-g5-pre` |
| Branch | `feat/ml-cal-1-trusted-retrieval-lineage-g5-pre-fixture-v1` |
| Prior reviewed head | `21954e8d7d8c1a87d18de90e193ff95624ffa23c` |
| Base / ancestry | Exact accepted G4 `6c2b31069b8805c7f2d171da1e04bf47885f237d` |
| Draft PR | #252 (base G4 branch) |
| Ops main (record only) | `1f5b6324767f8a5832726d5828247ad022961b2b` — not rebased onto |

## Preserved repairs

F1–F6, R1, R3, R4, R5-A, and F2/F5 remain in force. Inherited binding/G2/G3/G4 helpers and fixture bytes unchanged.

## R2-A repair (this tip)

| Path | Rule |
|------|------|
| **Reviewed-effect approval** | Independently supplied `approvedIndependentEffectEvidenceByCandidate[candidateKey]` must equal `sha256(exact retained evidence bytes)`. Pin is keyed by candidate identity and constructed outside the verifier — never from the bytes under verification. Self-hash≠evidence and substring-from-envelope rejection removed. Sidecar, rating-fingerprint, and interval bindings preserved. Unrelated pins reject; correct external pins pass; missing approval remains unresolved. |
| **Contents / write-effect summary** | Custom write-effect summaries are **not** raw producer evidence. `writesTeamSeasonRatings=false` and `writtenRatingFingerprint` alone cannot prove non-effect. Until a producer-artifact adapter verifies retained source bytes and derives effects, parse-success summaries are `candidate_contents_unsupported_summary` / unresolved. Legacy boolean envelopes still `candidate_contents_boolean_only`. |
| **Positives** | Offline positives use the independently pinned reviewed-effect path only (fixture pins by candidateKey → evidence digest). |

## Local results (pre-push)

- G5-PRE suite: 71/71 pass
- Inherited binding/G2/G3/G4: 136/136 pass
- Vercel expected: BUILD (apps/jobs lib + tests changed; not safe-skip)

## Holds

No merge, live retrieval, DB, credentials, providers, pooler, observation/capture dispatch, registry mutation, prospective registration, calibration, 2025 access, production pointer/card/cohort changes. No inherited verifier changes. No G6+.
