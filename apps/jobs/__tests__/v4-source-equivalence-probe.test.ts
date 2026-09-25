import {
  V4_EQUIVALENCE_PROVIDER_CALL_BUDGET,
  V4_EQUIVALENCE_SAMPLE,
  assessLegacyDriveCompatibility,
  assessPlayDriveIdentity,
  buildV4SourceEquivalenceReport,
  compareAdvancedSuccess,
  legacyDriveMetricInputs,
} from '../src/research/v4-source-equivalence-probe';

describe('V4 source equivalence probe', () => {
  it('freezes the preregistered nine-game sample and nine-call budget', () => {
    expect(V4_EQUIVALENCE_SAMPLE).toHaveLength(9);
    expect(V4_EQUIVALENCE_SAMPLE.filter((g) => g.week === 1)).toHaveLength(3);
    expect(V4_EQUIVALENCE_SAMPLE.filter((g) => g.week === 2)).toHaveLength(3);
    expect(V4_EQUIVALENCE_SAMPLE.filter((g) => g.week === 3)).toHaveLength(3);
    expect(V4_EQUIVALENCE_PROVIDER_CALL_BUDGET).toBe(9);
    expect(V4_EQUIVALENCE_SAMPLE.map((g) => g.cfbdGameId)).toEqual([
      '401856634',
      '401856636',
      '401856637',
      '401856670',
      '401856671',
      '401856673',
      '401856685',
      '401856686',
      '401856687',
    ]);
  });

  it('compares current advanced success rates to persisted values', () => {
    const persisted = [
      {
        gameId: '2026-wk1-east-carolina-alabama',
        teamId: 'alabama',
        cfbdGameId: '401856634',
        providerTeam: 'Alabama',
        successOff: 0.51,
        successDef: 0.42,
      },
    ];
    const advanced = [
      {
        gameId: 401856634,
        team: 'Alabama',
        offense: { successRate: 0.51 },
        defense: { successRate: 0.42 },
      },
    ];

    const result = compareAdvancedSuccess(persisted, advanced);
    expect(result.status).toBe('PASS');
    expect(result.exactWithinToleranceRows).toBe(1);
  });

  it('ports the legacy drive scoring-opportunity and available-yards inputs', () => {
    const result = legacyDriveMetricInputs({
      id: 'd1',
      gameId: 401856634,
      offense: 'Alabama',
      defense: 'East Carolina',
      startYardline: 20,
      endYardline: 70,
      yards: 50,
      points: 7,
    });

    expect(result.scoringOpportunity).toBe(true);
    expect(result.availableYardsPct).toBeCloseTo(50 / 80, 12);
    expect(result.pointsPresent).toBe(true);
    expect(result.identityComplete).toBe(true);
  });

  it('fails legacy drive compatibility when the fixed sample is incomplete', () => {
    const result = assessLegacyDriveCompatibility([
      {
        id: 'd1',
        gameId: 401856634,
        offense: 'Alabama',
        defense: 'East Carolina',
        startYardline: 20,
        endYardline: 70,
        yards: 50,
        points: 7,
      },
    ]);
    expect(result.status).toBe('INCOMPATIBLE');
    expect(result.allGamesPresent).toBe(false);
  });

  it('compares drive identity sets between plays and legacy drives', () => {
    const plays = [
      {
        gameId: 401856634,
        driveId: 'd1',
        offense: 'Alabama',
        defense: 'East Carolina',
        yardsToGoal: 80,
        yardsGained: 5,
        offenseScore: 0,
        defenseScore: 0,
      },
    ];
    const drives = [
      {
        id: 'd1',
        gameId: 401856634,
        offense: 'Alabama',
        defense: 'East Carolina',
      },
    ];
    const result = assessPlayDriveIdentity(plays, drives);
    expect(result.comparableGames).toBe(1);
    expect(result.games[0].exactSetMatch).toBe(true);
    expect(result.status).toBe('MISMATCH_OR_PARTIAL');
  });

  it('never authorizes comparator persistence, even under promising source compatibility', () => {
    const providerCalls = Array.from({ length: 9 }, (_, i) => ({
      endpoint: ['/stats/game/advanced', '/drives', '/plays'][i % 3],
      week: Math.floor(i / 3) + 1,
      attempted: true,
      status: 200,
      ok: true,
      error: null,
      rowCount: 1,
    }));

    const report = buildV4SourceEquivalenceReport({
      repoCommitSha: '1'.repeat(40),
      observedAt: '2026-09-24T23:00:00.000Z',
      providerCalls,
      persistedRows: [],
      advancedRows: [],
      driveRows: [],
      playRows: [],
      payloadDigests: {},
    });

    expect(report.providerCallBudget).toBe(9);
    expect(report.providerCallsAttempted).toBe(9);
    expect(report.safeToPersistComparator).toBe(false);
    expect(report.comparatorPersistenceAuthorized).toBe(false);
  });
});
