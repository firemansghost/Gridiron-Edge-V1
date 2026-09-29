# Generic Shadow T-30 External Clock — Window-Gated Dispatch V2 Proposal

**Status:** WEEK 5 ACTIVE / OUT-OF-WINDOW PROVEN / FIRST IN-WINDOW PROOF PENDING  
**Date:** 2026-09-29  
**Current cron state:** `generic-shadow-t30-github-dispatch-v1 active=true`; 20–55 minute gate live  
**Current production coordinator:** `.github/workflows/run-generic-shadow-t30-automation-v1-scheduled-2026.yml`

## Objective

Preserve the proven five-minute T-30 timing semantics while avoiding 24/7 GitHub Actions
dispatch.

The Week 4 cost/value audit found:

- **1,688** recurring external-clock ticks;
- only **37 / 1,688 (2.19%)** produced a market refresh, closing write, or meaningful
  failure signal;
- a 90-run sample averaged **59.79 seconds** per GitHub coordinator execution;
- recurring external-clock runner consumption was therefore approximately **28 hours**.

The optimization target is the expensive GitHub dispatch, not the cheap Supabase cron
tick.

## Non-goals

This proposal does not change:

- Generic Shadow prediction semantics;
- capture-run/model eligibility;
- Stage C T-45..T-35 market-refresh window;
- Stage D T-30 target;
- closing-market selection rules;
- freshness rules;
- append-only persistence;
- no-backfill behavior;
- GitHub as the sole Stage C/D decision and mutation authority.

Supabase remains only the external clock and dispatch gate.

## Recommended gate

Keep the existing five-minute Supabase cron phase:

`2-59/5 * * * *`

At each tick, dispatch GitHub only when at least one 2026 Game row has kickoff between:

- **now + 20 minutes**
- **now + 55 minutes**

Conceptually:

```sql
exists (
  select 1
  from public.games g
  where g.season = 2026
    and g.date >= (now() at time zone 'UTC') + interval '20 minutes'
    and g.date <= (now() at time zone 'UTC') + interval '55 minutes'
)
```

The database stores `games.date` as `timestamp without time zone` with the production
schedule interpreted as UTC, so the gate must compare against
`now() at time zone 'UTC'`.

Do not use local-session timezone assumptions.

## Why 20–55 minutes

The frozen GitHub coordinator already handles the exact decisions.

Stage C:

- target refresh window: T-45 through T-35.

Stage D:

- closing target: T-30;
- later eligible cycles remain idempotent and may capture if the exact T-30 evidence is
  still valid under the frozen planner.

A 20–55 minute dispatch band supplies multiple five-minute opportunities around both
stages without dispatching throughout the rest of the week.

## Week 4 replay

Using the real production clock phase and Week 4 schedule:

- continuous external ticks: **1,688**
- 25–50 minute gate: **85**
- 20–55 minute safety gate: **114**

Reduction from the actual external clock:

- 25–50: **94.96%**
- 20–55: **93.25%**

At the observed 59.79-second coordinator runtime:

- 20–55 Week 4 replay: approximately **114 runner-minutes / 1.9 hours**

The wider safety band is preferred for first live proof.

## Week 5 simulation

Week 5:

- games: **56**
- distinct kickoff timestamps: **21**
- first kickoff: `2026-10-02 00:00 UTC`
- last kickoff: `2026-10-04 03:59 UTC`

Using the actual production cron phase `:02/:07/:12/...`:

- 25–50 minute gate: **95** dispatches
- 20–55 minute gate: **123** dispatches
- estimated 20–55 runner time: **~123 minutes / ~2.0 hours**

Every one of the **21** kickoff groups has exactly **7** five-minute clock opportunities
inside the 20–55 band.

Example for a 00:00 UTC kickoff:

- 23:07 = T-53
- 23:12 = T-48
- 23:17 = T-43
- 23:22 = T-38
- 23:27 = T-33
- 23:32 = T-28
- 23:37 = T-23

That supplies:

- two clearly in-window Stage C opportunities: T-43 and T-38;
- multiple post-target Stage D opportunities beginning at T-28;
- redundancy if one dispatch or DB connection fails.

## Proposed cron command shape

The production token remains in Supabase Vault under the existing secret name.

A reviewed replacement command would be conceptually:

