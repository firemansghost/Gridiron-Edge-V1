import {
  buildHistoricalV3PreScoreFreeze,
  fitHistoricalV3ValidationBaselines,
  scoreHistoricalV3Confirmation,
  type HistoricalV3BaselineState,
} from '../src/research/historical-v3-confirmation';
import {
  HISTORICAL_MODEL_CONTINUOUS_FEATURES,
  type HistoricalModelDevelopmentInput,
} from '../src/research/historical-model-development-v1';
import {
  HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER,
  type HistoricalModelV3Candidate,
} from '../src/research/historical-model-v3';
import type { HistoricalV3PredictiveGameInput } from '../src/research/historical-v3-predictive-inputs';

function available(value: number, n: number | null = null) {
  return { value, status: 'AVAILABLE', n };
}

function unavailable(status = 'NO_PRIOR_FBS_GAMES') {
  return { value: null, status, n: 0 };
}

function developmentInput(): HistoricalModelDevelopmentInput {
  const featureRows: unknown[] = [];
  const outcomeRows: unknown[] = [];
  for (const [season, count] of [
    [2022, 734],
    [2023, 750],
  ] as const) {
    for (let index = 0; index < count; index += 1) {
      const gameId = season * 1_000_000 + index + 1;
      const week = 1 + (index % 15);
      const base = (index % 29) * 0.2 + (season === 2023 ? 0.1 : 0);
      const team = (side: 'home' | 'away') => {
        const sign = side === 'home' ? 1 : -1;
        return {
          eloRaw: available(1500 + sign * base * 10),
          talentRaw: available(500 + sign * base * 3),
          returningPercentPPA: available(50 + sign * base),
          recruitingPointsY0: available(200 + sign * base),
          recruitingPointsY1: available(195 + sign * base),
          recruitingPointsY2: available(190 + sign * base),
          recruitingPointsY3: available(185 + sign * base),
          priorFbsGames: available(Math.max(0, week - 1)),
          ppaNet:
            week === 1 ? unavailable() : available(sign * base * 0.03, week - 1),
          successNet:
            week === 1 ? unavailable() : available(sign * base * 0.01, week - 1),
        };
      };
      featureRows.push({
        season,
        gameId,
        week,
        neutralSite: index % 7 === 0,
        homeTeam: `H-${season}-${index}`,
        awayTeam: `A-${season}-${index}`,
        home: team('home'),
        away: team('away'),
      });
      outcomeRows.push({
        season,
        gameId,
        homeTeam: `H-${season}-${index}`,
        awayTeam: `A-${season}-${index}`,
        homeMargin: ((index % 13) - 6) * 1.1 + (index % 7 === 0 ? 0 : 2.2),
      });
    }
  }
  return { featureRows, outcomeRows };
}

function candidate(): HistoricalModelV3Candidate {
  const scaler: any = {};
  for (const name of HISTORICAL_MODEL_CONTINUOUS_FEATURES) {
    scaler[name] = {
      mean: 0,
      populationSd: 1,
      availableCount: 2968,
      disabledZeroVariance: false,
    };
  }
  const coefficients = HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER.map(() => 0);
  coefficients[HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER.indexOf('eloDeltaZ')] = 1;
  return {
    status: 'HISTORICAL_V3_CANDIDATE_FROZEN',
    modelDefinitionId: 'historical_ridge_margin_v3',
    featureDefinitionId: 'historical_source_resilient_feature_v3',
    lambda: 100,
    coefficientOrder: [...HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER],
    coefficients,
    scaler,
    trainGameIds: Array.from({ length: 1484 }, (_, index) => index + 1),
    trainSeasonWeeks: { '2022': [1], '2023': [1] },
    developmentGames: 1484,
    sourceGapDevelopmentColumnsAllZero: true,
  };
}

