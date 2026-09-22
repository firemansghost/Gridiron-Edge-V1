# Generic Shadow CORE_EVAL_V1 Read-Only Evaluator Contract

**Status:** `CONTRACT_FROZEN / IMPLEMENTATION_NOT_AUTHORIZED`  
**Contract date:** 2026-09-22 America/Chicago  
**Scope:** read-only evaluation of persisted Generic Shadow spread cohorts  
**Evaluation protocol:** `CORE_EVAL_V1` — preserved, not revised  
**Evaluator identity:** `generic_shadow_core_eval_v1_readonly_v1`

This contract adapts the already-frozen `CORE_EVAL_V1` settlement, CLV, and research-ROI semantics to the additive Generic Shadow evidence tables.

It does **not** create a new evaluation protocol.

It does **not** authorize:

- evaluation persistence;
- schema changes or migrations;
- prediction or closing writes;
- result-provider calls;
- Odds API / CFBD / weather calls;
- Official Card / `Bet` changes;
- Hybrid changes;
- model promotion;
- retrospective T−30 reconstruction;
- capture-context selection after outcomes.

---

## 1. Governing evidence

V1 evaluates exactly one persisted `ShadowModelCaptureRun` at a time.

Required persisted evidence families:

1. `ShadowModelCaptureRun`
2. child `ShadowModelPrediction` rows
3. optional one-to-one `ShadowModelClosingMarketSnapshot`
4. canonical `Game` result state

The evaluator is a reader only.

No evaluation row is written anywhere.

The existing Hybrid-specific `ShadowEvaluationResult` table is **not** the Generic evaluator output store and must not be reused by this slice.

---

## 2. Cohort identity / anti-cherry-picking

The caller supplies one exact `captureRunId`.

The report must preserve:

- season
- week
- captureRunId
- captureContext
- evaluationProtocol
- modelFamily
- modelDefinitionId + hash
- featureDefinitionId + hash
- policyDefinitionId + hash
- repoCommitSha
- captureTimestamp
- expected Game IDs

Do not:

- combine multiple capture contexts into one reported record;
- choose the best capture after results;
- replace an earlier cohort with a later cohort;
- silently deduplicate separate legitimate prospective cohorts.

Cross-model comparison is a later reporting layer. V1 evaluates one cohort deterministically.

---

## 3. Scope

V1 supports only:

- season = `2026`;
- `evaluationProtocol = CORE_EVAL_V1`;
- `marketType = SPREAD`;
- persisted Generic Shadow capture runs;
- persisted canonical Game results;
- persisted Generic T−30 closing evidence when it legitimately exists.

Model identity is not hardcoded to Core/Candidate B/Elo. A future Generic spread model may be evaluated if its persisted cohort satisfies the same frozen `CORE_EVAL_V1` evidence contract.

Unsupported/non-spread predictions fail closed at row level and are reported explicitly.

---

## 4. Result-source rule

Canonical final-score source is the persisted `Game` row.

A score is gradeable only when:

```
Game.status == final
AND homeScore is a finite integer
AND awayScore is a finite integer
```

If the selected prediction has no valid final score:

- ATS = `UNAVAILABLE`;
- `sideMargin = null`;
- `coverMargin = null`;
- research stake = `null`;
- research PnL = `null`.

Do not infer a final result from another table, provider, web source, or later reconstructed source in V1.

A contradiction between the prediction's frozen game/team identity and the current canonical Game identity is a **report blocker**, not a row to grade.

---

## 5. Prediction availability / selection states

### 5.1 Prediction UNAVAILABLE

If `predictionStatus != AVAILABLE`:

- ATS = `UNAVAILABLE`;
- CLV = `UNAVAILABLE`;
- stake/PnL = `null`;
- row remains in the denominator.

### 5.2 AVAILABLE + NO_SELECTION

If prediction is AVAILABLE and `selectedSide = NO_SELECTION`:

- ATS = `NOT_APPLICABLE`;
- CLV = `NOT_APPLICABLE`;
- stake/PnL = `null`;
- row remains in total prediction denominator;
- row is excluded from graded stake and ATS W/L/P denominator.

### 5.3 AVAILABLE + HOME/AWAY

A selected spread row must have:

- `selectedSide = HOME | AWAY`;
- selected team consistent with the frozen home/away team;
- finite `predictionPickValue`.

Otherwise:

