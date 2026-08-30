/**
 * Phase 2C-2J-6D-2 — Core V1 2026 lifecycle integrity + transaction hardening.
 *
 * AUTHORIZED MODEL POLICY (unchanged from 2C-2H-9):
 *   Preseason bridge: Candidate A = talentZ * 3.5
 *   Transition: B1 GLOBAL_BLEND_W3_W6 keyed to completedThroughWeek
 *
 * Temporal direction:
 *   completedThroughWeek = last week whose FINAL results are allowed into ratings.
 *   Ratings after Week N completes are for subsequent betting slates — never for Week N itself.
 *
 * Does NOT authorize production writes by itself — CLI/workflow PREVIEW/COMMIT gates do.
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
  type BalancedTalentRow,
} from './compute_balanced_v1';
import {
  CANDIDATE_A_LABEL,
  CANDIDATE_A_TALENT_SCALE,
  EXPECTED_2026_FBS_COUNT,
  HIGHLIGHT_TEAM_IDS,
  analyzeTalentCoverage,
  computeTalentOnlyBridgeRatings,
  numericSummary,
  type NumericSummary,
} from '../preseason/balanced-v1-preseason-bridge-eval';
import {
  b1CanonicalWeight,
  blendRatings,
} from '../preseason/balanced-v1-transition-blend-eval';
import {
  filterEpaThroughCutoff,
  filterGamesThroughCutoff,
  type TransitionEpaRow,
  type TransitionGameRow,
} from '../preseason/balanced-v1-transition-timing-eval';

export const PHASE = '2C-2J-6D-2' as const;
export const TARGET_SEASON = 2026 as const;
export const MODEL_VERSION_V1 = 'v1' as const;
export const CORE_V1_2026_TRANSITION_POLICY = 'GLOBAL_BLEND_W3_W6' as const;
/** @deprecated Does NOT authorize COMMIT. Use expectedCoreV1LifecycleConfirmation(n). */
export const WRITE_CONFIRM_PHRASE = 'WRITE_2026_CORE_V1' as const;
export const EXPECTED_FBS_COUNT = EXPECTED_2026_FBS_COUNT;

const RATING_EPS = 1e-9;

export type LifecycleMode = 'PREVIEW' | 'COMMIT';

export function expectedCoreV1LifecycleConfirmation(
  completedThroughWeek: number
): string {
  return `WRITE_2026_CORE_V1_THROUGH_WEEK_${completedThroughWeek}`;
}

/**
 * B1 schedule keyed to completedThroughWeek (NOT current/target/prediction week).
 * completedThroughWeek <= 2 → 0.00
 * completedThroughWeek == 3 → 0.25
 * completedThroughWeek == 4 → 0.50
 * completedThroughWeek == 5 → 0.75
 * completedThroughWeek >= 6 → 1.00
 */
export function canonicalWeightForCompletedWeek(
  completedThroughWeek: number
): number {
  return b1CanonicalWeight(completedThroughWeek);
}

export interface CoreV1LifecycleInput {
  season: number;
  completedThroughWeek: number;
  mode: LifecycleMode;
  confirmation: string;
  fbsIds: string[];
  talentRows: BalancedTalentRow[];
  games: TransitionGameRow[];
  epaRows: TransitionEpaRow[];
  /** Existing TeamSeasonRating rows for season + modelVersion=v1 among FBS. */
  existingV1FbsRows: number;
  existingV1TeamIds: string[];
}

export interface CoreV1LifecycleRow {
  teamId: string;
  candidateA: number;
  canonicalRating: number | null;
  canonicalWeight: number;
  finalPowerRating: number;
  /** FBS-vs-FBS final games through completedThroughWeek (Balanced gamesPlayed semantics). */
  games: number;
}

export interface CoreV1LifecycleResult {
  ok: boolean;
  /** Alias of ok — PREVIEW/COMMIT structural write-safety. */
  writeSafe: boolean;
  findings: string[];
  blockers: string[];
  season: number;
  completedThroughWeek: number;
  mode: LifecycleMode;
  selectedPolicy: typeof CORE_V1_2026_TRANSITION_POLICY;
  candidateAFormula: 'talentZ*3.5';
  candidateALabel: typeof CANDIDATE_A_LABEL;
  candidateAScale: typeof CANDIDATE_A_TALENT_SCALE;
  canonicalWeight: number;
  fbsCount: number;
  distinctFbs: number;
  talentRowsFbs: number;
  talentDistinctFbs: number;
  finiteTalent: number;
  talentSetExact: boolean;
  duplicateTalentTeamIds: number;
  highlightTeamsPresent: boolean;
  latestFinalFbsWeekPresent: number | null;
  /** FBS-vs-FBS finals through cutoff (wins / net / persisted games semantics). */
  finalFbsGamesThroughCompletedWeek: number;
  /** Diagnostic alias of finalFbsGamesThroughCompletedWeek. */
  fbsVsFbsFinalsThroughCutoff: number;
  /**
   * Final games through cutoff with ≥1 authoritative FBS participant.
   * Defines EPA-eligible game IDs (includes FBS-vs-FCS).
   */
  finalGamesWithFbsParticipantThroughCutoff: number;
  /** Game IDs eligible for EPA (= finalGamesWithFbsParticipantThroughCutoff). */
  epaEligibleGameCount: number;
  /** Diagnostic: future final FBS-vs-FBS beyond cutoff. */
  futureFinalFbsGamesBeyondCompletedWeek: number;
  /**
   * Fail-closed gate: future finals with ≥1 FBS participant beyond cutoff
   * (includes FBS-vs-FCS EPA-relevant games).
   */
  futureFinalGamesWithFbsParticipantBeyondCutoff: number;
  /** Weeks 1..completedThroughWeek that have ≥1 FBS-participant Game. */
  relevantCanonicalWeeksPresent: number[];
  /** Weeks in 1..completedThroughWeek missing any FBS-participant Game. */
  missingRelevantCanonicalWeeks: number[];
  /** Games with week<=cutoff and ≥1 FBS participant (any status). */
  relevantGamesThroughCutoff: number;
  /** Subset of relevantGamesThroughCutoff with status != final. */
  nonFinalRelevantGamesThroughCutoff: number;
  /** Final FBS-vs-FBS through cutoff missing finite home/away scores. */
  finalFbsVsFbsMissingScoreGames: number;
  expectedEpaParticipantRows: number;
  actualEpaParticipantRows: number;
  missingEpaKeys: string[];
  unexpectedEpaKeys: string[];
  duplicateEpaKeys: string[];
  nullOrNonFiniteEpaRows: string[];
  epaCoverageExact: boolean;
  canonicalCount: number;
  canonicalExactFbsSet: boolean;
  canonicalFinite: number;
  outputCount: number;
  existingV1Count: number;
  proposedCreateCount: number;
  proposedUpdateCount: number;
  rows: CoreV1LifecycleRow[];
  ratingsSummary: NumericSummary;
  expectedConfirmation: string;
  confirmationValid: boolean;
  commitEligible: boolean;
  modelVersion: typeof MODEL_VERSION_V1;
  phase: typeof PHASE;
  canonicalWeights: {
    talent: typeof BALANCED_WEIGHT_TALENT;
    epa: typeof BALANCED_WEIGHT_EPA;
    netPoints: typeof BALANCED_WEIGHT_NET_POINTS;
    winPct: typeof BALANCED_WEIGHT_WIN_PCT;
  };
  canonicalCalibrationFactor: typeof BALANCED_V1_CALIBRATION_FACTOR;
  providersInvoked: false;
  Odds: false;
  providerCalls: 0;
  mutationsInvoked: boolean;
  ratingsPersistenceInvoked: boolean;
  ratingsWriteAuthorized: boolean;
  modelPolicyAuthorized: true;
  productionWriteAuthorizedByThisPhase: false;
}