function predictiveRows(): HistoricalV3PredictiveGameInput[] {
  return Array.from({ length: 752 }, (_, index) => {
    const eloDelta = (index % 9) - 4;
    const rawFeature = (value: number) => ({
      value,
      status: 'AVAILABLE' as const,
      n: 1,
    });
    const team = (name: string, elo: number, sourceGap: 0 | 1) => ({
      team: name,
      features: {
        elo: rawFeature(elo),
        talent: rawFeature(500),
        returning: rawFeature(50),
        recruitY0: rawFeature(200),
        recruitY1: rawFeature(195),
        recruitY2: rawFeature(190),
        recruitY3: rawFeature(185),
        priorFbsGames: rawFeature(index === 0 ? 0 : 1),
        ppaNet:
          index === 0
            ? { value: null, status: 'NO_PRIOR_FBS_GAMES' as const, n: 0 }
            : sourceGap
              ? { value: null, status: 'SOURCE_HISTORY_INCOMPLETE' as const, n: 0 }
              : rawFeature(0.1),
        successNet:
          index === 0
            ? { value: null, status: 'NO_PRIOR_FBS_GAMES' as const, n: 0 }
            : sourceGap
              ? { value: null, status: 'SOURCE_HISTORY_INCOMPLETE' as const, n: 0 }
              : rawFeature(0.02),
      },
      standardized: {
        elo,
        talent: 0,
        returning: 0,
        recruitY0: 0,
        recruitY1: 0,
        recruitY2: 0,
        recruitY3: 0,
        priorFbsGames: 0,
        ppaNet: 0,
        successNet: 0,
      },
      missingFlags: {
        returning: 0 as const,
        recruitY0: 0 as const,
        recruitY1: 0 as const,
        recruitY2: 0 as const,
        recruitY3: 0 as const,
        formMissing: index === 0 ? (1 as const) : (0 as const),
        formSourceGap: sourceGap,
      },
      formAudit: {
        priorFbsGames: index === 0 ? 0 : 1,
        observedAdvancedGames: index === 0 || sourceGap ? 0 : 1,
        missingAdvancedGames: sourceGap,
        missingPriorGameIds: sourceGap ? [900000 + index] : [],
        sourceProvenanceCounts: {
          BULK_ADVANCED_FULL_SEASON_PRIMARY: index === 0 || sourceGap ? 0 : 1,
          BULK_ADVANCED_WEEK_SCOPED_RECOVERY: 0,
        },
      },
    });

    const home = team(`H-${index}`, 1500 + eloDelta / 2, index === 10 ? 1 : 0);
    const away = team(`A-${index}`, 1500 - eloDelta / 2, 0);
    const modelInputs = Object.fromEntries(
      HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER.map((name) => [name, 0])
    ) as Record<string, number>;
    modelInputs.intercept = 1;
    modelInputs.homeFieldIndicator = index % 7 === 0 ? 0 : 1;
    modelInputs.eloDeltaZ = eloDelta;
    modelInputs.formMissingDelta =
      home.missingFlags.formMissing - away.missingFlags.formMissing;
    modelInputs.formSourceGapDelta =
      home.missingFlags.formSourceGap - away.missingFlags.formSourceGap;

    return {
      season: 2024,
      gameId: 4_000_000 + index,
      week: 1 + (index % 15),
      startDate: null,
      homeTeam: home.team,
      awayTeam: away.team,
      neutralSite: index % 7 === 0,
      home,
      away,
      modelInputs,
    };
  });
}

