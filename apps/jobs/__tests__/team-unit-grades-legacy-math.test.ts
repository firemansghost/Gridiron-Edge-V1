/**
 * Pure tests for legacy TeamUnitGrades calculation parity.
 * No network. No DB. Does not import compute_unit_grades.ts (Prisma at load).
 */

import { buildBaseFbsFixture } from '../src/preseason/fbs-membership-init';
import {
  LEGACY_TEAM_UNIT_GRADE_METRICS,
  LEGACY_TEAM_UNIT_GRADE_OUTPUTS,
  LEGACY_TEAM_UNIT_GRADES_MATH_KIND,
  aggregateLegacyTeamUnitGradeInputs,
  completeLegacyTeamUnitGradeInputs,
  computeLegacyPopulationZScores,
  computeLegacyTeamUnitGrades,
  computeLegacyTeamUnitGradesBatch,
  type LegacyTeamUnitGradeCandidate,
  type LegacyTeamUnitGradeMetric,
  type LegacyTeamUnitGrades,
} from '../src/v2/team-unit-grades-legacy-math';

const METRIC_DEFAULT = 10;

function baseMetrics(
  overrides: Partial<Record<LegacyTeamUnitGradeMetric, unknown>> = {}
): Record<LegacyTeamUnitGradeMetric, unknown> {
  const row = {} as Record<LegacyTeamUnitGradeMetric, unknown>;
  for (let i = 0; i < LEGACY_TEAM_UNIT_GRADE_METRICS.length; i++) {
    row[LEGACY_TEAM_UNIT_GRADE_METRICS[i]] = METRIC_DEFAULT;
  }
  const keys = Object.keys(overrides) as LegacyTeamUnitGradeMetric[];
  for (let i = 0; i < keys.length; i++) {
    row[keys[i]] = overrides[keys[i]];
  }
  return row;
}

function row(
  teamId: string,
  overrides: Partial<Record<LegacyTeamUnitGradeMetric, unknown>> = {}
): LegacyTeamUnitGradeCandidate {
  return { teamId, ...baseMetrics(overrides) };
}

function assertFailClosed(
  result: { ok: boolean; blockers?: string[] },
  code: string
): void {
  expect(result.ok).toBe(false);
  expect(result.blockers).toEqual(expect.arrayContaining([code]));
}

function byTeam(
  grades: LegacyTeamUnitGrades[]
): Record<string, LegacyTeamUnitGrades> {
  const map: Record<string, LegacyTeamUnitGrades> = Object.create(null);
  for (let i = 0; i < grades.length; i++) {
    map[grades[i].teamId] = grades[i];
  }
  return map;
}

function assertExactDeep(left: unknown, right: unknown): void {
  if (typeof left === 'number' && typeof right === 'number') {
    expect(Object.is(left, right)).toBe(true);
    return;
  }
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    expect(left).toEqual(right);
    return;
  }
  const leftKeys = Object.keys(left as object).sort();
  const rightKeys = Object.keys(right as object).sort();
  expect(leftKeys).toEqual(rightKeys);
  for (let i = 0; i < leftKeys.length; i++) {
    const key = leftKeys[i];
    assertExactDeep(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key]
    );
  }
}

/**
 * Test-only reference copied/reduced from the numerical sections of
 * apps/jobs/src/v2/compute_unit_grades.ts (calculateZScoreStats,
 * calculateZScore, and the 50/50 grade identities including existing
 * null-coalesce-to-zero fallbacks). Not a production writer.
 */
function legacyReferenceZStats(values: (number | null)[]): {
  mean: number;
  stdDev: number;
} {
  const validValues = values.filter(
    (v): v is number => v !== null && isFinite(v) && !isNaN(v)
  );
  if (validValues.length === 0) {
    return { mean: 0, stdDev: 1 };
  }
  const mean =
    validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
  const variance =
    validValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
    validValues.length;
  const stdDev = Math.sqrt(variance);
  return { mean, stdDev: stdDev || 1 };
}

