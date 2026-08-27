/**
 * Phase 2C-2H-7 — Read-only Balanced V1 preseason-to-season transition timing study.
 *
 * Historical 2025 cumulative snapshots answer when canonical Balanced V1 has enough
 * coverage/stability to replace Candidate A (talentZ * 3.5).
 *
 * Diagnostic only — does NOT authorize transition, bridge, persistence, or model changes.
 * Canonical computeBalancedV1Ratings and Candidate A scale are unchanged.
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
  type BalancedEpaStatRow,
  type BalancedGameRow,
  type BalancedTalentRow,
  type BalancedV1ComputedRating,
} from '../ratings/compute_balanced_v1';
import {
  CANDIDATE_A_LABEL,
  CANDIDATE_A_TALENT_SCALE,
  EXPECTED_2025_FBS_COUNT,
  EXPECTED_2026_FBS_COUNT,
  HIGHLIGHT_TEAM_IDS,
  HISTORICAL_BALANCED_SNAPSHOT_CUTOFF_ISO,
  TARGET_SEASON,
  analyzeTalentCoverage,
  computeParityMetrics,
  computeTalentOnlyBridgeRatings,
  numericSummary,
  orderingOverlap,
  pearsonCorrelation,
  spearmanCorrelation,
  type NumericSummary,
  type OrderingOverlap,
  type ParityMetrics,
  type TalentBridgeTeamRow,
} from './balanced-v1-preseason-bridge-eval';

export const STUDY_SEASON_2025 = 2025 as const;
export const CONFIRM_SEASON_2026 = TARGET_SEASON;

/** Cumulative cutoffs: 0 = preseason (no games); N = through week N finals. */
export const DEFAULT_CUTOFF_WEEKS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

export type HardSwitchWeekCandidate =
  | 'WEEK_1'
  | 'WEEK_2'
  | 'WEEK_3'
  | 'WEEK_4'
  | 'LATER'
  | 'INCONCLUSIVE';

export interface TransitionGameRow extends BalancedGameRow {
  gameId: string;
  week: number;
  date: string; // ISO
  status: string;
}

export interface TransitionEpaRow extends BalancedEpaStatRow {
  gameId: string;
  week: number;
}

export interface PersistedV1Target {
  teamId: string;
  powerRating: number;
}

export interface BalancedV1TransitionTimingInput {
  fbsIds2025: string[];
  talent2025: BalancedTalentRow[];
  games2025: TransitionGameRow[];
  epa2025: TransitionEpaRow[];
  persistedV1Targets2025: PersistedV1Target[];
  historicalCutoffIso: string;
  cutoffWeeks?: readonly number[];
  /** 2026 confirmation (read-only). */
  fbsIds2026: string[];
  talent2026: BalancedTalentRow[];
  finalFbsVsFbsGames2026: number;
  existingV1FbsRows2026: number;
}

export interface ChronologyViolationSample {
  week: number;
  maxDate: string;
  laterWeek: number;
  laterMinDate: string;
}

export interface WeekDateChronologyAssessment {
  weekDateChronologySafe: boolean;
  chronologyViolationCount: number;
  chronologyViolationSample: ChronologyViolationSample[];
}

export interface CoverageMilestone {
  label: string;
  firstCutoffWeek: number | null;
}

export interface SnapshotCoverage {
  cutoffWeek: number;
  cutoffLabel: string;
  gamesIncluded: number;
  teamsWithAtLeast1FbsGame: number;
  teamsWithAtLeast2FbsGames: number;
  teamsWithAtLeast3FbsGames: number;
  zeroGameTeams: number;
  usableEpaTeams: number;
  missingEpaTeams: number;
  canonicalCoveragePct: number;
}

export interface TransitionJumpSample {
  teamId: string;
  candidateA: number;
  canonical: number;
  transitionDelta: number;
  absDelta: number;
  gamesPlayed: number;
}

