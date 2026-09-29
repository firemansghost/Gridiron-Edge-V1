import {
  buildDevelopmentRowsForAudit,
  type HistoricalModelDevelopmentInput,
} from './historical-model-development-v1';
import {
  HISTORICAL_MODEL_V3_DEFINITION_ID,
  HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER,
  HISTORICAL_MODEL_V3_LAMBDA,
  type HistoricalModelV3Candidate,
} from './historical-model-v3';
import type {
  HistoricalV3PredictiveGameInput,
  HistoricalV3PredictiveInputQa,
} from './historical-v3-predictive-inputs';

export const HISTORICAL_V3_PRESCORE_VERSION =
  'historical_v3_prescore_freeze_v1' as const;
export const HISTORICAL_V3_CONFIRMATION_VERSION =
  'historical_v3_source_informed_confirmation_v1' as const;

export type HistoricalV3ConfirmationStatus =
  | 'HISTORICAL_V3_CONFIRMATION_INPUT_BLOCKED'
  | 'HISTORICAL_V3_CONFIRMATION_PASS'
  | 'HISTORICAL_V3_CONFIRMATION_FAIL';

export interface HistoricalV3EloBaselineState {
  kind: 'ELO_HFA_BASELINE';
  lambda: 100;
  coefficientOrder: ['intercept', 'homeFieldIndicator', 'eloDeltaZ'];
  coefficients: [number, number, number];
  eloScaler: {
    mean: number;
    populationSd: number;
    availableCount: number;
    disabledZeroVariance: boolean;
  };
  trainGameIds: number[];
  trainSeasonWeeks: Record<string, number[]>;
}

export interface HistoricalV3HfaBaselineState {
  kind: 'HFA_BASELINE';
  lambda: null;
  coefficientOrder: ['intercept', 'homeFieldIndicator'];
  coefficients: [number, number];
  trainGameIds: number[];
  trainSeasonWeeks: Record<string, number[]>;
}

export interface HistoricalV3BaselineBundle {
  developmentGames: 1484;
  eloHfa: HistoricalV3EloBaselineState;
  hfaOnly: HistoricalV3HfaBaselineState;
}

export interface HistoricalV3PreScoreAudit {
  version: typeof HISTORICAL_V3_PRESCORE_VERSION;
  canonicalGames: 752;
  canonicalTeams: 134;
  canonicalGameIds: number[];
  staticMissingnessCounts: {
    returning: number;
    recruitY0: number;
    recruitY1: number;
    recruitY2: number;
    recruitY3: number;
  };
  naturalFormMissingSides: number;
  sourceGapFormSides: number;
  sourceGapAffectedSides: Array<{
    gameId: number;
    team: string;
    missingPriorGameIds: number[];
  }>;
  allModelInputsFinite: boolean;
}

export interface HistoricalV3PredictionRow {
  gameId: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  actualHomeMargin: number;
  predictedHomeMargin: number;
  error: number;
  absoluteError: number;
}

export interface HistoricalV3Metrics {
  n: number;
  mae: number;
  rmse: number;
  meanError: number;
  medianAbsoluteError: number;
  rSquared: number | null;
}

export interface HistoricalV3WeekMetric {
  week: number;
  n: number;
  mae: number;
  meanError: number;
}

