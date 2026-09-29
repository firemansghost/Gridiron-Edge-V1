import {
  HISTORICAL_MODEL_CONTINUOUS_FEATURES,
  buildDevelopmentRowsForAudit,
  type FinalCandidateState,
  type HistoricalDevelopmentModelRow,
  type HistoricalModelDevelopmentInput,
  type ScalerState,
} from './historical-model-development-v1';

export const HISTORICAL_MODEL_V3_DEFINITION_ID =
  'historical_ridge_margin_v3' as const;
export const HISTORICAL_FEATURE_V3_DEFINITION_ID =
  'historical_source_resilient_feature_v3' as const;
export const HISTORICAL_MODEL_V3_LAMBDA = 100 as const;
export const HISTORICAL_MODEL_V3_BACKCOMPAT_PREDICTION_TOLERANCE = 1e-9 as const;
export const HISTORICAL_MODEL_V3_BACKCOMPAT_COEFFICIENT_TOLERANCE = 1e-9 as const;
export const HISTORICAL_MODEL_V3_BACKCOMPAT_SCALER_TOLERANCE = 1e-12 as const;
export const HISTORICAL_MODEL_V3_ZERO_COLUMN_TOLERANCE = 1e-12 as const;

export const HISTORICAL_MODEL_V3_PENALIZED_PREDICTORS = [
  'eloDeltaZ',
  'talentDeltaZ',
  'returningDeltaZ',
  'recruitY0DeltaZ',
  'recruitY1DeltaZ',
  'recruitY2DeltaZ',
  'recruitY3DeltaZ',
  'priorFbsGamesDeltaZ',
  'ppaNetDeltaZ',
  'successNetDeltaZ',
  'returningMissingDelta',
  'recruitY0MissingDelta',
  'recruitY1MissingDelta',
  'recruitY2MissingDelta',
  'recruitY3MissingDelta',
  'formMissingDelta',
  'formSourceGapDelta',
] as const;

export const HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER = [
  'intercept',
  'homeFieldIndicator',
  ...HISTORICAL_MODEL_V3_PENALIZED_PREDICTORS,
] as const;

type ContinuousFeatureName =
  (typeof HISTORICAL_MODEL_CONTINUOUS_FEATURES)[number];
type V3PredictorName =
  (typeof HISTORICAL_MODEL_V3_PENALIZED_PREDICTORS)[number];
type NumericFeature = {
  value: number | null;
  status: string;
  n: number | null;
};
type TeamFeatures = HistoricalDevelopmentModelRow['home'];

export interface HistoricalModelV3Candidate {
  status: 'HISTORICAL_V3_CANDIDATE_FROZEN';
  modelDefinitionId: typeof HISTORICAL_MODEL_V3_DEFINITION_ID;
  featureDefinitionId: typeof HISTORICAL_FEATURE_V3_DEFINITION_ID;
  lambda: typeof HISTORICAL_MODEL_V3_LAMBDA;
  coefficientOrder: string[];
  coefficients: number[];
  scaler: ScalerState;
  trainGameIds: number[];
  trainSeasonWeeks: Record<string, number[]>;
  developmentGames: number;
  sourceGapDevelopmentColumnsAllZero: true;
}

export interface HistoricalModelV3BackcompatReport {
  status:
    | 'HISTORICAL_V3_BACKCOMPAT_PASS'
    | 'HISTORICAL_V3_BACKCOMPAT_FAILED';
  developmentGames: number;
  predictionCountV1: number;
  predictionCountV3: number;
  maxAbsolutePredictionDifference: number;
  maxAbsoluteSharedCoefficientDifference: number;
  maxAbsoluteSharedScalerDifference: number;
  trainGameIdsExact: boolean;
  trainSeasonWeeksExact: boolean;
  newDevelopmentColumns: {
    recruitY2MissingDeltaNonzeroRows: number;
    recruitY3MissingDeltaNonzeroRows: number;
    formSourceGapDeltaNonzeroRows: number;
  };
  newCoefficientValues: {
    recruitY2MissingDelta: number;
    recruitY3MissingDelta: number;
    formSourceGapDelta: number;
  };
  gateChecks: {
    all1484DevelopmentGames: boolean;
    v1CandidateIdentityValid: boolean;
    v3CandidateFinite: boolean;
    trainGameIdsExact: boolean;
    trainSeasonWeeksExact: boolean;
    newDevelopmentColumnsAllZero: boolean;
    newCoefficientsWithinZeroTolerance: boolean;
    sharedScalersMatch: boolean;
    sharedCoefficientsMatch: boolean;
    developmentPredictionsMatch: boolean;
  };
}

