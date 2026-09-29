export const HISTORICAL_V3_WEEK_QUERY_RESOLUTION_VERSION =
  'historical_v3_week_query_resolution_v1' as const;
export const HISTORICAL_V3_WEEK_QUERY_ENDPOINT =
  '/stats/game/advanced' as const;
export const HISTORICAL_V3_WEEK_QUERY_TOLERANCE = 1e-12 as const;
export const HISTORICAL_V3_WEEK_QUERY_MAX_PROVIDER_CALLS = 11 as const;
export const HISTORICAL_V3_RECOVERY_WEEKS = [4, 12, 14] as const;
export const HISTORICAL_V3_RECOVERY_GAME_IDS = [
  401641034,
  401645328,
  401644689,
  401644780,
] as const;

export type HistoricalV3WeekQueryStatus =
  | 'HISTORICAL_V3_WEEK_QUERY_QUALIFIED'
  | 'HISTORICAL_V3_WEEK_QUERY_REJECTED';

export interface HistoricalV3CalibrationGame {
  season: 2022 | 2023;
  gameId: number;
  week: number;
  bucket: 'W1' | 'W6' | 'W12' | 'FINAL';
  homeTeam: string;
  awayTeam: string;
}

export interface HistoricalV3WeekQueryRequest {
  phase: 'QUALIFICATION' | 'RECOVERY';
  season: 2022 | 2023 | 2024;
  week: number;
  endpoint: typeof HISTORICAL_V3_WEEK_QUERY_ENDPOINT;
  query: {
    year: string;
    week: string;
    seasonType: 'regular';
  };
}

export interface HistoricalV3TeamMetrics {
  team: string;
  opponent: string;
  offensePpa: number;
  defensePpa: number;
  offenseSuccessRate: number;
  defenseSuccessRate: number;
}

export interface HistoricalV3MetricComparison {
  team: string;
  metric:
    | 'offensePpa'
    | 'defensePpa'
    | 'offenseSuccessRate'
    | 'defenseSuccessRate';
  bulk: number | null;
  weekScoped: number | null;
  absoluteDifference: number | null;
  pass: boolean;
}

export interface HistoricalV3GameQualification {
  season: 2022 | 2023;
  week: number;
  gameId: number;
  homeTeam: string;
  awayTeam: string;
  comparisons: HistoricalV3MetricComparison[];
  comparisonCount: number;
  maxAbsoluteDifference: number | null;
  pass: boolean;
  findings: string[];
}

export interface HistoricalV3QualificationResult {
  status: HistoricalV3WeekQueryStatus;
  calibrationGames: number;
  scalarComparisons: number;
  passingComparisons: number;
  maxAbsoluteDifference: number | null;
  games: HistoricalV3GameQualification[];
}

export interface HistoricalV3CanonicalRecoveryGame {
  season: 2024;
  gameId: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
}

export interface HistoricalV3RecoveredAdvancedRow {
  gameId: number;
  season: 2024;
  seasonType: 'regular';
  week: number;
  team: string;
  opponent: string;
  offense: {
    ppa: number;
    successRate: number;
  };
  defense: {
    ppa: number;
    successRate: number;
  };
  sourceProvenance: 'BULK_ADVANCED_WEEK_SCOPED_RECOVERY';
}

