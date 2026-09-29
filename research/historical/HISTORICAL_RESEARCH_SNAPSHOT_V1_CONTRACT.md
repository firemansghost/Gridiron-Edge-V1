# Historical Research Snapshot V1 — Authorized Season Contract

**Status:** RESEARCH ONLY / PREVIEW-ARTIFACT ONLY  
**Authorized planner seasons:** 2025 (audited pipeline-verification / later holdout), 2022 (audited development corpus), 2023 (audited development corpus), and 2024 (validation-source capability)  
**2024 execution boundary:** capability may be merged, but the provider capture remains unauthorized until a separate explicit user authorization.

## Purpose

Historical Research Snapshot V1 exists to archive exact CFBD provider evidence and
measure historical coverage before any historical-model reconstruction, feature tuning,
prediction generation, or backtest persistence.

The 2025 capture proved the pipeline and remains the eventual untouched holdout. The
2022 and 2023 development-corpus captures have both passed independent artifact and
coverage audit. The next step is development-corpus contract design, not another season
capture.

## Scope

This capability may:

- call College Football Data (CFBD) only;
- archive exact raw provider bytes as GitHub Actions artifacts;
- compute hashes, row counts, game counts, and coverage diagnostics;
- derive the authorized season's regular-season FBS-vs-FBS week set from the CFBD
  `/games` payload;
- capture one CFBD Elo snapshot per observed regular-season week for later semantic
  validation;
- report provider-wide counts separately from canonical FBS-vs-FBS coverage;
- report canonical team-prior missingness explicitly.

This capability must not:

- connect to production PostgreSQL/Supabase;
- read or write any production database row;
- invoke Prisma or Prisma generation;
- invoke Odds API, SGO, weather, or any other provider;
- write Bet, Game, MarketLine, Shadow, rating, lifecycle, or evaluation state;
- reconstruct or infer missing provider rows;
- coerce missing historical priors to zero;
- treat retrospective data as prospective evidence;
- generate historical predictions or tune a model.

## Season authorization

The shared V1 planner accepts exactly:

- **2025** — already captured and independently audited; retained for pipeline
  verification now and the final untouched holdout later.
- **2022** — captured and independently audited as the first development corpus.
- **2023** — captured and independently audited as the second development corpus.
- **2024** — validation-source capability only. The planner/workflow may exist after the
  reviewed implementation slice, but the provider run remains a separate explicit
  authorization boundary.

The shared planner must fail closed for unsupported seasons outside 2022–2025.

Each season uses a season-specific manual guarded workflow and exact confirmation:

- 2025: `CAPTURE_2025_HISTORICAL_RESEARCH_SNAPSHOT_PREVIEW`
- 2022: `CAPTURE_2022_HISTORICAL_RESEARCH_SNAPSHOT_PREVIEW`
- 2023: `CAPTURE_2023_HISTORICAL_RESEARCH_SNAPSHOT_PREVIEW`
- 2024: `CAPTURE_2024_HISTORICAL_RESEARCH_SNAPSHOT_PREVIEW`

A workflow must run from `refs/heads/main` and require an exact
`expected_main_sha`.

## Canonical historical target definition

For snapshot coverage and downstream historical target identity, a canonical game is:

- season equals the authorized season;
- season type = regular;
- home classification = FBS;
- away classification = FBS;
- `completed = true`.

Incomplete, canceled, or otherwise unfinished FBS-vs-FBS rows remain archived as raw
provider evidence but are **not** canonical target games.

Accordingly:

- canonical game IDs use completed games only;
- canonical team identity is derived from completed canonical games only;
- the observed-week set used for weekly Elo capture is derived from completed
  canonical games only;
- advanced/PPA canonical coverage denominators use completed canonical games only;
- the mere presence of an incomplete FBS-vs-FBS row is informational and is not itself
  a snapshot QA failure.

This definition aligns the shared snapshot implementation with the frozen 2024
Historical Validation V1 contract.

## Provider call budget

Every run has a hard ceiling of **32 CFBD calls**.

For an authorized season `Y`, the dynamic plan is:

1. `/games?year=Y&seasonType=regular&classification=fbs`
2. `/lines?year=Y&seasonType=regular`
3. `/stats/game/advanced?year=Y&seasonType=regular`
4. `/ppa/games?year=Y&seasonType=regular&classification=fbs`
5. `/talent?year=Y`
6. `/player/returning?year=Y`
7. `/player/portal?year=Y`
8–11. four recruiting-team classes ending in `Y`
12. `/ratings/elo?year=Y&seasonType=regular&preseason=true`
13+. one `/ratings/elo?year=Y&seasonType=regular&week=N` request for each
observed regular-season FBS-vs-FBS week.

