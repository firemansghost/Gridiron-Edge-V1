# External Elo Prior Discovery V1 — Research Contract

**Status:** RESEARCH / DISCOVERY ONLY  
**Contract date:** 2026-09-22  
**Season:** 2026  
**Provider:** CollegeFootballData (CFBD)  
**Documented API/OpenAPI version:** 5.29.0

## Purpose

Evaluate CFBD preseason Elo as a clean competing external preseason prior without changing Candidate A, Core V1, Candidate B V1, or any already-frozen prospective prediction cohort.

This slice is descriptive research only.

It does **not** authorize:

- Core V1 changes
- Candidate A changes
- Candidate B V1 formula or feature changes
- replacement or reinterpretation of any Week 3/Week 4 prediction
- blend weights
- model activation
- rating persistence
- Bet writes
- Hybrid writes
- lifecycle changes
- schema/migration changes

The existing `candidate_b_roster_prior_v1` identity remains frozen and must never be repurposed for Elo.

If Elo later earns a prospective challenger, it must receive a new immutable model identity (provisional naming only: `candidate_b_elo_prior_v1`). This contract does not create or authorize that model.

## Access-path finding

CFBD 5.29.0 documents the existing endpoint:

`GET /ratings/elo`

with query:

`year=2026&preseason=true`

The documented semantics are the initial Elo rating associated with each team's opening regular-season game. Missing opening ratings are omitted. `preseason=true` cannot be combined with `week`. If `seasonType` is supplied, it must be `regular` or `both`.

This is a new query/access contract on an existing endpoint, not a new endpoint.

The canonical discovery request for this slice is exactly:

`GET /ratings/elo?year=2026&preseason=true`

Do not add `week`. Do not add `seasonType` unless a later provider compatibility issue is separately reviewed.

## Historical/prospective boundary

A September 2026 retrieval of 2026 preseason Elo is a **discovery/archive snapshot retrieved in September 2026**.

It is not evidence of:

- what CFBD would have returned before the 2026 season
- what information was available to an earlier prospective model
- what Week 3 or Week 4 predictions should have been

Never retrofit, replace, backdate, or reinterpret an existing prospective prediction with this snapshot.

## One-call capture rule

The discovery capture must make exactly **one** CFBD provider request.

Every downstream QA/statistical calculation must operate from the exact captured response bytes from that one request.

No second Elo request may be used to fill, repair, reconcile, or verify a missing team.

## Raw-response preservation

The capture must preserve the exact successful HTTP response bytes before transformation.

Record:

- retrieval timestamp
- canonical request path/query
- documented API/OpenAPI version
- HTTP status
- raw byte count
- SHA-256 of the exact raw bytes

The raw response must be emitted as an artifact together with the machine-readable audit report.

The capture is append-only at the evidence level: do not overwrite a prior raw discovery artifact in a working directory.

GitHub Actions artifact retention is operational evidence, not permanent archival storage. After QA review, a separate archival step may copy the exact raw bytes and report into a versioned research snapshot path only after re-verifying the SHA-256. That later archival action does not authorize model changes.

## Authoritative FBS population

The only authoritative 2026 FBS denominator is:

- table: `TeamMembership`
- season: `2026`
- level: `fbs`
- expected unique teams: **138**

Provider response size never redefines the FBS population.

No missing provider team may be imputed, zero-filled, conference-filled, talent-filled, or otherwise synthesized.

## Team resolution

Resolution is fail-closed.

Use the existing CFBD full-identity resolver semantics:

- `provider='cfbd'`
- `strictFullIdentity=true`

Accept only deliberate full-identity guard / CFBD exact alias / general exact alias results.

Do not allow:

- fuzzy matching
- parenthetical stripping as evidence
- mascot inference
- silent similarly named FBS substitution
- invented aliases

Every resolved ID must also belong to the authoritative 138-team FBS set to count toward FBS coverage.

Unresolved or non-FBS provider rows must be reported explicitly as unexpected/unmatched rows. They must not be silently dropped from the raw-response QA.

## Required QA

Report at minimum:

- retrieval timestamp
- documented API/OpenAPI version
- raw SHA-256
- raw byte count
- raw row count
- unique provider team count
- duplicate provider team names
- authoritative FBS count
- unique resolved FBS count
- exact missing canonical FBS team IDs
- exact unresolved/unexpected provider team names
- duplicate canonical target IDs
- null Elo rows
- non-finite Elo rows
- year mismatches
- conference coverage
- canonical FBS Elo min/max/mean/median/population-SD
- raw finite Elo distribution
- provider resolution-method counts

Extra non-FBS provider rows do not redefine FBS coverage. Canonical coverage is evaluated only against the 138 authoritative FBS memberships.

## Candidate A comparison source

Candidate A remains exactly:

`talentZ * 3.5`

Do not reimplement a new talent normalization.

Load persisted 2026 `TeamSeasonTalent.talentComposite` for the authoritative 138 FBS teams and use the existing `computeTalentOnlyBridgeRatings` implementation to obtain the frozen Candidate A `talentZ` and point scale.

Any missing/non-finite talent is reported. Do not impute it.

## Descriptive Elo audit

For canonical teams with a valid Elo observation:

1. Standardize Elo independently using the available canonical FBS Elo population and population SD.
2. Keep Candidate A `talentZ` exactly as generated by the existing Candidate A bridge code.
3. Compute relationship metrics only on the explicit intersection where both values exist.

Required study outputs:

- Pearson(Elo, talentZ)
- Spearman(Elo, talentZ)
- Pearson(zElo, talentZ)
- rank disagreement
- largest team-level disagreements
- conference distributions
- conference-centered disagreement
- coverage/intersection counts

Team disagreement rows should retain enough provenance to identify:

- canonical team ID
- provider team string
- canonical conference
- Elo
- zElo
- talentComposite
- talentZ
- Candidate A points
- Elo rank
- talent rank
- rank delta
- z-score delta

## Decision boundary

This slice must **not** select:

- an Elo points scale
- a blend weight
- an Elo/talent combination
- a production or shadow model
- a promotion threshold

The descriptive audit should answer whether Elo appears meaningfully distinct enough to justify designing a separately pre-registered challenger. That is a human research decision after QA, not an automatic threshold in code.

Allowed future choices after review:

1. Elo alone
2. another independent preseason prior
3. a pre-registered Elo + talent combination

No future choice is authorized by this capture itself.

## Mutation contract

The discovery workflow is:

- manual only
- main-only
- exact-SHA guarded
- one CFBD call
- database SELECTs only
- no Prisma transaction
- no DB mutations
- no Odds provider
- no SGO/weather providers
- no ratings write
- no shadow prediction write
- no Bet/Hybrid/MatchupOutput write
- no migration

A QA failure should still preserve/upload the raw successful response and audit report when those files exist, then fail closed for downstream research progression.
