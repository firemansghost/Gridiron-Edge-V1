import { createHash } from 'crypto';

export const HISTORICAL_SNAPSHOT_VERSION =
  'historical_research_snapshot_v1' as const;
export const HISTORICAL_SNAPSHOT_TARGET_SEASON = 2025 as const;
export const HISTORICAL_SNAPSHOT_DEVELOPMENT_SEASON = 2022 as const;
export const HISTORICAL_SNAPSHOT_AUTHORIZED_SEASONS = [
  HISTORICAL_SNAPSHOT_DEVELOPMENT_SEASON,
  HISTORICAL_SNAPSHOT_TARGET_SEASON,
] as const;
export const HISTORICAL_SNAPSHOT_SEASON_TYPE = 'regular' as const;
export const HISTORICAL_SNAPSHOT_MAX_PROVIDER_CALLS = 32 as const;
export const HISTORICAL_SNAPSHOT_RECRUITING_LOOKBACK = 4 as const;
export const HISTORICAL_SNAPSHOT_CONFIRMATION =
  'CAPTURE_2025_HISTORICAL_RESEARCH_SNAPSHOT_PREVIEW' as const;

export type HistoricalSnapshotRequestKind =
  | 'games'
  | 'lines'
  | 'advanced_game_stats'
  | 'ppa_games'
  | 'talent'
  | 'returning_production'
  | 'transfer_portal'
  | 'recruiting_team'
  | 'elo_preseason'
  | 'elo_week';

export interface HistoricalSnapshotRequest {
  id: string;
  kind: HistoricalSnapshotRequestKind;
  endpoint: string;
  query: Record<string, string>;
  week?: number;
  recruitingYear?: number;
}

export interface HistoricalGameLike {
  season?: unknown;
  week?: unknown;
  seasonType?: unknown;
  homeClassification?: unknown;
  awayClassification?: unknown;
  completed?: unknown;
  id?: unknown;
}