export interface CoreV1LifecycleExecutionState {
  mode: LifecycleMode;
  commitAttempted: boolean;
  transactionStarted: boolean;
  mutationsInvoked: boolean;
  mutationAttempts: number | null;
  upsertCount: number | null;
  commitSucceeded: boolean;
  postWriteVerificationSucceeded: boolean | null;
  error: string | null;
  providerCalls: 0;
  isolationLevel: 'Serializable' | null;
}

export interface CoreV1LifecyclePostWriteVerification {
  ok: boolean;
  reasons: string[];
  afterRows: number;
  verifiedTeams: number;
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

function isFbsVsFbs(g: TransitionGameRow, fbsSet: Set<string>): boolean {
  return (
    fbsSet.has(g.homeTeamId.toLowerCase()) &&
    fbsSet.has(g.awayTeamId.toLowerCase())
  );
}

/** At least one participant is an authoritative FBS team (EPA-eligible game set). */
function hasFbsParticipant(
  g: TransitionGameRow,
  fbsSet: Set<string>
): boolean {
  return (
    fbsSet.has(g.homeTeamId.toLowerCase()) ||
    fbsSet.has(g.awayTeamId.toLowerCase())
  );
}

function epaNaturalKey(gameId: string, teamId: string): string {
  return `${gameId}|${teamId.toLowerCase()}`;
}

function isFiniteScore(v: number | null | undefined): boolean {
  return typeof v === 'number' && Number.isFinite(v);
}

export function parseCoreV1LifecycleArgs(argv: string[]):
  | {
      ok: true;
      season: number;
      completedThroughWeek: number;
      mode: LifecycleMode;
      confirmation: string;
      reportPath: string | null;
    }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let season: number | null = null;
  let completedThroughWeek: number | null = null;
  let mode: LifecycleMode | null = null;
  let confirmation = '';
  let reportPath: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--season') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n)) errors.push(`invalid season: ${argv[i]}`);
      else season = n;
    } else if (a.startsWith('--season=')) {
      const n = Number(a.split('=')[1]);
      if (!Number.isInteger(n)) errors.push(`invalid season: ${a}`);
      else season = n;
    } else if (
      a === '--completed-through-week' ||
      a === '--completedThroughWeek'
    ) {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 0) {
        errors.push(`invalid completedThroughWeek: ${argv[i]}`);
      } else completedThroughWeek = n;
    } else if (
      a.startsWith('--completed-through-week=') ||
      a.startsWith('--completedThroughWeek=')
    ) {
      const n = Number(a.split('=')[1]);
      if (!Number.isInteger(n) || n < 0) {
        errors.push(`invalid completedThroughWeek: ${a}`);
      } else completedThroughWeek = n;
    } else if (a === '--mode') {
      const v = String(argv[++i] ?? '').toUpperCase();
      if (v !== 'PREVIEW' && v !== 'COMMIT') errors.push(`invalid mode: ${v}`);
      else mode = v as LifecycleMode;
    } else if (a.startsWith('--mode=')) {
      const v = a.split('=')[1].toUpperCase();
      if (v !== 'PREVIEW' && v !== 'COMMIT') errors.push(`invalid mode: ${v}`);
      else mode = v as LifecycleMode;
    } else if (a === '--confirm' || a === '--confirmation') {
      confirmation = String(argv[++i] ?? '');
    } else if (a.startsWith('--confirm=') || a.startsWith('--confirmation=')) {
      confirmation = a.slice(a.indexOf('=') + 1);
    } else if (a === '--report') {
      reportPath = String(argv[++i] ?? '');
      if (!reportPath) errors.push('missing --report path');
    } else if (a.startsWith('--report=')) {
      reportPath = a.slice(a.indexOf('=') + 1);
      if (!reportPath) errors.push('missing --report path');
    } else {
      errors.push(`unknown arg: ${a}`);
    }
  }

  if (season === null) season = TARGET_SEASON;
  if (completedThroughWeek === null) completedThroughWeek = 0;
  if (mode === null) mode = 'PREVIEW';

  if (season !== TARGET_SEASON) {
    errors.push(`season must be ${TARGET_SEASON}`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    season,
    completedThroughWeek,
    mode,
    confirmation,
    reportPath,
  };
}

