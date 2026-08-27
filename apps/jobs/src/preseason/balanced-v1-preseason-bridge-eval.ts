/**
 * Phase 2C-2H-6 — Read-only Balanced V1 preseason bridge evaluation.
 *
 * Diagnostic only. Does NOT choose or authorize a production preseason policy.
 * Does NOT modify computeBalancedV1Ratings / canonical Balanced weights or factor 14.
 *
 * Candidate A — WEIGHT_PRESERVED_NEUTRAL:
 *   literal Balanced weights with missing components as Z=0 (not renormalized)
 *   preseasonRating = 0.25 * talentZ * 14 = talentZ * 3.5
 *
 * Candidate B — TALENT_RENORMALIZED (counterfactual only):
 *   preseasonRating = talentZ * 14
 *   NOT authorized; calculated only in this diagnostic layer.
 */

import {
  BALANCED_V1_CALIBRATION_FACTOR,
  BALANCED_WEIGHT_EPA,
  BALANCED_WEIGHT_NET_POINTS,
  BALANCED_WEIGHT_TALENT,
  BALANCED_WEIGHT_WIN_PCT,
  calculateBalancedZScores,
  getBalancedZScore,
} from '../ratings/compute_balanced_v1';

export const TARGET_SEASON = 2026 as const;
export const EXPECTED_2026_FBS_COUNT = 138 as const;
export const BENCHMARK_SEASON = 2025 as const;
export const EXPECTED_2025_FBS_COUNT = 136 as const;

/** Proven historical Balanced snapshot window (persisted V1 updated_at). */
export const HISTORICAL_BALANCED_SNAPSHOT_CUTOFF_ISO =
  '2025-11-24T19:56:37.521Z' as const;

export const CANDIDATE_A_LABEL = 'WEIGHT_PRESERVED_NEUTRAL' as const;
export const CANDIDATE_B_LABEL = 'TALENT_RENORMALIZED' as const;

/** Candidate A scale: weight-preserved neutral = 0.25 * 14 */
export const CANDIDATE_A_TALENT_SCALE =
  BALANCED_WEIGHT_TALENT * BALANCED_V1_CALIBRATION_FACTOR; // 3.5

/** Candidate B scale: full calibration on talent alone (diagnostic only) */
export const CANDIDATE_B_TALENT_SCALE = BALANCED_V1_CALIBRATION_FACTOR; // 14.0

export const HIGHLIGHT_TEAM_IDS = [
  'north-dakota-state',
  'sacramento-state',
] as const;

export const PRESEASON_BRIDGE_AUTHORIZED = false as const;
export const RATINGS_WRITE_AUTHORIZED = false as const;
export const MODEL_CHANGE_AUTHORIZED = false as const;
export const TRANSITION_POLICY_DEFINED = false as const;

export type BridgeCandidateKind =
  | typeof CANDIDATE_A_LABEL
  | typeof CANDIDATE_B_LABEL;

export interface NumericSummary {
  count: number;
  min: number | null;
  avg: number | null;
  median: number | null;
  max: number | null;
  stdDev: number | null;
  range: number | null;
}

export interface ParityMetrics {
  mae: number | null;
  rmse: number | null;
  meanBias: number | null;
  medianAbsDelta: number | null;
  maxAbsDelta: number | null;
  pearson: number | null;
  spearman: number | null;
  comparedCount: number;
}

export interface OrderingOverlap {
  top15: number;
  bottom15: number;
  top25: number;
}

export interface TalentBridgeTeamRow {
  teamId: string;
  talentComposite: number;
  talentZ: number;
  candidateA: number;
  candidateB: number;
}

export interface PersistedV1TargetRow {
  teamId: string;
  powerRating: number;
}

export interface CandidateBenchmarkResult {
  kind: BridgeCandidateKind;
  ratings: NumericSummary;
  vsCanonical: ParityMetrics;
  orderingOverlap: OrderingOverlap;
}

export interface MatchupScalePercentiles {
  pairCount: number;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
}

export interface TransitionDiscontinuityNote {
  documented: true;
  transitionPolicyDefined: false;
  summary: string;
  riskPoints: string[];
}