export interface SnapshotTransitionStats {
  count: number;
  meanAbs: number | null;
  medianAbs: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  maxAbs: number | null;
  over3: number;
  over5: number;
  over7: number;
  over10: number;
  top20Jumps: TransitionJumpSample[];
}

export interface PolicyCoverageNote {
  policy: 'P1_HARD_GLOBAL_SWITCH' | 'P2_PER_TEAM_FIRST_GAME' | 'P3_PER_TEAM_TWO_GAMES';
  authorized: false;
  note: string;
  incompleteCanonicalCoverageAtCutoff: boolean;
  teamsStillOnCandidateA: number;
  teamsOnCanonical: number;
}

export interface TransitionSnapshotResult {
  coverage: SnapshotCoverage;
  ratingCount: number;
  ratingsSummary: NumericSummary;
  vsNov24: ParityMetrics;
  orderingVsNov24: OrderingOverlap;
  transitionFromCandidateA: SnapshotTransitionStats;
  policyNotes: PolicyCoverageNote[];
}

export interface BalancedV1TransitionTimingResult {
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
  snapshots: TransitionSnapshotResult[];
  milestones: CoverageMilestone[];
  week1CanonicalCoveragePct: number | null;
  week2CanonicalCoveragePct: number | null;
  week3CanonicalCoveragePct: number | null;
  week1MedianTransitionAbs: number | null;
  week2MedianTransitionAbs: number | null;
  week3MedianTransitionAbs: number | null;
  firstWeek95PctHaveOneGame: number | null;
  firstWeek95PctHaveTwoGames: number | null;
  /** Always INCONCLUSIVE in 2C-2H-7 — no coverage/MAE threshold is authorized. */
  hardSwitchWeekCandidate: 'INCONCLUSIVE';
  switchThresholdDefined: false;
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
  transitionPolicyAuthorized: false;
  preseasonBridgeAuthorized: false;
  ratingsWriteAuthorized: false;
  modelChangeAuthorized: false;
  providersInvoked: false;
  mutationsInvoked: false;
  Odds: false;
  mixedPolicyAuthorized: false;
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

function cutoffLabel(week: number): string {
  return week === 0 ? 'PRESEASON' : `WEEK_${week}`;
}

function percentileSorted(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx];
}

/**
 * Games through cutoff: final only, week <= cutoffWeek.
 * Preseason (0) includes no games.
 * Future weeks excluded.
 */
export function filterGamesThroughCutoff(
  games: TransitionGameRow[],
  cutoffWeek: number
): TransitionGameRow[] {
  if (cutoffWeek <= 0) return [];
  return games.filter(
    (g) =>
      g.status.toLowerCase() === 'final' &&
      Number.isFinite(g.week) &&
      g.week <= cutoffWeek
  );
}

/**
 * EPA through cutoff: only rows whose gameId is in the filtered final games
 * through the cutoff (future EPA excluded).
 */
export function filterEpaThroughCutoff(
  epaRows: TransitionEpaRow[],
  gamesThroughCutoff: TransitionGameRow[],
  cutoffWeek: number
): TransitionEpaRow[] {
  if (cutoffWeek <= 0) return [];
  const gameIds = new Set(gamesThroughCutoff.map((g) => g.gameId));
  return epaRows.filter((e) => gameIds.has(e.gameId));
}

