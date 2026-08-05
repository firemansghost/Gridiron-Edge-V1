# Preseason Reactivation Checklist

Operator checklist for **manual** preseason workflow reactivation. Do not bulk-enable scheduled workflows until each section passes.

Complements `SEASON_STATUS.md` and `WORKFLOW_DISABLE_REPORT.md`.

---

## Before you start

- [ ] Read `SEASON_STATUS.md` P0 blockers — bulk reactivation is **not** ready until Phase 2C-1+
- [ ] Confirm target season is **2026** (`TARGET_SEASON` repo variable recommended — see [preseason-season-parameterization.md](preseason-season-parameterization.md))
- [ ] Leave `v3-totals-nightly.yml` **disabled** (`sync-v3-bets.ts` is missing)
- [ ] Keep historical odds backfill **manual only** with `dry_run` and credit limits
- [x] Context (2026-08-04): Week Zero **2026-08-27**; public schedules exist; production DB had **zero 2026 rows** before write phase (re-verify before 2C-1B)

---

## A. GitHub UI and CI safety

- [ ] Open GitHub → Actions → confirm which workflows are disabled vs enabled
- [ ] Confirm **all ETL schedules remain disabled** during prep (intentional offseason disable)
- [ ] If `prisma-guardrails` is disabled, **re-enable it** for PR schema safety (no DB writes)
- [ ] Document UI state (screenshot or list) for the season log

---

## B. Secrets (names only — do not paste values)

Confirm these exist in GitHub Secrets / local `.env` for dry runs. Treat **provider dashboard keys as authoritative** — update GitHub secrets if unsure the stored Odds key matches the upgraded plan.

- [ ] `DATABASE_URL`
- [ ] `DIRECT_URL`
- [ ] `CFBD_API_KEY` (dashboard key → GitHub secret)
- [ ] `ODDS_API_KEY` (dashboard key → GitHub secret; 20k credits/mo plan)
- [ ] `SGO_API_KEY` (if using SGO fallback)
- [ ] `VISUALCROSSING_API_KEY` (optional weather)

**Safety:** Production-connected CFBD workflows **fail closed** if `CFBD_API_KEY` is missing (no automatic mock schedules). Mock tooling remains for deliberate local/test use only.

**Do not** paste keys into Cursor/chat. Update secrets only in GitHub Settings → Secrets and variables → Actions (or local `.env` privately).

---

## B2. Provider validation (read-only — Phase 2C-0) — PASSED 2026-08-04

**Manual only.** Workflow: `Validate Preseason Providers (Manual)` → `.github/workflows/validate-preseason-providers.yml`

- Trigger: **`workflow_dispatch` only** (no schedule / push / PR)
- Secrets: `CFBD_API_KEY`, `ODDS_API_KEY` only — **no database credentials**

### Results (2026-08-04)

| Run | Result |
|-----|--------|
| Default `probe_odds=false` | CFBD HTTP 200; **1,638** season-2026 games; earliest **2026-08-27**; latest **2026-12-12**; NCAAF active; `x-requests-last=0` |
| Optional `probe_odds=true` | HTTP 200; **126** events; `x-requests-last=3`; remaining **19,713** |

- [x] Update GitHub Secrets `ODDS_API_KEY` and `CFBD_API_KEY` from provider dashboards
- [x] Run GitHub Actions workflow with `probe_odds=false`
- [x] Confirm CFBD 2026 games; NCAAF active; no secrets in logs; Odds usage 0
- [x] Optional `probe_odds=true`; `x-requests-last=3`
- [x] Phase 2C-0 gate **PASSED**

**Production ingest:** `nightly-ingest` / `bowl-week-bootstrap` **fail closed** if `CFBD_API_KEY` is missing (no automatic mock schedules).

---

## C. 2026 season strategy

- [ ] Use manual `workflow_dispatch` with `season=2026` until Phase 2D scheduled-path update
- [ ] Confirm `games` table will have **2026** schedule rows before relying on `get-current-week.mjs`
- [ ] Plan homepage Season Update banner update before public preseason

---

## D. Schedule ingest — Phase 2C-1A / 2C-1A2 / 2C-1B

| Phase | Status |
|-------|--------|
| **2C-1A audit** | **Stopped safely** — monolithic `ingest.js cfbd` not approved (ratings side-effect) |
| **2C-1A2 isolated path** | **Prepared** — schedule-only module/CLI + read-only preview workflow |
| **2C-1B production write** | **Not yet approved** (write workflow not created) |
| **Odds ingestion** | **Not yet approved** |
| **Nightly reactivation** | **Not yet approved** |

**Do not** use `node apps/jobs/dist/ingest.js cfbd ...` for 2026 schedule-only work.

### Isolated schedule-only tools

| Tool | Purpose |
|------|---------|
| `apps/jobs/ingest-schedules.ts` | **Preview-only** (`--preview` required; writes disabled until 2C-1B) |
| `scripts/preview-cfbd-schedules.ts` | Always forces `--preview` |
| `Preview 2026 CFBD Schedules (Manual, Read Only)` | GitHub `workflow_dispatch` only; command includes `--preview` |

