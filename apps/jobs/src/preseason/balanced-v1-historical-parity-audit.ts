/**
 * Phase 2C-2H-5 — Read-only Balanced V1 historical parity forensic.
 *
 * Pure logic only. No Prisma, providers, Odds, or persistence.
 * Reuses computeBalancedV1Ratings (shared with compute_ratings_balanced writer).
 *
 * Architecture finding (pending exact parity proof):
 * Stored production modelVersion='v1' appears to be Balanced V1 (25/25/25/25 × 14.0).
 * compute_ratings_v1.ts = LEGACY / historical alternate V1 computation
 * (identification only — do not delete, rename modelVersion, or change formulas).
 */

import {
  BALANCED_MODEL_VERSION,
  BALANCED_V1_CALIBRATION_FACTOR,
  BALANCED_V1_UPSERT_UPDATE_FIELDS,
  BALANCED_V1_UPSERT_UPDATE_LEAVES_UNCHANGED,
  BALANCED_WEIGHT_EPA,
  BALANCED_WEIGHT_NET_POINTS,
  BALANCED_WEIGHT_TALENT,
  BALANCED_WEIGHT_WIN_PCT,
  BALANCED_WRITER_CAN_LEAVE_LEGACY_METADATA,
  aggregateBalancedEpa,
  aggregateBalancedGameStats,
  buildBalancedTeamMetrics,
  computeBalancedV1Ratings,
  type BalancedEpaStatRow,
  type BalancedGameRow,
  type BalancedTalentRow,
  type BalancedV1ComputedRating,
} from '../ratings/compute_balanced_v1';

export const COMPARISON_SEASON = 2025 as const;
export const MODEL_VERSION = BALANCED_MODEL_VERSION;
/** Authoritative 2025 FBS population size (TeamMembership). Do not infer from ratings. */
export const EXPECTED_2025_FBS_COUNT = 136 as const;

export {
  BALANCED_V1_CALIBRATION_FACTOR,
  BALANCED_V1_UPSERT_UPDATE_FIELDS,
  BALANCED_V1_UPSERT_UPDATE_LEAVES_UNCHANGED,
  BALANCED_WEIGHT_EPA,
  BALANCED_WEIGHT_NET_POINTS,
  BALANCED_WEIGHT_TALENT,
  BALANCED_WEIGHT_WIN_PCT,
  BALANCED_WRITER_CAN_LEAVE_LEGACY_METADATA,
};

/** Spread consumer evidence — documented only; no web behavior changes in this phase. */
export const CORE_V1_SPREAD_BALANCED_SEMANTICS = {
  whenV1RowsExist: true,
  usesV1PowerRatingsDirectly: true,
  additionalScaling: false,
  ratingDiff: 'homeV1 - awayV1',
  coreSpreadHma: 'ratingDiff + HFA',
  sourceCommentLabel: 'Balanced V1 Power Ratings',
} as const;

/** Legacy Core V1 classification — identification only. */
export const LEGACY_COMPUTE_RATINGS_V1_CLASSIFICATION = {
  path: 'apps/jobs/src/ratings/compute_ratings_v1.ts',
  label: 'LEGACY / historical alternate V1 computation pending final architecture label',
  deleteAuthorized: false,
  renameModelVersionAuthorized: false,
  formulaChangeAuthorized: false,
  runFor2026Authorized: false,
} as const;

export const BALANCED_GIT_HISTORY_EVIDENCE = [
  {
    sha: 'a611281ed74f71f3a846375e6a56a44aba67f452',
    subject: 'Implement Balanced Ratings Model (25/25/25/25) and remove scaling',
    notes: [
      'Became the effective production V1 rating source (TeamSeasonRating modelVersion=v1)',
      'UPDATE path updates powerRating/rating/games only — legacy metadata can remain',
    ],
  },
] as const;

export interface PersistedV1RatingRow {
  teamId: string;
  season: number;
  modelVersion: string;
  powerRating: number | null;
  confidence: number | null;
  dataSource: string | null;
  games: number | null;
  offenseRating?: number | null;
  defenseRating?: number | null;
}

