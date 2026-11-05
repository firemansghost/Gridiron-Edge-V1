# RMM1 — design adoption and freeze record

**Experiment ID:** `retrospective_margin_missingness_v1` (RMM1)  
**Date:** November 5, 2026, America/Chicago  
**Status:** USER-ACCEPTED DESIGN; FREEZE VERIFICATION PENDING  
**Current bounded stage:** Step 1, adoption and immutable design freeze only.

## Authorization and exact adopted specification

The user accepted the recommended staged sequence in this chat:

> I like and agree with your recommended steps, let's proceed with them one step at a time and be aware we may run into usage limitations.

That acceptance follows presentation of the independently reviewed RMM1 draft and a sequence whose Step 1 is accepting/freezing its missing-data rules, fallback behavior, comparisons and test budget, preserving V3. It is sufficient authorization for this adoption; no routine repeat confirmation is needed. The user's authorization for the staged plan persists. This record does not execute later stages or bypass their independent implementation, source, input and outcome gates. The current task stops after Step 1.

`SOURCE_SPECIFICATION.md` is a byte-for-byte copy of the accepted discussion draft:

- Original: `../research-experiment-draft-20261105/RETROSPECTIVE_MARGIN_MISSINGNESS_V1_DRAFT.md`
- Exact SHA256: `850a7371f1bb202d08fedaaa66569fd436c7dcee54b5726af600f6a0f559d7a0`
- Independent prior design acceptance: `../research-experiment-draft-20261105/INDEPENDENT_DRAFT_DESIGN_REVIEW.md`
- All three original review findings were resolved before this user decision. No scientific rule or parameter is changed here.

## Administrative status precedence

The copied source intentionally retains its historical DRAFT heading and drafting-stage authorization statements so that its accepted bytes and original review identity remain intact. **This adoption record overrides only that historical administrative draft/adoption status:** the exact substantive RMM1 design is now accepted for freeze, subject to separate freeze verification. References to a future user adoption/design decision in that copied draft are satisfied by the acceptance recorded above.

Every substantive condition, missing-data rule, candidate definition, population rule, fit budget, limitation, execution gate and prohibition in the source specification remains operative. Design acceptance does not mean data readiness, estimator compatibility, scientific performance, source publication or permission to read sealed 2025 outcomes. Existing staged user authorization is not replaced by new routine permission requests. New contract changes or destructive remedies still require a concrete proposal and the user's decision before execution.

This pair of files is the operative frozen design: this adoption record plus the exact source specification, pinned together in `FREEZE_MANIFEST.json`. A future implementation must verify both hashes and the accepted manifest/review identity. It must not use the source's historical DRAFT heading to infer that the adopted scientific rules can drift, or use this record to bypass a substantive gate.

## Rules adopted without alteration

- F14 is the primary family; F10 is the matched, untuned component-removal ablation with the same chosen learner/settings and common F14 fallback mask.
- Strict complete prior-provider-week canonical history; natural no-prior history and incomplete expected history remain separate. Raw missing features stay null with explicit reasons; genuine observed zero is valid. Unknown schema, contradictory or duplicate identities stop integrity qualification.
- Medians, ridge scaling and observed individual feature-state catalogs are fitted only on the applicable training fold. Unseen missing feature/state pairs route the whole game to the declared training-only venue baseline; every evaluation game remains in the denominator, with fallback labeled separately.
- Seven chronological 2022–2023 development folds, the exact seven-configuration list, minimum-anchored MAE tie rule and fixed controls apply. The budget is 66 research-data estimator fits plus a separate GLOBAL cap of four synthetic verification fits across preparer, reviewer and CI, with no four-fit allowance per actor/run. No fit has occurred in this freeze task.
- Full-row MAE is primary, with the stated secondary metrics and 100% finite prediction/90% native-model coverage requirements. Neither coverage nor baseline improvement constitutes production promotion evidence.
- 2024 remains already-observed exploratory evaluation. Full 2025 input qualification remains NOT_QUALIFIED, its mixed snapshot/outcomes remain unopened, and any future evaluation requires its own qualified boundary/addendum and explicit outcome-stage authorization.
- The original V3/Final Holdout V1, captures, model/scaler/baseline states, failed audits, predictions, cohorts, cards, prices and immutable evidence remain unchanged. Original Final Holdout V1 stays HISTORICAL_FINAL_HOLDOUT_INPUT_BLOCKED.

These bullets are a reading aid; they do not replace or broaden the exact source specification. If any apparent discrepancy is found, stop and reconcile it against the source and separate review before execution.

## Freeze gate and next bounded task

The separate reviewer must verify the exact accepted source copy, this status-only adoption, the composite manifest and preservation evidence before Step 1 is reported complete. No repository commit/merge, provider query, dependency installation, model instantiation, synthetic fit, real feature build, target read or database/production operation belongs to this task.

After freeze acceptance, the next authorized bounded stage is artificial-data builder specification/implementation: declare the allowed source fields and provenance, implement missingness/transform/support/fallback/fold boundaries against deterministic artificial fixtures, and plan the shared four-fit synthetic verification budget. It must follow the frozen specification and its review-before-commit/real-data ordering. No real predictor processing or historical target access occurs in that next stage. Any required change to frozen scientific rules must be versioned and presented before implementation rather than patched silently.
