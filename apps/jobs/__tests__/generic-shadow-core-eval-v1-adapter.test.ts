import { loadGenericShadowCoreEvalFrame } from '../src/generic-shadow-core-eval-v1-adapter';

function mockDb(overrides: Partial<any> = {}): any {
  return {
    shadowModelCaptureRun: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'run-1',
        season: 2026,
        week: 5,
        captureContext: 'ctx',
        evaluationProtocol: 'CORE_EVAL_V1',
        modelFamily: 'candidate_b_elo_prior',
        modelDefinitionId: 'candidate_b_elo_prior_v1',
        modelDefinitionHash: 'mh',
        featureDefinitionId: 'fh-id',
        featureDefinitionHash: 'fh',
        policyDefinitionId: 'ph-id',
        policyDefinitionHash: 'ph',
        repoCommitSha: 'a'.repeat(40),
        captureTimestamp: new Date('2026-10-01T15:00:00Z'),
        expectedGameIds: ['g1'],
        totalGames: 1,
        availableCount: 1,
        unavailableCount: 0,
        selectionCount: 1,
        noSelectionCount: 0,
        status: 'COMPLETE',
      }),
    },
    shadowModelPrediction: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'p1',
          captureRunId: 'run-1',
          gameId: 'g1',
          season: 2026,
          week: 5,
          homeTeamId: 'h1',
          awayTeamId: 'a1',
          kickoffTimestamp: new Date('2026-10-03T17:00:00Z'),
          predictionTimestamp: new Date('2026-10-01T15:00:00Z'),
          predictionStatus: 'AVAILABLE',
          unavailableReasons: [],
          marketType: 'SPREAD',
          selectedSide: 'HOME',
          selectedTeamId: 'h1',
          predictionPickValue: -3.5,
        },
      ]),
    },
    game: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'g1',
          season: 2026,
          week: 5,
          homeTeamId: 'h1',
          awayTeamId: 'a1',
          status: 'final',
          homeScore: 24,
          awayScore: 20,
        },
      ]),
    },
    shadowModelClosingMarketSnapshot: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'c1',
          predictionId: 'p1',
          gameId: 'g1',
          evaluationProtocol: 'CORE_EVAL_V1',
          closingDefinitionId: 'generic_shadow_t30_closing_v1',
          closingDefinitionHash: 'closing-hash',
          status: 'AVAILABLE',
          unavailableReason: null,
          canonicalMarketHma: 4,
        },
      ]),
    },
    ...overrides,
  };
}

describe('Generic Shadow CORE_EVAL_V1 SELECT-only adapter', () => {
  it('loads one exact Generic cohort, canonical games, and Generic closes', async () => {
    const db = mockDb();
    const result = await loadGenericShadowCoreEvalFrame(db, 'run-1');

    expect(result.blockers).toEqual([]);
    expect(result.providerCalls).toBe(0);
    expect(result.mutationsInvoked).toBe(false);
    expect(result.frame?.captureRun.id).toBe('run-1');
    expect(result.frame?.predictions).toHaveLength(1);
    expect(result.frame?.predictions[0]).toEqual(
      expect.objectContaining({
        id: 'p1',
        gameId: 'g1',
        predictionStatus: 'AVAILABLE',
        selectedSide: 'HOME',
        predictionPickValue: -3.5,
      })
    );
    expect(result.frame?.games).toEqual([
      expect.objectContaining({ id: 'g1', status: 'final', homeScore: 24, awayScore: 20 }),
    ]);
    expect(result.frame?.closings).toEqual([
      expect.objectContaining({ id: 'c1', predictionId: 'p1', canonicalMarketHma: 4 }),
    ]);

    expect(db.shadowModelCaptureRun.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run-1' } })
    );
    expect(db.shadowModelPrediction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { captureRunId: 'run-1' } })
    );
    expect(db.game.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['g1'] } } })
    );
    expect(db.shadowModelClosingMarketSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { predictionId: { in: ['p1'] } } })
    );
  });

  it('returns an explicit blocker without child reads when the capture run is missing', async () => {
    const db = mockDb();
    db.shadowModelCaptureRun.findUnique.mockResolvedValue(null);

    const result = await loadGenericShadowCoreEvalFrame(db, 'missing');

    expect(result.frame).toBeNull();
    expect(result.blockers).toEqual(['capture_run_not_found']);
    expect(db.shadowModelPrediction.findMany).not.toHaveBeenCalled();
    expect(db.game.findMany).not.toHaveBeenCalled();
    expect(db.shadowModelClosingMarketSnapshot.findMany).not.toHaveBeenCalled();
  });

  it('skips empty IN queries for an empty persisted prediction set', async () => {
    const db = mockDb();
    db.shadowModelCaptureRun.findUnique.mockResolvedValue({
      ...(await mockDb().shadowModelCaptureRun.findUnique()),
      expectedGameIds: [],
      totalGames: 0,
      availableCount: 0,
      unavailableCount: 0,
      selectionCount: 0,
      noSelectionCount: 0,
    });
    db.shadowModelPrediction.findMany.mockResolvedValue([]);

    const result = await loadGenericShadowCoreEvalFrame(db, 'run-1');

    expect(result.frame?.predictions).toEqual([]);
    expect(result.frame?.games).toEqual([]);
    expect(result.frame?.closings).toEqual([]);
    expect(db.game.findMany).not.toHaveBeenCalled();
    expect(db.shadowModelClosingMarketSnapshot.findMany).not.toHaveBeenCalled();
  });
});
