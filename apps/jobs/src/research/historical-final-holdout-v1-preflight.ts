import {
  HISTORICAL_FEATURE_V3_DEFINITION_ID,
  HISTORICAL_MODEL_V3_DEFINITION_ID,
  HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER,
  HISTORICAL_MODEL_V3_LAMBDA,
  type HistoricalModelV3Candidate,
} from './historical-model-v3';

export const HISTORICAL_FINAL_HOLDOUT_V1_VERSION =
  'historical_final_holdout_v1' as const;
export const HISTORICAL_FINAL_HOLDOUT_V1_SEASON = 2025 as const;
export const HISTORICAL_FINAL_HOLDOUT_V1_EXPECTED_GAMES = 762 as const;
export const HISTORICAL_FINAL_HOLDOUT_V1_EXPECTED_TEAMS = 136 as const;

export type HistoricalFinalHoldoutRequiredInputStatus =
  | 'HISTORICAL_FINAL_HOLDOUT_INPUT_BLOCKED'
  | 'HISTORICAL_FINAL_HOLDOUT_REQUIRED_FEATURE_PREFLIGHT_CLEAR';

type JsonObject = Record<string, unknown>;

interface CanonicalGame {
  gameId: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  neutralSite: boolean;
}

export interface HistoricalFinalHoldoutMissingEloSide {
  gameId: number;
  week: number;
  side: 'HOME' | 'AWAY';
  team: string;
  requiredSource: 'PRESEASON' | number;
  reason: 'SOURCE_ROW_UNAVAILABLE' | 'FIELD_VALUE_UNAVAILABLE';
}

export interface HistoricalFinalHoldoutRequiredInputPreflightInput {
  games: unknown[];
  talentRows: unknown[];
  eloPreseasonRows: unknown[];
  eloByWeek: Record<number, unknown[]>;
  candidate: HistoricalModelV3Candidate;
  backcompatStatus:
    | 'HISTORICAL_V3_BACKCOMPAT_PASS'
    | 'HISTORICAL_V3_BACKCOMPAT_FAILED';
}

export interface HistoricalFinalHoldoutRequiredInputPreflight {
  version: typeof HISTORICAL_FINAL_HOLDOUT_V1_VERSION;
  season: typeof HISTORICAL_FINAL_HOLDOUT_V1_SEASON;
  status: HistoricalFinalHoldoutRequiredInputStatus;
  canonicalGames: number;
  canonicalTeams: number;
  teamSides: number;
  blockers: string[];
  missingTalentTeams: string[];
  missingTalentSides: number;
  missingEloSides: HistoricalFinalHoldoutMissingEloSide[];
  providerCalls: 0;
  marketReads: 0;
  ppaSidecarReads: 0;
  portalReads: 0;
  outcomeFieldsUsed: false;
  modelPredictionsComputed: false;
  databaseReads: false;
  databaseWrites: false;
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
  const n = finiteNumber(value);
  return n !== null && Number.isInteger(n) ? n : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertCandidate(
  candidate: HistoricalModelV3Candidate,
  backcompatStatus: HistoricalFinalHoldoutRequiredInputPreflightInput['backcompatStatus']
): void {
  if (backcompatStatus !== 'HISTORICAL_V3_BACKCOMPAT_PASS') {
    throw new Error('final_holdout_v1_backcompat_not_pass');
  }
  if (
    candidate.status !== 'HISTORICAL_V3_CANDIDATE_FROZEN' ||
    candidate.modelDefinitionId !== HISTORICAL_MODEL_V3_DEFINITION_ID ||
    candidate.featureDefinitionId !== HISTORICAL_FEATURE_V3_DEFINITION_ID ||
    candidate.lambda !== HISTORICAL_MODEL_V3_LAMBDA ||
    candidate.developmentGames !== 1484 ||
    candidate.sourceGapDevelopmentColumnsAllZero !== true
  ) {
    throw new Error('final_holdout_v1_candidate_identity_mismatch');
  }
  if (
    candidate.coefficientOrder.length !==
      HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER.length ||
    candidate.coefficients.length !==
      HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER.length ||
    candidate.coefficientOrder.some(
      (name, index) => name !== HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER[index]
    ) ||
    candidate.coefficients.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('final_holdout_v1_candidate_shape_mismatch');
  }
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
    if (result.has(team)) {
      throw new Error(`final_holdout_v1_duplicate_${label}_team:${team}`);
    }
    result.set(team, row);
  }
  return result;
}

function canonicalGames(rows: unknown[]): {
  games: CanonicalGame[];
  teams: Set<string>;
} {
  const games: CanonicalGame[] = [];
  const seen = new Set<number>();
  const teams = new Set<string>();

  for (const raw of rows) {
    const row = asObject(raw);
    if (!row) continue;
    if (
      integer(row.season) !== HISTORICAL_FINAL_HOLDOUT_V1_SEASON ||
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
      !awayTeam ||
      seen.has(gameId)
    ) {
      throw new Error('final_holdout_v1_invalid_canonical_game_identity');
    }

    seen.add(gameId);
    teams.add(homeTeam);
    teams.add(awayTeam);
    games.push({
      gameId,
      week,
      homeTeam,
      awayTeam,
      neutralSite: row.neutralSite === true,
    });
  }

  games.sort(
    (a, b) =>
      a.week - b.week ||
      a.gameId - b.gameId
  );

  return { games, teams };
}

