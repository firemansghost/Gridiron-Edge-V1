# Retrospective Margin Missingness V1 — separate experiment contract

**Experiment ID:** `retrospective_margin_missingness_v1` (RMM1)  
**Date:** November 5, 2026, America/Chicago  
**Status:** DRAFT FOR DESIGN REVIEW AND USER DECISION — NOT FROZEN OR EXECUTABLE  
**Authorized in this step:** write and independently review this new design only.  
**Not authorized by this draft:** source publication, code implementation, provider calls, fitting, tuning, feature-matrix construction, outcome access/scoring or production activation.

## 1. Question, identity and limits

Question: can a predeclared linear or boosted-tree margin pipeline handle explicitly missing historical predictors while preserving the entire game population, and how does removing the four offense/defense components change its results?

This is a new retrospective exploratory experiment. It is not a repair, continuation, retune or new acceptance of Historical Model V3, Final Holdout V1, OA, Core, or any production model. Their original coefficients, scalers, contracts, captures, predictions, failed audits and scientific claims remain unchanged. No existing cohort, card, price, sealed input or immutable evidence may be overwritten, excluded or relabeled. A future RMM1 result must carry this distinct experiment ID and its own source/data/contract hashes.

2022–2023 are development years. Previously observed 2024 is exploratory evaluation, never a clean holdout. 2025 remains sealed and NOT_QUALIFIED. The Phase B recheck found no Air Force/Navy talent and no UNLV opening Elo; it did not change the original `HISTORICAL_FINAL_HOLDOUT_INPUT_BLOCKED` disposition. This draft neither substitutes those values nor clears that holdout. Future prospective evidence is required for production or executable pregame claims. Historical publication/revision timing remains NOT_ESTABLISHED; lower-provider-week ordering alone is insufficient.

No ATS, ROI, CLV, market superiority or historical Core parity claim is part of RMM1. No line, odds, market or tipster input enters this experiment.

## 2. Protected references and new source boundary

Fresh repository reference for this draft: main `5a1daa96dbbd15c362f24c35c1abee27767fb225`, tree `c017ed7d04c7665a764713f4a3ebeb20b89e7ace`. `PROTECTED_EVIDENCE_MANIFEST.json` records original Git blob identities and hashes of the local qualification/evidence references. These are protected references, not permission to execute their workflows or open their payloads.

Accepted design evidence: authenticated 2022–2023 Feature V1/corpus, 2024 predictive/pre-score recovery, Steps 3–5 coverage/comparison and independent review, the selected original 2024 advanced-stat response, and Phase A/B dated acquisition receipts. Preserve each original ZIP and member manifest. New preparation must produce a new manifest that pins every actually used source member and its exact allowed fields, not just a count of files or rows. Do not copy old V3 standardized values, scaler states, predictions, baselines, residuals or performance tables into training.

Only explicitly whitelisted predictor members may be read during future feature qualification. Draft preparation reads reports/source definitions only; it does not reopen outcome payloads. Mixed archives must be accessed through a reviewed member allowlist, never whole-archive semantic parsing. The mixed sealed 2025 snapshot is outside this contract's current read boundary. No new acquisition is requested; existing targeted downloads already completed and must not be repeated simply because gaps remain.

Raw feature construction, component values, missingness assignments and provenance must pass a fresh independent input qualification before a fit. Prior inventory acceptance is not acceptance of a unified new matrix.

## 3. Population, target and coverage ledger

Preserve the authenticated original canonical regular-season FBS-vs-FBS universe: 734 games in 2022, 750 in 2023 (1,484 development games), and 752 in 2024. These are season-specific populations, not complete-case samples. Lock exact game IDs, home/away identities, provider weeks, kickoffs and neutral-site flags in the future predictive manifest. A population mismatch, duplicate canonical ID, conflicting identity, invalid week/kickoff or missing required game-context field stops qualification; no automatic exclusion, fuzzy remapping or new universe definition is allowed.

