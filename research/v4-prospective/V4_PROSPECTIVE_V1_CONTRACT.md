# V4 Prospective V1 — Research Comparator Contract

Status: **FROZEN FOR READ-ONLY PREVIEW IMPLEMENTATION**  
Model identity: `v4_prospective_v1`  
Season: 2026  
Parent: #160  
Implementation track: #167

## Purpose

`v4_prospective_v1` is a separately versioned **prospective comparator** for restoring the Hybrid/Super Tier A research lane without pretending the unrecoverable 2025 V4 feature snapshot can be reconstructed exactly.

It is not historical V4, is not an official model, and is not authorized for persistence or betting use by this contract.

## Initial Week 4 source frame

- FBS population: 138 authoritative 2026 FBS teams.
- Feature cutoff: completed Weeks **1–3 only**.
- Week 4 game data is forbidden from feature construction.
- Initial provider budget: **9 calls maximum**:
  - `/stats/game/advanced`: Weeks 1, 2, 3.
  - `/drives`: Weeks 1, 2, 3.
  - `/plays`: Weeks 1, 2, 3.
- The first six-call preview on 2026-09-24 is retained as failed source-audit evidence because current `/drives` score-state fields produced impossible single-drive score deltas.
- Raw provider payloads and digests must be retained in the preview artifact.

## Historical math preserved

The comparator preserves the actual historical V4 calculation behavior where recoverable:

- Success Rate weight: 50%.
- Explosiveness weight: 25%.
- Finishing Drives weight: 15%.
- Available Yards weight: 10%.
- Offense and defense are z-scored separately.
- Defensive direction conventions are preserved, including the historical V4 inversion applied to the already direction-adjusted defensive explosiveness grade.
- Team net is offense component minus defense component.
- Final team rating is:

```
rating = (netV4 - populationMeanNetV4) * 10
```

The historical implementation computed population net standard deviation for diagnostics but did **not** divide by it.

Game spread convention:

```
v4Hma = homeRating + (neutral ? 0 : 2.0) - awayRating
```

Positive HMA means home favored.

## Source semantics

### Success Rate

Source: CFBD `/stats/game/advanced`, Weeks 1–3 only.

For each team:

```
success = sum(gameSuccessRate * gamePlays) / sum(gamePlays)
```

Offense and defense are aggregated independently.

### Explosiveness

Source: the same Week 1–3 advanced-game payload.

Provider advanced-game explosiveness is weighted by estimated successful plays:

```
successfulPlays = successRate * plays
explosiveness = sum(gameExplosiveness * successfulPlays) / sum(successfulPlays)
```

To preserve historical TeamUnitGrades/V4 direction behavior:

- `offExplosivenessGrade = z(rawOffExplosiveness)`
- `defExplosivenessGrade = -z(rawDefExplosiveness)`

V4 then applies its historical second z-score/direction step to those grades.

The persisted September 8, 2026 TeamUnitGrades snapshot remains provenance/reference evidence only. Its underlying efficiency-game source was Week 1 only and is not used as if it represented Weeks 1–3.

### Finishing Drives

Sources:
- CFBD `/drives`, Weeks 1–3 only, for drive identity and scoring-opportunity field position.
- CFBD `/plays`, Weeks 1–3 only, for scoring provenance.

Scoring-opportunity field-position logic preserves the legacy implementation:

- use end yardline when available;
- otherwise use start yardline + yards;
- scoring opportunity when resulting 0–100 yardline is >= 60.

The first live preview proved current `/drives` `startOffenseScore/endOffenseScore` cannot be trusted for drive scoring. Those fields are therefore **not used** by `v4_prospective_v1`.

Play scoring contract:

1. Use all play rows for FBS-relevant games and preserve `driveId`.
2. Only rows marked `scoring=true` are treated as scoring events.
3. Point value is derived from play semantics, not cumulative score deltas:
   - made field goal = 3;
   - safety = 2;
   - standalone two-point conversion = 2;
   - touchdown = 6 plus explicitly successful PAT/two-point result when documented;
   - failed PAT/two-point attempt contributes 0 extra;
   - when a touchdown row mentions a two-point try without an explicit result, allowed point candidates are {6,8} and provider score state may resolve the ambiguity.
