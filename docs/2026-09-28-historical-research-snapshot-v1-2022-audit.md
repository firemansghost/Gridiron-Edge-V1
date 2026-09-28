# 2022 Historical Research Snapshot V1 — Independent Audit Closeout

**Date:** 2026-09-28  
**Run:** 36464140881  
**Source SHA:** `e8a2b184c88f39866f29b865a3fd65ad82f99ec0`  
**Workflow:** Capture 2022 Historical Research Snapshot V1 (Manual, Guarded)

## Bottom line

The 2022 Historical Research Snapshot V1 is valid development-corpus evidence.

The run completed from the exact approved `main` SHA after the no-esbuild runtime
repair. All provider calls succeeded, the artifact uploaded successfully, and every
manifested raw/report file independently matched its recorded byte count and SHA-256
digest.

The raw capture remains the immutable GitHub Actions artifact from run
`36464140881`.

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

The 2022 call count is one lower than the audited 2025 capture because the observed
regular-season FBS-vs-FBS week set is **1–15** rather than **1–16**.

## Artifact integrity

GitHub uploaded:

- **27** raw provider response files
- **1** report file
- manifest itself

The artifact ZIP was **1,018,316 bytes** with GitHub-reported SHA-256:

`7a5b76b681b0ef1873853956cdc5b39cb3581675cf84e6ca6f972141ea2dfe99`

Independent verification of the downloaded ZIP produced the exact same digest.

The manifest contains **28** entries (27 raw files + report). Independent verification
found:

- manifested files checked: **28**
- hash mismatches: **0**
- byte-count mismatches: **0**

## Canonical 2022 FBS universe

From the captured regular-season games payload:

- provider game rows: **854**
- canonical FBS-vs-FBS regular-season games: **734**
- completed canonical games: **734 / 734**
- canonical FBS teams represented: **131**
- observed weeks: **1–15**

As with 2025, the CFBD `classification=fbs` games request also includes FBS-vs-FCS
games. The canonical historical universe therefore still requires the explicit
`homeClassification=fbs AND awayClassification=fbs` intersection.

## Historical market coverage

CFBD historical lines:

- canonical FBS-vs-FBS games with line rows: **734 / 734**

Provider coverage across canonical games:

- Bovada: **734 / 734**
- teamrankings: **724 / 734**
- consensus: **723 / 734**
- William Hill (New Jersey): **713 / 734**
- Caesars Sportsbook (Colorado): **10 / 734**

Counting identifiable sportsbook providers only
(Bovada / William Hill NJ / Caesars Colorado):

- minimum books per canonical game: **1**
- median books per canonical game: **2**
- maximum books per canonical game: **2**
- games with two books: **723 / 734**
- games with one book: **11 / 734**

Therefore line-game coverage is complete, but historical market depth is not uniform.
Historical line evidence remains **evaluation-only** until a separate market
point-in-time contract proves timestamp-safe usage.

## Advanced efficiency coverage

Raw provider result:

- team-game rows: **2,822**
- unique provider games: **1,411**

After intersection with the canonical 734 FBS-vs-FBS game IDs:

- canonical team-game rows: **1,468**
- canonical unique games: **734 / 734**
- expected two team rows per canonical game: **1,468 / 1,468**

Canonical 2022 advanced-stat coverage is complete.

## PPA coverage

Raw provider result:

- team-game rows: **1,588**
- unique provider games: **854**

After canonical intersection:

- canonical team-game rows: **1,468**
- canonical unique games: **734 / 734**
- expected two team rows per canonical game: **1,468 / 1,468**

Canonical 2022 PPA coverage is complete.

## Preseason prior coverage

### Team talent

- provider rows: **233**
- canonical matches: **131 / 131**
- missing canonical teams: **none**

### Returning production

- provider rows: **130**
- canonical matches: **130 / 131**
- missing: **James Madison**

Do not coerce James Madison returning production to zero.

### Preseason Elo

- rows: **131**
- canonical matches: **131 / 131**
- missing canonical teams: **none**

### Recruiting team classes

Canonical team coverage by class:

- 2019: **131 / 131**
- 2020: **131 / 131**
- 2021: **131 / 131**
- 2022: **130 / 131**
  - missing: **Florida International**

Do not reconstruct or zero-fill the missing 2022 Florida International recruiting row.

### Transfer portal

- raw 2022 portal entries: **2,273**
- canonical teams appearing as an origin or destination: **131 / 131**
- destination-null entries: **906**
- rating-null entries: **1,230**
- transfer-date-null entries: **0**

Portal aggregation remains a separate feature-semantics problem. Team presence alone is
not authorization to create a predictive transfer feature.

## Weekly Elo semantic audit

The snapshot archived one CFBD Elo response for preseason and each observed provider
week 1–15.

- preseason rows: **131**
- weekly rows: **131** for every Week 1–15 snapshot

The 2022 evidence resolves the main semantic questions left open by the 2025 audit.

### Same-week FBS-vs-FBS game comparison

Across **1,468** canonical FBS-vs-FBS team-games:

- same-week postgame exact matches: **1,455 / 1,468**
- same-week postgame deviations: **13**
- all **13** deviations occurred in provider Week 1

Every Week 1 deviation is explained by the team playing another regular-season game
later in the same provider week. The weekly Elo snapshot matches the team's later,
final game state for that week rather than the earlier canonical game's postgame state.

This is direct evidence that `/ratings/elo?year=2022&week=N` is not an
entering-Week-N value.

### Final-game-of-week comparison

For each canonical team and provider week, the audit selected that team's final
regular-season game in the provider week, including FBS-vs-FCS games when present.

- team-weeks with at least one regular-season game: **1,572**
- comparable final-game postgame Elo values: **1,570**
- weekly snapshots matching final-game postgame Elo: **1,570 / 1,570**
- mismatches: **0**

Two played team-weeks lacked game-level postgame Elo:

- LSU, Week 2 vs Southern
- New Mexico State, Week 14 vs Valparaiso

In both cases the weekly Elo snapshot equaled the prior weekly snapshot rather than
supplying evidence for a reconstructed game-level postgame value.

### Bye-week carry-forward

For canonical teams with no regular-season game in a provider week:

- comparable bye team-weeks: **393**
- weekly snapshot equal to prior snapshot: **393 / 393**
- differences: **0**

Therefore the provider's weekly Elo endpoint behaves as a deterministic
**end-of-provider-week state** for the captured 2022 season:

- played team → final available postgame state for the week;
- bye team → prior state carried forward.

## Historical Elo consequence

The 2022 evidence, combined with the previously audited 2025 behavior, is sufficient to
freeze a separate historical Elo point-in-time mapping contract:

- Week 1 historical prediction input may use **preseason Elo only**.
- Week N (N >= 2) historical prediction input may use **Week N-1 Elo only**.
- Same-week Week N Elo is prohibited because it contains same-week outcomes.
- Bye weeks naturally carry forward through the prior weekly snapshot.
- Missing preseason/prior-week Elo remains missing; do not reconstruct it from later
  snapshots or game outcomes.
- The rule is a leakage-safe **provider-week mapping**, not proof of the historical
  wall-clock publication timestamp of every CFBD rating.

The frozen mapping is documented separately in
`research/historical/HISTORICAL_ELO_PIT_V1_CONTRACT.md`.

## 2022 development boundary

The 2022 season is now an **audited development corpus**.

This closeout does not by itself authorize:

- model formula tuning;
- feature inclusion;
- edge thresholds;
- BET/WATCH/PASS thresholds;
- ensemble weighting;
- database persistence;
- historical prediction generation;
- 2023 or 2024 provider calls.

## Next research step

The planned sequence remains:

**2022 capture/audit → 2023 capture/audit → build/tune on 2022–2023 → validate on
2024 → unlock 2025 only for the final holdout.**

The next provider-facing engineering slice should therefore be a separately guarded
**2023 Historical Research Snapshot V1 capability**, preserving the repaired
no-lifecycle-script / `tsc -> node` runtime and the same artifact-integrity contract.
