# 2026 Workflow Reactivation Matrix + Live Odds Architecture Audit

**Phase:** 2C-2J-6C-2  
**Date:** 2026-08-30  
**Main SHA:** `f0c8c6af339884be44a6dd47780bc1adfc717799`  
**Status:** Operating inventory refresh — YAML cleanup + catalog sync  

**This phase does NOT:**
- enable any GitHub workflow schedule
- add or reactivate cron schedules for score/grading
- call CFBD / Odds / SGO / weather providers
- write production DB rows
- change Hybrid or Core V1 formulas, card selections, settlement, or CLV

Deleting workflow YAML files does **not** delete historical Actions run records or historical implementation code under `apps/jobs/`.

Machine-readable companion: [`docs/data/2026-workflow-classifications.json`](./data/2026-workflow-classifications.json)  
Static inventory script: `scripts/inventory-workflows-2026.py`

---

## Executive summary

| Metric | Value |
|--------|------:|
| Workflow files inventoried | **48** |
| YAML files with active `schedule:` triggers | **8** |
| `scheduleReactivationRecommended=true` | **0** |
| Manual guarded Live Odds path | **proven** (Week 1) |
| Manual guarded Core V1 card path | **proven** (Week 1) |
| Manual guarded CFBD score path | **proven** (Week 1) |
| Manual guarded official grading path | **proven** (Week 1) |
| Recurring score/grading schedules | **NOT AUTHORIZED** |
| Official Week1 spread model | **Core V1** |
| Hybrid production authorization | **held** |

### Classification counts

| Classification | Count |
|----------------|------:|
| COMPLETED_LEAVE_OFF | 18 |
| MANUAL_SAFE | 10 |
| MANUAL_REVIEW_REQUIRED | 6 |
| REPAIR_BEFORE_USE | 8 |
| REPLACE | 4 |
| FUTURE_AFTER_GAMES | 0 |
| BLOCKED | 1 |
| CI_ONLY | 1 |
| **Total** | **48** |

### REPLACE (do not reactivate as-is)

| Workflow | Why |
|----------|-----|
| `nightly-ingest.yml` | Hard-coded 2025 multi-domain monolith; Odds wipe+replace; `seed-ratings` side effect |
| `ratings-v1.yml` | Legacy `compute_ratings_v1` — **never** for 2026 Core V1 |
| `ratings-v2.yml` | Old `modelVersion=v2` ratings engine ≠ Hybrid V2 spreads |
| `sync-weekly-bets.yml` | Always writes `hybrid_v2` + `official_flat_100`; invalid while Hybrid held |

### REPAIR_BEFORE_USE

`cfbd-feature-ingest.yml`, `cfbd-rankings-sync.yml`, `stats-cfbd.yml`, `stats-season-cfbd.yml`, `stats-advanced-cfbd.yml`, `roster-churn-cfbd.yml`, `talent-commits-sync.yml`, `sgo-team-stats.yml`

### MANUAL_SAFE canonical production entrypoints (dispatch only)

| Workflow | Role |
|----------|------|
| `write-live-odds-2026.yml` | Guarded Live Odds PREVIEW/COMMIT |
| `write-core-v1-weekly-card-2026.yml` | Guarded Core V1 `official_flat_100` card |
| `cfbd-scores-2026-manual.yml` | Guarded CFBD score PREVIEW/COMMIT |
| `grade-bets-2026-manual.yml` | Guarded official bet grading PREVIEW/COMMIT |

### BLOCKED

| Workflow | Why |
|----------|-----|
| `v3-totals-nightly.yml` | References missing `sync-v3-bets.ts`; totals V3 disabled |

### COMPLETED_LEAVE_OFF (representative)

Schedule write/inventory, FBS membership, season conferences, talent init, Core V1 ratings preview + forensics/evals, Hybrid readiness audit *as a completed decision phase* (workflow itself remains MANUAL_SAFE for re-runs), backfill-scores-2025.

### Retired workflow identities (2C-2J-6C-2)

