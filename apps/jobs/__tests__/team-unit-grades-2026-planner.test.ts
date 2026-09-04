/**
 * Read-only 2026 TeamUnitGrades PREVIEW planner tests.
 * Pure. No network. No DB. No providers. No writes.
 */

import { buildBaseFbsFixture } from '../src/preseason/fbs-membership-init';
import {
  LEGACY_COMPATIBILITY_DISCLAIMER,
  TARGET_SEASON,
  isFiniteNumber,
  type CfbdGameRow,
  type EffTeamGameRow,
  type EffTeamSeasonRow,
  type PpaTeamGameRow,
  type UnitGradeSourceReadinessInput,
} from '../src/v2/unit-grade-source-readiness';
import {
  LEGACY_TEAM_UNIT_GRADE_OUTPUTS,
  LEGACY_TEAM_UNIT_GRADES_MATH_DISCLAIMER,
  LEGACY_TEAM_UNIT_GRADES_MATH_KIND,
  aggregateLegacyTeamUnitGradeInputs,
  completeLegacyTeamUnitGradeInputs,
  computeLegacyTeamUnitGrades,
} from '../src/v2/team-unit-grades-legacy-math';
import {
  SEASON_MUST_BE_2026_BLOCKER,
  parseTeamUnitGrades2026PreviewArgs,
  planTeamUnitGrades2026,
} from '../src/v2/team-unit-grades-2026-planner';

const SHA = 'f25f581469110f0abbd93cc649835c8aed86b02c';
const OBSERVED = '2026-09-04T17:00:00.000Z';

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

function completeRawInput(): UnitGradeSourceReadinessInput {
  const fbs = fbs138();
  const cfbdGames = gamesCovering(fbs);
  const effTeamGames: EffTeamGameRow[] = fbs.map((id, i) => ({
    gameIdCfbd: cfbdGames[Math.floor(i / 2)].gameIdCfbd,
    teamIdInternal: id,
    lineYardsOff: i === 0 ? 0 : 4.2,
    runEpa: 0.05,
    passEpa: 0.08,
    passSr: 0.45,
    defSr: 0.38,
    isoPppOff: 1.1,
    isoPppDef: 0.9,
  }));
  const ppaTeamGames: PpaTeamGameRow[] = fbs.map((id, i) => ({
    gameIdCfbd: cfbdGames[Math.floor(i / 2)].gameIdCfbd,
    teamIdInternal: id,
    ppaOffense: 0.2,
    ppaDefense: -0.1,
  }));
  const effTeamSeasons: EffTeamSeasonRow[] = fbs.map((id) => ({
    teamIdInternal: id,
    stuffRate: 0.22,
    havocOff: 0.11,
    havocDef: 0.2,
  }));
  return emptyInput({ cfbdGames, effTeamGames, ppaTeamGames, effTeamSeasons });
}

function assertNeverAuthorize(
  plan: ReturnType<typeof planTeamUnitGrades2026>
): void {
  expect(plan.authorization.teamUnitGradesWriteAuthorized).toBe(false);
  expect(plan.authorization.shadowPreviewAuthorized).toBe(false);
  expect(plan.authorization.shadowCommitAuthorized).toBe(false);
  expect(plan.authorization.computeUnitGradesAuthorized).toBe(false);
  expect(plan.providersInvoked).toBe(false);
  expect(plan.providerCalls).toBe(0);
  expect(plan.mutationsInvoked).toBe(false);
  expect(plan.mutationCount).toBe(0);
  expect(plan.mode).toBe('PREVIEW');
  expect(plan.legacyCompatibilityDisclaimer).toBe(LEGACY_COMPATIBILITY_DISCLAIMER);
  expect(plan.calculationDisclaimer).toBe(LEGACY_TEAM_UNIT_GRADES_MATH_DISCLAIMER);
  expect(plan.calculation.mathKind).toBe(LEGACY_TEAM_UNIT_GRADES_MATH_KIND);
}

function assertNoCalculation(plan: ReturnType<typeof planTeamUnitGrades2026>): void {
  expect(plan.calculation.attempted).toBe(false);
  expect(plan.calculation.inputRowCount).toBe(0);
  expect(plan.calculation.proposedRowCount).toBe(0);
  expect(plan.calculation.zStats).toBeNull();
  expect(plan.planning.proposedGradeRowCount).toBe(0);
  expect(plan.planning.proposedGradeRows).toEqual([]);
}

