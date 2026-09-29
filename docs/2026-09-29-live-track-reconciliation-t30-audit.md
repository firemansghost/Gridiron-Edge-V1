# 2026-09-29 Live Track Reconciliation + T-30 Cost/Value Audit

**Status:** Week 4 closeout verified; Week 5 production state verified; T-30 recurring clock currently disabled  
**Repository checkpoint before this audit:** `dd0cac5c42d64ea7ad6024a95b5fe33764e54163`

## Bottom line

The live-production backlog carried forward in the September 29 crosswalk was stale.

The following are already complete and independently verified:

1. Week 4 score closeout;
2. Week 4 official bet grading;
3. Week 4 TeamGameStat closeout;
4. Core V1 lifecycle transition to the canonical **0.50** weight;
5. Week 5 production market/card state;
6. the first legitimate Week 5 Candidate B Elo Prior V1 prospective observation.

The remaining operational backlog item was the T-30 scheduler cost/value audit.

That audit shows the five-minute continuous external clock was operationally reliable but
very inefficient: roughly **98% of recurring external-clock cycles produced no market
refresh, no closing write, and no meaningful failure signal**.

The Supabase cron job is now present but **inactive**. Leave it inactive until a narrower
dispatch gate is reviewed and explicitly authorized.

## Week 4 production closeout

### Scores

PREVIEW:

- run: `36352798068`
- artifact: `10943181137`
- writeSafe: true
- provider FBS games: **58**
- DB games: **58**
- planned updates: **58**
- blockers: **0**

COMMIT:

- run: `36353220075`
- artifact: `10942808873`
- confirmation: `WRITE_2026_WEEK_4_SCORES`
- writeSafe: true
- **58 game rows updated**

Live DB verification:

- Week 4 games: **58**
- scored/final: **58 / 58**

### Official bet grading

PREVIEW:

- run: `36359119653`
- artifact: `10945050879`
- official bets: **107**
- planned grades: **107**
- pending game outcomes: **0**
- blockers: **0**
- provider calls: **0**

COMMIT:

- run: `36359432340`
- artifact: `10945511186`
- confirmation: `GRADE_2026_WEEK_4_OFFICIAL`
- **107 bets updated**

Live DB result:

- wins: **34**
- losses: **70**
- pushes: **3**
- total: **107**
- stake: **$10,700**
- PnL: **-$3,330.1447138820751**
- ROI: **-31.1228%**

### TeamGameStat

PREVIEW:

- run: `36359708847`
- artifact: `10945525835`
- expected participant rows: **116**
- creates: **116**
- updates: **0**
- blockers: **0**

COMMIT:

- run: `36360246463`
- artifact: `10945447765`
- confirmation: `WRITE_2026_WEEK_4_TEAM_GAME_STATS`
- **116 rows created**
- updateCount: **0**
- unchangedCount: **0**

Live DB verification:

- Week 4 TeamGameStat rows: **116 / 116**
- EPA-complete: **116 / 116**

Cumulative EPA-complete participant rows through Week 4:

- Week 1: 102
- Week 2: 98
- Week 3: 114
- Week 4: 116
- total: **430 / 430**

### Core V1 lifecycle — completed Week 4

PREVIEW:

- run: `36360695897`
- artifact: `10945243857`

COMMIT:

- run: `36361081446`
- artifact: `10945134548`
- confirmation: `WRITE_2026_CORE_V1_THROUGH_WEEK_4`

Verified writer state:

- selected policy: `GLOBAL_BLEND_W3_W6`
- Candidate A formula: `talentZ*3.5`
- completedThroughWeek: **4**
- canonical weight: **0.5000**
- FBS teams: **138**
- talent rows: **138**
- canonical ratings: **138**
- relevant final games through Week 4: **215**
- expected EPA participant rows: **430**
- actual EPA participant rows: **430**
- missing / unexpected / duplicate / null EPA: **0 / 0 / 0 / 0**
- proposed updates: **138**
- provider calls: **0**
- persisted/upserted: **138**

Live DB verification matches the COMMIT:

- `data_source=core_v1_lifecycle`
- `model_version=v1`
- rows: **138**
- all rows share the Week 4 lifecycle update timestamp
- power-rating distribution matches the COMMIT evidence

