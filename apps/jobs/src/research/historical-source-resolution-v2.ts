export const HISTORICAL_V2_SOURCE_RESOLUTION_VERSION =
  'historical_source_resolution_v2' as const;
export const HISTORICAL_V2_SOURCE_EQUIVALENCE_TOLERANCE = 1e-9 as const;
export const HISTORICAL_V2_SOURCE_MAX_PROVIDER_CALLS = 12 as const;
export const HISTORICAL_V2_ADVANCED_BOX_ENDPOINT =
  '/game/box/advanced' as const;
export const HISTORICAL_V2_RECOVERY_GAME_IDS = [
  401641034,
  401645328,
  401644689,
  401644780,
] as const;

export type HistoricalV2SourceStatus =
  | 'HISTORICAL_V2_SOURCE_EQUIVALENCE_PASS'
  | 'HISTORICAL_V2_SOURCE_EQUIVALENCE_REJECTED';

export interface HistoricalV2CalibrationGame {
  season: 2022 | 2023;
  gameId: number;
  week: number;
  bucket: 'W1' | 'W6' | 'W12' | 'FINAL';
  homeTeam: string;
  awayTeam: string;
}

export interface HistoricalV2TeamMetrics {
  team: string;
  opponent: string;
  offensePpa: number;
  defensePpa: number;
  offenseSuccessRate: number;
  defenseSuccessRate: number;
}

export interface HistoricalV2MetricComparison {
  team: string;
  metric:
    | 'offensePpa'
    | 'defensePpa'
    | 'offenseSuccessRate'
    | 'defenseSuccessRate';
  bulk: number;
  fallback: number;
  absoluteDifference: number;
  pass: boolean;
}