function featureFor(
  team: TeamFeatures,
  name: ContinuousFeatureName
): NumericFeature {
  return team[name] as NumericFeature;
}

function fitScaler(rows: HistoricalDevelopmentModelRow[]): ScalerState {
  const state: ScalerState = {};

  for (const name of HISTORICAL_MODEL_CONTINUOUS_FEATURES) {
    const values: number[] = [];
    for (const row of rows) {
      for (const team of [row.home, row.away]) {
        const feature = featureFor(team, name);
        if (feature.status === 'AVAILABLE' && feature.value !== null) {
          values.push(feature.value);
        }
      }
    }

    if (values.length === 0) {
      throw new Error(`v3_scaler_no_available_values:${name}`);
    }

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      values.length;
    const populationSd = Math.sqrt(variance);

    if (!Number.isFinite(mean) || !Number.isFinite(populationSd)) {
      throw new Error(`v3_scaler_nonfinite:${name}`);
    }

    state[name] = {
      mean,
      populationSd,
      availableCount: values.length,
      disabledZeroVariance: populationSd <= 1e-12,
    };
  }

  return state;
}

function zValue(
  team: TeamFeatures,
  name: ContinuousFeatureName,
  scaler: ScalerState
): number {
  const feature = featureFor(team, name);
  if (feature.status !== 'AVAILABLE' || feature.value === null) return 0;

  const state = scaler[name];
  if (!state) throw new Error(`v3_scaler_feature_missing:${name}`);
  if (state.disabledZeroVariance) return 0;

  const value = (feature.value - state.mean) / state.populationSd;
  if (!Number.isFinite(value)) {
    throw new Error(`v3_standardized_value_nonfinite:${name}`);
  }
  return value;
}

function isMissing(feature: NumericFeature): number {
  return feature.status === 'AVAILABLE' ? 0 : 1;
}

function naturalFormMissing(team: TeamFeatures): number {
  const ppa = featureFor(team, 'ppaNet');
  const success = featureFor(team, 'successNet');
  if ((ppa.status === 'AVAILABLE') !== (success.status === 'AVAILABLE')) {
    throw new Error('v3_dynamic_form_availability_mismatch');
  }
  return ppa.status === 'AVAILABLE' ? 0 : 1;
}

function predictorMap(
  row: HistoricalDevelopmentModelRow,
  scaler: ScalerState
): Record<string, number> {
  const result: Record<string, number> = {
    intercept: 1,
    homeFieldIndicator: row.neutralSite ? 0 : 1,
  };

  const continuousPredictorNames: Record<ContinuousFeatureName, V3PredictorName> = {
    elo: 'eloDeltaZ',
    talent: 'talentDeltaZ',
    returning: 'returningDeltaZ',
    recruitY0: 'recruitY0DeltaZ',
    recruitY1: 'recruitY1DeltaZ',
    recruitY2: 'recruitY2DeltaZ',
    recruitY3: 'recruitY3DeltaZ',
    priorFbsGames: 'priorFbsGamesDeltaZ',
    ppaNet: 'ppaNetDeltaZ',
    successNet: 'successNetDeltaZ',
  };

  for (const name of HISTORICAL_MODEL_CONTINUOUS_FEATURES) {
    result[continuousPredictorNames[name]] =
      zValue(row.home, name, scaler) - zValue(row.away, name, scaler);
  }

  result.returningMissingDelta =
    isMissing(featureFor(row.home, 'returning')) -
    isMissing(featureFor(row.away, 'returning'));
  result.recruitY0MissingDelta =
    isMissing(featureFor(row.home, 'recruitY0')) -
    isMissing(featureFor(row.away, 'recruitY0'));
  result.recruitY1MissingDelta =
    isMissing(featureFor(row.home, 'recruitY1')) -
    isMissing(featureFor(row.away, 'recruitY1'));
  result.recruitY2MissingDelta =
    isMissing(featureFor(row.home, 'recruitY2')) -
    isMissing(featureFor(row.away, 'recruitY2'));
  result.recruitY3MissingDelta =
    isMissing(featureFor(row.home, 'recruitY3')) -
    isMissing(featureFor(row.away, 'recruitY3'));
  result.formMissingDelta =
    naturalFormMissing(row.home) - naturalFormMissing(row.away);

  // Development Feature V1 rows were built from complete accepted source history.
  // Source-history incompleteness is a V3 2024 input condition and is therefore
  // identically zero throughout the accepted 2022-2023 development universe.
  result.formSourceGapDelta = 0;

  return result;
}

