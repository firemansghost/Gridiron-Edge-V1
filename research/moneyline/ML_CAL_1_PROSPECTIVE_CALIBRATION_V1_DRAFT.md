# ML-CAL-1 — Prospective Core V1 Moneyline Calibration V1

**Status:** DRAFT / READINESS BLOCKED — not an accepted evaluation contract.  
**Prepared:** 2026-10-07. Repository: `firemansghost/Gridiron-Edge-V1`.  
**Reference main:** `c37b5d367a364398d479c52844466aa4fd3306c2`.

## Purpose and boundaries

Diagnose whether the existing Core V1 spread-to-win-probability conversion is calibrated after the frozen lifecycle reaches full weight. Compare it with prediction-time raw implied and explicitly de-vigged market probabilities. This contract evaluates the unchanged conversion; it fits no alternative, changes no live rule, and authorizes no provider call or database mutation. Any later conversion fitting requires a separately registered development/validation design, ML-CAL-2.

Weeks 1–5 are already observed exploratory evidence. Week 6 is transition evidence, not a pristine test: its predictions predate this draft, at least one kickoff has passed, and completed-Week-5 lifecycle weight is 0.75. Do not pool these weeks into the primary mature-scale cohort. OA-3 failure does not supply moneyline evidence or authorize reopening 2025. Historical 2025 outcomes, markets, bets and model-performance payloads remain out of scope.

## Frozen implementation inventory

These are reference-code facts, not an assertion that every UI route has identical availability semantics.

| Rule | Reference behavior |
|---|---|
| Sign | `coreSpreadHma = m`: positive means home favored. Home betting spread is `-m`. |
| Probability | `pH = clip(1 / (1 + 10 ** (-m / 14.5)), 0.01, 0.99)`; `pA = 1-pH`. |
| Price implied probability | American `a>0`: `100/(a+100)`; `a<0`: `(-a)/((-a)+100)`. |
| ML spread gate | Selection suppressed only when `abs(m)>24`; 24 is eligible. |
| Value | Side model probability minus that side's raw implied probability. Live selection does not de-vig. |
| Minimum | Strictly greater than 0.01; exactly 1pp is not selected. |
| Side | Greatest qualifying value; home wins exact value ties. |
| Grades | A >=0.10; B >=0.05; C >=0.01. These are value-magnitude labels. |
| Fair American display | Clip probability, convert to American price, `Math.round`; use unrounded probability in research. |
| Official planner | Requires coherent paired moneylines and calls `selectCoreV1MoneylinePick`; $100 flat stake. |
| Slate distinction | Inline Week Slate logic can consider one available side; the shared picker requires both finite prices. Do not equate route-level eligibility. |

`selectGameMarketSnapshots` builds same-book, same-timestamp HOME/AWAY pairs and rejects zero/nonfinite prices. Per-book observations sort timestamp descending then row ID descending. Display ML sorts timestamp descending, then home row ID descending, then book name when home row IDs match. Study selection must use these pinned reference functions on a strictly as-of input universe, in `current` mode. Never use the closing selector's latest-overall fallback for prediction-time evidence.

SHA-256 of full UTF-8 reference files at the reference main:

| File | SHA-256 |
|---|---|
| `apps/web/lib/core-v1-moneyline.ts` | `c47c8faad10a6cfec2cb38fa329216233f80c3a2cfb1efd8faf4a9aa1dfab853` |
| `apps/web/lib/core-v1-weekly-card.ts` | `68f29f7c7588aeb16afa0588d0ac9c5b1b87f55b6e2310a62145b5331528ee91` |
| `apps/web/lib/market-line-snapshot.ts` | `d4b274154d588e5a262f0f2e63ebe58e9eab1c70f4fd8dbd322ee56e7d3dc7d2` |
| `apps/web/lib/market-line-helpers.ts` | `d0ebc1776a8342b8eaf5f444db90152f6f093cff04c23b25969930861ce975eb` |
| `apps/web/app/api/weeks/slate/route.ts` | `6317dd38144e23f93ea6365ae0b146a69abbdf2e735e3063aa86e4e66ff88301` |

