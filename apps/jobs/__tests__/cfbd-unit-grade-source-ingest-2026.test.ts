/**
 * Guarded 2026 CFBD unit-grade source ingest — pure planner + fetch tests.
 * No production DB. No live CFBD. No TeamUnitGrades / Shadow writes.
 */

import { buildBaseFbsFixture } from '../src/preseason/fbs-membership-init';
import type { TeamResolutionResult } from '../src/preseason/cfbd-schedule-ingest';
import {
  CFBD_LEASE_SEMANTICS,
  CFBD_UNIT_GRADE_SOURCE_MAX_RETRIES,
  CFBD_UNIT_GRADE_SOURCE_PROCESS_MAX_CONCURRENCY,
  EFF_METRIC_FIELD_KEYS,
  TARGET_SEASON,
  UNIT_GRADE_SOURCE_CONFIRMATION,
  SequentialJsonFetcher,
  buildAdvancedGameUrl,
  buildAdvancedSeasonUrl,
  buildGamesUrl,
  buildPpaGameUrl,
  fetchUnitGradeSourcePayloads,
  mapAdvancedMetrics,
  mutationTelemetryAfterCommitAttempt,
  parseRetryAfterMs,
  parseUnitGradeSourceIngestArgs,
  parseWeeks,
  pickEffMetricFields,
  planUnitGradeSourceIngest,
  snapshotProviderTelemetry,
  toFiniteOrNull,
  type MembershipRow,
  type PlannedEffGameRow,
  type PlannedEffSeasonRow,
  type UnitGradeSourceIngestPlan,
} from '../src/v2/cfbd-unit-grade-source-ingest-2026';
import { LEGACY_COMPATIBILITY_DISCLAIMER } from '../src/v2/unit-grade-source-readiness';

const KICK = '2026-09-05T19:00:00Z';

function fbs(): string[] {
  return buildBaseFbsFixture(138);
}

function memberships(): MembershipRow[] {
  return fbs().map((teamId) => ({ teamId, level: 'fbs' }));
}

function resolve(name: string, id: string): TeamResolutionResult {
  return {
    providerName: name,
    slugCandidate: id,
    kind: 'exact_canonical',
    resolvedId: id,
  };
}

function resolutions(map: Record<string, string>): Map<string, TeamResolutionResult> {
  const out = new Map<string, TeamResolutionResult>();
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    out.set(keys[i], resolve(keys[i], map[keys[i]]));
  }
  return out;
}

function providerGame(id: string, home: string, away: string, week = 1) {
  return {
    id,
    season: 2026,
    week,
    startDate: KICK,
    homeTeam: home,
    awayTeam: away,
    homeClassification: 'fbs',
    awayClassification: 'fbs',
    neutralSite: false,
    venue: 'Stadium',
    homeConference: 'SEC',
    awayConference: 'SEC',
  };
}

function advRow(id: string, team: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    team,
    offense: {
      ppa: 0.1,
      successRate: 0.4,
      explosiveness: 1.2,
      lineYards: 3.4,
      rushingPlays: { ppa: 0.05, successRate: 0.42 },
      passingPlays: { ppa: 0.08, successRate: 0.45 },
      havoc: { total: 0.11, frontSeven: 0.07, db: 0.04 },
      ...((overrides.offense as object) || {}),
    },
    defense: {
      ppa: -0.1,
      successRate: 0.38,
      explosiveness: 1.0,
      stuffRate: 0.22,
      havoc: { total: 0.2 },
      ...((overrides.defense as object) || {}),
    },
  };
}

function basePlan(overrides: Record<string, unknown> = {}): UnitGradeSourceIngestPlan {
  const teams = fbs();
  const home = teams[0];
  const away = teams[1];
  return planUnitGradeSourceIngest({
    season: TARGET_SEASON,
    weeks: [1],
    mode: 'PREVIEW',
    confirmation: '',
    memberships: memberships(),
    teamResolutions: resolutions({ Alpha: home, Beta: away }),
    existingGames: [],
    existingEffGames: [],
    existingPpaGames: [],
    existingEffSeasons: [],
    gamesByWeek: { 1: [providerGame('401', 'Alpha', 'Beta')] },
    advancedGameByWeek: { 1: [] },
    ppaGameByWeek: { 1: [] },
    advancedSeason: [],
    ...overrides,
  });
}

