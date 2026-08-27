# Season Status — Gridiron Edge

**Status:** Offseason / paused for regular-season automation  
**Updated:** 2026-08-27 (Phase 2C-2H-5 — Balanced V1 historical parity forensic; draft PR)

Operator-facing status for offseason/preseason work. Complements `WORKFLOW_DISABLE_REPORT.md`, `docs/preseason-reactivation-checklist.md`, and `docs/2026-betting-playbook.md`.

---

## Current mode

| Item | Status |
|------|--------|
| **Calendar context** | **2026-08-04** — Week Zero begins **2026-08-27**; public 2026 schedules exist |
| **Production Supabase** | **761** schedule + **138** 2026 FBS membership; talent **138/138** (`talentComposite`); commits still **0/138**; ratings **0** |
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
| **Phase 2C-2H-5 Balanced V1 historical parity** | **In preparation (draft)** — SELECT-only Balanced 25/25/25/25 × 14.0 replay vs persisted 2025 V1 |
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

### 2C-2H-5 Balanced V1 historical parity forensic (in preparation / draft)

| Artifact | Role |
|----------|------|
| `apps/jobs/src/ratings/compute_balanced_v1.ts` | Pure Balanced 25/25/25/25 × 14.0 (shared with writer) |
| `apps/jobs/src/preseason/balanced-v1-historical-parity-audit.ts` | Pure parity forensic |
| `apps/jobs/audit-balanced-v1-historical-parity.ts` | SELECT-only CLI (`comparison_season=2025`) |
| `.github/workflows/audit-balanced-v1-historical-parity.yml` | Manual read-only workflow (`DIRECT_URL` only) |

**Architecture (pending exact 2C-2H-5 parity proof):**
- Stored production `modelVersion='v1'` appears to be **Balanced V1** (commit `a611281`)
- Writer UPDATE updates `powerRating`/`rating`/`games` only — can leave legacy `dataSource='game+season'` etc.
- `apps/web/lib/core-v1-spread.ts` already treats existing V1 as Balanced (direct points; `ratingDiff + HFA`)
- `compute_ratings_v1.ts` = **LEGACY / historical alternate** (identification only; not deleted/renamed)

- Do **not** run the production Balanced forensic until draft PR is independently reviewed
- Do **not** run `compute_ratings_balanced.ts` from this phase (writes)
- **2026 ratings persistence remains NOT AUTHORIZED**; `modelChangeAuthorized=false`

**Still out of scope / unapproved:** ratings persistence (`ratings-v1.yml`); recruiting persistence; Odds; Prisma Migrate history repair; any formula/weight/calibration change.

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
| **2025 Balanced V1 parity forensic** | **In prep (2C-2H-5)** | SELECT-only Balanced replay vs persisted V1 |
| **2026 FBS membership** | **PASSED** | Phase 2C-2B — **138/138** |
| **Season conference persistence** | **PASSED (2C-2G-3)** | 138/138 populated; 0 NULL; do not rerun initializer |
| **Prisma migrate auto-deploy** | **PASSED (2C-2G-1)** | Manual `MIGRATE_PRODUCTION` only |
| **Prisma Schema Guardrails** | **PASSED (2C-2G-1B / PR #47)** | Live base-SHA fail-closed comparison |
| **Prisma migrate history divergence** | **PASSED (2C-2G-2B / PR #49)** | Fail closed; DB-only names unresolved (no auto-repair) |
| **CFBD resolver hardening** | **PASSED (2C-2E)** | 138/138 FBS + recruitingResolverSafe |
| **Season 2025 hardcoding** | Open | Scheduled paths still 2025 — Phase 2D before UI re-enable |
| **Empty 2026 DB** | **Partial** | Schedule + membership + talent verified; ratings/commits/stats still empty |
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

1. **Phase 2C-2H-5** — review/merge Balanced V1 historical parity forensic; do **not** run production workflow until independently reviewed
2. Do **not** persist 2026 ratings (`ratings-v1.yml`) — still NOT AUTHORIZED
3. Do **not** change Balanced or legacy Core V1 formulas from forensics alone
4. **Phase 2D** — `TARGET_SEASON` in scheduled YAML before bulk UI enables

See [Preseason Reactivation Checklist](docs/preseason-reactivation-checklist.md).

---

## Quick links

- [Preseason Reactivation Checklist](docs/preseason-reactivation-checklist.md)
- [Preseason Season Parameterization](docs/preseason-season-parameterization.md)
- [2026 Betting Playbook](docs/2026-betting-playbook.md)
- [Workflow Disable Report](WORKFLOW_DISABLE_REPORT.md)