export interface HistoricalV3ConfirmationResult {
  version: typeof HISTORICAL_V3_CONFIRMATION_VERSION;
  status: HistoricalV3ConfirmationStatus;
  inputBlockedReasons: string[];
  primaryPredictions: HistoricalV3PredictionRow[];
  eloHfaPredictions: HistoricalV3PredictionRow[];
  hfaOnlyPredictions: HistoricalV3PredictionRow[];
  primaryMetrics: HistoricalV3Metrics | null;
  eloHfaMetrics: HistoricalV3Metrics | null;
  hfaOnlyMetrics: HistoricalV3Metrics | null;
  primaryWeekMetrics: HistoricalV3WeekMetric[];
  eloHfaWeekMetrics: HistoricalV3WeekMetric[];
  hfaOnlyWeekMetrics: HistoricalV3WeekMetric[];
  gateChecks: {
    primary752Predictions: boolean;
    eloHfa752Predictions: boolean;
    hfaOnly752Predictions: boolean;
    primaryMaeBeatsHfaOnly: boolean;
    primaryMaeBeatsEloHfa: boolean;
    primaryRmseNoWorseThanEloHfa: boolean;
    finiteCandidateAndSourceState: boolean;
    exactCandidateBackcompatState: boolean;
    marketReadsZero: boolean;
    holdout2025ReadsZero: boolean;
    leakageBlockerAbsent: boolean;
  };
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

function solveLinearSystem(matrixInput: number[][], vector: number[]): number[] {
  const n = matrixInput.length;
  if (
    n === 0 ||
    vector.length !== n ||
    matrixInput.some((row) => row.length !== n)
  ) {
    throw new Error('v3_confirmation_invalid_linear_system');
  }
  const matrix = matrixInput.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) {
        pivot = row;
      }
    }
    if (Math.abs(matrix[pivot][column]) <= 1e-12) {
      throw new Error('v3_confirmation_singular_linear_system');
    }
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];

    for (let row = column + 1; row < n; row += 1) {
      const factor = matrix[row][column] / matrix[column][column];
      for (let k = column; k <= n; k += 1) {
        matrix[row][k] -= factor * matrix[column][k];
      }
    }
  }

  const solution = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let rhs = matrix[row][n];
    for (let column = row + 1; column < n; column += 1) {
      rhs -= matrix[row][column] * solution[column];
    }
    solution[row] = rhs / matrix[row][row];
    if (!Number.isFinite(solution[row])) {
      throw new Error('v3_confirmation_nonfinite_linear_solution');
    }
  }
  return solution;
}

function fitRegression(
  design: number[][],
  target: number[],
  lambda: number,
  penalizedIndexes: number[]
): number[] {
  if (design.length === 0 || design.length !== target.length) {
    throw new Error('v3_confirmation_empty_fit');
  }
  const p = design[0].length;
  if (design.some((row) => row.length !== p)) {
    throw new Error('v3_confirmation_ragged_design');
  }

  const xtx = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const xty = new Array<number>(p).fill(0);
  for (let i = 0; i < design.length; i += 1) {
    for (let a = 0; a < p; a += 1) {
      const xa = design[i][a];
      if (!Number.isFinite(xa) || !Number.isFinite(target[i])) {
        throw new Error('v3_confirmation_nonfinite_fit_input');
      }
      xty[a] += xa * target[i];
      for (let b = 0; b < p; b += 1) {
        xtx[a][b] += xa * design[i][b];
      }
    }
  }
  for (const index of penalizedIndexes) xtx[index][index] += lambda;
  return solveLinearSystem(xtx, xty);
}

function trainSeasonWeeks(
  rows: ReturnType<typeof buildDevelopmentRowsForAudit>
): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  for (const season of [2022, 2023]) {
    result[String(season)] = [
      ...new Set(
        rows.filter((row) => row.season === season).map((row) => row.week)
      ),
    ].sort((a, b) => a - b);
  }
  return result;
}