describe('unit-grade source ingest args', () => {
  it('season != 2026 rejected', () => {
    const r = parseUnitGradeSourceIngestArgs(['--season', '2025', '--weeks', '1']);
    expect(r.ok).toBe(false);
  });

  it('invalid week inputs rejected', () => {
    expect(parseWeeks('').ok).toBe(false);
    expect(parseWeeks('1,1').ok).toBe(false);
    expect(parseWeeks('-1').ok).toBe(false);
    expect(parseWeeks('21').ok).toBe(false);
    expect(parseWeeks('1.5').ok).toBe(false);
    expect(parseWeeks('1,2,3').ok).toBe(true);
  });
});

describe('unit-grade source ingest planner', () => {
  it('PREVIEW zero DB mutations / writeSafe without COMMIT', () => {
    const r = basePlan();
    expect(r.mode).toBe('PREVIEW');
    expect(r.writeSafe).toBe(true);
    expect(r.gameCounts.create).toBe(1);
    expect(r.writeSafe).toBe(true);
  });

  it('empty provider schedule', () => {
    const r = basePlan({ gamesByWeek: { 1: [] } });
    expect(r.gameCounts.create).toBe(0);
    expect(r.warnings).toContain('empty_provider_schedule');
    expect(r.writeSafe).toBe(true);
  });

  it('malformed provider game ID', () => {
    const r = basePlan({
      gamesByWeek: { 1: [{ ...providerGame('', 'Alpha', 'Beta'), id: '' }] },
    });
    expect(r.blockers.some((b) => b.includes('malformed_provider_game_id'))).toBe(true);
    expect(r.writeSafe).toBe(false);
  });

  it('missing mapped home/away', () => {
    const r = basePlan({
      gamesByWeek: { 1: [{ ...providerGame('401', 'Alpha', 'Beta'), awayTeam: '' }] },
    });
    expect(r.blockers.some((b) => b.startsWith('missing_mapped_home_away'))).toBe(true);
  });

  it('duplicate game ID', () => {
    const g = providerGame('401', 'Alpha', 'Beta');
    const r = basePlan({ gamesByWeek: { 1: [g, { ...g }] } });
    expect(r.blockers.some((b) => b.includes('duplicate_game_id'))).toBe(true);
  });

  it('conflicting duplicate identity', () => {
    const teams = fbs();
    const r = basePlan({
      teamResolutions: resolutions({
        Alpha: teams[0],
        Beta: teams[1],
        Gamma: teams[2],
      }),
      gamesByWeek: {
        1: [providerGame('401', 'Alpha', 'Beta'), providerGame('401', 'Alpha', 'Gamma')],
      },
    });
    expect(r.blockers.some((b) => b.includes('duplicate_game_id_conflicting_identity'))).toBe(
      true
    );
  });

  it('valid FBS-FBS', () => {
    const r = basePlan();
    expect(r.games).toHaveLength(1);
    expect(r.games[0].kind).toBe('CREATE');
    expect(r.games[0].homeTeamIdInternal).toBe(fbs()[0]);
    expect(r.unmappedProviderTeams).toEqual([]);
  });

  it('valid FBS-FCS with mapped teams', () => {
    const teams = fbs();
    const r = basePlan({
      memberships: [
        ...memberships(),
        { teamId: 'fcs-mapped', level: 'fcs' },
      ],
      teamResolutions: resolutions({ Alpha: teams[0], 'FCS State': 'fcs-mapped' }),
      gamesByWeek: {
        1: [
          {
            ...providerGame('401', 'Alpha', 'FCS State'),
            awayClassification: 'fcs',
          },
        ],
      },
    });
    expect(r.writeSafe).toBe(true);
    expect(r.games[0].awayTeamIdInternal).toBe('fcs-mapped');
    expect(r.games[0].awayLevel).toBe('fcs');
  });

  it('unmapped provider team behavior', () => {
    const r = basePlan({
      teamResolutions: resolutions({ Alpha: fbs()[0] }),
    });
    expect(r.games).toHaveLength(0);
    expect(r.unmappedProviderTeams).toContain('Beta');
    expect(r.skipped.some((s) => s.includes('unmapped_provider_team'))).toBe(true);
    expect(r.writeSafe).toBe(true);
  });

  it('existing exact row -> NO_CHANGE', () => {
    const teams = fbs();
    const existing = {
      gameIdCfbd: '401',
      season: 2026,
      week: 1,
      date: new Date(KICK),
      homeTeamIdInternal: teams[0],
      awayTeamIdInternal: teams[1],
      neutralSite: false,
      venue: 'Stadium',
      homeConference: 'SEC',
      awayConference: 'SEC',
    };
    const r = basePlan({ existingGames: [existing] });
    expect(r.games[0].kind).toBe('NO_CHANGE');
    expect(r.gameCounts.noChange).toBe(1);
  });

  it('existing changed row -> UPDATE plan', () => {
    const teams = fbs();
    const r = basePlan({
      existingGames: [
        {
          gameIdCfbd: '401',
          season: 2026,
          week: 1,
          date: new Date(KICK),
          homeTeamIdInternal: teams[0],
          awayTeamIdInternal: teams[1],
          neutralSite: false,
          venue: 'Old Venue',
          homeConference: 'SEC',
          awayConference: 'SEC',
        },
      ],
    });
    expect(r.games[0].kind).toBe('UPDATE');
  });

  it('new row -> CREATE plan', () => {
    const r = basePlan();
    expect(r.games[0].kind).toBe('CREATE');
    expect(r.gameCounts.create).toBe(1);
  });

  it('duplicate team-game identity', () => {
    const teams = fbs();
    const r = basePlan({
      advancedGameByWeek: {
        1: [advRow('401', 'Alpha'), advRow('401', 'Alpha')],
      },
      teamResolutions: resolutions({ Alpha: teams[0], Beta: teams[1] }),
    });
    expect(r.blockers.some((b) => b.startsWith('duplicate_eff_team_game_identity'))).toBe(
      true
    );
  });

  it('team-game team not on game', () => {
    const teams = fbs();
    const r = basePlan({
      teamResolutions: resolutions({
        Alpha: teams[0],
        Beta: teams[1],
        Gamma: teams[2],
      }),
      advancedGameByWeek: { 1: [advRow('401', 'Gamma')] },
    });
    expect(r.blockers.some((b) => b.startsWith('eff_team_game_team_not_in_game'))).toBe(
      true
    );
    expect(r.effGames).toHaveLength(0);
  });

  it('nonfinite numeric -> null', () => {
    expect(toFiniteOrNull(Number.NaN)).toBeNull();
    expect(toFiniteOrNull(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toFiniteOrNull(0)).toBe(0);
    const metrics = mapAdvancedMetrics({
      offense: { lineYards: Number.NaN, explosiveness: 1.5, ppa: 'nope' },
      defense: { stuffRate: Number.POSITIVE_INFINITY },
    });
    expect(metrics.lineYardsOff).toBeNull();
    expect(metrics.isoPppOff).toBe(1.5);
    expect(metrics.offEpa).toBeNull();
    expect(metrics.stuffRate).toBeNull();
  });

  it('advanced season duplicate team', () => {
    const teams = fbs();
    const r = basePlan({
      advancedSeason: [advRow('s', 'Alpha'), advRow('s', 'Alpha')],
      teamResolutions: resolutions({ Alpha: teams[0], Beta: teams[1] }),
    });
    expect(r.blockers.some((b) => b.startsWith('duplicate_eff_team_season_team'))).toBe(
      true
    );
  });

  it('deterministic order/report', () => {
    const a = basePlan();
    const b = basePlan();
    expect(JSON.stringify(a.blockers)).toBe(JSON.stringify(b.blockers));
    expect(JSON.stringify(a.games)).toBe(JSON.stringify(b.games));
    expect(a.expectedConfirmation).toBe(UNIT_GRADE_SOURCE_CONFIRMATION);
  });

  it('PPA fallback row maps when team is on game; wrong team fails closed', () => {
    const teams = fbs();
    const ok = basePlan({
      ppaGameByWeek: {
        1: [{ id: '401', team: 'Alpha', offense: { ppa: 0.2 }, defense: { ppa: -0.1 } }],
      },
    });
    expect(ok.ppaGames).toHaveLength(1);
    expect(ok.ppaGames[0].ppaOffense).toBe(0.2);
    const bad = basePlan({
      teamResolutions: resolutions({
        Alpha: teams[0],
        Beta: teams[1],
        Gamma: teams[2],
      }),
      ppaGameByWeek: {
        1: [{ id: '401', team: 'Gamma', offense: 0.2, defense: -0.1 }],
      },
    });
    expect(bad.blockers.some((b) => b.startsWith('ppa_team_game_team_not_in_game'))).toBe(
      true
    );
    expect(bad.ppaGames).toHaveLength(0);
  });

  it('COMMIT confirmation required for writeSafe', () => {
    const preview = basePlan({ mode: 'PREVIEW' });
    expect(preview.writeSafe).toBe(true);
    const bad = basePlan({ mode: 'COMMIT', confirmation: 'NOPE' });
    expect(bad.writeSafe).toBe(false);
    const ok = basePlan({
      mode: 'COMMIT',
      confirmation: UNIT_GRADE_SOURCE_CONFIRMATION,
    });
    expect(ok.writeSafe).toBe(true);
  });

  it('exactly 138 valid FBS membership rows is a valid frame', () => {
    const r = basePlan();
    expect(r.writeSafe).toBe(true);
    expect(r.blockers.some((b) => b.includes('fbs_membership'))).toBe(false);
    expect(r.blockers).not.toContain('fbs_team_membership_missing_id');
    expect(r.blockers).not.toContain('duplicate_fbs_team_membership');
    expect(r.blockers.some((b) => b.startsWith('fbs_population_not_138'))).toBe(false);
    expect(r.proposedSourceCoverage.status).not.toBe('FRAME_INVALID');
  });

  it('138 valid FBS rows plus one blank FBS row is FRAME_INVALID', () => {
    const r = basePlan({
      memberships: [...memberships(), { teamId: '   ', level: 'fbs' }],
    });
    expect(r.writeSafe).toBe(false);
    expect(r.proposedSourceCoverage.status).toBe('FRAME_INVALID');
    expect(r.blockers).toContain('fbs_membership_row_count_not_138:139');
    expect(r.blockers).toContain('fbs_team_membership_missing_id');
    expect(r.blockers).toContain('proposed_source_frame_invalid');
  });

  it('138 FBS rows with a duplicate (137 unique IDs) is invalid', () => {
    const teams = fbs();
    const rows = memberships();
    rows[137] = { teamId: teams[0], level: 'fbs' };
    const r = basePlan({ memberships: rows });
    expect(r.writeSafe).toBe(false);
    expect(r.proposedSourceCoverage.status).toBe('FRAME_INVALID');
    expect(r.blockers).toContain('duplicate_fbs_team_membership');
    expect(r.blockers).toContain('fbs_population_not_138:137');
    expect(r.blockers).toContain('proposed_source_frame_invalid');
  });

  it('extra FCS membership rows do not alter the 138-FBS exact-row rule', () => {
    const r = basePlan({
      memberships: [...memberships(), { teamId: 'fcs-extra', level: 'fcs' }],
    });
    expect(r.writeSafe).toBe(true);
    expect(r.blockers.some((b) => b.includes('fbs_membership'))).toBe(false);
    expect(r.blockers).not.toContain('fbs_team_membership_missing_id');
    expect(r.proposedSourceCoverage.status).not.toBe('FRAME_INVALID');
  });
});

describe('unit-grade source ingest provider safety', () => {
  it('configured process concurrency <=1 for this writer', () => {
    expect(CFBD_UNIT_GRADE_SOURCE_PROCESS_MAX_CONCURRENCY).toBe(1);
    expect(new SequentialJsonFetcher().maxConcurrency).toBe(1);
    expect(CFBD_LEASE_SEMANTICS).toMatch(/maxConcurrency=1/);
    expect(CFBD_LEASE_SEMANTICS).toMatch(/leaseMs=75000/);
  });

  it('Retry-After respected and fail closed after retry exhaustion', async () => {
    expect(parseRetryAfterMs('2', 1000)).toBe(2000);
    expect(parseRetryAfterMs('Wed, 21 Oct 2015 07:28:00 GMT', 1500)).toBe(1500);

    const waits: number[] = [];
    const fetcher = new SequentialJsonFetcher();
    await expect(
      fetcher.getJson({
        url: 'https://api.collegefootballdata.com/games',
        endpointLabel: '/games',
        apiKey: 'k',
        sleepImpl: async (ms) => {
          waits.push(ms);
        },
        fetchImpl: async () =>
          ({
            status: 429,
            ok: false,
            headers: { get: () => '1' },
            json: async () => [],
          }) as unknown as Response,
      })
    ).rejects.toThrow(/HTTP 429 after/);
    expect(waits.length).toBe(CFBD_UNIT_GRADE_SOURCE_MAX_RETRIES - 1);
    expect(waits[0]).toBe(1000);

    let calls = 0;
    const okFetcher = new SequentialJsonFetcher();
    const ok = await okFetcher.getJson({
      url: 'https://api.collegefootballdata.com/games',
      endpointLabel: '/games',
      apiKey: 'k',
      sleepImpl: async () => undefined,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            status: 429,
            ok: false,
            headers: { get: () => '1' },
            json: async () => [],
          } as unknown as Response;
        }
        return {
          status: 200,
          ok: true,
          headers: { get: () => null },
          json: async () => [{ id: 1 }],
        } as unknown as Response;
      },
    });
    expect(ok.status).toBe(200);
    expect((ok.body as unknown[]).length).toBe(1);
  });

  it('no Promise.all over heavy provider week calls; sequential weeks', async () => {
    const seen: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      seen.push(url);
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        json: async () => [],
      } as unknown as Response;
    };
    await fetchUnitGradeSourcePayloads({
      season: 2026,
      weeks: [1, 2],
      apiKey: 'k',
      fetchImpl: fetchImpl as typeof fetch,
    });
    const labels = seen.map((u) => {
      if (u.includes('/stats/season/advanced')) return 'season';
      if (u.includes('/stats/game/advanced')) return 'adv';
      if (u.includes('/ppa/games')) return 'ppa';
      return 'games';
    });
    expect(labels).toEqual(['games', 'games', 'season', 'adv', 'ppa', 'adv', 'ppa']);
  });

  it('retains providerCalls and invoked endpoint after a later fetch fails', async () => {
    const fetcher = new SequentialJsonFetcher();
    await expect(
      fetchUnitGradeSourcePayloads({
        season: 2026,
        weeks: [1],
        apiKey: 'k',
        fetcher,
        fetchImpl: (async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes('/stats/season/advanced')) {
            throw new Error('season boom');
          }
          return {
            status: 200,
            ok: true,
            headers: { get: () => null },
            json: async () => [{ id: 401 }],
          } as unknown as Response;
        }) as typeof fetch,
      })
    ).rejects.toThrow(/season boom/);
    expect(fetcher.providerCalls).toBeGreaterThan(0);
    expect(fetcher.endpointsInvoked).toContain('/games');
    const tel = snapshotProviderTelemetry(fetcher);
    expect(tel.providerCalls).toBeGreaterThan(0);
    expect(tel.endpointsInvoked).toContain('/games');
    expect(tel.responseRowCounts).not.toEqual({ status: 'partial_unavailable' });
    if (!('status' in tel.responseRowCounts)) {
      expect(tel.responseRowCounts.games).toBe(1);
    }
  });
});