Future target, after a separately accepted outcome-read gate: final home points minus final away points, including overtime, one row per canonical game. Target identity/nonfinite/missing-final issues stop the affected scoring stage for reconciliation, not silent deletion. The draft itself reads no target values. No mirrored duplicate training games, team-ID predictors, mascot/conference fixed effects or season/year-as-feature are permitted.

For every canonical game retain a ledger with role, feature states for both sides, reason codes, model eligibility, fallback reason, prediction status and later target status. Valid statuses are `WARMUP_ONLY`, `MODEL`, `HFA_FALLBACK_UNSEEN_STATE`, or a named integrity-stage block. An integrity failure blocks the stage globally; it is not an invitation to score a smaller subset.

All valid evaluation games receive either the declared candidate prediction or declared baseline fallback. Complete-case deletion is forbidden. A candidate unable to emit finite predictions for the full evaluation population fails that run; do not compute an apparently successful primary metric on surviving rows. Report any partial metrics only as incomplete diagnostics with the full intended denominator and explicit unavailable count, never as the primary ranking result.

## 4. Frozen feature families and construction

Primary family F14 has these ordered unstandardized concepts per team side:

1. `elo`
2. `talent`
3. `returningPercentPPA`
4. `recruitingPointsY0`
5. `recruitingPointsY1`
6. `recruitingPointsY2`
7. `recruitingPointsY3`
8. `priorFbsGames`
9. `ppaOffMean`
10. `ppaDefMean`
11. `successOffMean`
12. `successDefMean`
13. `ppaNet`
14. `successNet`

F10 is a paired ablation deleting only items 9–12; it retains the same raw states, history rule, population, folds, predeclared eligibility/fallback gate, chosen learner and hyperparameters. F10 is not independently tuned. Its comparison measures this pipeline's component-removal effect, not a separately optimized ten-feature winner.

Static meanings: source `talent`, returning `percentPPA`, recruiting `points`; recruiting slot Yk selects season minus k. Elo selects preseason for target week 1 and provider week targetWeek−1 thereafter, under the original nominal definition. No end-season/alternate-week rating or manual substitute is allowed. Unresolvable provider-week mapping (including unexpected week 0) blocks qualification until an explicitly reviewed amendment, not a silent timing rule.

For target side t, expected history H(t) contains all canonical same-season FBS games involving that team with provider week strictly less than the target week. Same/later-week and noncanonical/FCS games are excluded by definition. Every history edge must have a strictly earlier recorded kickoff. All four advanced fields `offense.ppa`, `defense.ppa`, `offense.successRate`, `defense.successRate` must be finite numbers in the exact uniquely identified team/opponent/game row. Boolean/string/null/nonfinite values are not finite observations.

Let N=|H(t)|. `priorFbsGames=N` is always an AVAILABLE integer, including true observed zero. If N>0 and every expected history row has all four valid fields, compute arithmetic means with equal weight per prior game, then `ppaNet=ppaOffMean−ppaDefMean` and `successNet=successOffMean−successDefMean`. Every one of the six form quantities uses the same complete history. Partial finite-subset means are prohibited.

If N=0, all six raw form values are null with `NO_PRIOR_FBS_GAMES`. If N>0 but any expected prior row/required field is unavailable/invalid, all six are null with `SOURCE_HISTORY_INCOMPLETE`. Retain expected N, complete-observed row count, missing IDs, per-component finite counts and source references as audit metadata. Those audit counts are not additional predictors. Newly computed n=N only when complete; n=0 for no prior history; incomplete n records complete-observed rows. Original V1 null n fields remain untouched and must not be reinterpreted as zero or as proof of missingness.

The missing four 2024 advanced games remain absent; Phase A recovered zero targets. Recoverable 2024 offense/defense components must be reconstructed from the exact already-authenticated selected advanced source, never inferred from net differences. The new builder must independently reproduce all available means and reconcile original rows/history. F14 qualification is a hard primary gate: if its definitions/source values cannot be reproduced, stop and propose a versioned design amendment; do not silently promote F10 or transplant V3 fields.

