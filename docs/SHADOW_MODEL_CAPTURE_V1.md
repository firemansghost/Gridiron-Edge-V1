# Shadow Model Capture V1 — Generic Multi-Model Prospective Layer

**Status:** IMPLEMENTED IN CODE / NOT PRODUCTION-PROVEN  
**Additive to:** Hybrid Shadow Snapshot V1 (Phase 4B)  
**First model:** `core_v1_shadow_baseline_v1`  
**Audited `origin/main` baseline for this work:** `5661fcee5bfe81449549e82766a2fb864bd9c237`

## What this is

An **additive** append-only Shadow evidence layer for independently versioned research models.

It does **not** replace, migrate, or rewrite Hybrid Shadow Snapshot V1 evidence (`shadow_capture_runs` / `shadow_prediction_snapshots`). Frozen Week 2 Hybrid rows remain untouched.

## What this is not

- Not Official Card / `Bet` writes
- Not Hybrid activation
- Not Candidate B / WEPA / PassMatch / Totals V2 / Portal / ensemble adapters (later work)
- Not a claim that multi-model capture is production-proven merely because code merges
- Not authorization to deploy the migration or run production COMMIT

Core V1 baseline market selection reuses official-card coherent home/away pair selection (`selectBookSpreadSnapshots` + `pickDisplaySpread`) over authorized `oddsapi` observations only, then applies the frozen ≤1800s freshness gate.

## Tables

- `shadow_model_capture_runs` (`ShadowModelCaptureRun`)
- `shadow_model_predictions` (`ShadowModelPrediction`)

Migration (created, **not deployed** by this PR):

`prisma/migrations/20260913120000_add_shadow_model_capture_v1/migration.sql`

Append-only: no `@updatedAt`; internal Shadow FKs only; `RESTRICT`; DB triggers reject UPDATE/DELETE.

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

## Guarded workflow

`.github/workflows/capture-shadow-model-predictions-2026-manual.yml`

Display name: **Capture Generic Shadow Model Predictions 2026 (Manual, Guarded)**

Allowlist for this PR: `core_v1_shadow_baseline_v1` only.

Production COMMIT remains **NOT AUTHORIZED** until an independent PREVIEW is reviewed.

## Operator posture

| Item | State |
|---|---|
| Hybrid Snapshot V1 | Frozen / unchanged by this layer |
| Generic multi-model capture code | Present; additive |
| Migration deployed | **No** |
| Prediction capture authorized | **No** |
| Candidate B / other models | **Not implemented** |
