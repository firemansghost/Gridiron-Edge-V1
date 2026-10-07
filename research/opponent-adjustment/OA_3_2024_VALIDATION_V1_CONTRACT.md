# OA-3 — 2024 source-informed validation V1

Status: FROZEN SPECIFICATION / USER AUTHORIZED NEXT STEPS on 2026-10-07.
Protocol is frozen before 2024 efficiency rows or numeric outcomes are decoded.
Execution additionally requires exact merged source bytes and passing staged audits.

## Frozen candidates

Use the combined 2022–2023 freeze from PR #241, source main
f2e2d2360bf416bab3ffd78273f73f92e055b7c4.
frozen_models.json SHA-256:
f2c8efa5cdb65d3e61e79ab660358e5c794622138d3e7c3a9f70515802c82cf2.
Refit manifest SHA-256:
1fb36c8c1ee695de8a62794b9370fbd82c37a4ce8a9a3ec4f6993a7b585b5f4a.

RAW and OA: margin = betaP × (home PPA net − away PPA net)
+ betaS × (home success net − away success net) + betaH × h;
h is 0 at a neutral site and 1 otherwise. STRUCTURAL uses betaH × h only.
No fitting, normalization, free intercept, clipping, imputation, weighting,
parameter search or revised week filter is permitted in this validation stage.

| Model | betaP | betaS | betaH |
|---|---:|---:|---:|
| RAW | 16.722909937791393 | 43.88831511158056 | 2.7195377193306958 |
| OA | 17.07623783693658 | 48.39539097327268 | 2.832954308061345 |
| STRUCTURAL | — | — | 3.209144792548686 |

## Pinned sources and execution order

Canonical efficiency source: OA-DATA-1 artifact 11436781151, run 37513866192,
ZIP SHA-256 0d5371f7dda6f95a14bbd4d40d7a04c442c998daa1a0e47a3459b76364631e10.
Member archive/canonical_team_games.json SHA-256:
6ccea22db8e74feabdc08bbe9b422703486d48fa6820a4dfa802475e04420ff2.
Decode 2024 rows only, selecting season through a two-field identity-prefix
projection before JSON decoding any efficiency values. Other-season payloads
remain unparsed. The 2024 universe is 1,504 sides / 752 games, 1,496 AVAILABLE
and eight SOURCE_UNAVAILABLE. The earlier DB fingerprint
bafb5c589ed144f7f7ef9634829fb4b5fb6ad8c408b9e0f3cd560615a3464c22
is a predecessor receipt, not a fingerprint recomputed by this artifact adapter.
No DB read or internal-team-ID lookup is required: exact canonical CFBD team
names, prefixed CFBD_NAME:, serve solely as research indexing IDs. No fuzzy
matching. All model joins use provider game IDs and exact home/away names.

The unchanged OA-1 computeOa1FeatureRows core is reused byte-for-byte; SHA-256:
c5077f7d18ad175617061c35a236d2b3f337f10a44c8a451cdd41a480ca096e5.
Only the new archive adapter, 2024 source gates and staged scoring code are added.
Before execution, demonstrate feature arithmetic/status/count backward compatibility
against all 1,484 accepted 2022–2023 OA-1 games, ignoring indexing ID namespaces.
Structural fields, statuses and counts must match exactly; numeric values must
match within absolute 1e-12. This accounts solely for the observed accepted raw
archive versus persisted DB decimal representation difference, without any
rounding transform. Development comparison maximum difference was 2.220446049250313e-16.
The OA-2 Python design/metric helper is also unchanged and pinned to
fb9c112d62b113a5239dc33326f1a5a97f0e88dba2870b81b8715f42c9520934.

Final-score source: accepted 2024 snapshot artifact 11008470975, run 36508377627,
ZIP SHA-256 b41e934b26952100e7e056a56114dc81df6bbe77f5c787f28b75b646ae7ea544;
source SHA e1b27f6c5681f6ab4f8d24e50f88e387c64657a7.
Member raw/001-games.json SHA-256:
942cf02ef8888c9d31676c5097ae821016fc2e7f35b25b7fd5ad890d2477cf59.
Do not derive a new outcome acquisition. SCORE alone decodes this member and
projects id/season/seasonType/completed, FBS classifications, home/away names
and final points. Select completed regular 2024 FBS/FBS games; require exactly
752 unique game identities and finite final scores. Full universe identities
must match the canonical frames before the eligible subset is scored.
No other snapshot members are JSON-decoded for the model or scoring.
ZIP integrity hashing is distinct from semantic payload decoding.

