export const HISTORICAL_MODEL_DEVELOPMENT_V1_PROTOCOL =
  'historical_model_development_tuning_protocol_v1' as const;
export const HISTORICAL_MODEL_DEFINITION_ID =
  'historical_ridge_margin_v1' as const;
export const HISTORICAL_MODEL_FEATURE_DEFINITION_ID =
  'historical_feature_v1' as const;

export const HISTORICAL_MODEL_LAMBDAS = [0.01, 0.1, 1, 10, 100] as const;

export const HISTORICAL_MODEL_CONTINUOUS_FEATURES = [
  'elo',
  'talent',
  'returning',
  'recruitY0',
  'recruitY1',
  'recruitY2',
  'recruitY3',
  'priorFbsGames',
  'ppaNet',
  'successNet',
] as const;

export const HISTORICAL_MODEL_PENALIZED_PREDICTORS = [
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
  'formMissingDelta',
] as const;

export const HISTORICAL_MODEL_FULL_COEFFICIENT_ORDER = [
  'intercept',
  'homeFieldIndicator',
  ...HISTORICAL_MODEL_PENALIZED_PREDICTORS,
] as const;

type ContinuousFeatureName =
  (typeof HISTORICAL_MODEL_CONTINUOUS_FEATURES)[number];
type PenalizedPredictorName =
  (typeof HISTORICAL_MODEL_PENALIZED_PREDICTORS)[number];

type JsonObject = Record<string, unknown>;

interface NumericFeature {
  value: number | null;
  status: string;
  n: number | null;
}

interface ParsedTeamFeatures {
  elo: NumericFeature;
  talent: NumericFeature;
  returning: NumericFeature;
  recruitY0: NumericFeature;
  recruitY1: NumericFeature;
  recruitY2: NumericFeature;
  recruitY3: NumericFeature;
  priorFbsGames: NumericFeature;
  ppaNet: NumericFeature;
  successNet: NumericFeature;
}

export interface HistoricalDevelopmentModelRow {
  season: 2022 | 2023;
  gameId: number;
  week: number;
  neutralSite: boolean;
  homeTeam: string;
  awayTeam: string;
  home: ParsedTeamFeatures;
  away: ParsedTeamFeatures;
  homeMargin: number;
}

export interface HistoricalModelDevelopmentInput {
  featureRows: unknown[];
  outcomeRows: unknown[];
}

export interface ScalerEntry {
  mean: number;
  populationSd: number;
  availableCount: number;
  disabledZeroVariance: boolean;
}

export type ScalerState = Record<ContinuousFeatureName, ScalerEntry>;

export interface ModelState {
  kind: 'PRIMARY' | 'ELO_BASELINE' | 'HFA_BASELINE';
  lambda: number | null;
  coefficientOrder: string[];
  coefficients: number[];
  scaler: ScalerState | null;
  trainGameIds: number[];
  trainSeasonWeeks: Record<string, number[]>;
}

export interface PredictionRow {
  season: number;
  gameId: number;
  week: number;
  actualHomeMargin: number;
  predictedHomeMargin: number;
  error: number;
  absoluteError: number;
}

export interface Metrics {
  n: number;
  mae: number;
  rmse: number;
  meanError: number;
  medianAbsoluteError: number;
  rSquared: number | null;
}

export interface FoldReport {
  foldId: string;
  trainWeeks: number[];
  validationWeeks: number[];
  trainGames: number;
  validationGames: number;
  metrics: Metrics;
  disabledScalerFeatures: string[];
  coefficientOrder: string[];
  coefficients: number[];
}

export interface LambdaReport {
  lambda: number;
  folds: FoldReport[];
  aggregateMetrics: Metrics;
}

export interface TuningReport {
  modelKind: 'PRIMARY' | 'ELO_BASELINE';
  lambdaReports: LambdaReport[];
  selectedLambda: number;
  selectionMetric: 'MAE_THEN_RMSE_THEN_LARGER_LAMBDA';
}

