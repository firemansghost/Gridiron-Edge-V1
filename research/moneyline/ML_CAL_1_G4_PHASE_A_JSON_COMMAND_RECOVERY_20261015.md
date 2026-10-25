# ML-CAL-1 G4 Phase A — JSON Command Recovery

Date: 2026-10-15 (America/Chicago)  
Paired with: `ML_CAL_1_G4_PHASE_A_JSON_COMMAND_USAGE_20261015.md`  
HEAD: `2cb61034d78d1875b46fd60575819145d1aa9388`

## Failure classes

| Failure | Behavior |
| --- | --- |
| Parse / unknown / duplicate / conflict / malformed | Exit 1; **no** setup; **no** capture reservation; structured JSON to entrypoint stderr (and stdout if `--json-stdout=true`) |
| Runtime `enabled`/`confirmSetup` not exact true (F2) | Exit 1 before any clock/FS/capture reservation |
| Capture collision / missing parent / inside USER root / inside evidence tree (F1) / symlink parent | Exit 1; **setup/evaluate never invoked**; sentinel untouched; structured diagnostics always (F4) |
| Input artifact via directory symlink / unresolved physical identity (F1 alias) | Exit 1 before reservation; **zero** evidence-tree writes |
| Receipt and/or final evidence missing (F1 miss) | Exit 1 **before** capture reservation; no capture file; structured stderr JSON; sentinel/evidence digests unchanged |
| Stdout partial/zero-progress write | Exit 1; `outputOk=false`; durable JSON keeps `ok=false` |
| Throwing stdout writer (F5) | Exit 1; structured result retained; writer **not** re-invoked from diagnostic handler |
| Setup refuse | Exit 1; `setupSucceeded=false`; durable JSON has `ok=false`/`outputOk=false` |
| Setup ok + capture/stdout fail (F3) | Exit 1; `setupSucceeded`/`operationOk` may be true; durable + stderr JSON keep `ok=false`/`outputOk=false`; **no retry** |
| Serialize/exception after setup (F5) | Exit 1; owned FD closed; `captureResidue` reported; structured JSON; no automatic retry |
| Evaluate wrong digests/counts / missing final / unstable reread | Exit 1; `evaluationSucceeded=false`; **zero** evidence-tree mutation |
| Evaluate capture inside evidence tree / collision | Exit 1 before evaluate; existing capture untouched |

Durable payloads never claim command success (`ok`/`outputOk` forced false). Never auto-run setup after interruption.

## Resume checkpoint (this task)

See `ML_CAL_1_G4_PHASE_A_JSON_COMMAND_CHECKPOINT_20261015.md`.

## Outstanding gates (not implemented / not waived)

W4 pre-mutation conflict; W5–W9 Win32 physical/volume/cloud/ACL. Operator root remains PROPOSED/UNVERIFIED. Live research BLOCKED; W6 chronology UNRESOLVED.
