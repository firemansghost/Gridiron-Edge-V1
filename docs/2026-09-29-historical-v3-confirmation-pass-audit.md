# Historical V3 2024 Confirmation — Independent Audit Closeout

**Date:** 2026-09-29  
**Run:** 36597352222  
**Source SHA:** `43e3f0352703818132ca286588689b93fd655c37`  
**Workflow:** Run Historical V3 Confirmation (Manual, Guarded)

## Bottom line

Historical Source-Resilient Confirmation V3 completed its single authorized 2024
source-informed confirmation score and returned:

`HISTORICAL_V3_CONFIRMATION_PASS`

The result was independently audited against the immutable workflow artifact rather
than inferred from the GitHub Actions green check.

V3 scored all **752 / 752** canonical completed 2024 regular-season FBS-vs-FBS games
and satisfied every pre-registered performance and integrity gate.

This closes the V3 2024 confirmation stage.

It does **not** authorize:

- refitting V3 on 2024;
- retuning lambda;
- changing source-gap semantics;
- market evaluation;
- production promotion;
- 2025 outcome access.

The next permitted research step is a separately frozen **2025 Final Holdout V1
contract**.

## Frozen confirmation evidence

Confirmation run:

- run: `36597352222`
- artifact ID: `11045859672`
- artifact name: `historical-v3-confirmation-36597352222`
- ZIP SHA-256:
  `e79872ec4763c71c4d9844bfd6087d214f8c42f0504f51800ff1d03da9b32476`

Frozen pre-score evidence:

- prescore artifact ID: `11045563374`
- prescore ZIP SHA-256:
  `125b8128148844280291eb8372ad1c9580f3c4bed2a344e3c63adc890972a5b6`
- frozen input-manifest SHA-256:
  `763626bebd8a8a80cea37c48cef342b147382f498f332ae286666606170fdc15`

Frozen V3 candidate:

- artifact ID: `11045955232`
- ZIP SHA-256:
  `dfa1bb276d6aa353bbf89db800c9185487f4b77b21f4b5b98d819d69b0ae1257`
- candidate member SHA-256:
  `bae9d7962bfdbe6c268a627ba2e9be396c48f586f5c7b45d550c5a1bde3632fb`
- V1-vs-V3 backcompat member SHA-256:
  `8bb6b51af4fe67b168c5d0808c9a01c6f2289e61649f60ea64373265bb78d8e7`

## Confirmation metrics

| Model | n | MAE | RMSE | Mean error | Median absolute error | R² |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| V3 | 752 | 13.0513901417 | 16.6117675026 | -0.8367726495 | 10.7135907341 | 0.3324906591 |
| Elo + HFA | 752 | 13.3118215052 | 16.7387117980 | -0.8467430793 | 10.9637790365 | 0.3222496930 |
| HFA only | 752 | 15.9022103243 | 20.3109538126 | -1.0455894974 | 12.8205128205 | 0.0021016688 |

V3 improvement versus Elo + HFA:

- MAE: **0.2604313635 points** lower;
- RMSE: **0.1269442954 points** lower.

V3 improvement versus HFA only:

- MAE: **2.8508201826 points** lower;
- RMSE: **3.6991863100 points** lower.

These are descriptive consequences of the already-frozen gate. They must not be used to
retune V3 before the final holdout.

## Gate audit

All frozen gate checks are true:

1. V3 predictions: **752 / 752**;
2. Elo + HFA predictions: **752 / 752**;
3. HFA-only predictions: **752 / 752**;
4. V3 MAE < HFA-only MAE;
5. V3 MAE < Elo + HFA MAE;
6. V3 RMSE <= Elo + HFA RMSE;
7. candidate and baseline states finite;
8. frozen input integrity preserved;
9. market reads = **0**;
10. 2025 reads = **0**.

No input blocker was emitted.

## Source/read boundary

The scorer verified the complete frozen pre-score package and all pinned ZIP/member
hashes before opening the 2024 outcome payload.

Observed execution boundary:

- provider calls: **0**;
- market reads: **0**;
- PPA-sidecar reads: **0**;
- portal reads: **0**;
- 2024 outcome reads: **1**;
- 2025 reads: **0**;
- database reads: **false**;
- database writes: **false**;
- Prisma invoked: **false**.

## Artifact integrity

The confirmation artifact contains four manifested evidence members plus the manifest.

Independent audit verified:

- ZIP SHA-256 matches GitHub artifact digest;
- all manifested byte counts match;
- all manifested SHA-256 digests match;
- prediction game IDs are **752 / 752 unique**;
- every V3, Elo + HFA, and HFA prediction is finite.

Manifested member hashes:

- `metrics/confirmation_metrics.json`:
  `42a5a352dfec85344af03bbc6782a84a27ee6008b41940742e2b5da87274047a`
- `predictions/2024_predictions.json`:
  `689d13153a312de323bbccab7b2ce29e3db4811844d5ceb38342bd529f2ee848`
- `report.json`:
  `ef82542c1349eb75c3a5d6092f50776fd440e13501bd2832fd87b53fefd82e1c`
- `source_provenance.json`:
  `920e1017fee3e2757356b3dd290bb0f427237db6a1ef5ca440929939900edc4a`

## Research interpretation

The V3 result supports one narrow conclusion:

> The frozen 2022–2023 V3 candidate, using the source-resilient semantics frozen before
> 2024 model performance was observed, passed the pre-registered 2024 margin-prediction
> gate against both frozen control baselines.

It does not establish:

- sportsbook profitability;
- ATS edge;
- CLV;
- production readiness;
- 2025 performance.

## Next boundary

The V3 contract permits only the design of a separate **2025 Final Holdout V1
contract** after this audited PASS.

The 2025 snapshot remains sealed from model-performance use until that contract is
frozen.

No V3 rule may be changed between this PASS and the final holdout.