function legacyReferenceZScore(
  value: number | null,
  stats: { mean: number; stdDev: number }
): number | null {
  if (value === null || isNaN(value) || !isFinite(value)) {
    return null;
  }
  if (stats.stdDev === 0) {
    return 0;
  }
  return (value - stats.mean) / stats.stdDev;
}

function legacyReferenceGrades(
  rows: LegacyTeamUnitGradeCandidate[]
): LegacyTeamUnitGrades[] {
  const zStats = {} as Record<
    LegacyTeamUnitGradeMetric,
    { mean: number; stdDev: number }
  >;
  for (let m = 0; m < LEGACY_TEAM_UNIT_GRADE_METRICS.length; m++) {
    const metric = LEGACY_TEAM_UNIT_GRADE_METRICS[m];
    zStats[metric] = legacyReferenceZStats(
      rows.map((r) => r[metric] as number)
    );
  }
  const out: LegacyTeamUnitGrades[] = [];
  for (let i = 0; i < rows.length; i++) {
    const stats = rows[i];
    const lineYardsZ = legacyReferenceZScore(
      stats.lineYardsOff as number,
      zStats.lineYardsOff
    );
    const rushPpaOffZ = legacyReferenceZScore(
      stats.rushPpaOff as number,
      zStats.rushPpaOff
    );
    const stuffRateZ = legacyReferenceZScore(
      stats.stuffRate as number,
      zStats.stuffRate
    );
    const rushPpaDefZ = legacyReferenceZScore(
      stats.rushPpaDef as number,
      zStats.rushPpaDef
    );
    const passPpaOffZ = legacyReferenceZScore(
      stats.passPpaOff as number,
      zStats.passPpaOff
    );
    const passSrOffZ = legacyReferenceZScore(
      stats.passSrOff as number,
      zStats.passSrOff
    );
    const passPpaDefZ = legacyReferenceZScore(
      stats.passPpaDef as number,
      zStats.passPpaDef
    );
    const passSrDefZ = legacyReferenceZScore(
      stats.passSrDef as number,
      zStats.passSrDef
    );
    const isoPppOffZ = legacyReferenceZScore(
      stats.isoPppOff as number,
      zStats.isoPppOff
    );
    const isoPppDefZ = legacyReferenceZScore(
      stats.isoPppDef as number,
      zStats.isoPppDef
    );
    const havocOffZ = legacyReferenceZScore(
      stats.havocOff as number,
      zStats.havocOff
    );
    const havocDefZ = legacyReferenceZScore(
      stats.havocDef as number,
      zStats.havocDef
    );

    const offRunGrade =
      lineYardsZ !== null && rushPpaOffZ !== null
        ? lineYardsZ * 0.5 + rushPpaOffZ * 0.5
        : (lineYardsZ ?? rushPpaOffZ ?? 0);
    const stuffRateZInverted = stuffRateZ !== null ? stuffRateZ : null;
    const rushPpaDefZInverted = rushPpaDefZ !== null ? -rushPpaDefZ : null;
    const defRunGrade =
      stuffRateZInverted !== null && rushPpaDefZInverted !== null
        ? stuffRateZInverted * 0.5 + rushPpaDefZInverted * 0.5
        : (stuffRateZInverted ?? rushPpaDefZInverted ?? 0);
    const offPassGrade =
      passPpaOffZ !== null && passSrOffZ !== null
        ? passPpaOffZ * 0.5 + passSrOffZ * 0.5
        : (passPpaOffZ ?? passSrOffZ ?? 0);
    const passPpaDefZInverted = passPpaDefZ !== null ? -passPpaDefZ : null;
    const passSrDefZInverted = passSrDefZ !== null ? -passSrDefZ : null;
    const defPassGrade =
      passPpaDefZInverted !== null && passSrDefZInverted !== null
        ? passPpaDefZInverted * 0.5 + passSrDefZInverted * 0.5
        : (passPpaDefZInverted ?? passSrDefZInverted ?? 0);
    const offExplosiveness = isoPppOffZ ?? 0;
    const defExplosiveness = isoPppDefZ !== null ? -isoPppDefZ : 0;
    const havocGrade =
      havocDefZ !== null && havocOffZ !== null
        ? havocDefZ * 0.5 - havocOffZ * 0.5
        : havocDefZ !== null
          ? havocDefZ
          : havocOffZ !== null
            ? -havocOffZ
            : 0;

    out.push({
      teamId: String(stats.teamId),
      offRunGrade,
      defRunGrade,
      offPassGrade,
      defPassGrade,
      offExplosiveness,
      defExplosiveness,
      havocGrade,
    });
  }
  return out;
}

