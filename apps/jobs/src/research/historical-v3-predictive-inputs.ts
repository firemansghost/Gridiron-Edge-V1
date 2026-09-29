import {
  HISTORICAL_MODEL_CONTINUOUS_FEATURES,
} from './historical-model-development-v1';
import {
  HISTORICAL_FEATURE_V3_DEFINITION_ID,
  HISTORICAL_MODEL_V3_DEFINITION_ID,
  HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER,
  HISTORICAL_MODEL_V3_LAMBDA,
  HISTORICAL_MODEL_V3_PENALIZED_PREDICTORS,
  type HistoricalModelV3Candidate,
} from './historical-model-v3';

export const HISTORICAL_V3_PREDICTIVE_INPUT_VERSION =
  'historical_v3_predictive_inputs_v1' as const;
export const HISTORICAL_V3_PREDICTIVE_SEASON = 2024 as const;
export const HISTORICAL_V3_EXPECTED_GAMES = 752 as const;
export const HISTORICAL_V3_EXPECTED_TEAMS = 134 as const;

export const HISTORICAL_V3_KNOWN_MISSING_BULK_GAME_IDS = [
  401641034,
  401645328,
  401644689,
  401644780,
] as const;

export type HistoricalV3FeatureStatus =
  | 'AVAILABLE'
  | 'SOURCE_ROW_UNAVAILABLE'
  | 'FIELD_VALUE_UNAVAILABLE'
  | 'NO_PRIOR_FBS_GAMES'
  | 'SOURCE_HISTORY_INCOMPLETE';

export interface HistoricalV3NumericFeature {
  value: number | null;
  status: HistoricalV3FeatureStatus;
  n: number | null;
}

export interface HistoricalV3TeamPredictiveInput {
  team: string;
  features: Record<
    (typeof HISTORICAL_MODEL_CONTINUOUS_FEATURES)[number],
    HistoricalV3NumericFeature
  >;
  standardized: Record<
    (typeof HISTORICAL_MODEL_CONTINUOUS_FEATURES)[number],
    number
  >;
  missingFlags: {
    returning: 0 | 1;
    recruitY0: 0 | 1;
    recruitY1: 0 | 1;
    recruitY2: 0 | 1;
    recruitY3: 0 | 1;
    formMissing: 0 | 1;
    formSourceGap: 0 | 1;
  };
  formAudit: {
    priorFbsGames: number;
    observedAdvancedGames: number;
    missingAdvancedGames: number;
    missingPriorGameIds: number[];
    sourceProvenanceCounts: {
      BULK_ADVANCED_FULL_SEASON_PRIMARY: number;
      BULK_ADVANCED_WEEK_SCOPED_RECOVERY: number;
    };
  };
}

export interface HistoricalV3PredictiveGameInput {
  season: typeof HISTORICAL_V3_PREDICTIVE_SEASON;
  gameId: number;
  week: number;
  startDate: string | null;
  homeTeam: string;
  awayTeam: string;
  neutralSite: boolean;
  home: HistoricalV3TeamPredictiveInput;
  away: HistoricalV3TeamPredictiveInput;
  modelInputs: Record<string, number>;
}

export interface HistoricalV3PredictiveInputBuildInput {
  games: unknown[];
  advancedBulkRows: unknown[];
  recoveryAdvancedRows?: unknown[];
  talentRows: unknown[];
  returningProductionRows: unknown[];
  recruitingByYear: Record<number, unknown[]>;
  eloPreseasonRows: unknown[];
  eloByWeek: Record<number, unknown[]>;
  candidate: HistoricalModelV3Candidate;
  backcompatStatus:
    | 'HISTORICAL_V3_BACKCOMPAT_PASS'
    | 'HISTORICAL_V3_BACKCOMPAT_FAILED';
}

export interface HistoricalV3PredictiveInputQa {
  canonicalGames: number;
  canonicalTeams: number;
  teamSides: number;
  bulkAdvancedValidTeamGameRows: number;
  bulkAdvancedMalformedTeamGameRows: number;
  recoveryRowsAccepted: number;
  recoveryRowsSupplied: number;
  naturalNoPriorFormSides: number;
  sourceGapFormSides: number;
  exactMissingPriorGameIds: number[];
  missingReturningTeams: string[];
  missingRecruitingTeamsBySlot: Record<
    'Y0' | 'Y1' | 'Y2' | 'Y3',
    string[]
  >;
  requiredEloMissingSides: number;
  requiredTalentMissingSides: number;
  sameWeekOrLaterHistoryReferences: number;
  marketReads: 0;
  ppaSidecarReads: 0;
  portalReads: 0;
  outcomeFieldsUsed: false;
  modelPredictionsComputed: false;
  holdout2025Reads: 0;
}

