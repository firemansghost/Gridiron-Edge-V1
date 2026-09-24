/**
 * Read-only V4 comparator source-readiness / equivalence assessment.
 *
 * This module does not compute V4 ratings or picks. It only evaluates whether
 * the legacy V4 source contract can be reproduced prospectively without
 * changing its inputs or inferring missing provenance.
 */

export const V4_COMPARATOR_READINESS_TARGET_SEASON = 2026;
export const V4_COMPARATOR_READINESS_COMPARISON_SEASON = 2025;

export type SourceComponentStatus =
  | 'READY'
  | 'MISSING'
  | 'UNPROVEN_EQUIVALENCE';

export type HistoricalEquivalenceStatus =
  | 'UNTESTABLE'
  | 'NOT_PROVEN'
  | 'CANDIDATE_COMPARABLE';

export interface V4ReadinessTeamSeasonRow {
  teamId: string;
  successOff: number | null;
  successDef: number | null;
  offFinishing: number | null;
  defFinishing: number | null;
  offAvailableYardsPct: number | null;
  defAvailableYardsPct: number | null;
}

export interface V4ReadinessTeamGameRow {
  gameId: string;
  teamId: string;
  week: number;
  successOff: number | null;
  successDef: number | null;
  offensePlays: number | null;
  defensePlays: number | null;
}