export function buildCoreV1LifecycleEvaluation(
  input: CoreV1LifecycleInput
): CoreV1LifecycleResult {
  const findings: string[] = [];
  const fbs = sortedUnique(input.fbsIds);
  const fbsSet = new Set(fbs);
  const completedThroughWeek = input.completedThroughWeek;
  const canonicalWeight = canonicalWeightForCompletedWeek(completedThroughWeek);
  const expectedConfirmation =
    expectedCoreV1LifecycleConfirmation(completedThroughWeek);
  // Old WRITE_CONFIRM_PHRASE must NOT authorize COMMIT.
  const confirmationValid = input.confirmation === expectedConfirmation;

  if (input.season !== TARGET_SEASON) {
    findings.push(`season must be ${TARGET_SEASON}`);
  }
  if (!Number.isInteger(completedThroughWeek) || completedThroughWeek < 0) {
    findings.push(
      `completedThroughWeek must be integer >= 0 (got ${completedThroughWeek})`
    );
  }
  if (fbs.length !== input.fbsIds.length) {
    findings.push('FBS IDs contain duplicates');
  }
  if (fbs.length !== EXPECTED_FBS_COUNT) {
    findings.push(`FBS count ${fbs.length} != ${EXPECTED_FBS_COUNT}`);
  }

  const highlightTeamsPresent = HIGHLIGHT_TEAM_IDS.every((id) =>
    fbsSet.has(id)
  );
  if (!highlightTeamsPresent) {
    findings.push(
      `authoritative FBS must include ${HIGHLIGHT_TEAM_IDS.join(' and ')}`
    );
  }

  const talent = analyzeTalentCoverage(fbs, input.talentRows);
  if (talent.talentRowsFbs !== EXPECTED_FBS_COUNT) {
    findings.push(
      `talentRowsFbs ${talent.talentRowsFbs} != ${EXPECTED_FBS_COUNT}`
    );
  }
  if (talent.talentDistinctFbs !== EXPECTED_FBS_COUNT) {
    findings.push(
      `talentDistinctFbs ${talent.talentDistinctFbs} != ${EXPECTED_FBS_COUNT}`
    );
  }
  if (talent.finiteTalent !== EXPECTED_FBS_COUNT) {
    findings.push(
      `finiteTalent ${talent.finiteTalent} != ${EXPECTED_FBS_COUNT}`
    );
  }
  if (talent.duplicateTalentTeamIds !== 0) {
    findings.push(
      `duplicateTalentTeamIds=${talent.duplicateTalentTeamIds} (must be 0)`
    );
  }
  if (!talent.talentSetExact) {
    findings.push('talent set not exact FBS');
  }

  const finalFbsVsFbs = input.games.filter(
    (g) => String(g.status).toLowerCase() === 'final' && isFbsVsFbs(g, fbsSet)
  );
  const finalWithFbsParticipant = input.games.filter(
    (g) =>
      String(g.status).toLowerCase() === 'final' && hasFbsParticipant(g, fbsSet)
  );
  let latestFinalFbsWeekPresent: number | null = null;
  let finalFbsGamesThroughCompletedWeek = 0;
  let futureFinalFbsGamesBeyondCompletedWeek = 0;
  for (const g of finalFbsVsFbs) {
    if (
      latestFinalFbsWeekPresent === null ||
      g.week > latestFinalFbsWeekPresent
    ) {
      latestFinalFbsWeekPresent = g.week;
    }
    if (g.week <= completedThroughWeek) finalFbsGamesThroughCompletedWeek++;
    else futureFinalFbsGamesBeyondCompletedWeek++;
  }

  let finalGamesWithFbsParticipantThroughCutoff = 0;
  let futureFinalGamesWithFbsParticipantBeyondCutoff = 0;
  for (const g of finalWithFbsParticipant) {
    if (g.week <= completedThroughWeek) {
      finalGamesWithFbsParticipantThroughCutoff++;
    } else {
      futureFinalGamesWithFbsParticipantBeyondCutoff++;
    }
  }

  // --- Completed-week integrity (completedThroughWeek > 0) ---
  const relevantCanonicalWeeksPresent: number[] = [];
  const missingRelevantCanonicalWeeks: number[] = [];
  let relevantGamesThroughCutoff = 0;
  let nonFinalRelevantGamesThroughCutoff = 0;
  let finalFbsVsFbsMissingScoreGames = 0;

  if (completedThroughWeek > 0) {
    const weeksWithRelevant = new Set<number>();
    for (const g of input.games) {
      if (
        !Number.isFinite(g.week) ||
        g.week < 1 ||
        g.week > completedThroughWeek
      ) {
        continue;
      }
      if (!hasFbsParticipant(g, fbsSet)) continue;
      weeksWithRelevant.add(g.week);
      relevantGamesThroughCutoff++;
      if (String(g.status).toLowerCase() !== 'final') {
        nonFinalRelevantGamesThroughCutoff++;
      }
    }
    for (let w = 1; w <= completedThroughWeek; w++) {
      if (weeksWithRelevant.has(w)) relevantCanonicalWeeksPresent.push(w);
      else missingRelevantCanonicalWeeks.push(w);
    }
    if (missingRelevantCanonicalWeeks.length > 0) {
      findings.push(
        `missingRelevantCanonicalWeeks=[${missingRelevantCanonicalWeeks.join(',')}] (must be empty for completedThroughWeek=${completedThroughWeek})`
      );
    }
    if (nonFinalRelevantGamesThroughCutoff > 0) {
      findings.push(
        `nonFinalRelevantGamesThroughCutoff=${nonFinalRelevantGamesThroughCutoff} (must be 0; completedThroughWeek=${completedThroughWeek})`
      );
    }

    for (const g of finalFbsVsFbs) {
      if (g.week > completedThroughWeek) continue;
      if (!isFiniteScore(g.homeScore) || !isFiniteScore(g.awayScore)) {
        finalFbsVsFbsMissingScoreGames++;
      }
    }
    if (finalFbsVsFbsMissingScoreGames > 0) {
      findings.push(
        `finalFbsVsFbsMissingScoreGames=${finalFbsVsFbsMissingScoreGames} (must be 0)`
      );
    }
  }

  if (completedThroughWeek === 0 && finalWithFbsParticipant.length !== 0) {
    findings.push(
      `completedThroughWeek=0 requires zero final games with FBS participant (found ${finalWithFbsParticipant.length})`
    );
  }
  // Fail-closed: completedThroughWeek must include all finalized FBS-relevant football
  // (FBS-vs-FBS wins/net AND FBS-vs-FCS EPA). Broader than FBS-vs-FBS alone.
  if (futureFinalGamesWithFbsParticipantBeyondCutoff !== 0) {
    findings.push(
      `futureFinalGamesWithFbsParticipantBeyondCutoff=${futureFinalGamesWithFbsParticipantBeyondCutoff} (must be 0; completedThroughWeek=${completedThroughWeek})`
    );
  }
  if (futureFinalFbsGamesBeyondCompletedWeek !== 0) {
    findings.push(
      `futureFinalFbsGamesBeyondCompletedWeek=${futureFinalFbsGamesBeyondCompletedWeek} (must be 0; completedThroughWeek=${completedThroughWeek})`
    );
  }

  // Broader set: finals through cutoff with ≥1 FBS participant (EPA-eligible IDs).
  // aggregateBalancedGameStats still counts only games where BOTH sides are FBS.
  const finalsWithFbsParticipantThroughCutoff = filterGamesThroughCutoff(
    input.games,
    completedThroughWeek
  ).filter((g) => hasFbsParticipant(g, fbsSet));
  if (
    finalsWithFbsParticipantThroughCutoff.some(
      (g) => g.week > completedThroughWeek
    )
  ) {
    findings.push('included games violate week <= completedThroughWeek');
  }
  // Recount through-cutoff from the filtered set (authoritative for diagnostics).
  finalGamesWithFbsParticipantThroughCutoff =
    finalsWithFbsParticipantThroughCutoff.length;
  const fbsVsFbsFinalsThroughCutoff = finalsWithFbsParticipantThroughCutoff.filter(
    (g) => isFbsVsFbs(g, fbsSet)
  ).length;
  finalFbsGamesThroughCompletedWeek = fbsVsFbsFinalsThroughCutoff;
  const epaEligibleGameCount = finalGamesWithFbsParticipantThroughCutoff;

  const epaThrough = filterEpaThroughCutoff(
    input.epaRows,
    finalsWithFbsParticipantThroughCutoff,
    completedThroughWeek
  ).filter((e) => fbsSet.has(e.teamId.toLowerCase()));
  const includedGameIds = new Set(
    finalsWithFbsParticipantThroughCutoff.map((g) => g.gameId)
  );
  if (epaThrough.some((e) => !includedGameIds.has(e.gameId))) {
    findings.push(
      'included EPA references games outside completedThroughWeek cutoff'
    );
  }

  // --- EPA readiness diagnostics (always report; block only when weight > 0) ---
  const expectedEpaKeys = new Set<string>();
  for (const g of finalsWithFbsParticipantThroughCutoff) {
    if (fbsSet.has(g.homeTeamId.toLowerCase())) {
      expectedEpaKeys.add(epaNaturalKey(g.gameId, g.homeTeamId));
    }
    if (fbsSet.has(g.awayTeamId.toLowerCase())) {
      expectedEpaKeys.add(epaNaturalKey(g.gameId, g.awayTeamId));
    }
  }
  const expectedEpaParticipantRows = expectedEpaKeys.size;

  const epaKeyCounts = new Map<string, number>();
  const epaByKey = new Map<string, TransitionEpaRow>();
  for (const e of epaThrough) {
    const key = epaNaturalKey(e.gameId, e.teamId);
    epaKeyCounts.set(key, (epaKeyCounts.get(key) ?? 0) + 1);
    epaByKey.set(key, e);
  }
  const actualEpaParticipantRows = epaThrough.length;
  const duplicateEpaKeys = [...epaKeyCounts.entries()]
    .filter(([, n]) => n > 1)
    .map(([k]) => k)
    .sort();
  const missingEpaKeys = [...expectedEpaKeys]
    .filter((k) => !epaKeyCounts.has(k))
    .sort();
  const unexpectedEpaKeys = [...epaKeyCounts.keys()]
    .filter((k) => !expectedEpaKeys.has(k))
    .sort();
  const nullOrNonFiniteEpaRows: string[] = [];
  for (const key of expectedEpaKeys) {
    const row = epaByKey.get(key);
    if (!row) continue;
    if (
      row.epaOff === null ||
      !Number.isFinite(row.epaOff) ||
      row.epaDef === null ||
      !Number.isFinite(row.epaDef)
    ) {
      nullOrNonFiniteEpaRows.push(key);
    }
  }
  nullOrNonFiniteEpaRows.sort();
  const epaCoverageExact =
    missingEpaKeys.length === 0 &&
    unexpectedEpaKeys.length === 0 &&
    duplicateEpaKeys.length === 0 &&
    nullOrNonFiniteEpaRows.length === 0 &&
    actualEpaParticipantRows === expectedEpaParticipantRows;

  if (canonicalWeight > 0) {
    if (duplicateEpaKeys.length > 0) {
      findings.push(
        `duplicateEpaKeys=${duplicateEpaKeys.length} (must be 0 when canonicalWeight>0)`
      );
    }
    if (missingEpaKeys.length > 0) {
      findings.push(
        `missingEpaKeys=${missingEpaKeys.length} (must be 0 when canonicalWeight>0)`
      );
    }
    if (unexpectedEpaKeys.length > 0) {
      findings.push(
        `unexpectedEpaKeys=${unexpectedEpaKeys.length} (must be 0 when canonicalWeight>0)`
      );
    }
    if (nullOrNonFiniteEpaRows.length > 0) {
      findings.push(
        `nullOrNonFiniteEpaRows=${nullOrNonFiniteEpaRows.length} (must be 0 when canonicalWeight>0)`
      );
    }
  }

  // Integrity boundary: only expected participant keys enter canonical EPA aggregation.
  const epaForCanonical = epaThrough.filter((e) =>
    expectedEpaKeys.has(epaNaturalKey(e.gameId, e.teamId))
  );

  const candidateARows = computeTalentOnlyBridgeRatings(
    [...talent.finiteByTeam.entries()].map(([teamId, talentComposite]) => ({
      teamId,
      talentComposite,
    }))
  );
  const candidateAById = new Map(
    candidateARows.map((r) => [r.teamId.toLowerCase(), r.candidateA] as const)
  );

  const aggregates = aggregateBalancedGameStats(
    finalsWithFbsParticipantThroughCutoff,
    fbsSet
  );
  let canonicalById = new Map<string, { powerRating: number; games: number }>();
  let canonicalCount = 0;
  let canonicalExactFbsSet = false;
  let canonicalFinite = 0;

  if (canonicalWeight > 0) {
    const epaByTeam = aggregateBalancedEpa(epaForCanonical);
    const built = buildBalancedTeamMetrics({
      fbsTeamIds: fbs,
      talentRows: input.talentRows,
      gameAggregates: aggregates,
      epaByTeam,
    });
    const canonical = computeBalancedV1Ratings(built.metrics);
    canonicalById = new Map(
      canonical.map((r) => [
        r.teamId.toLowerCase(),
        { powerRating: r.powerRating, games: r.games },
      ])
    );
    canonicalCount = canonical.length;
    const canonIds = sortedUnique(canonical.map((r) => r.teamId));
    canonicalExactFbsSet = setsEqual(canonIds, fbs);
    canonicalFinite = canonical.filter((r) =>
      Number.isFinite(r.powerRating)
    ).length;

    if (canonicalCount !== EXPECTED_FBS_COUNT) {
      findings.push(
        `canonicalWeight=${canonicalWeight} requires canonicalCount=${EXPECTED_FBS_COUNT} (got ${canonicalCount})`
      );
    }
    if (!canonicalExactFbsSet) {
      findings.push(
        'canonicalWeight>0 requires exact authoritative FBS canonical set'
      );
    }
    if (canonicalFinite !== EXPECTED_FBS_COUNT) {
      findings.push(
        `canonicalFinite ${canonicalFinite} != ${EXPECTED_FBS_COUNT}`
      );
    }
  }

  const existingIds = new Set(
    input.existingV1TeamIds.map((id) => id.toLowerCase())
  );
  const rows: CoreV1LifecycleRow[] = [];
  for (const id of fbs) {
    const candidateA = candidateAById.get(id);
    if (candidateA === undefined || !Number.isFinite(candidateA)) {
      findings.push(`missing Candidate A for ${id}`);
      continue;
    }
    const gamesPlayed = aggregates.get(id)?.games ?? 0;
    let canonicalRating: number | null = null;
    let finalPowerRating = candidateA;
    let games = gamesPlayed;

    if (canonicalWeight === 0) {
      finalPowerRating = candidateA;
      canonicalRating = null;
    } else {
      const c = canonicalById.get(id);
      if (!c || !Number.isFinite(c.powerRating)) {
        findings.push(`missing canonical rating for ${id}`);
        continue;
      }
      canonicalRating = c.powerRating;
      games = c.games;
      finalPowerRating = blendRatings(
        candidateA,
        c.powerRating,
        canonicalWeight
      );
      if (canonicalWeight === 1) {
        if (Math.abs(finalPowerRating - c.powerRating) > 1e-9) {
          findings.push(`weight=1 blend drift for ${id}`);
        }
        finalPowerRating = c.powerRating;
      }
    }

    rows.push({
      teamId: id,
      candidateA,
      canonicalRating,
      canonicalWeight,
      finalPowerRating,
      games,
    });
  }

  rows.sort((a, b) => a.teamId.localeCompare(b.teamId));

  if (rows.length !== EXPECTED_FBS_COUNT) {
    findings.push(
      `outputCount ${rows.length} != ${EXPECTED_FBS_COUNT} before persistence`
    );
  }

  const proposedUpdateCount = rows.filter((r) =>
    existingIds.has(r.teamId)
  ).length;
  const proposedCreateCount = rows.length - proposedUpdateCount;

  if (input.mode === 'COMMIT' && !confirmationValid) {
    findings.push(
      `COMMIT requires confirmation=${expectedConfirmation}`
    );
  }

  const structuralOk = findings.length === 0;
  const commitEligible =
    structuralOk && input.mode === 'COMMIT' && confirmationValid;

  // PREVIEW: ok when structural gates pass.
  // COMMIT: ok only when commitEligible.
  const ok =
    input.mode === 'PREVIEW'
      ? structuralOk
      : commitEligible;

  return {
    ok,
    writeSafe: ok,
    findings,
    blockers: [...findings],
    season: input.season,
    completedThroughWeek,
    mode: input.mode,
    selectedPolicy: CORE_V1_2026_TRANSITION_POLICY,
    candidateAFormula: 'talentZ*3.5',
    candidateALabel: CANDIDATE_A_LABEL,
    candidateAScale: CANDIDATE_A_TALENT_SCALE,
    canonicalWeight,
    fbsCount: fbs.length,
    distinctFbs: fbs.length,
    talentRowsFbs: talent.talentRowsFbs,
    talentDistinctFbs: talent.talentDistinctFbs,
    finiteTalent: talent.finiteTalent,
    talentSetExact: talent.talentSetExact,
    duplicateTalentTeamIds: talent.duplicateTalentTeamIds,
    highlightTeamsPresent,
    latestFinalFbsWeekPresent,
    finalFbsGamesThroughCompletedWeek,
    fbsVsFbsFinalsThroughCutoff,
    finalGamesWithFbsParticipantThroughCutoff,
    epaEligibleGameCount,
    futureFinalFbsGamesBeyondCompletedWeek,
    futureFinalGamesWithFbsParticipantBeyondCutoff,
    relevantCanonicalWeeksPresent,
    missingRelevantCanonicalWeeks,
    relevantGamesThroughCutoff,
    nonFinalRelevantGamesThroughCutoff,
    finalFbsVsFbsMissingScoreGames,
    expectedEpaParticipantRows,
    actualEpaParticipantRows,
    missingEpaKeys,
    unexpectedEpaKeys,
    duplicateEpaKeys,
    nullOrNonFiniteEpaRows,
    epaCoverageExact,
    canonicalCount,
    canonicalExactFbsSet,
    canonicalFinite,
    outputCount: rows.length,
    existingV1Count: input.existingV1FbsRows,
    proposedCreateCount,
    proposedUpdateCount,
    rows,
    ratingsSummary: numericSummary(rows.map((r) => r.finalPowerRating)),
    expectedConfirmation,
    confirmationValid,
    commitEligible,
    modelVersion: MODEL_VERSION_V1,
    phase: PHASE,
    canonicalWeights: {
      talent: BALANCED_WEIGHT_TALENT,
      epa: BALANCED_WEIGHT_EPA,
      netPoints: BALANCED_WEIGHT_NET_POINTS,
      winPct: BALANCED_WEIGHT_WIN_PCT,
    },
    canonicalCalibrationFactor: BALANCED_V1_CALIBRATION_FACTOR,
    providersInvoked: false,
    Odds: false,
    providerCalls: 0,
    mutationsInvoked: false,
    ratingsPersistenceInvoked: false,
    ratingsWriteAuthorized: commitEligible,
    modelPolicyAuthorized: true,
    productionWriteAuthorizedByThisPhase: false,
  };
}