function talentAvailable(
  index: Map<string, JsonObject>,
  team: string
): boolean {
  const row = index.get(team);
  return !!row && finiteNumber(row.talent) !== null;
}

function eloState(
  index: Map<string, JsonObject> | undefined,
  team: string
): 'AVAILABLE' | 'SOURCE_ROW_UNAVAILABLE' | 'FIELD_VALUE_UNAVAILABLE' {
  const row = index?.get(team);
  if (!row) return 'SOURCE_ROW_UNAVAILABLE';
  return finiteNumber(row.elo) === null
    ? 'FIELD_VALUE_UNAVAILABLE'
    : 'AVAILABLE';
}

export function evaluateHistoricalFinalHoldoutRequiredInputs(
  input: HistoricalFinalHoldoutRequiredInputPreflightInput
): HistoricalFinalHoldoutRequiredInputPreflight {
  assertCandidate(input.candidate, input.backcompatStatus);

  const parsed = canonicalGames(input.games);
  const blockers: string[] = [];

  if (parsed.games.length !== HISTORICAL_FINAL_HOLDOUT_V1_EXPECTED_GAMES) {
    blockers.push(
      `canonical_game_count_mismatch:${parsed.games.length}`
    );
  }
  if (parsed.teams.size !== HISTORICAL_FINAL_HOLDOUT_V1_EXPECTED_TEAMS) {
    blockers.push(
      `canonical_team_count_mismatch:${parsed.teams.size}`
    );
  }

  const talentIndex = exactTeamIndex(input.talentRows, 'talent');
  const missingTalentTeams = [...parsed.teams]
    .filter((team) => !talentAvailable(talentIndex, team))
    .sort(lexicalCompare);
  const missingTalentSet = new Set(missingTalentTeams);
  const missingTalentSides = parsed.games.reduce(
    (count, game) =>
      count +
      (missingTalentSet.has(game.homeTeam) ? 1 : 0) +
      (missingTalentSet.has(game.awayTeam) ? 1 : 0),
    0
  );
  for (const team of missingTalentTeams) {
    blockers.push(`required_talent_missing:${team}`);
  }

  const preseason = exactTeamIndex(input.eloPreseasonRows, 'elo_preseason');
  const weekly = new Map<number, Map<string, JsonObject>>();
  for (const [weekText, rows] of Object.entries(input.eloByWeek)) {
    const week = Number(weekText);
    if (!Number.isInteger(week) || week <= 0) continue;
    weekly.set(week, exactTeamIndex(rows, `elo_week_${week}`));
  }

  const missingEloSides: HistoricalFinalHoldoutMissingEloSide[] = [];
  for (const game of parsed.games) {
    for (const [side, team] of [
      ['HOME', game.homeTeam],
      ['AWAY', game.awayTeam],
    ] as const) {
      const requiredSource = game.week === 1 ? 'PRESEASON' : game.week - 1;
      const state =
        game.week === 1
          ? eloState(preseason, team)
          : eloState(weekly.get(game.week - 1), team);
      if (state === 'AVAILABLE') continue;
      missingEloSides.push({
        gameId: game.gameId,
        week: game.week,
        side,
        team,
        requiredSource,
        reason: state,
      });
    }
  }

  missingEloSides.sort(
    (a, b) =>
      a.week - b.week ||
      a.gameId - b.gameId ||
      lexicalCompare(a.side, b.side)
  );
  for (const row of missingEloSides) {
    blockers.push(
      `required_elo_${row.reason === 'SOURCE_ROW_UNAVAILABLE' ? 'missing' : 'nonfinite'}:${row.team}:week_${row.week}`
    );
  }

  const uniqueBlockers = [...new Set(blockers)].sort(lexicalCompare);
  return {
    version: HISTORICAL_FINAL_HOLDOUT_V1_VERSION,
    season: HISTORICAL_FINAL_HOLDOUT_V1_SEASON,
    status:
      uniqueBlockers.length > 0
        ? 'HISTORICAL_FINAL_HOLDOUT_INPUT_BLOCKED'
        : 'HISTORICAL_FINAL_HOLDOUT_REQUIRED_FEATURE_PREFLIGHT_CLEAR',
    canonicalGames: parsed.games.length,
    canonicalTeams: parsed.teams.size,
    teamSides: parsed.games.length * 2,
    blockers: uniqueBlockers,
    missingTalentTeams,
    missingTalentSides,
    missingEloSides,
    providerCalls: 0,
    marketReads: 0,
    ppaSidecarReads: 0,
    portalReads: 0,
    outcomeFieldsUsed: false,
    modelPredictionsComputed: false,
    databaseReads: false,
    databaseWrites: false,
  };
}
