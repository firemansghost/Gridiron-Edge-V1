# Generic Shadow T−30 Closing Market V1 — Contract

**Status:** `CONTRACT_FROZEN` / `IMPLEMENTATION_NOT_AUTHORIZED`
**Contract date:** 2026-09-16 America/Chicago
**Scope:** Generic Shadow Model Capture V1 closing-market evidence only
**Current production main (context only):** `19c3c4d9cec26d1e42255a446fe52be060a1eab5`

| Boundary | Frozen state |
|---|---|
| Current supported model IDs | `core_v1_shadow_baseline_v1`, `candidate_b_roster_prior_v1` |
| Evaluation protocol | `CORE_EVAL_V1` |
| Official model | Core V1 / `official_flat_100` remains official |
| Candidate B | SHADOW / RESEARCH ONLY / NOT OFFICIAL |
| Hybrid Snapshot V1 closing | Separate and unchanged (`ShadowClosingMarketSnapshot`) |
| This contract | Authorizes **no** production action |

This document freezes the design for a **future** Generic Shadow Model T−30 closing-market evidence layer.

It authorizes **no** implementation, schema, migration, workflow, PREVIEW, COMMIT, provider call, production DB read/write, recurring schedule, evaluation, or model promotion. Merging this contract later MUST NOT itself authorize any of those actions. Future production COMMIT remains **PER-RUN AUTHORIZATION**.

---

## 1. Two existing Shadow evidence families

There are two different existing Shadow evidence families. This contract does **not** collapse them.

### A. Hybrid Shadow Snapshot V1 (do not modify)

Existing Hybrid closing implementation uses `ShadowClosingMarketSnapshot` and `apps/web/lib/shadow-closing-market-v1.ts`.

That path already proves:

- target = kickoff −30 minutes
- `FUTURE` before target
- `DUE` from target until kickoff
- `MISSED` after kickoff if no existing row
- no postkick backfill
- `AVAILABLE` if eligible market exists
- `UNAVAILABLE` if due but eligible market evidence is absent
- existing closing row immutable
- providerCalls=0
- persisted `MarketLine` only
- no prediction mutation
- no evaluation mutation
- no `Bet` / `MatchupOutput` writes

Hybrid closing is **game-level** evidence in the original Hybrid family. Do **not** modify this path. Do **not** silently reuse its table for Generic Shadow. Do **not** copy Hybrid rows into Generic storage. Do **not** treat Hybrid closing rows as Generic closing evidence.

### B. Generic Shadow Model Capture V1 (prediction layer; already proven)

Existing Generic prediction evidence uses:

- `ShadowModelCaptureRun`
- `ShadowModelPrediction`

Current Generic models:

- `core_v1_shadow_baseline_v1`
- `candidate_b_roster_prior_v1`

Both current Generic prediction cohorts are prospective, append-only, research-only evidence.

The current Generic prediction market selector requires:

- source = `oddsapi`
- spread only
- coherent home/away pair
- `selectBookSpreadSnapshots`
- `pickDisplaySpread`
- market timestamp `<=` prediction timestamp
- prediction-time market age `<=` 1800 seconds

Generic closing must become a **SEPARATE** evidence layer. It borrows Hybrid **timing discipline**, not Hybrid persistence.

---

## 2. Central design decision — new Generic closing table

Freeze a **NEW additive** table. This contract PR does **not** add that schema or migration.

| Item | Frozen future name |
|---|---|
| Prisma model | `ShadowModelClosingMarketSnapshot` |
| SQL table | `shadow_model_closing_market_snapshots` |

Do **not** reuse:

- `ShadowClosingMarketSnapshot`
- `shadow_closing_market_snapshots`

Reason: Hybrid closing evidence and Generic multi-model closing evidence are separate evidence families with different lineage.

The new Generic table must be append-only.

- No `@updatedAt`
- Future migration must add DB-level UPDATE/DELETE rejection protection, consistent with Generic Shadow evidence posture
- This contract itself MUST NOT add that schema or migration

---

## 3. Evidence linkage — one row per Generic prediction

One Generic closing-market snapshot may exist per `ShadowModelPrediction`.

| Requirement | Frozen value |
|---|---|
| Unique identity | `predictionId UNIQUE` |
| Relation | `ShadowModelClosingMarketSnapshot.predictionId` → `ShadowModelPrediction.id` |
| Delete behavior | `onDelete RESTRICT` |

