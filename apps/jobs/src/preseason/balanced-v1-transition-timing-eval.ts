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
  HISTORICAL_BALANCED_SNAPSHOT_CUTOFF_ISO,
  TARGET_SEASON,
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
  talentFinite2026: number;
  finalFbsVsFbsGames2026: number;
  existingV1FbsRows2026: number;
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
  hardSwitchWeekCandidate: HardSwitchWeekCandidate;
  confirm2026: {
    fbsCount: number;
    expectedFbs: typeof EXPECTED_2026_FBS_COUNT;
    talentFinite: number;
    finalFbsVsFbsGames: number;
    existingV1FbsRows: number;
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

export function recommendHardSwitchWeek(options: {
  snapshots: TransitionSnapshotResult[];
  firstWeek95PctHaveOneGame: number | null;
}): HardSwitchWeekCandidate {
  const w = options.firstWeek95PctHaveOneGame;
  if (w === null) return 'INCONCLUSIVE';
  if (w === 1) return 'WEEK_1';
  if (w === 2) return 'WEEK_2';
  if (w === 3) return 'WEEK_3';
  if (w === 4) return 'WEEK_4';
  if (w > 4) return 'LATER';
  return 'INCONCLUSIVE';
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
  fbsCount2026: number;
  talentFinite2026: number;
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
  if (input.fbsCount2026 !== EXPECTED_2026_FBS_COUNT) {
    findings.push(
      `2026 FBS ${input.fbsCount2026} != ${EXPECTED_2026_FBS_COUNT}`
    );
  }
  if (input.talentFinite2026 !== EXPECTED_2026_FBS_COUNT) {
    findings.push(
      `2026 finite talent ${input.talentFinite2026} != ${EXPECTED_2026_FBS_COUNT}`
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

  const hardSwitchWeekCandidate = recommendHardSwitchWeek({
    snapshots,
    firstWeek95PctHaveOneGame,
  });

  const fbs26 = sortedUnique(input.fbsIds2026);
  const gates = assessTransitionTimingGates({
    fbsIds2025: input.fbsIds2025,
    talentFinite2025: talentFiniteRows.length,
    talentSetExact2025,
    persistedTargetCount2025: targetIds.length,
    persistedTargetSetExact2025,
    historicalCutoffExact,
    fbsCount2026: fbs26.length,
    talentFinite2026: input.talentFinite2026,
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
    confirm2026: {
      fbsCount: fbs26.length,
      expectedFbs: EXPECTED_2026_FBS_COUNT,
      talentFinite: input.talentFinite2026,
      finalFbsVsFbsGames: input.finalFbsVsFbsGames2026,
      existingV1FbsRows: input.existingV1FbsRows2026,
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
    `2026 confirm FBS=${result.confirm2026.fbsCount} talentFinite=${result.confirm2026.talentFinite} finalFbsVsFbsGames=${result.confirm2026.finalFbsVsFbsGames} existingV1=${result.confirm2026.existingV1FbsRows}`
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
    `hardSwitchWeekCandidate=${result.hardSwitchWeekCandidate} (diagnostic only)`
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