describe('unit-grade source ingest Prisma metric projection', () => {
  it('pickEffMetricFields drops planner metadata from PlannedEff rows', () => {
    const metrics = mapAdvancedMetrics(advRow('401', 'Alpha'));
    const gameRow: PlannedEffGameRow = {
      kind: 'CREATE',
      gameIdCfbd: '401',
      teamIdInternal: 'alpha-id',
      ...metrics,
    };
    const seasonRow: PlannedEffSeasonRow = {
      kind: 'UPDATE',
      season: 2026,
      teamIdInternal: 'alpha-id',
      ...metrics,
    };
    const fromGame = pickEffMetricFields(gameRow);
    const fromSeason = pickEffMetricFields(seasonRow);
    expect(Object.prototype.hasOwnProperty.call(fromGame, 'kind')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(fromGame, 'gameIdCfbd')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(fromGame, 'teamIdInternal')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(fromGame, 'season')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(fromSeason, 'kind')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(fromSeason, 'gameIdCfbd')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(fromSeason, 'teamIdInternal')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(fromSeason, 'season')).toBe(false);
    expect(Object.keys(fromGame).sort()).toEqual(EFF_METRIC_FIELD_KEYS.slice().sort());
    expect(fromGame.offEpa).toBe(0.1);
    expect(fromSeason.runEpa).toBe(0.05);
  });
});

