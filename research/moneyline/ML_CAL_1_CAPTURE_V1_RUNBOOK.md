# ML-CAL-1 Capture V1.1 — Runbook

**Status:** Implementation PR for artifact-only evidence capture.  
**Not:** an accepted evaluation contract, live capture authorization, workflow wiring, or calibration scoring.  
**Schema:** `ml-cal-1-capture-artifact-v1` (producer `ml-cal-1-capture-v1.1.0`; independent of the PR 243 draft protocol).

## Purpose

Produce immutable, all-game Core V1 forecast + as-of moneyline evidence artifacts for a future prospective calibration study. Official card archives are rejected as primary study sources (missing no-selection forecasts, no rating/HFA lineage or paired ML row IDs, market ages beyond 1,800s). Do not reconstruct Week 6.

## What this PR ships

| Path | Role |
|------|------|
| `apps/jobs/lib/ml-cal-1-capture.ts` | Pure evidence planner + artifact helpers |
| `apps/jobs/capture-ml-cal-1-2026.ts` | Read-only CLI (fixture route; gated live DB read) |
| `apps/jobs/__tests__/ml-cal-1-capture.test.ts` | Fixture tests covering review items R1–R6 |
| `apps/jobs/__tests__/fixtures/ml-cal-1-capture-demo.json` | Offline demo fixture with a verified lifecycle receipt |
| `.github/workflows/test-ml-cal-1-capture-v1.yml` | Secret-free CI that runs only the capture test file |
| `research/moneyline/ML_CAL_1_CAPTURE_V1_RUNBOOK.md` | This runbook |

No schema migration, cron, active-week change, dependency upgrade, or study-contract freeze.

## Timing rule (frozen) — R1–R2

| Timestamp | Meaning | Used for |
|-----------|---------|----------|
| `captureStartTime` | Start of the capture run | Diagnostic only. Never used for as-of, age, or known-at. |
| `snapshotReferenceTime` | End of the DB/fixture snapshot reads | **Market as-of, observation age, known-at.** Equals `predictionReferenceTime`. |
| `captureEndTime` | Deprecated alias of `snapshotReferenceTime` | Accepted as input; if both are supplied they must match. |
| `computationTime` | When forecast planning ran | Diagnostic only. |
| `publicationTime` | Seal/publish boundary | Publication eligibility only. Retaken by the artifact writer at seal time. |

Rules:

- Input accepts `snapshotReferenceTime` **or** the alias `captureEndTime`. Both present and unequal → `snapshot_reference_time_capture_end_time_mismatch`; neither → `snapshot_reference_time_required`. `snapshotReferenceTime` before `captureStartTime` is rejected.
- Market observation timestamp, `createdAt` (known-at) and `updatedAt` must be ≤ `snapshotReferenceTime`. Observation age = (`snapshotReferenceTime` − observation timestamp) must be in **[0, 1800]** seconds inclusive.
- **Later timestamps never salvage a stale market.** A row that is stale or post-dated relative to `snapshotReferenceTime` stays rejected no matter how late `computationTime` or `publicationTime` is, and a fresh row is never aged out by a late publication.
- An available forecast requires `publicationTime <= kickoff − 30 minutes` **and** `publicationTime < kickoff`. `publicationTime === kickoff − 30m` is allowed; one millisecond later is not.
- `publicationTime` before `snapshotReferenceTime` is a primary-readiness block (`publication_before_snapshot_reference`).
- Post-kickoff computation is never labeled a prospective forecast.

### Publication boundary — R2

1. `planMlCal1Capture(input, { now, publicationTime })` produces a **provisional** `publicationTime` (default `computationTime`) and marks each game accordingly. `publicationFinalized` stays `false`.
2. `writeCaptureArtifactsAtomic({ now, beforeRename })` takes `publicationTime` from `now()` at seal start, then calls the pure `finalizePublicationEligibility(bundle, publicationTime)`. This only ever **downgrades**: `forecastAvailable`, `primaryEligibleCandidate`, `modelOnlyEligible` and model outputs are cleared, `lateCapture` is set, and the game id is listed in `publicationDowngradedGameIds`. It never restores eligibility.
3. Sealed members are never extended. After the rename the writer re-reads `now()`; if any game published as available is now past `kickoff − 30m` (or at/after kickoff) it writes an **external** `<captureId>.publication-invalidation.json` (outside the sealed directory) naming the invalidated game ids, the manifest SHA-256, and `sealedMembersUnchanged: true`. Landing exactly on `kickoff − 30m` does not invalidate.
4. `beforeRename` is a test hook that simulates delay between sealing and renaming.

