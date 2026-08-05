/**
 * Mocked tests for Phase 2C-1B one-week schedule WRITE path.
 * No network. No production DB.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  assertProviderWeeksMatch,
  buildWriteConfirmPhrase,
  compareToExistingDb,
  findProtectedUpdateTargets,
  parseWriteScheduleArgs,
  validateNormalizedBatch,
  verifyPostWriteSchedule,
  writeValidatedScheduleBatch,
  type CfbdProviderGame,
  type DbGameRow,
  type NormalizedScheduleGame,
  type ScheduleWriteDeps,
} from '../src/preseason/cfbd-schedule-ingest';

function baseGame(
  overrides: Partial<NormalizedScheduleGame> = {}
): NormalizedScheduleGame {
  return {
    id: '2026-wk1-clemson-georgia',
    season: 2026,
    week: 1,
    homeTeamId: 'georgia',
    awayTeamId: 'clemson',
    date: new Date('2026-08-29T16:00:00.000Z'),
    rawKickoff: '2026-08-29T16:00:00.000Z',
    providerWeek: 1,
    venue: 'Sanford Stadium',
    city: 'Athens',
    neutralSite: false,
    conferenceGame: false,
    providerHomeName: 'Georgia',
    providerAwayName: 'Clemson',
    ...overrides,
  };
}

function makeDeps(options?: {
  existing?: DbGameRow[];
  failTransaction?: boolean;
}): {
  deps: ScheduleWriteDeps;
  mutations: string[];
} {
  const mutations: string[] = [];
  let existing = [...(options?.existing ?? [])];
  const deps: ScheduleWriteDeps = {
    async loadExistingForWeek() {
      return [...existing];
    },
    async createMany(rows) {
      mutations.push('createMany');
      for (const row of rows) {
        const r = row as { id: string };
        existing.push({
          id: r.id,
          season: 2026,
          week: 1,
          homeTeamId: 'georgia',
          awayTeamId: 'clemson',
          date: new Date('2026-08-29T16:00:00.000Z'),
          homeScore: null,
          awayScore: null,
          status: 'scheduled',
        });
      }
      return rows.length;
    },
    async updateScheduleFields(id) {
      mutations.push(`update:${id}`);
    },
    async transaction(fn) {
      if (options?.failTransaction) {
        throw new Error('transaction failed');
      }
      if (typeof (deps as { transaction?: unknown }).transaction !== 'function') {
        throw new Error('unreachable');
      }
      return fn();
    },
  };
  return { deps, mutations };
}

describe('phase 2C-1B write schedule args', () => {
  it('accepts season 2026 / week 1 / exact phrase', () => {
    const r = parseWriteScheduleArgs([
      '--season',
      '2026',
      '--week',
      '1',
      '--confirm-write',
      'WRITE_2026_WEEK_1',
    ]);
    expect(r.ok).toBe(true);
    expect(r.args).toEqual({
      season: 2026,
      week: 1,
      confirmWrite: 'WRITE_2026_WEEK_1',
    });
  });

  it('accepts season 2026 / week 2 / exact phrase', () => {
    const r = parseWriteScheduleArgs([
      '--season',
      '2026',
      '--week',
      '2',
      '--confirm-write',
      buildWriteConfirmPhrase(2),
    ]);
    expect(r.ok).toBe(true);
  });

  it('rejects wrong week in phrase', () => {
    const r = parseWriteScheduleArgs([
      '--season',
      '2026',
      '--week',
      '1',
      '--confirm-write',
      'WRITE_2026_WEEK_2',
    ]);
    expect(r.ok).toBe(false);
  });

  it('rejects lowercase phrase', () => {
    const r = parseWriteScheduleArgs([
      '--season',
      '2026',
      '--week',
      '1',
      '--confirm-write',
      'write_2026_week_1',
    ]);
    expect(r.ok).toBe(false);
  });

  it('rejects missing phrase', () => {
    const r = parseWriteScheduleArgs(['--season', '2026', '--week', '1']);
    expect(r.ok).toBe(false);
  });

  it('rejects week 0', () => {
    const r = parseWriteScheduleArgs([
      '--season',
      '2026',
      '--week',
      '0',
      '--confirm-write',
      'WRITE_2026_WEEK_0',
    ]);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/week 0 is prohibited/i);
  });

  it('rejects comma list and range and --weeks', () => {
    expect(
      parseWriteScheduleArgs([
        '--season',
        '2026',
        '--week',
        '1,2',
        '--confirm-write',
        'WRITE_2026_WEEK_1',
      ]).ok
    ).toBe(false);
    expect(
      parseWriteScheduleArgs([
        '--season',
        '2026',
        '--week',
        '1-2',
        '--confirm-write',
        'WRITE_2026_WEEK_1',
      ]).ok
    ).toBe(false);
    expect(
      parseWriteScheduleArgs([
        '--season',
        '2026',
        '--weeks',
        '1',
        '--confirm-write',
        'WRITE_2026_WEEK_1',
      ]).ok
    ).toBe(false);
  });

  it('environment variable cannot bypass confirmation', () => {
    const prev = process.env.SCHEDULE_ALLOW_WRITE;
    process.env.SCHEDULE_ALLOW_WRITE = '1';
    try {
      const r = parseWriteScheduleArgs(['--season', '2026', '--week', '1']);
      expect(r.ok).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.SCHEDULE_ALLOW_WRITE;
      else process.env.SCHEDULE_ALLOW_WRITE = prev;
    }
  });
});

describe('phase 2C-1B validation gates', () => {
  it('unexpected provider week aborts', () => {
    const games: CfbdProviderGame[] = [
      {
        season: 2026,
        week: 2,
        homeTeam: 'A',
        awayTeam: 'B',
        homeClassification: 'fbs',
        awayClassification: 'fbs',
      },
    ];
    const issues = assertProviderWeeksMatch(games, 1);
    expect(issues.some((i) => i.code === 'unexpected_provider_week')).toBe(true);
  });

  it('empty FBS batch aborts', () => {
    expect(validateNormalizedBatch([], 2026, 1).ok).toBe(false);
  });

  it('duplicate ID aborts', () => {
    const g = baseGame();
    expect(validateNormalizedBatch([g, { ...g }], 2026, 1).ok).toBe(false);
  });

  it('validation failure causes zero mutations', async () => {
    const { deps, mutations } = makeDeps();
    await expect(
      writeValidatedScheduleBatch([], deps, { season: 2026, week: 1 })
    ).rejects.toThrow(/refused/);
    expect(mutations).toEqual([]);
  });

  it('protected scored games refuse update', () => {
    const protectedRows = findProtectedUpdateTargets(
      ['2026-wk1-clemson-georgia'],
      [
        {
          id: '2026-wk1-clemson-georgia',
          season: 2026,
          week: 1,
          homeTeamId: 'georgia',
          awayTeamId: 'clemson',
          date: new Date(),
          homeScore: 21,
          awayScore: 14,
          status: 'final',
        },
      ]
    );
    expect(protectedRows).toHaveLength(1);
  });
});

describe('phase 2C-1B transactions', () => {
  it('transaction unavailable causes zero writes', async () => {
    const mutations: string[] = [];
    await expect(
      writeValidatedScheduleBatch(
        [baseGame()],
        {
          async createMany() {
            mutations.push('createMany');
            return 1;
          },
          async updateScheduleFields() {
            mutations.push('update');
          },
          async loadExistingForWeek() {
            return [];
          },
        } as never,
        { season: 2026, week: 1 }
      )
    ).rejects.toThrow(/requires deps\.transaction/);
    expect(mutations).toEqual([]);
  });

  it('insert only missing IDs and update only existing', async () => {
    const existingGame = baseGame();
    const newGame = baseGame({
      id: '2026-wk1-alabama-auburn',
      homeTeamId: 'auburn',
      awayTeamId: 'alabama',
      providerHomeName: 'Auburn',
      providerAwayName: 'Alabama',
    });
    const { deps, mutations } = makeDeps({
      existing: [
        {
          id: existingGame.id,
          season: 2026,
          week: 1,
          homeTeamId: 'georgia',
          awayTeamId: 'clemson',
          date: existingGame.date,
          homeScore: null,
          awayScore: null,
          status: 'scheduled',
        },
      ],
    });
    const result = await writeValidatedScheduleBatch(
      [existingGame, newGame],
      deps,
      { season: 2026, week: 1 }
    );
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.insertedIds).toEqual([newGame.id]);
    expect(result.updatedIds).toEqual([existingGame.id]);
    expect(mutations).toContain('createMany');
    expect(mutations).toContain(`update:${existingGame.id}`);
  });

  it('transaction failure rolls back mocked operation', async () => {
    const { deps, mutations } = makeDeps({ failTransaction: true });
    await expect(
      writeValidatedScheduleBatch([baseGame()], deps, { season: 2026, week: 1 })
    ).rejects.toThrow(/transaction failed/);
    expect(mutations).toEqual([]);
  });

  it('refuses protected updates inside write helper', async () => {
    const game = baseGame();
    const { deps, mutations } = makeDeps({
      existing: [
        {
          id: game.id,
          season: 2026,
          week: 1,
          homeTeamId: 'georgia',
          awayTeamId: 'clemson',
          date: game.date,
          homeScore: 10,
          awayScore: 7,
          status: 'final',
        },
      ],
    });
    await expect(
      writeValidatedScheduleBatch([game], deps, { season: 2026, week: 1 })
    ).rejects.toThrow(/protected games/);
    expect(mutations).toEqual([]);
  });

  it('DB-only rows never deleted and 2025 never targeted', async () => {
    const game = baseGame();
    const { deps } = makeDeps({
      existing: [
        {
          id: '2026-wk1-extra-only',
          season: 2026,
          week: 1,
          homeTeamId: 'a',
          awayTeamId: 'b',
          date: game.date,
          homeScore: null,
          awayScore: null,
          status: 'scheduled',
        },
      ],
    });
    const result = await writeValidatedScheduleBatch([game], deps, {
      season: 2026,
      week: 1,
    });
    expect(result.dbOnlyIds).toEqual(['2026-wk1-extra-only']);
    expect(result.insertedIds.every((id) => id.startsWith('2026-'))).toBe(true);
    const cmp = compareToExistingDb(
      [game],
      [
        {
          id: '2025-wk1-clemson-georgia',
          season: 2025,
          week: 1,
          homeTeamId: 'georgia',
          awayTeamId: 'clemson',
          date: game.date,
          homeScore: null,
          awayScore: null,
          status: 'scheduled',
        },
      ]
    );
    // compare is week-scoped by caller; 2025 id is unrelated identity
    expect(cmp.wouldInsertIds).toContain(game.id);
  });
});

describe('phase 2C-1B post-write verification', () => {
  it('matching result passes', () => {
    const game = baseGame();
    const writeResult = {
      inserted: 1,
      updated: 0,
      insertedIds: [game.id],
      updatedIds: [],
      dbOnlyIds: [],
    };
    const v = verifyPostWriteSchedule({
      season: 2026,
      week: 1,
      normalized: [game],
      writeResult,
      actualRows: [
        {
          id: game.id,
          season: 2026,
          week: 1,
          homeTeamId: 'georgia',
          awayTeamId: 'clemson',
          date: game.date,
          homeScore: null,
          awayScore: null,
          status: 'scheduled',
        },
      ],
      preWriteComparison: {
        existingCount: 0,
        existingIds: [],
        wouldInsertIds: [game.id],
        wouldUpdateIds: [],
        dbOnlyIds: [],
      },
    });
    expect(v.ok).toBe(true);
  });

  it('missing expected ID fails', () => {
    const game = baseGame();
    const v = verifyPostWriteSchedule({
      season: 2026,
      week: 1,
      normalized: [game],
      writeResult: {
        inserted: 1,
        updated: 0,
        insertedIds: [game.id],
        updatedIds: [],
        dbOnlyIds: [],
      },
      actualRows: [],
      preWriteComparison: {
        existingCount: 0,
        existingIds: [],
        wouldInsertIds: [game.id],
        wouldUpdateIds: [],
        dbOnlyIds: [],
      },
    });
    expect(v.ok).toBe(false);
    expect(v.missingExpectedIds).toEqual([game.id]);
  });

  it('incorrect counts fail', () => {
    const game = baseGame();
    const v = verifyPostWriteSchedule({
      season: 2026,
      week: 1,
      normalized: [game],
      writeResult: {
        inserted: 0,
        updated: 0,
        insertedIds: [],
        updatedIds: [],
        dbOnlyIds: [],
      },
      actualRows: [
        {
          id: game.id,
          season: 2026,
          week: 1,
          homeTeamId: 'georgia',
          awayTeamId: 'clemson',
          date: game.date,
          homeScore: null,
          awayScore: null,
          status: 'scheduled',
        },
      ],
      preWriteComparison: {
        existingCount: 0,
        existingIds: [],
        wouldInsertIds: [game.id],
        wouldUpdateIds: [],
        dbOnlyIds: [],
      },
    });
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.code === 'insert_count_conflict')).toBe(true);
  });
});

describe('phase 2C-1B isolation', () => {
  it('write CLI does not import ratings or monolithic ingest', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../write-schedules.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/from ['"].*seed-ratings/);
    expect(src).not.toMatch(/runRatings/);
    expect(src).not.toMatch(/from ['"]\.\/ingest['"]/);
    expect(src).not.toMatch(/from ['"].*OddsApi/);
    expect(src).not.toMatch(/from ['"].*\/mock/);
    expect(src).toMatch(/writeValidatedScheduleBatch/);
  });

  it('preview CLI remains free of write helper calls', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../ingest-schedules.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/writeValidatedScheduleBatch\s*\(/);
  });
});

describe('ingest-2026-schedules workflow static safety', () => {
  const text = fs.readFileSync(
    path.join(process.cwd(), '.github/workflows/ingest-2026-schedules.yml'),
    'utf8'
  );

  it('is workflow_dispatch only with read contents permission', () => {
    expect(text).toMatch(/workflow_dispatch:/);
    expect(text).not.toMatch(/^\s*schedule:/m);
    expect(text).not.toMatch(/^\s*push:/m);
    expect(text).not.toMatch(/^\s*pull_request:/m);
    expect(text).toMatch(/permissions:\s*\n\s*contents:\s*read/);
  });

  it('uses checkout/setup-node v6 and Node 20', () => {
    expect(text).toMatch(/actions\/checkout@v6/);
    expect(text).toMatch(/actions\/setup-node@v6/);
    expect(text).toMatch(/node-version:\s*'20'/);
  });

  it('defaults and confirmation', () => {
    expect(text).toMatch(/default:\s*'2026'/);
    expect(text).toMatch(/default:\s*'1'/);
    expect(text).toMatch(/confirm_write:/);
    expect(text).toMatch(/WRITE_2026_WEEK_/);
    expect(text).toMatch(/week 0 is prohibited/);
  });

  it('runs dedicated write CLI only', () => {
    expect(text).toMatch(/apps\/jobs\/write-schedules\.ts/);
    expect(text).not.toMatch(/apps\/jobs\/dist\/ingest\.js/);
    expect(text).not.toMatch(/ingest-schedules\.ts/);
    expect(text).not.toMatch(/seed-ratings|ratings:v|oddsapi/i);
    expect(text).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(text).not.toMatch(/prisma migrate|ingest-simple\.js\s+mock/);
    expect(text).not.toMatch(/grade-bets|sync-hybrid-bets/);
  });
});
