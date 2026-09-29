import * as fs from 'fs';
import * as path from 'path';
import {
  classifyBettingTicketWager,
  probabilityToAmerican,
  ticketCurrentEdge,
  ticketGrade,
  ticketPriceMovement,
  ticketThresholdPrice,
} from '../lib/betting-ticket';

describe('Betting Ticket price/value math', () => {
  it('computes spread edge in selected-team line space', () => {
    expect(
      ticketCurrentEdge({
        marketType: 'spread',
        side: 'home',
        modelPrice: -7,
        currentPrice: -3,
      })
    ).toBeCloseTo(4, 8);
    expect(ticketGrade('spread', 4)).toBe('A');
    expect(
      ticketThresholdPrice({
        marketType: 'spread',
        side: 'home',
        modelPrice: -7,
        grade: 'B',
      })
    ).toBe(-4);
  });

  it('computes total edge with side-aware direction', () => {
    expect(
      ticketCurrentEdge({
        marketType: 'total',
        side: 'over',
        modelPrice: 52,
        currentPrice: 48,
      })
    ).toBeCloseTo(4, 8);
    expect(
      ticketCurrentEdge({
        marketType: 'total',
        side: 'under',
        modelPrice: 48,
        currentPrice: 52,
      })
    ).toBeCloseTo(4, 8);
    expect(
      ticketThresholdPrice({
        marketType: 'total',
        side: 'over',
        modelPrice: 52,
        grade: 'B',
      })
    ).toBe(49);
    expect(
      ticketThresholdPrice({
        marketType: 'total',
        side: 'under',
        modelPrice: 48,
        grade: 'B',
      })
    ).toBe(51);
  });

  it('computes moneyline value in implied-probability points', () => {
    expect(
      ticketCurrentEdge({
        marketType: 'moneyline',
        side: 'home',
        modelPrice: 100,
        currentPrice: 150,
      })
    ).toBeCloseTo(10, 8);
    expect(ticketGrade('moneyline', 10)).toBe('A');
    expect(
      ticketThresholdPrice({
        marketType: 'moneyline',
        side: 'home',
        modelPrice: 100,
        grade: 'A',
      })
    ).toBe(150);
    expect(
      ticketThresholdPrice({
        marketType: 'moneyline',
        side: 'home',
        modelPrice: 100,
        grade: 'B',
      })
    ).toBe(122);
    expect(probabilityToAmerican(0.4)).toBe(150);
  });

  it('uses bettor-friendly movement direction for spread/total/ML', () => {
    expect(
      ticketPriceMovement({
        marketType: 'spread',
        side: 'home',
        lockedPrice: -3,
        currentPrice: -2.5,
      })
    ).toBeCloseTo(0.5, 8);

    expect(
      ticketPriceMovement({
        marketType: 'total',
        side: 'over',
        lockedPrice: 50.5,
        currentPrice: 49.5,
      })
    ).toBeCloseTo(1, 8);

    expect(
      ticketPriceMovement({
        marketType: 'moneyline',
        side: 'away',
        lockedPrice: 140,
        currentPrice: 150,
      })!
    ).toBeGreaterThan(0);
  });
});

describe('Betting Ticket operator buckets', () => {
  const base = {
    marketType: 'spread',
    side: 'home',
    modelPrice: -7,
    lockedPrice: -3,
    lockedGrade: 'A',
    currentPrice: -3,
    gameStatus: 'scheduled',
    kickoffIso: '2026-10-03T17:00:00.000Z',
    nowIso: '2026-10-03T12:00:00.000Z',
  };

  it('BET NOW requires locked A + current A + no worse price', () => {
    const result = classifyBettingTicketWager(base);
    expect(result.bucket).toBe('bet');
    expect(result.currentGrade).toBe('A');
    expect(result.priceNotWorse).toBe(true);
    expect(result.actionLabel).toContain('Playable to');
  });

  it('WATCH keeps strong value when the price is worse than lock', () => {
    const result = classifyBettingTicketWager({
      ...base,
      currentPrice: -3.5,
    });
    expect(result.currentGrade).toBe('B');
    expect(result.bucket).toBe('watch');
  });

  it('WATCHs A-grade value if the original locked wager was not A', () => {
    const result = classifyBettingTicketWager({
      ...base,
      lockedGrade: 'B',
      lockedPrice: -4,
      currentPrice: -3,
    });
    expect(result.currentGrade).toBe('A');
    expect(result.bucket).toBe('watch');
    expect(result.actionLabel).toContain('A-grade');
  });

  it('PASSes when only C-grade value remains', () => {
    const result = classifyBettingTicketWager({
      ...base,
      currentPrice: -5,
    });
    expect(result.currentGrade).toBe('C');
    expect(result.bucket).toBe('pass');
    expect(result.actionLabel).toContain('Playable to');
  });

  it('PASSes inside the 30-minute kickoff gate even with strong value', () => {
    const result = classifyBettingTicketWager({
      ...base,
      kickoffIso: '2026-10-03T12:20:00.000Z',
    });
    expect(result.bucket).toBe('pass');
    expect(result.reason).toContain('30-minute kickoff gate');
  });

  it('WATCHes rather than fabricating action when the current market is unavailable', () => {
    const result = classifyBettingTicketWager({
      ...base,
      currentPrice: null,
    });
    expect(result.bucket).toBe('watch');
    expect(result.actionLabel).toBe('Refresh market before betting');
  });
});

describe('Betting Ticket read-only product boundary', () => {
  const root = path.join(__dirname, '..');
  const route = fs.readFileSync(
    path.join(root, 'app/api/betting-ticket/route.ts'),
    'utf8'
  );
  const page = fs.readFileSync(path.join(root, 'app/ticket/page.tsx'), 'utf8');
  const nav = fs.readFileSync(path.join(root, 'components/HeaderNav.tsx'), 'utf8');

  it('uses persisted Official Card truth plus current MarketLine snapshots', () => {
    expect(route).toContain('buildOfficialCardWhere');
    expect(route).toContain('officialCardPrismaSelect');
    expect(route).toContain('prisma.bet.findMany');
    expect(route).toContain('prisma.marketLine.findMany');
    expect(route).toContain('indexGameMarketSelections');
    expect(route).toContain('classifyBettingTicketWager');
  });

  it('is GET/read-only and does not recalculate or persist a model', () => {
    expect(route).toContain('export async function GET');
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(route).not.toContain('prisma.bet.create');
    expect(route).not.toContain('prisma.bet.update');
    expect(route).not.toContain('prisma.bet.upsert');
    expect(route).not.toContain('prisma.marketLine.create');
    expect(route).not.toContain('getATSPick');
    expect(route).not.toContain('getOUPick');
    expect(route).not.toContain('computeProductionCoreV1');
    expect(route).not.toContain('write-core-v1');
  });

  it('adds a dedicated Betting Ticket UI without replacing Official Card or Current Slate', () => {
    expect(nav).toContain('Betting Ticket');
    expect(nav).toContain('Official Card');
    expect(nav).toContain('Current Slate');
    expect(page).toContain('/api/betting-ticket');
    expect(page).toContain('BET NOW');
    expect(page).toContain('WATCH');
    expect(page).toContain('PASS / NO CHASE');
    expect(page).toContain('View locked Official Card');
    expect(page).toContain('View full Current Slate');
    expect(page).not.toContain('ProductionModelSelector');
  });
});
