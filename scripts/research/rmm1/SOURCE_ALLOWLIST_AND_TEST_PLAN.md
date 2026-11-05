# RMM1 Step 2: artificial-only builder specification and test plan

## Scope and contract identity

This local reference implementation binds RMM1 frozen registry SHA25609159fd46bb49fb6f063cf0ecaa123cac893d730da00ac0e93ed3aeae4a6ba60 and every operative member hash. It implements model-free construction/transforms/guards against artificial in-memory records. It is not a qualified real-source adapter, a trained estimator, a published workflow or a historical performance result. No third-party runtime is installed or imported. Python standard-library double-precision numeric arithmetic is used; future learner integration must explicitly marshal dense float64 arrays under the separately reviewed locked environment.

The real historical member/file read allowlist in this step is EMPTY. The only filesystem-input API in the builder is bind_frozen_contract(folder), which accepts only the exact pinned registry and flat member names, then verifies their hashes. Tests additionally read their own source and a temporary fake-registry fixture. The test runner records reads, rejects undeclared input paths and blocks network/subprocess/third-party estimator imports. No API keys, provider adapters or database clients are used.

Source adapters for original V1/V3/raw archives are deferred. Before any real predictor processing, a later reviewed plan must identify each exact archive/member/hash and allowed fields, independently validate response/query identity, qualify the exact canonical IDs and construct a new append-only source ledger. This prototype is not authority to open those files, transpose frozen V3 standardized positions, alter original n, or claim raw-value reproduction.

## Artificial input schemas

Every bundle has exactly: synthetic=True; fixtureId prefixed SYNFIX-; canonicalIds (explicit unique expected canonical IDs); games; staticRows; advancedRows. IDs start SYN-, teams SYNTEAM-, source references synthetic://. These are accidental-input guards plus a closed test interface, not a cryptographic proof that arbitrary caller-supplied numbers are artificial. The reviewed deterministic generators and actual test input/read ledger establish this run's scope. No arbitrary source-file loading API exists.

Each game has exactly gameId, season, week, kickoffUtc, home, away, neutral, canonicalFbs. Step2artificial seasons are2022–2024, week is integer>=1, context flags are bool and kickoff uses normalized YYYY-MM-DDTHH:MM:SS[.1-to-6-fractional-digits]Z with an aware zero-offset datetime. A date-only string endingZ is not a valid kickoff. Explicitly noncanonical game frames may supply excluded-source context, but are excluded from history/output by definition; their classification cannot change canonicalIds unnoticed. Empty, duplicate, omitted or reclassified canonical populations fail globally. Future real universe identity must be independently frozen, not inferred from these markers.

Normalized static source rows have exactly:

| Family | Fields |
| --- | --- |
|talent|family, year, team, talent, sourceRef|
|returning|family, season, team, percentPPA, sourceRef|
|recruiting|family, year, team, points, sourceRef|
|elo|family, year, team, elo, sourceWeek, preseason, seasonType, sourceRef|

The normalized Elo request context is mandatory: preseason=True requires sourceWeek=None; otherwise sourceWeek is integer>=1; seasonType=regular. Target week1selects preseason; later weeks select exactly targetWeek−1. These normalized context fields describe the artificial requested source, not invented timing fields in a real Elo response. A future raw adapter must validate actual request context and response year separately. Recruiting uses season-relativeY0–Y3. Every source team/year must belong to the declared artificial games/years (or recruiting year offsets); duplicates/conflicts and unknown schema fields fail. Missing rows/null values remain ROW_UNAVAILABLE; present invalid numeric values become VALUE_INVALID.

Advanced rows have exactly gameId, season, week, team, opponent, offense, defense, sourceRef. offense/defense each have exactly ppa and successRate. Identity must match a declared canonical or explicitly excluded game. All raw fields must be structurally present; null/bool/string/nonfinite advanced values leave the affected expected history incomplete. No later/same-week or excluded-source game enters canonical history. Every lower-week history kickoff must be earlier. All four fields across every expected game must be finite before any of the six form values is AVAILABLE. Emit expected/complete counts, missing IDs, per-component finite counts and synthetic source references. Audit counts never enter model columns.

## Model-free transforms and accounting

