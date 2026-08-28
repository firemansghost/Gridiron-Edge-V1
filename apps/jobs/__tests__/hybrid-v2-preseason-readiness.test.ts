/**
 * Phase 2C-2I-1 — Hybrid V2 preseason readiness audit tests.
 * No network. No production DB. No providers. No Odds. No writes.
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildBaseFbsFixture } from '../src/preseason/fbs-membership-init';
import { calculateHybridSpread } from '../../web/lib/core-v2-spread';
import {
  EXPECTED_FBS_COUNT,
  EXPECTED_WEEK1_GAME_COUNT,
  HIGHLIGHT_ALL_ZERO_TEAM_IDS,
  HYBRID_HFA,
  HYBRID_V1_WEIGHT,
  HYBRID_V2_SCALE,
  HYBRID_V2_WEIGHT,
  HYBRID_W_EXPLO,
  HYBRID_W_PASS,
  HYBRID_W_RUN,
  TARGET_SEASON,
  TARGET_WEEK,
  buildHybridPreseasonReadinessEvaluation,
  parseHybridPreseasonReadinessArgs,
  sanitizeHybridPreseasonReadinessError,
  type HybridPreseasonGameRow,
  type HybridPreseasonReadinessInput,
  type UnitGradeRow,
  type V1RatingRow,
} from '../src/preseason/hybrid-v2-preseason-readiness';

function fbs2026(): string[] {
  const base = buildBaseFbsFixture(136);
  return ['north-dakota-state', 'sacramento-state', ...base].slice(0, 138);
}

function emptyCfbd() {
  return {
    cfbdGames: 0,
    cfbdEffTeamGame: 0,
    cfbdPpaTeamGame: 0,
    cfbdEffTeamSeason: 0,
    cfbdPriorsTeamSeason: 0,
  };
}

/** Deterministic 51 FBS-vs-FBS Week1 games covering as many teams as possible. */
function buildWeek1Games(fbs: string[]): HybridPreseasonGameRow[] {
  const games: HybridPreseasonGameRow[] = [];
  for (let i = 0; i < EXPECTED_WEEK1_GAME_COUNT; i++) {
    const home = fbs[i % fbs.length];
    const away = fbs[(i + 37) % fbs.length];
    const a = home === away ? fbs[(i + 1) % fbs.length] : away;
    const day = 27 + (i % 7);
    const month = day <= 31 ? 8 : 9;
    const dom = day <= 31 ? day : day - 31;
    games.push({
      gameId: `w1-${String(i + 1).padStart(2, '0')}`,
      season: TARGET_SEASON,
      week: 1,
      date: `2026-${String(month).padStart(2, '0')}-${String(dom).padStart(2, '0')}T19:00:00.000Z`,
      status: 'scheduled',
      homeTeamId: home,
      awayTeamId: a,
      neutralSite: i % 11 === 0,
    });
  }
  return games;
}

function v1For(fbs: string[]): V1RatingRow[] {
  return fbs.map((teamId, i) => ({
    teamId,
    powerRating: (i - 69) * 0.15,
    rating: (i - 69) * 0.15,
  }));
}

function gradesFor(
  fbs: string[],
  season: number,
  opts?: { allZeroIds?: string[]; missingIds?: string[]; nonfiniteId?: string }
): UnitGradeRow[] {
  const zero = new Set((opts?.allZeroIds ?? []).map((id) => id.toLowerCase()));
  const missing = new Set(
    (opts?.missingIds ?? []).map((id) => id.toLowerCase())
  );
  const rows: UnitGradeRow[] = [];
  for (let i = 0; i < fbs.length; i++) {
    const teamId = fbs[i];
    if (missing.has(teamId.toLowerCase())) continue;
    if (opts?.nonfiniteId && teamId === opts.nonfiniteId) {
      rows.push({
        teamId,
        season,
        offRunGrade: Number.NaN,
        defRunGrade: 0.1,
        offPassGrade: 0.1,
        defPassGrade: 0.1,
        offExplosiveness: 0.1,
        defExplosiveness: 0.1,
        havocGrade: 0.1,
      });
      continue;
    }
    if (zero.has(teamId.toLowerCase())) {
      rows.push({
        teamId,
        season,
        offRunGrade: 0,
        defRunGrade: 0,
        offPassGrade: 0,
        defPassGrade: 0,
        offExplosiveness: 0,
        defExplosiveness: 0,
        havocGrade: 0,
      });
      continue;
    }
    const z = (i + 1) * 0.02;
    rows.push({
      teamId,
      season,
      offRunGrade: z,
      defRunGrade: -z * 0.5,
      offPassGrade: z * 0.8,
      defPassGrade: -z * 0.4,
      offExplosiveness: z * 0.3,
      defExplosiveness: -z * 0.2,
      havocGrade: z * 0.1,
    });
  }
  return rows;
}

