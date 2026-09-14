# Candidate B V1 — Input Definition Contract

**Status:** INPUT DEFINITIONS FROZEN — RESEARCH ONLY  
**Model status:** SHADOW / RESEARCH ONLY — NOT OFFICIAL  
**Contract date:** 2026-09-14  
**Does not authorize:** model implementation, coefficients, feature persistence, Generic Shadow adapter, allowlist/workflow changes, or production capture

This document freezes the **input definition contract** for Candidate B V1.  
It does **not** freeze a final numeric Candidate B formula, blend weights, or point scale.

---

## Model identity

| Identity | Frozen value |
|---|---|
| `modelDefinitionId` | `candidate_b_roster_prior_v1` |
| `modelFamily` | `candidate_b_roster_prior` |
| `featureDefinitionId` | `candidate_b_roster_prior_features_v1` |
| `policyDefinitionId` | `candidate_b_roster_prior_spread_policy_v1` |
| `marketType` | `SPREAD` |
| Status | SHADOW / RESEARCH ONLY — NOT OFFICIAL |

### Explicit non-identity

This contract is **unrelated** to the rejected legacy diagnostic:

- label: `TALENT_RENORMALIZED`
- form: `talentZ * 14`

That diagnostic was rejected from serious production consideration because of excessively wide matchup scale. Candidate B V1 must not reuse that identity, formula, or framing.

---

## Input family 1 — Prior-season quality

| Item | Frozen value |
|---|---|
| Source | CFBD CORE 2025 |
| Field | `overall` |
| Provider `modelVersion` | `core-v1` |
| Frozen private snapshot | `cfbd-2025-core-prior-freeze-20260914T061114Z` |
| Raw payload SHA-256 | `d1b80a1b98518355bc6a887d08610a4ce5cf592efeaadb4c7a40f266184e0aae` |
| Retrieval | 2026-09-14 |
| Provider `year` | 2025 |
| Provider `throughSeasonType` | `postseason` |
| Provider `throughWeek` | 1 |
| Unique teams | 136 |
| Duplicate teams | 0 |
| Finality classification | `FINAL_PRIOR_REASONABLY_SUPPORTED` |

### Provenance language (mandatory)

This is a **retrospective September 14, 2026 freeze** of the provider’s 2025 postseason CORE state.  
It is **not** claimed to have been archived contemporaneously during the 2025 season and must not be represented that way.

It may be used only for Candidate B predictions made **after** this retrieval, unless separately justified.

### Missing 2026 FBS teams

- `north-dakota-state`
- `sacramento-state`

### Missing behavior

`PRIOR_SEASON_CORE_UNAVAILABLE`

- Never zero-fill.
- Never substitute Gridiron Core V1 `power_rating` / `team_season_ratings` values.
- CFBD CORE and Gridiron Core V1 are different rating families.

---

## Input family 2 — Current talent

| Item | Frozen value |
|---|---|
| Source | persisted `TeamSeasonTalent` / `team_season_talent` |
| Season | 2026 |
| Field | `talentComposite` |
| Coverage | 138 / 138 |
| Known persistence timestamp | approximately 2026-08-27 17:10Z |

### Rules

- Finite `talentComposite` required.
- Missing behavior: `CURRENT_TALENT_UNAVAILABLE`
- Never refetch CFBD during prediction capture.

---

## Input family 3 — Returning production

| Item | Frozen value |
|---|---|
| Source | September 1 private PIT opening-week baseline |
| Snapshot | `cfbd-2026-w01-seed-partial-20260901T153731Z` |
| Designation | `ONE_TIME_OPENING_WEEK_BASELINE` |
| Primary V1 field | `percentPPA` |
| Coverage | 136 / 138 |

### Not blended into V1

Do **not** blend the following into Candidate B V1 merely because they exist in the snapshot:

- `percentPassingPPA`
- `percentRushingPPA`
- `percentReceivingPPA`
- usage fields

### Missing teams

- `north-dakota-state`
- `sacramento-state`

### Missing behavior

`RETURNING_PRODUCTION_UNAVAILABLE`

- Never zero-fill.

### Timing label

This snapshot was captured **after August 29 games had already occurred**.  
It is **not** a pure preseason snapshot.  
It is eligible only for predictions after its retrieval timestamp.

---

## Input family 4 — Portal movement

| Item | Frozen value |
|---|---|
| Source | same September 1 `ONE_TIME_OPENING_WEEK_BASELINE` |
| Raw source | `player_portal.json` |
| Candidate B V1 metric | `PORTAL_RATED_MEAN_QUALITY_DELTA_V1` |

### Metric definition

```
mean(finite inbound player ratings)
  −
mean(finite outbound player ratings)
```

This is intentionally **not** rated-sum delta.

**Reason:** observed outbound rating coverage is heterogeneous enough that a sum would confound missing-rating coverage with talent movement.

### Explicitly forbidden in V1

- raw inbound count − raw outbound count as the quality feature
- star fallback
- invented ratings
- zero for unknown player rating

---

## Portal direction semantics

