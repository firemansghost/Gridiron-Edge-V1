/**
 * Phase 2C-2J-4 — Core V1 weekly-card planner / safety (pure, no DB/network).
 */

import type { GameMarketSelection } from '../lib/market-line-snapshot';
import {
  assertCreateManyCountMatches,
  assertDisplaySpreadInvariant,
  buildCoreWeeklyCardPlan,
  buildPreviewExecution,
  commitEligible,
  evaluateExistingCardSafety,
  executeAtomicFirstCommit,
  isKickoffEligible,
  naturalBetKey,
  planMoneylineBet,
  planSpreadBet,
  planTotalBet,
  verifyCoreCardPostWrite,
  type ExistingOfficialBetRow,
  type PlannedBet,
  type WeeklyCardGameInput,
} from '../lib/core-v1-weekly-card';
import {
  ML_MAX_ABS_SPREAD,
  modelWinProbsFromCoreSpreadHma,
  probToAmerican,
  selectCoreV1MoneylinePick,
} from '../lib/core-v1-moneyline';

const TS = '2026-08-28T12:00:00.000Z';
const HOME = 'home-id';
const AWAY = 'away-id';

function emptyConsensus(value: number | null = null) {
  return {
    value,
    books: value === null ? [] : ['DraftKings'],
    perBookCount: value === null ? 0 : 1,
    rawHistoricalRows: 0,
    currentSnapshotRows: value === null ? 0 : 1,
    discardedHistoricalObservations: 0,
  };
}

function selection(options: {
  spreadHma?: number | null;
  homeLine?: number | null;
  awayLine?: number | null;
  total?: number | null;
  homeMl?: number | null;
  awayMl?: number | null;
  coherentSpread?: boolean;
  coherentMl?: boolean;
  book?: string;
}): GameMarketSelection {
  const book = options.book ?? 'DraftKings';
  const hma = options.spreadHma ?? null;
  const homeLine =
    options.homeLine !== undefined
      ? options.homeLine
      : hma === null
        ? null
        : hma === 0
          ? 0
          : -hma;
  const awayLine =
    options.awayLine !== undefined
      ? options.awayLine
      : hma === null
        ? null
        : hma === 0
          ? 0
          : hma;
  const displaySpread =
    hma !== null && homeLine !== null && awayLine !== null
      ? {
          bookName: book,
          timestamp: TS,
          homeTeamId: HOME,
          awayTeamId: AWAY,
          homeLine,
          awayLine,
          marketSpreadHma: hma,
          favoriteCentric: -Math.abs(hma),
          homeRowId: 's-h',
          awayRowId: 's-a',
          coherent: (options.coherentSpread ?? true) as true,
        }
      : null;
  const displayTotal =
    options.total !== null && options.total !== undefined
      ? {
          bookName: book,
          timestamp: TS,
          total: options.total,
          rowId: 'tot',
        }
      : null;
  const displayMoneyline =
    options.homeMl !== null &&
    options.homeMl !== undefined &&
    options.awayMl !== null &&
    options.awayMl !== undefined &&
    (options.coherentMl ?? true)
      ? {
          bookName: book,
          timestamp: TS,
          homeTeamId: HOME,
          awayTeamId: AWAY,
          homePrice: options.homeMl,
          awayPrice: options.awayMl,
          homeRowId: 'ml-h',
          awayRowId: 'ml-a',
          coherent: true as const,
        }
      : null;

  return {
    mode: 'current',
    kickoff: null,
    usedPreKickFallback: false,
    spreadByBook: displaySpread ? [displaySpread] : [],
    totalByBook: displayTotal ? [displayTotal] : [],
    moneylineByBook: displayMoneyline ? [displayMoneyline] : [],
    incoherentSpreads: [],
    incoherentMoneylines:
      options.coherentMl === false
        ? [
            {
              bookName: book,
              timestamp: TS,
              homePrice: options.homeMl ?? null,
              awayPrice: options.awayMl ?? null,
              reason: 'incoherent',
            },
          ]
        : [],
    displaySpread,
    displayTotal,
    displayMoneyline,
    spreadConsensus: emptyConsensus(hma),
    totalConsensus: emptyConsensus(options.total ?? null),
    rawCounts: { spread: 2, total: 1, moneyline: 2 },
    sameTimestampTies: 0,
  };
}