| Deleted YAML | Replacement |
|--------------|-------------|
| `cfbd-scores-sync.yml` (`CFBD Scores Sync`) | `cfbd-scores-2026-manual.yml` |
| `grade-bets.yml` (`Grade Bets`) | `grade-bets-2026-manual.yml` |
| `one-time-week1-odds-core-preview-2026-08-29.yml` | none (expired one-time) |

---

## A. Operator context

At end of 2025, **all recurring production workflows were stopped in the GitHub UI**. YAML may still contain `schedule:` blocks. This audit answers what would happen **if** a workflow were enabled — it does **not** change GitHub enabled/disabled state.

Opening provider Week 1 Saturday tranche completed the full guarded production chain (Live Odds → Core card → CFBD Scores → Official grading). Recurring schedules for score/grading remain **NOT AUTHORIZED**.

---

## B. Scheduled workflows (active YAML `schedule:`)

All **8** remain **operator-stopped**. Recommendation: keep stopped. `scheduleReactivationRecommended=false` for each.

| File | Cron(s) | If enabled would… | Season | Provider | Prod writes | 2026 recommendation |
|------|---------|-------------------|--------|----------|-------------|---------------------|
| `nightly-ingest.yml` | `0 7 * * *` | Schedules (CFBD 2025), Odds wipe+insert, weather, talent/commits, **seed-ratings** | **2025** | CFBD, Odds, SGO stub, VC | Yes (Game/MarketLine/ratings side effects) | **REPLACE** — never re-enable |
| `v3-totals-nightly.yml` | `0 8 * * *` | Attempt V3 totals bet sync | 2025 default | CFBD | Would fail / blocked | **BLOCKED** |
| `stats-season-cfbd.yml` | `0 2 * * *` | Season stats | 2024/2025 | CFBD | stats | REPAIR |
| `stats-advanced-cfbd.yml` | `0 3 * * *` | Advanced / EPA features | 2024/2025 | CFBD | feature tables | REPAIR; prefer feature-ingest review |
| `cfbd-rankings-sync.yml` | `0 9 * * 1` | Rankings | 2025 | CFBD | rankings | REPAIR; optional |
| `roster-churn-cfbd.yml` | `0 3 15 2 *` | Roster churn | 2025 | CFBD | roster | REPAIR; offseason periodic |
| `talent-commits-sync.yml` | `0 3 1 2 *` | Commits | 2025 | CFBD | commits | REPAIR; schema risk |
| `sgo-team-stats.yml` | `0 4 20 2 *` | SGO team stats (**not MarketLine**) | 2024 | SGO | team stats | REPAIR; optional |

Note: `stats-cfbd.yml` has a **commented-out** historical schedule only — it is **not** actively scheduled (dispatch-only).

Legacy `cfbd-scores-sync.yml` and `grade-bets.yml` schedules are **removed** from the repo; their historical Actions runs remain in GitHub history only.

---

## C. Full workflow inventory (compact)

Legend: **Class** = classification; **Sched?** = YAML schedule present; **SchedOK?** = schedule reactivation recommended (all false).

