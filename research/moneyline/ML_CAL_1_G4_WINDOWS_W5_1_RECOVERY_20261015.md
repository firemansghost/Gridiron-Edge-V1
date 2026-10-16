# ML-CAL-1 G4 Windows W5-1 — RECOVERY (post-repair)

Date: 2026-10-15  
Base tip: `9ce55f11f43156ba1ceb08dc57b88c48d9f9043a`  
Branch/worktree: `feat/ml-cal-1-g4-w5-path-identity-v1` / `…-g4-w5-path-identity`

## Rebuild disposable helper

1. Framework64 `csc.exe` (or `dotnet` SDK when available).
2. Run USAGE build recipe; update `ML_CAL_1_G4_W5_HELPER_EXE_SHA256_PIN` + `BYTE_COUNT` together.

## Handshake env (tests only)

Ordinary/operator launches strip all `G4_W5_TEST_*` **case-insensitively** (lowercase/mixed ambient names cannot leak). Native swap fixtures must pass `testOnlyHandshake` (sets canonical uppercase ENABLE + dir + segment after strip).

- `G4_W5_TEST_HANDSHAKE_ENABLE=1` — required gate (launcher sets only via `testOnlyHandshake`)
- `G4_W5_TEST_HANDSHAKE_DIR` — disposable dir
- `G4_W5_TEST_PAUSE_AFTER_SEGMENT` — segment name (e.g. `mid`)
- Helper writes `ready.txt`, waits for `proceed.txt`

## Blocked validations

- Self-contained `dotnet publish` win-x64: SDK absent
- Case-sensitive dir fixture / privileged dir symlink: UNVERIFIED (no elevation)
- Production signing: UNRESOLVED