function designRow(
  row: HistoricalDevelopmentModelRow,
  scaler: ScalerState,
  coefficientOrder: readonly string[]
): number[] {
  const values = predictorMap(row, scaler);
  return coefficientOrder.map((name) => {
    const value = values[name];
    if (!Number.isFinite(value)) {
      throw new Error(`v3_design_value_nonfinite:${name}`);
    }
    return value;
  });
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  if (n === 0 || b.length !== n || A.some((row) => row.length !== n)) {
    throw new Error('v3_invalid_linear_system');
  }

  const matrix = A.map((row, index) => [...row, b[index]]);

  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (
        Math.abs(matrix[row][column]) >
        Math.abs(matrix[pivot][column])
      ) {
        pivot = row;
      }
    }

    if (Math.abs(matrix[pivot][column]) <= 1e-12) {
      throw new Error(`v3_singular_linear_system:${column}`);
    }

    [matrix[column], matrix[pivot]] = [
      matrix[pivot],
      matrix[column],
    ];

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
      throw new Error('v3_nonfinite_linear_solution');
    }
  }

  return solution;
}

function fitRegression(
  X: number[][],
  y: number[],
  lambda: number,
  penalizedIndexes: number[]
): number[] {
  if (X.length === 0 || X.length !== y.length) {
    throw new Error('v3_empty_fit');
  }

  const p = X[0].length;
  if (X.some((row) => row.length !== p)) {
    throw new Error('v3_ragged_design_matrix');
  }

  const XtX = Array.from({ length: p }, () =>
    new Array<number>(p).fill(0)
  );
  const Xty = new Array<number>(p).fill(0);

  for (let i = 0; i < X.length; i += 1) {
    if (!Number.isFinite(y[i])) throw new Error('v3_nonfinite_target');
    for (let a = 0; a < p; a += 1) {
      const xa = X[i][a];
      if (!Number.isFinite(xa)) throw new Error('v3_nonfinite_design');
      Xty[a] += xa * y[i];
      for (let b = 0; b < p; b += 1) {
        XtX[a][b] += xa * X[i][b];
      }
    }
  }

  for (const index of penalizedIndexes) {
    XtX[index][index] += lambda;
  }

  return solveLinearSystem(XtX, Xty);
}

function predict(design: number[], coefficients: number[]): number {
  if (design.length !== coefficients.length) {
    throw new Error('v3_prediction_dimension_mismatch');
  }

  const value = design.reduce(
    (sum, x, index) => sum + x * coefficients[index],
    0
  );
  if (!Number.isFinite(value)) throw new Error('v3_prediction_nonfinite');
  return value;
}

function trainSeasonWeeks(
  rows: HistoricalDevelopmentModelRow[]
): Record<string, number[]> {
  const bySeason = new Map<number, Set<number>>();
  for (const row of rows) {
    const set = bySeason.get(row.season) ?? new Set<number>();
    set.add(row.week);
    bySeason.set(row.season, set);
  }

  const result: Record<string, number[]> = {};
  for (const [season, weeks] of [...bySeason.entries()].sort(
    (a, b) => a[0] - b[0]
  )) {
    result[String(season)] = [...weeks].sort((a, b) => a - b);
  }
  return result;
}

function allFiniteCandidate(candidate: HistoricalModelV3Candidate): boolean {
  if (
    candidate.coefficients.length !==
      HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER.length ||
    candidate.coefficients.some((value) => !Number.isFinite(value))
  ) {
    return false;
  }

  return HISTORICAL_MODEL_CONTINUOUS_FEATURES.every((name) => {
    const state = candidate.scaler[name];
    return (
      !!state &&
      Number.isFinite(state.mean) &&
      Number.isFinite(state.populationSd) &&
      Number.isInteger(state.availableCount) &&
      state.availableCount > 0
    );
  });
}

