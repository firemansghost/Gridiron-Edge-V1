/**
 * Phase 2C-2H-8 — Read-only Balanced V1 global transition blend evaluation.
 *
 * Historical 2025 study of GLOBAL blended Candidate A → canonical schedules.
 * Blends only after 100% canonical coverage. No per-team mixed scales.
 *
 * Diagnostic only — does NOT authorize blend/transition/persistence/model changes.
 * Canonical computeBalancedV1Ratings and Candidate A (talentZ * 3.5) are unchanged.
 */

import {
  BALANCED_V1_CALIBRATION_FACTOR,
  BALANCED_WEIGHT_EPA,
  BALANCED_WEIGHT_NET_POINTS,
  BALANCED_WEIGHT_TALENT,
  BALANCED_WEIGHT_WIN_PCT,
  aggregateBalancedEpa,
  aggregateBalancedGameStats,
  buildBalancedTeamMetrics,
  computeBalancedV1Ratings,
  type BalancedTalentRow,
} from '../ratings/compute_balanced_v1';
import {
  CANDIDATE_A_LABEL,
  CANDIDATE_A_TALENT_SCALE,
  EXPECTED_2025_FBS_COUNT,
  EXPECTED_2026_FBS_COUNT,
  HIGHLIGHT_TEAM_IDS,
  HISTORICAL_BALANCED_SNAPSHOT_CUTOFF_ISO,
  analyzeTalentCoverage,
  computeParityMetrics,
  computeTalentOnlyBridgeRatings,
  numericSummary,
  orderingOverlap,
  type NumericSummary,
  type OrderingOverlap,
  type ParityMetrics,
} from './balanced-v1-preseason-bridge-eval';
import {
  CONFIRM_SEASON_2026,
  DEFAULT_CUTOFF_WEEKS,
  STUDY_SEASON_2025,
  assessWeekDateChronology,
  filterEpaThroughCutoff,
  filterGamesThroughCutoff,
  type ChronologyViolationSample,
  type PersistedV1Target,
  type TransitionEpaRow,
  type TransitionGameRow,
} from './balanced-v1-transition-timing-eval';

export {
  STUDY_SEASON_2025,
  CONFIRM_SEASON_2026,
  HISTORICAL_BALANCED_SNAPSHOT_CUTOFF_ISO,
};
export { EXPECTED_2025_FBS_COUNT, EXPECTED_2026_FBS_COUNT };

export type BlendPolicyId =
  | 'B1'
  | 'B2'
  | 'B3'
  | 'HARD_SWITCH_W3'
  | 'HARD_SWITCH_W4'
  | 'HARD_SWITCH_W6';

export type BlendPolicyKind = 'GLOBAL_BLEND' | 'HARD_SWITCH_CONTROL';

export interface BlendPolicyDefinition {
  id: BlendPolicyId;
  label: string;
  kind: BlendPolicyKind;
  /** Human-readable; rejected controls are diagnostic only. */
  rejectedControl: boolean;
  startBlendWeek: number | null;
  fullCanonicalWeek: number;
  canonicalWeightAtWeek: (week: number) => number;
}

/** B1 — GLOBAL_BLEND_W3_W6 (primary candidate schedule). */
export function b1CanonicalWeight(week: number): number {
  if (week <= 2) return 0;
  if (week === 3) return 0.25;
  if (week === 4) return 0.5;
  if (week === 5) return 0.75;
  return 1;
}

/** B2 — GLOBAL_BLEND_W4_W7 (more conservative). */
export function b2CanonicalWeight(week: number): number {
  if (week <= 3) return 0;
  if (week === 4) return 0.25;
  if (week === 5) return 0.5;
  if (week === 6) return 0.75;
  return 1;
}

/** B3 — GLOBAL_BLEND_W3_W5 (faster). */
export function b3CanonicalWeight(week: number): number {
  if (week <= 2) return 0;
  if (week === 3) return 1 / 3;
  if (week === 4) return 2 / 3;
  return 1;
}

export function hardSwitchWeight(switchWeek: number, week: number): number {
  return week < switchWeek ? 0 : 1;
}

export const BLEND_POLICIES: readonly BlendPolicyDefinition[] = [
  {
    id: 'B1',
    label: 'GLOBAL_BLEND_W3_W6',
    kind: 'GLOBAL_BLEND',
    rejectedControl: false,
    startBlendWeek: 3,
    fullCanonicalWeek: 6,
    canonicalWeightAtWeek: b1CanonicalWeight,
  },
  {
    id: 'B2',
    label: 'GLOBAL_BLEND_W4_W7',
    kind: 'GLOBAL_BLEND',
    rejectedControl: false,
    startBlendWeek: 4,
    fullCanonicalWeek: 7,
    canonicalWeightAtWeek: b2CanonicalWeight,
  },
  {
    id: 'B3',
    label: 'GLOBAL_BLEND_W3_W5',
    kind: 'GLOBAL_BLEND',
    rejectedControl: false,
    startBlendWeek: 3,
    fullCanonicalWeek: 5,
    canonicalWeightAtWeek: b3CanonicalWeight,
  },
  {
    id: 'HARD_SWITCH_W3',
    label: 'HARD_SWITCH_W3',
    kind: 'HARD_SWITCH_CONTROL',
    rejectedControl: true,
    startBlendWeek: 3,
    fullCanonicalWeek: 3,
    canonicalWeightAtWeek: (w) => hardSwitchWeight(3, w),
  },
  {
    id: 'HARD_SWITCH_W4',
    label: 'HARD_SWITCH_W4',
    kind: 'HARD_SWITCH_CONTROL',
    rejectedControl: true,
    startBlendWeek: 4,
    fullCanonicalWeek: 4,
    canonicalWeightAtWeek: (w) => hardSwitchWeight(4, w),
  },
  {
    id: 'HARD_SWITCH_W6',
    label: 'HARD_SWITCH_W6',
    kind: 'HARD_SWITCH_CONTROL',
    rejectedControl: true,
    startBlendWeek: 6,
    fullCanonicalWeek: 6,
    canonicalWeightAtWeek: (w) => hardSwitchWeight(6, w),
  },
] as const;

