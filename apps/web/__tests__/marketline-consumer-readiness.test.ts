/**
 * Audit structural gate tests — require spread + total + coherent ML.
 */

import { evaluateMarketlineConsumerReadiness } from '../lib/marketline-consumer-readiness';
import type { GameMarketSelection } from '../lib/market-line-snapshot';

function emptySel(
  overrides: Partial<GameMarketSelection> = {}
): GameMarketSelection {
  return {
    mode: 'current',
    kickoff: null,
    usedPreKickFallback: false,
    spreadByBook: [],
    totalByBook: [],
    moneylineByBook: [],
    incoherentSpreads: [],
    incoherentMoneylines: [],
    displaySpread: null,
    displayTotal: null,
    displayMoneyline: null,
    spreadConsensus: {
      value: null,
      books: [],
      perBookCount: 0,
      rawHistoricalRows: 0,
      currentSnapshotRows: 0,
      discardedHistoricalObservations: 0,
    },
    totalConsensus: {
      value: null,
      books: [],
      perBookCount: 0,
      rawHistoricalRows: 0,
      currentSnapshotRows: 0,
      discardedHistoricalObservations: 0,
    },
    rawCounts: { spread: 0, total: 0, moneyline: 0 },
    sameTimestampTies: 0,
    ...overrides,
  };
}

describe('marketline consumer readiness gate', () => {
  it('fails when a game has totals only', () => {
    const summary = evaluateMarketlineConsumerReadiness([
      {
        gameId: 'g1',
        selection: emptySel({
          totalByBook: [
            {
              bookName: 'DK',
              timestamp: '2026-08-28T12:00:00.000Z',
              total: 48,
              rowId: 't1',
            },
          ],
        }),
      },
    ]);
    expect(summary.pass).toBe(false);
    expect(summary.allGamesHaveTotal).toBe(true);
    expect(summary.allGamesHaveCoherentSpread).toBe(false);
    expect(summary.allGamesHaveCoherentMoneyline).toBe(false);
    expect(summary.gameResults[0].structurallySelectable).toBe(false);
  });

  it('fails when spread + total but no coherent ML', () => {
    const summary = evaluateMarketlineConsumerReadiness([
      {
        gameId: 'g1',
        selection: emptySel({
          spreadByBook: [
            {
              bookName: 'DK',
              timestamp: '2026-08-28T12:00:00.000Z',
              homeTeamId: 'h',
              awayTeamId: 'a',
              homeLine: -7,
              awayLine: 7,
              marketSpreadHma: 7,
              favoriteCentric: -7,
              homeRowId: 'sh',
              awayRowId: 'sa',
              coherent: true,
            },
          ],
          totalByBook: [
            {
              bookName: 'DK',
              timestamp: '2026-08-28T12:00:00.000Z',
              total: 48,
              rowId: 't1',
            },
          ],
        }),
      },
    ]);
    expect(summary.pass).toBe(false);
    expect(summary.gamesMissingCoherentMl).toBe(1);
    expect(summary.allGamesHaveCoherentMoneyline).toBe(false);
  });

  it('fails when total + ML but no coherent spread', () => {
    const summary = evaluateMarketlineConsumerReadiness([
      {
        gameId: 'g1',
        selection: emptySel({
          totalByBook: [
            {
              bookName: 'DK',
              timestamp: '2026-08-28T12:00:00.000Z',
              total: 48,
              rowId: 't1',
            },
          ],
          moneylineByBook: [
            {
              bookName: 'DK',
              timestamp: '2026-08-28T12:00:00.000Z',
              homeTeamId: 'h',
              awayTeamId: 'a',
              homePrice: -150,
              awayPrice: 130,
              homeRowId: 'mh',
              awayRowId: 'ma',
              coherent: true,
            },
          ],
        }),
      },
    ]);
    expect(summary.pass).toBe(false);
    expect(summary.gamesMissingCoherentSpread).toBe(1);
    expect(summary.allGamesHaveCoherentSpread).toBe(false);
  });

  it('passes only when all required market families are present', () => {
    const summary = evaluateMarketlineConsumerReadiness([
      {
        gameId: 'g1',
        selection: emptySel({
          spreadByBook: [
            {
              bookName: 'DK',
              timestamp: '2026-08-28T12:00:00.000Z',
              homeTeamId: 'h',
              awayTeamId: 'a',
              homeLine: -7,
              awayLine: 7,
              marketSpreadHma: 7,
              favoriteCentric: -7,
              homeRowId: 'sh',
              awayRowId: 'sa',
              coherent: true,
            },
          ],
          totalByBook: [
            {
              bookName: 'DK',
              timestamp: '2026-08-28T12:00:00.000Z',
              total: 48,
              rowId: 't1',
            },
          ],
          moneylineByBook: [
            {
              bookName: 'DK',
              timestamp: '2026-08-28T12:00:00.000Z',
              homeTeamId: 'h',
              awayTeamId: 'a',
              homePrice: -150,
              awayPrice: 130,
              homeRowId: 'mh',
              awayRowId: 'ma',
              coherent: true,
            },
          ],
        }),
      },
    ]);
    expect(summary.pass).toBe(true);
    expect(summary.allGamesHaveCoherentSpread).toBe(true);
    expect(summary.allGamesHaveTotal).toBe(true);
    expect(summary.allGamesHaveCoherentMoneyline).toBe(true);
    expect(summary.allGamesStructurallySelectable).toBe(true);
  });
});