| File | Display name (short) | Triggers | Class | Sched? | SchedOK? |
|------|----------------------|----------|-------|--------|----------|
| audit-2026-ratings-readiness.yml | Audit 2026 Ratings Readiness | dispatch | COMPLETED_LEAVE_OFF | N | N |
| audit-2026-marketline-consumer-readiness.yml | Audit MarketLine Consumer Readiness | dispatch | MANUAL_SAFE | N | N |
| audit-2026-schedule-inventory.yml | Audit 2026 Schedule Inventory | dispatch | COMPLETED_LEAVE_OFF | N | N |
| audit-balanced-v1-historical-parity.yml | Audit Balanced V1 Historical Parity | dispatch | COMPLETED_LEAVE_OFF | N | N |
| audit-hybrid-v2-preseason-readiness.yml | Audit Hybrid V2 Preseason Readiness | dispatch | MANUAL_SAFE | N | N |
| audit-v1-conference-source.yml | Audit V1 Conference Source | dispatch | COMPLETED_LEAVE_OFF | N | N |
| audit-v1-historical-parity.yml | Audit Core V1 Historical Parity | dispatch | COMPLETED_LEAVE_OFF | N | N |
| backfill-drives.yml | Backfill Drives | dispatch | MANUAL_REVIEW_REQUIRED | N | N |
| backfill-odds-historical.yml | Backfill Odds Historical | dispatch | MANUAL_REVIEW_REQUIRED | N | N |
| backfill-scores-2025.yml | Backfill Scores 2025 | dispatch | COMPLETED_LEAVE_OFF | N | N |
| bowl-week-bootstrap.yml | Bowl Week Bootstrap | dispatch | MANUAL_REVIEW_REQUIRED | N | N |
| cfbd-feature-ingest.yml | CFBD Feature Ingest | dispatch | REPAIR_BEFORE_USE | N | N |
| cfbd-rankings-sync.yml | CFBD Rankings Sync | dispatch+schedule | REPAIR_BEFORE_USE | Y | N |
| cfbd-scores-2026-manual.yml | 2026 CFBD Scores (Manual, Guarded) | dispatch | MANUAL_SAFE | N | N |
| diagnose-2026-conference-recruiting.yml | Diagnose Conference/Recruiting | dispatch | COMPLETED_LEAVE_OFF | N | N |
| evaluate-balanced-v1-preseason-bridge.yml | Evaluate Preseason Bridge | dispatch | COMPLETED_LEAVE_OFF | N | N |
| evaluate-balanced-v1-transition-blends.yml | Evaluate Transition Blends | dispatch | COMPLETED_LEAVE_OFF | N | N |
| evaluate-balanced-v1-transition-timing.yml | Evaluate Transition Timing | dispatch | COMPLETED_LEAVE_OFF | N | N |
| grade-bets-2026-manual.yml | 2026 Grade Bets (Manual, Guarded) | dispatch | MANUAL_SAFE | N | N |
| ingest-2026-schedules.yml | Ingest 2026 Schedules | dispatch | COMPLETED_LEAVE_OFF | N | N |
| init-2026-fbs-membership.yml | Init 2026 FBS Membership | dispatch | COMPLETED_LEAVE_OFF | N | N |
| initialize-2026-season-conferences.yml | Init Season Conferences | dispatch | COMPLETED_LEAVE_OFF | N | N |
| initialize-2026-team-talent.yml | Init Team Talent | dispatch | COMPLETED_LEAVE_OFF | N | N |
| nightly-ingest.yml | Nightly Ingest + Ratings | dispatch+schedule | REPLACE | Y | N |
| preview-2026-core-v1-ratings.yml | Preview Core V1 Ratings | dispatch | COMPLETED_LEAVE_OFF | N | N |
| preview-2026-fbs-membership.yml | Preview FBS Membership | dispatch | COMPLETED_LEAVE_OFF | N | N |
| preview-2026-ratings-inputs.yml | Preview Ratings Inputs | dispatch | COMPLETED_LEAVE_OFF | N | N |
| preview-2026-schedules.yml | Preview 2026 Schedules | dispatch | MANUAL_SAFE | N | N |
| preview-2026-season-conferences.yml | Preview Season Conferences | dispatch | COMPLETED_LEAVE_OFF | N | N |
| prisma-guardrails.yml | Prisma Schema Guardrails | pull_request | CI_ONLY | N | N |
| prisma-migrate.yml | Prisma Migrate | dispatch | MANUAL_REVIEW_REQUIRED | N | N |
| probe-2026-talent-availability.yml | Probe Talent Availability | dispatch | MANUAL_SAFE | N | N |
| ratings-v1.yml | Ratings V1 | dispatch | REPLACE | N | N |
| ratings-v2.yml | Ratings V2 | dispatch | REPLACE | N | N |
| roster-churn-cfbd.yml | Roster Churn CFBD | dispatch+schedule | REPAIR_BEFORE_USE | Y | N |
| sgo-team-stats.yml | SGO Team Stats | dispatch+schedule | REPAIR_BEFORE_USE | Y | N |
| stats-advanced-cfbd.yml | Stats Advanced CFBD | dispatch+schedule | REPAIR_BEFORE_USE | Y | N |
| stats-cfbd.yml | Stats CFBD | dispatch | REPAIR_BEFORE_USE | N | N |
| stats-season-cfbd.yml | Stats Season CFBD | dispatch+schedule | REPAIR_BEFORE_USE | Y | N |
| sync-weekly-bets.yml | Sync Weekly Bets | dispatch | REPLACE | N | N |
| talent-cfbd.yml | Talent CFBD | dispatch | MANUAL_REVIEW_REQUIRED | N | N |
| talent-commits-sync.yml | Talent Commits Sync | dispatch+schedule | REPAIR_BEFORE_USE | Y | N |
| talent-roster-sync.yml | Talent Roster Sync | dispatch | MANUAL_REVIEW_REQUIRED | N | N |
| v3-totals-nightly.yml | V3 Totals Nightly | dispatch+schedule | BLOCKED | Y | N |
| validate-preseason-providers.yml | Validate Preseason Providers | dispatch | MANUAL_SAFE | N | N |
| write-live-odds-2026.yml | Preview/Write 2026 Live Odds | dispatch | MANUAL_SAFE | N | N |
| write-core-v1-weekly-card-2026.yml | Write Core V1 Weekly Card 2026 | dispatch | MANUAL_SAFE | N | N |
| write-core-v1-lifecycle-ratings.yml | Write Core V1 Lifecycle | dispatch | MANUAL_SAFE | N | N |