export interface HistoricalV3PredictiveInputBuild {
  version: typeof HISTORICAL_V3_PREDICTIVE_INPUT_VERSION;
  season: typeof HISTORICAL_V3_PREDICTIVE_SEASON;
  rows: HistoricalV3PredictiveGameInput[];
  qa: HistoricalV3PredictiveInputQa;
}

type JsonObject = Record<string, unknown>;
type ContinuousFeatureName =
  (typeof HISTORICAL_MODEL_CONTINUOUS_FEATURES)[number];

interface CanonicalGame {
  gameId: number;
  week: number;
  startDate: string | null;
  homeTeam: string;
  awayTeam: string;
  neutralSite: boolean;
}

interface AdvancedEntry {
  gameId: number;
  week: number;
  team: string;
  opponent: string;
  valid: boolean;
  offensePpa: number | null;
  defensePpa: number | null;
  offenseSuccess: number | null;
  defenseSuccess: number | null;
  provenance:
    | 'BULK_ADVANCED_FULL_SEASON_PRIMARY'
    | 'BULK_ADVANCED_WEEK_SCOPED_RECOVERY';
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

function available(value: number, n: number | null = null): HistoricalV3NumericFeature {
  if (!Number.isFinite(value)) throw new Error('v3_predictive_feature_nonfinite');
  return { value, status: 'AVAILABLE', n };
}

function unavailable(
  status: Exclude<HistoricalV3FeatureStatus, 'AVAILABLE'>,
  n: number | null = null
): HistoricalV3NumericFeature {
  return { value: null, status, n };
}

function exactTeamIndex(
  rows: unknown[],
  label: string
): Map<string, JsonObject> {
  const result = new Map<string, JsonObject>();
  for (const raw of rows) {
    const row = asObject(raw);
    const team = row ? stringValue(row.team) : null;
    if (!row || !team) continue;
    if (result.has(team)) throw new Error(`duplicate_${label}_team:${team}`);
    result.set(team, row);
  }
  return result;
}

function parseCanonicalGames(rows: unknown[]): {
  games: CanonicalGame[];
  teams: Set<string>;
  byId: Map<number, CanonicalGame>;
} {
  const games: CanonicalGame[] = [];
  const byId = new Map<number, CanonicalGame>();
  const teams = new Set<string>();

  for (const raw of rows) {
    const row = asObject(raw);
    if (!row) continue;
    if (
      integer(row.season) !== HISTORICAL_V3_PREDICTIVE_SEASON ||
      row.seasonType !== 'regular' ||
      row.completed !== true ||
      row.homeClassification !== 'fbs' ||
      row.awayClassification !== 'fbs'
    ) {
      continue;
    }

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
      throw new Error('v3_predictive_invalid_game_identity');
    }
    if (byId.has(gameId)) {
      throw new Error(`v3_predictive_duplicate_canonical_game:${gameId}`);
    }

    const game: CanonicalGame = {
      gameId,
      week,
      startDate: stringValue(row.startDate),
      homeTeam,
      awayTeam,
      neutralSite: row.neutralSite === true,
    };
    byId.set(gameId, game);
    games.push(game);
    teams.add(homeTeam);
    teams.add(awayTeam);
  }

  games.sort((left, right) => {
    if (left.week !== right.week) return left.week - right.week;
    const startCmp = lexicalCompare(left.startDate ?? '', right.startDate ?? '');
    if (startCmp !== 0) return startCmp;
    return left.gameId - right.gameId;
  });

  if (games.length !== HISTORICAL_V3_EXPECTED_GAMES) {
    throw new Error(
      `v3_predictive_canonical_game_count_mismatch:${games.length}`
    );
  }
  if (teams.size !== HISTORICAL_V3_EXPECTED_TEAMS) {
    throw new Error(
      `v3_predictive_canonical_team_count_mismatch:${teams.size}`
    );
  }