/**
 * Global blend: candidateA * (1 - w) + canonical * w.
 * No re-z-scoring. No conference adj. No HFA.
 */
export function blendRatings(
  candidateA: number,
  canonical: number,
  canonicalWeight: number
): number {
  const w = canonicalWeight;
  return candidateA * (1 - w) + canonical * w;
}

export interface BalancedV1TransitionBlendInput {
  fbsIds2025: string[];
  talent2025: BalancedTalentRow[];
  games2025: TransitionGameRow[];
  epa2025: TransitionEpaRow[];
  persistedV1Targets2025: PersistedV1Target[];
  historicalCutoffIso: string;
  cutoffWeeks?: readonly number[];
  fbsIds2026: string[];
  talent2026: BalancedTalentRow[];
  finalFbsVsFbsGames2026: number;
  existingV1FbsRows2026: number;
}

export interface WeeklyCanonicalSnapshot {
  cutoffWeek: number;
  ratingCount: number;
  teamIds: string[];
  ratingsById: Map<string, number>;
  exactFbsSet: boolean;
  fullCoverage: boolean;
  coveragePct: number;
  teamsWithAtLeast1FbsGame: number;
  teamsWithAtLeast2FbsGames: number;
}

export interface WeeklyMoverSample {
  teamId: string;
  prior: number;
  current: number;
  weeklyDelta: number;
  absDelta: number;
}

export interface WeeklyStabilityStats {
  meanAbsDelta: number | null;
  medianAbsDelta: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  maxAbsDelta: number | null;
  over2: number;
  over3: number;
  over5: number;
  over7: number;
  over10: number;
  top20Movers: WeeklyMoverSample[];
}

export interface PolicyWeekResult {
  week: number;
  canonicalWeight: number;
  count: number;
  blendedById: Map<string, number>;
  vsNov24: ParityMetrics;
  orderingVsNov24: OrderingOverlap;
  ratingsSummary: NumericSummary;
  weeklyStability: WeeklyStabilityStats | null;
  usedFullCanonical: boolean;
}

export interface PolicyPathSummary {
  policyId: BlendPolicyId;
  label: string;
  kind: BlendPolicyKind;
  rejectedControl: boolean;
  startWeek: number | null;
  fullCanonicalWeek: number;
  avgMAE: number | null;
  avgRMSE: number | null;
  avgMedianWeeklyMove: number | null;
  maxP95WeeklyMove: number | null;
  maxSingleWeeklyMove: number | null;
  weekPearson80: number | null;
  weekPearson85: number | null;
  weekPearson90: number | null;
  week8EndpointMaeVsCanonicalW8: number | null;
  week8EndpointMaxAbsVsCanonicalW8: number | null;
}

export interface PolicyEvaluation {
  policy: BlendPolicyDefinition;
  weeks: PolicyWeekResult[];
  path: PolicyPathSummary;
}

