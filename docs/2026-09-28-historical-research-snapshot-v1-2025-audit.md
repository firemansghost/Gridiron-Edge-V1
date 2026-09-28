# 2025 Historical Research Snapshot V1 — Independent Audit Closeout

**Date:** 2026-09-28  
**Run:** 36433016296  
**Source SHA:** `f17b6876ddc8d660ce6b5572ef8742f4e7f9cea7`  
**Workflow:** Capture 2025 Historical Research Snapshot V1 (Manual, Guarded)

## Bottom line

The first 2025 historical snapshot produced valid, useful research evidence.

The raw capture itself is retained as the immutable GitHub Actions artifact from run
`36433016296`. All provider calls succeeded and all manifested raw/report files
independently matched their recorded SHA-256 digests.

The run's provider evidence is usable. Two reporting/guardrail repairs were identified
by independent audit before expanding the capability to another season:

1. `npm ci` invoked the repository `postinstall` hook and therefore ran
   `prisma generate`. No Prisma client was instantiated and no database connection or
   mutation occurred, but this violated the stricter V1 "do not invoke Prisma" contract.
2. The CFBD advanced/PPA endpoints returned broader provider populations than the
   canonical FBS-vs-FBS universe. Canonical coverage was complete after intersection
   with the captured games payload, but the original report printed the broad counts
   rather than the canonical counts.

These are guardrail/reporting issues, not evidence-loss issues.

## Provider usage

- CFBD calls attempted: **28**
- CFBD calls succeeded: **28**
- HTTP failures: **0**
- hard ceiling: **32**
- visible CFBD rate-limit headers: **none supplied**
- database reads: **0**
- database writes: **0**
- Odds API / SGO / weather calls: **0**

## Artifact integrity

The artifact contained:

- **28** raw provider response files
- **1** report file recorded in the manifest
- manifest itself

Independent SHA-256 verification found:

- manifested files checked: **29**
- hash mismatches: **0**
- byte-count mismatches: **0**

## Canonical 2025 FBS universe

From the captured regular-season games payload:

- provider game rows: **888**
- canonical FBS-vs-FBS regular-season games: **762**
- completed canonical games: **762 / 762**
- canonical FBS teams represented: **136**
- observed weeks: **1–16**

The CFBD `classification=fbs` games request includes games where an FBS team plays an
FCS opponent. The V1 canonical universe therefore requires the explicit
`homeClassification=fbs AND awayClassification=fbs` filter.

## Historical market coverage

CFBD historical lines:

- canonical FBS-vs-FBS games with line rows: **762 / 762**
- minimum providers per canonical game: **2**
- median providers per canonical game: **3**
- maximum providers per canonical game: **3**

Provider game coverage:

- Bovada: **762 / 762**
- ESPN Bet: **762 / 762**
- DraftKings: **715 / 762**

Historical line evidence remains **evaluation-only** until a separate point-in-time
market contract is frozen.

## Advanced efficiency coverage

Raw provider result:

- team-game rows: **3,216**
- unique provider games: **1,608**

After intersection with the canonical 762 FBS-vs-FBS game IDs:

- canonical team-game rows: **1,524**
- canonical unique games: **762 / 762**
- expected two team rows per canonical game: **1,524 / 1,524**

Therefore the 2025 canonical advanced-stat game coverage is complete.

## PPA coverage

Raw provider result:

- team-game rows: **1,650**
- unique provider games: **888**

After canonical intersection:

- canonical team-game rows: **1,524**
- canonical unique games: **762 / 762**
- expected two team rows per canonical game: **1,524 / 1,524**

Therefore the 2025 canonical PPA game coverage is complete.

## Preseason prior coverage

### Team talent

- rows: **134**
- canonical matches: **134 / 136**
- missing: **Air Force, Navy**

Do not coerce these two teams to zero.

### Returning production

- rows: **134**
- canonical matches: **134 / 136**
- missing: **Delaware, Missouri State**

Do not coerce these two teams to zero.

### Preseason Elo

- rows: **135**
- canonical matches: **135 / 136**
- missing: **UNLV**

Do not reconstruct the missing UNLV preseason value without a separate rule.

### Recruiting team classes

Canonical team coverage by class:

- 2022: **133 / 136**
  - missing: Delaware, Florida International, Kennesaw State
- 2023: **134 / 136**
  - missing: Delaware, Missouri State
- 2024: **135 / 136**
  - missing: Missouri State
- 2025: **136 / 136**

These gaps are consistent with transition/new-FBS and provider-history boundaries and
must remain explicit missingness until separately modeled.

### Transfer portal

- raw 2025 portal entries: **4,499**
- canonical teams appearing as an origin or destination: **136 / 136**

Portal aggregation semantics still require a separate point-in-time feature contract.

## Weekly Elo semantic audit

The snapshot archived one CFBD Elo response for each observed week 1–16.

- preseason rows: **135**
- weekly rows: **136** for every Week 1–16 snapshot

Independent comparison against the captured games payload strongly indicates that
`/ratings/elo?year=2025&week=N` is an **end-of-Week-N** snapshot rather than an
entering-Week-N value:

- same-week pregame exact matches: **18 / 1,524** comparable FBS team-games
- same-week postgame exact matches: **1,517 / 1,524**
- all seven same-week postgame mismatches occurred in Week 1

This is strong evidence that a historical Week N predictor should use the prior
available snapshot (for example, Week N-1 Elo for Week N and preseason Elo for Week 1),
not the Week N endpoint itself.

That rule is **not frozen by this audit**. A separate Elo point-in-time contract must
formalize bye-week handling, Week 1 anomalies, newly classified teams, and missing
preseason Elo before Elo is admitted to historical predictive features.

## 2025 holdout boundary

The 2025 season remains:

1. usable now for **pipeline verification, coverage, missingness, and endpoint-semantic
   auditing**;
2. unavailable for tuning formulas, thresholds, feature selection, ensemble weights, or
   BET/WATCH/PASS rules;
3. reserved as the later final holdout after development and validation are completed.

## Required repair before the next season

Before any 2022 provider capture:

- use `npm ci --ignore-scripts` so no Prisma lifecycle hook runs;
- report canonical advanced/PPA coverage, not only broad provider counts;
- report canonical team-prior coverage and explicit missing teams;
- preserve the same raw-byte / SHA-256 / provider-call-budget contract.

No second 2025 provider capture is required merely to repair those reporting and
workflow guardrails because the original raw artifact is intact and independently
verified.