export interface HistoricalV3RecoveryResult {
  qualificationStatus: HistoricalV3WeekQueryStatus;
  recoveryAttempted: boolean;
  recoveryCompleteness: 'NOT_ATTEMPTED' | 'ZERO' | 'PARTIAL' | 'COMPLETE';
  acceptedRows: HistoricalV3RecoveredAdvancedRow[];
  recoveredGameIds: number[];
  unresolvedGameIds: number[];
  suppliedWeekRows: number;
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function integer(value: unknown): number | null {
  const valueNumber = finiteNumber(value);
  return valueNumber !== null && Number.isInteger(valueNumber)
    ? valueNumber
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseFrame(raw: unknown): {
  season: 2022 | 2023;
  gameId: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
} {
  const row = asObject(raw);
  const season = row ? integer(row.season) : null;
  const gameId = row ? integer(row.gameId) : null;
  const week = row ? integer(row.week) : null;
  const homeTeam = row ? stringValue(row.homeTeam) : null;
  const awayTeam = row ? stringValue(row.awayTeam) : null;

  if (
    (season !== 2022 && season !== 2023) ||
    gameId === null ||
    gameId <= 0 ||
    week === null ||
    week <= 0 ||
    !homeTeam ||
    !awayTeam
  ) {
    throw new Error('v3_week_query_invalid_calibration_frame');
  }

  return { season, gameId, week, homeTeam, awayTeam };
}

export function selectHistoricalV3CalibrationGames(
  gameFrames: unknown[]
): HistoricalV3CalibrationGame[] {
  const frames = gameFrames.map(parseFrame);
  const result: HistoricalV3CalibrationGame[] = [];

  for (const season of [2022, 2023] as const) {
    const seasonFrames = frames.filter((frame) => frame.season === season);
    if (seasonFrames.length === 0) {
      throw new Error(`v3_week_query_calibration_season_missing:${season}`);
    }

    const finalWeek = Math.max(...seasonFrames.map((frame) => frame.week));
    const buckets: Array<{
      week: number;
      bucket: HistoricalV3CalibrationGame['bucket'];
    }> = [
      { week: 1, bucket: 'W1' },
      { week: 6, bucket: 'W6' },
      { week: 12, bucket: 'W12' },
      { week: finalWeek, bucket: 'FINAL' },
    ];

    for (const { week, bucket } of buckets) {
      const selected = seasonFrames
        .filter((frame) => frame.week === week)
        .sort((left, right) => left.gameId - right.gameId)[0];
      if (!selected) {
        throw new Error(
          `v3_week_query_calibration_week_missing:${season}:${week}`
        );
      }

      result.push({
        ...selected,
        bucket,
      });
    }
  }

  if (result.length !== 8) {
    throw new Error(
      `v3_week_query_calibration_cohort_size_mismatch:${result.length}`
    );
  }

  const identities = new Set(
    result.map((game) => `${game.season}:${game.week}:${game.gameId}`)
  );
  if (identities.size !== 8) {
    throw new Error('v3_week_query_calibration_identity_duplicate');
  }

  return result.sort(
    (left, right) =>
      left.season - right.season ||
      left.week - right.week ||
      left.gameId - right.gameId
  );
}

function request(
  phase: HistoricalV3WeekQueryRequest['phase'],
  season: HistoricalV3WeekQueryRequest['season'],
  week: number
): HistoricalV3WeekQueryRequest {
  if (!Number.isInteger(week) || week <= 0) {
    throw new Error('v3_week_query_invalid_request_week');
  }
  return {
    phase,
    season,
    week,
    endpoint: HISTORICAL_V3_WEEK_QUERY_ENDPOINT,
    query: {
      year: String(season),
      week: String(week),
      seasonType: 'regular',
    },
  };
}

export function buildHistoricalV3QualificationRequests(
  calibrationGames: HistoricalV3CalibrationGame[]
): HistoricalV3WeekQueryRequest[] {
  if (calibrationGames.length !== 8) {
    throw new Error('v3_week_query_requires_exact_calibration_cohort');
  }

  const seen = new Set<string>();
  const requests: HistoricalV3WeekQueryRequest[] = [];
  for (const game of calibrationGames) {
    const key = `${game.season}:${game.week}`;
    if (seen.has(key)) {
      throw new Error(`v3_week_query_duplicate_qualification_request:${key}`);
    }
    seen.add(key);
    requests.push(request('QUALIFICATION', game.season, game.week));
  }

  if (requests.length !== 8) {
    throw new Error('v3_week_query_qualification_request_count_mismatch');
  }
  return requests;
}

export function buildHistoricalV3RecoveryRequests(
  status: HistoricalV3WeekQueryStatus
): HistoricalV3WeekQueryRequest[] {
  if (status !== 'HISTORICAL_V3_WEEK_QUERY_QUALIFIED') return [];
  return HISTORICAL_V3_RECOVERY_WEEKS.map((week) =>
    request('RECOVERY', 2024, week)
  );
}

function parseRawAdvancedMetrics(
  raw: unknown,
  expectedTeam: string,
  expectedOpponent: string
): HistoricalV3TeamMetrics | null {
  const row = asObject(raw);
  if (!row) return null;
  const team = stringValue(row.team);
  const opponent = stringValue(row.opponent);
  if (team !== expectedTeam || opponent !== expectedOpponent) return null;

  const offense = asObject(row.offense);
  const defense = asObject(row.defense);
  const offensePpa = offense ? finiteNumber(offense.ppa) : null;
  const defensePpa = defense ? finiteNumber(defense.ppa) : null;
  const offenseSuccessRate = offense ? finiteNumber(offense.successRate) : null;
  const defenseSuccessRate = defense ? finiteNumber(defense.successRate) : null;

  if (
    offensePpa === null ||
    defensePpa === null ||
    offenseSuccessRate === null ||
    defenseSuccessRate === null
  ) {
    return null;
  }

  return {
    team,
    opponent,
    offensePpa,
    defensePpa,
    offenseSuccessRate,
    defenseSuccessRate,
  };
}

function developmentBulkMetrics(
  advancedHistory: unknown[],
  game: HistoricalV3CalibrationGame
): Map<string, HistoricalV3TeamMetrics> {
  const byTeam = new Map<string, HistoricalV3TeamMetrics>();

  for (const raw of advancedHistory) {
    const wrapper = asObject(raw);
    if (
      !wrapper ||
      integer(wrapper.season) !== game.season ||
      integer(wrapper.gameId) !== game.gameId
    ) {
      continue;
    }

    const team = stringValue(wrapper.team);
    const inner = wrapper.row;
    const opponent =
      team === game.homeTeam
        ? game.awayTeam
        : team === game.awayTeam
          ? game.homeTeam
          : null;
    if (!team || !opponent) continue;

    const parsed = parseRawAdvancedMetrics(inner, team, opponent);
    if (!parsed) {
      throw new Error(
        `v3_week_query_bulk_calibration_metrics_invalid:${game.gameId}:${team}`
      );
    }
    if (byTeam.has(team)) {
      throw new Error(
        `v3_week_query_duplicate_bulk_calibration_team:${game.gameId}:${team}`
      );
    }
    byTeam.set(team, parsed);
  }

  if (!byTeam.has(game.homeTeam) || !byTeam.has(game.awayTeam)) {
    throw new Error(
      `v3_week_query_bulk_calibration_game_incomplete:${game.gameId}`
    );
  }

  return byTeam;
}

function weekScopedMetrics(
  payload: unknown[],
  game: HistoricalV3CalibrationGame
): {
  metrics: Map<string, HistoricalV3TeamMetrics>;
  findings: string[];
} {
  const relevant = payload.filter((raw) => {
    const row = asObject(raw);
    return (
      row &&
      integer(row.season) === game.season &&
      row.seasonType === 'regular' &&
      integer(row.week) === game.week &&
      integer(row.gameId) === game.gameId
    );
  });

  const findings: string[] = [];
  const byTeam = new Map<string, HistoricalV3TeamMetrics>();

  for (const [team, opponent] of [
    [game.homeTeam, game.awayTeam],
    [game.awayTeam, game.homeTeam],
  ] as const) {
    const matches = relevant.filter((raw) => {
      const row = asObject(raw);
      return row && stringValue(row.team) === team;
    });
    if (matches.length !== 1) {
      findings.push(
        matches.length === 0
          ? `week_scoped_team_missing:${team}`
          : `week_scoped_team_duplicate:${team}`
      );
      continue;
    }

    const parsed = parseRawAdvancedMetrics(matches[0], team, opponent);
    if (!parsed) {
      findings.push(`week_scoped_metrics_invalid:${team}`);
      continue;
    }
    byTeam.set(team, parsed);
  }

  return { metrics: byTeam, findings };
}

export function compareHistoricalV3QualificationGame(
  advancedHistory: unknown[],
  weekPayload: unknown[],
  game: HistoricalV3CalibrationGame,
  tolerance = HISTORICAL_V3_WEEK_QUERY_TOLERANCE
): HistoricalV3GameQualification {
  const bulk = developmentBulkMetrics(advancedHistory, game);
  const scoped = weekScopedMetrics(weekPayload, game);
  const comparisons: HistoricalV3MetricComparison[] = [];
  const metricNames: HistoricalV3MetricComparison['metric'][] = [
    'offensePpa',
    'defensePpa',
    'offenseSuccessRate',
    'defenseSuccessRate',
  ];

  for (const team of [game.homeTeam, game.awayTeam]) {
    const bulkMetrics = bulk.get(team)!;
    const scopedMetrics = scoped.metrics.get(team) ?? null;

    for (const metric of metricNames) {
      const bulkValue = bulkMetrics[metric];
      const scopedValue = scopedMetrics ? scopedMetrics[metric] : null;
      const absoluteDifference =
        scopedValue === null ? null : Math.abs(bulkValue - scopedValue);
      comparisons.push({
        team,
        metric,
        bulk: bulkValue,
        weekScoped: scopedValue,
        absoluteDifference,
        pass:
          absoluteDifference !== null &&
          absoluteDifference <= tolerance,
      });
    }
  }

  const finiteDifferences = comparisons
    .map((comparison) => comparison.absoluteDifference)
    .filter((value): value is number => value !== null);
  const maxAbsoluteDifference =
    finiteDifferences.length === 0 ? null : Math.max(...finiteDifferences);
  const pass =
    scoped.findings.length === 0 &&
    comparisons.length === 8 &&
    comparisons.every((comparison) => comparison.pass);

  return {
    season: game.season,
    week: game.week,
    gameId: game.gameId,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    comparisons,
    comparisonCount: comparisons.length,
    maxAbsoluteDifference,
    pass,
    findings: scoped.findings,
  };
}

export function summarizeHistoricalV3Qualification(
  games: HistoricalV3GameQualification[]
): HistoricalV3QualificationResult {
  if (games.length !== 8) {
    throw new Error(
      `v3_week_query_qualification_game_count_mismatch:${games.length}`
    );
  }
  const comparisons = games.flatMap((game) => game.comparisons);
  const passingComparisons = comparisons.filter(
    (comparison) => comparison.pass
  ).length;
  const differences = comparisons
    .map((comparison) => comparison.absoluteDifference)
    .filter((value): value is number => value !== null);
  const allPass =
    comparisons.length === 64 &&
    passingComparisons === 64 &&
    games.every((game) => game.pass);

  return {
    status: allPass
      ? 'HISTORICAL_V3_WEEK_QUERY_QUALIFIED'
      : 'HISTORICAL_V3_WEEK_QUERY_REJECTED',
    calibrationGames: games.length,
    scalarComparisons: comparisons.length,
    passingComparisons,
    maxAbsoluteDifference:
      differences.length === 0 ? null : Math.max(...differences),
    games,
  };
}

function parseCanonicalRecoveryGames(
  gamesRows: unknown[]
): Map<number, HistoricalV3CanonicalRecoveryGame> {
  const wanted = new Set<number>(
    HISTORICAL_V3_RECOVERY_GAME_IDS as readonly number[]
  );
  const result = new Map<number, HistoricalV3CanonicalRecoveryGame>();

  for (const raw of gamesRows) {
    const row = asObject(raw);
    const gameId = row ? integer(row.id) : null;
    if (!row || gameId === null || !wanted.has(gameId)) continue;

    const week = integer(row.week);
    const homeTeam = stringValue(row.homeTeam);
    const awayTeam = stringValue(row.awayTeam);
    if (
      integer(row.season) !== 2024 ||
      row.seasonType !== 'regular' ||
      row.completed !== true ||
      row.homeClassification !== 'fbs' ||
      row.awayClassification !== 'fbs' ||
      week === null ||
      !HISTORICAL_V3_RECOVERY_WEEKS.includes(
        week as (typeof HISTORICAL_V3_RECOVERY_WEEKS)[number]
      ) ||
      !homeTeam ||
      !awayTeam
    ) {
      throw new Error(`v3_week_query_recovery_game_not_canonical:${gameId}`);
    }
    if (result.has(gameId)) {
      throw new Error(`v3_week_query_recovery_game_duplicate:${gameId}`);
    }
    result.set(gameId, {
      season: 2024,
      gameId,
      week,
      homeTeam,
      awayTeam,
    });
  }

  if (result.size !== HISTORICAL_V3_RECOVERY_GAME_IDS.length) {
    throw new Error(
      `v3_week_query_recovery_game_identity_count_mismatch:${result.size}`
    );
  }
  return result;
}

function bulkKeysForKnownRecoveryGames(
  bulkRows: unknown[]
): Set<string> {
  const wanted = new Set<number>(
    HISTORICAL_V3_RECOVERY_GAME_IDS as readonly number[]
  );
  const keys = new Set<string>();
  for (const raw of bulkRows) {
    const row = asObject(raw);
    const gameId = row ? integer(row.gameId) : null;
    const team = row ? stringValue(row.team) : null;
    if (gameId === null || !team || !wanted.has(gameId)) continue;
    keys.add(`${gameId}:${team}`);
  }
  return keys;
}

function recoveredRow(
  raw: unknown,
  game: HistoricalV3CanonicalRecoveryGame,
  team: string,
  opponent: string
): HistoricalV3RecoveredAdvancedRow | null {
  const metrics = parseRawAdvancedMetrics(raw, team, opponent);
  if (!metrics) return null;
  const row = asObject(raw);
  if (
    !row ||
    integer(row.season) !== 2024 ||
    row.seasonType !== 'regular' ||
    integer(row.week) !== game.week ||
    integer(row.gameId) !== game.gameId
  ) {
    return null;
  }

  return {
    gameId: game.gameId,
    season: 2024,
    seasonType: 'regular',
    week: game.week,
    team,
    opponent,
    offense: {
      ppa: metrics.offensePpa,
      successRate: metrics.offenseSuccessRate,
    },
    defense: {
      ppa: metrics.defensePpa,
      successRate: metrics.defenseSuccessRate,
    },
    sourceProvenance: 'BULK_ADVANCED_WEEK_SCOPED_RECOVERY',
  };
}

export function collectHistoricalV3RecoveryRows(options: {
  qualificationStatus: HistoricalV3WeekQueryStatus;
  gamesRows: unknown[];
  fullSeasonBulkRows: unknown[];
  weekPayloads: Record<number, unknown[]>;
}): HistoricalV3RecoveryResult {
  if (options.qualificationStatus !== 'HISTORICAL_V3_WEEK_QUERY_QUALIFIED') {
    return {
      qualificationStatus: options.qualificationStatus,
      recoveryAttempted: false,
      recoveryCompleteness: 'NOT_ATTEMPTED',
      acceptedRows: [],
      recoveredGameIds: [],
      unresolvedGameIds: [
        ...(HISTORICAL_V3_RECOVERY_GAME_IDS as readonly number[]),
      ],
      suppliedWeekRows: 0,
    };
  }

  const games = parseCanonicalRecoveryGames(options.gamesRows);
  const existingBulkKeys = bulkKeysForKnownRecoveryGames(
    options.fullSeasonBulkRows
  );
  const acceptedRows: HistoricalV3RecoveredAdvancedRow[] = [];
  let suppliedWeekRows = 0;

  for (const week of HISTORICAL_V3_RECOVERY_WEEKS) {
    const payload = options.weekPayloads[week] ?? [];
    suppliedWeekRows += payload.length;

    for (const game of [...games.values()].filter(
      (candidate) => candidate.week === week
    )) {
      for (const [team, opponent] of [
        [game.homeTeam, game.awayTeam],
        [game.awayTeam, game.homeTeam],
      ] as const) {
        const bulkKey = `${game.gameId}:${team}`;
        if (existingBulkKeys.has(bulkKey)) {
          throw new Error(
            `v3_week_query_recovery_overwrite_forbidden:${bulkKey}`
          );
        }

        const matches = payload.filter((raw) => {
          const row = asObject(raw);
          return (
            row &&
            integer(row.gameId) === game.gameId &&
            stringValue(row.team) === team
          );
        });

        if (matches.length > 1) {
          throw new Error(
            `v3_week_query_recovery_duplicate_team_row:${bulkKey}`
          );
        }
        if (matches.length === 0) continue;

        const accepted = recoveredRow(matches[0], game, team, opponent);
        if (accepted) acceptedRows.push(accepted);
      }
    }
  }

  acceptedRows.sort(
    (left, right) =>
      left.week - right.week ||
      left.gameId - right.gameId ||
      lexicalCompare(left.team, right.team)
  );

  const recoveredGameIds = [
    ...new Set(acceptedRows.map((row) => row.gameId)),
  ].filter((gameId) => {
    const game = games.get(gameId)!;
    return (
      acceptedRows.filter((row) => row.gameId === gameId).length === 2 &&
      acceptedRows.some(
        (row) => row.gameId === gameId && row.team === game.homeTeam
      ) &&
      acceptedRows.some(
        (row) => row.gameId === gameId && row.team === game.awayTeam
      )
    );
  }).sort((a, b) => a - b);

  const unresolvedGameIds = (
    HISTORICAL_V3_RECOVERY_GAME_IDS as readonly number[]
  ).filter((gameId) => !recoveredGameIds.includes(gameId));

  const recoveryCompleteness =
    recoveredGameIds.length === 0
      ? 'ZERO'
      : recoveredGameIds.length === HISTORICAL_V3_RECOVERY_GAME_IDS.length
        ? 'COMPLETE'
        : 'PARTIAL';

  return {
    qualificationStatus: options.qualificationStatus,
    recoveryAttempted: true,
    recoveryCompleteness,
    acceptedRows,
    recoveredGameIds,
    unresolvedGameIds,
    suppliedWeekRows,
  };
}

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
