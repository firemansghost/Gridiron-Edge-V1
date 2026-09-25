import {
  buildPlayScoringLedger,
  driveTeamScoreKey,
  playDerivedDriveOffensePoints,
} from '../src/research/v4-prospective-v1-play-scoring';

describe('V4 prospective v1 play scoring ledger', () => {
  it('derives fixed-team increments from scoring play cumulative score state', () => {
    const ledger = buildPlayScoringLedger([
      {
        gameId: 'g1',
        driveId: 'd1',
        driveNumber: 1,
        playNumber: 1,
        period: 1,
        offense: 'Home',
        defense: 'Away',
        home: 'Home',
        away: 'Away',
        offenseScore: 0,
        defenseScore: 0,
        scoring: false,
      },
      {
        gameId: 'g1',
        driveId: 'd1',
        driveNumber: 1,
        playNumber: 8,
        period: 1,
        offense: 'Home',
        defense: 'Away',
        home: 'Home',
        away: 'Away',
        offenseScore: 3,
        defenseScore: 0,
        scoring: true,
      },
      {
        gameId: 'g1',
        driveId: 'd2',
        driveNumber: 2,
        playNumber: 6,
        period: 1,
        offense: 'Away',
        defense: 'Home',
        home: 'Home',
        away: 'Away',
        offenseScore: 7,
        defenseScore: 3,
        scoring: true,
      },
    ]);

    expect(ledger.valid).toBe(true);
    expect(ledger.scoringRows).toBe(2);
    expect(ledger.validScoringEvents).toBe(2);
    expect(ledger.pointsByDriveTeam[driveTeamScoreKey('d1', 'home')]).toBe(3);
    expect(ledger.pointsByDriveTeam[driveTeamScoreKey('d2', 'away')]).toBe(7);
    expect(ledger.playDriveIds).toEqual(['d1', 'd2']);
  });

  it('credits a defensive touchdown to the defense team, leaving offense drive points at zero', () => {
    const ledger = buildPlayScoringLedger([
      {
        gameId: 'g1',
        driveId: 'd1',
        driveNumber: 1,
        playNumber: 5,
        period: 1,
        offense: 'Away',
        defense: 'Home',
        home: 'Home',
        away: 'Away',
        offenseScore: 0,
        defenseScore: 7,
        scoring: true,
      },
    ]);

    expect(ledger.valid).toBe(true);
    expect(ledger.pointsByDriveTeam[driveTeamScoreKey('d1', 'home')]).toBe(7);
    expect(
      playDerivedDriveOffensePoints({
        ledger,
        driveId: 'd1',
        offenseProviderTeam: 'Away',
      })
    ).toBe(0);
  });

  it('sums multiple scoring events on the same drive when the provider splits them', () => {
    const ledger = buildPlayScoringLedger([
      {
        gameId: 'g1',
        driveId: 'd1',
        driveNumber: 1,
        playNumber: 7,
        period: 1,
        offense: 'Home',
        defense: 'Away',
        home: 'Home',
        away: 'Away',
        offenseScore: 6,
        defenseScore: 0,
        scoring: true,
      },
      {
        gameId: 'g1',
        driveId: 'd1',
        driveNumber: 1,
        playNumber: 8,
        period: 1,
        offense: 'Home',
        defense: 'Away',
        home: 'Home',
        away: 'Away',
        offenseScore: 7,
        defenseScore: 0,
        scoring: true,
      },
    ]);

    expect(ledger.valid).toBe(true);
    expect(
      playDerivedDriveOffensePoints({
        ledger,
        driveId: 'd1',
        offenseProviderTeam: 'Home',
      })
    ).toBe(7);
  });

  it('fails closed on impossible scoreboard jumps', () => {
    const ledger = buildPlayScoringLedger([
      {
        gameId: 'g1',
        driveId: 'd1',
        driveNumber: 1,
        playNumber: 3,
        period: 1,
        offense: 'Home',
        defense: 'Away',
        home: 'Home',
        away: 'Away',
        offenseScore: 23,
        defenseScore: 0,
        scoring: true,
      },
    ]);

    expect(ledger.valid).toBe(false);
    expect(ledger.invalidScoringEvents).toBe(1);
    expect(ledger.invalidEvents[0].reason).toBe(
      'single_scoring_event_increment_gt_8'
    );
  });

  it('fails closed on score regression or a scoring row with no score increment', () => {
    const regression = buildPlayScoringLedger([
      {
        gameId: 'g1',
        driveId: 'd1',
        driveNumber: 1,
        playNumber: 1,
        period: 1,
        offense: 'Home',
        defense: 'Away',
        home: 'Home',
        away: 'Away',
        offenseScore: 7,
        defenseScore: 0,
        scoring: true,
      },
      {
        gameId: 'g1',
        driveId: 'd2',
        driveNumber: 2,
        playNumber: 1,
        period: 1,
        offense: 'Away',
        defense: 'Home',
        home: 'Home',
        away: 'Away',
        offenseScore: 0,
        defenseScore: 6,
        scoring: true,
      },
    ]);
    expect(regression.valid).toBe(false);
    expect(regression.invalidEvents[0].reason).toBe('score_regression');

    const noIncrement = buildPlayScoringLedger([
      {
        gameId: 'g2',
        driveId: 'd3',
        driveNumber: 1,
        playNumber: 1,
        period: 1,
        offense: 'Home',
        defense: 'Away',
        home: 'Home',
        away: 'Away',
        offenseScore: 0,
        defenseScore: 0,
        scoring: true,
      },
    ]);
    expect(noIncrement.valid).toBe(false);
    expect(noIncrement.invalidEvents[0].reason).toBe(
      'scoring_row_without_score_increment'
    );
  });

  it('returns null when drive play coverage is absent', () => {
    const ledger = buildPlayScoringLedger([
      {
        gameId: 'g1',
        driveId: 'd1',
        driveNumber: 1,
        playNumber: 1,
        period: 1,
        offense: 'Home',
        defense: 'Away',
        home: 'Home',
        away: 'Away',
        offenseScore: 0,
        defenseScore: 0,
        scoring: false,
      },
    ]);

    expect(ledger.valid).toBe(true);
    expect(
      playDerivedDriveOffensePoints({
        ledger,
        driveId: 'missing',
        offenseProviderTeam: 'Home',
      })
    ).toBeNull();
  });
});
