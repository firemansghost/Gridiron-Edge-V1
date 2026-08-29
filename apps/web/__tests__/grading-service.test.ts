/**
 * 2C-2J-6A — web grading settlement + consolidation (pure / static).
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  americanOddsWinPnl,
  findCloseLineAtCutoff,
  gradeMoneyline,
  isOfficial2026MissingClosePrice,
  resolveSideTeamId,
} from '../lib/grading/settlement';

describe('2C-2J-6A moneyline payout (web settlement)', () => {
  it('plus-money win uses sportsbook closePrice (+270), not modelPrice', () => {
    const graded = gradeMoneyline('home', 180, 270, 7, 100);
    expect(graded.result).toBe('win');
    expect(graded.pnl).toBe(270);
  });

  it('minus-money win uses sportsbook closePrice (-185)', () => {
    const graded = gradeMoneyline('away', -145, -185, -3, 100);
    expect(graded.result).toBe('win');
    expect(graded.pnl).toBeCloseTo(54.054054, 5);
  });

  it('moneyline loss = -stake', () => {
    expect(gradeMoneyline('home', 180, 270, -7, 100).pnl).toBe(-100);
  });

  it('moneyline push pnl/clv path keeps numeric zero pnl', () => {
    const graded = gradeMoneyline('away', -110, 150, 0, 100);
    expect(graded.result).toBe('push');
    expect(graded.pnl).toBe(0);
    expect(graded.pnl === 0).toBe(true);
  });

  it('same closePrice different modelPrice → same PnL', () => {
    const a = gradeMoneyline('home', 200, -185, 10, 100);
    const b = gradeMoneyline('home', -120, -185, 10, 100);
    expect(a.pnl).toBe(b.pnl);
    expect(a.pnl).toBeCloseTo(100 * (100 / 185), 6);
  });

  it('invalid sportsbook odds 0 fail closed', () => {
    expect(() => gradeMoneyline('home', 180, 0, 3, 100)).toThrow(/invalid sportsbook/);
    expect(() => americanOddsWinPnl(100, Number.NaN)).toThrow(/invalid sportsbook/);
  });
});

describe('2C-2J-6A side-aware close line + official invariant (web)', () => {
  const HOME = 'h';
  const AWAY = 'a';
  const kickoff = new Date('2026-09-06T16:00:00.000Z');

  it('selects home/away ML team rows; spread side resolves teamId', async () => {
    expect(
      resolveSideTeamId({
        marketType: 'moneyline',
        side: 'away',
        homeTeamId: HOME,
        awayTeamId: AWAY,
      })
    ).toBe(AWAY);

    const deps = {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        if (args.where.teamId === HOME) return { lineValue: -210, id: '1' };
        if (args.where.teamId === AWAY) return { lineValue: 175, id: '2' };
        return null;
      },
    };
    expect(
      await findCloseLineAtCutoff(deps, {
        gameId: 'g',
        marketType: 'moneyline',
        side: 'home',
        homeTeamId: HOME,
        awayTeamId: AWAY,
        cutoff: kickoff,
      })
    ).toBe(-210);
    expect(
      await findCloseLineAtCutoff(deps, {
        gameId: 'g',
        marketType: 'moneyline',
        side: 'away',
        homeTeamId: HOME,
        awayTeamId: AWAY,
        cutoff: kickoff,
      })
    ).toBe(175);
  });

  it('never returns post-kick-only lines', async () => {
    const postOnly = await findCloseLineAtCutoff(
      {
        findFirst: async () => null,
      },
      {
        gameId: 'g',
        marketType: 'total',
        side: 'over',
        homeTeamId: HOME,
        awayTeamId: AWAY,
        cutoff: kickoff,
      }
    );
    expect(postOnly).toBeNull();
  });

  it('2026 official missing closePrice invariant', () => {
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
        closePrice: undefined,
      })
    ).toBe(true);
  });
});

describe('2C-2J-6A web consolidation (static)', () => {
  const root = path.resolve(__dirname, '../../..');
  const route = fs.readFileSync(
    path.join(root, 'apps/web/app/api/bets/grade/route.ts'),
    'utf8'
  );
  const script = fs.readFileSync(
    path.join(root, 'apps/web/scripts/run-grading-for-week.ts'),
    'utf8'
  );

  it('API route delegates to gradeAvailableBets; no modelPrice ML payout math', () => {
    expect(route).toContain('gradeAvailableBets');
    expect(route).not.toMatch(/pnl\s*=\s*.*bet\.modelPrice/);
    expect(route).not.toMatch(/const odds = Number\(bet\.modelPrice\)/);
    expect(route).not.toMatch(/pnl\s*\?\s*Number\(pnl\)\s*:\s*null/);
  });

  it('manual week script delegates to grading service; no independent ML payout', () => {
    expect(script).toContain('gradeAvailableBets');
    expect(script).toContain("from '../lib/grading/grading-service'");
    expect(script).not.toMatch(/bet\.modelPrice/);
    expect(script).not.toMatch(/100 \/ Math\.abs/);
  });
});