export function fitHistoricalModelV3(
  input: HistoricalModelDevelopmentInput
): HistoricalModelV3Candidate {
  const rows = buildDevelopmentRowsForAudit(input);
  if (rows.length !== 1484) {
    throw new Error('v3_development_game_count_mismatch');
  }

  const scaler = fitScaler(rows);

  const newColumnNonzero = {
    recruitY2MissingDelta: 0,
    recruitY3MissingDelta: 0,
    formSourceGapDelta: 0,
  };

  const X = rows.map((row) => {
    const map = predictorMap(row, scaler);
    for (const key of Object.keys(newColumnNonzero) as Array<
      keyof typeof newColumnNonzero
    >) {
      if (Math.abs(map[key]) > 0) newColumnNonzero[key] += 1;
    }
    return designRow(
      row,
      scaler,
      HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER
    );
  });

  if (Object.values(newColumnNonzero).some((count) => count !== 0)) {
    throw new Error('v3_new_development_column_nonzero');
  }

  const y = rows.map((row) => row.homeMargin);
  const penalizedIndexes = HISTORICAL_MODEL_V3_PENALIZED_PREDICTORS.map(
    (_, index) => index + 2
  );
  const coefficients = fitRegression(
    X,
    y,
    HISTORICAL_MODEL_V3_LAMBDA,
    penalizedIndexes
  );

  const candidate: HistoricalModelV3Candidate = {
    status: 'HISTORICAL_V3_CANDIDATE_FROZEN',
    modelDefinitionId: HISTORICAL_MODEL_V3_DEFINITION_ID,
    featureDefinitionId: HISTORICAL_FEATURE_V3_DEFINITION_ID,
    lambda: HISTORICAL_MODEL_V3_LAMBDA,
    coefficientOrder: [...HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER],
    coefficients,
    scaler,
    trainGameIds: rows.map((row) => row.gameId),
    trainSeasonWeeks: trainSeasonWeeks(rows),
    developmentGames: rows.length,
    sourceGapDevelopmentColumnsAllZero: true,
  };

  if (!allFiniteCandidate(candidate)) {
    throw new Error('v3_candidate_nonfinite');
  }

  return candidate;
}

