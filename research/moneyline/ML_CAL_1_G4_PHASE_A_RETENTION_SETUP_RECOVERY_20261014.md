# ML-CAL-1 G4 Phase A Retention Setup — Recovery / Failure Modes

Date: 2026-10-14; packaging checkpoint 2026-10-15  
Status: Draft PR packaging (setup NOT EXECUTED)

## Packaging / CI recovery

- Isolated branch `feat/ml-cal-1-g4-phase-a-retention-setup-v1` bases exactly on #255 `af28c337…`.
- Linux workflow is secret-free, temp-directory tests only; does not run operator setup.
- CI failure: preserve run evidence; repair only new-file test/workflow packaging within this task.
- Do not amend #255, merge, operator-probe, or rewrite accepted dependency libraries.
- Source worktree originals under `…-g4-preflight-runner` remain untouched after copy.
- Linux CI portability: temp mode forbids the exact proposed Windows operator-root label string before `path.isAbsolute` (platform-specific for drive paths).

## Evaluator rejection classes

| Class | Behavior |
| --- | --- |
| Receipt/final null or array | Schema reject |
| Missing field / wrong type | Schema reject (per field) |
| Non-probe provenance or true approval/live-proof flags | Reject |
| Receipt claims terminal/setup/publication complete | Reject |
| Final evidence verification/success flags not exact true | Reject |
| Reversed / invalid timestamps | Reject |
| probeId/handoffId mismatch between artifacts | Reject |
| Usability outcome not true / durability claim not false | Reject |
| designSha256 / base255Head pin mismatch | Reject |
| Final evidence digest/byte-count ≠ retained receipt | Reject |
| Final evidence missing | Reject (provisional receipt alone never terminal) |
| External anchor claim without both expected digests matching | `externallyAnchored: false`; ok false when claim present |

## Internal vs external

- `internallyConsistent`: schemas + binding + correspondence
- `externallyAnchored`: separately retained digests cover **both** receipt and final evidence
- Do not treat colocated files as an external anchor

## Preserved failure classes

Ancestor/symlink refuse; exclusive overwrite refuse; inject stage/rename/copy; cleanup invalidation; receipt verify+remove-fail leftovers; containment reject → zero unsafe mutations; F2 sealed/result separation.

## Recovery posture

- Do not rewrite sealed receipts to claim success
- Do not invent clocks or pins
- Re-run only under authorized destination after clearing owned residue