describe('legacy TeamUnitGrades calculation parity', () => {
  it('is labeled as calculation parity, not authorized methodology', () => {
    expect(LEGACY_TEAM_UNIT_GRADES_MATH_KIND).toBe(
      'legacy TeamUnitGrades calculation parity'
    );
    expect(computeLegacyTeamUnitGradesBatch).toBe(computeLegacyTeamUnitGrades);
  });

  it('hand-calculated 3-team fixture matches expected population z-scores and grades', () => {
    const rows = [
      row('t1', { lineYardsOff: 1 }),
      row('t2', { lineYardsOff: 2 }),
      row('t3', { lineYardsOff: 3 }),
    ];
    const result = computeLegacyTeamUnitGrades(rows);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const z = Math.sqrt(3 / 2);
    expect(result.zStats.lineYardsOff.mean).toBe(2);
    expect(result.zStats.lineYardsOff.variance).toBeCloseTo(2 / 3, 12);
    expect(result.zStats.lineYardsOff.stdDev).toBeCloseTo(Math.sqrt(2 / 3), 12);
    const grades = byTeam(result.grades);
    expect(grades.t1.offRunGrade).toBeCloseTo(-0.5 * z, 12);
    expect(grades.t2.offRunGrade).toBeCloseTo(0, 12);
    expect(grades.t3.offRunGrade).toBeCloseTo(0.5 * z, 12);
    expect(grades.t1.offExplosiveness).toBeCloseTo(0, 12);
    expect(grades.t1.defExplosiveness).toBeCloseTo(0, 12);
  });

  it('uses population N denominator, not sample N-1', () => {
    const z = computeLegacyPopulationZScores([1, 2, 3]);
    expect(z.ok).toBe(true);
    if (!z.ok) return;
    expect(z.mean).toBe(2);
    expect(z.variance).toBeCloseTo(2 / 3, 12);
    expect(z.stdDev).not.toBeCloseTo(1, 8);
    expect(z.zScores[0]).toBeCloseTo(-Math.sqrt(3 / 2), 12);
    expect(z.zScores[0]).not.toBeCloseTo(-1, 8);
  });

  it('zero-variance metric yields z-scores exactly 0', () => {
    const result = computeLegacyTeamUnitGrades([
      row('a'),
      row('b'),
      row('c'),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.zStats.lineYardsOff.stdDev).toBe(0);
    for (let i = 0; i < result.grades.length; i++) {
      const g = result.grades[i];
      for (let o = 0; o < LEGACY_TEAM_UNIT_GRADE_OUTPUTS.length; o++) {
        expect(g[LEGACY_TEAM_UNIT_GRADE_OUTPUTS[o]] === 0).toBe(true);
      }
    }
  });

  it('literal zero is valid evidence and is not treated as missing', () => {
    const result = computeLegacyTeamUnitGrades([
      row('a', { lineYardsOff: 0 }),
      row('b', { lineYardsOff: 2 }),
      row('c', { lineYardsOff: 4 }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.zStats.lineYardsOff.mean).toBe(2);
    expect(result.zStats.lineYardsOff.variance).toBeCloseTo(8 / 3, 12);
    const grades = byTeam(result.grades);
    expect(Number.isFinite(grades.a.offRunGrade)).toBe(true);
    expect(grades.a.offRunGrade).not.toBe(0);
  });

  it('null rejects without zero-fill', () => {
    const result = computeLegacyTeamUnitGrades([
      row('a', { lineYardsOff: null }),
      row('b'),
    ]);
    assertFailClosed(result, 'nonfinite:lineYardsOff');
  });

  it('undefined rejects without zero-fill', () => {
    const result = computeLegacyTeamUnitGrades([
      row('a', { rushPpaOff: undefined }),
      row('b'),
    ]);
    assertFailClosed(result, 'nonfinite:rushPpaOff');
  });

  it('NaN rejects without zero-fill', () => {
    const result = computeLegacyTeamUnitGrades([
      row('a', { stuffRate: Number.NaN }),
      row('b'),
    ]);
    assertFailClosed(result, 'nonfinite:stuffRate');
  });

  it('+Infinity rejects without zero-fill', () => {
    const result = computeLegacyTeamUnitGrades([
      row('a', { isoPppOff: Number.POSITIVE_INFINITY }),
      row('b'),
    ]);
    assertFailClosed(result, 'nonfinite:isoPppOff');
  });

  it('-Infinity rejects without zero-fill', () => {
    const result = computeLegacyTeamUnitGrades([
      row('a', { isoPppDef: Number.NEGATIVE_INFINITY }),
      row('b'),
    ]);
    assertFailClosed(result, 'nonfinite:isoPppDef');
  });

  it('blank team ID rejects', () => {
    const result = computeLegacyTeamUnitGrades([row('   '), row('b')]);
    assertFailClosed(result, 'blank_team_id');
  });

  it('duplicate team ID rejects', () => {
    const result = computeLegacyTeamUnitGrades([row('a'), row('a')]);
    assertFailClosed(result, 'duplicate_team_id');
  });

  it('row order does not change grades keyed by team', () => {
    const forward = [
      row('z', { lineYardsOff: 1 }),
      row('m', { lineYardsOff: 2 }),
      row('a', { lineYardsOff: 3 }),
    ];
    const reverse = [forward[2], forward[1], forward[0]];
    const a = computeLegacyTeamUnitGrades(forward);
    const b = computeLegacyTeamUnitGrades(reverse);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.grades.map((g) => g.teamId)).toEqual(['a', 'm', 'z']);
    expect(byTeam(a.grades)).toEqual(byTeam(b.grades));
  });

  it('canonical teamId order makes adversarial finite summation order-independent', () => {
    const aRow = row('A', { lineYardsOff: 1e16 });
    const bRow = row('B', { lineYardsOff: -1e16 });
    const cRow = row('C', { lineYardsOff: 1 });
    const perm1 = [aRow, bRow, cRow];
    const perm2 = [cRow, aRow, bRow];
    const perm3 = [bRow, cRow, aRow];
    const frozen1 = JSON.stringify(perm1);
    const frozen2 = JSON.stringify(perm2);
    const frozen3 = JSON.stringify(perm3);
    const r1 = computeLegacyTeamUnitGrades(perm1);
    const r2 = computeLegacyTeamUnitGrades(perm2);
    const r3 = computeLegacyTeamUnitGrades(perm3);
    expect(r1.ok && r2.ok && r3.ok).toBe(true);
    if (!r1.ok || !r2.ok || !r3.ok) return;
    expect(JSON.stringify(perm1)).toBe(frozen1);
    expect(JSON.stringify(perm2)).toBe(frozen2);
    expect(JSON.stringify(perm3)).toBe(frozen3);
    expect(r1.grades.map((g) => g.teamId)).toEqual(['A', 'B', 'C']);
    assertExactDeep(r1.zStats, r2.zStats);
    assertExactDeep(r1.zStats, r3.zStats);
    assertExactDeep(byTeam(r1.grades), byTeam(r2.grades));
    assertExactDeep(byTeam(r1.grades), byTeam(r3.grades));
  });

  it('grade identities match the exact 50/50 and sign formulas', () => {
    const rows = [
      row('low', {
        lineYardsOff: 1,
        rushPpaOff: 1,
        stuffRate: 1,
        rushPpaDef: 1,
        passPpaOff: 1,
        passSrOff: 1,
        passPpaDef: 1,
        passSrDef: 1,
        isoPppOff: 1,
        isoPppDef: 1,
        havocOff: 1,
        havocDef: 1,
      }),
      row('mid', {
        lineYardsOff: 2,
        rushPpaOff: 2,
        stuffRate: 2,
        rushPpaDef: 2,
        passPpaOff: 2,
        passSrOff: 2,
        passPpaDef: 2,
        passSrDef: 2,
        isoPppOff: 2,
        isoPppDef: 2,
        havocOff: 2,
        havocDef: 2,
      }),
      row('high', {
        lineYardsOff: 3,
        rushPpaOff: 3,
        stuffRate: 3,
        rushPpaDef: 3,
        passPpaOff: 3,
        passSrOff: 3,
        passPpaDef: 3,
        passSrDef: 3,
        isoPppOff: 3,
        isoPppDef: 3,
        havocOff: 3,
        havocDef: 3,
      }),
    ];
    const result = computeLegacyTeamUnitGrades(rows);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const s = Math.sqrt(3 / 2);
    const grades = byTeam(result.grades);
    expect(grades.low.offRunGrade).toBeCloseTo(-s, 12);
    expect(grades.low.defRunGrade).toBeCloseTo(0, 12);
    expect(grades.low.offPassGrade).toBeCloseTo(-s, 12);
    expect(grades.low.defPassGrade).toBeCloseTo(s, 12);
    expect(grades.low.offExplosiveness).toBeCloseTo(-s, 12);
    expect(grades.low.defExplosiveness).toBeCloseTo(s, 12);
    expect(grades.low.havocGrade).toBeCloseTo(0, 12);
    expect(grades.high.offRunGrade).toBeCloseTo(s, 12);
    expect(grades.high.defPassGrade).toBeCloseTo(-s, 12);
    expect(grades.high.defExplosiveness).toBeCloseTo(-s, 12);
  });

  it('inverts defensive PPA/success-rate z-scores', () => {
    const result = computeLegacyTeamUnitGrades([
      row('allowed-low', { rushPpaDef: 1, passPpaDef: 1, passSrDef: 1 }),
      row('allowed-mid', { rushPpaDef: 2, passPpaDef: 2, passSrDef: 2 }),
      row('allowed-high', { rushPpaDef: 3, passPpaDef: 3, passSrDef: 3 }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const s = Math.sqrt(3 / 2);
    const grades = byTeam(result.grades);
    expect(grades['allowed-low'].defRunGrade).toBeCloseTo(0.5 * s, 12);
    expect(grades['allowed-high'].defRunGrade).toBeCloseTo(-0.5 * s, 12);
    expect(grades['allowed-low'].defPassGrade).toBeCloseTo(s, 12);
    expect(grades['allowed-high'].defPassGrade).toBeCloseTo(-s, 12);
  });

  it('havocGrade is 0.5 * havocDefZ - 0.5 * havocOffZ', () => {
    const result = computeLegacyTeamUnitGrades([
      row('good', { havocDef: 3, havocOff: 1 }),
      row('mid', { havocDef: 2, havocOff: 2 }),
      row('bad', { havocDef: 1, havocOff: 3 }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const s = Math.sqrt(3 / 2);
    const grades = byTeam(result.grades);
    expect(grades.good.havocGrade).toBeCloseTo(s, 12);
    expect(grades.mid.havocGrade).toBeCloseTo(0, 12);
    expect(grades.bad.havocGrade).toBeCloseTo(-s, 12);
  });

  it('does not mutate caller input rows', () => {
    const input = [row('a', { lineYardsOff: 1 }), row('b', { lineYardsOff: 3 })];
    const frozen = JSON.stringify(input);
    computeLegacyTeamUnitGrades(input);
    expect(JSON.stringify(input)).toBe(frozen);
  });

  it('preserves legacy IEEE signed zero on negated zero z-scores', () => {
    const fixture = [row('a'), row('b'), row('c')];
    const result = computeLegacyTeamUnitGrades(fixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const reference = byTeam(legacyReferenceGrades(fixture));
    const actual = byTeam(result.grades);
    expect(Object.is(reference.a.defExplosiveness, -0)).toBe(true);
    expect(Object.is(actual.a.defExplosiveness, -0)).toBe(true);
    expect(Object.is(actual.b.defExplosiveness, -0)).toBe(true);
    expect(Object.is(actual.c.defExplosiveness, -0)).toBe(true);
    expect(Object.is(actual.a.defExplosiveness, 0)).toBe(false);
    expect(Object.is(actual.a.defPassGrade, -0)).toBe(true);
    expect(Object.is(reference.a.defPassGrade, -0)).toBe(true);
  });
});

describe('legacy aggregation parity (inspection only)', () => {
  it('averages multiple team-game rows like existing compute_unit_grades.ts', () => {
    const agg = aggregateLegacyTeamUnitGradeInputs({
      teamIds: ['alpha', 'beta'],
      effTeamGames: [
        {
          teamIdInternal: 'alpha',
          lineYardsOff: 2,
          runEpa: 0.1,
          passEpa: 0.4,
          passSr: 0.4,
          defSr: 0.3,
          isoPppOff: 1,
          isoPppDef: 0.8,
        },
        {
          teamIdInternal: 'alpha',
          lineYardsOff: 6,
          runEpa: 0.3,
          passEpa: 0.8,
          passSr: 0.6,
          defSr: 0.5,
          isoPppOff: 3,
          isoPppDef: 1.2,
        },
      ],
      ppaTeamGames: [],
      effTeamSeasons: [
        {
          teamIdInternal: 'alpha',
          stuffRate: 0.22,
          havocOff: 0.1,
          havocDef: 0.2,
        },
      ],
    });
    expect(agg.ok).toBe(true);
    if (!agg.ok) return;
    const alpha = agg.rows.filter((r) => r.teamId === 'alpha')[0];
    expect(alpha.lineYardsOff).toBe(4);
    expect(alpha.rushPpaOff).toBeCloseTo(0.2, 12);
    expect(alpha.passPpaOff).toBeCloseTo(0.6, 12);
    expect(alpha.passSrOff).toBeCloseTo(0.5, 12);
    expect(alpha.passSrDef).toBeCloseTo(0.4, 12);
    expect(alpha.isoPppOff).toBe(2);
    expect(alpha.isoPppDef).toBeCloseTo(1.0, 12);
    expect(alpha.stuffRate).toBe(0.22);
    expect(alpha.havocOff).toBe(0.1);
    expect(alpha.havocDef).toBe(0.2);
    const beta = agg.rows.filter((r) => r.teamId === 'beta')[0];
    expect(beta.lineYardsOff).toBeNull();
    expect(beta.rushPpaOff).toBeNull();
  });

  it('ppaDefense feeds both rushPpaDef and passPpaDef', () => {
    const agg = aggregateLegacyTeamUnitGradeInputs({
      teamIds: ['alpha'],
      effTeamGames: [],
      ppaTeamGames: [
        { teamIdInternal: 'alpha', ppaOffense: 0.2, ppaDefense: 0.4 },
        { teamIdInternal: 'alpha', ppaOffense: 0.4, ppaDefense: 0.8 },
      ],
      effTeamSeasons: [],
    });
    expect(agg.ok).toBe(true);
    if (!agg.ok) return;
    expect(agg.rows[0].rushPpaDef).toBeCloseTo(0.6, 12);
    expect(agg.rows[0].passPpaDef).toBeCloseTo(0.6, 12);
    expect(agg.rows[0].rushPpaDef).toBe(agg.rows[0].passPpaDef);
    expect(agg.rows[0].rushPpaOff).toBeCloseTo(0.3, 12);
    expect(agg.rows[0].passPpaOff).toBeCloseTo(0.3, 12);
  });

  it('does not zero-fill incomplete aggregates; complete-input conversion rejects', () => {
    const agg = aggregateLegacyTeamUnitGradeInputs({
      teamIds: ['alpha'],
      effTeamGames: [
        {
          teamIdInternal: 'alpha',
          lineYardsOff: 4,
          runEpa: null,
          passEpa: null,
          passSr: null,
          defSr: null,
          isoPppOff: null,
          isoPppDef: null,
        },
      ],
      ppaTeamGames: [],
      effTeamSeasons: [],
    });
    expect(agg.ok).toBe(true);
    if (!agg.ok) return;
    expect(agg.rows[0].lineYardsOff).toBe(4);
    expect(agg.rows[0].rushPpaOff).toBeNull();
    expect(agg.rows[0].stuffRate).toBeNull();
    const complete = completeLegacyTeamUnitGradeInputs(agg.rows);
    expect(complete.ok).toBe(false);
    expect(
      complete.ok === false &&
        complete.blockers.some((b) => b.startsWith('nonfinite:'))
    ).toBe(true);
  });
});

describe('legacy-reference golden parity', () => {
  it('pure module output equals copied compute_unit_grades numerical reference', () => {
    const fixture: LegacyTeamUnitGradeCandidate[] = [
      row('alpha', {
        lineYardsOff: 4.2,
        rushPpaOff: 0.05,
        stuffRate: 0.22,
        rushPpaDef: 0.11,
        passPpaOff: 0.08,
        passSrOff: 0.45,
        passPpaDef: 0.11,
        passSrDef: 0.38,
        isoPppOff: 1.1,
        isoPppDef: 0.9,
        havocOff: 0.11,
        havocDef: 0.2,
      }),
      row('bravo', {
        lineYardsOff: 0,
        rushPpaOff: -0.02,
        stuffRate: 0.18,
        rushPpaDef: 0.2,
        passPpaOff: 0,
        passSrOff: 0.4,
        passPpaDef: 0.2,
        passSrDef: 0.42,
        isoPppOff: 0.8,
        isoPppDef: 1.2,
        havocOff: 0.15,
        havocDef: 0.12,
      }),
      row('charlie', {
        lineYardsOff: 5.5,
        rushPpaOff: 0.12,
        stuffRate: 0.3,
        rushPpaDef: 0.05,
        passPpaOff: 0.2,
        passSrOff: 0.52,
        passPpaDef: 0.05,
        passSrDef: 0.3,
        isoPppOff: 1.4,
        isoPppDef: 0.7,
        havocOff: 0.08,
        havocDef: 0.28,
      }),
    ];
    const result = computeLegacyTeamUnitGrades(fixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const reference = byTeam(legacyReferenceGrades(fixture));
    const actual = byTeam(result.grades);
    const teams = ['alpha', 'bravo', 'charlie'];
    for (let t = 0; t < teams.length; t++) {
      const teamId = teams[t];
      for (let o = 0; o < LEGACY_TEAM_UNIT_GRADE_OUTPUTS.length; o++) {
        const key = LEGACY_TEAM_UNIT_GRADE_OUTPUTS[o];
        expect(actual[teamId][key]).toBeCloseTo(reference[teamId][key], 12);
      }
    }
    expect(actual.bravo.offRunGrade).toBeCloseTo(-1.3011650431994422, 10);
    expect(actual.charlie.havocGrade).toBeCloseTo(1.1936106294148905, 10);
    expect(actual.alpha.defExplosiveness).toBeCloseTo(0.162221421130762, 10);
  });

  it('138-team complete batch returns 138 finite grade rows without requiring planner wiring', () => {
    const ids = buildBaseFbsFixture(138);
    const rows: LegacyTeamUnitGradeCandidate[] = ids.map((id, i) =>
      row(id, { lineYardsOff: i, rushPpaOff: i * 0.01 })
    );
    const result = computeLegacyTeamUnitGradesBatch(rows);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.grades.length).toBe(138);
    for (let i = 0; i < result.grades.length; i++) {
      const g = result.grades[i];
      for (let o = 0; o < LEGACY_TEAM_UNIT_GRADE_OUTPUTS.length; o++) {
        expect(Number.isFinite(g[LEGACY_TEAM_UNIT_GRADE_OUTPUTS[o]])).toBe(
          true
        );
      }
    }
  });
});
