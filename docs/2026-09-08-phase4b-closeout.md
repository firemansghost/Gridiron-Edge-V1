# Phase 4B Closeout — 2026-09-08

**Date:** 2026-09-08 America/Chicago  
**Verified operational code baseline:** `56a13bc4ae24472eac4427614143c8bc1c3ddda4`  
**Posture:** manual guarded production; Core V1 official; Hybrid V2 SHADOW / HELD / NOT OFFICIAL

This is a dated evidence ledger for the September 8 Phase 4B checkpoint. It records what was independently proven in production. It does **not** authorize Hybrid production, ATS/CLV evaluation, recurring Shadow automation, or any unscheduled production mutation.

## Bottom line

The prospective research chain is now proven through the read side of the T−30 closing layer:

**same-season source data → TeamUnitGrades → persisted live market → frozen prospective Hybrid prediction → immutable Shadow prediction evidence → guarded T−30 closing-market PREVIEW**

The first actual closing-market COMMIT has **not** occurred. Shadow ATS/CLV/evaluation remains **not implemented / not authorized**.

## Production truth at closeout

Read-only production verification on September 8 established:

| Item | Verified state |
|---|---:|
| Week 1 Game rows | **51** |
| Week 1 games scored/final | **51 / 51** |
| Week 1 official bets (`official_flat_100`) | **98** |
| Week 1 graded / pending | **98 / 0** |
| Week 1 record | **29–67–2** |
| Week 1 stake | **$9,800** |
| Week 1 PnL | **-$1,175.0130763340988** |
| Week 1 ROI | **-11.9899%** |
| 2026 TeamUnitGrades rows / distinct teams | **138 / 138** |
| Week 2 Shadow capture runs | **1** |
| Week 2 Shadow prediction rows / distinct games | **49 / 49** |
| Shadow closing rows | **0** |
| Shadow evaluation rows | **0** |

No retrospective/backdated Shadow evidence may be created.

## TeamUnitGrades — complete and production-proven

The September 4 `SOURCE_PARTIAL 31/138` hold is obsolete.

The completed chain was:

1. complete source ingestion/readiness reached **138/138**;
2. the planner emitted a complete **138-row** proposed grade set;
3. PR #107 added the guarded writer;
4. the first production COMMIT rolled back safely on an exact-float comparator mismatch;
5. PR #108 added rollback-only diagnostics;
6. diagnostics isolated a floating-point delta on the order of `2.22e-16`;
7. PR #109 canonicalized persisted float comparison;
8. production COMMIT run **34265184909** succeeded with **138** rows and exact post-write verification.

Canonical production writer:

`.github/workflows/write-team-unit-grades-2026-manual.yml`

Properties:

- `workflow_dispatch` only
- PREVIEW is read-only
- COMMIT requires `WRITE_2026_TEAM_UNIT_GRADES`
- no provider calls
- writes TeamUnitGrades only
- does **not** run `compute_unit_grades.ts`
- does not write Bet / MatchupOutput / Shadow / ratings / source tables

`apps/jobs/src/v2/compute_unit_grades.ts` remains **UNSAFE / NOT AUTHORIZED** as a production entrypoint. The guarded writer is the production path.

## Week 2 live market — persisted

Guarded Live Odds COMMIT run **34268896159** succeeded on the pre-Shadow baseline:

- Week 2 games: **49**
- inserted MarketLine rows: **2,533**
- spread rows: **1,062**
- moneyline rows: **938**
- total rows: **533**
- spread game coverage: **49 / 49**
- total game coverage: **49 / 49**
- moneyline game coverage: **47 / 49**
- books: **11**
- provider calls: **1**

This market snapshot made the first legitimate prospective prediction capture possible. It is **not** automatically a valid T−30 close; closing evidence must use the latest persisted eligible observation at or before the frozen T−30 target.

## First legitimate prospective Shadow prediction cohort — established

### PREVIEW

Run **34270050350** was clean and read-only.

### COMMIT

Run **34270648352** successfully created the first legitimate prospective Phase 4B cohort.

Verified cohort:

- capture run ID: `fde1ec24-80fa-4393-8de8-611b135b480b`
- capture context: `weekly_post_refresh`
- capture timestamp: `2026-09-08T19:44:31.116Z`
- games: **49**
- Hybrid prediction status AVAILABLE: **49**
- Hybrid UNAVAILABLE: **0**
- selected sides: **35 AWAY / 14 HOME**
- prediction market rows: persisted BetUS / Odds API MarketLine rows
- market age at capture: **1,085 seconds** for the selected rows
- provider calls during Shadow capture: **0**
- prediction snapshots persisted: **49**
- distinct prediction games: **49**

Frozen definitions:

- evaluation protocol: `CORE_EVAL_V1`
- model ID: `hybrid_v2_shadow_snapshot_v1`
- model hash: `1532c6440a0751317e74606c648201d104de03acaec67b7e64751b5b8bde4e05e`
- policy ID: `core_eval_v1_shadow_policy_v1`
- policy hash: `f770f9eb3abe7bac8f6d2ed30d435063facc344a2381e56c471d4f428c1b7d52`

