/**
 * Read-only 2026 TeamUnitGrades planning / PREVIEW (pure).
 *
 * Inspects source-frame integrity and raw metric coverage. Only after the
 * conservative raw-source gate passes does it invoke the proven pure
 * legacy calculation/parity module to emit proposed grade rows.
 *
 * Does not write TeamUnitGrades. Does not authorize COMMIT.
 * Does not invoke compute_unit_grades.ts.
 * Does not change Hybrid/Core/Shadow formulas.
 *
 * Proposed rows are PREVIEW inspection only.
 * LEGACY COMPATIBILITY IS NOT METHODOLOGY AUTHORIZATION.
 * legacy TeamUnitGrades calculation parity is not methodology authorization.
 */

import {
  EXPECTED_FBS_COUNT,
  LEGACY_COMPATIBILITY_DISCLAIMER,
  TARGET_SEASON,
  buildUnitGradeSourceReadinessReport,
  type LegacyCategory,
  type LegacyCategoryCoverage,
  type MetricCoverage,
  type RawMetric,
  type SourceReadinessStatus,
  type UnitGradeSourceReadinessInput,
  type UnitGradeSourceReadinessReport,
} from './unit-grade-source-readiness';
import {
  LEGACY_TEAM_UNIT_GRADE_OUTPUTS,
  LEGACY_TEAM_UNIT_GRADES_MATH_DISCLAIMER,
  LEGACY_TEAM_UNIT_GRADES_MATH_KIND,
  aggregateLegacyTeamUnitGradeInputs,
  completeLegacyTeamUnitGradeInputs,
  computeLegacyTeamUnitGrades,
  type LegacyAggregateResult,
  type LegacyTeamUnitGradeMetric,
  type LegacyTeamUnitGrades,
  type LegacyTeamUnitGradesComputeResult,
  type LegacyZStatSummary,
} from './team-unit-grades-legacy-math';

export const TEAM_UNIT_GRADES_2026_MODE = 'PREVIEW' as const;
export const SEASON_MUST_BE_2026_BLOCKER = 'season_must_be_2026' as const;
export const CALCULATION_BLOCKER_PREFIX = 'calculation:' as const;

export type TeamUnitGrades2026PlannerStatus =
  | 'BLOCKED_FRAME_INVALID'
  | 'BLOCKED_SOURCE_INCOMPLETE'
  | 'BLOCKED_EXISTING_GRADES'
  | 'BLOCKED_SEASON_INVALID'
  | 'BLOCKED_CALCULATION_INPUT_INVALID'
  | 'PLANNING_ELIGIBLE';

export interface ProposedGradeRow {
  teamId: string;
  offRunGrade: number;
  defRunGrade: number;
  offPassGrade: number;
  defPassGrade: number;
  offExplosiveness: number;
  defExplosiveness: number;
  havocGrade: number;
}

export interface TeamUnitGrades2026Calculation {
  attempted: boolean;
  mathKind: typeof LEGACY_TEAM_UNIT_GRADES_MATH_KIND;
  inputRowCount: number;
  proposedRowCount: number;
  zStats: Record<LegacyTeamUnitGradeMetric, LegacyZStatSummary> | null;
}

export interface TeamUnitGrades2026Plan {
  season: number;
  repoCommitSha: string;
  observedAt: string;
  mode: typeof TEAM_UNIT_GRADES_2026_MODE;
  providersInvoked: false;
  providerCalls: 0;
  mutationsInvoked: false;
  mutationCount: 0;
  sourceReadinessStatus: SourceReadinessStatus;
  plannerStatus: TeamUnitGrades2026PlannerStatus;
  fbs: {
    expected: typeof EXPECTED_FBS_COUNT;
    actual: number;
    unique: number;
  };
  sourceInventory: {
    cfbdGames: number;
    effTeamGameRows: number;
    effTeamGameTeams: number;
    ppaTeamGameRows: number;
    ppaTeamGameTeams: number;
    effTeamSeasonRows: number;
    effTeamSeasonTeams: number;
    existingTeamUnitGradesRows: number;
    existingTeamUnitGradesTeams: number;
  };
  coverage: {
    rawMetricCoverage: Record<RawMetric, MetricCoverage>;
    legacyComputeCompatibleCoverage: Record<LegacyCategory, LegacyCategoryCoverage>;
    rawMetricCoverageComplete: boolean;
    legacyComputeCompatibleCoverageComplete: boolean;
  };
  planning: {
    authoritativePlanningAllowed: boolean;
    proposedGradeRowCount: number;
    proposedGradeRows: ProposedGradeRow[];
  };
  calculation: TeamUnitGrades2026Calculation;
  calculationDisclaimer: typeof LEGACY_TEAM_UNIT_GRADES_MATH_DISCLAIMER;
  authorization: {
    teamUnitGradesWriteAuthorized: false;
    shadowPreviewAuthorized: false;
    shadowCommitAuthorized: false;
    computeUnitGradesAuthorized: false;
  };
  legacyCompatibilityDisclaimer: typeof LEGACY_COMPATIBILITY_DISCLAIMER;
  blockers: string[];
  warnings: string[];
  failClosed: boolean;
  previewOk: boolean;
}