function healthyInput(
  overrides: Partial<HybridPreseasonReadinessInput> = {}
): HybridPreseasonReadinessInput {
  const fbs = fbs2026();
  const games = buildWeek1Games(fbs);
  return {
    season: TARGET_SEASON,
    week: TARGET_WEEK,
    nowIso: '2026-08-27T12:00:00.000Z',
    fbsIds: fbs,
    games,
    v1Ratings2026: v1For(fbs),
    unitGrades2026: [],
    unitGradesPrior: gradesFor(fbs, 2025, {
      allZeroIds: [...HIGHLIGHT_ALL_ZERO_TEAM_IDS],
    }),
    cfbdSourceCounts2026: emptyCfbd(),
    unitGradeRows2024: 0,
    cfbdSourceCounts2024: emptyCfbd(),
    ...overrides,
  };
}

describe('Hybrid V2 preseason readiness — args / gates', () => {
  it('season must be 2026', () => {
    expect(parseHybridPreseasonReadinessArgs(['--season', '2025']).ok).toBe(
      false
    );
    const r = buildHybridPreseasonReadinessEvaluation(
      healthyInput({ season: 2025 })
    );
    expect(r.auditOk).toBe(false);
    expect(r.findings.some((f) => f.includes('season must be 2026'))).toBe(
      true
    );
  });

  it('week must be 1', () => {
    expect(parseHybridPreseasonReadinessArgs(['--week', '2']).ok).toBe(false);
    const r = buildHybridPreseasonReadinessEvaluation(healthyInput({ week: 2 }));
    expect(r.auditOk).toBe(false);
    expect(r.findings.some((f) => f.includes('week must be 1'))).toBe(true);
  });

  it('expected Week1 count 51', () => {
    const r = buildHybridPreseasonReadinessEvaluation(healthyInput());
    expect(r.week1GameCount).toBe(EXPECTED_WEEK1_GAME_COUNT);
    expect(EXPECTED_WEEK1_GAME_COUNT).toBe(51);
  });

  it('exact FBS-vs-FBS coverage required', () => {
    const fbs = fbs2026();
    const games = buildWeek1Games(fbs);
    games[0] = { ...games[0], awayTeamId: 'fcs-opponent' };
    const r = buildHybridPreseasonReadinessEvaluation(
      healthyInput({ games })
    );
    expect(r.fbsVsFbsGames).toBe(50);
    expect(r.auditOk).toBe(false);
    expect(r.coreV1Week1OperationalReady).toBe(false);
  });

  it('exact Week1 V1 coverage required', () => {
    const fbs = fbs2026();
    const ratings = v1For(fbs).slice(1);
    const r = buildHybridPreseasonReadinessEvaluation(
      healthyInput({ v1Ratings2026: ratings })
    );
    expect(r.gamesWithBothV1).toBeLessThan(51);
    expect(r.auditOk).toBe(false);
    expect(r.coreV1Week1OperationalReady).toBe(false);
  });

  it('nonfinite V1 fails', () => {
    const fbs = fbs2026();
    const ratings = v1For(fbs);
    ratings[0] = { ...ratings[0], powerRating: Number.NaN, rating: Number.NaN };
    const r = buildHybridPreseasonReadinessEvaluation(
      healthyInput({ v1Ratings2026: ratings })
    );
    expect(r.nonfiniteV1Ratings).toBeGreaterThan(0);
    expect(r.auditOk).toBe(false);
  });
});

