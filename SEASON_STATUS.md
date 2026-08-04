# Season Status — Gridiron Edge

**Status:** Offseason / paused for regular-season automation  
**Updated:** 2026-08-04 (Phase 2B-R finalization — fail-closed ingest + provider validation workflow)

Operator-facing status for offseason/preseason work. Complements `WORKFLOW_DISABLE_REPORT.md`, `docs/preseason-reactivation-checklist.md`, and `docs/2026-betting-playbook.md`.

---

## Current mode

| Item | Status |
|------|--------|
| **Calendar context** | **2026-08-04** — Week Zero begins **2026-08-27**; public 2026 schedules exist |
| **Production Supabase** | **Zero 2026 rows** in games, market_lines, ratings, outputs, bets (operator report) |
| **2025 regular season** | Complete |
| **Production app** | Deployed; Season Update banner (Dec 22, 2025) is stale — update before public preseason |
| **Dual-model** | **Merged to `main`** (PR #34); Phase H verification passed |
| **Phase 2A** | **Merged to `main`** (PR #35) |
| **GitHub Actions** | **All workflows disabled in GitHub UI** (Bobby, offseason) — intentional |
| **Workflow YAML** | Schedules still present — disablement is **UI state**, not encoded in YAML |
| **Mock schedule fallback** | **Removed** from production-connected ingest workflows (fail-closed on missing `CFBD_API_KEY`) |
| **Reactivation readiness** | **Not ready** for bulk scheduled reactivation; Phase 2C-1 not started |

---

## Dual-model state (2026)

| Model | Role | DB `strategyTag` | UI label |
|-------|------|------------------|----------|
| **Hybrid V2** | Primary/default **spread** model | `hybrid_v2` | Hybrid V2 (Flat $100) |
| **Core V1** | Comparison / reporting | `official_flat_100` (historical — do not rename) | Core V1 Card (Flat $100) |
| **V4** | Labs only | `v4_labs` | V4 Labs (Flat $100) |
| **Fade V4** | Labs only | `fade_v4_labs` | Fade V4 Labs (Flat $100) |

**Scope notes:** Hybrid V2 = spreads only; totals/ML = current Core V1 logic; weekly `official_flat_100` sync for comparison.

---

## Completed phases

| Phase | Summary |
|-------|---------|
| A1+B–H | Dual-model + verification |
| 2 / 2A | Workflow audit + safety docs (2A merged) |
| 2B / 2B-R | Season param plan, `sync-weekly-bets.yml`, fail-closed ingest, credit docs |
| 2C-0 | Provider validation script + **manual** `validate-preseason-providers.yml` |

---

## Provider validation (manual only)

| Item | Detail |
|------|--------|
| **Workflow** | `.github/workflows/validate-preseason-providers.yml` — **`workflow_dispatch` only** |
| **Automatic runs** | **None** (no schedule / push / PR) |
| **Secrets** | `CFBD_API_KEY`, `ODDS_API_KEY` only — **no** `DATABASE_URL` / `DIRECT_URL` / Prisma |
| **Default run** (`probe_odds=false`) | 1× CFBD 2026 games + 1× Odds `/v4/sports` (**0** Odds credits) |
| **Optional probe** (`probe_odds=true`) | NCAAF odds `h2h,spreads,totals` region `us` — **up to 3** credits; trust `x-requests-*` headers |
| **Zero-event probe** | Valid; typically **0** credits |
| **Before first run** | Update GitHub secrets from provider dashboards (names only; never paste into chat) |

Local CLI:

```bash
npx tsx scripts/validate-preseason-providers.ts
npx tsx scripts/validate-preseason-providers.ts --probe-odds
```

**Do not start Phase 2C-1 schedule ingest until provider validation passes.**

---

## P0 reactivation blockers

| Blocker | Status | Notes |
|---------|--------|-------|
| **Season 2025 hardcoding** | Open | Scheduled paths still 2025 — Phase 2D before UI re-enable |
| **Empty 2026 DB** | Open | Schedule-only ingest = Phase 2C-1 |
| **Provider secrets** | Open | Confirm GitHub keys match dashboards |
| **Weekly bet sync** | Manual workflow ready | `sync-weekly-bets.yml` — dispatch only |
| **V3 totals** | **Blocked** | Missing `sync-v3-bets.ts` — leave disabled |
| **Mock fallback** | **Fixed (2B-R)** | Production ingest fails closed if `CFBD_API_KEY` missing |
| **nightly-ingest** | Keep UI-disabled | Still has 2025 literals + fail-closed CFBD |

### V3 totals — blocked

`v3-totals-nightly.yml` remains disabled. Do not re-enable until script restored or workflow retired.

### Provider quotas (Aug 2026)

| Provider | Plan | Notes |
|----------|------|-------|
| The Odds API | 20,000 credits / month | Dashboard key authoritative |
| CFBD | 30,000 calls / month | PBP available but **out of restart scope** |

---

## Production ingest safety (2B-R)

- `nightly-ingest.yml` and `bowl-week-bootstrap.yml`: **fail closed** if `CFBD_API_KEY` empty — **no automatic mock schedule writes**
- `ingest-simple.js mock` remains for **deliberate local/test** use only
- Cron schedules **unchanged**; workflows remain **UI-disabled**

---

## Next phases

1. Update GitHub secrets → run manual provider validation (`probe_odds=false`, then optional `true`)
2. **Phase 2C-1** — schedule-only 2026 CFBD ingest (after validation passes)
3. **Phase 2C-2+** — odds, ratings, bet sync, scores/grade
4. **Phase 2D** — `TARGET_SEASON` in scheduled YAML before bulk UI enables

See [Preseason Reactivation Checklist](docs/preseason-reactivation-checklist.md).

---

## Quick links

- [Preseason Reactivation Checklist](docs/preseason-reactivation-checklist.md)
- [Preseason Season Parameterization Plan](docs/preseason-season-parameterization.md)
- [2026 Betting Playbook](docs/2026-betting-playbook.md)
- [Workflow disable report](WORKFLOW_DISABLE_REPORT.md)