function fmt(n: number | null, digits = 4): string {
  if (n === null || !Number.isFinite(n)) return 'n/a';
  return n.toFixed(digits);
}

export function formatCoreV1LifecycleReport(
  result: CoreV1LifecycleResult
): string {
  const lines: string[] = [];
  lines.push('=== Core V1 Lifecycle Ratings (GUARDED) ===');
  lines.push(`phase=${result.phase} ok=${result.ok} writeSafe=${result.writeSafe}`);
  lines.push(
    `season=${result.season} completedThroughWeek=${result.completedThroughWeek} mode=${result.mode}`
  );
  lines.push(
    `selectedPolicy=${result.selectedPolicy} candidateAFormula=${result.candidateAFormula} canonicalWeight=${fmt(result.canonicalWeight, 4)}`
  );
  lines.push(
    `fbsCount=${result.fbsCount} talentCount=${result.finiteTalent} talentExact=${result.talentSetExact} highlights=${result.highlightTeamsPresent}`
  );
  lines.push(
    `canonicalCount=${result.canonicalCount} canonicalExact=${result.canonicalExactFbsSet} outputCount=${result.outputCount}`
  );
  lines.push(
    `finalFbsVsFbsThroughCutoff=${result.finalFbsGamesThroughCompletedWeek} finalWithFbsParticipantThroughCutoff=${result.finalGamesWithFbsParticipantThroughCutoff} epaEligibleGameCount=${result.epaEligibleGameCount} futureFinalWithFbsParticipantBeyondCutoff=${result.futureFinalGamesWithFbsParticipantBeyondCutoff} futureFinalFbsVsFbsBeyondCutoff=${result.futureFinalFbsGamesBeyondCompletedWeek} latestFinalFbsWeekPresent=${result.latestFinalFbsWeekPresent ?? 'n/a'}`
  );
  lines.push(
    `relevantWeeksPresent=[${result.relevantCanonicalWeeksPresent.join(',')}] missingWeeks=[${result.missingRelevantCanonicalWeeks.join(',')}] relevantGames=${result.relevantGamesThroughCutoff} nonFinalRelevant=${result.nonFinalRelevantGamesThroughCutoff} missingScores=${result.finalFbsVsFbsMissingScoreGames}`
  );
  lines.push(
    `epa expected=${result.expectedEpaParticipantRows} actual=${result.actualEpaParticipantRows} missing=${result.missingEpaKeys.length} unexpected=${result.unexpectedEpaKeys.length} dup=${result.duplicateEpaKeys.length} nullEpa=${result.nullOrNonFiniteEpaRows.length} exact=${result.epaCoverageExact}`
  );
  lines.push(
    `existingV1Count=${result.existingV1Count} proposedCreate=${result.proposedCreateCount} proposedUpdate=${result.proposedUpdateCount}`
  );
  lines.push(
    `dist min=${fmt(result.ratingsSummary.min)} avg=${fmt(result.ratingsSummary.avg)} median=${fmt(result.ratingsSummary.median)} max=${fmt(result.ratingsSummary.max)} std=${fmt(result.ratingsSummary.stdDev)} range=${fmt(result.ratingsSummary.range)}`
  );
  lines.push(
    `providersInvoked=${result.providersInvoked} Odds=${result.Odds} providerCalls=${result.providerCalls} mutationsInvoked=${result.mutationsInvoked} ratingsPersistenceInvoked=${result.ratingsPersistenceInvoked} ratingsWriteAuthorized=${result.ratingsWriteAuthorized}`
  );
  lines.push(
    `modelPolicyAuthorized=${result.modelPolicyAuthorized} productionWriteAuthorizedByThisPhase=${result.productionWriteAuthorizedByThisPhase}`
  );

  const sorted = [...result.rows].sort(
    (a, b) => b.finalPowerRating - a.finalPowerRating
  );
  lines.push('top20:');
  for (const r of sorted.slice(0, 20)) {
    lines.push(
      `  ${r.teamId} final=${fmt(r.finalPowerRating)} A=${fmt(r.candidateA)} C=${fmt(r.canonicalRating)} w=${fmt(r.canonicalWeight, 4)} games=${r.games}`
    );
  }
  lines.push('bottom20:');
  for (const r of sorted.slice(-20).reverse()) {
    lines.push(
      `  ${r.teamId} final=${fmt(r.finalPowerRating)} A=${fmt(r.candidateA)} C=${fmt(r.canonicalRating)} w=${fmt(r.canonicalWeight, 4)} games=${r.games}`
    );
  }
  lines.push('allRows:');
  for (const r of result.rows) {
    lines.push(
      `  ${r.teamId} final=${fmt(r.finalPowerRating)} A=${fmt(r.candidateA)} C=${fmt(r.canonicalRating)} w=${fmt(r.canonicalWeight, 4)} games=${r.games}`
    );
  }
  if (result.findings.length > 0) {
    lines.push('findings:');
    for (const f of result.findings) lines.push(`  - ${f}`);
  }
  return lines.join('\n');
}

