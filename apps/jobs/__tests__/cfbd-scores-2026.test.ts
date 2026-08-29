/**
 * 2C-2J-6B — pure unit tests for guarded CFBD score planning (mocked provider).
 */

import {
  WEEK1_GAME_COUNT,
  buildRolledBackScoreExecution,
  commitEligible,
  executeAtomicScoreCommitWithNormalized,
  expectedScoreConfirmation,
  fetchCfbdScoresWeek,
  normalizeProviderScoreGames,
  parseScoreCliArgs,
  planScoreUpdates,
  verifyScorePostWrite,
  type DbScoreGameRow,
  type NormalizedScoreGame,
} from '../lib/cfbd-scores-2026';
import type { CfbdProviderGame, TeamLookup, TeamRecord } from '../src/preseason/cfbd-schedule-ingest';

function fakeLookup(teams: TeamRecord[]): TeamLookup {
  return {
    async findById(id: string) {
      return teams.find((t) => t.id === id) ?? null;
    },
    async findByNameInsensitive(name: string) {
      const n = name.toLowerCase();
      return teams.filter((t) => t.name.toLowerCase() === n);
    },
  };
}

function providerGame(
  overrides: Partial<CfbdProviderGame> & {
    homeTeam: string;
    awayTeam: string;
    week: number;
  }
): CfbdProviderGame {
  return {
    season: 2026,
    week: overrides.week,
    homeTeam: overrides.homeTeam,
    awayTeam: overrides.awayTeam,
    homeClassification: 'fbs',
    awayClassification: 'fbs',
    completed: overrides.completed ?? false,
    homePoints: overrides.homePoints,
    awayPoints: overrides.awayPoints,
    ...overrides,
  };
}