describe('historical v3 pre-score and confirmation core', () => {
  it('fits both development-only validation baselines on all 1,484 games', () => {
    const result = fitHistoricalV3ValidationBaselines(developmentInput());
    expect(result.hfa.kind).toBe('HFA_BASELINE');
    expect(result.hfa.coefficients).toHaveLength(2);
    expect(result.hfa.trainGameIds).toHaveLength(1484);
    expect(result.eloHfa.kind).toBe('ELO_HFA_BASELINE');
    expect(result.eloHfa.lambda).toBe(100);
    expect(result.eloHfa.coefficients).toHaveLength(3);
    expect(result.eloHfa.eloScaler?.availableCount).toBe(2968);
  });

  it('freezes exactly 752 predictive games and records source-gap identities', () => {
    const frozen = buildHistoricalV3PreScoreFreeze({
      candidate: candidate(),
      backcompatStatus: 'HISTORICAL_V3_BACKCOMPAT_PASS',
      predictiveRows: predictiveRows(),
      developmentInput: developmentInput(),
    });
    expect(frozen.status).toBe('HISTORICAL_V3_PRESCORE_FREEZE_READY');
    expect(frozen.canonicalGames).toBe(752);
    expect(frozen.canonicalGameIds).toHaveLength(752);
    expect(frozen.staticMissingnessCounts.sourceGapFormSides).toBe(1);
    expect(frozen.sourceGapSides).toHaveLength(1);
    expect(frozen.sourceGapSides[0].team).toBe('H-10');
  });

  it('passes when V3 is exact and both frozen controls are worse', () => {
    const rows = predictiveRows();
    const zeroHfa: HistoricalV3BaselineState = {
      kind: 'HFA_BASELINE',
      lambda: null,
      coefficientOrder: ['intercept', 'homeFieldIndicator'],
      coefficients: [0, 0],
      eloScaler: null,
      trainGameIds: Array.from({ length: 1484 }, (_, index) => index + 1),
      trainSeasonWeeks: { '2022': [1], '2023': [1] },
    };
    const zeroElo: HistoricalV3BaselineState = {
      kind: 'ELO_HFA_BASELINE',
      lambda: 100,
      coefficientOrder: ['intercept', 'homeFieldIndicator', 'eloDeltaZ'],
      coefficients: [0, 0, 0],
      eloScaler: {
        mean: 1500,
        populationSd: 100,
        availableCount: 2968,
        disabledZeroVariance: false,
      },
      trainGameIds: Array.from({ length: 1484 }, (_, index) => index + 1),
      trainSeasonWeeks: { '2022': [1], '2023': [1] },
    };
    const outcomes = rows.map((row) => ({
      gameId: row.gameId,
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      finalHomePoints: 30 + row.modelInputs.eloDeltaZ,
      finalAwayPoints: 30,
      homeMargin: row.modelInputs.eloDeltaZ,
    }));

    const result = scoreHistoricalV3Confirmation({
      candidate: candidate(),
      predictiveRows: rows,
      outcomes,
      hfaBaseline: zeroHfa,
      eloHfaBaseline: zeroElo,
      frozenInputIntegrity: true,
      marketReads: 0,
      holdout2025Reads: 0,
    });

    expect(result.status).toBe('HISTORICAL_V3_CONFIRMATION_PASS');
    expect(result.predictionRows).toHaveLength(752);
    expect(result.v3Metrics?.mae).toBe(0);
    expect(result.gateChecks.v3MaeBeatsHfa).toBe(true);
    expect(result.gateChecks.v3MaeBeatsEloHfa).toBe(true);
  });

  it('returns INPUT_BLOCKED instead of scoring an incomplete outcome universe', () => {
    const rows = predictiveRows();
    const baselines = fitHistoricalV3ValidationBaselines(developmentInput());
    const outcomes = rows.slice(0, 751).map((row) => ({
      gameId: row.gameId,
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      finalHomePoints: 30,
      finalAwayPoints: 27,
      homeMargin: 3,
    }));
    const result = scoreHistoricalV3Confirmation({
      candidate: candidate(),
      predictiveRows: rows,
      outcomes,
      hfaBaseline: baselines.hfa,
      eloHfaBaseline: baselines.eloHfa,
      frozenInputIntegrity: true,
      marketReads: 0,
      holdout2025Reads: 0,
    });
    expect(result.status).toBe('HISTORICAL_V3_CONFIRMATION_INPUT_BLOCKED');
    expect(result.predictionRows).toHaveLength(0);
    expect(result.inputBlockers).toContain('outcome_count_mismatch');
  });
});