describe('unit-grade source ingest CFBD v2 URL contract', () => {
  it('/games uses classification=fbs and not division', () => {
    const url = new URL(buildGamesUrl(2026, 3));
    expect(url.pathname.endsWith('/games')).toBe(true);
    expect(url.searchParams.get('year')).toBe('2026');
    expect(url.searchParams.get('week')).toBe('3');
    expect(url.searchParams.get('seasonType')).toBe('regular');
    expect(url.searchParams.get('classification')).toBe('fbs');
    expect(url.searchParams.has('division')).toBe(false);
  });

  it('/stats/season/advanced uses explicit classification=fbs', () => {
    const url = new URL(buildAdvancedSeasonUrl(2026));
    expect(url.pathname.endsWith('/stats/season/advanced')).toBe(true);
    expect(url.searchParams.get('year')).toBe('2026');
    expect(url.searchParams.get('classification')).toBe('fbs');
    expect(url.searchParams.has('seasonType')).toBe(false);
    expect(url.searchParams.has('division')).toBe(false);
  });

  it('/stats/game/advanced has no classification or division', () => {
    const url = new URL(buildAdvancedGameUrl(2026, 2));
    expect(url.pathname.endsWith('/stats/game/advanced')).toBe(true);
    expect(url.searchParams.get('year')).toBe('2026');
    expect(url.searchParams.get('week')).toBe('2');
    expect(url.searchParams.get('seasonType')).toBe('regular');
    expect(url.searchParams.has('classification')).toBe(false);
    expect(url.searchParams.has('division')).toBe(false);
  });

  it('/ppa/games uses explicit classification=fbs', () => {
    const url = new URL(buildPpaGameUrl(2026, 4));
    expect(url.pathname.endsWith('/ppa/games')).toBe(true);
    expect(url.searchParams.get('year')).toBe('2026');
    expect(url.searchParams.get('week')).toBe('4');
    expect(url.searchParams.get('seasonType')).toBe('regular');
    expect(url.searchParams.get('classification')).toBe('fbs');
  });
});