This gives an exact immutable chain:

```
ShadowModelCaptureRun
  -> ShadowModelPrediction
    -> ShadowModelClosingMarketSnapshot
```

The closing row therefore inherits exact linkage to:

- prediction capture run
- model
- model hash
- feature hash
- policy hash
- capture context
- prediction timestamp
- game
- selected prediction
- evaluation protocol

Do **not** make closing evidence depend only on current `Game` + week. Do **not** create a free-floating generic closing row with no prediction linkage. No `Game` FK is required. Do not create a cascading relationship to mutable operational `Game` rows. The persisted prediction is the durable evidence parent.

### Why per-prediction linkage is intentional

The T−30 market itself is model-independent, but persistence is intentionally linked one-to-one to a persisted Generic prediction.

This may duplicate the same physical market observation for Core and Candidate B.

That duplication is acceptable because it provides:

- exact cohort lineage
- simple append-only integrity
- no ambiguous many-to-many evaluation join
- support for multiple future prediction contexts in the same game/week
- independent missing/closing state per frozen prediction cohort

Do not optimize this away.

---

## 4. Future storage shape

Do not edit schema now. Required future semantic fields:

| Field |
|---|
| `id` |
| `predictionId` |
| `gameId` |
| `evaluationProtocol` |
| `closingDefinitionId` |
| `closingDefinitionHash` |
| `marketType` |
| `predictionKickoffTimestamp` |
| `closingKickoffTimestamp` |
| `targetTimestamp` |
| `status` |
| `unavailableReason` |
| `selectedHomeMarketLineId` |
| `selectedAwayMarketLineId` |
| `selectedHomeLineValue` |
| `selectedAwayLineValue` |
| `selectedDisplayTeamId` |
| `selectedDisplayLineValue` |
| `canonicalMarketHma` |
| `book` |
| `source` |
| `marketObservationTimestamp` |
| `marketAgeToTargetSeconds` |
| `capturedAt` |
| `createdAt` |

Required relation:

```
prediction -> ShadowModelPrediction
onDelete RESTRICT
```

Required uniqueness: `predictionId UNIQUE`

Recommended future indexes: `gameId`, `targetTimestamp`, `status`, `closingDefinitionHash`

---

## 5. Closing definition identity

| Identity | Frozen value |
|---|---|
| `closingDefinitionId` | `generic_shadow_t30_closing_v1` |
| `evaluationProtocol` | `CORE_EVAL_V1` |
| target offset | **1800 seconds** (kickoff −30) |

### Canonical semantic manifest

Use the repository helper `sha256CanonicalJson` (`canonicalJsonString` of key-sorted JSON, then SHA-256 hex). Do **not** use raw `JSON.stringify`, the markdown-file SHA, a git blob SHA, or a source-code SHA.

`closingDefinitionHash` fingerprints the material semantics that determine what a Generic closing row means. Already-frozen market-selection fields remain unchanged. Additional evidence-affecting semantics are included so the hash covers kickoff source, capture frame, persistence linkage, planning states, persisted statuses, unavailable reasons, and existing-row immutability.

Supported-model eligibility remains an operational allowlist separate from this closing definition and is **not** hashed here.

Any future change to a hash-covered semantic requires a **new closing definition / version / hash**. Do not silently mutate this object in place.

Exact object:

```json
{
  "authorizedSource": "oddsapi",
  "captureFrame": "all_shadow_model_prediction_children_of_exact_capture_run_including_unavailable",
  "closingDefinitionId": "generic_shadow_t30_closing_v1",
  "closingKickoffSource": "current_persisted_game_kickoff_at_closing_planning_time",
  "coherentHomeAwayPairRequired": true,
  "dueRule": "target_timestamp_lte_observed_lt_closing_kickoff_timestamp",
  "evaluationProtocol": "CORE_EVAL_V1",
  "existingRowBehavior": "immutable_idempotent_no_refresh_or_better_line_replacement",
  "futureRule": "observed_lt_target_timestamp_no_row",
  "marketType": "SPREAD",
  "maxMarketAgeToTargetSeconds": null,
  "missedRule": "observed_gte_closing_kickoff_timestamp_no_existing_row_no_persisted_row_no_backfill",
  "noAfterTargetFallForward": true,
  "noPostKickBackfill": true,
  "persistedStatuses": [
    "AVAILABLE",
    "UNAVAILABLE"
  ],
  "persistenceLinkage": "one_closing_row_per_shadow_model_prediction_prediction_id_unique",
  "postCaptureRetarget": "forbidden_existing_closing_row_immutable",
  "preCaptureKickoffDrift": "allowed_when_game_team_identity_consistent",
  "predictionKickoffPreservation": "frozen_prediction_kickoff_retained_separately",
  "providerCalls": 0,
  "selectionModules": [
    "apps/web/lib/market-line-snapshot.ts#selectBookSpreadSnapshots",
    "apps/web/lib/market-line-snapshot.ts#pickDisplaySpread"
  ],
  "targetOffsetSeconds": 1800,
  "unavailableReasons": [
    "missing_market_at_or_before_t30",
    "incoherent_market_at_or_before_t30"
  ],
  "version": 1
}
```