## Lifecycle verification (R3)

A boolean `acceptedImmutable` is never enough. Qualification verifies **bytes**:

1. `receiptBytes` is the exact UTF-8 text of the receipt (`stableStringify(core) + '\n'`, where `core` excludes `receiptDigest`).
2. `pinnedReceiptDigest` is independently supplied and must equal `sha256(receiptBytes)`.
3. `claims.receiptDigest` must also equal `sha256(receiptBytes)`; claims must match the parsed bytes (ignoring `receiptDigest`, since a receipt cannot contain the hash of its own bytes). Qualification evaluates the **bytes-derived** claims.
4. Receipt checks: `selectedPolicy === GLOBAL_BLEND_W3_W6`; `acceptedImmutable === true`; `sourceSha` is 40-hex; `season` (when present) is 2026; `ratingFingerprint` equals the fingerprint of the exported V1 ratings; `canonicalWeight === b1CanonicalWeight(completedThroughWeek)` **and** equals `1`; `completedThroughWeek >= 6` and `< prospective week` (week 6 is valid for prospective week 7; week 0 with weight 1 fails).

Modes:

| Mode | Source | Result |
|------|--------|--------|
| `fixture_hypothetical` | Fixtures (the CLI forces this for `--fixture`, even when the file says `live`) | May qualify with `fixtureHypothetical: true`, `liveAccepted: false`. Never described as live-accepted. |
| `live` | Live DB route | Requires receipt bytes **and** `--pinned-lifecycle-digest`. Missing either → `lifecycle_verification_unavailable`: evidence is still emitted but primary readiness is blocked. Only a fully verified live receipt yields `liveAccepted: true`. |

The lifecycle `sourceSha` is recorded separately (`lifecycleSourceSha`) from the capture producer SHA (`producerRepositorySha`); they are **not** required to be equal.

### Ratings (R1 recap)

- Direct V1 margin: `homeRating − awayRating + effectiveHfa` from **exported** rating inputs, with production precedence `Number(powerRating || rating || 0)` evaluated on the Decimal/object **before** `Number()`.
- A Decimal(0)-like object (`{ toString: () => '0', valueOf: () => 0 }`) is truthy and is a valid usable zero. A numeric `0` falls through to `rating`.
- `powerRating` and `rating` both null/falsy → `valueUsed: null`, `chosenField: 'default_zero'`, `inputUsable: false`. The capture never imputes a zero and must not produce an available forecast.
- Non-finite values, a wrong `modelVersion`, a missing row, or duplicate V1 rows for a team make the forecast unavailable and block primary eligibility.

## Git-byte dependency hashes (R4)

Dependency hashes are SHA-256 of **Git bytes** — `git show <ref>:<path>`, LF as committed — never of a raw working-tree checkout. Windows CRLF checkouts produce different digests for byte-identical committed content.

The PR 243 draft hash table was correct for Git bytes. The alternate digests below are what a CRLF Windows checkout (or any CRLF copy) of the very same files hashes to.

| Path | Git-byte SHA-256 (canonical; PR 243 draft) | Windows CRLF checkout SHA-256 |
|------|---------------------------------------------|-------------------------------|
| `apps/web/lib/core-v1-moneyline.ts` | `c47c8faad10a6cfec2cb38fa329216233f80c3a2cfb1efd8faf4a9aa1dfab853` | `79e2886a79971162349f8404a94406ab45fb14cdce4da795ae604ba202156c1b` |
| `apps/web/lib/core-v1-weekly-card.ts` | `68f29f7c7588aeb16afa0588d0ac9c5b1b87f55b6e2310a62145b5331528ee91` | `477fff60212a414c6e3db83d8c8dd588750e3e562fa3f11aa7a4f948a15cc9b8` |
| `apps/web/lib/market-line-snapshot.ts` | `d4b274154d588e5a262f0f2e63ebe58e9eab1c70f4fd8dbd322ee56e7d3dc7d2` | `03fd9b7a11916fbdd53e55bba0765aa61a575b86d8078d2f24609bd13387f8e2` |
| `apps/web/lib/market-line-helpers.ts` | `d0ebc1776a8342b8eaf5f444db90152f6f093cff04c23b25969930861ce975eb` | `76ff287c1f9a3b86cb2f998b31ef4e92da90f826c51d7ceb50cece5493141f3b` |
| `apps/web/lib/core-v1-spread.ts` | `54c07653cef67f93d69df9835a5aac8759feefd11e457107b249196f1614e98c` | `3e83e789be6b02ec34225f81a3f5d00056f7367d89f7401b06a82ca892202124` |
| `apps/web/lib/data/core_v1_hfa_config.json` | `c6f90be8d51127078e18213120529a6d04e5f20ef8a91e0f06d359285451f59d` | `690cfafe695c44fb78e0e4a49e31d77ee6ea8a09cb25b57d24c1c9e664a144eb` |

