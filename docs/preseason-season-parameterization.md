# Preseason Season Parameterization Plan

Phase 2B / 2B-R design doc. **No scheduled workflows re-enabled.** Cron schedules unchanged.

_Last reviewed: 2026-08-04 (Week Zero 2026-08-27)._

---

## Recommended strategy: **Option B + Option C (hybrid)**

| Approach | Use for |
|----------|---------|
| **GitHub repo variable `TARGET_SEASON`** (default `2026`) | Single obvious default for scheduled workflow shell steps |
| **Manual `workflow_dispatch` inputs** | Preseason dry runs until schedules are re-enabled |
| **Defer dynamic season resolver** | Do not use date-based or `get-current-week` for season in YAML yet |

**Why not Option A alone (hardcode 2026 everywhere):** Requires another edit in 2027; scattered literals are error-prone.

**Why not Option D (dynamic):** `get-current-week.mjs` resolves **week** from DB, not season; adding clever logic increases preseason risk.

**Rollout order:**

1. **Phase 2B (done / 2B-R):** Manual bet sync workflow; dispatch defaults → 2026; fail-closed CFBD; provider validation workflow.
2. **Phase 2C-0:** Provider validation (manual) — must pass before ingest.
3. **Phase 2C-1:** Schedule-only CFBD ingest for 2026.
4. **Phase 2D (future):** Replace hardcoded `2025` in **scheduled** paths with `${{ vars.TARGET_SEASON || '2026' }}` — **after** dry-run sign-off, before UI re-enable.

Set `TARGET_SEASON=2026` in GitHub → Settings → Secrets and variables → Actions → Variables (operator task, not encoded in this repo).

---

## Hardcoded `2025` audit

### Must change before scheduled reactivation (scheduled-path risk)

| Location | Issue | Phase |
|----------|-------|-------|
| `nightly-ingest.yml` | All ingest/ratings steps use `--season 2025`; talent SQL checks `season = 2025` | 2D |
| `stats-season-cfbd.yml` | Scheduled branch sets `SEASON="2025"` | 2D |
| `stats-advanced-cfbd.yml` | Scheduled branch sets `SEASON="2025"` | 2D |
| `v3-totals-nightly.yml` | Default `SEASON="2025"` | **Blocked** — workflow excluded |
| `cfbd-scores-sync.yml` | `inputs.season \|\| '2025'` applies to schedule runs too | 2D |
| `cfbd-rankings-sync.yml` | Same fallback pattern | 2D |

### Manual dispatch default only (updated in 2B where noted)

| Workflow | Change in 2B |
|----------|----------------|
| `bowl-week-bootstrap.yml` | Input default → `2026` |
| `sync-weekly-bets.yml` | **New** — default `2026` |
| Other manual workflows | Defaults still `2025` until 2D batch update (low urgency while UI disabled) |

### Safe historical reference (do not change)

| Location | Reason |
|----------|--------|
| `backfill-scores-2025.yml` | One-time 2025 backfill workflow name/purpose |
| `prisma-migrate.yml` | Migration name `20251027_...` |
| Script usage examples in comments (`sync-hybrid-bets.ts 2025 9`) | Documentation examples |
| Diagnostic scripts defaulting to 2025 test week | Historical debugging |

### Doc-only

| Doc | Note |
|-----|------|
| `docs/bowl-postseason-ops.md` | 2025 bowl examples — keep as historical |
| `docs/GITHUB_ACTIONS_RUNBOOK.md` | 2025 backfill examples — update when running 2026 dry runs |

---

## Manual weekly bet sync

**Workflow:** `.github/workflows/sync-weekly-bets.yml`

- `workflow_dispatch` only — **no schedule**
- Inputs: `season` (default `2026`), `week` (required)
- Runs:
  - `sync-hybrid-bets.ts` → `strategyTag = hybrid_v2`
  - `sync-official-picks-to-bets.ts` → `strategyTag = official_flat_100`
- Does **not** run ingest, ratings, V3 totals, V4/Fade V4
- Scripts use upsert — low duplicate risk on re-run
- **No `dry_run` flag** — scripts do not support it; workflow does not fake one

**Alternative:** `bowl-week-bootstrap.yml` still does full week bootstrap + bet sync; use `sync-weekly-bets` when data already exists and only bet rows need refresh.

---

## V3 totals — blocked

- `v3-totals-nightly.yml` references missing `apps/web/scripts/sync-v3-bets.ts`
- **Excluded** from 2026 reactivation
- **Decision pending:** restore script or retire workflow
- Do not re-enable in GitHub UI

---

## Production ingest safety (fail-closed)

- `nightly-ingest.yml` and `bowl-week-bootstrap.yml` **fail** if `CFBD_API_KEY` is missing — they no longer auto-write mock schedules.
- Local `ingest-simple.js mock` remains for deliberate development/test only.
- Cron schedules unchanged; keep ETL workflows UI-disabled until Phase 2D season param + 2C dry runs.

---

## Related docs

- [Season Status](../SEASON_STATUS.md)
- [Preseason Reactivation Checklist](preseason-reactivation-checklist.md)
