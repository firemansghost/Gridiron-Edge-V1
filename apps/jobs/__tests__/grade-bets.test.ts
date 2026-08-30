/**
 * 2C-2J-6A — jobs grading settlement (pure; no DB/network).
 */

import {
  americanOddsWinPnl,
  findCloseLineAtCutoff,
  gradeMoneyline,
  gradeSpreadTotal,
  isOfficial2026MissingClosePrice,
  resolveSideTeamId,
} from '../lib/grading-settlement';

describe('2C-2J-6A moneyline payout (jobs)', () => {
  it('plus-money win uses sportsbook closePrice (+270), not modelPrice', () => {
    const graded = gradeMoneyline('home', 180, 270, 7, 100);
    expect(graded.result).toBe('win');
    expect(graded.pnl).toBe(270);
  });

  it('minus-money win uses sportsbook closePrice (-185)', () => {
    const graded = gradeMoneyline('away', -145, -185, -3, 100);
    expect(graded.result).toBe('win');
    expect(graded.pnl).toBeCloseTo(100 * (100 / 185), 6);
  });

  it('moneyline loss = -stake', () => {
    const graded = gradeMoneyline('home', 180, 270, -7, 100);
    expect(graded.result).toBe('loss');
    expect(graded.pnl).toBe(-100);
  });

  it('moneyline push pnl = 0 (numeric zero)', () => {
    const graded = gradeMoneyline('home', 180, 270, 0, 100);
    expect(graded.result).toBe('push');
    expect(graded.pnl).toBe(0);
    expect(Object.is(graded.pnl, 0)).toBe(true);
  });

  it('changing modelPrice with fixed closePrice does not change realized PnL', () => {
    const a = gradeMoneyline('home', 180, 270, 14, 100);
    const b = gradeMoneyline('home', -110, 270, 14, 100);
    expect(a.pnl).toBe(b.pnl);
    expect(a.pnl).toBe(270);
    expect(a.clv).not.toBe(b.clv);
  });

  it('invalid sportsbook odds 0 fail closed', () => {
    expect(() => gradeMoneyline('home', 180, 0, 7, 100)).toThrow(/invalid sportsbook/);
    expect(() => americanOddsWinPnl(100, 0)).toThrow(/invalid sportsbook/);
  });
});

describe('2C-2J-6C-1r spread settlement sign (jobs)', () => {
  it('away underdog +38.5 loses by 16 → win (SJSU)', () => {
    // USC 42–26; margin home-away = +16; away sideMargin = -16; close = +38.5
    const g = gradeSpreadTotal('spread', 'away', 38.5, 38.5, 16, 68, 100);
    expect(g.result).toBe('win');
  });

  it('away underdog +31.5 loses by 17 → win (NMSU)', () => {
    const g = gradeSpreadTotal('spread', 'away', 31.5, 31.5, 17, 51, 100);
    expect(g.result).toBe('win');
  });

  it('underdog +7 loses by exactly 7 → push', () => {
    const away = gradeSpreadTotal('spread', 'away', 7, 7, 7, 40, 100);
    expect(away.result).toBe('push');
    expect(away.pnl).toBe(0);
    const home = gradeSpreadTotal('spread', 'home', 7, 7, -7, 40, 100);
    expect(home.result).toBe('push');
  });

  it('favorite -4 wins by 10 → win; favorite -7 wins by 7 → push', () => {
    const win = gradeSpreadTotal('spread', 'home', -4, -4, 10, 64, 100);
    expect(win.result).toBe('win');
    const push = gradeSpreadTotal('spread', 'home', -7, -7, 7, 40, 100);
    expect(push.result).toBe('push');
  });

  it('spread CLV is closeLine - modelLine for every side', () => {
    expect(
      gradeSpreadTotal('spread', 'home', -6.3219, -4, 10, 64, 100).clv
    ).toBeCloseTo(2.3219, 4);
    expect(gradeSpreadTotal('spread', 'home', 2, 4, 6, 48, 100).clv).toBe(2);
    expect(
      gradeSpreadTotal('spread', 'away', 12, 38.5, 16, 68, 100).clv
    ).toBe(26.5);
    expect(gradeSpreadTotal('spread', 'away', -7, -4, -10, 50, 100).clv).toBe(
      3
    );
  });

  it('Stanford Week 1: WIN, pnl +90.90, positive CLV ~+2.3219', () => {
    const model = -6.321889701911643;
    const close = -4;
    const g = gradeSpreadTotal('spread', 'home', model, close, 10, 64, 100);
    expect(g.result).toBe('win');
    expect(g.pnl).toBeCloseTo(90.9, 6);
    expect(g.clv).toBeCloseTo(2.321889701911643, 10);
    expect(g.clv).toBeGreaterThan(0);
  });

  it('Week 1 opening-card seven spreads settle 4–3', () => {
    const spreads: Array<{
      name: string;
      side: 'home' | 'away';
      close: number;
      home: number;
      away: number;
      expect: 'win' | 'loss';
    }> = [
      { name: 'SJSU', side: 'away', close: 38.5, home: 42, away: 26, expect: 'win' },
      { name: 'NMSU', side: 'away', close: 31.5, home: 34, away: 17, expect: 'win' },
      { name: 'NCST', side: 'away', close: 4, home: 34, away: 8, expect: 'loss' },
      { name: 'JVST', side: 'away', close: 6.5, home: 33, away: 7, expect: 'loss' },
      { name: 'SAC', side: 'away', close: 9.5, home: 28, away: 17, expect: 'loss' },
      { name: 'STAN', side: 'home', close: -4, home: 37, away: 27, expect: 'win' },
      { name: 'MEM', side: 'home', close: 4, home: 27, away: 21, expect: 'win' },
    ];
    let wins = 0;
    let losses = 0;
    for (const s of spreads) {
      const margin = s.home - s.away;
      const total = s.home + s.away;
      const g = gradeSpreadTotal(
        'spread',
        s.side,
        s.close,
        s.close,
        margin,
        total,
        100
      );
      expect(`${s.name}:${g.result}`).toBe(`${s.name}:${s.expect}`);
      if (g.result === 'win') wins += 1;
      if (g.result === 'loss') losses += 1;
    }
    expect(`${wins}-${losses}`).toBe('4-3');
  });
});

