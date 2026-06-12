# Season Status — Gridiron Edge

_Last updated: June 2026 (2026 preseason preparation)_

Operator-facing status for offseason/preseason work. Complements `WORKFLOW_DISABLE_REPORT.md` and `docs/2026-betting-playbook.md`.

---

## Current mode

| Item | Status |
|------|--------|
| **Calendar context** | 2026 preseason prep (post–2025 bowl/offseason) |
| **Production app** | Deployed; Season Update banner reflects Dec 2025 wrap |
| **GitHub Actions** | **All workflows disabled in GitHub UI** (Bobby confirmation, Dec 2025) |
| **Workflow YAML** | Schedules still present in `.github/workflows/` — disablement is **UI state**, not encoded in YAML |
| **Branch (dual-model)** | `feat/dual-model-labels-preservation-tests` — not merged to `main` yet |

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

## What changed on dual-model branch

| Phase | Summary |
|-------|---------|
| A1+B | Production model config, corrected strategy labels, preservation tests |
| C | `ProductionModelContext`, selector plumbing, URL/localStorage preference |
| D | `/api/weeks/slate?model=hybrid_v2\|core_v1`; homepage/picks default Hybrid V2 |
| E | Week Review + Season Review default `hybrid_v2` |
| F | Game detail labels — Hybrid primary, no misleading Labs/auto-bet copy |
| G | This file + playbook/doc alignment |

---

## What has NOT changed

- Model math, coefficients, ratings, edge, grading, CLV, backtest assumptions
- Database schema / migrations
- GitHub Actions workflow files or cron schedules (YAML unchanged)
- Sync scripts (`sync-hybrid-bets.ts`, `sync-official-picks-to-bets.ts`, etc.)
- ETL job implementations under `apps/jobs/src`
- Workflow enablement (still off in GitHub UI)

---

## Preseason reactivation — still pending

Do **not** re-enable workflows until explicit review:

1. **Workflow audit** — reconcile `WORKFLOW_DISABLE_REPORT.md` with 2026 schedule needs
2. **ETL smoke test** — manual ingest/ratings run against staging or controlled window
3. **Odds / schedule ingestion** — verify CFBD + market line paths for Week 0/1
4. **Grading check** — `grade-bets` workflow + bet result integrity
5. **V3 totals script** — `sync-v3-bets.ts` referenced by workflow but may be missing; investigate before totals workflow reactivation
6. **Slate API consumers** — scripts expecting bare array from `/api/weeks/slate` should use `normalizeSlateApiResponse()` or read `{ games, meta }`
7. **Dual-model smoke** — homepage, picks, review pages, game detail with both models

---

## Next recommended phases

1. **Phase H** — Build/typecheck smoke + manual dual-model checklist on preview deploy
2. **Phase 2 (audit)** — Offseason/workflow reactivation audit with GitHub UI confirmation
3. **Merge dual-model branch** — after Phase H sign-off; then preseason ETL reactivation

---

## Known doc drift (partially addressed in Phase G)

| Topic | Note |
|-------|------|
| Python ETL | README/jobs README updated; some older docs may still mention Python |
| `prisma/seed.ts` | Referenced in places but may be missing — use `npm run seed:ratings` |
| `/api/seed-slate` | Deprecated for homepage; still exists for legacy callers |

---

## Quick links

- [2026 Betting Playbook](docs/2026-betting-playbook.md)
- [Workflow disable report](WORKFLOW_DISABLE_REPORT.md)
- [Bowl & postseason ops](docs/bowl-postseason-ops.md)