export function parseTeamUnitGrades2026PreviewArgs(argv: string[]):
  | { ok: true; season: number; reportPath: string | null }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let season: number | null = null;
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
    } else if (a === '--report') {
      reportPath = String(argv[++i] ?? '').trim() || null;
    } else if (a.startsWith('--report=')) {
      reportPath = a.slice('--report='.length).trim() || null;
    } else if (a === '--mode' || a.startsWith('--mode=')) {
      const mode = a === '--mode' ? String(argv[++i] ?? '') : a.slice('--mode='.length);
      if (String(mode).toUpperCase() !== 'PREVIEW') {
        errors.push('this planner is PREVIEW-only; COMMIT is not authorized');
      }
    } else if (a === '--week' || a.startsWith('--week=')) {
      errors.push('week is not an input for this 2026 TeamUnitGrades preview');
    } else {
      errors.push(`unknown arg: ${a}`);
    }
  }

  if (season === null) season = TARGET_SEASON;
  if (season !== TARGET_SEASON) errors.push(`season must be ${TARGET_SEASON}`);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, season, reportPath };
}

export function sanitizeTeamUnitGrades2026PreviewError(_err?: unknown): string {
  return '2026 TeamUnitGrades preview failed; connection and secret details suppressed';
}

function plannerStatusFromSource(
  source: UnitGradeSourceReadinessReport
): TeamUnitGrades2026PlannerStatus {
  if (source.status === 'FRAME_INVALID') return 'BLOCKED_FRAME_INVALID';
  if (source.status === 'UNIT_GRADES_ALREADY_PRESENT_UNEXPECTEDLY') {
    return 'BLOCKED_EXISTING_GRADES';
  }
  // Conservative gate: rawMetricCoverageComplete must be true.
  // SOURCE_EMPTY, SOURCE_PARTIAL, and legacy-complete-via-fallback all stay blocked.
  if (source.readiness.rawMetricCoverageComplete !== true) {
    return 'BLOCKED_SOURCE_INCOMPLETE';
  }
  return 'PLANNING_ELIGIBLE';
}

function namespaceCalculationBlockers(blockers: readonly string[]): string[] {
  const out: string[] = [];
  const seen: Record<string, true> = Object.create(null);
  for (let i = 0; i < blockers.length; i++) {
    const raw = blockers[i];
    const namespaced = raw.indexOf(CALCULATION_BLOCKER_PREFIX) === 0
      ? raw
      : `${CALCULATION_BLOCKER_PREFIX}${raw}`;
    if (seen[namespaced]) continue;
    seen[namespaced] = true;
    out.push(namespaced);
  }
  return out;
}

function compareTeamId(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function uniqueSortedTeamIds(ids: readonly string[]): string[] {
  const seen: Record<string, true> = Object.create(null);
  const out: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (seen[id]) continue;
    seen[id] = true;
    out.push(id);
  }
  out.sort(compareTeamId);
  return out;
}

function emptyCalculation(attempted: boolean): TeamUnitGrades2026Calculation {
  return {
    attempted,
    mathKind: LEGACY_TEAM_UNIT_GRADES_MATH_KIND,
    inputRowCount: 0,
    proposedRowCount: 0,
    zStats: null,
  };
}

function mapProposedRow(row: LegacyTeamUnitGrades): ProposedGradeRow {
  return {
    teamId: row.teamId,
    offRunGrade: row.offRunGrade,
    defRunGrade: row.defRunGrade,
    offPassGrade: row.offPassGrade,
    defPassGrade: row.defPassGrade,
    offExplosiveness: row.offExplosiveness,
    defExplosiveness: row.defExplosiveness,
    havocGrade: row.havocGrade,
  };
}