export interface NumericSummary {
  min: number | null;
  avg: number | null;
  median: number | null;
  max: number | null;
  stdDev: number | null;
}

export interface BalancedParityMismatchSample {
  teamId: string;
  persistedPower: number;
  replayedPower: number;
  delta: number;
  talentScore: number;
  talentZ: number;
  epaOverall: number;
  epaZ: number;
  netPointsPerGame: number;
  netPointsZ: number;
  winPct: number;
  winPctZ: number;
  zComposite: number;
  calibrationFactor: number;
}

export interface BalancedTeamInputReport {
  teamId: string;
  talentScore: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  netPointsPerGame: number;
  winPct: number;
  avgEpaOff: number;
  avgEpaDef: number;
  epaOverall: number;
}

export interface BalancedV1HistoricalParityInput {
  comparisonSeason: number;
  fbsIds: string[];
  persistedV1Rows: PersistedV1RatingRow[];
  talentRows: BalancedTalentRow[];
  finalGames: BalancedGameRow[];
  epaStatRows: BalancedEpaStatRow[];
  teamNameById?: Map<string, string>;
}

export interface BalancedV1HistoricalParityResult {
  ok: boolean;
  findings: string[];
  comparisonSeason: number;
  modelVersion: typeof MODEL_VERSION;
  fbsCount: number;
  distinctFbsTeamIds: number;
  expected2025FbsCount: typeof EXPECTED_2025_FBS_COUNT;
  persistedV1TotalCount: number;
  persistedV1NonFbsCount: number;
  persistedV1FbsCount: number;
  persistedV1DistinctFbsTeams: number;
  persistedV1FbsSetExact: boolean;
  persistedPowerFinite: number;
  persistedPowerFiniteSetExact: boolean;
  persistedFbsMissingCount: number;
  persistedFbsMissingSample: string[];
  persistedFbsNonFinitePowerCount: number;
  persistedPower: NumericSummary;
  persistedDataSourceBreakdown: Record<string, number>;
  talentCoverage: {
    rows: number;
    distinctFbs: number;
    finite: number;
  };
  finalGamesUsed: {
    gameCount: number;
    fbsTeamsWithAtLeastOneGame: number;
  };
  epaCoverage: {
    teamGameStatCount: number;
    fbsTeamsWithUsableEpa: number;
    missingEpaTeams: string[];
    missingEpaCount: number;
  };
  teamInputs: BalancedTeamInputReport[];
  replayCount: number;
  replayFinite: number;
  replayFbsSetExact: boolean;
  replayPower: NumericSummary;
  componentZ: {
    talentZ: NumericSummary;
    epaZ: NumericSummary;
    netPointsZ: NumericSummary;
    winPctZ: NumericSummary;
    zComposite: NumericSummary;
  };
  comparedCount: number;
  comparedTeamSetExact: boolean;
  exactMatchCount: number;
  within0_01: number;
  within0_1: number;
  within0_5: number;
  within1: number;
  within3: number;
  within5: number;
  over5: number;
  mae: number | null;
  rmse: number | null;
  meanBias: number | null;
  medianAbsDelta: number | null;
  maxAbsDelta: number | null;
  pearson: number | null;
  spearman: number | null;
  topMismatches: BalancedParityMismatchSample[];
  balancedHistoricalParity: boolean;
  balancedCurrentFormulaReproducesPersisted2025: boolean;
  balancedWriterCanLeaveLegacyMetadata: typeof BALANCED_WRITER_CAN_LEAVE_LEGACY_METADATA;
  coreV1SpreadBalancedSemantics: typeof CORE_V1_SPREAD_BALANCED_SEMANTICS;
  legacyComputeRatingsV1Classification: typeof LEGACY_COMPUTE_RATINGS_V1_CLASSIFICATION;
  ratingsWriteAuthorized: false;
  modelChangeAuthorized: false;
  mutationsInvoked: false;
  providersInvoked: false;
  Odds: false;
  calibrationFactor: typeof BALANCED_V1_CALIBRATION_FACTOR;
  weights: {
    talent: typeof BALANCED_WEIGHT_TALENT;
    epa: typeof BALANCED_WEIGHT_EPA;
    netPoints: typeof BALANCED_WEIGHT_NET_POINTS;
    winPct: typeof BALANCED_WEIGHT_WIN_PCT;
  };
}