export function fitHistoricalV3Baselines(
  input: HistoricalModelDevelopmentInput
): HistoricalV3BaselineBundle {
  const rows = buildDevelopmentRowsForAudit(input);
  if (rows.length !== 1484) {
    throw new Error('v3_confirmation_development_count_mismatch');
  }

  const eloValues: number[] = [];
  for (const row of rows) {
    for (const side of [row.home, row.away]) {
      if (side.elo.status !== 'AVAILABLE' || side.elo.value === null) {
        throw new Error('v3_confirmation_development_elo_missing');
      }
      eloValues.push(side.elo.value);
    }
  }
  const eloMean =
    eloValues.reduce((sum, value) => sum + value, 0) / eloValues.length;
  const eloVariance =
    eloValues.reduce((sum, value) => sum + (value - eloMean) ** 2, 0) /
    eloValues.length;
  const eloSd = Math.sqrt(eloVariance);
  if (!Number.isFinite(eloMean) || !Number.isFinite(eloSd)) {
    throw new Error('v3_confirmation_elo_scaler_nonfinite');
  }
  const eloDisabled = eloSd <= 1e-12;
  const eloZ = (value: number): number =>
    eloDisabled ? 0 : (value - eloMean) / eloSd;

  const hfaDesign = rows.map((row) => [1, row.neutralSite ? 0 : 1]);
  const eloDesign = rows.map((row) => [
    1,
    row.neutralSite ? 0 : 1,
    eloZ(row.home.elo.value!) - eloZ(row.away.elo.value!),
  ]);
  const target = rows.map((row) => row.homeMargin);

  const hfaCoefficients = fitRegression(hfaDesign, target, 0, []);
  const eloCoefficients = fitRegression(
    eloDesign,
    target,
    HISTORICAL_MODEL_V3_LAMBDA,
    [2]
  );
  if (
    hfaCoefficients.length !== 2 ||
    eloCoefficients.length !== 3 ||
    [...hfaCoefficients, ...eloCoefficients].some(
      (value) => !Number.isFinite(value)
    )
  ) {
    throw new Error('v3_confirmation_baseline_nonfinite');
  }

  const trainGameIds = rows.map((row) => row.gameId);
  const seasonWeeks = trainSeasonWeeks(rows);

  return {
    developmentGames: 1484,
    hfaOnly: {
      kind: 'HFA_BASELINE',
      lambda: null,
      coefficientOrder: ['intercept', 'homeFieldIndicator'],
      coefficients: [hfaCoefficients[0], hfaCoefficients[1]],
      trainGameIds: [...trainGameIds],
      trainSeasonWeeks: seasonWeeks,
    },
    eloHfa: {
      kind: 'ELO_HFA_BASELINE',
      lambda: 100,
      coefficientOrder: ['intercept', 'homeFieldIndicator', 'eloDeltaZ'],
      coefficients: [
        eloCoefficients[0],
        eloCoefficients[1],
        eloCoefficients[2],
      ],
      eloScaler: {
        mean: eloMean,
        populationSd: eloSd,
        availableCount: eloValues.length,
        disabledZeroVariance: eloDisabled,
      },
      trainGameIds: [...trainGameIds],
      trainSeasonWeeks: seasonWeeks,
    },
  };
}

export function auditHistoricalV3PreScoreInputs(
  rows: HistoricalV3PredictiveGameInput[],
  qa: HistoricalV3PredictiveInputQa
): HistoricalV3PreScoreAudit {
  if (rows.length !== 752 || qa.canonicalGames !== 752) {
    throw new Error('v3_prescore_canonical_game_count_mismatch');
  }
  if (qa.canonicalTeams !== 134 || qa.teamSides !== 1504) {
    throw new Error('v3_prescore_canonical_team_count_mismatch');
  }
  const ids = rows.map((row) => row.gameId);
  if (new Set(ids).size !== 752) {
    throw new Error('v3_prescore_duplicate_game_id');
  }

  const staticMissingnessCounts = {
    returning: 0,
    recruitY0: 0,
    recruitY1: 0,
    recruitY2: 0,
    recruitY3: 0,
  };
  const sourceGapAffectedSides: HistoricalV3PreScoreAudit['sourceGapAffectedSides'] =
    [];
  let naturalFormMissingSides = 0;
  let sourceGapFormSides = 0;
  let allModelInputsFinite = true;
  const teams = new Set<string>();

  for (const row of rows) {
    teams.add(row.homeTeam);
    teams.add(row.awayTeam);
    for (const side of [row.home, row.away]) {
      staticMissingnessCounts.returning += side.missingFlags.returning;
      staticMissingnessCounts.recruitY0 += side.missingFlags.recruitY0;
      staticMissingnessCounts.recruitY1 += side.missingFlags.recruitY1;
      staticMissingnessCounts.recruitY2 += side.missingFlags.recruitY2;
      staticMissingnessCounts.recruitY3 += side.missingFlags.recruitY3;
      naturalFormMissingSides += side.missingFlags.formMissing;
      sourceGapFormSides += side.missingFlags.formSourceGap;
      if (side.missingFlags.formSourceGap === 1) {
        sourceGapAffectedSides.push({
          gameId: row.gameId,
          team: side.team,
          missingPriorGameIds: [...side.formAudit.missingPriorGameIds],
        });
      }
    }
    if (
      HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER.some(
        (name) => !Number.isFinite(row.modelInputs[name])
      )
    ) {
      allModelInputsFinite = false;
    }
  }

  if (teams.size !== 134) {
    throw new Error('v3_prescore_team_identity_mismatch');
  }
  if (sourceGapFormSides !== qa.sourceGapFormSides) {
    throw new Error('v3_prescore_source_gap_count_mismatch');
  }
  if (naturalFormMissingSides !== qa.naturalNoPriorFormSides) {
    throw new Error('v3_prescore_natural_form_count_mismatch');
  }
  if (!allModelInputsFinite) {
    throw new Error('v3_prescore_nonfinite_model_input');
  }

  sourceGapAffectedSides.sort(
    (left, right) =>
      left.gameId - right.gameId ||
      (left.team < right.team ? -1 : left.team > right.team ? 1 : 0)
  );

  return {
    version: HISTORICAL_V3_PRESCORE_VERSION,
    canonicalGames: 752,
    canonicalTeams: 134,
    canonicalGameIds: [...ids].sort((a, b) => a - b),
    staticMissingnessCounts,
    naturalFormMissingSides,
    sourceGapFormSides,
    sourceGapAffectedSides,
    allModelInputsFinite,
  };
}