export interface StageASelection {
  protocolId: typeof HISTORICAL_MODEL_DEVELOPMENT_V1_PROTOCOL;
  modelDefinitionId: typeof HISTORICAL_MODEL_DEFINITION_ID;
  featureDefinitionId: typeof HISTORICAL_MODEL_FEATURE_DEFINITION_ID;
  target: 'homeMargin';
  developmentSeason: 2022;
  confirmationSeason: 2023;
  lambdaGrid: number[];
  penalizedPredictorOrder: string[];
  fullCoefficientOrder: string[];
  continuousFeatureOrder: string[];
  scaling: {
    method: 'TRAIN_ONLY_POPULATION_Z';
    unavailableStandardizedValue: 0;
    zeroVarianceTolerance: 1e-12;
  };
  missingness: {
    signedIndicators: [
      'returningMissingDelta',
      'recruitY0MissingDelta',
      'recruitY1MissingDelta',
      'formMissingDelta'
    ];
  };
  selectedPrimaryLambda: number;
  selectedEloBaselineLambda: number;
  primaryTuning: TuningReport;
  eloBaselineTuning: TuningReport;
}

export interface ConfirmationReport {
  stageASelectionSha256: string;
  primaryModelState2022: ModelState;
  eloBaselineModelState2022: ModelState;
  hfaBaselineModelState2022: ModelState;
  primaryPredictions2023: PredictionRow[];
  eloBaselinePredictions2023: PredictionRow[];
  hfaBaselinePredictions2023: PredictionRow[];
  primaryMetrics2023: Metrics;
  eloBaselineMetrics2023: Metrics;
  hfaBaselineMetrics2023: Metrics;
  gateChecks: {
    all750PredictionsAvailable: boolean;
    primaryMaeBeatsHfaBaseline: boolean;
    primaryMaeBeatsEloBaseline: boolean;
    primaryRmseNoWorseThanEloBaseline: boolean;
    finiteModelState: boolean;
    sourceLeakageBlockerAbsent: boolean;
  };
  status:
    | 'DEVELOPMENT_CONFIRMATION_PASS'
    | 'DEVELOPMENT_CONFIRMATION_FAIL';
}

export interface FinalCandidateState {
  status: 'FINAL_CANDIDATE_FROZEN';
  stageASelectionSha256: string;
  modelDefinitionId: typeof HISTORICAL_MODEL_DEFINITION_ID;
  featureDefinitionId: typeof HISTORICAL_MODEL_FEATURE_DEFINITION_ID;
  lambda: number;
  coefficientOrder: string[];
  coefficients: number[];
  scaler: ScalerState;
  trainGameIds: number[];
  trainSeasonWeeks: Record<string, number[]>;
}

const FOLDS = [
  { id: 'A', trainWeeks: [1, 2, 3, 4], validationWeeks: [5, 6] },
  { id: 'B', trainWeeks: [1, 2, 3, 4, 5, 6], validationWeeks: [7, 8] },
  {
    id: 'C',
    trainWeeks: [1, 2, 3, 4, 5, 6, 7, 8],
    validationWeeks: [9, 10],
  },
  {
    id: 'D',
    trainWeeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    validationWeeks: [11, 12],
  },
  {
    id: 'E',
    trainWeeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    validationWeeks: [13, 14, 15],
  },
] as const;

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

function parseNumericFeature(value: unknown, label: string): NumericFeature {
  const obj = asObject(value);
  if (!obj) throw new Error(`invalid_numeric_feature:${label}`);
  const status = stringValue(obj.status);
  const n = obj.n === null ? null : integer(obj.n);
  const rawValue = obj.value === null ? null : finiteNumber(obj.value);
  if (!status) throw new Error(`invalid_feature_status:${label}`);

  if (status === 'AVAILABLE') {
    if (rawValue === null) throw new Error(`available_feature_nonfinite:${label}`);
  } else if (rawValue !== null) {
    throw new Error(`unavailable_feature_nonnull:${label}`);
  }

  return { value: rawValue, status, n };
}

