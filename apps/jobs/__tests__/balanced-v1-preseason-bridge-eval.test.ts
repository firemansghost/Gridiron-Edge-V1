/**
 * Phase 2C-2H-6 — Balanced V1 preseason bridge evaluation tests.
 * No network. No production DB. No providers. No Odds. No ratings persistence.
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildBaseFbsFixture } from '../src/preseason/fbs-membership-init';
import {
  BALANCED_V1_CALIBRATION_FACTOR,
  BALANCED_WEIGHT_EPA,
  BALANCED_WEIGHT_NET_POINTS,
  BALANCED_WEIGHT_TALENT,
  BALANCED_WEIGHT_WIN_PCT,
  calculateBalancedZScores,
  computeBalancedV1Ratings,
  getBalancedZScore,
} from '../src/ratings/compute_balanced_v1';
import {
  BENCHMARK_SEASON,
  CANDIDATE_A_TALENT_SCALE,
  CANDIDATE_B_TALENT_SCALE,
  EXPECTED_2025_FBS_COUNT,
  EXPECTED_2026_FBS_COUNT,
  HIGHLIGHT_TEAM_IDS,
  HISTORICAL_BALANCED_SNAPSHOT_CUTOFF_ISO,
  TARGET_SEASON,
  buildBalancedV1PreseasonBridgeEvaluation,
  computeParityMetrics,
  computeTalentOnlyBridgeRatings,
  parseBalancedV1PreseasonBridgeArgs,
  sanitizeBalancedV1PreseasonBridgeError,
  type BalancedV1PreseasonBridgeInput,
} from '../src/preseason/balanced-v1-preseason-bridge-eval';
import type { BalancedV1PreseasonBridgeReadStore } from '../evaluate-balanced-v1-preseason-bridge';

function fbs2026(): string[] {
  const base = buildBaseFbsFixture(136);
  return ['north-dakota-state', 'sacramento-state', ...base].slice(0, 138);
}

function fbs2025(): string[] {
  return buildBaseFbsFixture(EXPECTED_2025_FBS_COUNT);
}

function talentFor(fbs: string[], scale = 400): Array<{
  teamId: string;
  talentComposite: number | null;
}> {
  return fbs.map((teamId, i) => ({
    teamId,
    talentComposite: scale + i * 2,
  }));
}

/** Synthetic "canonical" target = Candidate A so A has exact parity in fixture. */
function targetsFromTalentA(fbs: string[]): Array<{
  teamId: string;
  powerRating: number;
}> {
  const talent = talentFor(fbs);
  return computeTalentOnlyBridgeRatings(
    talent.map((t) => ({
      teamId: t.teamId,
      talentComposite: t.talentComposite as number,
    }))
  ).map((r) => ({
    teamId: r.teamId,
    powerRating: r.candidateA,
  }));
}

function healthyInput(
  overrides: Partial<BalancedV1PreseasonBridgeInput> = {}
): BalancedV1PreseasonBridgeInput {
  const ids26 = fbs2026();
  const ids25 = fbs2025();
  return {
    season: TARGET_SEASON,
    fbsIds2026: ids26,
    talent2026: talentFor(ids26, 500),
    finalFbsVsFbsGames2026: 0,
    usableEpaTeams2026: 0,
    netPointsTeams2026: 0,
    winPctTeams2026: 0,
    existingV1FbsRows2026: 0,
    fbsIds2025: ids25,
    talent2025: talentFor(ids25, 400),
    persistedV1Targets2025: targetsFromTalentA(ids25),
    historicalCutoffIso: HISTORICAL_BALANCED_SNAPSHOT_CUTOFF_ISO,
    ...overrides,
  };
}

