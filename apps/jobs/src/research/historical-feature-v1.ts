export const HISTORICAL_FEATURE_V1_VERSION =
  'historical_feature_v1' as const;

export const HISTORICAL_FEATURE_V1_EXPECTED_GAMES = {
  2022: 734,
  2023: 750,
} as const;

export const HISTORICAL_FEATURE_V1_EXPECTED_TEAMS = {
  2022: 131,
  2023: 133,
} as const;

export type HistoricalFeatureStatus =
  | 'AVAILABLE'
  | 'SOURCE_ROW_UNAVAILABLE'
  | 'FIELD_VALUE_UNAVAILABLE'
  | 'NO_PRIOR_FBS_GAMES';

export interface HistoricalNumericFeature {
  value: number | null;
  status: HistoricalFeatureStatus;
  n: number | null;
}

export interface HistoricalTeamFeatureBundle {
  eloRaw: HistoricalNumericFeature;
  talentRaw: HistoricalNumericFeature;
  returningPercentPPA: HistoricalNumericFeature;
  recruitingPointsY0: HistoricalNumericFeature;
  recruitingPointsY1: HistoricalNumericFeature;
  recruitingPointsY2: HistoricalNumericFeature;
  recruitingPointsY3: HistoricalNumericFeature;
  priorFbsGames: HistoricalNumericFeature;
  ppaOffMean: HistoricalNumericFeature;
  ppaDefMean: HistoricalNumericFeature;
  ppaNet: HistoricalNumericFeature;
  successOffMean: HistoricalNumericFeature;
  successDefMean: HistoricalNumericFeature;
  successNet: HistoricalNumericFeature;
}

export interface HistoricalFeatureGameRow {
  season: 2022 | 2023;
  gameId: number;
  week: number;
  startDate: string | null;
  homeTeam: string;
  awayTeam: string;
  neutralSite: boolean;
  home: HistoricalTeamFeatureBundle;
  away: HistoricalTeamFeatureBundle;
}

export interface HistoricalFeatureV1Input {
  gameFrames: unknown[];
  staticPriors: unknown[];
  advancedHistory: unknown[];
  historyEligibility: unknown[];
}

export interface HistoricalFeatureV1Qa {
  gameRows: number;
  seasonRows: Record<'2022' | '2023', number>;
  teamSides: number;
  staticPriorRows: number;
  advancedHistoryRows: number;
  zeroPriorFbsGameSides: number;
  fbsVsFcsReferencesExcluded: number;
  canonicalHistoryReferencesUsed: number;
  sameWeekOrLaterReferences: number;
  duplicateTargetKeys: number;
  missingTalentTeams: Record<'2022' | '2023', string[]>;
  missingReturningProductionTeams: Record<'2022' | '2023', string[]>;
  missingRecruitingTeamsByYear: Record<'2022' | '2023', Record<string, string[]>>;
  availabilityCounts: Record<string, Record<HistoricalFeatureStatus, number>>;
  observationCountDistributions: Record<string, Record<string, number>>;
}