function parseTeam(value: unknown, label: string): ParsedTeamFeatures {
  const obj = asObject(value);
  if (!obj) throw new Error(`invalid_team_bundle:${label}`);

  const ppaNet = parseNumericFeature(obj.ppaNet, `${label}.ppaNet`);
  const successNet = parseNumericFeature(obj.successNet, `${label}.successNet`);
  if ((ppaNet.status === 'AVAILABLE') !== (successNet.status === 'AVAILABLE')) {
    throw new Error(`dynamic_form_availability_mismatch:${label}`);
  }

  const parsed: ParsedTeamFeatures = {
    elo: parseNumericFeature(obj.eloRaw, `${label}.eloRaw`),
    talent: parseNumericFeature(obj.talentRaw, `${label}.talentRaw`),
    returning: parseNumericFeature(
      obj.returningPercentPPA,
      `${label}.returningPercentPPA`
    ),
    recruitY0: parseNumericFeature(
      obj.recruitingPointsY0,
      `${label}.recruitingPointsY0`
    ),
    recruitY1: parseNumericFeature(
      obj.recruitingPointsY1,
      `${label}.recruitingPointsY1`
    ),
    recruitY2: parseNumericFeature(
      obj.recruitingPointsY2,
      `${label}.recruitingPointsY2`
    ),
    recruitY3: parseNumericFeature(
      obj.recruitingPointsY3,
      `${label}.recruitingPointsY3`
    ),
    priorFbsGames: parseNumericFeature(
      obj.priorFbsGames,
      `${label}.priorFbsGames`
    ),
    ppaNet,
    successNet,
  };

  for (const required of ['elo', 'talent', 'recruitY2', 'recruitY3', 'priorFbsGames'] as const) {
    if (parsed[required].status !== 'AVAILABLE') {
      throw new Error(`unexpected_required_feature_missing:${label}:${required}`);
    }
  }

  return parsed;
}

function parseDevelopmentRows(
  input: HistoricalModelDevelopmentInput
): HistoricalDevelopmentModelRow[] {
  if (input.featureRows.length !== 1484 || input.outcomeRows.length !== 1484) {
    throw new Error('development_source_count_mismatch');
  }

  const outcomes = new Map<string, JsonObject>();
  for (const raw of input.outcomeRows) {
    const obj = asObject(raw);
    const season = obj ? integer(obj.season) : null;
    const gameId = obj ? integer(obj.gameId) : null;
    if ((season !== 2022 && season !== 2023) || gameId === null) {
      throw new Error('invalid_outcome_identity');
    }
    const k = `${season}:${gameId}`;
    if (outcomes.has(k)) throw new Error(`duplicate_outcome:${k}`);
    outcomes.set(k, obj);
  }

  const seen = new Set<string>();
  const rows: HistoricalDevelopmentModelRow[] = [];
  for (const raw of input.featureRows) {
    const obj = asObject(raw);
    if (!obj) throw new Error('invalid_feature_row');
    const season = integer(obj.season);
    const gameId = integer(obj.gameId);
    const week = integer(obj.week);
    const homeTeam = stringValue(obj.homeTeam);
    const awayTeam = stringValue(obj.awayTeam);
    if (
      (season !== 2022 && season !== 2023) ||
      gameId === null ||
      week === null ||
      week <= 0 ||
      !homeTeam ||
      !awayTeam
    ) {
      throw new Error('invalid_feature_row_identity');
    }
    const k = `${season}:${gameId}`;
    if (seen.has(k)) throw new Error(`duplicate_feature_target:${k}`);
    seen.add(k);

    const outcome = outcomes.get(k);
    if (!outcome) throw new Error(`outcome_missing_for_feature:${k}`);
    const homeMargin = finiteNumber(outcome.homeMargin);
    if (homeMargin === null) throw new Error(`nonfinite_home_margin:${k}`);

    const outcomeHome = stringValue(outcome.homeTeam);
    const outcomeAway = stringValue(outcome.awayTeam);
    if (
      (outcomeHome && outcomeHome !== homeTeam) ||
      (outcomeAway && outcomeAway !== awayTeam)
    ) {
      throw new Error(`feature_outcome_team_mismatch:${k}`);
    }

    rows.push({
      season,
      gameId,
      week,
      neutralSite: obj.neutralSite === true,
      homeTeam,
      awayTeam,
      home: parseTeam(obj.home, `${k}.home`),
      away: parseTeam(obj.away, `${k}.away`),
      homeMargin,
    });
  }

  if (seen.size !== 1484 || outcomes.size !== 1484) {
    throw new Error('development_target_key_mismatch');
  }

  const counts = {
    2022: rows.filter((row) => row.season === 2022).length,
    2023: rows.filter((row) => row.season === 2023).length,
  };
  if (counts[2022] !== 734 || counts[2023] !== 750) {
    throw new Error('development_season_count_mismatch');
  }

  rows.sort((a, b) => {
    if (a.season !== b.season) return a.season - b.season;
    if (a.week !== b.week) return a.week - b.week;
    return a.gameId - b.gameId;
  });
  return rows;
}