export interface BalancedV1TransitionBlendResult {
  ok: boolean;
  findings: string[];
  studySeason: typeof STUDY_SEASON_2025;
  expected2025FbsCount: typeof EXPECTED_2025_FBS_COUNT;
  fbsCount2025: number;
  talentFinite2025: number;
  talentSetExact2025: boolean;
  persistedTargetCount2025: number;
  persistedTargetSetExact2025: boolean;
  historicalCutoffIso: string;
  historicalCutoffExact: boolean;
  candidateALabel: typeof CANDIDATE_A_LABEL;
  candidateAScale: typeof CANDIDATE_A_TALENT_SCALE;
  candidateASummary: NumericSummary;
  canonicalSnapshots: Array<{
    cutoffWeek: number;
    ratingCount: number;
    fullCoverage: boolean;
    exactFbsSet: boolean;
    coveragePct: number;
    teamsWithAtLeast1FbsGame: number;
    teamsWithAtLeast2FbsGames: number;
  }>;
  firstFullCanonicalWeek: number | null;
  policies: PolicyEvaluation[];
  comparisonTable: PolicyPathSummary[];
  blendPolicyCandidate: 'INCONCLUSIVE';
  selectionThresholdDefined: false;
  weekDateChronologySafe: boolean;
  chronologyViolationCount: number;
  chronologyViolationSample: ChronologyViolationSample[];
  confirm2026: {
    fbsCount: number;
    distinctFbs: number;
    expectedFbs: typeof EXPECTED_2026_FBS_COUNT;
    talentRows2026Fbs: number;
    talentDistinctFbs2026: number;
    finiteTalent2026: number;
    talentSetExact2026: boolean;
    duplicateTalentTeamIds2026: number;
    highlightTeamsPresent: boolean;
    finalFbsVsFbsGames: number;
    existingV1FbsRows: number;
    purePreseason2026: boolean;
  };
  canonicalWeights: {
    talent: typeof BALANCED_WEIGHT_TALENT;
    epa: typeof BALANCED_WEIGHT_EPA;
    netPoints: typeof BALANCED_WEIGHT_NET_POINTS;
    winPct: typeof BALANCED_WEIGHT_WIN_PCT;
  };
  canonicalCalibrationFactor: typeof BALANCED_V1_CALIBRATION_FACTOR;
  blendPolicyAuthorized: false;
  transitionPolicyAuthorized: false;
  preseasonBridgeAuthorized: false;
  ratingsWriteAuthorized: false;
  modelChangeAuthorized: false;
  providersInvoked: false;
  mutationsInvoked: false;
  Odds: false;
  perTeamMixedScaleAuthorized: false;
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

function percentileSorted(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx];
}

export function buildWeeklyStabilityStats(
  movers: WeeklyMoverSample[]
): WeeklyStabilityStats {
  if (movers.length === 0) {
    return {
      meanAbsDelta: null,
      medianAbsDelta: null,
      p75: null,
      p90: null,
      p95: null,
      maxAbsDelta: null,
      over2: 0,
      over3: 0,
      over5: 0,
      over7: 0,
      over10: 0,
      top20Movers: [],
    };
  }
  const abs = movers.map((m) => m.absDelta).sort((a, b) => a - b);
  const meanAbs = abs.reduce((s, v) => s + v, 0) / abs.length;
  return {
    meanAbsDelta: meanAbs,
    medianAbsDelta: numericSummary(abs).median,
    p75: percentileSorted(abs, 75),
    p90: percentileSorted(abs, 90),
    p95: percentileSorted(abs, 95),
    maxAbsDelta: abs[abs.length - 1],
    over2: abs.filter((v) => v > 2).length,
    over3: abs.filter((v) => v > 3).length,
    over5: abs.filter((v) => v > 5).length,
    over7: abs.filter((v) => v > 7).length,
    over10: abs.filter((v) => v > 10).length,
    top20Movers: [...movers]
      .sort((a, b) => b.absDelta - a.absDelta)
      .slice(0, 20),
  };
}

function countTeamsByMinGames(
  aggregates: Map<string, { games: number }>,
  fbsIds: string[],
  minGames: number
): number {
  let n = 0;
  for (const id of fbsIds) {
    const g = aggregates.get(id.toLowerCase())?.games ?? 0;
    if (g >= minGames) n++;
  }
  return n;
}

export function computeWeeklyCanonicalSnapshots(options: {
  fbsIds: string[];
  talent: BalancedTalentRow[];
  games: TransitionGameRow[];
  epa: TransitionEpaRow[];
  cutoffWeeks: readonly number[];
}): WeeklyCanonicalSnapshot[] {
  const fbs = sortedUnique(options.fbsIds);
  const fbsSet = new Set(fbs);
  const out: WeeklyCanonicalSnapshot[] = [];

  for (const cutoffWeek of options.cutoffWeeks) {
    const gamesThrough = filterGamesThroughCutoff(options.games, cutoffWeek);
    const aggregates = aggregateBalancedGameStats(gamesThrough, fbsSet);
    const epaThrough = filterEpaThroughCutoff(
      options.epa,
      gamesThrough,
      cutoffWeek
    );
    const epaByTeam = aggregateBalancedEpa(epaThrough);
    const built = buildBalancedTeamMetrics({
      fbsTeamIds: fbs,
      talentRows: options.talent,
      gameAggregates: aggregates,
      epaByTeam,
    });
    const canonical = computeBalancedV1Ratings(built.metrics);
    const teamIds = sortedUnique(canonical.map((r) => r.teamId));
    const ratingsById = new Map(
      canonical.map((r) => [r.teamId.toLowerCase(), r.powerRating] as const)
    );
    const teams1 = countTeamsByMinGames(aggregates, fbs, 1);
    const teams2 = countTeamsByMinGames(aggregates, fbs, 2);
    const exactFbsSet = setsEqual(teamIds, fbs);
    const fullCoverage =
      canonical.length === fbs.length && exactFbsSet && teams1 === fbs.length;

    out.push({
      cutoffWeek,
      ratingCount: canonical.length,
      teamIds,
      ratingsById,
      exactFbsSet,
      fullCoverage,
      coveragePct: (teams1 / fbs.length) * 100,
      teamsWithAtLeast1FbsGame: teams1,
      teamsWithAtLeast2FbsGames: teams2,
    });
  }
  return out;
}

