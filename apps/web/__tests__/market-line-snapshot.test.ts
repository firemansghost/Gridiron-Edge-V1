/**
 * Phase 2C-2J-3 — Append-only MarketLine snapshot selection tests.
 * No DB / no providers.
 */

import {
  canonicalSpreadHma,
  compareMarketLineRecency,
  countNondeterministicSameTimestampTies,
  selectBookMoneylineSnapshots,
  selectBookSpreadSnapshots,
  selectBookTotalSnapshots,
  selectGameMarketSnapshots,
  sortMarketLinesByRecency,
  type MarketLineObservation,
} from '../lib/market-line-snapshot';

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

describe('market-line-snapshot (append-only)', () => {
  const home = 'ohio-state';
  const away = 'ball-state';
  const t1 = '2026-08-28T12:00:00.000Z';
  const t2 = '2026-08-28T18:00:00.000Z';
  const t2b = '2026-08-28T18:00:01.000Z'; // slightly later for display primary
  const kickoff = '2026-08-30T16:00:00.000Z';

  it('canonical spread HMA is order-independent and rejects incoherent pairs', () => {
    expect(canonicalSpreadHma(-7, 7)).toBe(7);
    expect(canonicalSpreadHma(7, -7)).toBe(-7);
    expect(canonicalSpreadHma(-7, 6.5)).toBeNull();
  });

  it('compareMarketLineRecency is timestamp DESC then id DESC', () => {
    const a = { id: 'a', timestamp: t1 };
    const b = { id: 'b', timestamp: t2 };
    const c = { id: 'c', timestamp: t2 };
    expect(compareMarketLineRecency(a, b)).toBeGreaterThan(0); // b newer
    expect(compareMarketLineRecency(b, a)).toBeLessThan(0);
    // same timestamp: higher id first
    expect(compareMarketLineRecency({ id: 'aaa', timestamp: t2 }, { id: 'zzz', timestamp: t2 })).toBeGreaterThan(0);
    const sorted = sortMarketLinesByRecency([c, a, b]);
    expect(sorted.map((r) => r.id)).toEqual(['c', 'b', 'a']); // t2: c>b, then t1 a
  });

  it('same-timestamp ties are deterministic regardless of input order', () => {
    // Lexicographic id DESC: 'zzz' > 'aaa'
    const rowsAsc: MarketLineObservation[] = [
      row({
        id: 'aaa',
        lineType: 'total',
        lineValue: 48,
        bookName: 'DraftKings',
        timestamp: t1,
      }),
      row({
        id: 'zzz',
        lineType: 'total',
        lineValue: 49,
        bookName: 'DraftKings',
        timestamp: t1,
      }),
    ];
    const rowsDesc = [...rowsAsc].reverse();
    const a = selectBookTotalSnapshots(rowsAsc);
    const b = selectBookTotalSnapshots(rowsDesc);
    expect(a).toEqual(b);
    expect(a[0].rowId).toBe('zzz');
    expect(a[0].total).toBe(49);
  });

  it('spread pair sides explicit; input order does not matter', () => {
    const base = [
      row({
        id: 's-home',
        lineType: 'spread',
        lineValue: -7,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: home,
      }),
      row({
        id: 's-away',
        lineType: 'spread',
        lineValue: 7,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: away,
      }),
    ];
    const forward = selectBookSpreadSnapshots(base, home, away);
    const reverse = selectBookSpreadSnapshots([...base].reverse(), home, away);
    expect(forward.snapshots).toHaveLength(1);
    expect(reverse.snapshots).toHaveLength(1);
    expect(forward.snapshots[0].marketSpreadHma).toBe(7);
    expect(reverse.snapshots[0].marketSpreadHma).toBe(7);
    expect(forward.snapshots[0].homeLine).toBe(-7);
    expect(forward.snapshots[0].awayLine).toBe(7);

    const flipped = selectBookSpreadSnapshots(
      [
        row({
          id: 's-home2',
          lineType: 'spread',
          lineValue: 7,
          bookName: 'FanDuel',
          timestamp: t1,
          teamId: home,
        }),
        row({
          id: 's-away2',
          lineType: 'spread',
          lineValue: -7,
          bookName: 'FanDuel',
          timestamp: t1,
          teamId: away,
        }),
      ],
      home,
      away
    );
    expect(flipped.snapshots[0].marketSpreadHma).toBe(-7);

    const bad = selectBookSpreadSnapshots(
      [
        row({
          id: 'bad-h',
          lineType: 'spread',
          lineValue: -7,
          bookName: 'Caesars',
          timestamp: t1,
          teamId: home,
        }),
        row({
          id: 'bad-a',
          lineType: 'spread',
          lineValue: 6.5,
          bookName: 'Caesars',
          timestamp: t1,
          teamId: away,
        }),
      ],
      home,
      away
    );
    expect(bad.snapshots).toHaveLength(0);
    expect(bad.incoherent).toHaveLength(1);
  });

  it('moneyline home/away prices come from the same snapshot timestamp', () => {
    const rows: MarketLineObservation[] = [
      row({
        id: 'ml-h-t1',
        lineType: 'moneyline',
        lineValue: -300,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: home,
      }),
      row({
        id: 'ml-a-t1',
        lineType: 'moneyline',
        lineValue: 250,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: away,
      }),
      row({
        id: 'ml-h-t2',
        lineType: 'moneyline',
        lineValue: -350,
        bookName: 'DraftKings',
        timestamp: t2,
        teamId: home,
      }),
      // Intentionally missing away at T2 first — then add it
      row({
        id: 'ml-a-t2',
        lineType: 'moneyline',
        lineValue: 280,
        bookName: 'DraftKings',
        timestamp: t2,
        teamId: away,
      }),
    ];
    const { snapshots } = selectBookMoneylineSnapshots(rows, home, away);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].timestamp).toBe(t2);
    expect(snapshots[0].homePrice).toBe(-350);
    expect(snapshots[0].awayPrice).toBe(280);

    // Incomplete T2 must NOT pair with T1 away; walk back to latest coherent T1 pair
    const incomplete = selectBookMoneylineSnapshots(
      rows.filter((r) => r.id !== 'ml-a-t2'),
      home,
      away
    );
    expect(incomplete.snapshots).toHaveLength(1);
    expect(incomplete.snapshots[0].timestamp).toBe(t1);
    expect(incomplete.snapshots[0].homePrice).toBe(-300);
    expect(incomplete.snapshots[0].awayPrice).toBe(250);
  });

  it('current consensus uses latest observation PER BOOK (totals history not weighted)', () => {
    const rows: MarketLineObservation[] = [
      row({
        id: 'dk-t1',
        lineType: 'total',
        lineValue: 48,
        bookName: 'DraftKings',
        timestamp: t1,
      }),
      row({
        id: 'dk-t2',
        lineType: 'total',
        lineValue: 50,
        bookName: 'DraftKings',
        timestamp: t2,
      }),
      row({
        id: 'fd-t1',
        lineType: 'total',
        lineValue: 49,
        bookName: 'FanDuel',
        timestamp: t1,
      }),
      row({
        id: 'fd-t2',
        lineType: 'total',
        lineValue: 51,
        bookName: 'FanDuel',
        timestamp: t2,
      }),
    ];
    const sel = selectGameMarketSnapshots({
      rows,
      homeTeamId: home,
      awayTeamId: away,
      mode: 'current',
    });
    // median(50, 51) = 50.5 — NOT median(48,50,49,51)=49.5
    expect(sel.totalConsensus.value).toBe(50.5);
    expect(sel.totalConsensus.perBookCount).toBe(2);
    expect(sel.totalConsensus.rawHistoricalRows).toBe(4);
    expect(sel.totalConsensus.discardedHistoricalObservations).toBe(2);

    // Adding more T1 history must not change consensus
    const withMoreHistory = selectGameMarketSnapshots({
      rows: [
        ...rows,
        row({
          id: 'dk-t0',
          lineType: 'total',
          lineValue: 40,
          bookName: 'DraftKings',
          timestamp: '2026-08-27T12:00:00.000Z',
        }),
      ],
      homeTeamId: home,
      awayTeamId: away,
      mode: 'current',
    });
    expect(withMoreHistory.totalConsensus.value).toBe(50.5);
  });

  it('multi-snapshot T2-only current selection for spread/ML/total', () => {
    const rows: MarketLineObservation[] = [
      // DraftKings T1
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
        lineValue: -300,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: home,
      }),
      row({
        id: 'dk-ml-a-t1',
        lineType: 'moneyline',
        lineValue: 250,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: away,
      }),
      // DraftKings T2 (1s later than FanDuel T2 — preferred display primary)
      row({
        id: 'dk-s-h-t2',
        lineType: 'spread',
        lineValue: -8,
        bookName: 'DraftKings',
        timestamp: t2b,
        teamId: home,
      }),
      row({
        id: 'dk-s-a-t2',
        lineType: 'spread',
        lineValue: 8,
        bookName: 'DraftKings',
        timestamp: t2b,
        teamId: away,
      }),
      row({
        id: 'dk-tot-t2',
        lineType: 'total',
        lineValue: 49.5,
        bookName: 'DraftKings',
        timestamp: t2b,
      }),
      row({
        id: 'dk-ml-h-t2',
        lineType: 'moneyline',
        lineValue: -350,
        bookName: 'DraftKings',
        timestamp: t2b,
        teamId: home,
      }),
      row({
        id: 'dk-ml-a-t2',
        lineType: 'moneyline',
        lineValue: 280,
        bookName: 'DraftKings',
        timestamp: t2b,
        teamId: away,
      }),
      // FanDuel T1/T2
      row({
        id: 'fd-s-h-t1',
        lineType: 'spread',
        lineValue: -6.5,
        bookName: 'FanDuel',
        timestamp: t1,
        teamId: home,
      }),
      row({
        id: 'fd-s-a-t1',
        lineType: 'spread',
        lineValue: 6.5,
        bookName: 'FanDuel',
        timestamp: t1,
        teamId: away,
      }),
      row({
        id: 'fd-s-h-t2',
        lineType: 'spread',
        lineValue: -7.5,
        bookName: 'FanDuel',
        timestamp: t2,
        teamId: home,
      }),
      row({
        id: 'fd-s-a-t2',
        lineType: 'spread',
        lineValue: 7.5,
        bookName: 'FanDuel',
        timestamp: t2,
        teamId: away,
      }),
      row({
        id: 'fd-tot-t1',
        lineType: 'total',
        lineValue: 47,
        bookName: 'FanDuel',
        timestamp: t1,
      }),
      row({
        id: 'fd-tot-t2',
        lineType: 'total',
        lineValue: 50,
        bookName: 'FanDuel',
        timestamp: t2,
      }),
    ];

    const forward = selectGameMarketSnapshots({
      rows,
      homeTeamId: home,
      awayTeamId: away,
      mode: 'current',
    });
    const reverse = selectGameMarketSnapshots({
      rows: [...rows].reverse(),
      homeTeamId: home,
      awayTeamId: away,
      mode: 'current',
    });

    expect(forward.displaySpread?.marketSpreadHma).toBe(8); // DK T2b newest → HMA +8
    expect(reverse.displaySpread?.marketSpreadHma).toBe(
      forward.displaySpread?.marketSpreadHma
    );
    expect(forward.displayTotal?.total).toBe(49.5); // DK T2b newest
    // Both books current: DK 49.5 @ t2b, FD 50 @ t2
    expect(forward.totalByBook.map((t) => t.total).sort()).toEqual([49.5, 50]);
    // spread consensus median of DK HMA 8 and FD HMA 7.5 = 7.75
    expect(forward.spreadConsensus.value).toBe(7.75);
    expect(forward.displayMoneyline?.homePrice).toBe(-350);
    expect(forward.displayMoneyline?.awayPrice).toBe(280);
    expect(forward).toEqual(reverse);
  });

  it('closing uses latest PRE-KICK observation; ignores post-kick when pre-kick exists', () => {
    const tPre1 = '2026-08-30T14:00:00.000Z'; // 2h before
    const tPre2 = '2026-08-30T15:50:00.000Z'; // 10m before
    const tPost = '2026-08-30T16:05:00.000Z'; // 5m after
    const rows: MarketLineObservation[] = [
      row({
        id: 'tot-pre1',
        lineType: 'total',
        lineValue: 45,
        bookName: 'DraftKings',
        timestamp: tPre1,
      }),
      row({
        id: 'tot-pre2',
        lineType: 'total',
        lineValue: 46,
        bookName: 'DraftKings',
        timestamp: tPre2,
      }),
      row({
        id: 'tot-post',
        lineType: 'total',
        lineValue: 99,
        bookName: 'DraftKings',
        timestamp: tPost,
      }),
    ];
    const closing = selectGameMarketSnapshots({
      rows,
      homeTeamId: home,
      awayTeamId: away,
      kickoff,
      mode: 'closing',
    });
    expect(closing.displayTotal?.total).toBe(46);
    expect(closing.usedPreKickFallback).toBe(false);
    expect(closing.totalByBook[0].total).toBe(46);
  });

  it('same-timestamp tie metric: normal home/away pairs are not ties', () => {
    const spreadPair = [
      row({
        id: 's-h',
        lineType: 'spread',
        lineValue: -7,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: home,
      }),
      row({
        id: 's-a',
        lineType: 'spread',
        lineValue: 7,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: away,
      }),
    ];
    expect(countNondeterministicSameTimestampTies(spreadPair)).toBe(0);
    expect(
      countNondeterministicSameTimestampTies([...spreadPair].reverse())
    ).toBe(0);

    const mlPair = [
      row({
        id: 'ml-h',
        lineType: 'moneyline',
        lineValue: -150,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: home,
      }),
      row({
        id: 'ml-a',
        lineType: 'moneyline',
        lineValue: 130,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: away,
      }),
    ];
    expect(countNondeterministicSameTimestampTies(mlPair)).toBe(0);

    const twoTotals = [
      row({
        id: 'aaa',
        lineType: 'total',
        lineValue: 48,
        bookName: 'DraftKings',
        timestamp: t1,
      }),
      row({
        id: 'zzz',
        lineType: 'total',
        lineValue: 49,
        bookName: 'DraftKings',
        timestamp: t1,
      }),
    ];
    expect(countNondeterministicSameTimestampTies(twoTotals)).toBe(1);
    expect(
      countNondeterministicSameTimestampTies([...twoTotals].reverse())
    ).toBe(1);

    const twoHomeSpreads = [
      row({
        id: 'aaa',
        lineType: 'spread',
        lineValue: -7,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: home,
      }),
      row({
        id: 'zzz',
        lineType: 'spread',
        lineValue: -7.5,
        bookName: 'DraftKings',
        timestamp: t1,
        teamId: home,
      }),
    ];
    expect(countNondeterministicSameTimestampTies(twoHomeSpreads)).toBe(1);
    expect(
      countNondeterministicSameTimestampTies([...twoHomeSpreads].reverse())
    ).toBe(1);
  });
});
