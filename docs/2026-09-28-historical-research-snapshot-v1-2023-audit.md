# 2023 Historical Research Snapshot V1 — Independent Audit Closeout

**Date:** 2026-09-28  
**Run:** 36470674904  
**Source SHA:** `7150e263284255e67adf87521fcb710ec97a91a9`  
**Workflow:** Capture 2023 Historical Research Snapshot V1 (Manual, Guarded)

## Bottom line

The 2023 Historical Research Snapshot V1 is valid development-corpus evidence.

The run completed from the exact approved `main` SHA. All provider calls succeeded,
the artifact uploaded successfully, and every manifested raw/report file independently
matched its recorded byte count and SHA-256 digest.

The raw capture remains the immutable GitHub Actions artifact from run
`36470674904`.

No database, Prisma, Odds API, SGO, weather, rating, shadow, Bet, Game, lifecycle, or
migration mutation path was invoked.

## Provider usage

- CFBD calls attempted: **27**
- CFBD calls succeeded: **27**
- HTTP failures: **0**
- hard ceiling: **32**
- visible CFBD rate-limit headers: **none supplied**
- database reads: **0**
- database writes: **0**
- Prisma client instantiated: **no**
- `prisma generate` invoked: **no**
- Odds API / SGO / weather calls: **0**

## Artifact integrity

GitHub uploaded:

- **27** raw provider response files
- **1** report file
- manifest itself

The artifact ZIP was **1,028,635 bytes** with GitHub-reported SHA-256:

`479d5dc4481a6f7ab7b2c034976b8845814121cfc0f11c0b18a8166c61fc5bd4`

Independent verification of the downloaded ZIP produced the exact same digest.

The manifest contains **28** entries (27 raw files + report). Independent verification
found:

- manifested files checked: **28**
- hash mismatches: **0**
- byte-count mismatches: **0**

A suspected duplicate-Elo-artifact issue was also checked directly against the archived
2022 ZIP. It was a false alarm: the 2022 and 2023 Elo files have different bytes,
different SHA-256 digests, and the correct season values in their payloads.

## Canonical 2023 FBS universe

From the captured regular-season games payload:

- provider game rows: **868**
- canonical FBS-vs-FBS regular-season games: **750**
- completed canonical games: **750 / 750**
- canonical FBS teams represented: **133**
- observed weeks: **1–15**

The CFBD `classification=fbs` games request still includes FBS-vs-FCS games.
Canonical research therefore continues to require the explicit
`homeClassification=fbs AND awayClassification=fbs` intersection.

## Historical market coverage

CFBD historical lines:

- provider line-game rows: **1,350**
- canonical FBS-vs-FBS line rows: **750**
- canonical games with line evidence: **750 / 750**

Provider game coverage over the 750 canonical games:

- Bovada: **750**
- DraftKings: **705**
- William Hill (New Jersey): **462**
- ESPN Bet: **246**
- Caesars Sportsbook (Colorado): **22**
- teamrankings: **52**
- consensus: **29**

Treating `teamrankings` and `consensus` as non-sportsbook aggregators, identifiable
sportsbook depth per canonical game is:

- minimum: **2**
- median: **3**
- maximum: **3**
- games with two identifiable books: **65**
- games with three identifiable books: **685**

Historical market evidence remains **evaluation-only** until a separate market
point-in-time contract establishes timestamp-safe usage.

## Advanced efficiency coverage

Raw provider result:

- team-game rows: **2,850**
- unique provider games: **1,425**

After intersection with the canonical 750 FBS-vs-FBS game IDs:

- canonical team-game rows: **1,500**
- canonical unique games: **750 / 750**
- expected two team rows per canonical game: **1,500 / 1,500**

Canonical 2023 advanced-stat coverage is complete.

## PPA coverage

Raw provider result:

- team-game rows: **1,618**
- unique provider games: **868**

After canonical intersection:

- canonical team-game rows: **1,500**
- canonical unique games: **750 / 750**
- expected two team rows per canonical game: **1,500 / 1,500**

Canonical 2023 PPA coverage is complete.

## Preseason prior coverage

### Team talent

- provider rows: **238**
- canonical matches: **133 / 133**
- missing canonical teams: **none**

### Returning production

