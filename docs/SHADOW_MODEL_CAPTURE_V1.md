# Shadow Model Capture V1 — Generic Multi-Model Prospective Layer

**Status:** IMPLEMENTED / MIGRATION DEPLOYED / CORE FRAMEWORK PROOF + CANDIDATE B FIRST RESEARCH COHORT PROVEN
**Additive to:** Hybrid Shadow Snapshot V1 (Phase 4B)
**Current allowlist (PREVIEW and COMMIT):** `core_v1_shadow_baseline_v1`, `candidate_b_roster_prior_v1`
**Current runtime baseline:** `60e5735c820dbd53e3f07de28d5c4c44b8f46b38`
**Official production spread model:** Core V1 / `official_flat_100`
**Candidate B V1:** SHADOW / RESEARCH ONLY / NOT OFFICIAL
**Implementation merge (PR #112):** `3638bb1e5c3d4b4a6be8eaf6c8664b86724a08cd`
**Candidate B first prospective closeout:** [`2026-09-16-candidate-b-v1-first-prospective-closeout.md`](./2026-09-16-candidate-b-v1-first-prospective-closeout.md)

## What this is

An **additive** append-only Shadow evidence layer for independently versioned research models.

It does **not** replace, migrate, or rewrite Hybrid Shadow Snapshot V1 evidence (`shadow_capture_runs` / `shadow_prediction_snapshots`). Frozen Week 2 Hybrid rows remain untouched.

This layer is **SHADOW / RESEARCH** evidence only. A successful production capture does **not** make a Generic adapter an Official Card writer, does **not** activate Hybrid V2, and does **not** promote Candidate B.

Two distinct production proofs exist. Do not rewrite history so it appears Candidate B existed at framework launch.

| Proof | Model | Run | Capture run UUID |
|---|---|---|---|
| **A. Generic framework first production proof** | Core V1 Week 3 | **34785370466** | `882cf725-9e83-431e-965d-0e97df2da635` |
| **B. Candidate B first production research cohort** | Candidate B V1 Week 3 | **35128215811** | `74234d87-bb32-47c6-927b-6de3d24cfc88` |

## What this is not

- Not Official Card / `Bet` writes
- Not Hybrid activation
- Not Candidate B promotion
- Not WEPA / PassMatch / Totals V2 / Portal / ensemble adapters
- Not a claim of demonstrated predictive performance
- Not blanket authorization for every future Generic COMMIT
- Not Shadow automation
- Not ATS / CLV / evaluation persistence

Core V1 baseline market selection reuses official-card coherent home/away pair selection (`selectBookSpreadSnapshots` + `pickDisplaySpread`) over authorized `oddsapi` observations only, then applies the frozen ≤1800s freshness gate. Candidate B uses the same market selector and freshness ceiling against the frozen persisted Candidate B feature snapshot.

## Tables

- `shadow_model_capture_runs` (`ShadowModelCaptureRun`)
- `shadow_model_predictions` (`ShadowModelPrediction`)

Migration:

`prisma/migrations/20260913120000_add_shadow_model_capture_v1/migration.sql`

Deployed by run **34779225982** before the first Generic capture. Append-only: no `@updatedAt`; internal Shadow FKs only; `RESTRICT`; DB triggers reject UPDATE/DELETE.

## First adapter — Core V1 (framework launch)

`core_v1_shadow_baseline_v1` was the **first** Generic Shadow adapter. Candidate B did not exist at this launch.

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

## Second adapter — Candidate B V1 (research)

`candidate_b_roster_prior_v1` was attached later (contract PR #127, implementation PR #128, PREVIEW enablement PR #129, COMMIT enablement PR #131). It remains **SHADOW / RESEARCH ONLY / NOT OFFICIAL**.

Runtime selects the exact persisted Candidate B feature snapshot. It does **not** query newest/latest Candidate B snapshot and does **not** rederive Candidate B from mutable production inputs.

| Identity | Frozen value |
|---|---|
| modelDefinitionId | `candidate_b_roster_prior_v1` |
| featureDefinitionId | `candidate_b_roster_prior_features_v1` |
| policyDefinitionId | `candidate_b_roster_prior_spread_policy_v1` |
| persisted feature snapshotHash | `0332e24f97c891fd6431280fa7939c467c614714abe207eeb3dc89d466eb1148` |
| feature snapshot rows | **138** (complete **103** / unavailable **35**) |
| modelDefinitionHash | `1e5bbf0119832caf10e7b769afe5e8c02dbcda1b358022ec31803df40bca3d8c` |
| featureDefinitionHash | `6f1f8ecc132cdd87650252d57597a657ece0dd908bdf5010897023cafe988972` |
| derivationDefinitionHash | `6c04627787edbcc7d1d42549f3cb19c525a6c4c31de572549f01e3efa64a638c` |
| policyDefinitionHash | `b1b292c0ea01ed692dcbfdfd7f6adf28b951d20786f08dac0993444c8b1e1fba` |
| adapterDefinitionHash | `89ea502df175846f7d942dc485779e33fdd15fe17cd2bcaebba5b3926274ebf6` |

Prediction policy: SPREAD only; persisted `oddsapi` `MarketLine` only; provider calls during Generic Shadow capture **0**; market timestamp ≤ prediction timestamp; maximum age **1800 seconds**; selection floor **0.1**. No stale-market rescue, retrospective capture, missing→zero, or `TeamSeasonRating` fallback.

The first Candidate B Week 3 prospective cohort is **frozen evidence**. Do not rerun, replace, delete, overwrite, or backdate it.

## Guarded workflow

`.github/workflows/capture-shadow-model-predictions-2026-manual.yml`

Display name: **Capture Generic Shadow Model Predictions 2026 (Manual, Guarded)**

Current allowlist (PREVIEW and COMMIT): `core_v1_shadow_baseline_v1` and `candidate_b_roster_prior_v1`.

The workflow remains `workflow_dispatch` only. Default mode remains PREVIEW. There is **no** recurring schedule.

COMMIT confirmation remains:

`CAPTURE_2026_WEEK_<week>_SHADOW_MODEL_<model_id>`

Candidate B Week 3 therefore requires exactly:

`CAPTURE_2026_WEEK_3_SHADOW_MODEL_candidate_b_roster_prior_v1`

PR #113 repaired step-scoped Prisma `DATABASE_URL` / `DIRECT_URL` wiring after a fail-closed Core PREVIEW that produced no evidence and no mutations.

PR #131 enabled the Candidate B COMMIT path after independent PREVIEW audit. Merging #131 did **not** itself authorize a production run. The first Candidate B COMMIT received **separate explicit operator authorization**. Each future production COMMIT still requires current operator authorization. There is **no** blanket future COMMIT authorization.

## A. First production proof — Core V1 Week 3 (framework)

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

## B. First production research cohort — Candidate B V1 Week 3

Independent PREVIEW run **35123647114** on SHA `611bb4c13663e6b49b648ef9333797461a493ca5` proved Candidate B planning (57 / 35 available / 22 unavailable / 34 selections / 1 NO_SELECTION; all 22 unavailable = `team_feature_vector_unavailable`; `providerCalls=0`; `mutationsInvoked=false`). PREVIEW wrote **zero** Shadow prediction rows.

After PR #131 and a separate fresh Live Odds COMMIT **35127135613**, Candidate B COMMIT **35128215811** persisted the first prospective research cohort on SHA `60e5735c820dbd53e3f07de28d5c4c44b8f46b38`:

| Item | Value |
|---|---|
| model / context | `candidate_b_roster_prior_v1` / `candidate_b_w3_first_observation` |
| season / week | 2026 / 3 |
| exact confirmation | `CAPTURE_2026_WEEK_3_SHADOW_MODEL_candidate_b_roster_prior_v1` |
| capture run UUID | `74234d87-bb32-47c6-927b-6de3d24cfc88` |
| prediction timestamp | `2026-09-16T17:27:24Z` |
| selected market timestamp | `2026-09-16T17:16:34Z` |
| market age | **651 seconds** (ceiling 1,800s) |
| games persisted | **57** |
| AVAILABLE / UNAVAILABLE | **35 / 22** |
| selections / NO_SELECTION | **34 / 1** |
| sides | **21 AWAY / 13 HOME** |
| all 22 unavailable | `team_feature_vector_unavailable` |
| unexpected stale / missing / incoherent market | **0** |
| providerCalls | **0** |
| verificationOk | **true** |
| Bet / MatchupOutput / Hybrid / closing / evaluation / feature-snapshot writes | **false** |

The North Carolina @ Clemson NO_SELECTION is legitimate frozen-floor behavior (edge 0.0876 < 0.1). This cohort is immutable. Full ledger: [`2026-09-16-candidate-b-v1-first-prospective-closeout.md`](./2026-09-16-candidate-b-v1-first-prospective-closeout.md).

If a COMMIT report shows `productionCommitAuthorized=false`, that static software field means the workflow does not itself grant operator authorization. It does **not** mean the September 16 COMMIT was unauthorized.

## Operator posture

| Item | State |
|---|---|
| Hybrid Snapshot V1 | Frozen / unchanged by this layer |
| Generic multi-model capture code | Present; additive |
| Migration | **Deployed** (run **34779225982**) |
| Core first prospective production capture | **Proven** (Week 3 COMMIT **34785370466**) |
| Candidate B first prospective research cohort | **Proven and frozen** (Week 3 COMMIT **35128215811**) |
| Current allowlist | Core + Candidate B |
| Future Generic COMMITs | **Not blanket-authorized**; each remains **PER-RUN AUTHORIZATION** / manual-guarded |
| Candidate B status | **SHADOW / RESEARCH ONLY / NOT OFFICIAL** |
| Official Card / Hybrid activation effect | **None** |
| Recurring schedule | **Not authorized** |
