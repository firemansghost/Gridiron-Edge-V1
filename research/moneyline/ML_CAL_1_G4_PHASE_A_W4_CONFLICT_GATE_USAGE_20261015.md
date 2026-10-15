# ML-CAL-1 G4 Phase A — W4 pre-mutation conflict gate (usage)

Date: 2026-10-15 (America/Chicago)  
Status: **local implementation only** — not packaged; no draft PR until separately authorized.

## What W4 adds

At `runG4PhaseARetentionSetup`, after exact opt-in / path / ID / ancestor validation and **before** the start clock and **before** any mutation under the operator user root, the library scans five deterministic claimed destinations.

Parent components are inspected with **lstat only** (never `existsSync`): confirmed absence stops the walk; symlink/junction parents — including **dangling** links — are unresolved ancestors and refuse before clock/mutation. The leaf is then lstat'd without following targets; terminal symlinks are category conflicts with `w4_conflict_kind:symlink`.

| Destination | Public reason id (preserved) |
|-------------|------------------------------|
| `<g4>/preflight/<probeId>` | `preflight_package_exists` |
| `<g4>/staging/.claim-<probeId>` | `publish_claim_exists` |
| `<g4>/review-handoff/<handoffId>` | `handoff_exists` |
| `<g4>/review-handoff/PHASE_A_SETUP_RECEIPT-<probeId>.json` | `setup_receipt_exists` |
| `<g4>/review-handoff/PHASE_A_SETUP_RECEIPT-<probeId>.final-evidence.json` | `setup_final_evidence_exists` |

Any present leaf object (file, directory, symlink/junction, dangling symlink) → structured refusal with leading reason `w4_pre_mutation_conflict` plus the category id. Unresolved ancestors add `w4_unresolved_ancestor_symlink:<part>`. Notes include `w4_conflict_before_user_root_mutation` / `w4_ancestor_symlink_or_dangling` and `layout_probe_usability_not_run`. Pre-existing objects are **not** owned leftovers.

Missing user root / missing layout is allowed (confirmed absence). The scan creates nothing.

## Callers covered

W4 lives in the library seam. Legacy CLI and #257 JSON setup command both call `runG4PhaseARetentionSetup` and therefore inherit the gate. Direct library callers cannot bypass it.

## Boundary vs JSON capture

W4 means **zero mutation under the operator user root** before conflict refusal. The JSON command may already have reserved an **external** capture file (capture-before-setup). That capture may contain the W4 refusal JSON. That is intentional and is **not** a user-root mutation.

## Compatibility note

Mid/post exclusive protections (`publish_claim_exists`, receipt `wx`, etc.) remain. W4 is **not** a lock: an object appearing after the scan must still be refused by those protections without overwrite/deletion as owned residue.

Reason ids for conflicts reuse the historical category strings; the new leading `w4_pre_mutation_conflict` marks early refusal.

JSON command durable notes may still say `w4_w9_not_implemented_by_this_command` (command wrapper does not implement gates); **library W4 is implemented** here. W5–W9 remain unimplemented.

## Verification notes

- Mutation-call recording (`testOnlyRecordUserRootMutation`) is active for the whole post-W4 setup body and is consulted inside helpers (`safeRemoveContained` removals, `invalidateRetainedProbe` marker writes), so cleanup/invalidation across call boundaries is visible — not only direct `fs.*` wrappers in the setup function.
- Positive controls: successful setup records ≥4 cleanup removals; `after_publish` records `PACKAGE_INVALIDATED.json` writes (and removals).
- W4 refusals still assert zero recorded mutations plus unchanged byte/digest snapshots.
- Permission/I/O fail-closed paths are covered via injected `lstatSync` (plus ENOTDIR physical case).
- Real file-symlink create may be SKIPPED/UNVERIFIED on Windows without symlink privilege; leaf-symlink classification is still asserted (injected lstat and/or dir/junction coverage).

## Holds

- Proposed USER root `C:\Users\Bobby\GridironResearchEvidence` — PROPOSED/UNVERIFIED  
- W5–W9 not implemented or waived  
- No operator setup; #255 mock-only; live research BLOCKED; 2025 sealed  
- Historical #256/#257 commits unchanged; this worktree deliberately changes the Phase A library blob for future review