function proposedPopulationBlockers(
  fbsTeamIds: readonly string[],
  rows: readonly ProposedGradeRow[]
): string[] {
  const blockers: string[] = [];
  if (rows.length !== EXPECTED_FBS_COUNT) {
    blockers.push('calculation:proposed_row_count_mismatch');
  }
  const proposedIds: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const id = rows[i].teamId;
    if (typeof id !== 'string' || id.trim() === '') {
      blockers.push('calculation:blank_team_id');
    } else {
      proposedIds.push(id);
    }
    for (let o = 0; o < LEGACY_TEAM_UNIT_GRADE_OUTPUTS.length; o++) {
      const key = LEGACY_TEAM_UNIT_GRADE_OUTPUTS[o];
      if (!Number.isFinite(rows[i][key])) {
        blockers.push('calculation:nonfinite_grade');
      }
    }
  }
  const uniqueProposed = uniqueSortedTeamIds(proposedIds);
  if (uniqueProposed.length !== proposedIds.length) {
    blockers.push('calculation:duplicate_team_id');
  }
  const uniqueFbs = uniqueSortedTeamIds(fbsTeamIds.slice());
  if (uniqueProposed.length !== uniqueFbs.length) {
    blockers.push('calculation:proposed_team_set_mismatch');
  } else {
    for (let i = 0; i < uniqueFbs.length; i++) {
      if (uniqueFbs[i] !== uniqueProposed[i]) {
        blockers.push('calculation:proposed_team_set_mismatch');
        break;
      }
    }
  }
  return namespaceCalculationBlockers(blockers);
}

function attemptLegacyProposal(
  input: UnitGradeSourceReadinessInput
): {
  ok: boolean;
  rows: ProposedGradeRow[];
  inputRowCount: number;
  zStats: Record<LegacyTeamUnitGradeMetric, LegacyZStatSummary> | null;
  blockers: string[];
} {
  const aggregated: LegacyAggregateResult = aggregateLegacyTeamUnitGradeInputs({
    teamIds: input.fbsTeamIds,
    effTeamGames: input.effTeamGames,
    ppaTeamGames: input.ppaTeamGames,
    effTeamSeasons: input.effTeamSeasons,
  });
  if (aggregated.ok === false) {
    return {
      ok: false,
      rows: [],
      inputRowCount: 0,
      zStats: null,
      blockers: namespaceCalculationBlockers(aggregated.blockers),
    };
  }
  const completed = completeLegacyTeamUnitGradeInputs(aggregated.rows);
  if (completed.ok === false) {
    return {
      ok: false,
      rows: [],
      inputRowCount: aggregated.rows.length,
      zStats: null,
      blockers: namespaceCalculationBlockers(completed.blockers),
    };
  }
  const computed: LegacyTeamUnitGradesComputeResult = computeLegacyTeamUnitGrades(
    completed.rows
  );
  if (computed.ok === false) {
    return {
      ok: false,
      rows: [],
      inputRowCount: completed.rows.length,
      zStats: null,
      blockers: namespaceCalculationBlockers(computed.blockers),
    };
  }
  const rows: ProposedGradeRow[] = [];
  for (let i = 0; i < computed.grades.length; i++) {
    rows.push(mapProposedRow(computed.grades[i]));
  }
  const populationBlockers = proposedPopulationBlockers(input.fbsTeamIds, rows);
  if (populationBlockers.length > 0) {
    return {
      ok: false,
      rows: [],
      inputRowCount: completed.rows.length,
      zStats: null,
      blockers: populationBlockers,
    };
  }
  return {
    ok: true,
    rows,
    inputRowCount: completed.rows.length,
    zStats: computed.zStats,
    blockers: [],
  };
}

/**
 * Pure 2026 TeamUnitGrades PREVIEW planner.
 *
 * Gate order:
 * A. season !== 2026 -> BLOCKED_SEASON_INVALID (no calculation)
 * B. invalid source/frame -> BLOCKED_FRAME_INVALID (no calculation)
 * C. existing 2026 TeamUnitGrades -> BLOCKED_EXISTING_GRADES (no calculation)
 * D. rawMetricCoverageComplete !== true -> BLOCKED_SOURCE_INCOMPLETE (no calculation)
 * E. only then invoke pure aggregate -> complete -> compute
 * F. calculation/population contract failure -> BLOCKED_CALCULATION_INPUT_INVALID
 *
 * Write/compute/Shadow authorization is always false.
 */
