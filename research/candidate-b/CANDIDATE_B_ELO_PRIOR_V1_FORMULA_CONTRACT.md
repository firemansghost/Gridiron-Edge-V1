# Candidate B Elo Prior V1 — Prospective Formula Contract

**Status:** `FORMULA_FROZEN / RESEARCH ONLY`  
**Contract date:** 2026-09-22 America/Chicago  
**Model status:** SHADOW / RESEARCH ONLY — NOT OFFICIAL  
**First prospective observation:** **Week 5, 2026**  
**Does not authorize:** implementation, Generic Shadow allowlisting, T−30 allowlisting, PREVIEW, COMMIT, provider calls, production writes, Official Card changes, Hybrid changes, lifecycle changes, or model promotion.

This contract freezes an Elo-only external preseason-prior challenger after the External Elo Prior Discovery V1 descriptive audit.

It does not alter or reinterpret:

- Core V1;
- Candidate A;
- `candidate_b_roster_prior_v1`;
- the frozen Week 3 Candidate B cohort;
- any Week 4 Generic Shadow cohort;
- any prior official prediction or bet.

No Week 3 or Week 4 prediction may be backfilled, replaced, rescored, or reinterpreted with this model.

---

## Model identity

| Identity | Frozen value |
|---|---|
| `modelDefinitionId` | `candidate_b_elo_prior_v1` |
| `modelFamily` | `candidate_b_elo_prior` |
| `featureDefinitionId` | `candidate_b_elo_prior_features_v1` |
| `policyDefinitionId` | `candidate_b_elo_prior_spread_policy_v1` |
| Market | SPREAD only |
| Status | SHADOW / RESEARCH ONLY — NOT OFFICIAL |

The existing `candidate_b_roster_prior_v1` identity remains frozen and must never be repurposed for Elo.

---

## Frozen source

The only authorized Elo source for V1 is the archived 2026 CFBD preseason Elo discovery snapshot:

`research/candidate-b/snapshots/cfbd-preseason-elo/2026/2026-09-22-raw.json`

Pinned source provenance:

| Item | Frozen value |
|---|---|
| CFBD request | `GET /ratings/elo?year=2026&preseason=true` |
| documented OpenAPI version | `5.29.0` |
| retrieval timestamp | `2026-09-22T14:24:48.916Z` |
| discovery workflow run | `35740044682` |
| raw byte count | `9542` |
| raw SHA-256 | `97e40e9f8220f9e7bafd8c6cd68dbf9ecb4b94208fe5911b97b07891f9fa4e64` |
| raw rows | `138` |
| canonical 2026 FBS coverage | `138 / 138` |
| missing canonical teams | `0` |
| unexpected provider rows | `0` |
| duplicate canonical mappings | `0` |
| null/nonfinite Elo | `0` |

Companion provenance manifest:

`research/candidate-b/snapshots/cfbd-preseason-elo/2026/2026-09-22-manifest.json`

### Historical boundary

This is a September 2026 discovery/archive snapshot of preseason Elo values.

It is **not** proof that the same query or payload was available before the 2026 season and must never be used to claim that a prior prospective prediction should have known these values.

---

## Canonical population

The only model population is the authoritative 2026 FBS universe:

- `TeamMembership.season = 2026`
- `TeamMembership.level = fbs`
- expected unique teams = **138**

All 138 frozen Elo rows resolved exactly to that population during discovery QA.

Team resolution for any implementation must preserve the already-reviewed strict CFBD full-identity semantics:

- `provider='cfbd'`
- `strictFullIdentity=true`
- no fuzzy matching
- no mascot inference
- no parenthetical-stripping fallback as evidence
- no invented aliases

Any future mismatch against the frozen 138-team mapping is a blocker, not an imputation opportunity.

---

## Frozen normalization

Use **population** standard deviation with divisor **N**, not N−1.

For the exact frozen 138-team Elo source:

```
muElo =
  mean(Elo_i over all 138 canonical FBS teams)

populationVariance =
  sum((Elo_i - muElo)^2) / 138

sigmaElo =
  sqrt(populationVariance)

zElo_i =
  (Elo_i - muElo) / sigmaElo
```

Audit parity references:

| Item | Value |
|---|---:|
| N | 138 |
| mean | `1498.7608695652175` |
| median | `1500` |
| population SD | `193.5003858868873` |
| minimum | `925` |
| maximum | `2064` |

Implementation must calculate mean and population SD from the exact hash-verified frozen source and assert parity with these references.

Do **not** substitute the audit references for reading and validating the source.

Do not:

- zero-fill;
- mean-impute;
- conference-impute;
- clip;
- winsorize;
- rescale from game results;
- refresh Elo from CFBD;
- replace the frozen snapshot with a newer Elo response.

A materially different source requires a new model version.

---

## Frozen point scale

```
candidateBEloTeamRatingPoints_i =
  3.5 * zElo_i
```

The coefficient **3.5** is frozen before the first prospective observation.

Reason:

- Candidate A already uses `talentZ * 3.5`;
- the prior descriptive audit found Elo and talent are related but materially non-redundant;
- using the same standardized point-scale SD isolates the **information source** rather than simultaneously changing signal and scale;
- 3.5 is not fitted to 2026 ATS results, final scores, closing lines, or market fit.

Do not optimize the scale after Week 4 results.

---

## Matchup formula

```
modelHomeMargin =
    homeCandidateBEloTeamRatingPoints
  - awayCandidateBEloTeamRatingPoints
  + computeEffectiveHfa(homeTeamId, neutralSite).effectiveHfa
```

HFA must reuse:

`apps/web/lib/core-v1-spread.ts#computeEffectiveHfa`

Apply HFA exactly once.

No Elo-specific HFA adjustment is authorized.

---

## Shared Generic Shadow market / selection policy

The Elo challenger differs from Core/Candidate A through its frozen team-rating signal only.

Reuse Generic Shadow spread mechanics:

- persisted `oddsapi` MarketLine evidence only;
- coherent home/away spread pair;
- market timestamp `<=` prediction timestamp;
- market age `<= 1800` seconds;
- `SPREAD_EDGE_FLOOR = 0.1`;
- `getATSPick`;
- post-kickoff unavailable;
- no retrospective prediction backfill;
- no stale-market rescue;
- provider calls during Generic Shadow prediction capture = **0**.

The eventual policy manifest may differ by identity only where the framework requires unique model/policy IDs. It must not introduce different market, freshness, edge, HFA, or pick semantics.

---

## Frozen discovery evidence supporting a challenger

Descriptive audit over all 138 teams:

| Metric | Value |
|---|---:|
| Pearson(Elo, talentZ) | `0.6112534930985031` |
| Spearman(Elo, talentZ) | `0.6488476591839615` |
| Pearson(zElo, talentZ) | `0.6112534930985036` |

This evidence justified studying Elo as a distinct challenger.

It did **not** choose the model based on:

- ATS;
- final scores;
- closing-line performance;
- ROI;
- 2026 market fit;
- Week 4 outcomes.

The descriptive relationship metrics are rationale/evidence only. They are not model inputs.

---

## No blend in V1

Candidate B Elo Prior V1 is **Elo alone**.

Forbidden in this model version:

- Elo + talent blend;
- Elo + roster-prior blend;
- regression-selected weight;
- correlation-selected weight;
- conference-specific weight;
- outcome-fit scale;
- market-fit calibration.

Any future combined prior requires a separately pre-registered model/version after prospective Elo-only evidence exists.

---

## Prospective boundary

The first authorized prospective observation week for this model family is:

**2026 Week 5**

This contract is frozen before Week 4 results are available.

Do **not** create a Week 4 Elo capture merely because the model contract now exists.

Reasons:

1. Week 4 Core/roster-prior research cohorts are already frozen.
2. Adding Elo late would create a different research clock and complicate the current paired design.
3. Generic Shadow prediction and Generic T−30 closing allowlists do not currently include Elo.
4. Week 5 allows implementation, allowlist extension, and closing-support review to occur deliberately before first evidence.

No Week 5 capture is authorized by this contract alone.

---

## Runtime source posture

Runtime prediction capture must use only an immutable, hash-verified derivation of the archived raw Elo snapshot.

It must make **zero CFBD calls**.

The implementation slice must define a deterministic 138-team derived feature artifact containing, at minimum:

- canonical `teamId`;
- raw Elo;
- `zElo`;
- `candidateBEloTeamRatingPoints`;
- source raw SHA-256;
- row/source provenance sufficient to reproduce the value.

Preferred design constraint:

- no schema change unless separately justified;
- no mutable "latest Elo" lookup;
- no `TeamSeasonRating` masquerade;
- no runtime re-query of CFBD.

The exact transport/persistence mechanism is the next engineering gate and is not authorized by this formula contract.

---

## Generic Shadow / T−30 integration boundary

Current production allowlists remain unchanged by this contract:

- `core_v1_shadow_baseline_v1`
- `candidate_b_roster_prior_v1`

This contract does **not** add `candidate_b_elo_prior_v1` to:

- Generic Shadow PREVIEW/COMMIT;
- capture workflow choices;
- Generic T−30 supported-model allowlist;
- scheduled automation.

Before Week 5, separate implementation/review slices must:

1. implement and test the immutable Elo feature adapter;
2. audit Generic Shadow model-definition/feature/policy hashes;
3. explicitly extend Generic Shadow PREVIEW allowlisting;
4. prove a read-only PREVIEW;
5. explicitly extend COMMIT allowlisting;
6. explicitly extend Generic T−30 closing support;
7. verify scheduler handling without changing T−30 semantics.

No production capture is permitted merely because those code paths exist.

---

## Evaluation rule

When prospective evidence exists, report:

- Elo challenger results on its legitimate prospective prediction set;
- Core results on the same matched games;
- closing coverage explicitly;
- missing-evidence counts explicitly.

Because Elo currently has 138/138 team coverage, no missing-team advantage/disadvantage is expected from the frozen source. Nevertheless, matched-game reporting remains required.

Use the frozen `CORE_EVAL_V1` evaluation protocol unless a separately approved research protocol says otherwise.

No evaluator may reconstruct missing T−30 evidence.

---

## What remains unauthorized

This contract authorizes **no execution**.

Still unauthorized until separate reviewed steps:

- adapter implementation;
- derived feature artifact implementation;
- Generic Shadow allowlist change;
- capture-workflow change;
- Generic T−30 supported-model change;
- Odds API call for Elo;
- Elo PREVIEW;
- Elo COMMIT;
- Week 5 capture;
- closing COMMIT for Elo;
- blend weights;
- official-card use;
- Hybrid use;
- Core lifecycle change;
- model promotion.

---

## Exact formula restatement

```
SOURCE =
  exact archived CFBD preseason Elo bytes
  sha256 =
  97e40e9f8220f9e7bafd8c6cd68dbf9ecb4b94208fe5911b97b07891f9fa4e64

POPULATION =
  exact canonical 2026 FBS 138-team universe

muElo =
  mean(Elo_i)

sigmaElo =
  sqrt(sum((Elo_i - muElo)^2) / 138)

zElo_i =
  (Elo_i - muElo) / sigmaElo

candidateBEloTeamRatingPoints_i =
  3.5 * zElo_i

modelHomeMargin =
    homeCandidateBEloTeamRatingPoints
  - awayCandidateBEloTeamRatingPoints
  + computeEffectiveHfa(homeTeamId, neutralSite).effectiveHfa
```

First prospective observation: **Week 5, 2026**.

No outcome optimization. No retrospective use. No blend.
