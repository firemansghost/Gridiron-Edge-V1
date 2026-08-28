/**
 * Phase 2C-2J-4 — Core V1 weekly-card planner / safety (pure, no DB/network).
 */

import type { GameMarketSelection } from '../lib/market-line-snapshot';
import {
  assertCreateManyCountMatches,
  assertDisplaySpreadInvariant,
  buildCommittedVerificationFailureExecution,
  buildCoreWeeklyCardPlan,
  buildPreviewExecution,
  buildRolledBackTransactionExecution,
  buildSuccessfulCommitExecution,
  buildTransactionalIdempotentNoOpExecution,
  buildTransactionalIdempotentVerificationFailureExecution,
  commitEligible,
  commitMayEnterTransaction,
  evaluateExistingCardSafety,
  executeAtomicAppendCommit,
  finalizeCoreCardReport,
  isBeforeKickoffCutoff,
  isIdempotentNoOp,
  isKickoffEligible,
  naturalBetKey,
  parseKickoffBefore,
  planMoneylineBet,
  planSpreadBet,
  planTotalBet,
  resolvePreviewExitCode,
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
import { computeCoreV1Total } from '../lib/core-v1-total';

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
  it('A: known Over fixture requires over + expected model total', () => {
    // beta≈-0.003 → large negative spreadDiff yields positive overlay (Over).
    const marketTotal = 50;
    const marketSpreadHma = 0;
    const coreSpreadHma = -900;
    const expectedModel = computeCoreV1Total(
      marketTotal,
      marketSpreadHma,
      coreSpreadHma
    );
    expect(expectedModel).not.toBeNull();
    expect(expectedModel!).toBeGreaterThan(marketTotal + 2.5);

    const over = planTotalBet({
      season: 2026,
      week: 1,
      gameId: 'g1',
      homeTeamName: 'Home U',
      awayTeamName: 'Away U',
      kickoffIso: TS,
      coreSpreadHma,
      marketSpreadHma,
      displayTotal: selection({ total: marketTotal }).displayTotal!,
    });
    expect(over).not.toBeNull();
    expect(over!.side).toBe('over');
    expect(over!.closePrice).toBe(marketTotal);
    expect(over!.modelPrice).toBe(expectedModel);
  });

  it('B: known Under fixture requires under + expected model total', () => {
    const marketTotal = 50;
    const marketSpreadHma = 0;
    const coreSpreadHma = 900;
    const expectedModel = computeCoreV1Total(
      marketTotal,
      marketSpreadHma,
      coreSpreadHma
    );
    expect(expectedModel).not.toBeNull();
    expect(expectedModel!).toBeLessThan(marketTotal - 2.5);

    const under = planTotalBet({
      season: 2026,
      week: 1,
      gameId: 'g1',
      homeTeamName: 'Home U',
      awayTeamName: 'Away U',
      kickoffIso: TS,
      coreSpreadHma,
      marketSpreadHma,
      displayTotal: selection({ total: marketTotal }).displayTotal!,
    });
    expect(under).not.toBeNull();
    expect(under!.side).toBe('under');
    expect(under!.closePrice).toBe(marketTotal);
    expect(under!.modelPrice).toBe(expectedModel);
  });

  it('C: no-edge → null', () => {
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
  const tracked = ['g1', 'g2'];

  it('natural-key duplicate rejection', () => {
    const safety = evaluateExistingCardSafety({
      plannedBets: [planned],
      existingOfficial: [asExisting(planned), asExisting(planned)],
      existingHybrid: [],
      trackedGameIds: tracked,
    });
    expect(safety.ok).toBe(false);
    expect(safety.mode).toBe('blocked_duplicate');
  });

  it('exact complete card → idempotent', () => {
    const safety = evaluateExistingCardSafety({
      plannedBets: [planned],
      existingOfficial: [asExisting(planned)],
      existingHybrid: [],
      trackedGameIds: tracked,
    });
    expect(safety.ok).toBe(true);
    expect(safety.mode).toBe('idempotent_exact');
    expect(safety.newPlannedKeys).toEqual([]);
    expect(safety.matchedExistingKeys).toContain(planned.naturalKey);
  });

  it('empty existing card → first tranche safe', () => {
    const safety = evaluateExistingCardSafety({
      plannedBets: [planned],
      existingOfficial: [],
      existingHybrid: [],
      trackedGameIds: tracked,
    });
    expect(safety.mode).toBe('empty');
    expect(safety.ok).toBe(true);
    expect(safety.newPlannedKeys).toEqual([planned.naturalKey]);
  });

  it('legitimate prior off-tranche rows → append safe', () => {
    const prior = {
      ...asExisting(planned),
      gameId: 'g2',
      result: 'win' as string | null,
      pnl: 100,
    };
    const priorKey = naturalBetKey({
      season: 2026,
      week: 1,
      gameId: 'g2',
      marketType: 'spread',
    });
    const safety = evaluateExistingCardSafety({
      plannedBets: [planned],
      existingOfficial: [prior],
      existingHybrid: [],
      trackedGameIds: tracked,
    });
    expect(safety.ok).toBe(true);
    expect(safety.mode).toBe('append_safe');
    expect(safety.priorExistingKeys).toContain(priorKey);
    expect(safety.newPlannedKeys).toContain(planned.naturalKey);
    expect(safety.matchedExistingKeys).toEqual([]);
  });

  it('existing row referencing untracked game blocks', () => {
    const safety = evaluateExistingCardSafety({
      plannedBets: [planned],
      existingOfficial: [{ ...asExisting(planned), gameId: 'g-orphan' }],
      existingHybrid: [],
      trackedGameIds: tracked,
    });
    expect(safety.ok).toBe(false);
    expect(safety.mode).toBe('blocked_untracked');
  });

  it('conflicting side / closePrice / modelPrice BLOCK', () => {
    const sideConflict = evaluateExistingCardSafety({
      plannedBets: [planned],
      existingOfficial: [{ ...asExisting(planned), side: 'away' }],
      existingHybrid: [],
      trackedGameIds: tracked,
    });
    expect(sideConflict.mode).toBe('blocked_conflict');

    const closeConflict = evaluateExistingCardSafety({
      plannedBets: [planned],
      existingOfficial: [{ ...asExisting(planned), closePrice: -9 }],
      existingHybrid: [],
      trackedGameIds: tracked,
    });
    expect(closeConflict.mode).toBe('blocked_conflict');

    const modelConflict = evaluateExistingCardSafety({
      plannedBets: [planned],
      existingOfficial: [{ ...asExisting(planned), modelPrice: -99 }],
      existingHybrid: [],
      trackedGameIds: tracked,
    });
    expect(modelConflict.mode).toBe('blocked_conflict');
  });

  it('existing hybrid_v2 BLOCK', () => {
    const safety = evaluateExistingCardSafety({
      plannedBets: [planned],
      existingOfficial: [],
      existingHybrid: [
        { ...asExisting(planned), strategyTag: 'hybrid_v2' },
      ],
      trackedGameIds: tracked,
    });
    expect(safety.mode).toBe('blocked_hybrid');
  });

  it('createMany count mismatch throws inside helper', async () => {
    await expect(
      executeAtomicAppendCommit({
        plannedBets: [planned],
        trackedGameIds: tracked,
        reReadOfficial: async () => [],
        reReadHybrid: async () => [],
        createMany: async () => ({ count: 0 }),
      })
    ).rejects.toThrow(/createMany\.count mismatch/);
  });

  it('transaction re-read race blocks before createMany', async () => {
    let createCalled = false;
    await expect(
      executeAtomicAppendCommit({
        plannedBets: [planned],
        trackedGameIds: tracked,
        reReadOfficial: async () => [
          { ...asExisting(planned), side: 'away' },
        ],
        reReadHybrid: async () => [],
        createMany: async () => {
          createCalled = true;
          return { count: 1 };
        },
      })
    ).rejects.toThrow(/append safety failed/);
    expect(createCalled).toBe(false);
  });

  it('exact existing planned key → no createMany (idempotent no-op)', async () => {
    let createCalled = false;
    const result = await executeAtomicAppendCommit({
      plannedBets: [planned],
      trackedGameIds: tracked,
      reReadOfficial: async () => [asExisting(planned)],
      reReadHybrid: async () => [],
      createMany: async () => {
        createCalled = true;
        return { count: 1 };
      },
    });
    expect(createCalled).toBe(false);
    expect(result.count).toBe(0);
    expect(result.newPlannedBets).toEqual([]);
  });

  it('append inserts only missing keys', async () => {
    const prior = { ...asExisting(planned), gameId: 'g2' };
    const created: unknown[] = [];
    const result = await executeAtomicAppendCommit({
      plannedBets: [planned],
      trackedGameIds: tracked,
      reReadOfficial: async () => [prior],
      reReadHybrid: async () => [],
      createMany: async (rows) => {
        created.push(...rows);
        return { count: rows.length };
      },
    });
    expect(result.count).toBe(1);
    expect(result.newPlannedBets).toHaveLength(1);
    expect(created).toHaveLength(1);
    expect((created[0] as { gameId: string }).gameId).toBe('g1');
  });

  it('A: abort before createMany → no mutation invocation', () => {
    const exec = buildRolledBackTransactionExecution({
      createManyInvoked: false,
      createManyCount: null,
      error: 'append safety failed',
    });
    expect(exec.transactionStarted).toBe(true);
    expect(exec.mutationsInvoked).toBe(false);
    expect(exec.betPersistenceInvoked).toBe(false);
    expect(exec.createManyCount).toBeNull();
    expect(exec.commitSucceeded).toBe(false);
    expect(exec.providerCalls).toBe(0);
  });

  it('B: createMany invoked then count mismatch rollback → mutation reported', () => {
    const exec = buildRolledBackTransactionExecution({
      createManyInvoked: true,
      createManyCount: 0,
      error: 'createMany.count mismatch: expected=3 actual=0',
    });
    expect(exec.transactionStarted).toBe(true);
    expect(exec.mutationsInvoked).toBe(true);
    expect(exec.betPersistenceInvoked).toBe(true);
    expect(exec.createManyCount).toBe(0);
    expect(exec.commitSucceeded).toBe(false);
    expect(exec.providerCalls).toBe(0);
  });

  it('assertCreateManyCountMatches throws', () => {
    expect(() => assertCreateManyCountMatches(3, 2)).toThrow();
  });

  it('post-write append verification checks prior+new union', () => {
    const prior = { ...asExisting(planned), gameId: 'g2' };
    const ok = verifyCoreCardPostWrite({
      plannedBets: [planned],
      newPlannedBets: [planned],
      createManyCount: 1,
      beforeOfficial: [prior],
      afterOfficial: [prior, asExisting(planned)],
      afterHybrid: [],
    });
    expect(ok.ok).toBe(true);
    expect(ok.existingRowsBefore).toBe(1);
    expect(ok.newRowsPlanned).toBe(1);
    expect(ok.insertedRows).toBe(1);
    expect(ok.rowsAfter).toBe(2);
  });

  it('post-write verification fails missing/extra/conflict/duplicate/changed prior', () => {
    const missing = verifyCoreCardPostWrite({
      plannedBets: [planned],
      newPlannedBets: [planned],
      createManyCount: 1,
      beforeOfficial: [],
      afterOfficial: [],
      afterHybrid: [],
    });
    expect(missing.ok).toBe(false);
    expect(missing.missingKeys.length).toBe(1);

    const conflict = verifyCoreCardPostWrite({
      plannedBets: [planned],
      newPlannedBets: [planned],
      createManyCount: 1,
      beforeOfficial: [],
      afterOfficial: [{ ...asExisting(planned), closePrice: -99 }],
      afterHybrid: [],
    });
    expect(conflict.conflictingRows.length).toBe(1);

    const dup = verifyCoreCardPostWrite({
      plannedBets: [planned],
      newPlannedBets: [planned],
      createManyCount: 1,
      beforeOfficial: [],
      afterOfficial: [asExisting(planned), asExisting(planned)],
      afterHybrid: [],
    });
    expect(dup.duplicateKeys.length).toBe(1);

    const extra = verifyCoreCardPostWrite({
      plannedBets: [planned],
      newPlannedBets: [planned],
      createManyCount: 1,
      beforeOfficial: [],
      afterOfficial: [
        asExisting(planned),
        { ...asExisting(planned), gameId: 'g-extra' },
      ],
      afterHybrid: [],
    });
    expect(extra.extraKeys.length).toBe(1);

    const prior = { ...asExisting(planned), gameId: 'g2' };
    const changed = verifyCoreCardPostWrite({
      plannedBets: [planned],
      newPlannedBets: [planned],
      createManyCount: 1,
      beforeOfficial: [prior],
      afterOfficial: [
        { ...prior, closePrice: -99 },
        asExisting(planned),
      ],
      afterHybrid: [],
    });
    expect(changed.ok).toBe(false);
    expect(changed.changedPriorKeys.length).toBe(1);
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

describe('2C-2J-5 split-slate kickoff_before tranche', () => {
  const executionNow = new Date('2026-08-28T12:00:00.000Z');
  const cutoff = '2026-09-01T00:00:00.000Z';

  function mkGame(
    id: string,
    kickoffIso: string,
    markets: Parameters<typeof selection>[0] = {
      spreadHma: 7,
      total: 50,
      homeMl: -200,
      awayMl: 170,
    }
  ): WeeklyCardGameInput {
    return baseGame({
      gameId: id,
      week: 1,
      kickoff: kickoffIso,
      coreSpreadHma: 10,
      marketSelection: selection(markets),
    });
  }

  it('kickoff_before is exclusive; blank preserves full kickoff-eligible set', () => {
    expect(parseKickoffBefore('').ok).toBe(true);
    expect(parseKickoffBefore('').value).toBeNull();
    expect(parseKickoffBefore(cutoff).ok).toBe(true);
    expect(isBeforeKickoffCutoff('2026-09-01T00:00:00.000Z', new Date(cutoff))).toBe(
      false
    );
    expect(isBeforeKickoffCutoff('2026-08-31T23:59:59.000Z', new Date(cutoff))).toBe(
      true
    );

    // Strict ISO-8601 with timezone + calendar/time component validation
    expect(parseKickoffBefore('2026-09-01T00:00:00Z').ok).toBe(true);
    expect(parseKickoffBefore('2026-09-01T00:00:00.000Z').ok).toBe(true);
    expect(parseKickoffBefore('2026-08-31T19:00:00-05:00').ok).toBe(true);
    expect(parseKickoffBefore('2024-02-29T12:00:00Z').ok).toBe(true); // leap year
    expect(parseKickoffBefore('2026-02-29T00:00:00Z').ok).toBe(false); // non-leap Feb 29
    expect(parseKickoffBefore('2026-02-31T00:00:00Z').ok).toBe(false);
    expect(parseKickoffBefore('2026-09-31T00:00:00Z').ok).toBe(false);
    expect(parseKickoffBefore('2026-09-01T24:00:00Z').ok).toBe(false);
    expect(parseKickoffBefore('2026-09-01T00:60:00Z').ok).toBe(false);
    expect(parseKickoffBefore('2026-09-01T00:00:60Z').ok).toBe(false);
    expect(parseKickoffBefore('2026-09-01').ok).toBe(false);
    expect(parseKickoffBefore('09/01/2026').ok).toBe(false);
    expect(parseKickoffBefore('September 1, 2026').ok).toBe(false);
    expect(parseKickoffBefore('2026-09-01T00:00:00').ok).toBe(false);

    const early = mkGame('early', '2026-08-30T00:00:00.000Z');
    const late = mkGame('late', '2026-09-05T00:00:00.000Z');
    // Pad to Week-1 51 for universe invariant when week=1.
    const fillers = Array.from({ length: 49 }, (_, i) =>
      mkGame(`f${i}`, '2026-09-06T00:00:00.000Z')
    );

    const withCutoff = buildCoreWeeklyCardPlan({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      executionNow,
      kickoffBefore: cutoff,
      fbsMembershipCount: 138,
      games: [early, late, ...fillers],
      existingOfficial: [],
      existingHybrid: [],
    });
    expect(withCutoff.tranche.selectedGameIds).toEqual(['early']);
    expect(withCutoff.tranche.selectedGameCount).toBe(1);
    expect(withCutoff.tranche.excludedAfterCutoffGameIds).toContain('late');
    expect(withCutoff.tranche.kickoffBefore).toBe(new Date(cutoff).toISOString());
    expect(withCutoff.games.trackedCount).toBe(51);
    expect(withCutoff.games.week1Exact51).toBe(true);

    const blank = buildCoreWeeklyCardPlan({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      executionNow,
      kickoffBefore: null,
      fbsMembershipCount: 138,
      games: [early, late, ...fillers],
      existingOfficial: [],
      existingHybrid: [],
    });
    expect(blank.tranche.kickoffBefore).toBeNull();
    expect(blank.tranche.selectedGameCount).toBe(51);
    expect(blank.tranche.excludedAfterCutoffGameIds).toEqual([]);
  });

  it('kickoff_before rejects invalid calendar/time components (no JS Date normalization)', () => {
    expect(parseKickoffBefore('2024-02-29T12:00:00Z').ok).toBe(true);
    expect(parseKickoffBefore('2026-02-31T00:00:00Z').ok).toBe(false);
    expect(parseKickoffBefore('2026-09-31T00:00:00Z').ok).toBe(false);
    expect(parseKickoffBefore('2026-09-01T24:00:00Z').ok).toBe(false);
    expect(parseKickoffBefore('2026-09-01T00:60:00Z').ok).toBe(false);
    expect(parseKickoffBefore('2026-09-01T00:00:60Z').ok).toBe(false);
    expect(parseKickoffBefore('2026-09-01T00:00:00Z').ok).toBe(true);
    expect(parseKickoffBefore('2026-08-31T19:00:00-05:00').ok).toBe(true);
  });

  it('30-minute kickoff gate still wins over kickoff_before', () => {
    const soon = mkGame('soon', new Date(executionNow.getTime() + 20 * 60 * 1000).toISOString());
    const ok = mkGame('ok', '2026-08-30T00:00:00.000Z');
    const fillers = Array.from({ length: 49 }, (_, i) =>
      mkGame(`f${i}`, '2026-09-06T00:00:00.000Z')
    );
    const plan = buildCoreWeeklyCardPlan({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      executionNow,
      kickoffBefore: cutoff,
      fbsMembershipCount: 138,
      games: [soon, ok, ...fillers],
      existingOfficial: [],
      existingHybrid: [],
    });
    expect(plan.kickoffGate.exclusions.some((e) => e.gameId === 'soon')).toBe(true);
    expect(plan.tranche.selectedGameIds).toEqual(['ok']);
    expect(plan.tranche.selectedGameIds).not.toContain('soon');
  });

  it('missing market outside selected tranche does not block; inside does', () => {
    const early = mkGame('early', '2026-08-30T00:00:00.000Z');
    const lateMissing = mkGame('late', '2026-09-05T00:00:00.000Z', {
      spreadHma: null,
      total: null,
      homeMl: null,
      awayMl: null,
    });
    const fillers = Array.from({ length: 49 }, (_, i) =>
      mkGame(`f${i}`, '2026-09-06T00:00:00.000Z')
    );
    const okOutside = buildCoreWeeklyCardPlan({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      executionNow,
      kickoffBefore: cutoff,
      fbsMembershipCount: 138,
      games: [early, lateMissing, ...fillers],
      existingOfficial: [],
      existingHybrid: [],
    });
    expect(okOutside.tranche.selectedGameIds).toEqual(['early']);
    expect(okOutside.writeBlockers.some((b) => /late/.test(b))).toBe(false);
    expect(okOutside.marketReadiness.gamesMissingSpread).toContain('late');

    const earlyMissing = mkGame('early', '2026-08-30T00:00:00.000Z', {
      spreadHma: null,
      total: 50,
      homeMl: -200,
      awayMl: 170,
    });
    const late = mkGame('late', '2026-09-05T00:00:00.000Z');
    const blocked = buildCoreWeeklyCardPlan({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      executionNow,
      kickoffBefore: cutoff,
      fbsMembershipCount: 138,
      games: [earlyMissing, late, ...fillers],
      existingOfficial: [],
      existingHybrid: [],
    });
    expect(blocked.writeSafe).toBe(false);
    expect(
      blocked.writeBlockers.some((b) => /selected tranche game early/.test(b))
    ).toBe(true);
  });

  it('entire selected tranche already present → idempotent NO-OP; commitEligible false', () => {
    const early = mkGame('early', '2026-08-30T00:00:00.000Z');
    const fillers = Array.from({ length: 50 }, (_, i) =>
      mkGame(`f${i}`, '2026-09-06T00:00:00.000Z')
    );
    const preview = buildCoreWeeklyCardPlan({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      executionNow,
      kickoffBefore: cutoff,
      fbsMembershipCount: 138,
      games: [early, ...fillers],
      existingOfficial: [],
      existingHybrid: [],
    });
    expect(preview.plannedBets.length).toBeGreaterThan(0);

    const commit = buildCoreWeeklyCardPlan({
      season: 2026,
      week: 1,
      mode: 'COMMIT',
      confirmation: 'WRITE_2026_WEEK_1_CORE_CARD',
      executionNow,
      kickoffBefore: cutoff,
      fbsMembershipCount: 138,
      games: [early, ...fillers],
      existingOfficial: preview.plannedBets.map(asExisting),
      existingHybrid: [],
    });
    expect(commit.existingSafety.mode).toBe('idempotent_exact');
    expect(commit.newPlannedBets).toHaveLength(0);
    expect(isIdempotentNoOp(commit)).toBe(true);
    expect(commitEligible(commit)).toBe(false);
    // Apparently idempotent plans still may enter the authoritative transaction.
    expect(commitMayEnterTransaction(commit)).toBe(true);
  });
});

describe('2C-2J-5A transactional idempotent audit + phase', () => {
  it('transactional idempotent no-op reports transactionStarted=true', () => {
    const exec = buildTransactionalIdempotentNoOpExecution();
    expect(exec.transactionStarted).toBe(true);
    expect(exec.mutationsInvoked).toBe(false);
    expect(exec.betPersistenceInvoked).toBe(false);
    expect(exec.createManyCount).toBe(0);
    expect(exec.commitSucceeded).toBe(true);
    expect(exec.postWriteVerificationSucceeded).toBe(true);
  });

  it('transactional no-op verification failure is fail-closed with zero mutation flags', () => {
    const exec = buildTransactionalIdempotentVerificationFailureExecution({
      error: 'fresh verification failed',
    });
    expect(exec.transactionStarted).toBe(true);
    expect(exec.mutationsInvoked).toBe(false);
    expect(exec.betPersistenceInvoked).toBe(false);
    expect(exec.createManyCount).toBe(0);
    expect(exec.commitSucceeded).toBe(true);
    expect(exec.postWriteVerificationSucceeded).toBe(false);
  });

  it('serialization/transaction rollback after mutation attempt preserves 4B flags', () => {
    const exec = buildRolledBackTransactionExecution({
      createManyInvoked: true,
      createManyCount: 2,
      error: 'could not serialize access due to concurrent update',
    });
    expect(exec.transactionStarted).toBe(true);
    expect(exec.mutationsInvoked).toBe(true);
    expect(exec.betPersistenceInvoked).toBe(true);
    expect(exec.createManyCount).toBe(2);
    expect(exec.commitSucceeded).toBe(false);
  });

  it('report phase === 2C-2J-5', () => {
    const plan = buildCoreWeeklyCardPlan({
      season: 2026,
      week: 2,
      mode: 'PREVIEW',
      executionNow: new Date(),
      fbsMembershipCount: 138,
      games: [],
      existingOfficial: [],
      existingHybrid: [],
    });
    const report = finalizeCoreCardReport({
      plan,
      execution: buildPreviewExecution('PREVIEW'),
      verification: null,
    });
    expect(report.phase).toBe('2C-2J-5');
  });

  it('authoritative transaction exact match → zero createMany invocation', async () => {
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
    let createCalled = false;
    const result = await executeAtomicAppendCommit({
      plannedBets: [planned],
      trackedGameIds: ['g1'],
      reReadOfficial: async () => [asExisting(planned)],
      reReadHybrid: async () => [],
      createMany: async () => {
        createCalled = true;
        return { count: 1 };
      },
    });
    expect(createCalled).toBe(false);
    expect(result.count).toBe(0);
    expect(result.newPlannedBets).toEqual([]);
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

  it('safe PREVIEW exit success; unsafe PREVIEW nonzero — zero mutation flags', () => {
    const safeExec = buildPreviewExecution('PREVIEW');
    expect(resolvePreviewExitCode(true)).toBe(0);
    expect(safeExec.mutationsInvoked).toBe(false);
    expect(safeExec.betPersistenceInvoked).toBe(false);
    expect(safeExec.commitAttempted).toBe(false);
    expect(safeExec.providerCalls).toBe(0);

    const unsafeExec = buildPreviewExecution('PREVIEW');
    expect(resolvePreviewExitCode(false)).toBe(1);
    expect(unsafeExec.mutationsInvoked).toBe(false);
    expect(unsafeExec.betPersistenceInvoked).toBe(false);
    expect(unsafeExec.commitAttempted).toBe(false);
    expect(unsafeExec.providerCalls).toBe(0);
  });

  it('committed verification failure keeps commitSucceeded=true', () => {
    const fail = buildCommittedVerificationFailureExecution({
      createManyCount: 12,
      error: 'verification read failed',
    });
    expect(fail.commitSucceeded).toBe(true);
    expect(fail.postWriteVerificationSucceeded).toBe(false);
    expect(fail.mutationsInvoked).toBe(true);
    expect(fail.betPersistenceInvoked).toBe(true);
    expect(fail.transactionStarted).toBe(true);
    expect(fail.createManyCount).toBe(12);
    expect(fail.providerCalls).toBe(0);

    const ok = buildSuccessfulCommitExecution({
      createManyCount: 12,
      postWriteVerificationSucceeded: true,
    });
    expect(ok.commitSucceeded).toBe(true);
    expect(ok.postWriteVerificationSucceeded).toBe(true);
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
