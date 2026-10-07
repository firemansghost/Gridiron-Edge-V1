# OA-2 Raw versus Opponent-Adjusted Margin Study V1 — Contract

**Date:** 2026-10-07  
**Status:** FROZEN ON MERGE — RESEARCH ONLY; GUARDED EXECUTION AFTER PREVIEW AUDIT  
**Repository:** firemansghost/Gridiron-Edge-V1  
**Reviewed base main:** 3423cec87a87f6c6e0802ee43cb7b33b7ac44b8c  
**Purpose:** Test whether frozen opponent adjustment improves margin prediction over matched raw efficiency.

## 1. Continuity checkpoint

This document supersedes the October 6 source pack only for historical-data status,
OA feature status, and immediate research next steps. Live state in that pack is a
dated checkpoint, not a fresh production DB readback.

OA-DATA-1 remains accepted: run 37513866192, artifact 11436781151,
ZIP SHA-256 0d5371f7dda6f95a14bbd4d40d7a04c442c998daa1a0e47a3459b76364631e10.

OA-DB-1 is CLOSED / PASS per the prior accepted verification and the frozen OA-1 contract.
It created the separate table team_game_efficiency_canonical_v1.
It did not repair or replace the legacy team_game_stats table.
Accepted population: 5,996 rows / 2,998 games; 5,988 AVAILABLE and 8 SOURCE_UNAVAILABLE.
Season 2026 canonical rows: zero at closeout. Live 2026 and legacy tables were protected.

OA-DB-1 evidence:
- schema deployment run 37542378895;
- final reviewed PREVIEW run 37604945054 / artifact 11474034118;
- PREVIEW ZIP SHA-256 65c8dee8e1a2bea44fa27b49bc9f7089c8789a341d63ffec8c04bf7338cebadb;
- COMMIT run 37608802206 / artifact 11475674123;
- COMMIT ZIP SHA-256 2deb8c524978c17ff5e33934a2c27cd4ae1243f0d66643f87481236bf2ad6819.

OA-1 Feature V1 is PASS / VERIFIED / ACCEPTED under the supplied prior acceptance:
- contract PR #237, merge 773e905e7e88eb59939dd1b6fc48af20df41ad0d;
- builder PR #238, merge 3423cec87a87f6c6e0802ee43cb7b33b7ac44b8c;
- run 37613879557;
- artifact 11479616709;
- ZIP SHA-256 2624219b2d8e4e85b27490900f2a1c340a03e9368a071f24d45ae7f3ff57bc95;
- feature member SHA-256 bf7e2e8ba797241a1ad0a8d941e0e56c4895e5d26e202c63f0bd9682351e8ba2;
- 1,484 target games, 2,968 team-side bundles, 60,916 residual-audit rows.

Recovery review on October 7 verified current main, merged PRs, successful build steps,
artifact ZIP digest, all six manifested file sizes/digests, residual sourceWeek < targetWeek,
no target game used as its own source, residual arithmetic, and raw/adjusted aggregate
counts and mean reconstruction. Those checks found zero errors.

This recovery review did not independently reconstruct opponent baseline membership
from canonical source rows and did not perform a new live database readback.
The truncated acceptance sentence is not reconstructed or guessed.

## 2. Question and scope

Primary question: Does the frozen OA-1 adjustment improve a simple margin model
relative to the same model fitted to raw efficiency on identical games?

This is an efficiency-only incremental-information study, not a replacement for the
Balanced Core formula and not a promotion study.
Both seasons have previously supported historical research; 2023 is a chronological
development test, not a pristine unseen holdout.

The existing OA-1 feature definitions remain unchanged:
- same-season, strictly earlier provider-week FBS-vs-FBS history;
- opponent baseline evaluated as of target week;
- residual source game excluded from that opponent baseline;
- one-step raw residualization, equal-game means;
- positive adjusted defense means favorable defense;
- explicit null/count/status missingness.

