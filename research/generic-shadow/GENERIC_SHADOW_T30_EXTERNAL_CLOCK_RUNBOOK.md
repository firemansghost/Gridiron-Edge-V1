# Generic Shadow T-30 Automation V1 — External Clock Fallback

**Status:** implementation/review only. External clock activation remains a separate production operation.

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

The fallback therefore changes only the **clock**. It does not move Stage C or Stage D logic out of GitHub Actions.

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
        +--> existing Stage D planner / T-30 closing COMMIT/no-op
```

The GitHub workflow remains the sole coordinator.

## GitHub workflow support

The coordinator supports both:

- native GitHub `schedule`;
- `workflow_dispatch` for an external clock.

Both routes use:

- the same repository activation gate;
- the same active-week repository variable;
- the same production concurrency group;
- the same Stage C / Stage D commands;
- the same machine-readable report;
- the same mutation restrictions.

An externally dispatched run must use:

`ref=main`

No operator-supplied season/week inputs are accepted. The workflow continues to read:

- season = hardcoded `2026`;
- week = `GENERIC_SHADOW_T30_AUTOMATION_V1_WEEK`;
- enabled = `GENERIC_SHADOW_T30_AUTOMATION_V1_ENABLED`.

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

## Canonical Supabase Cron shape

The intended five-minute job is conceptually:

```sql
select cron.schedule(
  'generic-shadow-t30-github-dispatch-v1',
  '2-59/5 * * * *',
  $cron$
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
  );
  $cron$
);
```

This SQL is an **activation template**, not authorization to execute it.

## Activation verification

Activation is not complete until all of the following are observed:

1. `cron.job` contains exactly one active job named
   `generic-shadow-t30-github-dispatch-v1`.
2. `cron.job_run_details` records a successful cron execution.
3. GitHub creates a corresponding `workflow_dispatch` run.
4. The GitHub run executes from `refs/heads/main`.
5. The scheduled-cycle report records:
   - `triggerEvent = workflow_dispatch`;
   - expected main SHA;
   - expected Week 4 eligible capture runs;
   - providerCalls=0 outside Stage C window;
   - closingRowsInserted=0 before a T-30 window;
   - no forbidden mutation target.
6. Independent production verification confirms:
   - official Week 4 card unchanged;
   - Hybrid unchanged;
   - no unexpected closing rows.

A successful Supabase cron record without a GitHub run is not sufficient.

A green GitHub run without the machine-readable scheduled-cycle report is not sufficient.

## Duplicate-clock behavior

Native GitHub `schedule` may remain configured as a passive fallback.

If GitHub native scheduling later recovers and both clocks trigger close together:

- the existing single production concurrency group serializes the runs;
- the first successful Stage C refresh should make the later cycle see a fresh board;
- closing persistence remains append-only/idempotent.

Nevertheless, after the external clock is proven, consider disabling the native GitHub cron in a later reviewed cleanup to reduce duplicate no-op runs.

Do not disable native cron before the external path is independently proven.

## Manual fallback

The existing guarded manual Stage C and Stage D workflows remain the emergency fallback.

No path, manual or automated, may:

- reconstruct a missed T-30 close;
- use an after-target line;
- backfill after kickoff;
- create predictions;
- alter Official Card / Hybrid / lifecycle/model state.

## Production mutation boundary

External-clock activation requires infrastructure mutations:

- enable `pg_cron` if absent;
- enable `pg_net` if absent;
- store a GitHub dispatch token in Vault;
- create one cron job.

Those operations require explicit production authorization and must be verified immediately after execution.