```sql
select cron.alter_job(
  job_id := (
    select jobid
    from cron.job
    where jobname = 'generic-shadow-t30-github-dispatch-v1'
  ),
  schedule := '2-59/5 * * * *',
  command := $cron$
    select net.http_post(
      url :=
        'https://api.github.com/repos/firemansghost/Gridiron-Edge-V1/actions/workflows/' ||
        'run-generic-shadow-t30-automation-v1-scheduled-2026.yml/dispatches',
      headers := jsonb_build_object(
        'Accept', 'application/vnd.github+json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'generic_shadow_t30_github_dispatch_token'
        ),
        'X-GitHub-Api-Version', '2026-03-10',
        'Content-Type', 'application/json'
      ),
      body := '{"ref":"main"}'::jsonb,
      timeout_milliseconds := 10000
    )
    where exists (
      select 1
      from public.games g
      where g.season = 2026
        and g.date >= (now() at time zone 'UTC') + interval '20 minutes'
        and g.date <= (now() at time zone 'UTC') + interval '55 minutes'
    );
  $cron$
);
```

This is a **proposal template**, not an instruction to execute blindly.

Before any production use, confirm the deployed Supabase `cron.alter_job` signature in
the live environment or use the supported unschedule/re-schedule path if required.

## Week authority

The active CFB week is moving from an inaccessible GitHub repository variable to
version-controlled config:

`research/generic-shadow/GENERIC_SHADOW_T30_ACTIVE_WEEK_2026.json`

A read-only GitHub Actions probe on 2026-09-29 established the pre-change state:

- legacy repository week variable: **4**
- Generic automation enable variable: **true**
- mutation: **none**

Both the normal workflow token and the existing Supabase fine-grained dispatch token
returned HTTP 403 for the repository-variable settings endpoint. Credentials were not
broadened.

The Week 5 config is therefore pinned in Git as:

`{"season": 2026, "week": 5}`

Supabase still sends only `{"ref":"main"}` and does not supply season/week/model inputs.
GitHub remains the active-week authority through the checked-in config.

## Hybrid Stage E

Week 4 Hybrid Stage E remains separately scoped to active week **4**.

The scheduled workflow now evaluates the loaded version-controlled week, so pinning the
config to Week 5 disables Week 4 Hybrid Stage E automatically.

Do not generalize Stage E to Week 5 as part of this optimization.

Week 5 Hybrid closing automation remains separately reviewable/authorizable.

## Production activation sequence

The Week 5 activation used this sequence:

1. verify current `main` SHA;
2. verify Week 5 production Game universe remains **56**;
3. verify Candidate B Elo prospective cohort remains frozen and unchanged;
4. merge and verify `GENERIC_SHADOW_T30_ACTIVE_WEEK_2026.json` with season 2026 / week 5;
5. verify the cron job remains `active=false`;
6. verify the already-staged cron command contains the 20–55 minute predicate and the unchanged GitHub endpoint;
7. reactivate the cron — **COMPLETE**;
8. verify `cron.job.active=true` — **COMPLETE**;
9. verify an out-of-window cron tick records success but creates **no GitHub run** — **COMPLETE**, Supabase run **1689** returned `0 rows` and no coordinator run appeared;
10. verify the first in-window tick creates exactly one GitHub `workflow_dispatch` — **PENDING first Week 5 target window**;
11. audit the GitHub run:
    - branch `main`;
    - active week = 5 from version-controlled config;
    - Hybrid Stage E disabled;
    - expected Stage C/D reports present;
    - no forbidden writes;
12. after first actual Week 5 T-30 group:
    - verify expected MarketLine refresh evidence;
    - verify Generic closing rows;
    - verify no duplicate rows;
13. retain manual guarded Stage C/D workflows as emergency fallback.

## Rollback

If the optimized dispatch gate behaves unexpectedly:

1. set the cron job `active=false`;
2. do not fall back to retrospective/backdated closing evidence;
3. use the existing guarded manual Stage C/D workflows only for still-valid future
   targets;
4. investigate before any reactivation.

Do not restore a 24/7 continuous clock automatically.

## Acceptance criteria

The window-gated external clock has passed the out-of-window acceptance gate. Full two-sided live proof requires:

- out-of-window tick -> no GitHub dispatch — **PROVEN** by Supabase run **1689**;
- in-window tick -> one GitHub dispatch;
- GitHub active week = 5;
- Stage E = disabled;
- Stage C refresh semantics unchanged;
- Stage D T-30 semantics unchanged;
- provider-call cap unchanged;
- duplicate-write protection unchanged;
- no Official Card / prediction / lifecycle / evaluation mutations;
- cron history remains healthy;
- no unexpected GitHub executions outside the gate.

## Authorization boundary

The September 29 operator authorization covers the recommended optimized activation
sequence. The cron command has been staged only while inactive. Week 5 Hybrid Stage E
remains outside that authorization and stays disabled.

Any future change to timing semantics, provider-call limits, model eligibility, or
Hybrid Week 5 automation requires separate review.
