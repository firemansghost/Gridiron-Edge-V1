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

## D. Schedule ingest — Phase 2C-1A … 2C-2D

| Phase | Status |
|-------|--------|
| **2C-1A audit** | **Stopped safely** — monolithic `ingest.js cfbd` not approved |
| **2C-1A2 preview** | **PASSED** (live weeks 0/1/2; PR #37) |
| **2C-1B write** | **Merged (PR #38)** — Weeks **1–13** and **15** written |
| **2C-1C inventory audit** | **PASSED** (PR #39) — **761** rows / **138** teams verified |
| **2C-2A ratings readiness** | **Rerun structural OK** after 2C-2B — talent/commits still 0/138; `ratingsWriteAuthorized=false` |
| **2C-2B FBS membership** | **PASSED** (PR #41) — **138/138** membership ↔ schedule |
| **2C-2C ratings-input preview** | **Executed** (PR #42) — `/talent` 0 rows; recruiting schema mismatch; conference diagnostics corrected in 2C-2H-1 |
| **2C-2G-4 Core V1 conferences** | **PASSED** (PR #51) — production audit 138/138; legacyFallback=false |
| **2C-2H-1 readiness diagnostics** | **PASSED** (PR #52) — Aug 27 talent probe structurally complete |
| **2C-2H-2 guarded talent init** | **PASSED** (PR #53) — production COMMIT 138/138; ratings still unauthorized |
| **2C-2H-3 Core V1 ratings preview** | **PASSED** (PR #54) — production read-only; 138 finite; zero writes; persist NOT AUTHORIZED |
| **2C-2H-4 V1 historical parity forensic** | **PASSED structurally (PR #55)** — legacy Core V1 did not reproduce persisted 2025 (`exact=0/136`, MAE≈32.21) |
| **2C-2H-5 Balanced V1 historical parity** | **PASSED — EXACT (PR #56)** — cutoff Balanced replay matched persisted 2025 V1 136/136 |
| **2C-2H-6 Balanced V1 preseason bridge eval** | **PASSED (PR #57)** — Candidate A provisional preferred; Candidate B rejected; persistence unauthorized |
| **2C-2H-7 Balanced V1 transition timing** | **In preparation (draft)** — 2025 weekly coverage/transition study; no policy authorized |
| **Ratings computation / persistence** | **Not yet approved** — **2026 ratings persistence remains NOT AUTHORIZED** |
| **Odds ingestion** | **Not yet approved** |
| **Nightly reactivation** | **Not yet approved** |

**Do not** use `node apps/jobs/dist/ingest.js cfbd ...` for 2026 schedule-only work.

### Live preview results

| Week | Outcome | Notes |
|------|---------|-------|
| **0** | Failed safely | Full-season leak; no provider week 0; **0** writes |
| **1** | Passed | 211 provider → **51** FBS; Aug 27–Sep 7; unresolved **0**; DB **0** |
| **2** | Passed | 134 provider → **49** FBS; Sep 11–13; unresolved **0**; DB **0** |

**Mapping:** CFBD provider week **1** is the first production schedule bucket.

### Tools

| Tool | Purpose |
|------|---------|
| Preview CLI / workflow | Read-only (`--preview` required) |
| `apps/jobs/write-schedules.ts` | One-week write — `--confirm-write WRITE_2026_WEEK_<n>` |
| `Ingest 2026 CFBD Schedules (Manual, One Week)` | `workflow_dispatch` only; week 0 prohibited |
| `apps/jobs/audit-schedule-inventory.ts` | Full-season read-only inventory audit |
| `Audit 2026 Schedule Inventory (Manual, Read Only)` | `workflow_dispatch` only; season `2026` |
| `apps/jobs/audit-ratings-readiness.ts` | Read-only ratings-input readiness audit |
| `Audit 2026 Ratings Readiness (Manual, Read Only)` | `workflow_dispatch` only; season `2026` |
| `apps/jobs/preview-fbs-membership.ts` | Read-only 2026 FBS membership candidate preview |
| `apps/jobs/write-fbs-membership.ts` | Guarded insert — `--confirm-write WRITE_2026_FBS_MEMBERSHIP` |
| `Preview 2026 FBS Membership (Manual, Read Only)` | Membership preview workflow |
| `Initialize 2026 FBS Membership (Manual, Guarded)` | Membership write workflow |
| `apps/jobs/preview-2026-ratings-inputs.ts` | Read-only CFBD talent + recruiting preview |
| `apps/jobs/probe-2026-talent-availability.ts` | One-call CFBD `/talent` availability probe |
| `Probe 2026 Talent Availability (Manual, Read Only)` | `workflow_dispatch` only; season `2026`; budget 1 |
| `apps/jobs/initialize-2026-team-talent.ts` | Guarded one-time 2026 talentComposite initializer |
| `Initialize 2026 Team Talent (Guarded)` | Manual PREVIEW/COMMIT; confirm `WRITE_2026_TALENT` |
| `apps/jobs/preview-2026-core-v1-ratings.ts` | Read-only in-memory Core V1 ratings preview (no persist) |
| `Preview 2026 Core V1 Ratings (Manual, Read Only)` | `workflow_dispatch` only; season `2026`; `DIRECT_URL` only |
| `apps/jobs/audit-v1-historical-parity.ts` | Read-only 2025 Core V1 (legacy) replay vs persisted parity forensic |
| `Audit Core V1 Historical Parity (Manual, Read Only)` | `workflow_dispatch` only; `comparison_season=2025`; `DIRECT_URL` only |
| `apps/jobs/audit-balanced-v1-historical-parity.ts` | Read-only 2025 Balanced V1 replay vs persisted parity forensic |
| `Audit Balanced V1 Historical Parity (Manual, Read Only)` | `workflow_dispatch` only; `comparison_season=2025`; `DIRECT_URL` only |
| `apps/jobs/evaluate-balanced-v1-preseason-bridge.ts` | Read-only 2026 Balanced V1 preseason Candidates A/B diagnostic |
| `Evaluate 2026 Balanced V1 Preseason Bridge (Manual, Read Only)` | `workflow_dispatch` only; `season=2026`; `DIRECT_URL` only |
| `apps/jobs/evaluate-balanced-v1-transition-timing.ts` | Read-only 2025 Balanced V1 transition timing study |
| `Evaluate Balanced V1 Transition Timing (Manual, Read Only)` | `workflow_dispatch` only; `study_season=2025`; `DIRECT_URL` only |
| `Preview 2026 Ratings Inputs (Manual, Read Only)` | Provider preview workflow (`season=2026`) |
| `apps/jobs/diagnose-2026-conference-recruiting.ts` | Read-only `/teams/fbs` + recruiting resolver diagnostic (`providerFbsSetExact` / `recruitingResolverSafe`) |
| `Diagnose 2026 Conference & Recruiting Mapping (Manual, Read Only)` | Diagnostic workflow (`season=2026`) |
| `apps/jobs/preview-2026-season-conferences.ts` | Read-only would-be season conference rows (`TeamMembership.conference` candidate) |
| `Preview 2026 Season Conferences (Manual, Read Only)` | Conference persistence preview (`season=2026`; 1 CFBD call) |

### Production status notes

* Schedule verified: **761** / **138** teams; Week 14 absent
* Membership **PASSED**: **138/138** FBS ↔ schedule
* 2C-2A rerun: `structuralOk=true`; talent/commits **0/138**; unit grades **0/138** (expected preseason for grades/stats)
* 2C-2C production: `/talent` **0** rows; recruiting schema mismatch
* 2C-2D/2E: provider FBS+conference **138/138 safe**; recruitingResolverSafe=true; static Team.conference still unsafe
* 2C-2F production: conference candidate **138/138** `writeEligible=true` (classification); **92** static semantic diffs; no schema write
* 2C-2G-1: Prisma Migrate hardened and **merged** (PR #46) — manual-only; no production migrate from Run 31219442075 (that run was Schema Guardrails)
* 2C-2G-1B: Schema Guardrails repaired and **merged** (PR #47) — live base-SHA comparison verified
* 2C-2G-2: **PASSED** — PR #48 + production migrate; `TeamMembership.conference` text/nullable
* 2C-2G-2 discovery: production migration table lists `20251009001406_init` and `20250101_add_game_snapshots` not found in repo — do not auto-repair
* 2C-2G-2B: history-divergence fail-closed **merged** (PR #49)
* 2C-2G-3: **PASSED** — production COMMIT 138/138 populated, 0 NULL, verificationExact=true; do not rerun
* 2C-2G-4: **PASSED** (PR #51) — production Core V1 audit 138/138; missing=0; unrecognized=0; legacyFallback=false
* 2C-2H-1: **PASSED** (PR #52) — season-aware diagnostics; Aug 27 probe: `/talent` 138/138 structurally complete; persistence still unauthorized
* 2C-2H-2: **PASSED** (PR #53) — production COMMIT 138 rows; `transactionVerificationExact=true`; `postCommitExactTeamSet=true`; `talentCompositeMatchesCandidate=138/138`; no ratings/Odds
* Latest readiness audit: `structuralOk=true`; preseason; talent 138/138; commits 0/138; stats empty expected; unit grades 0/138; no output collisions; ratings still unauthorized
* 2C-2H-3: **PASSED** (PR #54) — production read-only preview: 138 finite in-memory ratings; talent-only 138; powerRating ≈ -44.15…59.60; `zeroConfidenceCount=138`; **zero writes/providers/Odds**
* **2026 ratings persistence remains NOT AUTHORIZED**
* 2C-2H-4: **PASSED structurally (PR #55)** — forensic valid; legacy `compute_ratings_v1` did **not** reproduce persisted 2025 (`exact=0/136`, MAE≈32.2124)
* 2C-2H-5: **PASSED — EXACT (PR #56)** — unrestricted MAE≈0.972 was snapshot drift; cutoff Nov 24 2025 Balanced replay matched **136/136** (MAE≈2.3e-15); **production Core V1 = Balanced V1**; legacy `compute_ratings_v1` not canonical
* 2C-2H-6: **PASSED (PR #57)** — Candidate A provisional preferred (2025 MAE=7.8831; 2026 range=20.8895; p95=10.1282); Candidate B rejected (2026 range=83.5581; p95=40.5127); `preseasonBridgeAuthorized=false`
* 2C-2H-7: **IN PREPARATION / draft PR** — read-only 2025 transition timing (weekly coverage + Candidate A→canonical deltas); `hardSwitchWeekCandidate=INCONCLUSIVE`; chronology + pure-preseason fail-closed; `transitionPolicyAuthorized=false`
* Recruiting schema mismatch remains separate
* **Do not persist ratings until separately authorized**
* **Do not run the production transition timing workflow until the draft PR is independently reviewed**
* **Do not run `compute_ratings_balanced.ts` or legacy `compute_ratings_v1` for 2026**

##### After 2C-2H-7 merges — operator procedure
1. Independently review draft PR (coverage milestones + transition deltas; no buried policy authorization)
2. Only then run **Evaluate Balanced V1 Transition Timing (Manual, Read Only)**
3. Treat all weekly metrics as manual evidence only — `hardSwitchWeekCandidate` is always `INCONCLUSIVE` in this phase; do not authorize P1/P2/P3 from coverage alone
4. Ratings persistence and bridge/transition authorization remain unauthorized

- [x] Preview week 0–2 reviewed
- [x] Week 1–13 + 15 production writes
- [x] 2C-1C inventory audit PASSED (761)
- [x] 2C-2B membership PASSED (138)
- [x] 2C-2A ratings readiness rerun (`structuralOk=true`)
- [x] 2C-2C ratings-input provider preview (production)
- [x] 2C-2D conference + recruiting diagnostic (production)
- [x] 2C-2E CFBD resolver hardening + diagnostic rerun PASSED
- [x] 2C-2F season conference design + read-only preview PASSED
- [x] 2C-2G-1 Prisma migrate workflow hardening PASSED
- [x] 2C-2G-1B Prisma Schema Guardrails repair PASSED
- [x] 2C-2G-2 TeamMembership.conference schema + production migrate PASSED
- [x] 2C-2G-2B migrate history-divergence fail-closed PASSED
- [x] 2C-2G-3 guarded 138-row conference population PASSED
- [x] 2C-2G-4 Core V1 season-aware conference source PASSED
- [x] 2C-2H-1 ratings readiness diagnostic alignment + talent probe PASSED
- [x] 2C-2H-2 guarded 2026 team talent initializer PASSED (production COMMIT)
- [x] 2C-2H-3 read-only Core V1 ratings preview PASSED (production; zero writes)
- [x] 2C-2H-4 Core V1 historical parity forensic PASSED structurally (legacy did not reproduce)
- [x] 2C-2H-5 Balanced V1 historical parity PASSED EXACT (PR #56)
- [x] 2C-2H-6 Balanced V1 preseason bridge evaluation PASSED (Candidate A provisional; B rejected)
- [ ] 2C-2H-7 Balanced V1 transition timing evaluation (draft)
- [ ] Odds / ratings persist / bets remain **out of scope** until separately approved

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