export function countTeamsByMinGames(
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

export function buildTransitionStats(
  pairs: TransitionJumpSample[]
): SnapshotTransitionStats {
  if (pairs.length === 0) {
    return {
      count: 0,
      meanAbs: null,
      medianAbs: null,
      p75: null,
      p90: null,
      p95: null,
      maxAbs: null,
      over3: 0,
      over5: 0,
      over7: 0,
      over10: 0,
      top20Jumps: [],
    };
  }
  const abs = pairs.map((p) => p.absDelta).sort((a, b) => a - b);
  const meanAbs = abs.reduce((s, v) => s + v, 0) / abs.length;
  return {
    count: pairs.length,
    meanAbs,
    medianAbs: numericSummary(abs).median,
    p75: percentileSorted(abs, 75),
    p90: percentileSorted(abs, 90),
    p95: percentileSorted(abs, 95),
    maxAbs: abs[abs.length - 1],
    over3: abs.filter((v) => v > 3).length,
    over5: abs.filter((v) => v > 5).length,
    over7: abs.filter((v) => v > 7).length,
    over10: abs.filter((v) => v > 10).length,
    top20Jumps: [...pairs]
      .sort((a, b) => b.absDelta - a.absDelta)
      .slice(0, 20),
  };
}

/**
 * Phase 2C-2H-7 does not authorize a transition threshold.
 * Coverage milestones remain factual decision inputs only — never auto-map to a switch week.
 */
export function recommendHardSwitchWeek(_options?: {
  snapshots?: TransitionSnapshotResult[];
  firstWeek95PctHaveOneGame?: number | null;
}): 'INCONCLUSIVE' {
  return 'INCONCLUSIVE';
}

/**
 * Fail-closed chronology gate: for each evaluated numbered week N, no final game
 * assigned to week N may have a date on/after the earliest final-game date of any
 * later evaluated week. Equivalent: maxDate(week N) < minDate(any week > N).
 * Does not reassign weeks or invent rescheduling rules.
 */
export function assessWeekDateChronology(
  games: TransitionGameRow[],
  evaluatedWeeks: readonly number[]
): WeekDateChronologyAssessment {
  const numbered = [...new Set(evaluatedWeeks.filter((w) => w >= 1))].sort(
    (a, b) => a - b
  );
  const numberedSet = new Set(numbered);
  const byWeek = new Map<number, string[]>();
  for (const g of games) {
    if (String(g.status).toLowerCase() !== 'final') continue;
    if (!numberedSet.has(g.week)) continue;
    if (!g.date) continue;
    const list = byWeek.get(g.week) ?? [];
    list.push(g.date);
    byWeek.set(g.week, list);
  }

  const weekStats = new Map<number, { min: string; max: string }>();
  for (const week of numbered) {
    const dates = (byWeek.get(week) ?? []).slice().sort();
    if (dates.length === 0) continue;
    weekStats.set(week, { min: dates[0], max: dates[dates.length - 1] });
  }

  const sample: ChronologyViolationSample[] = [];
  for (let i = 0; i < numbered.length; i++) {
    const week = numbered[i];
    const cur = weekStats.get(week);
    if (!cur) continue;
    for (let j = i + 1; j < numbered.length; j++) {
      const later = numbered[j];
      const laterStats = weekStats.get(later);
      if (!laterStats) continue;
      if (cur.max >= laterStats.min) {
        sample.push({
          week,
          maxDate: cur.max,
          laterWeek: later,
          laterMinDate: laterStats.min,
        });
      }
    }
  }

  return {
    weekDateChronologySafe: sample.length === 0,
    chronologyViolationCount: sample.length,
    chronologyViolationSample: sample.slice(0, 10),
  };
}

function firstWeekMeeting(
  snapshots: TransitionSnapshotResult[],
  predicate: (s: TransitionSnapshotResult) => boolean
): number | null {
  for (const s of snapshots) {
    if (s.coverage.cutoffWeek === 0) continue;
    if (predicate(s)) return s.coverage.cutoffWeek;
  }
  return null;
}

export function assessTransitionTimingGates(input: {
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
}): { ok: boolean; findings: string[] } {
  const findings: string[] = [];
  const fbs = sortedUnique(input.fbsIds2025);
  if (fbs.length !== EXPECTED_2025_FBS_COUNT) {
    findings.push(
      `2025 FBS ${fbs.length} != ${EXPECTED_2025_FBS_COUNT}`
    );
  }
  if (input.talentFinite2025 !== EXPECTED_2025_FBS_COUNT) {
    findings.push(
      `2025 finite talent ${input.talentFinite2025} != ${EXPECTED_2025_FBS_COUNT}`
    );
  }
  if (!input.talentSetExact2025) {
    findings.push('2025 talent set not exact FBS');
  }
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
  if (!input.talentSetExact2026) {
    findings.push('2026 talent set not exact FBS');
  }
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
    findings.push('purePreseason2026=false (2026 must remain zero finals and zero V1 rows)');
  }
  if (!input.weekDateChronologySafe) {
    findings.push(
      `weekDateChronologySafe=false chronologyViolationCount=${input.chronologyViolationCount}`
    );
  }
  return { ok: findings.length === 0, findings };
}

