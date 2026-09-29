# Historical V2 Source Equivalence — Rejected Audit

**Date:** 2026-09-29  
**Workflow run:** `36569502741`  
**Source SHA:** `49fa04db10c3b11c0dac4f7e334aee0515189c05`  
**Workflow:** Run Historical V2 Source Equivalence & Recovery (Manual, Guarded)

## Bottom line

Historical Source Resolution & Confirmation V2 stopped at Stage 1.

Frozen research status:

`HISTORICAL_V2_SOURCE_EQUIVALENCE_REJECTED`

The workflow itself completed successfully because the guardrails executed as designed.

The research qualification **did not pass**.

Therefore:

- no 2024 recovery call was made;
- no recovered 2024 advanced row was emitted;
- no Historical Model V2 build is authorized under this V2 path;
- no 2024 V2 feature/input artifact is authorized;
- no 2024 source-informed confirmation score is authorized;
- 2025 remains locked.

## Execution identity

The run executed from:

- branch: `main`
- exact source SHA:
  `49fa04db10c3b11c0dac4f7e334aee0515189c05`

The exact SHA guard passed.

The exact confirmation was:

`RUN_HISTORICAL_V2_SOURCE_EQUIVALENCE_RECOVERY`

Frozen source artifacts were downloaded and SHA-256 verified before provider work:

### Historical Development Corpus V1

- artifact ID: `10997010171`
- ZIP SHA-256:
  `cea83762d2b6e492caec680a74a085ef5a5e283c36a402ef4b35acbe2ce22b7d`

### Observed 2024 V1 source artifact

- artifact ID: `11008470975`
- ZIP SHA-256:
  `b41e934b26952100e7e056a56114dc81df6bbe77f5c787f28b75b646ae7ea544`

## Provider-call accounting

The frozen V2 limit was **12** calls.

Actual:

- calibration calls: **8**
- 2024 recovery calls: **0**
- total calls: **8**
- HTTP success: **8 / 8**
- provider: CFBD
- endpoint:
  `/game/box/advanced`

The runtime correctly made zero recovery calls after calibration failed.

## Isolation boundaries

Run report confirms:

- market reads: **0**
- PPA-sidecar reads: **0**
- outcome reads: **0**
- 2025 reads: **0**
- database reads: **false**
- database writes: **false**
- Prisma invoked: **false**
- model fit: **false**
- 2024 model score: **false**

The run therefore did not expose 2024 model-performance evidence.

## Calibration cohort

The deterministic 2022–2023 cohort contained exactly eight games:

| Season | Week bucket | Game ID | Matchup |
|---:|---|---:|---|
| 2022 | W1 | `401403853` | Hawai'i vs Vanderbilt |
| 2022 | W6 | `401403909` | Alabama vs Texas A&M |
| 2022 | W12 | `401403947` | Arkansas vs Ole Miss |
| 2022 | FINAL | `401404145` | Army vs Navy |
| 2023 | W1 | `401520145` | Jacksonville State vs UTEP |
| 2023 | W6 | `401520294` | Middle Tennessee vs Jacksonville State |
| 2023 | W12 | `401520402` | Arkansas vs Florida International |
| 2023 | FINAL | `401520445` | Army vs Navy |

Selection was outcome-independent and followed the frozen V2 contract.

## Equivalence result

The frozen tolerance was:

`1e-9`

Each game compares:

- two teams;
- offensive PPA;
- defensive PPA;
- offensive success rate;
- defensive success rate.

Total scalar comparisons:

**64**

Comparisons passing `1e-9`:

**0 / 64**

Therefore the endpoint failed the frozen equivalence gate.

### Per-game maximum absolute difference

