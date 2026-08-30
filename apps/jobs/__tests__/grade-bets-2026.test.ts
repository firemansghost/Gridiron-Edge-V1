/**
 * 2C-2J-6C-1 — guarded 2026 official_flat_100 grading (pure; mocked DB).
 */

import {
  buildRolledBackGradeExecution,
  commitEligible,
  executeAtomicOfficialGradeCommit,
  expectedGradeConfirmation,
  parseGradeCliArgs,
  planOfficialGrades,
  settleOfficialBet,
  verifyGradePostWrite,
  type GradeBetRow,
  type NonTargetBetSnapshot,
} from '../lib/grade-bets-2026';
import { gradeMoneyline, gradeSpreadTotal } from '../lib/grading-settlement';

function officialBet(
  overrides: Partial<GradeBetRow> & {
    id: string;
    gameId: string;
    marketType: string;
    side: string;
  }
): GradeBetRow {
  const gameId = overrides.gameId;
  return {
    id: overrides.id,
    season: overrides.season ?? 2026,
    week: overrides.week ?? 1,
    gameId,
    marketType: overrides.marketType,
    side: overrides.side,
    modelPrice: overrides.modelPrice ?? -110,
    closePrice:
      overrides.closePrice === undefined ? -3.5 : overrides.closePrice,
    stake: overrides.stake ?? 100,
    result: overrides.result ?? null,
    pnl: overrides.pnl ?? null,
    clv: overrides.clv ?? null,
    strategyTag: overrides.strategyTag ?? 'official_flat_100',
    source: overrides.source ?? 'strategy_run',
    game: overrides.game ?? {
      id: gameId,
      season: overrides.season ?? 2026,
      week: overrides.week ?? 1,
      status: 'final',
      homeScore: 28,
      awayScore: 21,
    },
  };
}

describe('2C-2J-6C-1 args / confirmation', () => {
  it('accepts season 2026 PREVIEW; rejects other seasons and garbage', () => {
    expect(
      parseGradeCliArgs(['--season', '2026', '--week', '1', '--mode', 'PREVIEW'])
        .ok
    ).toBe(true);
    expect(
      parseGradeCliArgs(['--season', '2025', '--week', '1', '--mode', 'PREVIEW'])
        .ok
    ).toBe(false);
    expect(
      parseGradeCliArgs(['--season', '2026', '--week', '0', '--mode', 'PREVIEW'])
        .ok
    ).toBe(false);
    expect(
      parseGradeCliArgs([
        '--season',
        '2026',
        '--week',
        '1',
        'garbage',
      ]).ok
    ).toBe(false);
    expect(
      parseGradeCliArgs(['--season', '2026', '--week', '1', '--force']).ok
    ).toBe(false);
    expect(parseGradeCliArgs(['--season', '2026', '--week']).ok).toBe(false);
  });

  it('COMMIT requires exact GRADE_2026_WEEK_<n>_OFFICIAL', () => {
    expect(expectedGradeConfirmation(1)).toBe('GRADE_2026_WEEK_1_OFFICIAL');
    const bad = parseGradeCliArgs([
      '--season',
      '2026',
      '--week',
      '1',
      '--mode',
      'COMMIT',
      '--confirm',
      'WRONG',
    ]);
    expect(bad.ok).toBe(false);
    const good = parseGradeCliArgs([
      '--season',
      '2026',
      '--week',
      '1',
      '--mode',
      'COMMIT',
      '--confirm',
      'GRADE_2026_WEEK_1_OFFICIAL',
    ]);
    expect(good.ok).toBe(true);
  });
});

