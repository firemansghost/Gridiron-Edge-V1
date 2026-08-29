/**
 * 2C-2J-6A — jobs grading settlement (pure; no DB/network).
 */

import {
  americanOddsWinPnl,
  findCloseLineAtCutoff,
  gradeMoneyline,
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
