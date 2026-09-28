export const HISTORICAL_DEVELOPMENT_CORPUS_V1_VERSION =
  'historical_development_corpus_v1' as const;

export const HISTORICAL_DEVELOPMENT_CORPUS_V1_SEASONS = [2022, 2023] as const;

export const HISTORICAL_DEVELOPMENT_CORPUS_V1_EXPECTED = {
  2022: {
    canonicalGames: 734,
    canonicalTeams: 131,
    canonicalAdvancedTeamGames: 1468,
    canonicalPpaTeamGames: 1468,
    canonicalLineGames: 734,
    missingTalentTeams: [] as string[],
    missingReturningProductionTeams: ['James Madison'],
    missingPreseasonEloTeams: [] as string[],
    missingRecruitingTeamsByYear: {
      '2019': [] as string[],
      '2020': [] as string[],
      '2021': [] as string[],
      '2022': ['Florida International'],
    },
  },
  2023: {
    canonicalGames: 750,
    canonicalTeams: 133,
    canonicalAdvancedTeamGames: 1500,
    canonicalPpaTeamGames: 1500,
    canonicalLineGames: 750,
    missingTalentTeams: [] as string[],
    missingReturningProductionTeams: ['Jacksonville State', 'Sam Houston'],
    missingPreseasonEloTeams: [] as string[],
    missingRecruitingTeamsByYear: {
      '2020': [] as string[],
      '2021': [] as string[],
      '2022': ['Florida International'],
      '2023': [] as string[],
    },
  },
} as const;

type JsonObject = Record<string, unknown>;

export interface HistoricalDevelopmentSeasonSource {
  season: 2022 | 2023;
  games: unknown[];
  lines: unknown[];
  advanced: unknown[];
  ppa: unknown[];
  talent: unknown[];
  returningProduction: unknown[];
  recruitingByYear: Record<number, unknown[]>;
  eloPreseason: unknown[];
  eloByWeek: Record<number, unknown[]>;
}

export interface SourceAvailability {
  status: 'AVAILABLE' | 'SOURCE_ROW_UNAVAILABLE';
  row: unknown | null;
}

export interface EloSelection {
  status: 'AVAILABLE' | 'ELO_UNAVAILABLE';
  value: number | null;
  sourceRequestId: string;
  sourceWeek: number | null;
  row: unknown | null;
}

export interface PredictionFrame {
  season: number;
  gameId: number;
  week: number;
  startDate: string | null;
  homeTeam: string;
  awayTeam: string;
  neutralSite: boolean;
  homeElo: EloSelection;
  awayElo: EloSelection;
}

export interface StaticPriorRecord {
  season: number;
  team: string;
  talent: SourceAvailability;
  returningProduction: SourceAvailability;
  recruiting: Array<{
    year: number;
    status: 'AVAILABLE' | 'SOURCE_ROW_UNAVAILABLE';
    row: unknown | null;
  }>;
}

export interface HistorySourceRecord {
  rowId: string;
  season: number;
  week: number;
  gameId: number;
  team: string;
  row: unknown;
}

export interface HistoryEligibilityRecord {
  season: number;
  gameId: number;
  week: number;
  historyCutoffWeekExclusive: number;
  homeTeam: string;
  awayTeam: string;
  homeAdvancedRowIds: string[];
  awayAdvancedRowIds: string[];
  homePpaRowIds: string[];
  awayPpaRowIds: string[];
}

export interface OutcomeRecord {
  season: number;
  gameId: number;
  homeTeam: string;
  awayTeam: string;
  finalHomePoints: number;
  finalAwayPoints: number;
  homeMargin: number;
}

export interface MarketEvaluationRecord {
  season: number;
  gameId: number;
  status: 'AVAILABLE' | 'SOURCE_ROW_UNAVAILABLE';
  row: unknown | null;
}

export interface HistoricalDevelopmentSeasonCorpus {
  season: 2022 | 2023;
  gameFrames: PredictionFrame[];
  staticPriors: StaticPriorRecord[];
  advancedHistory: HistorySourceRecord[];
  ppaHistory: HistorySourceRecord[];
  historyEligibility: HistoryEligibilityRecord[];
  outcomes: OutcomeRecord[];
  marketEvaluation: MarketEvaluationRecord[];
  qa: {
    canonicalGames: number;
    canonicalTeams: number;
    canonicalAdvancedTeamGames: number;
    canonicalPpaTeamGames: number;
    canonicalLineGames: number;
    historyAdvancedRows: number;
    historyPpaRows: number;
    weekOneHistoryReferenceCount: number;
    sameWeekHistoryReferenceCount: number;
    missingTalentTeams: string[];
    missingReturningProductionTeams: string[];
    missingRecruitingTeamsByYear: Record<string, string[]>;
    missingPreseasonEloTeams: string[];
  };
}