For each direction independently (inbound, outbound):

### CASE A — transfer count = 0

This is a legitimate structural empty direction.

- Direction status: `NO_TRANSFERS`
- It is **not** missing
- It is **not** 0% coverage
- It is **not** insufficient evidence

For mean-quality delta purposes, define the empty direction’s quality contribution as:

`NEUTRAL` / `NO_TRANSFER_QUALITY`

Do **not** pretend that a nonexistent player’s rating is `0`.

The implementation design for combining one empty and one populated direction **must preserve this semantic explicitly** and must be reviewed before coding.

### CASE B — transfer count > 0

```
ratedCoverage = finite-rated-transfer-count / total-transfer-count
```

**Candidate B V1 evidence gate:**

```
ratedCoverage >= 0.50
```

If a non-empty direction has `ratedCoverage < 0.50`:

`PORTAL_FEATURE_UNAVAILABLE`

No rounding upward to pass the threshold.

### Contract hold — empty-direction numeric interaction

Because an empty transfer direction does not have a mathematically defined mean player rating, this contract **must not** silently invent a numeric mean of `0`.

Recorded now:

- `NO_TRANSFERS` is a valid state.
- Before Candidate B numerical model implementation, the formula/scale contract must explicitly define how a valid empty direction interacts with the portal-quality feature.
- This is **not** a blocker to freezing the source and evidence gate.
- This **is** a blocker to claiming the final numeric Candidate B formula is frozen.

### Why 50%

The 50% threshold is a **predeclared evidence-quality rule** chosen before any Candidate B prospective performance is observed.

For any non-empty transfer direction, a majority of transfers must have finite provider ratings.

It was **not** selected using:

- ATS results
- wins/losses
- closing lines
- Candidate B hypothetical performance

---

## Deferred portal research

Explicitly deferred to later versions:

### `PORTAL_QUALITY_VOLUME_V2`

Separate quality and movement-volume dimensions.

### `PORTAL_STAR_FALLBACK_V2`

Possible predeclared stars proxy for missing ratings.

Observed descriptive context only (not a conversion freeze):

| Stars | Rated sample n (both rating + stars finite) |
|---:|---:|
| 2 | 6 |
| 3 | 2702 |
| 4 | 179 |
| 5 | 7 |

Additional context: **987** portal records have stars but no finite rating.

Do **not** freeze a stars conversion in V1.

---

## Normalization contract

Each Candidate B input component is intended to be normalized independently by cross-sectional z-score:

```
z = (x − available-population mean) / available-population standard deviation
```

### Rules

- Use only legitimately AVAILABLE teams for that feature.
- Do not insert zeros for unavailable teams.
- Do not mean-impute unavailable teams.
- Preserve feature population count, mean, and standard deviation in eventual frozen feature-snapshot provenance.
- Require finite standard deviation `> 0`.
- Normalization population must be frozen with the feature snapshot.

Do **not** yet specify the final weighted combination of these z-scores.

---

## Team / game availability

A Candidate B team rating requires **all** required V1 components to be available.

If any required component is unavailable:

`TEAM_FEATURE_VECTOR_UNAVAILABLE`

A Candidate B game prediction requires complete feature vectors for **both** teams.

Otherwise:

`predictionStatus = UNAVAILABLE`

### No fallback to

- Core V1
- Candidate A
- Gridiron Core V1
- population mean
- zero
- partial-component model

Under the current evidence set, `north-dakota-state` and `sacramento-state` are therefore expected to be unavailable for Candidate B V1.

---

## Shared non-model policy

Freeze the **intent** to reuse the already proven Generic Core Shadow policy for all non-model prediction mechanics:

- production Core HFA semantics
- persisted oddsapi spread observations only
- coherent home/away spread pair
- market timestamp ≤ prediction timestamp
- market age ≤ 1800 seconds
- `SPREAD_EDGE_FLOOR = 0.1`
- `getATSPick` selection semantics
- post-kickoff = unavailable
- no retrospective backfill

Candidate B should differ from Core Shadow because of its **rating signal**, not because of different HFA, market selection, edge threshold, or pick semantics.

---

## What this contract does not freeze

**NOT FROZEN:**

- blend coefficients
- `25/25/25/25` or any other weights
- point-scale multiplier
- final numeric handling of `NO_TRANSFERS` portal direction
- feature persistence schema
- Generic Shadow engine extension
- Candidate B adapter
- allowlist change
- workflow change
- production capture authorization
- closing writer
- ATS/CLV evaluator
- model promotion

This contract does **not** imply `READY_TO_IMPLEMENT_MODEL`.

---

## No outcome use

This contract was frozen **without** using:

- Candidate B performance
- ATS results
- closing-line results
- 2026 game outcomes

to select these input definitions.

---

## Private evidence references (not committed)

The following remain private / untracked under `.research-data/` and must not be committed to the public repository:

- `cfbd-2025-core-prior-freeze-20260914T061114Z`
- `cfbd-2026-w01-seed-partial-20260901T153731Z`

Raw CFBD payloads are intentionally excluded from this PR.