## 3. Exact allowed inputs

Feature source: accepted OA-1 artifact 11479616709, pinned above.
Use only features/oa_1_game_features.json and its integrity/provenance members.

Proposed outcome source: accepted Historical Development Corpus V1:
- run 36479515332;
- artifact 10997010171;
- ZIP SHA-256 cea83762d2b6e492caec680a74a085ef5a5e283c36a402ef4b35acbe2ce22b7d;
- outcome member outcomes/outcomes.json;
- predictive/game_frames.json may be used only for identity/frame reconciliation.

Before execution, verify ZIP hash, manifest member hashes and bytes, exact outcome-member
path, and schema. No fuzzy path selection. Abort on missing/ambiguous members.
Reading the corpus ZIP for byte integrity does not authorize parsing market, prior,
history, or quarantine layers.

Join by exact season + providerGameId. Require identical week, home/away team identity
and neutral-site state where represented in the frame. Abort on duplicates,
unmatched target keys, changed identity, non-finite scores/margins or inconsistent
homeMargin = finalHomePoints - finalAwayPoints. Preserve the 1,484-game universe.

No provider calls, database reads/writes, markets, bets, closing evidence,
Core/Hybrid/Candidate B/V4 prediction outputs, talent, recruiting, portal or Elo.
No 2024, 2025 or 2026 input rows or outcomes.

## 4. Primary matched cohort

Require, for both home and away:
- all four opponentAdjusted component statuses exactly AVAILABLE;
- all four adjusted counts positive;
- each adjusted count equals its corresponding raw count;
- both raw nets and both adjusted nets finite;
- neutralSite is a known boolean.

Do not impute, zero-fill, substitute raw values into the OA model, or silently drop games.
Emit one cohort ledger row per universe game with eligibility and all exclusion reasons.

Feature-only recovery counts, before outcome/frame checks:
- 2022 universe 734, complete-adjustment games 598, other games 136;
- 2023 universe 750, complete-adjustment games 613, other games 137;
- combined complete-adjustment games 1,211, other games 273.

These are coverage reference counts, not scored results. Reconcile any further
structural exclusions explicitly. Unexpected source or join defects block execution.

## 5. Fixed model pair

Label y = final home points minus final away points.

For RAW:
xP = home.raw.ppaNet.value - away.raw.ppaNet.value
xS = home.raw.successNet.value - away.raw.successNet.value

For OA:
xP = home.opponentAdjusted.ppaNet.value - away.opponentAdjusted.ppaNet.value
xS = home.opponentAdjusted.successNet.value - away.opponentAdjusted.successNet.value

For both:
h = 0 for neutral site, 1 otherwise
predictedHomeMargin = betaP * xP + betaS * xS + betaH * h

Fit separate coefficients for RAW and OA with ordinary least squares, equal game weights.
Exactly three coefficients; no free intercept. This preserves home/away reversal
symmetry with an explicit home-field term. HFA is fitted, not borrowed from production.
No clipping, sign constraints, interactions, feature subsets, reliability weights,
recency decay, regularization search or hyperparameter search.

Use deterministic float64 least squares with relative singular-value cutoff 1e-12.
Record singular values, rank, condition number and coefficient bytes/hashes.
Fail on rank below three, non-finite coefficients/predictions, or condition number
above 1e10. Do not automatically switch solvers/models to obtain a result.

Fit a structural-only reference on the same training games:
predictedHomeMargin = betaH0 * h.
Compute betaH0 by equal-weight least squares; no free intercept.

## 6. Chronological development procedure

1. Freeze this protocol before opening outcome labels.
2. Independently audit source/cohort PREVIEW.
3. Fit RAW, OA and structural-only reference on eligible 2022 games only.
4. Freeze fitted coefficients and hashes before loading 2023 outcome labels.
5. Predict eligible 2023 games using the exact frozen coefficients.
6. Score all three on the identical 2023 cohort.
7. Emit results once under the frozen protocol; retries must preserve semantics.
8. Independently audit predictions, joins, arithmetic and report.
9. Only after review decide whether to advance to separately contracted 2024 validation.

