# ML-CAL-1 G4 Observer PR #249 — Repair Progress

**Reviewed head (start):** `210ad8faada7f1b8d0c7701e863021a5a8ad52c1`  
**Worktree:** `Gridiron-Edge-V1-ml-cal-1-g4`  
**Date:** October 8, 2026 (America/Chicago)

| Finding | Status | Notes |
|---------|--------|-------|
| F1 strict numeric parser | **DONE** | `parseFiniteNumber` for planned/observed; archive planned scalar preflight |
| F2 timestamp extrema / per-row | **DONE** | `validateObservedRowTimestamps` epoch extrema; created≤updated; structured failures |
| F3 fixture provenance locked | **DONE** | nonfixture rejected; always `fixture_hypothetical`/`fixture_injected`; PROVENANCE retained |
| F4 pre-adapter preconditions | **DONE** | identity + chronology before adapter; zero-enter spies |
| F5 omit eligibility echo + replay | **DONE** | no `declaredEcho.fullWeightEligible`; binding verifier replay + copy-away |
| F6 CI + matrix + gitattributes | **DONE** | workflow + matrix doc + binary pins |

Local G4 suite: **53/53 PASS** (post-repair).  
No merge / live / DB / providers. Design acceptance intact.
