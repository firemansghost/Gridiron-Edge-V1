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
} from './historical-v3-predictive-inputs';

export const HISTORICAL_V3_PRESCORE_VERSION =
  'historical_v3_prescore_freeze_v1' as const;
export const HISTORICAL_V3_CONFIRMATION_VERSION =
  'historical_v3_source_informed_confirmation_v1' as const;
export const HISTORICAL_V3_CONFIRMATION_SEASON = 2024 as const;
export const HISTORICAL_V3_CONFIRMATION_EXPECTED_GAMES = 752 as const;
export const HISTORICAL_V3_CONFIRMATION_ELO_LAMBDA = 100 as const;

export interface HistoricalV3EloScaler {
  mean: number;
  populationSd: number;
  availableCount: number;
  disabledZeroVariance: boolean;
}

export interface HistoricalV3BaselineState {
  kind: 'HFA_BASELINE' | 'ELO_HFA_BASELINE';
  lambda: number | null;
  coefficientOrder: string[];
  coefficients: number[];
  eloScaler: HistoricalV3EloScaler | null;
  trainGameIds: number[];
  trainSeasonWeeks: Record<string, number[]>;
}

export interface HistoricalV3PreScoreFreeze {
  version: typeof HISTORICAL_V3_PRESCORE_VERSION;
  status: 'HISTORICAL_V3_PRESCORE_FREEZE_READY';
  season: typeof HISTORICAL_V3_CONFIRMATION_SEASON;
  canonicalGameIds: number[];
  canonicalGames: number;
  modelDefinitionId: typeof HISTORICAL_MODEL_V3_DEFINITION_ID;
  lambda: typeof HISTORICAL_MODEL_V3_LAMBDA;
  staticMissingnessCounts: {
    returningSides: number;
    recruitY0Sides: number;
    recruitY1Sides: number;
    recruitY2Sides: number;
    recruitY3Sides: number;
    naturalFormMissingSides: number;
    sourceGapFormSides: number;
  };
  sourceGapSides: Array<{
    gameId: number;
    week: number;
    side: 'HOME' | 'AWAY';
    team: string;
    missingPriorGameIds: number[];
  }>;
  hfaBaseline: HistoricalV3BaselineState;
  eloHfaBaseline: HistoricalV3BaselineState;
}

export interface HistoricalV3OutcomeRow {
  gameId: number;
  homeTeam: string;
  awayTeam: string;
  finalHomePoints: number;
  finalAwayPoints: number;
  homeMargin: number;
}

export interface HistoricalV3PredictionRow {
  gameId: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  actualHomeMargin: number;
  v3PredictedHomeMargin: number;
  eloHfaPredictedHomeMargin: number;
  hfaPredictedHomeMargin: number;
}

export interface HistoricalV3Metrics {
  n: number;
  mae: number;
  rmse: number;
  meanError: number;
  medianAbsoluteError: number;
  rSquared: number | null;
}

export interface HistoricalV3ConfirmationResult {
  version: typeof HISTORICAL_V3_CONFIRMATION_VERSION;
  status:
    | 'HISTORICAL_V3_CONFIRMATION_INPUT_BLOCKED'
    | 'HISTORICAL_V3_CONFIRMATION_PASS'
    | 'HISTORICAL_V3_CONFIRMATION_FAIL';
  inputBlockers: string[];
  predictionRows: HistoricalV3PredictionRow[];
  v3Metrics: HistoricalV3Metrics | null;
  eloHfaMetrics: HistoricalV3Metrics | null;
  hfaMetrics: HistoricalV3Metrics | null;
  gateChecks: {
    all752V3Predictions: boolean;
    all752EloHfaPredictions: boolean;
    all752HfaPredictions: boolean;
    v3MaeBeatsHfa: boolean;
    v3MaeBeatsEloHfa: boolean;
    v3RmseNoWorseThanEloHfa: boolean;
    finiteCandidateAndBaselines: boolean;
    frozenInputIntegrity: boolean;
    marketReadsZero: boolean;
    holdout2025ReadsZero: boolean;
  };
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  if (n === 0 || b.length !== n || A.some((row) => row.length !== n)) {
    throw new Error('v3_confirmation_invalid_linear_system');
  }
  const m = A.map((row, index) => [...row, b[index]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) <= 1e-12) {
      throw new Error('v3_confirmation_singular_linear_system');
    }
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = col + 1; row < n; row += 1) {
      const factor = m[row][col] / m[col][col];
      for (let k = col; k <= n; k += 1) {
        m[row][k] -= factor * m[col][k];
      }
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let rhs = m[row][n];
    for (let col = row + 1; col < n; col += 1) {
      rhs -= m[row][col] * x[col];
    }
    x[row] = rhs / m[row][row];
    if (!Number.isFinite(x[row])) {
      throw new Error('v3_confirmation_nonfinite_linear_solution');
    }
  }
  return x;
}

