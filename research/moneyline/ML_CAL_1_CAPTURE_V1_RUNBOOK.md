# ML-CAL-1 Capture V1 — Runbook

**Status:** Implementation PR for artifact-only evidence capture.  
**Not:** an accepted evaluation contract, live capture authorization, workflow wiring, or calibration scoring.  
**Schema:** `ml-cal-1-capture-artifact-v1` (independent of the PR 243 draft protocol).

## Purpose

Produce immutable, all-game Core V1 forecast + as-of moneyline evidence artifacts for a future prospective calibration study. Official card archives are rejected as primary study sources (missing no-selection forecasts, no rating/HFA lineage or paired ML row IDs, market ages beyond 1,800s). Do not reconstruct Week 6.

## What this PR ships

| Path | Role |
|------|------|
| `apps/jobs/lib/ml-cal-1-capture.ts` | Pure evidence planner + artifact helpers |
| `apps/jobs/capture-ml-cal-1-2026.ts` | Read-only CLI (fixture route; gated live DB read) |
| `apps/jobs/__tests__/ml-cal-1-capture.test.ts` | Meaningful fixture tests |
| `research/moneyline/ML_CAL_1_CAPTURE_V1_RUNBOOK.md` | This runbook |

No schema migration, cron, active-week change, dependency upgrade, or study-contract freeze.

## Timing rule (frozen)

- `predictionReferenceTime === captureEndTime` (server clock after snapshot reads complete).
- Market observation timestamp, `createdAt` (known-at), and `updatedAt` must be ≤ `predictionReferenceTime`.
- Observation age = (`predictionReferenceTime` − observation timestamp) must be in **[0, 1800]** seconds inclusive.
- Available study forecasts require `captureEndTime` ≤ kickoff − **30 minutes**.
- Do **not** substitute `captureStartTime` for as-of or publication checks.
- Post-kickoff computation is never labeled a prospective forecast.

## Computation contract

- Direct V1 margin only: `homeRating − awayRating + effectiveHfa` from **exported** rating inputs.
- Does **not** call `getCoreV1SpreadFromTeams` (that helper re-reads Prisma and may fall back to V2/OLS).
- HFA from frozen `core_v1_hfa_config.json` via `computeEffectiveHfa` (not DB `hfaTeam`, not hard-coded 2.0). Neutral → effective HFA 0.
- Probabilities / selection: unchanged `modelWinProbsFromCoreSpreadHma` + `selectCoreV1MoneylinePick` (divisor 14.5, clip [0.01,0.99], abs(m)≤24, value > 0.01, home tie preference).
- Market pairs: strict as-of filter, then pinned `selectGameMarketSnapshots({ mode: 'current' })`. No closing-selector fallback.

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
- Fixture supplies games, FBS membership, V1 ratings, market candidates, optional lifecycle receipt, and frozen clocks.
- Writes a unique capture directory; never overwrites.

Exit codes:

| Code | Meaning |
|------|---------|
| 0 | Evidence captured; primary readiness not blocked |
| 1 | Evidence written; primary readiness blocked (receipt etc.) |
| 2 | CLI/infrastructure error (reason receipt best-effort) |
| 3 | Live DB read gated / not enabled |

## Live DB read (implemented, gated — do not dispatch from this PR)

```bash
npx tsx apps/jobs/capture-ml-cal-1-2026.ts \
  --season 2026 \
  --week <N> \
  --enable-live-db-read \
  --lifecycle-receipt path/to/accepted-receipt.json \
  --out reports/ml-cal-1-captures
```

Uses a Repeatable Read + `SET TRANSACTION READ ONLY` snapshot. Explicit selects only; no score fields, bets, TeamGameStats, or 2025 rating projections. Server clock only (no injectable production timestamps).

**This PR must not run a live capture.** Live use additionally requires:

1. Reviewed prospective study-window registration (Weeks 7–12 draft is not accepted).
2. Accepted immutable lifecycle receipt bound to exported rating fingerprint (`GLOBAL_BLEND_W3_W6`, weight 1.00).
3. Manual/workflow wiring PR and independent source/adapter audit.
4. If Week 7 readiness is missed: register an explicitly future window before any capture/outcomes — never silently roll forward or backfill Week 6.

## Artifact layout

```
reports/ml-cal-1-captures/<captureId>/
  envelope.json
  universe.json
  inputs.json
  forecasts.json
  markets.json
  manifest.json          # member byte counts + SHA-256; does not self-hash
  primary-readiness-blocked.json   # when blocked
```

Primary eligibility (full-lifecycle + in-gate + paired ML) is recorded per game but **not** declared accepted from capture success alone.

## Tests

```bash
npx jest apps/jobs/__tests__/ml-cal-1-capture.test.ts --runInBand
npx jest apps/web/__tests__/core-v1-weekly-card.test.ts apps/web/__tests__/game-detail-market.test.ts --runInBand
```

## Unresolved before any live capture

- Manual workflow / schedule wiring
- Lifecycle receipt retrieval + qualification against live readback
- Independent source/adapter audit
- Prospective protocol registration (PR 243 remains draft; do not freeze/merge as accepted contract from this work)
- Weeks 7–12 / minimum 200 / all-six-weeks remain draft design minimums

## Explicit non-goals

- No calibration evaluation, loss metrics, fitting, or threshold search
- No official bet / card writer / schema / cron changes
- No 2025 reopen; OA-3 failure supplies no ML evidence
- No Hybrid promotion; Core V1 remains official