describe('Hybrid V2 preseason readiness — current Hybrid inputs', () => {
  it('0 current TeamUnitGrades → currentHybridOperationalReady=false', () => {
    const r = buildHybridPreseasonReadinessEvaluation(healthyInput());
    expect(r.teamUnitGradeRows2026).toBe(0);
    expect(r.gamesWithCurrentHybridInputs).toBe(0);
    expect(r.gamesThatWouldFallbackToCoreV1).toBe(51);
    expect(r.currentHybridOperationalReady).toBe(false);
    expect(r.auditOk).toBe(true); // expected finding, not fail-closed
  });

  it("missing one side's current grade marks that game fallback", () => {
    const fbs = fbs2026();
    const games = buildWeek1Games(fbs);
    const home = games[0].homeTeamId;
    const away = games[0].awayTeamId;
    // Only home has 2026 grades among the pair; both teams need grades for hybrid.
    const grades = gradesFor([home], 2026);
    const r = buildHybridPreseasonReadinessEvaluation(
      healthyInput({ unitGrades2026: grades, games })
    );
    expect(r.gamesWithCurrentHybridInputs).toBe(0);
    expect(r.gamesMissingCurrentHybridInputs).toBe(51);
    expect(r.gamesThatWouldFallbackToCoreV1).toBe(51);
    // Ensure specific game would fallback
    const both =
      grades.some((g) => g.teamId === home) &&
      grades.some((g) => g.teamId === away);
    expect(both).toBe(false);
  });

  it('51/51 missing grades → 51 fallback', () => {
    const r = buildHybridPreseasonReadinessEvaluation(
      healthyInput({ unitGrades2026: [] })
    );
    expect(r.gamesThatWouldFallbackToCoreV1).toBe(51);
  });
});

describe('Hybrid V2 preseason readiness — prior grades', () => {
  it('prior-grade exact 138 set validation', () => {
    const r = buildHybridPreseasonReadinessEvaluation(healthyInput());
    expect(r.priorGradeCoverage.priorGradeRowsFor2026Fbs).toBe(
      EXPECTED_FBS_COUNT
    );
    expect(r.priorGradeCoverage.priorGradeDistinctTeams).toBe(
      EXPECTED_FBS_COUNT
    );
    expect(r.priorGradeCoverage.duplicateTeamIds).toBe(0);
    expect(r.priorGradeCoverage.exactTeamSet).toBe(true);
    expect(r.priorYearGradeBridgeStructurallyAvailable).toBe(true);
  });

  it('duplicate prior-grade team fails structural availability', () => {
    const fbs = fbs2026();
    const prior = gradesFor(fbs, 2025, {
      allZeroIds: [...HIGHLIGHT_ALL_ZERO_TEAM_IDS],
    });
    prior.push({ ...prior[0], offRunGrade: 1 });
    const r = buildHybridPreseasonReadinessEvaluation(
      healthyInput({ unitGradesPrior: prior })
    );
    expect(r.priorGradeCoverage.duplicateTeamIds).toBeGreaterThan(0);
    expect(r.priorYearGradeBridgeStructurallyAvailable).toBe(false);
  });

  it('missing prior-grade team fails structural availability', () => {
    const fbs = fbs2026();
    const prior = gradesFor(fbs, 2025, {
      allZeroIds: [...HIGHLIGHT_ALL_ZERO_TEAM_IDS],
      missingIds: [fbs[5]],
    });
    const r = buildHybridPreseasonReadinessEvaluation(
      healthyInput({ unitGradesPrior: prior })
    );
    expect(r.priorYearGradeBridgeStructurallyAvailable).toBe(false);
    expect(r.priorGradeCoverage.exactTeamSet).toBe(false);
  });

  it('nonfinite required prior grade fails structural availability', () => {
    const fbs = fbs2026();
    const prior = gradesFor(fbs, 2025, {
      allZeroIds: [...HIGHLIGHT_ALL_ZERO_TEAM_IDS],
      nonfiniteId: fbs[10],
    });
    const r = buildHybridPreseasonReadinessEvaluation(
      healthyInput({ unitGradesPrior: prior })
    );
    expect(r.priorYearGradeBridgeStructurallyAvailable).toBe(false);
  });

  it('all-zero grade row reported but remains finite/structurally available', () => {
    const r = buildHybridPreseasonReadinessEvaluation(healthyInput());
    expect(r.priorGradeCoverage.allZeroHybridGradeRows).toBe(2);
    expect(r.priorYearGradeBridgeStructurallyAvailable).toBe(true);
  });

  it('NDSU all-zero identified', () => {
    const r = buildHybridPreseasonReadinessEvaluation(healthyInput());
    expect(r.priorGradeCoverage.allZeroHybridTeamIds).toContain(
      'north-dakota-state'
    );
  });

  it('Sacramento State all-zero identified', () => {
    const r = buildHybridPreseasonReadinessEvaluation(healthyInput());
    expect(r.priorGradeCoverage.allZeroHybridTeamIds).toContain(
      'sacramento-state'
    );
  });
});

