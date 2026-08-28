/**
 * Closing-line helpers — reuse append-only snapshot selection.
 * No DB / no providers.
 */

import {
  selectGameMarketSnapshots,
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

describe('closing-line helpers (via market-line-snapshot)', () => {
  const home = 'home';
  const away = 'away';
  const kickoff = '2026-08-30T16:00:00.000Z';
  const tPre = '2026-08-30T15:50:00.000Z';
  const tPost = '2026-08-30T16:05:00.000Z';

  it('closing spread uses pre-kick coherent pair and returns HMA', () => {
    const rows = [
      row({
        id: 's-h-pre',
        lineType: 'spread',
        lineValue: -7,
        bookName: 'DraftKings',
        timestamp: tPre,
        teamId: home,
      }),
      row({
        id: 's-a-pre',
        lineType: 'spread',
        lineValue: 7,
        bookName: 'DraftKings',
        timestamp: tPre,
        teamId: away,
      }),
      row({
        id: 's-h-post',
        lineType: 'spread',
        lineValue: -99,
        bookName: 'DraftKings',
        timestamp: tPost,
        teamId: home,
      }),
      row({
        id: 's-a-post',
        lineType: 'spread',
        lineValue: 99,
        bookName: 'DraftKings',
        timestamp: tPost,
        teamId: away,
      }),
    ];
    const sel = selectGameMarketSnapshots({
      rows,
      homeTeamId: home,
      awayTeamId: away,
      kickoff,
      mode: 'closing',
    });
    expect(sel.displaySpread?.marketSpreadHma).toBe(7);
    expect(sel.displaySpread?.timestamp).toBe(tPre);
    expect(sel.usedPreKickFallback).toBe(false);
  });

  it('closing total ignores post-kick when pre-kick exists', () => {
    const sel = selectGameMarketSnapshots({
      rows: [
        row({
          id: 't-pre',
          lineType: 'total',
          lineValue: 46,
          bookName: 'DraftKings',
          timestamp: tPre,
        }),
        row({
          id: 't-post',
          lineType: 'total',
          lineValue: 99,
          bookName: 'DraftKings',
          timestamp: tPost,
        }),
      ],
      homeTeamId: home,
      awayTeamId: away,
      kickoff,
      mode: 'closing',
    });
    expect(sel.displayTotal?.total).toBe(46);
  });
});