Team stubs are **prohibited** (fail closed). Aliases come only from existing `team_aliases_cfbd.yml`.

**Read-only boundary (accurate claim):** The preview workflow uses the existing production `DIRECT_URL` secret for Prisma queries. That credential is **not** a database-level read-only account. Read-only behavior is enforced by: (1) preview-only executable, (2) `ReadOnlyScheduleStore` query-only interface, (3) runtime hostile-mutation tests, (4) static workflow checks. No production schedule-write workflow exists; Phase 2C-1B remains unapproved.

Kickoffs must include explicit `Z` or a numeric UTC offset; timezone-less provider values are rejected.

### First live step (after merge / operator approval — not this coding phase)

1. Run preview workflow: season **2026**, week **0** (~2 CFBD calls) — review raw + normalized UTC kickoffs
2. Review counts, dates, team resolution, DB comparison
3. Run preview: season **2026**, week **1**
4. Decide whether CFBD Week Zero is week `0` or `1`
5. **Stop** before any production write

- [ ] Preview week 0 reviewed
- [ ] Preview week 1 reviewed
- [ ] Week Zero mapping confirmed
- [ ] Production write workflow created only after separate 2C-1B approval
- [ ] Odds / ratings / bets remain **out of scope** until separately approved

---

## E. Slate API verification (dual-model)

With dev server or deployed preview (read-only API calls):

- [ ] `GET /api/weeks/slate?season=2026&week=N&model=hybrid_v2` returns `{ games, meta }`
- [ ] `meta.activeModel` is `hybrid_v2`
- [ ] `GET /api/weeks/slate?season=2026&week=N&model=core_v1` returns Core V1 spread scope
- [ ] Homepage and `/picks` load with Hybrid V2 default; Core V1 selector works
- [ ] Confirm homepage does **not** call `/api/seed-slate`

Local verification scripts (after Phase 2A) use `normalizeSlateApiResponse()` for both legacy array and wrapped responses.

---

## F. Bet sync (manual dry run)

Graded bet rows are **not** in `nightly-ingest`. Use the manual workflow or local scripts after ratings/lines exist:

**GitHub Actions (recommended):** `Sync Weekly Bets (Manual)` — `.github/workflows/sync-weekly-bets.yml`

- Inputs: `season` (default `2026`), `week` (required)
- Syncs `hybrid_v2` and `official_flat_100` only
- **workflow_dispatch only** — workflow must stay disabled in UI until dry-run approval, then run manually via "Run workflow"

**Local alternative:**

```bash
npx tsx apps/web/scripts/sync-hybrid-bets.ts 2026 <week>
npx tsx apps/web/scripts/sync-official-picks-to-bets.ts 2026 <week>
```

- [ ] Verify `bets` rows with `strategyTag = hybrid_v2`
- [ ] Verify `bets` rows with `strategyTag = official_flat_100`

---

## G. Scores and grading (manual dry run)

After games are final for a test week:

- [ ] Manual `cfbd-scores-sync` dispatch for 2026 week (do not enable schedule yet)
- [ ] Verify game scores/status in DB
- [ ] Manual `grade-bets` dispatch **without** `--force` first
- [ ] Verify bet results and PnL for sample rows
- [ ] Conflict tags: run `sync-hybrid-conflict-tags.ts` manually if needed (automation deferred)

---

## H. Review surfaces

- [ ] `/weeks/review` defaults to Hybrid V2 strategy
- [ ] `/season-review` defaults to Hybrid V2
- [ ] Week drill-down preserves selected strategy
- [ ] Game detail: Hybrid V2 primary, Core V1 comparison, Core V1 Card graded bet

---

## I. Staged workflow re-enable (after all dry runs pass)

Only after Phase 2B season defaults and Phase 2C sign-off:

1. `stats-season-cfbd` + `stats-advanced-cfbd` (nightly)
2. `nightly-ingest` (nightly)
3. `cfbd-scores-sync` (game days)
4. `grade-bets` (after scores)
5. `cfbd-rankings-sync` (Mondays in-season)

**Never enable in 2026 prep:**

- `v3-totals-nightly.yml` (blocked — missing script)

---

## Rollback plan

If a workflow writes bad data:

1. **Disable the workflow immediately** in GitHub UI (Settings → Actions → Disable workflow)
2. Do not use `--force` on grade or scores until root cause is understood
3. Document season/week affected in operator log
4. Fix data manually or re-run targeted sync with correct inputs — only after approval

---

## Related docs

- [Season Status](../SEASON_STATUS.md)
- [Season Parameterization Plan](preseason-season-parameterization.md)
- [Workflow Disable Report](../WORKFLOW_DISABLE_REPORT.md)
- [2026 Betting Playbook](2026-betting-playbook.md)