describe('2C-2J-6B args / confirmation', () => {
  it('accepts season 2026 and rejects others', () => {
    expect(
      parseScoreCliArgs(['--season', '2026', '--week', '1', '--mode', 'PREVIEW']).ok
    ).toBe(true);
    expect(
      parseScoreCliArgs(['--season', '2025', '--week', '1', '--mode', 'PREVIEW']).ok
    ).toBe(false);
  });

  it('rejects week 0, current, ranges, unknown args', () => {
    expect(parseScoreCliArgs(['--season', '2026', '--week', '0']).ok).toBe(false);
    expect(
      parseScoreCliArgs(['--season', '2026', '--week', 'current']).ok
    ).toBe(false);
    expect(parseScoreCliArgs(['--season', '2026', '--week', '1-8']).ok).toBe(false);
    expect(
      parseScoreCliArgs(['--season', '2026', '--week', '1', '--force']).ok
    ).toBe(false);
  });

  it('rejects bare positional garbage and missing flag values', () => {
    expect(
      parseScoreCliArgs([
        '--season',
        '2026',
        '--week',
        '1',
        'garbage',
      ]).ok
    ).toBe(false);
    expect(
      parseScoreCliArgs([
        '--season',
        '2026',
        '--week',
        '1',
        'PREVIEW',
      ]).ok
    ).toBe(false);
    expect(
      parseScoreCliArgs(['foo', '--season', '2026', '--week', '1']).ok
    ).toBe(false);
    const missing = parseScoreCliArgs(['--season', '2026', '--week']);
    expect(missing.ok).toBe(false);
    expect(missing.errors.some((e) => /missing value for --week/i.test(e))).toBe(
      true
    );
    const missingMode = parseScoreCliArgs([
      '--season',
      '2026',
      '--week',
      '1',
      '--mode',
    ]);
    expect(missingMode.ok).toBe(false);
    expect(
      missingMode.errors.some((e) => /missing value for --mode/i.test(e))
    ).toBe(true);
  });

  it('COMMIT bad confirmation rejected; exact confirmation accepted', () => {
    const bad = parseScoreCliArgs([
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
    expect(expectedScoreConfirmation(1)).toBe('WRITE_2026_WEEK_1_SCORES');
    const good = parseScoreCliArgs([
      '--season',
      '2026',
      '--week',
      '1',
      '--mode',
      'COMMIT',
      '--confirm',
      'WRITE_2026_WEEK_1_SCORES',
    ]);
    expect(good.ok).toBe(true);
  });
});

describe('2C-2J-6B provider fetch', () => {
  it('requires API key; one /games call; no venues; HTTP error fails', async () => {
    await expect(
      fetchCfbdScoresWeek({ season: 2026, week: 1, apiKey: '' })
    ).rejects.toThrow(/CFBD_API_KEY/);

    let calls = 0;
    const fetchImpl = async (url: RequestInfo | URL) => {
      calls += 1;
      const u = String(url);
      expect(u).toContain('/games');
      expect(u).not.toContain('/venues');
      expect(u).toContain('year=2026');
      expect(u).toContain('week=1');
      return {
        ok: true,
        status: 200,
        json: async () => [],
      } as Response;
    };
    await fetchCfbdScoresWeek({
      season: 2026,
      week: 1,
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(calls).toBe(1);

    await expect(
      fetchCfbdScoresWeek({
        season: 2026,
        week: 1,
        apiKey: 'test-key',
        fetchImpl: (async () =>
          ({ ok: false, status: 500, json: async () => ({}) }) as Response) as typeof fetch,
      })
    ).rejects.toThrow(/HTTP 500/);
  });

  it('aborts on provider timeout; secret redacted; single call', async () => {
    let calls = 0;
    await expect(
      fetchCfbdScoresWeek({
        season: 2026,
        week: 1,
        apiKey: 'super-secret-key-xyz',
        timeoutMs: 30,
        fetchImpl: ((
          _url: RequestInfo | URL,
          init?: RequestInit
        ) => {
          calls += 1;
          return new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (!signal) {
              reject(new Error('missing abort signal'));
              return;
            }
            const onAbort = () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            };
            if (signal.aborted) onAbort();
            else signal.addEventListener('abort', onAbort, { once: true });
          });
        }) as typeof fetch,
      })
    ).rejects.toThrow(/timed out/i);
    expect(calls).toBe(1);
  });
});

describe('2C-2J-6B provider season validation', () => {
  const teams = [
    { id: 'alabama', name: 'Alabama' },
    { id: 'auburn', name: 'Auburn' },
  ];
  const lookup = fakeLookup(teams);
  const aliases = new Map<string, string>();

  it('requested 2026 + provider season 2025 → blocker; no wrong-season ID', async () => {
    const res = await normalizeProviderScoreGames({
      season: 2026,
      week: 2,
      providerGames: [
        providerGame({
          season: 2025,
          week: 2,
          homeTeam: 'Alabama',
          awayTeam: 'Auburn',
          completed: true,
          homePoints: 21,
          awayPoints: 14,
        }),
      ],
      teamLookup: lookup,
      aliases,
    });
    expect(res.blockers.some((b) => /season mismatch/i.test(b))).toBe(true);
    expect(res.normalized).toHaveLength(0);
    expect(res.normalized.every((n) => !n.gameId.includes('2025'))).toBe(true);
  });

  it('missing/invalid provider season → blocker', async () => {
    const missing = await normalizeProviderScoreGames({
      season: 2026,
      week: 2,
      providerGames: [
        providerGame({
          season: undefined as unknown as number,
          week: 2,
          homeTeam: 'Alabama',
          awayTeam: 'Auburn',
          completed: false,
        }),
      ],
      teamLookup: lookup,
      aliases,
    });
    expect(missing.blockers.some((b) => /missing\/invalid season/i.test(b))).toBe(
      true
    );
    expect(missing.normalized).toHaveLength(0);

    const invalid = await normalizeProviderScoreGames({
      season: 2026,
      week: 2,
      providerGames: [
        providerGame({
          season: 2026.5 as unknown as number,
          week: 2,
          homeTeam: 'Alabama',
          awayTeam: 'Auburn',
          completed: false,
        }),
      ],
      teamLookup: lookup,
      aliases,
    });
    expect(invalid.blockers.some((b) => /missing\/invalid season/i.test(b))).toBe(
      true
    );
  });

  it('correct 2026 season → allowed', async () => {
    const ok = await normalizeProviderScoreGames({
      season: 2026,
      week: 2,
      providerGames: [
        providerGame({
          season: 2026,
          week: 2,
          homeTeam: 'Alabama',
          awayTeam: 'Auburn',
          completed: true,
          homePoints: 21,
          awayPoints: 14,
        }),
      ],
      teamLookup: lookup,
      aliases,
    });
    expect(ok.blockers.filter((b) => /season/i.test(b))).toEqual([]);
    expect(ok.normalized).toHaveLength(1);
    expect(ok.normalized[0].gameId).toBe('2026-wk2-auburn-alabama');
  });
});

describe('2C-2J-6B identity + week1 + planning', () => {
  const teams = [
    { id: 'alabama', name: 'Alabama' },
    { id: 'auburn', name: 'Auburn' },
  ];
  const lookup = fakeLookup(teams);
  const aliases = new Map<string, string>();

  it('canonical exact match; unresolved team blocks; duplicate blocks', async () => {
    const ok = await normalizeProviderScoreGames({
      season: 2026,
      week: 2,
      providerGames: [
        providerGame({
          week: 2,
          homeTeam: 'Alabama',
          awayTeam: 'Auburn',
          completed: true,
          homePoints: 21,
          awayPoints: 14,
        }),
      ],
      teamLookup: lookup,
      aliases,
    });
    expect(ok.normalized).toHaveLength(1);
    expect(ok.normalized[0].gameId).toBe('2026-wk2-auburn-alabama');
    expect(ok.blockers).toEqual([]);

    const missing = await normalizeProviderScoreGames({
      season: 2026,
      week: 2,
      providerGames: [
        providerGame({
          week: 2,
          homeTeam: 'Unknown U',
          awayTeam: 'Auburn',
          completed: false,
        }),
      ],
      teamLookup: lookup,
      aliases,
    });
    expect(missing.blockers.some((b) => /unresolved/i.test(b))).toBe(true);

    const dup = await normalizeProviderScoreGames({
      season: 2026,
      week: 2,
      providerGames: [
        providerGame({
          week: 2,
          homeTeam: 'Alabama',
          awayTeam: 'Auburn',
          completed: false,
        }),
        providerGame({
          week: 2,
          homeTeam: 'Alabama',
          awayTeam: 'Auburn',
          completed: false,
        }),
      ],
      teamLookup: lookup,
      aliases,
    });
    expect(dup.duplicateGames).toBe(1);
  });

  it('alias resolution works', async () => {
    const aliasMap = new Map([['bama', 'alabama']]);
    const res = await normalizeProviderScoreGames({
      season: 2026,
      week: 3,
      providerGames: [
        providerGame({
          week: 3,
          homeTeam: 'Bama',
          awayTeam: 'Auburn',
          completed: false,
        }),
      ],
      teamLookup: lookup,
      aliases: aliasMap,
    });
    expect(res.normalized[0].homeTeamId).toBe('alabama');
  });

  it('Week1 requires exactly 51 provider + 51 DB', () => {
    const normalized: NormalizedScoreGame[] = Array.from(
      { length: 50 },
      (_, i) => ({
        gameId: `2026-wk1-a${i}-h${i}`,
        season: 2026,
        week: 1,
        homeTeamId: `h${i}`,
        awayTeamId: `a${i}`,
        homeTeamName: `H${i}`,
        awayTeamName: `A${i}`,
        completed: false,
        homePoints: null,
        awayPoints: null,
      })
    );
    const dbGames: DbScoreGameRow[] = normalized.map((n) => ({
      id: n.gameId,
      season: 2026,
      week: 1,
      homeTeamId: n.homeTeamId,
      awayTeamId: n.awayTeamId,
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
    }));
    const plan50 = planScoreUpdates({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      confirmation: '',
      normalized,
      dbGames,
      providerRows: 50,
      providerHttpStatus: 200,
      providerCalls: 1,
      unresolvedTeams: 0,
      duplicateGames: 0,
    });
    expect(plan50.writeSafe).toBe(false);
    expect(WEEK1_GAME_COUNT).toBe(51);

    const n51 = [
      ...normalized,
      {
        gameId: '2026-wk1-a50-h50',
        season: 2026,
        week: 1,
        homeTeamId: 'h50',
        awayTeamId: 'a50',
        homeTeamName: 'H50',
        awayTeamName: 'A50',
        completed: false,
        homePoints: null,
        awayPoints: null,
      },
    ];
    const d51 = [
      ...dbGames,
      {
        id: '2026-wk1-a50-h50',
        season: 2026,
        week: 1,
        homeTeamId: 'h50',
        awayTeamId: 'a50',
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
      },
    ];
    const plan51 = planScoreUpdates({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      confirmation: '',
      normalized: n51,
      dbGames: d51,
      providerRows: 51,
      providerHttpStatus: 200,
      providerCalls: 1,
      unresolvedTeams: 0,
      duplicateGames: 0,
    });
    expect(plan51.writeSafe).toBe(true);
  });

  it('score planning: pending / update / finalize / idempotent / conflicts', () => {
    const base: NormalizedScoreGame = {
      gameId: '2026-wk2-auburn-alabama',
      season: 2026,
      week: 2,
      homeTeamId: 'alabama',
      awayTeamId: 'auburn',
      homeTeamName: 'Alabama',
      awayTeamName: 'Auburn',
      completed: true,
      homePoints: 28,
      awayPoints: 21,
    };

    const mkPlan = (db: DbScoreGameRow, n: NormalizedScoreGame = base) =>
      planScoreUpdates({
        season: 2026,
        week: 2,
        mode: 'COMMIT',
        confirmation: 'WRITE_2026_WEEK_2_SCORES',
        normalized: [n],
        dbGames: [db],
        providerRows: 1,
        providerHttpStatus: 200,
        providerCalls: 1,
        unresolvedTeams: 0,
        duplicateGames: 0,
      });

    const pending = mkPlan(
      {
        id: base.gameId,
        season: 2026,
        week: 2,
        homeTeamId: 'alabama',
        awayTeamId: 'auburn',
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
      },
      { ...base, completed: false, homePoints: null, awayPoints: null }
    );
    expect(pending.games[0].action).toBe('pending');
    expect(pending.plannedMutations).toHaveLength(0);

    const update = mkPlan({
      id: base.gameId,
      season: 2026,
      week: 2,
      homeTeamId: 'alabama',
      awayTeamId: 'auburn',
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
    });
    expect(update.games[0].action).toBe('update_to_final');
    expect(update.plannedMutations).toHaveLength(1);

    const inProgress = mkPlan({
      id: base.gameId,
      season: 2026,
      week: 2,
      homeTeamId: 'alabama',
      awayTeamId: 'auburn',
      status: 'in_progress',
      homeScore: null,
      awayScore: null,
    });
    expect(inProgress.games[0].action).toBe('update_to_final');

    const finalizeExisting = mkPlan({
      id: base.gameId,
      season: 2026,
      week: 2,
      homeTeamId: 'alabama',
      awayTeamId: 'auburn',
      status: 'in_progress',
      homeScore: 28,
      awayScore: 21,
    });
    expect(finalizeExisting.games[0].action).toBe('finalize_existing_scores');

    const already = mkPlan({
      id: base.gameId,
      season: 2026,
      week: 2,
      homeTeamId: 'alabama',
      awayTeamId: 'auburn',
      status: 'final',
      homeScore: 28,
      awayScore: 21,
    });
    expect(already.games[0].action).toBe('already_final_same');
    expect(already.plannedMutations).toHaveLength(0);
    expect(commitEligible(already)).toBe(true);

    const conflict = mkPlan({
      id: base.gameId,
      season: 2026,
      week: 2,
      homeTeamId: 'alabama',
      awayTeamId: 'auburn',
      status: 'final',
      homeScore: 35,
      awayScore: 21,
    });
    expect(conflict.writeSafe).toBe(false);
    expect(conflict.games[0].action).toBe('conflict');

    const invalidFinal = mkPlan({
      id: base.gameId,
      season: 2026,
      week: 2,
      homeTeamId: 'alabama',
      awayTeamId: 'auburn',
      status: 'final',
      homeScore: null,
      awayScore: 21,
    });
    expect(invalidFinal.writeSafe).toBe(false);

    const badProvider = mkPlan(
      {
        id: base.gameId,
        season: 2026,
        week: 2,
        homeTeamId: 'alabama',
        awayTeamId: 'auburn',
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
      },
      { ...base, homePoints: null, awayPoints: null }
    );
    expect(badProvider.writeSafe).toBe(false);

    const partial = mkPlan({
      id: base.gameId,
      season: 2026,
      week: 2,
      homeTeamId: 'alabama',
      awayTeamId: 'auburn',
      status: 'scheduled',
      homeScore: 7,
      awayScore: null,
    });
    expect(partial.writeSafe).toBe(false);
  });

  it('provider/DB missing and db-only block', () => {
    const n: NormalizedScoreGame = {
      gameId: '2026-wk2-auburn-alabama',
      season: 2026,
      week: 2,
      homeTeamId: 'alabama',
      awayTeamId: 'auburn',
      homeTeamName: 'Alabama',
      awayTeamName: 'Auburn',
      completed: false,
      homePoints: null,
      awayPoints: null,
    };
    const missingDb = planScoreUpdates({
      season: 2026,
      week: 2,
      mode: 'PREVIEW',
      confirmation: '',
      normalized: [n],
      dbGames: [],
      providerRows: 1,
      providerHttpStatus: 200,
      providerCalls: 1,
      unresolvedTeams: 0,
      duplicateGames: 0,
    });
    expect(missingDb.writeSafe).toBe(false);
    expect(missingDb.counts.missingDbGames).toBe(1);

    const dbOnly = planScoreUpdates({
      season: 2026,
      week: 2,
      mode: 'PREVIEW',
      confirmation: '',
      normalized: [],
      dbGames: [
        {
          id: '2026-wk2-x-y',
          season: 2026,
          week: 2,
          homeTeamId: 'y',
          awayTeamId: 'x',
          status: 'scheduled',
          homeScore: null,
          awayScore: null,
        },
      ],
      providerRows: 0,
      providerHttpStatus: 200,
      providerCalls: 1,
      unresolvedTeams: 0,
      duplicateGames: 0,
    });
    expect(dbOnly.writeSafe).toBe(false);
    expect(dbOnly.counts.dbOnlyGames).toBe(1);
  });

  it('canonical DB identity mismatches and unexpected status block', () => {
    const n: NormalizedScoreGame = {
      gameId: '2026-wk2-auburn-alabama',
      season: 2026,
      week: 2,
      homeTeamId: 'alabama',
      awayTeamId: 'auburn',
      homeTeamName: 'Alabama',
      awayTeamName: 'Auburn',
      completed: true,
      homePoints: 21,
      awayPoints: 14,
    };
    const baseOpts = {
      season: 2026,
      week: 2,
      mode: 'PREVIEW' as const,
      confirmation: '',
      normalized: [n],
      providerRows: 1,
      providerHttpStatus: 200,
      providerCalls: 1,
      unresolvedTeams: 0,
      duplicateGames: 0,
    };

    const wrongHome = planScoreUpdates({
      ...baseOpts,
      dbGames: [
        {
          id: n.gameId,
          season: 2026,
          week: 2,
          homeTeamId: 'wrong-home',
          awayTeamId: 'auburn',
          status: 'scheduled',
          homeScore: null,
          awayScore: null,
        },
      ],
    });
    expect(wrongHome.writeSafe).toBe(false);
    expect(wrongHome.games[0].action).toBe('identity_mismatch');

    const wrongAway = planScoreUpdates({
      ...baseOpts,
      dbGames: [
        {
          id: n.gameId,
          season: 2026,
          week: 2,
          homeTeamId: 'alabama',
          awayTeamId: 'wrong-away',
          status: 'scheduled',
          homeScore: null,
          awayScore: null,
        },
      ],
    });
    expect(wrongAway.writeSafe).toBe(false);
    expect(wrongAway.games[0].action).toBe('identity_mismatch');

    const wrongSeasonWeek = planScoreUpdates({
      ...baseOpts,
      dbGames: [
        {
          id: n.gameId,
          season: 2025,
          week: 3,
          homeTeamId: 'alabama',
          awayTeamId: 'auburn',
          status: 'scheduled',
          homeScore: null,
          awayScore: null,
        },
      ],
    });
    expect(wrongSeasonWeek.writeSafe).toBe(false);
    expect(wrongSeasonWeek.games[0].action).toBe('identity_mismatch');

    const unexpected = planScoreUpdates({
      ...baseOpts,
      dbGames: [
        {
          id: n.gameId,
          season: 2026,
          week: 2,
          homeTeamId: 'alabama',
          awayTeamId: 'auburn',
          status: 'postponed',
          homeScore: null,
          awayScore: null,
        },
      ],
    });
    expect(unexpected.writeSafe).toBe(false);
    expect(unexpected.games[0].action).toBe('unexpected_status');

    const exact = planScoreUpdates({
      ...baseOpts,
      dbGames: [
        {
          id: n.gameId,
          season: 2026,
          week: 2,
          homeTeamId: 'alabama',
          awayTeamId: 'auburn',
          status: 'scheduled',
          homeScore: null,
          awayScore: null,
        },
      ],
    });
    expect(exact.writeSafe).toBe(true);
    expect(exact.games[0].action).toBe('update_to_final');
  });
});

describe('2C-2J-6B transaction + verification', () => {
  const normalized: NormalizedScoreGame[] = [
    {
      gameId: 'g1',
      season: 2026,
      week: 2,
      homeTeamId: 'h',
      awayTeamId: 'a',
      homeTeamName: 'H',
      awayTeamName: 'A',
      completed: true,
      homePoints: 10,
      awayPoints: 7,
    },
    {
      gameId: 'g2',
      season: 2026,
      week: 2,
      homeTeamId: 'h2',
      awayTeamId: 'a2',
      homeTeamName: 'H2',
      awayTeamName: 'A2',
      completed: false,
      homePoints: null,
      awayPoints: null,
    },
  ];

  const baseDb: DbScoreGameRow[] = [
    {
      id: 'g1',
      season: 2026,
      week: 2,
      homeTeamId: 'h',
      awayTeamId: 'a',
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
    },
    {
      id: 'g2',
      season: 2026,
      week: 2,
      homeTeamId: 'h2',
      awayTeamId: 'a2',
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
    },
  ];

  it('updates only score/status; idempotent COMMIT zero mutations; race conflict aborts', async () => {
    const plan = planScoreUpdates({
      season: 2026,
      week: 2,
      mode: 'COMMIT',
      confirmation: 'WRITE_2026_WEEK_2_SCORES',
      normalized,
      dbGames: baseDb,
      providerRows: 2,
      providerHttpStatus: 200,
      providerCalls: 1,
      unresolvedTeams: 0,
      duplicateGames: 0,
    });
    expect(plan.writeSafe).toBe(true);

    const updated: Array<Record<string, unknown>> = [];
    const result = await executeAtomicScoreCommitWithNormalized({
      plan,
      normalized,
      reReadDbGames: async () => baseDb,
      updateGameScores: async (row) => {
        updated.push({ ...row });
      },
    });
    expect(result.updateCount).toBe(1);
    expect(updated).toEqual([
      { gameId: 'g1', homeScore: 10, awayScore: 7, status: 'final' },
    ]);

    const alreadyFinalDb: DbScoreGameRow[] = [
      { ...baseDb[0], status: 'final', homeScore: 10, awayScore: 7 },
      baseDb[1],
    ];
    const idempotentPlan = planScoreUpdates({
      season: 2026,
      week: 2,
      mode: 'COMMIT',
      confirmation: 'WRITE_2026_WEEK_2_SCORES',
      normalized,
      dbGames: alreadyFinalDb,
      providerRows: 2,
      providerHttpStatus: 200,
      providerCalls: 1,
      unresolvedTeams: 0,
      duplicateGames: 0,
    });
    let mut = 0;
    const noop = await executeAtomicScoreCommitWithNormalized({
      plan: idempotentPlan,
      normalized,
      reReadDbGames: async () => alreadyFinalDb,
      updateGameScores: async () => {
        mut += 1;
      },
    });
    expect(noop.updateCount).toBe(0);
    expect(mut).toBe(0);

    await expect(
      executeAtomicScoreCommitWithNormalized({
        plan,
        normalized,
        reReadDbGames: async () => [
          { ...baseDb[0], status: 'final', homeScore: 99, awayScore: 0 },
          baseDb[1],
        ],
        updateGameScores: async () => {
          throw new Error('should not mutate');
        },
      })
    ).rejects.toThrow(/transaction aborted/);
  });

  it('post-write verification catches wrong score, accidental finalize, identity drift', () => {
    const afterOk: DbScoreGameRow[] = [
      {
        id: 'g1',
        season: 2026,
        week: 2,
        homeTeamId: 'h',
        awayTeamId: 'a',
        status: 'final',
        homeScore: 10,
        awayScore: 7,
      },
      baseDb[1],
    ];
    const ok = verifyScorePostWrite({
      normalized,
      dbGamesBefore: baseDb,
      dbGamesAfter: afterOk,
    });
    expect(ok.ok).toBe(true);

    const wrong = verifyScorePostWrite({
      normalized,
      dbGamesBefore: baseDb,
      dbGamesAfter: [
        {
          id: 'g1',
          season: 2026,
          week: 2,
          homeTeamId: 'h',
          awayTeamId: 'a',
          status: 'final',
          homeScore: 11,
          awayScore: 7,
        },
        baseDb[1],
      ],
    });
    expect(wrong.ok).toBe(false);

    // Incomplete g2 was never planned; still catch accidental finalization via before/after.
    const accidental = verifyScorePostWrite({
      normalized,
      dbGamesBefore: baseDb,
      dbGamesAfter: [
        {
          id: 'g1',
          season: 2026,
          week: 2,
          homeTeamId: 'h',
          awayTeamId: 'a',
          status: 'final',
          homeScore: 10,
          awayScore: 7,
        },
        {
          id: 'g2',
          season: 2026,
          week: 2,
          homeTeamId: 'h2',
          awayTeamId: 'a2',
          status: 'final',
          homeScore: 1,
          awayScore: 0,
        },
      ],
    });
    expect(accidental.ok).toBe(false);
    expect(
      accidental.reasons.some((r) => /incomplete provider game was finalized/i.test(r))
    ).toBe(true);

    const countChange = verifyScorePostWrite({
      normalized,
      dbGamesBefore: baseDb,
      dbGamesAfter: [
        {
          id: 'g1',
          season: 2026,
          week: 2,
          homeTeamId: 'h',
          awayTeamId: 'a',
          status: 'final',
          homeScore: 10,
          awayScore: 7,
        },
      ],
    });
    expect(countChange.ok).toBe(false);
    expect(countChange.reasons.some((r) => /count changed|ID set changed/i.test(r))).toBe(
      true
    );

    const fkDrift = verifyScorePostWrite({
      normalized,
      dbGamesBefore: baseDb,
      dbGamesAfter: [
        {
          id: 'g1',
          season: 2026,
          week: 2,
          homeTeamId: 'hacked',
          awayTeamId: 'a',
          status: 'final',
          homeScore: 10,
          awayScore: 7,
        },
        baseDb[1],
      ],
    });
    expect(fkDrift.ok).toBe(false);
    expect(fkDrift.reasons.some((r) => /homeTeamId changed/i.test(r))).toBe(true);

    // Already-final + provider incomplete: leave alone (do not unfinalize).
    const alreadyFinalIncomplete: NormalizedScoreGame[] = [
      normalized[0],
      { ...normalized[1], completed: false },
    ];
    const beforeFinalG2: DbScoreGameRow[] = [
      afterOk[0],
      {
        ...baseDb[1],
        status: 'final',
        homeScore: 3,
        awayScore: 0,
      },
    ];
    const leaveAlone = verifyScorePostWrite({
      normalized: alreadyFinalIncomplete,
      dbGamesBefore: beforeFinalG2,
      dbGamesAfter: beforeFinalG2,
    });
    expect(leaveAlone.ok).toBe(true);
  });

  it('mid-transaction failure audits mutation attempts; no success verification', async () => {
    const twoComplete: NormalizedScoreGame[] = [
      {
        gameId: 'g1',
        season: 2026,
        week: 2,
        homeTeamId: 'h',
        awayTeamId: 'a',
        homeTeamName: 'H',
        awayTeamName: 'A',
        completed: true,
        homePoints: 10,
        awayPoints: 7,
      },
      {
        gameId: 'g2',
        season: 2026,
        week: 2,
        homeTeamId: 'h2',
        awayTeamId: 'a2',
        homeTeamName: 'H2',
        awayTeamName: 'A2',
        completed: true,
        homePoints: 20,
        awayPoints: 17,
      },
    ];
    const twoDb: DbScoreGameRow[] = [
      {
        id: 'g1',
        season: 2026,
        week: 2,
        homeTeamId: 'h',
        awayTeamId: 'a',
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
      },
      {
        id: 'g2',
        season: 2026,
        week: 2,
        homeTeamId: 'h2',
        awayTeamId: 'a2',
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
      },
    ];
    const plan = planScoreUpdates({
      season: 2026,
      week: 2,
      mode: 'COMMIT',
      confirmation: 'WRITE_2026_WEEK_2_SCORES',
      normalized: twoComplete,
      dbGames: twoDb,
      providerRows: 2,
      providerHttpStatus: 200,
      providerCalls: 1,
      unresolvedTeams: 0,
      duplicateGames: 0,
    });
    expect(plan.plannedMutations.length).toBeGreaterThanOrEqual(2);

    let txMutationAttempts = 0;
    await expect(
      executeAtomicScoreCommitWithNormalized({
        plan,
        normalized: twoComplete,
        reReadDbGames: async () => twoDb,
        updateGameScores: async () => {
          txMutationAttempts += 1;
          if (txMutationAttempts >= 2) {
            throw new Error('simulated mid-transaction failure');
          }
        },
      })
    ).rejects.toThrow(/simulated mid-transaction failure/);

    expect(txMutationAttempts).toBe(2);

    const execution = buildRolledBackScoreExecution({
      providerCalls: 1,
      gameMutationAttempts: txMutationAttempts,
      error: 'simulated mid-transaction failure',
    });
    expect(execution.gameMutationsInvoked).toBe(true);
    expect(execution.gameUpdateCount).toBeNull();
    expect(execution.gameMutationAttempts).toBe(2);
    expect(execution.commitSucceeded).toBe(false);
    expect(execution.postWriteVerificationSucceeded).toBeNull();
  });
});