export interface HistoricalV2GameEquivalence {
  season: number;
  gameId: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  comparisons: HistoricalV2MetricComparison[];
  maxAbsoluteDifference: number;
  pass: boolean;
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
  const n = finiteNumber(value);
  return n !== null && Number.isInteger(n) ? n : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function exactUniqueTeamMetric(
  rows: unknown,
  expectedTeams: readonly string[],
  label: string
): Map<string, number> {
  if (!Array.isArray(rows)) {
    throw new Error(`advanced_box_${label}_array_required`);
  }

  const result = new Map<string, number>();
  for (const raw of rows) {
    const obj = asObject(raw);
    const team = obj ? stringValue(obj.team) : null;
    const overall = obj ? asObject(obj.overall) : null;
    const total = overall ? finiteNumber(overall.total) : null;
    if (!team || total === null) continue;
    if (!expectedTeams.includes(team)) continue;
    if (result.has(team)) {
      throw new Error(`advanced_box_duplicate_${label}_team:${team}`);
    }
    result.set(team, total);
  }

  for (const team of expectedTeams) {
    if (!result.has(team)) {
      throw new Error(`advanced_box_missing_${label}_team:${team}`);
    }
  }
  if (result.size !== expectedTeams.length) {
    throw new Error(`advanced_box_unexpected_${label}_team_count`);
  }

  return result;
}

function parseFrame(raw: unknown): {
  season: 2022 | 2023;
  gameId: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
} {
  const obj = asObject(raw);
  const season = obj ? integer(obj.season) : null;
  const gameId = obj ? integer(obj.gameId) : null;
  const week = obj ? integer(obj.week) : null;
  const homeTeam = obj ? stringValue(obj.homeTeam) : null;
  const awayTeam = obj ? stringValue(obj.awayTeam) : null;

  if (
    (season !== 2022 && season !== 2023) ||
    gameId === null ||
    gameId <= 0 ||
    week === null ||
    week <= 0 ||
    !homeTeam ||
    !awayTeam
  ) {
    throw new Error('invalid_v2_calibration_game_frame');
  }

  return { season, gameId, week, homeTeam, awayTeam };
}

export function selectHistoricalV2CalibrationGames(
  gameFrames: unknown[]
): HistoricalV2CalibrationGame[] {
  const frames = gameFrames.map(parseFrame);
  const result: HistoricalV2CalibrationGame[] = [];

  for (const season of [2022, 2023] as const) {
    const seasonFrames = frames.filter((frame) => frame.season === season);
    if (seasonFrames.length === 0) {
      throw new Error(`v2_calibration_season_missing:${season}`);
    }

    const finalWeek = Math.max(...seasonFrames.map((frame) => frame.week));
    const buckets: Array<{
      week: number;
      bucket: HistoricalV2CalibrationGame['bucket'];
    }> = [
      { week: 1, bucket: 'W1' },
      { week: 6, bucket: 'W6' },
      { week: 12, bucket: 'W12' },
      { week: finalWeek, bucket: 'FINAL' },
    ];

    const seenGameIds = new Set<number>();
    for (const { week, bucket } of buckets) {
      const eligible = seasonFrames
        .filter((frame) => frame.week === week)
        .sort((a, b) => a.gameId - b.gameId);
      if (eligible.length === 0) continue;

      const selected = eligible[0];
      if (seenGameIds.has(selected.gameId)) continue;
      seenGameIds.add(selected.gameId);
      result.push({
        season,
        gameId: selected.gameId,
        week: selected.week,
        bucket,
        homeTeam: selected.homeTeam,
        awayTeam: selected.awayTeam,
      });
    }
  }

  if (result.length === 0 || result.length > 8) {
    throw new Error('v2_calibration_cohort_size_invalid');
  }

  return result.sort(
    (a, b) => a.season - b.season || a.week - b.week || a.gameId - b.gameId
  );
}

function rawAdvancedMetrics(
  rawRow: unknown,
  team: string,
  opponent: string
): HistoricalV2TeamMetrics {
  const row = asObject(rawRow);
  const offense = row ? asObject(row.offense) : null;
  const defense = row ? asObject(row.defense) : null;
  const rowTeam = row ? stringValue(row.team) : null;
  const rowOpponent = row ? stringValue(row.opponent) : null;

  const offensePpa = offense ? finiteNumber(offense.ppa) : null;
  const defensePpa = defense ? finiteNumber(defense.ppa) : null;
  const offenseSuccessRate = offense ? finiteNumber(offense.successRate) : null;
  const defenseSuccessRate = defense ? finiteNumber(defense.successRate) : null;

  if (
    rowTeam !== team ||
    rowOpponent !== opponent ||
    offensePpa === null ||
    defensePpa === null ||
    offenseSuccessRate === null ||
    defenseSuccessRate === null
  ) {
    throw new Error(`invalid_bulk_advanced_metrics:${team}`);
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

export function bulkAdvancedMetricsForCalibrationGame(
  advancedHistory: unknown[],
  game: HistoricalV2CalibrationGame
): Map<string, HistoricalV2TeamMetrics> {
  const relevant = advancedHistory.filter((raw) => {
    const obj = asObject(raw);
    return (
      obj &&
      integer(obj.season) === game.season &&
      integer(obj.gameId) === game.gameId
    );
  });

  const byTeam = new Map<string, unknown>();
  for (const raw of relevant) {
    const obj = asObject(raw);
    const team = obj ? stringValue(obj.team) : null;
    const row = obj?.row;
    if (!team || (team !== game.homeTeam && team !== game.awayTeam)) continue;
    if (byTeam.has(team)) {
      throw new Error(`duplicate_bulk_advanced_team:${game.gameId}:${team}`);
    }
    byTeam.set(team, row);
  }

  if (!byTeam.has(game.homeTeam) || !byTeam.has(game.awayTeam)) {
    throw new Error(`bulk_advanced_calibration_game_incomplete:${game.gameId}`);
  }

  return new Map([
    [
      game.homeTeam,
      rawAdvancedMetrics(byTeam.get(game.homeTeam), game.homeTeam, game.awayTeam),
    ],
    [
      game.awayTeam,
      rawAdvancedMetrics(byTeam.get(game.awayTeam), game.awayTeam, game.homeTeam),
    ],
  ]);
}

export function parseAdvancedBoxCandidateMetrics(
  payload: unknown,
  game: Pick<
    HistoricalV2CalibrationGame,
    'gameId' | 'homeTeam' | 'awayTeam'
  >
): Map<string, HistoricalV2TeamMetrics> {
  const root = asObject(payload);
  if (!root) throw new Error('advanced_box_object_required');

  const gameInfo = asObject(root.gameInfo);
  const gameInfoId = gameInfo
    ? integer(gameInfo.id ?? gameInfo.gameId)
    : null;
  if (gameInfoId !== null && gameInfoId !== game.gameId) {
    throw new Error('advanced_box_game_identity_mismatch');
  }

  const teams = asObject(root.teams);
  if (!teams) throw new Error('advanced_box_teams_object_required');

  const ppaRows = teams.ppa;
  const successRows = teams.successRates ?? teams.success_rates;
  const expectedTeams = [game.homeTeam, game.awayTeam] as const;
  const ppa = exactUniqueTeamMetric(ppaRows, expectedTeams, 'ppa');
  const success = exactUniqueTeamMetric(successRows, expectedTeams, 'success');

  const homePpa = ppa.get(game.homeTeam)!;
  const awayPpa = ppa.get(game.awayTeam)!;
  const homeSuccess = success.get(game.homeTeam)!;
  const awaySuccess = success.get(game.awayTeam)!;

  return new Map([
    [
      game.homeTeam,
      {
        team: game.homeTeam,
        opponent: game.awayTeam,
        offensePpa: homePpa,
        defensePpa: awayPpa,
        offenseSuccessRate: homeSuccess,
        defenseSuccessRate: awaySuccess,
      },
    ],
    [
      game.awayTeam,
      {
        team: game.awayTeam,
        opponent: game.homeTeam,
        offensePpa: awayPpa,
        defensePpa: homePpa,
        offenseSuccessRate: awaySuccess,
        defenseSuccessRate: homeSuccess,
      },
    ],
  ]);
}

export function compareHistoricalV2GameEquivalence(
  game: HistoricalV2CalibrationGame,
  bulk: Map<string, HistoricalV2TeamMetrics>,
  fallback: Map<string, HistoricalV2TeamMetrics>,
  tolerance = HISTORICAL_V2_SOURCE_EQUIVALENCE_TOLERANCE
): HistoricalV2GameEquivalence {
  const comparisons: HistoricalV2MetricComparison[] = [];
  const metricNames: HistoricalV2MetricComparison['metric'][] = [
    'offensePpa',
    'defensePpa',
    'offenseSuccessRate',
    'defenseSuccessRate',
  ];

  for (const team of [game.homeTeam, game.awayTeam]) {
    const bulkMetrics = bulk.get(team);
    const fallbackMetrics = fallback.get(team);
    if (!bulkMetrics || !fallbackMetrics) {
      throw new Error(`v2_equivalence_team_missing:${game.gameId}:${team}`);
    }
    if (
      bulkMetrics.opponent !== fallbackMetrics.opponent ||
      bulkMetrics.team !== fallbackMetrics.team
    ) {
      throw new Error(`v2_equivalence_team_identity_mismatch:${game.gameId}:${team}`);
    }

    for (const metric of metricNames) {
      const bulkValue = bulkMetrics[metric];
      const fallbackValue = fallbackMetrics[metric];
      const absoluteDifference = Math.abs(bulkValue - fallbackValue);
      comparisons.push({
        team,
        metric,
        bulk: bulkValue,
        fallback: fallbackValue,
        absoluteDifference,
        pass: absoluteDifference <= tolerance,
      });
    }
  }

  const maxAbsoluteDifference = Math.max(
    0,
    ...comparisons.map((comparison) => comparison.absoluteDifference)
  );

  return {
    season: game.season,
    gameId: game.gameId,
    week: game.week,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    comparisons,
    maxAbsoluteDifference,
    pass: comparisons.every((comparison) => comparison.pass),
  };
}

export function recoveredAdvancedRowsFromBox(
  payload: unknown,
  game: {
    season: 2024;
    gameId: number;
    week: number;
    homeTeam: string;
    awayTeam: string;
  }
): unknown[] {
  const metrics = parseAdvancedBoxCandidateMetrics(payload, game);
  return [game.homeTeam, game.awayTeam].map((team) => {
    const value = metrics.get(team);
    if (!value) throw new Error(`recovery_team_missing:${game.gameId}:${team}`);
    return {
      gameId: game.gameId,
      season: game.season,
      seasonType: 'regular',
      week: game.week,
      team: value.team,
      opponent: value.opponent,
      offense: {
        ppa: value.offensePpa,
        successRate: value.offenseSuccessRate,
      },
      defense: {
        ppa: value.defensePpa,
        successRate: value.defenseSuccessRate,
      },
      sourceProvenance: 'ADVANCED_BOX_EQUIVALENT_FALLBACK',
    };
  });
}