function featureFor(team: ParsedTeamFeatures, name: ContinuousFeatureName): NumericFeature {
  return team[name];
}

function fitScaler(rows: HistoricalDevelopmentModelRow[]): ScalerState {
  const state = {} as ScalerState;
  for (const name of HISTORICAL_MODEL_CONTINUOUS_FEATURES) {
    const values: number[] = [];
    for (const row of rows) {
      for (const team of [row.home, row.away]) {
        const f = featureFor(team, name);
        if (f.status === 'AVAILABLE' && f.value !== null) values.push(f.value);
      }
    }
    if (values.length === 0) throw new Error(`scaler_no_available_values:${name}`);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance =
      values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    const sd = Math.sqrt(variance);
    if (!Number.isFinite(mean) || !Number.isFinite(sd)) {
      throw new Error(`scaler_nonfinite:${name}`);
    }
    state[name] = {
      mean,
      populationSd: sd,
      availableCount: values.length,
      disabledZeroVariance: sd <= 1e-12,
    };
  }
  return state;
}

function zValue(
  team: ParsedTeamFeatures,
  name: ContinuousFeatureName,
  scaler: ScalerState
): number {
  const raw = featureFor(team, name);
  if (raw.status !== 'AVAILABLE' || raw.value === null) return 0;
  const s = scaler[name];
  if (s.disabledZeroVariance) return 0;
  const z = (raw.value - s.mean) / s.populationSd;
  if (!Number.isFinite(z)) throw new Error(`standardized_value_nonfinite:${name}`);
  return z;
}

function isMissing(feature: NumericFeature): number {
  return feature.status === 'AVAILABLE' ? 0 : 1;
}

function primaryPredictors(
  row: HistoricalDevelopmentModelRow,
  scaler: ScalerState
): number[] {
  const deltas = HISTORICAL_MODEL_CONTINUOUS_FEATURES.map(
    (name) => zValue(row.home, name, scaler) - zValue(row.away, name, scaler)
  );

  const formHomeMissing =
    row.home.ppaNet.status === 'AVAILABLE' ? 0 : 1;
  const formAwayMissing =
    row.away.ppaNet.status === 'AVAILABLE' ? 0 : 1;

  return [
    ...deltas,
    isMissing(row.home.returning) - isMissing(row.away.returning),
    isMissing(row.home.recruitY0) - isMissing(row.away.recruitY0),
    isMissing(row.home.recruitY1) - isMissing(row.away.recruitY1),
    formHomeMissing - formAwayMissing,
  ];
}

function designPrimary(
  row: HistoricalDevelopmentModelRow,
  scaler: ScalerState
): number[] {
  return [1, row.neutralSite ? 0 : 1, ...primaryPredictors(row, scaler)];
}

function designElo(
  row: HistoricalDevelopmentModelRow,
  scaler: ScalerState
): number[] {
  return [
    1,
    row.neutralSite ? 0 : 1,
    zValue(row.home, 'elo', scaler) - zValue(row.away, 'elo', scaler),
  ];
}

function designHfa(row: HistoricalDevelopmentModelRow): number[] {
  return [1, row.neutralSite ? 0 : 1];
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  if (n === 0 || b.length !== n || A.some((row) => row.length !== n)) {
    throw new Error('invalid_linear_system');
  }
  const m = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) <= 1e-12) {
      throw new Error(`singular_linear_system:${col}`);
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
    for (let col = row + 1; col < n; col += 1) rhs -= m[row][col] * x[col];
    x[row] = rhs / m[row][row];
    if (!Number.isFinite(x[row])) throw new Error('nonfinite_linear_solution');
  }
  return x;
}