- provider rows: **131**
- canonical matches: **131 / 133**
- missing:
  - Jacksonville State
  - Sam Houston

Do not coerce either missing returning-production row to zero.

### Preseason Elo

- rows: **133**
- canonical matches: **133 / 133**
- missing canonical teams: **none**

### Recruiting team classes

Canonical team coverage by class:

- 2020: **133 / 133**
- 2021: **133 / 133**
- 2022: **132 / 133**
  - missing: Florida International
- 2023: **133 / 133**

Do not reconstruct or zero-fill the missing 2022 Florida International recruiting row.

### Transfer portal

- raw 2023 portal entries: **2,502**
- canonical teams appearing as an origin or destination: **133 / 133**
- destination-null entries: **895**
- rating-null entries: **1,611**
- transfer-date-null entries: **0**

Portal aggregation semantics remain a separate feature-contract problem. Complete team
presence does not imply complete or point-in-time-safe player-level feature coverage.

## Weekly Elo semantic audit

The snapshot archived one CFBD Elo response for preseason and each observed provider
week 1–15.

- preseason rows: **133**
- weekly rows: **133** for every Week 1–15 snapshot

The 2023 evidence independently confirms the already-frozen Historical Elo PIT V1
semantics.

### Same-week canonical-game comparison

Across **1,500** canonical FBS-vs-FBS team-games:

- same-week postgame exact matches: **1,487 / 1,500**
- same-week postgame deviations: **13**
- all **13** deviations occurred in provider Week 1

Those 13 teams all had another regular-season game later in the same provider week.
The Week 1 Elo endpoint reflects the team's later/final game state rather than the
earlier canonical game's postgame state.

### Final-game-of-week comparison

For each canonical team and provider week, the audit selected that team's final
regular-season game in the provider week, including FBS-vs-FCS games when present.

- team-weeks with at least one regular-season game: **1,605**
- comparable final-game postgame Elo values: **1,605**
- weekly snapshots matching final-game postgame Elo: **1,605 / 1,605**
- mismatches: **0**

There were **13** multi-game team-weeks, all in provider Week 1.

This confirms that Week N Elo is an **end-of-provider-week** state and is not eligible
as a same-week pregame feature.

### Bye-week carry-forward

For canonical teams with no regular-season game in a provider week:

- comparable bye team-weeks: **390**
- weekly snapshot equal to the prior snapshot: **390 / 390**
- differences: **0**
- missing comparisons: **0**

This independently confirms the frozen bye handling: prior-week Elo already carries
the provider's last state forward.

## Game-level pregame Elo caution

The frozen Historical Elo PIT V1 feature source is:

- Week 1 -> preseason Elo;
- Week N (N >= 2) -> Week N-1 weekly Elo.

The 2023 audit compared that authorized source with the games payload's
`homePregameElo` / `awayPregameElo` fields across the 1,500 canonical team-games:

- comparable team-games: **1,500**
- exact matches: **1,410**
- differences: **90**

Therefore game-level pregame Elo fields are **not interchangeable** with the frozen
historical PIT source.

Do not:

- replace the frozen weekly-source mapping with game-level `pregameElo`;
- force the historical feature corpus to equal the games payload's pregame field;
- infer that the 90 differences are capture errors;
- reconstruct one source from the other.

The games payload Elo fields remain semantic-audit/evaluation evidence only, exactly as
specified by Historical Elo PIT V1.

## 2023 development boundary

The 2023 season is now an **independently audited development corpus** alongside 2022.

This closeout does not by itself authorize:

- historical feature-corpus implementation;
- model formula tuning;
- feature selection;
- edge thresholds;
- BET/WATCH/PASS thresholds;
- ensemble weighting;
- database persistence;
- 2024 provider capture;
- 2025 development or tuning.

## Next research step

The planned sequence now advances from capture/audit into controlled development:

**audited 2022 + audited 2023 -> freeze a point-in-time-safe development-corpus
construction contract -> build/tune only on 2022–2023 -> freeze the candidate model ->
capture/use 2024 for validation -> only then unlock 2025 for final holdout evaluation.**

The immediate next engineering/research slice should define the **2022–2023 Historical
Development Corpus V1 contract** before any feature computation or model tuning begins.
