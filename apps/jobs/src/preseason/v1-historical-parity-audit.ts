/**
 * Phase 2C-2H-4 — Read-only Core V1 historical parity / calibration forensic.
 *
 * Pure logic only. No Prisma, providers, Odds, or persistence.
 * Reuses computeV1SeasonRatings (shared with writer + 2026 preview).
 * Counterfactuals are diagnostic only and must not authorize model changes.
 */

import {
  computeV1SeasonRatings,
  getDataSourceString,
  type TeamFeatures,
  type V1ComputedTeamRating,
} from '../ratings/compute_ratings_v1';
import type { getModelConfig } from '../config/model-weights';

export const COMPARISON_SEASON = 2025 as const;
export const MODEL_VERSION = 'v1' as const;

/** Informational: 2026 production preview found 138 talent-only / missing-source rows. */
export const DOCUMENTED_2026_TALENT_ONLY_PREVIEW_COUNT = 138;

export type CounterfactualKind =
  | 'CURRENT'
  | 'POST_CAL'
  | 'NO_CONFERENCE'
  | 'INCONCLUSIVE';

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

export interface V1HistoricalParityInput {
  comparisonSeason: number;
  fbsIds: string[];
  /** All persisted V1 rows for the season (may include non-FBS pollution). */
  persistedV1Rows: PersistedV1RatingRow[];
  allFeatures: TeamFeatures[];
  conferenceMap: Map<string, string | null>;
  modelConfig: ReturnType<typeof getModelConfig>;
  conferenceSource: 'Team.conference' | 'TeamMembership.conference';
  legacyConferenceMode: boolean;
  conferenceLoadOk: boolean;
  featureLoaderStrict: boolean;
}

export interface NumericSummary {
  min: number | null;
  avg: number | null;
  median: number | null;
  max: number | null;
  stdDev: number | null;
}

export interface CounterfactualMetrics {
  kind: Exclude<CounterfactualKind, 'INCONCLUSIVE'>;
  mae: number | null;
  rmse: number | null;
  meanBias: number | null;
  maxAbsDelta: number | null;
  pearson: number | null;
  spearman: number | null;
  exactMatchCount: number;
  comparedCount: number;
}

export interface ParityMismatchSample {
  teamId: string;
  conference: string | null;
  persisted: number;
  replay: number;
  delta: number;
  talentComposite: number | null;
  dataSource: string;
  games: number;
  offenseRating: number;
  defenseRating: number;
  talentComponent: number;
  conferenceAdjustment: number;
  calibrationFactor: number;
}

export interface GitHistoryEvidenceItem {
  sha: string;
  date: string;
  subject: string;
  notes: string[];
}