  return { games, teams, byId };
}

function assertCandidate(
  candidate: HistoricalModelV3Candidate,
  backcompatStatus: HistoricalV3PredictiveInputBuildInput['backcompatStatus']
): void {
  if (backcompatStatus !== 'HISTORICAL_V3_BACKCOMPAT_PASS') {
    throw new Error('v3_predictive_backcompat_not_pass');
  }
  if (
    candidate.status !== 'HISTORICAL_V3_CANDIDATE_FROZEN' ||
    candidate.modelDefinitionId !== HISTORICAL_MODEL_V3_DEFINITION_ID ||
    candidate.featureDefinitionId !== HISTORICAL_FEATURE_V3_DEFINITION_ID ||
    candidate.lambda !== HISTORICAL_MODEL_V3_LAMBDA ||
    candidate.developmentGames !== 1484 ||
    candidate.sourceGapDevelopmentColumnsAllZero !== true
  ) {
    throw new Error('v3_predictive_candidate_identity_mismatch');
  }
  if (
    candidate.coefficientOrder.length !==
      HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER.length ||
    !candidate.coefficientOrder.every(
      (name, index) => name === HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER[index]
    ) ||
    candidate.coefficients.length !==
      HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER.length ||
    candidate.coefficients.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('v3_predictive_candidate_shape_mismatch');
  }

  for (const name of HISTORICAL_MODEL_CONTINUOUS_FEATURES) {
    const scaler = candidate.scaler[name];
    if (
      !scaler ||
      !Number.isFinite(scaler.mean) ||
      !Number.isFinite(scaler.populationSd) ||
      !Number.isInteger(scaler.availableCount) ||
      scaler.availableCount <= 0
    ) {
      throw new Error(`v3_predictive_scaler_invalid:${name}`);
    }
  }
}

function parseAdvancedEntry(
  raw: unknown,
  gameById: Map<number, CanonicalGame>,
  provenance: AdvancedEntry['provenance']
): AdvancedEntry | null {
  const row = asObject(raw);
  if (!row) return null;
  if (
    integer(row.season) !== HISTORICAL_V3_PREDICTIVE_SEASON ||
    row.seasonType !== 'regular'
  ) {
    return null;
  }

  const gameId = integer(row.gameId);
  const week = integer(row.week);
  const team = stringValue(row.team);
  const opponent = stringValue(row.opponent);
  if (gameId === null || week === null || !team || !opponent) return null;

  const game = gameById.get(gameId);
  if (!game) return null;
  if (week !== game.week) {
    throw new Error(`v3_predictive_advanced_week_mismatch:${gameId}:${team}`);
  }

  const expectedOpponent =
    team === game.homeTeam
      ? game.awayTeam
      : team === game.awayTeam
        ? game.homeTeam
        : null;
  if (!expectedOpponent || opponent !== expectedOpponent) {
    throw new Error(`v3_predictive_advanced_identity_mismatch:${gameId}:${team}`);
  }

  const offense = asObject(row.offense);
  const defense = asObject(row.defense);
  const offensePpa = offense ? finiteNumber(offense.ppa) : null;
  const defensePpa = defense ? finiteNumber(defense.ppa) : null;
  const offenseSuccess = offense ? finiteNumber(offense.successRate) : null;
  const defenseSuccess = defense ? finiteNumber(defense.successRate) : null;
  const valid =
    offensePpa !== null &&
    defensePpa !== null &&
    offenseSuccess !== null &&
    defenseSuccess !== null;

  return {
    gameId,
    week,
    team,
    opponent,
    valid,
    offensePpa,
    defensePpa,
    offenseSuccess,
    defenseSuccess,
    provenance,
  };
}

function advancedKey(gameId: number, team: string): string {
  return `${gameId}:${team}`;
}