describe('2C-2J-6C-1 settlement scope + fail-closed', () => {
  it('scope is official_flat_100 only; moneyline uses closePrice; spread uses helpers', () => {
    const ml = officialBet({
      id: 'b-ml',
      gameId: 'g1',
      marketType: 'moneyline',
      side: 'home',
      modelPrice: 180,
      closePrice: 270,
      stake: 100,
      game: {
        id: 'g1',
        season: 2026,
        week: 1,
        status: 'final',
        homeScore: 28,
        awayScore: 21,
      },
    });
    const settledMl = settleOfficialBet(ml);
    expect(settledMl.ok).toBe(true);
    if (settledMl.ok) {
      const expected = gradeMoneyline('home', 180, 270, 7, 100);
      expect(settledMl.pnl).toBe(expected.pnl);
      expect(settledMl.pnl).toBe(270);
      expect(settledMl.result).toBe('win');
    }

    const spread = officialBet({
      id: 'b-sp',
      gameId: 'g1',
      marketType: 'spread',
      side: 'home',
      modelPrice: -6.5,
      closePrice: -3.5,
      stake: 100,
    });
    const settledSp = settleOfficialBet(spread);
    expect(settledSp.ok).toBe(true);
    if (settledSp.ok) {
      const expected = gradeSpreadTotal(
        'spread',
        'home',
        -6.5,
        -3.5,
        7,
        49,
        100
      );
      expect(settledSp).toMatchObject(expected);
    }

    const plan = planOfficialGrades({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      confirmation: '',
      officialBets: [ml, spread],
    });
    expect(plan.writeSafe).toBe(true);
    expect(plan.counts.plannedUpdates).toBe(2);
    expect(plan.rows.every((r) => r.action === 'grade')).toBe(true);
  });

  it('missing official 2026 closePrice blocks the entire plan', () => {
    const ok = officialBet({
      id: 'b1',
      gameId: 'g1',
      marketType: 'spread',
      side: 'home',
      closePrice: -3.5,
    });
    const missing = officialBet({
      id: 'b2',
      gameId: 'g2',
      marketType: 'spread',
      side: 'away',
      closePrice: null,
      game: {
        id: 'g2',
        season: 2026,
        week: 1,
        status: 'final',
        homeScore: 14,
        awayScore: 10,
      },
    });
    const plan = planOfficialGrades({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      confirmation: '',
      officialBets: [ok, missing],
    });
    expect(plan.writeSafe).toBe(false);
    expect(plan.blockers.some((b) => /missing closePrice/i.test(b))).toBe(true);
    expect(plan.plannedMutations).toHaveLength(0);
  });

  it('pending non-final games do not block; PREVIEW plans no mutations for them', () => {
    const ready = officialBet({
      id: 'b1',
      gameId: 'g1',
      marketType: 'spread',
      side: 'home',
    });
    const pending = officialBet({
      id: 'b2',
      gameId: 'g2',
      marketType: 'spread',
      side: 'away',
      closePrice: -7,
      game: {
        id: 'g2',
        season: 2026,
        week: 1,
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
      },
    });
    const plan = planOfficialGrades({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      confirmation: '',
      officialBets: [ready, pending],
    });
    expect(plan.writeSafe).toBe(true);
    expect(plan.counts.plannedUpdates).toBe(1);
    expect(plan.counts.pendingGame).toBe(1);
    expect(plan.rows.find((r) => r.betId === 'b2')?.action).toBe('pending_game');
  });

  it('game season/week mismatch vs bet blocks the whole plan', () => {
    const wrongSeason = officialBet({
      id: 'b1',
      gameId: 'g1',
      marketType: 'spread',
      side: 'home',
      season: 2026,
      week: 1,
      game: {
        id: 'g1',
        season: 2025,
        week: 1,
        status: 'final',
        homeScore: 28,
        awayScore: 21,
      },
    });
    const planSeason = planOfficialGrades({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      confirmation: '',
      officialBets: [wrongSeason],
    });
    expect(planSeason.writeSafe).toBe(false);
    expect(planSeason.blockers.some((b) => /game\.season mismatch/i.test(b))).toBe(
      true
    );

    const wrongWeek = officialBet({
      id: 'b2',
      gameId: 'g2',
      marketType: 'spread',
      side: 'away',
      game: {
        id: 'g2',
        season: 2026,
        week: 2,
        status: 'final',
        homeScore: 20,
        awayScore: 17,
      },
    });
    const planWeek = planOfficialGrades({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      confirmation: '',
      officialBets: [wrongWeek],
    });
    expect(planWeek.writeSafe).toBe(false);
    expect(planWeek.blockers.some((b) => /game\.week mismatch/i.test(b))).toBe(
      true
    );
  });

  it('duplicate official natural identity blocks regardless of bet id/side', () => {
    const a = officialBet({
      id: 'bet-a',
      gameId: 'g1',
      marketType: 'spread',
      side: 'home',
      closePrice: -3.5,
    });
    const b = officialBet({
      id: 'bet-b',
      gameId: 'g1',
      marketType: 'spread',
      side: 'away',
      closePrice: 3.5,
    });
    const plan = planOfficialGrades({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      confirmation: '',
      officialBets: [a, b],
    });
    expect(plan.writeSafe).toBe(false);
    expect(
      plan.blockers.some((x) => /duplicate official natural identity/i.test(x))
    ).toBe(true);
    expect(plan.plannedMutations).toHaveLength(0);
  });
});

