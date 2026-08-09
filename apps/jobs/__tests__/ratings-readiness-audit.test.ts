/**
 * Phase 2C-2A — Mocked tests for read-only 2026 ratings readiness audit.
 * No network. No production DB. No mutations. No ratings computation.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  decimalToAuditNumber,
  runRatingsReadinessAudit,
  sanitizeRatingsReadinessRuntimeError,
} from '../audit-ratings-readiness';
import {
  AUDIT_SEASON,
  COMPARISON_SEASON,
  DEFAULT_WORKFLOW_RISK_FINDINGS,
  auditRatingsReadiness,
  buildFixtureGame,
  buildFixtureMembership,
  buildFixtureTeam,
  formatRatingsReadinessReport,
  parseRatingsReadinessArgs,
  type CommitsRow,
  type GameStatRow,
  type PowerRatingRow,
  type RatingsReadinessAuditInput,
  type SeasonRatingRow,
  type SeasonStatRow,
  type TalentRow,
  type UnitGradeRow,
} from '../src/preseason/ratings-readiness-audit';
import { Prisma } from '@prisma/client';

const AS_OF_PRESEASON = new Date('2026-08-06T12:00:00.000Z');
const EARLIEST_KICKOFF = new Date('2026-08-29T16:00:00.000Z');

function healthyInput(
  overrides: Partial<RatingsReadinessAuditInput> = {}
): RatingsReadinessAuditInput {
  const named = [
    buildFixtureTeam('alabama', 'SEC'),
    buildFixtureTeam('georgia', 'SEC'),
    buildFixtureTeam('clemson', 'ACC'),
    buildFixtureTeam('ohio-state', 'Big Ten'),
  ];
  const namedIds = new Set(named.map((t) => t.id));
  const pad: ReturnType<typeof buildFixtureTeam>[] = [];
  for (let i = 1; pad.length + named.length < 138; i++) {
    const id = `team-${String(i).padStart(3, '0')}`;
    if (namedIds.has(id)) continue;
    pad.push(buildFixtureTeam(id, 'SEC'));
  }
  const teams = [...named, ...pad];
  const memberships = teams.flatMap((t) => [
    buildFixtureMembership(2026, t.id, 'fbs', t.conference),
    buildFixtureMembership(2025, t.id, 'fbs', null),
  ]);
  const games = [
    buildFixtureGame({
      homeTeamId: 'georgia',
      awayTeamId: 'clemson',
      date: EARLIEST_KICKOFF,
    }),
    buildFixtureGame({
      id: '2026-wk2-alabama-ohio-state',
      week: 2,
      homeTeamId: 'ohio-state',
      awayTeamId: 'alabama',
      date: new Date('2026-09-12T16:00:00.000Z'),
    }),
  ];
  const talent: TalentRow[] = teams.flatMap((t) => [
    {
      season: 2026,
      teamId: t.id,
      talentComposite: 80 + t.id.length,
      blueChipsPct: 0.4,
      sourceUpdatedAt: new Date('2026-02-01T00:00:00.000Z'),
    },
    {
      season: 2025,
      teamId: t.id,
      talentComposite: 75,
      blueChipsPct: 0.3,
      sourceUpdatedAt: new Date('2025-02-01T00:00:00.000Z'),
    },
  ]);
  const commits: CommitsRow[] = teams.flatMap((t) => [
    {
      season: 2026,
      teamId: t.id,
      commitsTotal: 20,
      classRank: 10,
      avgCommitRating: 0.9,
      sourceUpdatedAt: new Date('2026-02-01T00:00:00.000Z'),
    },
    {
      season: 2025,
      teamId: t.id,
      commitsTotal: 18,
      classRank: 12,
      avgCommitRating: 0.85,
      sourceUpdatedAt: new Date('2025-02-01T00:00:00.000Z'),
    },
  ]);
  const seasonStats: SeasonStatRow[] = teams.map((t) => ({
    season: 2025,
    teamId: t.id,
    yppOff: 6,
    successOff: 0.5,
    epaOff: 0.1,
    yppDef: 5,
    successDef: 0.4,
    epaDef: -0.05,
    createdAt: new Date('2025-12-01T00:00:00.000Z'),
  }));
  const gameStats: GameStatRow[] = [];
  const seasonRatings: SeasonRatingRow[] = teams.map((t) => ({
    season: 2025,
    teamId: t.id,
    modelVersion: 'v2',
    games: 12,
    rating: 10,
    powerRating: 10,
    confidence: 0.9,
    dataSource: 'game+season',
  }));
  const powerRatings: PowerRatingRow[] = [];
  const unitGrades: UnitGradeRow[] = teams.flatMap((t) => [
    {
      teamId: t.id,
      season: 2025,
      offRunGrade: 0.1,
      defRunGrade: 0.2,
      offPassGrade: 0.3,
      defPassGrade: 0.4,
      offExplosiveness: 0.5,
      defExplosiveness: 0.6,
      havocGrade: 0.7,
    },
  ]);

  return {
    season: AUDIT_SEASON,
    comparisonSeason: COMPARISON_SEASON,
    asOf: AS_OF_PRESEASON,
    teams,
    memberships,
    games,
    talent,
    commits,
    seasonStats,
    gameStats,
    seasonRatings,
    powerRatings,
    unitGrades,
    workflowRiskFindings: DEFAULT_WORKFLOW_RISK_FINDINGS,
    ...overrides,
  };
}

describe('parseRatingsReadinessArgs', () => {
  it('accepts --season 2026', () => {
    expect(parseRatingsReadinessArgs(['--season', '2026'])).toEqual({
      ok: true,
      season: 2026,
    });
  });

  it('rejects seasons other than 2026', () => {
    const r = parseRatingsReadinessArgs(['--season', '2025']);
    expect(r.ok).toBe(false);
  });

  it('rejects duplicate --season', () => {
    const r = parseRatingsReadinessArgs([
      '--season',
      '2026',
      '--season',
      '2026',
    ]);
    expect(r.ok).toBe(false);
    expect(
      r.ok === false &&
        r.errors.some((e) => e.includes('--season may be provided exactly once'))
    ).toBe(true);
  });

  it('rejects write-related flags', () => {
    for (const flag of [
      '--write',
      '--execute',
      '--upsert',
      '--persist',
      '--confirm-write',
      '--force',
    ]) {
      const r = parseRatingsReadinessArgs(['--season', '2026', flag]);
      expect(r.ok).toBe(false);
    }
  });

  it('rejects unexpected positional arguments', () => {
    const r = parseRatingsReadinessArgs(['--season', '2026', 'extra']);
    expect(r.ok).toBe(false);
  });
});

describe('auditRatingsReadiness', () => {
  it('healthy structural inventory', () => {
    const result = auditRatingsReadiness(healthyInput());
    expect(result.structuralOk).toBe(true);
    expect(result.ratingsWriteAuthorized).toBe(false);
    expect(result.preseason).toBe(true);
    expect(result.fbsPopulation.fbsMembershipCount).toBe(138);
    expect(result.scheduleContext.totalGames).toBe(2);
  });

  it('missing 2026 FBS membership fails', () => {
    const input = healthyInput({
      memberships: healthyInput().memberships.filter((m) => m.season !== 2026),
    });
    const result = auditRatingsReadiness(input);
    expect(result.structuralOk).toBe(false);
    expect(
      result.structuralIssues.some((i) => i.code === 'no_fbs_membership')
    ).toBe(true);
  });

  it('schedule team missing from Team fails', () => {
    const input = healthyInput();
    input.games.push(
      buildFixtureGame({
        id: '2026-wk1-ghost-home',
        homeTeamId: 'ghost-home',
        awayTeamId: 'alabama',
      })
    );
    const result = auditRatingsReadiness(input);
    expect(result.structuralOk).toBe(false);
    expect(
      result.structuralIssues.some(
        (i) => i.code === 'schedule_team_missing_from_team'
      )
    ).toBe(true);
  });

  it('schedule team missing from FBS membership fails', () => {
    const input = healthyInput();
    input.teams.push(buildFixtureTeam('fcs-only', 'Big Sky'));
    input.games.push(
      buildFixtureGame({
        id: '2026-wk1-fcs-only-alabama',
        homeTeamId: 'alabama',
        awayTeamId: 'fcs-only',
      })
    );
    const result = auditRatingsReadiness(input);
    expect(result.structuralOk).toBe(false);
    expect(
      result.structuralIssues.some(
        (i) => i.code === 'schedule_team_missing_from_fbs'
      )
    ).toBe(true);
  });

  it('FBS team absent from schedule is reported but does not automatically fail', () => {
    const input = healthyInput();
    const result = auditRatingsReadiness(input);
    expect(result.structuralOk).toBe(true);
    expect(result.fbsPopulation.fbsMembershipCount).toBe(138);
    expect(result.fbsPopulation.fbsTeamsAbsentFromSchedule.length).toBeGreaterThan(
      0
    );
    expect(
      result.dataCoverageFindings.some(
        (f) => f.code === 'fbs_absent_from_schedule'
      )
    ).toBe(true);
    expect(result.operatorReviewRequired).toBe(true);
  });

  it('talent coverage calculation', () => {
    const input = healthyInput({
      talent: healthyInput().talent.filter(
        (t) => !(t.season === 2026 && t.teamId === 'clemson')
      ),
    });
    const result = auditRatingsReadiness(input);
    const t2026 = result.talentBySeason.find((t) => t.season === 2026)!;
    expect(t2026.fbsCovered).toBe(137);
    expect(t2026.fbsMissing).toBe(1);
    expect(t2026.sampleMissingFbsIds).toContain('clemson');
    expect(t2026.coveragePct).toBe(99.3);
  });

  it('commit coverage calculation', () => {
    const input = healthyInput({
      commits: healthyInput().commits.filter(
        (c) => !(c.season === 2026 && c.teamId === 'georgia')
      ),
    });
    const result = auditRatingsReadiness(input);
    const c2026 = result.commitsBySeason.find((c) => c.season === 2026)!;
    expect(c2026.fbsMissing).toBe(1);
    expect(c2026.sampleMissingFbsIds).toContain('georgia');
  });

  it('season-stat coverage calculation', () => {
    const result = auditRatingsReadiness(healthyInput());
    const s2025 = result.seasonStatsBySeason.find((s) => s.season === 2025)!;
    const s2026 = result.seasonStatsBySeason.find((s) => s.season === 2026)!;
    expect(s2025.fbsCovered).toBe(138);
    expect(s2025.withEpa).toBe(138);
    expect(s2026.totalRows).toBe(0);
  });

  it('game-stat coverage calculation', () => {
    const input = healthyInput({
      gameStats: [
        {
          season: 2025,
          teamId: 'alabama',
          week: 1,
          yppOff: 6,
          successOff: 0.5,
          epaOff: 0.1,
          yppDef: 5,
          successDef: 0.4,
          epaDef: -0.1,
          createdAt: new Date('2025-09-01T00:00:00.000Z'),
          updatedAt: new Date('2025-09-01T00:00:00.000Z'),
        },
      ],
    });
    const result = auditRatingsReadiness(input);
    const g2025 = result.gameStatsBySeason.find((s) => s.season === 2025)!;
    expect(g2025.totalRows).toBe(1);
    expect(g2025.fbsCovered).toBe(1);
  });

  it('preseason detection before earliest kickoff', () => {
    const result = auditRatingsReadiness(healthyInput());
    expect(result.preseason).toBe(true);
  });

  it('empty 2026 stats are allowed during preseason', () => {
    const result = auditRatingsReadiness(healthyInput());
    expect(result.structuralOk).toBe(true);
    expect(
      result.dataCoverageFindings.some(
        (f) => f.code === 'preseason_empty_stats_expected'
      )
    ).toBe(true);
  });

  it('final game before earliest kickoff fails', () => {
    const input = healthyInput();
    input.games[0].status = 'final';
    const result = auditRatingsReadiness(input);
    expect(result.structuralOk).toBe(false);
    expect(
      result.structuralIssues.some((i) => i.code === 'final_before_kickoff')
    ).toBe(true);
  });

  it('populated score before earliest kickoff fails', () => {
    const input = healthyInput();
    input.games[0].homeScore = 21;
    const result = auditRatingsReadiness(input);
    expect(result.structuralOk).toBe(false);
    expect(
      result.structuralIssues.some((i) => i.code === 'scores_before_kickoff')
    ).toBe(true);
  });

  it('existing 2026 ratings set writeCollisionRisk=true', () => {
    const input = healthyInput({
      seasonRatings: [
        ...healthyInput().seasonRatings,
        {
          season: 2026,
          teamId: 'alabama',
          modelVersion: 'v2',
          games: 0,
          rating: 5,
          powerRating: 5,
          confidence: 0.2,
          dataSource: 'baseline',
        },
      ],
    });
    const result = auditRatingsReadiness(input);
    expect(result.teamSeasonRatingCollisionRisk).toBe(true);
    expect(result.weeklyPowerRatingCollisionRisk).toBe(false);
    expect(result.writeCollisionRisk).toBe(true);
    expect(result.ratingsWriteAuthorized).toBe(false);
  });

  it('PowerRating-only output sets writeCollisionRisk=true', () => {
    const input = healthyInput({
      powerRatings: [
        {
          id: 'p1',
          teamId: 'alabama',
          season: 2026,
          week: 1,
          rating: 10,
          modelVersion: 'v2',
          confidence: 0.5,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    });
    const result = auditRatingsReadiness(input);
    expect(result.teamSeasonRatingCollisionRisk).toBe(false);
    expect(result.weeklyPowerRatingCollisionRisk).toBe(true);
    expect(result.writeCollisionRisk).toBe(true);
    expect(result.ratingsWriteAuthorized).toBe(false);
  });

  it('both ratings tables empty sets collision risk false', () => {
    const result = auditRatingsReadiness(
      healthyInput({ seasonRatings: [], powerRatings: [] })
    );
    expect(result.teamSeasonRatingCollisionRisk).toBe(false);
    expect(result.weeklyPowerRatingCollisionRisk).toBe(false);
    expect(result.writeCollisionRisk).toBe(false);
  });

  it('empty target-season schedule fails structurally', () => {
    const result = auditRatingsReadiness(healthyInput({ games: [] }));
    expect(result.structuralOk).toBe(false);
    expect(
      result.structuralIssues.some((i) => i.code === 'no_schedule_games')
    ).toBe(true);
  });

  it('all-invalid schedule dates fail structurally', () => {
    const input = healthyInput();
    input.games = input.games.map((g) => ({ ...g, date: 'not-a-date' }));
    const result = auditRatingsReadiness(input);
    expect(result.structuralOk).toBe(false);
    expect(
      result.structuralIssues.some((i) => i.code === 'no_valid_kickoff')
    ).toBe(true);
  });

  it('preseason TeamSeasonStat rows produce a review finding', () => {
    const input = healthyInput({
      seasonStats: [
        ...healthyInput().seasonStats,
        {
          season: 2026,
          teamId: 'alabama',
          yppOff: 6,
          successOff: 0.5,
          epaOff: 0.1,
          yppDef: 5,
          successDef: 0.4,
          epaDef: -0.05,
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
        },
      ],
    });
    const result = auditRatingsReadiness(input);
    expect(result.preseason).toBe(true);
    expect(result.structuralOk).toBe(true);
    expect(
      result.dataCoverageFindings.some(
        (f) => f.code === 'preseason_season_stats_present'
      )
    ).toBe(true);
  });

  it('preseason TeamGameStat rows produce a review finding', () => {
    const input = healthyInput({
      gameStats: [
        {
          season: 2026,
          teamId: 'alabama',
          week: 0,
          yppOff: 6,
          successOff: 0.5,
          epaOff: 0.1,
          yppDef: 5,
          successDef: 0.4,
          epaDef: -0.1,
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
          updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
      ],
    });
    const result = auditRatingsReadiness(input);
    expect(result.preseason).toBe(true);
    expect(
      result.dataCoverageFindings.some(
        (f) => f.code === 'preseason_game_stats_present'
      )
    ).toBe(true);
  });

  it('FBS membership team absent from Team fails structurally', () => {
    const input = healthyInput();
    input.memberships.push(buildFixtureMembership(2026, 'orphan-fbs'));
    const result = auditRatingsReadiness(input);
    expect(result.structuralOk).toBe(false);
    expect(
      result.structuralIssues.some(
        (i) => i.code === 'fbs_membership_missing_from_team'
      )
    ).toBe(true);
  });

  it('formatted output includes required metrics and capped samples', () => {
    const input = healthyInput();
    input.teams.push(buildFixtureTeam('bye-team', 'SEC'));
    input.memberships.push(buildFixtureMembership(2026, 'bye-team'));
    input.memberships.push(buildFixtureMembership(2025, 'bye-team'));
    const result = auditRatingsReadiness(input);
    const report = formatRatingsReadinessReport(result);
    expect(report).toContain('nonNullTalentComposite=');
    expect(report).toContain('nonNullClassRank=');
    expect(report).toContain('meaningfulOffense=');
    expect(report).toContain('teamSeasonRatingCollisionRisk=');
    expect(report).toContain('weeklyPowerRatingCollisionRisk=');
    expect(report).toContain('confidenceMin/Avg/Max=');
    expect(report).toContain('fbsTeamsAbsentFromSchedule:');
    expect(report).toContain('bye-team');
    expect(report).toContain('talent-roster-sync.yml');
    expect(report).toContain('Node 20');
    expect(report).toContain('stats-season-cfbd.yml');
    expect(report).toContain('active nightly schedule');
  });

  it('workflow-risk findings identify Node/action/trigger differences', () => {
    const codes = DEFAULT_WORKFLOW_RISK_FINDINGS.map((f) => f.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'ratings_v1_yml',
        'ratings_v2_yml',
        'talent_cfbd_yml',
        'talent_roster_sync_yml',
        'talent_commits_sync_yml',
        'stats_cfbd_yml',
        'stats_season_cfbd_yml',
        'stats_advanced_cfbd_yml',
        'nightly_ingest_yml',
      ])
    );
    const roster = DEFAULT_WORKFLOW_RISK_FINDINGS.find(
      (f) => f.code === 'talent_roster_sync_yml'
    )!;
    expect(roster.message).toMatch(/Node 20/);
    expect(roster.message).toMatch(/checkout@v4/);
    const statsCfbd = DEFAULT_WORKFLOW_RISK_FINDINGS.find(
      (f) => f.code === 'stats_cfbd_yml'
    )!;
    expect(statsCfbd.message).toMatch(/schedule trigger commented out/);
    expect(statsCfbd.message).toMatch(/Node 18/);
    const seasonStats = DEFAULT_WORKFLOW_RISK_FINDINGS.find(
      (f) => f.code === 'stats_season_cfbd_yml'
    )!;
    expect(seasonStats.message).toMatch(/active nightly schedule/);
  });

  it('existing ratings do not authorize a write', () => {
    const input = healthyInput({
      seasonRatings: [
        {
          season: 2026,
          teamId: 'alabama',
          modelVersion: 'v1',
          games: 0,
          rating: 1,
          powerRating: 1,
          confidence: 0.1,
          dataSource: 'baseline',
        },
      ],
    });
    const result = auditRatingsReadiness(input);
    expect(result.ratingsWriteAuthorized).toBe(false);
    expect(result.operatorReviewRequired).toBe(true);
  });

  it('existing model versions are grouped correctly', () => {
    const input = healthyInput({
      seasonRatings: [
        {
          season: 2026,
          teamId: 'alabama',
          modelVersion: 'v1',
          games: 0,
          rating: 1,
          powerRating: 1,
          confidence: 0.1,
          dataSource: 'baseline',
        },
        {
          season: 2026,
          teamId: 'georgia',
          modelVersion: 'v2',
          games: 0,
          rating: 2,
          powerRating: 2,
          confidence: 0.2,
          dataSource: 'season_only',
        },
        {
          season: 2026,
          teamId: 'clemson',
          modelVersion: 'v2',
          games: 0,
          rating: 3,
          powerRating: 3,
          confidence: 0.3,
          dataSource: 'season_only',
        },
      ],
    });
    const result = auditRatingsReadiness(input);
    const versions = result.seasonRatingsTarget.byModelVersion.map(
      (m) => m.modelVersion
    );
    expect(versions).toEqual(['v1', 'v2']);
    const v2 = result.seasonRatingsTarget.byModelVersion.find(
      (m) => m.modelVersion === 'v2'
    )!;
    expect(v2.rowCount).toBe(2);
    expect(v2.dataSourceBreakdown.season_only).toBe(2);
  });

  it('power ratings are grouped correctly by week and model version', () => {
    const input = healthyInput({
      powerRatings: [
        {
          id: 'p1',
          teamId: 'alabama',
          season: 2026,
          week: 1,
          rating: 10,
          modelVersion: 'v2',
          confidence: 0.5,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          id: 'p2',
          teamId: 'georgia',
          season: 2026,
          week: 2,
          rating: 11,
          modelVersion: 'v2',
          confidence: 0.6,
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
        {
          id: 'p3',
          teamId: 'clemson',
          season: 2026,
          week: 1,
          rating: 9,
          modelVersion: 'v1',
          confidence: 0.4,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    });
    const result = auditRatingsReadiness(input);
    expect(result.powerRatings.byModelVersion).toEqual({ v1: 1, v2: 2 });
    expect(result.powerRatings.byWeek).toEqual({ '1': 2, '2': 1 });
  });

  it('non-finite rating/confidence values fail', () => {
    const input = healthyInput({
      seasonRatings: [
        {
          season: 2026,
          teamId: 'alabama',
          modelVersion: 'v2',
          games: 0,
          rating: Number.NaN,
          powerRating: 1,
          confidence: 0.1,
          dataSource: 'baseline',
        },
      ],
      powerRatings: [
        {
          id: 'bad',
          teamId: 'georgia',
          season: 2026,
          week: 1,
          rating: Number.POSITIVE_INFINITY,
          modelVersion: 'v2',
          confidence: 0.5,
          createdAt: null,
          updatedAt: null,
        },
      ],
    });
    const result = auditRatingsReadiness(input);
    expect(result.structuralOk).toBe(false);
    expect(
      result.structuralIssues.some((i) => i.code === 'non_finite_season_rating')
    ).toBe(true);
    expect(
      result.structuralIssues.some((i) => i.code === 'non_finite_weekly_power')
    ).toBe(true);
  });

  it('unit-grade coverage calculation', () => {
    const input = healthyInput({
      unitGrades: [
        {
          teamId: 'alabama',
          season: 2026,
          offRunGrade: 0.1,
          defRunGrade: 0.2,
          offPassGrade: 0.3,
          defPassGrade: 0.4,
          offExplosiveness: 0.5,
          defExplosiveness: 0.6,
          havocGrade: 0.7,
        },
      ],
    });
    const result = auditRatingsReadiness(input);
    const u2026 = result.unitGradesBySeason.find((u) => u.season === 2026)!;
    expect(u2026.fbsCovered).toBe(1);
    expect(u2026.fbsMissing).toBe(137);
  });

  it('missing data coverage requires operator review', () => {
    const input = healthyInput({
      talent: [],
      commits: [],
    });
    const result = auditRatingsReadiness(input);
    expect(result.structuralOk).toBe(true);
    expect(result.operatorReviewRequired).toBe(true);
    expect(
      result.dataCoverageFindings.some((f) =>
        f.code.startsWith('talent_incomplete')
      )
    ).toBe(true);
  });

  it('ratingsWriteAuthorized always remains false', () => {
    const a = auditRatingsReadiness(healthyInput());
    const b = auditRatingsReadiness(
      healthyInput({
        seasonRatings: [
          {
            season: 2026,
            teamId: 'alabama',
            modelVersion: 'v2',
            games: 0,
            rating: 1,
            powerRating: 1,
            confidence: 0.9,
            dataSource: 'game+season',
          },
        ],
      })
    );
    expect(a.ratingsWriteAuthorized).toBe(false);
    expect(b.ratingsWriteAuthorized).toBe(false);
  });
});

describe('decimalToAuditNumber', () => {
  it('preserves null, finite, NaN, and infinity', () => {
    expect(decimalToAuditNumber(null)).toBeNull();
    expect(decimalToAuditNumber(undefined)).toBeNull();
    expect(decimalToAuditNumber(12.5)).toBe(12.5);
    expect(Number.isNaN(decimalToAuditNumber(Number.NaN) as number)).toBe(true);
    expect(decimalToAuditNumber(Number.POSITIVE_INFINITY)).toBe(
      Number.POSITIVE_INFINITY
    );
    expect(decimalToAuditNumber(Number.NEGATIVE_INFINITY)).toBe(
      Number.NEGATIVE_INFINITY
    );
  });

  it('preserves non-finite Prisma Decimal when supported', () => {
    const nanDec = new Prisma.Decimal(NaN);
    const converted = decimalToAuditNumber(nanDec);
    expect(converted == null || Number.isNaN(converted)).toBe(true);
  });

  it('preserved invalid TeamSeasonRating value causes structural failure', () => {
    const invalid = decimalToAuditNumber(Number.NaN);
    const input = healthyInput({
      seasonRatings: [
        {
          season: 2026,
          teamId: 'alabama',
          modelVersion: 'v2',
          games: 0,
          rating: invalid,
          powerRating: 1,
          confidence: 0.1,
          dataSource: 'baseline',
        },
      ],
    });
    const result = auditRatingsReadiness(input);
    expect(result.structuralOk).toBe(false);
    expect(
      result.structuralIssues.some((i) => i.code === 'non_finite_season_rating')
    ).toBe(true);
  });
});

describe('CLI / workflow isolation', () => {
  it('workflow is manual-only and provider-free', () => {
    const wfPath = path.join(
      __dirname,
      '../../../.github/workflows/audit-2026-ratings-readiness.yml'
    );
    const text = fs.readFileSync(wfPath, 'utf8');
    expect(text).toMatch(/workflow_dispatch:/);
    expect(text).not.toMatch(/^\s*schedule:/m);
    expect(text).not.toMatch(/^\s*push:/m);
    expect(text).not.toMatch(/^\s*pull_request:/m);
    expect(text).toMatch(/contents:\s*read/);
    expect(text).toMatch(/actions\/checkout@v6/);
    expect(text).toMatch(/actions\/setup-node@v6/);
    expect(text).toMatch(/node-version:\s*'20'/);
    expect(text).toMatch(/CFBD_API_KEY: not provided/);
    expect(text).toMatch(/ODDS_API_KEY: not provided/);
    expect(text).toMatch(/ratings computation: not invoked/);
    expect(text).toMatch(/audit-ratings-readiness\.ts/);
    expect(text).not.toMatch(/secrets\.CFBD_API_KEY|secrets\.ODDS_API_KEY/);
    expect(text).not.toMatch(/compute_ratings_v[12]\.js/);
    expect(text).not.toMatch(/node apps\/jobs\/dist\/src\/ratings/);
    expect(text).not.toMatch(/talent-cfbd\.yml|stats-cfbd\.yml|nightly-ingest\.yml/);
    expect(text).not.toMatch(/prisma migrate/);
  });

  it('audit source contains no Prisma mutation APIs', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/preseason/ratings-readiness-audit.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/from ['"]@prisma\/client['"]/);
    expect(src).not.toMatch(
      /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/
    );
    expect(src).not.toMatch(/from ['"].*compute_ratings/);
    expect(src).not.toMatch(/from ['"].*OddsApi/);
    expect(src).not.toMatch(/process\.env\.CFBD_API_KEY/);
  });

  it('CLI performs only read-store operations', () => {
    const cli = fs.readFileSync(
      path.join(__dirname, '../audit-ratings-readiness.ts'),
      'utf8'
    );
    expect(cli).toMatch(/findMany/);
    expect(cli).not.toMatch(/createMany|updateMany|upsert|deleteMany|\$transaction/);
    expect(cli).not.toMatch(/from ['"].*compute_ratings/);
    expect(cli).not.toMatch(/CFBD_API_KEY|ODDS_API_KEY/);
  });

  it('runtime errors suppress all thrown metadata and connection information', async () => {
    const malicious = {
      name: 'postgresql://audit_user:Password@db.example/gridiron',
      code: 'SuperSecretPassw0rd',
      message: 'password=SuperSecretPassw0rd',
    };
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const { exitCode } = await runRatingsReadinessAudit({
        season: 2026,
        store: {
          async loadTeams() {
            throw malicious;
          },
          async loadMemberships() {
            return [];
          },
          async loadGames() {
            return [];
          },
          async loadTalent() {
            return [];
          },
          async loadCommits() {
            return [];
          },
          async loadSeasonStats() {
            return [];
          },
          async loadGameStats() {
            return [];
          },
          async loadSeasonRatings() {
            return [];
          },
          async loadPowerRatings() {
            return [];
          },
          async loadUnitGrades() {
            return [];
          },
        },
      });
      expect(exitCode).toBe(1);
      const output = [...errorSpy.mock.calls, ...logSpy.mock.calls]
        .map((c) => c.map(String).join(' '))
        .join('\n');
      expect(output).not.toContain('postgresql://');
      expect(output).not.toContain('audit_user');
      expect(output).not.toContain('Password');
      expect(output).not.toContain('SuperSecretPassw0rd');
      expect(output).toContain(
        'Database read failed; connection details suppressed'
      );
      expect(output).toContain(
        'FAILED — read-only findings require operator review; no repair attempted'
      );
      expect(sanitizeRatingsReadinessRuntimeError(malicious)).toBe(
        'Database read failed; connection details suppressed'
      );
    } finally {
      errorSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it('no real provider or production database access occurs in tests', () => {
    // Suite uses fixtures + mock store only; never opens a live DB client.
    const testSrc = fs.readFileSync(__filename, 'utf8');
    expect(testSrc).not.toMatch(/PrismaClient\(/);
    expect(testSrc).not.toMatch(/\bfetch\s*\(/);
  });
});

describe('season-aware conference source (2C-2H-1)', () => {
  it('16. readiness audit uses membership conference for 2026', () => {
    const input = healthyInput();
    // Stale static Team.conference vs membership
    input.teams = input.teams.map((t) => ({ ...t, conference: 'Independent' }));
    for (const m of input.memberships) {
      if (m.season === 2026 && m.teamId === 'alabama') {
        m.conference = 'SEC';
      }
      if (m.season === 2026 && m.teamId === 'clemson') {
        m.conference = 'ACC';
      }
    }
    const result = auditRatingsReadiness(input);
    expect(result.fbsPopulation.conferenceSource).toBe(
      'TeamMembership.conference'
    );
    expect(result.fbsPopulation.conferenceLegacyFallback).toBe(false);
    expect(result.fbsPopulation.membershipMissingConference).toBe(0);
    expect(result.fbsPopulation.conferenceUnrecognized).toBe(0);
    expect(result.fbsPopulation.conferenceBreakdown['Independent']).toBeUndefined();
    expect(result.fbsPopulation.conferenceBreakdown['SEC']).toBeGreaterThan(0);
    expect(result.fbsPopulation.conferenceBreakdown['ACC']).toBe(1);
    expect(result.structuralOk).toBe(true);
  });

  it('membership NULL conference is structural for 2026', () => {
    const input = healthyInput();
    const row = input.memberships.find(
      (m) => m.season === 2026 && m.teamId === 'alabama'
    )!;
    row.conference = null;
    const result = auditRatingsReadiness(input);
    expect(result.structuralOk).toBe(false);
    expect(
      result.structuralIssues.some(
        (i) => i.code === 'membership_conference_incomplete'
      )
    ).toBe(true);
    expect(result.fbsPopulation.membershipMissingConference).toBe(1);
  });

  it('17. historical comparison season does not require membership conference backfill', () => {
    const input = healthyInput();
    for (const m of input.memberships) {
      if (m.season === 2025) m.conference = null;
    }
    const result = auditRatingsReadiness(input);
    // Target season still uses membership; comparison season talent/etc. still loads
    expect(result.fbsPopulation.conferenceSource).toBe(
      'TeamMembership.conference'
    );
    expect(result.structuralOk).toBe(true);
    expect(
      result.talentBySeason.some((t) => t.season === COMPARISON_SEASON)
    ).toBe(true);
  });

  it('2026 FBS membership count 137 is structural (denominator mismatch)', () => {
    const input = healthyInput();
    const dropId = 'team-001';
    input.memberships = input.memberships.filter(
      (m) => !(m.season === 2026 && m.teamId === dropId)
    );
    const result = auditRatingsReadiness(input);
    expect(result.fbsPopulation.fbsMembershipCount).toBe(137);
    expect(result.structuralOk).toBe(false);
    expect(
      result.structuralIssues.some(
        (i) => i.code === 'fbs_membership_count_not_138'
      )
    ).toBe(true);
  });

  it('2026 FBS membership count 139 is structural (denominator mismatch)', () => {
    const input = healthyInput();
    input.teams.push(buildFixtureTeam('extra-fbs', 'SEC'));
    input.memberships.push(
      buildFixtureMembership(2026, 'extra-fbs', 'fbs', 'SEC')
    );
    const result = auditRatingsReadiness(input);
    expect(result.fbsPopulation.fbsMembershipCount).toBe(139);
    expect(result.structuralOk).toBe(false);
    expect(
      result.structuralIssues.some(
        (i) => i.code === 'fbs_membership_count_not_138'
      )
    ).toBe(true);
  });
});
