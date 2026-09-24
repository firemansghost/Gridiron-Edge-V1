import {
  buildV4ComparatorSourceReadinessReport,
  parseV4ComparatorSourceReadinessArgs,
  type V4ComparatorSourceReadinessInput,
} from '../src/research/v4-comparator-source-readiness';

function baseInput(): V4ComparatorSourceReadinessInput {
  const targetTeams = ['a', 'b'];
  const comparisonTeams = ['c', 'd'];

  return {
    targetSeason: 2026,
    comparisonSeason: 2025,
    repoCommitSha: '1'.repeat(40),
    observedAt: '2026-09-24T23:30:00.000Z',
    targetFbsTeamIds: targetTeams,
    comparisonFbsTeamIds: comparisonTeams,
    targetUnitGradeTeamIds: targetTeams,
    targetExplosivenessCompleteTeamIds: targetTeams,
    targetTeamSeasonRows: [],
    comparisonTeamSeasonRows: [
      {
        teamId: 'c',
        successOff: 0.5,
        successDef: 0.4,
        offFinishing: 4,
        defFinishing: 3,
        offAvailableYardsPct: 0.6,
        defAvailableYardsPct: 0.5,
      },
      {
        teamId: 'd',
        successOff: 0.45,
        successDef: 0.42,
        offFinishing: 3.8,
        defFinishing: 3.2,
        offAvailableYardsPct: 0.55,
        defAvailableYardsPct: 0.52,
      },
    ],
    targetTeamGameRows: [
      {
        gameId: 'g1',
        teamId: 'a',
        week: 1,
        successOff: 0.5,
        successDef: 0.4,
        offensePlays: 70,
        defensePlays: 68,
      },
      {
        gameId: 'g1',
        teamId: 'b',
        week: 1,
        successOff: 0.4,
        successDef: 0.5,
        offensePlays: 68,
        defensePlays: 70,
      },
    ],
    comparisonTeamGameRows: [
      {
        gameId: 'old1',
        teamId: 'c',
        week: 1,
        successOff: 0.5,
        successDef: 0.4,
        offensePlays: 70,
        defensePlays: 68,
      },
    ],
    targetV4RatingTeamIds: [],
    targetV4BetCount: 0,
  };
}

describe('V4 comparator source readiness', () => {
  it('fails closed when legacy drive metrics are absent and historical shape is not comparable', () => {
    const report = buildV4ComparatorSourceReadinessReport(baseInput());

    expect(report.researchOnly).toBe(true);
    expect(report.providerCalls).toBe(0);
    expect(report.mutationsInvoked).toBe(false);
    expect(report.target.fbsTeamCount).toBe(2);
    expect(report.target.teamGameStat.rowsPerGame).toBe(2);
    expect(report.sourceComponents.explosiveness.status).toBe('READY');
    expect(report.sourceComponents.successRate.status).toBe(
      'UNPROVEN_EQUIVALENCE'
    );
    expect(report.sourceComponents.finishingDrives.status).toBe('MISSING');
    expect(report.historicalComparison.equivalenceStatus).toBe('UNTESTABLE');
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        'legacy_team_season_success_source_incomplete',
        'legacy_v4_drive_metrics_incomplete',
        'historical_team_game_stat_shape_not_comparable',
        'team_game_success_source_equivalence_unproven',
      ])
    );
    expect(report.canReproduceLegacyV4Prospectively).toBe(false);
    expect(report.canPersistProspectiveV4Comparator).toBe(false);
    expect(report.recommendation).toBe('DO_NOT_PERSIST_V4_COMPARATOR');
  });

  it('treats two-sided historical TeamGameStat only as candidate-comparable, not proven equivalent', () => {
    const input = baseInput();
    input.comparisonTeamGameRows = [
      {
        gameId: 'old1',
        teamId: 'c',
        week: 1,
        successOff: 0.5,
        successDef: 0.4,
        offensePlays: 70,
        defensePlays: 68,
      },
      {
        gameId: 'old1',
        teamId: 'd',
        week: 1,
        successOff: 0.45,
        successDef: 0.42,
        offensePlays: 68,
        defensePlays: 70,
      },
    ];

    const report = buildV4ComparatorSourceReadinessReport(input);
    expect(report.historicalComparison.equivalenceStatus).toBe(
      'CANDIDATE_COMPARABLE'
    );
    expect(report.canPersistProspectiveV4Comparator).toBe(false);
  });

  it('rejects non-2026 target season and unknown CLI arguments', () => {
    const parsed = parseV4ComparatorSourceReadinessArgs([
      '--season',
      '2025',
      '--wat',
    ]);
    expect(parsed.ok).toBe(false);
    expect('errors' in parsed).toBe(true);
    if ('errors' in parsed) {
      expect(parsed.errors.join(' ')).toMatch(/season must equal 2026/);
      expect(parsed.errors.join(' ')).toMatch(/unknown or incomplete argument/);
    }
  });
});
