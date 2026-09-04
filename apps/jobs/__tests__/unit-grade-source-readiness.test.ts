/**
 * Current-season 2026 unit-grade SOURCE readiness tests.
 * Pure + workflow static. No network. No DB. No providers. No writes.
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildBaseFbsFixture } from '../src/preseason/fbs-membership-init';
import {
  EXPECTED_FBS_COUNT,
  LEGACY_CATEGORIES,
  LEGACY_COMPATIBILITY_DISCLAIMER,
  RAW_METRICS,
  SAFE_TO_RUN_EXISTING_COMPUTE,
  TARGET_SEASON,
  buildUnitGradeSourceReadinessReport,
  isFiniteNumber,
  parseUnitGradeSourceReadinessArgs,
  sanitizeUnitGradeSourceReadinessError,
  stableStringify,
  type CfbdGameRow,
  type EffTeamGameRow,
  type EffTeamSeasonRow,
  type PpaTeamGameRow,
  type UnitGradeSourceReadinessInput,
} from '../src/v2/unit-grade-source-readiness';

const ROOT = path.resolve(__dirname, '../../..');
const WF = path.join(
  ROOT,
  '.github/workflows/audit-2026-unit-grade-source-readiness.yml'
);
const CLI = path.join(ROOT, 'apps/jobs/audit-2026-unit-grade-source-readiness.ts');
const LIB = path.join(ROOT, 'apps/jobs/src/v2/unit-grade-source-readiness.ts');

const SHA = 'aa7bbefeace795b5f7e51436e9d3cb807b0773c8';
const OBSERVED = '2026-09-04T14:00:00.000Z';

function fbs138(): string[] {
  return buildBaseFbsFixture(138);
}

function emptyInput(
  overrides: Partial<UnitGradeSourceReadinessInput> = {}
): UnitGradeSourceReadinessInput {
  return {
    season: TARGET_SEASON,
    repoCommitSha: SHA,
    observedAt: OBSERVED,
    fbsTeamIds: fbs138(),
    cfbdGames: [],
    effTeamGames: [],
    ppaTeamGames: [],
    effTeamSeasons: [],
    teamUnitGrades: [],
    priorsTeamSeasonCount: 0,
    ...overrides,
  };
}

function emptyEff(gameId: string, teamId: string): EffTeamGameRow {
  return {
    gameIdCfbd: gameId,
    teamIdInternal: teamId,
    lineYardsOff: null,
    runEpa: null,
    passEpa: null,
    passSr: null,
    defSr: null,
    isoPppOff: null,
    isoPppDef: null,
  };
}

function emptyPpa(gameId: string, teamId: string): PpaTeamGameRow {
  return {
    gameIdCfbd: gameId,
    teamIdInternal: teamId,
    ppaOffense: null,
    ppaDefense: null,
  };
}

function gamesCovering(fbs: string[]): CfbdGameRow[] {
  const games: CfbdGameRow[] = [];
  for (let i = 0; i < fbs.length; i += 2) {
    const home = fbs[i];
    const away = fbs[i + 1] ?? fbs[0];
    games.push({
      gameIdCfbd: `g-${String(i).padStart(3, '0')}`,
      homeTeamIdInternal: home,
      awayTeamIdInternal: away,
    });
  }
  return games;
}

function stepBlock(src: string, stepName: string): string {
  const marker = `- name: ${stepName}`;
  const idx = src.indexOf(marker);
  if (idx < 0) return '';
  const rest = src.slice(idx);
  const next = rest.search(/\n\s*- name:/);
  return next === -1 ? rest : rest.slice(0, next);
}

function extractRunBodies(yaml: string): string {
  const runBodies: string[] = [];
  const lines = yaml.split(/\r?\n/);
  let inRun = false;
  let runIndent = 0;
  for (const line of lines) {
    const runMatch = line.match(/^(\s*)run:\s*(\||>)?\s*$/);
    if (runMatch) {
      inRun = true;
      runIndent = runMatch[1].length;
      continue;
    }
    if (inRun) {
      const m = line.match(/^(\s*)/);
      const indent = m ? m[1].length : 0;
      if (line.trim() !== '' && indent <= runIndent) {
        inRun = false;
      } else {
        runBodies.push(line);
      }
    }
  }
  return runBodies.join('\n');
}

function assertNeverAuthorize(report: ReturnType<typeof buildUnitGradeSourceReadinessReport>) {
  expect(report.readiness.safeToRunExistingCompute).toBe(false);
  expect(report.readiness.safeToRunExistingCompute).toBe(SAFE_TO_RUN_EXISTING_COMPUTE);
  expect(report.readiness.computeUnitGradesAuthorized).toBe(false);
  expect(report.readiness.unitGradeWriteAuthorized).toBe(false);
  expect(report.readiness.cfbdIngestAuthorized).toBe(false);
  expect(report.readiness.shadowPreviewAuthorized).toBe(false);
  expect(report.readiness.shadowCommitAuthorized).toBe(false);
  expect(report.providersInvoked).toBe(false);
  expect(report.mutationsInvoked).toBe(false);
  expect(report.providerCalls).toBe(0);
  expect(report.mutationCount).toBe(0);
}

describe('2026 unit-grade source readiness — args', () => {
  it('requires season 2026 and rejects week', () => {
    expect(parseUnitGradeSourceReadinessArgs([]).ok).toBe(true);
    expect(parseUnitGradeSourceReadinessArgs(['--season', '2026']).ok).toBe(true);
    const badYear = parseUnitGradeSourceReadinessArgs(['--season', '2025']);
    expect(badYear.ok).toBe(false);
    const week = parseUnitGradeSourceReadinessArgs(['--week', '1']);
    expect(week.ok).toBe(false);
  });
});

describe('2026 unit-grade source readiness — empty / zeros / nonfinite', () => {
  it('138 FBS + zero source rows -> SOURCE_EMPTY', () => {
    const r = buildUnitGradeSourceReadinessReport(emptyInput());
    expect(r.fbs.expected).toBe(EXPECTED_FBS_COUNT);
    expect(r.fbs.unique).toBe(138);
    expect(r.status).toBe('SOURCE_EMPTY');
    expect(r.auditOk).toBe(true);
    expect(r.readiness.sourcePopulationComplete).toBe(false);
    expect(r.readiness.rawMetricCoverageComplete).toBe(false);
    expect(r.readiness.legacyComputeCompatibleCoverageComplete).toBe(false);
    expect(r.readiness.teamUnitGradesPresent).toBe(false);
    assertNeverAuthorize(r);
  });

  it('zero source rows never become zeros', () => {
    const r = buildUnitGradeSourceReadinessReport(emptyInput());
    for (const metric of RAW_METRICS) {
      expect(r.rawMetricCoverage[metric].finiteRows).toBe(0);
      expect(r.rawMetricCoverage[metric].distinctTeams).toBe(0);
      expect(r.rawMetricCoverage[metric].pct).toBe(0);
      expect(r.rawMetricCoverage[metric].missingTeamIds).toEqual(fbs138());
    }
    for (const cat of LEGACY_CATEGORIES) {
      expect(r.legacyComputeCompatibleCoverage[cat].coveredTeamCount).toBe(0);
      expect(r.legacyComputeCompatibleCoverage[cat].pct).toBe(0);
      expect(r.legacyComputeCompatibleCoverage[cat].missingTeamIds).toEqual(fbs138());
    }
    expect(r.perTeamRawEvidence.every((row) => RAW_METRICS.every((m) => row[m] === false))).toBe(
      true
    );
    expect(JSON.stringify(r)).not.toMatch(/offRunGrade|defRunGrade/);
  });

  it('nonfinite values do not count', () => {
    expect(isFiniteNumber(null)).toBe(false);
    expect(isFiniteNumber(undefined)).toBe(false);
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFiniteNumber('')).toBe(false);
    expect(isFiniteNumber('abc')).toBe(false);
    expect(isFiniteNumber(true)).toBe(false);
    expect(isFiniteNumber(0)).toBe(true);

    const fbs = fbs138();
    const games: CfbdGameRow[] = [
      {
        gameIdCfbd: 'g-1',
        homeTeamIdInternal: fbs[0],
        awayTeamIdInternal: fbs[1],
      },
    ];
    const r = buildUnitGradeSourceReadinessReport(
      emptyInput({
        cfbdGames: games,
        effTeamGames: [
          {
            ...emptyEff('g-1', fbs[0]),
            lineYardsOff: Number.NaN,
            runEpa: Number.POSITIVE_INFINITY,
            passEpa: 'not-a-number',
            isoPppOff: null,
          },
        ],
        ppaTeamGames: [
          {
            ...emptyPpa('g-1', fbs[0]),
            ppaOffense: Number.NaN,
            ppaDefense: '',
          },
        ],
        effTeamSeasons: [
          { teamIdInternal: fbs[0], stuffRate: Number.NaN, havocOff: null, havocDef: undefined },
        ],
      })
    );
    expect(r.status).toBe('SOURCE_PARTIAL');
    expect(r.rawMetricCoverage.lineYardsOff.distinctTeams).toBe(0);
    expect(r.rawMetricCoverage.runEpa.distinctTeams).toBe(0);
    expect(r.rawMetricCoverage.ppaOffense.distinctTeams).toBe(0);
    expect(r.rawMetricCoverage.stuffRate.distinctTeams).toBe(0);
    expect(r.perTeamRawEvidence[0].lineYardsOff).toBe(false);
    expect(r.auditOk).toBe(true);
  });
});

describe('2026 unit-grade source readiness — coverage layers', () => {
  it('partial team coverage remains partial', () => {
    const fbs = fbs138();
    const games: CfbdGameRow[] = [
      {
        gameIdCfbd: 'g-1',
        homeTeamIdInternal: fbs[0],
        awayTeamIdInternal: fbs[1],
      },
    ];
    const r = buildUnitGradeSourceReadinessReport(
      emptyInput({
        cfbdGames: games,
        effTeamGames: [{ ...emptyEff('g-1', fbs[0]), lineYardsOff: 4.2 }],
      })
    );
    expect(r.status).toBe('SOURCE_PARTIAL');
    expect(r.auditOk).toBe(true);
    expect(r.rawMetricCoverage.lineYardsOff.distinctTeams).toBe(1);
    expect(r.rawMetricCoverage.lineYardsOff.missingTeamIds).toHaveLength(137);
    expect(r.rawMetricCoverage.lineYardsOff.missingTeamIds[0]).toBe(fbs[1]);
    expect(r.readiness.rawMetricCoverageComplete).toBe(false);
    expect(r.readiness.legacyComputeCompatibleCoverageComplete).toBe(false);
    expect(r.legacyComputeCompatibleCoverage.offRun.coveredTeamCount).toBe(1);
  });

  it('raw metric coverage is separate from legacy compatibility', () => {
    const fbs = fbs138();
    const games = gamesCovering(fbs);
    const ppaTeamGames: PpaTeamGameRow[] = fbs.map((id, i) => ({
      gameIdCfbd: games[Math.floor(i / 2)].gameIdCfbd,
      teamIdInternal: id,
      ppaOffense: 0.1,
      ppaDefense: -0.1,
    }));
    const r = buildUnitGradeSourceReadinessReport(
      emptyInput({ cfbdGames: games, ppaTeamGames })
    );
    expect(r.rawMetricCoverage.ppaOffense.distinctTeams).toBe(138);
    expect(r.rawMetricCoverage.runEpa.distinctTeams).toBe(0);
    expect(r.rawMetricCoverage.passEpa.distinctTeams).toBe(0);
    expect(r.legacyComputeCompatibleCoverage.offRun.coveredTeamCount).toBe(138);
    expect(r.legacyComputeCompatibleCoverage.offPass.coveredTeamCount).toBe(138);
    expect(r.readiness.rawMetricCoverageComplete).toBe(false);
    expect(r.readiness.legacyComputeCompatibleCoverageComplete).toBe(false);
    expect(r.legacyCompatibilityDisclaimer).toBe(LEGACY_COMPATIBILITY_DISCLAIMER);
  });

  it('PPA fallback may satisfy legacy compatibility but does NOT mark the raw missing run/pass metric present', () => {
    const fbs = fbs138();
    const games = gamesCovering(fbs);
    const ppaTeamGames: PpaTeamGameRow[] = fbs.map((id, i) => ({
      gameIdCfbd: games[Math.floor(i / 2)].gameIdCfbd,
      teamIdInternal: id,
      ppaOffense: 0.2,
      ppaDefense: -0.2,
    }));
    const r = buildUnitGradeSourceReadinessReport(
      emptyInput({ cfbdGames: games, ppaTeamGames })
    );
    expect(r.perTeamRawEvidence.every((row) => row.ppaOffense === true)).toBe(true);
    expect(r.perTeamRawEvidence.every((row) => row.runEpa === false)).toBe(true);
    expect(r.perTeamRawEvidence.every((row) => row.passEpa === false)).toBe(true);
    expect(r.rawMetricCoverage.runEpa.missingTeamIds).toEqual(fbs);
    expect(r.rawMetricCoverage.passEpa.missingTeamIds).toEqual(fbs);
    expect(r.legacyComputeCompatibleCoverage.offRun.missingTeamIds).toEqual([]);
    expect(r.legacyComputeCompatibleCoverage.offPass.missingTeamIds).toEqual([]);
    expect(r.legacyComputeCompatibleCoverage.defRun.missingTeamIds).toEqual([]);
    expect(r.legacyComputeCompatibleCoverage.defPass.missingTeamIds).toEqual([]);
  });

  it('explosiveness requires actual isoPpp source', () => {
    const fbs = fbs138();
    const games = gamesCovering(fbs);
    const ppaTeamGames: PpaTeamGameRow[] = fbs.map((id, i) => ({
      gameIdCfbd: games[Math.floor(i / 2)].gameIdCfbd,
      teamIdInternal: id,
      ppaOffense: 0.3,
      ppaDefense: -0.3,
    }));
    const r = buildUnitGradeSourceReadinessReport(
      emptyInput({ cfbdGames: games, ppaTeamGames })
    );
    expect(r.legacyComputeCompatibleCoverage.offExplosiveness.coveredTeamCount).toBe(0);
    expect(r.legacyComputeCompatibleCoverage.defExplosiveness.coveredTeamCount).toBe(0);
    expect(r.rawMetricCoverage.isoPppOff.distinctTeams).toBe(0);
    expect(r.rawMetricCoverage.isoPppDef.distinctTeams).toBe(0);
    expect(r.readiness.legacyComputeCompatibleCoverageComplete).toBe(false);

    const withIso: EffTeamGameRow[] = fbs.map((id, i) => ({
      ...emptyEff(games[Math.floor(i / 2)].gameIdCfbd, id),
      isoPppOff: 1.1,
      isoPppDef: 0.9,
    }));
    const completeLegacy = buildUnitGradeSourceReadinessReport(
      emptyInput({ cfbdGames: games, ppaTeamGames, effTeamGames: withIso })
    );
    expect(completeLegacy.legacyComputeCompatibleCoverage.offExplosiveness.coveredTeamCount).toBe(
      138
    );
    expect(completeLegacy.legacyComputeCompatibleCoverage.defExplosiveness.coveredTeamCount).toBe(
      138
    );
    expect(completeLegacy.readiness.legacyComputeCompatibleCoverageComplete).toBe(true);
    expect(completeLegacy.readiness.rawMetricCoverageComplete).toBe(false);
    expect(completeLegacy.status).toBe('SOURCE_COMPLETE_FOR_LEGACY_COMPUTE');
    expect(completeLegacy.readiness.safeToRunExistingCompute).toBe(false);
    expect(completeLegacy.warnings).toContain(
      'legacy_compute_compatible_via_fallback_does_not_authorize_methodology'
    );
  });
});

describe('2026 unit-grade source readiness — frame integrity', () => {
  it('missing one FBS team fails frame integrity', () => {
    const fbs = fbs138().slice(0, 137);
    const r = buildUnitGradeSourceReadinessReport(emptyInput({ fbsTeamIds: fbs }));
    expect(r.fbs.unique).toBe(137);
    expect(r.blockers).toContain('fbs_population_not_138');
    expect(r.status).toBe('FRAME_INVALID');
    expect(r.auditOk).toBe(false);
    assertNeverAuthorize(r);
  });

  it('duplicate FBS team fails', () => {
    const fbs = fbs138();
    fbs.push(fbs[0]);
    const r = buildUnitGradeSourceReadinessReport(emptyInput({ fbsTeamIds: fbs }));
    expect(r.blockers).toContain('duplicate_fbs_team_membership');
    expect(r.status).toBe('FRAME_INVALID');
    expect(r.auditOk).toBe(false);
  });

  it('duplicate game/provider identity fails', () => {
    const fbs = fbs138();
    const games: CfbdGameRow[] = [
      { gameIdCfbd: 'dup', homeTeamIdInternal: fbs[0], awayTeamIdInternal: fbs[1] },
      { gameIdCfbd: 'dup', homeTeamIdInternal: fbs[2], awayTeamIdInternal: fbs[3] },
    ];
    const r = buildUnitGradeSourceReadinessReport(emptyInput({ cfbdGames: games }));
    expect(r.blockers).toContain('duplicate_cfbd_game_id');
    expect(r.status).toBe('FRAME_INVALID');
    expect(r.auditOk).toBe(false);

    const linked: CfbdGameRow[] = [
      { gameIdCfbd: 'g-1', homeTeamIdInternal: fbs[0], awayTeamIdInternal: fbs[1] },
    ];
    const dupEff = buildUnitGradeSourceReadinessReport(
      emptyInput({
        cfbdGames: linked,
        effTeamGames: [
          { ...emptyEff('g-1', fbs[0]), lineYardsOff: 1 },
          { ...emptyEff('g-1', fbs[0]), lineYardsOff: 2 },
        ],
      })
    );
    expect(dupEff.blockers).toContain('duplicate_eff_team_game_identity');
    expect(dupEff.auditOk).toBe(false);

    const orphan = buildUnitGradeSourceReadinessReport(
      emptyInput({
        cfbdGames: linked,
        effTeamGames: [{ ...emptyEff('missing-game', fbs[0]), lineYardsOff: 1 }],
      })
    );
    expect(orphan.blockers).toContain('eff_team_game_unlinked_game_id');
    expect(orphan.rawMetricCoverage.lineYardsOff.distinctTeams).toBe(0);
  });

  it('existing TeamUnitGrades are reported, not overwritten', () => {
    const fbs = fbs138();
    const r = buildUnitGradeSourceReadinessReport(
      emptyInput({
        teamUnitGrades: [{ teamId: fbs[0] }, { teamId: fbs[1] }],
      })
    );
    expect(r.teamUnitGrades.rows).toBe(2);
    expect(r.teamUnitGrades.distinctTeams).toBe(2);
    expect(r.teamUnitGrades.teamIds).toEqual([fbs[0], fbs[1]].sort());
    expect(r.readiness.teamUnitGradesPresent).toBe(true);
    expect(r.status).toBe('UNIT_GRADES_ALREADY_PRESENT_UNEXPECTEDLY');
    expect(r.blockers).toContain(
      'team_unit_grades_present_without_authorized_compute_path'
    );
    expect(r.auditOk).toBe(false);
    expect(r.readiness.unitGradeWriteAuthorized).toBe(false);
    expect(r.mutationCount).toBe(0);
  });

  it('no compute authorization is ever emitted', () => {
    const cases = [
      emptyInput(),
      emptyInput({ fbsTeamIds: fbs138().slice(0, 137) }),
      emptyInput({ teamUnitGrades: [{ teamId: fbs138()[0] }] }),
    ];
    for (const input of cases) {
      const r = buildUnitGradeSourceReadinessReport(input);
      assertNeverAuthorize(r);
      const json = stableStringify(r);
      expect(json).toMatch(/"safeToRunExistingCompute": false/);
      expect(json).toMatch(/"computeUnitGradesAuthorized": false/);
      expect(json).not.toMatch(/"safeToRunExistingCompute": true/);
      expect(json).not.toMatch(/compute authorized/i);
    }
  });

  it('providerCalls = 0 and mutation count = 0', () => {
    const r = buildUnitGradeSourceReadinessReport(emptyInput());
    expect(r.providerCalls).toBe(0);
    expect(r.mutationCount).toBe(0);
    expect(r.providersInvoked).toBe(false);
    expect(r.mutationsInvoked).toBe(false);
  });

  it('deterministic sorted missing-team lists/report output', () => {
    const fbs = fbs138();
    const games: CfbdGameRow[] = [
      {
        gameIdCfbd: 'g-1',
        homeTeamIdInternal: fbs[5],
        awayTeamIdInternal: fbs[1],
      },
    ];
    const a = buildUnitGradeSourceReadinessReport(
      emptyInput({
        cfbdGames: games,
        effTeamGames: [{ ...emptyEff('g-1', fbs[5]), lineYardsOff: 3 }],
      })
    );
    const b = buildUnitGradeSourceReadinessReport(
      emptyInput({
        cfbdGames: games,
        effTeamGames: [{ ...emptyEff('g-1', fbs[5]), lineYardsOff: 3 }],
      })
    );
    expect(a.rawMetricCoverage.lineYardsOff.missingTeamIds).toEqual(
      [...a.rawMetricCoverage.lineYardsOff.missingTeamIds].sort()
    );
    expect(a.fbs.teamIds).toEqual([...a.fbs.teamIds].sort());
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(a.rawMetricCoverage.lineYardsOff.missingTeamIds).not.toContain(fbs[5]);
  });
});

describe('2026 unit-grade source readiness — workflow static', () => {
  const wf = fs.readFileSync(WF, 'utf8').replace(/\r\n/g, '\n');
  const cli = fs.readFileSync(CLI, 'utf8');
  const lib = fs.readFileSync(LIB, 'utf8');
  const runText = extractRunBodies(wf);

  it('workflow_dispatch only; season required / 2026 only; expected_main_sha required', () => {
    expect(wf).toContain('workflow_dispatch');
    expect(wf).toMatch(/season:/);
    expect(wf).toMatch(/expected_main_sha:/);
    expect(wf).toMatch(/required:\s*true/);
    expect(wf).toContain('season must equal 2026');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/^\s*push:/m);
    expect(wf).not.toMatch(/^\s*pull_request:/m);
    expect(wf).not.toMatch(/cron:/);
    expect(wf).not.toMatch(/week:/);
  });

  it('main ref guard and exact SHA guard run immediately after checkout', () => {
    const guard = stepBlock(wf, 'Source SHA guard');
    const audit = stepBlock(wf, 'Run 2026 unit-grade source readiness audit');
    expect(guard).toContain('refs/heads/main');
    expect(guard).toContain('EXPECTED_MAIN_SHA');
    expect(guard).toContain('git rev-parse HEAD');
    expect(wf.indexOf('- name: Source SHA guard')).toBeGreaterThan(
      wf.indexOf('- name: Checkout repository')
    );
    expect(wf.indexOf('- name: Source SHA guard')).toBeLessThan(
      wf.indexOf('- name: Setup Node.js')
    );
    expect(wf.indexOf('- name: Source SHA guard')).toBeLessThan(
      wf.indexOf('- name: Run 2026 unit-grade source readiness audit')
    );
    expect(audit).not.toContain('git rev-parse HEAD');
    expect(guard).not.toContain('audit-2026-unit-grade-source-readiness.ts');
    expect(cli).toContain("execFileSync('git', ['rev-parse', 'HEAD']");
  });

  it('no CFBD_API_KEY, no ODDS_API_KEY, no provider invocation', () => {
    expect(wf).toContain('CFBD_API_KEY: not provided');
    expect(wf).toContain('ODDS_API_KEY: not provided');
    expect(wf).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(wf).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(cli).not.toMatch(/CFBD_API_KEY|ODDS_API_KEY/);
    expect(cli).not.toMatch(/collegefootballdata|api\.the-odds-api/i);
    expect(lib).not.toMatch(/fetch\(|axios|CFBD_API_KEY/);
    expect(wf).toContain('providerCalls=0');
    expect(runText).not.toMatch(/\$\{\{\s*inputs\./);
  });

  it('no compute_unit_grades, ingest-cfbd-features, Shadow, migrate, or mutations', () => {
    expect(wf).toContain('compute_unit_grades: not invoked');
    expect(wf).toContain('ingest-cfbd-features: not invoked');
    expect(wf).toContain('Shadow PREVIEW: not invoked');
    expect(wf).toContain('Shadow COMMIT: not invoked');
    expect(wf).toContain('prisma migrate: not invoked');
    expect(runText).not.toMatch(/npx tsx[^\n]*compute_unit_grades/);
    expect(runText).not.toMatch(/npx tsx[^\n]*ingest-cfbd-features/);
    expect(runText).not.toMatch(/npx tsx[^\n]*capture-shadow-snapshot/);
    expect(runText).not.toMatch(/cfbd-feature-ingest/);
    expect(runText).not.toMatch(/prisma migrate deploy/);
    expect(runText).not.toMatch(/npx prisma migrate/);
    expect(runText).not.toMatch(/db push/);
    expect(cli).not.toContain('ingest-cfbd-features');
    expect(cli).not.toContain('teamUnitGrades.upsert');
    expect(cli).not.toContain('teamUnitGrades.create');
    expect(cli).not.toContain('cfbdGame.upsert');
    expect(cli).not.toContain('cfbdEffTeamGame.create');
    expect(cli).not.toContain('cfbdEffTeamGame.upsert');
    expect(cli).not.toMatch(/\.upsert\(|\.create\(|\.update\(|\.delete\(/);
    expect(cli).not.toContain('migrate deploy');
    expect(cli).not.toContain('capture-shadow-snapshot');
    expect(cli).toContain('findMany');
    expect(cli).toContain('DIRECT_URL');
    expect(lib).toContain(LEGACY_COMPATIBILITY_DISCLAIMER);
    expect(lib).toContain('compute_unit_grades.ts');
    expect(lib).not.toContain('TARGET_WEEK');
    expect(lib).not.toContain('EXPECTED_WEEK1_GAME_COUNT');
  });

  it('DB secret is not job-wide; npm ci has no production credentials', () => {
    const jobsPreamble = wf.split(/^\s+steps:\s*$/m)[0] ?? '';
    expect(jobsPreamble).not.toMatch(/secrets\.DIRECT_URL/);
    expect(jobsPreamble).not.toMatch(/DATABASE_URL:/);

    const install = stepBlock(wf, 'Install dependencies');
    const generate = stepBlock(wf, 'Generate Prisma client');
    const preflight = stepBlock(wf, 'Preflight (names/presence only)');
    const audit = stepBlock(wf, 'Run 2026 unit-grade source readiness audit');
    const upload = stepBlock(wf, 'Upload unit-grade source readiness report');
    const summary = stepBlock(wf, 'Summary');
    const guard = stepBlock(wf, 'Source SHA guard');

    expect(install).toContain('prisma_generate_placeholder');
    expect(generate).toContain('prisma_generate_placeholder');
    expect(install).not.toMatch(/secrets\.DIRECT_URL/);
    expect(generate).not.toMatch(/secrets\.DIRECT_URL/);
    expect(upload).not.toMatch(/secrets\.DIRECT_URL/);
    expect(summary).not.toMatch(/secrets\.DIRECT_URL/);
    expect(guard).not.toMatch(/secrets\.DIRECT_URL/);
    expect(preflight).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(audit).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(audit).not.toMatch(/DATABASE_URL:/);
    const secretHits = wf.match(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/g);
    expect(secretHits).toHaveLength(2);
  });

  it('forbidden production files are not imported', () => {
    expect(cli).not.toMatch(/from ['"].*compute_unit_grades/);
    expect(cli).not.toMatch(/from ['"].*ingest-cfbd-features/);
    expect(lib).not.toMatch(/from ['"].*compute_unit_grades/);
    expect(lib).not.toMatch(/TARGET_WEEK = 1/);
  });

  it('safe error handling suppresses secrets', () => {
    const safe = sanitizeUnitGradeSourceReadinessError(
      new Error('postgres://user:s3cret@host/db')
    );
    expect(safe).toContain('connection and secret details suppressed');
    expect(safe).not.toMatch(/postgres|s3cret/i);
  });
});