function fitRegression(
  X: number[][],
  y: number[],
  lambda: number,
  penalizedIndexes: number[]
): number[] {
  if (X.length === 0 || X.length !== y.length) {
    throw new Error('v3_confirmation_empty_fit');
  }
  const p = X[0].length;
  if (X.some((row) => row.length !== p)) {
    throw new Error('v3_confirmation_ragged_design');
  }

  const xtx = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const xty = new Array<number>(p).fill(0);

  for (let i = 0; i < X.length; i += 1) {
    if (!finite(y[i])) throw new Error('v3_confirmation_nonfinite_target');
    for (let a = 0; a < p; a += 1) {
      if (!finite(X[i][a])) throw new Error('v3_confirmation_nonfinite_design');
      xty[a] += X[i][a] * y[i];
      for (let b = 0; b < p; b += 1) {
        xtx[a][b] += X[i][a] * X[i][b];
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
  for (const season of [2022, 2023] as const) {
    result[String(season)] = [
      ...new Set(rows.filter((row) => row.season === season).map((row) => row.week)),
    ].sort((a, b) => a - b);
  }
  return result;
}

function fitEloScaler(
  rows: ReturnType<typeof buildDevelopmentRowsForAudit>
): HistoricalV3EloScaler {
  const values: number[] = [];
  for (const row of rows) {
    for (const team of [row.home, row.away]) {
      if (team.elo.status !== 'AVAILABLE' || team.elo.value === null) {
        throw new Error('v3_confirmation_development_elo_missing');
      }
      values.push(team.elo.value);
    }
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const populationSd = Math.sqrt(variance);
  if (!finite(mean) || !finite(populationSd)) {
    throw new Error('v3_confirmation_elo_scaler_nonfinite');
  }
  return {
    mean,
    populationSd,
    availableCount: values.length,
    disabledZeroVariance: populationSd <= 1e-12,
  };
}

function zElo(value: number, scaler: HistoricalV3EloScaler): number {
  if (scaler.disabledZeroVariance) return 0;
  const result = (value - scaler.mean) / scaler.populationSd;
  if (!finite(result)) throw new Error('v3_confirmation_elo_z_nonfinite');
  return result;
}

export function fitHistoricalV3ValidationBaselines(
  input: HistoricalModelDevelopmentInput
): {
  hfa: HistoricalV3BaselineState;
  eloHfa: HistoricalV3BaselineState;
} {
  const rows = buildDevelopmentRowsForAudit(input);
  if (rows.length !== 1484) {
    throw new Error('v3_confirmation_development_count_mismatch');
  }

  const y = rows.map((row) => row.homeMargin);
  const hfaX = rows.map((row) => [1, row.neutralSite ? 0 : 1]);
  const hfaCoefficients = fitRegression(hfaX, y, 0, []);

  const eloScaler = fitEloScaler(rows);
  const eloX = rows.map((row) => {
    if (
      row.home.elo.status !== 'AVAILABLE' ||
      row.away.elo.status !== 'AVAILABLE' ||
      row.home.elo.value === null ||
      row.away.elo.value === null
    ) {
      throw new Error('v3_confirmation_development_elo_missing');
    }
    return [
      1,
      row.neutralSite ? 0 : 1,
      zElo(row.home.elo.value, eloScaler) - zElo(row.away.elo.value, eloScaler),
    ];
  });
  const eloCoefficients = fitRegression(
    eloX,
    y,
    HISTORICAL_V3_CONFIRMATION_ELO_LAMBDA,
    [2]
  );

  const common = {
    trainGameIds: rows.map((row) => row.gameId),
    trainSeasonWeeks: trainSeasonWeeks(rows),
  };

  return {
    hfa: {
      kind: 'HFA_BASELINE',
      lambda: null,
      coefficientOrder: ['intercept', 'homeFieldIndicator'],
      coefficients: hfaCoefficients,
      eloScaler: null,
      ...common,
    },
    eloHfa: {
      kind: 'ELO_HFA_BASELINE',
      lambda: HISTORICAL_V3_CONFIRMATION_ELO_LAMBDA,
      coefficientOrder: ['intercept', 'homeFieldIndicator', 'eloDeltaZ'],
      coefficients: eloCoefficients,
      eloScaler,
      ...common,
    },
  };
}

function assertCandidate(candidate: HistoricalModelV3Candidate): void {
  if (
    candidate.status !== 'HISTORICAL_V3_CANDIDATE_FROZEN' ||
    candidate.modelDefinitionId !== HISTORICAL_MODEL_V3_DEFINITION_ID ||
    candidate.lambda !== HISTORICAL_MODEL_V3_LAMBDA ||
    candidate.coefficientOrder.length !== HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER.length ||
    candidate.coefficients.length !== HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER.length
  ) {
    throw new Error('v3_confirmation_candidate_identity_mismatch');
  }
  for (let i = 0; i < HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER.length; i += 1) {
    if (
      candidate.coefficientOrder[i] !== HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER[i] ||
      !finite(candidate.coefficients[i])
    ) {
      throw new Error('v3_confirmation_candidate_shape_mismatch');
    }
  }
}

function baselineFinite(state: HistoricalV3BaselineState): boolean {
  return (
    state.coefficients.length === state.coefficientOrder.length &&
    state.coefficients.every(finite) &&
    (!state.eloScaler ||
      (finite(state.eloScaler.mean) &&
        finite(state.eloScaler.populationSd) &&
        state.eloScaler.availableCount === 2968))
  );
}

function assertPredictiveRows(rows: HistoricalV3PredictiveGameInput[]): void {
  if (rows.length !== HISTORICAL_V3_CONFIRMATION_EXPECTED_GAMES) {
    throw new Error('v3_confirmation_predictive_count_mismatch');
  }
  const ids = new Set<number>();
  for (const row of rows) {
    if (
      row.season !== 2024 ||
      !Number.isInteger(row.gameId) ||
      !Number.isInteger(row.week) ||
      !row.homeTeam ||
      !row.awayTeam ||
      ids.has(row.gameId)
    ) {
      throw new Error('v3_confirmation_predictive_identity_invalid');
    }
    ids.add(row.gameId);
    for (const name of HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER) {
      if (!finite(row.modelInputs[name])) {
        throw new Error('v3_confirmation_predictor_missing_or_nonfinite');
      }
    }
  }
}

export function buildHistoricalV3PreScoreFreeze(input: {
  candidate: HistoricalModelV3Candidate;
  backcompatStatus: 'HISTORICAL_V3_BACKCOMPAT_PASS' | 'HISTORICAL_V3_BACKCOMPAT_FAILED';
  predictiveRows: HistoricalV3PredictiveGameInput[];
  developmentInput: HistoricalModelDevelopmentInput;
}): HistoricalV3PreScoreFreeze {
  assertCandidate(input.candidate);
  if (input.backcompatStatus !== 'HISTORICAL_V3_BACKCOMPAT_PASS') {
    throw new Error('v3_confirmation_backcompat_not_pass');
  }
  assertPredictiveRows(input.predictiveRows);

  const baselines = fitHistoricalV3ValidationBaselines(input.developmentInput);
  if (!baselineFinite(baselines.hfa) || !baselineFinite(baselines.eloHfa)) {
    throw new Error('v3_confirmation_baseline_nonfinite');
  }

  const counts = {
    returningSides: 0,
    recruitY0Sides: 0,
    recruitY1Sides: 0,
    recruitY2Sides: 0,
    recruitY3Sides: 0,
    naturalFormMissingSides: 0,
    sourceGapFormSides: 0,
  };
  const sourceGapSides: HistoricalV3PreScoreFreeze['sourceGapSides'] = [];

  for (const row of input.predictiveRows) {
    for (const [side, team] of [
      ['HOME', row.home],
      ['AWAY', row.away],
    ] as const) {
      counts.returningSides += team.missingFlags.returning;
      counts.recruitY0Sides += team.missingFlags.recruitY0;
      counts.recruitY1Sides += team.missingFlags.recruitY1;
      counts.recruitY2Sides += team.missingFlags.recruitY2;
      counts.recruitY3Sides += team.missingFlags.recruitY3;
      counts.naturalFormMissingSides += team.missingFlags.formMissing;
      counts.sourceGapFormSides += team.missingFlags.formSourceGap;
      if (team.missingFlags.formSourceGap === 1) {
        sourceGapSides.push({
          gameId: row.gameId,
          week: row.week,
          side,
          team: team.team,
          missingPriorGameIds: [...team.formAudit.missingPriorGameIds],
        });
      }
    }
  }

  sourceGapSides.sort(
    (a, b) =>
      a.week - b.week ||
      a.gameId - b.gameId ||
      (a.side < b.side ? -1 : a.side > b.side ? 1 : 0)
  );

  return {
    version: HISTORICAL_V3_PRESCORE_VERSION,
    status: 'HISTORICAL_V3_PRESCORE_FREEZE_READY',
    season: 2024,
    canonicalGameIds: input.predictiveRows.map((row) => row.gameId).sort((a, b) => a - b),
    canonicalGames: input.predictiveRows.length,
    modelDefinitionId: HISTORICAL_MODEL_V3_DEFINITION_ID,
    lambda: HISTORICAL_MODEL_V3_LAMBDA,
    staticMissingnessCounts: counts,
    sourceGapSides,
    hfaBaseline: baselines.hfa,
    eloHfaBaseline: baselines.eloHfa,
  };
}

function dot(values: number[], coefficients: number[]): number {
  if (values.length !== coefficients.length) {
    throw new Error('v3_confirmation_prediction_dimension_mismatch');
  }
  const result = values.reduce((sum, value, index) => sum + value * coefficients[index], 0);
  if (!finite(result)) throw new Error('v3_confirmation_prediction_nonfinite');
  return result;
}

function metric(
  rows: HistoricalV3PredictionRow[],
  field: 'v3PredictedHomeMargin' | 'eloHfaPredictedHomeMargin' | 'hfaPredictedHomeMargin'
): HistoricalV3Metrics {
  if (rows.length === 0) throw new Error('v3_confirmation_metrics_empty');
  const errors = rows.map((row) => row[field] - row.actualHomeMargin);
  const abs = errors.map(Math.abs).sort((a, b) => a - b);
  const mae = abs.reduce((sum, value) => sum + value, 0) / abs.length;
  const mse = errors.reduce((sum, value) => sum + value ** 2, 0) / errors.length;
  const meanError = errors.reduce((sum, value) => sum + value, 0) / errors.length;
  const mid = Math.floor(abs.length / 2);
  const medianAbsoluteError =
    abs.length % 2 === 0 ? (abs[mid - 1] + abs[mid]) / 2 : abs[mid];
  const actualMean =
    rows.reduce((sum, row) => sum + row.actualHomeMargin, 0) / rows.length;
  const ssRes = errors.reduce((sum, value) => sum + value ** 2, 0);
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

export function scoreHistoricalV3Confirmation(input: {
  candidate: HistoricalModelV3Candidate;
  predictiveRows: HistoricalV3PredictiveGameInput[];
  outcomes: HistoricalV3OutcomeRow[];
  hfaBaseline: HistoricalV3BaselineState;
  eloHfaBaseline: HistoricalV3BaselineState;
  frozenInputIntegrity: boolean;
  marketReads: number;
  holdout2025Reads: number;
}): HistoricalV3ConfirmationResult {
  assertCandidate(input.candidate);
  assertPredictiveRows(input.predictiveRows);

  const blockers: string[] = [];
  if (!input.frozenInputIntegrity) blockers.push('frozen_input_integrity_failed');
  if (input.marketReads !== 0) blockers.push('market_read_detected');
  if (input.holdout2025Reads !== 0) blockers.push('holdout_2025_read_detected');
  if (!baselineFinite(input.hfaBaseline) || !baselineFinite(input.eloHfaBaseline)) {
    blockers.push('baseline_state_invalid');
  }

  const outcomes = new Map<number, HistoricalV3OutcomeRow>();
  for (const row of input.outcomes) {
    if (
      !Number.isInteger(row.gameId) ||
      !row.homeTeam ||
      !row.awayTeam ||
      !finite(row.finalHomePoints) ||
      !finite(row.finalAwayPoints) ||
      !finite(row.homeMargin) ||
      outcomes.has(row.gameId)
    ) {
      blockers.push('outcome_identity_or_value_invalid');
      break;
    }
    outcomes.set(row.gameId, row);
  }
  if (
    input.outcomes.length !== HISTORICAL_V3_CONFIRMATION_EXPECTED_GAMES ||
    outcomes.size !== HISTORICAL_V3_CONFIRMATION_EXPECTED_GAMES
  ) {
    blockers.push('outcome_count_mismatch');
  }

  for (const row of input.predictiveRows) {
    const outcome = outcomes.get(row.gameId);
    if (
      !outcome ||
      outcome.homeTeam !== row.homeTeam ||
      outcome.awayTeam !== row.awayTeam
    ) {
      blockers.push('predictive_outcome_identity_mismatch');
      break;
    }
  }

  if (blockers.length > 0) {
    return {
      version: HISTORICAL_V3_CONFIRMATION_VERSION,
      status: 'HISTORICAL_V3_CONFIRMATION_INPUT_BLOCKED',
      inputBlockers: [...new Set(blockers)],
      predictionRows: [],
      v3Metrics: null,
      eloHfaMetrics: null,
      hfaMetrics: null,
      gateChecks: {
        all752V3Predictions: false,
        all752EloHfaPredictions: false,
        all752HfaPredictions: false,
        v3MaeBeatsHfa: false,
        v3MaeBeatsEloHfa: false,
        v3RmseNoWorseThanEloHfa: false,
        finiteCandidateAndBaselines: false,
        frozenInputIntegrity: input.frozenInputIntegrity,
        marketReadsZero: input.marketReads === 0,
        holdout2025ReadsZero: input.holdout2025Reads === 0,
      },
    };
  }

  const predictions: HistoricalV3PredictionRow[] = input.predictiveRows.map((row) => {
    const outcome = outcomes.get(row.gameId)!;
    const v3 = dot(
      input.candidate.coefficientOrder.map((name) => row.modelInputs[name]),
      input.candidate.coefficients
    );

    const hfaX = [1, row.neutralSite ? 0 : 1];
    const hfa = dot(hfaX, input.hfaBaseline.coefficients);

    const scaler = input.eloHfaBaseline.eloScaler;
    const homeElo = row.home.features.elo.value;
    const awayElo = row.away.features.elo.value;
    if (!scaler || homeElo === null || awayElo === null) {
      throw new Error('v3_confirmation_required_elo_unavailable');
    }
    const eloX = [
      1,
      row.neutralSite ? 0 : 1,
      zElo(homeElo, scaler) - zElo(awayElo, scaler),
    ];
    const eloHfa = dot(eloX, input.eloHfaBaseline.coefficients);

    return {
      gameId: row.gameId,
      week: row.week,
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      actualHomeMargin: outcome.homeMargin,
      v3PredictedHomeMargin: v3,
      eloHfaPredictedHomeMargin: eloHfa,
      hfaPredictedHomeMargin: hfa,
    };
  });

  const v3Metrics = metric(predictions, 'v3PredictedHomeMargin');
  const eloHfaMetrics = metric(predictions, 'eloHfaPredictedHomeMargin');
  const hfaMetrics = metric(predictions, 'hfaPredictedHomeMargin');

  const gateChecks = {
    all752V3Predictions: predictions.length === 752,
    all752EloHfaPredictions: predictions.length === 752,
    all752HfaPredictions: predictions.length === 752,
    v3MaeBeatsHfa: v3Metrics.mae < hfaMetrics.mae,
    v3MaeBeatsEloHfa: v3Metrics.mae < eloHfaMetrics.mae,
    v3RmseNoWorseThanEloHfa: v3Metrics.rmse <= eloHfaMetrics.rmse,
    finiteCandidateAndBaselines:
      input.candidate.coefficients.every(finite) &&
      baselineFinite(input.hfaBaseline) &&
      baselineFinite(input.eloHfaBaseline),
    frozenInputIntegrity: input.frozenInputIntegrity,
    marketReadsZero: input.marketReads === 0,
    holdout2025ReadsZero: input.holdout2025Reads === 0,
  };

  return {
    version: HISTORICAL_V3_CONFIRMATION_VERSION,
    status: Object.values(gateChecks).every(Boolean)
      ? 'HISTORICAL_V3_CONFIRMATION_PASS'
      : 'HISTORICAL_V3_CONFIRMATION_FAIL',
    inputBlockers: [],
    predictionRows: predictions,
    v3Metrics,
    eloHfaMetrics,
    hfaMetrics,
    gateChecks,
  };
}
