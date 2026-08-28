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
  isWithinMaxAbsMarketSpread,
  MAX_ABS_MARKET_SPREAD,
  recommendPickEmSpreadSide,
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

describe('MAX_ABS_MARKET_SPREAD consumer ceiling (2C-2J-3C)', () => {
  const home = 'home-team';
  const away = 'away-team';
  const tCurrent = '2026-08-28T18:00:00.000Z';
  const tOld = '2026-08-28T12:00:00.000Z';

  function deriveFromRows(rows: MarketLineObservation[]) {
    const sel = selectGameMarketSnapshots({
      rows,
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
  }

  function spreadPair(
    abs: number,
    ts: string,
    book: string,
    idPrefix: string,
    homeFavored = true
  ): MarketLineObservation[] {
    const homeLine = homeFavored ? -abs : abs;
    const awayLine = homeFavored ? abs : -abs;
    return [
      row({
        id: `${idPrefix}-h`,
        lineType: 'spread',
        lineValue: homeLine,
        bookName: book,
        timestamp: ts,
        teamId: home,
      }),
      row({
        id: `${idPrefix}-a`,
        lineType: 'spread',
        lineValue: awayLine,
        bookName: book,
        timestamp: ts,
        teamId: away,
      }),
    ];
  }

  it('accepts ceiling boundary helpers', () => {
    expect(MAX_ABS_MARKET_SPREAD).toBe(100);
    expect(isWithinMaxAbsMarketSpread(50)).toBe(true);
    expect(isWithinMaxAbsMarketSpread(50.5)).toBe(true);
    expect(isWithinMaxAbsMarketSpread(51)).toBe(true);
    expect(isWithinMaxAbsMarketSpread(100)).toBe(true);
    expect(isWithinMaxAbsMarketSpread(100.5)).toBe(false);
    expect(isWithinMaxAbsMarketSpread(101)).toBe(false);
  });

  it.each([50.5, 51, 100])(
    'authoritative current +/-%s survives unchanged',
    (abs) => {
      const rows = spreadPair(abs, tCurrent, 'DraftKings', `cur-${abs}`);
      const forward = deriveFromRows(rows);
      const reverse = deriveFromRows([...rows].reverse());
      expect(forward.spreadHma).toBe(abs);
      expect(forward.marketSpread).toBe(-abs);
      expect(forward.homePrice).toBe(-abs);
      expect(forward.awayPrice).toBe(abs);
      expect(forward.favoriteTeamId).toBe(home);
      expect(forward.spreadSuppressedOutOfRange).toBe(false);
      expect(forward).toEqual(reverse);
    }
  );

  it('+/-100.5 is suppressed without inventing values', () => {
    const rows = spreadPair(100.5, tCurrent, 'DraftKings', 'oor');
    const d = deriveFromRows(rows);
    expect(d.spreadSuppressedOutOfRange).toBe(true);
    expect(d.spreadHma).toBeNull();
    expect(d.marketSpread).toBeNull();
    expect(d.homePrice).toBeNull();
    expect(d.awayPrice).toBeNull();
    expect(d.favoriteTeamId).toBeNull();
    expect(d.isPickEm).toBe(false);
  });

  it('historical +/-49 cannot replace current +/-51; reverse order identical', () => {
    const rows = [
      ...spreadPair(49, tOld, 'DraftKings', 'old-49'),
      ...spreadPair(51, tCurrent, 'DraftKings', 'cur-51'),
    ];
    const forward = deriveFromRows(rows);
    const reverse = deriveFromRows([...rows].reverse());
    expect(forward.spreadHma).toBe(51);
    expect(forward.marketSpread).toBe(-51);
    expect(forward.favoriteTeamId).toBe(home);
    expect(forward.spreadSuppressedOutOfRange).toBe(false);
    expect(forward).toEqual(reverse);
  });

  it('out-of-range current is suppressed even when older in-range history exists', () => {
    const rows = [
      ...spreadPair(49, tOld, 'DraftKings', 'old-ok'),
      ...spreadPair(100.5, tCurrent, 'DraftKings', 'cur-bad'),
    ];
    const forward = deriveFromRows(rows);
    const reverse = deriveFromRows([...rows].reverse());
    expect(forward.spreadSuppressedOutOfRange).toBe(true);
    expect(forward.marketSpread).toBeNull();
    expect(forward.favoriteTeamId).toBeNull();
    // Must not resurrect old 49 as favorite
    expect(forward).toEqual(reverse);
  });
});

describe("pick'em HMA-side recommendation (2C-2J-3C)", () => {
  const home = 'home-team';
  const away = 'away-team';

  it('A: market HMA=0, Core V1 HMA=+3 → Home PK at 0', () => {
    const pk = recommendPickEmSpreadSide({
      coreSpreadHma: 3,
      homeTeamId: home,
      awayTeamId: away,
      homeTeamName: 'Home U',
      awayTeamName: 'Away U',
    });
    expect(pk.recommendedTeamId).toBe(home);
    expect(pk.recommendedTeamName).toBe('Home U');
    expect(pk.line).toBe(0);
    expect(pk.label).toBe('Home U PK');
    expect(pk.edgeHma).toBe(3);
    expect(pk.label).not.toMatch(/null/i);
  });

  it('B: market HMA=0, Core V1 HMA=-3 → Away PK at 0', () => {
    const pk = recommendPickEmSpreadSide({
      coreSpreadHma: -3,
      homeTeamId: home,
      awayTeamId: away,
      homeTeamName: 'Home U',
      awayTeamName: 'Away U',
    });
    expect(pk.recommendedTeamId).toBe(away);
    expect(pk.recommendedTeamName).toBe('Away U');
    expect(pk.line).toBe(0);
    expect(pk.label).toBe('Away U PK');
    expect(pk.edgeHma).toBe(-3);
  });

  it('C: edge within floor → no recommendation', () => {
    const pk = recommendPickEmSpreadSide({
      coreSpreadHma: 0.05,
      homeTeamId: home,
      awayTeamId: away,
      homeTeamName: 'Home U',
      awayTeamName: 'Away U',
      edgeFloor: 0.1,
    });
    expect(pk.recommendedTeamId).toBeNull();
    expect(pk.recommendedTeamName).toBeNull();
    expect(pk.label).toBeNull();
    expect(pk.line).toBe(0);
  });

  it('D: never produces null-team labels', () => {
    for (const hma of [3, -3, 0.05, 0]) {
      const pk = recommendPickEmSpreadSide({
        coreSpreadHma: hma,
        homeTeamId: home,
        awayTeamId: away,
        homeTeamName: 'Home U',
        awayTeamName: 'Away U',
      });
      if (pk.label !== null) {
        expect(pk.recommendedTeamId).not.toBeNull();
        expect(pk.recommendedTeamName).not.toBeNull();
        expect(pk.label).not.toMatch(/null/i);
      }
    }
  });

  it('E: pickem market derivation reverse-order stable', () => {
    const t = '2026-08-28T18:00:00.000Z';
    const rows: MarketLineObservation[] = [
      row({
        id: 'pk-h',
        lineType: 'spread',
        lineValue: 0,
        bookName: 'DraftKings',
        timestamp: t,
        teamId: home,
      }),
      row({
        id: 'pk-a',
        lineType: 'spread',
        lineValue: 0,
        bookName: 'DraftKings',
        timestamp: t,
        teamId: away,
      }),
    ];
    const run = (input: MarketLineObservation[]) =>
      deriveGameDetailMarketFromSelection({
        marketSelection: selectGameMarketSnapshots({
          rows: input,
          homeTeamId: home,
          awayTeamId: away,
          mode: 'current',
        }),
        homeTeamId: home,
        awayTeamId: away,
        homeTeamName: 'Home',
        awayTeamName: 'Away',
      });
    const forward = run(rows);
    const reverse = run([...rows].reverse());
    expect(forward.isPickEm).toBe(true);
    expect(forward.marketSpread).toBe(0);
    expect(forward.favoriteTeamId).toBeNull();
    expect(forward).toEqual(reverse);
  });
});

describe('mixed-book provenance (2C-2J-3C)', () => {
  const home = 'home-team';
  const away = 'away-team';
  const tSpread = '2026-08-28T12:00:00.000Z';
  const tTotal = '2026-08-28T12:05:00.000Z';
  const tMl = '2026-08-28T12:03:00.000Z';

  it('same book/timestamp → single-book provenance', () => {
    const t = tSpread;
    const rows: MarketLineObservation[] = [
      row({
        id: 's-h',
        lineType: 'spread',
        lineValue: -3,
        bookName: 'DraftKings',
        timestamp: t,
        teamId: home,
      }),
      row({
        id: 's-a',
        lineType: 'spread',
        lineValue: 3,
        bookName: 'DraftKings',
        timestamp: t,
        teamId: away,
      }),
      row({
        id: 'tot',
        lineType: 'total',
        lineValue: 48,
        bookName: 'DraftKings',
        timestamp: t,
      }),
      row({
        id: 'ml-h',
        lineType: 'moneyline',
        lineValue: -150,
        bookName: 'DraftKings',
        timestamp: t,
        teamId: home,
      }),
      row({
        id: 'ml-a',
        lineType: 'moneyline',
        lineValue: 130,
        bookName: 'DraftKings',
        timestamp: t,
        teamId: away,
      }),
    ];
    const sel = selectGameMarketSnapshots({
      rows,
      homeTeamId: home,
      awayTeamId: away,
      mode: 'current',
    });
    const prov = buildAuthoritativeMarketProvenance(sel);
    expect(prov.bookSource).toBe('DraftKings');
    expect(prov.snapshotId).toBe(
      `spread:DraftKings@${t}|total:DraftKings@${t}|ml:DraftKings@${t}`
    );
    expect(prov.updatedAt).toBe(new Date(t).toISOString());
  });

  it('different books/timestamps → Mixed; snapshotId pairs each market truthfully', () => {
    const rows: MarketLineObservation[] = [
      row({
        id: 's-h',
        lineType: 'spread',
        lineValue: -3,
        bookName: 'DraftKings',
        timestamp: tSpread,
        teamId: home,
      }),
      row({
        id: 's-a',
        lineType: 'spread',
        lineValue: 3,
        bookName: 'DraftKings',
        timestamp: tSpread,
        teamId: away,
      }),
      row({
        id: 'tot',
        lineType: 'total',
        lineValue: 48,
        bookName: 'FanDuel',
        timestamp: tTotal,
      }),
      row({
        id: 'ml-h',
        lineType: 'moneyline',
        lineValue: -150,
        bookName: 'Caesars',
        timestamp: tMl,
        teamId: home,
      }),
      row({
        id: 'ml-a',
        lineType: 'moneyline',
        lineValue: 130,
        bookName: 'Caesars',
        timestamp: tMl,
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
      return buildAuthoritativeMarketProvenance(sel);
    };
    const forward = run(rows);
    const reverse = run([...rows].reverse());

    expect(forward.bookSource).toBe('Mixed');
    expect(forward.snapshotId).toBe(
      `spread:DraftKings@${tSpread}|total:FanDuel@${tTotal}|ml:Caesars@${tMl}`
    );
    // Must NOT fabricate DraftKings::12:05
    expect(forward.snapshotId).not.toContain(`DraftKings@${tTotal}`);
    expect(forward.spread?.bookName).toBe('DraftKings');
    expect(forward.spread?.timestamp).toBe(tSpread);
    expect(forward.total?.bookName).toBe('FanDuel');
    expect(forward.total?.timestamp).toBe(tTotal);
    expect(forward.moneyline?.bookName).toBe('Caesars');
    expect(forward.moneyline?.timestamp).toBe(tMl);
    expect(forward.updatedAt).toBe(new Date(tTotal).toISOString());
    expect(forward).toEqual(reverse);
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
