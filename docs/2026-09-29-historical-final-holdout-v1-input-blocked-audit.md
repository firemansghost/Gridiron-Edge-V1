# Historical Final Holdout V1 — Required-Input Preflight Audit Closeout

**Date:** 2026-09-29  
**Run:** 36600675919  
**Source SHA:** `798ae98a771f3a1f80afb4162200ad1bfa1faf99`  
**Workflow:** Evaluate Historical Final Holdout V1 Required Inputs (Manual, Guarded)

## Bottom line

The first authorized Historical Final Holdout V1 required-input preflight completed
successfully and returned:

`HISTORICAL_FINAL_HOLDOUT_INPUT_BLOCKED`

This is a valid research stop under the frozen
`HISTORICAL_FINAL_HOLDOUT_V1_CONTRACT.md`.

The 2025 final holdout is blocked before predictive-input construction, pre-score
freeze, or outcome scoring because the frozen V3 semantics require:

- talent to be available and finite for every canonical target side;
- point-in-time Elo to be available and finite for every canonical target side.

The sealed 2025 source artifact does not satisfy those requirements for the complete
canonical universe.

No 2025 model predictions or model-performance evidence were produced.

## Run identity

- workflow run: `36600675919`
- workflow run number: **1**
- run attempt: **1**
- branch: `main`
- source SHA:
  `798ae98a771f3a1f80afb4162200ad1bfa1faf99`
- current main at audit time:
  `798ae98a771f3a1f80afb4162200ad1bfa1faf99`
- job conclusion: **success**

The successful GitHub Actions conclusion means the guarded evaluator executed as
designed. It does not convert the research status from INPUT_BLOCKED to PASS.

## Canonical universe

The preflight independently reconstructed the frozen 2025 canonical target universe as:

- completed regular-season FBS-vs-FBS games: **762**
- canonical teams: **136**
- team sides: **1,524**

These counts match the previously audited 2025 snapshot facts.

There was no canonical-universe count blocker.

## Required-input blockers

The exact emitted blockers are:

1. `required_elo_missing:UNLV:week_1`
2. `required_talent_missing:Air Force`
3. `required_talent_missing:Navy`

### Talent

The sealed 2025 talent source has no usable required talent row for:

- Air Force
- Navy

Those two team identities appear across **22 canonical target sides**.

Historical Model V3 has no talent-missingness predictor.

The frozen holdout contract therefore prohibits repairing talent with:

- prior-season talent;
- zero;
- team/conference average;
- recruiting points;
- another provider;
- manual game exclusion.

### Elo

UNLV requires preseason Elo for its Week 1 away side in canonical game:

- game ID: `401757224`
- week: **1**
- side: **AWAY**
- team: **UNLV**
- required source: **PRESEASON**
- source state: `SOURCE_ROW_UNAVAILABLE`

The frozen Historical Elo PIT rule requires:

- Week 1 -> preseason Elo;
- Week N >= 2 -> Week N-1 Elo.

No alternate-week, interpolation, game-payload, manual, or substitute-provider repair
is permitted under Final Holdout V1.

## Execution boundary

The run preserved the intended pre-outcome boundary:

- provider calls: **0**
- market reads: **0**
- PPA-sidecar reads: **0**
- portal reads: **0**
- outcome fields used: **false**
- outcome scoring reads: **0**
- model predictions computed: **false**
- database reads: **false**
- database writes: **false**
- Prisma invoked: **false**

Only these sealed snapshot request families were opened:

- `games`
- `talent`
- `elo-preseason`
- `elo-week-01` through `elo-week-16`

No advanced, returning-production, recruiting, lines, PPA, portal, or final-score
evidence was required to establish the block.

## Frozen source identities

2025 snapshot:

- run: `36433016296`
- artifact ID: `10973848747`
- ZIP SHA-256:
  `fda9a410faf3f648de1135a7ed841a497d947d844978513e0bfcd88aea9d0b22`
- source repo SHA:
  `f17b6876ddc8d660ce6b5572ef8742f4e7f9cea7`
- snapshot manifest SHA-256:
  `ae6c347b7b6065eb92b05b85d070b92d79508c6bf941ad42a9bd32b4a12684b2`
- snapshot report SHA-256:
  `804b1d66f0fa90625a2639ef41f9269565f6fb6fc5476e04cea4895570d53c47`

Frozen V3:

- artifact ID: `11045955232`
- ZIP SHA-256:
  `dfa1bb276d6aa353bbf89db800c9185487f4b77b21f4b5b98d819d69b0ae1257`
- candidate member SHA-256:
  `bae9d7962bfdbe6c268a627ba2e9be396c48f586f5c7b45d550c5a1bde3632fb`
- V1-vs-V3 backcompat member SHA-256:
  `8bb6b51af4fe67b168c5d0808c9a01c6f2289e61649f60ea64373265bb78d8e7`
- V3 manifest SHA-256:
  `80dbbf2276b21e497fe818a6dea65b93dd58bcd980a08ac25c4ef32aaaa9ece9`

## Immutable preflight artifact

- artifact ID: `11049058024`
- artifact name:
  `historical-final-holdout-v1-required-inputs-36600675919`
- ZIP SHA-256:
  `d4e57d2dc8263c1a9fbeeb34d944ebb601c5bf4a9d249c8cdfa153fc0f880440`

Independent verification found:

- GitHub artifact digest matched the downloaded ZIP SHA-256;
- all **3 / 3** manifested evidence members matched byte counts and SHA-256.

Manifested members:

- `audit/required_input_preflight.json`
  - bytes: **826**
  - SHA-256:
    `c98567ecc6b7de5187d6e77eb2e252f54eb17b0e0cce1d0b37ca1f8e5fc93094`
- `report.json`
  - bytes: **1,958**
  - SHA-256:
    `a855c82a04636f091f6279b7f6bbaa2645078729de3b8b19ccbac43719841f6c`
- `source_provenance.json`
  - bytes: **1,608**
  - SHA-256:
    `a1230757c2d2ddfbaea0b39b209c3ad48aa0cb21c2c27c625cbf9c18a1acbb45`

## Research interpretation

This result means only:

> The frozen Historical Model V3 semantics cannot produce the complete
> pre-registered 2025 Final Holdout V1 evaluation from the frozen 2025 source artifact
> without changing a required-input rule.

It does not mean V3 failed on 2025 model performance.

No 2025 V3 prediction, residual, MAE, RMSE, baseline comparison, ATS, CLV, or ROI was
observed.

Therefore 2025 model-performance evidence remains unobserved.

## Required stop

Under the frozen Final Holdout V1 contract:

- do not build Stage 2 pre-score freeze;
- do not build or execute the 2025 scoring workflow as a continuation of V1;
- do not substitute Air Force/Navy talent;
- do not reconstruct UNLV preseason Elo;
- do not exclude affected games;
- do not weaken V3 in place.

Any future historical continuation would require a separately versioned model/source
contract that explicitly acknowledges the already-observed 2025 source-availability
facts while preserving that 2025 model performance has not been observed.

The Final Holdout V1 path is closed as:

`HISTORICAL_FINAL_HOLDOUT_INPUT_BLOCKED`