Canonical values are pinned in `ML_CAL_1_CANONICAL_GIT_BYTE_HASHES`.

- `resolveCanonicalDependencyHashes(repoRoot, ref)` hashes Git bytes and **throws** `dependency_git_byte_hash_mismatch` if any pinned file differs from the table (wrong content with LF line endings still fails). Working-tree files are compared after LF normalization (`normalizeNewlinesToLf`), so a CRLF checkout of identical content is not dirty; its raw hash is reported separately in `checkoutRawHashes`.
- The capture runner and planner (`apps/jobs/capture-ml-cal-1-2026.ts`, `apps/jobs/lib/ml-cal-1-capture.ts`) are hashed from Git bytes but are not pinned; they may be dirty while the PR is in development and are recorded as such.
- The CLI's `resolveDependencyHashes` additionally fails closed on a dirty pinned file. Tests inject `{ gitByteHashes: { ...ML_CAL_1_CANONICAL_GIT_BYTE_HASHES }, dirty: [] }` instead of calling it, because the self-paths are dirty during PR development.
- Live mode derives the producer SHA from `git rev-parse HEAD` only. `--repository-sha` without `--fixture` is rejected before any DB access (`repository_sha_not_allowed_in_live_mode`); with `--fixture` it must be a 40-hex SHA and overrides only the producer SHA.

## Read isolation (R5)

The live read path goes through `createInstrumentedReadClient`, which rejects before reaching the database:

- any `findMany` without an explicit `select` (nested relations require their own explicit `select`), any `include`, unknown select fields, and unknown `findMany` arguments;
- any key matching score/pnl/result/clv (select, where, orderBy, nested);
- any `where` without `season`, or with a season other than 2026 (including nested filters); `OR`/`NOT` broadening; game/market reads for another week; market reads without a week or non-empty `gameId: { in: [...] }`;
- every mutation method (`create`, `createMany`, `update`, `updateMany`, `delete`, `deleteMany`, `upsert`), recorded in `mutations`;
- all `bet` and `teamGameStat` access.

`runMlCal1LiveSnapshotReads(client, { season, week })` issues the production selects against any client with per-model `findMany` and is exercised in tests with fake delegates. The live loader wraps it in a Repeatable Read + `SET TRANSACTION READ ONLY` transaction and stamps `snapshotReferenceTime` **after** the reads finish.

## Computation contract

- Does **not** call `getCoreV1SpreadFromTeams` (that helper re-reads Prisma and may fall back to V2/OLS).
- HFA from frozen `core_v1_hfa_config.json` via `computeEffectiveHfa` (not DB `hfaTeam`, not hard-coded 2.0). Neutral → effective HFA 0.
- Probabilities / selection: unchanged `modelWinProbsFromCoreSpreadHma` + `selectCoreV1MoneylinePick` (divisor 14.5, clip [0.01,0.99], abs(m)≤24, value > 0.01, home tie preference).
- Market pairs: strict as-of filter at `snapshotReferenceTime`, then pinned `selectGameMarketSnapshots({ mode: 'current' })`. No closing-selector fallback.

## Fixture capture (authorized for CI / local tests)

```bash
npx tsx apps/jobs/capture-ml-cal-1-2026.ts \
  --season 2026 \
  --week 7 \
  --fixture path/to/fixture.json \
  --out reports/ml-cal-1-captures
```

Requirements:

- `--season` must be `2026`; `--week` must be an integer ≥ 1.
- No `--mode COMMIT`, `--confirm`, or confirmation token (rejected).
- Fixture supplies games, FBS membership, V1 ratings, market candidates, frozen clocks (`snapshotReferenceTime` or `captureEndTime`), and lifecycle fields: `lifecycleMode: "fixture_hypothetical"`, `receiptBytes`, `pinnedReceiptDigest`, `lifecycleReceipt` (claims including `receiptDigest`).
- Fixture lifecycle verification is always labeled `fixture_hypothetical`.
- Writes a unique capture directory; never overwrites; capture ids must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` and resolve inside the output root.

Exit codes:

| Code | Meaning |
|------|---------|
| 0 | Evidence captured; primary readiness not blocked |
| 1 | Evidence written; primary readiness blocked (receipt etc.) |
| 2 | CLI/infrastructure error (redacted reason receipt best-effort) |
| 3 | Live DB read gated / not enabled |

## Live DB read (implemented, gated — do not dispatch from this PR)

```bash
npx tsx apps/jobs/capture-ml-cal-1-2026.ts \
  --season 2026 \
  --week <N> \
  --enable-live-db-read \
  --lifecycle-receipt path/to/accepted-receipt.json \
  --pinned-lifecycle-digest <sha256 of the receipt file bytes> \
  --out reports/ml-cal-1-captures
```

Uses a Repeatable Read + `SET TRANSACTION READ ONLY` snapshot. Explicit selects only; no score fields, bets, TeamGameStats, or 2025 rating projections. Server clock only (no injectable production timestamps).

**This PR must not run a live capture.** Live use additionally requires:

1. Reviewed prospective study-window registration (Weeks 7–12 draft is not accepted).
2. Accepted immutable lifecycle receipt (bytes + independently pinned digest) bound to the exported rating fingerprint (`GLOBAL_BLEND_W3_W6`, weight 1.00).
3. Manual/workflow wiring PR and independent source/adapter audit.
4. If Week 7 readiness is missed: register an explicitly future window before any capture/outcomes — never silently roll forward or backfill Week 6.

## Artifact layout

```
reports/ml-cal-1-captures/<captureId>/
  envelope.json
  universe.json
  inputs.json
  forecasts.json
  markets.json           # moneyline + spread evidence + candidateRejectionLedger
  manifest.json          # member byte counts + SHA-256; does not self-hash
  primary-readiness-blocked.json   # manifested member when blocked
reports/ml-cal-1-captures/<captureId>.publication-invalidation.json   # external, only when a post-seal check fails
```

- `primary-readiness-blocked.json` is a **manifested** member (its SHA-256 and byte count appear in `manifest.json`) whenever primary readiness is blocked. Reasons are passed through `redactSensitive` (connection strings, bearer tokens, passwords, API keys).
- Moneyline/spread evidence records row ids, prices/lines, book, source, observation timestamp, and `createdAt`/`updatedAt` known-at for both rows so the pair, implied probabilities, de-vig and the selection can be replayed independently.
- `candidateRejectionLedger` entries carry `rowId`, `reasons`, `lineType`, `lineValue`, `bookName`, `source`, `teamId`, `timestamp`, `createdAt`, `updatedAt`.

Primary eligibility (full-lifecycle + in-gate + paired ML) is recorded per game but **not** declared accepted from capture success alone.

## Tests

```bash
npx jest --runInBand --runTestsByPath apps/jobs/__tests__/ml-cal-1-capture.test.ts
npx jest apps/web/__tests__/core-v1-weekly-card.test.ts apps/web/__tests__/game-detail-market.test.ts --runInBand
```

CI: `.github/workflows/test-ml-cal-1-capture-v1.yml` runs only the first command on PRs touching the capture files. No secrets, no live DB, no production triggers. Because the R4 tests call `git show HEAD:<path>`, the checkout must contain `HEAD` (the default PR checkout does).

## Unresolved before any live capture

- Manual workflow / schedule wiring
- Lifecycle receipt retrieval + qualification against live readback (the live CLI only reads a receipt file + pinned digest; nothing fetches or proves receipt immutability yet)
- Independent source/adapter audit
- Prospective protocol registration (PR 243 remains draft; do not freeze/merge as accepted contract from this work)
- Weeks 7–12 / minimum 200 / all-six-weeks remain draft design minimums
- Self-path (runner/planner) hashes are not pinned; they need pinning against merged Git bytes before live use
- Post-seal publication invalidation is an external receipt only; no automated consumer of it exists yet

## Explicit non-goals

- No calibration evaluation, loss metrics, fitting, or threshold search
- No official bet / card writer / schema / cron changes
- No 2025 reopen; OA-3 failure supplies no ML evidence
- No Hybrid promotion; Core V1 remains official
