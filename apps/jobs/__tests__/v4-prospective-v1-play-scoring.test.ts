import {
  buildPlayScoringLedger,
  driveTeamScoreKey,
  playDerivedDriveOffensePoints,
} from '../src/research/v4-prospective-v1-play-scoring';

function row(overrides: Record<string, unknown>) {
  return {
    gameId: 'g1',
    driveId: 'd1',
    driveNumber: 1,
    playNumber: 1,
    period: 1,
    clockSeconds: 600,
    wallclock: '2026-09-01T12:00:00.000Z',
    offense: 'Home',
    defense: 'Away',
    home: 'Home',
    away: 'Away',
    offenseScore: 0,
    defenseScore: 0,
    scoring: true,
    playType: 'Field Goal Good',
    playText: 'Field goal attempt GOOD',
    ...overrides,
  };
}

describe('V4 prospective v1 semantic scoring ledger', () => {
  it('derives made field goals and ordinary TD+PAT from play semantics', () => {
    const ledger = buildPlayScoringLedger([
      row({
        driveId: 'd1',
        clockSeconds: 600,
        offenseScore: 3,
        playType: 'Field Goal Good',
        playText: 'Field goal attempt GOOD',
      }),
      row({
        driveId: 'd2',
        driveNumber: 2,
        clockSeconds: 300,
        offenseScore: 10,
        playType: 'Rushing Touchdown',
        playText:
          'rush for TOUCHDOWN #99 Kicker kick attempt good',
      }),
    ]);

    expect(ledger.valid).toBe(true);
    expect(ledger.validScoringEvents).toBe(2);
    expect(ledger.pointsByDriveTeam[driveTeamScoreKey('d1', 'home')]).toBe(3);
    expect(ledger.pointsByDriveTeam[driveTeamScoreKey('d2', 'home')]).toBe(7);
    expect(ledger.gameFinalScores[0]).toMatchObject({
      homeScore: 10,
      awayScore: 0,
    });
  });

  it('uses regulation clock rather than drive number for chronology', () => {
    const ledger = buildPlayScoringLedger([
      row({
        driveId: 'late-number',
        driveNumber: 20,
        playNumber: 6,
        period: 4,
        clockSeconds: 300,
        offenseScore: 27,
        defenseScore: 8,
        playType: 'Field Goal Good',
        playText: 'field goal attempt GOOD',
      }),
      row({
        driveId: 'lower-number-later',
        driveNumber: 17,
        playNumber: 6,
        period: 4,
        clockSeconds: 118,
        offenseScore: 34,
        defenseScore: 8,
        playType: 'Rushing Touchdown',
        playText: 'rush TOUCHDOWN #99 Kicker kick attempt good',
      }),
    ]);

    expect(ledger.valid).toBe(true);
    expect(ledger.gameFinalScores[0].homeScore).toBe(10);
    expect(ledger.semanticFallbackEvents).toBeGreaterThan(0);
  });

  it('handles malformed overtime cumulative scores from explicit scoring semantics', () => {
    const ledger = buildPlayScoringLedger([
      row({
        period: 5,
        clockSeconds: 0,
        wallclock: '2026-09-01T12:01:00.000Z',
        driveId: 'ot1',
        offense: 'Away',
        defense: 'Home',
        offenseScore: 35,
        defenseScore: 35,
        playType: 'Rushing Touchdown',
        playText: 'Runner 25 Yd Run (Kicker Kick)',
      }),
      row({
        period: 5,
        clockSeconds: 0,
        wallclock: '2026-09-01T12:02:00.000Z',
        driveId: 'ot2',
        driveNumber: 2,
        offenseScore: 35,
        defenseScore: 35,
        playType: 'Rushing Touchdown',
        playText: 'Runner 8 Yd Run (Kicker Kick)',
      }),
      row({
        period: 6,
        clockSeconds: 0,
        wallclock: '2026-09-01T12:03:00.000Z',
        driveId: 'ot3',
        driveNumber: 3,
        offenseScore: 41,
        defenseScore: 35,
        playType: 'Passing Touchdown',
        playText: 'pass for TOUCHDOWN (Two-Point Pass Conversion Failed)',
      }),
      row({
        period: 6,
        clockSeconds: 0,
        wallclock: '2026-09-01T12:04:00.000Z',
        driveId: 'ot4',
        driveNumber: 4,
        offense: 'Away',
        defense: 'Home',
        offenseScore: 41,
        defenseScore: 41,
        playType: 'Rushing Touchdown',
        playText: 'run for TOUCHDOWN (Two-Point Run Conversion Failed)',
      }),
      row({
        period: 7,
        clockSeconds: 0,
        wallclock: '2026-09-01T12:05:00.000Z',
        driveId: 'ot5',
        driveNumber: 5,
        offense: 'Away',
        defense: 'Home',
        offenseScore: 43,
        defenseScore: 41,
        playType: 'Two Point Pass',
        playText: 'Pass for Two-Point Conversion',
      }),
    ]);

    expect(ledger.valid).toBe(true);
    expect(ledger.gameFinalScores[0]).toMatchObject({
      homeScore: 13,
      awayScore: 15,
    });
    expect(ledger.scoreStateMismatchEvents).toBeGreaterThan(0);
  });

  it('resolves a defensive TD even when provider cumulative score magnitude is wrong', () => {
    const ledger = buildPlayScoringLedger([
      row({
        driveId: 'off-td',
        offenseScore: 7,
        defenseScore: 0,
        playType: 'Passing Touchdown',
        playText: 'pass TOUCHDOWN Kicker kick attempt good',
      }),
      row({
        driveId: 'def-td',
        driveNumber: 2,
        clockSeconds: 500,
        offense: 'Away',
        defense: 'Home',
        offenseScore: 0,
        defenseScore: 8,
        playType: 'Fumble Recovery (Own)',
        playText:
          'fumble recovered by defense return TOUCHDOWN Kicker kick attempt good',
      }),
    ]);

    expect(ledger.valid).toBe(true);
    expect(ledger.pointsByDriveTeam[driveTeamScoreKey('def-td', 'home')]).toBe(7);
    expect(
      playDerivedDriveOffensePoints({
        ledger,
        driveId: 'def-td',
        offenseProviderTeam: 'Away',
      })
    ).toBe(0);
    expect(ledger.gameFinalScores[0].homeScore).toBe(14);
  });

  it('resolves provider-ambiguous safety side from score direction', () => {
    const ledger = buildPlayScoringLedger([
      row({
        driveId: 'td',
        offenseScore: 7,
        playType: 'Passing Touchdown',
        playText: 'pass TOUCHDOWN Kicker kick attempt good',
      }),
      row({
        driveId: 'safety',
        driveNumber: 2,
        clockSeconds: 400,
        offenseScore: 9,
        defenseScore: 0,
        playType: 'Safety',
        playText: 'Team Safety',
      }),
    ]);

    expect(ledger.valid).toBe(true);
    expect(ledger.pointsByDriveTeam[driveTeamScoreKey('safety', 'home')]).toBe(2);
    expect(ledger.gameFinalScores[0].homeScore).toBe(9);
  });

  it('uses score state only to resolve an ambiguous two-point result', () => {
    const ledger = buildPlayScoringLedger([
      row({
        driveId: 'td',
        offenseScore: 6,
        playType: 'Passing Touchdown',
        playText: 'pass TOUCHDOWN (Runner Run for Two-Point Conversion)',
      }),
    ]);

    expect(ledger.valid).toBe(true);
    expect(ledger.pointsByDriveTeam[driveTeamScoreKey('td', 'home')]).toBe(6);
  });

  it('honors PAT missed even when summary text also contains a parenthetical kick', () => {
    const ledger = buildPlayScoringLedger([
      row({
        driveId: 'td',
        offenseScore: 6,
        playType: 'Rushing Touchdown',
        playText: 'Runner 27 Yd Run (Kicker KICK) (Kicker PAT MISSED)',
      }),
    ]);

    expect(ledger.valid).toBe(true);
    expect(ledger.pointsByDriveTeam[driveTeamScoreKey('td', 'home')]).toBe(6);
  });

  it('fails closed when scoring value remains genuinely ambiguous', () => {
    const ledger = buildPlayScoringLedger([
      row({
        driveId: 'td',
        offenseScore: 5,
        playType: 'Passing Touchdown',
        playText: 'pass TOUCHDOWN',
      }),
    ]);

    expect(ledger.valid).toBe(false);
    expect(ledger.invalidEvents[0].reason).toBe('ambiguous_scoring_event');
  });

  it('returns null when drive play coverage is absent', () => {
    const ledger = buildPlayScoringLedger([
      row({
        driveId: 'd1',
        scoring: false,
      }),
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