export interface BalancedV1PreseasonBridgeInput {
  season: number;
  fbsIds2026: string[];
  talent2026: Array<{ teamId: string; talentComposite: number | null }>;
  /** Diagnostic coverage only — expected zero for 2026 preseason. */
  finalFbsVsFbsGames2026: number;
  usableEpaTeams2026: number;
  netPointsTeams2026: number;
  winPctTeams2026: number;
  existingV1FbsRows2026: number;
  /** 2025 benchmark: authoritative FBS + talent + persisted canonical V1 targets. */
  fbsIds2025: string[];
  talent2025: Array<{ teamId: string; talentComposite: number | null }>;
  persistedV1Targets2025: PersistedV1TargetRow[];
  historicalCutoffIso: string;
}

export interface BalancedV1PreseasonBridgeResult {
  ok: boolean;
  findings: string[];
  season: number;
  expected2026FbsCount: typeof EXPECTED_2026_FBS_COUNT;
  fbsCount2026: number;
  distinctFbs2026: number;
  talentRows2026: number;
  finiteTalent2026: number;
  talentSetExact2026: boolean;
  finalFbsVsFbsGames2026: number;
  usableEpaTeams2026: number;
  netPointsTeams2026: number;
  winPctTeams2026: number;
  existingV1FbsRows2026: number;
  historicalCutoffIso: string;
  benchmarkSeason: typeof BENCHMARK_SEASON;
  fbsCount2025: number;
  expected2025FbsCount: typeof EXPECTED_2025_FBS_COUNT;
  persistedTargetCount2025: number;
  persistedTargetSetExact2025: boolean;
  candidateA: CandidateBenchmarkResult;
  candidateB: CandidateBenchmarkResult;
  preview2026: {
    ratingCount: number;
    finite: number;
    candidateA: NumericSummary;
    candidateB: NumericSummary;
    teams: TalentBridgeTeamRow[];
    top20A: TalentBridgeTeamRow[];
    bottom20A: TalentBridgeTeamRow[];
    top20B: TalentBridgeTeamRow[];
    bottom20B: TalentBridgeTeamRow[];
    highlights: TalentBridgeTeamRow[];
  };
  matchupScaleA: MatchupScalePercentiles;
  matchupScaleB: MatchupScalePercentiles;
  transitionDiscontinuity: TransitionDiscontinuityNote;
  canonicalWeights: {
    talent: typeof BALANCED_WEIGHT_TALENT;
    epa: typeof BALANCED_WEIGHT_EPA;
    netPoints: typeof BALANCED_WEIGHT_NET_POINTS;
    winPct: typeof BALANCED_WEIGHT_WIN_PCT;
  };
  canonicalCalibrationFactor: typeof BALANCED_V1_CALIBRATION_FACTOR;
  candidateAScale: typeof CANDIDATE_A_TALENT_SCALE;
  candidateBScale: typeof CANDIDATE_B_TALENT_SCALE;
  preseasonBridgeAuthorized: false;
  ratingsWriteAuthorized: false;
  modelChangeAuthorized: false;
  transitionPolicyDefined: false;
  providersInvoked: false;
  mutationsInvoked: false;
  Odds: false;
  noConferenceAdjustment: true;
  noPreviousSeasonCarryForward: true;
  noSynthesizedMissingComponents: true;
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
    return {
      count: 0,
      min: null,
      avg: null,
      median: null,
      max: null,
      stdDev: null,
      range: null,
    };
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
  return {
    count: values.length,
    min,
    avg,
    median,
    max,
    stdDev: Math.sqrt(variance),
    range: max - min,
  };
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

export function computeParityMetrics(
  predicted: number[],
  target: number[]
): ParityMetrics {
  const n = Math.min(predicted.length, target.length);
  if (n === 0) {
    return {
      mae: null,
      rmse: null,
      meanBias: null,
      medianAbsDelta: null,
      maxAbsDelta: null,
      pearson: null,
      spearman: null,
      comparedCount: 0,
    };
  }
  const deltas = predicted.slice(0, n).map((p, i) => p - target[i]);
  const abs = deltas.map((d) => Math.abs(d));
  return {
    mae: abs.reduce((a, b) => a + b, 0) / n,
    rmse: Math.sqrt(deltas.reduce((a, d) => a + d * d, 0) / n),
    meanBias: deltas.reduce((a, b) => a + b, 0) / n,
    medianAbsDelta: numericSummary(abs).median,
    maxAbsDelta: Math.max(...abs),
    pearson: pearsonCorrelation(target.slice(0, n), predicted.slice(0, n)),
    spearman: spearmanCorrelation(target.slice(0, n), predicted.slice(0, n)),
    comparedCount: n,
  };
}

export function orderingOverlap(
  predicted: Array<{ teamId: string; value: number }>,
  target: Array<{ teamId: string; value: number }>
): OrderingOverlap {
  const predSorted = [...predicted].sort((a, b) => b.value - a.value);
  const targSorted = [...target].sort((a, b) => b.value - a.value);
  const overlap = (n: number, fromBottom = false) => {
    const a = fromBottom
      ? predSorted.slice(-n).map((r) => r.teamId)
      : predSorted.slice(0, n).map((r) => r.teamId);
    const b = fromBottom
      ? targSorted.slice(-n).map((r) => r.teamId)
      : targSorted.slice(0, n).map((r) => r.teamId);
    const setB = new Set(b);
    return a.filter((id) => setB.has(id)).length;
  };
  return {
    top15: overlap(15, false),
    bottom15: overlap(15, true),
    top25: overlap(25, false),
  };
}

/**
 * Talent-only bridge ratings. Does NOT call computeBalancedV1Ratings.
 * Candidate A uses weight-preserved neutral missing Z=0.
 * Candidate B is diagnostic renormalization only.
 */
export function computeTalentOnlyBridgeRatings(
  rows: Array<{ teamId: string; talentComposite: number }>
): TalentBridgeTeamRow[] {
  const values = rows.map((r) => r.talentComposite);
  const zStats = calculateBalancedZScores(values);
  return rows
    .map((r) => {
      const talentZ = getBalancedZScore(
        r.talentComposite,
        zStats.mean,
        zStats.stdDev
      );
      // WEIGHT_PRESERVED_NEUTRAL: 0.25*talentZ + 0 + 0 + 0, then ×14
      const candidateA = talentZ * CANDIDATE_A_TALENT_SCALE;
      // TALENT_RENORMALIZED (diagnostic only): talentZ × 14
      const candidateB = talentZ * CANDIDATE_B_TALENT_SCALE;
      return {
        teamId: r.teamId.toLowerCase(),
        talentComposite: r.talentComposite,
        talentZ,
        candidateA,
        candidateB,
      };
    })
    .sort((a, b) => a.teamId.localeCompare(b.teamId));
}

export function ratingDiffPercentiles(
  ratings: number[]
): MatchupScalePercentiles {
  if (ratings.length < 2) {
    return {
      pairCount: 0,
      p50: null,
      p75: null,
      p90: null,
      p95: null,
      p99: null,
      max: null,
    };
  }
  const diffs: number[] = [];
  for (let i = 0; i < ratings.length; i++) {
    for (let j = i + 1; j < ratings.length; j++) {
      diffs.push(Math.abs(ratings[i] - ratings[j]));
    }
  }
  diffs.sort((a, b) => a - b);
  const pct = (p: number) => {
    if (diffs.length === 0) return null;
    const idx = Math.min(
      diffs.length - 1,
      Math.max(0, Math.ceil((p / 100) * diffs.length) - 1)
    );
    return diffs[idx];
  };
  return {
    pairCount: diffs.length,
    p50: pct(50),
    p75: pct(75),
    p90: pct(90),
    p95: pct(95),
    p99: pct(99),
    max: diffs[diffs.length - 1],
  };
}

export const TRANSITION_DISCONTINUITY_NOTE: TransitionDiscontinuityNote = {
  documented: true,
  transitionPolicyDefined: false,
  summary:
    'Once 2026 games begin, canonical Balanced V1 recomputes all four z-score components across teams with games. A talent-only preseason rating can jump discontinuously when EPA/net/win components enter and all Zs are recomputed. No smoothing/decay is defined or authorized in this phase.',
  riskPoints: [
    'Preseason Candidate A uses only 25% of the composite weight (talent); midseason full Balanced redistributes signal across four components.',
    'Candidate B uses full 14.0 talent scale; switching to four-component Balanced after games would rescale the talent contribution down to 25% unless a transition policy is separately authorized.',
    'Early-season small samples for EPA/net/win can move peer z-score baselines and reorder teams abruptly.',
    'transitionPolicyDefined=false — do not invent smoothing/decay here.',
  ],
};

function finiteTalentMap(
  fbsIds: string[],
  talentRows: Array<{ teamId: string; talentComposite: number | null }>
): Map<string, number> {
  const fbs = new Set(sortedUnique(fbsIds));
  const map = new Map<string, number>();
  for (const t of talentRows) {
    const id = t.teamId.toLowerCase();
    if (!fbs.has(id)) continue;
    if (t.talentComposite === null || !Number.isFinite(Number(t.talentComposite))) {
      continue;
    }
    map.set(id, Number(t.talentComposite));
  }
  return map;
}

export function assessPreseasonBridgeGates(input: {
  season: number;
  fbsIds2026: string[];
  finiteTalent2026: number;
  talentSetExact2026: boolean;
  fbsIds2025: string[];
  persistedTargetCount2025: number;
  persistedTargetSetExact2025: boolean;
  previewFinite: number;
}): { ok: boolean; findings: string[] } {
  const findings: string[] = [];
  if (input.season !== TARGET_SEASON) {
    findings.push(`season must be ${TARGET_SEASON}`);
  }
  const fbs26 = sortedUnique(input.fbsIds2026);
  if (fbs26.length !== input.fbsIds2026.length) {
    findings.push('2026 FBS IDs contain duplicates');
  }
  if (fbs26.length !== EXPECTED_2026_FBS_COUNT) {
    findings.push(
      `2026 FBS count ${fbs26.length} != ${EXPECTED_2026_FBS_COUNT}`
    );
  }
  if (input.finiteTalent2026 !== EXPECTED_2026_FBS_COUNT) {
    findings.push(
      `2026 finite talent ${input.finiteTalent2026} != ${EXPECTED_2026_FBS_COUNT}`
    );
  }
  if (!input.talentSetExact2026) {
    findings.push('2026 talent set does not exactly match FBS');
  }
  const fbs25 = sortedUnique(input.fbsIds2025);
  if (fbs25.length !== EXPECTED_2025_FBS_COUNT) {
    findings.push(
      `2025 FBS count ${fbs25.length} != ${EXPECTED_2025_FBS_COUNT}`
    );
  }
  if (input.persistedTargetCount2025 !== EXPECTED_2025_FBS_COUNT) {
    findings.push(
      `2025 persisted V1 targets ${input.persistedTargetCount2025} != ${EXPECTED_2025_FBS_COUNT}`
    );
  }
  if (!input.persistedTargetSetExact2025) {
    findings.push('2025 persisted V1 target set does not exactly match FBS');
  }
  if (input.previewFinite !== EXPECTED_2026_FBS_COUNT) {
    findings.push(
      `2026 preview finite ${input.previewFinite} != ${EXPECTED_2026_FBS_COUNT}`
    );
  }
  return { ok: findings.length === 0, findings };
}

export function buildBalancedV1PreseasonBridgeEvaluation(
  input: BalancedV1PreseasonBridgeInput
): BalancedV1PreseasonBridgeResult {
  const fbs26 = sortedUnique(input.fbsIds2026);
  const talentMap26 = finiteTalentMap(fbs26, input.talent2026);
  const talentSetExact2026 = setsEqual([...talentMap26.keys()], fbs26);

  const rows26 = fbs26
    .filter((id) => talentMap26.has(id))
    .map((id) => ({
      teamId: id,
      talentComposite: talentMap26.get(id)!,
    }));
  const previewTeams = computeTalentOnlyBridgeRatings(rows26);
  const finitePreview = previewTeams.filter(
    (t) => Number.isFinite(t.candidateA) && Number.isFinite(t.candidateB)
  ).length;

  const fbs25 = sortedUnique(input.fbsIds2025);
  const talentMap25 = finiteTalentMap(fbs25, input.talent2025);
  const targetById = new Map(
    input.persistedV1Targets2025.map((r) => [
      r.teamId.toLowerCase(),
      r.powerRating,
    ] as const)
  );
  const targetIds = sortedUnique(
    input.persistedV1Targets2025
      .filter((r) => Number.isFinite(r.powerRating))
      .map((r) => r.teamId)
  );
  const persistedTargetSetExact2025 = setsEqual(targetIds, fbs25);

  const benchRows = fbs25
    .filter((id) => talentMap25.has(id) && targetById.has(id))
    .map((id) => ({
      teamId: id,
      talentComposite: talentMap25.get(id)!,
    }));
  const benchRatings = computeTalentOnlyBridgeRatings(benchRows);
  const aligned = benchRatings
    .map((r) => ({
      teamId: r.teamId,
      candidateA: r.candidateA,
      candidateB: r.candidateB,
      target: targetById.get(r.teamId)!,
    }))
    .filter((r) => Number.isFinite(r.target));

  const candidateA: CandidateBenchmarkResult = {
    kind: CANDIDATE_A_LABEL,
    ratings: numericSummary(aligned.map((r) => r.candidateA)),
    vsCanonical: computeParityMetrics(
      aligned.map((r) => r.candidateA),
      aligned.map((r) => r.target)
    ),
    orderingOverlap: orderingOverlap(
      aligned.map((r) => ({ teamId: r.teamId, value: r.candidateA })),
      aligned.map((r) => ({ teamId: r.teamId, value: r.target }))
    ),
  };
  const candidateB: CandidateBenchmarkResult = {
    kind: CANDIDATE_B_LABEL,
    ratings: numericSummary(aligned.map((r) => r.candidateB)),
    vsCanonical: computeParityMetrics(
      aligned.map((r) => r.candidateB),
      aligned.map((r) => r.target)
    ),
    orderingOverlap: orderingOverlap(
      aligned.map((r) => ({ teamId: r.teamId, value: r.candidateB })),
      aligned.map((r) => ({ teamId: r.teamId, value: r.target }))
    ),
  };

  const sortedA = [...previewTeams].sort(
    (a, b) => b.candidateA - a.candidateA
  );
  const sortedB = [...previewTeams].sort(
    (a, b) => b.candidateB - a.candidateB
  );
  const highlights = HIGHLIGHT_TEAM_IDS.map((id) =>
    previewTeams.find((t) => t.teamId === id)
  ).filter((t): t is TalentBridgeTeamRow => !!t);

  const gates = assessPreseasonBridgeGates({
    season: input.season,
    fbsIds2026: input.fbsIds2026,
    finiteTalent2026: talentMap26.size,
    talentSetExact2026,
    fbsIds2025: input.fbsIds2025,
    persistedTargetCount2025: targetIds.length,
    persistedTargetSetExact2025,
    previewFinite: finitePreview,
  });

  return {
    ok: gates.ok,
    findings: gates.findings,
    season: input.season,
    expected2026FbsCount: EXPECTED_2026_FBS_COUNT,
    fbsCount2026: fbs26.length,
    distinctFbs2026: fbs26.length,
    talentRows2026: input.talent2026.filter((t) =>
      fbs26.includes(t.teamId.toLowerCase())
    ).length,
    finiteTalent2026: talentMap26.size,
    talentSetExact2026,
    finalFbsVsFbsGames2026: input.finalFbsVsFbsGames2026,
    usableEpaTeams2026: input.usableEpaTeams2026,
    netPointsTeams2026: input.netPointsTeams2026,
    winPctTeams2026: input.winPctTeams2026,
    existingV1FbsRows2026: input.existingV1FbsRows2026,
    historicalCutoffIso: input.historicalCutoffIso,
    benchmarkSeason: BENCHMARK_SEASON,
    fbsCount2025: fbs25.length,
    expected2025FbsCount: EXPECTED_2025_FBS_COUNT,
    persistedTargetCount2025: targetIds.length,
    persistedTargetSetExact2025,
    candidateA,
    candidateB,
    preview2026: {
      ratingCount: previewTeams.length,
      finite: finitePreview,
      candidateA: numericSummary(previewTeams.map((t) => t.candidateA)),
      candidateB: numericSummary(previewTeams.map((t) => t.candidateB)),
      teams: previewTeams,
      top20A: sortedA.slice(0, 20),
      bottom20A: sortedA.slice(-20).reverse(),
      top20B: sortedB.slice(0, 20),
      bottom20B: sortedB.slice(-20).reverse(),
      highlights,
    },
    matchupScaleA: ratingDiffPercentiles(
      previewTeams.map((t) => t.candidateA)
    ),
    matchupScaleB: ratingDiffPercentiles(
      previewTeams.map((t) => t.candidateB)
    ),
    transitionDiscontinuity: TRANSITION_DISCONTINUITY_NOTE,
    canonicalWeights: {
      talent: BALANCED_WEIGHT_TALENT,
      epa: BALANCED_WEIGHT_EPA,
      netPoints: BALANCED_WEIGHT_NET_POINTS,
      winPct: BALANCED_WEIGHT_WIN_PCT,
    },
    canonicalCalibrationFactor: BALANCED_V1_CALIBRATION_FACTOR,
    candidateAScale: CANDIDATE_A_TALENT_SCALE,
    candidateBScale: CANDIDATE_B_TALENT_SCALE,
    preseasonBridgeAuthorized: false,
    ratingsWriteAuthorized: false,
    modelChangeAuthorized: false,
    transitionPolicyDefined: false,
    providersInvoked: false,
    mutationsInvoked: false,
    Odds: false,
    noConferenceAdjustment: true,
    noPreviousSeasonCarryForward: true,
    noSynthesizedMissingComponents: true,
  };
}

function fmt(n: number | null, digits = 4): string {
  if (n === null || !Number.isFinite(n)) return 'n/a';
  return n.toFixed(digits);
}

function fmtSummary(label: string, s: NumericSummary): string {
  return `${label} count=${s.count} min=${fmt(s.min)} avg=${fmt(s.avg)} median=${fmt(s.median)} max=${fmt(s.max)} stddev=${fmt(s.stdDev)} range=${fmt(s.range)}`;
}

export function formatBalancedV1PreseasonBridgeReport(
  result: BalancedV1PreseasonBridgeResult
): string {
  const lines: string[] = [];
  lines.push('=== Balanced V1 Preseason Bridge Evaluation (READ ONLY) ===');
  lines.push(`ok=${result.ok}`);
  lines.push(`season=${result.season}`);
  lines.push(
    `2026 FBS=${result.fbsCount2026} distinct=${result.distinctFbs2026} expected=${result.expected2026FbsCount}`
  );
  lines.push(
    `2026 talent rows=${result.talentRows2026} finite=${result.finiteTalent2026} setExact=${result.talentSetExact2026}`
  );
  lines.push(
    `2026 coverage finalFbsVsFbsGames=${result.finalFbsVsFbsGames2026} usableEpa=${result.usableEpaTeams2026} netPtsTeams=${result.netPointsTeams2026} winPctTeams=${result.winPctTeams2026} existingV1Fbs=${result.existingV1FbsRows2026}`
  );
  lines.push(
    `historicalCutoff=${result.historicalCutoffIso} benchmarkSeason=${result.benchmarkSeason}`
  );
  lines.push(
    `2025 FBS=${result.fbsCount2025} expected=${result.expected2025FbsCount} persistedTargets=${result.persistedTargetCount2025} setExact=${result.persistedTargetSetExact2025}`
  );
  lines.push(`canonicalWeights=${JSON.stringify(result.canonicalWeights)}`);
  lines.push(
    `canonicalCalibration=${result.canonicalCalibrationFactor} candidateAScale=${result.candidateAScale} candidateBScale=${result.candidateBScale}`
  );

  for (const c of [result.candidateA, result.candidateB]) {
    lines.push(`--- Candidate ${c.kind} (2025 vs Nov24 Balanced) ---`);
    lines.push(fmtSummary('ratings', c.ratings));
    lines.push(
      `vsCanonical MAE=${fmt(c.vsCanonical.mae)} RMSE=${fmt(c.vsCanonical.rmse)} meanBias=${fmt(c.vsCanonical.meanBias)} medianAbsDelta=${fmt(c.vsCanonical.medianAbsDelta)} maxAbsDelta=${fmt(c.vsCanonical.maxAbsDelta)} Pearson=${fmt(c.vsCanonical.pearson)} Spearman=${fmt(c.vsCanonical.spearman)} compared=${c.vsCanonical.comparedCount}`
    );
    lines.push(
      `orderingOverlap top15=${c.orderingOverlap.top15}/15 bottom15=${c.orderingOverlap.bottom15}/15 top25=${c.orderingOverlap.top25}/25`
    );
  }

  lines.push('--- 2026 Preview ---');
  lines.push(
    `ratingCount=${result.preview2026.ratingCount} finite=${result.preview2026.finite}`
  );
  lines.push(fmtSummary('candidateA', result.preview2026.candidateA));
  lines.push(fmtSummary('candidateB', result.preview2026.candidateB));
  lines.push('top20A:');
  for (const t of result.preview2026.top20A) {
    lines.push(
      `  ${t.teamId} talent=${fmt(t.talentComposite, 1)} z=${fmt(t.talentZ)} A=${fmt(t.candidateA)} B=${fmt(t.candidateB)}`
    );
  }
  lines.push('bottom20A:');
  for (const t of result.preview2026.bottom20A) {
    lines.push(
      `  ${t.teamId} talent=${fmt(t.talentComposite, 1)} z=${fmt(t.talentZ)} A=${fmt(t.candidateA)} B=${fmt(t.candidateB)}`
    );
  }
  lines.push('highlights:');
  for (const t of result.preview2026.highlights) {
    lines.push(
      `  ${t.teamId} talent=${fmt(t.talentComposite, 1)} z=${fmt(t.talentZ)} A=${fmt(t.candidateA)} B=${fmt(t.candidateB)}`
    );
  }
  lines.push(
    `matchupScaleA pairs=${result.matchupScaleA.pairCount} p50=${fmt(result.matchupScaleA.p50)} p75=${fmt(result.matchupScaleA.p75)} p90=${fmt(result.matchupScaleA.p90)} p95=${fmt(result.matchupScaleA.p95)} p99=${fmt(result.matchupScaleA.p99)} max=${fmt(result.matchupScaleA.max)}`
  );
  lines.push(
    `matchupScaleB pairs=${result.matchupScaleB.pairCount} p50=${fmt(result.matchupScaleB.p50)} p75=${fmt(result.matchupScaleB.p75)} p90=${fmt(result.matchupScaleB.p90)} p95=${fmt(result.matchupScaleB.p95)} p99=${fmt(result.matchupScaleB.p99)} max=${fmt(result.matchupScaleB.max)}`
  );
  lines.push('--- Transition discontinuity (documented, not solved) ---');
  lines.push(result.transitionDiscontinuity.summary);
  for (const p of result.transitionDiscontinuity.riskPoints) {
    lines.push(`  - ${p}`);
  }
  lines.push(
    `preseasonBridgeAuthorized=${result.preseasonBridgeAuthorized} ratingsWriteAuthorized=${result.ratingsWriteAuthorized} modelChangeAuthorized=${result.modelChangeAuthorized} transitionPolicyDefined=${result.transitionPolicyDefined}`
  );
  lines.push(
    `providersInvoked=${result.providersInvoked} mutationsInvoked=${result.mutationsInvoked} Odds=${result.Odds}`
  );
  lines.push(
    `noConferenceAdjustment=${result.noConferenceAdjustment} noPreviousSeasonCarryForward=${result.noPreviousSeasonCarryForward} noSynthesizedMissingComponents=${result.noSynthesizedMissingComponents}`
  );
  if (result.findings.length > 0) {
    lines.push('findings:');
    for (const f of result.findings) lines.push(`  - ${f}`);
  }
  return lines.join('\n');
}

export function parseBalancedV1PreseasonBridgeArgs(argv: string[]):
  | { ok: true; season: number }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let season: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--season') {
      const v = argv[++i];
      const n = Number(v);
      if (!Number.isInteger(n)) errors.push(`invalid season: ${v}`);
      else season = n;
    } else if (a.startsWith('--season=')) {
      const v = a.split('=')[1];
      const n = Number(v);
      if (!Number.isInteger(n)) errors.push(`invalid season: ${v}`);
      else season = n;
    } else {
      errors.push(`unknown arg: ${a}`);
    }
  }
  if (season === null) errors.push('missing --season');
  else if (season !== TARGET_SEASON) {
    errors.push(`season must be ${TARGET_SEASON}`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, season: season! };
}

export function sanitizeBalancedV1PreseasonBridgeError(
  _err?: unknown
): string {
  return 'Balanced V1 preseason bridge evaluation failed; connection and secret details suppressed';
}