FEATURE builds and freezes features/residuals/coverage without opening final
scores. Independently audit FEATURE before PRESCORE. PRESCORE verifies that
receipt, freezes the matched cohort and predictions with byte-identical model
coefficients, then is independently audited before SCORE. SCORE verifies both
reviewed receipts and predictions before decoding any numeric 2024 final score.
Each stage pins the exact repository main SHA, protocol hash, source hashes and
freeze hash. Existing output directories cannot be overwritten. Manifest/member
hashes, inventories and duplicate JSON keys must be checked. No model fit is
available in this runner. Execution may be LOCAL_ARTIFACT_ONLY with no Actions
run/artifact ID; source environment guards do not imply Actions execution.

## Feature-only preview and freeze

Apply OA-1's accepted semantics unchanged, with season scope 2024 only:
same-season prior provider weeks, FBS/FBS games, equal-game means, one-step
opponent residuals; exclude the source game from its opponent baseline; no
recursion, recency weights or later-week information. Reuse the original OA-1 compute core and the reviewed artifact/season adapter.

Preserve unavailable source sides for game IDs 401641034, 401644689,
401644780 and 401645328. Do not retry the same source endpoint, fill gaps or
substitute legacy team_game_stats. They contribute no available efficiency to
later histories. Eligibility is determined by the unchanged full-coverage rule;
do not assume only these four targets are affected.

Produce all 752 target frames with explicit availability/status/counts and a
complete inclusion/exclusion ledger. Both teams must have all four adjusted
components AVAILABLE with positive counts equal to raw counts, finite raw and
adjusted nets, and a known boolean neutral-site flag. RAW, OA and STRUCTURAL
must use identical eligible targets. The eligible count is not known in advance.
Verify frames, natural-key uniqueness, source identity, prior-week ordering,
source-game exclusion, arithmetic, manifests and all hashes independently.

Preview must decode no numeric 2024 outcomes and fit no models. Freeze the
feature artifact, matched cohort, candidate coefficients and prediction file
before a separate scoring process decodes outcomes. Missing joins or duplicate
keys block execution; outcome availability must not define eligibility.

## Scoring and decision

Join final home-minus-away points using exact season/game/home/away identities.
Report n, MAE, RMSE, mean signed error, median absolute error and fixed absolute
error quantiles. Primary paired comparison is OA minus RAW on the same cohort.
Frozen advancement rule, unchanged from OA-2: deltaMAE < 0 AND deltaRMSE <= 0.
Equality of MAE does not pass. This rule is accepted and frozen before outcomes open.

Descriptive diagnostics only: provider weeks 1–4, 5–8, 9+; neutral/non-neutral;
minimum prior available metric games 1–2, 3–5, 6+; season/week. No alternate
cohort selection, significance-based retuning or favorable-subgroup promotion.
Reproduce every prediction and primary metric independently; verify the
coefficient freeze remains byte-identical before and after scoring.

2024 is source-informed validation, not a pristine holdout, given earlier
historical research. Passing permits consideration of a final candidate freeze
and separately contracted 2025 one-shot holdout, not production promotion.
Failure is reported as failure without silently changing this experiment.
Any later development must be disclosed and separately contracted.

## Boundaries

No 2025 or 2026 inputs, labels or outcomes. No market/bet/Core comparison,
ATS/ROI/CLV analysis, provider calls, DB writes or production change.
Prefer artifact-only execution; any necessary narrowly scoped 2024 DB read
requires an explicit source-access contract before execution.
Core V1, lifecycle, moneyline conversion, grades and CORE_EVAL_V1 remain unchanged.
2025 stays sealed until final candidate freeze and separate one-shot authorization.
2026 OA work remains prospective/shadow only.