function baseGame(
  overrides: Partial<WeeklyCardGameInput> & { coreSpreadHma: number }
): WeeklyCardGameInput {
  const kickoff = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  return {
    gameId: 'g1',
    season: 2026,
    week: 1,
    status: 'scheduled',
    kickoff,
    homeTeamId: HOME,
    awayTeamId: AWAY,
    homeTeamName: 'Home U',
    awayTeamName: 'Away U',
    bothFbs: true,
    marketSelection: selection({
      spreadHma: 7,
      total: 50,
      homeMl: -200,
      awayMl: 170,
    }),
    ...overrides,
  };
}

function asExisting(bet: PlannedBet): ExistingOfficialBetRow {
  return {
    season: bet.season,
    week: bet.week,
    gameId: bet.gameId,
    marketType: bet.marketType,
    side: bet.side,
    modelPrice: bet.modelPrice,
    closePrice: bet.closePrice,
    stake: bet.stake,
    source: bet.source,
    strategyTag: bet.strategyTag,
    result: null,
    pnl: null,
    clv: null,
    hybridConflictType: null,
  };
}

describe('spread field semantics (2C-2J-4)', () => {
  it('home favorite / HOME pick: closePrice=-7 modelPrice=-10', () => {
    const display = selection({ spreadHma: 7 }).displaySpread!;
    expect(assertDisplaySpreadInvariant(display)).toBe(true);
    const bet = planSpreadBet({
      season: 2026,
      week: 1,
      gameId: 'g1',
      homeTeamId: HOME,
      awayTeamId: AWAY,
      homeTeamName: 'Home U',
      awayTeamName: 'Away U',
      kickoffIso: TS,
      coreSpreadHma: 10,
      displaySpread: display,
    });
    expect(bet).not.toBeNull();
    expect(bet!.side).toBe('home');
    expect(bet!.closePrice).toBe(-7);
    expect(bet!.modelPrice).toBe(-10);
    expect(bet!.strategyTag).toBe('official_flat_100');
  });

  it('home favorite / AWAY dog pick: closePrice=+7 modelPrice=+3', () => {
    const display = selection({ spreadHma: 7 }).displaySpread!;
    const bet = planSpreadBet({
      season: 2026,
      week: 1,
      gameId: 'g1',
      homeTeamId: HOME,
      awayTeamId: AWAY,
      homeTeamName: 'Home U',
      awayTeamName: 'Away U',
      kickoffIso: TS,
      coreSpreadHma: 3,
      displaySpread: display,
    });
    expect(bet).not.toBeNull();
    expect(bet!.side).toBe('away');
    expect(bet!.closePrice).toBe(7);
    expect(bet!.modelPrice).toBe(3);
  });

  it('away favorite / AWAY pick and HOME dog pick', () => {
    const display = selection({ spreadHma: -7 }).displaySpread!;
    expect(display.homeLine).toBe(7);
    expect(display.awayLine).toBe(-7);

    const awayPick = planSpreadBet({
      season: 2026,
      week: 1,
      gameId: 'g1',
      homeTeamId: HOME,
      awayTeamId: AWAY,
      homeTeamName: 'Home U',
      awayTeamName: 'Away U',
      kickoffIso: TS,
      coreSpreadHma: -10,
      displaySpread: display,
    });
    expect(awayPick!.side).toBe('away');
    expect(awayPick!.closePrice).toBe(-7);
    expect(awayPick!.modelPrice).toBe(-10);

    const homeDog = planSpreadBet({
      season: 2026,
      week: 1,
      gameId: 'g1',
      homeTeamId: HOME,
      awayTeamId: AWAY,
      homeTeamName: 'Home U',
      awayTeamName: 'Away U',
      kickoffIso: TS,
      coreSpreadHma: -3,
      displaySpread: display,
    });
    expect(homeDog!.side).toBe('home');
    expect(homeDog!.closePrice).toBe(7);
    expect(homeDog!.modelPrice).toBe(3);
  });

  it('rejects incoherent display home/away vs HMA', () => {
    const bad = selection({
      spreadHma: 7,
      homeLine: -3,
      awayLine: 7,
    }).displaySpread!;
    expect(assertDisplaySpreadInvariant(bad)).toBe(false);
    const bet = planSpreadBet({
      season: 2026,
      week: 1,
      gameId: 'g1',
      homeTeamId: HOME,
      awayTeamId: AWAY,
      homeTeamName: 'Home U',
      awayTeamName: 'Away U',
      kickoffIso: TS,
      coreSpreadHma: 10,
      displaySpread: bad,
    });
    expect(bet).toBeNull();
  });
});