function buildAdvancedIndex(
  bulkRows: unknown[],
  recoveryRows: unknown[],
  gameById: Map<number, CanonicalGame>
): {
  entries: Map<string, AdvancedEntry>;
  bulkValid: number;
  bulkMalformed: number;
  recoveryAccepted: number;
} {
  const entries = new Map<string, AdvancedEntry>();
  let bulkValid = 0;
  let bulkMalformed = 0;

  for (const raw of bulkRows) {
    const parsed = parseAdvancedEntry(
      raw,
      gameById,
      'BULK_ADVANCED_FULL_SEASON_PRIMARY'
    );
    if (!parsed) continue;
    const key = advancedKey(parsed.gameId, parsed.team);
    if (entries.has(key)) {
      throw new Error(`v3_predictive_duplicate_bulk_advanced:${key}`);
    }
    entries.set(key, parsed);
    if (parsed.valid) bulkValid += 1;
    else bulkMalformed += 1;
  }

  const allowedRecovery = new Set<number>(
    HISTORICAL_V3_KNOWN_MISSING_BULK_GAME_IDS as readonly number[]
  );
  let recoveryAccepted = 0;

  for (const raw of recoveryRows) {
    const parsed = parseAdvancedEntry(
      raw,
      gameById,
      'BULK_ADVANCED_WEEK_SCOPED_RECOVERY'
    );
    if (!parsed) {
      throw new Error('v3_predictive_invalid_recovery_row');
    }
    if (!allowedRecovery.has(parsed.gameId)) {
      throw new Error(`v3_predictive_unapproved_recovery_game:${parsed.gameId}`);
    }
    if (!parsed.valid) {
      throw new Error(`v3_predictive_recovery_row_nonfinite:${parsed.gameId}:${parsed.team}`);
    }
    const key = advancedKey(parsed.gameId, parsed.team);
    if (entries.has(key)) {
      throw new Error(`v3_predictive_recovery_overwrite_forbidden:${key}`);
    }
    entries.set(key, parsed);
    recoveryAccepted += 1;
  }

  return { entries, bulkValid, bulkMalformed, recoveryAccepted };
}

function staticFeature(
  index: Map<string, JsonObject>,
  team: string,
  field: string
): HistoricalV3NumericFeature {
  const row = index.get(team);
  if (!row) return unavailable('SOURCE_ROW_UNAVAILABLE', 0);
  const value = finiteNumber(row[field]);
  if (value === null) return unavailable('FIELD_VALUE_UNAVAILABLE', 0);
  return available(value, 1);
}

function recruitingFeature(
  indexes: Map<number, Map<string, JsonObject>>,
  team: string,
  year: number
): HistoricalV3NumericFeature {
  const row = indexes.get(year)?.get(team);
  if (!row) return unavailable('SOURCE_ROW_UNAVAILABLE', 0);
  const value = finiteNumber(row.points);
  if (value === null) return unavailable('FIELD_VALUE_UNAVAILABLE', 0);
  return available(value, 1);
}

function requiredElo(
  team: string,
  targetWeek: number,
  preseason: Map<string, JsonObject>,
  weekly: Map<number, Map<string, JsonObject>>
): HistoricalV3NumericFeature {
  const row =
    targetWeek === 1
      ? preseason.get(team)
      : weekly.get(targetWeek - 1)?.get(team);
  if (!row) {
    throw new Error(`v3_predictive_required_elo_missing:${team}:${targetWeek}`);
  }
  const value = finiteNumber(row.elo);
  if (value === null) {
    throw new Error(`v3_predictive_required_elo_nonfinite:${team}:${targetWeek}`);
  }
  return available(value, 1);
}

function zValue(
  feature: HistoricalV3NumericFeature,
  name: ContinuousFeatureName,
  candidate: HistoricalModelV3Candidate
): number {
  if (feature.status !== 'AVAILABLE' || feature.value === null) return 0;
  const scaler = candidate.scaler[name];
  if (!scaler) throw new Error(`v3_predictive_scaler_missing:${name}`);
  if (scaler.disabledZeroVariance) return 0;
  const value = (feature.value - scaler.mean) / scaler.populationSd;
  if (!Number.isFinite(value)) {
    throw new Error(`v3_predictive_standardized_nonfinite:${name}`);
  }
  return value;
}

function mean(values: number[]): number {
  if (values.length === 0) throw new Error('v3_predictive_empty_mean');
  const value = values.reduce((sum, entry) => sum + entry, 0) / values.length;
  if (!Number.isFinite(value)) throw new Error('v3_predictive_mean_nonfinite');
  return value;
}

const FORBIDDEN_OUTPUT_KEYS = new Set([
  'homePoints',
  'awayPoints',
  'homeScore',
  'awayScore',
  'finalHomePoints',
  'finalAwayPoints',
  'homeMargin',
  'winner',
  'lines',
  'spread',
  'formattedSpread',
  'spreadOpen',
  'overUnder',
  'overUnderOpen',
  'homeMoneyline',
  'awayMoneyline',
  'prediction',
  'modelHomeMargin',
  'edge',
]);