export function sanitizeCoreV1LifecycleError(_err?: unknown): string {
  return 'Core V1 lifecycle evaluation/write failed; connection and secret details suppressed';
}

/** Persist shape compatible with Balanced V1 writer (UPDATE powerRating/rating/games only). */
export interface CoreV1LifecyclePersistRow {
  season: number;
  teamId: string;
  powerRating: number;
  games: number;
}

export function toPersistRows(
  result: CoreV1LifecycleResult
): CoreV1LifecyclePersistRow[] {
  return result.rows.map((r) => ({
    season: TARGET_SEASON,
    teamId: r.teamId,
    powerRating: r.finalPowerRating,
    games: r.games,
  }));
}

/**
 * Single-transaction upsert for season=2026 modelVersion=v1.
 * UPDATE: powerRating, rating, games only (preserves HFA / offense / defense metadata).
 * CREATE: sets Balanced-compatible defaults for unused fields.
 * games = FBS-vs-FBS finals through completedThroughWeek (Balanced gamesPlayed meaning).
 */
export async function persistCoreV1LifecycleRatings(
  client: {
    teamSeasonRating: {
      upsert: (args: unknown) => Promise<unknown>;
    };
  },
  ratings: CoreV1LifecyclePersistRow[]
): Promise<{ upserted: number }> {
  if (ratings.length !== EXPECTED_FBS_COUNT) {
    throw new Error(
      `refuse persist: expected ${EXPECTED_FBS_COUNT} rows, got ${ratings.length}`
    );
  }
  for (const rating of ratings) {
    if (rating.season !== TARGET_SEASON) {
      throw new Error(`refuse persist: season must be ${TARGET_SEASON}`);
    }
    await client.teamSeasonRating.upsert({
      where: {
        season_teamId_modelVersion: {
          season: rating.season,
          teamId: rating.teamId,
          modelVersion: MODEL_VERSION_V1,
        },
      },
      update: {
        powerRating: rating.powerRating,
        rating: rating.powerRating,
        games: rating.games,
      },
      create: {
        season: rating.season,
        teamId: rating.teamId,
        modelVersion: MODEL_VERSION_V1,
        powerRating: rating.powerRating,
        rating: rating.powerRating,
        games: rating.games,
        offenseRating: 0,
        defenseRating: 0,
        confidence: 0.5,
        dataSource: 'core_v1_lifecycle',
      },
    });
  }
  return { upserted: ratings.length };
}