/** Documented chronology — static evidence, not runtime git. */
export const V1_GIT_HISTORY_EVIDENCE: GitHistoryEvidenceItem[] = [
  {
    sha: 'debc259a672538d8bcf53d23523465901f326313',
    date: '2025-11-11',
    subject: 'feat: Add calibration_factor to V1 ratings (work in progress)',
    notes: [
      'Introduced calibration_factor=6.5 in model-weights.yml for v1',
      'compute_ratings_v1 began multiplying power ratings by calibration',
    ],
  },
  {
    sha: '187bc61',
    date: '2025-11-11',
    subject: 'feat: Tested calibration factors and re-computed 2024 ratings',
    notes: [
      'calibration_factor changed 6.5 → 8.0 for v1',
      'Both seasons documented as using calibration_factor=8.0',
    ],
  },
  {
    sha: '834dbf804ad6976487853ce294def69b8b1eaec6',
    date: '2025-11-11',
    subject: 'feat: Phase 2.6 - Migrate to V2 ratings with SoS and shrinkage',
    notes: ['Added calibration_factor=8.0 to v2 config (v1 left at 8.0)'],
  },
  {
    sha: '2c730027939dee1408a32ff97933437e09c646bc',
    date: '2025-11-19',
    subject: 'Add conference strength adjustments to ratings v1',
    notes: [
      'Commit message explicitly: "Apply conference adjustments to power ratings before calibration"',
      'Code: adjustedScore = rawScore + conferenceAdjustment; powerRating = adjustedScore * calibrationFactor',
      'This is the CURRENT formula order — do NOT assume moving conference after calibration is a fix',
    ],
  },
  {
    sha: 'a611281',
    date: '2025-11-19',
    subject: 'Implement Balanced Ratings Model (25/25/25/25) and remove scaling',
    notes: [
      'Balanced model / web diagnostics; not a Core V1 formula rewrite of conference×calibration order',
    ],
  },
  {
    sha: 'ac0c348',
    date: '2026 (2C-2G-4)',
    subject: 'Use season-aware TeamMembership.conference for Core V1 in 2026+',
    notes: [
      '2026+ → TeamMembership.conference fail-closed',
      '<2026 → legacy Team.conference (this forensic path)',
      'Conference adjustment constants unchanged',
    ],
  },
  {
    sha: '221df1d / 6cb5f21',
    date: '2026-08-27 (2C-2H-3)',
    subject: 'Read-only 2026 Core V1 ratings preview + fail-closed feature integrity',
    notes: [
      'Extracted shared computeV1SeasonRatings; formula order unchanged',
      'Do not infer HEAD equals the code that wrote persisted 2025 rows unless parity proves it',
    ],
  },
];

export interface V1HistoricalParityResult {
  ok: boolean;
  findings: string[];
  comparisonSeason: number;
  modelVersion: typeof MODEL_VERSION;
  conferenceSource: string;
  legacyConferenceMode: boolean;
  featureLoaderStrict: boolean;
  fbsCount: number;
  persistedV1TotalCount: number;
  persistedV1NonFbsCount: number;
  persistedV1FbsCount: number;
  persistedPowerFinite: number;
  persistedPower: NumericSummary;
  persistedConfidence: NumericSummary;
  persistedDataSourceBreakdown: Record<string, number>;
  persistedGames: NumericSummary;
  replayRatingCount: number;
  replayFinite: number;
  replayPower: NumericSummary;
  replayConfidence: NumericSummary;
  replayDataSourceBreakdown: Record<string, number>;
  replayConferenceAdj: NumericSummary;
  replayConferenceAdjScaled: NumericSummary;
  baseFeatureTeams: number;
  talentOnlyFallbackTeams: number;
  featureVectorCount: number;
  featureVectorUniqueTeams: number;
  featureVectorExactFbsSet: boolean;
  featureDuplicateTeamCount: number;
  exactMatchCount: number;
  within0_01: number;
  within0_1: number;
  within0_5: number;
  within1: number;
  within3: number;
  within5: number;
  over5: number;
  comparedCount: number;
  maxAbsDelta: number | null;
  meanAbsDelta: number | null;
  medianAbsDelta: number | null;
  rmse: number | null;
  top20AbsMismatches: ParityMismatchSample[];
  counterfactuals: CounterfactualMetrics[];
  bestDiagnosticCounterfactual: CounterfactualKind;
  missingSourceLabelWouldBeSeasonOnly: boolean;
  missingUnderlyingFeatureCount: number;
  documented2026MislabeledIfPersistedToday: number;
  historicalParity: boolean;
  currentFormulaReproducesPersisted2025: boolean;
  ratingsWriteAuthorized: false;
  modelChangeAuthorized: false;
  mutationsInvoked: false;
  providersInvoked: false;
  oddsInvoked: false;
  gitHistoryEvidence: GitHistoryEvidenceItem[];
  scaledConferenceCounterfactualAvailable: false;
  scaledConferenceNote: string;
}