/**
 * Build blended ratings for all FBS teams at a week.
 * Fail closed when canonicalWeight > 0 without full exact canonical coverage.
 */
export function buildBlendedWeekRatings(options: {
  fbsIds: string[];
  candidateAById: Map<string, number>;
  canonicalSnapshot: WeeklyCanonicalSnapshot;
  canonicalWeight: number;
}):
  | { ok: true; blendedById: Map<string, number>; usedFullCanonical: boolean }
  | { ok: false; finding: string } {
  const fbs = sortedUnique(options.fbsIds);
  const w = options.canonicalWeight;
  if (w < 0 || w > 1 || !Number.isFinite(w)) {
    return { ok: false, finding: `invalid canonicalWeight=${w}` };
  }
  if (w > 0) {
    if (!options.canonicalSnapshot.fullCoverage) {
      return {
        ok: false,
        finding: `canonicalWeight=${w} at week ${options.canonicalSnapshot.cutoffWeek} but fullCoverage=false (count=${options.canonicalSnapshot.ratingCount})`,
      };
    }
    if (options.canonicalSnapshot.ratingCount !== fbs.length) {
      return {
        ok: false,
        finding: `canonical rating count ${options.canonicalSnapshot.ratingCount} != ${fbs.length}`,
      };
    }
    if (!options.canonicalSnapshot.exactFbsSet) {
      return {
        ok: false,
        finding: `canonical team set not exact FBS at week ${options.canonicalSnapshot.cutoffWeek}`,
      };
    }
  }

  const blendedById = new Map<string, number>();
  for (const id of fbs) {
    const a = options.candidateAById.get(id);
    if (a === undefined || !Number.isFinite(a)) {
      return { ok: false, finding: `missing Candidate A for ${id}` };
    }
    if (w === 0) {
      blendedById.set(id, a);
      continue;
    }
    const c = options.canonicalSnapshot.ratingsById.get(id);
    if (c === undefined || !Number.isFinite(c)) {
      return { ok: false, finding: `missing canonical rating for ${id}` };
    }
    blendedById.set(id, blendRatings(a, c, w));
  }
  return { ok: true, blendedById, usedFullCanonical: w > 0 };
}