function parse2024Outcomes(rows: unknown[]): Map<number, {
  gameId: number;
  homeTeam: string;
  awayTeam: string;
  homeMargin: number;
}> {
  const result = new Map<number, {
    gameId: number;
    homeTeam: string;
    awayTeam: string;
    homeMargin: number;
  }>();

  for (const raw of rows) {
    const row = asObject(raw);
    if (
      !row ||
      integer(row.season) !== 2024 ||
      row.seasonType !== 'regular' ||
      row.completed !== true ||
      row.homeClassification !== 'fbs' ||
      row.awayClassification !== 'fbs'
    ) {
      continue;
    }
    const gameId = integer(row.id);
    const homeTeam = stringValue(row.homeTeam);
    const awayTeam = stringValue(row.awayTeam);
    const homePoints = finiteNumber(row.homePoints);
    const awayPoints = finiteNumber(row.awayPoints);
    if (
      gameId === null ||
      !homeTeam ||
      !awayTeam ||
      homePoints === null ||
      awayPoints === null
    ) {
      throw new Error('v3_confirmation_outcome_identity_invalid');
    }
    if (result.has(gameId)) {
      throw new Error('v3_confirmation_outcome_duplicate');
    }
    result.set(gameId, {
      gameId,
      homeTeam,
      awayTeam,
      homeMargin: homePoints - awayPoints,
    });
  }

  if (result.size !== 752) {
    throw new Error(
      `v3_confirmation_outcome_count_mismatch:${result.size}`
    );
  }
  return result;
}

function dot(
  inputs: Record<string, number>,
  order: readonly string[],
  coefficients: readonly number[]
): number {
  if (order.length !== coefficients.length) {
    throw new Error('v3_confirmation_candidate_dimension_mismatch');
  }
  let value = 0;
  for (let index = 0; index < order.length; index += 1) {
    const x = inputs[order[index]];
    const beta = coefficients[index];
    if (!Number.isFinite(x) || !Number.isFinite(beta)) {
      throw new Error('v3_confirmation_nonfinite_candidate_state');
    }
    value += x * beta;
  }
  if (!Number.isFinite(value)) {
    throw new Error('v3_confirmation_nonfinite_prediction');
  }
  return value;
}

function metrics(rows: HistoricalV3PredictionRow[]): HistoricalV3Metrics {
  if (rows.length === 0) throw new Error('v3_confirmation_metrics_empty');
  const absolute = rows
    .map((row) => row.absoluteError)
    .sort((a, b) => a - b);
  const mae =
    absolute.reduce((sum, value) => sum + value, 0) / absolute.length;
  const mse =
    rows.reduce((sum, row) => sum + row.error ** 2, 0) / rows.length;
  const meanError =
    rows.reduce((sum, row) => sum + row.error, 0) / rows.length;
  const mid = Math.floor(absolute.length / 2);
  const medianAbsoluteError =
    absolute.length % 2 === 0
      ? (absolute[mid - 1] + absolute[mid]) / 2
      : absolute[mid];
  const actualMean =
    rows.reduce((sum, row) => sum + row.actualHomeMargin, 0) / rows.length;
  const ssRes = rows.reduce((sum, row) => sum + row.error ** 2, 0);
  const ssTot = rows.reduce(
    (sum, row) => sum + (row.actualHomeMargin - actualMean) ** 2,
    0
  );
  const rSquared = ssTot <= 1e-12 ? null : 1 - ssRes / ssTot;

  return {
    n: rows.length,
    mae,
    rmse: Math.sqrt(mse),
    meanError,
    medianAbsoluteError,
    rSquared,
  };
}

