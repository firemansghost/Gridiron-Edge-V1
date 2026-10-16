# ML-CAL-1 G4 Windows W5-1 — CHECKPOINT (post-repair)

Date: 2026-10-15 America/Chicago  
Authority: local repair + disposable tests only. **STOP** — no commit/push/PR.

## Completed

- [x] Case-policy Unproven → BLOCKED; ordinal GUID compare
- [x] Reparse tag from no-follow handle (`FileAttributeTagInfo`); failed query ⇒ BLOCKED
- [x] Strict PASS evidence validation (GUID syntax, binding/order, reconstruction, object-ID/tag/`OK`, reject alias/`"x"`)
- [x] Async kill-grace settlement + stdin error handling
- [x] Sync budget = sum of caps; sync-path unit tests
- [x] Deterministic handshake swaps; ambient `G4_W5_TEST_*` stripped **case-insensitively** on ordinary inspect
- [x] Focused suite **38 PASS**; inherited **306 PASS**
- [x] Coverage log: `native=8 mocked=27 skipped=2 unverified=2`

## Next review

Independent review of uncommitted repair + updated ZIP packages.

## Still blocked / later

W6–W9, `dotnet` self-contained publish, signing, CI packaging, operator-root, live, merge.