describe('unit-grade source ingest current CFBD ppa mapping', () => {
  it('maps current advanced ppa into legacy persisted EPA-named columns, including zero', () => {
    const nonzero = mapAdvancedMetrics({
      offense: {
        ppa: 0.21,
        successRate: 0.4,
        explosiveness: 1.2,
        lineYards: 3.4,
        rushingPlays: { ppa: 0.07, successRate: 0.42 },
        passingPlays: { ppa: 0.09, successRate: 0.45 },
        havoc: { total: 0.11 },
      },
      defense: {
        ppa: -0.18,
        successRate: 0.38,
        explosiveness: 1.0,
        stuffRate: 0.22,
        havoc: { total: 0.2 },
      },
    });
    expect(nonzero.offEpa).toBe(0.21);
    expect(nonzero.defEpa).toBe(-0.18);
    expect(nonzero.runEpa).toBe(0.07);
    expect(nonzero.passEpa).toBe(0.09);
    expect(nonzero.offSr).toBe(0.4);
    expect(nonzero.defSr).toBe(0.38);
    expect(nonzero.isoPppOff).toBe(1.2);
    expect(nonzero.isoPppDef).toBe(1.0);
    expect(nonzero.lineYardsOff).toBe(3.4);
    expect(nonzero.runSr).toBe(0.42);
    expect(nonzero.passSr).toBe(0.45);
    expect(nonzero.stuffRate).toBe(0.22);
    expect(nonzero.havocOff).toBe(0.11);
    expect(nonzero.havocDef).toBe(0.2);
    expect(nonzero.earlyDownEpa).toBeNull();
    expect(nonzero.lateDownEpa).toBeNull();
    expect(nonzero.avgFieldPosition).toBeNull();

    const zeros = mapAdvancedMetrics({
      offense: {
        ppa: 0,
        rushingPlays: { ppa: 0 },
        passingPlays: { ppa: 0 },
      },
      defense: { ppa: 0 },
    });
    expect(zeros.offEpa).toBe(0);
    expect(zeros.defEpa).toBe(0);
    expect(zeros.runEpa).toBe(0);
    expect(zeros.passEpa).toBe(0);
  });
});