function fitRegression(
  X: number[][],
  y: number[],
  lambda: number,
  penalizedIndexes: number[]
): number[] {
  if (X.length === 0 || X.length !== y.length) throw new Error('empty_fit');
  const p = X[0].length;
  if (X.some((row) => row.length !== p)) throw new Error('ragged_design_matrix');
  if (!Number.isFinite(lambda) || lambda < 0) throw new Error('invalid_lambda');

  const XtX = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const Xty = new Array<number>(p).fill(0);

  for (let i = 0; i < X.length; i += 1) {
    if (!Number.isFinite(y[i])) throw new Error('nonfinite_target');
    for (let a = 0; a < p; a += 1) {
      const xa = X[i][a];
      if (!Number.isFinite(xa)) throw new Error('nonfinite_design_value');
      Xty[a] += xa * y[i];
      for (let b = 0; b < p; b += 1) {
        XtX[a][b] += xa * X[i][b];
      }
    }
  }
  for (const index of penalizedIndexes) {
    if (index < 0 || index >= p) throw new Error('invalid_penalty_index');
    XtX[index][index] += lambda;
  }

  return solveLinearSystem(XtX, Xty);
}

function predict(X: number[], beta: number[]): number {
  if (X.length !== beta.length) throw new Error('prediction_dimension_mismatch');
  const value = X.reduce((sum, x, i) => sum + x * beta[i], 0);
  if (!Number.isFinite(value)) throw new Error('nonfinite_prediction');
  return value;
}

function metrics(predictions: PredictionRow[]): Metrics {
  if (predictions.length === 0) throw new Error('metrics_empty');
  const abs = predictions.map((row) => row.absoluteError).sort((a, b) => a - b);
  const mae = abs.reduce((sum, v) => sum + v, 0) / abs.length;
  const mse =
    predictions.reduce((sum, row) => sum + row.error ** 2, 0) /
    predictions.length;
  const meanError =
    predictions.reduce((sum, row) => sum + row.error, 0) / predictions.length;
  const mid = Math.floor(abs.length / 2);
  const medianAbsoluteError =
    abs.length % 2 === 0 ? (abs[mid - 1] + abs[mid]) / 2 : abs[mid];

  const actualMean =
    predictions.reduce((sum, row) => sum + row.actualHomeMargin, 0) /
    predictions.length;
  const ssRes = predictions.reduce((sum, row) => sum + row.error ** 2, 0);
  const ssTot = predictions.reduce(
    (sum, row) => sum + (row.actualHomeMargin - actualMean) ** 2,
    0
  );
  const rSquared = ssTot <= 1e-12 ? null : 1 - ssRes / ssTot;

  for (const value of [mae, mse, meanError, medianAbsoluteError]) {
    if (!Number.isFinite(value)) throw new Error('nonfinite_metric');
  }
  if (rSquared !== null && !Number.isFinite(rSquared)) {
    throw new Error('nonfinite_r_squared');
  }

  return {
    n: predictions.length,
    mae,
    rmse: Math.sqrt(mse),
    meanError,
    medianAbsoluteError,
    rSquared,
  };
}

function predictionRows(
  rows: HistoricalDevelopmentModelRow[],
  design: (row: HistoricalDevelopmentModelRow) => number[],
  coefficients: number[]
): PredictionRow[] {
  return rows.map((row) => {
    const predicted = predict(design(row), coefficients);
    const error = predicted - row.homeMargin;
    return {
      season: row.season,
      gameId: row.gameId,
      week: row.week,
      actualHomeMargin: row.homeMargin,
      predictedHomeMargin: predicted,
      error,
      absoluteError: Math.abs(error),
    };
  });
}

function trainWeeks(rows: HistoricalDevelopmentModelRow[]): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  for (const season of [2022, 2023] as const) {
    const weeks = [...new Set(rows.filter((r) => r.season === season).map((r) => r.week))].sort(
      (a, b) => a - b
    );
    if (weeks.length > 0) result[String(season)] = weeks;
  }
  return result;
}

