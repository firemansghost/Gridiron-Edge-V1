/**
 * Phase 1B — Official Card truth (pure helpers + static API/page checks).
 * No provider / DB / workflow execution.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  OFFICIAL_CARD_EMPTY_MESSAGE,
  OFFICIAL_CARD_SEASON,
  OFFICIAL_CARD_SOURCE,
  OFFICIAL_CARD_STRATEGY_TAG,
  assertOfficialCardIntegrity,
  buildOfficialCardCsvRows,
  buildOfficialCardView,
  buildOfficialCardWhere,
  findOfficialCardDuplicates,
  formatAmericanOdds,
  formatMoneylinePick,
  formatSpreadPick,
  formatTotalPick,
  parseOfficialCardNotes,
  selectOfficialCardRows,
  summarizeOfficialCard,
  type OfficialCardBetInput,
} from '@/lib/official-card';

const webRoot = path.join(__dirname, '..');
const repoRoot = path.join(__dirname, '../../..');

function makeGame(
  id: string,
  names: { away: string; home: string },
  status: OfficialCardBetInput['game']['status'] = 'scheduled',
  date = '2026-08-29T16:00:00.000Z'
): OfficialCardBetInput['game'] {
  return {
    id,
    season: 2026,
    week: 1,
    date,
    status,
    homeScore: status === 'final' ? 24 : null,
    awayScore: status === 'final' ? 17 : null,
    homeTeamId: `${id}-home`,
    awayTeamId: `${id}-away`,
    homeTeam: { id: `${id}-home`, name: names.home },
    awayTeam: { id: `${id}-away`, name: names.away },
  };
}

function makeBet(
  overrides: Partial<OfficialCardBetInput> & Pick<OfficialCardBetInput, 'id' | 'gameId' | 'marketType' | 'side'>
): OfficialCardBetInput {
  const gameId = overrides.gameId;
  return {
    id: overrides.id,
    season: 2026,
    week: 1,
    gameId,
    marketType: overrides.marketType,
    side: overrides.side,
    modelPrice: -4,
    closePrice: -4,
    stake: 100,
    result: null,
    pnl: null,
    clv: null,
    strategyTag: OFFICIAL_CARD_STRATEGY_TAG,
    source: OFFICIAL_CARD_SOURCE,
    notes: null,
    createdAt: '2026-08-28T12:00:00.000Z',
    game: makeGame(gameId, { away: 'Away', home: 'Home' }),
    ...overrides,
  };
}

describe('Official Card query contract', () => {
  it('locks season/strategy/source for 2026 official production truth', () => {
    expect(buildOfficialCardWhere(1)).toEqual({
      season: 2026,
      week: 1,
      strategyTag: 'official_flat_100',
      source: 'strategy_run',
    });
    expect(OFFICIAL_CARD_SEASON).toBe(2026);
    expect(OFFICIAL_CARD_STRATEGY_TAG).toBe('official_flat_100');
    expect(OFFICIAL_CARD_SOURCE).toBe('strategy_run');
  });
});

describe('Official Card pick formatting', () => {
  it('formats away +50.5, home -4, and PK', () => {
    expect(formatSpreadPick('Ball State', 50.5)).toBe('Ball State +50.5');
    expect(formatSpreadPick('Favorite', -4)).toBe('Favorite -4');
    expect(formatSpreadPick('Stanford', 24)).toBe('Stanford +24');
    expect(formatSpreadPick('Team', 0)).toBe('Team PK');
  });

  it('formats moneyline American odds', () => {
    expect(formatMoneylinePick('Ball State', 1900)).toBe('Ball State +1900');
    expect(formatAmericanOdds(-150)).toBe('-150');
    expect(formatMoneylinePick('Home', -150)).toBe('Home -150');
  });

  it('formats over/under totals', () => {
    expect(formatTotalPick('over', 52.5)).toBe('Over 52.5');
    expect(formatTotalPick('under', 45)).toBe('Under 45');
  });
});

describe('Official Card notes parser', () => {
  it('parses persisted Core V1 notes without recalculation', () => {
    const meta = parseOfficialCardNotes(
      'book=DraftKings; closePrice=50.5; edgePts=2.25; grade=B; market=spread; marketTimestamp=2026-08-29T16:00:00.000Z; model=Core V1; modelPrice=-3; side=away'
    );
    expect(meta.metadataAvailable).toBe(true);
    expect(meta.modelLabel).toBe('Core V1');
    expect(meta.grade).toBe('B');
    expect(meta.edgePts).toBe(2.25);
    expect(meta.book).toBe('DraftKings');
    expect(meta.marketTimestamp).toBe('2026-08-29T16:00:00.000Z');
  });

  it('does not fabricate metadata from malformed notes', () => {
    const meta = parseOfficialCardNotes('not-valid-notes {grade:A}');
    expect(meta.metadataAvailable).toBe(false);
    expect(meta.grade).toBeNull();
    expect(meta.edgePts).toBeNull();
    expect(meta.book).toBeNull();
    expect(meta.warning).toMatch(/malformed/i);

    const wager = makeBet({
      id: 'b1',
      gameId: 'g1',
      marketType: 'spread',
      side: 'away',
      closePrice: 50.5,
      notes: 'totally broken',
    });
    const view = buildOfficialCardView([wager]);
    expect(view.games[0].markets[0].pickLabel).toBe('Away +50.5');
    expect(view.games[0].markets[0].notesMeta.metadataAvailable).toBe(false);
  });
});

describe('Official Card integrity', () => {
  it('fails closed on duplicate game+market official rows', () => {
    const rows = [
      makeBet({ id: 'a', gameId: 'g1', marketType: 'spread', side: 'home' }),
      makeBet({ id: 'b', gameId: 'g1', marketType: 'spread', side: 'away' }),
    ];
    expect(rows.map((r) => `${r.id}:${r.gameId}:${r.marketType}:${r.strategyTag}:${r.source}`)).toEqual([
      'a:g1:spread:official_flat_100:strategy_run',
      'b:g1:spread:official_flat_100:strategy_run',
    ]);
    expect(findOfficialCardDuplicates(rows)).toEqual([
      expect.objectContaining({ gameId: 'g1', marketType: 'spread', count: 2 }),
    ]);
    expect(() => assertOfficialCardIntegrity(rows)).toThrow(/duplicate official rows/i);
    expect(() => buildOfficialCardView(rows)).toThrow(/duplicate official rows/i);
  });

  it('excludes hybrid_v2 and manual rows from the official result', () => {
    const rows = [
      makeBet({ id: 'official', gameId: 'g1', marketType: 'spread', side: 'home' }),
      makeBet({
        id: 'hybrid',
        gameId: 'g1',
        marketType: 'spread',
        side: 'away',
        strategyTag: 'hybrid_v2',
      }),
      makeBet({
        id: 'manual',
        gameId: 'g2',
        marketType: 'spread',
        side: 'home',
        source: 'manual',
      }),
    ];
    const selected = selectOfficialCardRows(rows);
    expect(selected.map((r) => r.id)).toEqual(['official']);
    const view = buildOfficialCardView(rows);
    expect(view.summary.totalBets).toBe(1);
    expect(view.games).toHaveLength(1);
  });
});

describe('Official Card summary', () => {
  it('does not let pending stake dilute ROI and excludes pushes from hit rate', () => {
    const gameA = makeGame('ga', { away: 'A', home: 'B' }, 'final');
    const gameB = makeGame('gb', { away: 'C', home: 'D' }, 'scheduled');
    const rows: OfficialCardBetInput[] = [
      makeBet({
        id: 'w1',
        gameId: 'ga',
        marketType: 'spread',
        side: 'home',
        stake: 100,
        result: 'win',
        pnl: 90.91,
        game: gameA,
      }),
      makeBet({
        id: 'l1',
        gameId: 'ga',
        marketType: 'moneyline',
        side: 'away',
        stake: 100,
        result: 'loss',
        pnl: -100,
        game: gameA,
      }),
      makeBet({
        id: 'p1',
        gameId: 'gb',
        marketType: 'spread',
        side: 'home',
        stake: 100,
        result: 'push',
        pnl: 0,
        game: gameB,
      }),
      makeBet({
        id: 'pend',
        gameId: 'gb',
        marketType: 'moneyline',
        side: 'away',
        stake: 500,
        result: null,
        pnl: null,
        game: gameB,
      }),
    ];
    const summary = summarizeOfficialCard(rows);
    expect(summary.pendingBets).toBe(1);
    expect(summary.gradedBets).toBe(3);
    expect(summary.wins).toBe(1);
    expect(summary.losses).toBe(1);
    expect(summary.pushes).toBe(1);
    expect(summary.gradedStake).toBe(300);
    expect(summary.totalPnL).toBeCloseTo(-9.09, 2);
    expect(summary.roi).toBeCloseTo(-9.09 / 300, 6);
    expect(summary.hitRate).toBeCloseTo(0.5, 6);
  });

  it('matches Week 1 graded ROI reference (~-15.98% on $1,400)', () => {
    const rowsFixed: OfficialCardBetInput[] = [];
    for (let i = 0; i < 6; i += 1) {
      rowsFixed.push(
        makeBet({
          id: `win${i}`,
          gameId: `gwin${i}`,
          marketType: 'spread',
          side: 'home',
          stake: 100,
          result: 'win',
          pnl: 576.23 / 6,
          game: makeGame(`gwin${i}`, { away: 'A', home: 'B' }, 'final'),
        })
      );
    }
    for (let i = 0; i < 8; i += 1) {
      rowsFixed.push(
        makeBet({
          id: `loss${i}`,
          gameId: `gloss${i}`,
          marketType: 'spread',
          side: 'away',
          stake: 100,
          result: 'loss',
          pnl: -100,
          game: makeGame(`gloss${i}`, { away: 'C', home: 'D' }, 'final'),
        })
      );
    }
    const summary = summarizeOfficialCard(rowsFixed);
    expect(summary.gradedBets).toBe(14);
    expect(summary.wins).toBe(6);
    expect(summary.losses).toBe(8);
    expect(summary.pushes).toBe(0);
    expect(summary.gradedStake).toBe(1400);
    expect(summary.totalPnL).toBeCloseTo(-223.77, 2);
    expect((summary.roi ?? 0) * 100).toBeCloseTo(-15.98, 2);
  });

  it('counts 50 games / 50 spreads / 48 moneylines / 0 totals from a Week 1-shaped fixture', () => {
    const rows: OfficialCardBetInput[] = [];
    for (let i = 0; i < 50; i += 1) {
      const game = makeGame(`g${i}`, { away: `Away${i}`, home: `Home${i}` });
      rows.push(
        makeBet({
          id: `sp${i}`,
          gameId: `g${i}`,
          marketType: 'spread',
          side: 'home',
          game,
        })
      );
      if (i < 48) {
        rows.push(
          makeBet({
            id: `ml${i}`,
            gameId: `g${i}`,
            marketType: 'moneyline',
            side: 'away',
            closePrice: 1900,
            modelPrice: 1500,
            game,
          })
        );
      }
    }
    const summary = summarizeOfficialCard(rows);
    expect(summary.totalBets).toBe(98);
    expect(summary.gameCount).toBe(50);
    expect(summary.spreadBets).toBe(50);
    expect(summary.moneylineBets).toBe(48);
    expect(summary.totalsBets).toBe(0);
  });
});

describe('Official Card grouping and CSV', () => {
  it('groups by game, sorts by kickoff, and exports persisted columns only', () => {
    const early = makeGame('early', { away: 'Ball State', home: 'Home' }, 'scheduled', '2026-08-28T16:00:00.000Z');
    const late = makeGame('late', { away: 'Stanford', home: 'Home2' }, 'final', '2026-08-30T16:00:00.000Z');
    const rows = [
      makeBet({
        id: 'late-sp',
        gameId: 'late',
        marketType: 'spread',
        side: 'away',
        closePrice: 24,
        result: null,
        game: late,
      }),
      makeBet({
        id: 'early-sp',
        gameId: 'early',
        marketType: 'spread',
        side: 'away',
        closePrice: 50.5,
        notes:
          'book=DraftKings; edgePts=1.5; grade=C; market=spread; marketTimestamp=2026-08-28T12:00:00.000Z; model=Core V1',
        game: early,
      }),
      makeBet({
        id: 'early-ml',
        gameId: 'early',
        marketType: 'moneyline',
        side: 'away',
        closePrice: 1900,
        modelPrice: 1400,
        game: early,
      }),
    ];
    const view = buildOfficialCardView(rows);
    expect(view.games.map((g) => g.gameId)).toEqual(['early', 'late']);
    expect(view.games[0].markets.map((m) => m.marketType)).toEqual(['spread', 'moneyline']);
    expect(view.games[0].markets[0].pickLabel).toBe('Ball State +50.5');
    expect(view.games[1].markets[0].awaitingGrading).toBe(true);
    const csv = buildOfficialCardCsvRows(view.games);
    expect(Object.keys(csv[0])).toEqual([
      'Season',
      'Week',
      'Kickoff',
      'Game',
      'Market',
      'Pick',
      'Locked Line/Price',
      'Model Line/Fair Price',
      'Edge/Value',
      'Grade',
      'Book',
      'Market Timestamp',
      'Stake',
      'Result',
      'PnL',
      'CLV',
    ]);
    expect(JSON.stringify(csv)).not.toMatch(/currentLine|MarketLine|live/i);
  });
});

describe('Official Card API/page static containment', () => {
  const route = fs.readFileSync(path.join(webRoot, 'app/api/official-card/route.ts'), 'utf8');
  const helper = fs.readFileSync(path.join(webRoot, 'lib/official-card.ts'), 'utf8');
  const page = fs.readFileSync(path.join(webRoot, 'app/picks/page.tsx'), 'utf8');
  const nav = fs.readFileSync(path.join(webRoot, 'components/HeaderNav.tsx'), 'utf8');

  it('API is GET/read-only and does not write or use live slate/MarketLine', () => {
    expect(route).toContain('export async function GET');
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(helper).toContain('season: OFFICIAL_CARD_SEASON');
    expect(helper).toContain('strategyTag: OFFICIAL_CARD_STRATEGY_TAG');
    expect(helper).toContain('source: OFFICIAL_CARD_SOURCE');
    expect(route).toContain('buildOfficialCardWhere');
    expect(route).not.toMatch(/\bMarketLine\b/);
    expect(route).not.toContain('marketLines');
    expect(route).not.toContain('/api/weeks/slate');
    expect(route).not.toContain('slate-model');
    expect(route).not.toContain('gradeAvailableBets');
    expect(route).not.toContain('prisma.bet.create');
    expect(route).not.toContain('prisma.bet.update');
    expect(helper).not.toMatch(/\bMarketLine\b/);
    expect(helper).not.toContain('slate-model');
    expect(helper).not.toContain('core-v1-spread');
    expect(helper).not.toContain('gradeAvailableBets');
  });

  it('HeaderNav and /picks are Official Card, not My Picks live slate', () => {
    expect(nav).toContain('Official Card');
    expect(nav).not.toContain('My Picks');
    expect(page).toContain('Official Card');
    expect(page).toContain('/api/official-card');
    expect(page).toContain('View Live Model / Current Slate');
    expect(page).toContain('No official card has been locked');
    expect(page).not.toContain('ProductionModelSelector');
    expect(page).not.toContain('useProductionModel');
    expect(page).not.toContain('/api/weeks/slate');
    expect(page).not.toContain('/api/my-card');
    expect(page).not.toContain('/api/bets/summary');
    expect(page).not.toContain('Super Tier A');
    expect(page).not.toContain('hybrid_v2');
    expect(page).not.toContain('/api/bets/seed');
    expect(page).not.toContain('/api/admin/grade');
    expect(page).not.toContain('/api/admin/sync-week');
    expect(page).not.toContain('Insert Demo Bets');
  });

  it('empty-state helper names the locked-card week', () => {
    expect(OFFICIAL_CARD_EMPTY_MESSAGE(2)).toBe(
      'No official card has been locked for 2026 Week 2 yet.'
    );
  });
});

describe('Phase 1B does not modify workflows or model formulas', () => {
  function gitDiffNames(paths: string[]): string[] {
    const result = spawnSync(
      'git',
      ['diff', '--name-only', 'origin/main', '--', ...paths],
      { encoding: 'utf8', cwd: repoRoot }
    );
    expect(result.status).toBe(0);
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  it('does not modify guarded 2026 GitHub workflow files', () => {
    expect(gitDiffNames(['.github/workflows'])).toEqual([]);
  });

  it('does not modify Core/Hybrid/ratings/Odds/scores/grading calculation code', () => {
    expect(
      gitDiffNames([
        'apps/jobs/lib/grade-bets-2026.ts',
        'apps/jobs/src/ratings',
        'apps/web/lib/core-v2-spread.ts',
        'apps/web/lib/grading',
        'apps/jobs/src/odds',
        'apps/jobs/src/cfbd-game-results.ts',
        'apps/jobs/write-live-odds-2026.ts',
        'apps/jobs/write-core-v1-weekly-card-2026.ts',
        'apps/jobs/write-cfbd-scores-2026.ts',
        'apps/jobs/grade-bets-2026.ts',
      ])
    ).toEqual([]);
  });
});