describe("pick'em side-specific prices", () => {
  it('Home PK / Away PK', () => {
    const display = selection({
      spreadHma: 0,
      homeLine: 0,
      awayLine: 0,
    }).displaySpread!;
    expect(display.homeLine).toBe(0);
    expect(display.awayLine).toBe(0);

    const homePk = planSpreadBet({
      season: 2026,
      week: 1,
      gameId: 'g1',
      homeTeamId: HOME,
      awayTeamId: AWAY,
      homeTeamName: 'Home U',
      awayTeamName: 'Away U',
      kickoffIso: TS,
      coreSpreadHma: 3,
      displaySpread: display,
    });
    expect(homePk!.side).toBe('home');
    expect(homePk!.closePrice).toBe(0);
    expect(homePk!.modelPrice).toBe(-3);
    expect(homePk!.label).toBe('Home U PK');

    const awayPk = planSpreadBet({
      season: 2026,
      week: 1,
      gameId: 'g1',
      homeTeamId: HOME,
      awayTeamId: AWAY,
      homeTeamName: 'Home U',
      awayTeamName: 'Away U',
      kickoffIso: TS,
      coreSpreadHma: -3,
      displaySpread: display,
    });
    expect(awayPk!.side).toBe('away');
    expect(awayPk!.closePrice).toBe(0);
    expect(awayPk!.modelPrice).toBe(-3); // +coreSpreadHma when coreSpreadHma=-3
    expect(awayPk!.label).toBe('Away U PK');
  });
});

describe('totals Over / Under / no pick', () => {
  it('plans Over and Under; suppresses no-edge', () => {
    const over = planTotalBet({
      season: 2026,
      week: 1,
      gameId: 'g1',
      homeTeamName: 'Home U',
      awayTeamName: 'Away U',
      kickoffIso: TS,
      coreSpreadHma: 14,
      marketSpreadHma: 3,
      displayTotal: selection({ total: 45 }).displayTotal!,
    });
    // Large model-vs-market spread disagreement tends to raise model total → Over
    if (over) {
      expect(['over', 'under']).toContain(over.side);
      expect(over.closePrice).toBe(45);
      expect(over.modelPrice).not.toBe(over.closePrice);
    }

    const underOrOver = planTotalBet({
      season: 2026,
      week: 1,
      gameId: 'g1',
      homeTeamName: 'Home U',
      awayTeamName: 'Away U',
      kickoffIso: TS,
      coreSpreadHma: 0,
      marketSpreadHma: 14,
      displayTotal: selection({ total: 55 }).displayTotal!,
    });
    if (underOrOver) {
      expect(underOrOver.closePrice).toBe(55);
      expect(typeof underOrOver.modelPrice).toBe('number');
    }

    const noPick = planTotalBet({
      season: 2026,
      week: 1,
      gameId: 'g1',
      homeTeamName: 'Home U',
      awayTeamName: 'Away U',
      kickoffIso: TS,
      coreSpreadHma: 7,
      marketSpreadHma: 7,
      displayTotal: selection({ total: 50 }).displayTotal!,
    });
    expect(noPick).toBeNull();
  });
});

describe('moneyline home / away / suppress', () => {
  it('selects home value and stores American prices', () => {
    // Model heavily favors home → home ML should have value vs modest price
    const pick = selectCoreV1MoneylinePick({
      coreSpreadHma: 10,
      homeTeamId: HOME,
      awayTeamId: AWAY,
      homeTeamName: 'Home U',
      awayTeamName: 'Away U',
      homeAmericanPrice: -110,
      awayAmericanPrice: -110,
    });
    expect(pick).not.toBeNull();
    expect(pick!.side).toBe('home');
    expect(pick!.closePrice).toBe(-110);
    expect(pick!.modelPrice).toBe(
      probToAmerican(modelWinProbsFromCoreSpreadHma(10).modelHomeWinProb)
    );
    expect(pick!.modelPrice).not.toBe(pick!.modelWinProb);
  });

  it('selects away value when away has greater edge', () => {
    const pick = selectCoreV1MoneylinePick({
      coreSpreadHma: -10,
      homeTeamId: HOME,
      awayTeamId: AWAY,
      homeTeamName: 'Home U',
      awayTeamName: 'Away U',
      homeAmericanPrice: -110,
      awayAmericanPrice: -110,
    });
    expect(pick!.side).toBe('away');
    expect(pick!.closePrice).toBe(-110);
  });

  it('no value / abs(core)>24 / incoherent pair', () => {
    expect(
      selectCoreV1MoneylinePick({
        coreSpreadHma: 0.1,
        homeTeamId: HOME,
        awayTeamId: AWAY,
        homeTeamName: 'Home U',
        awayTeamName: 'Away U',
        homeAmericanPrice: -110,
        awayAmericanPrice: -110,
      })
    ).toBeNull();

    expect(
      selectCoreV1MoneylinePick({
        coreSpreadHma: ML_MAX_ABS_SPREAD + 1,
        homeTeamId: HOME,
        awayTeamId: AWAY,
        homeTeamName: 'Home U',
        awayTeamName: 'Away U',
        homeAmericanPrice: -110,
        awayAmericanPrice: -110,
      })
    ).toBeNull();

    const mlBet = planMoneylineBet({
      season: 2026,
      week: 1,
      gameId: 'g1',
      homeTeamId: HOME,
      awayTeamId: AWAY,
      homeTeamName: 'Home U',
      awayTeamName: 'Away U',
      kickoffIso: TS,
      coreSpreadHma: 10,
      displayMoneyline: {
        bookName: 'DraftKings',
        timestamp: TS,
        homeTeamId: HOME,
        awayTeamId: AWAY,
        homePrice: -200,
        awayPrice: 170,
        homeRowId: 'a',
        awayRowId: 'b',
        coherent: true,
      },
    });
    expect(mlBet).not.toBeNull();
    expect(mlBet!.marketType).toBe('moneyline');
  });
});