function sortedUnique(ids: string[]): string[] {
  return [...new Set(ids.map((s) => s.trim()).filter(Boolean))].sort();
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

export function counterfactualPower(
  kind: Exclude<CounterfactualKind, 'INCONCLUSIVE'>,
  rawScore: number,
  conferenceAdjustment: number,
  calibrationFactor: number
): number {
  if (kind === 'CURRENT') {
    return (rawScore + conferenceAdjustment) * calibrationFactor;
  }
  if (kind === 'POST_CAL') {
    return rawScore * calibrationFactor + conferenceAdjustment;
  }
  return rawScore * calibrationFactor;
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

function metricsForPairs(
  kind: Exclude<CounterfactualKind, 'INCONCLUSIVE'>,
  persisted: number[],
  replayed: number[]
): CounterfactualMetrics {
  const n = persisted.length;
  if (n === 0) {
    return {
      kind,
      mae: null,
      rmse: null,
      meanBias: null,
      maxAbsDelta: null,
      pearson: null,
      spearman: null,
      exactMatchCount: 0,
      comparedCount: 0,
    };
  }
  const deltas = replayed.map((r, i) => r - persisted[i]);
  const abs = deltas.map((d) => Math.abs(d));
  const mae = abs.reduce((a, b) => a + b, 0) / n;
  const rmse = Math.sqrt(deltas.reduce((a, d) => a + d * d, 0) / n);
  const meanBias = deltas.reduce((a, b) => a + b, 0) / n;
  const maxAbsDelta = Math.max(...abs);
  const buckets = absBuckets(deltas);
  return {
    kind,
    mae,
    rmse,
    meanBias,
    maxAbsDelta,
    pearson: pearsonCorrelation(persisted, replayed),
    spearman: spearmanCorrelation(persisted, replayed),
    exactMatchCount: buckets.exactMatchCount,
    comparedCount: n,
  };
}

export function assessV1HistoricalParityGates(input: {
  comparisonSeason: number;
  fbsIds: string[];
  allFeatures: TeamFeatures[];
  conferenceLoadOk: boolean;
  legacyConferenceMode: boolean;
  featureLoaderStrict: boolean;
  replay: V1ComputedTeamRating[];
}): { ok: boolean; findings: string[] } {
  const findings: string[] = [];
  if (input.comparisonSeason !== COMPARISON_SEASON) {
    findings.push(`comparisonSeason must be ${COMPARISON_SEASON}`);
  }
  const fbs = sortedUnique(input.fbsIds);
  if (fbs.length === 0) {
    findings.push('authoritative 2025 FBS set empty');
  }
  if (!input.conferenceLoadOk) {
    findings.push('conference load not ok');
  }
  if (
    input.comparisonSeason === COMPARISON_SEASON &&
    !input.legacyConferenceMode
  ) {
    findings.push('legacyConferenceMode must be true for 2025');
  }
  if (!input.featureLoaderStrict) {
    findings.push('featureLoaderStrict must be true');
  }
  const featureIds = input.allFeatures.map((f) => f.teamId);
  const unique = sortedUnique(featureIds);
  if (featureIds.length !== unique.length) {
    findings.push('feature vector contains duplicate teamId');
  }
  if (!setsEqual(featureIds, fbs)) {
    findings.push('featureVectorExactFbsSet=false');
  }
  if (input.replay.length !== fbs.length) {
    findings.push(
      `replayRatingCount ${input.replay.length} != fbsCount ${fbs.length}`
    );
  }
  const nonFinite = input.replay.filter(
    (r) =>
      !Number.isFinite(r.powerRating) ||
      !Number.isFinite(r.rawScore) ||
      !Number.isFinite(r.conferenceAdjustment) ||
      !Number.isFinite(r.calibrationFactor)
  );
  if (nonFinite.length > 0) {
    findings.push(`nonFiniteReplayValues=${nonFinite.length}`);
  }
  return { ok: findings.length === 0, findings };
}

export function buildV1HistoricalParityAudit(
  input: V1HistoricalParityInput
): V1HistoricalParityResult {
  const findings: string[] = [];
  const fbsIds = sortedUnique(input.fbsIds);
  const fbsSet = new Set(fbsIds);

  const seasonV1Rows = input.persistedV1Rows.filter(
    (r) =>
      r.season === input.comparisonSeason && r.modelVersion === MODEL_VERSION
  );
  const persistedV1TotalCount = seasonV1Rows.length;
  const persistedFbsRows = seasonV1Rows.filter((r) => fbsSet.has(r.teamId));
  const persistedV1NonFbsCount = Math.max(
    0,
    persistedV1TotalCount - persistedFbsRows.length
  );

  const persistedPowers = persistedFbsRows
    .map((r) => r.powerRating)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const persistedConfs = persistedFbsRows
    .map((r) => r.confidence)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const persistedGames = persistedFbsRows
    .map((r) => r.games)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const persistedDataSourceBreakdown: Record<string, number> = {};
  for (const r of persistedFbsRows) {
    const key = r.dataSource ?? '(null)';
    persistedDataSourceBreakdown[key] =
      (persistedDataSourceBreakdown[key] ?? 0) + 1;
  }

  const featureIds = input.allFeatures.map((f) => f.teamId);
  const featureVectorUniqueTeams = sortedUnique(featureIds).length;
  const featureDuplicateTeamCount = featureIds.length - featureVectorUniqueTeams;
  const featureVectorExactFbsSet = setsEqual(featureIds, fbsIds);

  const missingUnderlyingFeatureCount = input.allFeatures.filter(
    (f) => f.dataSource === 'missing'
  ).length;
  const missingLabelDemo = getDataSourceString({
    teamId: 'demo',
    season: COMPARISON_SEASON,
    dataSource: 'missing',
    confidence: 0,
    gamesCount: 0,
    lastUpdated: null,
    successOff: null,
    epaOff: null,
  });
  const missingSourceLabelWouldBeSeasonOnly = missingLabelDemo === 'season_only';

  let replay: V1ComputedTeamRating[] = [];
  const canReplay =
    input.conferenceLoadOk &&
    featureVectorExactFbsSet &&
    featureDuplicateTeamCount === 0 &&
    fbsIds.length > 0 &&
    input.comparisonSeason === COMPARISON_SEASON &&
    input.featureLoaderStrict &&
    input.legacyConferenceMode;

  if (canReplay) {
    replay = computeV1SeasonRatings({
      season: input.comparisonSeason,
      allFeatures: input.allFeatures,
      conferenceMap: input.conferenceMap,
      modelConfig: input.modelConfig,
    });
  }

  const gate = assessV1HistoricalParityGates({
    comparisonSeason: input.comparisonSeason,
    fbsIds,
    allFeatures: input.allFeatures,
    conferenceLoadOk: input.conferenceLoadOk,
    legacyConferenceMode: input.legacyConferenceMode,
    featureLoaderStrict: input.featureLoaderStrict,
    replay,
  });
  findings.push(...gate.findings);

  if (persistedFbsRows.length === 0) {
    findings.push('persisted V1 FBS population empty / not understood');
  }

  const replayPowers = replay
    .map((r) => r.powerRating)
    .filter((v) => Number.isFinite(v));
  const replayConfs = replay
    .map((r) => r.confidence)
    .filter((v) => Number.isFinite(v));
  const replayAdj = replay
    .map((r) => r.conferenceAdjustment)
    .filter((v) => Number.isFinite(v));
  const replayAdjScaled = replay
    .map((r) => r.conferenceAdjustment * r.calibrationFactor)
    .filter((v) => Number.isFinite(v));
  const replayDataSourceBreakdown: Record<string, number> = {};
  for (const r of replay) {
    replayDataSourceBreakdown[r.dataSource] =
      (replayDataSourceBreakdown[r.dataSource] ?? 0) + 1;
  }

  const persistedById = new Map(
    persistedFbsRows
      .filter((r) => r.powerRating !== null && Number.isFinite(r.powerRating))
      .map((r) => [r.teamId, r])
  );
  const replayById = new Map(replay.map((r) => [r.teamId, r]));

  const comparedTeamIds = [...persistedById.keys()].filter((id) =>
    replayById.has(id)
  );
  if (gate.ok && comparedTeamIds.length === 0) {
    findings.push('no overlapping persisted/replay FBS teams to compare');
  }

  const persistedPair: number[] = [];
  const replayPair: number[] = [];
  const currentPair: number[] = [];
  const postCalPair: number[] = [];
  const noConfPair: number[] = [];
  const mismatchSamples: ParityMismatchSample[] = [];

  for (const id of comparedTeamIds) {
    const p = persistedById.get(id)!;
    const r = replayById.get(id)!;
    const persisted = p.powerRating as number;
    const replayed = r.powerRating;
    const delta = replayed - persisted;
    persistedPair.push(persisted);
    replayPair.push(replayed);
    currentPair.push(
      counterfactualPower(
        'CURRENT',
        r.rawScore,
        r.conferenceAdjustment,
        r.calibrationFactor
      )
    );
    postCalPair.push(
      counterfactualPower(
        'POST_CAL',
        r.rawScore,
        r.conferenceAdjustment,
        r.calibrationFactor
      )
    );
    noConfPair.push(
      counterfactualPower(
        'NO_CONFERENCE',
        r.rawScore,
        r.conferenceAdjustment,
        r.calibrationFactor
      )
    );
    mismatchSamples.push({
      teamId: id,
      conference: r.conference,
      persisted,
      replay: replayed,
      delta,
      talentComposite: r.talentComposite,
      dataSource: r.dataSource,
      games: r.games,
      offenseRating: r.offenseRating,
      defenseRating: r.defenseRating,
      talentComponent: r.talentComponent,
      conferenceAdjustment: r.conferenceAdjustment,
      calibrationFactor: r.calibrationFactor,
    });
  }

  for (let i = 0; i < comparedTeamIds.length; i++) {
    const id = comparedTeamIds[i];
    const r = replayById.get(id)!;
    if (Math.abs(currentPair[i] - r.powerRating) > 1e-9) {
      findings.push(
        `CURRENT counterfactual diverged from computeV1SeasonRatings for ${id}`
      );
    }
  }

  const buckets = absBuckets(mismatchSamples.map((m) => m.delta));
  const absDeltas = mismatchSamples.map((m) => Math.abs(m.delta));
  const absSummary = numericSummary(absDeltas);
  const rmse =
    absDeltas.length === 0
      ? null
      : Math.sqrt(
          mismatchSamples.reduce((a, m) => a + m.delta * m.delta, 0) /
            mismatchSamples.length
        );

  const top20AbsMismatches = [...mismatchSamples]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 20);

  const counterfactuals: CounterfactualMetrics[] = [
    metricsForPairs('CURRENT', persistedPair, currentPair),
    metricsForPairs('POST_CAL', persistedPair, postCalPair),
    metricsForPairs('NO_CONFERENCE', persistedPair, noConfPair),
  ];

  let bestDiagnosticCounterfactual: CounterfactualKind = 'INCONCLUSIVE';
  const ranked = [...counterfactuals]
    .filter((c) => c.mae !== null)
    .sort((a, b) => (a.mae as number) - (b.mae as number));
  if (ranked.length >= 1) {
    const best = ranked[0];
    const second = ranked[1];
    if (
      !second ||
      second.mae === null ||
      Math.abs((best.mae as number) - (second.mae as number)) > 1e-12
    ) {
      bestDiagnosticCounterfactual = best.kind;
    } else {
      bestDiagnosticCounterfactual = 'INCONCLUSIVE';
    }
  }

  const structuralOk = findings.length === 0;
  const historicalParity =
    structuralOk &&
    comparedTeamIds.length > 0 &&
    buckets.exactMatchCount === comparedTeamIds.length;
  const currentFormulaReproducesPersisted2025 = historicalParity;

  return {
    ok: structuralOk,
    findings,
    comparisonSeason: input.comparisonSeason,
    modelVersion: MODEL_VERSION,
    conferenceSource: input.conferenceSource,
    legacyConferenceMode: input.legacyConferenceMode,
    featureLoaderStrict: input.featureLoaderStrict,
    fbsCount: fbsIds.length,
    persistedV1TotalCount,
    persistedV1NonFbsCount,
    persistedV1FbsCount: persistedFbsRows.length,
    persistedPowerFinite: persistedPowers.length,
    persistedPower: numericSummary(persistedPowers),
    persistedConfidence: numericSummary(persistedConfs),
    persistedDataSourceBreakdown,
    persistedGames: numericSummary(persistedGames),
    replayRatingCount: replay.length,
    replayFinite: replayPowers.length,
    replayPower: numericSummary(replayPowers),
    replayConfidence: numericSummary(replayConfs),
    replayDataSourceBreakdown,
    replayConferenceAdj: numericSummary(replayAdj),
    replayConferenceAdjScaled: numericSummary(replayAdjScaled),
    baseFeatureTeams: replay.filter((r) => r.hasBaseFeatures).length,
    talentOnlyFallbackTeams: replay.filter((r) => !r.hasBaseFeatures).length,
    featureVectorCount: input.allFeatures.length,
    featureVectorUniqueTeams,
    featureVectorExactFbsSet,
    featureDuplicateTeamCount,
    exactMatchCount: buckets.exactMatchCount,
    within0_01: buckets.within0_01,
    within0_1: buckets.within0_1,
    within0_5: buckets.within0_5,
    within1: buckets.within1,
    within3: buckets.within3,
    within5: buckets.within5,
    over5: buckets.over5,
    comparedCount: comparedTeamIds.length,
    maxAbsDelta: absSummary.max,
    meanAbsDelta: absSummary.avg,
    medianAbsDelta: absSummary.median,
    rmse,
    top20AbsMismatches: structuralOk ? top20AbsMismatches : [],
    counterfactuals: structuralOk ? counterfactuals : [],
    bestDiagnosticCounterfactual: structuralOk
      ? bestDiagnosticCounterfactual
      : 'INCONCLUSIVE',
    missingSourceLabelWouldBeSeasonOnly,
    missingUnderlyingFeatureCount,
    documented2026MislabeledIfPersistedToday:
      DOCUMENTED_2026_TALENT_ONLY_PREVIEW_COUNT,
    historicalParity,
    currentFormulaReproducesPersisted2025,
    ratingsWriteAuthorized: false,
    modelChangeAuthorized: false,
    mutationsInvoked: false,
    providersInvoked: false,
    oddsInvoked: false,
    gitHistoryEvidence: V1_GIT_HISTORY_EVIDENCE,
    scaledConferenceCounterfactualAvailable: false,
    scaledConferenceNote:
      'No historical candidateScale found in model-weights.yml / V1 config; SCALED_CONFERENCE omitted',
  };
}

export function parseV1HistoricalParityArgs(
  argv: string[]
):
  | { ok: true; comparisonSeason: number }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let comparisonSeason: number | null = null;
  const WRITE_FLAGS = new Set([
    '--write',
    '--execute',
    '--upsert',
    '--persist',
    '--force',
    '--commit',
    '--confirm',
    '--confirm-write',
  ]);

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (WRITE_FLAGS.has(a)) {
      errors.push(`Write flag rejected: ${a}`);
      continue;
    }
    if (a === '--comparison-season' || a === '--season') {
      if (comparisonSeason !== null) {
        errors.push(`${a} specified more than once`);
        continue;
      }
      const raw = argv[++i];
      const n = Number(raw);
      if (!Number.isInteger(n)) errors.push(`${a} requires integer`);
      else comparisonSeason = n;
      continue;
    }
    errors.push(`Unknown argument: ${a}`);
  }
  if (comparisonSeason === null) {
    errors.push('--comparison-season is required');
  } else if (comparisonSeason !== COMPARISON_SEASON) {
    errors.push(`--comparison-season must be ${COMPARISON_SEASON}`);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, comparisonSeason: COMPARISON_SEASON };
}