describe('Hybrid V2 preseason readiness — Hybrid math reuse', () => {
  it('calculateHybridSpread is reused directly (diagnostic matches golden call)', () => {
    const r = buildHybridPreseasonReadinessEvaluation(healthyInput());
    expect(r.auditOk).toBe(true);
    const g = r.week1Diagnostics[0];
    const fbs = fbs2026();
    const prior = gradesFor(fbs, 2025, {
      allZeroIds: [...HIGHLIGHT_ALL_ZERO_TEAM_IDS],
    });
    const hg = prior.find((x) => x.teamId === g.home)!;
    const ag = prior.find((x) => x.teamId === g.away)!;
    const direct = calculateHybridSpread(
      g.home2026V1,
      g.away2026V1,
      {
        offRunGrade: hg.offRunGrade,
        defRunGrade: hg.defRunGrade,
        offPassGrade: hg.offPassGrade,
        defPassGrade: hg.defPassGrade,
        offExplosiveness: hg.offExplosiveness,
        defExplosiveness: hg.defExplosiveness,
      },
      {
        offRunGrade: ag.offRunGrade,
        defRunGrade: ag.defRunGrade,
        offPassGrade: ag.offPassGrade,
        defPassGrade: ag.defPassGrade,
        offExplosiveness: ag.offExplosiveness,
        defExplosiveness: ag.defExplosiveness,
      },
      g.neutralSite,
      g.home,
      g.away,
      null
    );
    expect(g.priorGradeHybridHma).toBeCloseTo(direct.hybridSpreadHma, 12);
    expect(g.v1ComponentHma).toBeCloseTo(direct.v1SpreadHma, 12);
    expect(g.v2ComponentHma).toBeCloseTo(direct.v2SpreadHma, 12);
  });

  it('Hybrid formula source remains unchanged (.70/.30, scale 9, matchup, HFA)', () => {
    expect(HYBRID_V1_WEIGHT).toBe(0.7);
    expect(HYBRID_V2_WEIGHT).toBe(0.3);
    expect(HYBRID_V2_SCALE).toBe(9.0);
    expect(HYBRID_W_RUN).toBe(0.4);
    expect(HYBRID_W_PASS).toBe(0.4);
    expect(HYBRID_W_EXPLO).toBe(0.2);
    expect(HYBRID_HFA).toBe(2.5);
    const src = fs.readFileSync(
      path.join(__dirname, '../../web/lib/core-v2-spread.ts'),
      'utf8'
    );
    expect(src).toMatch(/V1_WEIGHT\s*=\s*0\.7/);
    expect(src).toMatch(/V2_WEIGHT\s*=\s*0\.3/);
    expect(src).toMatch(/V2_SCALE\s*=\s*9\.0/);
    expect(src).toMatch(/W_RUN\s*=\s*0\.4/);
    expect(src).toMatch(/W_PASS\s*=\s*0\.4/);
    expect(src).toMatch(/W_EXPLO\s*=\s*0\.2/);
    expect(src).toMatch(/HFA\s*=\s*2\.5/);
  });

  it('diagnostic Hybrid finite for all 51; delta summary + flips + top20', () => {
    const r = buildHybridPreseasonReadinessEvaluation(healthyInput());
    expect(r.week1Diagnostics).toHaveLength(51);
    expect(
      r.week1Diagnostics.every((d) => Number.isFinite(d.priorGradeHybridHma))
    ).toBe(true);
    expect(r.absHybridMinusV1.mean).not.toBeNull();
    expect(r.favoriteFlipCount).toBe(
      r.week1Diagnostics.filter((d) => d.favoriteFlipped).length
    );
    expect(r.top20AbsDeltas).toHaveLength(20);
    // Deterministic sort: non-increasing abs delta
    for (let i = 1; i < r.top20AbsDeltas.length; i++) {
      expect(r.top20AbsDeltas[i - 1].absHybridMinusV1).toBeGreaterThanOrEqual(
        r.top20AbsDeltas[i].absHybridMinusV1
      );
    }
  });

  it('no market lines required', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/preseason/hybrid-v2-preseason-readiness.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/marketLine|MarketLine|closingLine/i);
  });
});