export interface HistoricalFeatureV1Build {
  version: typeof HISTORICAL_FEATURE_V1_VERSION;
  rows: HistoricalFeatureGameRow[];
  qa: HistoricalFeatureV1Qa;
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

function lexicalCompare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function feature(
  value: number | null,
  status: HistoricalFeatureStatus,
  n: number | null
): HistoricalNumericFeature {
  if (status === 'AVAILABLE' && value === null) {
    throw new Error('available_feature_requires_finite_value');
  }
  if (status !== 'AVAILABLE' && value !== null) {
    throw new Error('unavailable_feature_must_be_null');
  }
  return { value, status, n };
}

function available(value: number, n: number | null = null): HistoricalNumericFeature {
  if (!Number.isFinite(value)) throw new Error('feature_value_nonfinite');
  return feature(value, 'AVAILABLE', n);
}

function unavailable(
  status: Exclude<HistoricalFeatureStatus, 'AVAILABLE'>,
  n: number | null = null
): HistoricalNumericFeature {
  return feature(null, status, n);
}

function key(season: number, value: string | number): string {
  return `${season}:${value}`;
}

function parseGameFrame(row: unknown): {
  season: 2022 | 2023;
  gameId: number;
  week: number;
  startDate: string | null;
  homeTeam: string;
  awayTeam: string;
  neutralSite: boolean;
  homeElo: JsonObject;
  awayElo: JsonObject;
} {
  const obj = asObject(row);
  if (!obj) throw new Error('invalid_game_frame');

  const season = integer(obj.season);
  const gameId = integer(obj.gameId);
  const week = integer(obj.week);
  const homeTeam = stringValue(obj.homeTeam);
  const awayTeam = stringValue(obj.awayTeam);
  const homeElo = asObject(obj.homeElo);
  const awayElo = asObject(obj.awayElo);

  if (
    (season !== 2022 && season !== 2023) ||
    gameId === null ||
    gameId <= 0 ||
    week === null ||
    week <= 0 ||
    !homeTeam ||
    !awayTeam ||
    !homeElo ||
    !awayElo
  ) {
    throw new Error('invalid_game_frame_identity');
  }

  return {
    season,
    gameId,
    week,
    startDate: stringValue(obj.startDate),
    homeTeam,
    awayTeam,
    neutralSite: obj.neutralSite === true,
    homeElo,
    awayElo,
  };
}

function eloFeature(elo: JsonObject): HistoricalNumericFeature {
  const sourceStatus = stringValue(elo.status);
  const row = asObject(elo.row);
  const value = finiteNumber(elo.value);

  if (sourceStatus === 'AVAILABLE' && value !== null) {
    return available(value, 1);
  }
  if (!row) return unavailable('SOURCE_ROW_UNAVAILABLE', 0);
  return unavailable('FIELD_VALUE_UNAVAILABLE', 0);
}

function staticNumericFeature(options: {
  source: unknown;
  field: string;
}): HistoricalNumericFeature {
  const source = asObject(options.source);
  if (!source) return unavailable('SOURCE_ROW_UNAVAILABLE', 0);

  const status = stringValue(source.status);
  const row = asObject(source.row);
  if (status !== 'AVAILABLE' || !row) {
    return unavailable('SOURCE_ROW_UNAVAILABLE', 0);
  }

  const value = finiteNumber(row[options.field]);
  if (value === null) return unavailable('FIELD_VALUE_UNAVAILABLE', 0);
  return available(value, 1);
}

function recruitingFeature(
  recruiting: unknown,
  year: number
): HistoricalNumericFeature {
  if (!Array.isArray(recruiting)) {
    return unavailable('SOURCE_ROW_UNAVAILABLE', 0);
  }

  const candidates = recruiting.filter((entry) => {
    const obj = asObject(entry);
    return obj && integer(obj.year) === year;
  });

  if (candidates.length !== 1) {
    if (candidates.length > 1) {
      throw new Error(`duplicate_recruiting_year:${year}`);
    }
    return unavailable('SOURCE_ROW_UNAVAILABLE', 0);
  }

  return staticNumericFeature({
    source: candidates[0],
    field: 'points',
  });
}

function meanFeature(
  values: Array<number | null>,
  priorGames: number
): HistoricalNumericFeature {
  if (priorGames === 0) return unavailable('NO_PRIOR_FBS_GAMES', 0);
  const finite = values.filter((value): value is number => value !== null);
  if (finite.length === 0) return unavailable('FIELD_VALUE_UNAVAILABLE', 0);
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  return available(mean, finite.length);
}

function netFeature(
  offense: HistoricalNumericFeature,
  defense: HistoricalNumericFeature,
  priorGames: number
): HistoricalNumericFeature {
  if (priorGames === 0) return unavailable('NO_PRIOR_FBS_GAMES', null);
  if (
    offense.status !== 'AVAILABLE' ||
    defense.status !== 'AVAILABLE' ||
    offense.value === null ||
    defense.value === null
  ) {
    return unavailable('FIELD_VALUE_UNAVAILABLE', null);
  }
  return available(offense.value - defense.value, null);
}

function incrementAvailability(
  result: Record<string, Record<HistoricalFeatureStatus, number>>,
  featureName: string,
  value: HistoricalNumericFeature
): void {
  if (!result[featureName]) {
    result[featureName] = {
      AVAILABLE: 0,
      SOURCE_ROW_UNAVAILABLE: 0,
      FIELD_VALUE_UNAVAILABLE: 0,
      NO_PRIOR_FBS_GAMES: 0,
    };
  }
  result[featureName][value.status] += 1;
}

function incrementDistribution(
  result: Record<string, Record<string, number>>,
  featureName: string,
  n: number | null
): void {
  const label = n === null ? 'null' : String(n);
  if (!result[featureName]) result[featureName] = {};
  result[featureName][label] = (result[featureName][label] ?? 0) + 1;
}

function expectedRecruitingMissing(): Record<
  '2022' | '2023',
  Record<string, string[]>
> {
  return {
    '2022': {
      '2019': [],
      '2020': [],
      '2021': [],
      '2022': ['Florida International'],
    },
    '2023': {
      '2020': [],
      '2021': [],
      '2022': ['Florida International'],
      '2023': [],
    },
  };
}

function sameStrings(left: string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

const FORBIDDEN_OUTPUT_KEYS = new Set([
  'homePoints',
  'awayPoints',
  'finalHomePoints',
  'finalAwayPoints',
  'homeMargin',
  'winner',
  'spread',
  'formattedSpread',
  'spreadOpen',
  'overUnder',
  'overUnderOpen',
  'homeMoneyline',
  'awayMoneyline',
  'homePregameElo',
  'awayPregameElo',
  'homePostgameElo',
  'awayPostgameElo',
  'zScore',
  'zElo',
  'edge',
  'prediction',
  'modelHomeMargin',
]);

function assertNoForbiddenOutputKeys(value: unknown, label = 'feature'): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertNoForbiddenOutputKeys(value[index], `${label}[${index}]`);
    }
    return;
  }

  const obj = asObject(value);
  if (!obj) return;

  for (const [entryKey, child] of Object.entries(obj)) {
    if (FORBIDDEN_OUTPUT_KEYS.has(entryKey)) {
      throw new Error(`forbidden_feature_output_key:${entryKey}:${label}`);
    }
    assertNoForbiddenOutputKeys(child, `${label}.${entryKey}`);
  }
}