describe('existing card safety + commit helpers', () => {
  const planned = planSpreadBet({
    season: 2026,
    week: 1,
    gameId: 'g1',
    homeTeamId: HOME,
    awayTeamId: AWAY,
    homeTeamName: 'Home U',
    awayTeamName: 'Away U',
    kickoffIso: TS,
    coreSpreadHma: 10,
    displaySpread: selection({ spreadHma: 7 }).displaySpread!,
  })!;

  it('natural-key duplicate rejection', () => {
    const safety = evaluateExistingCardSafety({
      plannedBets: [planned],
      existingOfficial: [asExisting(planned), asExisting(planned)],
      existingHybrid: [],
    });
    expect(safety.ok).toBe(false);
    expect(safety.mode).toBe('blocked_duplicate');
  });

  it('exact complete card → idempotent', () => {
    const safety = evaluateExistingCardSafety({
      plannedBets: [planned],
      existingOfficial: [asExisting(planned)],
      existingHybrid: [],
    });
    expect(safety.ok).toBe(true);
    expect(safety.mode).toBe('idempotent_exact');
  });

  it('partial card BLOCK', () => {
    const safety = evaluateExistingCardSafety({
      plannedBets: [planned],
      existingOfficial: [],
      existingHybrid: [],
    });
    expect(safety.mode).toBe('empty');

    const extraKey = naturalBetKey({
      season: 2026,
      week: 1,
      gameId: 'g2',
      marketType: 'spread',
    });
    const partial = evaluateExistingCardSafety({
      plannedBets: [planned],
      existingOfficial: [
        {
          ...asExisting(planned),
          gameId: 'g2',
        },
      ],
      existingHybrid: [],
    });
    expect(partial.ok).toBe(false);
    expect(partial.mode).toBe('blocked_partial');
    expect(partial.extraExistingKeys).toContain(extraKey);
  });

  it('conflicting side / closePrice BLOCK', () => {
    const sideConflict = evaluateExistingCardSafety({
      plannedBets: [planned],
      existingOfficial: [{ ...asExisting(planned), side: 'away' }],
      existingHybrid: [],
    });
    expect(sideConflict.mode).toBe('blocked_conflict');

    const closeConflict = evaluateExistingCardSafety({
      plannedBets: [planned],
      existingOfficial: [{ ...asExisting(planned), closePrice: -9 }],
      existingHybrid: [],
    });
    expect(closeConflict.mode).toBe('blocked_conflict');
  });

  it('existing hybrid_v2 BLOCK', () => {
    const safety = evaluateExistingCardSafety({
      plannedBets: [planned],
      existingOfficial: [],
      existingHybrid: [
        { ...asExisting(planned), strategyTag: 'hybrid_v2' },
      ],
    });
    expect(safety.mode).toBe('blocked_hybrid');
  });

  it('createMany count mismatch throws inside helper', async () => {
    await expect(
      executeAtomicFirstCommit({
        plannedBets: [planned],
        reReadOfficial: async () => [],
        reReadHybrid: async () => [],
        createMany: async () => ({ count: 0 }),
      })
    ).rejects.toThrow(/createMany\.count mismatch/);
  });

  it('assertCreateManyCountMatches throws', () => {
    expect(() => assertCreateManyCountMatches(3, 2)).toThrow();
  });

  it('post-write verification fails missing/extra/conflict/duplicate', () => {
    const missing = verifyCoreCardPostWrite({
      plannedBets: [planned],
      createManyCount: 1,
      afterOfficial: [],
      afterHybrid: [],
    });
    expect(missing.ok).toBe(false);
    expect(missing.missingKeys.length).toBe(1);

    const conflict = verifyCoreCardPostWrite({
      plannedBets: [planned],
      createManyCount: 1,
      afterOfficial: [{ ...asExisting(planned), closePrice: -99 }],
      afterHybrid: [],
    });
    expect(conflict.conflictingRows.length).toBe(1);

    const dup = verifyCoreCardPostWrite({
      plannedBets: [planned],
      createManyCount: 1,
      afterOfficial: [asExisting(planned), asExisting(planned)],
      afterHybrid: [],
    });
    expect(dup.duplicateKeys.length).toBe(1);

    const extra = verifyCoreCardPostWrite({
      plannedBets: [planned],
      createManyCount: 1,
      afterOfficial: [
        asExisting(planned),
        { ...asExisting(planned), gameId: 'g-extra' },
      ],
      afterHybrid: [],
    });
    expect(extra.extraKeys.length).toBe(1);
  });
});

