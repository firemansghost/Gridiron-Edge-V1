# ML-CAL-1 G5-PRE Offline Implementation — Progress / Recovery

**Date:** October 13, 2026 (America/Chicago)  
**Status:** Offline R2-A / R5-A review repair on draft PR #252 — stop for independent re-review  
**Commit/push:** Draft PR only; no merge authorized

## Worktree

| Item | Value |
|------|--------|
| Path | `C:\Users\Bobby\gridiron-edge-v1\Gridiron-Edge-V1-ml-cal-1-g5-pre` |
| Branch | `feat/ml-cal-1-trusted-retrieval-lineage-g5-pre-fixture-v1` |
| Prior reviewed head (R1–R5) | `a2495b90aa359c4671bde358bfd24fac9395c82a` |
| Base / ancestry | Exact accepted G4 `6c2b31069b8805c7f2d171da1e04bf47885f237d` |
| Draft PR | #252 (base G4 branch) |
| Ops main (record only) | `1f5b6324767f8a5832726d5828247ad022961b2b` — not rebased onto |

## Preserved repairs

F1–F6 and R1/R3/R4 remain in force (coverage/pagination/evidence bind, chronology, listing reconciliation, PRE-bound verify anchors, F2 pagination, F5 whole-package approval disabled).

## R2-A / R5-A repair (this tip)

| Finding | Repair |
|---------|--------|
| **R2-A** | Parse/validate anchored observation/log bytes; bind candidate identity, 2026/v1 scope, and `affectsBoundRatings` to the effect conclusion. Digest presence alone insufficient. Garbage text, other-candidate anchors, and contradictory underlying evidence → unresolved and block `none_found`. Same principle on candidate-contents via required `anchoredContentsDigest`. |
| **R5-A** | Require non-empty observer metadata with `observationEndTime`; cross-check timing/identity fields against retained sidecar. Design correspondence must include both a design pin (`designSha256` or G4 `onDiskDesignSha256`) and a base tip (`baseG4Tip` or G4 `baseG3Tip`); base-only / design-only / empty → reject. Accepted G4 correspondence format remains valid. |

## Local results (pre-push)

- G5-PRE suite: 69/69 pass (includes R2-A / R5-A regressions with hash-consistent packages)
- Inherited binding/G2/G3/G4: 136/136 pass

## Inherited (unchanged)

Accepted binding/capture/G2/G3/G4 helpers and G4 observer fixture bytes (week5 + synthetic-w6). PRs #243–#249 not amended.

## Holds

No merge, live retrieval, DB, credentials, providers, pooler, observation/capture dispatch, registry mutation, prospective registration, calibration, 2025 access, production pointer/card/cohort changes.
