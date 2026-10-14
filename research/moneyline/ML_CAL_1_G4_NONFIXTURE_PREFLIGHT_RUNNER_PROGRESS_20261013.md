# ML-CAL-1 G4 Nonfixture P-PREFLIGHT Runner — Progress Note

Date: 2026-10-13 (America/Chicago)

## Scope

Offline implementation of nonfixture metadata-only P-PREFLIGHT runner, sealer, reader, and gated CLI from accepted #254 tip. No live DB/pooler, no operator-root setup, no merge.

## Pins

| Item | Value |
| --- | --- |
| Worktree | `C:\Users\Bobby\gridiron-edge-v1\Gridiron-Edge-V1-ml-cal-1-g4-preflight-runner` |
| Branch | `feat/ml-cal-1-g4-preflight-nonfixture-runner-v1` |
| Base / HEAD start | `cbb0d25d03294439baccf4da5e4e6e50e36fe035` (#254) |
| Design pin (git/LF) | `55d4a3d72877abcf154461a6504bb702791339b41721729116472187fab7c95f` |
| Execution plan local Windows | 37202 bytes / SHA-256 `1db298dba6188cb4b4d3d6bd45af4239211418c5c47a93f02d501bf43f691ffd` |
| Escaped-upload plan digest (distinct) | `b08a26bf6938e0b23939267409492e6684ab32ec8e16e8573d89728f6503f299` |

## Files (new)

- `apps/jobs/lib/ml-cal-1-g4-pooler-preflight-live-runner.ts`
- `apps/jobs/lib/ml-cal-1-g4-pooler-preflight-live-reader.ts`
- `apps/jobs/run-ml-cal-1-g4-pooler-preflight-live.ts`
- `apps/jobs/__tests__/ml-cal-1-g4-pooler-preflight-live-runner.test.ts`
- `.github/workflows/test-ml-cal-1-g4-pooler-preflight-nonfixture-runner-v1.yml`

## Status checkpoints

1. Implementation written (runner/sealer/reader/CLI).
2. Local suites — **pass**: new 23; adapter+fixture+binding/G2/G3/G4 = 191 (total 214).
3. Commit/push/draft PR to #254 base — in progress.
4. CI observe exact head — pending.

## Limitations (held)

- Live client construction refused in CLI for this build.
- Proposed operator root `C:\Users\Bobby\GridironResearchEvidence` UNVERIFIED; not inspected.
- W6 archive chronology UNRESOLVED; no P-OBSERVE.
- Green mock/CI ≠ live acceptance or deployed pooler proof.
