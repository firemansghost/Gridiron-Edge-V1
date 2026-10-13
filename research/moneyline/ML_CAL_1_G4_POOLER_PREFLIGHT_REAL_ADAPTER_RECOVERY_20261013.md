# ML-CAL-1 G4 Pooler Preflight Real Adapter — Recovery

**Date:** October 13, 2026 (America/Chicago)  
**Status:** Offline real metadata-only adapter implemented on a separate draft PR — live execution held; stop for independent review  
**Companion design:** `research/moneyline/ML_CAL_1_G4_NONFIXTURE_OBSERVER_POOLER_PREFLIGHT_PROCEDURE_DESIGN_20261013.md`

---

## Worktree / branch

| Item | Value |
|------|-------|
| Path | `C:\Users\Bobby\gridiron-edge-v1\Gridiron-Edge-V1-ml-cal-1-g4-preflight-adapter` |
| Branch | `feat/ml-cal-1-g4-pooler-preflight-real-adapter-v1` |
| Exact base (#253 tip) | `7375d9ba1b3e8c1d5b0b337958b537cc0334fc10` |
| PR base branch | `feat/ml-cal-1-g4-pooler-preflight-fixture-v1` |
| G5-PRE parent | `1683ce36fbb5a981a2b3ba3d8a9b90ea8da37f25` |
| Head | `e1487f6f5d9d913368a176c0bcccf3b38f5dbf5a` |
| Draft PR | https://github.com/firemansghost/Gridiron-Edge-V1/pull/254 |
| Observed CI (tip) | run `38470024576`, job `115546403457` |

Sibling fixture worktree (do not reset): `Gridiron-Edge-V1-ml-cal-1-g4-preflight` @ `7375d9b`.  
Untracked G5 assessment/recovery remain in `Gridiron-Edge-V1-ml-cal-1-g5-pre`.

---

## Deliverables

| Path | Role |
|------|------|
| `apps/jobs/lib/ml-cal-1-g4-pooler-preflight-real-adapter.ts` | Passive metadata-only adapter (injected Prisma; enable gate) |
| `apps/jobs/__tests__/ml-cal-1-g4-pooler-preflight-real-adapter.test.ts` | Offline mocked-Prisma suite |
| `.github/workflows/test-ml-cal-1-g4-pooler-preflight-real-adapter-v1.yml` | Secret-free CI |
| This recovery note | Resume checkpoint |

### Design pin (git/LF)

`55d4a3d72877abcf154461a6504bb702791339b41721729116472187fab7c95f`

---

## Adapter contract (offline)

- Passive factory: no `PrismaClient` construction, `process.env`, connect, query, or TX at import/create.
- Enable gate: only `enabled === true` may open a TX; otherwise zero Prisma activity.
- Exactly one interactive `$transaction` with `RepeatableRead`, `maxWait=10000`, `timeout=15000`.
- Same TX client: `SET TRANSACTION READ ONLY` then allowlisted metadata SELECT.
- Fixed SQL constants only; no business tables, DDL, writes, session RO substitute, direct-URL fallback, or providers.
- Timing ownership: host-start ≤ DB ≤ host-end remains with the P-PREFLIGHT caller (fixture runner); adapter returns validated metadata.
- Outputs are unreviewed metadata observations: never set approved/liveAccepted/deployedPoolerProof.
- No live CLI, workflow dispatch, schedule, or env-bootstrap path in this PR.

---

## Holds

No merge, live DB/pooler/credential access, operator-root setup, P-OBSERVE, observation, live retrieval, registry/approval issuance, registration, calibration, 2025 access, or production model/card/cohort/routing changes.

**Stop for independent review.**
