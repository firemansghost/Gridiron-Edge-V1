/**
 * Guarded 2026 CFBD schedule rollover — mocked provider, no network, no DB.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  EXPECTED_2026_FBS_COUNT,
  buildPrePlanFailureReport,
  buildPreviewExecution,
  buildRolledBackExecution,
  buildSuccessfulCommitExecution,
  commitEligible,
  executeAtomicScheduleRolloverCommit,
  expectedScheduleRolloverConfirmation,
  fetchGuardedCfbdScheduleWeek,
  finalizeScheduleRolloverReport,
  parseScheduleRolloverCliArgs,
  planFingerprint,
  planScheduleRollover,
  verifyScheduleRolloverPostWrite,
  type DbScheduleGameRow,
  type ScheduleRolloverPlan,
} from '../src/preseason/cfbd-schedule-rollover-2026';
import {
  buildGameId,
  type CfbdProviderGame,
  type TeamResolutionResult,
} from '../src/preseason/cfbd-schedule-ingest';
import { runGuardedScheduleRollover } from '../write-cfbd-schedules-2026';

const WEEK = 2;
const KICKOFF = '2026-09-12T16:00:00.000Z';
const HOME_ID = 'georgia';
const AWAY_ID = 'clemson';
const GAME_ID = buildGameId(2026, WEEK, AWAY_ID, HOME_ID);

function buildFbsIds(...required: string[]): string[] {
  const ids = [...required];
  for (let i = 0; ids.length < EXPECTED_2026_FBS_COUNT; i++) {
    const pad = `fbs-pad-${i}`;
    if (!ids.includes(pad)) ids.push(pad);
  }
  return ids.slice(0, EXPECTED_2026_FBS_COUNT);
}

function resolved(name: string, id: string): TeamResolutionResult {
  return {
    providerName: name,
    slugCandidate: name.toLowerCase(),
    kind: 'exact_canonical',
    resolvedId: id,
  };
}

function unresolved(name: string): TeamResolutionResult {
  return {
    providerName: name,
    slugCandidate: name.toLowerCase(),
    kind: 'missing',
    resolvedId: null,
    detail: 'not found',
  };
}

function providerGame(
  overrides: Partial<CfbdProviderGame> = {}
): CfbdProviderGame {
  return {
    season: 2026,
    week: WEEK,
    homeTeam: 'Georgia',
    awayTeam: 'Clemson',
    homeClassification: 'fbs',
    awayClassification: 'fbs',
    startDate: KICKOFF,
    venue: 'Sanford Stadium',
    neutralSite: false,
    conferenceGame: false,
    ...overrides,
  };
}

function resolutions(): Map<string, TeamResolutionResult> {
  return new Map([
    ['Georgia', resolved('Georgia', HOME_ID)],
    ['Clemson', resolved('Clemson', AWAY_ID)],
  ]);
}

function dbRow(
  overrides: Partial<DbScheduleGameRow> = {}
): DbScheduleGameRow {
  return {
    id: GAME_ID,
    season: 2026,
    week: WEEK,
    homeTeamId: HOME_ID,
    awayTeamId: AWAY_ID,
    date: new Date(KICKOFF),
    venue: 'Sanford Stadium',
    city: 'Athens',
    neutralSite: false,
    conferenceGame: false,
    homeScore: null,
    awayScore: null,
    status: 'scheduled',
    ...overrides,
  };
}

function basePlan(
  overrides: Partial<Parameters<typeof planScheduleRollover>[0]> = {}
): ScheduleRolloverPlan {
  return planScheduleRollover({
    season: 2026,
    week: WEEK,
    mode: 'PREVIEW',
    confirmation: '',
    providerGames: [providerGame()],
    venueCityByName: new Map([['sanford stadium', 'Athens']]),
    providerHttpStatus: 200,
    providerVenueHttpStatus: 200,
    providerCalls: 2,
    fbsTeamIds: buildFbsIds(HOME_ID, AWAY_ID),
    existingGames: [],
    teamResolutions: resolutions(),
    generatedAt: '2026-09-03T00:00:00.000Z',
    ...overrides,
  });
}

describe('cfbd-schedule-rollover-2026 args / confirmation', () => {
  it('defaults PREVIEW and accepts season 2026', () => {
    const r = parseScheduleRolloverCliArgs([
      '--season',
      '2026',
      '--week',
      '2',
    ]);
    expect(r.ok).toBe(true);
    expect(r.args?.mode).toBe('PREVIEW');
    expect(r.args?.confirmation).toBe('');
  });

  it('rejects week 0, current, and ranges', () => {
    expect(
      parseScheduleRolloverCliArgs(['--season', '2026', '--week', '0']).ok
    ).toBe(false);
    expect(
      parseScheduleRolloverCliArgs(['--season', '2026', '--week', 'current']).ok
    ).toBe(false);
    expect(
      parseScheduleRolloverCliArgs(['--season', '2026', '--week', '1-2']).ok
    ).toBe(false);
  });

  it('requires exact dynamic COMMIT confirmation', () => {
    expect(expectedScheduleRolloverConfirmation(2)).toBe(
      'WRITE_2026_WEEK_2_SCHEDULES'
    );
    expect(
      parseScheduleRolloverCliArgs([
        '--season',
        '2026',
        '--week',
        '2',
        '--mode',
        'COMMIT',
        '--confirm',
        'WRITE_2026_WEEK_2',
      ]).ok
    ).toBe(false);
    expect(
      parseScheduleRolloverCliArgs([
        '--season',
        '2026',
        '--week',
        '2',
        '--mode',
        'COMMIT',
        '--confirm',
        'WRITE_2026_WEEK_1_SCHEDULES',
      ]).ok
    ).toBe(false);
    expect(
      parseScheduleRolloverCliArgs([
        '--season',
        '2026',
        '--week',
        '2',
        '--mode',
        'COMMIT',
        '--confirm',
        'WRITE_2026_WEEK_2_SCHEDULES',
      ]).ok
    ).toBe(true);
  });
});

describe('cfbd-schedule-rollover-2026 provider fetch (mocked)', () => {
  it('HTTP failure and invalid JSON fail closed', async () => {
    await expect(
      fetchGuardedCfbdScheduleWeek({
        season: 2026,
        week: 2,
        apiKey: 'test-key',
        fetchImpl: (async () =>
          ({
            ok: false,
            status: 503,
            json: async () => [],
          }) as unknown as Response) as typeof fetch,
      })
    ).rejects.toThrow(/HTTP 503/);

    await expect(
      fetchGuardedCfbdScheduleWeek({
        season: 2026,
        week: 2,
        apiKey: 'test-key',
        fetchImpl: (async () =>
          ({
            ok: true,
            status: 200,
            json: async () => {
              throw new Error('bad json');
            },
          }) as unknown as Response) as typeof fetch,
      })
    ).rejects.toThrow(/not valid JSON/);
  });

  it('reports games + optional venues providerCalls without throwing on venue miss', async () => {
    const urls: string[] = [];
    const result = await fetchGuardedCfbdScheduleWeek({
      season: 2026,
      week: 2,
      apiKey: 'test-key',
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url.includes('/venues')) {
          return {
            ok: false,
            status: 404,
            json: async () => ({}),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => [providerGame()],
        } as unknown as Response;
      }) as typeof fetch,
    });
    expect(result.providerCalls).toBe(2);
    expect(result.providerAttempts).toBe(2);
    expect(result.providerHttpStatus).toBe(200);
    expect(result.providerVenueHttpStatus).toBe(404);
    expect(result.games).toHaveLength(1);
    expect(urls.some((u) => u.includes('seasonType=regular'))).toBe(true);
    expect(urls.some((u) => u.includes('division=fbs'))).toBe(true);
    expect(urls.some((u) => u.includes('week=2'))).toBe(true);
  });

  it('counts a thrown /venues attempt and continues without enrichment', async () => {
    const result = await fetchGuardedCfbdScheduleWeek({
      season: 2026,
      week: 2,
      apiKey: 'test-key',
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/venues')) {
          throw new Error('socket hang up');
        }
        return {
          ok: true,
          status: 200,
          json: async () => [providerGame()],
        } as unknown as Response;
      }) as typeof fetch,
    });
    expect(result.providerAttempts).toBe(2);
    expect(result.providerCalls).toBe(2);
    expect(result.providerHttpStatus).toBe(200);
    expect(result.providerVenueHttpStatus).toBeNull();
    expect(result.venueCityByName.size).toBe(0);
    expect(result.games).toHaveLength(1);
    const plan = planScheduleRollover({
      season: 2026,
      week: WEEK,
      mode: 'PREVIEW',
      confirmation: '',
      providerGames: result.games,
      venueCityByName: result.venueCityByName,
      providerHttpStatus: result.providerHttpStatus,
      providerVenueHttpStatus: result.providerVenueHttpStatus,
      providerCalls: result.providerCalls,
      providerAttempts: result.providerAttempts,
      fbsTeamIds: buildFbsIds(HOME_ID, AWAY_ID),
      existingGames: [],
      teamResolutions: resolutions(),
    });
    expect(plan.normalizedFbsVsFbsCount).toBe(1);
    expect(plan.providerAttempts).toBe(2);
  });
});

describe('cfbd-schedule-rollover-2026 planning gates', () => {
  it('PREVIEW is write-safe for a missing canonical game and records zero mutations', () => {
    const plan = basePlan();
    expect(plan.writeSafe).toBe(true);
    expect(plan.proposedCreates).toBe(1);
    expect(plan.proposedMetadataUpdates).toBe(0);
    expect(plan.mutationsInvoked).toBe(false);
    expect(plan.authoritativeFbsCount).toBe(138);
    expect(plan.normalizedFbsVsFbsCount).toBe(1);
    expect(commitEligible(plan)).toBe(false);
    const exec = buildPreviewExecution(plan.providerCalls);
    expect(exec.mutationsInvoked).toBe(false);
    expect(exec.commitAttempted).toBe(false);
    expect(exec.transactionStarted).toBe(false);
  });

  it('requires exactly 138 distinct FBS membership IDs', () => {
    const short = basePlan({
      fbsTeamIds: buildFbsIds(HOME_ID, AWAY_ID).slice(0, 137),
    });
    expect(short.writeSafe).toBe(false);
    expect(
      short.blockers.some((b) => b.includes('138'))
    ).toBe(true);

    const dups = buildFbsIds(HOME_ID, AWAY_ID).slice(0, 137);
    dups.push(HOME_ID);
    const dupPlan = basePlan({ fbsTeamIds: dups });
    expect(dupPlan.writeSafe).toBe(false);
    expect(dupPlan.blockers.some((b) => /duplicate FBS membership/i.test(b))).toBe(
      true
    );
  });

  it('wrong provider week blocks', () => {
    const plan = basePlan({
      providerGames: [providerGame({ week: 1 })],
    });
    expect(plan.writeSafe).toBe(false);
    expect(plan.blockers.some((b) => /unexpected_provider_week/.test(b))).toBe(
      true
    );
  });

  it('unresolved FBS team blocks', () => {
    const plan = basePlan({
      teamResolutions: new Map([
        ['Georgia', unresolved('Georgia')],
        ['Clemson', resolved('Clemson', AWAY_ID)],
      ]),
    });
    expect(plan.writeSafe).toBe(false);
    expect(plan.blockers.some((b) => /unresolved or ambiguous FBS team/.test(b))).toBe(
      true
    );
  });

  it('non-authoritative resolved team blocks (no silent non-FBS)', () => {
    const plan = basePlan({
      fbsTeamIds: buildFbsIds(AWAY_ID),
      teamResolutions: resolutions(),
    });
    expect(plan.writeSafe).toBe(false);
    expect(plan.blockers.some((b) => /non-authoritative FBS mapping/.test(b))).toBe(
      true
    );
  });

  it('empty provider games block', () => {
    const plan = basePlan({ providerGames: [] });
    expect(plan.writeSafe).toBe(false);
    expect(plan.blockers.some((b) => /empty provider games/.test(b))).toBe(true);
  });

  it('DB-only row blocks COMMIT and is not auto-deleted', () => {
    const plan = basePlan({
      mode: 'COMMIT',
      confirmation: expectedScheduleRolloverConfirmation(WEEK),
      existingGames: [
        dbRow(),
        dbRow({
          id: '2026-wk2-stale-orphan',
          homeTeamId: 'alabama',
          awayTeamId: 'auburn',
        }),
      ],
    });
    expect(plan.writeSafe).toBe(false);
    expect(plan.dbOnlyRowCount).toBe(1);
    expect(plan.blockers.some((b) => /DB-only Game rows absent from provider/.test(b))).toBe(
      true
    );
    expect(commitEligible(plan)).toBe(false);
  });

  it('protected/scored game blocks metadata update', () => {
    const plan = basePlan({
      existingGames: [
        dbRow({
          venue: 'Old Venue',
          homeScore: 24,
          awayScore: 17,
          status: 'final',
        }),
      ],
    });
    expect(plan.writeSafe).toBe(false);
    expect(
      plan.blockers.some((b) => /protected\/scored game blocks metadata update/.test(b))
    ).toBe(true);
    expect(plan.proposedMetadataUpdates).toBe(0);
  });

  it('skipped non-FBS rows are counted and do not write', () => {
    const plan = basePlan({
      providerGames: [
        providerGame(),
        providerGame({
          homeTeam: 'Montana',
          awayTeam: 'Idaho',
          homeClassification: 'fcs',
          awayClassification: 'fcs',
        }),
      ],
    });
    expect(plan.skippedNonFbsCount).toBe(1);
    expect(plan.normalizedFbsVsFbsCount).toBe(1);
  });
});

describe('cfbd-schedule-rollover-2026 mutation plan', () => {
  it('successful create path is planned when the canonical row is missing', () => {
    const plan = basePlan({
      mode: 'COMMIT',
      confirmation: expectedScheduleRolloverConfirmation(WEEK),
    });
    expect(plan.writeSafe).toBe(true);
    expect(plan.proposedCreates).toBe(1);
    expect(plan.plannedCreateIds).toEqual([GAME_ID]);
    expect(commitEligible(plan)).toBe(true);
  });

  it('successful metadata-update path updates only allowed fields', () => {
    const plan = basePlan({
      mode: 'COMMIT',
      confirmation: expectedScheduleRolloverConfirmation(WEEK),
      existingGames: [dbRow({ venue: 'Old Stadium', city: 'Old City' })],
    });
    expect(plan.writeSafe).toBe(true);
    expect(plan.proposedCreates).toBe(0);
    expect(plan.proposedMetadataUpdates).toBe(1);
    expect(plan.plannedUpdates[0].fields).toEqual({
      date: new Date(KICKOFF),
      venue: 'Sanford Stadium',
      city: 'Athens',
      neutralSite: false,
      conferenceGame: false,
    });
  });

  it('idempotent rerun produces zero creates/updates', () => {
    const plan = basePlan({
      mode: 'COMMIT',
      confirmation: expectedScheduleRolloverConfirmation(WEEK),
      existingGames: [dbRow()],
    });
    expect(plan.writeSafe).toBe(true);
    expect(plan.proposedCreates).toBe(0);
    expect(plan.proposedMetadataUpdates).toBe(0);
    expect(plan.unchangedRows).toBe(1);
  });
});

describe('cfbd-schedule-rollover-2026 atomic COMMIT', () => {
  it('successful create uses callbacks then verifies', async () => {
    const plan = basePlan({
      mode: 'COMMIT',
      confirmation: expectedScheduleRolloverConfirmation(WEEK),
    });
    let rows: DbScheduleGameRow[] = [];
    const created: string[] = [];
    const updated: string[] = [];
    const result = await executeAtomicScheduleRolloverCommit({
      plan,
      providerGames: [providerGame()],
      venueCityByName: new Map([['sanford stadium', 'Athens']]),
      teamResolutions: resolutions(),
      reReadFbsTeamIds: async () => buildFbsIds(HOME_ID, AWAY_ID),
      reReadGames: async () => [...rows],
      createRow: async (row) => {
        created.push(row.row.id);
        rows = [
          ...rows,
          dbRow({
            id: row.row.id,
            homeTeamId: row.row.homeTeamId,
            awayTeamId: row.row.awayTeamId,
            date: row.row.date,
            venue: row.row.venue,
            city: row.row.city,
            neutralSite: row.row.neutralSite,
            conferenceGame: row.row.conferenceGame,
            status: 'scheduled',
            homeScore: null,
            awayScore: null,
          }),
        ];
      },
      updateRow: async (row) => {
        updated.push(row.id);
      },
    });
    expect(created).toEqual([GAME_ID]);
    expect(updated).toEqual([]);
    expect(result.createCount).toBe(1);
    expect(result.updateCount).toBe(0);
    expect(result.verification.ok).toBe(true);
  });

  it('successful metadata-update path', async () => {
    const existing = dbRow({ venue: 'Old Stadium', city: 'Old City' });
    const plan = basePlan({
      mode: 'COMMIT',
      confirmation: expectedScheduleRolloverConfirmation(WEEK),
      existingGames: [existing],
    });
    let rows = [existing];
    const result = await executeAtomicScheduleRolloverCommit({
      plan,
      providerGames: [providerGame()],
      venueCityByName: new Map([['sanford stadium', 'Athens']]),
      teamResolutions: resolutions(),
      reReadFbsTeamIds: async () => buildFbsIds(HOME_ID, AWAY_ID),
      reReadGames: async () => [...rows],
      createRow: async () => {
        throw new Error('create must not run');
      },
      updateRow: async (row) => {
        rows = rows.map((r) =>
          r.id === row.id
            ? {
                ...r,
                date: row.fields.date,
                venue: row.fields.venue,
                city: row.fields.city,
                neutralSite: row.fields.neutralSite,
                conferenceGame: row.fields.conferenceGame,
              }
            : r
        );
      },
    });
    expect(result.createCount).toBe(0);
    expect(result.updateCount).toBe(1);
    expect(result.verification.ok).toBe(true);
    expect(rows[0].venue).toBe('Sanford Stadium');
    expect(rows[0].homeScore).toBeNull();
    expect(rows[0].status).toBe('scheduled');
  });

  it('idempotent rerun invokes zero creates/updates', async () => {
    const existing = dbRow();
    const plan = basePlan({
      mode: 'COMMIT',
      confirmation: expectedScheduleRolloverConfirmation(WEEK),
      existingGames: [existing],
    });
    let creates = 0;
    let updates = 0;
    const result = await executeAtomicScheduleRolloverCommit({
      plan,
      providerGames: [providerGame()],
      venueCityByName: new Map([['sanford stadium', 'Athens']]),
      teamResolutions: resolutions(),
      reReadFbsTeamIds: async () => buildFbsIds(HOME_ID, AWAY_ID),
      reReadGames: async () => [existing],
      createRow: async () => {
        creates += 1;
      },
      updateRow: async () => {
        updates += 1;
      },
    });
    expect(creates).toBe(0);
    expect(updates).toBe(0);
    expect(result.createCount).toBe(0);
    expect(result.updateCount).toBe(0);
    expect(result.verification.ok).toBe(true);
    const exec = buildSuccessfulCommitExecution({
      providerCalls: 2,
      createCount: 0,
      updateCount: 0,
    });
    expect(exec.mutationsInvoked).toBe(false);
    expect(exec.commitSucceeded).toBe(true);
    expect(exec.postWriteVerificationSucceeded).toBe(true);
  });

  it('in-transaction postverify failure throws (rollback semantics)', async () => {
    const plan = basePlan({
      mode: 'COMMIT',
      confirmation: expectedScheduleRolloverConfirmation(WEEK),
    });
    let rows: DbScheduleGameRow[] = [];
    let mutationAttempts = 0;
    await expect(
      executeAtomicScheduleRolloverCommit({
        plan,
        providerGames: [providerGame()],
        venueCityByName: new Map([['sanford stadium', 'Athens']]),
        teamResolutions: resolutions(),
        reReadFbsTeamIds: async () => buildFbsIds(HOME_ID, AWAY_ID),
        reReadGames: async () => [...rows],
        createRow: async (row) => {
          mutationAttempts += 1;
          rows = [
            dbRow({
              id: row.row.id,
              date: new Date('1999-01-01T00:00:00.000Z'),
            }),
          ];
        },
        updateRow: async () => {
          mutationAttempts += 1;
        },
      })
    ).rejects.toThrow(/post-write verification failed/);
    expect(mutationAttempts).toBeGreaterThan(0);
    const rolled = buildRolledBackExecution({
      providerCalls: 2,
      error: 'post-write verification failed',
      mutationsInvoked: true,
      postWriteVerificationSucceeded: false,
    });
    expect(rolled.commitSucceeded).toBe(false);
    expect(rolled.postWriteVerificationSucceeded).toBe(false);
  });

  it('aborts when in-tx DB state differs from PREVIEW fingerprint', async () => {
    const plan = basePlan({
      mode: 'COMMIT',
      confirmation: expectedScheduleRolloverConfirmation(WEEK),
    });
    await expect(
      executeAtomicScheduleRolloverCommit({
        plan,
        providerGames: [providerGame()],
        venueCityByName: new Map([['sanford stadium', 'Athens']]),
        teamResolutions: resolutions(),
        reReadFbsTeamIds: async () => buildFbsIds(HOME_ID, AWAY_ID),
        reReadGames: async () => [dbRow()],
        createRow: async () => {
          throw new Error('must not mutate');
        },
        updateRow: async () => {
          throw new Error('must not mutate');
        },
      })
    ).rejects.toThrow(/DB state differs from PREVIEW plan fingerprint/);
  });
});

describe('cfbd-schedule-rollover-2026 verification + artifact', () => {
  it('post-write verification catches unexpected DB-only rows', () => {
    const plan = basePlan();
    const v = verifyScheduleRolloverPostWrite({
      plan,
      beforeRows: [],
      afterRows: [dbRow(), dbRow({ id: 'extra' })],
      createCount: 1,
      updateCount: 0,
    });
    expect(v.ok).toBe(false);
    expect(v.reasons.some((r) => /unexpected_db_only_after_write/.test(r))).toBe(
      true
    );
  });

  it('public report strips planned mutation payloads and keeps mutationsInvoked=false on PREVIEW', () => {
    const plan = basePlan();
    const report = finalizeScheduleRolloverReport({
      plan,
      execution: buildPreviewExecution(2),
      verification: null,
    });
    expect(report.mutationsInvoked).toBe(false);
    expect(report).not.toHaveProperty('plannedCreates');
    expect(report).not.toHaveProperty('plannedUpdates');
    expect(report).not.toHaveProperty('normalizedGames');
    expect(report.writeSafe).toBe(true);
  });
});

describe('cfbd-schedule-rollover-2026 strengthened fingerprint', () => {
  const staleUpdate = dbRow({ venue: 'Old Stadium', city: 'Old City' });

  async function commitAgainst(options: {
    outerExisting: DbScheduleGameRow[];
    innerExisting: DbScheduleGameRow[];
    innerFbs?: string[];
  }): Promise<{ mutated: boolean; error: unknown }> {
    const plan = basePlan({
      mode: 'COMMIT',
      confirmation: expectedScheduleRolloverConfirmation(WEEK),
      existingGames: options.outerExisting,
    });
    let mutated = false;
    try {
      await executeAtomicScheduleRolloverCommit({
        plan,
        providerGames: [providerGame()],
        venueCityByName: new Map([['sanford stadium', 'Athens']]),
        teamResolutions: resolutions(),
        reReadFbsTeamIds: async () =>
          options.innerFbs ?? buildFbsIds(HOME_ID, AWAY_ID),
        reReadGames: async () => options.innerExisting,
        createRow: async () => {
          mutated = true;
        },
        updateRow: async () => {
          mutated = true;
        },
      });
      return { mutated, error: null };
    } catch (error) {
      return { mutated, error };
    }
  }

  it('is independent of FBS and existing-row iteration order', () => {
    const a = dbRow();
    const b = dbRow({
      id: '2026-wk2-aaa-bbb',
      homeTeamId: 'bbb',
      awayTeamId: 'aaa',
    });
    const fbs = buildFbsIds(HOME_ID, AWAY_ID);
    const left = planFingerprint({
      createIds: ['c2', 'c1'],
      updateIds: ['u1'],
      unchangedIds: [],
      dbOnlyIds: [],
      fbsTeamIds: fbs,
      existingGames: [a, b],
    });
    const right = planFingerprint({
      createIds: ['c1', 'c2'],
      updateIds: ['u1'],
      unchangedIds: [],
      dbOnlyIds: [],
      fbsTeamIds: [...fbs].reverse(),
      existingGames: [b, a],
    });
    expect(left).toBe(right);
  });

  it('venue changes but row remains a planned update -> abort before mutation', async () => {
    const { mutated, error } = await commitAgainst({
      outerExisting: [staleUpdate],
      innerExisting: [dbRow({ venue: 'Even Older', city: 'Old City' })],
    });
    expect(String(error)).toMatch(/DB state differs from PREVIEW plan fingerprint/);
    expect(mutated).toBe(false);
    expect(basePlan({ existingGames: [staleUpdate] }).proposedMetadataUpdates).toBe(
      1
    );
  });

  it('kickoff changes but row remains a planned update -> abort', async () => {
    const { mutated, error } = await commitAgainst({
      outerExisting: [staleUpdate],
      innerExisting: [
        dbRow({
          venue: 'Old Stadium',
          city: 'Old City',
          date: new Date('2026-09-12T23:00:00.000Z'),
        }),
      ],
    });
    expect(String(error)).toMatch(/DB state differs from PREVIEW plan fingerprint/);
    expect(mutated).toBe(false);
  });

  it('status changes -> abort', async () => {
    const { mutated, error } = await commitAgainst({
      outerExisting: [dbRow()],
      innerExisting: [dbRow({ status: 'in_progress' })],
    });
    expect(String(error)).toMatch(/DB state differs from PREVIEW plan fingerprint/);
    expect(mutated).toBe(false);
  });

  it('score changes -> abort', async () => {
    const { mutated, error } = await commitAgainst({
      outerExisting: [dbRow()],
      innerExisting: [dbRow({ homeScore: 21, awayScore: 17 })],
    });
    expect(String(error)).toMatch(/DB state differs from PREVIEW plan fingerprint/);
    expect(mutated).toBe(false);
  });

  it('neutralSite/conferenceGame changes -> abort', async () => {
    const site = await commitAgainst({
      outerExisting: [staleUpdate],
      innerExisting: [
        dbRow({ venue: 'Old Stadium', city: 'Old City', neutralSite: true }),
      ],
    });
    expect(String(site.error)).toMatch(
      /DB state differs from PREVIEW plan fingerprint/
    );
    expect(site.mutated).toBe(false);

    const conf = await commitAgainst({
      outerExisting: [staleUpdate],
      innerExisting: [
        dbRow({
          venue: 'Old Stadium',
          city: 'Old City',
          conferenceGame: true,
        }),
      ],
    });
    expect(String(conf.error)).toMatch(
      /DB state differs from PREVIEW plan fingerprint/
    );
    expect(conf.mutated).toBe(false);
  });

  it('unchanged authoritative state proceeds', async () => {
    const { mutated, error } = await commitAgainst({
      outerExisting: [dbRow()],
      innerExisting: [dbRow()],
    });
    expect(error).toBeNull();
    expect(mutated).toBe(false);
  });

  it('FBS membership drift still aborts', async () => {
    const outerFbs = buildFbsIds(HOME_ID, AWAY_ID);
    const innerFbs = outerFbs.map((id, i) =>
      i === outerFbs.length - 1 ? 'fbs-drifted' : id
    );
    const plan = basePlan({
      mode: 'COMMIT',
      confirmation: expectedScheduleRolloverConfirmation(WEEK),
      existingGames: [],
      fbsTeamIds: outerFbs,
    });
    let mutated = false;
    await expect(
      executeAtomicScheduleRolloverCommit({
        plan,
        providerGames: [providerGame()],
        venueCityByName: new Map([['sanford stadium', 'Athens']]),
        teamResolutions: resolutions(),
        reReadFbsTeamIds: async () => innerFbs,
        reReadGames: async () => [],
        createRow: async () => {
          mutated = true;
        },
        updateRow: async () => {
          mutated = true;
        },
      })
    ).rejects.toThrow(/DB state differs from PREVIEW plan fingerprint/);
    expect(mutated).toBe(false);
  });
});

describe('cfbd-schedule-rollover-2026 pre-plan failure audit', () => {
  it('builds a deterministic failure schema without secrets', () => {
    const report = buildPrePlanFailureReport({
      season: 2026,
      week: 2,
      mode: 'PREVIEW',
      generatedAt: '2026-09-03T00:00:00.000Z',
      providerAttempts: 1,
      providerHttpStatus: 503,
      error: 'CFBD games HTTP 503 Bearer abc postgresql://x:y@host/db',
      failureStage: 'cfbd_games_http',
    });
    expect(report.phase).toBe('cfbd-schedule-rollover-2026');
    expect(report.writeSafe).toBe(false);
    expect(report.mutationsInvoked).toBe(false);
    expect(report.commitAttempted).toBe(false);
    expect(report.transactionStarted).toBe(false);
    expect(report.commitSucceeded).toBe(false);
    expect(report.postWriteVerificationSucceeded).toBeNull();
    expect(report.providerCalls).toBe(1);
    expect(report.providerAttempts).toBe(1);
    expect(report.providerHttpStatus).toBe(503);
    expect(report.failureStage).toBe('cfbd_games_http');
    expect(report.error).not.toMatch(/Bearer abc/);
    expect(report.error).not.toMatch(/postgresql:\/\//);
    expect(report).not.toHaveProperty('confirmation');
  });
});

describe('cfbd-schedule-rollover-2026 CLI pre-plan failure reports', () => {
  function tmpReport(): string {
    return path.join(
      os.tmpdir(),
      `cfbd-schedules-failure-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
    );
  }

  function mockPrisma(options?: { failRead?: boolean }) {
    return {
      teamMembership: {
        findMany: async () => {
          if (options?.failRead) {
            throw new Error(
              'db read failed postgresql://user:secret@localhost:5432/gridiron'
            );
          }
          return [];
        },
      },
      game: {
        findMany: async () => [],
      },
      team: {
        findUnique: async () => null,
        findMany: async () => [],
      },
      $disconnect: async () => {},
    };
  }

  function readReport(reportPath: string): Record<string, unknown> {
    expect(fs.existsSync(reportPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    try {
      fs.unlinkSync(reportPath);
    } catch {
      /* ignore */
    }
    return parsed;
  }

  const args = {
    season: 2026,
    week: 2,
    mode: 'PREVIEW' as const,
    confirmation: '',
  };

  it('CFBD HTTP 503 writes a JSON failure report with no mutation attempt', async () => {
    const reportPath = tmpReport();
    let fetchCalls = 0;
    const result = await runGuardedScheduleRollover(
      { ...args, reportPath },
      {
        prisma: mockPrisma(),
        apiKey: 'test-key',
        fetchImpl: (async () => {
          fetchCalls += 1;
          return {
            ok: false,
            status: 503,
            json: async () => [],
          } as unknown as Response;
        }) as typeof fetch,
      }
    );
    expect(result.exitCode).toBe(1);
    const report = readReport(reportPath);
    expect(report.writeSafe).toBe(false);
    expect(report.mutationsInvoked).toBe(false);
    expect(report.commitAttempted).toBe(false);
    expect(report.commitSucceeded).toBe(false);
    expect(report.postWriteVerificationSucceeded).toBeNull();
    expect(report.failureStage).toBe('cfbd_games_http');
    expect(report.providerAttempts).toBe(1);
    expect(report.providerCalls).toBe(1);
    expect(report.providerHttpStatus).toBe(503);
    expect(report.error).toMatch(/HTTP 503/);
    expect(JSON.stringify(report)).not.toMatch(/test-key/);
    expect(report).not.toHaveProperty('confirmation');
    expect(fetchCalls).toBe(1);
  });

  it('invalid CFBD JSON writes a JSON failure report with no mutation attempt', async () => {
    const reportPath = tmpReport();
    const result = await runGuardedScheduleRollover(
      { ...args, reportPath },
      {
        prisma: mockPrisma(),
        apiKey: 'test-key',
        fetchImpl: (async () =>
          ({
            ok: true,
            status: 200,
            json: async () => {
              throw new Error('bad json');
            },
          }) as unknown as Response) as typeof fetch,
      }
    );
    expect(result.exitCode).toBe(1);
    const report = readReport(reportPath);
    expect(report.writeSafe).toBe(false);
    expect(report.mutationsInvoked).toBe(false);
    expect(report.commitSucceeded).toBe(false);
    expect(report.failureStage).toBe('cfbd_games_json');
    expect(report.providerAttempts).toBe(1);
    expect(report.providerHttpStatus).toBe(200);
    expect(String(report.error)).toMatch(/not valid JSON/);
  });

  it('DB read failure writes a JSON failure report with no mutation attempt', async () => {
    const reportPath = tmpReport();
    let fetchCalls = 0;
    const result = await runGuardedScheduleRollover(
      { ...args, reportPath },
      {
        prisma: mockPrisma({ failRead: true }),
        apiKey: 'test-key',
        fetchImpl: (async () => {
          fetchCalls += 1;
          return {
            ok: true,
            status: 200,
            json: async () => [],
          } as unknown as Response;
        }) as typeof fetch,
      }
    );
    expect(result.exitCode).toBe(1);
    expect(fetchCalls).toBe(0);
    const report = readReport(reportPath);
    expect(report.writeSafe).toBe(false);
    expect(report.mutationsInvoked).toBe(false);
    expect(report.commitAttempted).toBe(false);
    expect(report.failureStage).toBe('db_read');
    expect(report.providerAttempts).toBe(0);
    expect(report.providerCalls).toBe(0);
    expect(String(report.error)).not.toMatch(/postgresql:\/\//);
    expect(String(report.error)).not.toMatch(/secret@/);
  });
});