function meanOf(values: Array<number | null>): number | null {
  const xs = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (xs.length === 0) return null;
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function firstWeekPearsonAtLeast(
  weeks: PolicyWeekResult[],
  threshold: number
): number | null {
  for (const w of weeks) {
    if (w.week < 3) continue;
    if (w.vsNov24.pearson !== null && w.vsNov24.pearson >= threshold) {
      return w.week;
    }
  }
  return null;
}

export function assessTransitionBlendGates(input: {
  fbsIds2025: string[];
  talentFinite2025: number;
  talentSetExact2025: boolean;
  persistedTargetCount2025: number;
  persistedTargetSetExact2025: boolean;
  historicalCutoffExact: boolean;
  fbsIds2026: string[];
  talentRows2026Fbs: number;
  talentDistinctFbs2026: number;
  finiteTalent2026: number;
  talentSetExact2026: boolean;
  duplicateTalentTeamIds2026: number;
  highlightTeamsPresent: boolean;
  finalFbsVsFbsGames2026: number;
  existingV1FbsRows2026: number;
  purePreseason2026: boolean;
  weekDateChronologySafe: boolean;
  chronologyViolationCount: number;
  policyFindings: string[];
}): { ok: boolean; findings: string[] } {
  const findings: string[] = [...input.policyFindings];
  const fbs = sortedUnique(input.fbsIds2025);
  if (fbs.length !== EXPECTED_2025_FBS_COUNT) {
    findings.push(`2025 FBS ${fbs.length} != ${EXPECTED_2025_FBS_COUNT}`);
  }
  if (input.talentFinite2025 !== EXPECTED_2025_FBS_COUNT) {
    findings.push(
      `2025 finite talent ${input.talentFinite2025} != ${EXPECTED_2025_FBS_COUNT}`
    );
  }
  if (!input.talentSetExact2025) findings.push('2025 talent set not exact FBS');
  if (input.persistedTargetCount2025 !== EXPECTED_2025_FBS_COUNT) {
    findings.push(
      `persisted V1 targets ${input.persistedTargetCount2025} != ${EXPECTED_2025_FBS_COUNT}`
    );
  }
  if (!input.persistedTargetSetExact2025) {
    findings.push('persisted V1 target set not exact FBS');
  }
  if (!input.historicalCutoffExact) {
    findings.push(
      `historicalCutoffIso must equal ${HISTORICAL_BALANCED_SNAPSHOT_CUTOFF_ISO}`
    );
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
  if (!input.highlightTeamsPresent) {
    findings.push(
      `authoritative 2026 FBS must include ${HIGHLIGHT_TEAM_IDS.join(' and ')}`
    );
  }
  if (input.talentRows2026Fbs !== EXPECTED_2026_FBS_COUNT) {
    findings.push(
      `talentRows2026Fbs ${input.talentRows2026Fbs} != ${EXPECTED_2026_FBS_COUNT}`
    );
  }
  if (input.talentDistinctFbs2026 !== EXPECTED_2026_FBS_COUNT) {
    findings.push(
      `talentDistinctFbs2026 ${input.talentDistinctFbs2026} != ${EXPECTED_2026_FBS_COUNT}`
    );
  }
  if (input.finiteTalent2026 !== EXPECTED_2026_FBS_COUNT) {
    findings.push(
      `finiteTalent2026 ${input.finiteTalent2026} != ${EXPECTED_2026_FBS_COUNT}`
    );
  }
  if (!input.talentSetExact2026) findings.push('2026 talent set not exact FBS');
  if (input.duplicateTalentTeamIds2026 !== 0) {
    findings.push(
      `duplicateTalentTeamIds2026=${input.duplicateTalentTeamIds2026} (must be 0)`
    );
  }
  if (input.finalFbsVsFbsGames2026 !== 0) {
    findings.push(
      `finalFbsVsFbsGames2026=${input.finalFbsVsFbsGames2026} (must be 0 for pure preseason)`
    );
  }
  if (input.existingV1FbsRows2026 !== 0) {
    findings.push(
      `existingV1FbsRows2026=${input.existingV1FbsRows2026} (must be 0 for pure preseason)`
    );
  }
  if (!input.purePreseason2026) {
    findings.push(
      'purePreseason2026=false (2026 must remain zero finals and zero V1 rows)'
    );
  }
  if (!input.weekDateChronologySafe) {
    findings.push(
      `weekDateChronologySafe=false chronologyViolationCount=${input.chronologyViolationCount}`
    );
  }
  return { ok: findings.length === 0, findings };
}

export function buildBalancedV1TransitionBlendEvaluation(
  input: BalancedV1TransitionBlendInput
): BalancedV1TransitionBlendResult {
  const fbs25 = sortedUnique(input.fbsIds2025);
  const fbsSet = new Set(fbs25);
  const cutoffWeeks = input.cutoffWeeks ?? DEFAULT_CUTOFF_WEEKS;
  const historicalCutoffExact =
    input.historicalCutoffIso === HISTORICAL_BALANCED_SNAPSHOT_CUTOFF_ISO;

  const talentFiniteRows = input.talent2025.filter(
    (t) =>
      fbsSet.has(t.teamId.toLowerCase()) &&
      t.talentComposite !== null &&
      Number.isFinite(Number(t.talentComposite))
  );
  const talentIds = sortedUnique(talentFiniteRows.map((t) => t.teamId));
  const talentSetExact2025 = setsEqual(talentIds, fbs25);

  const targetById = new Map(
    input.persistedV1Targets2025
      .filter((t) => fbsSet.has(t.teamId.toLowerCase()))
      .map((t) => [t.teamId.toLowerCase(), t.powerRating] as const)
  );
  const targetIds = sortedUnique([...targetById.keys()]);
  const persistedTargetSetExact2025 = setsEqual(targetIds, fbs25);

  // Frozen Candidate A from preseason talent (fixed for entire study).
  const candidateARows = computeTalentOnlyBridgeRatings(
    talentFiniteRows.map((t) => ({
      teamId: t.teamId,
      talentComposite: Number(t.talentComposite),
    }))
  );
  const candidateAById = new Map(
    candidateARows.map((r) => [r.teamId.toLowerCase(), r.candidateA] as const)
  );

  const canonicalSnapshots = computeWeeklyCanonicalSnapshots({
    fbsIds: fbs25,
    talent: input.talent2025,
    games: input.games2025,
    epa: input.epa2025,
    cutoffWeeks,
  });
  const snapAt = (w: number) =>
    canonicalSnapshots.find((s) => s.cutoffWeek === w) ?? null;
  const firstFullCanonicalWeek =
    canonicalSnapshots.find((s) => s.fullCoverage && s.cutoffWeek >= 1)
      ?.cutoffWeek ?? null;

  const chronology = assessWeekDateChronology(input.games2025, cutoffWeeks);
  const policyFindings: string[] = [];
  const policies: PolicyEvaluation[] = [];

  for (const policy of BLEND_POLICIES) {
    const weekResults: PolicyWeekResult[] = [];
    let priorBlended: Map<string, number> | null = null;

    for (const cutoffWeek of cutoffWeeks) {
      const snap = snapAt(cutoffWeek);
      if (!snap) {
        policyFindings.push(
          `${policy.id}: missing canonical snapshot week=${cutoffWeek}`
        );
        continue;
      }
      const w = policy.canonicalWeightAtWeek(cutoffWeek);
      const built = buildBlendedWeekRatings({
        fbsIds: fbs25,
        candidateAById,
        canonicalSnapshot: snap,
        canonicalWeight: w,
      });
      if (built.ok === false) {
        policyFindings.push(`${policy.id}: ${built.finding}`);
        continue;
      }

      const aligned: Array<{ teamId: string; pred: number; target: number }> =
        [];
      for (const id of fbs25) {
        const pred = built.blendedById.get(id);
        const target = targetById.get(id);
        if (pred === undefined || target === undefined) continue;
        aligned.push({ teamId: id, pred, target });
      }

      let weeklyStability: WeeklyStabilityStats | null = null;
      if (priorBlended) {
        const movers: WeeklyMoverSample[] = [];
        for (const id of fbs25) {
          const cur = built.blendedById.get(id);
          const prior = priorBlended.get(id);
          if (cur === undefined || prior === undefined) continue;
          const weeklyDelta = cur - prior;
          movers.push({
            teamId: id,
            prior,
            current: cur,
            weeklyDelta,
            absDelta: Math.abs(weeklyDelta),
          });
        }
        weeklyStability = buildWeeklyStabilityStats(movers);
      }

      weekResults.push({
        week: cutoffWeek,
        canonicalWeight: w,
        count: built.blendedById.size,
        blendedById: built.blendedById,
        vsNov24: computeParityMetrics(
          aligned.map((x) => x.pred),
          aligned.map((x) => x.target)
        ),
        orderingVsNov24: orderingOverlap(
          aligned.map((x) => ({ teamId: x.teamId, value: x.pred })),
          aligned.map((x) => ({ teamId: x.teamId, value: x.target }))
        ),
        ratingsSummary: numericSummary([...built.blendedById.values()]),
        weeklyStability,
        usedFullCanonical: built.usedFullCanonical,
      });
      priorBlended = built.blendedById;
    }

    const pathWeeks = weekResults.filter((w) => w.week >= 3 && w.week <= 8);
    const stabilityWeeks = pathWeeks.filter((w) => w.weeklyStability !== null);
    const w8 = weekResults.find((w) => w.week === 8) ?? null;
    const canonW8 = snapAt(8);
    let week8EndpointMaeVsCanonicalW8: number | null = null;
    let week8EndpointMaxAbsVsCanonicalW8: number | null = null;
    if (w8 && canonW8?.fullCoverage) {
      const abs: number[] = [];
      for (const id of fbs25) {
        const b = w8.blendedById.get(id);
        const c = canonW8.ratingsById.get(id);
        if (b === undefined || c === undefined) continue;
        abs.push(Math.abs(b - c));
      }
      if (abs.length > 0) {
        week8EndpointMaeVsCanonicalW8 =
          abs.reduce((s, v) => s + v, 0) / abs.length;
        week8EndpointMaxAbsVsCanonicalW8 = Math.max(...abs);
      }
    }

    const path: PolicyPathSummary = {
      policyId: policy.id,
      label: policy.label,
      kind: policy.kind,
      rejectedControl: policy.rejectedControl,
      startWeek: policy.startBlendWeek,
      fullCanonicalWeek: policy.fullCanonicalWeek,
      avgMAE: meanOf(pathWeeks.map((w) => w.vsNov24.mae)),
      avgRMSE: meanOf(pathWeeks.map((w) => w.vsNov24.rmse)),
      avgMedianWeeklyMove: meanOf(
        stabilityWeeks.map((w) => w.weeklyStability!.medianAbsDelta)
      ),
      maxP95WeeklyMove: (() => {
        const xs = stabilityWeeks
          .map((w) => w.weeklyStability!.p95)
          .filter((v): v is number => v !== null);
        return xs.length ? Math.max(...xs) : null;
      })(),
      maxSingleWeeklyMove: (() => {
        const xs = stabilityWeeks
          .map((w) => w.weeklyStability!.maxAbsDelta)
          .filter((v): v is number => v !== null);
        return xs.length ? Math.max(...xs) : null;
      })(),
      weekPearson80: firstWeekPearsonAtLeast(weekResults, 0.8),
      weekPearson85: firstWeekPearsonAtLeast(weekResults, 0.85),
      weekPearson90: firstWeekPearsonAtLeast(weekResults, 0.9),
      week8EndpointMaeVsCanonicalW8,
      week8EndpointMaxAbsVsCanonicalW8,
    };

    policies.push({ policy, weeks: weekResults, path });
  }

  const fbs26 = sortedUnique(input.fbsIds2026);
  const talent26 = analyzeTalentCoverage(fbs26, input.talent2026);
  const highlightTeamsPresent = HIGHLIGHT_TEAM_IDS.every((id) =>
    fbs26.includes(id)
  );
  const purePreseason2026 =
    input.finalFbsVsFbsGames2026 === 0 && input.existingV1FbsRows2026 === 0;

  const gates = assessTransitionBlendGates({
    fbsIds2025: input.fbsIds2025,
    talentFinite2025: talentFiniteRows.length,
    talentSetExact2025,
    persistedTargetCount2025: targetIds.length,
    persistedTargetSetExact2025,
    historicalCutoffExact,
    fbsIds2026: input.fbsIds2026,
    talentRows2026Fbs: talent26.talentRowsFbs,
    talentDistinctFbs2026: talent26.talentDistinctFbs,
    finiteTalent2026: talent26.finiteTalent,
    talentSetExact2026: talent26.talentSetExact,
    duplicateTalentTeamIds2026: talent26.duplicateTalentTeamIds,
    highlightTeamsPresent,
    finalFbsVsFbsGames2026: input.finalFbsVsFbsGames2026,
    existingV1FbsRows2026: input.existingV1FbsRows2026,
    purePreseason2026,
    weekDateChronologySafe: chronology.weekDateChronologySafe,
    chronologyViolationCount: chronology.chronologyViolationCount,
    policyFindings,
  });

  return {
    ok: gates.ok,
    findings: gates.findings,
    studySeason: STUDY_SEASON_2025,
    expected2025FbsCount: EXPECTED_2025_FBS_COUNT,
    fbsCount2025: fbs25.length,
    talentFinite2025: talentFiniteRows.length,
    talentSetExact2025,
    persistedTargetCount2025: targetIds.length,
    persistedTargetSetExact2025,
    historicalCutoffIso: input.historicalCutoffIso,
    historicalCutoffExact,
    candidateALabel: CANDIDATE_A_LABEL,
    candidateAScale: CANDIDATE_A_TALENT_SCALE,
    candidateASummary: numericSummary([...candidateAById.values()]),
    canonicalSnapshots: canonicalSnapshots.map((s) => ({
      cutoffWeek: s.cutoffWeek,
      ratingCount: s.ratingCount,
      fullCoverage: s.fullCoverage,
      exactFbsSet: s.exactFbsSet,
      coveragePct: s.coveragePct,
      teamsWithAtLeast1FbsGame: s.teamsWithAtLeast1FbsGame,
      teamsWithAtLeast2FbsGames: s.teamsWithAtLeast2FbsGames,
    })),
    firstFullCanonicalWeek,
    policies,
    comparisonTable: policies.map((p) => p.path),
    blendPolicyCandidate: 'INCONCLUSIVE',
    selectionThresholdDefined: false,
    weekDateChronologySafe: chronology.weekDateChronologySafe,
    chronologyViolationCount: chronology.chronologyViolationCount,
    chronologyViolationSample: chronology.chronologyViolationSample,
    confirm2026: {
      fbsCount: fbs26.length,
      distinctFbs: fbs26.length,
      expectedFbs: EXPECTED_2026_FBS_COUNT,
      talentRows2026Fbs: talent26.talentRowsFbs,
      talentDistinctFbs2026: talent26.talentDistinctFbs,
      finiteTalent2026: talent26.finiteTalent,
      talentSetExact2026: talent26.talentSetExact,
      duplicateTalentTeamIds2026: talent26.duplicateTalentTeamIds,
      highlightTeamsPresent,
      finalFbsVsFbsGames: input.finalFbsVsFbsGames2026,
      existingV1FbsRows: input.existingV1FbsRows2026,
      purePreseason2026,
    },
    canonicalWeights: {
      talent: BALANCED_WEIGHT_TALENT,
      epa: BALANCED_WEIGHT_EPA,
      netPoints: BALANCED_WEIGHT_NET_POINTS,
      winPct: BALANCED_WEIGHT_WIN_PCT,
    },
    canonicalCalibrationFactor: BALANCED_V1_CALIBRATION_FACTOR,
    blendPolicyAuthorized: false,
    transitionPolicyAuthorized: false,
    preseasonBridgeAuthorized: false,
    ratingsWriteAuthorized: false,
    modelChangeAuthorized: false,
    providersInvoked: false,
    mutationsInvoked: false,
    Odds: false,
    perTeamMixedScaleAuthorized: false,
  };
}

function fmt(n: number | null, digits = 4): string {
  if (n === null || !Number.isFinite(n)) return 'n/a';
  return n.toFixed(digits);
}

export function formatBalancedV1TransitionBlendReport(
  result: BalancedV1TransitionBlendResult
): string {
  const lines: string[] = [];
  lines.push('=== Balanced V1 Transition Blend Evaluation (READ ONLY) ===');
  lines.push(`ok=${result.ok}`);
  lines.push(
    `studySeason=${result.studySeason} FBS=${result.fbsCount2025} talentFinite=${result.talentFinite2025} targets=${result.persistedTargetCount2025}`
  );
  lines.push(
    `candidateA=${result.candidateALabel} scale=${result.candidateAScale}`
  );
  lines.push(
    `firstFullCanonicalWeek=${result.firstFullCanonicalWeek ?? 'n/a'}`
  );
  lines.push('canonicalSnapshots:');
  for (const s of result.canonicalSnapshots) {
    lines.push(
      `  W${s.cutoffWeek} count=${s.ratingCount} coverage=${fmt(s.coveragePct, 1)}% full=${s.fullCoverage} exactSet=${s.exactFbsSet} >=1=${s.teamsWithAtLeast1FbsGame} >=2=${s.teamsWithAtLeast2FbsGames}`
    );
  }
  for (const p of result.policies) {
    lines.push(
      `--- ${p.policy.id} ${p.policy.label} kind=${p.policy.kind} rejectedControl=${p.policy.rejectedControl} ---`
    );
    for (const w of p.weeks) {
      const st = w.weeklyStability;
      lines.push(
        `  W${w.week} weight=${fmt(w.canonicalWeight, 4)} count=${w.count} MAE=${fmt(w.vsNov24.mae)} RMSE=${fmt(w.vsNov24.rmse)} Pearson=${fmt(w.vsNov24.pearson)} Spearman=${fmt(w.vsNov24.spearman)} top15=${w.orderingVsNov24.top15} bottom15=${w.orderingVsNov24.bottom15}`
      );
      lines.push(
        `    dist min=${fmt(w.ratingsSummary.min)} avg=${fmt(w.ratingsSummary.avg)} median=${fmt(w.ratingsSummary.median)} max=${fmt(w.ratingsSummary.max)} std=${fmt(w.ratingsSummary.stdDev)} range=${fmt(w.ratingsSummary.range)}`
      );
      if (st) {
        lines.push(
          `    weeklyMove meanAbs=${fmt(st.meanAbsDelta)} medianAbs=${fmt(st.medianAbsDelta)} p75=${fmt(st.p75)} p90=${fmt(st.p90)} p95=${fmt(st.p95)} max=${fmt(st.maxAbsDelta)} >2=${st.over2} >3=${st.over3} >5=${st.over5} >7=${st.over7} >10=${st.over10}`
        );
      }
    }
    const path = p.path;
    lines.push(
      `  path avgMAE=${fmt(path.avgMAE)} avgRMSE=${fmt(path.avgRMSE)} avgMedianMove=${fmt(path.avgMedianWeeklyMove)} maxP95Move=${fmt(path.maxP95WeeklyMove)} maxSingleMove=${fmt(path.maxSingleWeeklyMove)} pearson80@${path.weekPearson80 ?? 'n/a'} pearson85@${path.weekPearson85 ?? 'n/a'} pearson90@${path.weekPearson90 ?? 'n/a'} W8vsCanonMAE=${fmt(path.week8EndpointMaeVsCanonicalW8)}`
    );
  }
  lines.push('comparisonTable:');
  lines.push(
    'policy\tstartWeek\tfullCanonicalWeek\tavgMAE\tavgRMSE\tavgMedianWeeklyMove\tmaxP95WeeklyMove\tmaxSingleWeeklyMove\tweekPearson80\tweekPearson85\tweekPearson90'
  );
  for (const row of result.comparisonTable) {
    lines.push(
      `${row.policyId}/${row.label}\t${row.startWeek ?? 'n/a'}\t${row.fullCanonicalWeek}\t${fmt(row.avgMAE)}\t${fmt(row.avgRMSE)}\t${fmt(row.avgMedianWeeklyMove)}\t${fmt(row.maxP95WeeklyMove)}\t${fmt(row.maxSingleWeeklyMove)}\t${row.weekPearson80 ?? 'n/a'}\t${row.weekPearson85 ?? 'n/a'}\t${row.weekPearson90 ?? 'n/a'}`
    );
  }
  lines.push(
    `2026 confirm FBS=${result.confirm2026.fbsCount} distinct=${result.confirm2026.distinctFbs} talentRows=${result.confirm2026.talentRows2026Fbs} finite=${result.confirm2026.finiteTalent2026} setExact=${result.confirm2026.talentSetExact2026} duplicates=${result.confirm2026.duplicateTalentTeamIds2026} highlights=${result.confirm2026.highlightTeamsPresent} finalGames=${result.confirm2026.finalFbsVsFbsGames} existingV1=${result.confirm2026.existingV1FbsRows} purePreseason2026=${result.confirm2026.purePreseason2026}`
  );
  lines.push(
    `weekDateChronologySafe=${result.weekDateChronologySafe} chronologyViolationCount=${result.chronologyViolationCount}`
  );
  lines.push(
    `blendPolicyCandidate=${result.blendPolicyCandidate} selectionThresholdDefined=${result.selectionThresholdDefined}`
  );
  lines.push(
    `blendPolicyAuthorized=${result.blendPolicyAuthorized} transitionPolicyAuthorized=${result.transitionPolicyAuthorized} ratingsWriteAuthorized=${result.ratingsWriteAuthorized} modelChangeAuthorized=${result.modelChangeAuthorized} perTeamMixedScaleAuthorized=${result.perTeamMixedScaleAuthorized}`
  );
  lines.push(
    `providersInvoked=${result.providersInvoked} mutationsInvoked=${result.mutationsInvoked} Odds=${result.Odds}`
  );
  if (result.findings.length > 0) {
    lines.push('findings:');
    for (const f of result.findings) lines.push(`  - ${f}`);
  }
  return lines.join('\n');
}

export function parseBalancedV1TransitionBlendArgs(argv: string[]):
  | { ok: true; studySeason: number }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let studySeason: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--study-season' || a === '--season') {
      const v = argv[++i];
      const n = Number(v);
      if (!Number.isInteger(n)) errors.push(`invalid season: ${v}`);
      else studySeason = n;
    } else if (a.startsWith('--study-season=') || a.startsWith('--season=')) {
      const v = a.split('=')[1];
      const n = Number(v);
      if (!Number.isInteger(n)) errors.push(`invalid season: ${v}`);
      else studySeason = n;
    } else {
      errors.push(`unknown arg: ${a}`);
    }
  }
  if (studySeason === null) studySeason = STUDY_SEASON_2025;
  if (studySeason !== STUDY_SEASON_2025) {
    errors.push(`studySeason must be ${STUDY_SEASON_2025}`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, studySeason };
}

export function sanitizeBalancedV1TransitionBlendError(_err?: unknown): string {
  return 'Balanced V1 transition blend evaluation failed; connection and secret details suppressed';
}