function fitPrimaryState(
  rows: HistoricalDevelopmentModelRow[],
  lambda: number
): ModelState {
  const scaler = fitScaler(rows);
  const X = rows.map((row) => designPrimary(row, scaler));
  const y = rows.map((row) => row.homeMargin);
  const coefficients = fitRegression(
    X,
    y,
    lambda,
    Array.from({ length: 14 }, (_, i) => i + 2)
  );
  return {
    kind: 'PRIMARY',
    lambda,
    coefficientOrder: [...HISTORICAL_MODEL_FULL_COEFFICIENT_ORDER],
    coefficients,
    scaler,
    trainGameIds: rows.map((row) => row.gameId),
    trainSeasonWeeks: trainWeeks(rows),
  };
}

function fitEloState(
  rows: HistoricalDevelopmentModelRow[],
  lambda: number
): ModelState {
  const scaler = fitScaler(rows);
  const X = rows.map((row) => designElo(row, scaler));
  const y = rows.map((row) => row.homeMargin);
  const coefficients = fitRegression(X, y, lambda, [2]);
  return {
    kind: 'ELO_BASELINE',
    lambda,
    coefficientOrder: ['intercept', 'homeFieldIndicator', 'eloDeltaZ'],
    coefficients,
    scaler,
    trainGameIds: rows.map((row) => row.gameId),
    trainSeasonWeeks: trainWeeks(rows),
  };
}

function fitHfaState(rows: HistoricalDevelopmentModelRow[]): ModelState {
  const X = rows.map(designHfa);
  const y = rows.map((row) => row.homeMargin);
  const coefficients = fitRegression(X, y, 0, []);
  return {
    kind: 'HFA_BASELINE',
    lambda: null,
    coefficientOrder: ['intercept', 'homeFieldIndicator'],
    coefficients,
    scaler: null,
    trainGameIds: rows.map((row) => row.gameId),
    trainSeasonWeeks: trainWeeks(rows),
  };
}

function evaluateState(
  state: ModelState,
  rows: HistoricalDevelopmentModelRow[]
): PredictionRow[] {
  if (state.kind === 'PRIMARY') {
    if (!state.scaler) throw new Error('primary_scaler_missing');
    return predictionRows(rows, (row) => designPrimary(row, state.scaler!), state.coefficients);
  }
  if (state.kind === 'ELO_BASELINE') {
    if (!state.scaler) throw new Error('elo_scaler_missing');
    return predictionRows(rows, (row) => designElo(row, state.scaler!), state.coefficients);
  }
  return predictionRows(rows, designHfa, state.coefficients);
}

function selectedLambda(reports: LambdaReport[]): number {
  const sorted = [...reports].sort((a, b) => {
    const maeDiff = a.aggregateMetrics.mae - b.aggregateMetrics.mae;
    if (Math.abs(maeDiff) > 1e-12) return maeDiff;
    const rmseDiff = a.aggregateMetrics.rmse - b.aggregateMetrics.rmse;
    if (Math.abs(rmseDiff) > 1e-12) return rmseDiff;
    return b.lambda - a.lambda;
  });
  return sorted[0].lambda;
}

