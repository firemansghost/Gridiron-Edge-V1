# 2026-09-29 Week 5 Generic T-30 Window-Gated Activation

**Status:** ACTIVATED / OUT-OF-WINDOW CRON PROOF PENDING  
**Week 5 runtime:** `c8587a8157af0993a41a66e14117ecfb7c34f2be`  
**Active-week authority:** `research/generic-shadow/GENERIC_SHADOW_T30_ACTIVE_WEEK_2026.json`  
**External clock:** Supabase `generic-shadow-t30-github-dispatch-v1`

## Why this changed

The Week 4 cost/value audit showed that the continuous five-minute external clock was
safe but inefficient:

- recurring external ticks: **1,688**
- refresh / closing / meaningful failure-signal cycles: **37**
- useful-signal rate: **2.19%**
- estimated GitHub runner use: approximately **28 hours**

The timing contract itself was not changed.

Instead, the expensive GitHub `workflow_dispatch` is now suppressed unless a 2026
kickoff is **20–55 minutes** away.

## Week authority

A 2026-09-29 read-only GitHub Actions probe established:

- legacy repository week variable: **4**
- Generic automation enable variable: **true**
- mutation: **none**

The normal GitHub workflow token and the existing Supabase fine-grained dispatch token
both returned HTTP 403 for GitHub's repository-variable settings endpoint.

Credentials were not broadened.

PR #215 therefore moved only the non-secret active-week pointer into version control:

`research/generic-shadow/GENERIC_SHADOW_T30_ACTIVE_WEEK_2026.json`

Current value:

- season: **2026**
- week: **5**
- authority: `version_controlled_active_week`

The existing repository variable
`GENERIC_SHADOW_T30_AUTOMATION_V1_ENABLED=true` remains the kill / enable gate.

## PR #215 verification

PR #215 merged at:

`c8587a8157af0993a41a66e14117ecfb7c34f2be`

All relevant checks passed:

- targeted T-30 automation/regression tests
- secret-free production-path CLI smoke
- secret-free Stage C market-refresh PLAN smoke
- secret-free Stage D closing PLAN smoke
- Prisma guard
- Vercel

The coordinator still accepts only `workflow_dispatch` on `main`.

Supabase still sends only:

`{"ref":"main"}`

It does not supply week, season, model, mode, or confirmation inputs.

## Supabase window gate

The production cron command was updated while the job remained inactive.

Unchanged:

- job: `generic-shadow-t30-github-dispatch-v1`
- cron phase: `2-59/5 * * * *`
- GitHub workflow endpoint
- Vault token
- dispatch body
- GitHub Stage C / Stage D decision authority

Added predicate:

```sql
where exists (
  select 1
  from public.games g
  where g.season = 2026
    and g.date >= (now() at time zone 'UTC') + interval '20 minutes'
    and g.date <= (now() at time zone 'UTC') + interval '55 minutes'
);
```

The job was then reactivated by changing only:

`active=false -> active=true`

No second cron command rewrite occurred during activation.

## Week 5 preflight

Before proof execution:

- Week 5 games: **56**
- Week 5 MarketLine rows: **5,488**
- market coverage: **56 / 56**
- official Core bets: **96**
- official stake: **$9,600**
- Generic Week 5 closing rows: **0**
- Hybrid Week 5 closing rows: **0**

Candidate B Elo Prior V1 prospective cohort remained exact:

- run: `396e8213-7317-4678-b9b2-a982d2d487ed`
- status: COMPLETE
- total: **56**
- available: **56**
- selections: **56**

## Explicit Week 5 proof dispatch

One explicit proof dispatch was issued while the recurring cron was still inactive.

Supabase pg_net request:

- request ID: **1710**
- HTTP status: **200**

GitHub run:

- run: **36614235554**
- event: `workflow_dispatch`
- head SHA: `c8587a8157af0993a41a66e14117ecfb7c34f2be`
- conclusion: **success**

Coordinator evidence:

- active week: **5**
- active-week source: `version_controlled_config`
- ref: `refs/heads/main`
- Stage C provider refresh: **skipped**
- Stage D: **NO_ACTION**
- provider calls: **0**
- closing rows inserted: **0**
- mutation targets: **none**
- blockers: **0**
- Hybrid Stage E: **disabled / skipped**

The coordinator recognized the frozen Candidate B Elo cohort but did not invoke a
closing write because no Week 5 target was due.

## Proof artifact

Artifact:

- ID: **11054901383**
- name: `generic-shadow-t30-automation-v1-2026-w5-scheduled-cycle`
- GitHub digest:
  `sha256:7e51d62232032bfda68cd368ab4709be09abe51294022af80434d452a703c694`

Independent local ZIP SHA-256:

`7e51d62232032bfda68cd368ab4709be09abe51294022af80434d452a703c694`

The archive contains five JSON reports.

Top-level report independently confirms:

- outcome: `NO_ACTION`
- season/week: **2026 / 5**
- providerCallsAttempted/Succeeded: **0 / 0**
- closingRowsInserted: **0**
- hybridClosingRowsInserted: **0**
- hybridClosingEnabled: **false**
- writeSafe: **true**
- mutationTargetsInvoked: `[]`
- blockers: `[]`
- eligible run:
  `396e8213-7317-4678-b9b2-a982d2d487ed`
- eligible model:
  `candidate_b_elo_prior_v1`
- activeWeekSource: `VERSION_CONTROLLED_CONFIG`
- repoCommitSha:
  `c8587a8157af0993a41a66e14117ecfb7c34f2be`

## Post-proof production fingerprint

After the proof run:

- MarketLine rows: **5,488**
- official Core bets: **96**
- official stake: **$9,600**
- Generic Week 5 closing rows: **0**
- Hybrid Week 5 closing rows: **0**
- Candidate B Elo cohort verification: **exact / unchanged**

The proof run therefore changed no Week 5 model, betting, market, or closing state.

## Recurring clock status

The window-gated Supabase cron is now:

- schedule: `2-59/5 * * * *`
- active: **true**
- gate at activation: **closed**
- command contains the reviewed 20–55 minute predicate

The first actual out-of-window post-reactivation cron tick is still pending verification
in this document.

Do not call the window gate fully production-proven until both are observed:

1. an out-of-window cron tick succeeds and creates **no GitHub coordinator run**;
2. the first legitimate in-window Week 5 cron tick creates exactly one coordinator run
   and preserves the frozen Stage C / Stage D semantics.

The first Week 5 kickoff is Thursday, October 1 at 7:00 PM CT.

## Hybrid boundary

Week 5 Hybrid Stage E remains **disabled and unauthorized**.

Moving active week to 5 did not generalize Hybrid closing automation.

## Rollback

If the optimized external clock behaves unexpectedly:

1. set Supabase cron `active=false`;
2. do not manufacture retrospective T-30 evidence;
3. use guarded manual Stage C / Stage D only for still-valid future targets;
4. investigate before reactivation.

Do not automatically restore 24/7 continuous GitHub dispatch.