Inventory covers the official weekly planner and Week Slate conversion. It does not certify every game-detail or other endpoint.

## Proposed prospective window and freeze

Primary window: 2026 regular-season Weeks 7–12 inclusive. Register the accepted protocol, adapter hash, source IDs and first capture's expected-game ledger before any Week 7 study prediction is captured or any Week 7 outcome is inspected. The intended full lifecycle weight is 1.00 only after complete guarded Week 6 closeout. Verify the lifecycle receipt for each capture; do not infer full weight from calendar week alone.

If readiness is not met before Week 7, this draft must be revised and frozen with a new explicitly future window before any capture in that window. Do not silently roll the window forward or reconstruct missed captures. End at the registered final week regardless of results. Require at least 200 primary paired games and nonzero primary observations in all six registered weeks; otherwise report `INSUFFICIENT_EVIDENCE`. These are proposed design minimums, not a power analysis or proof that 200 games suffices for a deployment decision.

Preserve the existing formal Week 7 model decision checkpoint after grading. That checkpoint is a separate operational decision, not permission to score this study early or alter its rules. A change to Core, lifecycle, conversion or capture semantics during this study closes this version as `VERSION_INTERRUPTED`; report the prior observations descriptively and register a future version rather than pooling regimes.

## Unit, universe and immutable evidence

One observation per canonical FBS-vs-FBS game, home-win target `y=1` if final home score exceeds away score and `0` otherwise. Exclude ties, cancellations, abandoned games and nonfinal outcomes from scoring through explicit reason-ledger rows; never label a tie as an away win. No correlated HOME/AWAY duplication.

Capture every tracked game, including `NO_SELECTION`, unavailable inputs, large spreads and missing ML prices. Persist a planned universe and reason ledger before outcomes. A game-level Core forecast must be available before kickoff and at least 30 minutes before kickoff. Preserve the full-precision Core margin, both probabilities, team IDs/orientation, neutral-site flag, kickoff as known at capture, capture timestamp, immutable ratings/input provenance, lifecycle receipt, repository SHA and model hash. Do not recompute old predictions from current ratings or infer probabilities from rounded fair-American odds.

For multiple legitimate prospective captures, select the earliest successful frozen weekly cohort containing the game; an originally unavailable row stays unavailable for this version. Resolve capture-time ties by capture ID ascending. Added/rescheduled games after cohort freeze are explicit exclusions; kickoff changes get a revision ledger and cannot make a late capture legitimate. A source adapter must preserve source lineage and demonstrate the rule before registration.

Primary population: available Core forecasts with full lifecycle weight and `abs(m)<=24`, irrespective of bet selection/value/grade, with valid paired ML baseline evidence. Large-spread forecasts and missing-market forecasts form separately counted descriptive populations. Report model-only metrics on the available in-gate forecast cohort in addition to the primary paired comparison, so market missingness stays visible.

Market evidence must be append-only and tied to each prediction timestamp: paired HOME/AWAY prices, same game/book/provider/timestamp, both row IDs, ingestion/created timestamp and frozen artifact hash. Each observation and its known availability time must be at or before capture; market age must be 0–1,800 seconds. Filter this strict as-of universe before applying pinned snapshot selection. Reject invalid/zero prices, inconsistent team identity, stale/future rows, missing pairs and provenance ambiguity. Do not combine best prices across books, use latest current lines later, or substitute closing lines. An absent capture-time availability timestamp requires accepted immutable evidence proving contemporaneous availability, otherwise exclude with an explicit reason.

No primary game may be excluded for realized result, predicted loss, disagreement, grade or profitability. Freeze predictions, availability ledger, paired market rows and manifest before loading score labels. Later score corrections create versioned score evidence and a reproducible revision; they never replace the pre-score predictions.

## Baselines, metrics and fixed diagnostics

