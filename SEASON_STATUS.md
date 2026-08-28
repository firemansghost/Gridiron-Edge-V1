# Season Status — Gridiron Edge

**Status:** Offseason / paused for regular-season automation  
**Updated:** 2026-08-28 (Phase 2C-2J-3 — append-only Odds consumer readiness; draft PR)

Operator-facing status for offseason/preseason work. Complements `WORKFLOW_DISABLE_REPORT.md`, `docs/preseason-reactivation-checklist.md`, and `docs/2026-betting-playbook.md`.

---

## Current mode

| Item | Status |
|------|--------|
| **Calendar context** | **2026-08-04** — Week Zero begins **2026-08-27**; public 2026 schedules exist |
| **Production Supabase** | **761** schedule + **138** 2026 FBS membership; talent **138/138**; Core V1 ratings **138/138** (Candidate A @ completedThroughWeek=0); TeamUnitGrades **0/138**; commits still **0/138** |
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
| **Phase 2C-2C ratings-input provider preview** | **Executed** (PR #42) — `/talent` **0** rows; recruiting schema mismatch; conference diagnostics later corrected in 2C-2H-1 |
| **Phase 2C-2D conference + recruiting diagnostic** | **PASSED** (PR #43) — initial run found resolver gaps; post-2C-2E rerun exact |
| **Phase 2C-2E CFBD resolver hardening** | **PASSED** (PR #44) — 138/138 provider FBS + conference map safe; recruitingResolverSafe=true |
| **Phase 2C-2F season conference design** | **PASSED** (PR #45) — production preview writeEligible=true (classification); no schema write |
| **Phase 2C-2G-1 Prisma migrate hardening** | **PASSED** (PR #46) — manual-only `MIGRATE_PRODUCTION`; no recurring `_prisma_migrations` repair |
| **Phase 2C-2G-1B Schema Guardrails repair** | **PASSED** (PR #47) — live base-SHA comparison; fail-closed |
| **Phase 2C-2G-2 TeamMembership.conference schema** | **PASSED** (PR #48) — production migrate applied; column text/nullable; 138/138 still NULL |
| **Phase 2C-2G-2B migrate history-divergence guard** | **PASSED** (PR #49) — future migrate fails closed on DB/repo history divergence |
| **Phase 2C-2G-3 season conference initializer** | **PASSED** — production COMMIT: 138/138 populated, 0 NULL, verificationExact=true |
| **Phase 2C-2G-4 Core V1 season-aware conferences** | **PASSED** (PR #51) — production audit 138/138; legacyFallback=false |
| **Phase 2C-2H-1 ratings readiness / talent probe** | **PASSED** (PR #52) — season-aware diagnostics; Aug 27 probe: talent structurally complete |
| **Phase 2C-2H-2 guarded 2026 talent initializer** | **PASSED** (PR #53) — production COMMIT 138/138; `blueChipsPct` NULL by design; ratings still unauthorized |
| **Phase 2C-2H-3 Core V1 ratings preview** | **PASSED** (PR #54) — production read-only preview; 138 finite in-memory ratings; **zero writes**; ratings persistence still NOT AUTHORIZED |
| **Phase 2C-2H-4 V1 historical parity forensic** | **PASSED structurally (PR #55)** — legacy `compute_ratings_v1` did **not** reproduce persisted 2025 (`exact=0/136`, MAE≈32.21) |
| **Phase 2C-2H-5 Balanced V1 historical parity** | **PASSED — EXACT** (PR #56) — cutoff Balanced replay matched persisted 2025 V1 136/136 (machine MAE≈2.3e-15) |
| **Phase 2C-2H-6 Balanced V1 preseason bridge eval** | **PASSED** (PR #57) — Candidate A provisional preferred; Candidate B rejected (scale too wide); persistence unauthorized |
| **Phase 2C-2H-7 Balanced V1 transition timing** | **PASSED** (PR #58) — timing-only hard switch rejected; blend eval required |
| **Phase 2C-2H-8 Balanced V1 transition blends** | **PASSED** (PR #59) — B1 AUTHORIZED as model policy; B2/B3/hard/per-team REJECTED; write still unauthorized |
| **Phase 2C-2H-9 Core V1 lifecycle writer** | **COMPLETE** — Candidate A persisted 138/138; `GLOBAL_BLEND_W3_W6` lifecycle active; production COMMIT verified |
| **Phase 2C-2I-1 Hybrid V2 preseason readiness** | **COMPLETE** — production audit run 33134809476 `auditOk=true`; Core V1 Week1 ready; Hybrid inputs 0/51 fallback |
| **Phase 2C-2I-2 Hybrid activation hold** | **COMPLETE** (PR #62) — production smoke PASS; effective 2026 Week1 = Core V1; Hybrid held |
| **Phase 2C-2J-1 Workflow reactivation inventory** | **COMPLETE** (PR #63) — 45→46 workflows after 2C-2J-2; active schedules 10; schedule reactivation 0 |
| **Phase 2C-2J-2 Guarded 2026 Live Odds** | **COMPLETE** (PR #64) — merged `1445cdb…`; writer live |
| **Phase 2C-2J-2A Live Odds PREVIEW findings repair** | **COMPLETE** (PR #65) — aliases + FCS classify + `MAX_ABS_SPREAD=100` |
| **Phase 2C-2J-3 Append-only Odds consumer readiness** | **In preparation (draft)** — shared snapshot selector; no second COMMIT |
| **Expected 2026 schedule baseline** | **761** games / **138** distinct teams — **verified** |
| **Ratings computation / persistence** | **2026 Core V1 initialized** (do not rerun); further lifecycle COMMITs only via guarded workflow |
| **Odds ingestion** | **Week1 COMMIT SUCCESS** (run **33192011833**); recurring polling NOT AUTHORIZED; second COMMIT NOT AUTHORIZED |
| **Bet sync** | **Not yet approved** (dual Hybrid+Core sync invalid while Hybrid held) |
| **Nightly workflow reactivation** | **Not yet approved** — recurring workflows remain STOPPED |

---

## Dual-model state (2026)

| Model | Role | DB `strategyTag` | UI label |
|-------|------|------------------|----------|
| **Hybrid V2** | Primary/default **spread** model | `hybrid_v2` | Hybrid V2 (Flat $100) |
| **Core V1** | Comparison / reporting | `official_flat_100` (historical — do not rename) | Core V1 Card (Flat $100) |
| **V4** | Labs only | `v4_labs` | V4 Labs (Flat $100) |
| **Fade V4** | Labs only | `fade_v4_labs` | Fade V4 Labs (Flat $100) |

**Scope notes:** Hybrid V2 = spreads only; totals/ML = current Core V1 logic; weekly `official_flat_100` sync for comparison.

**Operational note (2C-2J-3):** Week1 Odds COMMIT run **33192011833** SUCCESS on `main` `964ae2dd…`. `providerCalls=1`, credits last=3 remaining=19682, matched=51/51, inserted=2281, totalRowsAfter=2281, books=11, fingerprint verification=2281/2281, `verification.ok=true`. Phases **2C-2J-2** and **2C-2J-2A** COMPLETE. Consumer readiness (append-only latest-per-book selection) in draft. Recurring Odds polling **NOT AUTHORIZED**. Second Odds COMMIT **NOT AUTHORIZED**. Bet sync / grading **NOT AUTHORIZED**. Hybrid remains **held**; official Week1 spread = **Core V1**.

**Prior note (2C-2J-2A):** Production Live Odds PREVIEW run **33186871080** FAILED SAFELY then repaired via PR #65 before COMMIT.

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

### 2C-2F season-aware conference design + read-only preview (production PASSED)

| Artifact | Role |
|----------|------|
| `apps/jobs/preview-2026-season-conferences.ts` | Read-only would-be season conference rows from `/teams/fbs` |
| `.github/workflows/preview-2026-season-conferences.yml` | Manual read-only (`workflow_dispatch` only); **1** CFBD call |

**Production run (post PR #45):** `season=2026` — `ok=true`, `exactSetMatch=true`, `writeEligible=true` (classification only), `mutationsInvoked=false`, `ratingsComputeAuthorized=false`, `schemaChanged=false`, `migrationCreated=false`.

* Candidate **138/138**; integrity lists empty; NDSU → Mountain West; Sac State → Mid-American; Independent **2**
* Static `Team.conference` still unsafe (**92** semantic differences after canonicalization) — **do not mutate**
* `/talent` still unavailable; ratings unauthorized

**Recommendation remains:** nullable `TeamMembership.conference` (Option 1). Production candidate still **138/138** `writeEligible=true` (classification); values not persisted yet.

### 2C-2G-1 Prisma production migration workflow hardening (PASSED)

| Artifact | Role |
|----------|------|
| `.github/workflows/prisma-migrate.yml` | **Manual-only** production `migrate deploy` |

- **Merged (PR #46):** `workflow_dispatch` only; `confirm=MIGRATE_PRODUCTION`; fail-closed status; no recurring `_prisma_migrations` DELETE/INSERT/`migrate resolve`
- Investigation of Actions run **31219442075** / job **93000485694**: that run was **Prisma Schema Guardrails**, not production migrate — **no production migration occurred**
- Historical Oct 2025 repair remains documented emergency SQL only

### 2C-2G-1B Prisma Schema Guardrails repair (PASSED)

| Artifact | Role |
|----------|------|
| `.github/workflows/prisma-guardrails.yml` | PR-only schema format/validate + migration-required-when-schema-changes |

- **Merged (PR #47):** repaired false-green from Run **31219442075**
- Live verification: PR base SHA comparison; `checkout@v6` `fetch-depth: 0`; fail-closed; no bare `origin/main...HEAD` dependency

### 2C-2G-2 TeamMembership.conference schema + migration (PASSED)

| Artifact | Role |
|----------|------|
| `prisma/schema.prisma` | Nullable `TeamMembership.conference String?` |
| `prisma/migrations/20260808010000_add_team_membership_conference/` | `ALTER TABLE "team_membership" ADD COLUMN "conference" TEXT` only |

- **Merged (PR #48)** then operator ran **Prisma Migrate** with `confirm=MIGRATE_PRODUCTION`
- Deploy applied `20260808010000_add_team_membership_conference`; post-deploy: Database schema is up to date
- Direct verification: `public.team_membership.conference` = **text**, **nullable**; migration record applied_steps_count=1
- **2026 FBS rows = 138**; `conference IS NULL = 138`; `conference IS NOT NULL = 0` (correct pre-writer state)
- No conference writer; no providers/ETL/ratings/Odds; no `_prisma_migrations` repair

#### Discovered during 2C-2G-2 preflight (not repaired)

Production `_prisma_migrations` also listed names **not present** in this repository’s `prisma/migrations/`:

* `20251009001406_init`
* `20250101_add_game_snapshots`

Repository search (current tree, docs, pickaxe history) found **no** SQL directories or committed content for those names. Do **not** invent SQL or auto-repair. Histories differ; future migrate must fail closed pending investigation.

### 2C-2G-2B Prisma migrate history-divergence guard (PASSED)

| Artifact | Role |
|----------|------|
| `.github/workflows/prisma-migrate.yml` | Fail closed on migration-history divergence before accepting pending/up-to-date |
| `apps/jobs/src/preseason/prisma-migrate-status.ts` | Pure status classifier (tests) |

- **Merged (PR #49):** preflight/post-deploy refuse DB migrations not found locally; mixed pending+divergence unsafe
- **No** `_prisma_migrations` mutation; **no** `migrate resolve`; **no** fabricated migrations
- Does **not** block conference writer — column already live

### 2C-2G-3 Guarded 2026 season conference initializer (PASSED)

| Artifact | Role |
|----------|------|
| `apps/jobs/src/preseason/season-conference-writer.ts` | Pure commit eligibility + atomic write logic |
| `apps/jobs/initialize-2026-season-conferences.ts` | CLI (default READ_ONLY; `--commit` + `WRITE_2026_CONFERENCES`) |
| `.github/workflows/initialize-2026-season-conferences.yml` | Manual guarded workflow |

- **Production COMMIT succeeded:** 138 FBS / 138 populated / 0 NULL / `verificationExact=true`
- Distribution verified (ACC 17 … Sun Belt 14); NDSU=Mountain West; Sac State=Mid-American
- Do **not** rerun the initializer

### 2C-2G-4 Wire Core V1 to season-aware conferences — PASSED (PR #51)

| Artifact | Role |
|----------|------|
| `apps/jobs/src/ratings/v1-conference-loader.ts` | Season policy loader (reuses `resolveSeasonAwareConferenceMap`) |
| `apps/jobs/src/ratings/conference-adjustments.ts` | Unchanged adjustment constants |
| `apps/jobs/audit-v1-conference-source.ts` | Read-only production audit CLI |
| `.github/workflows/audit-v1-conference-source.yml` | Manual read-only audit |

**Production Core V1 conference audit:**
```text
138 expected
138 loaded
0 missing
0 unrecognized
legacyFallback=false
```

- **2026+:** `TeamMembership.conference` only; fail closed; no `Team.conference` fallback
- **&lt;2026:** legacy `Team.conference` (historical Unknown/Independent behavior preserved)
- Static `Team.conference` remains unchanged
- No ratings compute/persist

### 2C-2H-1 Align ratings readiness diagnostics + talent probe — PASSED (PR #52)

| Artifact | Role |
|----------|------|
| `apps/jobs/src/preseason/ratings-input-provider-preview.ts` | Season-aware conference readiness |
| `apps/jobs/src/preseason/ratings-readiness-audit.ts` | 2026 breakdown from `TeamMembership.conference` |
| `apps/jobs/probe-2026-talent-availability.ts` | One-call talent probe CLI |
| `.github/workflows/probe-2026-talent-availability.yml` | Manual read-only talent probe |

**August 27, 2026 live talent availability** (Actions run `33092434262`):
```text
/talent?year=2026
raw=138
matched=138/138
missing=0
unresolved=0
duplicates=0
providerSeason=[2026]
finiteComposite=138
talentAvailable=true
structurallyComplete=true
persistenceAuthorized=false
ratingsComputeAuthorized=false
```

Provider-availability blocker removed. Persistence and ratings remain unauthorized until separately reviewed.

### 2C-2H-2 Guarded one-time 2026 TeamSeasonTalent initializer — PASSED

| Artifact | Role |
|----------|------|
| `apps/jobs/src/preseason/initialize-2026-team-talent.ts` | Pure eligibility + atomic write logic |
| `apps/jobs/initialize-2026-team-talent.ts` | CLI (PREVIEW default; COMMIT + `WRITE_2026_TALENT`) |
| `.github/workflows/initialize-2026-team-talent.yml` | Manual guarded workflow |
| Legacy `talent-cfbd.yml` / `talent-roster-sync.yml` | Schedules removed; manual ≤2025 only |
| `cfbd_team_roster_talent.ts` | Refuses season ≥ 2026 |

**Production COMMIT (Aug 27 2026):**
- `COMMIT` 138 rows; `transactionVerificationExact=true`; `postCommitExactTeamSet=true`
- `talentCompositeMatchesCandidate=138/138`
- `blueChipsPct` NULL 138/138 by design; no ratings; no Odds

### 2C-2H-3 Read-only 2026 Core V1 ratings preview — PASSED (PR #54)

| Artifact | Role |
|----------|------|
| `apps/jobs/src/preseason/core-v1-ratings-preview.ts` | Gates + report; reuses `computeV1SeasonRatings` |
| `apps/jobs/preview-2026-core-v1-ratings.ts` | SELECT-only CLI (strict FeatureLoader) |
| `.github/workflows/preview-2026-core-v1-ratings.yml` | Manual read-only workflow (`DIRECT_URL` only) |

**Production read-only preview (Aug 27 2026):**
- FBS=138; schedule exact=138; conference=138/138; talent=138/138; `featureIntegrityOk=true`
- `baseFeatureTeams=0`; `talentOnlyFallbackTeams=138`; `ratingCount=138`; finite=138
- powerRating min/avg/median/max/stddev ≈ **-44.15 / 4.96 / 13.82 / 59.60 / 32.16**; `ratingRange` ≈ 103.75
- `zeroConfidenceCount=138` (expected talent-only / missing base stats)
- Conference adj after calibration (informational): SEC/B1G +5→+40; ACC/B12/Pac +2→+16; AAC/MWC/SBC -2→-16; MAC/CUSA -3.5→-28; Independent -5→-40
- **No writes / providers / Odds**; formula unchanged
- **2026 ratings persistence remains NOT AUTHORIZED**

### 2C-2H-4 Core V1 historical parity / calibration forensic — PASSED structurally (PR #55)

- Forensic structurally valid; **legacy `compute_ratings_v1` did NOT reproduce persisted 2025**
- Persisted 2025 V1: FBS=136 finite=136; min≈-26.10 avg≈0 median≈-2.16 max≈30.29 stddev≈11.40
- Legacy replay: min≈-59.49 avg≈-22.29 median≈-34.14 max≈56.51 stddev≈30.16
- Parity: `exact=0/136`, `over5=132/136`, MAE≈32.2124, RMSE≈34.5475
- `currentFormulaReproducesPersisted2025=false`; `historicalParity=false`
- Counterfactuals (diagnostic only; **do not** change formulas from them): CURRENT MAE≈32.21; POST_CAL≈6.02; NO_CONFERENCE≈5.81

### 2C-2H-5 Balanced V1 historical parity — PASSED EXACT (PR #56)

- Production forensic structurally healthy
- Unrestricted current-DB replay (all currently-final 2025 games): MAE≈0.9720 RMSE≈1.1138 maxAbsDelta≈2.3795 Pearson≈0.9952 Spearman≈0.9934
- Residual proven **historical snapshot drift**, not formula drift
- Persisted 2025 `modelVersion='v1'` `updated_at` window: **2025-11-24 19:56:37.521 → 19:57:10.049**
- Stored games: min=8 avg≈10.03 max=11
- Cutoff reconstruction (`game.date` before earliest persisted `updated_at`):
  - game-count matches **136/136**
  - exact rating matches **136/136**
  - machine-level MAE≈2.3e-15 RMSE≈3.2e-15 maxAbsDelta≈1.4e-14 Pearson=1.0
- **Production Core V1 = Balanced V1** (25/25/25/25 × 14.0)
- `compute_ratings_v1.ts` = **LEGACY / historical alternate** — do **not** use for 2026

### 2C-2H-6 Balanced V1 preseason bridge evaluation — PASSED (PR #57)

- Structural: ok; FBS=138; talent=138 finite; duplicates=0; `purePreseasonState=true`; games/EPA/net/win/existing V1 all 0
- **Candidate A** `WEIGHT_PRESERVED_NEUTRAL` (`talentZ * 3.5`): 2025 MAE=7.8831 RMSE=9.7008 Pearson=0.6021 Spearman=0.5784; 2026 range=20.8895; pair p95=10.1282; pair max=20.8895
- **Candidate B** `TALENT_RENORMALIZED` (`talentZ * 14`): 2025 MAE=9.0511 RMSE=11.5652; 2026 range=83.5581; pair p95=40.5127; pair max=83.5581
- **Candidate B rejected** from serious production consideration (matchup scale excessively wide)
- **Candidate A = provisional preferred preseason bridge**
- Persistence remains **NOT AUTHORIZED** pending transition evaluation
- Canonical production Core V1 remains Balanced V1 (25/25/25/25 × 14)

### 2C-2H-7 Balanced V1 transition timing evaluation — PASSED (PR #58)

| Artifact | Role |
|----------|------|
| `apps/jobs/src/preseason/balanced-v1-transition-timing-eval.ts` | Pure 2025 cumulative weekly snapshots + transition deltas |
| `apps/jobs/evaluate-balanced-v1-transition-timing.ts` | SELECT-only CLI (`study_season=2025`) |
| `.github/workflows/evaluate-balanced-v1-transition-timing.yml` | Manual read-only workflow (`DIRECT_URL` only) |

**Production structural:** ok; FBS=136; 2026 FBS/talent=138 exact; `purePreseason2026=true`; chronology safe; no writes/providers/Odds

**Coverage:** W1 68.4%; W2 99.3%; W3 100%; all teams ≥2 games by Week4

**Correlation vs Nov24:** W3 .7340; W4 .8125; W5 .8651; W6 .9014; W7 .9257; W8 .9399

**Hard-switch discontinuity (Candidate A → canonical):** median ≈6.6–7.3 pts; p95 ≈17–19 pts (remained large even after full coverage)

**Conclusion:** timing-only hard global / per-team first-game / per-team two-game switches **REJECTED**; global blend evaluation required. `hardSwitchWeekCandidate=INCONCLUSIVE`; no threshold encoded.

- Canonical Balanced formula / Candidate A scale **unchanged**
- **2026 ratings persistence NOT AUTHORIZED**

### 2C-2H-8 Balanced V1 transition blend evaluation — PASSED (PR #59)

| Artifact | Role |
|----------|------|
| `apps/jobs/src/preseason/balanced-v1-transition-blend-eval.ts` | Pure 2025 global blend schedules B1/B2/B3 + hard-switch controls |
| `apps/jobs/evaluate-balanced-v1-transition-blends.ts` | SELECT-only CLI (`study_season=2025`) |
| `.github/workflows/evaluate-balanced-v1-transition-blends.yml` | Manual read-only workflow (`DIRECT_URL` only) |

**Production structural:** ok; FBS=136; targets rows/distinct/finite=136 exact; firstFullCanonicalWeek=3; chronology + pure-preseason; no writes

| Policy | avgMAE | avgRMSE | avgMedianMove | maxP95 | maxSingle |
|--------|--------|---------|---------------|--------|-----------|
| **B1 GLOBAL_BLEND_W3_W6** | 4.6842 | 5.7643 | 2.0468 | 6.2755 | 9.3712 |
| B2 GLOBAL_BLEND_W4_W7 | 5.1163 | 6.2929 | 1.6610 | 6.0089 | 8.2363 |
| B3 GLOBAL_BLEND_W3_W5 | 4.6145 | 5.6668 | 2.2175 | 8.0222 | 10.6712 |
| Hard Week3 (control) | ≈4.6564 | — | — | ≈17.3144 | ≈28.4163 |

**Human decision:** Candidate A AUTHORIZED as preseason bridge; **B1 AUTHORIZED** as transition model policy (preserves near-B3 accuracy with lower shocks). B2/B3 REJECTED. Hard/per-team switches REJECTED.

**But:** production ratings WRITE remained NOT AUTHORIZED until lifecycle implementation + production PREVIEW.

### 2C-2H-9 Core V1 lifecycle writer — COMPLETE

| Artifact | Role |
|----------|------|
| `apps/jobs/src/ratings/core-v1-lifecycle.ts` | Pure B1 policy + Candidate A + temporal gates |
| `apps/jobs/write-core-v1-lifecycle.ts` | Guarded PREVIEW/COMMIT CLI |
| `.github/workflows/write-core-v1-lifecycle-ratings.yml` | Manual guarded workflow (`DIRECT_URL` only) |

- Policy: `GLOBAL_BLEND_W3_W6` keyed to **`completedThroughWeek`** (not prediction week)
- Weights: ≤2→0; 3→0.25; 4→0.50; 5→0.75; ≥6→1.00
- Candidate A = `talentZ * 3.5`
- Production COMMIT: GitHub Actions run **33126432213** (`upserted=138`)
- Post-write verification: run **33127893613** (`existingV1Count=138`, proposedCreate=0, proposedUpdate=138, no mutations)
- **2026 Core V1 preseason initialization finished — do not rerun ratings init**

### 2C-2I-1 Hybrid V2 preseason readiness audit — COMPLETE

| Artifact | Role |
|----------|------|
| `apps/jobs/src/preseason/hybrid-v2-preseason-readiness.ts` | Pure SELECT-shaped readiness + prior-grade Hybrid diagnostic |
| `apps/jobs/audit-hybrid-v2-preseason-readiness.ts` | SELECT-only CLI |
| `.github/workflows/audit-hybrid-v2-preseason-readiness.yml` | Manual read-only workflow (`DIRECT_URL` only) |

- Production audit: GitHub Actions run **33134809476** — `auditOk=true`, detected 2026/W1
- Core V1 Week1 operational ready (51/51 V1 coverage)
- Current Hybrid inputs 0 → would-fallback 51; `sameSeasonUnitGradeSourceReady=false`
- Prior-year grades structurally available (138/138; NDSU + Sac all-zero); historically validated=false
- **Human Week1 decision:** official spread model = **Core V1**; 2025 unit-grade bridge **NOT AUTHORIZED for Week1**

### 2C-2I-2 Hybrid activation hold + effective model truthfulness — COMPLETE

| Artifact | Role |
|----------|------|
| `apps/web/lib/config/hybrid-production-activation.ts` | Operational authorization gate (`season >= 2026` → false) |
| `apps/web/lib/config/slate-model.ts` | Resolve preferred → effective model; `activationOverride` meta; no Hybrid comparison on hold |
| `apps/web/app/api/weeks/slate/route.ts` | Apply hold before Hybrid runtime / persisted Hybrid comparison / conflict-tier derivation |
| Picks / Homepage | Display `meta.activeModel`; hide Hybrid-only filters under Core V1 |

- PR **#62** merged; production HTTP smoke PASS for 2026 Week1
- Effective model Core V1 for omitted / `core_v1` / held `hybrid_v2`
- Held path: no Hybrid runtime; no persisted `hybrid_v2` comparison metadata
- Hybrid formula / Core V1 formula / strategy tags unchanged

### 2C-2J-1 Workflow reactivation inventory + Live Odds architecture — **COMPLETE** (PR #63)

Merge SHA: `19117af8b17de45121e0187e5d7fcf69afdbf6b9`

| Artifact | Role |
|----------|------|
| `docs/2026-workflow-reactivation-matrix.md` | Human-readable inventory, pipeline design, Odds/bet/score audits |
| `docs/data/2026-workflow-classifications.json` | Machine-readable classifications |
| `scripts/inventory-workflows-2026.py` | Pure static YAML inventory (no network/DB) |

- Inventoried at merge: **45** workflows; **10** active YAML schedules; **0** schedule reactivation recommended
- REPLACE: `nightly-ingest`, `ratings-v1`, `ratings-v2`, `sync-weekly-bets`
- Do **not** reuse ingest-minimal wipe or ingest.ts+ratings for live 2026 Odds

### 2C-2J-2 Guarded 2026 Live Odds PREVIEW/COMMIT — **COMPLETE** (PR #64)

Merge SHA: `1445cdbec3e54587ea9bc70d5f5eca8f0cdbc86b`

### 2C-2J-2A First production Live Odds PREVIEW findings repair — **COMPLETE** (PR #65)

Merge SHA: `964ae2ddbc98d7a082157e8134bcc4e70eaf99d0` (includes Week1 Odds COMMIT on main)

**Production Odds COMMIT run 33192011833** (after 2C-2J-2A):

| Field | Value |
|-------|--------|
| Result | **SUCCESS** |
| providerCalls | 1 |
| credits last / remaining | 3 / 19682 |
| matched | 51/51 |
| inserted / totalRowsAfter | 2281 / 2281 |
| distinctGames / books | 51 / 11 |
| spreads / totals / ML | 990 / 501 / 790 |
| fingerprint verification | 2281/2281 |
| verification.ok | true |

### 2C-2J-3 Append-only Odds consumer readiness — **in preparation (draft)**

Shared `market-line-snapshot` selector (timestamp DESC, id DESC); slate + game detail + closing helpers use latest coherent per-book current/closing snapshots. Read-only audit workflow: `audit-2026-marketline-consumer-readiness.yml`.

**Still out of scope / unapproved:** recurring Odds polling, second Odds COMMIT, bet writes, grading, Hybrid activation, unit-grade writes, cron reactivation.

---

## P0 reactivation blockers

| Blocker | Status | Notes |
|---------|--------|-------|
| **Schedule-only CLI** | **Ready** | Preview + write + schedule inventory merged |
| **Week Zero mapping** | **Resolved** | No CFBD week 0; first bucket = provider week **1** |
| **Production write** | **Complete** | Weeks 1–13 + 15; **761** rows verified by 2C-1C |
| **Inventory audit** | **PASSED** | Production workflow SUCCESS after PR #39 |
| **Ratings readiness** | **Structural OK** | Membership + season conferences + talent ready; commits/stats still empty; write auth false |
| **Talent / recruiting preview** | **Executed** | Aug 27 probe `/talent` 138/138; recruiting schema still unsafe for commits writer |
| **Team.conference / V1 adj** | **PASSED (2C-2G-4)** | 2026+ membership; static Team.conference untouched |
| **Ratings readiness diagnostics** | **PASSED (2C-2H-1 / PR #52)** | Membership conferences; talent probe live-complete Aug 27 |
| **2026 talent persistence** | **PASSED (2C-2H-2 / PR #53)** | Production COMMIT 138/138; legacy writer blocked for 2026 |
| **2026 Core V1 ratings preview** | **PASSED (2C-2H-3 / PR #54)** | Production read-only; 138 finite; zero writes; persist NOT AUTHORIZED |
| **2025 V1 historical parity forensic** | **PASSED structurally (2C-2H-4 / PR #55)** | Legacy Core V1 did not reproduce; MAE≈32.21 |
| **2025 Balanced V1 parity forensic** | **PASSED EXACT (2C-2H-5 / PR #56)** | Cutoff replay 136/136; Core V1 = Balanced V1 |
| **2026 Balanced V1 preseason bridge eval** | **PASSED (2C-2H-6 / PR #57)** | Candidate A provisional; B rejected; persist unauthorized |
| **2025 Balanced V1 transition timing** | **PASSED (2C-2H-7 / PR #58)** | Timing-only hard switch rejected; blend eval required |
| **2025 Balanced V1 transition blends** | **PASSED (2C-2H-8 / PR #59)** | B1 authorized model policy; write still unauthorized |
| **2026 Core V1 lifecycle writer** | **COMPLETE (2C-2H-9)** | Candidate A 138/138 persisted; B1 lifecycle active |
| **Hybrid V2 preseason readiness** | **COMPLETE (2C-2I-1)** | Audit 33134809476; Week1 official = Core V1; bridge unauthorized |
| **Hybrid V2 activation hold** | **COMPLETE (2C-2I-2 / PR #62)** | 2026 effective Core V1; production smoke PASS |
| **Workflow reactivation inventory** | **COMPLETE (2C-2J-1 / PR #63)** | 45 at merge; 46 with 2C-2J-2 writer; schedules 10; reactivation 0 |
| **Guarded 2026 Live Odds writer** | **COMPLETE (2C-2J-2 / PR #64)** | Merged; Week1 COMMIT run 33192011833 SUCCESS |
| **Live Odds PREVIEW findings repair** | **COMPLETE (2C-2J-2A / PR #65)** | Aliases + FCS classify + MAX_ABS_SPREAD |
| **Append-only Odds consumers** | **Draft (2C-2J-3)** | Shared snapshot selector; second COMMIT unauthorized |
| **2026 FBS membership** | **PASSED** | Phase 2C-2B — **138/138** |
| **Season conference persistence** | **PASSED (2C-2G-3)** | 138/138 populated; 0 NULL; do not rerun initializer |
| **Prisma migrate auto-deploy** | **PASSED (2C-2G-1)** | Manual `MIGRATE_PRODUCTION` only |
| **Prisma Schema Guardrails** | **PASSED (2C-2G-1B / PR #47)** | Live base-SHA fail-closed comparison |
| **Prisma migrate history divergence** | **PASSED (2C-2G-2B / PR #49)** | Fail closed; DB-only names unresolved (no auto-repair) |
| **CFBD resolver hardening** | **PASSED (2C-2E)** | 138/138 FBS + recruitingResolverSafe |
| **Season 2025 hardcoding** | Open | Scheduled paths still 2025 — repair/replace before UI re-enable |
| **Empty 2026 DB** | **Partial** | Schedule + membership + talent + Core V1 ratings; MarketLine Week1=2281; unit grades 0 |
| **Provider secrets** | **Validated** | GitHub secrets worked 2026-08-04 |
| **Weekly bet sync** | **NOT AUTHORIZED** | Dual Hybrid+Core sync invalid while Hybrid held — REPLACE |
| **Live Odds** | **Week1 snapshot PERSISTED** | Run 33192011833; recurring polling NOT AUTHORIZED; second COMMIT NOT AUTHORIZED |
| **V3 totals** | **Blocked** | Missing `sync-v3-bets.ts` — leave disabled |
| **Mock fallback** | **Fixed (2B-R)** | Production ingest fails closed if `CFBD_API_KEY` missing |
| **nightly-ingest** | Keep UI-disabled | **REPLACE** — 2025 literals + wipe Odds + seed-ratings |

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

1. **Phase 2C-2J-3** — independent review/merge of append-only Odds consumer readiness; then second Odds COMMIT may be considered separately
2. Core-only guarded weekly-card writer (or effective-model gate) before any bet sync
3. Repair 2026 score sync before any post-game automation
4. Do **not** copy 2025 TeamUnitGrades / activate Hybrid / enable crons from this phase
5. Recurring Odds polling / second Odds COMMIT / bet sync / grading remain **NOT AUTHORIZED** until separately approved

See [Preseason Reactivation Checklist](docs/preseason-reactivation-checklist.md) and [2026 Workflow Reactivation Matrix](docs/2026-workflow-reactivation-matrix.md).

---

## Quick links

- [Preseason Reactivation Checklist](docs/preseason-reactivation-checklist.md)
- [2026 Workflow Reactivation Matrix](docs/2026-workflow-reactivation-matrix.md)
- [Preseason Season Parameterization](docs/preseason-season-parameterization.md)
- [2026 Betting Playbook](docs/2026-betting-playbook.md)
- [Workflow Disable Report](WORKFLOW_DISABLE_REPORT.md)