function sortedUnique(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.toLowerCase()))].sort();
}

function setsEqual(a: string[], b: string[]): boolean {
  const aa = sortedUnique(a);
  const bb = sortedUnique(b);
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
  return true;
}

export function numericSummary(values: number[]): NumericSummary {
  if (values.length === 0) {
    return { min: null, avg: null, median: null, max: null, stdDev: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  const variance =
    values.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / values.length;
  return { min, avg, max, median, stdDev: Math.sqrt(variance) };
}

export function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

function rankAverage(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array(values.length).fill(0);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j].v === indexed[i].v) j++;
    const avgRank = (i + j - 1) / 2 + 1;
    for (let k = i; k < j; k++) ranks[indexed[k].i] = avgRank;
    i = j;
  }
  return ranks;
}

export function spearmanCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  return pearsonCorrelation(rankAverage(xs), rankAverage(ys));
}

function absBuckets(deltas: number[]): {
  exactMatchCount: number;
  within0_01: number;
  within0_1: number;
  within0_5: number;
  within1: number;
  within3: number;
  within5: number;
  over5: number;
} {
  let exactMatchCount = 0;
  let within0_01 = 0;
  let within0_1 = 0;
  let within0_5 = 0;
  let within1 = 0;
  let within3 = 0;
  let within5 = 0;
  let over5 = 0;
  for (const d of deltas) {
    const a = Math.abs(d);
    if (a < 1e-9) exactMatchCount++;
    if (a <= 0.01) within0_01++;
    if (a <= 0.1) within0_1++;
    if (a <= 0.5) within0_5++;
    if (a <= 1) within1++;
    if (a <= 3) within3++;
    if (a <= 5) within5++;
    else over5++;
  }
  return {
    exactMatchCount,
    within0_01,
    within0_1,
    within0_5,
    within1,
    within3,
    within5,
    over5,
  };
}

export function assessBalancedV1HistoricalParityGates(input: {
  comparisonSeason: number;
  fbsIds: string[];
  persistedV1FbsCount: number;
  persistedV1DistinctFbsTeams: number;
  persistedV1FbsSetExact: boolean;
  persistedPowerFinite: number;
  persistedPowerFiniteSetExact: boolean;
  persistedFbsMissingCount: number;
  persistedFbsNonFinitePowerCount: number;
  replayCount: number;
  replayFinite: number;
  replayFbsSetExact: boolean;
  comparedCount: number;
  comparedTeamSetExact: boolean;
}): { ok: boolean; findings: string[] } {
  const findings: string[] = [];
  if (input.comparisonSeason !== COMPARISON_SEASON) {
    findings.push(`comparisonSeason must be ${COMPARISON_SEASON}`);
  }
  const fbs = sortedUnique(input.fbsIds);
  if (fbs.length !== input.fbsIds.length) {
    findings.push('authoritative FBS IDs contain duplicates');
  }
  if (fbs.length !== EXPECTED_2025_FBS_COUNT) {
    findings.push(
      `fbsCount/distinctFbsTeamIds ${fbs.length} != ${EXPECTED_2025_FBS_COUNT}`
    );
  }
  if (input.persistedV1FbsCount !== EXPECTED_2025_FBS_COUNT) {
    findings.push(
      `persistedV1FbsCount ${input.persistedV1FbsCount} != ${EXPECTED_2025_FBS_COUNT}`
    );
  }
  if (input.persistedV1DistinctFbsTeams !== EXPECTED_2025_FBS_COUNT) {
    findings.push(
      `persistedV1DistinctFbsTeams ${input.persistedV1DistinctFbsTeams} != ${EXPECTED_2025_FBS_COUNT}`
    );
  }
  if (!input.persistedV1FbsSetExact) {
    findings.push('persisted V1 FBS team set does not exactly match authoritative FBS');
  }
  if (input.persistedPowerFinite !== EXPECTED_2025_FBS_COUNT) {
    findings.push(
      `persistedPowerFinite ${input.persistedPowerFinite} != ${EXPECTED_2025_FBS_COUNT}`
    );
  }
  if (!input.persistedPowerFiniteSetExact) {
    findings.push('finite persisted V1 powerRating FBS set is incomplete');
  }
  if (input.persistedFbsMissingCount !== 0) {
    findings.push(`persisted FBS missing count ${input.persistedFbsMissingCount}`);
  }
  if (input.persistedFbsNonFinitePowerCount !== 0) {
    findings.push(
      `persisted non-finite powerRating count ${input.persistedFbsNonFinitePowerCount}`
    );
  }
  if (input.replayCount !== EXPECTED_2025_FBS_COUNT) {
    findings.push(`replayCount ${input.replayCount} != ${EXPECTED_2025_FBS_COUNT}`);
  }
  if (input.replayFinite !== EXPECTED_2025_FBS_COUNT) {
    findings.push(`replayFinite ${input.replayFinite} != ${EXPECTED_2025_FBS_COUNT}`);
  }
  if (!input.replayFbsSetExact) {
    findings.push('replay FBS set does not exactly match authoritative FBS');
  }
  if (input.comparedCount !== EXPECTED_2025_FBS_COUNT) {
    findings.push(`comparedCount ${input.comparedCount} != ${EXPECTED_2025_FBS_COUNT}`);
  }
  if (!input.comparedTeamSetExact) {
    findings.push('compared team set is not exact FBS');
  }
  return { ok: findings.length === 0, findings };
}