export function sanitizeV1HistoricalParityError(_err?: unknown): string {
  return 'Core V1 historical parity audit failed; connection and secret details suppressed';
}

export function formatV1HistoricalParityReport(
  result: V1HistoricalParityResult
): string {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);
  const fmt = (v: number | null, d = 4) =>
    v === null || !Number.isFinite(v) ? 'n/a' : v.toFixed(d);
  const fmtSum = (s: NumericSummary) =>
    `${fmt(s.min)}/${fmt(s.avg)}/${fmt(s.median)}/${fmt(s.max)}/${fmt(s.stdDev)}`;

  push('============================================');
  push('CORE V1 HISTORICAL PARITY AUDIT (READ ONLY)');
  push('============================================');
  push(`ok=${result.ok}`);
  push(`comparisonSeason=${result.comparisonSeason}`);
  push(`modelVersion=${result.modelVersion}`);
  push(`conferenceSource=${result.conferenceSource}`);
  push(`legacyConferenceMode=${result.legacyConferenceMode}`);
  push(`featureLoaderStrict=${result.featureLoaderStrict}`);
  push('--- A. Persisted 2025 V1 FBS population ---');
  push(`fbsCount=${result.fbsCount}`);
  push(`persistedV1TotalCount=${result.persistedV1TotalCount}`);
  push(`persistedV1NonFbsCount=${result.persistedV1NonFbsCount}`);
  push(`persistedV1FbsCount=${result.persistedV1FbsCount}`);
  push(`persistedPowerFinite=${result.persistedPowerFinite}`);
  push(
    `persistedPower min/avg/median/max/stddev=${fmtSum(result.persistedPower)}`
  );
  push(
    `persistedConfidence min/avg/max=${fmt(result.persistedConfidence.min)}/${fmt(result.persistedConfidence.avg)}/${fmt(result.persistedConfidence.max)}`
  );
  push(
    `persistedDataSourceBreakdown=${JSON.stringify(result.persistedDataSourceBreakdown)}`
  );
  push(
    `persistedGames min/avg/max=${fmt(result.persistedGames.min)}/${fmt(result.persistedGames.avg)}/${fmt(result.persistedGames.max)}`
  );
  push('--- B. Current-code 2025 replay ---');
  push(`featureVectorCount=${result.featureVectorCount}`);
  push(`featureVectorUniqueTeams=${result.featureVectorUniqueTeams}`);
  push(`featureVectorExactFbsSet=${result.featureVectorExactFbsSet}`);
  push(`featureDuplicateTeamCount=${result.featureDuplicateTeamCount}`);
  push(`replayRatingCount=${result.replayRatingCount}`);
  push(`replayFinite=${result.replayFinite}`);
  push(`replayPower min/avg/median/max/stddev=${fmtSum(result.replayPower)}`);
  push(
    `replayConfidence min/avg/max=${fmt(result.replayConfidence.min)}/${fmt(result.replayConfidence.avg)}/${fmt(result.replayConfidence.max)}`
  );
  push(
    `replayDataSourceBreakdown=${JSON.stringify(result.replayDataSourceBreakdown)}`
  );
  push(
    `replayConferenceAdj min/avg/max=${fmt(result.replayConferenceAdj.min)}/${fmt(result.replayConferenceAdj.avg)}/${fmt(result.replayConferenceAdj.max)}`
  );
  push(
    `replayConferenceAdjScaledByCal min/avg/max=${fmt(result.replayConferenceAdjScaled.min)}/${fmt(result.replayConferenceAdjScaled.avg)}/${fmt(result.replayConferenceAdjScaled.max)}`
  );
  push(`baseFeatureTeams=${result.baseFeatureTeams}`);
  push(`talentOnlyFallbackTeams=${result.talentOnlyFallbackTeams}`);
  push('--- C. Team-by-team parity ---');
  push(`comparedCount=${result.comparedCount}`);
  push(`exactMatchCount=${result.exactMatchCount}`);
  push(`within0.01=${result.within0_01}`);
  push(`within0.1=${result.within0_1}`);
  push(`within0.5=${result.within0_5}`);
  push(`within1=${result.within1}`);
  push(`within3=${result.within3}`);
  push(`within5=${result.within5}`);
  push(`over5=${result.over5}`);
  push(`maxAbsDelta=${fmt(result.maxAbsDelta)}`);
  push(`meanAbsDelta=${fmt(result.meanAbsDelta)}`);
  push(`medianAbsDelta=${fmt(result.medianAbsDelta)}`);
  push(`RMSE=${fmt(result.rmse)}`);
  push('top20AbsMismatches:');
  for (const m of result.top20AbsMismatches) {
    push(
      `  ${m.teamId} conf=${m.conference} persisted=${fmt(m.persisted)} replay=${fmt(m.replay)} delta=${fmt(m.delta)} talent=${m.talentComposite} src=${m.dataSource} games=${m.games} off=${fmt(m.offenseRating)} def=${fmt(m.defenseRating)} talentComp=${fmt(m.talentComponent)} confAdj=${fmt(m.conferenceAdjustment)} cal=${m.calibrationFactor}`
    );
  }
  push('--- D. Formula counterfactuals (diagnostic only) ---');
  for (const c of result.counterfactuals) {
    push(
      `  ${c.kind}: MAE=${fmt(c.mae)} RMSE=${fmt(c.rmse)} bias=${fmt(c.meanBias)} maxAbs=${fmt(c.maxAbsDelta)} pearson=${fmt(c.pearson)} spearman=${fmt(c.spearman)} exact=${c.exactMatchCount}/${c.comparedCount}`
    );
  }
  push(
    `scaledConferenceCounterfactualAvailable=${result.scaledConferenceCounterfactualAvailable}`
  );
  push(`scaledConferenceNote=${result.scaledConferenceNote}`);
  push(
    `bestDiagnosticCounterfactual=${result.bestDiagnosticCounterfactual} (informational only; does NOT authorize model change)`
  );
  push('--- E. Git-history evidence ---');
  for (const g of result.gitHistoryEvidence) {
    push(`  ${g.sha} (${g.date}) ${g.subject}`);
    for (const n of g.notes) push(`    - ${n}`);
  }
  push('--- F. Data-source label issue ---');
  push(
    `missingSourceLabelWouldBeSeasonOnly=${result.missingSourceLabelWouldBeSeasonOnly}`
  );
  push(
    `missingUnderlyingFeatureCount(inReplayFeatures)=${result.missingUnderlyingFeatureCount}`
  );
  push(
    `documented2026MislabeledIfPersistedToday=${result.documented2026MislabeledIfPersistedToday}`
  );
  push('--- Classification ---');
  push(`historicalParity=${result.historicalParity}`);
  push(
    `currentFormulaReproducesPersisted2025=${result.currentFormulaReproducesPersisted2025}`
  );
  push(`ratingsWriteAuthorized=${result.ratingsWriteAuthorized}`);
  push(`modelChangeAuthorized=${result.modelChangeAuthorized}`);
  push(`mutationsInvoked=${result.mutationsInvoked}`);
  push(`providersInvoked=${result.providersInvoked}`);
  push(`Odds=${result.oddsInvoked}`);
  if (result.findings.length) {
    push('findings:');
    for (const f of result.findings) push(`  - ${f}`);
  }
  push('============================================');
  return lines.join('\n');
}
