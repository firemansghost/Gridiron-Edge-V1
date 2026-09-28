import * as fs from 'fs';
import * as path from 'path';
import {
  HISTORICAL_MODEL_LAMBDAS,
  HISTORICAL_MODEL_PENALIZED_PREDICTORS,
  buildStageASelection,
  fitFinalCandidateIfPassed,
  run2023Confirmation,
  type HistoricalModelDevelopmentInput,
  type StageAProvenance,
} from '../src/research/historical-model-development-v1';

function available(value: number, n: number | null = 1) {
  return { value, status: 'AVAILABLE', n };
}

function unavailable(status: string) {
  return { value: null, status, n: 0 };
}

function teamBundle(teamIndex: number, week: number) {
  const elo = 1300 + teamIndex * 5 + week * 2;
  const talent = 200 + ((teamIndex * 17) % 113) * 2.5;
  const returning = 0.25 + ((teamIndex * 7) % 61) / 100;
  const recruitY0 = 120 + ((teamIndex * 19) % 97) * 1.5;
  const recruitY1 = 115 + ((teamIndex * 23) % 89) * 1.4;
  const recruitY2 = 110 + ((teamIndex * 29) % 83) * 1.3;
  const recruitY3 = 105 + ((teamIndex * 31) % 79) * 1.2;
  const priorFbsGames = Math.max(0, week - 1);
  const ppaNet = ((teamIndex * 13) % 41 - 20) / 100;
  const successNet = ((teamIndex * 11) % 31 - 15) / 100;

  const noPrior = priorFbsGames === 0;
  return {
    eloRaw: available(elo),
    talentRaw: available(talent),
    returningPercentPPA: available(returning),
    recruitingPointsY0: available(recruitY0),
    recruitingPointsY1: available(recruitY1),
    recruitingPointsY2: available(recruitY2),
    recruitingPointsY3: available(recruitY3),
    priorFbsGames: available(priorFbsGames, null),
    ppaOffMean: noPrior ? unavailable('NO_PRIOR_FBS_GAMES') : available(0.1 + ppaNet / 2, priorFbsGames),
    ppaDefMean: noPrior ? unavailable('NO_PRIOR_FBS_GAMES') : available(0.1 - ppaNet / 2, priorFbsGames),
    ppaNet: noPrior ? unavailable('NO_PRIOR_FBS_GAMES') : available(ppaNet, null),
    successOffMean: noPrior ? unavailable('NO_PRIOR_FBS_GAMES') : available(0.45 + successNet / 2, priorFbsGames),
    successDefMean: noPrior ? unavailable('NO_PRIOR_FBS_GAMES') : available(0.45 - successNet / 2, priorFbsGames),
    successNet: noPrior ? unavailable('NO_PRIOR_FBS_GAMES') : available(successNet, null),
  };
}

function rawValue(bundle: any, key: string): number {
  const value = bundle[key].value;
  return typeof value === 'number' ? value : 0;
}

function makeSeason(
  season: 2022 | 2023,
  gameCount: number,
  teamCount: number
): HistoricalModelDevelopmentInput {
  const featureRows: any[] = [];
  const outcomeRows: any[] = [];

  for (let index = 0; index < gameCount; index += 1) {
    const gameId = season * 1_000_000 + index + 1;
    const week = (index % 15) + 1;
    const homeIndex = index % teamCount;
    let awayIndex = (index * 7 + 13) % teamCount;
    if (awayIndex === homeIndex) awayIndex = (awayIndex + 1) % teamCount;
    const home = teamBundle(homeIndex, week);
    const away = teamBundle(awayIndex, week);
    const neutralSite = index % 11 === 0;
    const hfa = neutralSite ? 0 : 1;

    featureRows.push({
      season,
      gameId,
      week,
      startDate: `${season}-09-${String((index % 28) + 1).padStart(2, '0')}T12:00:00.000Z`,
      homeTeam: `Team ${season} H${homeIndex}`,
      awayTeam: `Team ${season} A${awayIndex}`,
      neutralSite,
      home,
      away,
    });

    const talentDiff =
      rawValue(home, 'talentRaw') - rawValue(away, 'talentRaw');
    const recruitingDiff =
      rawValue(home, 'recruitingPointsY0') -
      rawValue(away, 'recruitingPointsY0');
    const ppaDiff =
      week === 1
        ? 0
        : rawValue(home, 'ppaNet') - rawValue(away, 'ppaNet');
    const successDiff =
      week === 1
        ? 0
        : rawValue(home, 'successNet') - rawValue(away, 'successNet');

    const homeMargin =
      2.75 * hfa +
      0.035 * talentDiff +
      0.02 * recruitingDiff +
      16 * ppaDiff +
      18 * successDiff +
      ((index % 5) - 2) * 0.15;

    outcomeRows.push({
      season,
      gameId,
      homeTeam: `Team ${season} H${homeIndex}`,
      awayTeam: `Team ${season} A${awayIndex}`,
      finalHomePoints: 30 + homeMargin / 2,
      finalAwayPoints: 30 - homeMargin / 2,
      homeMargin,
    });
  }

  return { featureRows, outcomeRows };
}