describe('Balanced V1 preseason bridge evaluation', () => {
  it('requires exactly 138 FBS for 2026', () => {
    const input = healthyInput({
      fbsIds2026: buildBaseFbsFixture(137),
      talent2026: talentFor(buildBaseFbsFixture(137), 500),
    });
    const result = buildBalancedV1PreseasonBridgeEvaluation(input);
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.includes('138'))).toBe(true);
  });

  it('requires exactly 138 finite 2026 talent composites', () => {
    const ids = fbs2026();
    const talent = talentFor(ids, 500);
    talent.pop();
    const result = buildBalancedV1PreseasonBridgeEvaluation(
      healthyInput({ talent2026: talent })
    );
    expect(result.ok).toBe(false);
    expect(result.finiteTalent2026).toBe(137);
  });

  it('formulas do not consume game/EPA, but valid pure-preseason requires coverage counts = 0', () => {
    const healthy = buildBalancedV1PreseasonBridgeEvaluation(healthyInput());
    expect(healthy.ok).toBe(true);
    expect(healthy.purePreseasonState).toBe(true);
    expect(healthy.finalFbsVsFbsGames2026).toBe(0);
    expect(healthy.usableEpaTeams2026).toBe(0);
    expect(healthy.netPointsTeams2026).toBe(0);
    expect(healthy.winPctTeams2026).toBe(0);
    expect(healthy.existingV1FbsRows2026).toBe(0);
    expect(healthy.preview2026.finite).toBe(138);

    const evalSrc = fs.readFileSync(
      path.join(
        __dirname,
        '../src/preseason/balanced-v1-preseason-bridge-eval.ts'
      ),
      'utf8'
    );
    expect(evalSrc).not.toMatch(/computeBalancedV1Ratings\(/);
  });

  it.each([
    ['finalFbsVsFbsGames2026', { finalFbsVsFbsGames2026: 1 }],
    ['usableEpaTeams2026', { usableEpaTeams2026: 1 }],
    ['netPointsTeams2026', { netPointsTeams2026: 1 }],
    ['winPctTeams2026', { winPctTeams2026: 1 }],
    ['existingV1FbsRows2026', { existingV1FbsRows2026: 1 }],
  ] as const)('%s=1 fails closed', (_label, override) => {
    const result = buildBalancedV1PreseasonBridgeEvaluation(
      healthyInput(override)
    );
    expect(result.ok).toBe(false);
    expect(result.purePreseasonState).toBe(false);
    expect(result.preseasonBridgeAuthorized).toBe(false);
    expect(result.ratingsWriteAuthorized).toBe(false);
    expect(result.modelChangeAuthorized).toBe(false);
  });

  it('healthy zero/zero/zero/zero/zero state passes', () => {
    const result = buildBalancedV1PreseasonBridgeEvaluation(healthyInput());
    expect(result.ok).toBe(true);
    expect(result.purePreseasonState).toBe(true);
    expect(result.benchmarkValid).toBe(true);
    expect(result.benchmarkComparedCount).toBe(136);
    expect(result.benchmarkComparedSetExact).toBe(true);
  });

  it('2025 talent missing one FBS team fails closed', () => {
    const ids = fbs2025();
    const talent = talentFor(ids, 400);
    talent.pop();
    const result = buildBalancedV1PreseasonBridgeEvaluation(
      healthyInput({ talent2025: talent })
    );
    expect(result.ok).toBe(false);
    expect(result.finiteTalent2025).toBe(135);
    expect(result.benchmarkValid).toBe(false);
    expect(result.candidateA.vsCanonical.mae).toBeNull();
    expect(result.candidateB.vsCanonical.mae).toBeNull();
  });

  it('2025 talent non-finite for one FBS team fails closed', () => {
    const ids = fbs2025();
    const talent = talentFor(ids, 400);
    talent[0] = { teamId: talent[0].teamId, talentComposite: null };
    const result = buildBalancedV1PreseasonBridgeEvaluation(
      healthyInput({ talent2025: talent })
    );
    expect(result.ok).toBe(false);
    expect(result.finiteTalent2025).toBe(135);
    expect(result.benchmarkValid).toBe(false);
  });

  it('2025 benchmarkComparedCount=135 cannot produce a valid benchmark', () => {
    const ids = fbs2025();
    const targets = targetsFromTalentA(ids);
    targets.pop();
    const result = buildBalancedV1PreseasonBridgeEvaluation(
      healthyInput({ persistedV1Targets2025: targets })
    );
    expect(result.ok).toBe(false);
    expect(result.benchmarkComparedCount).toBe(135);
    expect(result.benchmarkComparedSetExact).toBe(false);
    expect(result.benchmarkValid).toBe(false);
    expect(result.candidateA.vsCanonical.mae).toBeNull();
  });

  it('2025 benchmark compared set must equal all 136 FBS IDs', () => {
    const result = buildBalancedV1PreseasonBridgeEvaluation(healthyInput());
    expect(result.benchmarkComparedSetExact).toBe(true);
    expect(result.benchmarkComparedCount).toBe(136);
  });

  it('duplicate 2026 talent team ID fails closed even if Map would hold 138', () => {
    const ids = fbs2026();
    const talent = talentFor(ids, 500);
    // Extra row for same team — raw count 139, distinct still 138 if we collapse
    talent.push({
      teamId: ids[0],
      talentComposite: 9999,
    });
    const result = buildBalancedV1PreseasonBridgeEvaluation(
      healthyInput({ talent2026: talent })
    );
    expect(result.ok).toBe(false);
    expect(result.talentRows2026Fbs).toBe(139);
    expect(result.talentDistinctFbs2026).toBe(138);
    expect(result.duplicateTalentTeamIds2026).toBe(1);
    expect(result.finiteTalent2026).toBe(138);
  });

  it('duplicate 2025 talent team ID fails closed', () => {
    const ids = fbs2025();
    const talent = talentFor(ids, 400);
    talent.push({ teamId: ids[0], talentComposite: 1 });
    const result = buildBalancedV1PreseasonBridgeEvaluation(
      healthyInput({ talent2025: talent })
    );
    expect(result.ok).toBe(false);
    expect(result.duplicateTalentTeamIds2025).toBe(1);
    expect(result.benchmarkValid).toBe(false);
  });

  it('2026 talent raw/distinct/finite counts all equal 138 on healthy fixture', () => {
    const result = buildBalancedV1PreseasonBridgeEvaluation(healthyInput());
    expect(result.talentRows2026Fbs).toBe(138);
    expect(result.talentDistinctFbs2026).toBe(138);
    expect(result.finiteTalent2026).toBe(138);
    expect(result.talentSetExact2026).toBe(true);
    expect(result.duplicateTalentTeamIds2026).toBe(0);
  });

  it('NDSU missing from 138-team FBS fixture fails closed', () => {
    const ids = fbs2026().filter((id) => id !== 'north-dakota-state');
    ids.push('team-extra-001');
    const result = buildBalancedV1PreseasonBridgeEvaluation(
      healthyInput({
        fbsIds2026: ids,
        talent2026: talentFor(ids, 500),
      })
    );
    expect(result.ok).toBe(false);
    expect(result.highlightTeamsPresent).toBe(false);
  });

  it('Sacramento State missing fails closed', () => {
    const ids = fbs2026().filter((id) => id !== 'sacramento-state');
    ids.push('team-extra-002');
    const result = buildBalancedV1PreseasonBridgeEvaluation(
      healthyInput({
        fbsIds2026: ids,
        talent2026: talentFor(ids, 500),
      })
    );
    expect(result.ok).toBe(false);
    expect(result.highlightTeamsPresent).toBe(false);
  });

  it('historical cutoff mismatch fails closed', () => {
    const result = buildBalancedV1PreseasonBridgeEvaluation(
      healthyInput({ historicalCutoffIso: '2025-11-24T00:00:00.000Z' })
    );
    expect(result.ok).toBe(false);
    expect(result.historicalCutoffExact).toBe(false);
  });

  it('Candidate A = talentZ * 3.5 exactly; Candidate B = talentZ * 14 exactly', () => {
    expect(CANDIDATE_A_TALENT_SCALE).toBe(3.5);
    expect(CANDIDATE_B_TALENT_SCALE).toBe(14.0);
    expect(CANDIDATE_A_TALENT_SCALE).toBe(
      BALANCED_WEIGHT_TALENT * BALANCED_V1_CALIBRATION_FACTOR
    );

    const rows = [
      { teamId: 'a', talentComposite: 100 },
      { teamId: 'b', talentComposite: 200 },
      { teamId: 'c', talentComposite: 300 },
    ];
    const out = computeTalentOnlyBridgeRatings(rows);
    const zStats = calculateBalancedZScores(rows.map((r) => r.talentComposite));
    for (const r of out) {
      const talentZ = getBalancedZScore(
        r.talentComposite,
        zStats.mean,
        zStats.stdDev
      );
      expect(r.talentZ).toBeCloseTo(talentZ, 12);
      expect(r.candidateA).toBeCloseTo(talentZ * 3.5, 12);
      expect(r.candidateB).toBeCloseTo(talentZ * 14.0, 12);
    }
  });

  it('canonical Balanced weights remain 0.25 each and calibration 14.0', () => {
    expect(BALANCED_WEIGHT_TALENT).toBe(0.25);
    expect(BALANCED_WEIGHT_EPA).toBe(0.25);
    expect(BALANCED_WEIGHT_NET_POINTS).toBe(0.25);
    expect(BALANCED_WEIGHT_WIN_PCT).toBe(0.25);
    expect(BALANCED_V1_CALIBRATION_FACTOR).toBe(14.0);
    const result = buildBalancedV1PreseasonBridgeEvaluation(healthyInput());
    expect(result.canonicalWeights).toEqual({
      talent: 0.25,
      epa: 0.25,
      netPoints: 0.25,
      winPct: 0.25,
    });
    expect(result.canonicalCalibrationFactor).toBe(14.0);
  });

  it('canonical computeBalancedV1Ratings unchanged by this diagnostic', () => {
    const metrics = [
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
    ];
    const ratings = computeBalancedV1Ratings(metrics);
    for (const r of ratings) {
      expect(r.zComposite).toBeCloseTo(
        r.talentZ * 0.25 +
          r.epaZ * 0.25 +
          r.netPointsZ * 0.25 +
          r.winPctZ * 0.25,
        12
      );
      expect(r.powerRating).toBeCloseTo(r.zComposite * 14.0, 12);
    }
    const evalSrc = fs.readFileSync(
      path.join(
        __dirname,
        '../src/preseason/balanced-v1-preseason-bridge-eval.ts'
      ),
      'utf8'
    );
    expect(evalSrc).not.toMatch(/computeBalancedV1Ratings\(/);
    expect(evalSrc).toContain('WEIGHT_PRESERVED_NEUTRAL');
    expect(evalSrc).toContain('TALENT_RENORMALIZED');
  });

  it('no conference adjustment / carry-forward / synthesized components', () => {
    const result = buildBalancedV1PreseasonBridgeEvaluation(healthyInput());
    expect(result.noConferenceAdjustment).toBe(true);
    expect(result.noPreviousSeasonCarryForward).toBe(true);
    expect(result.noSynthesizedMissingComponents).toBe(true);
    expect(result.preseasonBridgeAuthorized).toBe(false);
    expect(result.transitionPolicyDefined).toBe(false);
  });

  it('2025 benchmark uses exact 136 FBS and persisted canonical V1 targets', () => {
    const result = buildBalancedV1PreseasonBridgeEvaluation(healthyInput());
    expect(result.fbsCount2025).toBe(136);
    expect(result.expected2025FbsCount).toBe(136);
    expect(result.talentRows2025Fbs).toBe(136);
    expect(result.talentDistinctFbs2025).toBe(136);
    expect(result.finiteTalent2025).toBe(136);
    expect(result.talentSetExact2025).toBe(true);
    expect(result.persistedTargetCount2025).toBe(136);
    expect(result.persistedTargetSetExact2025).toBe(true);
    expect(result.benchmarkSeason).toBe(BENCHMARK_SEASON);
    expect(result.historicalCutoffIso).toBe(
      HISTORICAL_BALANCED_SNAPSHOT_CUTOFF_ISO
    );
  });

  it('candidate comparison metrics correct (A exact vs synthetic targets)', () => {
    const result = buildBalancedV1PreseasonBridgeEvaluation(healthyInput());
    expect(result.candidateA.vsCanonical.comparedCount).toBe(136);
    expect(result.candidateA.vsCanonical.mae).toBeCloseTo(0, 9);
    expect(result.candidateA.orderingOverlap.top15).toBe(15);
    expect(result.candidateB.vsCanonical.mae!).toBeGreaterThan(0);

    const metrics = computeParityMetrics([1, 2, 3], [1, 2, 4]);
    expect(metrics.mae).toBeCloseTo(1 / 3, 12);
    expect(metrics.comparedCount).toBe(3);
  });

  it('all 138 2026 outputs finite; NDSU and Sacramento State included', () => {
    const result = buildBalancedV1PreseasonBridgeEvaluation(healthyInput());
    expect(result.preview2026.ratingCount).toBe(138);
    expect(result.preview2026.finite).toBe(138);
    expect(result.highlightTeamsPresent).toBe(true);
    const ids = new Set(result.preview2026.teams.map((t) => t.teamId));
    for (const h of HIGHLIGHT_TEAM_IDS) {
      expect(ids.has(h)).toBe(true);
    }
    expect(result.preview2026.highlights.map((h) => h.teamId).sort()).toEqual(
      [...HIGHLIGHT_TEAM_IDS].sort()
    );
  });

  it('read-only store has no mutation methods; no providers/Odds', () => {
    const store: BalancedV1PreseasonBridgeReadStore = {
      async loadFbsTeamIds() {
        return [];
      },
      async loadTalentRows() {
        return [];
      },
      async loadPersistedV1Targets() {
        return [];
      },
      async countFinalFbsVsFbsGames() {
        return 0;
      },
      async countUsableEpaTeams() {
        return 0;
      },
      async countTeamsWithNetPointsOrWins() {
        return { netPointsTeams: 0, winPctTeams: 0 };
      },
      async countExistingV1FbsRows() {
        return 0;
      },
    };
    expect(Object.keys(store).every((k) => /^(load|count)/.test(k))).toBe(
      true
    );
    const result = buildBalancedV1PreseasonBridgeEvaluation(healthyInput());
    expect(result.providersInvoked).toBe(false);
    expect(result.mutationsInvoked).toBe(false);
    expect(result.Odds).toBe(false);
    expect(result.ratingsWriteAuthorized).toBe(false);
    expect(result.modelChangeAuthorized).toBe(false);
  });

  it('safe error sanitizer does not expose secrets', () => {
    const safe = sanitizeBalancedV1PreseasonBridgeError(
      new Error('postgres://user:s3cret@host/db')
    );
    expect(safe).toBe(
      'Balanced V1 preseason bridge evaluation failed; connection and secret details suppressed'
    );
    expect(safe).not.toMatch(/postgres|s3cret|user@|host/i);
  });

  it('CLI requires season 2026 only', () => {
    expect(parseBalancedV1PreseasonBridgeArgs([]).ok).toBe(false);
    expect(parseBalancedV1PreseasonBridgeArgs(['--season', '2025']).ok).toBe(
      false
    );
    expect(parseBalancedV1PreseasonBridgeArgs(['--season', '2026'])).toEqual({
      ok: true,
      season: 2026,
    });
    expect(parseBalancedV1PreseasonBridgeArgs(['--season=2026'])).toEqual({
      ok: true,
      season: 2026,
    });
  });

  it('legacy compute_ratings_v1 untouched; workflow is manual read-only', () => {
    const v1 = fs.readFileSync(
      path.join(__dirname, '../src/ratings/compute_ratings_v1.ts'),
      'utf8'
    );
    expect(v1).toContain('LEGACY');
    const wf = fs.readFileSync(
      path.join(
        __dirname,
        '../../../.github/workflows/evaluate-balanced-v1-preseason-bridge.yml'
      ),
      'utf8'
    );
    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).toContain('CFBD_API_KEY: not provided');
    expect(wf).toContain('ODDS_API_KEY: not provided');
    expect(wf).toContain('preseasonBridgeAuthorized=false');
    expect(wf).not.toMatch(/npx tsx.*compute_ratings_balanced/);
    expect(wf).not.toMatch(/npx tsx.*compute_ratings_v1/);
  });

  it('matchup scale reports pair percentiles', () => {
    const result = buildBalancedV1PreseasonBridgeEvaluation(healthyInput());
    expect(result.matchupScaleA.pairCount).toBe((138 * 137) / 2);
    expect(result.matchupScaleA.p50).not.toBeNull();
    expect(result.matchupScaleA.max).not.toBeNull();
    expect(result.matchupScaleB.pairCount).toBe((138 * 137) / 2);
    expect(result.matchupScaleB.max!).toBeGreaterThan(
      result.matchupScaleA.max!
    );
  });
});
