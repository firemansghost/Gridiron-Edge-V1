# ML-CAL-1 G4 Windows W5-1 — USAGE (local, repaired)

Date: 2026-10-15 (America/Chicago)  
Worktree: `Gridiron-Edge-V1-ml-cal-1-g4-w5-path-identity`  
Branch: `feat/ml-cal-1-g4-w5-path-identity-v1`  
Base/HEAD: `9ce55f11f43156ba1ceb08dc57b88c48d9f9043a` (#258 tip)  
Status: **local uncommitted repair — STOP for independent review**

## Repair summary (review findings)

| Finding | Fix |
|---------|-----|
| Case-policy failures → PASS | `QueryCasePolicy` → Unproven ⇒ **BLOCKED** (`w5_case_policy_unproven`); GUID compare **Ordinal** |
| Reparse tags from Find / query success fallback | `GetFileInformationByHandleEx(FileAttributeTagInfo)` on **no-follow handle**; failed or inconsistent tag inspection ⇒ **BLOCKED** (no success fallback) |
| Incomplete / meaningless PASS accepted | Launcher `validatePassEvidence`: GUID-volume syntax, binding segment order, reconstructible path from on-disk names, object-ID/tag formats, status `OK` only; rejects all-`"x"` and alias/`REFUSE_ALIAS` evidence |
| Async timeout unsettled | Kill + **kill-grace force settle**; stdin `error` handler |
| Sync shared maxBuffer | `maxBuffer = stdoutCap + stderrCap`; per-stream caps enforced after; sync path unit-tested |
| Timing-only swaps / ambient handshake | Explicit `testOnlyHandshake` → canonical `G4_W5_TEST_HANDSHAKE_ENABLE=1`; ordinary launches **strip** all `G4_W5_TEST_*` **case-insensitively** (Windows env names); helper ignores handshake without ENABLE |

## Frozen launcher limits

| Constant | Value |
|----------|-------|
| stdout / stderr byte caps | 1_048_576 each (independent) |
| sync spawnSync ceiling | stdoutCap + stderrCap |
| timeout ms | 15_000 |
| kill grace ms | 1_000 |
| schemaVersion / mode | 1 / `inspect-w5` |

## Disposable helper build (test-only)

```text
csc /nologo /optimize+ /target:exe /platform:x64 /out:tools/windows-g4-fs-inspect/bin/WindowsG4FsInspect.exe tools/windows-g4-fs-inspect/Program.cs
```

Toolchain: `%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`  
(`dotnet publish` self-contained win-x64 still **BLOCKED** — SDK absent.)

| Artifact | Bytes | SHA-256 |
|----------|------:|---------|
| WindowsG4FsInspect.exe (test-only) | 20480 | `9fc710026f177525994126673f084274e94d17615ec136a72b60d3e7a558c9b5` |

Production signing/distribution: **UNRESOLVED**.

## Operator behavior (unchanged policy)

W5-only → always `windows_gates_incomplete`. Temp skips native helper. W4/temp/anchoring preserved.

## Residual race limitations

Documented in helper `limitations[]`. Handshake proves controlled swaps at the intended segment; does **not** claim race-free containment.
