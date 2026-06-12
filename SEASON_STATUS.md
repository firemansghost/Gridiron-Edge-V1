# Season Status — Gridiron Edge

**Status:** Offseason / paused for regular-season automation  
**Updated:** 2026-06-12 (2026 preseason preparation)

Operator-facing status for offseason/preseason work. Complements `WORKFLOW_DISABLE_REPORT.md`, `docs/preseason-reactivation-checklist.md`, and `docs/2026-betting-playbook.md`.

---

## Current mode

| Item | Status |
|------|--------|
| **Calendar context** | 2026 preseason prep (post–2025 bowl/offseason) |
| **2025 regular season** | Complete |
| **Production app** | Deployed; Season Update banner (Dec 22, 2025) is stale — update before public preseason |
| **Dual-model** | **Merged to `main`** (PR #34); Phase H verification passed |
| **GitHub Actions** | **All workflows disabled in GitHub UI** (Bobby confirmation, Dec 2025) — re-confirm before reactivation |
| **Workflow YAML** | Schedules still present in `.github/workflows/` — disablement is **UI state**, not encoded in YAML |
| **Reactivation readiness** | **Not ready** for bulk scheduled reactivation; manual dry runs and blockers remain |

---

## Dual-model state (2026)

| Model | Role | DB `strategyTag` | UI label |
|-------|------|------------------|----------|
| **Hybrid V2** | Primary/default **spread** model | `hybrid_v2` | Hybrid V2 (Flat $100) |
| **Core V1** | Comparison / reporting | `official_flat_100` (historical — do not rename) | Core V1 Card (Flat $100) |
| **V4** | Labs only | `v4_labs` | V4 Labs (Flat $100) |
| **Fade V4** | Labs only | `fade_v4_labs` | Fade V4 Labs (Flat $100) |

**Scope notes:**

- Hybrid V2 applies to **spreads only** for now.
- **Totals and moneyline** use **current/existing (Core V1) logic** on slate/picks.
- Weekly `official_flat_100` sync continues for Core V1 graded comparison rows.

**Surfaces (default = Hybrid V2):**

- Homepage slate (`/api/weeks/slate`, not `/api/seed-slate`)
- `/picks` + `ProductionModelSelector`
- Week Review / Season Review strategy default
- Game detail: Hybrid V2 primary; Core V1 comparison card

---

## Completed phases

| Phase | Summary |
|-------|---------|
| A1+B–G | Dual-model labels, selector, slate API, review defaults, game detail, docs |
| H | Verification — tests, typecheck, build, manual smoke checklist |
| 2 | Workflow/offseason reactivation audit (report only) |
| 2A | Pre-reactivation safety fixes (docs + slate script compatibility) |

---

## What has NOT changed

- Model math, coefficients, ratings, edge, grading, CLV, backtest assumptions
- Database schema / migrations
- GitHub Actions workflow files or cron schedules (YAML unchanged)
- Sync scripts (`sync-hybrid-bets.ts`, `sync-official-picks-to-bets.ts`, etc.)
- ETL job implementations under `apps/jobs/src`
- Workflow enablement (still off in GitHub UI)

---

## P0 reactivation blockers (unresolved)

Do **not** bulk re-enable scheduled workflows until these are addressed:

| Blocker | Status | Notes |
|---------|--------|-------|
| **Season 2025 hardcoding** | Open | Scheduled workflows default to 2025; Phase 2B will parameterize |
| **Missing `sync-v3-bets.ts`** | Open | `v3-totals-nightly.yml` is **blocked** — see below |
| **No weekly bet sync automation** | Open | Graded rows need manual sync scripts; Phase 2B will add manual-first workflow |
| **Slate `{ games, meta }` wrapper** | Partially fixed (2A) | Verification scripts updated; API unchanged |
| **Secrets / mock fallback risk** | Open | `nightly-ingest` writes mock data if `CFBD_API_KEY` missing |
| **GitHub UI state** | Open | Re-confirm all workflows disabled; re-enable `prisma-guardrails` for PRs if off |

### V3 totals — blocked (do not re-enable)

- **Workflow:** `v3-totals-nightly.yml` must remain **disabled** in GitHub UI.
- **Cause:** References `apps/web/scripts/sync-v3-bets.ts`, which **does not exist** in the repo.
- **2026 scope:** V3 totals **excluded** from reactivation until Bobby decides to restore the script or retire the workflow.
- **Cron:** Do not change schedule in Phase 2A/2B; leave workflow off.

---

## Preseason reactivation — still pending

1. **GitHub UI audit** — confirm disabled state; enable `prisma-guardrails` for PR safety
2. **Phase 2B** — season parameterization (2026 defaults) + manual weekly bet sync workflow
3. **Phase 2C** — manual dry-run checklist execution (Week 0/1 when schedules exist)
4. **ETL smoke test** — manual `workflow_dispatch` only; no bulk schedule enable
5. **Odds / schedule ingestion** — CFBD + market lines for 2026 Week 0/1
6. **Grading check** — `grade-bets` after scores verified
7. **Conflict tags** — `sync-hybrid-conflict-tags.ts` remains manual for now
8. **Homepage banner** — update before public preseason (not urgent today)
9. **Stale docs** — `labs/hybrid`, `docs/methodology`, `docs/workflows-guide.md` vs UI-disabled state

See [Preseason Reactivation Checklist](docs/preseason-reactivation-checklist.md).

---

## Next recommended phases

1. **Phase 2B** — Season parameterization + manual weekly bet sync workflow (no nightly bury yet)
2. **Phase 2C** — Execute dry-run checklist on Week 0/1
3. **Preseason ETL reactivation** — staged GitHub UI enables after 2C sign-off

---

## Operator notes

- Weekly pick-processing rules are documented in the project operator files / ChatGPT Project instructions.
- Moneyline overlap is treated as **winner-only** (ignore Kalshi vs American-odds scale mismatch).
- Always include **Near Overlaps** for spreads/totals with drift in `(1.0, 2.0]`.
- Historical odds backfill: **manual only** with `dry_run` / credit limits — do not automate large backfills.

---

## Known doc drift

| Topic | Note |
|-------|------|
| Python ETL | README/jobs README updated; some older docs may still mention Python |
| `prisma/seed.ts` | Referenced in places but may be missing — use `npm run seed:ratings` |
| `/api/seed-slate` | Deprecated for homepage; still exists for legacy callers |
| `docs/workflows-guide.md` | Still recommends auto-enabled workflows; conflicts with offseason disable policy |
| Deleted workflows in docs | `monitor-2025-archival.yml`, `odds-poll-3x.yml`, etc. no longer in YAML |

---

## Quick links

- [2026 Betting Playbook](docs/2026-betting-playbook.md)
- [Preseason Reactivation Checklist](docs/preseason-reactivation-checklist.md)
- [Workflow disable report](WORKFLOW_DISABLE_REPORT.md)
- [Bowl & postseason ops](docs/bowl-postseason-ops.md)
