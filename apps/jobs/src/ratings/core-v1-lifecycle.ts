/**
 * Phase 2C-2H-9 — Core V1 2026 preseason/transition lifecycle (pure policy + gates).
 *
 * AUTHORIZED MODEL POLICY (human decision after 2C-2H-8):
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

export const TARGET_SEASON = 2026 as const;
export const MODEL_VERSION_V1 = 'v1' as const;
export const CORE_V1_2026_TRANSITION_POLICY = 'GLOBAL_BLEND_W3_W6' as const;
export const WRITE_CONFIRM_PHRASE = 'WRITE_2026_CORE_V1' as const;
export const EXPECTED_FBS_COUNT = EXPECTED_2026_FBS_COUNT;

export type LifecycleMode = 'PREVIEW' | 'COMMIT';

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
  findings: string[];
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
  canonicalCount: number;
  canonicalExactFbsSet: boolean;
  canonicalFinite: number;
  outputCount: number;
  existingV1Count: number;
  proposedCreateCount: number;
  proposedUpdateCount: number;
  rows: CoreV1LifecycleRow[];
  ratingsSummary: NumericSummary;
  confirmationValid: boolean;
  commitEligible: boolean;
  modelVersion: typeof MODEL_VERSION_V1;
  canonicalWeights: {
    talent: typeof BALANCED_WEIGHT_TALENT;
    epa: typeof BALANCED_WEIGHT_EPA;
    netPoints: typeof BALANCED_WEIGHT_NET_POINTS;
    winPct: typeof BALANCED_WEIGHT_WIN_PCT;
  };
  canonicalCalibrationFactor: typeof BALANCED_V1_CALIBRATION_FACTOR;
  providersInvoked: false;
  Odds: false;
  mutationsInvoked: boolean;
  ratingsPersistenceInvoked: boolean;
  ratingsWriteAuthorized: boolean;
  modelPolicyAuthorized: true;
  productionWriteAuthorizedByThisPhase: false;
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

export function parseCoreV1LifecycleArgs(argv: string[]):
  | {
      ok: true;
      season: number;
      completedThroughWeek: number;
      mode: LifecycleMode;
      confirmation: string;
    }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let season: number | null = null;
  let completedThroughWeek: number | null = null;
  let mode: LifecycleMode | null = null;
  let confirmation = '';

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
  const confirmationValid = input.confirmation === WRITE_CONFIRM_PHRASE;

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
    const epaByTeam = aggregateBalancedEpa(epaThrough);
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
    findings.push(`COMMIT requires confirmation=${WRITE_CONFIRM_PHRASE}`);
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
    findings,
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
    canonicalCount,
    canonicalExactFbsSet,
    canonicalFinite,
    outputCount: rows.length,
    existingV1Count: input.existingV1FbsRows,
    proposedCreateCount,
    proposedUpdateCount,
    rows,
    ratingsSummary: numericSummary(rows.map((r) => r.finalPowerRating)),
    confirmationValid,
    commitEligible,
    modelVersion: MODEL_VERSION_V1,
    canonicalWeights: {
      talent: BALANCED_WEIGHT_TALENT,
      epa: BALANCED_WEIGHT_EPA,
      netPoints: BALANCED_WEIGHT_NET_POINTS,
      winPct: BALANCED_WEIGHT_WIN_PCT,
    },
    canonicalCalibrationFactor: BALANCED_V1_CALIBRATION_FACTOR,
    providersInvoked: false,
    Odds: false,
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
  lines.push(`ok=${result.ok}`);
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
    `existingV1Count=${result.existingV1Count} proposedCreate=${result.proposedCreateCount} proposedUpdate=${result.proposedUpdateCount}`
  );
  lines.push(
    `dist min=${fmt(result.ratingsSummary.min)} avg=${fmt(result.ratingsSummary.avg)} median=${fmt(result.ratingsSummary.median)} max=${fmt(result.ratingsSummary.max)} std=${fmt(result.ratingsSummary.stdDev)} range=${fmt(result.ratingsSummary.range)}`
  );
  lines.push(
    `providersInvoked=${result.providersInvoked} Odds=${result.Odds} mutationsInvoked=${result.mutationsInvoked} ratingsPersistenceInvoked=${result.ratingsPersistenceInvoked} ratingsWriteAuthorized=${result.ratingsWriteAuthorized}`
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
