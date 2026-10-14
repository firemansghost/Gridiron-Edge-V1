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
| Execution plan Git/LF (committed) | 36740 bytes / SHA-256 `22230e3946bc0fdc7753842c6dea362619f96b9b552c5a622571479fdc6d0926` |
| Escaped-upload plan digest (distinct) | `b08a26bf6938e0b23939267409492e6684ab32ec8e16e8573d89728f6503f299` |
| Branch HEAD | `39465af22c79566a35cce29d16447c11ba3297cf` |
| Draft PR | https://github.com/firemansghost/Gridiron-Edge-V1/pull/255 (base = #254 branch) |

## Files (new)

- `apps/jobs/lib/ml-cal-1-g4-pooler-preflight-live-runner.ts`
- `apps/jobs/lib/ml-cal-1-g4-pooler-preflight-live-reader.ts`
- `apps/jobs/run-ml-cal-1-g4-pooler-preflight-live.ts`
- `apps/jobs/__tests__/ml-cal-1-g4-pooler-preflight-live-runner.test.ts`
- `.github/workflows/test-ml-cal-1-g4-pooler-preflight-nonfixture-runner-v1.yml`

## Status checkpoints

1. Implementation written (runner/sealer/reader/CLI).
2. Local suites — **pass**: new 23; adapter+fixture+binding/G2/G3/G4 = 191 (total 214).
3. Commit/push/draft PR #255 to #254 base — done (`39465af`).
4. CI exact head — **pass** run `38496614623` / job `115633715768`; checkout merge `0586443` (`39465af` into `cbb0d25`); CI counts 23+21+34+136.
5. F1–F5 integrity repairs — local new suite 27 + inherited 191 pending push/CI re-observe.

## Limitations (held)

- Live client construction refused in CLI for this build.
- Proposed operator root `C:\Users\Bobby\GridironResearchEvidence` UNVERIFIED; not inspected.
- W6 archive chronology UNRESOLVED; no P-OBSERVE.
- Green mock/CI ≠ live acceptance or deployed pooler proof.