function fullInput(): HistoricalModelDevelopmentInput {
  const y2022 = makeSeason(2022, 734, 131);
  const y2023 = makeSeason(2023, 750, 133);
  return {
    featureRows: [...y2022.featureRows, ...y2023.featureRows],
    outcomeRows: [...y2022.outcomeRows, ...y2023.outcomeRows],
  };
}

const provenance: StageAProvenance = {
  builderRepoSha: 'a'.repeat(40),
  featureArtifact: {
    runId: 1,
    artifactId: 2,
    zipSha256: 'b'.repeat(64),
    featureMemberSha256: 'c'.repeat(64),
  },
  corpusOutcomeArtifact: {
    runId: 3,
    artifactId: 4,
    zipSha256: 'd'.repeat(64),
    outcomeMemberSha256: 'e'.repeat(64),
  },
};

describe('Historical Model Development V1', () => {
  it('freezes deterministic 2022-only Stage A selection with exact folds/grid', () => {
    const input2022 = makeSeason(2022, 734, 131);
    const stageA1 = buildStageASelection(input2022, provenance);
    const stageA2 = buildStageASelection(input2022, provenance);

    expect(stageA2).toEqual(stageA1);
    expect(stageA1.lambdaGrid).toEqual([...HISTORICAL_MODEL_LAMBDAS]);
    expect(stageA1.penalizedPredictorOrder).toEqual([
      ...HISTORICAL_MODEL_PENALIZED_PREDICTORS,
    ]);
    expect(HISTORICAL_MODEL_LAMBDAS).toContain(
      stageA1.selectedPrimaryLambda as any
    );
    expect(HISTORICAL_MODEL_LAMBDAS).toContain(
      stageA1.selectedEloBaselineLambda as any
    );

    expect(stageA1.primaryTuning.lambdaReports).toHaveLength(5);
    expect(stageA1.eloBaselineTuning.lambdaReports).toHaveLength(5);
    expect(stageA1.hfaBaselineTuning.folds).toHaveLength(5);

    for (const report of stageA1.primaryTuning.lambdaReports) {
      expect(report.folds).toHaveLength(5);
      expect(report.folds.map((fold) => fold.foldId)).toEqual([
        'A',
        'B',
        'C',
        'D',
        'E',
      ]);
      for (const fold of report.folds) {
        expect(fold.trainGames).toBeGreaterThan(0);
        expect(fold.validationGames).toBeGreaterThan(0);
        expect(Number.isFinite(fold.metrics.mae)).toBe(true);
        expect(Number.isFinite(fold.metrics.rmse)).toBe(true);
        expect(fold.coefficients).toHaveLength(16);
      }
    }

    expect(() =>
      buildStageASelection(fullInput(), provenance)
    ).toThrow(/development_source_count_mismatch/);
  });

  it('runs one-shot 2023 confirmation and conditionally freezes the final candidate', () => {
    const all = fullInput();
    const input2022 = {
      featureRows: all.featureRows.filter((row: any) => row.season === 2022),
      outcomeRows: all.outcomeRows.filter((row: any) => row.season === 2022),
    };
    const stageA = buildStageASelection(input2022, provenance);
    const selectionHash = 'f'.repeat(64);
    const confirmation = run2023Confirmation(
      all,
      stageA,
      selectionHash,
      true
    );

    expect(confirmation.primaryPredictions2023).toHaveLength(750);
    expect(confirmation.eloBaselinePredictions2023).toHaveLength(750);
    expect(confirmation.hfaBaselinePredictions2023).toHaveLength(750);
    expect(confirmation.gateChecks.all750PredictionsAvailable).toBe(true);
    expect(confirmation.gateChecks.sourceLeakageBlockerAbsent).toBe(true);
    expect(confirmation.status).toBe('DEVELOPMENT_CONFIRMATION_PASS');
    expect(confirmation.primaryMetrics2023.mae).toBeLessThan(
      confirmation.hfaBaselineMetrics2023.mae
    );
    expect(confirmation.primaryMetrics2023.mae).toBeLessThan(
      confirmation.eloBaselineMetrics2023.mae
    );

    const finalCandidate = fitFinalCandidateIfPassed(
      all,
      stageA,
      confirmation
    );
    expect(finalCandidate).not.toBeNull();
    expect(finalCandidate!.lambda).toBe(stageA.selectedPrimaryLambda);
    expect(finalCandidate!.coefficients).toHaveLength(16);
    expect(finalCandidate!.trainGameIds).toHaveLength(1484);
    expect(Object.keys(finalCandidate!.scaler)).toHaveLength(10);
    expect(finalCandidate!.stageASelectionSha256).toBe(selectionHash);
  });

  it('stops before final refit when the one-shot confirmation gate fails', () => {
    const all = fullInput();
    const input2022 = {
      featureRows: all.featureRows.filter((row: any) => row.season === 2022),
      outcomeRows: all.outcomeRows.filter((row: any) => row.season === 2022),
    };
    const stageA = buildStageASelection(input2022, provenance);

    const first = run2023Confirmation(all, stageA, '1'.repeat(64), true);
    const hfaPredByGame = new Map(
      first.hfaBaselinePredictions2023.map((row) => [
        `${row.season}:${row.gameId}`,
        row.predictedHomeMargin,
      ])
    );

    const forcedFail: HistoricalModelDevelopmentInput = {
      featureRows: all.featureRows,
      outcomeRows: all.outcomeRows.map((row: any) => {
        if (row.season !== 2023) return row;
        const predicted = hfaPredByGame.get(`${row.season}:${row.gameId}`)!;
        return {
          ...row,
          homeMargin: predicted,
          finalHomePoints: 30 + predicted / 2,
          finalAwayPoints: 30 - predicted / 2,
        };
      }),
    };

    const confirmation = run2023Confirmation(
      forcedFail,
      stageA,
      '2'.repeat(64),
      true
    );
    expect(confirmation.status).toBe('DEVELOPMENT_CONFIRMATION_FAIL');
    expect(confirmation.hfaBaselineMetrics2023.mae).toBeCloseTo(0, 10);
    expect(
      fitFinalCandidateIfPassed(forcedFail, stageA, confirmation)
    ).toBeNull();
  });

  it('makes leakage status a confirmation blocker', () => {
    const all = fullInput();
    const input2022 = {
      featureRows: all.featureRows.filter((row: any) => row.season === 2022),
      outcomeRows: all.outcomeRows.filter((row: any) => row.season === 2022),
    };
    const stageA = buildStageASelection(input2022, provenance);
    const confirmation = run2023Confirmation(
      all,
      stageA,
      '3'.repeat(64),
      false
    );
    expect(confirmation.gateChecks.sourceLeakageBlockerAbsent).toBe(false);
    expect(confirmation.status).toBe('DEVELOPMENT_CONFIRMATION_FAIL');
  });

  it('keeps the CLI/workflow artifact-only and market/database/provider free', () => {
    const cli = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'apps/jobs/run-historical-model-development-v1.ts'
      ),
      'utf8'
    );
    expect(cli).not.toMatch(/PrismaClient|DATABASE_URL|DIRECT_URL/);
    expect(cli).not.toMatch(
      /CFBD_API_KEY|ODDS_API_KEY|SGO_API_KEY|VISUALCROSSING/i
    );
    expect(cli).not.toMatch(/\bfetch\s*\(/);
    expect(cli).not.toContain('readCorpus(CORPUS_PATHS.market)');
    expect(cli).not.toContain('readCorpus(CORPUS_PATHS.gameFrames)');
    expect(cli).not.toContain('readCorpus(CORPUS_PATHS.staticPriors)');
    expect(cli).not.toContain('readCorpus(CORPUS_PATHS.advancedHistory)');
    expect(cli).not.toContain('readCorpus(CORPUS_PATHS.ppaHistory)');
    expect(cli).not.toContain('readCorpus(CORPUS_PATHS.historyEligibility)');
    expect(cli).not.toContain('readCorpus(CORPUS_PATHS.portal2022)');
    expect(cli).not.toContain('readCorpus(CORPUS_PATHS.portal2023)');

    const workflow = fs.readFileSync(
      path.resolve(
        process.cwd(),
        '.github/workflows/run-historical-model-development-v1.yml'
      ),
      'utf8'
    );
    expect(workflow).toMatch(/workflow_dispatch/);
    expect(workflow).toMatch(/expected_main_sha/);
    expect(workflow).toMatch(
      /RUN_2022_2023_HISTORICAL_MODEL_DEVELOPMENT_V1/
    );
    expect(workflow).toMatch(/11000651389/);
    expect(workflow).toMatch(/10997010171/);
    expect(workflow).toMatch(
      /047220307750b755d1e6d626628802baf818dbd70ffde9252e63768e7a823ad2/
    );
    expect(workflow).toMatch(
      /cea83762d2b6e492caec680a74a085ef5a5e283c36a402ef4b35acbe2ce22b7d/
    );
    expect(workflow).toMatch(/npm ci --ignore-scripts/);
    expect(workflow).toMatch(/npx tsc/);
    expect(workflow).not.toMatch(/npx tsx/);
    expect(workflow).not.toMatch(
      /CFBD_API_KEY|ODDS_API_KEY|SGO_API_KEY|VISUALCROSSING/i
    );
    expect(workflow).not.toMatch(/DATABASE_URL|DIRECT_URL/);
    expect(workflow).not.toMatch(
      /npx prisma|npm run prisma|prisma migrate|prisma db/i
    );
    expect(workflow).not.toMatch(/schedule:/);
  });
});