function weekMetrics(
  rows: HistoricalV3PredictionRow[]
): HistoricalV3WeekMetric[] {
  const weeks = [...new Set(rows.map((row) => row.week))].sort(
    (a, b) => a - b
  );
  return weeks.map((week) => {
    const subset = rows.filter((row) => row.week === week);
    return {
      week,
      n: subset.length,
      mae:
        subset.reduce((sum, row) => sum + row.absoluteError, 0) /
        subset.length,
      meanError:
        subset.reduce((sum, row) => sum + row.error, 0) / subset.length,
    };
  });
}

function predictionRow(
  row: HistoricalV3PredictiveGameInput,
  actualHomeMargin: number,
  predictedHomeMargin: number
): HistoricalV3PredictionRow {
  const error = predictedHomeMargin - actualHomeMargin;
  return {
    gameId: row.gameId,
    week: row.week,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    actualHomeMargin,
    predictedHomeMargin,
    error,
    absoluteError: Math.abs(error),
  };
}

export function runHistoricalV3Confirmation(options: {
  predictiveRows: HistoricalV3PredictiveGameInput[];
  outcomeRows: unknown[];
  candidate: HistoricalModelV3Candidate;
  baselines: HistoricalV3BaselineBundle;
  exactCandidateBackcompatState: boolean;
  sourceStateVerified: boolean;
  marketReads: number;
  holdout2025Reads: number;
  leakageBlockerAbsent: boolean;
}): HistoricalV3ConfirmationResult {
  const inputBlockedReasons: string[] = [];

  if (options.predictiveRows.length !== 752) {
    inputBlockedReasons.push('canonical_predictions_not_752');
  }
  if (
    options.candidate.status !== 'HISTORICAL_V3_CANDIDATE_FROZEN' ||
    options.candidate.modelDefinitionId !== HISTORICAL_MODEL_V3_DEFINITION_ID ||
    options.candidate.lambda !== 100 ||
    options.candidate.coefficientOrder.length !==
      HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER.length ||
    !options.candidate.coefficientOrder.every(
      (name, index) => name === HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER[index]
    )
  ) {
    inputBlockedReasons.push('candidate_identity_invalid');
  }
  if (!options.exactCandidateBackcompatState) {
    inputBlockedReasons.push('candidate_backcompat_invalid');
  }
  if (!options.sourceStateVerified) {
    inputBlockedReasons.push('source_state_unverified');
  }
  if (options.marketReads !== 0) inputBlockedReasons.push('market_leakage');
  if (options.holdout2025Reads !== 0) inputBlockedReasons.push('holdout_2025_read');
  if (!options.leakageBlockerAbsent) {
    inputBlockedReasons.push('leakage_blocker_present');
  }

  if (inputBlockedReasons.length > 0) {
    const falseChecks = {
      primary752Predictions: false,
      eloHfa752Predictions: false,
      hfaOnly752Predictions: false,
      primaryMaeBeatsHfaOnly: false,
      primaryMaeBeatsEloHfa: false,
      primaryRmseNoWorseThanEloHfa: false,
      finiteCandidateAndSourceState: false,
      exactCandidateBackcompatState: options.exactCandidateBackcompatState,
      marketReadsZero: options.marketReads === 0,
      holdout2025ReadsZero: options.holdout2025Reads === 0,
      leakageBlockerAbsent: options.leakageBlockerAbsent,
    };
    return {
      version: HISTORICAL_V3_CONFIRMATION_VERSION,
      status: 'HISTORICAL_V3_CONFIRMATION_INPUT_BLOCKED',
      inputBlockedReasons,
      primaryPredictions: [],
      eloHfaPredictions: [],
      hfaOnlyPredictions: [],
      primaryMetrics: null,
      eloHfaMetrics: null,
      hfaOnlyMetrics: null,
      primaryWeekMetrics: [],
      eloHfaWeekMetrics: [],
      hfaOnlyWeekMetrics: [],
      gateChecks: falseChecks,
    };
  }

  const outcomes = parse2024Outcomes(options.outcomeRows);
  const primaryPredictions: HistoricalV3PredictionRow[] = [];
  const eloHfaPredictions: HistoricalV3PredictionRow[] = [];
  const hfaOnlyPredictions: HistoricalV3PredictionRow[] = [];

  const eloScaler = options.baselines.eloHfa.eloScaler;
  for (const row of options.predictiveRows) {
    const outcome = outcomes.get(row.gameId);
    if (
      !outcome ||
      outcome.homeTeam !== row.homeTeam ||
      outcome.awayTeam !== row.awayTeam
    ) {
      throw new Error(
        `v3_confirmation_predictive_outcome_identity_mismatch:${row.gameId}`
      );
    }

    const primary = dot(
      row.modelInputs,
      options.candidate.coefficientOrder,
      options.candidate.coefficients
    );

    const eloRawHome = row.home.features.elo;
    const eloRawAway = row.away.features.elo;
    if (
      eloRawHome.status !== 'AVAILABLE' ||
      eloRawAway.status !== 'AVAILABLE' ||
      eloRawHome.value === null ||
      eloRawAway.value === null
    ) {
      throw new Error(
        `v3_confirmation_required_elo_missing:${row.gameId}`
      );
    }
    const zHome = eloScaler.disabledZeroVariance
      ? 0
      : (eloRawHome.value - eloScaler.mean) / eloScaler.populationSd;
    const zAway = eloScaler.disabledZeroVariance
      ? 0
      : (eloRawAway.value - eloScaler.mean) / eloScaler.populationSd;
    const hfa = row.neutralSite ? 0 : 1;
    const eloHfa =
      options.baselines.eloHfa.coefficients[0] +
      options.baselines.eloHfa.coefficients[1] * hfa +
      options.baselines.eloHfa.coefficients[2] * (zHome - zAway);
    const hfaOnly =
      options.baselines.hfaOnly.coefficients[0] +
      options.baselines.hfaOnly.coefficients[1] * hfa;

    primaryPredictions.push(
      predictionRow(row, outcome.homeMargin, primary)
    );
    eloHfaPredictions.push(
      predictionRow(row, outcome.homeMargin, eloHfa)
    );
    hfaOnlyPredictions.push(
      predictionRow(row, outcome.homeMargin, hfaOnly)
    );
  }

  const primaryMetrics = metrics(primaryPredictions);
  const eloHfaMetrics = metrics(eloHfaPredictions);
  const hfaOnlyMetrics = metrics(hfaOnlyPredictions);

  const gateChecks = {
    primary752Predictions: primaryPredictions.length === 752,
    eloHfa752Predictions: eloHfaPredictions.length === 752,
    hfaOnly752Predictions: hfaOnlyPredictions.length === 752,
    primaryMaeBeatsHfaOnly: primaryMetrics.mae < hfaOnlyMetrics.mae,
    primaryMaeBeatsEloHfa: primaryMetrics.mae < eloHfaMetrics.mae,
    primaryRmseNoWorseThanEloHfa:
      primaryMetrics.rmse <= eloHfaMetrics.rmse,
    finiteCandidateAndSourceState:
      options.candidate.coefficients.every(Number.isFinite) &&
      options.sourceStateVerified,
    exactCandidateBackcompatState: options.exactCandidateBackcompatState,
    marketReadsZero: options.marketReads === 0,
    holdout2025ReadsZero: options.holdout2025Reads === 0,
    leakageBlockerAbsent: options.leakageBlockerAbsent,
  };

  return {
    version: HISTORICAL_V3_CONFIRMATION_VERSION,
    status: Object.values(gateChecks).every(Boolean)
      ? 'HISTORICAL_V3_CONFIRMATION_PASS'
      : 'HISTORICAL_V3_CONFIRMATION_FAIL',
    inputBlockedReasons: [],
    primaryPredictions,
    eloHfaPredictions,
    hfaOnlyPredictions,
    primaryMetrics,
    eloHfaMetrics,
    hfaOnlyMetrics,
    primaryWeekMetrics: weekMetrics(primaryPredictions),
    eloHfaWeekMetrics: weekMetrics(eloHfaPredictions),
    hfaOnlyWeekMetrics: weekMetrics(hfaOnlyPredictions),
    gateChecks,
  };
}
