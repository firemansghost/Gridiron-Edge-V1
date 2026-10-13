# ML-CAL-1 G4 Pooler Preflight Real Adapter — Recovery

**Date:** October 13, 2026 (America/Chicago)  
**Status:** Offline real metadata-only adapter on draft PR #254; F1–F2 repair applied — stop for independent re-review  
**Companion design:** `research/moneyline/ML_CAL_1_G4_NONFIXTURE_OBSERVER_POOLER_PREFLIGHT_PROCEDURE_DESIGN_20261013.md`

---

## Worktree / branch

| Item | Value |
|------|-------|
| Path | `C:\Users\Bobby\gridiron-edge-v1\Gridiron-Edge-V1-ml-cal-1-g4-preflight-adapter` |
| Branch | `feat/ml-cal-1-g4-pooler-preflight-real-adapter-v1` |
| Exact base (#253 tip) | `7375d9ba1b3e8c1d5b0b337958b537cc0334fc10` |
| Pre-repair head | `47b985b1a7480248f859499af5b71492947ae95a` |
| F1–F2 repair commit | `65a1f5fd8b5c79d899ec7d80e5fac2c3ffdfe323` |
| Tip (recovery pin) | `07279ceaebf1aa4e75bb219874790771c582a2da` |
| PR base branch | `feat/ml-cal-1-g4-pooler-preflight-fixture-v1` |
| G5-PRE parent | `1683ce36fbb5a981a2b3ba3d8a9b90ea8da37f25` |
| Draft PR | https://github.com/firemansghost/Gridiron-Edge-V1/pull/254 |
| Observed CI (tip) | run `38472717606`, job `115555633038` — success |
| CI checkout | synthetic merge `6d23a09ad5ff3087969b7dda2a3b5301cdfff441` = Merge `07279ce…` into `7375d9b…` (not main) |

Sibling fixture worktree (do not reset): `Gridiron-Edge-V1-ml-cal-1-g4-preflight` @ `7375d9b`.  
Untracked G5 assessment/recovery remain in `Gridiron-Edge-V1-ml-cal-1-g5-pre`.

---

## Deliverables

| Path | Role |
|------|------|
| `apps/jobs/lib/ml-cal-1-g4-pooler-preflight-real-adapter.ts` | Passive metadata-only adapter (injected Prisma; enable gate) |
| `apps/jobs/__tests__/ml-cal-1-g4-pooler-preflight-real-adapter.test.ts` | Offline mocked-Prisma suite (+ F1/F2 regressions) |
| `.github/workflows/test-ml-cal-1-g4-pooler-preflight-real-adapter-v1.yml` | Secret-free CI |
| This recovery note | Resume checkpoint |

### Design pin (git/LF)

`55d4a3d72877abcf154461a6504bb702791339b41721729116472187fab7c95f`

---

## F1–F2 repair summary

| ID | Repair |
|----|--------|
| F1 | Transaction-local sequence: READ ONLY must complete before metadata; validated metadata required before callback completion; SET/metadata/validation failures latched so callbacks cannot swallow them into successful TX output; await `$transaction` completion before return; fixed SQL + same TX client preserved |
| F2 | `adapter.enabled` and execution gate use one immutable construction-time boolean (`enabledAtConstruction`); frozen per-adapter TX options copy + frozen module-level `ML_CAL_1_G4_PREFLIGHT_TX_OPTIONS`; mutating caller `options` after construction cannot re-enable/disable |

### Validation summary (local, pre-push)

- Real-adapter suite including F1/F2 regressions
- Accepted fixture-preflight suite
- Binding / G2 / G3 / G4 inherited regressions

---

## Adapter contract (offline)

- Passive factory: no `PrismaClient` construction, env reads, connect, query, or TX at import/create.
- Enable gate: construction-time `enabled === true` only; otherwise zero Prisma activity.
- Exactly one interactive `$transaction` with `RepeatableRead`, `maxWait=10000`, `timeout=15000`.
- Same TX client: `SET TRANSACTION READ ONLY` then allowlisted metadata SELECT.
- Fixed SQL constants only; no business tables, DDL, writes, session RO substitute, direct-URL fallback, or providers.
- Timing ownership: host-start ≤ DB ≤ host-end remains with the P-PREFLIGHT caller (fixture runner).
- Outputs are unreviewed metadata observations: never set approved/liveAccepted/deployedPoolerProof.
- No live CLI, workflow dispatch, schedule, or env-bootstrap path in this PR.

---

## Holds

No merge, live DB/pooler/credential access, operator-root setup, P-OBSERVE, observation, live retrieval, registry/approval issuance, registration, calibration, 2025 access, or production model/card/cohort/routing changes.

**Stop for independent re-review.**
