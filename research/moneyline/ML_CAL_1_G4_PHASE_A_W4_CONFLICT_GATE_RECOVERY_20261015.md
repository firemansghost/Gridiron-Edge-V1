# ML-CAL-1 G4 Phase A — W4 conflict gate recovery

Date: 2026-10-15

## Identities

| Item | Value |
|------|-------|
| Worktree | `C:\Users\Bobby\gridiron-edge-v1\Gridiron-Edge-V1-ml-cal-1-g4-phase-a-w4-conflict-gate` |
| Branch | `feat/ml-cal-1-g4-phase-a-w4-conflict-gate-v1` |
| Base (#257 tip) | `5ca8aa36e848e1bfc6839575dc65006feeca0621` |
| #256 | `2cb61034d78d1875b46fd60575819145d1aa9388` |
| #255 | `af28c337adb18b38a5a77a71d4f452ca74a1c994` |
| Commit/push/PR | **none** (local repair only) |

## Changed / new paths (local only — no commit)

- `apps/jobs/lib/ml-cal-1-g4-phase-a-retention-setup.ts` (W4 lstat parent scan + leaf conflicts + cross-helper mutation recorder)
- `apps/jobs/__tests__/ml-cal-1-g4-phase-a-w4-conflict-gate.test.ts`
- `research/moneyline/ML_CAL_1_G4_PHASE_A_W4_CONFLICT_GATE_USAGE_20261015.md`
- `research/moneyline/ML_CAL_1_G4_PHASE_A_W4_CONFLICT_GATE_RECOVERY_20261015.md`
- `research/moneyline/ML_CAL_1_G4_PHASE_A_W4_CONFLICT_GATE_CHECKPOINT_20261015.md`

## Resume rules

Inspect this file + checkpoint + `git status` before acting. Do **not** commit/push/PR, dispatch workflows, touch operator root, or auto-clean unrelated temp evidence. Preserve #255/#256/#257 worktrees.

## Temp residue

Jest uses `os.tmpdir()` prefixes `g4-phase-a-w4-op-` / `g4-w4-*`. Owned by tests; safe to leave or delete after review. Not operator evidence.