describe('unit-grade source ingest proposed coverage', () => {
  it('schedule-only proposal leaves raw and legacy coverage incomplete', () => {
    const r = basePlan();
    const cov = r.proposedSourceCoverage;
    expect(cov.rawMetricCoverageComplete).toBe(false);
    expect(cov.legacyComputeCompatibleCoverageComplete).toBe(false);
    expect(cov.safeToRunExistingCompute).toBe(false);
    expect(cov.legacyCompatibilityDisclaimer).toBe(LEGACY_COMPATIBILITY_DISCLAIMER);
    expect(cov.rawMetricCoverage.lineYardsOff.distinctTeams).toBe(0);
    expect(cov.rawMetricCoverage.runEpa.finiteRows).toBe(0);
    expect(cov.rawMetricCoverage.passEpa.distinctTeams).toBe(0);
    expect(cov.legacyComputeCompatibleCoverage.offRun.coveredTeamCount).toBe(0);
    expect(cov.rawMetricCoverage.lineYardsOff.missingTeamIds).toHaveLength(138);
    expect(r.writeSafe).toBe(true);
  });

  it('current-shaped advanced ppa increases the matching raw coverage', () => {
    const r = basePlan({
      advancedGameByWeek: { 1: [advRow('401', 'Alpha')] },
    });
    const cov = r.proposedSourceCoverage;
    expect(cov.rawMetricCoverage.runEpa.distinctTeams).toBe(1);
    expect(cov.rawMetricCoverage.passEpa.distinctTeams).toBe(1);
    expect(cov.rawMetricCoverage.lineYardsOff.distinctTeams).toBe(1);
    expect(cov.rawMetricCoverage.isoPppOff.distinctTeams).toBe(1);
    expect(cov.rawMetricCoverage.isoPppDef.distinctTeams).toBe(1);
    expect(cov.rawMetricCoverage.defSr.distinctTeams).toBe(1);
    expect(cov.rawMetricCoverage.passSr.distinctTeams).toBe(1);
    expect(cov.rawMetricCoverage.ppaOffense.distinctTeams).toBe(0);
    expect(cov.safeToRunExistingCompute).toBe(false);
    expect(cov.rawMetricCoverageComplete).toBe(false);
  });

  it('PPA fallback covers legacy without marking raw runEpa/passEpa present', () => {
    const r = basePlan({
      ppaGameByWeek: {
        1: [{ id: '401', team: 'Alpha', offense: { ppa: 0.2 }, defense: { ppa: -0.1 } }],
      },
    });
    const cov = r.proposedSourceCoverage;
    expect(cov.rawMetricCoverage.ppaOffense.distinctTeams).toBe(1);
    expect(cov.rawMetricCoverage.ppaDefense.distinctTeams).toBe(1);
    expect(cov.rawMetricCoverage.runEpa.distinctTeams).toBe(0);
    expect(cov.rawMetricCoverage.passEpa.distinctTeams).toBe(0);
    expect(cov.legacyComputeCompatibleCoverage.offRun.coveredTeamCount).toBe(1);
    expect(cov.legacyComputeCompatibleCoverage.defRun.coveredTeamCount).toBe(1);
    expect(cov.legacyComputeCompatibleCoverage.offPass.coveredTeamCount).toBe(1);
    expect(cov.legacyComputeCompatibleCoverage.defPass.coveredTeamCount).toBe(1);
    expect(cov.safeToRunExistingCompute).toBe(false);
    expect(cov.rawMetricCoverageComplete).toBe(false);
  });

  it('does not zero-fill missing metrics', () => {
    const r = basePlan({
      advancedGameByWeek: {
        1: [
          {
            id: '401',
            team: 'Alpha',
            offense: { successRate: 0.4 },
            defense: {},
          },
        ],
      },
    });
    const cov = r.proposedSourceCoverage;
    expect(cov.rawMetricCoverage.lineYardsOff.finiteRows).toBe(0);
    expect(cov.rawMetricCoverage.runEpa.finiteRows).toBe(0);
    expect(cov.rawMetricCoverage.passEpa.finiteRows).toBe(0);
    expect(r.effGames[0].lineYardsOff).toBeNull();
    expect(r.effGames[0].runEpa).toBeNull();
    expect(cov.safeToRunExistingCompute).toBe(false);
  });
});