4. Scoring side is derived from play semantics:
   - ordinary offensive TD/FG/conversion => offense;
   - interception/fumble/block/kick/punt return TD and defensive conversion => defense;
   - provider-ambiguous safety and `Fumble Recovery (Own)` rows may use score-direction only to resolve which team scored.
5. Regulation scoring rows are ordered by period then game clock descending. Overtime uses provider wallclock, then drive/play order as fallback.
6. Cumulative provider score state is **not** the point-value source. It is used only as a tie-breaker/consistency signal.
7. Any event whose value or scorer remains ambiguous fails the frame closed.
8. Credit the resolved event points to scoring team + `driveId`.
9. A drive's offense points are the points credited to the drive offense team:
   - defensive-return TD on that drive therefore contributes 0 offensive points;
   - non-scoring drive contributes 0 points.
10. Every FBS-relevant drive must have matching play-level `driveId` coverage.
11. The reconstructed final score for every completed Week 1–3 FBS game must exactly equal the persisted `Game.homeScore/awayScore` result after provider/internal home-away mapping. Any mismatch fails the full frame closed.

For a team:

```
pointsPerScoringOpportunity =
  sum(playDerivedOffensePoints on every qualifying drive) /
  qualifyingDriveCount
```

Every qualifying drive remains in the denominator. If points cannot be established for any qualifying drive, that team's Finishing Drives feature is unavailable.

### Available Yards

Source: CFBD `/drives`, Weeks 1–3 only.

Preserve legacy calculation:

```
available = 100 - startYardline
gained = max(0, drive.yards)
pct = clamp(gained / available, 0, 1)
```

Use mean drive percentage independently for offense and defense.

## Population / fail-closed rules

The initial Week 4 frame is valid only if:

- authoritative FBS count is exactly 138;
- every FBS team maps to exactly one CFBD provider name;
- every FBS team has finite offense and defense Success;
- every FBS team has finite offense and defense Explosiveness;
- every FBS team has finite offense and defense Finishing Drives;
- every FBS team has finite offense and defense Available Yards.

No missing value is silently zero-filled or mean-imputed.

If the 138-team frame is incomplete, ratings are not considered preview-eligible.

## Week 4 decision preview

Prediction timestamp is the workflow observation time.

For each Week 4 game:

- if kickoff <= observation time: `POST_KICKOFF_UNAVAILABLE`;
- otherwise select the newest persisted team-sided spread market at or before observation time;
- market must be <= 30 minutes old;
- no future-line fallback;
- no market reconstruction.

Decision:

```
edgeHma = v4Hma - marketHma
absEdge = abs(edgeHma)

absEdge < 0.1 -> VERIFIED_NO_SELECTION
edgeHma >= 0.1 -> HOME
edgeHma <= -0.1 -> AWAY
```

The preview must not be used retroactively to qualify Hybrid snapshots created before this comparator evidence exists.

## Required artifact provenance

The read-only preview artifact must include:

- exact repository SHA;
- observation timestamp;
- provider-call ledger;
- provider payload SHA-256 digests;
- raw advanced, drive, and play provider payloads;
- play scoring ledger with semantic-event, score-state mismatch, drive-ID, and final-score validation diagnostics;
- 138-team mapping audit;
- team raw features;
- z-score summaries;
- team comparator ratings;
- Week 4 game decisions/unavailable reasons;
- selected market-line provenance;
- `safeToPersistComparator=false`;
- `persistenceAuthorized=false`;
- `superTierAActivationAuthorized=false`;
- `historicalBackfillAuthorized=false`.

## Explicitly not authorized

This contract does not authorize:

- TeamSeasonRating writes;
- Bet writes;
- Shadow capture writes;
- Generic Shadow allowlist changes;
- Super Tier A qualification activation;
- Core V1 changes;
- Hybrid V2 changes;
- Official Card changes;
- scheduled comparator automation;
- retrospective Week 1–4 comparator decisions.

Any persistence or activation requires a separate Bobby decision after the read-only preview is independently audited.