For 2022, the recruiting classes are **2019–2022**. For 2023, they are **2020–2023**.

If the dynamically derived plan exceeds 32 calls, the job fails closed before the
excess call is made.

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
- provider-wide and canonical advanced/PPA coverage;
- canonical talent, returning-production, recruiting, and preseason-Elo missingness;
- zero-database-read / zero-database-write execution assertions;
- season role.

Dependency installation must use `npm ci --ignore-scripts` so the repository
`postinstall` hook cannot invoke `prisma generate`.

Because ignored lifecycle scripts make `tsx`/esbuild an unsafe runtime dependency for
this guarded capture path, the workflow must compile the capture entrypoint with
`tsc` and execute the emitted JavaScript with plain `node`.

The GitHub workflow uploads evidence with 90-day retention. A future durability
decision may copy verified raw snapshots to longer-lived private storage; that is not
authorized by V1.

## Leakage boundaries

### Historical betting lines

CFBD historical lines are **evaluation evidence only** in V1.

They may later be used to evaluate ATS performance, market-implied margin error, and
closing-line comparison where provider semantics support it. They must not enter
predictive features until a separate point-in-time market contract proves what was
available before each historical prediction timestamp.

### Scores and postgame fields

Scores, postgame Elo, postgame win probability, and other postgame fields are
outcome/evaluation data only. They may never enter a feature vector for a prediction
made before the game.

### Weekly Elo

Weekly CFBD Elo rows are **not same-week point-in-time safe** merely because a week
parameter exists.

Independent 2025, 2022, and 2023 audits establish that Week N behaves as an
**end-of-provider-Week-N** state. The 2022 and 2023 audits verify exact final-game
postgame matching and exact bye-week carry-forward behavior.

Historical Elo feature mapping is now frozen separately in
[`HISTORICAL_ELO_PIT_V1_CONTRACT.md`](./HISTORICAL_ELO_PIT_V1_CONTRACT.md):

- Week 1 -> preseason Elo;
- Week N (N >= 2) -> Week N-1 Elo;
- same-week Week N Elo -> prohibited.

This is a leakage-safe provider-week mapping, not proof of exact historical wall-clock
publication time.

### CFBD retrospective CORE

Retrospective CFBD CORE ratings are intentionally not captured. Historical CORE values
must not be represented as prospective historical evidence without a separate
point-in-time proof.

## 2025 holdout boundary

2025 remains unavailable for choosing:

- model formula;
- feature inclusion;
- edge threshold;
- BET/WATCH/PASS threshold;
- favorite/dog segmentation;
- ensemble weights.

Its outcomes may be used now only for pipeline verification, coverage, missingness,
and endpoint-semantic auditing. The season is reserved for the later final holdout.

## 2022 development boundary

The 2022 provider capture is now an **independently audited development corpus**.

Audit closeout is recorded in
[`docs/2026-09-28-historical-research-snapshot-v1-2022-audit.md`](../../docs/2026-09-28-historical-research-snapshot-v1-2022-audit.md).

That audit does **not** by itself authorize model tuning, historical prediction
generation, database persistence, or later-season provider calls.

## 2023 development boundary

The 2023 provider capture is now an **independently audited development corpus**.

Audit closeout is recorded in
[`docs/2026-09-28-historical-research-snapshot-v1-2023-audit.md`](../../docs/2026-09-28-historical-research-snapshot-v1-2023-audit.md).

The audit confirms complete canonical game/stat/line coverage for the captured 2023
universe while preserving explicit missingness in returning production and one
historical recruiting class. It also independently reconfirms Historical Elo PIT V1.

That audit does **not** by itself authorize model tuning, historical prediction
generation, database persistence, or later-season provider calls.

## 2024 validation boundary

2024 Historical Validation V1 is now frozen separately in
[`HISTORICAL_VALIDATION_V1_CONTRACT.md`](./HISTORICAL_VALIDATION_V1_CONTRACT.md).

That contract freezes the future validation sequence and permits a later reviewed
implementation slice to add 2024 snapshot capability.

It does **not** itself authorize the 2024 provider run.

After the reviewed 2024 capability slice is merged:

- 2024 may be accepted by the shared snapshot planner;
- a dedicated manual 2024 capture workflow may exist;
- the exact 2024 confirmation is
  `CAPTURE_2024_HISTORICAL_RESEARCH_SNAPSHOT_PREVIEW`;
- **no 2024 provider call is authorized merely by the merge**.

A separate explicit user authorization remains required before that provider run.

## Continuing leakage boundaries

The audited historical snapshots do **not** authorize:

- unguarded 2024 provider calls;
- database persistence of raw historical data;
- historical market inputs;
- candidate retuning;
- use of 2025 for development, validation, or tuning.

2025 remains locked for the later final holdout.
