# Generic Shadow T-30 Automation V1 — External Clock Fallback

**Status:** PROVEN / WINDOW-GATED COMMAND STAGED / CURRENTLY DISABLED. Supabase remains the proven external clock architecture. The production cron `generic-shadow-t30-github-dispatch-v1` is still `active=false`, and its command has been updated while inactive to dispatch GitHub only when a 2026 kickoff is 20–55 minutes away. Week authority is moving to version-controlled config before reactivation.

## Why this exists

Native GitHub `schedule` did not create any workflow run records despite:

- workflow state = `active`;
- default-branch workflow present;
- repository activity current;
- `GENERIC_SHADOW_T30_AUTOMATION_V1_ENABLED=true`;
- `GENERIC_SHADOW_T30_AUTOMATION_V1_WEEK=4`;
- cron moved off the top-of-hour boundary.

Observed diagnostic on 2026-09-22:

- workflow ID: `364212883`;
- cron: `2-59/5 * * * *`;
- observed marks: `2026-09-22T15:07:00Z`, `2026-09-22T15:12:00Z`;
- scheduled run list after both marks: empty.

The fallback therefore changes only the **clock**. It does not move Stage C, Stage D, or the separately gated Hybrid closing Stage E logic out of GitHub Actions.

## Architecture

```
Supabase Cron (5-minute clock)
        |
        | authenticated HTTPS POST
        v
GitHub REST workflow_dispatch
        |
        v
run-generic-shadow-t30-automation-v1-scheduled-2026.yml
        |
        +--> existing Stage C planner / optional one-board refresh
        |
        +--> existing Stage D planner / Generic T-30 closing COMMIT/no-op
        |
        +--> optional gated Stage E / Hybrid T-30 closing COMMIT/no-op
```

The GitHub workflow remains the sole coordinator. Supabase supplies only the recurring clock and dispatch; it does not duplicate betting/model logic.

## GitHub workflow support

The coordinator supports:

- `workflow_dispatch` from the Supabase external clock.

Native GitHub `schedule` is intentionally disabled after the 2026-09-24 live proof demonstrated that GitHub cron could recover unpredictably and overlap the already-proven external clock.

The recurring route uses:

- the same Generic repository activation gate;
- the version-controlled active-week config `research/generic-shadow/GENERIC_SHADOW_T30_ACTIVE_WEEK_2026.json`;
- Week 4-only Hybrid closing activation inherited from the same Generic gate while the active week equals 4;
- the same production concurrency group;
- the same Stage C / Stage D commands;
- the same machine-readable report;
- the same mutation restrictions.

An externally dispatched run must use:

`ref=main`

No operator-supplied season/week inputs are accepted. The workflow reads:

- season = hardcoded `2026`;
- week = `research/generic-shadow/GENERIC_SHADOW_T30_ACTIVE_WEEK_2026.json`;
- enabled = `GENERIC_SHADOW_T30_AUTOMATION_V1_ENABLED`.

The legacy repository variable `GENERIC_SHADOW_T30_AUTOMATION_V1_WEEK` is no longer authoritative because both available automation credentials are intentionally denied repository-variable settings access. A read-only Actions probe on 2026-09-29 confirmed the legacy value remained `4` and the enable flag remained `true`.

## Current post-Week-4 posture

The 2026-09-29 audit found the continuous five-minute external clock reliable but
inefficient:

- 1,688 recurring external ticks;
- 37 refresh/closing/failure-signal cycles;
- 2.19% useful-signal rate;
- roughly 28 runner-hours by observed runtime proxy.

The cron remains intentionally inactive while the version-controlled Week 5 pointer is merged and verified. The 20–55 minute window-gated command is already staged in `cron.job` with `active=false`.

Do not interpret the absence of new coordinator runs after 2026-09-28 13:07 UTC as an
outage.

## Preferred external clock

Use Supabase Cron / `pg_cron` because:

- the production project already exists;
- Cron has durable job/run history;
- five-minute cadence is supported;
- the clock can call GitHub REST directly through `pg_net`;
- no betting/model code is duplicated in Supabase.

Production project:

`tccqmxcaledmlkybjqef`

## Prerequisites

Before activation verify:

1. Supabase `pg_cron` enabled.
2. Supabase `pg_net` enabled.
3. Supabase Vault available.
4. A **fine-grained GitHub token** restricted to repository:
   `firemansghost/Gridiron-Edge-V1`
5. Token permission:
   **Actions: Read and write**.
6. Token is stored only in Supabase Vault and never committed to GitHub.