function assertNoForbiddenOutputKeys(value: unknown, label = 'v3_predictive'): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoForbiddenOutputKeys(entry, `${label}[${index}]`)
    );
    return;
  }
  const obj = asObject(value);
  if (!obj) return;
  for (const [key, child] of Object.entries(obj)) {
    if (FORBIDDEN_OUTPUT_KEYS.has(key)) {
      throw new Error(`v3_predictive_forbidden_output_key:${key}:${label}`);
    }
    assertNoForbiddenOutputKeys(child, `${label}.${key}`);
  }
}

function missingFlag(feature: HistoricalV3NumericFeature): 0 | 1 {
  return feature.status === 'AVAILABLE' ? 0 : 1;
}

export function buildHistoricalV3PredictiveInputs(
  input: HistoricalV3PredictiveInputBuildInput
): HistoricalV3PredictiveInputBuild {
  assertCandidate(input.candidate, input.backcompatStatus);

  const { games, teams, byId } = parseCanonicalGames(input.games);
  const talentIndex = exactTeamIndex(input.talentRows, 'talent');
  const returningIndex = exactTeamIndex(
    input.returningProductionRows,
    'returning_production'
  );
  const preseasonEloIndex = exactTeamIndex(
    input.eloPreseasonRows,
    'elo_preseason'
  );

  const recruitingIndexes = new Map<number, Map<string, JsonObject>>();
  for (const year of [2021, 2022, 2023, 2024]) {
    recruitingIndexes.set(
      year,
      exactTeamIndex(input.recruitingByYear[year] ?? [], `recruiting_${year}`)
    );
  }

  const weeklyEloIndexes = new Map<number, Map<string, JsonObject>>();
  for (const [weekText, rows] of Object.entries(input.eloByWeek)) {
    const week = Number(weekText);
    if (!Number.isInteger(week) || week <= 0) continue;
    weeklyEloIndexes.set(week, exactTeamIndex(rows, `elo_week_${week}`));
  }

  for (const team of teams) {
    const talent = staticFeature(talentIndex, team, 'talent');
    if (talent.status !== 'AVAILABLE') {
      throw new Error(`v3_predictive_required_talent_missing:${team}`);
    }
  }

  const advanced = buildAdvancedIndex(
    input.advancedBulkRows,
    input.recoveryAdvancedRows ?? [],
    byId
  );

  const gamesByTeam = new Map<string, CanonicalGame[]>();
  for (const game of games) {
    for (const team of [game.homeTeam, game.awayTeam]) {
      const existing = gamesByTeam.get(team) ?? [];
      existing.push(game);
      gamesByTeam.set(team, existing);
    }
  }

  const missingReturningTeams = [...teams]
    .filter(
      (team) =>
        staticFeature(returningIndex, team, 'percentPPA').status !== 'AVAILABLE'
    )
    .sort(lexicalCompare);

  const missingRecruitingTeamsBySlot: HistoricalV3PredictiveInputQa['missingRecruitingTeamsBySlot'] = {
    Y0: [],
    Y1: [],
    Y2: [],
    Y3: [],
  };
  const slotYear = { Y0: 2024, Y1: 2023, Y2: 2022, Y3: 2021 } as const;
  for (const [slot, year] of Object.entries(slotYear) as Array<
    [keyof typeof slotYear, number]
  >) {
    missingRecruitingTeamsBySlot[slot] = [...teams]
      .filter(
        (team) =>
          recruitingFeature(recruitingIndexes, team, year).status !== 'AVAILABLE'
      )
      .sort(lexicalCompare);
  }

  let naturalNoPriorFormSides = 0;
  let sourceGapFormSides = 0;
  let sameWeekOrLaterHistoryReferences = 0;
  const exactMissingPriorGameIds = new Set<number>();

  const buildSide = (
    target: CanonicalGame,
    team: string
  ): HistoricalV3TeamPredictiveInput => {
    const priorGames = (gamesByTeam.get(team) ?? []).filter(
      (game) => game.week < target.week
    );
    if (priorGames.some((game) => game.week >= target.week)) {
      sameWeekOrLaterHistoryReferences += 1;
      throw new Error('v3_predictive_same_week_history_reference');
    }

    const sourceRows: AdvancedEntry[] = [];
    const missingPriorGameIds: number[] = [];
    for (const prior of priorGames) {
      const entry = advanced.entries.get(advancedKey(prior.gameId, team));
      if (!entry || !entry.valid) {
        missingPriorGameIds.push(prior.gameId);
        exactMissingPriorGameIds.add(prior.gameId);
        continue;
      }
      sourceRows.push(entry);
    }

    const priorFbsGames = priorGames.length;
    const observedAdvancedGames = sourceRows.length;
    const sourceProvenanceCounts = {
      BULK_ADVANCED_FULL_SEASON_PRIMARY: sourceRows.filter(
        (row) => row.provenance === 'BULK_ADVANCED_FULL_SEASON_PRIMARY'
      ).length,
      BULK_ADVANCED_WEEK_SCOPED_RECOVERY: sourceRows.filter(
        (row) => row.provenance === 'BULK_ADVANCED_WEEK_SCOPED_RECOVERY'
      ).length,
    };

    let ppaNet: HistoricalV3NumericFeature;
    let successNet: HistoricalV3NumericFeature;
    let formMissing: 0 | 1 = 0;
    let formSourceGap: 0 | 1 = 0;

    if (priorFbsGames === 0) {
      naturalNoPriorFormSides += 1;
      ppaNet = unavailable('NO_PRIOR_FBS_GAMES', 0);
      successNet = unavailable('NO_PRIOR_FBS_GAMES', 0);
      formMissing = 1;
    } else if (observedAdvancedGames < priorFbsGames) {
      sourceGapFormSides += 1;
      ppaNet = unavailable('SOURCE_HISTORY_INCOMPLETE', observedAdvancedGames);
      successNet = unavailable(
        'SOURCE_HISTORY_INCOMPLETE',
        observedAdvancedGames
      );
      formSourceGap = 1;
    } else {
      const offensePpa = mean(
        sourceRows.map((row) => row.offensePpa as number)
      );
      const defensePpa = mean(
        sourceRows.map((row) => row.defensePpa as number)
      );
      const offenseSuccess = mean(
        sourceRows.map((row) => row.offenseSuccess as number)
      );
      const defenseSuccess = mean(
        sourceRows.map((row) => row.defenseSuccess as number)
      );
      ppaNet = available(offensePpa - defensePpa, priorFbsGames);
      successNet = available(offenseSuccess - defenseSuccess, priorFbsGames);
    }

    const features: HistoricalV3TeamPredictiveInput['features'] = {
      elo: requiredElo(
        team,
        target.week,
        preseasonEloIndex,
        weeklyEloIndexes
      ),
      talent: staticFeature(talentIndex, team, 'talent'),
      returning: staticFeature(returningIndex, team, 'percentPPA'),
      recruitY0: recruitingFeature(recruitingIndexes, team, 2024),
      recruitY1: recruitingFeature(recruitingIndexes, team, 2023),
      recruitY2: recruitingFeature(recruitingIndexes, team, 2022),
      recruitY3: recruitingFeature(recruitingIndexes, team, 2021),
      priorFbsGames: available(priorFbsGames, null),
      ppaNet,
      successNet,
    };

    if (features.talent.status !== 'AVAILABLE') {
      throw new Error(`v3_predictive_required_talent_missing:${team}`);
    }

    const standardized = {} as HistoricalV3TeamPredictiveInput['standardized'];
    for (const name of HISTORICAL_MODEL_CONTINUOUS_FEATURES) {
      standardized[name] = zValue(features[name], name, input.candidate);
    }

    return {
      team,
      features,
      standardized,
      missingFlags: {
        returning: missingFlag(features.returning),
        recruitY0: missingFlag(features.recruitY0),
        recruitY1: missingFlag(features.recruitY1),
        recruitY2: missingFlag(features.recruitY2),
        recruitY3: missingFlag(features.recruitY3),
        formMissing,
        formSourceGap,
      },
      formAudit: {
        priorFbsGames,
        observedAdvancedGames,
        missingAdvancedGames: missingPriorGameIds.length,
        missingPriorGameIds: missingPriorGameIds.sort((a, b) => a - b),
        sourceProvenanceCounts,
      },
    };
  };

  const rows: HistoricalV3PredictiveGameInput[] = games.map((game) => {
    const home = buildSide(game, game.homeTeam);
    const away = buildSide(game, game.awayTeam);
    const modelInputs: Record<string, number> = {
      intercept: 1,
      homeFieldIndicator: game.neutralSite ? 0 : 1,
      eloDeltaZ: home.standardized.elo - away.standardized.elo,
      talentDeltaZ: home.standardized.talent - away.standardized.talent,
      returningDeltaZ:
        home.standardized.returning - away.standardized.returning,
      recruitY0DeltaZ:
        home.standardized.recruitY0 - away.standardized.recruitY0,
      recruitY1DeltaZ:
        home.standardized.recruitY1 - away.standardized.recruitY1,
      recruitY2DeltaZ:
        home.standardized.recruitY2 - away.standardized.recruitY2,
      recruitY3DeltaZ:
        home.standardized.recruitY3 - away.standardized.recruitY3,
      priorFbsGamesDeltaZ:
        home.standardized.priorFbsGames - away.standardized.priorFbsGames,
      ppaNetDeltaZ: home.standardized.ppaNet - away.standardized.ppaNet,
      successNetDeltaZ:
        home.standardized.successNet - away.standardized.successNet,
      returningMissingDelta:
        home.missingFlags.returning - away.missingFlags.returning,
      recruitY0MissingDelta:
        home.missingFlags.recruitY0 - away.missingFlags.recruitY0,
      recruitY1MissingDelta:
        home.missingFlags.recruitY1 - away.missingFlags.recruitY1,
      recruitY2MissingDelta:
        home.missingFlags.recruitY2 - away.missingFlags.recruitY2,
      recruitY3MissingDelta:
        home.missingFlags.recruitY3 - away.missingFlags.recruitY3,
      formMissingDelta:
        home.missingFlags.formMissing - away.missingFlags.formMissing,
      formSourceGapDelta:
        home.missingFlags.formSourceGap - away.missingFlags.formSourceGap,
    };

    for (const name of HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER) {
      if (!Number.isFinite(modelInputs[name])) {
        throw new Error(`v3_predictive_model_input_nonfinite:${name}`);
      }
    }
    for (const name of HISTORICAL_MODEL_V3_PENALIZED_PREDICTORS) {
      if (!(name in modelInputs)) {
        throw new Error(`v3_predictive_model_input_missing:${name}`);
      }
    }

    return {
      season: HISTORICAL_V3_PREDICTIVE_SEASON,
      gameId: game.gameId,
      week: game.week,
      startDate: game.startDate,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      neutralSite: game.neutralSite,
      home,
      away,
      modelInputs,
    };
  });

  if (rows.length !== HISTORICAL_V3_EXPECTED_GAMES) {
    throw new Error('v3_predictive_output_game_count_mismatch');
  }
  if (sameWeekOrLaterHistoryReferences !== 0) {
    throw new Error('v3_predictive_temporal_gate_failed');
  }

  assertNoForbiddenOutputKeys(rows);

  return {
    version: HISTORICAL_V3_PREDICTIVE_INPUT_VERSION,
    season: HISTORICAL_V3_PREDICTIVE_SEASON,
    rows,
    qa: {
      canonicalGames: games.length,
      canonicalTeams: teams.size,
      teamSides: rows.length * 2,
      bulkAdvancedValidTeamGameRows: advanced.bulkValid,
      bulkAdvancedMalformedTeamGameRows: advanced.bulkMalformed,
      recoveryRowsAccepted: advanced.recoveryAccepted,
      recoveryRowsSupplied: input.recoveryAdvancedRows?.length ?? 0,
      naturalNoPriorFormSides,
      sourceGapFormSides,
      exactMissingPriorGameIds: [...exactMissingPriorGameIds].sort(
        (a, b) => a - b
      ),
      missingReturningTeams,
      missingRecruitingTeamsBySlot,
      requiredEloMissingSides: 0,
      requiredTalentMissingSides: 0,
      sameWeekOrLaterHistoryReferences,
      marketReads: 0,
      ppaSidecarReads: 0,
      portalReads: 0,
      outcomeFieldsUsed: false,
      modelPredictionsComputed: false,
      holdout2025Reads: 0,
    },
  };
}