Game inputs concatenate ordered home F14 then away F14 values, their fixed reason indicators, and `homeVenue=1` for nonneutral or `0` for neutral games. No other context features enter. F10 uses the analogous reduced numeric/indicator inputs but still uses the common F14 eligibility gate defined below.

## 5. Raw states, encoding and training-only support

Each raw feature has exactly one state:

| State | Raw value | Meaning |
| --- | --- | --- |
| AVAILABLE | finite numeric, possibly genuine zero | Exact required source value or complete-history construction |
| NO_PRIOR_FBS_GAMES | null | Natural absence of form history only |
| SOURCE_HISTORY_INCOMPLETE | null | Expected prior form history is incomplete |
| SOURCE_ROW_UNAVAILABLE | null | Required static/Elo row or value is absent/null |
| SOURCE_VALUE_INVALID | null | Required source value exists but is nonnumeric/boolean/nonfinite |

Unknown schema/feature omission, contradictory status/value, duplicate identity, wrong year/team/game, or conflicting source records is a fatal integrity error, not an imputable missing state. Missing raw values stay null forever in evidence; no raw zero-fill, fabricated reference, team-specific exception, cross-year carryforward or complete-case deletion is allowed.

For each training fold and each base feature, pool its AVAILABLE home/away training-side values. Fit one common side-pool median, then substitute that median only in the model-input copy wherever raw is null. If a base feature has no AVAILABLE training values, block that fold/stage; do not drop the column, use validation values or invent zero. For ridge only, compute the training side-pool mean and population standard deviation (ddof=0) after that substitution; use the same location/scale for home and away. Zero variance uses scale=1. Transform validation/evaluation with those saved training parameters only. The boosted tree uses the same finite median substitution without numeric scaling; native-NaN routing is not an alternative in this version.

For every side/base feature allocate four binary indicators, in the fixed non-AVAILABLE state order above. AVAILABLE means all four are zero. Keep every indicator column even if constant zero in training. Indicators and homeVenue are unscaled. F14 therefore has 28 numeric +112 indicator +1 venue =141 model columns; F10 has 20+80+1=101. Missing raw efficiency is not an observed zero even when its final centered model-input value happens to be zero.

Build an observed-support catalog using training predictors only: for each F14 base feature, record the individual non-AVAILABLE states actually observed across the training-side pool. At validation/evaluation, if either side has any non-AVAILABLE feature/state pair absent from that catalog, route the entire game to `HFA_FALLBACK_UNSEEN_STATE`. This gate is identical for F14 and F10, based on all F14 states. Do not fit a median/scaler/indicator coefficient using future data to make an unseen pattern look supported. Record each triggering pair.

This is individual feature-state support, not proof that every joint profile or team is in support. Log previously unseen whole-game state profiles as diagnostics only; they neither change predictions nor create a post hoc exclusion. All-AVAILABLE is not a missing-state trigger. Do not use 2024/2025 frequencies to define the training catalog or relax this gate. Full-development catalogs are allowed only for the final refit after development selection, never in earlier folds. Academy talent or Elo missingness unseen in 2022–2023 would therefore invoke the declared fallback in a future authorized evaluation rather than a silent unsupported model prediction.

## 6. Baselines and fallback

All baseline/fallback parameters use that fold's training outcomes only, after a future outcome-read gate. B0 is mean training home margin. B1 is mean training home margin separately for nonneutral/neutral games; if a venue group has no training rows, use B0 for that group. B1 is the mandatory fallback for unseen missing-feature states; it does not use a target outcome or team-specific estimate.

B2 is a new fixed ridge Elo+homeVenue baseline, alpha=1, intercept included, SVD solver, using the two side Elo values, their eight fixed reason indicators, and venue. It uses the same fold-local Elo median/scaling. Its own unseen missing-Elo state routes to B1; unrelated F14 state gaps do not block this diagnostic baseline. No Elo observations in a training fold blocks B2 and the experiment stage; do not omit a required baseline after seeing results. B0/B1/B2 are new training-only controls, not recovered frozen V3 baselines or a historical reconstruction of production Core.