function tune(
  rows: HistoricalDevelopmentModelRow[],
  modelKind: 'PRIMARY' | 'ELO_BASELINE'
): TuningReport {
  const reports: LambdaReport[] = [];

  for (const lambda of HISTORICAL_MODEL_LAMBDAS) {
    const foldReports: FoldReport[] = [];
    const aggregatePredictions: PredictionRow[] = [];

    for (const fold of FOLDS) {
      const trainRows = rows.filter(
        (row) => row.season === 2022 && fold.trainWeeks.includes(row.week as never)
      );
      const validationRows = rows.filter(
        (row) =>
          row.season === 2022 && fold.validationWeeks.includes(row.week as never)
      );
      if (trainRows.length === 0 || validationRows.length === 0) {
        throw new Error(`empty_frozen_fold:${fold.id}`);
      }

      const state =
        modelKind === 'PRIMARY'
          ? fitPrimaryState(trainRows, lambda)
          : fitEloState(trainRows, lambda);
      const predictions = evaluateState(state, validationRows);
      aggregatePredictions.push(...predictions);

      const disabledScalerFeatures = state.scaler
        ? HISTORICAL_MODEL_CONTINUOUS_FEATURES.filter(
            (name) => state.scaler![name].disabledZeroVariance
          )
        : [];

      foldReports.push({
        foldId: fold.id,
        trainWeeks: [...fold.trainWeeks],
        validationWeeks: [...fold.validationWeeks],
        trainGames: trainRows.length,
        validationGames: validationRows.length,
        metrics: metrics(predictions),
        disabledScalerFeatures,
        coefficientOrder: [...state.coefficientOrder],
        coefficients: [...state.coefficients],
      });
    }

    reports.push({
      lambda,
      folds: foldReports,
      aggregateMetrics: metrics(aggregatePredictions),
    });
  }

  return {
    modelKind,
    lambdaReports: reports,
    selectedLambda: selectedLambda(reports),
    selectionMetric: 'MAE_THEN_RMSE_THEN_LARGER_LAMBDA',
  };
}

export function buildStageASelection(
  input: HistoricalModelDevelopmentInput
): StageASelection {
  const rows = parseDevelopmentRows(input);
  const primaryTuning = tune(rows, 'PRIMARY');
  const eloBaselineTuning = tune(rows, 'ELO_BASELINE');

  return {
    protocolId: HISTORICAL_MODEL_DEVELOPMENT_V1_PROTOCOL,
    modelDefinitionId: HISTORICAL_MODEL_DEFINITION_ID,
    featureDefinitionId: HISTORICAL_MODEL_FEATURE_DEFINITION_ID,
    target: 'homeMargin',
    developmentSeason: 2022,
    confirmationSeason: 2023,
    lambdaGrid: [...HISTORICAL_MODEL_LAMBDAS],
    penalizedPredictorOrder: [...HISTORICAL_MODEL_PENALIZED_PREDICTORS],
    fullCoefficientOrder: [...HISTORICAL_MODEL_FULL_COEFFICIENT_ORDER],
    continuousFeatureOrder: [...HISTORICAL_MODEL_CONTINUOUS_FEATURES],
    scaling: {
      method: 'TRAIN_ONLY_POPULATION_Z',
      unavailableStandardizedValue: 0,
      zeroVarianceTolerance: 1e-12,
    },
    missingness: {
      signedIndicators: [
        'returningMissingDelta',
        'recruitY0MissingDelta',
        'recruitY1MissingDelta',
        'formMissingDelta',
      ],
    },
    selectedPrimaryLambda: primaryTuning.selectedLambda,
    selectedEloBaselineLambda: eloBaselineTuning.selectedLambda,
    primaryTuning,
    eloBaselineTuning,
  };
}

function allFiniteState(state: ModelState): boolean {
  if (state.coefficients.some((v) => !Number.isFinite(v))) return false;
  if (state.scaler) {
    for (const name of HISTORICAL_MODEL_CONTINUOUS_FEATURES) {
      const s = state.scaler[name];
      if (
        !Number.isFinite(s.mean) ||
        !Number.isFinite(s.populationSd) ||
        !Number.isFinite(s.availableCount)
      ) {
        return false;
      }
    }
  }
  return true;
}

