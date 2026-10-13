# ML-CAL-1 G5-PRE Offline Implementation — Progress / Recovery

**Date:** October 13, 2026 (America/Chicago)  
**Status:** Offline R1–R5 review repair on draft PR #252 — stop for independent re-review  
**Commit/push:** Draft PR only; no merge authorized

## Worktree

| Item | Value |
|------|--------|
| Path | `C:\Users\Bobby\gridiron-edge-v1\Gridiron-Edge-V1-ml-cal-1-g5-pre` |
| Branch | `feat/ml-cal-1-trusted-retrieval-lineage-g5-pre-fixture-v1` |
| Prior reviewed head (F1–F6) | `57265be89c4653c7e5dc36f94c3a9ba9b79547a6` |
| Base / ancestry | Exact accepted G4 `6c2b31069b8805c7f2d171da1e04bf47885f237d` |
| Draft PR | #252 (base G4 branch) |
| Ops main (record only) | `1f5b6324767f8a5832726d5828247ad022961b2b` — not rebased onto |

## F1–F6 repairs (preserved)

| Finding | Repair |
|---------|--------|
| **F1** | Require valid coverage times; cross-bind caller/inventory/attestation times and producer/observer/season/model/sidecar digest to retained package sidecar; reject disagreements |
| **F2** | Recompute pagination from retained pages: pageToken chain, contiguous pageIndex, declared counts, emptyResult consistency |
| **F3** | Disposition enum validation; typed effect-evidence + candidate-contents schemas bound to candidateKey and 2026/v1; arbitrary bytes / unproved non-effect → unresolved |
| **F4** | Uncertain relevant candidates retained (not silently dropped); contradictory duplicate listings fail closed |
| **F5** | Whole-package approval hard-disabled; P9 is rejection regression even when self-hash/pin match |
| **F6** | G5-VERIFY binds zip/sidecar/report digests and prospectiveTargetWeek to PRE `boundEvidence`; mismatch → ok=false, verifier not invoked |

## R1–R5 repair (this tip)

| Finding | Repair |
|---------|--------|
| **R1** | Validate chronology through coverage end and `nowCeiling`; reject future coverage (`lineage_coverage_after_ceiling`), coverage beyond inventory assembly evidence, and reversed windows |
| **R2** | Effect evidence requires retained `anchoredObservationDigest` bytes; contradictory contents vs effect → `lineage_disposition_evidence_contradiction` / unresolved (booleans alone are not proof) |
| **R3** | Reconcile inventory candidate facts to authoritative retained listing (source/page provenance, run ID, ZIP, timing); `candidateKey` alone insufficient |
| **R4** | Before accepted verifier: bind verify inventory/attestation/registry anchors (and bytes when present) to PRE `validatedAnchors`; substituted evidence → verifier not invoked |
| **R5** | Require lifecycle report member; validate package schema + design/acceptance/base identity; observer/design/archive/sidecar correspondence; missing required fields reject (no skip) |

## Local results (pre-push)

- G5-PRE suite: 61/61 pass (includes R1–R5 regressions)
- Inherited binding/G2/G3/G4: 136/136 pass

## Inherited (unchanged)

Accepted binding/capture/G2/G3/G4 helpers and G4 observer fixture bytes (week5 + synthetic-w6). PRs #243–#249 not amended.

## Holds

No merge, live retrieval, DB, credentials, providers, pooler, observation/capture dispatch, registry mutation, prospective registration, calibration, 2025 access, production pointer/card/cohort changes.
