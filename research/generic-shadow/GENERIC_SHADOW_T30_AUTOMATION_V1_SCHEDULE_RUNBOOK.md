# Generic Shadow T-30 Automation V1 — Schedule Enablement Runbook

**Status:** implementation review only; production activation remains a separate operator decision.

Merging the PR does **not** activate production automation.

## Purpose

This runbook covers only the recurring orchestration layer for the already-proven Generic Shadow T-30 Automation V1 Stage C and Stage D capabilities.

It does not authorize or automate:

- Generic prediction capture;
- Candidate B prediction capture;
- Official Card writes;
- Hybrid writes;
- evaluation writes;
- lifecycle/rating writes;
- Game writes;
- migrations;
- retrospective closing reconstruction.

## Frozen timing

- cadence target: every 5 minutes;
- Stage C market look-ahead: kickoff-45m through kickoff-35m;
- at most one successful Live Odds board refresh per cycle;
- Stage D target: kickoff-30m;
- Stage D runs only at/after T-30 and before kickoff;
- Stage D providerCalls=0;
- no after-target fall-forward;
- no postkick backfill.

## Activation gate

The scheduled workflow is inert unless this repository variable is explicitly set:

`GENERIC_SHADOW_T30_AUTOMATION_V1_ENABLED=true`

The active week must also be supplied explicitly:

`GENERIC_SHADOW_T30_AUTOMATION_V1_WEEK=<positive integer>`

Absence of the enable variable, any value other than the exact string `true`, or an invalid/missing week prevents production execution.

Changing these variables is an operational activation/change and requires separate Bobby authorization after the schedule-enablement PR is reviewed and merged.

## Source safety

Scheduled operation:

- runs from `refs/heads/main` only;
- records exact checked-out HEAD SHA;
- fails closed on any other ref;
- uses the existing production concurrency group:
  `generic-shadow-t30-automation-v1-production`;
- keeps `cancel-in-progress: false`.

The scheduled path intentionally does not use a human-entered `expected_main_sha`; this follows the frozen scheduled-runtime alternative in the Automation V1 contract.

## Stage C

Every active cycle begins with the existing Stage C read-only planner.

If no approaching target requires a board refresh:

- no provider secret is exposed;
- providerCalls=0;
- no MarketLine write occurs;
- a terminal coordinator report is still produced.

If a refresh is required inside the frozen T-45..T-35 window:

- `ODDS_API_KEY` is exposed only to that conditional step;
- the existing guarded Live Odds COMMIT boundary is invoked at most once;
- all existing team-identity, week-frame, persistence, and post-write verification behavior remains authoritative.

## Stage D

After Stage C finishes successfully, the workflow runs the existing Stage D planner and terminal COMMIT/no-op path.

Stage D:

- receives no `ODDS_API_KEY`;
- may invoke the existing Generic closing COMMIT once per eligible DUE capture run;
- may write only `ShadowModelClosingMarketSnapshot`;
- preserves append-only/idempotent behavior and the frozen T-30 selector.

## Reporting

Every active scheduled cycle uploads:

- Stage C PLAN/terminal reports;
- raw Live Odds child report when a refresh occurs;
- Stage D PLAN/terminal reports;
- per-capture-run closing child reports when invoked;
- one top-level `SCHEDULED-CYCLE.json` report combining provider, closing, blocker, mutation-target, and verification state.

A green workflow without the machine-readable reports is not sufficient evidence.

## Manual fallback

The existing manual guarded Stage C and Stage D workflows remain canonical fallback paths.

If scheduled automation is blocked or fails before a legitimate target window closes, Bobby may use the existing manual workflows while the frozen timing rules still permit it.

No manual or scheduled path may reconstruct a missed T-30 close after kickoff.

## Weekly operation

Prediction cohorts are intentionally outside Automation V1.

Before the scheduler can protect a new week, eligible Generic Shadow capture runs must already exist for that week.

For Week 4, the intended paired research cohorts are:

- `core_v1_shadow_baseline_v1`
- `candidate_b_roster_prior_v1`

with capture context:

`week4_post_official_card`

Those captures remain separately guarded research writes.
