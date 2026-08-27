/**
 * Phase 2C-2H-8 — Balanced V1 transition blend evaluation tests.
 * No network. No production DB. No providers. No Odds. No ratings persistence.
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildBaseFbsFixture } from '../src/preseason/fbs-membership-init';
import {
  BALANCED_V1_CALIBRATION_FACTOR,
  BALANCED_WEIGHT_TALENT,
  computeBalancedV1Ratings,
} from '../src/ratings/compute_balanced_v1';
import {
  CANDIDATE_A_TALENT_SCALE,
  computeTalentOnlyBridgeRatings,
} from '../src/preseason/balanced-v1-preseason-bridge-eval';
import {
  EXPECTED_2025_FBS_COUNT,
  EXPECTED_2026_FBS_COUNT,
  HISTORICAL_BALANCED_SNAPSHOT_CUTOFF_ISO,
  b1CanonicalWeight,
  b2CanonicalWeight,
  b3CanonicalWeight,
  blendRatings,
  buildBalancedV1TransitionBlendEvaluation,
  buildBlendedWeekRatings,
  buildWeeklyStabilityStats,
  formatBalancedV1TransitionBlendReport,
  hardSwitchWeight,
  parseBalancedV1TransitionBlendArgs,
  sanitizeBalancedV1TransitionBlendError,
  type BalancedV1TransitionBlendInput,
  type WeeklyCanonicalSnapshot,
} from '../src/preseason/balanced-v1-transition-blend-eval';
import type {
  TransitionEpaRow,
  TransitionGameRow,
} from '../src/preseason/balanced-v1-transition-timing-eval';
import type { BalancedV1TransitionBlendReadStore } from '../evaluate-balanced-v1-transition-blends';

function fbs2025(): string[] {
  return buildBaseFbsFixture(EXPECTED_2025_FBS_COUNT);
}

function fbs2026(): string[] {
  const base = buildBaseFbsFixture(136);
  return ['north-dakota-state', 'sacramento-state', ...base].slice(0, 138);
}

function talentFor(fbs: string[], scale = 400) {
  return fbs.map((teamId, i) => ({
    teamId,
    talentComposite: scale + i * 2,
  }));
}

/** Chronologically safe weekly finals; all teams play each week → 100% by W1. */
function buildWeeklyGames(
  fbs: string[],
  maxWeek: number
): TransitionGameRow[] {
  const games: TransitionGameRow[] = [];
  let gid = 0;
  for (let week = 1; week <= maxWeek; week++) {
    const month = week <= 4 ? 8 : 9;
    const day = week <= 4 ? 20 + week : week - 4;
    for (let i = 0; i + 1 < fbs.length; i += 2) {
      const a = fbs[(i + week) % fbs.length];
      const b = fbs[(i + 1 + week) % fbs.length];
      if (a === b) continue;
      games.push({
        gameId: `g-${++gid}`,
        week,
        date: `2025-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T19:00:00.000Z`,
        status: 'final',
        homeTeamId: a,
        awayTeamId: b,
        homeScore: 28 + (i % 10),
        awayScore: 21 + (week % 7),
      });
    }
  }
  return games;
}

/** Only first half of teams play through maxWeek → incomplete coverage. */
function buildIncompleteGames(
  fbs: string[],
  maxWeek: number
): TransitionGameRow[] {
  const half = fbs.slice(0, Math.floor(fbs.length / 2));
  return buildWeeklyGames(half.length >= 4 ? half : fbs.slice(0, 4), maxWeek);
}

function epaForGames(games: TransitionGameRow[]): TransitionEpaRow[] {
  const rows: TransitionEpaRow[] = [];
  for (const g of games) {
    if (g.status !== 'final') continue;
    rows.push({
      gameId: g.gameId,
      week: g.week,
      teamId: g.homeTeamId,
      epaOff: 0.1,
      epaDef: -0.05,
    });
    rows.push({
      gameId: g.gameId,
      week: g.week,
      teamId: g.awayTeamId,
      epaOff: 0.05,
      epaDef: 0.02,
    });
  }
  return rows;
}

function targetsFromCandidateA(fbs: string[]) {
  return computeTalentOnlyBridgeRatings(
    talentFor(fbs).map((t) => ({
      teamId: t.teamId,
      talentComposite: t.talentComposite as number,
    }))
  ).map((r) => ({ teamId: r.teamId, powerRating: r.candidateA + 2 }));
}