describe('2C-2J-6A side-aware pre-kick close line (jobs)', () => {
  const HOME = 'home-team';
  const AWAY = 'away-team';
  const kickoff = new Date('2026-09-01T00:00:00.000Z');

  it('home vs away moneyline select matching teamId at same timestamp', async () => {
    const rows = [
      {
        id: 'ml-home',
        teamId: HOME,
        lineValue: -185,
        timestamp: new Date('2026-08-31T20:00:00.000Z'),
      },
      {
        id: 'ml-away',
        teamId: AWAY,
        lineValue: 160,
        timestamp: new Date('2026-08-31T20:00:00.000Z'),
      },
    ];

    const deps = {
      findFirst: async (args: {
        where: Record<string, unknown>;
        orderBy: Array<Record<string, 'asc' | 'desc'>>;
      }) => {
        const teamId = args.where.teamId as string;
        const hit = rows.find((r) => r.teamId === teamId);
        expect(args.where.timestamp).toEqual({ lte: kickoff });
        expect(args.orderBy).toEqual([{ timestamp: 'desc' }, { id: 'desc' }]);
        return hit ? { lineValue: hit.lineValue, id: hit.id } : null;
      },
    };

    const homeClose = await findCloseLineAtCutoff(deps, {
      gameId: 'g1',
      marketType: 'moneyline',
      side: 'home',
      homeTeamId: HOME,
      awayTeamId: AWAY,
      cutoff: kickoff,
    });
    const awayClose = await findCloseLineAtCutoff(deps, {
      gameId: 'g1',
      marketType: 'moneyline',
      side: 'away',
      homeTeamId: HOME,
      awayTeamId: AWAY,
      cutoff: kickoff,
    });
    expect(homeClose).toBe(-185);
    expect(awayClose).toBe(160);
    expect(resolveSideTeamId({
      marketType: 'spread',
      side: 'home',
      homeTeamId: HOME,
      awayTeamId: AWAY,
    })).toBe(HOME);
  });

  it('pre-kick row used; post-kick-only returns null (fail closed)', async () => {
    const pre = {
      id: 'pre',
      lineValue: -7.5,
      timestamp: new Date('2026-08-31T12:00:00.000Z'),
    };
    const post = {
      id: 'post',
      lineValue: -3.5,
      timestamp: new Date('2026-09-01T01:00:00.000Z'),
    };

    const withPre = await findCloseLineAtCutoff(
      {
        findFirst: async (args) => {
          const lte = (args.where.timestamp as { lte: Date }).lte;
          if (pre.timestamp.getTime() <= lte.getTime()) {
            return { lineValue: pre.lineValue, id: pre.id };
          }
          return null;
        },
      },
      {
        gameId: 'g1',
        marketType: 'spread',
        side: 'home',
        homeTeamId: HOME,
        awayTeamId: AWAY,
        cutoff: kickoff,
      }
    );
    expect(withPre).toBe(-7.5);

    const postOnly = await findCloseLineAtCutoff(
      {
        findFirst: async (args) => {
          const lte = (args.where.timestamp as { lte: Date }).lte;
          if (post.timestamp.getTime() <= lte.getTime()) {
            return { lineValue: post.lineValue, id: post.id };
          }
          return null;
        },
      },
      {
        gameId: 'g1',
        marketType: 'spread',
        side: 'away',
        homeTeamId: HOME,
        awayTeamId: AWAY,
        cutoff: kickoff,
      }
    );
    expect(postOnly).toBeNull();
  });

  it('2026 official_flat_100 missing closePrice is invariant failure', () => {
    expect(
      isOfficial2026MissingClosePrice({
        season: 2026,
        strategyTag: 'official_flat_100',
        closePrice: null,
      })
    ).toBe(true);
    expect(
      isOfficial2026MissingClosePrice({
        season: 2026,
        strategyTag: 'official_flat_100',
        closePrice: 0,
      })
    ).toBe(false);
    expect(
      isOfficial2026MissingClosePrice({
        season: 2025,
        strategyTag: 'official_flat_100',
        closePrice: null,
      })
    ).toBe(false);
  });
});