export interface HistoricalDevelopmentCorpus {
  version: typeof HISTORICAL_DEVELOPMENT_CORPUS_V1_VERSION;
  seasons: [2022, 2023];
  gameFrames: PredictionFrame[];
  staticPriors: StaticPriorRecord[];
  advancedHistory: HistorySourceRecord[];
  ppaHistory: HistorySourceRecord[];
  historyEligibility: HistoryEligibilityRecord[];
  outcomes: OutcomeRecord[];
  marketEvaluation: MarketEvaluationRecord[];
  qa: {
    canonicalGames: number;
    canonicalTeamsBySeason: Record<string, number>;
    historyAdvancedRows: number;
    historyPpaRows: number;
    weekOneHistoryReferenceCount: number;
    sameWeekHistoryReferenceCount: number;
    seasonQa: Record<string, HistoricalDevelopmentSeasonCorpus['qa']>;
  };
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function integer(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function lexicalCompare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareGameObjects(left: JsonObject, right: JsonObject): number {
  const leftWeek = integer(left.week) ?? Number.MAX_SAFE_INTEGER;
  const rightWeek = integer(right.week) ?? Number.MAX_SAFE_INTEGER;
  if (leftWeek !== rightWeek) return leftWeek - rightWeek;

  const leftStart = stringValue(left.startDate) ?? '';
  const rightStart = stringValue(right.startDate) ?? '';
  const startCmp = lexicalCompare(leftStart, rightStart);
  if (startCmp !== 0) return startCmp;

  return (integer(left.id) ?? 0) - (integer(right.id) ?? 0);
}

function isCompletedRegularGame(row: JsonObject, season: number): boolean {
  return (
    integer(row.season) === season &&
    row.seasonType === 'regular' &&
    row.completed === true
  );
}

function isCanonicalGame(row: JsonObject, season: number): boolean {
  return (
    isCompletedRegularGame(row, season) &&
    row.homeClassification === 'fbs' &&
    row.awayClassification === 'fbs'
  );
}

function requireGameIdentity(row: JsonObject): {
  gameId: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
} {
  const gameId = integer(row.id);
  const week = integer(row.week);
  const homeTeam = stringValue(row.homeTeam);
  const awayTeam = stringValue(row.awayTeam);
  if (
    gameId === null ||
    gameId <= 0 ||
    week === null ||
    week <= 0 ||
    !homeTeam ||
    !awayTeam
  ) {
    throw new Error('invalid_game_identity');
  }
  return { gameId, week, homeTeam, awayTeam };
}

function exactTeamIndex(
  rows: unknown[],
  key: string,
  label: string
): Map<string, unknown> {
  const result = new Map<string, unknown>();
  for (const row of rows) {
    const obj = asObject(row);
    const team = obj ? stringValue(obj[key]) : null;
    if (!team) continue;
    if (result.has(team)) {
      throw new Error(`duplicate_${label}_team:${team}`);
    }
    result.set(team, row);
  }
  return result;
}

function exactGameIndex(
  rows: unknown[],
  idKey: string,
  label: string
): Map<number, unknown> {
  const result = new Map<number, unknown>();
  for (const row of rows) {
    const obj = asObject(row);
    const id = obj ? integer(obj[idKey]) : null;
    if (id === null || id <= 0) continue;
    if (result.has(id)) {
      throw new Error(`duplicate_${label}_game:${id}`);
    }
    result.set(id, row);
  }
  return result;
}

function historyRowId(
  kind: 'advanced' | 'ppa',
  season: number,
  gameId: number,
  team: string
): string {
  return `${kind}:${season}:${gameId}:${team}`;
}

function buildHistorySources(
  kind: 'advanced' | 'ppa',
  rows: unknown[],
  season: number,
  canonicalTeams: Set<string>,
  completedGameById: Map<number, JsonObject>
): HistorySourceRecord[] {
  const result: HistorySourceRecord[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const obj = asObject(row);
    if (!obj) continue;

    const gameId = integer(obj.gameId);
    const week = integer(obj.week);
    const team = stringValue(obj.team);
    if (gameId === null || week === null || !team) continue;
    if (integer(obj.season) !== season || obj.seasonType !== 'regular') continue;
    if (!canonicalTeams.has(team)) continue;

    const game = completedGameById.get(gameId);
    if (!game) continue;

    const identity = requireGameIdentity(game);
    if (identity.week !== week) {
      throw new Error(`${kind}_week_mismatch:${gameId}:${team}`);
    }
    if (team !== identity.homeTeam && team !== identity.awayTeam) {
      throw new Error(`${kind}_team_not_participant:${gameId}:${team}`);
    }

    const rowId = historyRowId(kind, season, gameId, team);
    if (seen.has(rowId)) {
      throw new Error(`duplicate_${kind}_team_game:${gameId}:${team}`);
    }
    seen.add(rowId);
    result.push({ rowId, season, week, gameId, team, row });
  }

  result.sort((left, right) => {
    if (left.week !== right.week) return left.week - right.week;
    if (left.gameId !== right.gameId) return left.gameId - right.gameId;
    return lexicalCompare(left.team, right.team);
  });

  return result;
}

function groupHistoryByTeam(
  rows: HistorySourceRecord[]
): Map<string, HistorySourceRecord[]> {
  const grouped = new Map<string, HistorySourceRecord[]>();
  for (const row of rows) {
    const existing = grouped.get(row.team) ?? [];
    existing.push(row);
    grouped.set(row.team, existing);
  }
  return grouped;
}

function selectElo(
  team: string,
  targetWeek: number,
  preseasonIndex: Map<string, unknown>,
  weeklyIndexes: Map<number, Map<string, unknown>>
): EloSelection {
  const sourceWeek = targetWeek === 1 ? null : targetWeek - 1;
  const sourceRequestId =
    sourceWeek === null
      ? 'elo-preseason'
      : `elo-week-${String(sourceWeek).padStart(2, '0')}`;
  const row =
    sourceWeek === null
      ? preseasonIndex.get(team) ?? null
      : weeklyIndexes.get(sourceWeek)?.get(team) ?? null;
  const obj = asObject(row);
  const value = obj ? finiteNumber(obj.elo) : null;

  if (row === null || value === null) {
    return {
      status: 'ELO_UNAVAILABLE',
      value: null,
      sourceRequestId,
      sourceWeek,
      row,
    };
  }

  return {
    status: 'AVAILABLE',
    value,
    sourceRequestId,
    sourceWeek,
    row,
  };
}

function expectedForSeason(season: 2022 | 2023) {
  return HISTORICAL_DEVELOPMENT_CORPUS_V1_EXPECTED[season];
}

function expectedRecruitingYears(season: 2022 | 2023): number[] {
  return [season - 3, season - 2, season - 1, season];
}

export function buildHistoricalDevelopmentSeasonCorpus(
  source: HistoricalDevelopmentSeasonSource
): HistoricalDevelopmentSeasonCorpus {
  const { season } = source;
  if (!HISTORICAL_DEVELOPMENT_CORPUS_V1_SEASONS.includes(season)) {
    throw new Error('historical_development_corpus_v1_season_not_authorized');
  }

  const gameObjects = source.games
    .map(asObject)
    .filter((row): row is JsonObject => row !== null);
  const canonicalGameObjects = gameObjects
    .filter((row) => isCanonicalGame(row, season))
    .sort(compareGameObjects);

  const canonicalGameIds = new Set<number>();
  const canonicalTeams = new Set<string>();
  for (const game of canonicalGameObjects) {
    const identity = requireGameIdentity(game);
    if (canonicalGameIds.has(identity.gameId)) {
      throw new Error(`duplicate_canonical_game:${identity.gameId}`);
    }
    canonicalGameIds.add(identity.gameId);
    canonicalTeams.add(identity.homeTeam);
    canonicalTeams.add(identity.awayTeam);
  }

  const expected = expectedForSeason(season);
  if (canonicalGameObjects.length !== expected.canonicalGames) {
    throw new Error(
      `canonical_game_count_mismatch:${season}:${canonicalGameObjects.length}`
    );
  }
  if (canonicalTeams.size !== expected.canonicalTeams) {
    throw new Error(
      `canonical_team_count_mismatch:${season}:${canonicalTeams.size}`
    );
  }

  const completedGameById = new Map<number, JsonObject>();
  for (const game of gameObjects) {
    if (!isCompletedRegularGame(game, season)) continue;
    const { gameId } = requireGameIdentity(game);
    if (completedGameById.has(gameId)) {
      throw new Error(`duplicate_completed_game:${gameId}`);
    }
    completedGameById.set(gameId, game);
  }

  const lineByGame = exactGameIndex(source.lines, 'id', 'line');
  const talentByTeam = exactTeamIndex(source.talent, 'team', 'talent');
  const returningByTeam = exactTeamIndex(
    source.returningProduction,
    'team',
    'returning_production'
  );
  const recruitingByYear = new Map<number, Map<string, unknown>>();
  for (const year of expectedRecruitingYears(season)) {
    recruitingByYear.set(
      year,
      exactTeamIndex(
        source.recruitingByYear[year] ?? [],
        'team',
        `recruiting_${year}`
      )
    );
  }

  const eloPreseasonByTeam = exactTeamIndex(
    source.eloPreseason,
    'team',
    'elo_preseason'
  );
  const eloWeeklyIndexes = new Map<number, Map<string, unknown>>();
  for (const [weekText, rows] of Object.entries(source.eloByWeek)) {
    const week = Number(weekText);
    if (!Number.isInteger(week) || week <= 0) continue;
    eloWeeklyIndexes.set(
      week,
      exactTeamIndex(rows, 'team', `elo_week_${week}`)
    );
  }

  const advancedHistory = buildHistorySources(
    'advanced',
    source.advanced,
    season,
    canonicalTeams,
    completedGameById
  );
  const ppaHistory = buildHistorySources(
    'ppa',
    source.ppa,
    season,
    canonicalTeams,
    completedGameById
  );
  const advancedByTeam = groupHistoryByTeam(advancedHistory);
  const ppaByTeam = groupHistoryByTeam(ppaHistory);

  const staticPriors: StaticPriorRecord[] = [...canonicalTeams]
    .sort(lexicalCompare)
    .map((team) => ({
      season,
      team,
      talent: {
        status: talentByTeam.has(team) ? 'AVAILABLE' : 'SOURCE_ROW_UNAVAILABLE',
        row: talentByTeam.get(team) ?? null,
      },
      returningProduction: {
        status: returningByTeam.has(team)
          ? 'AVAILABLE'
          : 'SOURCE_ROW_UNAVAILABLE',
        row: returningByTeam.get(team) ?? null,
      },
      recruiting: expectedRecruitingYears(season).map((year) => {
        const row = recruitingByYear.get(year)?.get(team) ?? null;
        return {
          year,
          status: row === null ? 'SOURCE_ROW_UNAVAILABLE' : 'AVAILABLE',
          row,
        };
      }),
    }));

  const gameFrames: PredictionFrame[] = [];
  const historyEligibility: HistoryEligibilityRecord[] = [];
  const outcomes: OutcomeRecord[] = [];
  const marketEvaluation: MarketEvaluationRecord[] = [];
  let weekOneHistoryReferenceCount = 0;
  let sameWeekHistoryReferenceCount = 0;

  for (const game of canonicalGameObjects) {
    const { gameId, week, homeTeam, awayTeam } = requireGameIdentity(game);
    const startDate = stringValue(game.startDate);
    const neutralSite = game.neutralSite === true;

    gameFrames.push({
      season,
      gameId,
      week,
      startDate,
      homeTeam,
      awayTeam,
      neutralSite,
      homeElo: selectElo(
        homeTeam,
        week,
        eloPreseasonByTeam,
        eloWeeklyIndexes
      ),
      awayElo: selectElo(
        awayTeam,
        week,
        eloPreseasonByTeam,
        eloWeeklyIndexes
      ),
    });

    const eligibleRows = (
      grouped: Map<string, HistorySourceRecord[]>,
      team: string
    ): HistorySourceRecord[] =>
      (grouped.get(team) ?? []).filter((row) => row.week < week);

    const homeAdvanced = eligibleRows(advancedByTeam, homeTeam);
    const awayAdvanced = eligibleRows(advancedByTeam, awayTeam);
    const homePpa = eligibleRows(ppaByTeam, homeTeam);
    const awayPpa = eligibleRows(ppaByTeam, awayTeam);

    const allRefs = [...homeAdvanced, ...awayAdvanced, ...homePpa, ...awayPpa];
    if (week === 1) weekOneHistoryReferenceCount += allRefs.length;
    sameWeekHistoryReferenceCount += allRefs.filter(
      (row) => row.week >= week
    ).length;

    historyEligibility.push({
      season,
      gameId,
      week,
      historyCutoffWeekExclusive: week,
      homeTeam,
      awayTeam,
      homeAdvancedRowIds: homeAdvanced.map((row) => row.rowId),
      awayAdvancedRowIds: awayAdvanced.map((row) => row.rowId),
      homePpaRowIds: homePpa.map((row) => row.rowId),
      awayPpaRowIds: awayPpa.map((row) => row.rowId),
    });

    const homePoints = finiteNumber(game.homePoints);
    const awayPoints = finiteNumber(game.awayPoints);
    if (homePoints === null || awayPoints === null) {
      throw new Error(`completed_game_score_unavailable:${season}:${gameId}`);
    }
    outcomes.push({
      season,
      gameId,
      homeTeam,
      awayTeam,
      finalHomePoints: homePoints,
      finalAwayPoints: awayPoints,
      homeMargin: homePoints - awayPoints,
    });

    const marketRow = lineByGame.get(gameId) ?? null;
    marketEvaluation.push({
      season,
      gameId,
      status: marketRow === null ? 'SOURCE_ROW_UNAVAILABLE' : 'AVAILABLE',
      row: marketRow,
    });
  }

  const canonicalAdvancedTeamGames = advancedHistory.filter((row) =>
    canonicalGameIds.has(row.gameId)
  ).length;
  const canonicalPpaTeamGames = ppaHistory.filter((row) =>
    canonicalGameIds.has(row.gameId)
  ).length;
  const canonicalLineGames = marketEvaluation.filter(
    (row) => row.status === 'AVAILABLE'
  ).length;

  if (
    canonicalAdvancedTeamGames !== expected.canonicalAdvancedTeamGames ||
    canonicalPpaTeamGames !== expected.canonicalPpaTeamGames ||
    canonicalLineGames !== expected.canonicalLineGames
  ) {
    throw new Error(`canonical_source_coverage_mismatch:${season}`);
  }
  if (weekOneHistoryReferenceCount !== 0 || sameWeekHistoryReferenceCount !== 0) {
    throw new Error(`history_temporal_gate_failed:${season}`);
  }

  const missingTalentTeams = staticPriors
    .filter((row) => row.talent.status !== 'AVAILABLE')
    .map((row) => row.team);
  const missingReturningProductionTeams = staticPriors
    .filter((row) => row.returningProduction.status !== 'AVAILABLE')
    .map((row) => row.team);
  const missingRecruitingTeamsByYear: Record<string, string[]> = {};
  for (const year of expectedRecruitingYears(season)) {
    missingRecruitingTeamsByYear[String(year)] = staticPriors
      .filter(
        (row) =>
          row.recruiting.find((item) => item.year === year)?.status !==
          'AVAILABLE'
      )
      .map((row) => row.team);
  }
  const missingPreseasonEloTeams = [...canonicalTeams]
    .filter((team) => !eloPreseasonByTeam.has(team))
    .sort(lexicalCompare);

  const sameStrings = (left: string[], right: readonly string[]): boolean =>
    left.length === right.length &&
    left.every((value, index) => value === right[index]);

  if (!sameStrings(missingTalentTeams, expected.missingTalentTeams)) {
    throw new Error(`talent_missingness_mismatch:${season}`);
  }
  if (
    !sameStrings(
      missingReturningProductionTeams,
      expected.missingReturningProductionTeams
    )
  ) {
    throw new Error(`returning_production_missingness_mismatch:${season}`);
  }
  if (
    !sameStrings(missingPreseasonEloTeams, expected.missingPreseasonEloTeams)
  ) {
    throw new Error(`preseason_elo_missingness_mismatch:${season}`);
  }
  for (const year of expectedRecruitingYears(season)) {
    const actual = missingRecruitingTeamsByYear[String(year)] ?? [];
    const frozen =
      expected.missingRecruitingTeamsByYear[
        String(year) as keyof typeof expected.missingRecruitingTeamsByYear
      ] ?? [];
    if (!sameStrings(actual, frozen)) {
      throw new Error(`recruiting_missingness_mismatch:${season}:${year}`);
    }
  }

  return {
    season,
    gameFrames,
    staticPriors,
    advancedHistory,
    ppaHistory,
    historyEligibility,
    outcomes,
    marketEvaluation,
    qa: {
      canonicalGames: canonicalGameObjects.length,
      canonicalTeams: canonicalTeams.size,
      canonicalAdvancedTeamGames,
      canonicalPpaTeamGames,
      canonicalLineGames,
      historyAdvancedRows: advancedHistory.length,
      historyPpaRows: ppaHistory.length,
      weekOneHistoryReferenceCount,
      sameWeekHistoryReferenceCount,
      missingTalentTeams,
      missingReturningProductionTeams,
      missingRecruitingTeamsByYear,
      missingPreseasonEloTeams,
    },
  };
}

const FORBIDDEN_PREDICTIVE_KEYS = new Set([
  'homePoints',
  'awayPoints',
  'homeScore',
  'awayScore',
  'homeLineScores',
  'awayLineScores',
  'homePostgameWinProbability',
  'awayPostgameWinProbability',
  'homePregameElo',
  'awayPregameElo',
  'homePostgameElo',
  'awayPostgameElo',
  'lines',
  'spread',
  'formattedSpread',
  'spreadOpen',
  'overUnder',
  'overUnderOpen',
  'homeMoneyline',
  'awayMoneyline',
]);

function assertNoForbiddenPredictiveKeys(
  value: unknown,
  pathLabel = 'predictive'
): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertNoForbiddenPredictiveKeys(value[index], `${pathLabel}[${index}]`);
    }
    return;
  }

  const obj = asObject(value);
  if (!obj) return;

  for (const [key, child] of Object.entries(obj)) {
    if (FORBIDDEN_PREDICTIVE_KEYS.has(key)) {
      throw new Error(`forbidden_predictive_key:${key}:${pathLabel}`);
    }
    assertNoForbiddenPredictiveKeys(child, `${pathLabel}.${key}`);
  }
}

