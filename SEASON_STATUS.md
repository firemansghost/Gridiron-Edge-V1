# Season Status — Gridiron Edge

**Status:** Offseason / paused for regular-season automation  
**Updated:** 2026-08-05 (Phase 2C-1A2 final hardening — preview-only executable + read-only DB boundary)

Operator-facing status for offseason/preseason work. Complements `WORKFLOW_DISABLE_REPORT.md`, `docs/preseason-reactivation-checklist.md`, and `docs/2026-betting-playbook.md`.

---

## Current mode

| Item | Status |
|------|--------|
| **Calendar context** | **2026-08-04** — Week Zero begins **2026-08-27**; public 2026 schedules exist |
| **Production Supabase** | Had **zero** 2026 schedule rows before 2C-1A prep (re-verify before any write) |
| **2025 regular season** | Complete |
| **Production app** | Deployed; Season Update banner (Dec 22, 2025) is stale — update before public preseason |
| **Dual-model** | **Merged to `main`** (PR #34); Phase H verification passed |
| **Phase 2A** | **Merged to `main`** (PR #35) |
| **Phase 2B-R / 2C-0** | **Merged to `main`** (PR #36) |
| **GitHub Actions** | **All workflows disabled in GitHub UI** (Bobby, offseason) — intentional |
| **Workflow YAML** | Schedules still present — disablement is **UI state**, not encoded in YAML |
| **Mock schedule fallback** | **Removed** from production-connected ingest (fail-closed on missing `CFBD_API_KEY`) |
| **Phase 2C-0 provider validation** | **PASSED** (2026-08-04) |
| **Phase 2C-1A audit** | **Stopped safely** — monolithic `ingest.js cfbd` not approved for schedule-only |
| **Phase 2C-1A2** | **In progress** — isolated schedule-only module + **read-only** preview workflow |
| **Phase 2C-1B production schedule write** | **Not yet approved** |
| **Odds ingestion** | **Not yet approved** |
| **Nightly workflow reactivation** | **Not yet approved** |

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
| 2C-0 | Provider validation — **PASSED** 2026-08-04 (GitHub Actions) |

---

## Provider validation — PASSED (2026-08-04)

Manual GitHub Actions runs using current secrets (no secret values recorded).

### Default (`probe_odds=false`)

| Check | Result |
|-------|--------|
| CFBD HTTP | 200 |
| CFBD games | **1,638** (all season 2026) |
| Earliest start | **2026-08-27** (`2026-08-27T04:00:00.000Z`) |
| Latest start | **2026-12-12** (`2026-12-12T20:00:00.000Z`) |
| Odds `/v4/sports` | HTTP 200; `americanfootball_ncaaf` **active=true** |
| Odds credits | `x-requests-last=0` |
| DB credentials | Not supplied |

### Optional (`probe_odds=true`)

| Check | Result |
|-------|--------|
| Odds probe HTTP | 200 |
| Events | **126** |
| Commence range | `2026-08-29T16:00:00Z` → `2026-11-28T17:00:00Z` |
| Credits | `x-requests-last=3`; used=287; remaining=**19,713** |

**Gate:** Phase 2C-0 provider validation is **PASSED**. Do **not** start Phase 2C-1B until 2C-1A blockers below are resolved and Bobby approves a write.

---

## Phase 2C-1A / 2C-1A2 — schedule path

### 2C-1A initial audit (stopped safely)

Audit of `node apps/jobs/dist/ingest.js cfbd ...` found stop conditions (always runs ratings/`seed-ratings` with hardcoded 2024 behavior; CI week-trim; stub teams). **Monolithic ingest is not approved for schedule-only use.**

### 2C-1A2 isolated path (prepared — preview hardened)

| Artifact | Role |
|----------|------|
| `apps/jobs/src/preseason/cfbd-schedule-ingest.ts` | Pure helpers + future write helper (not executable) |
| `apps/jobs/ingest-schedules.ts` | **Preview-only** CLI (`--preview` required) |
| `scripts/preview-cfbd-schedules.ts` | Forces preview; never exports write helpers |
| `.github/workflows/preview-2026-schedules.yml` | Manual **read-only** preview (`workflow_dispatch` only) |

**Guarantees of the new path:**

- Executable surface is **preview-only** — omitting `--preview` exits nonzero; no env var or flag can enable writes
- Does **not** import or call ratings / `seed-ratings` / odds / weather / injuries / bets / scores / PBP / mock
- **No team stubs** / no automatic `Independent` fallback — missing/ambiguous/conflicting teams → nonzero, zero writes
- Reuses existing `apps/jobs/config/team_aliases_cfbd.yml` only
- Singular `--week` only (allows `0`); never inspects `GITHUB_ACTIONS`
- Kickoffs require **explicit** `Z` or numeric UTC offset; timezone-less strings are rejected (no silent UTC/local assumption)
- Preview uses `ReadOnlyScheduleStore` (query methods only). Workflow still supplies `DIRECT_URL` for Prisma connectivity — **that credential is not a database-level read-only role**; read-only behavior is application-enforced (preview-only CLI + narrow interface + hostile mutation tests + static workflow checks)
- Internal `writeValidatedScheduleBatch` remains for future 2C-1B unit tests only (requires `$transaction`); **not** reachable from CLI, preview script, package scripts, or workflows
- **No production schedule-write workflow** exists; Phase 2C-1B remains unapproved
- Action runtime: `checkout@v6` / `setup-node@v6` with project Node **20**

**Still out of scope:** odds ingestion; ratings; nightly reactivation; production schedule write.

---

## P0 reactivation blockers

| Blocker | Status | Notes |
|---------|--------|-------|
| **Schedule-only CLI** | **Prepared (2C-1A2)** | Isolated path ready; live preview not run yet |
| **Week Zero mapping** | Open | Confirm via read-only preview week 0 then week 1 |
| **Production write workflow** | **Not created** | Await preview review + 2C-1B approval |
| **Season 2025 hardcoding** | Open | Scheduled paths still 2025 — Phase 2D before UI re-enable |
| **Empty 2026 DB** | Open | Schedule write = Phase 2C-1B after preview |
| **Provider secrets** | **Validated** | GitHub secrets worked 2026-08-04 |
| **Weekly bet sync** | Manual workflow ready | `sync-weekly-bets.yml` — dispatch only |
| **V3 totals** | **Blocked** | Missing `sync-v3-bets.ts` — leave disabled |
| **Mock fallback** | **Fixed (2B-R)** | Production ingest fails closed if `CFBD_API_KEY` missing |
| **nightly-ingest** | Keep UI-disabled | Still has 2025 literals + fail-closed CFBD |

### V3 totals — blocked

`v3-totals-nightly.yml` remains disabled. Do not re-enable until script restored or workflow retired.

### Provider quotas (Aug 2026)

| Provider | Plan | Notes |
|----------|------|-------|
| The Odds API | 20,000 credits / month | After probe: **19,713** remaining |
| CFBD | 30,000 calls / month | PBP available but **out of restart scope** |

---

## Production ingest safety (2B-R)

- `nightly-ingest.yml` and `bowl-week-bootstrap.yml`: **fail closed** if `CFBD_API_KEY` empty — **no automatic mock schedule writes**
- `ingest-simple.js mock` remains for **deliberate local/test** use only
- Cron schedules **unchanged**; workflows remain **UI-disabled**

---

## Next phases

1. **Run read-only preview** (`preview-2026-schedules.yml`) for season 2026 week `0`, then week `1` — confirm Week Zero
2. Review team-resolution + integrity; stop on failures
3. **Phase 2C-1B** — approved production schedule write (after write workflow is separately created)
4. **Phase 2C-2+** — odds, ratings, bet sync (separate approvals)
5. **Phase 2D** — `TARGET_SEASON` in scheduled YAML before bulk UI enables

See [Preseason Reactivation Checklist](docs/preseason-reactivation-checklist.md).

---

## Quick links

- [Preseason Reactivation Checklist](docs/preseason-reactivation-checklist.md)
- [Preseason Season Parameterization](docs/preseason-season-parameterization.md)
- [2026 Betting Playbook](docs/2026-betting-playbook.md)
- [Workflow Disable Report](WORKFLOW_DISABLE_REPORT.md)
