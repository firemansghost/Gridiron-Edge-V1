/**
 * Phase 2C-2J-3A — favorite-crossing + bet-side closePrice regressions.
 */

import {
  selectGameMarketSnapshots,
  type MarketLineObservation,
} from '../lib/market-line-snapshot';
import {
  buildAuthoritativeMarketProvenance,
  deriveGameDetailMarketFromSelection,
  resolveBetSideClosePrice,
  validateMarketFavoriteInvariant,
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
  it('one-book true pickem: home 0 / away 0 — no invented favorite, invariant OK', () => {
    const rows = [
      row({
        id: 's-h',
        lineType: 'spread',
        lineValue: 0,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: home,
      }),
      row({
        id: 's-a',
        lineType: 'spread',
        lineValue: 0,
        bookName: 'DraftKings',
        timestamp: t1,
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
      const derived = deriveGameDetailMarketFromSelection({
        marketSelection: sel,
        homeTeamId: home,
        awayTeamId: away,
        homeTeamName: 'Home',
        awayTeamName: 'Away',
      });
      const inv = validateMarketFavoriteInvariant({
        isPickEm: derived.isPickEm,
        marketSpread: derived.marketSpread,
        homePrice: derived.homePrice,
        awayPrice: derived.awayPrice,
        favoriteTeamId: derived.favoriteTeamId,
        homeTeamId: home,
        awayTeamId: away,
      });
      return { derived, inv };
    };
    const forward = run(rows);
    const reverse = run([...rows].reverse());
    expect(forward.derived.isPickEm).toBe(true);
    expect(forward.derived.spreadHma).toBe(0);
    expect(forward.derived.favoriteTeamId).toBeNull();
    expect(forward.derived.homePrice).toBe(0);
    expect(forward.derived.awayPrice).toBe(0);
    expect(forward.inv.ok).toBe(true);
    expect(forward.inv.reason).toBeNull();
    expect(reverse).toEqual(forward);
  });

  it('consensus pickem from books straddling zero — no arbitrary home favorite', () => {
    const rows = [
      row({
        id: 'b1-h',
        lineType: 'spread',
        lineValue: -0.5,
        bookName: 'DraftKings',
        timestamp: t2,
        teamId: home,
      }),
      row({
        id: 'b1-a',
        lineType: 'spread',
        lineValue: 0.5,
        bookName: 'DraftKings',
        timestamp: t2,
        teamId: away,
      }),
      row({
        id: 'b2-h',
        lineType: 'spread',
        lineValue: 0.5,
        bookName: 'FanDuel',
        timestamp: t2,
        teamId: home,
      }),
      row({
        id: 'b2-a',
        lineType: 'spread',
        lineValue: -0.5,
        bookName: 'FanDuel',
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
    // median(+0.5, -0.5) = 0
    expect(sel.spreadConsensus.value).toBe(0);
    const derived = deriveGameDetailMarketFromSelection({
      marketSelection: sel,
      homeTeamId: home,
      awayTeamId: away,
      homeTeamName: 'Home',
      awayTeamName: 'Away',
    });
    expect(derived.isPickEm).toBe(true);
    expect(derived.favoriteTeamId).toBeNull();
    expect(derived.homePrice).toBe(0);
    expect(derived.awayPrice).toBe(0);
    const inv = validateMarketFavoriteInvariant({
      isPickEm: true,
      marketSpread: 0,
      homePrice: 0,
      awayPrice: 0,
      favoriteTeamId: null,
      homeTeamId: home,
      awayTeamId: away,
    });
    expect(inv.ok).toBe(true);
  });

  it('provenance follows newer T2 display snapshot — T1 cannot reappear as authoritative metadata', () => {
    const t1 = '2026-08-28T12:00:00.000Z';
    const t2 = '2026-08-28T18:00:00.000Z';
    const rows: MarketLineObservation[] = [
      // T1 DraftKings full coverage (older)
      row({
        id: 'dk-s-h-t1',
        lineType: 'spread',
        lineValue: -7,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: home,
      }),
      row({
        id: 'dk-s-a-t1',
        lineType: 'spread',
        lineValue: 7,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: away,
      }),
      row({
        id: 'dk-tot-t1',
        lineType: 'total',
        lineValue: 48,
        bookName: 'DraftKings',
        timestamp: t1,
      }),
      row({
        id: 'dk-ml-h-t1',
        lineType: 'moneyline',
        lineValue: -200,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: home,
      }),
      row({
        id: 'dk-ml-a-t1',
        lineType: 'moneyline',
        lineValue: 170,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: away,
      }),
      // T2 same book moves to -3 — current calc + provenance must be T2
      row({
        id: 'dk-s-h-t2',
        lineType: 'spread',
        lineValue: -3,
        bookName: 'DraftKings',
        timestamp: t2,
        teamId: home,
      }),
      row({
        id: 'dk-s-a-t2',
        lineType: 'spread',
        lineValue: 3,
        bookName: 'DraftKings',
        timestamp: t2,
        teamId: away,
      }),
      row({
        id: 'dk-tot-t2',
        lineType: 'total',
        lineValue: 51,
        bookName: 'DraftKings',
        timestamp: t2,
      }),
    ];

    const run = (input: MarketLineObservation[]) => {
      const sel = selectGameMarketSnapshots({
        rows: input,
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
      const prov = buildAuthoritativeMarketProvenance(sel);
      return { derived, prov, sel };
    };

    const forward = run(rows);
    const reverse = run([...rows].reverse());

    // Calculations use T2 HMA=3 (not T1 HMA=7)
    expect(forward.derived.spreadHma).toBe(3);
    expect(forward.derived.favoriteTeamId).toBe(home);
    expect(forward.derived.homePrice).toBe(-3);
    // Provenance also reports T2 — not T1 metadata
    expect(forward.prov.spread?.bookName).toBe('DraftKings');
    expect(forward.prov.spread?.timestamp).toBe(t2);
    expect(forward.prov.spread?.marketSpreadHma).toBe(3);
    expect(forward.prov.total?.total).toBe(51);
    expect(forward.prov.total?.timestamp).toBe(t2);
    expect(forward.prov.snapshotId).toContain(t2);
    expect(forward.prov).toEqual(reverse.prov);
    expect(forward.derived).toEqual(reverse.derived);
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
