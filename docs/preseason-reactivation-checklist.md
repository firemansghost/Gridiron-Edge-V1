# Preseason Reactivation Checklist

Operator checklist for **manual** preseason workflow reactivation. Do not bulk-enable scheduled workflows until each section passes.

Complements `SEASON_STATUS.md` and `WORKFLOW_DISABLE_REPORT.md`.

---

## Before you start

- [ ] Read `SEASON_STATUS.md` P0 blockers — bulk reactivation is **not** ready until Phase 2B/2C complete
- [ ] Confirm target season is **2026** (many workflows still default to 2025 until Phase 2B)
- [ ] Leave `v3-totals-nightly.yml` **disabled** (`sync-v3-bets.ts` is missing)
- [ ] Keep historical odds backfill **manual only** with `dry_run` and credit limits

---

## A. GitHub UI and CI safety

- [ ] Open GitHub → Actions → confirm which workflows are disabled vs enabled
- [ ] Confirm **all ETL schedules remain disabled** during prep
- [ ] If `prisma-guardrails` is disabled, **re-enable it** for PR schema safety (no DB writes)
- [ ] Document UI state (screenshot or list) for the season log

---

## B. Secrets (names only — do not paste values)

Confirm these exist in GitHub Secrets / local `.env` for dry runs:

- [ ] `DATABASE_URL`
- [ ] `DIRECT_URL`
- [ ] `CFBD_API_KEY`
- [ ] `ODDS_API_KEY` (if using Odds API ingest)
- [ ] `SGO_API_KEY` (if using SGO fallback)
- [ ] `VISUALCROSSING_API_KEY` (optional weather)

**Risk:** `nightly-ingest` falls back to **mock schedules** if `CFBD_API_KEY` is missing. Never dry-run ingest without a valid CFBD key unless you intend mock data.

---

## C. 2026 season strategy

- [ ] Decide whether dry runs use `workflow_dispatch` inputs or wait for Phase 2B season defaults
- [ ] Confirm `games` table will have **2026** schedule rows before relying on `get-current-week.mjs`
- [ ] Plan homepage Season Update banner update before public preseason

---

## D. Schedule / odds ingest (manual dry run)

Use **manual** `workflow_dispatch` only (e.g. `bowl-week-bootstrap` pattern or `nightly-ingest` with explicit week input) once 2026 schedules exist:

- [ ] Run schedule ingest for **2026 Week 0 or Week 1**
- [ ] Verify game count in DB for that week
- [ ] Run odds ingest for same week (if keys available)
- [ ] Verify closing lines exist for sample games
- [ ] Rollback if wrong season/week: **disable workflow in GitHub UI**; do not re-run with `force` unless intended

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

Graded bet rows are **not** in `nightly-ingest`. Run manually after ratings/lines exist:

```bash
npx tsx apps/web/scripts/sync-hybrid-bets.ts 2026 <week>
npx tsx apps/web/scripts/sync-official-picks-to-bets.ts 2026 <week>
```

- [ ] Verify `bets` rows with `strategyTag = hybrid_v2`
- [ ] Verify `bets` rows with `strategyTag = official_flat_100`
- [ ] Phase 2B will add a manual-first GitHub workflow for these steps

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
- [Workflow Disable Report](../WORKFLOW_DISABLE_REPORT.md)
- [2026 Betting Playbook](2026-betting-playbook.md)
