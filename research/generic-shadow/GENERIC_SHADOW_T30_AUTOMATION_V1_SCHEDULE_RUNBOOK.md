# Generic Shadow T-30 Automation V1 — Schedule Enablement Runbook

**Status:** production clock proven 2026-09-24; Supabase external clock is the sole recurring scheduler. Native GitHub `schedule` is intentionally disabled.

The coordinator remains activation-gated in GitHub and is invoked by the proven Supabase external clock through `workflow_dispatch`; see `GENERIC_SHADOW_T30_EXTERNAL_CLOCK_RUNBOOK.md`.

Historical context: native GitHub scheduling emitted no runs during the 2026-09-22 activation work, then unexpectedly recovered during the first Week 4 live proof on 2026-09-24 and fired at `2026-09-24T22:44:29Z`. The same live window also had the Supabase clock active. Existing concurrency, freshness, and idempotency controls prevented duplicate provider calls and duplicate closing writes, but dual scheduler authority was unnecessary. Issue #161 therefore makes the already-proven Supabase clock authoritative and removes native GitHub `schedule` from the coordinator workflow. This changes only the clock source; Stage C and Stage D timing and mutation semantics remain frozen.

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

## Activation gates

The externally clocked Generic coordinator is inert unless this repository variable is explicitly set:

`GENERIC_SHADOW_T30_AUTOMATION_V1_ENABLED=true`

The active week must also be supplied explicitly:

`GENERIC_SHADOW_T30_AUTOMATION_V1_WEEK=<positive integer>`

An optional Hybrid Snapshot V1 closing stage is separately inert unless:

`HYBRID_SHADOW_T30_AUTOMATION_V1_ENABLED=true`

The Hybrid gate does not create Hybrid predictions or alter Hybrid qualification. It only invokes the already-proven `capture-shadow-t30-closing-v1-2026.ts` append-only closing writer after Generic Stage C/D succeed. It therefore reuses the same persisted board refreshed by Stage C and the same Supabase external clock.

Absence of either enable variable, any value other than the exact string `true`, or an invalid/missing week prevents the corresponding production action.

Changing these variables is an operational activation/change and requires separate Bobby authorization after the schedule-enablement PR is reviewed and merged.

## Source safety

Recurring externally clocked operation:

- runs from `refs/heads/main` only;
- records exact checked-out HEAD SHA;
- fails closed on any other ref;
- uses the existing production concurrency group:
  `generic-shadow-t30-automation-v1-production`;
- keeps `cancel-in-progress: false`.

The recurring workflow intentionally does not use a human-entered `expected_main_sha`; this follows the frozen scheduled-runtime alternative in the Automation V1 contract.

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

## Optional Stage E — Hybrid T−30 closing

When `HYBRID_SHADOW_T30_AUTOMATION_V1_ENABLED=true`, the same externally dispatched cycle runs the existing Hybrid Snapshot V1 closing writer after Generic Stage D.

Stage E:

- receives no `ODDS_API_KEY`;
- uses persisted spread MarketLine rows only;
- may write only `ShadowClosingMarketSnapshot`;
- preserves the frozen kickoff-minus-30-minute selector;
- never falls forward to a post-target market observation;
- never creates a missing row at/after kickoff;
- is append-only and transactionally idempotent on repeated five-minute cycles;
- does not write predictions, capture runs, evaluation rows, Bets, MatchupOutputs, Game rows, or lifecycle state.

Generic Stage C remains the only provider-backed portion of the cycle.

## Reporting

Every active externally dispatched cycle uploads:

- Stage C PLAN/terminal reports;
- raw Live Odds child report when a refresh occurs;
- Stage D PLAN/terminal reports;
- per-capture-run Generic closing child reports when invoked;
- the Hybrid closing COMMIT report when Stage E is enabled;
- one top-level `SCHEDULED-CYCLE.json` report combining provider, Generic closing, Hybrid closing, blocker, mutation-target, and verification state.

A green workflow without the machine-readable reports is not sufficient evidence.

## Manual fallback

The existing manual guarded Stage C and Stage D workflows remain canonical fallback paths.

If recurring automation is blocked or fails before a legitimate target window closes, Bobby may use the existing manual workflows while the frozen timing rules still permit it.

No manual or automated path may reconstruct a missed T-30 close after kickoff.

## Weekly operation

Prediction cohorts are intentionally outside Automation V1.

Before the external clock can protect a new week, eligible Generic Shadow capture runs must already exist for that week.

For Week 4, eligible COMPLETE cohorts currently include the original Core observation plus the later same-board paired research cohort. The coordinator discovers eligible capture runs from persisted state; it is not limited to one capture context. Current legitimate contexts include `week4_post_official_card` and `week4_tuesday_paired_research`.

Those captures remain separately guarded research writes.