export function buildHistoricalDevelopmentCorpus(
  sources: HistoricalDevelopmentSeasonSource[]
): HistoricalDevelopmentCorpus {
  const bySeason = new Map<number, HistoricalDevelopmentSeasonSource>();
  for (const source of sources) {
    if (bySeason.has(source.season)) {
      throw new Error(`duplicate_corpus_source_season:${source.season}`);
    }
    bySeason.set(source.season, source);
  }

  const season2022 = bySeason.get(2022);
  const season2023 = bySeason.get(2023);
  if (!season2022 || !season2023) {
    throw new Error('historical_development_corpus_v1_requires_2022_and_2023');
  }

  const built = [
    buildHistoricalDevelopmentSeasonCorpus(season2022),
    buildHistoricalDevelopmentSeasonCorpus(season2023),
  ];

  const gameFrames = built.flatMap((season) => season.gameFrames);
  const staticPriors = built.flatMap((season) => season.staticPriors);
  const advancedHistory = built.flatMap((season) => season.advancedHistory);
  const ppaHistory = built.flatMap((season) => season.ppaHistory);
  const historyEligibility = built.flatMap(
    (season) => season.historyEligibility
  );
  const outcomes = built.flatMap((season) => season.outcomes);
  const marketEvaluation = built.flatMap(
    (season) => season.marketEvaluation
  );

  if (gameFrames.length !== 1484 || outcomes.length !== 1484) {
    throw new Error('combined_canonical_game_count_mismatch');
  }

  assertNoForbiddenPredictiveKeys({
    gameFrames,
    staticPriors,
    advancedHistory,
    ppaHistory,
    historyEligibility,
  });

  return {
    version: HISTORICAL_DEVELOPMENT_CORPUS_V1_VERSION,
    seasons: [2022, 2023],
    gameFrames,
    staticPriors,
    advancedHistory,
    ppaHistory,
    historyEligibility,
    outcomes,
    marketEvaluation,
    qa: {
      canonicalGames: gameFrames.length,
      canonicalTeamsBySeason: {
        '2022': built[0].qa.canonicalTeams,
        '2023': built[1].qa.canonicalTeams,
      },
      historyAdvancedRows: advancedHistory.length,
      historyPpaRows: ppaHistory.length,
      weekOneHistoryReferenceCount: built.reduce(
        (sum, season) => sum + season.qa.weekOneHistoryReferenceCount,
        0
      ),
      sameWeekHistoryReferenceCount: built.reduce(
        (sum, season) => sum + season.qa.sameWeekHistoryReferenceCount,
        0
      ),
      seasonQa: {
        '2022': built[0].qa,
        '2023': built[1].qa,
      },
    },
  };
}