export interface HistoricalSnapshotPlan {
  season: number;
  observedFbsVsFbsRegularWeeks: number[];
  requests: HistoricalSnapshotRequest[];
  providerCallCount: number;
  maxProviderCalls: number;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function assertHistoricalSnapshotSeason(season: number): void {
  if (
    !(HISTORICAL_SNAPSHOT_AUTHORIZED_SEASONS as readonly number[]).includes(
      season
    )
  ) {
    throw new Error(
      `historical snapshot v1 season must be one of ${HISTORICAL_SNAPSHOT_AUTHORIZED_SEASONS.join(', ')}`
    );
  }
}

export function historicalSnapshotConfirmation(season: number): string {
  assertHistoricalSnapshotSeason(season);
  return `CAPTURE_${season}_HISTORICAL_RESEARCH_SNAPSHOT_PREVIEW`;
}

export function historicalSnapshotSeasonRole(season: number): string {
  assertHistoricalSnapshotSeason(season);
  if (season === HISTORICAL_SNAPSHOT_TARGET_SEASON) {
    return 'PIPELINE_VERIFICATION_COMPLETE_LOCKED_HOLDOUT_FOR_LATER_FINAL_TEST';
  }
  return 'DEVELOPMENT_CORPUS_CAPTURE_RESEARCH_ONLY_PENDING_AUDIT';
}

export function isFbsVsFbsRegularGame(
  row: HistoricalGameLike,
  season: number
): boolean {
  return (
    Number(row.season) === season &&
    text(row.seasonType) === HISTORICAL_SNAPSHOT_SEASON_TYPE &&
    text(row.homeClassification) === 'fbs' &&
    text(row.awayClassification) === 'fbs'
  );
}

export function deriveFbsVsFbsRegularWeeks(
  rows: HistoricalGameLike[],
  season: number
): number[] {
  assertHistoricalSnapshotSeason(season);
  return [
    ...new Set(
      rows
        .filter((row) => isFbsVsFbsRegularGame(row, season))
        .map((row) => positiveInt(row.week))
        .filter((week): week is number => week !== null)
    ),
  ].sort((a, b) => a - b);
}

export function countCompletedFbsVsFbsRegularGames(
  rows: HistoricalGameLike[],
  season: number
): number {
  assertHistoricalSnapshotSeason(season);
  return rows.filter(
    (row) => isFbsVsFbsRegularGame(row, season) && row.completed === true
  ).length;
}

function request(
  id: string,
  kind: HistoricalSnapshotRequestKind,
  endpoint: string,
  query: Record<string, string>,
  extra: Pick<HistoricalSnapshotRequest, 'week' | 'recruitingYear'> = {}
): HistoricalSnapshotRequest {
  return { id, kind, endpoint, query, ...extra };
}

export function buildHistoricalGamesRequest(
  season: number
): HistoricalSnapshotRequest {
  assertHistoricalSnapshotSeason(season);
  return request('games', 'games', '/games', {
    year: String(season),
    seasonType: HISTORICAL_SNAPSHOT_SEASON_TYPE,
    classification: 'fbs',
  });
}

export function buildHistoricalSnapshotPlan(
  season: number,
  gamesRows: HistoricalGameLike[]
): HistoricalSnapshotPlan {
  assertHistoricalSnapshotSeason(season);

  const weeks = deriveFbsVsFbsRegularWeeks(gamesRows, season);
  if (weeks.length === 0) {
    throw new Error('no FBS-vs-FBS regular-season weeks derived from games payload');
  }

  const requests: HistoricalSnapshotRequest[] = [
    buildHistoricalGamesRequest(season),
    request('lines', 'lines', '/lines', {
      year: String(season),
      seasonType: HISTORICAL_SNAPSHOT_SEASON_TYPE,
    }),
    request('advanced-game-stats', 'advanced_game_stats', '/stats/game/advanced', {
      year: String(season),
      seasonType: HISTORICAL_SNAPSHOT_SEASON_TYPE,
    }),
    request('ppa-games', 'ppa_games', '/ppa/games', {
      year: String(season),
      seasonType: HISTORICAL_SNAPSHOT_SEASON_TYPE,
      classification: 'fbs',
    }),
    request('talent', 'talent', '/talent', {
      year: String(season),
    }),
    request('returning-production', 'returning_production', '/player/returning', {
      year: String(season),
    }),
    request('transfer-portal', 'transfer_portal', '/player/portal', {
      year: String(season),
    }),
  ];

  const firstRecruitingYear =
    season - HISTORICAL_SNAPSHOT_RECRUITING_LOOKBACK + 1;
  for (let recruitingYear = firstRecruitingYear; recruitingYear <= season; recruitingYear += 1) {
    requests.push(
      request(
        `recruiting-teams-${recruitingYear}`,
        'recruiting_team',
        '/recruiting/teams',
        { year: String(recruitingYear) },
        { recruitingYear }
      )
    );
  }

  requests.push(
    request('elo-preseason', 'elo_preseason', '/ratings/elo', {
      year: String(season),
      seasonType: HISTORICAL_SNAPSHOT_SEASON_TYPE,
      preseason: 'true',
    })
  );

  for (const week of weeks) {
    requests.push(
      request(
        `elo-week-${String(week).padStart(2, '0')}`,
        'elo_week',
        '/ratings/elo',
        {
          year: String(season),
          seasonType: HISTORICAL_SNAPSHOT_SEASON_TYPE,
          week: String(week),
        },
        { week }
      )
    );
  }

  if (requests.length > HISTORICAL_SNAPSHOT_MAX_PROVIDER_CALLS) {
    throw new Error(
      `provider call budget exceeded: planned=${requests.length} max=${HISTORICAL_SNAPSHOT_MAX_PROVIDER_CALLS}`
    );
  }

  return {
    season,
    observedFbsVsFbsRegularWeeks: weeks,
    requests,
    providerCallCount: requests.length,
    maxProviderCalls: HISTORICAL_SNAPSHOT_MAX_PROVIDER_CALLS,
  };
}

export function buildCfbdUrl(
  baseUrl: string,
  requestSpec: HistoricalSnapshotRequest
): string {
  const url = new URL(`${baseUrl}${requestSpec.endpoint}`);
  for (const [key, value] of Object.entries(requestSpec.query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export function sha256Bytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function uniqueNumericIds(
  rows: unknown[],
  key: string
): number[] {
  const ids = new Set<number>();
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue;
    const value = (row as Record<string, unknown>)[key];
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) ids.add(n);
  }
  return [...ids].sort((a, b) => a - b);
}

export function countRowsWhere(
  rows: unknown[],
  predicate: (row: Record<string, unknown>) => boolean
): number {
  let count = 0;
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue;
    if (predicate(row as Record<string, unknown>)) count += 1;
  }
  return count;
}