Report candidate versus each baseline on identical full evaluation rows; include separate MODEL and fallback strata. Candidate primary metrics include fallback rows. F14/F10 paired comparison must use identical common fallback decisions and B1 fallback values, so it cannot gain by changing coverage. No fallback may masquerade as a candidate-native prediction.

## 7. Chronological folds and outcomes boundary

Order games deterministically by season, provider week, kickoff UTC and game ID. Entire provider weeks remain together; no random train/test split, team-side split, same-week outcome update or within-week refit.

Seven expanding development folds:

| Validation block | Training set |
| --- | --- |
| 2022 weeks 5–8 | 2022 weeks below 5 |
| 2022 weeks 9–12 | 2022 weeks below 9 |
| 2022 weeks 13 and later | 2022 weeks below 13 |
| 2023 weeks up to 4 | All 2022 |
| 2023 weeks 5–8 | All 2022 plus 2023 weeks below 5 |
| 2023 weeks 9–12 | All 2022 plus 2023 weeks below 9 |
| 2023 weeks 13 and later | All 2022 plus 2023 weeks below 13 |

2022 weeks below 5 are explicitly WARMUP_ONLY for out-of-fold ranking; their IDs/counts remain in the 1,484-game ledger and they enter later training/final refit. This is a predeclared chronology role, not deletion for missing features. Every other development game appears in exactly one validation block. Block counts/IDs must be frozen from predictors before any new outcome read; empty blocks, fewer than100 unique training games, or any training kickoff not earlier than every validation kickoff block the protocol pending review. No fold may be silently skipped or redefined.

These are fixed-origin block forecasts: a model/transform/support catalog is fit once per block using the stated earlier training set. Precomputed predictor histories may use prior-week games inside the validation block, because those are the declared weekly predictive inputs; no validation target/residual may enter a feature, preprocessing state or model refit. Under this retrospective study, provider-week ordering still does not prove real-time completion/publication.

The draft opens no outcomes. Future development execution requires separate independent implementation/input acceptance and a bounded authorization for 2022–2023 target members. Then validation outcomes may be used only for the declared development ranking. Freeze all final candidates, controls, transforms, support catalogs, config/source hashes and the full 752-game prediction artifact before any new 2024 scoring read. Previously observed 2024 information is disclosed; this sequencing does not restore a clean holdout.

## 8. Candidates, selection and bounded fit budget

All primary fits use F14, full valid training rows (including missing-input rows), uniform game weights and the same target. No target clipping, feature selection, calibration, ensembling, residual correction, sample weighting or unlisted search is allowed.

Primary configurations, in this exact tie order:

1. Ridge alpha100.
2. Ridge alpha10.
3. Ridge alpha1.
4. Histogram gradient boosting max_leaf_nodes3/l2_regularization10.
5. Histogram gradient boosting max_leaf_nodes3/l2_regularization1.
6. Histogram gradient boosting max_leaf_nodes7/l2_regularization10.
7. Histogram gradient boosting max_leaf_nodes7/l2_regularization1.

Ridge uses `fit_intercept=True`, dense float64 and `solver='svd'`; objective is sum squared residuals + alpha times squared coefficient norm, intercept unpenalized. Tree uses scikit-learn `HistGradientBoostingRegressor`: squared_error, learning_rate0.05, max_iter200, max_depthNone, min_samples_leaf20, max_bins63, max_features1.0, categorical_featuresNone, monotonic_cstNone, interaction_cstNone, warm_startFalse, early_stoppingFalse, validation_fractionNone, random_state20261105. No random early-stopping split or hidden validation-based stopping. All unspecified parameters must be serialized with their actual resolved values before the first fit; no impactful library default may change after results. Proposed implementation API is scikit-learn1.9.1; exact Python/scikit-learn/numpy/scipy/build/BLAS versions and package hashes must pass an environment lock and independent compatibility check before fitting. A required estimator/parameter change needs a versioned amendment, never an automatic library upgrade.