describe('unit-grade source ingest reporting integrity', () => {
  it('team mapping inventory uses all payloads and ignores out-of-frame advanced teams', () => {
    const teams = fbs();
    const r = basePlan({
      teamResolutions: resolutions({
        Alpha: teams[0],
        Beta: teams[1],
        SeasonTeam: teams[2],
      }),
      advancedGameByWeek: {
        1: [advRow('999', 'GhostTeam')],
      },
      advancedSeason: [advRow('s', 'SeasonTeam')],
    });
    expect(r.providerTeamNamesEncountered).toEqual(
      expect.arrayContaining(['Alpha', 'Beta', 'GhostTeam', 'SeasonTeam'])
    );
    expect(r.unmappedProviderTeams).not.toContain('GhostTeam');
    expect(r.unmappedProviderTeams).toEqual([]);
    expect(r.mappedProviderTeamCount).toBeGreaterThanOrEqual(3);
    expect(r.distinctMappedInternalIds).toEqual(
      expect.arrayContaining([teams[0], teams[1], teams[2]])
    );
    expect(r.skipped.some((s) => s.includes('game_not_in_frame'))).toBe(true);
  });

  it('rolled-back commit telemetry records a mutation attempt without persisted writes', () => {
    const rolled = mutationTelemetryAfterCommitAttempt({
      commitReached: true,
      commitSucceeded: false,
    });
    expect(rolled.mutationsInvoked).toBe(true);
    expect(rolled.commitSucceeded).toBe(false);
    expect(rolled.transactionRolledBack).toBe(true);
    expect(rolled.persistedWrites).toBe(false);
  });

  it('successful all-NO_CHANGE COMMIT does not claim persisted writes', () => {
    const noop = mutationTelemetryAfterCommitAttempt({
      commitReached: true,
      commitSucceeded: true,
      totalCommitted: 0,
    });
    expect(noop.mutationsInvoked).toBe(true);
    expect(noop.commitSucceeded).toBe(true);
    expect(noop.transactionRolledBack).toBe(false);
    expect(noop.persistedWrites).toBe(false);
  });

  it('successful COMMIT with at least one CREATE/UPDATE claims persisted writes', () => {
    const wrote = mutationTelemetryAfterCommitAttempt({
      commitReached: true,
      commitSucceeded: true,
      totalCommitted: 1,
    });
    expect(wrote.mutationsInvoked).toBe(true);
    expect(wrote.commitSucceeded).toBe(true);
    expect(wrote.transactionRolledBack).toBe(false);
    expect(wrote.persistedWrites).toBe(true);
  });
});
