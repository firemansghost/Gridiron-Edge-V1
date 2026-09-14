# Shadow Model Capture V1 — Generic Multi-Model Prospective Layer

**Status:** IMPLEMENTED / MIGRATION DEPLOYED / FIRST PROSPECTIVE PRODUCTION CAPTURE PROVEN  
**Additive to:** Hybrid Shadow Snapshot V1 (Phase 4B)  
**First model:** `core_v1_shadow_baseline_v1`  
**Evidence-producing runtime baseline:** `e54196faf18e2f1287e85e12b613e65afbc27ca2`  
**Implementation merge (PR #112):** `3638bb1e5c3d4b4a6be8eaf6c8664b86724a08cd`

## What this is

An **additive** append-only Shadow evidence layer for independently versioned research models.

It does **not** replace, migrate, or rewrite Hybrid Shadow Snapshot V1 evidence (`shadow_capture_runs` / `shadow_prediction_snapshots`). Frozen Week 2 Hybrid rows remain untouched.

This layer is **SHADOW / RESEARCH** evidence only. A successful production capture does **not** make the Generic adapter an Official Card writer and does **not** activate Hybrid V2.

## What this is not

- Not Official Card / `Bet` writes
- Not Hybrid activation
- Not Candidate B / WEPA / PassMatch / Totals V2 / Portal / ensemble adapters
- Not a claim of demonstrated predictive performance
- Not blanket authorization for every future Generic COMMIT
- Not Shadow automation

Core V1 baseline market selection reuses official-card coherent home/away pair selection (`selectBookSpreadSnapshots` + `pickDisplaySpread`) over authorized `oddsapi` observations only, then applies the frozen ≤1800s freshness gate.

## Tables

- `shadow_model_capture_runs` (`ShadowModelCaptureRun`)
- `shadow_model_predictions` (`ShadowModelPrediction`)

Migration:

`prisma/migrations/20260913120000_add_shadow_model_capture_v1/migration.sql`

Deployed by run **34779225982** before the first Generic capture. Append-only: no `@updatedAt`; internal Shadow FKs only; `RESTRICT`; DB triggers reject UPDATE/DELETE.

## First adapter

`core_v1_shadow_baseline_v1`

- Reuses production Core V1 spread math (`computeEffectiveHfa` + V1 ratings)
- Freezes official Core selection semantics (`getATSPick` / `SPREAD_EDGE_FLOOR = 0.1`)
- Spread market only
- Persisted `MarketLine` evidence only
- Market age ≤ 30 minutes; market timestamp ≤ prediction timestamp
- Post-kickoff → UNAVAILABLE
- Missing rating / market / provenance fails closed
- SHADOW / RESEARCH ONLY

Pinned Week 3 capture provenance:

| Identity | Value |
|---|---|
| modelDefinitionId | `core_v1_shadow_baseline_v1` |
| modelDefinitionHash | `b1ccb4eaff89fea0e0f1dead32d53cc60bf693086e7a94b12704c1d6a35b93cb` |
| featureDefinitionId | `core_v1_ratings_hfa_v1` |
| featureDefinitionHash | `57e46d0883608c848f06e3814b53a5fd520778d5c60d9dd9e3e15a5cfcbf5302` |
| policyDefinitionId | `core_v1_shadow_baseline_policy_v1` |
| policyDefinitionHash | `742851db13b46fffb4cb5b1e7973d2e8dcdeabb562c52c56951425687619e7ee` |

## Guarded workflow

`.github/workflows/capture-shadow-model-predictions-2026-manual.yml`

Display name: **Capture Generic Shadow Model Predictions 2026 (Manual, Guarded)**

Allowlist: `core_v1_shadow_baseline_v1` only.

The first production COMMIT was **separately authorized** after a clean PREVIEW. Future COMMITs remain guarded/manual and require current evidence, freshness, exact confirmation, and operator review. There is **no** blanket future COMMIT authorization and **no** recurring schedule.

PR #113 repaired step-scoped Prisma `DATABASE_URL` / `DIRECT_URL` wiring after a fail-closed PREVIEW that produced no evidence and no mutations.

## First production proof — Week 3

| Item | Value |
|---|---|
| Migration deploy run | **34779225982** |
| Evidence-producing runtime SHA | `e54196faf18e2f1287e85e12b613e65afbc27ca2` |
| PREVIEW | **34785048578** |
| COMMIT | **34785370466** |
| model / context | `core_v1_shadow_baseline_v1` / `weekly_post_refresh` |
| season / week | 2026 / 3 |
| expected games | **57** |
| AVAILABLE / UNAVAILABLE | **57 / 0** |
| selections / NO_SELECTION | **57 / 0** |
| sides | **39 AWAY / 18 HOME** |
| market type | SPREAD only |
| capture run ID | `882cf725-9e83-431e-965d-0e97df2da635` |
| persisted predictions | **57** |
| COMMIT prediction timestamp | `2026-09-13T21:59:05.939Z` |
| selected market timestamp | `2026-09-13T21:42:15Z` |
| market age | **1,011 seconds** (16m 51s; ceiling 1,800s) |
| providerCalls | **0** |
| verificationOk | **true** |
| official_flat_100 Bet fingerprint | unchanged |
| Bet / MatchupOutput / Hybrid / closing / evaluation writes | **false** |
| Prisma migrate during capture | not invoked |
| COMMIT artifact | ID **10326556238** · `sha256:68caab35f8a6c2968fc5f9684942ff4825ffcd554a20acf88610a2d3a077484f` |

Earlier PREVIEW **34782545419** failed closed on missing `DATABASE_URL` before planning; it wrote no Generic Shadow rows and invoked no provider/migration/Bet paths. PR #113 repaired that wiring.

## Operator posture

| Item | State |
|---|---|
| Hybrid Snapshot V1 | Frozen / unchanged by this layer |
| Generic multi-model capture code | Present; additive |
| Migration | **Deployed** (run **34779225982**) |
| First prospective production capture | **Proven** (Week 3 COMMIT **34785370466**) |
| Future Generic COMMITs | **Not blanket-authorized**; each remains guarded/manual |
| Candidate B / other models | **Not implemented** |
| Official Card / Hybrid activation effect | **None** |