function healthyInput(
  overrides: Partial<BalancedV1TransitionBlendInput> = {}
): BalancedV1TransitionBlendInput {
  const ids25 = fbs2025();
  const ids26 = fbs2026();
  const games = buildWeeklyGames(ids25, 8);
  return {
    fbsIds2025: ids25,
    talent2025: talentFor(ids25),
    games2025: games,
    epa2025: epaForGames(games),
    persistedV1Targets2025: targetsFromCandidateA(ids25),
    historicalCutoffIso: HISTORICAL_BALANCED_SNAPSHOT_CUTOFF_ISO,
    cutoffWeeks: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    fbsIds2026: ids26,
    talent2026: talentFor(ids26),
    finalFbsVsFbsGames2026: 0,
    existingV1FbsRows2026: 0,
    ...overrides,
  };
}

describe('Balanced V1 transition blend evaluation', () => {
  it('Candidate A remains talentZ*3.5; canonical formula unchanged', () => {
    expect(CANDIDATE_A_TALENT_SCALE).toBe(3.5);
    expect(CANDIDATE_A_TALENT_SCALE).toBe(
      BALANCED_WEIGHT_TALENT * BALANCED_V1_CALIBRATION_FACTOR
    );
    const ratings = computeBalancedV1Ratings([
      {
        teamId: 'a',
        teamName: 'A',
        talentScore: 10,
        epaOverall: 1,
        netPointsPerGame: 5,
        winPct: 1,
        gamesPlayed: 10,
      },
      {
        teamId: 'b',
        teamName: 'B',
        talentScore: 0,
        epaOverall: -1,
        netPointsPerGame: -5,
        winPct: 0,
        gamesPlayed: 10,
      },
    ]);
    for (const r of ratings) {
      expect(r.powerRating).toBeCloseTo(r.zComposite * 14.0, 12);
    }
  });

  it('blend formula is exact: A*(1-w)+C*w', () => {
    expect(blendRatings(10, 20, 0)).toBe(10);
    expect(blendRatings(10, 20, 1)).toBe(20);
    expect(blendRatings(10, 20, 0.25)).toBeCloseTo(12.5, 12);
    expect(blendRatings(10, 20, 0.5)).toBeCloseTo(15, 12);
    expect(blendRatings(10, 20, 2 / 3)).toBeCloseTo(10 * (1 / 3) + 20 * (2 / 3), 12);
  });

  it('B1 weights exactly 0 / .25 / .50 / .75 / 1', () => {
    expect(b1CanonicalWeight(0)).toBe(0);
    expect(b1CanonicalWeight(1)).toBe(0);
    expect(b1CanonicalWeight(2)).toBe(0);
    expect(b1CanonicalWeight(3)).toBe(0.25);
    expect(b1CanonicalWeight(4)).toBe(0.5);
    expect(b1CanonicalWeight(5)).toBe(0.75);
    expect(b1CanonicalWeight(6)).toBe(1);
    expect(b1CanonicalWeight(8)).toBe(1);
  });

  it('B2 weights exact', () => {
    expect(b2CanonicalWeight(3)).toBe(0);
    expect(b2CanonicalWeight(4)).toBe(0.25);
    expect(b2CanonicalWeight(5)).toBe(0.5);
    expect(b2CanonicalWeight(6)).toBe(0.75);
    expect(b2CanonicalWeight(7)).toBe(1);
  });

  it('B3 weights exact', () => {
    expect(b3CanonicalWeight(2)).toBe(0);
    expect(b3CanonicalWeight(3)).toBeCloseTo(1 / 3, 12);
    expect(b3CanonicalWeight(4)).toBeCloseTo(2 / 3, 12);
    expect(b3CanonicalWeight(5)).toBe(1);
  });

  it('no canonical blending before 100% coverage (weight>0 fails closed)', () => {
    const incomplete: WeeklyCanonicalSnapshot = {
      cutoffWeek: 2,
      ratingCount: 90,
      teamIds: fbs2025().slice(0, 90),
      ratingsById: new Map(
        fbs2025()
          .slice(0, 90)
          .map((id) => [id, 1] as const)
      ),
      exactFbsSet: false,
      fullCoverage: false,
      coveragePct: 66,
      teamsWithAtLeast1FbsGame: 90,
      teamsWithAtLeast2FbsGames: 10,
    };
    const candidateAById = new Map(fbs2025().map((id) => [id, 0] as const));
    const fail = buildBlendedWeekRatings({
      fbsIds: fbs2025(),
      candidateAById,
      canonicalSnapshot: incomplete,
      canonicalWeight: 0.25,
    });
    expect(fail.ok).toBe(false);
    const okZero = buildBlendedWeekRatings({
      fbsIds: fbs2025(),
      candidateAById,
      canonicalSnapshot: incomplete,
      canonicalWeight: 0,
    });
    expect(okZero.ok).toBe(true);
  });

  it('incomplete canonical set fails closed in evaluation when policy weight > 0', () => {
    const ids = fbs2025();
    const games = buildIncompleteGames(ids, 8);
    const result = buildBalancedV1TransitionBlendEvaluation(
      healthyInput({
        games2025: games,
        epa2025: epaForGames(games),
      })
    );
    expect(result.ok).toBe(false);
    expect(
      result.findings.some((f) => f.includes('fullCoverage=false') || f.includes('canonicalWeight='))
    ).toBe(true);
  });

  it('weekly delta calculations correct', () => {
    const movers = [
      {
        teamId: 'a',
        prior: 10,
        current: 12,
        weeklyDelta: 2,
        absDelta: 2,
      },
      {
        teamId: 'b',
        prior: 10,
        current: 5,
        weeklyDelta: -5,
        absDelta: 5,
      },
    ];
    const st = buildWeeklyStabilityStats(movers);
    expect(st.meanAbsDelta).toBeCloseTo(3.5, 12);
    expect(st.over2).toBe(1);
    expect(st.over3).toBe(1);
    expect(st.over5).toBe(0);
    expect(st.maxAbsDelta).toBe(5);
  });

  it('parity metrics and healthy path produce coherent policy weeks', () => {
    const result = buildBalancedV1TransitionBlendEvaluation(healthyInput());
    expect(result.ok).toBe(true);
    expect(result.fbsCount2025).toBe(136);
    const b1 = result.policies.find((p) => p.policy.id === 'B1')!;
    const w3 = b1.weeks.find((w) => w.week === 3)!;
    expect(w3.canonicalWeight).toBe(0.25);
    expect(w3.count).toBe(136);
    expect(w3.vsNov24.mae).not.toBeNull();
    expect(w3.vsNov24.pearson).not.toBeNull();
    expect(w3.weeklyStability).not.toBeNull();
  });

  it('hard-switch controls are diagnostic only / rejected', () => {
    const result = buildBalancedV1TransitionBlendEvaluation(healthyInput());
    for (const id of ['HARD_SWITCH_W3', 'HARD_SWITCH_W4', 'HARD_SWITCH_W6'] as const) {
      const p = result.policies.find((x) => x.policy.id === id)!;
      expect(p.policy.kind).toBe('HARD_SWITCH_CONTROL');
      expect(p.policy.rejectedControl).toBe(true);
      expect(hardSwitchWeight(3, 2)).toBe(0);
      expect(hardSwitchWeight(3, 3)).toBe(1);
    }
    expect(result.blendPolicyAuthorized).toBe(false);
    expect(result.transitionPolicyAuthorized).toBe(false);
  });

  it('no per-team mixed-scale policy authorized', () => {
    const result = buildBalancedV1TransitionBlendEvaluation(healthyInput());
    expect(result.perTeamMixedScaleAuthorized).toBe(false);
    // All teams share the same global weight each week
    const b1 = result.policies.find((p) => p.policy.id === 'B1')!;
    for (const w of b1.weeks) {
      expect(w.count).toBe(136);
    }
  });

  it('exact 136 historical team sets and 138 2026 state', () => {
    const result = buildBalancedV1TransitionBlendEvaluation(healthyInput());
    expect(result.ok).toBe(true);
    expect(result.fbsCount2025).toBe(EXPECTED_2025_FBS_COUNT);
    expect(result.talentSetExact2025).toBe(true);
    expect(result.persistedTargetSetExact2025).toBe(true);
    expect(result.confirm2026.fbsCount).toBe(138);
    expect(result.confirm2026.finiteTalent2026).toBe(138);
    expect(result.confirm2026.talentSetExact2026).toBe(true);
    expect(result.confirm2026.duplicateTalentTeamIds2026).toBe(0);
    expect(result.confirm2026.highlightTeamsPresent).toBe(true);
  });

  it('zero current 2026 final games and V1 rows required', () => {
    expect(
      buildBalancedV1TransitionBlendEvaluation(
        healthyInput({ finalFbsVsFbsGames2026: 1 })
      ).ok
    ).toBe(false);
    expect(
      buildBalancedV1TransitionBlendEvaluation(
        healthyInput({ existingV1FbsRows2026: 1 })
      ).ok
    ).toBe(false);
    const healthy = buildBalancedV1TransitionBlendEvaluation(healthyInput());
    expect(healthy.confirm2026.purePreseason2026).toBe(true);
    expect(healthy.confirm2026.finalFbsVsFbsGames).toBe(0);
    expect(healthy.confirm2026.existingV1FbsRows).toBe(0);
  });

  it('chronology safe on healthy fixture; postponed game fails', () => {
    const healthy = buildBalancedV1TransitionBlendEvaluation(healthyInput());
    expect(healthy.weekDateChronologySafe).toBe(true);

    const ids = fbs2025();
    const games = buildWeeklyGames(ids, 4);
    const week2 = games.find((g) => g.week === 2)!;
    week2.date = '2025-09-15T19:00:00.000Z';
    const bad = buildBalancedV1TransitionBlendEvaluation(
      healthyInput({
        games2025: games,
        epa2025: epaForGames(games),
        cutoffWeeks: [0, 1, 2, 3, 4],
      })
    );
    expect(bad.weekDateChronologySafe).toBe(false);
    expect(bad.ok).toBe(false);
  });

  it('no policy automatically authorized; candidate inconclusive', () => {
    const result = buildBalancedV1TransitionBlendEvaluation(healthyInput());
    expect(result.blendPolicyCandidate).toBe('INCONCLUSIVE');
    expect(result.selectionThresholdDefined).toBe(false);
    expect(result.blendPolicyAuthorized).toBe(false);
    expect(result.modelChangeAuthorized).toBe(false);
    expect(result.ratingsWriteAuthorized).toBe(false);
  });

  it('no writes/providers/Odds; read-only store mutation-free', () => {
    const store: BalancedV1TransitionBlendReadStore = {
      async loadFbsTeamIds() {
        return [];
      },
      async loadTalentRows() {
        return [];
      },
      async loadPersistedV1Targets() {
        return [];
      },
      async loadFinalGames() {
        return [];
      },
      async loadEpaRows() {
        return [];
      },
      async countExistingV1FbsRows() {
        return 0;
      },
    };
    expect(Object.keys(store).every((k) => /^(load|count)/.test(k))).toBe(true);
    const result = buildBalancedV1TransitionBlendEvaluation(healthyInput());
    expect(result.providersInvoked).toBe(false);
    expect(result.mutationsInvoked).toBe(false);
    expect(result.Odds).toBe(false);
  });

  it('safe error handling; legacy compute_ratings_v1 untouched', () => {
    const safe = sanitizeBalancedV1TransitionBlendError(
      new Error('postgres://user:s3cret@host/db')
    );
    expect(safe).toContain('connection and secret details suppressed');
    expect(safe).not.toMatch(/postgres|s3cret/i);
    expect(
      parseBalancedV1TransitionBlendArgs(['--study-season', '2026']).ok
    ).toBe(false);
    expect(
      parseBalancedV1TransitionBlendArgs(['--study-season', '2025'])
    ).toEqual({ ok: true, studySeason: 2025 });
    const v1 = fs.readFileSync(
      path.join(__dirname, '../src/ratings/compute_ratings_v1.ts'),
      'utf8'
    );
    expect(v1).toContain('LEGACY');
    const wf = fs.readFileSync(
      path.join(
        __dirname,
        '../../../.github/workflows/evaluate-balanced-v1-transition-blends.yml'
      ),
      'utf8'
    );
    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).toContain('CFBD_API_KEY: not provided');
    expect(wf).toContain('blendPolicyAuthorized=false');
  });

  it('B1 week weights applied on healthy full-coverage path', () => {
    const result = buildBalancedV1TransitionBlendEvaluation(healthyInput());
    const b1 = result.policies.find((p) => p.policy.id === 'B1')!;
    expect(b1.weeks.find((w) => w.week === 2)!.canonicalWeight).toBe(0);
    expect(b1.weeks.find((w) => w.week === 3)!.canonicalWeight).toBe(0.25);
    expect(b1.weeks.find((w) => w.week === 6)!.canonicalWeight).toBe(1);
    // Endpoint converges to canonical once weight=1
    expect(b1.path.week8EndpointMaeVsCanonicalW8).toBeCloseTo(0, 10);
    expect(b1.path.week8EndpointMaxAbsVsCanonicalW8).toBeCloseTo(0, 10);
  });

  it('all 136 finite unique persisted targets -> pass with exact coverage counts', () => {
    const result = buildBalancedV1TransitionBlendEvaluation(healthyInput());
    expect(result.ok).toBe(true);
    expect(result.persistedTargetRows2025Fbs).toBe(136);
    expect(result.persistedTargetDistinctFbs2025).toBe(136);
    expect(result.persistedTargetFinite2025).toBe(136);
    expect(result.duplicatePersistedTargetTeamIds2025).toBe(0);
    expect(result.persistedTargetSetExact2025).toBe(true);
  });

  it('one persisted target NaN -> fail closed', () => {
    const ids = fbs2025();
    const targets = targetsFromCandidateA(ids);
    targets[0] = { ...targets[0], powerRating: Number.NaN };
    const result = buildBalancedV1TransitionBlendEvaluation(
      healthyInput({ persistedV1Targets2025: targets })
    );
    expect(result.ok).toBe(false);
    expect(result.persistedTargetFinite2025).toBe(135);
    expect(result.persistedTargetSetExact2025).toBe(false);
  });

  it('one persisted target Infinity -> fail closed', () => {
    const ids = fbs2025();
    const targets = targetsFromCandidateA(ids);
    targets[0] = { ...targets[0], powerRating: Number.POSITIVE_INFINITY };
    const result = buildBalancedV1TransitionBlendEvaluation(
      healthyInput({ persistedV1Targets2025: targets })
    );
    expect(result.ok).toBe(false);
    expect(result.persistedTargetFinite2025).toBe(135);
  });

  it('one persisted FBS target missing -> fail closed', () => {
    const ids = fbs2025();
    const targets = targetsFromCandidateA(ids).slice(1);
    const result = buildBalancedV1TransitionBlendEvaluation(
      healthyInput({ persistedV1Targets2025: targets })
    );
    expect(result.ok).toBe(false);
    expect(result.persistedTargetRows2025Fbs).toBe(135);
    expect(result.persistedTargetSetExact2025).toBe(false);
  });

  it('duplicate persisted target team ID -> fail closed', () => {
    const ids = fbs2025();
    const targets = targetsFromCandidateA(ids);
    targets.push({ ...targets[0], powerRating: targets[0].powerRating + 1 });
    const result = buildBalancedV1TransitionBlendEvaluation(
      healthyInput({ persistedV1Targets2025: targets })
    );
    expect(result.ok).toBe(false);
    expect(result.persistedTargetRows2025Fbs).toBe(137);
    expect(result.persistedTargetDistinctFbs2025).toBe(136);
    expect(result.duplicatePersistedTargetTeamIds2025).toBe(1);
    expect(result.persistedTargetSetExact2025).toBe(false);
  });

  it('136 unique targets plus extra duplicate fails even though Map would hold 136 keys', () => {
    const ids = fbs2025();
    const targets = targetsFromCandidateA(ids);
    expect(targets.length).toBe(136);
    targets.push({ teamId: targets[5].teamId, powerRating: 99.9 });
    const result = buildBalancedV1TransitionBlendEvaluation(
      healthyInput({ persistedV1Targets2025: targets })
    );
    expect(result.ok).toBe(false);
    expect(result.persistedTargetDistinctFbs2025).toBe(136);
    expect(result.duplicatePersistedTargetTeamIds2025).toBe(1);
    expect(result.persistedTargetRows2025Fbs).toBe(137);
  });

  it('formatter emits top weekly movers descending absDelta and Week8 endpoints', () => {
    const result = buildBalancedV1TransitionBlendEvaluation(healthyInput());
    const report = formatBalancedV1TransitionBlendReport(result);
    expect(report).toContain('mover team=');
    expect(report).toContain('week8EndpointMaeVsCanonicalW8=');
    expect(report).toContain('week8EndpointMaxAbsVsCanonicalW8=');

    const absValues: number[] = [];
    let collecting = false;
    for (const line of report.split('\n')) {
      if (line.includes('weeklyMove meanAbs=')) {
        collecting = true;
        absValues.length = 0;
        continue;
      }
      if (collecting && line.includes('mover team=')) {
        const m = line.match(/abs=([-\d.eE+]+|n\/a)/);
        if (m && m[1] !== 'n/a') absValues.push(Number(m[1]));
        continue;
      }
      if (collecting && absValues.length > 0) {
        for (let i = 1; i < absValues.length; i++) {
          expect(absValues[i]).toBeLessThanOrEqual(absValues[i - 1] + 1e-12);
        }
        break;
      }
    }
    expect(absValues.length).toBeGreaterThan(0);

    // Also verify in-memory top20Movers order (source of formatter rows)
    const b1 = result.policies.find((p) => p.policy.id === 'B1')!;
    const withMovers = b1.weeks.find(
      (w) => w.weeklyStability && w.weeklyStability.top20Movers.length > 0
    )!;
    const movers = withMovers.weeklyStability!.top20Movers;
    for (let i = 1; i < movers.length; i++) {
      expect(movers[i].absDelta).toBeLessThanOrEqual(movers[i - 1].absDelta);
    }
  });
});