export function buildHistoricalFeatureV1(
  input: HistoricalFeatureV1Input
): HistoricalFeatureV1Build {
  if (
    input.gameFrames.length !== 1484 ||
    input.staticPriors.length !== 264 ||
    input.advancedHistory.length !== 3206 ||
    input.historyEligibility.length !== 1484
  ) {
    throw new Error('historical_feature_v1_source_count_mismatch');
  }

  const frames = input.gameFrames.map(parseGameFrame);
  frames.sort((left, right) => {
    if (left.season !== right.season) return left.season - right.season;
    if (left.week !== right.week) return left.week - right.week;
    const leftStart = left.startDate ?? '';
    const rightStart = right.startDate ?? '';
    const startCmp = lexicalCompare(leftStart, rightStart);
    if (startCmp !== 0) return startCmp;
    return left.gameId - right.gameId;
  });

  const targetKeys = new Set<string>();
  const canonicalGameIdsBySeason = new Map<number, Set<number>>();
  const canonicalTeamsBySeason = new Map<number, Set<string>>();
  let duplicateTargetKeys = 0;
  const seasonRows: Record<'2022' | '2023', number> = {
    '2022': 0,
    '2023': 0,
  };

  for (const frame of frames) {
    const targetKey = key(frame.season, frame.gameId);
    if (targetKeys.has(targetKey)) {
      duplicateTargetKeys += 1;
      continue;
    }
    targetKeys.add(targetKey);
    seasonRows[String(frame.season) as '2022' | '2023'] += 1;

    const gameSet = canonicalGameIdsBySeason.get(frame.season) ?? new Set<number>();
    gameSet.add(frame.gameId);
    canonicalGameIdsBySeason.set(frame.season, gameSet);

    const teamSet = canonicalTeamsBySeason.get(frame.season) ?? new Set<string>();
    teamSet.add(frame.homeTeam);
    teamSet.add(frame.awayTeam);
    canonicalTeamsBySeason.set(frame.season, teamSet);
  }

  if (
    duplicateTargetKeys !== 0 ||
    seasonRows['2022'] !== HISTORICAL_FEATURE_V1_EXPECTED_GAMES[2022] ||
    seasonRows['2023'] !== HISTORICAL_FEATURE_V1_EXPECTED_GAMES[2023] ||
    canonicalTeamsBySeason.get(2022)?.size !==
      HISTORICAL_FEATURE_V1_EXPECTED_TEAMS[2022] ||
    canonicalTeamsBySeason.get(2023)?.size !==
      HISTORICAL_FEATURE_V1_EXPECTED_TEAMS[2023]
  ) {
    throw new Error('historical_feature_v1_target_universe_mismatch');
  }

  const priorByTeam = new Map<string, JsonObject>();
  for (const raw of input.staticPriors) {
    const obj = asObject(raw);
    const season = obj ? integer(obj.season) : null;
    const team = obj ? stringValue(obj.team) : null;
    if ((season !== 2022 && season !== 2023) || !team) {
      throw new Error('invalid_static_prior_identity');
    }
    const priorKey = key(season, team);
    if (priorByTeam.has(priorKey)) {
      throw new Error(`duplicate_static_prior:${priorKey}`);
    }
    priorByTeam.set(priorKey, obj);
  }

  const expectedStaticPriorKeys = new Set<string>();
  for (const [season, teams] of canonicalTeamsBySeason.entries()) {
    for (const team of teams) expectedStaticPriorKeys.add(key(season, team));
  }
  if (
    priorByTeam.size !== expectedStaticPriorKeys.size ||
    [...expectedStaticPriorKeys].some((entry) => !priorByTeam.has(entry))
  ) {
    throw new Error('static_prior_team_universe_mismatch');
  }

  const historyById = new Map<string, JsonObject>();
  for (const raw of input.advancedHistory) {
    const obj = asObject(raw);
    const rowId = obj ? stringValue(obj.rowId) : null;
    if (!obj || !rowId) throw new Error('invalid_advanced_history_row');
    if (historyById.has(rowId)) throw new Error(`duplicate_history_row_id:${rowId}`);
    historyById.set(rowId, obj);
  }

  const eligibilityByGame = new Map<string, JsonObject>();
  for (const raw of input.historyEligibility) {
    const obj = asObject(raw);
    const season = obj ? integer(obj.season) : null;
    const gameId = obj ? integer(obj.gameId) : null;
    if ((season !== 2022 && season !== 2023) || gameId === null) {
      throw new Error('invalid_history_eligibility_identity');
    }
    const eligibilityKey = key(season, gameId);
    if (eligibilityByGame.has(eligibilityKey)) {
      throw new Error(`duplicate_history_eligibility:${eligibilityKey}`);
    }
    eligibilityByGame.set(eligibilityKey, obj);
  }

  if (
    eligibilityByGame.size !== targetKeys.size ||
    [...targetKeys].some((entry) => !eligibilityByGame.has(entry))
  ) {
    throw new Error('history_eligibility_target_universe_mismatch');
  }

  const missingTalentTeams: Record<'2022' | '2023', string[]> = {
    '2022': [],
    '2023': [],
  };
  const missingReturningProductionTeams: Record<'2022' | '2023', string[]> = {
    '2022': [],
    '2023': [],
  };
  const missingRecruitingTeamsByYear: Record<
    '2022' | '2023',
    Record<string, string[]>
  > = {
    '2022': { '2019': [], '2020': [], '2021': [], '2022': [] },
    '2023': { '2020': [], '2021': [], '2022': [], '2023': [] },
  };

  for (const [priorKey, prior] of priorByTeam.entries()) {
    const season = integer(prior.season) as 2022 | 2023;
    const team = stringValue(prior.team)!;
    const seasonKey = String(season) as '2022' | '2023';

    if (
      staticNumericFeature({ source: prior.talent, field: 'talent' }).status !==
      'AVAILABLE'
    ) {
      missingTalentTeams[seasonKey].push(team);
    }
    if (
      staticNumericFeature({
        source: prior.returningProduction,
        field: 'percentPPA',
      }).status !== 'AVAILABLE'
    ) {
      missingReturningProductionTeams[seasonKey].push(team);
    }

    const years =
      season === 2022 ? [2019, 2020, 2021, 2022] : [2020, 2021, 2022, 2023];
    for (const year of years) {
      if (recruitingFeature(prior.recruiting, year).status !== 'AVAILABLE') {
        missingRecruitingTeamsByYear[seasonKey][String(year)].push(team);
      }
    }

    if (!expectedStaticPriorKeys.has(priorKey)) {
      throw new Error(`unexpected_static_prior:${priorKey}`);
    }
  }

  for (const seasonKey of ['2022', '2023'] as const) {
    missingTalentTeams[seasonKey].sort(lexicalCompare);
    missingReturningProductionTeams[seasonKey].sort(lexicalCompare);
    for (const teams of Object.values(missingRecruitingTeamsByYear[seasonKey])) {
      teams.sort(lexicalCompare);
    }
  }

  if (
    !sameStrings(missingTalentTeams['2022'], []) ||
    !sameStrings(missingTalentTeams['2023'], []) ||
    !sameStrings(missingReturningProductionTeams['2022'], ['James Madison']) ||
    !sameStrings(missingReturningProductionTeams['2023'], [
      'Jacksonville State',
      'Sam Houston',
    ])
  ) {
    throw new Error('historical_feature_v1_static_missingness_mismatch');
  }

  const expectedRecruiting = expectedRecruitingMissing();
  for (const seasonKey of ['2022', '2023'] as const) {
    for (const [year, frozenTeams] of Object.entries(expectedRecruiting[seasonKey])) {
      if (
        !sameStrings(
          missingRecruitingTeamsByYear[seasonKey][year] ?? [],
          frozenTeams
        )
      ) {
        throw new Error(
          `historical_feature_v1_recruiting_missingness_mismatch:${seasonKey}:${year}`
        );
      }
    }
  }

  const availabilityCounts: HistoricalFeatureV1Qa['availabilityCounts'] = {};
  const observationCountDistributions: HistoricalFeatureV1Qa['observationCountDistributions'] =
    {};
  let zeroPriorFbsGameSides = 0;
  let fbsVsFcsReferencesExcluded = 0;
  let canonicalHistoryReferencesUsed = 0;
  let sameWeekOrLaterReferences = 0;

  const buildSide = (
    frame: ReturnType<typeof parseGameFrame>,
    team: string,
    elo: JsonObject,
    referenceIds: unknown
  ): HistoricalTeamFeatureBundle => {
    const prior = priorByTeam.get(key(frame.season, team));
    if (!prior) throw new Error(`static_prior_missing:${frame.season}:${team}`);

    if (!Array.isArray(referenceIds)) {
      throw new Error('history_reference_array_required');
    }
    const refStrings = referenceIds.map((value) => stringValue(value));
    if (refStrings.some((value) => value === null)) {
      throw new Error('invalid_history_reference');
    }
    const refs = refStrings as string[];
    if (new Set(refs).size !== refs.length) {
      throw new Error('duplicate_history_reference');
    }

    const canonicalRows: JsonObject[] = [];
    const canonicalGameIds = canonicalGameIdsBySeason.get(frame.season)!;
    const seenCanonicalGames = new Set<number>();

    for (const rowId of refs) {
      const history = historyById.get(rowId);
      if (!history) throw new Error(`unresolved_history_reference:${rowId}`);

      const rowSeason = integer(history.season);
      const rowWeek = integer(history.week);
      const rowGameId = integer(history.gameId);
      const rowTeam = stringValue(history.team);

      if (
        rowSeason !== frame.season ||
        rowWeek === null ||
        rowGameId === null ||
        rowTeam !== team
      ) {
        throw new Error(`history_reference_identity_mismatch:${rowId}`);
      }
      if (rowWeek >= frame.week) {
        sameWeekOrLaterReferences += 1;
        throw new Error(`history_reference_not_prior_week:${rowId}`);
      }

      if (!canonicalGameIds.has(rowGameId)) {
        fbsVsFcsReferencesExcluded += 1;
        continue;
      }
      if (seenCanonicalGames.has(rowGameId)) {
        throw new Error(`duplicate_canonical_history_game:${rowId}`);
      }
      seenCanonicalGames.add(rowGameId);
      canonicalRows.push(history);
      canonicalHistoryReferencesUsed += 1;
    }

    const priorFbsGames = canonicalRows.length;
    if (frame.week === 1 && priorFbsGames !== 0) {
      throw new Error('week_one_prior_fbs_games_nonzero');
    }
    if (priorFbsGames === 0) zeroPriorFbsGameSides += 1;

    const fieldValues = (
      side: 'offense' | 'defense',
      fieldName: 'ppa' | 'successRate'
    ): Array<number | null> =>
      canonicalRows.map((history) => {
        const rawRow = asObject(history.row);
        const sideObj = rawRow ? asObject(rawRow[side]) : null;
        return sideObj ? finiteNumber(sideObj[fieldName]) : null;
      });

    const ppaOffMean = meanFeature(fieldValues('offense', 'ppa'), priorFbsGames);
    const ppaDefMean = meanFeature(fieldValues('defense', 'ppa'), priorFbsGames);
    const successOffMean = meanFeature(
      fieldValues('offense', 'successRate'),
      priorFbsGames
    );
    const successDefMean = meanFeature(
      fieldValues('defense', 'successRate'),
      priorFbsGames
    );

    const recruiting = prior.recruiting;
    const y0 = frame.season;
    const bundle: HistoricalTeamFeatureBundle = {
      eloRaw: eloFeature(elo),
      talentRaw: staticNumericFeature({ source: prior.talent, field: 'talent' }),
      returningPercentPPA: staticNumericFeature({
        source: prior.returningProduction,
        field: 'percentPPA',
      }),
      recruitingPointsY0: recruitingFeature(recruiting, y0),
      recruitingPointsY1: recruitingFeature(recruiting, y0 - 1),
      recruitingPointsY2: recruitingFeature(recruiting, y0 - 2),
      recruitingPointsY3: recruitingFeature(recruiting, y0 - 3),
      priorFbsGames: available(priorFbsGames, null),
      ppaOffMean,
      ppaDefMean,
      ppaNet: netFeature(ppaOffMean, ppaDefMean, priorFbsGames),
      successOffMean,
      successDefMean,
      successNet: netFeature(successOffMean, successDefMean, priorFbsGames),
    };

    for (const [featureName, featureValue] of Object.entries(bundle)) {
      incrementAvailability(availabilityCounts, featureName, featureValue);
      if (
        featureName === 'ppaOffMean' ||
        featureName === 'ppaDefMean' ||
        featureName === 'successOffMean' ||
        featureName === 'successDefMean'
      ) {
        incrementDistribution(
          observationCountDistributions,
          featureName,
          featureValue.n
        );
      }
    }

    return bundle;
  };

  const rows: HistoricalFeatureGameRow[] = [];
  for (const frame of frames) {
    const eligibility = eligibilityByGame.get(key(frame.season, frame.gameId));
    if (!eligibility) throw new Error('history_eligibility_missing');

    if (
      integer(eligibility.week) !== frame.week ||
      stringValue(eligibility.homeTeam) !== frame.homeTeam ||
      stringValue(eligibility.awayTeam) !== frame.awayTeam
    ) {
      throw new Error(`history_eligibility_frame_mismatch:${frame.season}:${frame.gameId}`);
    }

    rows.push({
      season: frame.season,
      gameId: frame.gameId,
      week: frame.week,
      startDate: frame.startDate,
      homeTeam: frame.homeTeam,
      awayTeam: frame.awayTeam,
      neutralSite: frame.neutralSite,
      home: buildSide(
        frame,
        frame.homeTeam,
        frame.homeElo,
        eligibility.homeAdvancedRowIds
      ),
      away: buildSide(
        frame,
        frame.awayTeam,
        frame.awayElo,
        eligibility.awayAdvancedRowIds
      ),
    });
  }

  if (rows.length !== 1484 || sameWeekOrLaterReferences !== 0) {
    throw new Error('historical_feature_v1_output_gate_failed');
  }

  assertNoForbiddenOutputKeys(rows);

  return {
    version: HISTORICAL_FEATURE_V1_VERSION,
    rows,
    qa: {
      gameRows: rows.length,
      seasonRows,
      teamSides: rows.length * 2,
      staticPriorRows: input.staticPriors.length,
      advancedHistoryRows: input.advancedHistory.length,
      zeroPriorFbsGameSides,
      fbsVsFcsReferencesExcluded,
      canonicalHistoryReferencesUsed,
      sameWeekOrLaterReferences,
      duplicateTargetKeys,
      missingTalentTeams,
      missingReturningProductionTeams,
      missingRecruitingTeamsByYear,
      availabilityCounts,
      observationCountDistributions,
    },
  };
}
