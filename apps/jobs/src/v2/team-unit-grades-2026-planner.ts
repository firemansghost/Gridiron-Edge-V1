/**
 * Read-only 2026 TeamUnitGrades planning / PREVIEW (pure).
 *
 * Inspects source-frame integrity and raw metric coverage to decide whether
 * a future guarded TeamUnitGrades computation could proceed.
 *
 * Does not write TeamUnitGrades. Does not authorize COMMIT.
 * Does not invoke compute_unit_grades.ts.
 * Does not change Hybrid/Core/Shadow formulas.
 *
 * Numerical grade generation is intentionally unreachable in this preview:
 * incomplete source remains blocked, and even PLANNING_ELIGIBLE does not
 * emit proposed grade values. That is inspection-only gating, not a new
 * methodology and not frozen compute behavior.
 *
 * Reuses apps/jobs/src/v2/unit-grade-source-readiness.ts as the
 * authoritative source/frame/coverage contract.
 * LEGACY COMPATIBILITY IS NOT METHODOLOGY AUTHORIZATION.
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

export const TEAM_UNIT_GRADES_2026_MODE = 'PREVIEW' as const;
export const SEASON_MUST_BE_2026_BLOCKER = 'season_must_be_2026' as const;

export type TeamUnitGrades2026PlannerStatus =
  | 'BLOCKED_FRAME_INVALID'
  | 'BLOCKED_SOURCE_INCOMPLETE'
  | 'BLOCKED_EXISTING_GRADES'
  | 'BLOCKED_SEASON_INVALID'
  | 'PLANNING_ELIGIBLE';

export interface ProposedGradeRow {
  teamId: string;
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

/**
 * Pure 2026 TeamUnitGrades PREVIEW planner.
 *
 * Distinguishes:
 * A. source/frame integrity (source.status / failClosed)
 * B. source coverage (rawMetricCoverageComplete)
 * C. whether grade planning is allowed (authoritativePlanningAllowed)
 * D. whether any future write is authorized (always false here)
 *
 * Season authorization is independent of source-readiness: a non-2026
 * input never becomes PLANNING_ELIGIBLE, even if coverage is complete.
 * Returned season is the caller's input.season (provenance), not a rewrite.
 */
export function planTeamUnitGrades2026(
  input: UnitGradeSourceReadinessInput
): TeamUnitGrades2026Plan {
  const source = buildUnitGradeSourceReadinessReport(input);
  const seasonInvalid = input.season !== TARGET_SEASON;
  const plannerStatus: TeamUnitGrades2026PlannerStatus = seasonInvalid
    ? 'BLOCKED_SEASON_INVALID'
    : plannerStatusFromSource(source);
  const authoritativePlanningAllowed = plannerStatus === 'PLANNING_ELIGIBLE';
  const proposedGradeRows: ProposedGradeRow[] = [];
  const warnings = source.warnings.slice();
  if (authoritativePlanningAllowed) {
    warnings.push('authoritative_grade_generation_not_implemented_in_this_preview');
  }
  warnings.push('team_unit_grades_write_authorized_is_always_false');
  warnings.push('compute_unit_grades_ts_is_not_invoked');

  const blockers = source.blockers.slice();
  if (seasonInvalid) blockers.unshift(SEASON_MUST_BE_2026_BLOCKER);

  const failClosed =
    plannerStatus === 'BLOCKED_FRAME_INVALID' ||
    plannerStatus === 'BLOCKED_EXISTING_GRADES' ||
    plannerStatus === 'BLOCKED_SEASON_INVALID';

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