- evaluator marks the row `UNAVAILABLE`;
- emits explicit validation reason(s);
- does not invent a line or side.

---

## 6. Frozen ATS settlement

For a valid selected HOME/AWAY prediction with a valid final score:

```
HOME:
  sideMargin = homeScore - awayScore

AWAY:
  sideMargin = awayScore - homeScore

coverMargin =
  sideMargin + predictionPickValue
```

Settlement:

```
coverMargin > 0  -> WIN
coverMargin = 0  -> PUSH
coverMargin < 0  -> LOSS
```

Implementation may use only a tiny floating-point epsilon required for representation.

It must **not** use the Official Bet half-point push band.

Recommended V1 epsilon:

`1e-9`

Interpretation:

- `abs(coverMargin) <= 1e-9` -> PUSH;
- otherwise sign decides WIN/LOSS.

This epsilon is an implementation precision rule, not a football settlement band.

---

## 7. Frozen CLV convention

CLV is side-specific and independent of ATS grading.

For HOME:

```
closingTeamLine = -closingMarketHma
```

For AWAY:

```
closingTeamLine = +closingMarketHma
```

Then:

```
clvPoints =
  predictionPickValue - closingTeamLine
```

Positive CLV means the prediction captured the better ATS number.

### 7.1 CLV status

For `NO_SELECTION`:

- CLV status = `NOT_APPLICABLE`;
- `clvPoints = null`.

For selected HOME/AWAY:

CLV is AVAILABLE only when the one-to-one Generic closing snapshot:

- exists;
- has `status = AVAILABLE`;
- has `evaluationProtocol = CORE_EVAL_V1`;
- has the frozen Generic T−30 closing definition;
- contains finite `canonicalMarketHma`;
- corresponds to the same prediction/game.

Then compute `closingTeamLine` and `clvPoints`.

If a selected prediction has:

- no Generic closing row;
- a Generic closing row with `status = UNAVAILABLE`;
- invalid/mismatched closing evidence;

then:

- CLV status = `UNAVAILABLE`;
- `closingTeamLine = null`;
- `clvPoints = null`.

**Never**:

- reconstruct a missed T−30 close;
- fall forward to an after-target line;
- substitute Hybrid closing evidence;
- query a provider to repair CLV.

ATS/ROI may still be gradeable when CLV is unavailable.

---

## 8. Frozen research ROI convention

Research comparison only:

- flat risk stake = **$100**
- assumed American price = **−110**
- WIN PnL = **+$90.90**
- LOSS PnL = **−$100.00**
- PUSH PnL = **$0.00**

Per selected, ATS-graded prediction:

```
shadowStake = 100
WIN  -> shadowPnl = +90.90
LOSS -> shadowPnl = -100.00
PUSH -> shadowPnl = 0.00
```

For:

- `NOT_APPLICABLE`;
- `UNAVAILABLE`;
- missing/unfinal result;

both stake and PnL are `null` and are excluded from graded stake.

Aggregate ROI:

```
ROI =
  sum(graded shadow PnL)
  /
  sum(graded shadow stake)
```

When graded stake = 0:

- ROI = `null`, not zero.

The evaluator must not imply these were real wagers.

---

## 9. Denominators and coverage

Every report must preserve the complete capture-run prediction denominator.

Minimum counts:

- totalPredictions
- predictionAvailableCount
- predictionUnavailableCount
- selectionCount
- noSelectionCount
- atsWinCount
- atsLossCount
- atsPushCount
- atsNotApplicableCount
- atsUnavailableCount
- atsGradedCount = WIN + LOSS + PUSH
- clvAvailableCount
- clvNotApplicableCount
- clvUnavailableCount
- finalScoreAvailableCount
- finalScoreUnavailableCount
- closingRowPresentCount
- closingAvailableCount
- closingUnavailableCount

Do not report ATS win rate using unavailable or NO_SELECTION rows in the W/L denominator.

Recommended:

```
atsWinRate =
  wins / (wins + losses)
```

Pushes are reported separately and excluded from ATS win-rate denominator.

When wins + losses = 0:

- `atsWinRate = null`.

Average CLV:

```
averageClvPoints =
  mean(clvPoints where CLV status = AVAILABLE)
```

When no CLV rows are available:

- `averageClvPoints = null`.

---

## 10. Per-prediction report fields

At minimum:

- predictionId
- gameId
- homeTeamId
- awayTeamId
- kickoffTimestamp
- predictionTimestamp
- predictionStatus
- unavailableReasons
- marketType
- selectedSide
- selectedTeamId
- predictionPickValue
- finalGameStatus
- finalHomeScore
- finalAwayScore
- resultAvailable
- atsResult
- sideMargin
- coverMargin
- closingSnapshotId
- closingStatus
- closingUnavailableReason
- closingMarketHma
- closingTeamLine
- clvStatus
- clvPoints
- shadowStake
- shadowPnl
- validationReasons

All unavailable/null states must remain explicit.

---

## 11. Aggregate report fields

At minimum:

- evaluatorDefinitionId = `generic_shadow_core_eval_v1_readonly_v1`
- evaluationProtocol = `CORE_EVAL_V1`
- evaluatedAt = system-observed report time
- readOnly = true
- providerCalls = 0
- mutationsInvoked = false
- capture-run identity/provenance
- counts from section 9
- atsWinRate
- totalGradedStake
- totalResearchPnl
- researchRoi
- averageClvPoints
- perPrediction rows
- blockers
- reportValid

No aggregate should hide missing evidence.

---

## 12. Report blockers

The evaluator must fail the report closed on cohort-level contradictions including:

- capture run not found;
- capture run season != 2026;
- evaluationProtocol != `CORE_EVAL_V1`;
- run status not COMPLETE;
- expected Game-ID set inconsistent with persisted prediction children;
- duplicate prediction game IDs;
- prediction season/week/captureRunId mismatch;
- prediction home/away identity contradicts canonical Game;
- closing row attached to the wrong prediction/game;
- more than one closing row for a prediction;
- unsupported market type in a purported V1 spread cohort.

Missing final scores or missing T−30 evidence are **not cohort blockers**. They are explicit unavailable row states.

---

## 13. Read-only implementation boundary

The implementation slice may perform SELECTs only.

Forbidden calls/targets include:

- any Prisma `.create`, `.createMany`, `.update`, `.updateMany`, `.upsert`, `.delete`, `.deleteMany`;
- `$transaction` used for writes;
- provider `fetch` / axios calls;
- Odds API / CFBD / weather secrets;
- `ShadowEvaluationResult` writes;
- Generic Shadow prediction/closing writes;
- `Bet` / `MatchupOutput` writes;
- Game writes;
- migrations.

A manual workflow, if implemented, must:

- be `workflow_dispatch` only;
- require exact `main` SHA;
- accept one `capture_run_id`;
- expose only the DB read secret to the execution step;
- upload one machine-readable report;
- make providerCalls=0 visible.

---

## 14. Generic vs Hybrid evidence boundary

The formulas are inherited from `CORE_EVAL_V1`, but evidence families remain separate.

Generic evaluator consumes:

- `ShadowModelCaptureRun`
- `ShadowModelPrediction`
- `ShadowModelClosingMarketSnapshot`

It must **not** read Hybrid:

- `ShadowCaptureRun`
- `ShadowPredictionSnapshot`
- `ShadowClosingMarketSnapshot`
- `ShadowEvaluationResult`

as substitute evidence.

---

## 15. Matched-model comparison boundary

A later comparison layer may compare Core, roster-prior Candidate B, and Elo on matched games.

That comparison must:

- identify cohorts explicitly;
- use intersection/matched-game reporting where required;
- preserve each cohort's missing-evidence counts;
- never choose captures after observing outcomes.

This V1 evaluator does not rank models, promote models, or choose a winner.

---

## 16. No-retrospective-repair rule

Historical missing evidence remains missing.

In particular:

- incomplete Week 3 Generic T−30 closing coverage must not be reconstructed;
- a later MarketLine row must not be relabeled as the historical T−30 close;
- a Hybrid close must not be copied into Generic evidence;
- current Game scores may grade ATS once final, but they do not repair missing CLV evidence.

---

## 17. Required implementation sequence

After this contract is independently reviewed and merged:

1. pure deterministic evaluator + synthetic tests;
2. read-only Prisma adapter;
3. read-only CLI;
4. manual SHA-guarded PREVIEW/report workflow;
5. secret-free/static workflow tests;
6. one production read-only proof against an existing legitimate Generic capture run;
7. independent audit of report and DB non-mutation.

No evaluation persistence is authorized by this sequence.