describe('Hybrid V2 preseason readiness — safety / auth / workflow', () => {
  it('no Odds / CFBD / writes / mutations; auth flags false', () => {
    const r = buildHybridPreseasonReadinessEvaluation(healthyInput());
    expect(r.providersInvoked).toBe(false);
    expect(r.Odds).toBe(false);
    expect(r.mutationsInvoked).toBe(false);
    expect(r.priorYearGradeBridgeAuthorized).toBe(false);
    expect(r.productionHybridBridgeAuthorized).toBe(false);
    expect(r.productionHybridActivationAuthorized).toBe(false);
    expect(r.oddsIngestionAuthorized).toBe(false);
    expect(r.betsWriteAuthorized).toBe(false);
    expect(r.unitGradeWriteAuthorized).toBe(false);
    expect(r.modelChangeAuthorized).toBe(false);
    expect(r.week1SpreadModelDecisionRequired).toBe(true);
    expect(r.priorYearGradeBridgeHistoricallyValidated).toBe(false);
    expect(r.historicalPriorYearBridgeValidationAvailable).toBe(false);
    expect(r.sameSeasonUnitGradeSourceReady).toBe(false);
  });

  it('current lifecycle writer / Core V1 formulas untouched (source markers)', () => {
    const life = fs.readFileSync(
      path.join(__dirname, '../src/ratings/core-v1-lifecycle.ts'),
      'utf8'
    );
    expect(life).toContain('GLOBAL_BLEND_W3_W6');
    expect(life).toContain('talentZ * 3.5');
    const balanced = fs.readFileSync(
      path.join(__dirname, '../src/ratings/compute_balanced_v1.ts'),
      'utf8'
    );
    expect(balanced).toMatch(/BALANCED_V1_CALIBRATION_FACTOR\s*=\s*14/);
  });

  it('safe error handling', () => {
    const safe = sanitizeHybridPreseasonReadinessError(
      new Error('postgres://user:s3cret@host/db')
    );
    expect(safe).toContain('connection and secret details suppressed');
    expect(safe).not.toMatch(/postgres|s3cret/i);
  });

  it('workflow secrets/input handling follows PR60 safety pattern', () => {
    const wf = fs
      .readFileSync(
        path.join(
          __dirname,
          '../../../.github/workflows/audit-hybrid-v2-preseason-readiness.yml'
        ),
        'utf8'
      )
      .replace(/\r\n/g, '\n');

    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/^\s*push:/m);
    expect(wf).not.toMatch(/^\s*pull_request:/m);
    expect(wf).toContain('CFBD_API_KEY: not provided');
    expect(wf).toContain('ODDS_API_KEY: not provided');
    expect(wf).not.toMatch(/CFBD_API_KEY:\s*\$\{\{\s*secrets/);
    expect(wf).not.toMatch(/ODDS_API_KEY:\s*\$\{\{\s*secrets/);

    const jobsIdx = wf.indexOf('jobs:\n  audit:');
    const stepsIdx = wf.indexOf('\n    steps:', jobsIdx);
    const preamble = wf.slice(jobsIdx, stepsIdx);
    expect(preamble).not.toMatch(/secrets\.DIRECT_URL/);

    expect(wf).not.toMatch(/SEASON="\$\{\{\s*inputs\.season\s*\}\}"/);
    expect(wf).not.toMatch(/WEEK="\$\{\{\s*inputs\.week\s*\}\}"/);
    expect(wf).not.toMatch(/--season\s+"\$\{\{\s*inputs\.season\s*\}\}"/);
    expect(wf).toContain('SEASON="$INPUT_SEASON"');
    expect(wf).toContain('WEEK="$INPUT_WEEK"');
    expect(wf).toContain('--season "$INPUT_SEASON"');
    expect(wf).toContain('--week "$INPUT_WEEK"');

    const runBlocks = [
      ...wf.matchAll(/run:\s*\|\n((?:[ \t]+.*\n)*)/g),
    ].map((m) => m[1]);
    for (const block of runBlocks) {
      expect(block).not.toMatch(/\$\{\{\s*inputs\./);
    }

    const installIdx = wf.indexOf('- name: Install dependencies');
    const prismaIdx = wf.indexOf('- name: Generate Prisma client');
    const auditIdx = wf.indexOf(
      '- name: Run Hybrid V2 preseason readiness audit'
    );
    const summaryIdx = wf.indexOf('- name: Summary');
    const installBlock = wf.slice(installIdx, prismaIdx);
    const prismaBlock = wf.slice(prismaIdx, auditIdx);
    const auditBlock = wf.slice(auditIdx, summaryIdx);
    const summaryBlock = wf.slice(summaryIdx);
    expect(installBlock).not.toMatch(/secrets\.DIRECT_URL/);
    expect(prismaBlock).not.toMatch(/secrets\.DIRECT_URL/);
    expect(summaryBlock).not.toMatch(/secrets\.DIRECT_URL/);
    expect(installBlock).toContain('prisma_generate_placeholder');
    expect(prismaBlock).toContain('prisma_generate_placeholder');
    expect(auditBlock).toMatch(
      /DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/
    );
  });
});
