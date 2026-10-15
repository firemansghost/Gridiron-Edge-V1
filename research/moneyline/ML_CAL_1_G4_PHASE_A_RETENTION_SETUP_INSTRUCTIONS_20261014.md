# ML-CAL-1 G4 Phase A Retention Setup — Execution Instructions (Reviewable)

Date: 2026-10-14 (America/Chicago); packaging checkpoint 2026-10-15  
Status: **Draft PR packaging — operator destination setup NOT EXECUTED**  
Integrity: F1–F5; provisional receipt; digest-bound final evidence; hardened terminal-success evaluator schemas

## Packaging checkpoint (2026-10-15)

| Item | Value |
| --- | --- |
| Draft PR branch | `feat/ml-cal-1-g4-phase-a-retention-setup-v1` |
| Exact base (#255 tip) | `af28c337adb18b38a5a77a71d4f452ca74a1c994` |
| PR target | `feat/ml-cal-1-g4-preflight-nonfixture-runner-v1` (not main) |
| Linux CI workflow | `.github/workflows/test-ml-cal-1-g4-phase-a-retention-setup-v1.yml` |
| Operator command | **NOT EXECUTED**; proposed root remains PROPOSED/UNVERIFIED |
| Live research | BLOCKED; W6 chronology UNRESOLVED |

Implementation/test bytes for lib/CLI/tests retain the independently matched Windows identities from local acceptance unless a disclosed CI portability repair is required. Documentation may add this packaging/recovery checkpoint only.

**Disclosed CI portability repair (2026-10-15):** Linux `path.isAbsolute` rejects the Windows proposed-root label before the temp-mode forbid check. Library now refuses that exact sentinel string in temp mode **before** absolute-path gating, so Linux and Windows report `proposed_operator_root_forbidden_in_temp_mode`. CLI bytes unchanged; lib hash changes; re-run Phase A suite locally and on Linux CI.

## Pins

| Item | Value |
| --- | --- |
| Worktree HEAD (#255) | `af28c337adb18b38a5a77a71d4f452ca74a1c994` |
| Design Git/LF | `55d4a3d72877abcf154461a6504bb702791339b41721729116472187fab7c95f` |
| Plan Git/LF | 36740 / `22230e3946bc0fdc7753842c6dea362619f96b9b552c5a622571479fdc6d0926` |

## Retain-root binding

| Name | Path |
| --- | --- |
| Proposed operator **user root** (UNVERIFIED) | `C:\Users\Bobby\GridironResearchEvidence` |
| Proposed **G4 evidence base** | `C:\Users\Bobby\GridironResearchEvidence\ml-cal-1\g4` |
| Runner `retainRoot` | **G4 evidence base** |

## Terminal-success evaluator

`evaluatePhaseASetupReceiptForTerminalSuccess` validates **both** JSON objects against explicit schemas:

- Reject null, arrays, missing fields, wrong types
- Require `provenanceClass: "probe"`, `probeProvenance: true`
- Require false `liveAccepted` / `approved` / `deployedPoolerProof` / `credentialsPresent`
- Receipt: provisional exact state (`provisional`/`awaitsFinalEvidence` true; `setupCompleted`/`terminalSuccess`/`publicationComplete` false)
- Final evidence: success exact state (`verificationPassed`/`setupCompleted`/`terminalSuccess`/`publicationComplete` true)
- Matching `probeId` / `handoffId`; ordered ISO timestamps; receipt↔final correspondence
- Required sealed usability outcomes all true; durability claims all false
- Pinned `designSha256` + `base255Head`
- Exact retained receipt digest/byte-count binding on final evidence

**Internal consistency** (receipt + final schemas + binding + correspondence) is distinct from **external anchoring**. Claiming externally anchored review requires separately retained expected digests for **both** artifacts (`expectedReceiptSha256` + `expectedFinalEvidenceSha256`).

## F1–F5 (preserved)

| ID | Requirement |
| --- | --- |
| F1 | Absolute destination + ancestor validation before mutation |
| F2 | Exclusive provisional receipt; post-write verify separate from sealed content |
| F3 | Original-manifest member digests at publish + handoff |
| F4 | Provisional receipt; digest-bound final evidence; post-completion invalidation; verify/remove-fail leftovers not terminal |
| F5 | Exclusive claims; inject/duplicate fail-closed |

## Temp validation

```text
npx jest --runInBand --runTestsByPath \
  apps/jobs/__tests__/ml-cal-1-g4-phase-a-retention-setup.test.ts
```

## Future operator command — NOT EXECUTED

```text
# NOT EXECUTED — review + separate authority required
npx ts-node --transpile-only apps/jobs/run-ml-cal-1-g4-phase-a-retention-setup.ts \
  --enabled=true \
  --confirm-setup=true \
  --mode=operator \
  --destination=C:\Users\Bobby\GridironResearchEvidence \
  --expected-destination=C:\Users\Bobby\GridironResearchEvidence \
  --probe-id=phasea-setupprobe-20261014a \
  --handoff-id=phasea-handoff-20261014a
```

## Non-goals

No commit/push/PR/merge; no operator-root probing; no live preflight/DB; accepted #255 files unchanged.