2022 fit metrics are descriptive/in-sample. Never label them prospective or out-of-sample.
Do not use 2023 outcomes in fitting, normalization, eligibility, HFA estimation or feature choice.

## 7. Metrics and provisional advancement rule

Primary: paired 2023 mean absolute error difference:
deltaMAE = MAE_OA - MAE_RAW.

Secondary: deltaRMSE, mean signed error, median absolute error and error quantiles.
Report model/reference metrics and exact denominators for 2022 and 2023.

Fixed diagnostic strata:
- provider weeks 1-4, 5-8, 9+;
- neutral versus non-neutral;
- prior available-game count 1-2, 3-5, 6+ (minimum of home/away).

Do not select a subgroup as the new production population.
No ATS, ROI, CLV or moneyline claims.

Provisional candidate for further validation only if:
- source, timing, join and numeric audits pass;
- 2023 deltaMAE < 0;
- 2023 deltaRMSE <= 0.

Otherwise report NO_CLEAR_DEVELOPMENT_ADVANTAGE.
A pass is not statistical proof, profitability evidence or promotion authorization.
Report season-week paired error summaries to expose concentration/dependence.
Do not change thresholds after viewing results.

## 8. Refitting and later stages

If advancement is accepted, separately authorize deterministic refitting of the same
model specification on eligible 2022+2023 games, with no feature or solver changes.
Freeze that candidate, coefficient bytes, training keys and source identities before
2024 outcome access.

2024 feature construction needs its own stage authorization; 2024 outcome scoring
needs a separate frozen one-shot protocol.
Preserve the four 2024 unavailable-source games and exact missingness semantics.

2025 remains sealed until development, 2024 validation, final candidate freeze and
a separate one-shot 2025 holdout contract are complete.
The blocked Historical Final Holdout V1 remains a separate, unchanged research line.

Any 2026 OA evidence is prospective/shadow only. No 2026 outcome-guided choice.
Core V1, lifecycle, grades, live ML conversion and CORE_EVAL_V1 remain unchanged.

## 9. Engineering and execution sequence

This contract PR is documentation-only and does not itself execute the study.
Bobby authorized merge and continuation on 2026-10-07. Execution still follows
implementation review, source/cohort PREVIEW, independent audit, then guarded fitting/scoring.

After protocol review/freeze:
- implement an artifact-only, read-only planner/fitter/scorer;
- require exact expected main SHA and exact manual confirmation;
- PREVIEW reports identities, full universe/cohort ledger and exclusions without fitting;
- audit PREVIEW before the fitting/scoring execution;
- separate 2022 fitting/freeze from 2023-label loading;
- emit immutable evidence; no production writes.

Required output: source_identity.json, cohort_ledger.json, frozen_models.json,
predictions_2023.json, metrics.json, report.json, manifest.json.
Reports distinguish BLOCKED, execution PASS, and scientific advancement decision.

Tests must verify source hash failure, exact-key joins, no forbidden seasons/layers,
neutral/home symmetry, model freeze before 2023 outcome load, known OLS arithmetic,
identical model cohorts, exclusions and no external I/O in pure math helpers.

## 10. Remaining parallel workstreams

Preserve normal Week 6 live/T-30 operation.
When due, use PREVIEW -> AUDIT -> explicit COMMIT -> VERIFY for closeout.
Lifecycle reaches 1.00 only under the frozen completed-Week-6 policy.
Verify Week 7 prediction cohorts before active-week rollover.
Conduct formal model decision checkpoint after Week 7 grading.
Moneyline calibration needs its own research contract.
RLS remains a separate security workstream.

No live-state assertion here substitutes for fresh repository/DB verification before mutation.
