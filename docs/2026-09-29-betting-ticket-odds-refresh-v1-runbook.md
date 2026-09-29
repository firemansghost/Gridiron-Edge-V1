# Betting Ticket Odds Refresh V1 — Operator Runbook

**Status:** IMPLEMENTED CAPABILITY / EXTERNAL CLOCK NOT YET ACTIVATED  
**Date:** 2026-09-29  
**Season:** 2026  
**Active-week authority:** `research/generic-shadow/GENERIC_SHADOW_T30_ACTIVE_WEEK_2026.json`

## Purpose

Keep the read-only Betting Ticket supplied with recent persisted MarketLine evidence without:

- weakening the 3-hour BET NOW freshness guard;
- polling The Odds API continuously;
- competing with the Generic T-30 market-refresh window;
- changing Core V1 / Official Card truth.

The Betting Ticket itself still performs no provider calls.

## Frozen operator freshness rules

Betting Ticket display gate:

- market snapshot age <= **180 minutes** -> may qualify BET NOW;
- age > 180 minutes -> WATCH / refresh market before betting.

Scheduled-refresh planner:

- stale threshold = **150 minutes**;
- this gives a 30-minute buffer before the 180-minute display gate;
- required current market types per future scheduled game:
  - spread
  - total
  - moneyline

## T-30 handoff

If **any active-week scheduled game kicks off within 60 minutes**, this workflow makes
**zero provider calls**.

Reason:

- the existing Generic T-30 Stage C owns the final-hour precision path;
- Stage C may refresh the entire board in its frozen T-45..T-35 window;
- this operator refresh must not race or duplicate that provider/persistence cycle.

The T-30 contract itself is unchanged.

## Workflow

`.github/workflows/run-betting-ticket-odds-refresh-v1-2026.yml`

Trigger:

- `workflow_dispatch` only;
- no native GitHub schedule;
- intended production clock is Supabase `pg_cron`.

PLAN:

- DIRECT_URL SELECTs only;
- providerCalls=0;
- DB writes=0;
- loads active week from the version-controlled Week 5 config;
- checks future scheduled games for recent spread/total/moneyline evidence.

Conditional REFRESH:

- only when PLAN says `REFRESH_NEEDED`;
- exposes `ODDS_API_KEY` only on that step;
- invokes the existing guarded `write-live-odds-2026.ts` COMMIT;
- exact confirmation remains `WRITE_2026_WEEK_<week>_ODDS`;
- at most one provider board call;
- append-only MarketLine persistence only.

Forbidden:

- Bet writes;
- Official Card changes;
- model/rating writes;
- Game writes;
- Generic / Hybrid T-30 closing writes;
- migrations.

## Recommended production clock

Operator-hours target:

- Tuesday through Saturday;
- America/Chicago local hours:
  - 07:20
  - 10:20
  - 13:20
  - 16:20
  - 19:20
  - 22:20

Use an hourly Supabase cron and local-time predicate rather than hard-coded UTC hours so DST
does not silently shift the operator schedule.

Conceptual gate:

```sql
extract(isodow from timezone('America/Chicago', now())) between 2 and 6
and extract(hour from timezone('America/Chicago', now())) between 7 and 22
and mod(extract(hour from timezone('America/Chicago', now()))::int - 7, 3) = 0
```

The Supabase clock only dispatches GitHub. The GitHub PLAN remains the authoritative freshness
and T-30-handoff decision.

## Provider-credit economics

Observed Week 5 Live Odds board call on 2026-09-29:

- markets: h2h / spreads / totals;
- US region;
- `x-requests-last=3`;
- `x-requests-used=280`;
- `x-requests-remaining=19720`.

Maximum operator-clock opportunities:

- 6/day;
- 5 days/week;
- 30 dispatch opportunities/week.

If every opportunity required a provider call:

- 30 calls/week x 3 credits = **90 credits/week**;
- approximately **360–390 credits per four-to-4.3-week month**.

Actual provider usage should be lower because:

- fresh boards no-op;
- T-30 handoff cycles no-op;
- final/no-future-game state no-ops.

API credits are therefore not the primary constraint. Append-only MarketLine row growth and
unnecessary GitHub work are the reasons for freshness gating.

## Production activation sequence

1. Merge and verify the workflow/planner/tests on `main`.
2. Keep any new Supabase cron inactive.
3. Issue one explicit `workflow_dispatch` proof while the board is fresh:
   - expected outcome `BOARD_FRESH`;
   - providerCalls=0;
   - DB writes=0.
4. Read the proof artifact.
5. Create the Supabase cron **inactive** with the local operator-hours predicate.
6. Read back exact cron schedule/command.
7. Activate the cron.
8. Verify the first natural operator-clock tick:
   - Supabase succeeds;
   - GitHub dispatch occurs only at an eligible local time;
   - GitHub PLAN decides whether a provider call is required.
9. Verify the first stale-board refresh:
   - exactly one provider call;
   - append-only MarketLine write;
   - post-write verification succeeds;
   - Betting Ticket returns freshMarket for actionable rows.

## Rollback

If unexpected behavior appears:

1. set this Supabase cron `active=false`;
2. leave T-30 automation untouched;
3. do not weaken the Betting Ticket freshness guard;
4. use the proven manual Live Odds PREVIEW/COMMIT path if a fresh operator board is needed.

## Boundary

This automation is an operator-market freshness service only.

It does not create a new model, new grade, new bet, new staking rule, or new closing-market
research contract.
