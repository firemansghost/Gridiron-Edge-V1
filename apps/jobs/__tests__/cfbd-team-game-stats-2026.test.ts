/**
 * 2C-2J-6D-1 — pure unit tests for guarded CFBD TeamGameStat planning (mocked provider).
 */

import {
  buildPreviewExecution,
  buildSuccessfulCommitExecution,
  commitEligible,
  derivePaceFromSecondsPerPlay,
  expectedTeamGameStatConfirmation,
  fetchCfbdAdvancedGameStatsWeek,
  managedFieldsEqual,
  mapAdvancedStatsToManagedFields,
  naturalKey,
  parseTeamGameStatCliArgs,
  planTeamGameStats,
  safeNumber,
  verifyTeamGameStatPostWrite,
  type CfbdAdvancedGameStatRow,
  type DbGameRowForStats,
  type DbTeamGameStatRow,
  type ManagedTeamGameStatFields,
} from '../src/stats/cfbd-team-game-stats-2026';
import type { TeamResolutionResult } from '../src/preseason/cfbd-schedule-ingest';

function resolved(
  name: string,
  id: string
): TeamResolutionResult {
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

function providerRow(
  overrides: Partial<CfbdAdvancedGameStatRow> & {
    team: string;
    opponent: string;
    homeAway: 'home' | 'away';
  }
): CfbdAdvancedGameStatRow {
  return {
    season: 2026,
    week: 1,
    offense: {
      yardsPerPlay: 6.5,
      successRate: 0.45,
      ppa: 0.21,
      secondsPerPlay: 25,
      yardsPerPass: 8.1,
      yardsPerRush: 4.2,
    },
    defense: {
      yardsPerPlay: 5.1,
      successRate: 0.38,
      ppa: -0.05,
      yardsPerPass: 6.8,
      yardsPerRush: 3.9,
      plays: 60,
      yards: 306,
      passing: { yards: 200, attempts: 30 },
      rushing: { yards: 106, attempts: 30 },
    },
    plays: 70,
    yards: 455,
    passing: { yards: 280, attempts: 35 },
    rushing: { yards: 175, attempts: 35 },
    ...overrides,
  };
}

function baseFieldsFrom(row: CfbdAdvancedGameStatRow): ManagedTeamGameStatFields {
  return mapAdvancedStatsToManagedFields(row);
}

function asDbStat(
  gameId: string,
  teamId: string,
  fields: ManagedTeamGameStatFields,
  id = 'stat-1'
): DbTeamGameStatRow {
  return {
    id,
    gameId,
    teamId,
    season: 2026,
    week: 1,
    ...fields,
  };
}

describe('2C-2J-6D-1 mapping fixtures', () => {
  it('maps epaOff from offense.ppa and epaDef from defense.ppa', () => {
    const row = providerRow({
      team: 'Alabama',
      opponent: 'Georgia',
      homeAway: 'home',
      offense: { ppa: 0.33, yardsPerPlay: 7, successRate: 0.5 },
      defense: { ppa: -0.12, yardsPerPlay: 4, successRate: 0.3 },
    });
    const fields = mapAdvancedStatsToManagedFields(row);
    expect(fields.epaOff).toBe(0.33);
    expect(fields.epaDef).toBe(-0.12);
    expect(fields.yppOff).toBe(7);
    expect(fields.successOff).toBe(0.5);
  });

  it('derivePaceFromSecondsPerPlay uses 60/spp; safeNumber nulls non-finite', () => {
    expect(derivePaceFromSecondsPerPlay(30)).toBe(2);
    expect(derivePaceFromSecondsPerPlay(0)).toBeNull();
    expect(derivePaceFromSecondsPerPlay(-1)).toBeNull();
    expect(derivePaceFromSecondsPerPlay(null)).toBeNull();
    expect(safeNumber(NaN)).toBeNull();
    expect(safeNumber(Infinity)).toBeNull();
    expect(safeNumber(undefined)).toBeNull();
    expect(safeNumber(1.5)).toBe(1.5);
  });

  it('managedFieldsEqual compares scalars and JSON bags', () => {
    const row = providerRow({
      team: 'A',
      opponent: 'B',
      homeAway: 'home',
    });
    const a = mapAdvancedStatsToManagedFields(row);
    const b = mapAdvancedStatsToManagedFields(row);
    expect(managedFieldsEqual(a, b)).toBe(true);
    b.epaOff = 0.99;
    expect(managedFieldsEqual(a, b)).toBe(false);
  });
});

describe('2C-2J-6D-1 args / confirmation', () => {
  it('accepts season 2026 and rejects others', () => {
    expect(
      parseTeamGameStatCliArgs([
        '--season',
        '2026',
        '--week',
        '1',
        '--mode',
        'PREVIEW',
      ]).ok
    ).toBe(true);
    expect(
      parseTeamGameStatCliArgs([
        '--season',
        '2025',
        '--week',
        '1',
        '--mode',
        'PREVIEW',
      ]).ok
    ).toBe(false);
  });

  it('rejects week 0, current, ranges', () => {
    expect(
      parseTeamGameStatCliArgs(['--season', '2026', '--week', '0']).ok
    ).toBe(false);
    expect(
      parseTeamGameStatCliArgs(['--season', '2026', '--week', 'current']).ok
    ).toBe(false);
    expect(
      parseTeamGameStatCliArgs(['--season', '2026', '--week', '1-8']).ok
    ).toBe(false);
  });

  it('COMMIT wrong confirmation rejected in parse before provider', () => {
    const bad = parseTeamGameStatCliArgs([
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
    expect(expectedTeamGameStatConfirmation(1)).toBe(
      'WRITE_2026_WEEK_1_TEAM_GAME_STATS'
    );
    const good = parseTeamGameStatCliArgs([
      '--season',
      '2026',
      '--week',
      '1',
      '--mode',
      'COMMIT',
      '--confirm',
      'WRITE_2026_WEEK_1_TEAM_GAME_STATS',
    ]);
    expect(good.ok).toBe(true);
  });
});

describe('2C-2J-6D-1 provider fetch', () => {
  it('HTTP error fails closed; non-JSON fails closed', async () => {
    await expect(
      fetchCfbdAdvancedGameStatsWeek({
        season: 2026,
        week: 1,
        apiKey: 'test-key',
        fetchImpl: (async () =>
          ({
            ok: false,
            status: 503,
            json: async () => ({}),
          }) as unknown as Response) as typeof fetch,
      })
    ).rejects.toThrow(/HTTP 503/);

    await expect(
      fetchCfbdAdvancedGameStatsWeek({
        season: 2026,
        week: 1,
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

  it('requires array payload and hits /stats/game/advanced', async () => {
    let calls = 0;
    const fetchImpl = async (url: RequestInfo | URL) => {
      calls += 1;
      const u = String(url);
      expect(u).toContain('/stats/game/advanced');
      expect(u).toContain('year=2026');
      expect(u).toContain('week=1');
      expect(u).toContain('seasonType=regular');
      expect(u).toContain('classification=fbs');
      return {
        ok: true,
        status: 200,
        json: async () => [],
      } as unknown as Response;
    };
    const result = await fetchCfbdAdvancedGameStatsWeek({
      season: 2026,
      week: 1,
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(calls).toBe(1);
    expect(result.providerCalls).toBe(1);

    await expect(
      fetchCfbdAdvancedGameStatsWeek({
        season: 2026,
        week: 1,
        apiKey: 'test-key',
        fetchImpl: (async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ not: 'array' }),
          }) as unknown as Response) as typeof fetch,
      })
    ).rejects.toThrow(/not an array/);
  });
});

describe('2C-2J-6D-1 planning', () => {
  const homeId = 'team-home';
  const awayId = 'team-away';
  const gameId = '2026-W01-away-home';
  const fbs = [homeId, awayId];

  const finalGame: DbGameRowForStats = {
    id: gameId,
    season: 2026,
    week: 1,
    homeTeamId: homeId,
    awayTeamId: awayId,
    status: 'final',
  };

  const resolutions = new Map<string, TeamResolutionResult>([
    ['Alabama', resolved('Alabama', homeId)],
    ['Georgia', resolved('Georgia', awayId)],
  ]);

  const homeRow = providerRow({
    team: 'Alabama',
    opponent: 'Georgia',
    homeAway: 'home',
  });
  const awayRow = providerRow({
    team: 'Georgia',
    opponent: 'Alabama',
    homeAway: 'away',
    offense: {
      yardsPerPlay: 5.0,
      successRate: 0.4,
      ppa: 0.1,
      secondsPerPlay: 28,
      yardsPerPass: 7,
      yardsPerRush: 3.5,
    },
  });

  it('one final FBS-vs-FBS → 2 expected rows', () => {
    const plan = planTeamGameStats({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      confirmation: '',
      providerRows: [homeRow, awayRow],
      providerHttpStatus: 200,
      providerCalls: 1,
      dbGames: [finalGame],
      existingStats: [],
      fbsTeamIds: fbs,
      teamResolutions: resolutions,
    });
    expect(plan.counts.expectedFbsParticipantRows).toBe(2);
    expect(plan.counts.proposedCreates).toBe(2);
    expect(plan.writeSafe).toBe(true);
    expect(plan.mutationsInvoked).toBe(false);
  });

  it('PREVIEW zero mutations via plan + execution builders', () => {
    const plan = planTeamGameStats({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      confirmation: '',
      providerRows: [homeRow, awayRow],
      providerHttpStatus: 200,
      providerCalls: 1,
      dbGames: [finalGame],
      existingStats: [],
      fbsTeamIds: fbs,
      teamResolutions: resolutions,
    });
    const exec = buildPreviewExecution(plan.providerCalls);
    expect(plan.mutationsInvoked).toBe(false);
    expect(exec.mutationsInvoked).toBe(false);
    expect(exec.commitAttempted).toBe(false);
    expect(exec.createCount).toBeNull();
  });

  it('identical existing → unchanged', () => {
    const homeFields = baseFieldsFrom(homeRow);
    const awayFields = baseFieldsFrom(awayRow);
    const plan = planTeamGameStats({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      confirmation: '',
      providerRows: [homeRow, awayRow],
      providerHttpStatus: 200,
      providerCalls: 1,
      dbGames: [finalGame],
      existingStats: [
        asDbStat(gameId, homeId, homeFields, 's1'),
        asDbStat(gameId, awayId, awayFields, 's2'),
      ],
      fbsTeamIds: fbs,
      teamResolutions: resolutions,
    });
    expect(plan.counts.unchangedRows).toBe(2);
    expect(plan.counts.proposedCreates).toBe(0);
    expect(plan.counts.proposedUpdates).toBe(0);
  });

  it('missing → creates; changed → updates', () => {
    const homeFields = baseFieldsFrom(homeRow);
    const stale = { ...homeFields, epaOff: 9.99 };
    const createOnly = planTeamGameStats({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      confirmation: '',
      providerRows: [homeRow, awayRow],
      providerHttpStatus: 200,
      providerCalls: 1,
      dbGames: [finalGame],
      existingStats: [],
      fbsTeamIds: fbs,
      teamResolutions: resolutions,
    });
    expect(createOnly.counts.proposedCreates).toBe(2);

    const updatePlan = planTeamGameStats({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      confirmation: '',
      providerRows: [homeRow, awayRow],
      providerHttpStatus: 200,
      providerCalls: 1,
      dbGames: [finalGame],
      existingStats: [
        asDbStat(gameId, homeId, stale, 's1'),
        asDbStat(gameId, awayId, baseFieldsFrom(awayRow), 's2'),
      ],
      fbsTeamIds: fbs,
      teamResolutions: resolutions,
    });
    expect(updatePlan.counts.proposedUpdates).toBe(1);
    expect(updatePlan.counts.unchangedRows).toBe(1);
  });

  it('missing expected provider row → blocker', () => {
    const plan = planTeamGameStats({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      confirmation: '',
      providerRows: [homeRow],
      providerHttpStatus: 200,
      providerCalls: 1,
      dbGames: [finalGame],
      existingStats: [],
      fbsTeamIds: fbs,
      teamResolutions: resolutions,
    });
    expect(plan.counts.missingExpectedKeys).toBe(1);
    expect(plan.writeSafe).toBe(false);
    expect(plan.blockers.some((b) => b.startsWith('missing_expected_key:'))).toBe(
      true
    );
  });

  it('duplicate natural key → blocker', () => {
    const plan = planTeamGameStats({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      confirmation: '',
      providerRows: [homeRow, { ...homeRow }, awayRow],
      providerHttpStatus: 200,
      providerCalls: 1,
      dbGames: [finalGame],
      existingStats: [],
      fbsTeamIds: fbs,
      teamResolutions: resolutions,
    });
    expect(plan.counts.duplicateKeys).toBeGreaterThanOrEqual(1);
    expect(plan.writeSafe).toBe(false);
    expect(
      plan.blockers.some((b) => b.startsWith('duplicate_natural_key:'))
    ).toBe(true);
  });

  it('unresolved authoritative FBS team → blocker', () => {
    const badRes = new Map<string, TeamResolutionResult>([
      ['Alabama', unresolved('Alabama')],
      ['Georgia', resolved('Georgia', awayId)],
    ]);
    const plan = planTeamGameStats({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      confirmation: '',
      providerRows: [homeRow, awayRow],
      providerHttpStatus: 200,
      providerCalls: 1,
      dbGames: [finalGame],
      existingStats: [],
      fbsTeamIds: fbs,
      teamResolutions: badRes,
    });
    expect(plan.counts.unresolvedRows).toBeGreaterThanOrEqual(1);
    expect(plan.writeSafe).toBe(false);
    expect(
      plan.blockers.some((b) => b.includes('unresolved_provider_team:Alabama'))
    ).toBe(true);
  });

  it('non-final game blocks COMMIT', () => {
    const scheduled: DbGameRowForStats = {
      ...finalGame,
      status: 'scheduled',
    };
    const preview = planTeamGameStats({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      confirmation: '',
      providerRows: [homeRow, awayRow],
      providerHttpStatus: 200,
      providerCalls: 1,
      dbGames: [scheduled],
      existingStats: [],
      fbsTeamIds: fbs,
      teamResolutions: resolutions,
    });
    // PREVIEW does not add non_final blocker solely for incompleteness
    expect(
      preview.blockers.some((b) => b.startsWith('non_final_canonical_game:'))
    ).toBe(false);

    const commit = planTeamGameStats({
      season: 2026,
      week: 1,
      mode: 'COMMIT',
      confirmation: 'WRITE_2026_WEEK_1_TEAM_GAME_STATS',
      providerRows: [homeRow, awayRow],
      providerHttpStatus: 200,
      providerCalls: 1,
      dbGames: [scheduled],
      existingStats: [],
      fbsTeamIds: fbs,
      teamResolutions: resolutions,
    });
    expect(
      commit.blockers.some((b) => b.startsWith('non_final_canonical_game:'))
    ).toBe(true);
    expect(commit.writeSafe).toBe(false);
    expect(commitEligible(commit)).toBe(false);
  });

  it('unrelated provider rows ignored but counted', () => {
    const extra = providerRow({
      team: 'OtherA',
      opponent: 'OtherB',
      homeAway: 'home',
    });
    const res = new Map(resolutions);
    res.set('OtherA', resolved('OtherA', 'other-a'));
    res.set('OtherB', resolved('OtherB', 'other-b'));
    const plan = planTeamGameStats({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      confirmation: '',
      providerRows: [homeRow, awayRow, extra],
      providerHttpStatus: 200,
      providerCalls: 1,
      dbGames: [finalGame],
      existingStats: [],
      fbsTeamIds: fbs,
      teamResolutions: res,
    });
    expect(plan.counts.ignoredProviderRows).toBe(1);
    expect(plan.counts.proposedCreates).toBe(2);
    expect(plan.writeSafe).toBe(true);
  });

  it('commitEligible false when blockers', () => {
    const plan = planTeamGameStats({
      season: 2026,
      week: 1,
      mode: 'COMMIT',
      confirmation: 'WRITE_2026_WEEK_1_TEAM_GAME_STATS',
      providerRows: [homeRow],
      providerHttpStatus: 200,
      providerCalls: 1,
      dbGames: [finalGame],
      existingStats: [],
      fbsTeamIds: fbs,
      teamResolutions: resolutions,
    });
    expect(plan.writeSafe).toBe(false);
    expect(commitEligible(plan)).toBe(false);
  });

  it('post-write verification mismatch fails', () => {
    const fields = baseFieldsFrom(homeRow);
    const plannedByKey = new Map<string, ManagedTeamGameStatFields>([
      [naturalKey(gameId, homeId), fields],
      [naturalKey(gameId, awayId), baseFieldsFrom(awayRow)],
    ]);
    const ok = verifyTeamGameStatPostWrite({
      expectedKeys: [naturalKey(gameId, homeId), naturalKey(gameId, awayId)],
      plannedByKey,
      afterRows: [
        asDbStat(gameId, homeId, fields),
        asDbStat(gameId, awayId, baseFieldsFrom(awayRow)),
      ],
    });
    expect(ok.ok).toBe(true);

    const bad = verifyTeamGameStatPostWrite({
      expectedKeys: [naturalKey(gameId, homeId), naturalKey(gameId, awayId)],
      plannedByKey,
      afterRows: [
        asDbStat(gameId, homeId, { ...fields, epaOff: 99 }),
        asDbStat(gameId, awayId, baseFieldsFrom(awayRow)),
      ],
    });
    expect(bad.ok).toBe(false);
    expect(bad.reasons.some((r) => r.includes('managed_fields_mismatch'))).toBe(
      true
    );
  });

  it('successful commit execution builder reports mutation counts', () => {
    const exec = buildSuccessfulCommitExecution({
      providerCalls: 1,
      createCount: 2,
      updateCount: 1,
      unchangedCount: 0,
    });
    expect(exec.mutationsInvoked).toBe(true);
    expect(exec.createCount).toBe(2);
    expect(exec.updateCount).toBe(1);
    expect(exec.commitSucceeded).toBe(true);
  });
});
