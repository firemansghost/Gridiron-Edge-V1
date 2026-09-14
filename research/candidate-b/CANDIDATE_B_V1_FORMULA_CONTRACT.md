# Candidate B V1 — Numeric Formula Contract

**Status:** `FORMULA_FROZEN` — RESEARCH ONLY  
**Model status:** SHADOW / RESEARCH ONLY — NOT OFFICIAL  
**Contract date:** 2026-09-14  
**Companion contract:** [`CANDIDATE_B_V1_INPUT_CONTRACT.md`](./CANDIDATE_B_V1_INPUT_CONTRACT.md)  
**Does not authorize:** implementation, feature persistence, Generic Shadow adapter, allowlist/workflow changes, PREVIEW/COMMIT, or production capture

This document freezes the **exact Candidate B V1 numerical formula** after the completed formula + coverage audit.  
It does **not** imply `READY_TO_IMPLEMENT_MODEL`.

Source identities, hashes, missing-data codes, and the 50% portal evidence gate remain as frozen in the input contract. This file does not alter them.

---

## Model identity

| Identity | Frozen value |
|---|---|
| `modelDefinitionId` | `candidate_b_roster_prior_v1` |
| `modelFamily` | `candidate_b_roster_prior` |
| `featureDefinitionId` | `candidate_b_roster_prior_features_v1` |
| `policyDefinitionId` | `candidate_b_roster_prior_spread_policy_v1` |
| Status | SHADOW / RESEARCH ONLY — NOT OFFICIAL |

Unrelated to rejected legacy diagnostic `TALENT_RENORMALIZED` / `talentZ * 14`.

---

## Frozen source integrity references

| Source | Raw payload SHA-256 |
|---|---|
| 2025 CFBD CORE | `d1b80a1b98518355bc6a887d08610a4ce5cf592efeaadb4c7a40f266184e0aae` |
| Sep 1 returning (`percentPPA`) | `fedfbe805fb628452fdfe9d5ea97da917a4f591b5320c8af448abcca38751449` |
| Sep 1 portal | `8ba75badc9f7e8c106e49fa489f2c3f4989a14019ff5f8e720b44f7384003e77` |

---

## Portal formula

### Global reference

```
muPortal = mean(all finite rating values in the frozen Sep 1 portal payload)
```

Audit reference (parity check only — **not** a hardcoded substitute for calculation):

| Item | Audit reference |
|---|---|
| `muPortal` | `0.8533690393918453` |
| Finite rating records | `2894` |

Future implementation **must** calculate `muPortal` from the verified frozen portal source bytes and **may** assert parity with this expected value. Do not skip calculation by hardcoding the reference.

### Directional quality

For each team and each direction (inbound, outbound):

```
IF transferCount == 0:
    directionStatus = NO_TRANSFERS
    centeredDirectionalQuality = 0

ELSE:
    ratedCoverage = finiteRatedTransferCount / totalTransferCount

    IF ratedCoverage < 0.50:
        directionStatus = INSUFFICIENT_RATED_COVERAGE
        portal feature = UNAVAILABLE

    ELSE:
        directionalMeanRating = arithmetic mean of finite ratings in that direction
        centeredDirectionalQuality = directionalMeanRating - muPortal
```

Then, when both directions are available (OK or `NO_TRANSFERS`):

```
portalRaw =
    centeredInboundQuality
  - centeredOutboundQuality
```

### Explicit `NO_TRANSFERS` semantics

Zero for `NO_TRANSFERS` is **centered neutral quality** relative to `muPortal`.

It is **not**:

- player rating zero
- missing data
- 0% coverage
- a reason to invent ratings

Also forbidden in V1:

- stars fallback
- invented ratings
- raw transfer-count as a quality term

When both directions contain transfers with sufficient coverage, `muPortal` cancels and:

```
portalRaw = mean(inbound finite ratings) - mean(outbound finite ratings)
```

---

## Population z-score convention (divisor N)

All Candidate B V1 z-scores use **population** standard deviation with divisor **N**, not N−1:

```
populationMean = sum(x_i) / N

populationVariance = sum((x_i - populationMean)^2) / N

populationSD = sqrt(populationVariance)

z = (x - populationMean) / populationSD
```

Require finite `populationSD > 0`.

Use only legitimately AVAILABLE teams for **each** feature population.

### Feature z-scores

| Feature | Definition | Audited available n |
|---|---|---:|
| `zCore` | population-zscore(2025 CFBD CORE `overall`) | 136 |
| `zTalent` | population-zscore(2026 `talentComposite`) | 138 |
| `zReturning` | population-zscore(Sep 1 `percentPPA`) | 136 |
| `zPortal` | population-zscore(`portalRaw`) | 104 |

Do **not**:

- zero-fill
- mean-impute
- winsorize
- clip
- rescale from outcomes

---

## Composite

```
candidateBRawComposite =
    0.25 * zCore
  + 0.25 * zTalent
  + 0.25 * zReturning
  + 0.25 * zPortal
```

No other weighting scheme is Candidate B V1.

**25/25/25/25** was selected as a deliberately unoptimized, pre-prospective baseline.

It was **not** selected from:

- ATS
- game outcomes
- closing lines
- market fit
- regression search

---

## Complete-vector requirement

A team enters the Candidate B composite population only if **all four** V1 features are available.

Audited complete population: **103 / 138** teams.

- No partial-component Candidate B rating exists.
- No fallback to Core V1, Candidate A, population mean, zero, or an alternate portal metric.

If any required component is unavailable → `TEAM_FEATURE_VECTOR_UNAVAILABLE`.  
A game requires complete vectors for **both** teams; otherwise `predictionStatus = UNAVAILABLE`.

---

## Second-stage composite normalization

```
candidateBCompositeZ =
  population-zscore(candidateBRawComposite among COMPLETE Candidate B teams)
```

Again use population SD divisor **N**, not N−1.

Audit references (evidence only — **not** calculation inputs):

| Item | Approximate audit value |
|---|---|
| Complete n | 103 |
| Raw mean | ≈ 0.081166 |
| Raw population SD | ≈ 0.671379 |
| `compositeZ` mean | ≈ 0 |
| `compositeZ` SD | 1 |

Do not hardcode rounded audit statistics as calculation inputs.

---

## Point scale

```
candidateBTeamRatingPoints = 3.5 * candidateBCompositeZ
```

Purpose:

- preserve a deliberately conservative preseason/early-season points scale
- match the existing Candidate A `talentZ * 3.5` scale anchor
- avoid rejected `talentZ * 14` behavior
- do **not** fit 3.5 from 2026 results

Audit reference distribution (evidence only):

| Stat | Approximate audit value |
|---|---:|
| n | 103 |
| mean | ≈ 0 |
| SD | 3.5 |
| min | ≈ −6.586712 |
| p10 | ≈ −4.077636 |
| p25 | ≈ −2.277507 |
| median | ≈ −0.352551 |
| p75 | ≈ 2.061268 |
| p90 | ≈ 4.344956 |
| max | ≈ 10.879462 |

---

## Matchup formula

```
modelHomeMargin =
    homeCandidateBTeamRatingPoints
  - awayCandidateBTeamRatingPoints
  + computeEffectiveHfa(homeTeamId, neutralSite).effectiveHfa
```

### HFA source

`apps/web/lib/core-v1-spread.ts#computeEffectiveHfa`

Current frozen semantics:

| Item | Value |
|---|---|
| `baseHfaPoints` | 2 |
| `clipRange` | `[0.5, 3.5]` |
| Neutral site `effectiveHfa` | 0 |
| True home | `clip(base + teamAdjustment)` |
| Sign | positive `modelHomeMargin` = home favored |

Apply HFA **exactly once**. No double-counting.

---

## Shared Shadow non-model policy

Candidate B V1 continues to reuse Generic Core Shadow non-model semantics:

- persisted oddsapi spread only
- coherent home/away pair
- market timestamp ≤ prediction timestamp
- market age ≤ 1800 seconds
- `SPREAD_EDGE_FLOOR = 0.1`
- `getATSPick`
- post-kickoff unavailable
- no retrospective prediction backfill

Candidate B differs from Core Shadow via its **rating signal**, not via different HFA / market / edge / pick mechanics.

---

## Static V1 feature posture

The Candidate B V1 roster-prior feature snapshot is **IMMUTABLE** for this prospective model version.

The frozen 2025 CORE, 2026 talent, Sep 1 returning, and Sep 1 portal evidence must **not** be silently refreshed or replaced after prospective capture begins.

A materially changed source definition requires a **new** model/feature version.

HFA and eligible market observation may vary by game/prediction timestamp; the frozen Candidate B team feature basis does **not**.

---

## Coverage limitation

Audited limitation:

| Metric | Value |
|---|---|
| Complete teams | 103 / 138 (74.6%) |
| Week 3 both-complete games | 35 / 57 (61.4%) |
| Week 3 unavailable | 22 / 57 (38.6%) |
| Dominant cause | frozen portal `ratedCoverage >= 0.50` gate |

Classification: **`INPUT_CONTRACT_COVERAGE_PROBLEM`**

This is **not** a formula-freeze blocker for research Shadow V1.

Do **not** weaken the 50% portal gate to improve coverage.

---

## Evaluation universe rule

Candidate B may be evaluated on all legitimate prospective Candidate B predictions.

However, any **head-to-head Candidate B vs Core** comparison must also report a **matched-game** comparison restricted to games where Candidate B had a legitimate prospective prediction.

Do **not** compare Candidate B’s partial-coverage results directly against Core’s full-slate results and attribute the difference solely to model quality.

**Reason:** Candidate B availability is non-random because portal data quality removes a material subset of teams/games.

---

## Audit evidence summary

Formula audit findings (evidence, **not** hardcoded model inputs):

- source hashes all matched
- portal available teams = 104
- complete Candidate B teams = 103
- Week 3 covered games = 35 / 57
- all feature SDs finite and > 0
- Candidate B rating SD = 3.5
- Week 3 complete-game model margin range approximately −7.161806 to +16.463028
- structural pathologies = **NONE**

---

## Exact frozen formula (restatement)

```
muPortal =
  mean(all finite Sep 1 portal player ratings)

directionQuality =
  0
      if NO_TRANSFERS
  mean(direction finite ratings) - muPortal
      if transferCount > 0 and ratedCoverage >= 0.50
  UNAVAILABLE
      otherwise

portalRaw =
  inboundDirectionQuality - outboundDirectionQuality

zCore, zTalent, zReturning, zPortal =
  population-zscore(each feature over its available team population; divisor N)

candidateBRawComposite =
  0.25*zCore + 0.25*zTalent + 0.25*zReturning + 0.25*zPortal

candidateBCompositeZ =
  population-zscore(candidateBRawComposite among complete Candidate B teams; divisor N)

candidateBTeamRatingPoints =
  3.5 * candidateBCompositeZ

modelHomeMargin =
  homeRatingPoints - awayRatingPoints
  + computeEffectiveHfa(homeTeamId, neutralSite).effectiveHfa
```

---

## What remains unauthorized

This formula freeze does **not** authorize:

- feature-persistence schema
- DB migration
- Generic Shadow frame extension
- Candidate B adapter
- allowlist change
- workflow change
- PREVIEW
- COMMIT
- closing capture
- ATS/CLV evaluation implementation
- promotion to official model

---

## Implementation status after this contract

| Gate | Status |
|---|---|
| Formula | **`FORMULA_FROZEN`** |
| Model implementation | **`NOT_READY_TO_IMPLEMENT_MODEL`** |

**Next engineering gate after merge:** design and review the immutable derived feature-persistence layer.

---

## No outcome use

No Candidate B ATS performance, final scores, closing lines, or market-fit optimization was used to select:

- inputs
- 50% portal gate
- equal weights
- second-stage normalization
- 3.5 scale