Exact canonical string produced by `canonicalJsonString` of that object:

```
{"authorizedSource":"oddsapi","captureFrame":"all_shadow_model_prediction_children_of_exact_capture_run_including_unavailable","closingDefinitionId":"generic_shadow_t30_closing_v1","closingKickoffSource":"current_persisted_game_kickoff_at_closing_planning_time","coherentHomeAwayPairRequired":true,"dueRule":"target_timestamp_lte_observed_lt_closing_kickoff_timestamp","evaluationProtocol":"CORE_EVAL_V1","existingRowBehavior":"immutable_idempotent_no_refresh_or_better_line_replacement","futureRule":"observed_lt_target_timestamp_no_row","marketType":"SPREAD","maxMarketAgeToTargetSeconds":null,"missedRule":"observed_gte_closing_kickoff_timestamp_no_existing_row_no_persisted_row_no_backfill","noAfterTargetFallForward":true,"noPostKickBackfill":true,"persistedStatuses":["AVAILABLE","UNAVAILABLE"],"persistenceLinkage":"one_closing_row_per_shadow_model_prediction_prediction_id_unique","postCaptureRetarget":"forbidden_existing_closing_row_immutable","preCaptureKickoffDrift":"allowed_when_game_team_identity_consistent","predictionKickoffPreservation":"frozen_prediction_kickoff_retained_separately","providerCalls":0,"selectionModules":["apps/web/lib/market-line-snapshot.ts#selectBookSpreadSnapshots","apps/web/lib/market-line-snapshot.ts#pickDisplaySpread"],"targetOffsetSeconds":1800,"unavailableReasons":["missing_market_at_or_before_t30","incoherent_market_at_or_before_t30"],"version":1}
```

```
closingDefinitionHash =
1a2b01a893e0d8811d5ffe0c78af2f8a15dc9d4eb165b19ef5f14a9e1e8be898
```

This computation is local/provider-free. This PR does **not** create runtime code for it.

---

## 6. Target time

```
targetTimestamp = closingKickoffTimestamp - 30 minutes
```

Exact offset: **1800 seconds**. This contract is explicitly T−30 / kickoff −30.

No operator-supplied arbitrary target timestamp. No operator backdating. No future evaluator may silently redefine closing as final market, last market before kickoff, or end-of-day market.

---

## 7. Kickoff source / schedule drift

The persisted `ShadowModelPrediction` contains the prediction-time kickoff.

For closing capture, future implementation must load the **CURRENT** persisted `Game` kickoff at closing-planning time for the exact prediction game.

Required behavior:

1. Verify current `Game` identity still matches the prediction: `gameId`, `homeTeamId`, `awayTeamId`.
2. Use the current persisted `Game` kickoff as `closingKickoffTimestamp`.
3. Preserve the prediction's frozen kickoff separately as `predictionKickoffTimestamp`.
4. Compute T−30 from `closingKickoffTimestamp`.
5. Report whether kickoff changed since prediction.

A kickoff change **before** closing capture is **not** automatically a blocker.

However:

- team/game identity contradiction **IS** a write blocker
- closing row must persist the kickoff actually used
- once a closing row exists, it is immutable

If kickoff changes **AFTER** a closing row has already been frozen:

- do **not** overwrite the row
- do **not** create a replacement row
- do **not** silently retarget it
- preserve the historical closing evidence
- a future evaluator must handle that schedule-drift case conservatively