For paired American prices define raw implied `qH,qA`. Primary market baseline is proportional de-vig `qH/(qH+qA)` and its complement. Also report `qH` as the raw home-implied baseline, explicitly noting that raw HOME/AWAY implied values need not sum to one. Keep raw overround `qH+qA-1` in diagnostics. No alternative de-vig method is searched in V1.

Primary endpoint: paired difference in mean Brier score, `mean((pH-y)^2) - mean((qH_devig-y)^2)`. Secondary safeguard: paired natural-log loss difference, with each probability clipped to [0.01,0.99] for log-loss scoring and all clipping counts reported. Report Brier on unclipped valid market probabilities and production-clipped model probabilities. Report raw-baseline metrics and both cohort counts separately.

Prespecified diagnostics: each week; home/away market favorite (paired raw prices determine favorite; equal implied probability is pick'em); `abs(m)` bins [0,7), [7,14), [14,21), [21,24]; fixed home-probability deciles [0,.1), ...,[.9,1]; all-game model-only vs paired-cohort results; selected ML bets and A/B/C value buckets. For each reliability bin report n, mean predicted probability, realized home-win frequency and expected vs actual wins. Empty bins remain present with undefined means. Selected-side diagnostics may transform the single game observation to the actually selected side, without adding another primary row. Grade/value diagnostics are descriptive and do not license filters, staking or threshold changes.

Spread-scale diagnostics on the same games: Core and frozen prediction-time market HMA MAE/RMSE, mean absolute magnitude ratio (undefined if market denominator is zero), signed bias, and residual distributions. These help separate margin-scale behavior from probability-conversion behavior; they cannot establish a causal explanation or select a new divisor.

Report paired per-game losses and a descriptive 95% week-block bootstrap interval: 10,000 resamples of the six weeks with replacement, seed 20261007, retain all games in each selected block and calculate the resampled per-game mean. Identify that six blocks and repeated teams limit uncertainty estimation. No early stopping, sequential significance testing, post-hoc subgroup advancement, or interval-only promotion.

## Interpretation and acceptance

Execution/independent-audit acceptance is separate from calibration evidence. Once sample and integrity checks pass, label the fixed conversion `COMPARATIVE_SUPPORT` only if paired Brier difference <0 and paired log-loss difference <=0; otherwise `NO_COMPARATIVE_SUPPORT`. This is a descriptive comparison gate, not an automatic production promotion or proof of calibration. Always show absolute reliability and uncertainty, including unfavorable diagnostics. No observed result from V1 opens historical 2025 or authorizes changing Core, ML rules or bet records.

## Readiness audit — 2026-10-07 13:56 UTC

Read-only production inventory found:

- Week 6 official card: 57 spread +39 ML bets, 0 graded; Week 7 official rows absent.
- Week 6 Candidate B Elo run `efc2755a-526e-4506-a33a-bf36d97d19b3`: COMPLETE, 58 available, 57 selections and 1 no-selection. This is not an all-game Core cohort.
- `shadow_prediction_snapshots`: no Week 6 or Week 7 rows. The general model-capture inventory for these weeks showed only the Elo run.
- `bets` stores selected rows with rounded/model-price semantics; it is not sufficient evidence for an unbiased all-game calibration study. Append-only `market_lines` has team/book/source/timestamp/created_at fields, but this inventory has not audited actual coherent capture-time pair coverage.

**Blocked before execution:** establish an immutable all-game Core snapshot source (an existing guarded workflow artifact may qualify after a full source audit), prove paired ML provenance/as-of coverage, pin and test the read-only adapter, freeze capture/run IDs and universe before outcomes, and independently audit the pre-score manifest. Do not create a new DB writer merely to meet this draft. Any required capture capability must be designed as a separately reviewable change under existing mutation discipline.

Implementation checks must cover sign, probability clipping, exact 1pp/24 boundaries, tie handling, paired-price provenance, no-selection retention, duplicate games, missingness, outcome isolation, reproducible metrics, and blocked 2025 access. Current work prepared the draft and audited inventory only; no calibration dataset was built, fitted or scored.