function assertExactDeep(left: unknown, right: unknown): void {
  if (typeof left === 'number' && typeof right === 'number') {
    expect(Object.is(left, right)).toBe(true);
    return;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    expect(Array.isArray(left) && Array.isArray(right)).toBe(true);
    if (!Array.isArray(left) || !Array.isArray(right)) return;
    expect(left.length).toBe(right.length);
    for (let i = 0; i < left.length; i++) {
      assertExactDeep(left[i], right[i]);
    }
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

describe('2026 TeamUnitGrades preview args', () => {
  it('requires season 2026 and rejects COMMIT', () => {
    expect(parseTeamUnitGrades2026PreviewArgs([]).ok).toBe(true);
    expect(parseTeamUnitGrades2026PreviewArgs(['--season', '2026']).ok).toBe(true);
    expect(parseTeamUnitGrades2026PreviewArgs(['--season', '2025']).ok).toBe(false);
    expect(parseTeamUnitGrades2026PreviewArgs(['--mode', 'COMMIT']).ok).toBe(false);
    expect(parseTeamUnitGrades2026PreviewArgs(['--mode', 'PREVIEW']).ok).toBe(true);
  });
});

describe('2026 TeamUnitGrades preview planner', () => {
  it('current-style SOURCE_PARTIAL is a successful blocked PREVIEW with no proposed rows', () => {
    const fbs = fbs138();
    const plan = planTeamUnitGrades2026(
      emptyInput({
        cfbdGames: [
          {
            gameIdCfbd: 'g-1',
            homeTeamIdInternal: fbs[0],
            awayTeamIdInternal: fbs[1],
          },
        ],
        effTeamGames: [{ ...emptyEff('g-1', fbs[0]), lineYardsOff: 4.2, runEpa: 0 }],
        ppaTeamGames: [
          { gameIdCfbd: 'g-1', teamIdInternal: fbs[0], ppaOffense: 0.1, ppaDefense: -0.1 },
        ],
      })
    );
    expect(plan.sourceReadinessStatus).toBe('SOURCE_PARTIAL');
    expect(plan.plannerStatus).toBe('BLOCKED_SOURCE_INCOMPLETE');
    expect(plan.planning.authoritativePlanningAllowed).toBe(false);
    assertNoCalculation(plan);
    expect(plan.failClosed).toBe(false);
    expect(plan.previewOk).toBe(true);
    expect(plan.coverage.rawMetricCoverageComplete).toBe(false);
    expect(plan.fbs.unique).toBe(138);
    assertNeverAuthorize(plan);
  });

  it('SOURCE_EMPTY is blocked with no proposed rows', () => {
    const plan = planTeamUnitGrades2026(emptyInput());
    expect(plan.sourceReadinessStatus).toBe('SOURCE_EMPTY');
    expect(plan.plannerStatus).toBe('BLOCKED_SOURCE_INCOMPLETE');
    expect(plan.planning.authoritativePlanningAllowed).toBe(false);
    assertNoCalculation(plan);
    expect(plan.failClosed).toBe(false);
    expect(plan.previewOk).toBe(true);
    assertNeverAuthorize(plan);
  });

  it('malformed FBS frame fail-closes with no proposed rows', () => {
    const plan = planTeamUnitGrades2026(
      emptyInput({ fbsTeamIds: fbs138().slice(0, 137) })
    );
    expect(plan.sourceReadinessStatus).toBe('FRAME_INVALID');
    expect(plan.plannerStatus).toBe('BLOCKED_FRAME_INVALID');
    assertNoCalculation(plan);
    expect(plan.failClosed).toBe(true);
    expect(plan.previewOk).toBe(false);
    assertNeverAuthorize(plan);
  });

  it('invalid game/team linkage fail-closes', () => {
    const fbs = fbs138();
    const plan = planTeamUnitGrades2026(
      emptyInput({
        cfbdGames: [
          {
            gameIdCfbd: 'g-1',
            homeTeamIdInternal: fbs[0],
            awayTeamIdInternal: fbs[1],
          },
        ],
        effTeamGames: [{ ...emptyEff('g-1', fbs[2]), lineYardsOff: 4.2 }],
      })
    );
    expect(plan.sourceReadinessStatus).toBe('FRAME_INVALID');
    expect(plan.plannerStatus).toBe('BLOCKED_FRAME_INVALID');
    assertNoCalculation(plan);
    expect(plan.failClosed).toBe(true);
    assertNeverAuthorize(plan);
  });

  it('duplicate game/team identities fail-close', () => {
    const fbs = fbs138();
    const game = {
      gameIdCfbd: 'g-1',
      homeTeamIdInternal: fbs[0],
      awayTeamIdInternal: fbs[1],
    };
    const dupGames = planTeamUnitGrades2026(
      emptyInput({ cfbdGames: [game, { ...game }] })
    );
    expect(dupGames.plannerStatus).toBe('BLOCKED_FRAME_INVALID');
    expect(dupGames.failClosed).toBe(true);
    assertNoCalculation(dupGames);

    const dupEff = planTeamUnitGrades2026(
      emptyInput({
        cfbdGames: [game],
        effTeamGames: [
          { ...emptyEff('g-1', fbs[0]), lineYardsOff: 4.1 },
          { ...emptyEff('g-1', fbs[0]), lineYardsOff: 4.2 },
        ],
      })
    );
    expect(dupEff.plannerStatus).toBe('BLOCKED_FRAME_INVALID');
    expect(dupEff.failClosed).toBe(true);
    assertNoCalculation(dupEff);
  });

  it('unexpected existing 2026 TeamUnitGrades blocks without overwrite', () => {
    const plan = planTeamUnitGrades2026(
      emptyInput({ teamUnitGrades: [{ teamId: fbs138()[0] }] })
    );
    expect(plan.sourceReadinessStatus).toBe('UNIT_GRADES_ALREADY_PRESENT_UNEXPECTEDLY');
    expect(plan.plannerStatus).toBe('BLOCKED_EXISTING_GRADES');
    expect(plan.sourceInventory.existingTeamUnitGradesRows).toBe(1);
    expect(plan.planning.authoritativePlanningAllowed).toBe(false);
    assertNoCalculation(plan);
    expect(plan.failClosed).toBe(true);
    assertNeverAuthorize(plan);
  });

  it('hypothetical complete raw source becomes planning-eligible with 138 proposed rows and no write authorization', () => {
    const input = completeRawInput();
    const plan = planTeamUnitGrades2026(input);
    expect(plan.season).toBe(TARGET_SEASON);
    expect(plan.coverage.rawMetricCoverageComplete).toBe(true);
    expect(plan.plannerStatus).toBe('PLANNING_ELIGIBLE');
    expect(plan.planning.authoritativePlanningAllowed).toBe(true);
    expect(plan.calculation.attempted).toBe(true);
    expect(plan.calculation.inputRowCount).toBe(138);
    expect(plan.calculation.proposedRowCount).toBe(138);
    expect(plan.planning.proposedGradeRowCount).toBe(138);
    expect(plan.planning.proposedGradeRows.length).toBe(138);
    expect(plan.failClosed).toBe(false);
    expect(plan.previewOk).toBe(true);
    expect(plan.warnings).not.toContain(
      'authoritative_grade_generation_not_implemented_in_this_preview'
    );
    const ids = plan.planning.proposedGradeRows.map((r) => r.teamId);
    const unique = ids.filter((id, i) => ids.indexOf(id) === i).sort();
    expect(unique.length).toBe(138);
    expect(unique).toEqual(input.fbsTeamIds.slice().sort());
    expect(ids).toEqual(unique);
    for (let i = 0; i < plan.planning.proposedGradeRows.length; i++) {
      const row = plan.planning.proposedGradeRows[i];
      expect(typeof row.teamId).toBe('string');
      expect(row.teamId.trim()).not.toBe('');
      for (let o = 0; o < LEGACY_TEAM_UNIT_GRADE_OUTPUTS.length; o++) {
        expect(Number.isFinite(row[LEGACY_TEAM_UNIT_GRADE_OUTPUTS[o]])).toBe(true);
      }
    }
    expect(plan.calculation.zStats).not.toBeNull();
    expect(Object.prototype.hasOwnProperty.call(plan.planning.proposedGradeRows[0], 'id')).toBe(
      false
    );
    expect(
      Object.prototype.hasOwnProperty.call(plan.planning.proposedGradeRows[0], 'createdAt')
    ).toBe(false);
    assertNeverAuthorize(plan);
  });

  it('direct planner call with complete raw 2025 input fail-closes as BLOCKED_SEASON_INVALID', () => {
    const plan = planTeamUnitGrades2026({
      ...completeRawInput(),
      season: 2025,
    });
    expect(plan.season).toBe(2025);
    expect(plan.plannerStatus).toBe('BLOCKED_SEASON_INVALID');
    expect(plan.planning.authoritativePlanningAllowed).toBe(false);
    assertNoCalculation(plan);
    expect(plan.failClosed).toBe(true);
    expect(plan.previewOk).toBe(false);
    expect(plan.blockers).toContain(SEASON_MUST_BE_2026_BLOCKER);
    expect(plan.coverage.rawMetricCoverageComplete).toBe(true);
    assertNeverAuthorize(plan);
  });

  it('legacy-complete-via-PPA-fallback is still BLOCKED_SOURCE_INCOMPLETE', () => {
    const fbs = fbs138();
    const games = gamesCovering(fbs);
    const ppaTeamGames: PpaTeamGameRow[] = fbs.map((id, i) => ({
      gameIdCfbd: games[Math.floor(i / 2)].gameIdCfbd,
      teamIdInternal: id,
      ppaOffense: 0.2,
      ppaDefense: -0.2,
    }));
    const withIso: EffTeamGameRow[] = fbs.map((id, i) => ({
      ...emptyEff(games[Math.floor(i / 2)].gameIdCfbd, id),
      isoPppOff: 1.1,
      isoPppDef: 0.9,
    }));
    const plan = planTeamUnitGrades2026(
      emptyInput({ cfbdGames: games, ppaTeamGames, effTeamGames: withIso })
    );
    expect(plan.sourceReadinessStatus).toBe('SOURCE_COMPLETE_FOR_LEGACY_COMPUTE');
    expect(plan.coverage.legacyComputeCompatibleCoverageComplete).toBe(true);
    expect(plan.coverage.rawMetricCoverageComplete).toBe(false);
    expect(plan.plannerStatus).toBe('BLOCKED_SOURCE_INCOMPLETE');
    expect(plan.planning.authoritativePlanningAllowed).toBe(false);
    assertNoCalculation(plan);
    assertNeverAuthorize(plan);
  });

  it('zero is a real finite metric and is not treated as missing', () => {
    expect(isFiniteNumber(0)).toBe(true);
    const fbs = fbs138();
    const plan = planTeamUnitGrades2026(
      emptyInput({
        cfbdGames: [
          {
            gameIdCfbd: 'g-1',
            homeTeamIdInternal: fbs[0],
            awayTeamIdInternal: fbs[1],
          },
        ],
        effTeamGames: [{ ...emptyEff('g-1', fbs[0]), lineYardsOff: 0, runEpa: 0 }],
      })
    );
    expect(plan.coverage.rawMetricCoverage.lineYardsOff.finiteRows).toBe(1);
    expect(plan.coverage.rawMetricCoverage.lineYardsOff.distinctTeams).toBe(1);
    expect(plan.coverage.rawMetricCoverage.runEpa.finiteRows).toBe(1);
    expect(plan.coverage.rawMetricCoverage.lineYardsOff.missingTeamIds).not.toContain(
      fbs[0]
    );
    expect(plan.plannerStatus).toBe('BLOCKED_SOURCE_INCOMPLETE');
    assertNoCalculation(plan);
  });

  it('null/undefined/NaN/nonfinite evidence remains missing and is never zero-filled', () => {
    const fbs = fbs138();
    const plan = planTeamUnitGrades2026(
      emptyInput({
        cfbdGames: [
          {
            gameIdCfbd: 'g-1',
            homeTeamIdInternal: fbs[0],
            awayTeamIdInternal: fbs[1],
          },
        ],
        effTeamGames: [
          {
            ...emptyEff('g-1', fbs[0]),
            lineYardsOff: null,
            runEpa: undefined,
            passEpa: Number.NaN,
            passSr: Number.POSITIVE_INFINITY,
          },
        ],
      })
    );
    expect(plan.coverage.rawMetricCoverage.lineYardsOff.finiteRows).toBe(0);
    expect(plan.coverage.rawMetricCoverage.runEpa.finiteRows).toBe(0);
    expect(plan.coverage.rawMetricCoverage.passEpa.finiteRows).toBe(0);
    expect(plan.coverage.rawMetricCoverage.passSr.finiteRows).toBe(0);
    expect(plan.coverage.rawMetricCoverage.lineYardsOff.distinctTeams).toBe(0);
    expect(plan.planning.proposedGradeRows).toEqual([]);
    expect(plan.plannerStatus).toBe('BLOCKED_SOURCE_INCOMPLETE');
    assertNoCalculation(plan);
  });

  it('complete fixture permutations yield identical proposed rows and zStats', () => {
    const base = completeRawInput();
    const reversed: UnitGradeSourceReadinessInput = {
      ...base,
      fbsTeamIds: base.fbsTeamIds.slice().reverse(),
      cfbdGames: base.cfbdGames.slice().reverse(),
      effTeamGames: base.effTeamGames.slice().reverse(),
      ppaTeamGames: base.ppaTeamGames.slice().reverse(),
      effTeamSeasons: base.effTeamSeasons.slice().reverse(),
    };
    const a = planTeamUnitGrades2026(base);
    const b = planTeamUnitGrades2026(reversed);
    expect(a.plannerStatus).toBe('PLANNING_ELIGIBLE');
    expect(b.plannerStatus).toBe('PLANNING_ELIGIBLE');
    if (a.plannerStatus !== 'PLANNING_ELIGIBLE' || b.plannerStatus !== 'PLANNING_ELIGIBLE') {
      return;
    }
    assertExactDeep(a.planning.proposedGradeRows, b.planning.proposedGradeRows);
    assertExactDeep(a.calculation.zStats, b.calculation.zStats);
    assertExactDeep(a.calculation, {
      attempted: true,
      mathKind: LEGACY_TEAM_UNIT_GRADES_MATH_KIND,
      inputRowCount: 138,
      proposedRowCount: 138,
      zStats: a.calculation.zStats,
    });
  });

  it('calculation contract failure after eligible source fail-closes with zero rows', () => {
    const plan = planTeamUnitGrades2026(completeRawInput(), {
      math: {
        aggregate: aggregateLegacyTeamUnitGradeInputs,
        complete: () => ({ ok: false, blockers: ['nonfinite:havocDef'] }),
        compute: computeLegacyTeamUnitGrades,
      },
    });
    expect(plan.coverage.rawMetricCoverageComplete).toBe(true);
    expect(plan.plannerStatus).toBe('BLOCKED_CALCULATION_INPUT_INVALID');
    expect(plan.planning.authoritativePlanningAllowed).toBe(false);
    expect(plan.planning.proposedGradeRows).toEqual([]);
    expect(plan.planning.proposedGradeRowCount).toBe(0);
    expect(plan.calculation.attempted).toBe(true);
    expect(plan.calculation.proposedRowCount).toBe(0);
    expect(plan.calculation.zStats).toBeNull();
    expect(plan.failClosed).toBe(true);
    expect(plan.previewOk).toBe(false);
    expect(plan.blockers).toContain('calculation:nonfinite:havocDef');
    assertNeverAuthorize(plan);
  });

  it('complete fixture literal zero remains a real metric and proposed grades stay finite', () => {
    const input = completeRawInput();
    expect(input.effTeamGames[0].lineYardsOff).toBe(0);
    const plan = planTeamUnitGrades2026(input);
    expect(plan.plannerStatus).toBe('PLANNING_ELIGIBLE');
    const zeroTeam = input.effTeamGames[0].teamIdInternal;
    const row = plan.planning.proposedGradeRows.filter((r) => r.teamId === zeroTeam)[0];
    expect(row).toBeTruthy();
    expect(Number.isFinite(row.offRunGrade)).toBe(true);
  });

  it('proposed rows match direct pure-module output for the same complete fixture', () => {
    const input = completeRawInput();
    const aggregated = aggregateLegacyTeamUnitGradeInputs({
      teamIds: input.fbsTeamIds,
      effTeamGames: input.effTeamGames,
      ppaTeamGames: input.ppaTeamGames,
      effTeamSeasons: input.effTeamSeasons,
    });
    expect(aggregated.ok).toBe(true);
    if (aggregated.ok === false) return;
    const completed = completeLegacyTeamUnitGradeInputs(aggregated.rows);
    expect(completed.ok).toBe(true);
    if (completed.ok === false) return;
    const math = computeLegacyTeamUnitGrades(completed.rows);
    expect(math.ok).toBe(true);
    if (math.ok === false) return;
    const plan = planTeamUnitGrades2026(input);
    expect(plan.plannerStatus).toBe('PLANNING_ELIGIBLE');
    assertExactDeep(plan.planning.proposedGradeRows, math.grades);
    assertExactDeep(plan.calculation.zStats, math.zStats);
  });
});