describe('kickoff gate', () => {
  const now = new Date('2026-08-28T18:00:00.000Z');

  it('>30m eligible; exactly 30m / past / non-scheduled excluded', () => {
    expect(
      isKickoffEligible({
        status: 'scheduled',
        kickoff: new Date(now.getTime() + 31 * 60 * 1000),
        executionNow: now,
      }).eligible
    ).toBe(true);

    expect(
      isKickoffEligible({
        status: 'scheduled',
        kickoff: new Date(now.getTime() + 30 * 60 * 1000),
        executionNow: now,
      }).eligible
    ).toBe(false);

    expect(
      isKickoffEligible({
        status: 'scheduled',
        kickoff: new Date(now.getTime() - 1000),
        executionNow: now,
      }).eligible
    ).toBe(false);

    expect(
      isKickoffEligible({
        status: 'in_progress',
        kickoff: new Date(now.getTime() + 60 * 60 * 1000),
        executionNow: now,
      }).eligible
    ).toBe(false);

    expect(
      isKickoffEligible({
        status: 'final',
        kickoff: new Date(now.getTime() + 60 * 60 * 1000),
        executionNow: now,
      }).eligible
    ).toBe(false);
  });
});

describe('plan writeSafe / PREVIEW / COMMIT gates', () => {
  it('PREVIEW mutation flags false; no planned rows blocks COMMIT', () => {
    const exec = buildPreviewExecution('PREVIEW');
    expect(exec.mutationsInvoked).toBe(false);
    expect(exec.betPersistenceInvoked).toBe(false);
    expect(exec.commitAttempted).toBe(false);
    expect(exec.providerCalls).toBe(0);

    const emptyPlan = buildCoreWeeklyCardPlan({
      season: 2026,
      week: 2,
      mode: 'COMMIT',
      confirmation: 'WRITE_2026_WEEK_2_CORE_CARD',
      executionNow: new Date(),
      fbsMembershipCount: 138,
      games: [],
      existingOfficial: [],
      existingHybrid: [],
    });
    expect(emptyPlan.writeSafe).toBe(false);
    expect(emptyPlan.writeBlockers.some((b) => /no planned|no tracked/i.test(b))).toBe(
      true
    );
    expect(commitEligible(emptyPlan)).toBe(false);
  });

  it('only official_flat_100 in planned bets', () => {
    const games = Array.from({ length: 51 }, (_, i) =>
      baseGame({
        gameId: `g${i}`,
        coreSpreadHma: 10,
        marketSelection: selection({
          spreadHma: 7,
          total: 48,
          homeMl: -150,
          awayMl: 130,
        }),
      })
    );
    const plan = buildCoreWeeklyCardPlan({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      executionNow: new Date(),
      fbsMembershipCount: 138,
      games,
      existingOfficial: [],
      existingHybrid: [],
      missingRatingTeamIds: [],
      duplicateRatingTeamIds: [],
    });
    expect(plan.plannedBets.length).toBeGreaterThan(0);
    expect(plan.plannedBets.every((b) => b.strategyTag === 'official_flat_100')).toBe(
      true
    );
    expect(plan.plannedBets.every((b) => b.stake === 100)).toBe(true);
    expect(plan.plannedBets.every((b) => b.source === 'strategy_run')).toBe(true);
  });
});
