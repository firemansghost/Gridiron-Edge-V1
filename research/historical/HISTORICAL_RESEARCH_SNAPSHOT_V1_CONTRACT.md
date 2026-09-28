# Historical Research Snapshot V1 — 2025 Contract

**Status:** RESEARCH ONLY / PREVIEW ONLY  
**Target season:** 2025  
**Purpose:** verify historical data coverage and archival mechanics before any historical-model reconstruction or backtest persistence.

## Scope

This capability may:

- call College Football Data (CFBD) only;
- archive exact raw provider bytes as GitHub Actions artifacts;
- compute hashes, row counts, game counts, and coverage diagnostics;
- derive the observed 2025 regular-season FBS-vs-FBS week set from the CFBD `/games` payload;
- capture one CFBD Elo snapshot per observed regular-season week for later semantic validation.

This capability must not:

- connect to production PostgreSQL/Supabase;
- write any database row;
- invoke Prisma or Prisma generation;
- invoke Odds API, SGO, weather, or any other provider;
- write Bet, Game, MarketLine, Shadow, rating, lifecycle, or evaluation state;
- reconstruct or infer missing provider rows;
- treat retrospective data as prospective evidence.

## Provider call budget

The workflow has a hard ceiling of **32 CFBD calls**.

The dynamic plan is:

1. `/games?year=2025&seasonType=regular&classification=fbs`
2. `/lines?year=2025&seasonType=regular`
3. `/stats/game/advanced?year=2025&seasonType=regular`
4. `/ppa/games?year=2025&seasonType=regular&classification=fbs`
5. `/talent?year=2025`
6. `/player/returning?year=2025`
7. `/player/portal?year=2025`
8. `/recruiting/teams?year=2022`
9. `/recruiting/teams?year=2023`
10. `/recruiting/teams?year=2024`
11. `/recruiting/teams?year=2025`
12. `/ratings/elo?year=2025&seasonType=regular&preseason=true`
13+. one `/ratings/elo?year=2025&seasonType=regular&week=N` request for each observed regular-season FBS-vs-FBS week.

If the dynamically derived plan exceeds 32 calls, the job fails closed before the excess call is made.

## Evidence durability

Each provider response is stored as exact HTTP response bytes before parsing.

For every raw file the manifest records:

- file path;
- byte count;
- SHA-256 digest.

The final report records:

- repo commit SHA;
- capture start/end timestamps;
- exact provider-call count;
- request identifiers and query parameters;
- HTTP statuses and returned row counts;
- provider rate-limit headers when supplied;
- FBS-vs-FBS game and week coverage;
- market, advanced-stat, PPA, roster-prior, recruiting, and Elo coverage;
- zero-database-read / zero-database-write execution assertions.

Dependency installation must use `npm ci --ignore-scripts` so the repository
`postinstall` hook cannot invoke `prisma generate`.

The GitHub workflow uploads these artifacts with a 90-day retention period. A future durability decision may copy verified raw snapshots to longer-lived private storage; that is not authorized by this V1 contract.

## Leakage boundaries

### Historical betting lines

CFBD historical lines are **evaluation evidence only** in V1.

They may be used later to evaluate:

- ATS performance;
- market-implied margin error;
- closing-line comparison where the provider semantics are appropriate.

They must not be used as predictive features until a separate point-in-time market contract proves what information would have been available before each historical prediction timestamp.

### Scores and postgame game fields

Scores, postgame Elo, postgame win probability, and other postgame fields are outcome/evaluation data only.

They may never enter a historical feature vector for a prediction made before the game.

### Weekly Elo

Weekly CFBD Elo rows are archived in V1 but are **not declared point-in-time safe** merely because a week parameter exists.

Before Elo can become a historical predictor, a separate semantic audit must determine whether the returned Week N value represents:

- entering Week N;
- after Week N;
- or another stored convention.

Until that audit passes, weekly Elo is research evidence only.

### CFBD retrospective CORE

Retrospective CFBD CORE ratings are intentionally not captured in this snapshot. CFBD documents historical CORE values as retrospective results from the released methodology, not necessarily what would have been published at that historical moment.

They must not be represented as prospective historical evidence.

## 2025 holdout boundary

2025 has two sequential roles:

1. **Now:** pipeline verification only — coverage, mappings, hashes, missingness, endpoint semantics, and as-of feasibility.
2. **Later:** locked final holdout after the model family and thresholds are chosen using development/validation seasons.

Do not use 2025 game outcomes to choose:

- model formula;
- feature inclusion;
- edge threshold;
- BET/WATCH/PASS threshold;
- favorite/dog segmentation;
- ensemble weights.

## Next authorization boundary

A successful 2025 Snapshot V1 does **not** authorize:

- database persistence of the raw data;
- 2022/2023/2024 provider calls;
- model tuning;
- historical prediction generation;
- backtest result claims.

Those actions require the snapshot to be audited first and a separate next-step decision.