export function buildPreviewExecution(): CoreV1LifecycleExecutionState {
  return {
    mode: 'PREVIEW',
    commitAttempted: false,
    transactionStarted: false,
    mutationsInvoked: false,
    mutationAttempts: null,
    upsertCount: null,
    commitSucceeded: false,
    postWriteVerificationSucceeded: null,
    error: null,
    providerCalls: 0,
    isolationLevel: null,
  };
}

export function buildSuccessfulCommitExecution(options: {
  upsertCount: number;
  error?: string | null;
}): CoreV1LifecycleExecutionState {
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: true,
    mutationsInvoked: options.upsertCount > 0,
    mutationAttempts: options.upsertCount,
    upsertCount: options.upsertCount,
    // Successful commit implies transactional verification already passed.
    commitSucceeded: true,
    postWriteVerificationSucceeded: true,
    error: options.error ?? null,
    providerCalls: 0,
    isolationLevel: 'Serializable',
  };
}

export function buildRolledBackExecution(options: {
  mutationAttempts: number;
  error: string;
  postWriteVerificationSucceeded?: false | null;
}): CoreV1LifecycleExecutionState {
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: true,
    mutationsInvoked: options.mutationAttempts > 0,
    mutationAttempts: options.mutationAttempts,
    upsertCount: null,
    commitSucceeded: false,
    postWriteVerificationSucceeded:
      options.postWriteVerificationSucceeded === false ? false : null,
    error: options.error,
    providerCalls: 0,
    isolationLevel: 'Serializable',
  };
}