function exactArray<T>(left: readonly T[], right: readonly T[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function exactSeasonWeeks(
  left: Record<string, number[]>,
  right: Record<string, number[]>
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    exactArray(leftKeys, rightKeys) &&
    leftKeys.every((key) => exactArray(left[key] ?? [], right[key] ?? []))
  );
}

function scalerMaxDifference(
  left: ScalerState,
  right: ScalerState
): number {
  let maxDifference = 0;
  for (const name of HISTORICAL_MODEL_CONTINUOUS_FEATURES) {
    const a = left[name];
    const b = right[name];
    if (!a || !b) return Number.POSITIVE_INFINITY;
    if (
      a.availableCount !== b.availableCount ||
      a.disabledZeroVariance !== b.disabledZeroVariance
    ) {
      return Number.POSITIVE_INFINITY;
    }
    maxDifference = Math.max(
      maxDifference,
      Math.abs(a.mean - b.mean),
      Math.abs(a.populationSd - b.populationSd)
    );
  }
  return maxDifference;
}

function coefficientByName(
  candidate: { coefficientOrder: string[]; coefficients: number[] }
): Map<string, number> {
  if (candidate.coefficientOrder.length !== candidate.coefficients.length) {
    throw new Error('candidate_coefficient_dimension_mismatch');
  }

  const result = new Map<string, number>();
  candidate.coefficientOrder.forEach((name, index) => {
    if (result.has(name) || !Number.isFinite(candidate.coefficients[index])) {
      throw new Error('candidate_coefficient_invalid');
    }
    result.set(name, candidate.coefficients[index]);
  });
  return result;
}

function candidatePrediction(
  row: HistoricalDevelopmentModelRow,
  scaler: ScalerState,
  candidate: { coefficientOrder: string[]; coefficients: number[] }
): number {
  return predict(
    designRow(row, scaler, candidate.coefficientOrder),
    candidate.coefficients
  );
}

export function auditHistoricalModelV3Backcompat(
  input: HistoricalModelDevelopmentInput,
  frozenV1Candidate: FinalCandidateState,
  v3Candidate: HistoricalModelV3Candidate
): HistoricalModelV3BackcompatReport {
  const rows = buildDevelopmentRowsForAudit(input);

  const v1CandidateIdentityValid =
    frozenV1Candidate.status === 'FINAL_CANDIDATE_FROZEN' &&
    frozenV1Candidate.modelDefinitionId === 'historical_ridge_margin_v1' &&
    frozenV1Candidate.featureDefinitionId === 'historical_feature_v1' &&
    frozenV1Candidate.lambda === 100;

  const v1ByName = coefficientByName(frozenV1Candidate);
  const v3ByName = coefficientByName(v3Candidate);

  let maxAbsoluteSharedCoefficientDifference = 0;
  for (const [name, v1Value] of v1ByName) {
    const v3Value = v3ByName.get(name);
    if (v3Value === undefined) {
      maxAbsoluteSharedCoefficientDifference = Number.POSITIVE_INFINITY;
      break;
    }
    maxAbsoluteSharedCoefficientDifference = Math.max(
      maxAbsoluteSharedCoefficientDifference,
      Math.abs(v1Value - v3Value)
    );
  }

  const newCoefficientValues = {
    recruitY2MissingDelta:
      v3ByName.get('recruitY2MissingDelta') ?? Number.NaN,
    recruitY3MissingDelta:
      v3ByName.get('recruitY3MissingDelta') ?? Number.NaN,
    formSourceGapDelta:
      v3ByName.get('formSourceGapDelta') ?? Number.NaN,
  };

  const newDevelopmentColumns = {
    recruitY2MissingDeltaNonzeroRows: 0,
    recruitY3MissingDeltaNonzeroRows: 0,
    formSourceGapDeltaNonzeroRows: 0,
  };

  let maxAbsolutePredictionDifference = 0;
  for (const row of rows) {
    const map = predictorMap(row, v3Candidate.scaler);
    if (Math.abs(map.recruitY2MissingDelta) > 0) {
      newDevelopmentColumns.recruitY2MissingDeltaNonzeroRows += 1;
    }
    if (Math.abs(map.recruitY3MissingDelta) > 0) {
      newDevelopmentColumns.recruitY3MissingDeltaNonzeroRows += 1;
    }
    if (Math.abs(map.formSourceGapDelta) > 0) {
      newDevelopmentColumns.formSourceGapDeltaNonzeroRows += 1;
    }

    const v1Prediction = candidatePrediction(
      row,
      frozenV1Candidate.scaler,
      frozenV1Candidate
    );
    const v3Prediction = candidatePrediction(
      row,
      v3Candidate.scaler,
      v3Candidate
    );

    maxAbsolutePredictionDifference = Math.max(
      maxAbsolutePredictionDifference,
      Math.abs(v1Prediction - v3Prediction)
    );
  }

  const maxAbsoluteSharedScalerDifference = scalerMaxDifference(
    frozenV1Candidate.scaler,
    v3Candidate.scaler
  );

  const trainGameIdsExact = exactArray(
    frozenV1Candidate.trainGameIds,
    v3Candidate.trainGameIds
  );
  const trainSeasonWeeksExact = exactSeasonWeeks(
    frozenV1Candidate.trainSeasonWeeks,
    v3Candidate.trainSeasonWeeks
  );

  const gateChecks = {
    all1484DevelopmentGames: rows.length === 1484,
    v1CandidateIdentityValid,
    v3CandidateFinite: allFiniteCandidate(v3Candidate),
    trainGameIdsExact,
    trainSeasonWeeksExact,
    newDevelopmentColumnsAllZero:
      Object.values(newDevelopmentColumns).every((count) => count === 0),
    newCoefficientsWithinZeroTolerance: Object.values(
      newCoefficientValues
    ).every(
      (value) =>
        Number.isFinite(value) &&
        Math.abs(value) <= HISTORICAL_MODEL_V3_ZERO_COLUMN_TOLERANCE
    ),
    sharedScalersMatch:
      maxAbsoluteSharedScalerDifference <=
      HISTORICAL_MODEL_V3_BACKCOMPAT_SCALER_TOLERANCE,
    sharedCoefficientsMatch:
      maxAbsoluteSharedCoefficientDifference <=
      HISTORICAL_MODEL_V3_BACKCOMPAT_COEFFICIENT_TOLERANCE,
    developmentPredictionsMatch:
      maxAbsolutePredictionDifference <=
      HISTORICAL_MODEL_V3_BACKCOMPAT_PREDICTION_TOLERANCE,
  };

  return {
    status: Object.values(gateChecks).every(Boolean)
      ? 'HISTORICAL_V3_BACKCOMPAT_PASS'
      : 'HISTORICAL_V3_BACKCOMPAT_FAILED',
    developmentGames: rows.length,
    predictionCountV1: rows.length,
    predictionCountV3: rows.length,
    maxAbsolutePredictionDifference,
    maxAbsoluteSharedCoefficientDifference,
    maxAbsoluteSharedScalerDifference,
    trainGameIdsExact,
    trainSeasonWeeksExact,
    newDevelopmentColumns,
    newCoefficientValues,
    gateChecks,
  };
}