Rank the seven primary configurations by pooled out-of-fold full-row MAE, including declared fallback predictions. Let m be the minimum of their seven unrounded MAEs. Define the tie set as every configuration with MAE<=m+1e-6 points, then choose the earliest configuration in the fixed list within that set. Do not implement a pairwise tolerance sort: the minimum-anchored rule avoids nontransitive ties. Do not use RMSE, a favorite season, 2024 or a complete subset to break ties. Log every configuration/fold result, including failed runs. Any fit/finite-output/integrity failure blocks completion; do not replace a failed configuration or hide it from the search count.

After selecting one F14 configuration, run only its paired F10 ablation on the same seven folds using that same chosen learner/hyperparameters and common eligibility/fallback gate; do not retune F10 or use its results to replace the primary winner. Final refit F14, F10 and B2 once each on all1,484 development games; freeze B0/B1 statistics as well.

Maximum planned research-data estimator fits: 7configs×7folds=49, plus7 pairedF10 fits, plus7 fixedB2 fits, plus3 final estimator fits =66. This includes every fit using any real2022–2023target; no2024/2025target enters a fit. Baseline mean calculations and feature-only audits are logged separately, not new search. No retraining/retry to hunt a seed or better metric. An interrupted attempt must reconcile saved progress before any continuation; completed fits are reused only after exact-source/input/environment/artifact identity verification. Infrastructure resumption that must recompute a research-data fit requires its reason and separate acceptance; it cannot add a new config or replace a valid unfavorable result, and all attempts remain visible against the66-fit plan.

Separate synthetic estimator verification budget: at most4fit calls, all using one fixed artificial128-game fixture (96training/32validation), with no historical predictors or targets. Fit Ridge alpha100 twice and the max_leaf_nodes3/l2_regularization10 tree twice, with the exact proposed preprocessing/learner settings. Commit and independently review the deterministic synthetic feature/label generator and its hash before those verification fits; do not search fixture variants or count their results as performance evidence. Other boundary tests must exercise transforms/guards without additional estimator fits unless a reviewed test-plan amendment expands this separate cap. Report synthetic fits separately from the66research-data fits; an infrastructure rerun must retain its failed-attempt record and obtain separate acceptance, not silently exceed either cap.

Repeatability check: same locked environment, synthetic inputs/order/config/threads must reproduce the two repeated32-game prediction vectors within1e-10 absolute points. Pin one numerical thread and record all randomness. Do not promise bitwise reproducibility across different hardware/library builds.

## 9. Metrics, missingness reporting and interpretation

Primary metric: MAE = sum absolute errors / full declared evaluation-game count. Secondary: RMSE = sqrt(sum squared errors / that same count), and mean signed error defined prediction minus actual home margin. Pool OOF games with equal game weight, not equal fold weight. Also report each season/block and paired candidate-minus-baseline absolute-error difference over the identical rows.

Report separately: original canonical count; warmup/OOF/evaluation roles; raw availability by season/side/feature/state; expected and observed form histories; predictor versus target integrity; MODEL/fallback/unavailable counts and percentages; each unseen pair/joint-profile diagnostic; metrics over all rows and descriptive MODEL/fallback strata. Subgroup tables cannot replace full-population metrics. Missing/imputed/fallback games never become NO_SELECTION deletions.

For a complete exploratory report require 100% finite full-row prediction coverage and at least90% candidate-native MODEL coverage in pooled OOF and separately in2024; counts are frozen/reportable even on failure. This90% is a proposed design safeguard, not a threshold derived from a new performance run. If unmet, record COVERAGE_LIMITED and withhold any model-improvement claim; do not adjust the threshold or filter games. Primary development configuration selection still follows the predeclared MAE rule and cannot use 2024 coverage/results to retune.