| Season | Game ID | Matchup | Max abs difference |
|---:|---:|---|---:|
| 2022 | `401403853` | Hawai'i vs Vanderbilt | 0.15035787080941188 |
| 2022 | `401403909` | Alabama vs Texas A&M | 0.000444444444444414 |
| 2022 | `401403947` | Arkansas vs Ole Miss | 0.061 |
| 2022 | `401404145` | Army vs Navy | 0.00029508196721311775 |
| 2023 | `401520145` | Jacksonville State vs UTEP | 0.00024999999999997247 |
| 2023 | `401520294` | Middle Tennessee vs Jacksonville State | 0.00042105263157893313 |
| 2023 | `401520402` | Arkansas vs Florida International | 0.05696914579172313 |
| 2023 | `401520445` | Army vs Navy | 0.00044827586206896974 |

Five games are numerically close enough to look consistent with rounded presentation
values.

Three games show materially different source semantics:

- Hawai'i vs Vanderbilt;
- Arkansas vs Ole Miss;
- Arkansas vs Florida International.

Those larger differences prevent treating the game-ID advanced-box endpoint as a
lossless replacement for the frozen bulk advanced source.

The V2 contract forbids:

- relaxing tolerance after seeing the result;
- fitted transformations;
- scaling;
- offsets;
- sign corrections;
- post-hoc row exclusions;
- selective acceptance of only the close calibration games.

Therefore no tolerance or mapping repair is legal inside V2.

## Artifact identity

Uploaded artifact:

- artifact ID: `11033760438`
- artifact name:
  `historical-v2-source-resolution-36569502741`
- ZIP bytes: **23,751**
- ZIP SHA-256:
  `cdfb0c533c8ae6ffc44a29b6929185fd30229a73e18f87635227e5b8ecc3237c`

The ZIP contains exactly **13 files**:

- `manifest.json`
- `report.json`
- `source_provenance.json`
- `calibration/cohort.json`
- `calibration/equivalence.json`
- 8 exact raw CFBD response files

The manifest covers exactly **12** non-manifest files.

Independent verification found:

- byte mismatches: **0**
- SHA-256 mismatches: **0**
- missing files: **0**
- unexpected files: **0**

Key internal hashes:

- `manifest.json`
  - bytes: **2,215**
  - SHA-256:
    `ccf650fd97547b80a3886172d98547a4a11918ddf9f67545ee4d7271e729cecf`
- `report.json`
  - bytes: **4,103**
  - SHA-256:
    `44ba8ab2851a9c52297169d967d7af44d3546e79cf0ecf2626295a9aae7cc597`
- `source_provenance.json`
  - bytes: **2,769**
  - SHA-256:
    `75f5dd3a0a305b467f75ae267fe6df38aeb07789b1a7a0ab3ec044c75afa3301`
- `calibration/cohort.json`
  - bytes: **1,189**
  - SHA-256:
    `05e94cb8b14581ab889fa8d4b19612ffbff8c1cfc4447c8c0d1159db4fe29a3a`
- `calibration/equivalence.json`
  - bytes: **15,854**
  - SHA-256:
    `a1dae21ca4989dd32ed3069a10b6c5f8fd21bd84b63b60d6e05d4a7a30de8102`

## V2 consequence

Stage 1 is closed as:

`HISTORICAL_V2_SOURCE_EQUIVALENCE_REJECTED`

Under the frozen V2 contract:

- do not query the four 2024 recovery games;
- do not build V2 2024 predictive inputs;
- do not score 2024;
- do not open 2025.

The source-equivalence failure is not a model-performance failure.

No 2024 model score exists.

## Next research version

Any further attempt to resolve historical source gaps must use a new version.

That future version must explicitly acknowledge that the following evidence is now
observed:

1. 2024 source-availability gaps from V1;
2. 2022–2023 cross-endpoint calibration behavior from this V2 run;
3. the game-ID advanced-box endpoint is not losslessly equivalent to the frozen bulk
   advanced source under V2 semantics.

2024 model performance remains unobserved.

2025 remains sealed.

## Audit conclusion

The workflow did exactly what it was designed to do:

**reject a non-equivalent fallback before it touched 2024 recovery evidence.**

Historical V2 source status:

**REJECTED — ZERO 2024 RECOVERY CALLS — ZERO MODEL SCORE**
