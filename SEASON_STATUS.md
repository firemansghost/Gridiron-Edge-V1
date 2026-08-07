# Season Status — Gridiron Edge

**Status:** Offseason / paused for regular-season automation  
**Updated:** 2026-08-07 (Phase 2C-2F — season conference design + read-only preview; 2C-2E production PASSED)

Operator-facing status for offseason/preseason work. Complements `WORKFLOW_DISABLE_REPORT.md`, `docs/preseason-reactivation-checklist.md`, and `docs/2026-betting-playbook.md`.

---

## Current mode

| Item | Status |
|------|--------|
| **Calendar context** | **2026-08-04** — Week Zero begins **2026-08-27**; public 2026 schedules exist |
| **Production Supabase** | **761** schedule + **138** 2026 FBS membership verified; talent/commits still **0/138** |
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
| **Phase 2C-1A2** | **Merged (PR #37)** — preview-only pathway live-validated |
| **Phase 2C-1A2 preview validation** | **PASSED** (weeks 0/1/2 reviewed) |
| **Phase 2C-1B production schedule write** | **Merged (PR #38)** — Weeks **1–13** and **15** written via guarded workflow |
| **Phase 2C-1C inventory audit** | **PASSED** (PR #39) — **761** verified rows |
| **Phase 2C-2A ratings readiness audit** | **Rerun PASSED structural** after 2C-2B — talent/commits still 0/138; `ratingsWriteAuthorized=false` |
| **Phase 2C-2B FBS membership init** | **PASSED** (PR #41) — **138/138** membership ↔ schedule |
| **Phase 2C-2C ratings-input provider preview** | **Executed** (PR #42) — `/talent` **0** rows; recruiting 221 raw / 136 unique FBS; schema mismatch; conference unsafe |
| **Phase 2C-2D conference + recruiting diagnostic** | **PASSED** (PR #43) — initial run found resolver gaps; post-2C-2E rerun exact |
| **Phase 2C-2E CFBD resolver hardening** | **PASSED** (PR #44) — 138/138 provider FBS + conference map safe; recruitingResolverSafe=true |
| **Phase 2C-2F season conference design** | **In preparation** — architecture + read-only persistence preview (no schema write) |
| **Expected 2026 schedule baseline** | **761** games / **138** distinct teams — **verified** |
| **Ratings computation / persistence** | **Not yet approved** (`ratingsWriteAuthorized=false`) |
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

**Gate:** Phase 2C-0 provider validation is **PASSED**. Phase 2C-1A2 live previews are **PASSED**. First proposed production write: season **2026**, provider week **1** only (after 2C-1B approval).

---

## Phase 2C-1A2 live preview results (PASSED)

### Week 0 preview — failed safely (no writes)

* CFBD returned the full **1,638**-game season rather than a Week 0 slice
* Distinct provider weeks: 1–13 and 15 — **no provider week 0**
* Normalized batch: **0** → `empty_batch` fail-closed
* **Conclusion:** CFBD does **not** expose 2026 Week Zero as provider week `0`

### Week 1 preview — succeeded (no writes)

* Provider rows: **211**; distinct weeks: `[1]`
* Kickoff range: **2026-08-27** → **2026-09-07**
* FBS-vs-FBS normalized: **51**; unresolved teams: **0**
* Existing DB rows: **0**; proposed inserts: **51**; updates: **0**
* **Conclusion:** Provider week **1** is the first production schedule bucket (includes calendar “Week Zero” openers)

### Week 2 preview — succeeded (no writes)

* Provider rows: **134**; distinct weeks: `[2]`
* Kickoff range: **2026-09-11** → **2026-09-13**
* FBS-vs-FBS normalized: **49**; unresolved teams: **0**
* Existing DB rows: **0**; proposed inserts: **49**
* **Conclusion:** Week 1 / Week 2 boundary is clean and non-overlapping

---

## Phase 2C-1A / 2C-1A2 / 2C-1B — schedule path

### 2C-1A initial audit (stopped safely)

Audit of `node apps/jobs/dist/ingest.js cfbd ...` found stop conditions (always runs ratings/`seed-ratings` with hardcoded 2024 behavior; CI week-trim; stub teams). **Monolithic ingest is not approved for schedule-only use.**

### 2C-1A2 isolated preview (merged — live-validated)

| Artifact | Role |
|----------|------|
| `apps/jobs/ingest-schedules.ts` | **Preview-only** CLI (`--preview` required) |
| `scripts/preview-cfbd-schedules.ts` | Forces preview |
| `.github/workflows/preview-2026-schedules.yml` | Manual read-only preview |

### 2C-1B guarded one-week write (merged — PR #38)

| Artifact | Role |
|----------|------|
| `apps/jobs/write-schedules.ts` | Dedicated write CLI — `--confirm-write WRITE_2026_WEEK_<n>` |
| `.github/workflows/ingest-2026-schedules.yml` | Manual one-week write (`workflow_dispatch` only) |

**Operator-reported production writes (2026):** Weeks **1–13** written individually; CFBD returned **no provider Week 14** (not written); Week **15** contains Navy at Army (**1** game). Expected production total: **761**.

**Expected weekly baseline:** 1:51, 2:49, 3:57, 4:58, 5:56, 6:58, 7:59, 8:56, 9:56, 10:62, 11:67, 12:66, 13:65, 15:1 (week **14** absent).

### 2C-1C read-only inventory audit (PASSED)

| Artifact | Role |
|----------|------|
| `apps/jobs/audit-schedule-inventory.ts` | Read-only full-season inventory audit CLI |
| `.github/workflows/audit-2026-schedule-inventory.yml` | Manual read-only audit (`workflow_dispatch` only) |

**Production run (post PR #39 merge):** `season=2026` → **SUCCESS**

* Total Game rows: **761**
* Distinct weeks: **1–13** and **15**; Week **14** absent as expected
* All **761** rows `status=scheduled`; scored rows: **0**
* Blank venues/cities: **0**; integrity issues: **none**
* Providers/mutations: **not invoked**

### 2C-2A ratings-input readiness audit (rerun structural OK after 2C-2B)

| Artifact | Role |
|----------|------|
| `apps/jobs/audit-ratings-readiness.ts` | Read-only ratings-input inventory CLI |
| `.github/workflows/audit-2026-ratings-readiness.yml` | Manual read-only audit (`workflow_dispatch` only) |

**Initial run (post PR #40):** structural fail — **0** 2026 FBS membership.

**Rerun after 2C-2B:** `structuralOk=true`, `preseason=true`, schedule **761**/138, FBS **138/138**, no ratings/power collisions; talent **0/138**; commits **0/138**; stats empty (expected); unit grades **0/138**; `ratingsWriteAuthorized=false`; `operatorReviewRequired=true`.

**Conference note:** Team.conference breakdown showed **88 Independent** among 138 FBS — unreliable for 2026. Core V1 reads `Team.conference` (Independent → −5). **Do not modify in 2C-2C.**

### 2C-2B FBS membership initialization (PASSED)

| Artifact | Role |
|----------|------|
| `apps/jobs/preview-fbs-membership.ts` / `write-fbs-membership.ts` | Preview + guarded insert |
| Preview / Init workflows | Manual `workflow_dispatch` only |

**Production:** **138** 2026 FBS `TeamMembership` rows; exact equality with schedule team set (PR #41).

### 2C-2C ratings-input / provider preview (EXECUTED — production)

| Artifact | Role |
|----------|------|
| `apps/jobs/preview-2026-ratings-inputs.ts` | Read-only CFBD talent + recruiting preview vs DB FBS 138 |
| `.github/workflows/preview-2026-ratings-inputs.yml` | Manual read-only (`workflow_dispatch` only) |

**Production run (post PR #42):** `season=2026` — `ok=true`, `structuralOk=true`, `ratingsComputeAuthorized=false`, `conferenceReadyForRatings=false`, `commitPersistenceSafe=false`, mutations=false.

* `/talent?year=2026`: **rawRowCount=0** — 2026 Team Talent Composite **unavailable** from CFBD (not a resolver failure)
* `/recruiting/teams?year=2026`: **221** raw → **136** unique FBS matches; missing **NDSU** + **Sacramento State**; **82** unresolved; **3** excess mapped rows collapse onto already-resolved IDs; schema mismatch (`points` present; `commits`/`averageRating` absent) → would repeat 2025 zero-commit anomaly
* Team.conference: **88 Independent** remains unsafe for V1 (−5 path)
* Do **not** write talent/commits; do **not** copy 2025 talent; do **not** compute ratings

### 2C-2D conference + recruiting diagnostic (production executed)

| Artifact | Role |
|----------|------|
| `apps/jobs/diagnose-2026-conference-recruiting.ts` | Read-only `/teams/fbs` conference map + recruiting resolver buckets |
| `.github/workflows/diagnose-2026-conference-recruiting.yml` | Manual read-only (`workflow_dispatch` only) |

**Production run (post PR #43):** `season=2026` — `ok=true`, `structuralOk=true`, `ratingsComputeAuthorized=false`, mutations=false, Odds=false.

* `/teams/fbs?year=2026`: **rawProviderFbsRows=138**; **matchedDbFbs=136/138**; unresolved provider schools: **North Dakota State**, **Sacramento State** (resolver failures — provider returned both rows)
* `providerFbsSetExact=false`; `providerConferenceMapSafeForV1=false` (pre-hardening); raw conferences include **FBS Independents** (not yet V1-recognized without normalize)
* External review evidence (not hardcoded into model): NDSU → Mountain West; Sacramento State → Mid-American/MAC football; Pac-12 football membership includes Boise State / Colorado State / Fresno State / San Diego State / Texas State / Utah State with Oregon State / Washington State; Louisiana Tech → Sun Belt
* Static `Team.conference`: **88 Independent/missing**; **102** differences vs provider; `currentTeamConferenceSafeFor2026=false` — **do not mutate Team.conference**
* `/recruiting/teams?year=2026`: **221** raw; **0** legitimate duplicate canonical mappings; **3** false-positives: `North Carolina A&T`→`north-carolina`, `Alabama A&M`→`alabama`, `San Diego`→`san-diego-state`; NDSU+Sac missing from validated 136
* `/talent?year=2026` remains empty (from 2C-2C)
* Provider conference candidate **not production-approved** until 2C-2E resolver hardening merges and diagnostic is **rerun**

### 2C-2E CFBD resolver hardening (production PASSED)

**Production diagnostic rerun (post PR #44):** `season=2026` — mutations=false, Odds=false, `ratingsComputeAuthorized=false`.

* `/teams/fbs`: **138/138** exact (`providerFbsSetExact=true`, `providerConferenceMapSafeForV1=true`); NDSU → Mountain West; Sac State → Mid-American; `FBS Independents`→`Independent` in-memory
* Recruiting: **138/138** provider-FBS validated; false-positives=0; `recruitingResolverSafe=true` (persistence still unsafe — schema mismatch)
* Static `Team.conference`: **88 Independent**; **100** differences; still unsafe — **do not mutate**
* `/talent?year=2026` still **0** rows (2C-2C)

### 2C-2F season-aware conference design + read-only preview (in preparation)

| Artifact | Role |
|----------|------|
| `apps/jobs/preview-2026-season-conferences.ts` | Read-only would-be season conference rows from `/teams/fbs` |
| `.github/workflows/preview-2026-season-conferences.yml` | Manual read-only (`workflow_dispatch` only); **1** CFBD call |

#### Consumer inventory (blast radius)

| Area | Role of conference / membership |
|------|----------------------------------|
| `Team.conference` (static) | V1 ratings adjustment via `compute_ratings_v1`; web team/ratings pages; diagnostics compare against provider |
| `TeamMembership` | Season×team FBS denominator (138); membership init/preview; readiness audits; schedule inventory |
| `Game.conferenceGame` | Schedule flag from CFBD ingest — **not** Team.conference |
| Hybrid V2 / feature-loader / V2 ratings | No direct Team.conference adjustment path found |
| Deploy | `prisma-migrate.yml` runs `migrate deploy` on **push to main** when `prisma/**` changes — **not** Vercel |

#### Storage options

1. **Nullable `conference` on TeamMembership** (recommended) — season-aware, one row/team/season, natural V1 join; requires migration in **2C-2G**
2. New `TeamSeasonConference` table — cleaner provenance (`source`, `sourceUpdatedAt`) but duplicates membership keyspace
3. Provider map at compute time — rejected (non-reproducible / provider-dependent ratings)
4. Checked-in YAML snapshot — reproducible but annual drift / dual source of truth

**Recommendation:** Option 1. **No schema/migration in 2C-2F** because merging `prisma/**` would auto-apply via GitHub Actions.

#### V1 future plan

`resolveSeasonAwareConferenceMap()` helper: require complete season-aware map for 2026+; **prohibit** Team.conference fallback for 2026; historical seasons may allow explicit legacy fallback. Production `compute_ratings_v1` **unchanged** this phase.

**Still out of scope / unapproved:** TeamMembership.conference write; Team.conference mutation; talent/commits persistence; ratings compute; odds; bets; nightly reactivation.

---

## P0 reactivation blockers

| Blocker | Status | Notes |
|---------|--------|-------|
| **Schedule-only CLI** | **Ready** | Preview + write + schedule inventory merged |
| **Week Zero mapping** | **Resolved** | No CFBD week 0; first bucket = provider week **1** |
| **Production write** | **Complete** | Weeks 1–13 + 15; **761** rows verified by 2C-1C |
| **Inventory audit** | **PASSED** | Production workflow SUCCESS after PR #39 |
| **Ratings readiness** | **Structural OK** | Membership fixed; talent/commits/unit-grades/conference still block write auth |
| **2026 FBS membership** | **PASSED** | Phase 2C-2B — **138/138** |
| **Talent / recruiting preview** | **Executed** | 2C-2C: `/talent` empty; recruiting schema unsafe |
| **Team.conference / V1 adj** | **Open** | 2C-2E: provider map safe; static still 100 diffs / 88 Independent |
| **Season conference persistence** | **Design (2C-2F)** | Recommend TeamMembership.conference; preview-only; migrate in 2C-2G |
| **CFBD resolver hardening** | **PASSED (2C-2E)** | 138/138 FBS + recruitingResolverSafe |
| **Season 2025 hardcoding** | Open | Scheduled paths still 2025 — Phase 2D before UI re-enable |
| **Empty 2026 DB** | **Partial** | Schedule + membership verified; talent/ratings still empty |
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

1. **Phase 2C-2F** — merge; run `Preview 2026 Season Conferences (Manual, Read Only)` with `season=2026`
2. **Phase 2C-2G** (separate approval) — Prisma migration + guarded write of TeamMembership.conference
3. Wire V1 to season-aware conference (fail-closed for 2026); talent availability still blocks ratings
4. **Phase 2D** — `TARGET_SEASON` in scheduled YAML before bulk UI enables

See [Preseason Reactivation Checklist](docs/preseason-reactivation-checklist.md).

---

## Quick links

- [Preseason Reactivation Checklist](docs/preseason-reactivation-checklist.md)
- [Preseason Season Parameterization](docs/preseason-season-parameterization.md)
- [2026 Betting Playbook](docs/2026-betting-playbook.md)
- [Workflow Disable Report](WORKFLOW_DISABLE_REPORT.md)