export function buildBalancedV1HistoricalParityAudit(
  input: BalancedV1HistoricalParityInput
): BalancedV1HistoricalParityResult {
  const fbsIds = sortedUnique(input.fbsIds);
  const fbsSet = new Set(fbsIds);

  const persistedFbsRows = input.persistedV1Rows.filter((r) =>
    fbsSet.has(r.teamId.toLowerCase())
  );
  const persistedNonFbs = input.persistedV1Rows.length - persistedFbsRows.length;
  const persistedDistinct = sortedUnique(persistedFbsRows.map((r) => r.teamId));
  const persistedV1FbsSetExact = setsEqual(persistedDistinct, fbsIds);

  const finitePersisted = persistedFbsRows.filter(
    (r) => r.powerRating !== null && Number.isFinite(r.powerRating)
  );
  const finitePersistedIds = sortedUnique(finitePersisted.map((r) => r.teamId));
  const persistedPowerFiniteSetExact = setsEqual(finitePersistedIds, fbsIds);
  const persistedFbsMissing = fbsIds.filter(
    (id) => !persistedDistinct.includes(id)
  );
  const persistedFbsNonFinite = persistedFbsRows.filter(
    (r) => r.powerRating === null || !Number.isFinite(r.powerRating as number)
  );

  const dataSourceBreakdown: Record<string, number> = {};
  for (const r of persistedFbsRows) {
    const key = r.dataSource ?? 'null';
    dataSourceBreakdown[key] = (dataSourceBreakdown[key] ?? 0) + 1;
  }

  const talentFbs = input.talentRows.filter((t) =>
    fbsSet.has(t.teamId.toLowerCase())
  );
  const talentFinite = talentFbs.filter(
    (t) =>
      t.talentComposite !== null && Number.isFinite(Number(t.talentComposite))
  );

  const gameAggregates = aggregateBalancedGameStats(input.finalGames, fbsSet);
  const epaByTeam = aggregateBalancedEpa(input.epaStatRows);
  const built = buildBalancedTeamMetrics({
    fbsTeamIds: fbsIds,
    teamNameById: input.teamNameById,
    talentRows: input.talentRows,
    gameAggregates,
    epaByTeam,
  });

  const replay = computeBalancedV1Ratings(built.metrics);
  const replayIds = sortedUnique(replay.map((r) => r.teamId));
  const replayFiniteVals = replay
    .map((r) => r.powerRating)
    .filter((v) => Number.isFinite(v));
  const replayFbsSetExact = setsEqual(replayIds, fbsIds);

  const persistedById = new Map(
    finitePersisted.map((r) => [r.teamId.toLowerCase(), r] as const)
  );
  const pairs: Array<{
    teamId: string;
    persisted: number;
    replay: BalancedV1ComputedRating;
  }> = [];
  for (const r of replay) {
    const p = persistedById.get(r.teamId.toLowerCase());
    if (!p || p.powerRating === null || !Number.isFinite(p.powerRating)) continue;
    pairs.push({ teamId: r.teamId, persisted: p.powerRating, replay: r });
  }
  pairs.sort((a, b) => a.teamId.localeCompare(b.teamId));
  const comparedIds = pairs.map((p) => p.teamId);
  const comparedTeamSetExact = setsEqual(comparedIds, fbsIds);

  const persistedVals = pairs.map((p) => p.persisted);
  const replayVals = pairs.map((p) => p.replay.powerRating);
  const deltas = replayVals.map((r, i) => r - persistedVals[i]);
  const absDeltas = deltas.map((d) => Math.abs(d));
  const buckets = absBuckets(deltas);

  const mae =
    absDeltas.length === 0
      ? null
      : absDeltas.reduce((a, b) => a + b, 0) / absDeltas.length;
  const rmse =
    deltas.length === 0
      ? null
      : Math.sqrt(deltas.reduce((a, d) => a + d * d, 0) / deltas.length);
  const meanBias =
    deltas.length === 0
      ? null
      : deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const medianAbsDelta =
    absDeltas.length === 0 ? null : numericSummary(absDeltas).median;
  const maxAbsDelta = absDeltas.length === 0 ? null : Math.max(...absDeltas);

  const topMismatches: BalancedParityMismatchSample[] = [...pairs]
    .map((p) => ({
      teamId: p.teamId,
      persistedPower: p.persisted,
      replayedPower: p.replay.powerRating,
      delta: p.replay.powerRating - p.persisted,
      talentScore: p.replay.talentScore,
      talentZ: p.replay.talentZ,
      epaOverall: p.replay.epaOverall,
      epaZ: p.replay.epaZ,
      netPointsPerGame: p.replay.netPointsPerGame,
      netPointsZ: p.replay.netPointsZ,
      winPct: p.replay.winPct,
      winPctZ: p.replay.winPctZ,
      zComposite: p.replay.zComposite,
      calibrationFactor: p.replay.calibrationFactor,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 20);

  const gates = assessBalancedV1HistoricalParityGates({
    comparisonSeason: input.comparisonSeason,
    fbsIds: input.fbsIds,
    persistedV1FbsCount: persistedFbsRows.length,
    persistedV1DistinctFbsTeams: persistedDistinct.length,
    persistedV1FbsSetExact,
    persistedPowerFinite: finitePersisted.length,
    persistedPowerFiniteSetExact,
    persistedFbsMissingCount: persistedFbsMissing.length,
    persistedFbsNonFinitePowerCount: persistedFbsNonFinite.length,
    replayCount: replay.length,
    replayFinite: replayFiniteVals.length,
    replayFbsSetExact,
    comparedCount: pairs.length,
    comparedTeamSetExact,
  });

  const balancedCurrentFormulaReproducesPersisted2025 =
    gates.ok && buckets.exactMatchCount === EXPECTED_2025_FBS_COUNT;
  const balancedHistoricalParity = balancedCurrentFormulaReproducesPersisted2025;

  const teamInputs: BalancedTeamInputReport[] = replay
    .map((r) => ({
      teamId: r.teamId,
      talentScore: r.talentScore,
      gamesPlayed: r.games,
      wins: r.wins,
      losses: r.losses,
      pointsFor: r.pointsFor,
      pointsAgainst: r.pointsAgainst,
      netPointsPerGame: r.netPointsPerGame,
      winPct: r.winPct,
      avgEpaOff: r.avgEpaOff,
      avgEpaDef: r.avgEpaDef,
      epaOverall: r.epaOverall,
    }))
    .sort((a, b) => a.teamId.localeCompare(b.teamId));

  return {
    ok: gates.ok,
    findings: gates.findings,
    comparisonSeason: input.comparisonSeason,
    modelVersion: MODEL_VERSION,
    fbsCount: fbsIds.length,
    distinctFbsTeamIds: fbsIds.length,
    expected2025FbsCount: EXPECTED_2025_FBS_COUNT,
    persistedV1TotalCount: input.persistedV1Rows.length,
    persistedV1NonFbsCount: persistedNonFbs,
    persistedV1FbsCount: persistedFbsRows.length,
    persistedV1DistinctFbsTeams: persistedDistinct.length,
    persistedV1FbsSetExact,
    persistedPowerFinite: finitePersisted.length,
    persistedPowerFiniteSetExact,
    persistedFbsMissingCount: persistedFbsMissing.length,
    persistedFbsMissingSample: persistedFbsMissing.slice(0, 20),
    persistedFbsNonFinitePowerCount: persistedFbsNonFinite.length,
    persistedPower: numericSummary(
      finitePersisted.map((r) => r.powerRating as number)
    ),
    persistedDataSourceBreakdown: dataSourceBreakdown,
    talentCoverage: {
      rows: talentFbs.length,
      distinctFbs: sortedUnique(talentFbs.map((t) => t.teamId)).length,
      finite: talentFinite.length,
    },
    finalGamesUsed: {
      gameCount: input.finalGames.length,
      fbsTeamsWithAtLeastOneGame: [...gameAggregates.values()].filter(
        (g) => g.games > 0
      ).length,
    },
    epaCoverage: {
      teamGameStatCount: input.epaStatRows.length,
      fbsTeamsWithUsableEpa: built.teamsWithUsableEpa,
      missingEpaTeams: built.teamsMissingEpa,
      missingEpaCount: built.teamsMissingEpa.length,
    },
    teamInputs,
    replayCount: replay.length,
    replayFinite: replayFiniteVals.length,
    replayFbsSetExact,
    replayPower: numericSummary(replayFiniteVals),
    componentZ: {
      talentZ: numericSummary(replay.map((r) => r.talentZ)),
      epaZ: numericSummary(replay.map((r) => r.epaZ)),
      netPointsZ: numericSummary(replay.map((r) => r.netPointsZ)),
      winPctZ: numericSummary(replay.map((r) => r.winPctZ)),
      zComposite: numericSummary(replay.map((r) => r.zComposite)),
    },
    comparedCount: pairs.length,
    comparedTeamSetExact,
    exactMatchCount: buckets.exactMatchCount,
    within0_01: buckets.within0_01,
    within0_1: buckets.within0_1,
    within0_5: buckets.within0_5,
    within1: buckets.within1,
    within3: buckets.within3,
    within5: buckets.within5,
    over5: buckets.over5,
    mae,
    rmse,
    meanBias,
    medianAbsDelta,
    maxAbsDelta,
    pearson: pearsonCorrelation(persistedVals, replayVals),
    spearman: spearmanCorrelation(persistedVals, replayVals),
    topMismatches,
    balancedHistoricalParity,
    balancedCurrentFormulaReproducesPersisted2025,
    balancedWriterCanLeaveLegacyMetadata: BALANCED_WRITER_CAN_LEAVE_LEGACY_METADATA,
    coreV1SpreadBalancedSemantics: CORE_V1_SPREAD_BALANCED_SEMANTICS,
    legacyComputeRatingsV1Classification: LEGACY_COMPUTE_RATINGS_V1_CLASSIFICATION,
    ratingsWriteAuthorized: false,
    modelChangeAuthorized: false,
    mutationsInvoked: false,
    providersInvoked: false,
    Odds: false,
    calibrationFactor: BALANCED_V1_CALIBRATION_FACTOR,
    weights: {
      talent: BALANCED_WEIGHT_TALENT,
      epa: BALANCED_WEIGHT_EPA,
      netPoints: BALANCED_WEIGHT_NET_POINTS,
      winPct: BALANCED_WEIGHT_WIN_PCT,
    },
  };
}

function fmt(n: number | null, digits = 4): string {
  if (n === null || !Number.isFinite(n)) return 'n/a';
  return n.toFixed(digits);
}

export function formatBalancedV1HistoricalParityReport(
  result: BalancedV1HistoricalParityResult
): string {
  const lines: string[] = [];
  lines.push('=== Balanced V1 Historical Parity Audit (READ ONLY) ===');
  lines.push(`ok=${result.ok}`);
  lines.push(`comparisonSeason=${result.comparisonSeason}`);
  lines.push(`modelVersion=${result.modelVersion}`);
  lines.push(
    `FBS=${result.fbsCount} distinctFbs=${result.distinctFbsTeamIds} expected=${result.expected2025FbsCount}`
  );
  lines.push(
    `persistedV1 total=${result.persistedV1TotalCount} fbs=${result.persistedV1FbsCount} nonFbs=${result.persistedV1NonFbsCount} finite=${result.persistedPowerFinite} setExact=${result.persistedV1FbsSetExact}`
  );
  lines.push(
    `persistedPower min=${fmt(result.persistedPower.min)} avg=${fmt(result.persistedPower.avg)} median=${fmt(result.persistedPower.median)} max=${fmt(result.persistedPower.max)} stddev=${fmt(result.persistedPower.stdDev)}`
  );
  lines.push(
    `persistedDataSourceBreakdown=${JSON.stringify(result.persistedDataSourceBreakdown)}`
  );
  lines.push(
    `talentCoverage rows=${result.talentCoverage.rows} distinctFbs=${result.talentCoverage.distinctFbs} finite=${result.talentCoverage.finite}`
  );
  lines.push(
    `finalGamesUsed gameCount=${result.finalGamesUsed.gameCount} fbsTeamsWith>=1=${result.finalGamesUsed.fbsTeamsWithAtLeastOneGame}`
  );
  lines.push(
    `epaCoverage teamGameStatCount=${result.epaCoverage.teamGameStatCount} usableEpaTeams=${result.epaCoverage.fbsTeamsWithUsableEpa} missingEpa=${result.epaCoverage.missingEpaCount}`
  );
  if (result.epaCoverage.missingEpaTeams.length > 0) {
    lines.push(
      `missingEpaTeamsSample=${result.epaCoverage.missingEpaTeams.slice(0, 20).join(',')}`
    );
  }
  lines.push(
    `replay count=${result.replayCount} finite=${result.replayFinite} setExact=${result.replayFbsSetExact}`
  );
  lines.push(
    `replayPower min=${fmt(result.replayPower.min)} avg=${fmt(result.replayPower.avg)} median=${fmt(result.replayPower.median)} max=${fmt(result.replayPower.max)} stddev=${fmt(result.replayPower.stdDev)}`
  );
  lines.push(
    `componentZ talentZ avg=${fmt(result.componentZ.talentZ.avg)} epaZ avg=${fmt(result.componentZ.epaZ.avg)} netPointsZ avg=${fmt(result.componentZ.netPointsZ.avg)} winPctZ avg=${fmt(result.componentZ.winPctZ.avg)} zComposite avg=${fmt(result.componentZ.zComposite.avg)}`
  );
  lines.push(
    `parity compared=${result.comparedCount} setExact=${result.comparedTeamSetExact} exact=${result.exactMatchCount} within0.01=${result.within0_01} within0.1=${result.within0_1} within0.5=${result.within0_5} within1=${result.within1} within3=${result.within3} within5=${result.within5} over5=${result.over5}`
  );
  lines.push(
    `MAE=${fmt(result.mae)} RMSE=${fmt(result.rmse)} meanBias=${fmt(result.meanBias)} medianAbsDelta=${fmt(result.medianAbsDelta)} maxAbsDelta=${fmt(result.maxAbsDelta)} Pearson=${fmt(result.pearson)} Spearman=${fmt(result.spearman)}`
  );
  lines.push(
    `balancedHistoricalParity=${result.balancedHistoricalParity} balancedCurrentFormulaReproducesPersisted2025=${result.balancedCurrentFormulaReproducesPersisted2025}`
  );
  lines.push(
    `balancedWriterCanLeaveLegacyMetadata=${result.balancedWriterCanLeaveLegacyMetadata}`
  );
  lines.push(
    `coreV1Spread: directV1=${result.coreV1SpreadBalancedSemantics.usesV1PowerRatingsDirectly} scaling=${result.coreV1SpreadBalancedSemantics.additionalScaling} formula=${result.coreV1SpreadBalancedSemantics.coreSpreadHma} label="${result.coreV1SpreadBalancedSemantics.sourceCommentLabel}"`
  );
  lines.push(
    `legacyComputeRatingsV1=${result.legacyComputeRatingsV1Classification.label}`
  );
  lines.push(
    `weights=${JSON.stringify(result.weights)} calibrationFactor=${result.calibrationFactor}`
  );
  lines.push(
    `ratingsWriteAuthorized=${result.ratingsWriteAuthorized} modelChangeAuthorized=${result.modelChangeAuthorized} mutationsInvoked=${result.mutationsInvoked} providersInvoked=${result.providersInvoked} Odds=${result.Odds}`
  );
  if (result.findings.length > 0) {
    lines.push('findings:');
    for (const f of result.findings) lines.push(`  - ${f}`);
  }
  lines.push('topMismatches:');
  for (const m of result.topMismatches) {
    lines.push(
      `  ${m.teamId} persisted=${fmt(m.persistedPower)} replay=${fmt(m.replayedPower)} delta=${fmt(m.delta)} talent=${fmt(m.talentScore, 1)} talentZ=${fmt(m.talentZ)} epa=${fmt(m.epaOverall)} epaZ=${fmt(m.epaZ)} netPts=${fmt(m.netPointsPerGame)} netZ=${fmt(m.netPointsZ)} winPct=${fmt(m.winPct)} winZ=${fmt(m.winPctZ)} zComp=${fmt(m.zComposite)} cal=${m.calibrationFactor}`
    );
  }
  lines.push('teamInputs (first 5):');
  for (const t of result.teamInputs.slice(0, 5)) {
    lines.push(
      `  ${t.teamId} talent=${fmt(t.talentScore, 1)} gp=${t.gamesPlayed} w-l=${t.wins}-${t.losses} pf-pa=${t.pointsFor}-${t.pointsAgainst} net=${fmt(t.netPointsPerGame)} winPct=${fmt(t.winPct)} epaOff=${fmt(t.avgEpaOff)} epaDef=${fmt(t.avgEpaDef)} epa=${fmt(t.epaOverall)}`
    );
  }
  lines.push(`teamInputsTotal=${result.teamInputs.length}`);
  return lines.join('\n');
}

export function parseBalancedV1HistoricalParityArgs(argv: string[]):
  | { ok: true; comparisonSeason: number }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let comparisonSeason: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--comparison-season' || a === '--comparison_season') {
      const v = argv[i + 1];
      i++;
      const n = Number(v);
      if (!Number.isInteger(n)) errors.push(`invalid comparison season: ${v}`);
      else comparisonSeason = n;
    } else if (a.startsWith('--comparison-season=') || a.startsWith('--comparison_season=')) {
      const v = a.split('=')[1];
      const n = Number(v);
      if (!Number.isInteger(n)) errors.push(`invalid comparison season: ${v}`);
      else comparisonSeason = n;
    } else {
      errors.push(`unknown arg: ${a}`);
    }
  }
  if (comparisonSeason === null) {
    errors.push('missing --comparison-season');
  } else if (comparisonSeason !== COMPARISON_SEASON) {
    errors.push(`comparisonSeason must be ${COMPARISON_SEASON}`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, comparisonSeason: comparisonSeason! };
}

export function sanitizeBalancedV1HistoricalParityError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg
    .replace(/postgres(ql)?:\/\/[^\s]+/gi, '[redacted-db-url]')
    .replace(/DIRECT_URL=[^\s]+/gi, 'DIRECT_URL=[redacted]')
    .replace(/DATABASE_URL=[^\s]+/gi, 'DATABASE_URL=[redacted]');
}