export function planTeamUnitGrades2026(
  input: UnitGradeSourceReadinessInput
): TeamUnitGrades2026Plan {
  const source = buildUnitGradeSourceReadinessReport(input);
  const seasonInvalid = input.season !== TARGET_SEASON;
  let plannerStatus: TeamUnitGrades2026PlannerStatus = seasonInvalid
    ? 'BLOCKED_SEASON_INVALID'
    : plannerStatusFromSource(source);
  let proposedGradeRows: ProposedGradeRow[] = [];
  const warnings = source.warnings.slice();
  const blockers = source.blockers.slice();
  if (seasonInvalid) blockers.unshift(SEASON_MUST_BE_2026_BLOCKER);

  let calculation = emptyCalculation(false);
  const mayCalculate =
    seasonInvalid === false && plannerStatus === 'PLANNING_ELIGIBLE';
  if (mayCalculate) {
    const proposal = attemptLegacyProposal(input);
    calculation = {
      attempted: true,
      mathKind: LEGACY_TEAM_UNIT_GRADES_MATH_KIND,
      inputRowCount: proposal.inputRowCount,
      proposedRowCount: 0,
      zStats: null,
    };
    if (proposal.ok === false) {
      plannerStatus = 'BLOCKED_CALCULATION_INPUT_INVALID';
      for (let i = 0; i < proposal.blockers.length; i++) {
        blockers.push(proposal.blockers[i]);
      }
    } else {
      proposedGradeRows = proposal.rows;
      calculation.proposedRowCount = proposal.rows.length;
      calculation.inputRowCount = proposal.inputRowCount;
      calculation.zStats = proposal.zStats;
    }
  }

  const authoritativePlanningAllowed = plannerStatus === 'PLANNING_ELIGIBLE';
  warnings.push('team_unit_grades_write_authorized_is_always_false');
  warnings.push('compute_unit_grades_ts_is_not_invoked');
  warnings.push('legacy_math_parity_is_not_methodology_authorization');

  const failClosed =
    plannerStatus === 'BLOCKED_FRAME_INVALID' ||
    plannerStatus === 'BLOCKED_EXISTING_GRADES' ||
    plannerStatus === 'BLOCKED_SEASON_INVALID' ||
    plannerStatus === 'BLOCKED_CALCULATION_INPUT_INVALID';

  return {
    season: input.season,
    repoCommitSha: input.repoCommitSha,
    observedAt: input.observedAt,
    mode: TEAM_UNIT_GRADES_2026_MODE,
    providersInvoked: false,
    providerCalls: 0,
    mutationsInvoked: false,
    mutationCount: 0,
    sourceReadinessStatus: source.status,
    plannerStatus,
    fbs: {
      expected: EXPECTED_FBS_COUNT,
      actual: source.fbs.actual,
      unique: source.fbs.unique,
    },
    sourceInventory: {
      cfbdGames: source.cfbdSourceInventory.cfbdGames,
      effTeamGameRows: source.cfbdSourceInventory.effTeamGameRows,
      effTeamGameTeams: source.cfbdSourceInventory.effTeamGameTeams,
      ppaTeamGameRows: source.cfbdSourceInventory.ppaTeamGameRows,
      ppaTeamGameTeams: source.cfbdSourceInventory.ppaTeamGameTeams,
      effTeamSeasonRows: source.cfbdSourceInventory.effTeamSeasonRows,
      effTeamSeasonTeams: source.cfbdSourceInventory.effTeamSeasonTeams,
      existingTeamUnitGradesRows: source.teamUnitGrades.rows,
      existingTeamUnitGradesTeams: source.teamUnitGrades.distinctTeams,
    },
    coverage: {
      rawMetricCoverage: source.rawMetricCoverage,
      legacyComputeCompatibleCoverage: source.legacyComputeCompatibleCoverage,
      rawMetricCoverageComplete: source.readiness.rawMetricCoverageComplete,
      legacyComputeCompatibleCoverageComplete:
        source.readiness.legacyComputeCompatibleCoverageComplete,
    },
    planning: {
      authoritativePlanningAllowed,
      proposedGradeRowCount: proposedGradeRows.length,
      proposedGradeRows,
    },
    calculation,
    calculationDisclaimer: LEGACY_TEAM_UNIT_GRADES_MATH_DISCLAIMER,
    authorization: {
      teamUnitGradesWriteAuthorized: false,
      shadowPreviewAuthorized: false,
      shadowCommitAuthorized: false,
      computeUnitGradesAuthorized: false,
    },
    legacyCompatibilityDisclaimer: LEGACY_COMPATIBILITY_DISCLAIMER,
    blockers,
    warnings,
    failClosed,
    previewOk: failClosed === false,
  };
}
