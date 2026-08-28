/**
 * Phase 2C-2J-3A — favorite-crossing + bet-side closePrice regressions.
 */

import {
  selectGameMarketSnapshots,
  type MarketLineObservation,
} from '../lib/market-line-snapshot';
import {
  deriveGameDetailMarketFromSelection,
  resolveBetSideClosePrice,
} from '../lib/game-detail-market';
import { deriveHybridTierFields } from '../lib/slate-hybrid-spread';

function row(
  partial: Partial<MarketLineObservation> &
    Pick<
      MarketLineObservation,
      'id' | 'lineType' | 'lineValue' | 'bookName' | 'timestamp'
    >
): MarketLineObservation {
  return {
    gameId: 'g1',
    teamId: null,
    ...partial,
  };
}

describe('game-detail market from marketSelection', () => {
  const home = 'home-team';
  const away = 'away-team';
  const t1 = '2026-08-28T12:00:00.000Z';
  const t2 = '2026-08-28T18:00:00.000Z';

  it('favorite crossing: T2 HMA=-1 away favorite; T1 full coverage cannot override', () => {
    const rows: MarketLineObservation[] = [
      // T1: home favored -2/+2 + total + ML (full coverage)
      row({
        id: 't1-s-h',
        lineType: 'spread',
        lineValue: -2,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: home,
      }),
      row({
        id: 't1-s-a',
        lineType: 'spread',
        lineValue: 2,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: away,
      }),
      row({
        id: 't1-tot',
        lineType: 'total',
        lineValue: 48,
        bookName: 'DraftKings',
        timestamp: t1,
      }),
      row({
        id: 't1-ml-h',
        lineType: 'moneyline',
        lineValue: -130,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: home,
      }),
      row({
        id: 't1-ml-a',
        lineType: 'moneyline',
        lineValue: 110,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: away,
      }),
      // T2: away favored +1 / -1
      row({
        id: 't2-s-h',
        lineType: 'spread',
        lineValue: 1,
        bookName: 'DraftKings',
        timestamp: t2,
        teamId: home,
      }),
      row({
        id: 't2-s-a',
        lineType: 'spread',
        lineValue: -1,
        bookName: 'DraftKings',
        timestamp: t2,
        teamId: away,
      }),
    ];

    const run = (input: MarketLineObservation[]) => {
      const sel = selectGameMarketSnapshots({
        rows: input,
        homeTeamId: home,
        awayTeamId: away,
        mode: 'current',
      });
      return deriveGameDetailMarketFromSelection({
        marketSelection: sel,
        homeTeamId: home,
        awayTeamId: away,
        homeTeamName: 'Home',
        awayTeamName: 'Away',
      });
    };

    const forward = run(rows);
    const reverse = run([...rows].reverse());

    expect(forward.spreadHma).toBe(-1);
    expect(forward.favoriteTeamId).toBe(away);
    expect(forward.homePrice).toBe(1);
    expect(forward.awayPrice).toBe(-1);
    expect(forward.marketSpread).toBe(-1);
    expect(reverse).toEqual(forward);
  });

  it('ML prices come from coherent same-book current snapshots (team-specific)', () => {
    const rows: MarketLineObservation[] = [
      row({
        id: 'ml-h-t1',
        lineType: 'moneyline',
        lineValue: -200,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: home,
      }),
      row({
        id: 'ml-a-t1',
        lineType: 'moneyline',
        lineValue: 170,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: away,
      }),
      row({
        id: 'ml-h-t2',
        lineType: 'moneyline',
        lineValue: -150,
        bookName: 'DraftKings',
        timestamp: t2,
        teamId: home,
      }),
      row({
        id: 'ml-a-t2',
        lineType: 'moneyline',
        lineValue: 130,
        bookName: 'DraftKings',
        timestamp: t2,
        teamId: away,
      }),
    ];
    const sel = selectGameMarketSnapshots({
      rows,
      homeTeamId: home,
      awayTeamId: away,
      mode: 'current',
    });
    const derived = deriveGameDetailMarketFromSelection({
      marketSelection: sel,
      homeTeamId: home,
      awayTeamId: away,
      homeTeamName: 'Home',
      awayTeamName: 'Away',
    });
    expect(derived.homeMoneylinePrice).toBe(-150);
    expect(derived.awayMoneylinePrice).toBe(130);
    expect(derived.moneylineFavoriteTeamId).toBe(home);
    expect(derived.displayMoneyline?.timestamp).toBe(t2);
  });
});

describe('resolveBetSideClosePrice', () => {
  const home = 'home';
  const away = 'away';

  it('uses homeLine when bet is home (favorite or dog)', () => {
    expect(
      resolveBetSideClosePrice({
        betTeamId: home,
        homeTeamId: home,
        awayTeamId: away,
        homeLine: -7,
        awayLine: 7,
      })
    ).toBe(-7);
    expect(
      resolveBetSideClosePrice({
        betTeamId: home,
        homeTeamId: home,
        awayTeamId: away,
        homeLine: 3.5,
        awayLine: -3.5,
      })
    ).toBe(3.5);
  });

  it('uses awayLine when bet is away (favorite or dog)', () => {
    expect(
      resolveBetSideClosePrice({
        betTeamId: away,
        homeTeamId: home,
        awayTeamId: away,
        homeLine: -7,
        awayLine: 7,
      })
    ).toBe(7);
    expect(
      resolveBetSideClosePrice({
        betTeamId: away,
        homeTeamId: home,
        awayTeamId: away,
        homeLine: 3.5,
        awayLine: -3.5,
      })
    ).toBe(-3.5);
  });

  it('passes bet-side closePrice into deriveHybridTierFields isDog semantics', () => {
    // Away dog pick: betTeam=away, awayLine=+7 → isDog true
    const awayDogClose = resolveBetSideClosePrice({
      betTeamId: 'away',
      homeTeamId: 'home',
      awayTeamId: 'away',
      homeLine: -7,
      awayLine: 7,
    });
    expect(awayDogClose).toBe(7);
    expect(
      deriveHybridTierFields(4.5, 'hybrid_strong', awayDogClose).isDog
    ).toBe(true);

    // Away favorite pick: betTeam=away, awayLine=-3.5 → isDog false
    const awayFavClose = resolveBetSideClosePrice({
      betTeamId: 'away',
      homeTeamId: 'home',
      awayTeamId: 'away',
      homeLine: 3.5,
      awayLine: -3.5,
    });
    expect(awayFavClose).toBe(-3.5);
    expect(
      deriveHybridTierFields(4.5, 'hybrid_strong', awayFavClose).isDog
    ).toBe(false);

    // Home favorite
    const homeFavClose = resolveBetSideClosePrice({
      betTeamId: 'home',
      homeTeamId: 'home',
      awayTeamId: 'away',
      homeLine: -7,
      awayLine: 7,
    });
    expect(
      deriveHybridTierFields(3.5, 'hybrid_strong', homeFavClose).isDog
    ).toBe(false);

    // Home dog
    const homeDogClose = resolveBetSideClosePrice({
      betTeamId: 'home',
      homeTeamId: 'home',
      awayTeamId: 'away',
      homeLine: 3.5,
      awayLine: -3.5,
    });
    expect(
      deriveHybridTierFields(3.5, 'hybrid_strong', homeDogClose).isDog
    ).toBe(true);
  });
});