> Note: the model hash above is retained only if it matches the frozen code constant. The canonical source of truth is the committed contract/code and the production capture artifact. Do not hand-edit a frozen hash to make a report look consistent.

Qualification state on the first cohort:

- `QUALIFIED`: **0**
- `NOT_QUALIFIED`: **8**
- `UNAVAILABLE`: **41**
- V4 comparison provenance unavailable: **49**

The lack of V4 provenance does **not** make the Hybrid prediction unavailable. It conservatively prevents Super Tier A qualification where the frozen qualification rule requires V4 decision provenance.

Hybrid V2 remains **SHADOW / HELD / NOT OFFICIAL**. No official Bet rows were created by this capture.

## T−30 closing-market layer — implemented and read path proven

PR #110 merged the manual guarded T−30 writer. Merge SHA / operational code baseline:

`56a13bc4ae24472eac4427614143c8bc1c3ddda4`

Canonical workflow:

`.github/workflows/capture-shadow-t30-closing-v1-2026-manual.yml`

Frozen semantics:

- target = kickoff − 30 minutes
- latest eligible persisted spread MarketLine where `timestamp <= target`
- deterministic `timestamp DESC`, then `id DESC`
- **no fall-forward** to a row after T−30
- **no post-kickoff backfill** for an unsnapshotted game
- existing closing rows are immutable/idempotent no-ops
- future games are skipped
- only games inside the T−30-to-kickoff window are due
- missing eligible market evidence freezes an UNAVAILABLE close rather than inventing a line
- provider calls = **0**; persisted MarketLine rows only
- writes `ShadowClosingMarketSnapshot` only in COMMIT
- no prediction mutation
- no Shadow evaluation writes
- no Bet / MatchupOutput writes
- no Prisma migration

### First production T−30 PREVIEW

Run **34279785108** completed successfully on exact main SHA `56a13bc4ae24472eac4427614143c8bc1c3ddda4`.

Result:

- `writeSafe=true`
- total games: **49**
- existing closings: **0**
- FUTURE: **49**
- DUE: **0**
- MISSED: **0**
- planned inserts: **0**
- mutations invoked: **false**
- provider calls: **0**

Artifact:

- name: `shadow-t30-closing-v1-2026-w2-PREVIEW`
- artifact ID: **10077155535**
- SHA-256: `8894ffa2a2f7746c706634ad879efa61453581ea3c260361ae23a8e5b970a364`

Independent production verification after PREVIEW still showed:

- Week 2 Shadow prediction rows: **49**
- Shadow closing rows: **0**
- Shadow evaluation rows: **0**
- Bets: **6,290**
- MatchupOutputs: **2,553**
- MarketLines: **53,940**

Therefore the first production T−30 PREVIEW is formally **PROVEN READ-ONLY**.

## Week 2 closing operations

The T−30 writer does not fetch odds. Operationally, persisted market observations should be refreshed shortly **before** each T−30 target, then the closing writer should be run after the target and before kickoff.

First Friday targets:

| Game | Kickoff CT | T−30 target CT |
|---|---|---|
| Rutgers @ Boston College | Fri Sep 11, **6:30 PM** | **6:00 PM** |
| Missouri @ Kansas | Fri Sep 11, **7:00 PM** | **6:30 PM** |

Recommended sequence for each target window:

1. guarded Week 2 Live Odds PREVIEW shortly before T−30;
2. independent audit;
3. Live Odds COMMIT before T−30 if clean;
4. after T−30, run T−30 PREVIEW;
5. independently verify selected persisted MarketLine provenance and no fall-forward;
6. only then run a separately authorized T−30 COMMIT before kickoff.

Do **not** run a T−30 COMMIT merely because the workflow exists. The first actual closing COMMIT remains a separate production authorization event.

## Still not implemented / not authorized

- Shadow ATS grading
- Shadow CLV calculation persistence
- Shadow research ROI evaluation
- recurring Shadow prediction capture automation
- recurring T−30 closing automation
- Hybrid activation for official production
- Hybrid Bet writes
- Super Tier A production use

## Deferred maintenance — not Phase 4B blockers

- npm audit currently reports **21 vulnerabilities** (2 low, 1 moderate, 17 high, 1 critical); handle as separate dependency/security maintenance
- GitHub Actions reports Node 20 deprecation / Node 24 forcing warnings for some actions; handle separately
- production schema drift: the intended TeamUnitGrades `(teamId, season)` unique constraint should be audited/remediated through a guarded schema-maintenance path, not during this docs closeout
- Supabase RLS posture for public tables requires a deliberate policy design; do not enable RLS ad hoc without required policies

## Decision boundary

This closeout changes documentation only.

It does **not** change:

- Core V1 formula or official status
- Hybrid formula
- `CORE_EVAL_V1`
- 30-minute prediction freshness rule
- T−30 closing rule
- lifecycle blend policy
- production workflow schedules
- provider cadence
- betting selections
- any database row