Full static fields (secrets, scripts, hardcoded years, security flags) can be regenerated with:

```bash
python scripts/inventory-workflows-2026.py
```

---

## D. Minimal 2026 operating pipeline (current)

Keep **score → grading → feature ingest → lifecycle** as separate stages. Do not merge into one mega-job.

### PRE-GAME

| Stage | Required? | Cadence | Provider | Writes | Canonical path |
|-------|-----------|---------|----------|--------|----------------|
| Schedule maintenance | As needed | Manual | CFBD | Game schedule | `preview-2026-schedules` + guarded ingest |
| **Live Odds** | Yes for card | Manual guarded | Odds API | MarketLine append | `write-live-odds-2026.yml` (**proven**) |
| Official slate/card | Yes | Manual guarded | none (DB) | Bet (`official_flat_100`) | `write-core-v1-weekly-card-2026.yml` (**proven**) |

### GAME / POST-GAME

| Stage | Required? | Cadence | Provider | Writes | Canonical path |
|-------|-----------|---------|----------|--------|----------------|
| Score sync | Yes after kickoff | Manual guarded (recurring **NOT AUTHORIZED**) | CFBD `/games` | Game scores/status | `cfbd-scores-2026-manual.yml` (**proven**) |
| Grading | After finals + bets | Manual guarded (recurring **NOT AUTHORIZED**) | none | Bet result/pnl/clv | `grade-bets-2026-manual.yml` (**proven**) |
| CFBD feature ingest | For lifecycle | After week completes | CFBD | feature tables | `cfbd-feature-ingest` / stats-* — REPAIR before use |
| Core V1 lifecycle | After completedThroughWeek | Manual guarded | none (DB features) | TeamSeasonRating v1 | `write-core-v1-lifecycle-ratings` |

### HYBRID READINESS (future)

| Stage | Required for Week1? | Notes |
|-------|---------------------|-------|
| Same-season CFBD unit features | No | Needed before Hybrid activation |
| TeamUnitGrades compute | No | **Not authorized** to copy 2025 bridge |
| Hybrid readiness audit | Optional re-run | `audit-hybrid-v2-preseason-readiness` MANUAL_SAFE |
| Explicit Hybrid activation | Separate human phase | Do not guess week |

### PERIODIC / OPTIONAL

Talent/roster/rankings/SGO team stats — repair season params before any use; none needed for Week1 Core V1 card once Odds exist.

**Keep score → grading → feature ingest → lifecycle as separate workflows.**

---

## E. Live Odds architecture audit

### Current paths capable of Odds fetch/write