export interface V4ComparatorSourceReadinessInput {
  targetSeason: number;
  comparisonSeason: number;
  repoCommitSha: string;
  observedAt: string;
  targetFbsTeamIds: string[];
  comparisonFbsTeamIds: string[];
  targetUnitGradeTeamIds: string[];
  targetExplosivenessCompleteTeamIds: string[];
  targetTeamSeasonRows: V4ReadinessTeamSeasonRow[];
  comparisonTeamSeasonRows: V4ReadinessTeamSeasonRow[];
  targetTeamGameRows: V4ReadinessTeamGameRow[];
  comparisonTeamGameRows: V4ReadinessTeamGameRow[];
  targetV4RatingTeamIds: string[];
  targetV4BetCount: number;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function finite(value: number | null): boolean {
  return value !== null && Number.isFinite(value);
}

function countFbsRows<T extends { teamId: string }>(
  rows: T[],
  fbsTeamIds: string[]
): T[] {
  const fbs = new Set(fbsTeamIds);
  return rows.filter((row) => fbs.has(row.teamId));
}

function teamCount<T extends { teamId: string }>(rows: T[]): number {
  return unique(rows.map((row) => row.teamId)).length;
}

function teamCoverageAllRows<T extends { teamId: string }>(
  rows: T[],
  test: (row: T) => boolean
): number {
  const byTeam = new Map<string, T[]>();
  for (const row of rows) {
    const list = byTeam.get(row.teamId) ?? [];
    list.push(row);
    byTeam.set(row.teamId, list);
  }
  let complete = 0;
  for (const teamRows of byTeam.values()) {
    if (teamRows.length > 0 && teamRows.every(test)) complete += 1;
  }
  return complete;
}

function gameShape(rows: V4ReadinessTeamGameRow[]) {
  const games = unique(rows.map((row) => row.gameId));
  const teams = unique(rows.map((row) => row.teamId));
  const rowsPerGame = games.length > 0 ? rows.length / games.length : 0;
  return {
    rows: rows.length,
    games: games.length,
    teams: teams.length,
    rowsPerGame,
    minWeek:
      rows.length > 0 ? Math.min(...rows.map((row) => row.week)) : null,
    maxWeek:
      rows.length > 0 ? Math.max(...rows.map((row) => row.week)) : null,
  };
}

function componentCoverage(
  rows: V4ReadinessTeamSeasonRow[],
  fbsTeamIds: string[],
  test: (row: V4ReadinessTeamSeasonRow) => boolean
): number {
  return teamCount(countFbsRows(rows, fbsTeamIds).filter(test));
}

export function buildV4ComparatorSourceReadinessReport(
  input: V4ComparatorSourceReadinessInput
) {
  if (input.targetSeason !== V4_COMPARATOR_READINESS_TARGET_SEASON) {
    throw new Error(
      `targetSeason must equal ${V4_COMPARATOR_READINESS_TARGET_SEASON}`
    );
  }

  const targetFbs = unique(input.targetFbsTeamIds);
  const comparisonFbs = unique(input.comparisonFbsTeamIds);
  const targetSeasonRows = countFbsRows(
    input.targetTeamSeasonRows,
    targetFbs
  );
  const comparisonSeasonRows = countFbsRows(
    input.comparisonTeamSeasonRows,
    comparisonFbs
  );
  const targetGameRows = countFbsRows(input.targetTeamGameRows, targetFbs);
  const comparisonGameRows = countFbsRows(
    input.comparisonTeamGameRows,
    comparisonFbs
  );

  const targetShape = gameShape(targetGameRows);
  const comparisonShape = gameShape(comparisonGameRows);

  const targetSuccessSeasonCoverage = componentCoverage(
    targetSeasonRows,
    targetFbs,
    (r) => finite(r.successOff) && finite(r.successDef)
  );
  const targetDriveCoverage = componentCoverage(
    targetSeasonRows,
    targetFbs,
    (r) =>
      finite(r.offFinishing) &&
      finite(r.defFinishing) &&
      finite(r.offAvailableYardsPct) &&
      finite(r.defAvailableYardsPct)
  );
  const targetGameSuccessCoverage = teamCoverageAllRows(
    targetGameRows,
    (r) => finite(r.successOff) && finite(r.successDef)
  );
  const targetGamePlayCoverage = teamCoverageAllRows(
    targetGameRows,
    (r) => finite(r.offensePlays) && finite(r.defensePlays)
  );

  const comparisonSeasonSuccessCoverage = componentCoverage(
    comparisonSeasonRows,
    comparisonFbs,
    (r) => finite(r.successOff) && finite(r.successDef)
  );

  let historicalEquivalenceStatus: HistoricalEquivalenceStatus =
    'NOT_PROVEN';
  let historicalEquivalenceReason =
    'historical success-rate source equivalence has not been proven';

  if (
    comparisonShape.games === 0 ||
    comparisonSeasonSuccessCoverage === 0
  ) {
    historicalEquivalenceStatus = 'UNTESTABLE';
    historicalEquivalenceReason =
      'comparison season lacks overlapping TeamGameStat and TeamSeasonStat success evidence';
  } else if (Math.abs(comparisonShape.rowsPerGame - 2) > 1e-9) {
    historicalEquivalenceStatus = 'UNTESTABLE';
    historicalEquivalenceReason =
      'comparison TeamGameStat is not a two-participant-per-game frame and is not structurally comparable to the 2026 ingest';
  } else {
    historicalEquivalenceStatus = 'CANDIDATE_COMPARABLE';
    historicalEquivalenceReason =
      'comparison frame is structurally two-sided; numeric source-equivalence testing is still required';
  }

  const fbsCount = targetFbs.length;
  const unitGradeCoverage = unique(
    input.targetUnitGradeTeamIds.filter((id) => targetFbs.includes(id))
  ).length;
  const explosivenessCoverage = unique(
    input.targetExplosivenessCompleteTeamIds.filter((id) =>
      targetFbs.includes(id)
    )
  ).length;
  const v4RatingCoverage = unique(
    input.targetV4RatingTeamIds.filter((id) => targetFbs.includes(id))
  ).length;

  const successStatus: SourceComponentStatus =
    targetGameSuccessCoverage === fbsCount &&
    targetGamePlayCoverage === fbsCount
      ? 'UNPROVEN_EQUIVALENCE'
      : 'MISSING';
  const explosivenessStatus: SourceComponentStatus =
    unitGradeCoverage === fbsCount && explosivenessCoverage === fbsCount
      ? 'READY'
      : 'MISSING';
  const finishingStatus: SourceComponentStatus =
    targetDriveCoverage === fbsCount ? 'READY' : 'MISSING';
  const availableYardsStatus: SourceComponentStatus = finishingStatus;

  const blockers: string[] = [];
  if (targetSuccessSeasonCoverage !== fbsCount) {
    blockers.push('legacy_team_season_success_source_incomplete');
  }
  if (targetDriveCoverage !== fbsCount) {
    blockers.push('legacy_v4_drive_metrics_incomplete');
  }
  if (historicalEquivalenceStatus !== 'CANDIDATE_COMPARABLE') {
    blockers.push('historical_team_game_stat_shape_not_comparable');
  }
  if (successStatus !== 'READY') {
    blockers.push('team_game_success_source_equivalence_unproven');
  }
  if (explosivenessStatus !== 'READY') {
    blockers.push('team_unit_grade_explosiveness_incomplete');
  }
  if (v4RatingCoverage > 0) {
    blockers.push('unexpected_2026_v4_rating_rows_present');
  }
  if (input.targetV4BetCount > 0) {
    blockers.push('unexpected_2026_v4_bet_rows_present');
  }

  return {
    capability: 'v4_comparator_source_readiness_v1',
    researchOnly: true,
    targetSeason: input.targetSeason,
    comparisonSeason: input.comparisonSeason,
    repoCommitSha: input.repoCommitSha,
    observedAt: input.observedAt,
    providerCalls: 0,
    mutationsInvoked: false,
    target: {
      fbsTeamCount: fbsCount,
      unitGradeCoverage,
      explosivenessCoverage,
      teamSeasonStatRows: targetSeasonRows.length,
      teamSeasonSuccessCoverage: targetSuccessSeasonCoverage,
      legacyDriveMetricCoverage: targetDriveCoverage,
      teamGameStat: {
        ...targetShape,
        successCoverageTeams: targetGameSuccessCoverage,
        playCountCoverageTeams: targetGamePlayCoverage,
      },
      v4RatingCoverage,
      v4BetCount: input.targetV4BetCount,
    },
    historicalComparison: {
      fbsTeamCount: comparisonFbs.length,
      teamSeasonStatRows: comparisonSeasonRows.length,
      teamSeasonSuccessCoverage: comparisonSeasonSuccessCoverage,
      teamGameStat: comparisonShape,
      equivalenceStatus: historicalEquivalenceStatus,
      equivalenceReason: historicalEquivalenceReason,
    },
    sourceComponents: {
      successRate: {
        historicalSource: 'TeamSeasonStat.successOff/successDef',
        candidate2026Source: 'TeamGameStat.successOff/successDef aggregated prospectively',
        status: successStatus,
      },
      explosiveness: {
        historicalSource: 'TeamUnitGrades.offExplosiveness/defExplosiveness',
        candidate2026Source: 'TeamUnitGrades.offExplosiveness/defExplosiveness',
        status: explosivenessStatus,
      },
      finishingDrives: {
        historicalSource:
          'TeamSeasonStat.rawJson.drive_stats.finishingDrives pointsPerOpp',
        candidate2026Source: null,
        status: finishingStatus,
      },
      availableYards: {
        historicalSource:
          'TeamSeasonStat.rawJson.drive_stats.availableYards avgAvailableYardsPct',
        candidate2026Source: null,
        status: availableYardsStatus,
      },
    },
    canReproduceLegacyV4Prospectively: false,
    canPersistProspectiveV4Comparator: false,
    blockers: unique(blockers),
    recommendation: 'DO_NOT_PERSIST_V4_COMPARATOR',
    nextStep:
      'VALIDATE_PROSPECTIVE_DRIVE_SOURCE_AND_SUCCESS_SOURCE_EQUIVALENCE',
  };
}

export function parseV4ComparatorSourceReadinessArgs(args: string[]):
  | {
      ok: true;
      targetSeason: number;
      comparisonSeason: number;
      reportPath: string | null;
    }
  | { ok: false; errors: string[] } {
  let targetSeason = V4_COMPARATOR_READINESS_TARGET_SEASON;
  let comparisonSeason = V4_COMPARATOR_READINESS_COMPARISON_SEASON;
  let reportPath: string | null = null;
  const errors: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--season' && next) {
      targetSeason = Number(next);
      i += 1;
    } else if (arg === '--comparison-season' && next) {
      comparisonSeason = Number(next);
      i += 1;
    } else if (arg === '--report' && next) {
      reportPath = next;
      i += 1;
    } else {
      errors.push(`unknown or incomplete argument: ${arg}`);
    }
  }

  if (targetSeason !== V4_COMPARATOR_READINESS_TARGET_SEASON) {
    errors.push(
      `season must equal ${V4_COMPARATOR_READINESS_TARGET_SEASON}`
    );
  }
  if (!Number.isInteger(comparisonSeason) || comparisonSeason < 2000) {
    errors.push('comparison-season must be a valid season year');
  }

  return errors.length > 0
    ? { ok: false, errors }
    : {
        ok: true,
        targetSeason,
        comparisonSeason,
        reportPath,
      };
}

export function sanitizeV4ComparatorReadinessError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[DATABASE_URL_REDACTED]')
    .replace(/DIRECT_URL\s*=\s*[^\s]+/gi, 'DIRECT_URL=[REDACTED]');
}