Recommended Vault secret name:

`generic_shadow_t30_github_dispatch_token`

No database application table stores the token.

## Canonical dispatch endpoint

```
POST https://api.github.com/repos/firemansghost/Gridiron-Edge-V1/actions/workflows/run-generic-shadow-t30-automation-v1-scheduled-2026.yml/dispatches
```

Required headers:

```
Accept: application/vnd.github+json
Authorization: Bearer <vault secret>
X-GitHub-Api-Version: 2026-03-10
Content-Type: application/json
```

Required body:

```json
{"ref":"main"}
```

The external clock must not send week, season, mode, confirmation, or model inputs.

## Current window-gated Supabase Cron shape

The production job retains the five-minute phase but the expensive GitHub dispatch is now guarded by the kickoff window:

```sql
select net.http_post(
  url := 'https://api.github.com/repos/firemansghost/Gridiron-Edge-V1/actions/workflows/run-generic-shadow-t30-automation-v1-scheduled-2026.yml/dispatches',
  body := '{"ref":"main"}'::jsonb,
  params := '{}'::jsonb,
  headers := jsonb_build_object(
    'Accept', 'application/vnd.github+json',
    'Authorization', 'Bearer ' || (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'generic_shadow_t30_github_dispatch_token'
    ),
    'X-GitHub-Api-Version', '2026-03-10',
    'Content-Type', 'application/json',
    'User-Agent', 'gridiron-edge-supabase-cron/1.0'
  ),
  timeout_milliseconds := 10000
)
where exists (
  select 1
  from public.games g
  where g.season = 2026
    and g.date >= (now() at time zone 'UTC') + interval '20 minutes'
    and g.date <= (now() at time zone 'UTC') + interval '55 minutes'
);
```

The actual `cron.job` remains `active=false` until Week 5 GitHub-side authority is merged and verified.

## Activation verification

Activation is not complete until all of the following are observed:

1. `cron.job` contains exactly one active job named
   `generic-shadow-t30-github-dispatch-v1`.
2. `cron.job_run_details` records a successful cron execution.
3. GitHub creates a corresponding `workflow_dispatch` run.
4. The GitHub run executes from `refs/heads/main`.
5. The first in-window scheduled-cycle report records:
   - `triggerEvent = workflow_dispatch`;
   - expected main SHA;
   - active week = **5** from version-controlled config;
   - Hybrid Stage E disabled;
   - expected Week 5 eligible Generic capture runs;
   - Stage C / Stage D semantics unchanged;
   - no forbidden mutation target.
6. Independent production verification confirms:
   - official Week 5 card unchanged;
   - no Hybrid writes;
   - no duplicate or unexpected Generic closing rows.
7. At least one out-of-window cron tick succeeds without creating a GitHub workflow run.

A successful Supabase cron record without a GitHub run is not sufficient.

A green GitHub run without the machine-readable scheduled-cycle report is not sufficient.

## Clock authority after live proof

The external path was independently proven during the first Week 4 live cycle on 2026-09-24:

- Supabase cron dispatched the coordinator successfully on the intended five-minute cadence;
- native GitHub `schedule` unexpectedly recovered and also fired at `2026-09-24T22:44:29Z`;
- the native-triggered cycle performed the one required Stage C market refresh;
- the following external cycle correctly saw fresh evidence and made no duplicate provider call;
- the 6:02 PM CT external cycle captured the three legitimate Generic closing rows with `providerCalls=0`;
- later cycles remained idempotent/no-op.

The overlap was safe, but it proved that keeping two clocks adds noise and a race surface without adding useful protection. Issue #161 therefore establishes **Supabase Cron as the sole recurring clock** and removes native GitHub `schedule` from the coordinator workflow.

The existing single production concurrency group and append-only/idempotent closing rules remain defense-in-depth, not a substitute for single-clock authority.

## Manual fallback

The existing guarded manual Stage C and Stage D workflows remain the emergency fallback.

No path, manual or automated, may:

- reconstruct a missed T-30 close;
- use an after-target line;
- backfill after kickoff;
- create predictions;
- alter Official Card / Hybrid / lifecycle/model state.

## Production mutation boundary

The production external clock is proven but currently inactive. The 20–55 minute command update was staged while inactive under the September 29 authorization. Reactivation must occur only after the version-controlled Week 5 pointer is on `main` and verified. Any later infrastructure change to `pg_cron`, `pg_net`, Vault credentials, or the cron job remains separately reviewable and must be verified immediately after execution.