| Path | Role | Live 2026 fit |
|------|------|---------------|
| `OddsApiAdapter` | Primary Odds API live + historical | Reusable matching/fetch core |
| `SportsGameOddsAdapter` | SGO markets; **no gameId attach** | Not production-ready for MarketLine FK |
| `ingest-minimal.ts` | Nightly writer: **deleteMany** season/weeks/`oddsapi` then `createMany` | **Not approved** for recurring live polls |
| `ingest.ts` | Append `createMany(skipDuplicates)` then **`seed-ratings`** | **Not approved** (ratings side effect) |
| `ingest-simple.js` | Stub / simulated | Nightly SGO “fallback” is **non-functional** |
| `backfill-odds-historical.yml` | Manual historical via ingest-minimal | Historical only; wipe semantics |
| `validate-preseason-providers` | Probe without DB writes | Good for 0–3 credit PREVIEW probes |
| `manual-week9-odds.js` | One-off 2025 | Not a 2026 path |

### Findings (numbered)

1. **Provider priority:** Odds API primary; SGO intended fallback but nightly SGO step is stub.
2. **Live endpoint:** `GET /v4/sports/americanfootball_ncaaf/odds?regions=us&markets=h2h,spreads,totals&oddsFormat=american`
3. **Credit cost:** Live featured odds up to ~**3 credits**/call (`x-requests-last`); `/sports` probe = 0. `CREDITS_LIMIT` accepted but **not enforced** in adapter.
4. **Markets:** spreads + totals + ML (`h2h`) on live path; historical parser **skips ML**.
5. **Bookmakers:** all US books returned; names normalized; no allowlist.
6. **Team resolver:** aliases + denylist + FBS membership; unresolved home/away drops event.
7. **Game matching:** exact season/week/teams then week-flexible by commence proximity (`GameLookup`).
8. **Week matching:** flexible mapping can write DB week ≠ poll week; delete filter uses **requested** weeks.
9. **Unique constraint:** `@@unique([gameId, lineType, bookName, timestamp, teamId])`
10. **Insert/update/delete:** ingest-minimal = **delete + createMany**; ingest.ts = append skipDuplicates; no true upsert.
11. **Dedupe:** in-memory key then DB unique; new timestamp → new row on append paths only.
12. **Timestamp:** Odds `bookmaker.last_update`; SGO uses `new Date()` (weak).
13. **History preservation:** **ingest-minimal destroys prior week observations each poll**.
14. **Overwrite/delete:** yes on ingest-minimal for season+weeks+source.
15. **Ratings after Odds:** ingest.ts yes; nightly separate `seed-ratings` job yes; ingest-minimal alone no.
16. **Bet writes:** Odds paths do **not** write Bet.
17. **Dry-run:** skips MarketLine writes but still hits DB for lookups and burns credits; may write reports.
18. **Preview without DB:** yes via `validate-preseason-providers` (+ optional `--probe-odds`).

### Week1 Odds need (no Hybrid required)

Market data for spreads / totals / moneylines / edge / official Core V1 card. Opening Week 1 Live Odds path is **proven** via `write-live-odds-2026.yml`.

---

## F. Recommended Phase 2C-2J-2 — Live Odds writer (design only)

**Candidate workflow:** `Preview/Write 2026 Live Odds (Manual, Guarded)`  
**Modes:** `PREVIEW` | `COMMIT`  
**Trigger:** `workflow_dispatch` **only** (no schedule initially)  
**Provider:** The Odds API primary; SGO only if separately justified later  
**Season:** exactly `2026`; week explicit (Week1 first)  
**Markets:** `spreads,totals,h2h`  
**Confirmation (COMMIT):** e.g. `WRITE_2026_WEEK_<n>_ODDS` (final token naming in 2C-2J-2)

### Required properties

- No mock/simulated Odds
- No ratings / Bet / schedule / score writes
- PREVIEW: no deletes; report unmatched/ambiguous; credit accounting
- COMMIT: no deletes unless independently justified; prefer **append** observations (preserve timestamped history)
- Deterministic game/team mapping; fail closed on unmatched/ambiguous
- Exact Week1 schedule identity (51 FBS-vs-FBS)
- Bounded provider calls; enforce credit budget
- Transaction-safe persistence + post-write verification
- PR #60 security posture: step env for inputs; narrowly scoped `DIRECT_URL`; inert placeholders for install/generate; no secret echo to `GITHUB_ENV`

### Explicit non-goals for 2C-2J-2