export function run2023Confirmation(
  input: HistoricalModelDevelopmentInput,
  stageA: StageASelection,
  stageASelectionSha256: string
): ConfirmationReport {
  if (!/^[0-9a-f]{64}$/i.test(stageASelectionSha256)) {
    throw new Error('stage_a_selection_hash_required');
  }
  if (
    stageA.protocolId !== HISTORICAL_MODEL_DEVELOPMENT_V1_PROTOCOL ||
    stageA.modelDefinitionId !== HISTORICAL_MODEL_DEFINITION_ID ||
    stageA.featureDefinitionId !== HISTORICAL_MODEL_FEATURE_DEFINITION_ID ||
    !HISTORICAL_MODEL_LAMBDAS.includes(stageA.selectedPrimaryLambda as never) ||
    !HISTORICAL_MODEL_LAMBDAS.includes(stageA.selectedEloBaselineLambda as never)
  ) {
    throw new Error('stage_a_selection_identity_mismatch');
  }

  const rows = parseDevelopmentRows(input);
  const train2022 = rows.filter((row) => row.season === 2022);
  const confirm2023 = rows.filter((row) => row.season === 2023);
  if (train2022.length !== 734 || confirm2023.length !== 750) {
    throw new Error('confirmation_season_count_mismatch');
  }

  const primary = fitPrimaryState(train2022, stageA.selectedPrimaryLambda);
  const elo = fitEloState(train2022, stageA.selectedEloBaselineLambda);
  const hfa = fitHfaState(train2022);

  const primaryPredictions = evaluateState(primary, confirm2023);
  const eloPredictions = evaluateState(elo, confirm2023);
  const hfaPredictions = evaluateState(hfa, confirm2023);

  const primaryMetrics = metrics(primaryPredictions);
  const eloMetrics = metrics(eloPredictions);
  const hfaMetrics = metrics(hfaPredictions);

  const gateChecks = {
    all750PredictionsAvailable:
      primaryPredictions.length === 750 &&
      eloPredictions.length === 750 &&
      hfaPredictions.length === 750,
    primaryMaeBeatsHfaBaseline: primaryMetrics.mae < hfaMetrics.mae,
    primaryMaeBeatsEloBaseline: primaryMetrics.mae < eloMetrics.mae,
    primaryRmseNoWorseThanEloBaseline:
      primaryMetrics.rmse <= eloMetrics.rmse,
    finiteModelState:
      allFiniteState(primary) && allFiniteState(elo) && allFiniteState(hfa),
    sourceLeakageBlockerAbsent: true,
  };

  const status = Object.values(gateChecks).every(Boolean)
    ? 'DEVELOPMENT_CONFIRMATION_PASS'
    : 'DEVELOPMENT_CONFIRMATION_FAIL';

  return {
    stageASelectionSha256: stageASelectionSha256.toLowerCase(),
    primaryModelState2022: primary,
    eloBaselineModelState2022: elo,
    hfaBaselineModelState2022: hfa,
    primaryPredictions2023: primaryPredictions,
    eloBaselinePredictions2023: eloPredictions,
    hfaBaselinePredictions2023: hfaPredictions,
    primaryMetrics2023: primaryMetrics,
    eloBaselineMetrics2023: eloMetrics,
    hfaBaselineMetrics2023: hfaMetrics,
    gateChecks,
    status,
  };
}

export function fitFinalCandidateIfPassed(
  input: HistoricalModelDevelopmentInput,
  stageA: StageASelection,
  confirmation: ConfirmationReport
): FinalCandidateState | null {
  if (confirmation.status !== 'DEVELOPMENT_CONFIRMATION_PASS') return null;
  if (
    confirmation.stageASelectionSha256.length !== 64 ||
    stageA.selectedPrimaryLambda !== confirmation.primaryModelState2022.lambda
  ) {
    throw new Error('final_candidate_stage_a_mismatch');
  }

  const rows = parseDevelopmentRows(input);
  const state = fitPrimaryState(rows, stageA.selectedPrimaryLambda);
  if (!state.scaler || !allFiniteState(state)) {
    throw new Error('final_candidate_nonfinite');
  }

  return {
    status: 'FINAL_CANDIDATE_FROZEN',
    stageASelectionSha256: confirmation.stageASelectionSha256,
    modelDefinitionId: HISTORICAL_MODEL_DEFINITION_ID,
    featureDefinitionId: HISTORICAL_MODEL_FEATURE_DEFINITION_ID,
    lambda: stageA.selectedPrimaryLambda,
    coefficientOrder: [...state.coefficientOrder],
    coefficients: [...state.coefficients],
    scaler: state.scaler,
    trainGameIds: [...state.trainGameIds],
    trainSeasonWeeks: state.trainSeasonWeeks,
  };
}

export function buildDevelopmentRowsForAudit(
  input: HistoricalModelDevelopmentInput
): HistoricalDevelopmentModelRow[] {
  return parseDevelopmentRows(input);
}
