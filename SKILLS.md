# SKILLS — agent operating rules (2026 truth program)

**Production `main`:** `9b6b97b362c52f64b2ceec2b09d2b11b4c98b663`  
**Updated:** 2026-09-03

## Current state

- Phase 2B Week Archive is **COMPLETE** (PR #88, production-verified).
- Phase 2 is **COMPLETE**.
- **Next:** Phase 3 Ratings source/provenance/presentation repair. **Not started.**

## Rules that do not relax

- Fail closed on data-integrity contradictions. Do not silently pick a row, drop a bet, or invent a result.
- Minimal diff. Do not expand a PR into adjacent rebuilds (Hybrid, Odds, grading, Core math, Prisma, workflows).
- Independent audit before merge. **No automatic merge.**
- Verify `origin/main` SHA before coding. If main has moved from the expected SHA, stop and report.
- No provider calls, no production DB writes, and no workflow runs unless the operator explicitly authorized that exact production operation.
- Do not treat Current Slate as Official Card. Do not treat Week Archive as a live slate.
- Do not retune Core V1, Candidate A, Balanced, or lifecycle weights as part of Phase 3.
- Docs-only PRs must not change application code, tests, workflows, Prisma, or production data.