RawGame/Side/Feature/FormAudit are immutable record containers with state/value/net/count consistency guards. They do not import original V1feature records or accept original null n as a numeric count. Static features, prior counts and six form fields are generated under the frozen definitions. Complete-history means/nets are reproduced from artificial rows only.

fit_preprocessor computes training-only medians, imputed side-pool population mean/SD (ridge), unchanged tree-input medians and individual feature-state support catalogs. It is arithmetic preprocessing, not an estimator fit. No AVAILABLE training values blocks the feature/fold; zero SDuses1. Raw values/reasons remain untouched. Joint state-profile novelty is diagnostic only. Encoders emit 141F14,101F10or11B2columns with fixed names/order; indicators/venue are unscaled. F14/F10share the all-F14 fallback gate; B2uses only its own Elo-state support. B2estimator fitting is not implemented here.

fold_plan deterministically preserves all game roles in the seven frozen blocks; artificial examples have100warmup+70OOFgames. All blocks must exist, training has>=100unique games, and all training kickoffs precede every validation kickoff. fold_views rejects undeclared subsets, overlap and unknown IDs; prepare_fold obtains preprocessing only from that exact training partition. No assertion is made about newly constructed real1484-game rows or their actual fold IDs.

mean_baselines calculates only synthetic B0/B1arithmetic means from an exact synthetic training-label view; extra validation labels are rejected. route_predictions takes explicit artificial stand-in candidate outputs, recomputes the input/mask against the supplied preprocessor, binds baseline/training identities, routes unsupported games to B1and requires every native output. synthetic_metrics requires every declared game's finite output and exact artificial truth IDs; it computes full-row MAE/RMSE/bias and coverage. These are plumbing checks using invented numbers, not historical scoring or proof that a candidate achieves those metrics. Nonfinite/partial outputs stop globally. F14/F10fallback masks and values must match; no complete-case metric fallback is allowed.

Configuration selection is the fixed minimum-anchored1e-6MAEtie rule over all seven supplied finite scores; this tests arithmetic only. No configuration is actually fitted or selected on historical data.

## Fixed fixtures and estimator budget

synthetic_fixtures.repeatability_fixture produces exactly128invented games (16provider weeks×8games) with the first96training and final32validation. labels_for produces a fixed artificial arithmetic label from the artificial ID/venue, independent of any historical target. Source and canonical serialized fixture/label hashes are recorded before any future verification. No fixture/seed search occurs.

fold_fixture supplies170invented games with100warmup and10persevenvalidationblocks, for structural chronological tests. toy_fixture supplies three invented games with hand-checkable zero/mean/net arithmetic. No historical game ID, team, predictor or target enters either fixture.

Current estimator fit calls: ZERO. Research fit calls: ZERO. Mean/median/SD and artificial metric computations do not spend estimator calls. The frozen GLOBAL4synthetic estimator-fit allowance remains entirely unused across preparer/reviewer/CI. Future exact generator commit/review/environment/source gates must precede the only planned four verification calls (Ridge100twice, tree3leaf/l2=10twice on the one128fixture). The66research-fit plan remains unused and unauthorized in this step. No repeated CI/test run receives a fresh estimator budget.

## Verification and review

Run the standard-library boundary suite in isolated Python with site packages disabled. It checks literal hand-derived history/transform/metric values, missing versus observed zero, all-six source gaps, schema/identity failures, same/later/noncanonical history exclusion, fold roles, no-future transforms/support, novel-state fallback/common ablation, B2isolation, matched baseline population, tampered masks and denominator failures. Negative fixtures may contain intentionally invalid numeric values only in memory; the fixed valid fixture serializes with allow_nan=False.

The guarded runner compiles the exact builder, fixture and test source bytes directly into fresh in-memory modules, recording their hashes and checking that no source changed during the run. It does not execute cached local bytecode; -Bby itself prevents writes but would not prevent cache reads. Retain actual test counts/results and a source/fixture manifest. A separate reviewer must read exact source and run independent adversarial cases. Fix findings before final exact-source acceptance. Step2acceptance is limited to this artificial reference implementation. Step3still requires exact implementation/environment/precommit/publication and bounded real-source plan acceptance before real predictor execution. Original V3/holdout evidence and2025sealed/unqualified state remain unchanged.