export function buildBalancedV1TransitionTimingEvaluation(
  input: BalancedV1TransitionTimingInput
): BalancedV1TransitionTimingResult {
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

  const candidateARows = computeTalentOnlyBridgeRatings(
    talentFiniteRows.map((t) => ({
      teamId: t.teamId,
      talentComposite: Number(t.talentComposite),
    }))
  );
  const candidateAById = new Map(
    candidateARows.map((r) => [r.teamId, r] as const)
  );

  const snapshots: TransitionSnapshotResult[] = [];

  for (const cutoffWeek of cutoffWeeks) {
    const gamesThrough = filterGamesThroughCutoff(input.games2025, cutoffWeek);
    // Count only FBS-vs-FBS for gamesIncluded
    let fbsVsFbsCount = 0;
    for (const g of gamesThrough) {
      if (
        fbsSet.has(g.homeTeamId.toLowerCase()) &&
        fbsSet.has(g.awayTeamId.toLowerCase())
      ) {
        fbsVsFbsCount++;
      }
    }
    const aggregates = aggregateBalancedGameStats(gamesThrough, fbsSet);
    const epaThrough = filterEpaThroughCutoff(
      input.epa2025,
      gamesThrough,
      cutoffWeek
    );
    const epaByTeam = aggregateBalancedEpa(epaThrough);
    const built = buildBalancedTeamMetrics({
      fbsTeamIds: fbs25,
      talentRows: input.talent2025,
      gameAggregates: aggregates,
      epaByTeam,
    });
    const canonical = computeBalancedV1Ratings(built.metrics);
    const canonicalById = new Map(
      canonical.map((r) => [r.teamId.toLowerCase(), r] as const)
    );

    const teams1 = countTeamsByMinGames(aggregates, fbs25, 1);
    const teams2 = countTeamsByMinGames(aggregates, fbs25, 2);
    const teams3 = countTeamsByMinGames(aggregates, fbs25, 3);
    const zeroGame = fbs25.length - teams1;
    const coveragePct = (teams1 / fbs25.length) * 100;

    const alignedTarget: Array<{ teamId: string; pred: number; target: number }> =
      [];
    for (const r of canonical) {
      const t = targetById.get(r.teamId);
      if (t === undefined || !Number.isFinite(t)) continue;
      alignedTarget.push({ teamId: r.teamId, pred: r.powerRating, target: t });
    }

    const jumps: TransitionJumpSample[] = [];
    for (const r of canonical) {
      const a = candidateAById.get(r.teamId);
      if (!a) continue;
      const delta = r.powerRating - a.candidateA;
      jumps.push({
        teamId: r.teamId,
        candidateA: a.candidateA,
        canonical: r.powerRating,
        transitionDelta: delta,
        absDelta: Math.abs(delta),
        gamesPlayed: r.games,
      });
    }

    const incomplete = teams1 < fbs25.length;
    const stillOnA = zeroGame;
    const onCanonical = teams1;

    const policyNotes: PolicyCoverageNote[] = [
      {
        policy: 'P1_HARD_GLOBAL_SWITCH',
        authorized: false,
        note: `Hard global switch at ${cutoffLabel(cutoffWeek)} would move all teams off Candidate A, but canonical coverage is ${coveragePct.toFixed(1)}% (${teams1}/${fbs25.length}). Incomplete coverage means some teams have no canonical Balanced rating yet.`,
        incompleteCanonicalCoverageAtCutoff: incomplete,
        teamsStillOnCandidateA: stillOnA,
        teamsOnCanonical: onCanonical,
      },
      {
        policy: 'P2_PER_TEAM_FIRST_GAME',
        authorized: false,
        note: `Per-team switch after first FBS game: ${onCanonical} on canonical, ${stillOnA} remain on Candidate A. Mixing Candidate-A and canonical ratings places teams on somewhat different scales because Z-scores are computed only over the eligible Balanced population.`,
        incompleteCanonicalCoverageAtCutoff: incomplete,
        teamsStillOnCandidateA: stillOnA,
        teamsOnCanonical: onCanonical,
      },
      {
        policy: 'P3_PER_TEAM_TWO_GAMES',
        authorized: false,
        note: `Per-team switch after >=2 FBS games: ${teams2} eligible for canonical, ${fbs25.length - teams2} would remain on Candidate A. Diagnostic only.`,
        incompleteCanonicalCoverageAtCutoff: teams2 < fbs25.length,
        teamsStillOnCandidateA: fbs25.length - teams2,
        teamsOnCanonical: teams2,
      },
    ];

    snapshots.push({
      coverage: {
        cutoffWeek,
        cutoffLabel: cutoffLabel(cutoffWeek),
        gamesIncluded: fbsVsFbsCount,
        teamsWithAtLeast1FbsGame: teams1,
        teamsWithAtLeast2FbsGames: teams2,
        teamsWithAtLeast3FbsGames: teams3,
        zeroGameTeams: zeroGame,
        usableEpaTeams: built.teamsWithUsableEpa,
        missingEpaTeams: built.teamsMissingEpa.length,
        canonicalCoveragePct: coveragePct,
      },
      ratingCount: canonical.length,
      ratingsSummary: numericSummary(canonical.map((r) => r.powerRating)),
      vsNov24: computeParityMetrics(
        alignedTarget.map((x) => x.pred),
        alignedTarget.map((x) => x.target)
      ),
      orderingVsNov24: orderingOverlap(
        alignedTarget.map((x) => ({ teamId: x.teamId, value: x.pred })),
        alignedTarget.map((x) => ({ teamId: x.teamId, value: x.target }))
      ),
      transitionFromCandidateA: buildTransitionStats(jumps),
      policyNotes,
    });

    void canonicalById;
  }

  const snapAt = (w: number) =>
    snapshots.find((s) => s.coverage.cutoffWeek === w) ?? null;

  const firstWeek95PctHaveOneGame = firstWeekMeeting(
    snapshots,
    (s) => s.coverage.teamsWithAtLeast1FbsGame / fbs25.length >= 0.95
  );
  const firstWeek95PctHaveTwoGames = firstWeekMeeting(
    snapshots,
    (s) => s.coverage.teamsWithAtLeast2FbsGames / fbs25.length >= 0.95
  );

  const milestones: CoverageMilestone[] = [
    {
      label: '90% FBS have >=1 qualifying game',
      firstCutoffWeek: firstWeekMeeting(
        snapshots,
        (s) => s.coverage.teamsWithAtLeast1FbsGame / fbs25.length >= 0.9
      ),
    },
    {
      label: '95% FBS have >=1 qualifying game',
      firstCutoffWeek: firstWeek95PctHaveOneGame,
    },
    {
      label: '100% FBS have >=1 qualifying game',
      firstCutoffWeek: firstWeekMeeting(
        snapshots,
        (s) => s.coverage.teamsWithAtLeast1FbsGame === fbs25.length
      ),
    },
    {
      label: '90% FBS have >=2 qualifying games',
      firstCutoffWeek: firstWeekMeeting(
        snapshots,
        (s) => s.coverage.teamsWithAtLeast2FbsGames / fbs25.length >= 0.9
      ),
    },
    {
      label: '95% FBS have >=2 qualifying games',
      firstCutoffWeek: firstWeek95PctHaveTwoGames,
    },
  ];

  const hardSwitchWeekCandidate = recommendHardSwitchWeek();
  const switchThresholdDefined = false as const;

  const chronology = assessWeekDateChronology(input.games2025, cutoffWeeks);

  const fbs26 = sortedUnique(input.fbsIds2026);
  const talent26 = analyzeTalentCoverage(fbs26, input.talent2026);
  const highlightTeamsPresent = HIGHLIGHT_TEAM_IDS.every((id) =>
    fbs26.includes(id)
  );
  const purePreseason2026 =
    input.finalFbsVsFbsGames2026 === 0 && input.existingV1FbsRows2026 === 0;

  const gates = assessTransitionTimingGates({
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
    candidateASummary: numericSummary(
      candidateARows.map((r) => r.candidateA)
    ),
    snapshots,
    milestones,
    week1CanonicalCoveragePct: snapAt(1)?.coverage.canonicalCoveragePct ?? null,
    week2CanonicalCoveragePct: snapAt(2)?.coverage.canonicalCoveragePct ?? null,
    week3CanonicalCoveragePct: snapAt(3)?.coverage.canonicalCoveragePct ?? null,
    week1MedianTransitionAbs:
      snapAt(1)?.transitionFromCandidateA.medianAbs ?? null,
    week2MedianTransitionAbs:
      snapAt(2)?.transitionFromCandidateA.medianAbs ?? null,
    week3MedianTransitionAbs:
      snapAt(3)?.transitionFromCandidateA.medianAbs ?? null,
    firstWeek95PctHaveOneGame,
    firstWeek95PctHaveTwoGames,
    hardSwitchWeekCandidate,
    switchThresholdDefined,
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
    transitionPolicyAuthorized: false,
    preseasonBridgeAuthorized: false,
    ratingsWriteAuthorized: false,
    modelChangeAuthorized: false,
    providersInvoked: false,
    mutationsInvoked: false,
    Odds: false,
    mixedPolicyAuthorized: false,
  };
}

function fmt(n: number | null, digits = 4): string {
  if (n === null || !Number.isFinite(n)) return 'n/a';
  return n.toFixed(digits);
}

export function formatBalancedV1TransitionTimingReport(
  result: BalancedV1TransitionTimingResult
): string {
  const lines: string[] = [];
  lines.push('=== Balanced V1 Transition Timing Evaluation (READ ONLY) ===');
  lines.push(`ok=${result.ok}`);
  lines.push(
    `studySeason=${result.studySeason} FBS=${result.fbsCount2025} talentFinite=${result.talentFinite2025} targets=${result.persistedTargetCount2025}`
  );
  lines.push(
    `candidateA=${result.candidateALabel} scale=${result.candidateAScale}`
  );
  lines.push(
    `2026 confirm FBS=${result.confirm2026.fbsCount} distinct=${result.confirm2026.distinctFbs} talentRows=${result.confirm2026.talentRows2026Fbs} talentDistinct=${result.confirm2026.talentDistinctFbs2026} finite=${result.confirm2026.finiteTalent2026} setExact=${result.confirm2026.talentSetExact2026} duplicates=${result.confirm2026.duplicateTalentTeamIds2026} highlights=${result.confirm2026.highlightTeamsPresent} finalFbsVsFbsGames=${result.confirm2026.finalFbsVsFbsGames} existingV1=${result.confirm2026.existingV1FbsRows} purePreseason2026=${result.confirm2026.purePreseason2026}`
  );
  lines.push(
    `weekDateChronologySafe=${result.weekDateChronologySafe} chronologyViolationCount=${result.chronologyViolationCount}`
  );
  lines.push('milestones:');
  for (const m of result.milestones) {
    lines.push(`  ${m.label}: firstWeek=${m.firstCutoffWeek ?? 'n/a'}`);
  }
  for (const s of result.snapshots) {
    const c = s.coverage;
    const t = s.transitionFromCandidateA;
    lines.push(
      `--- ${c.cutoffLabel} games=${c.gamesIncluded} teams>=1=${c.teamsWithAtLeast1FbsGame} >=2=${c.teamsWithAtLeast2FbsGames} >=3=${c.teamsWithAtLeast3FbsGames} zero=${c.zeroGameTeams} epaUsable=${c.usableEpaTeams} coverage=${fmt(c.canonicalCoveragePct, 1)}% ---`
    );
    lines.push(
      `  canonical count=${s.ratingCount} min=${fmt(s.ratingsSummary.min)} avg=${fmt(s.ratingsSummary.avg)} median=${fmt(s.ratingsSummary.median)} max=${fmt(s.ratingsSummary.max)} std=${fmt(s.ratingsSummary.stdDev)} range=${fmt(s.ratingsSummary.range)}`
    );
    lines.push(
      `  vsNov24 MAE=${fmt(s.vsNov24.mae)} RMSE=${fmt(s.vsNov24.rmse)} Pearson=${fmt(s.vsNov24.pearson)} Spearman=${fmt(s.vsNov24.spearman)} top15=${s.orderingVsNov24.top15} bottom15=${s.orderingVsNov24.bottom15}`
    );
    lines.push(
      `  transitionFromA count=${t.count} meanAbs=${fmt(t.meanAbs)} medianAbs=${fmt(t.medianAbs)} p75=${fmt(t.p75)} p90=${fmt(t.p90)} p95=${fmt(t.p95)} max=${fmt(t.maxAbs)} >3=${t.over3} >5=${t.over5} >7=${t.over7} >10=${t.over10}`
    );
    for (const p of s.policyNotes) {
      lines.push(
        `  ${p.policy} authorized=${p.authorized} incomplete=${p.incompleteCanonicalCoverageAtCutoff} onA=${p.teamsStillOnCandidateA} onCanonical=${p.teamsOnCanonical}`
      );
    }
  }
  lines.push(
    `week1Coverage=${fmt(result.week1CanonicalCoveragePct, 1)}% week2=${fmt(result.week2CanonicalCoveragePct, 1)}% week3=${fmt(result.week3CanonicalCoveragePct, 1)}%`
  );
  lines.push(
    `week1MedianTransitionAbs=${fmt(result.week1MedianTransitionAbs)} week2=${fmt(result.week2MedianTransitionAbs)} week3=${fmt(result.week3MedianTransitionAbs)}`
  );
  lines.push(
    `firstWeek95PctHaveOneGame=${result.firstWeek95PctHaveOneGame ?? 'n/a'} firstWeek95PctHaveTwoGames=${result.firstWeek95PctHaveTwoGames ?? 'n/a'}`
  );
  lines.push(
    `hardSwitchWeekCandidate=${result.hardSwitchWeekCandidate} switchThresholdDefined=${result.switchThresholdDefined} (no threshold authorized in 2C-2H-7)`
  );
  lines.push(
    `transitionPolicyAuthorized=${result.transitionPolicyAuthorized} preseasonBridgeAuthorized=${result.preseasonBridgeAuthorized} ratingsWriteAuthorized=${result.ratingsWriteAuthorized} modelChangeAuthorized=${result.modelChangeAuthorized} mixedPolicyAuthorized=${result.mixedPolicyAuthorized}`
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

export function parseBalancedV1TransitionTimingArgs(argv: string[]):
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

export function sanitizeBalancedV1TransitionTimingError(
  _err?: unknown
): string {
  return 'Balanced V1 transition timing evaluation failed; connection and secret details suppressed';
}

// Re-export for tests
export {
  CANDIDATE_A_TALENT_SCALE,
  EXPECTED_2025_FBS_COUNT,
  EXPECTED_2026_FBS_COUNT,
  HISTORICAL_BALANCED_SNAPSHOT_CUTOFF_ISO,
  pearsonCorrelation,
  spearmanCorrelation,
  type TalentBridgeTeamRow,
  type BalancedV1ComputedRating,
};