Report improvements as descriptive retrospective point estimates only. No confidence-interval significance, universal superiority, promotion, betting profitability or PASS claim based merely on beating one baseline. Labels: DRAFT; INPUT_QUALIFICATION_BLOCKED; IMPLEMENTATION_ACCEPTED; DEVELOPMENT_COMPLETE; EXPLORATORY_REPORT_COMPLETE; COVERAGE_LIMITED; or INTEGRITY_STOP, as applicable. Original V3 and holdout statuses remain separately quoted unchanged. Failed validation blocks, metrics and prior versions remain immutable.

## 10. 2025 and any later evaluation

No 2025 raw mixed-snapshot read, feature build, prediction, outcome access or scoring is authorized by adopting this draft. The two accepted Phase B responses are dated predictor-availability evidence only. They did not qualify the rest of2025features, reconcile its canonical IDs or establish publication timing.

Any future2025continuation requires a separately reviewed input-only extraction/construction boundary and qualification, a separately versioned evaluation addendum frozen before predictions/outcome access, and explicit user authorization for its actual outcome stage. Such an addendum must disclose the already observed2025missing-input facts and any previous research influence; define full-population handling under the new experiment rather than silently changing FinalHoldoutV1; and preserve sealed outcome integrity. Nothing automatically unlocks when a workflow is green. An unavailable canonical population or outcome-isolation mechanism blocks that future stage.

## 11. Approval, staged implementation and immutable receipts

This document proposes concrete new rules for user decision; drafting/review is authorized, adoption/execution is not inferred. Independent design review accepts clarity/coherence only, not data readiness, model performance or execution. Freeze an accepted version/hash after the user accepts its new missing-data/fallback/population treatment. Never edit the original V3/holdout contract to make room for RMM1.

Subsequent bounded stages, each separately reviewable:

1. User decision and independent design freeze of this new contract.
2. Specify the outcome-isolated F14/F10 builder, source/member allowlist, provenance and population/fold manifests; implement against artificial fixtures only, preserving source-null states. Synthetic fixtures must test source gaps/natural no-prior/genuine zeros/invalid/duplicate identities, partial histories, null n, unseen-state fallback, fold-local transforms/support and full denominators, within the separate synthetic fit cap. No real feature-matrix build or target read in this stage.
3. Exact implementation/environment and synthetic leakage/boundary review, separate precommit acceptance, then reviewed source publication and CI if needed. Verify direct dependency APIs and record resolved estimator parameters. Accept the exact published builder and bounded real-predictor read/execution plan before real-data feature processing.
4. Run that accepted outcome-isolated builder on only the allowed real predictive members and independently accept its full matrix/folds/read ledger; no targets are opened during construction. Only after that gate may separately authorized bounded2022–2023target reads and the66planned research fits occur, followed by original fit-artifact review. No2024/2025target reads.
5. Independent final development freeze and 2024 full prediction artifact acceptance; then separately authorized2024exploratory scoring and review, with no selection/retuning from it.
6. Stop and present the exploratory findings. Future2025orproduction work requires its own accepted scope and does not follow automatically.

Every stage emits an append-only execution receipt, exact source/contract/environment/input hashes, allowed-member/read ledger, intended/actual operation counts, deterministic manifests, all-game status/prediction ledger and blocker details. Before any potentially duplicate operation after a usage reset, refresh live state and inspect exact existing artifacts. No secret, database connection or production action is needed for this draft.

## 12. Documentation references

Scikit-learn estimator behavior checked November5,2026: [Ridge](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.Ridge.html) and [HistGradientBoostingRegressor](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.HistGradientBoostingRegressor.html). These establish API behavior, not scientific validation of these proposed parameters. Runtime/version compatibility remains a pre-fit gate.

Local evidence references: `../research-resume-20261104-step5/INDEPENDENT_READINESS_REVIEW.md`; `../research-phase-a-20261104/PHASE_A_RESULT_AND_RESUME.md`; `../research-phase-b-20261104/PHASE_B_RESULT_AND_RESUME.md`; `../research-next-experiment-20261104/NEXT_RESEARCH_AND_DATA_PROPOSAL.md`. All original source files remain authoritative. This new draft supersedes no existing experiment or receipt.