describe('2C-2J-6C-1 COMMIT atomicity + verification', () => {
  const bets: GradeBetRow[] = [
    officialBet({
      id: 'b1',
      gameId: 'g1',
      marketType: 'moneyline',
      side: 'home',
      modelPrice: 180,
      closePrice: 270,
    }),
    officialBet({
      id: 'b2',
      gameId: 'g1',
      marketType: 'spread',
      side: 'home',
      modelPrice: -6.5,
      closePrice: -3.5,
    }),
  ];
  const nonTarget: NonTargetBetSnapshot[] = [
    {
      id: 'other-1',
      strategyTag: 'labs_hybrid',
      source: 'strategy_run',
      result: null,
      pnl: null,
      clv: null,
      closePrice: -110,
      modelPrice: -105,
      stake: 100,
    },
  ];

  it('Serializable commit path updates only result/pnl/clv; rollback mid-tx', async () => {
    const plan = planOfficialGrades({
      season: 2026,
      week: 1,
      mode: 'COMMIT',
      confirmation: 'GRADE_2026_WEEK_1_OFFICIAL',
      officialBets: bets,
      nonTargetBets: nonTarget,
    });
    expect(commitEligible(plan)).toBe(true);
    expect(plan.plannedMutations.length).toBe(2);

    const store = new Map(bets.map((b) => [b.id, { ...b }]));
    let attempts = 0;
    const result = await executeAtomicOfficialGradeCommit({
      plan,
      reReadOfficialBets: async () =>
        Array.from(store.values()).map((b) => ({ ...b, game: { ...b.game } })),
      reReadNonTargetBets: async () => nonTarget,
      updateBetGrade: async (row) => {
        attempts += 1;
        const cur = store.get(row.betId)!;
        if (cur.result !== null) return { count: 0 };
        store.set(row.betId, {
          ...cur,
          result: row.result,
          pnl: row.pnl,
          clv: row.clv,
        });
        return { count: 1 };
      },
    });
    expect(result.updateCount).toBe(2);
    expect(attempts).toBe(2);
    expect(store.get('b1')!.result).toBe('win');
    expect(store.get('b1')!.closePrice).toBe(270);

    // Mid-transaction failure: first succeeds in callback, second throws → audit
    const store2 = new Map(bets.map((b) => [b.id, { ...b }]));
    let attempts2 = 0;
    await expect(
      executeAtomicOfficialGradeCommit({
        plan,
        reReadOfficialBets: async () =>
          Array.from(store2.values()).map((b) => ({
            ...b,
            game: { ...b.game },
          })),
        updateBetGrade: async (row) => {
          attempts2 += 1;
          if (attempts2 >= 2) {
            throw new Error('simulated mid-transaction failure');
          }
          const cur = store2.get(row.betId)!;
          store2.set(row.betId, {
            ...cur,
            result: row.result,
            pnl: row.pnl,
            clv: row.clv,
          });
          return { count: 1 };
        },
      })
    ).rejects.toThrow(/simulated mid-transaction failure/);
    expect(attempts2).toBe(2);
    const rolled = buildRolledBackGradeExecution({
      betMutationAttempts: attempts2,
      error: 'simulated mid-transaction failure',
    });
    expect(rolled.betMutationsInvoked).toBe(true);
    expect(rolled.betUpdateCount).toBeNull();
    expect(rolled.commitSucceeded).toBe(false);
    expect(rolled.postWriteVerificationSucceeded).toBeNull();
  });

  it('post-write verification catches missing/extra/wrong grades; non-targets unchanged', () => {
    const plan = planOfficialGrades({
      season: 2026,
      week: 1,
      mode: 'COMMIT',
      confirmation: 'GRADE_2026_WEEK_1_OFFICIAL',
      officialBets: bets,
      nonTargetBets: nonTarget,
    });

    const afterOk: GradeBetRow[] = bets.map((b) => {
      const m = plan.plannedMutations.find((x) => x.betId === b.id)!;
      return { ...b, result: m.result, pnl: m.pnl, clv: m.clv };
    });
    const ok = verifyGradePostWrite({
      plan,
      officialBetsAfter: afterOk,
      nonTargetBetsAfter: nonTarget,
    });
    expect(ok.ok).toBe(true);

    const wrong = verifyGradePostWrite({
      plan,
      officialBetsAfter: [
        { ...afterOk[0], result: 'loss' },
        afterOk[1],
      ],
      nonTargetBetsAfter: nonTarget,
    });
    expect(wrong.ok).toBe(false);

    const mutatedNon = verifyGradePostWrite({
      plan,
      officialBetsAfter: afterOk,
      nonTargetBetsAfter: [
        { ...nonTarget[0], result: 'win', pnl: 90, clv: 1 },
      ],
    });
    expect(mutatedNon.ok).toBe(false);
    expect(
      mutatedNon.reasons.some((r) => /non-target bet mutated/i.test(r))
    ).toBe(true);

    const missing = verifyGradePostWrite({
      plan,
      officialBetsAfter: [afterOk[0]],
      nonTargetBetsAfter: nonTarget,
    });
    expect(missing.ok).toBe(false);
  });

  it('null pnl/clv fails when expected numeric zero; genuine zero ok; score drift fails', () => {
    const pushBet = officialBet({
      id: 'push-1',
      gameId: 'g-push',
      marketType: 'spread',
      side: 'away',
      modelPrice: 7,
      closePrice: 7,
      game: {
        id: 'g-push',
        season: 2026,
        week: 1,
        status: 'final',
        homeScore: 21,
        awayScore: 14, // margin 7; away +7 → push
      },
    });
    const plan = planOfficialGrades({
      season: 2026,
      week: 1,
      mode: 'COMMIT',
      confirmation: 'GRADE_2026_WEEK_1_OFFICIAL',
      officialBets: [pushBet],
      nonTargetBets: [],
    });
    expect(plan.writeSafe).toBe(true);
    expect(plan.plannedMutations[0].result).toBe('push');
    expect(plan.plannedMutations[0].pnl).toBe(0);

    const nullPnl = verifyGradePostWrite({
      plan,
      officialBetsAfter: [
        {
          ...pushBet,
          result: 'push',
          pnl: null,
          clv: plan.plannedMutations[0].clv,
        },
      ],
      nonTargetBetsAfter: [],
    });
    expect(nullPnl.ok).toBe(false);
    expect(nullPnl.reasons.some((r) => /pnl null/i.test(r))).toBe(true);

    const nullClv = verifyGradePostWrite({
      plan,
      officialBetsAfter: [
        {
          ...pushBet,
          result: 'push',
          pnl: 0,
          clv: null,
        },
      ],
      nonTargetBetsAfter: [],
    });
    expect(nullClv.ok).toBe(false);
    expect(nullClv.reasons.some((r) => /clv null/i.test(r))).toBe(true);

    const zeroOk = verifyGradePostWrite({
      plan,
      officialBetsAfter: [
        {
          ...pushBet,
          result: 'push',
          pnl: 0,
          clv: plan.plannedMutations[0].clv,
        },
      ],
      nonTargetBetsAfter: [],
    });
    expect(zeroOk.ok).toBe(true);

    const scoreDrift = verifyGradePostWrite({
      plan,
      officialBetsAfter: [
        {
          ...pushBet,
          result: 'push',
          pnl: 0,
          clv: plan.plannedMutations[0].clv,
          game: { ...pushBet.game, homeScore: 99, awayScore: 0 },
        },
      ],
      nonTargetBetsAfter: [],
    });
    expect(scoreDrift.ok).toBe(false);
    expect(scoreDrift.reasons.some((r) => /homeScore changed/i.test(r))).toBe(
      true
    );
  });

  it('idempotent second execution: zero mutations when already graded correctly', async () => {
    const plan1 = planOfficialGrades({
      season: 2026,
      week: 1,
      mode: 'COMMIT',
      confirmation: 'GRADE_2026_WEEK_1_OFFICIAL',
      officialBets: bets,
      nonTargetBets: nonTarget,
    });
    const graded = bets.map((b) => {
      const m = plan1.plannedMutations.find((x) => x.betId === b.id)!;
      return { ...b, result: m.result, pnl: m.pnl, clv: m.clv };
    });

    const plan2 = planOfficialGrades({
      season: 2026,
      week: 1,
      mode: 'COMMIT',
      confirmation: 'GRADE_2026_WEEK_1_OFFICIAL',
      officialBets: graded,
      nonTargetBets: nonTarget,
    });
    expect(plan2.writeSafe).toBe(true);
    expect(plan2.counts.plannedUpdates).toBe(0);
    expect(plan2.counts.alreadyGradedSame).toBe(2);

    let mut = 0;
    const noop = await executeAtomicOfficialGradeCommit({
      plan: plan2,
      reReadOfficialBets: async () => graded,
      reReadNonTargetBets: async () => nonTarget,
      updateBetGrade: async () => {
        mut += 1;
        return { count: 1 };
      },
    });
    expect(noop.updateCount).toBe(0);
    expect(mut).toBe(0);

    const verify = verifyGradePostWrite({
      plan: plan2,
      officialBetsAfter: graded,
      nonTargetBetsAfter: nonTarget,
    });
    expect(verify.ok).toBe(true);
  });

  it('unexpected already-graded during update fails the transaction', async () => {
    const plan = planOfficialGrades({
      season: 2026,
      week: 1,
      mode: 'COMMIT',
      confirmation: 'GRADE_2026_WEEK_1_OFFICIAL',
      officialBets: bets,
      nonTargetBets: nonTarget,
    });
    await expect(
      executeAtomicOfficialGradeCommit({
        plan,
        reReadOfficialBets: async () => bets,
        updateBetGrade: async () => ({ count: 0 }),
      })
    ).rejects.toThrow(/unexpected update count 0/);
  });
});