export function buildFailedCommitExecution(options: {
  error: string;
}): CoreV1LifecycleExecutionState {
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: false,
    mutationsInvoked: false,
    mutationAttempts: null,
    upsertCount: null,
    commitSucceeded: false,
    postWriteVerificationSucceeded: null,
    error: options.error,
    providerCalls: 0,
    isolationLevel: null,
  };
}

export function decimalLikeToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof (value as { toNumber?: () => number }).toNumber === 'function') {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function verifyCoreV1LifecyclePostWrite(options: {
  plannedRows: CoreV1LifecyclePersistRow[];
  afterRows: Array<{
    teamId: string;
    powerRating: unknown;
    rating: unknown;
    games: unknown;
  }>;
  fbsTeamIds: string[];
}): CoreV1LifecyclePostWriteVerification {
  const reasons: string[] = [];
  const fbs = sortedUnique(options.fbsTeamIds);
  if (fbs.length !== EXPECTED_FBS_COUNT) {
    reasons.push(`fbs_count_mismatch: ${fbs.length}`);
  }
  if (options.plannedRows.length !== EXPECTED_FBS_COUNT) {
    reasons.push(`planned_count_mismatch: ${options.plannedRows.length}`);
  }
  if (options.afterRows.length !== EXPECTED_FBS_COUNT) {
    reasons.push(`after_count_mismatch: ${options.afterRows.length}`);
  }

  const afterByTeam = new Map<string, typeof options.afterRows>();
  for (const row of options.afterRows) {
    const id = row.teamId.toLowerCase();
    const list = afterByTeam.get(id) ?? [];
    list.push(row);
    afterByTeam.set(id, list);
  }
  for (const [id, list] of afterByTeam) {
    if (list.length > 1) {
      reasons.push(`duplicate_after_write:${id}`);
    }
  }
  if (!setsEqual([...afterByTeam.keys()], fbs)) {
    reasons.push('after_write_team_set_mismatch');
  }

  const plannedByTeam = new Map(
    options.plannedRows.map(
      (r) => [r.teamId.toLowerCase(), r] as const
    )
  );
  let verifiedTeams = 0;
  for (const id of fbs) {
    const planned = plannedByTeam.get(id);
    const afterList = afterByTeam.get(id) ?? [];
    if (!planned) {
      reasons.push(`missing_planned:${id}`);
      continue;
    }
    if (afterList.length !== 1) {
      reasons.push(`missing_after_write:${id}`);
      continue;
    }
    const after = afterList[0];
    const power = decimalLikeToNumber(after.powerRating);
    const rating = decimalLikeToNumber(after.rating);
    const games = decimalLikeToNumber(after.games);
    if (power === null || Math.abs(power - planned.powerRating) > RATING_EPS) {
      reasons.push(`powerRating_mismatch:${id}`);
      continue;
    }
    if (rating === null || Math.abs(rating - planned.powerRating) > RATING_EPS) {
      reasons.push(`rating_mismatch:${id}`);
      continue;
    }
    if (games === null || Math.abs(games - planned.games) > RATING_EPS) {
      reasons.push(`games_mismatch:${id}`);
      continue;
    }
    verifiedTeams += 1;
  }

  return {
    ok: reasons.length === 0,
    reasons,
    afterRows: options.afterRows.length,
    verifiedTeams,
  };
}

/**
 * Authoritative COMMIT inside a Serializable transaction callback.
 * Re-reads → re-evaluates → persists → verifies; throw rolls back.
 */
export async function executeAtomicCoreV1LifecycleCommit(options: {
  season: number;
  completedThroughWeek: number;
  confirmation: string;
  loadFbsTeamIds: () => Promise<string[]>;
  loadTalentRows: (
    fbsTeamIds: string[]
  ) => Promise<Array<{ teamId: string; talentComposite: number | null }>>;
  loadGames: () => Promise<TransitionGameRow[]>;
  loadEpaRows: (fbsTeamIds: string[]) => Promise<TransitionEpaRow[]>;
  loadExistingV1Fbs: (
    fbsTeamIds: string[]
  ) => Promise<Array<{ teamId: string }>>;
  persist: (rows: CoreV1LifecyclePersistRow[]) => Promise<{ upserted: number }>;
  loadAfterV1Ratings: (fbsTeamIds: string[]) => Promise<
    Array<{
      teamId: string;
      powerRating: unknown;
      rating: unknown;
      games: unknown;
    }>
  >;
}): Promise<{
  result: CoreV1LifecycleResult;
  persistRows: CoreV1LifecyclePersistRow[];
  upserted: number;
  verification: CoreV1LifecyclePostWriteVerification;
}> {
  const fbsIds = await options.loadFbsTeamIds();
  const fbsLower = fbsIds.map((id) => id.toLowerCase());
  const talentRows = await options.loadTalentRows(fbsLower);
  const games = await options.loadGames();
  const epaRows = await options.loadEpaRows(fbsLower);
  const existing = await options.loadExistingV1Fbs(fbsLower);

  const result = buildCoreV1LifecycleEvaluation({
    season: options.season,
    completedThroughWeek: options.completedThroughWeek,
    mode: 'COMMIT',
    confirmation: options.confirmation,
    fbsIds,
    talentRows,
    games,
    epaRows,
    existingV1FbsRows: existing.length,
    existingV1TeamIds: existing.map((r) => r.teamId),
  });

  if (!result.ok || !result.writeSafe || !result.commitEligible) {
    throw new Error(
      `transaction aborted: lifecycle safety failed: ${result.blockers.join('; ')}`
    );
  }
  if (result.outputCount !== EXPECTED_FBS_COUNT) {
    throw new Error(
      `transaction aborted: outputCount ${result.outputCount} != ${EXPECTED_FBS_COUNT}`
    );
  }

  const persistRows = toPersistRows(result);
  if (persistRows.length !== EXPECTED_FBS_COUNT) {
    throw new Error(
      `transaction aborted: persistRows.length ${persistRows.length} != ${EXPECTED_FBS_COUNT}`
    );
  }
  const { upserted } = await options.persist(persistRows);
  if (upserted !== persistRows.length) {
    throw new Error(
      `transaction aborted: upserted ${upserted} != persistRows.length ${persistRows.length}`
    );
  }

  const afterRows = await options.loadAfterV1Ratings(fbsLower);
  const verification = verifyCoreV1LifecyclePostWrite({
    plannedRows: persistRows,
    afterRows,
    fbsTeamIds: fbsIds,
  });
  if (!verification.ok) {
    throw new Error(
      `post-write verification failed: ${verification.reasons.join('; ')}`
    );
  }

  return { result, persistRows, upserted, verification };
}

export function finalizeCoreV1LifecycleReport(options: {
  result: CoreV1LifecycleResult;
  execution: CoreV1LifecycleExecutionState;
  verification: CoreV1LifecyclePostWriteVerification | null;
  meta?: Record<string, unknown>;
}): Record<string, unknown> {
  const r = options.result;
  return {
    phase: PHASE,
    season: r.season,
    completedThroughWeek: r.completedThroughWeek,
    mode: r.mode,
    selectedPolicy: r.selectedPolicy,
    candidateAFormula: r.candidateAFormula,
    canonicalWeight: r.canonicalWeight,
    modelVersion: r.modelVersion,
    writeSafe: r.writeSafe,
    ok: r.ok,
    findings: r.findings,
    blockers: r.blockers,
    expectedConfirmation: r.expectedConfirmation,
    confirmationValid: r.confirmationValid,
    commitEligible: r.commitEligible,
    fbsCount: r.fbsCount,
    distinctFbs: r.distinctFbs,
    talentRowsFbs: r.talentRowsFbs,
    talentDistinctFbs: r.talentDistinctFbs,
    finiteTalent: r.finiteTalent,
    talentSetExact: r.talentSetExact,
    highlightTeamsPresent: r.highlightTeamsPresent,
    relevantCanonicalWeeksPresent: r.relevantCanonicalWeeksPresent,
    missingRelevantCanonicalWeeks: r.missingRelevantCanonicalWeeks,
    relevantGamesThroughCutoff: r.relevantGamesThroughCutoff,
    nonFinalRelevantGamesThroughCutoff: r.nonFinalRelevantGamesThroughCutoff,
    finalFbsVsFbsMissingScoreGames: r.finalFbsVsFbsMissingScoreGames,
    finalFbsGamesThroughCompletedWeek: r.finalFbsGamesThroughCompletedWeek,
    fbsVsFbsFinalsThroughCutoff: r.fbsVsFbsFinalsThroughCutoff,
    finalGamesWithFbsParticipantThroughCutoff:
      r.finalGamesWithFbsParticipantThroughCutoff,
    epaEligibleGameCount: r.epaEligibleGameCount,
    futureFinalFbsGamesBeyondCompletedWeek:
      r.futureFinalFbsGamesBeyondCompletedWeek,
    futureFinalGamesWithFbsParticipantBeyondCutoff:
      r.futureFinalGamesWithFbsParticipantBeyondCutoff,
    expectedEpaParticipantRows: r.expectedEpaParticipantRows,
    actualEpaParticipantRows: r.actualEpaParticipantRows,
    missingEpaKeys: r.missingEpaKeys,
    unexpectedEpaKeys: r.unexpectedEpaKeys,
    duplicateEpaKeys: r.duplicateEpaKeys,
    nullOrNonFiniteEpaRows: r.nullOrNonFiniteEpaRows,
    epaCoverageExact: r.epaCoverageExact,
    existingV1Count: r.existingV1Count,
    proposedCreateCount: r.proposedCreateCount,
    proposedUpdateCount: r.proposedUpdateCount,
    outputCount: r.outputCount,
    ratingsSummary: r.ratingsSummary,
    rows: r.rows,
    providerCalls: 0,
    Odds: false,
    providersInvoked: false,
    mutationsInvoked: options.execution.mutationsInvoked,
    execution: options.execution,
    verification: options.verification,
    meta: {
      isolationLevel: options.execution.isolationLevel,
      Odds: false,
      providersInvoked: false,
      providerCalls: 0,
      ...(options.meta ?? {}),
    },
  };
}

export function resolvePreviewExitCode(writeSafe: boolean): 0 | 1 {
  return writeSafe ? 0 : 1;
}

export function commitEligibleFromResult(
  result: CoreV1LifecycleResult
): boolean {
  return (
    result.mode === 'COMMIT' && result.writeSafe && result.confirmationValid
  );
}
