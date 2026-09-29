import {
  HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER,
  HISTORICAL_MODEL_V3_PENALIZED_PREDICTORS,
  auditHistoricalModelV3Backcompat,
  fitHistoricalModelV3,
} from '../src/research/historical-model-v3';
import type {
  FinalCandidateState,
  HistoricalModelDevelopmentInput,
} from '../src/research/historical-model-development-v1';

function available(value: number, n: number | null = null) {
  return { value, status: 'AVAILABLE', n };
}

function unavailable(status = 'SOURCE_ROW_UNAVAILABLE') {
  return { value: null, status, n: null };
}

function featureRow(
  season: 2022 | 2023,
  index: number,
  week: number
): unknown {
  const gameId = season * 1_000_000 + index + 1;
  const neutralSite = index % 5 === 0;
  const base = 1 + (index % 37) * 0.17 + (season - 2022) * 0.03;

  const team = (side: 'home' | 'away') => {
    const sign = side === 'home' ? 1 : -1;
    const returningMissing = index % 19 === 0 && side === 'away';
    const recruitY0Missing = index % 23 === 0 && side === 'home';
    const recruitY1Missing = index % 29 === 0 && side === 'away';
    const formMissing = week === 1;

    return {
      eloRaw: available(1400 + sign * base * 11),
      talentRaw: available(500 + sign * base * 7),
      returningPercentPPA: returningMissing
        ? unavailable()
        : available(45 + sign * base),
      recruitingPointsY0: recruitY0Missing
        ? unavailable()
        : available(180 + sign * base * 3),
      recruitingPointsY1: recruitY1Missing
        ? unavailable()
        : available(175 + sign * base * 2.5),
      recruitingPointsY2: available(170 + sign * base * 2),
      recruitingPointsY3: available(165 + sign * base * 1.5),
      priorFbsGames: available(Math.max(0, week - 1)),
      ppaNet: formMissing
        ? unavailable('NO_PRIOR_FBS_GAMES')
        : available(sign * base * 0.04, week - 1),
      successNet: formMissing
        ? unavailable('NO_PRIOR_FBS_GAMES')
        : available(sign * base * 0.015, week - 1),
    };
  };

  return {
    season,
    gameId,
    week,
    neutralSite,
    homeTeam: `H${season}-${index}`,
    awayTeam: `A${season}-${index}`,
    home: team('home'),
    away: team('away'),
  };
}

function outcomeRow(
  season: 2022 | 2023,
  index: number,
  week: number
): unknown {
  const gameId = season * 1_000_000 + index + 1;
  return {
    season,
    gameId,
    week,
    homeTeam: `H${season}-${index}`,
    awayTeam: `A${season}-${index}`,
    homeMargin:
      ((index % 17) - 8) * 1.25 +
      (index % 5 === 0 ? 0 : 2.5) +
      (season === 2023 ? 0.2 : 0),
  };
}

function developmentInput(): HistoricalModelDevelopmentInput {
  const featureRows: unknown[] = [];
  const outcomeRows: unknown[] = [];

  for (const [season, count] of [
    [2022, 734],
    [2023, 750],
  ] as const) {
    for (let index = 0; index < count; index += 1) {
      const week = 1 + (index % 15);
      featureRows.push(featureRow(season, index, week));
      outcomeRows.push(outcomeRow(season, index, week));
    }
  }

  return { featureRows, outcomeRows };
}

function v1FromV3(
  v3: ReturnType<typeof fitHistoricalModelV3>
): FinalCandidateState {
  const sharedNames = [
    'intercept',
    'homeFieldIndicator',
    ...HISTORICAL_MODEL_V3_PENALIZED_PREDICTORS.filter(
      (name) =>
        ![
          'recruitY2MissingDelta',
          'recruitY3MissingDelta',
          'formSourceGapDelta',
        ].includes(name)
    ),
  ];

  const byName = new Map(
    HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER.map((name, index) => [
      name,
      v3.coefficients[index],
    ])
  );

  return {
    status: 'FINAL_CANDIDATE_FROZEN',
    stageASelectionSha256: 'a'.repeat(64),
    modelDefinitionId: 'historical_ridge_margin_v1',
    featureDefinitionId: 'historical_feature_v1',
    lambda: 100,
    coefficientOrder: sharedNames,
    coefficients: sharedNames.map((name) => byName.get(name)!),
    scaler: v3.scaler,
    trainGameIds: [...v3.trainGameIds],
    trainSeasonWeeks: v3.trainSeasonWeeks,
  };
}

describe('historical model v3 backcompat', () => {
  it('fits the frozen V3 shape with zero development-only columns', () => {
    const candidate = fitHistoricalModelV3(developmentInput());

    expect(candidate.status).toBe('HISTORICAL_V3_CANDIDATE_FROZEN');
    expect(candidate.modelDefinitionId).toBe('historical_ridge_margin_v3');
    expect(candidate.lambda).toBe(100);
    expect(candidate.developmentGames).toBe(1484);
    expect(candidate.coefficientOrder).toEqual([
      ...HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER,
    ]);
    expect(candidate.coefficients).toHaveLength(19);

    const byName = new Map(
      candidate.coefficientOrder.map((name, index) => [
        name,
        candidate.coefficients[index],
      ])
    );

    expect(Math.abs(byName.get('recruitY2MissingDelta')!)).toBeLessThanOrEqual(
      1e-12
    );
    expect(Math.abs(byName.get('recruitY3MissingDelta')!)).toBeLessThanOrEqual(
      1e-12
    );
    expect(Math.abs(byName.get('formSourceGapDelta')!)).toBeLessThanOrEqual(
      1e-12
    );
  });

  it('passes exact V1 compatibility when only zero V3 columns are added', () => {
    const input = developmentInput();
    const v3 = fitHistoricalModelV3(input);
    const v1 = v1FromV3(v3);

    const report = auditHistoricalModelV3Backcompat(input, v1, v3);

    expect(report.status).toBe('HISTORICAL_V3_BACKCOMPAT_PASS');
    expect(report.developmentGames).toBe(1484);
    expect(report.maxAbsolutePredictionDifference).toBe(0);
    expect(report.maxAbsoluteSharedCoefficientDifference).toBe(0);
    expect(report.maxAbsoluteSharedScalerDifference).toBe(0);
    expect(Object.values(report.gateChecks).every(Boolean)).toBe(true);
  });

  it('fails compatibility when a shared V1 coefficient is altered', () => {
    const input = developmentInput();
    const v3 = fitHistoricalModelV3(input);
    const v1 = v1FromV3(v3);
    const eloIndex = v1.coefficientOrder.indexOf('eloDeltaZ');
    v1.coefficients[eloIndex] += 1e-5;

    const report = auditHistoricalModelV3Backcompat(input, v1, v3);

    expect(report.status).toBe('HISTORICAL_V3_BACKCOMPAT_FAILED');
    expect(report.gateChecks.sharedCoefficientsMatch).toBe(false);
    expect(report.gateChecks.developmentPredictionsMatch).toBe(false);
  });

  it('fails closed when development Y2 is unexpectedly missing', () => {
    const input = developmentInput();
    const first = input.featureRows[0] as any;
    first.home.recruitingPointsY2 = unavailable();

    expect(() => fitHistoricalModelV3(input)).toThrow(
      /unexpected_required_feature_missing/
    );
  });
});