- Do not reactivate `nightly-ingest`
- Do not reuse `ingest.ts` (ratings coupling)
- Do not use ingest-minimal wipe as the live poller default

---

## G. Bet sync audit + recommendation

### Current `sync-weekly-bets.yml`

Always runs:
1. `sync-hybrid-bets.ts` → `strategyTag=hybrid_v2`
2. `sync-official-picks-to-bets.ts` → `strategyTag=official_flat_100`

No dry-run, no Hybrid authorization gate, job-wide `DIRECT_URL`.

### Week1 policy conflict

Official model = Core V1; Hybrid held. Running current sync would **persist Hybrid production bets** even though slate runtime holds Hybrid.

### Recommendation

**Prefer C: new Core-only guarded weekly-card writer** — **IMPLEMENTED** as `write-core-v1-weekly-card-2026.yml` (PREVIEW/COMMIT + confirmation), writing only `official_flat_100` while Hybrid unauthorized.

Legacy `sync-weekly-bets.yml` is labeled **LEGACY (<=2025)** and rejects season≥2026.

**Week 1 opening Core card COMMIT is proven.** Recurring Odds polling schedule remains **NOT AUTHORIZED**.

---

## H. Score / post-game pipeline audit

### Canonical score path — `cfbd-scores-2026-manual.yml`

- `workflow_dispatch` only (no schedule)
- Guarded `write-cfbd-scores-2026.ts`; one CFBD `/games` call
- Production Week 1 PREVIEW + COMMIT proven
- Recurring score schedule **NOT AUTHORIZED**

### Canonical grading path — `grade-bets-2026-manual.yml`

- `workflow_dispatch` only (no schedule)
- Guarded `grade-bets-2026.ts` for `official_flat_100` / `strategy_run`
- No provider calls; Serializable COMMIT of result/pnl/clv only
- Production Week 1 PREVIEW + COMMIT proven
- Recurring grading schedule **NOT AUTHORIZED**

### Retired identities

Legacy `cfbd-scores-sync.yml` (`CFBD Scores Sync`) and `grade-bets.yml` (`Grade Bets`) YAML files were deleted in 2C-2J-6C-2. Historical Actions run records and historical `apps/jobs` implementations remain in the repository but are not invoked by any workflow.

Keep **score → grading → feature ingest → lifecycle** as separate stages.

---

## I. Security / workflow quality flags

Preferred standard: **PR #60 / lifecycle** (step env inputs, scoped DB secret, inert install placeholders, confirmation not echoed).

| Anti-pattern | Examples |
|--------------|----------|
| Hard-coded 2025 in scheduled paths | `nightly-ingest`, stats/rankings/commits |
| `${{ inputs.* }}` inside shell `run:` | Multiple legacy workflows (e.g. `v3-totals-nightly`) |
| Secrets echoed to `GITHUB_ENV` | `cfbd-feature-ingest` |
| Job-wide production DB for broad jobs | nightly, sync-weekly-bets |
| `continue-on-error` on required data | feature-ingest season-stats |
| Mock/simulated fallback advertised as live | nightly SGO → `ingest-simple` |
| Ratings as Odds side effect | `ingest.ts`, nightly `seed-ratings` |
| UTF-16 workflow file | `v3-totals-nightly.yml` (fragile tooling) |

---

## J. Authorization status after this phase

| Capability | Status |
|------------|--------|
| Recurring workflows | **STOPPED** (operator UI); 8 YAML schedules remain inert |
| Live Odds | **Manual guarded proven**; recurring schedule **NOT AUTHORIZED** |
| Core V1 official card | **Manual guarded proven** |
| Official grading | **Manual guarded proven**; recurring schedule **NOT AUTHORIZED** |
| Score sync | **Manual guarded proven**; recurring schedule **NOT AUTHORIZED** |
| CFBD feature ingest | **NOT YET REACTIVATED** |
| Hybrid activation | **HELD** |
| Core V1 Week1 official | **YES** |

---

## K. Next phase

Authorize recurring score/grading cadence only after explicit operator review (separate from this inventory cleanup). Feature ingest / lifecycle remain separate stages.