## Week 5 production state

Live DB state at this reconciliation:

- scheduled games: **56**
- official Core V1 bets: **96**
- official stake: **$9,600**
- Week 5 market rows: **5,488**
- market coverage: **56 / 56 games**
- Week 5 is not yet scored/grading-eligible

First kickoff:

- `2026-10-02 00:00:00 UTC`
- Thursday, October 1 at 7:00 PM America/Chicago

### Candidate B Elo Prior V1 — first Week 5 prospective observation

The required first prospective Week 5 observation already exists and is frozen.

- model definition: `candidate_b_elo_prior_v1`
- context: `week5_elo_first_prospective_observation`
- capture run UUID: `396e8213-7317-4678-b9b2-a982d2d487ed`
- timestamp: `2026-09-28 12:54:49.684`
- status: COMPLETE
- total games: **56**
- AVAILABLE: **56**
- UNAVAILABLE: **0**
- selections: **56**
- NO_SELECTION: **0**

No new first-observation capture is due.

## T-30 scheduler cost/value audit

### Clock truth

Supabase cron job:

`generic-shadow-t30-github-dispatch-v1`

Current state:

- schedule: `2-59/5 * * * *`
- active: **false**
- last successful tick: `2026-09-28 13:07:00 UTC`

The stop is therefore an explicit clock deactivation, not an unexplained scheduler
outage.

### Audit interval

Recurring external-clock interval:

- first Supabase tick: `2026-09-22 16:32:00 UTC`
- last Supabase tick: `2026-09-28 13:07:00 UTC`

Supabase cron history:

- ticks: **1,688**
- succeeded: **1,688**
- failed cron dispatches: **0**
- average Supabase dispatch execution: **0.0694 seconds**
- total Supabase cron execution time: **117.2 seconds**

GitHub workflow numbering reconciles the same interval:

- first external-clock run in interval: workflow run number **3**
- final run: workflow run number **1706**
- coordinator executions in interval: **1,704**
  - **1,688** external-clock dispatches
  - **15** recovered native-GitHub `schedule` runs before native scheduling was removed
  - **1** off-grid manual/live-proof run

This reconciliation is why the Supabase tick count and GitHub workflow run count differ.

### Useful production activity

Week 4 market persistence shows **20** distinct board-refresh batches during the T-30
automation interval.

The first refresh was produced by the one native-GitHub recovery run at
`2026-09-24T22:44:29Z`; the following external-clock cycle correctly saw fresh
evidence and did not duplicate the provider call.

Therefore actual recurring external-clock provider refreshes were **19**.

Generic closing evidence:

- persisted Generic T-30 rows: **174**
- Core V1 rows: **116**
- Candidate B roster-prior rows: **58**
- all persisted statuses: AVAILABLE
- distinct logical closing-write cycles: **17**

Hybrid closing evidence:

- persisted Week 4 Hybrid T-30 rows: **57**
- distinct logical closing-write cycles: **16**
- those Hybrid writes occurred inside the same closing windows as Generic Stage D

The one legitimate Hybrid miss remains:

- Liberty @ Coastal Carolina
- target occurred before the Hybrid cohort existed
- no backfill is authorized

### Failure signal

Exactly one recurring GitHub coordinator run failed:

- run: `36321569380`
- workflow run number: **1419**
- timestamp: `2026-09-27T13:12:01Z`
- failure point: Stage C read-only PLAN
- cause: transient inability to reach the Supabase PostgreSQL pooler
- provider calls: **0**
- closing writes: **0**
- report outcome: FAILED

There were:

- no cancelled coordinator runs;
- no timed-out coordinator runs.

The next cycles recovered without a special repair.

### No-op rate

Recurring external-clock classification:

- external ticks: **1,688**
- actual external market-refresh cycles: **19**
- Generic closing-write cycles: **17**
- meaningful failed cycle: **1**
- remaining no-op cycles: **1,651**

Recurring external-clock useful-signal ratio:

- **37 / 1,688 = 2.19%**
- no-op ratio: **97.81%**

Whole coordinator interval, including native/manual overlap:

- total executions: **1,704**
- market-refresh cycles: **20**
- closing-write cycles: **17**
- meaningful failed cycle: **1**
- manual/live-proof cycle that established the legitimate Hybrid miss: **1**
- useful/diagnostic cycles under that broad definition: **39**
- useful-cycle ratio: **2.29%**
- no-action/overhead remainder: roughly **97.7%**

### GitHub Actions runtime

The connected GitHub API does not expose a billing-grade aggregate Actions-minute total
for this repository, so do not represent the following as an invoice figure.

A 90-run sample of late no-op external cycles showed:

- average workflow elapsed time: **59.79 seconds**
- median: **59 seconds**
- minimum: **44 seconds**
- maximum: **103 seconds**

Using that observed runtime as an engineering estimate:

- 1,688 external cycles ≈ **1,682 runner-minutes**
- ≈ **28.0 runner-hours**
- all 1,704 coordinator executions ≈ **1,698 runner-minutes**
- ≈ **28.3 runner-hours**

This is the best supportable cost proxy from the available connector evidence.

## Cadence alternatives

### Continuous five-minute clock

Observed:

- **1,688** external dispatches
- useful-signal ratio **2.19%**
- estimated **~28 runner-hours**

Operationally safe, economically noisy.

### Blind reduced cadence

A simple 10- or 15-minute global clock is not recommended.

The frozen Stage C window is only T-45 through T-35, while Stage D targets T-30.
Changing cadence without respecting the target windows can create avoidable timing
risk.

### Window-aware five-minute dispatch — recommended

Keep Supabase's cheap five-minute cron tick, but condition the GitHub
`workflow_dispatch` on a simple schedule window.

A conservative gate based only on canonical kickoff time can leave all actual Stage C/D
logic in GitHub.

Candidate gate:

> Dispatch only if at least one active-week game kicks off between **25 and 50 minutes**
> after the current tick.

This covers:

- Stage C T-45..T-35 market refresh;
- Stage D T-30 closing capture;
- normal five-minute alignment jitter.

Replay against the actual Week 4 schedule:

- continuous ticks: **1,688**
- 25–50 minute gate: **85 dispatches**
- reduction: **94.96%**
- estimated runner time at observed average: **~85 minutes / 1.4 hours**

A wider safety band of 20–55 minutes:

- **114 dispatches**
- reduction: **93.25%**
- estimated runner time: **~114 minutes / 1.9 hours**

Week 5 schedule simulation, aligned to the actual cron phase (`:02/:07/:12/...`):

- 25–50 minute gate: **95 dispatches**
- 20–55 minute safety band: **123 dispatches**
- estimated runner time at the observed average for the 20–55 band: **~123 minutes / ~2.0 hours**

The window gate should remain a dispatch optimization only. It must not move market
selection, model eligibility, freshness, T-30 selection, or persistence semantics into
Supabase.

## Recommendation

1. **Keep the existing cron inactive for now.**
2. Do not reactivate 24/7 five-minute GitHub dispatch for Week 5.
3. Design/review a Supabase-side kickoff-window predicate whose only job is deciding
   whether to dispatch the unchanged GitHub coordinator.
4. Prefer the **20–55 minute** band for the first optimized live week because it retains
   an extra five-minute safety margin on both sides while still removing >93% of Week 4
   dispatch overhead.
5. Preserve GitHub as the sole Stage C/D decision and mutation authority.
6. Live-prove the optimized dispatcher with read/write verification before calling it
   production-proven.
7. Keep Hybrid Stage E disabled for Week 5 unless separately reviewed and authorized.

No production cron mutation is authorized by this document alone.

## Separate security advisory

During live-state verification, the connected Supabase project reported that **41
public-schema tables currently have Row Level Security disabled**.

This includes core Gridiron Edge production tables.

Do not enable RLS ad hoc: turning it on without complete policies can break the
application. Treat this as a separate security workstream:

1. inventory actual anon/authenticated/server-role access requirements;
2. design policies table-by-table;
3. test in a safe environment;
4. migrate behind a guarded rollout;
5. verify application and service-role behavior.

This advisory is independent of the T-30 cadence decision.