The evaluation behavior for post-capture schedule drift is **NOT** implemented by this contract and must not be invented here.

---

## 8. Exact capture frame

Future closing capture must operate on **ONE** exact persisted `ShadowModelCaptureRun` at a time.

Required future operator identity input: `capture_run_id`

The future planner must:

- load the exact `ShadowModelCaptureRun` by ID
- require status `COMPLETE`
- require season/week match
- require `evaluationProtocol = CORE_EVAL_V1`
- require model ID is in the Generic T−30 V1 supported-model allowlist
- load **ALL** `ShadowModelPrediction` children for that run
- verify complete expected prediction frame
- reject duplicate/missing prediction-game identity
- process every persisted prediction row, including `predictionStatus UNAVAILABLE`

Do **not** capture closes only for selected bets. Do **not** exclude unavailable predictions from the closing frame. This prevents selection-biased evidence coverage.

---

## 9. Initial supported model allowlist

Generic T−30 V1 support is initially exactly:

- `core_v1_shadow_baseline_v1`
- `candidate_b_roster_prior_v1`

No other Generic model is automatically eligible. Future model support requires a deliberate contract extension or new contract version.

This does **not** alter the existing prediction workflow allowlists.

---

## 10. Market source

Closing evidence uses persisted `MarketLine` rows only.

| Rule | Frozen value |
|---|---|
| Authorized source | `oddsapi` |
| Required market | spread |
| providerCalls | **0** (`providerCalls=0`) |

No CFBD call. No Odds API call. No SGO call. No weather call.

Closing capture must **NEVER** fetch a provider in order to repair missing persisted evidence. Provider-backed Live Odds persistence remains a separate upstream action.

---

## 11. Critical no after-target fall-forward rule

This is a hard requirement. Eligible market observations MUST satisfy:

```
marketObservationTimestamp <= targetTimestamp
```

No row after T−30 may be used.

- No "nearest around T−30" behavior
- No later market fallback
- No post-target interpolation
- No kickoff fallback
- No `closingLine` field substitution
- No retrospective provider fetch
- **no after-target fall-forward**

**Existing-helper warning:** `apps/web/lib/market-line-snapshot.ts` has existing as-of/closing helper behavior (`filterAsOf`) that can fall back to full history when no pre-cutoff rows exist. That fallback is **FORBIDDEN** for this Generic T−30 evidence contract.

Future implementation must pre-filter authorized market rows to `timestamp <= targetTimestamp` **BEFORE** calling coherent-pair selection. Never pass an empty pre-target set into a helper path that then falls forward to later history.

---

## 12. Market selection semantics

Generic closing must match the Generic prediction market representation.

For each prediction/game:

1. Take persisted `MarketLine` rows for exact game.
2. Keep source exactly `oddsapi`.
3. Keep `lineType` spread.
4. Keep timestamp `<= targetTimestamp`.
5. Reuse `selectBookSpreadSnapshots`.
6. Reuse `pickDisplaySpread`.
7. Require coherent home/away pair.
8. Require the selected home and away rows:
   - same game
   - exact expected team IDs
   - same book
   - same observation timestamp
   - opposite spread sides under existing coherence tolerance
9. Persist **BOTH** source `MarketLine` row IDs.
10. Persist both line values.
11. Persist canonical home-minus-away market value.
12. Persist display team/value.
13. Persist book/source/timestamp.

Do **not** invent a new bookmaker-priority rule. Use the existing Generic prediction display-spread selector semantics.

This is a design difference from Hybrid closing, which currently selects a single eligible spread row rather than the Generic coherent pair.

---

## 13. Closing market age — no maximum closing market age

```
marketAgeToTargetSeconds = (targetTimestamp - marketObservationTimestamp) / 1000
```

It must be `>= 0` for `AVAILABLE` evidence.

There is **NO** maximum T−30 closing-market age threshold in this V1 contract (`maxMarketAgeToTargetSeconds: null`). The prediction-time 1,800-second freshness rule does **NOT** become a closing freshness rule.

At closing:

- latest eligible persisted coherent pair at/before T−30 wins
- its age-to-target is surfaced for audit
- age is not itself a blocker

Do not silently impose a 30-minute closing freshness ceiling. These are different contracts:

- **PREDICTION:** market age `<=` 1800 seconds before prediction
- **CLOSING:** latest eligible persisted coherent pair at or before T−30, with **no maximum closing market age**

---

## 14. Game state semantics

Freeze these planning states exactly: `EXISTING`, `FUTURE`, `DUE`, `MISSED`.

### EXISTING

A closing row already exists for `predictionId`.

- validate immutable row integrity
- do not write another row
- no overwrite
- no refresh
- no "better line" replacement

### FUTURE

`observedTimestamp < targetTimestamp`

- no row
- no mutation

### DUE

`targetTimestamp <= observedTimestamp < closingKickoffTimestamp`

- plan exactly one closing row
- status `AVAILABLE` or `UNAVAILABLE`

### MISSED

`observedTimestamp >= closingKickoffTimestamp` AND no existing closing row

- no row
- no backfill
- no after-kick `UNAVAILABLE` tombstone
- report `MISSED` only

This preserves the proven anti-backfill behavior: **no postkick backfill**.

---

## 15. Persisted status semantics

Persisted closing status remains exactly:

- `AVAILABLE`
- `UNAVAILABLE`

Reuse existing `ShadowAvailabilityStatus` if future implementation can do so without weakening semantics.

`MISSED` is a planning/report state, **NOT** a persisted closing row. `FUTURE` is a planning/report state, **NOT** a persisted closing row.

---

## 16. AVAILABLE row invariants

For `AVAILABLE`, require all of these:

- `unavailableReason = null`
- `selectedHomeMarketLineId != null`
- `selectedAwayMarketLineId != null`
- `selectedHomeMarketLineId != selectedAwayMarketLineId`
- `selectedHomeLineValue` finite
- `selectedAwayLineValue` finite
- `selectedDisplayTeamId` is `homeTeamId` or `awayTeamId`
- `selectedDisplayLineValue` finite
- `canonicalMarketHma` finite
- `book` non-empty
- `source = oddsapi`
- `marketObservationTimestamp != null`
- `marketObservationTimestamp <= targetTimestamp`
- `marketAgeToTargetSeconds >= 0`
- `capturedAt >= targetTimestamp`
- `capturedAt < closingKickoffTimestamp`
- home/away rows correspond to the exact prediction/game teams
- home and away rows form the coherent pair selected by the frozen helper semantics

---

## 17. UNAVAILABLE row semantics

`UNAVAILABLE` may be persisted **ONLY** while the game is `DUE`:

```
target <= observed < kickoff
```

All market-selection fields must be null. `unavailableReason` is required.

Frozen V1 reasons:

| Reason | Meaning |
|---|---|
| `missing_market_at_or_before_t30` | no authorized `oddsapi` spread observations exist at or before target |
| `incoherent_market_at_or_before_t30` | authorized pre-target spread evidence exists, but no coherent home/away pair can be selected under the frozen Generic market selector |

Do not invent a market line. Do not coerce missing evidence to zero. Do not use a later line. Do not downgrade a structural identity contradiction to `UNAVAILABLE`. Identity/frame contradictions are **WRITE BLOCKERS**.

---

## 18. Observed / capture timestamp

PREVIEW and COMMIT use system-observed timestamps.

- No operator-supplied observed timestamp
- PREVIEW timestamp never becomes COMMIT `capturedAt`
- COMMIT must re-plan inside the transaction using a fresh system timestamp
- Persisted `capturedAt` is the actual COMMIT planning timestamp

---

## 19. Future workflow contract

Suggested future workflow filename:

`capture-shadow-model-t30-closing-2026-manual.yml`

Suggested display name:

Capture Generic Shadow Model T-30 Closing 2026 (Manual, Guarded)

Required future inputs:

- `season`
- `week`
- `capture_run_id`
- `mode`
- `expected_main_sha`
- `confirm`

`mode`: `PREVIEW` \| `COMMIT`. Default: `PREVIEW`.

Required future trigger: **workflow_dispatch only**.

No `schedule`. No `push`. No `pull_request`. No automatic recurring execution.

### Future confirmation string

```
CAPTURE_2026_WEEK_<week>_SHADOW_MODEL_T30_<capture_run_id>
```

Examples **only** — this contract does **NOT** authorize either COMMIT:

| Cohort | Example confirmation |
|---|---|
| Candidate B Week 3 | `CAPTURE_2026_WEEK_3_SHADOW_MODEL_T30_74234d87-bb32-47c6-927b-6de3d24cfc88` |
| Generic Core Week 3 | `CAPTURE_2026_WEEK_3_SHADOW_MODEL_T30_882cf725-9e83-431e-965d-0e97df2da635` |

### Future SHA / branch guard

- must run from `refs/heads/main`
- `expected_main_sha` required
- actual checked-out SHA must equal `expected_main_sha`
- mismatch fails before DB mutation
- no implicit "latest main" acceptance after dispatch

### DB secret / provider secret scope

- `DATABASE_URL` and `DIRECT_URL` only in the guarded capture step
- keep DB secrets step-scoped
- no provider API keys in the Generic closing workflow
- required providerCalls: **0**

---

## 20. Future transaction / idempotency

Future COMMIT must:

- use a transaction
- re-load/re-plan inside the transaction
- fail closed on blockers
- create only new due closing rows
- leave `EXISTING` rows untouched
- create no rows for `FUTURE`
- create no rows for `MISSED`
- tolerate exact previously persisted rows as immutable `EXISTING` evidence
- fail on contradictory/duplicate existing state
- never update/delete an existing closing row

Recommended transaction isolation: **Serializable**. Implementation may prove an equivalent stronger transactional guarantee, but may not weaken this contract silently.

---

## 21. Post-write verification

Future COMMIT must read back every inserted closing row and verify exact planned-vs-persisted values.

Verify at minimum:

- `predictionId`
- `gameId`
- `evaluationProtocol`
- `closingDefinitionId`
- `closingDefinitionHash`
- `marketType`
- `predictionKickoffTimestamp`
- `closingKickoffTimestamp`
- `targetTimestamp`
- `status`
- `unavailableReason`
- both selected `MarketLine` IDs
- both selected line values
- display team/value
- `canonicalMarketHma`
- `book`
- `source`
- `marketObservationTimestamp`
- `marketAgeToTargetSeconds`
- `capturedAt`

Verification failure must fail the COMMIT path / transaction where architecturally possible. No "workflow green but unverified write" is acceptable.

---

## 22. Mutation scope

Future Generic closing COMMIT may write **ONLY**:

- `ShadowModelClosingMarketSnapshot`

It must **NOT** write:

- `ShadowModelCaptureRun`
- `ShadowModelPrediction`
- `ShadowModelFeatureSnapshot`
- `ShadowModelFeatureSnapshotTeam`
- `ShadowCaptureRun`
- `ShadowPredictionSnapshot`
- `ShadowClosingMarketSnapshot`
- `ShadowEvaluationResult`
- `Bet`
- `MatchupOutput`
- `Game`
- `Team`
- `MarketLine`
- `TeamSeasonRating`
- `TeamSeasonTalent`
- `TeamGameStat`
- Official Card
- Hybrid evidence
- evaluation evidence

No Prisma migrate inside the capture workflow.

---

## 23. Generic prediction immutability

Closing capture must not mutate prediction evidence.

The following current cohorts remain frozen:

| Cohort | Capture run UUID |
|---|---|
| Generic Core Week 3 | `882cf725-9e83-431e-965d-0e97df2da635` |
| Candidate B Week 3 | `74234d87-bb32-47c6-927b-6de3d24cfc88` |

These IDs are **examples / immutable prediction identity** only. Do **not** claim any Generic T−30 row exists today. Do **not** claim Week 3 Generic closing has been captured.

The closing layer attaches evidence to those immutable predictions. It must never replace/recompute the prediction.

---

## 24. Candidate B boundary

This contract changes **NOTHING** about Candidate B methodology.

Preserve:

- model: `candidate_b_roster_prior_v1`
- feature snapshot: `0332e24f97c891fd6431280fa7939c467c614714abe207eeb3dc89d466eb1148`

Candidate B remains **SHADOW / RESEARCH ONLY / NOT OFFICIAL**.

No formula change. No feature change. No HFA change. No 0.1 selection-floor change. No market-selector change. No promotion. No new prediction capture authorization.

---

## 25. Core official boundary

Core V1 remains the official production spread model. Generic Core Shadow remains research evidence.

Generic closing evidence does **NOT** alter:

- `official_flat_100`
- Official Card
- Core V1 formula
- Core lifecycle formula
- official production selection state

---

## 26. Hybrid separation

Do not modify or migrate Hybrid closing evidence.

| Hybrid remains | Path |
|---|---|
| Table | `ShadowClosingMarketSnapshot` / `shadow_closing_market_snapshots` |
| Logic | `apps/web/lib/shadow-closing-market-v1.ts` |

Generic closing will be additive. No copying existing Hybrid rows into Generic storage. No automatic conversion. No Generic evaluation should silently treat Hybrid closing rows as its own future persisted Generic close.

Generic T−30 semantics borrow the proven Hybrid timing discipline, but Generic persistence is **NOT** the Hybrid persistence model.

- Hybrid closing is game-level evidence in the original Hybrid family.
- Generic closing is one-to-one linked to an immutable `ShadowModelPrediction`.

Do not collapse these evidence families.

---

## 27. Missed Week 3 windows

Implementation timing does not justify weakening evidence rules.

If any Week 3 Generic T−30 target passes before this feature is implemented and production-proven: that prediction's Generic closing evidence is `MISSED`.

Do **NOT**:

- backfill it after kickoff
- use a post-target line
- use a future provider response
- reuse Hybrid closing as if it were Generic closing
- create a fake `UNAVAILABLE` row after kickoff

Missing legitimate evidence remains missing. **no postkick backfill**.

---

## 28. Evaluation boundary

This contract is closing evidence only.

It does **NOT** define or authorize a Generic ATS / CLV / ROI evaluator. Future evaluation must be a separate contract/implementation slice. It must consume:

- immutable Generic prediction evidence
- legitimate Generic closing evidence where available
- outcome evidence separately

No performance conclusion belongs in this PR.

---

## 29. Reporting contract for future implementation

Top-level fields should include at minimum:

- `season`
- `week`
- `captureRunId`
- `modelDefinitionId`
- `modelDefinitionHash`
- `captureContext`
- `evaluationProtocol`
- `closingDefinitionId`
- `closingDefinitionHash`
- `mode`
- `previewObservedTimestamp`
- `commitObservedTimestamp`
- `previewTimestampWillNotBecomeCommitTimestamp`
- `expectedPredictionCount`
- `counts`
- `writeSafe`
- `writeBlockers`
- `providerCalls`
- `mutationsInvoked`
- `commitSucceeded`
- `persistenceCommitted`
- `rolledBack`
- `transactionalIdempotentNoOp`
- `insertedSnapshotCount`
- `verificationOk`
- `verificationReasons`

Per prediction/game report:

- `predictionId`
- `gameId`
- `predictionStatus`
- `predictionTimestamp`
- `predictionKickoffTimestamp`
- `closingKickoffTimestamp`
- `kickoffChangedSincePrediction`
- `targetTimestamp`
- `state`
- `existingClosingId`
- `plannedClosingId`
- `status`
- `unavailableReason`
- `selectedHomeMarketLineId`
- `selectedAwayMarketLineId`
- `selectedHomeLineValue`
- `selectedAwayLineValue`
- `selectedDisplayTeamId`
- `selectedDisplayLineValue`
- `canonicalMarketHma`
- `book`
- `source`
- `marketObservationTimestamp`
- `marketAgeToTargetSeconds`

Counts:

- `totalPredictions`
- `existingCount`
- `futureCount`
- `dueCount`
- `missedCount`
- `plannedAvailableCount`
- `plannedUnavailableCount`
- `plannedInsertCount`

---

## 30. Non-goals

Explicitly **not** authorized by this contract:

- implementation
- schema migration
- workflow creation
- production PREVIEW
- production COMMIT
- provider calls
- evaluation
- CLV calculation
- ATS grading
- ROI calculation
- model promotion
- Candidate B formula changes
- Hybrid changes
- Official Card changes
- recurring automation
- retrospective backfill

---

## 31. Non-authorizing implementation plan

Suggested future slices. Do **not** implement any of these in this PR.

| Slice | Scope | Authorization |
|---|---|---|
| **A** | schema + migration + append-only protection + migration tests | separate PR |
| **B** | pure planner / validator / unit tests | separate PR |
| **C** | DB adapter + guarded CLI + workflow + workflow tests | separate PR |
| **D** | independent PREVIEW audit | separate operator authorization |
| **E** | separate production COMMIT authorization | **PER-RUN AUTHORIZATION** |

Merging this contract does not authorize Slice A–E.
