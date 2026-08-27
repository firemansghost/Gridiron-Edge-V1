/**
 * Phase 2C-2H-7 — Balanced V1 transition timing evaluation tests.
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
  HIGHLIGHT_TEAM_IDS,
  computeTalentOnlyBridgeRatings,
} from '../src/preseason/balanced-v1-preseason-bridge-eval';
import {
  EXPECTED_2025_FBS_COUNT,
  EXPECTED_2026_FBS_COUNT,
  HISTORICAL_BALANCED_SNAPSHOT_CUTOFF_ISO,
  assessWeekDateChronology,
  buildBalancedV1TransitionTimingEvaluation,
  filterEpaThroughCutoff,
  filterGamesThroughCutoff,
  parseBalancedV1TransitionTimingArgs,
  recommendHardSwitchWeek,
  sanitizeBalancedV1TransitionTimingError,
  type BalancedV1TransitionTimingInput,
  type TransitionEpaRow,
  type TransitionGameRow,
} from '../src/preseason/balanced-v1-transition-timing-eval';
import type { BalancedV1TransitionTimingReadStore } from '../evaluate-balanced-v1-transition-timing';

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

/** Chronologically safe weekly finals: week N dates strictly before week N+1. */
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
  games.push({
    gameId: 'future-scheduled',
    week: 12,
    date: '2025-11-20T19:00:00.000Z',
    status: 'scheduled',
    homeTeamId: fbs[0],
    awayTeamId: fbs[1],
    homeScore: null,
    awayScore: null,
  });
  return games;
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
  rows.push({
    gameId: 'epa-future-only',
    week: 12,
    teamId: games[0]?.homeTeamId ?? 'x',
    epaOff: 9.9,
    epaDef: 9.9,
  });
  return rows;
}

function targetsFromCandidateA(fbs: string[]) {
  const talent = talentFor(fbs);
  return computeTalentOnlyBridgeRatings(
    talent.map((t) => ({
      teamId: t.teamId,
      talentComposite: t.talentComposite as number,
    }))
  ).map((r) => ({ teamId: r.teamId, powerRating: r.candidateA + 1 }));
}

function healthyInput(
  overrides: Partial<BalancedV1TransitionTimingInput> = {}
): BalancedV1TransitionTimingInput {
  const ids25 = fbs2025();
  const ids26 = fbs2026();
  const games = buildWeeklyGames(ids25, 5);
  return {
    fbsIds2025: ids25,
    talent2025: talentFor(ids25),
    games2025: games,
    epa2025: epaForGames(games),
    persistedV1Targets2025: targetsFromCandidateA(ids25),
    historicalCutoffIso: HISTORICAL_BALANCED_SNAPSHOT_CUTOFF_ISO,
    cutoffWeeks: [0, 1, 2, 3, 4, 5],
    fbsIds2026: ids26,
    talent2026: talentFor(ids26),
    finalFbsVsFbsGames2026: 0,
    existingV1FbsRows2026: 0,
    ...overrides,
  };
}

describe('Balanced V1 transition timing evaluation', () => {
  it('requires exact 2025 FBS=136', () => {
    const result = buildBalancedV1TransitionTimingEvaluation(
      healthyInput({ fbsIds2025: buildBaseFbsFixture(135) })
    );
    expect(result.ok).toBe(false);
  });

  it('filters historical cutoffs and excludes future games', () => {
    const games = buildWeeklyGames(fbs2025(), 4);
    const through2 = filterGamesThroughCutoff(games, 2);
    expect(through2.every((g) => g.week <= 2 && g.status === 'final')).toBe(
      true
    );
    expect(through2.some((g) => g.week > 2)).toBe(false);
    expect(through2.some((g) => g.status === 'scheduled')).toBe(false);
    expect(filterGamesThroughCutoff(games, 0)).toEqual([]);
  });

  it('excludes future EPA not tied to cutoff games', () => {
    const games = buildWeeklyGames(fbs2025(), 3);
    const through1 = filterGamesThroughCutoff(games, 1);
    const epa = epaForGames(games);
    const filtered = filterEpaThroughCutoff(epa, through1, 1);
    expect(
      filtered.every((e) => through1.some((g) => g.gameId === e.gameId))
    ).toBe(true);
    expect(filtered.some((e) => e.gameId === 'epa-future-only')).toBe(false);
  });

  it('preserves FBS-vs-FBS and zero-game exclusion from canonical Balanced', () => {
    const result = buildBalancedV1TransitionTimingEvaluation(healthyInput());
    const pre = result.snapshots.find((s) => s.coverage.cutoffWeek === 0)!;
    expect(pre.ratingCount).toBe(0);
    expect(pre.coverage.zeroGameTeams).toBe(136);
    const w1 = result.snapshots.find((s) => s.coverage.cutoffWeek === 1)!;
    expect(w1.ratingCount).toBe(w1.coverage.teamsWithAtLeast1FbsGame);
    expect(w1.coverage.zeroGameTeams).toBe(
      136 - w1.coverage.teamsWithAtLeast1FbsGame
    );
  });

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

  it('weekly coverage and transition metrics are coherent', () => {
    const result = buildBalancedV1TransitionTimingEvaluation(healthyInput());
    expect(result.ok).toBe(true);
    expect(result.week1CanonicalCoveragePct).not.toBeNull();
    expect(result.week2CanonicalCoveragePct!).toBeGreaterThanOrEqual(
      result.week1CanonicalCoveragePct!
    );
    const w2 = result.snapshots.find((s) => s.coverage.cutoffWeek === 2)!;
    expect(w2.transitionFromCandidateA.count).toBe(w2.ratingCount);
    expect(w2.transitionFromCandidateA.top20Jumps.length).toBeLessThanOrEqual(
      20
    );
    expect(result.mixedPolicyAuthorized).toBe(false);
    expect(result.transitionPolicyAuthorized).toBe(false);
    expect(result.hardSwitchWeekCandidate).toBe('INCONCLUSIVE');
    expect(result.switchThresholdDefined).toBe(false);
  });

  it('2026 finalFbsVsFbsGames=1 fails closed', () => {
    const result = buildBalancedV1TransitionTimingEvaluation(
      healthyInput({ finalFbsVsFbsGames2026: 1 })
    );
    expect(result.ok).toBe(false);
    expect(result.confirm2026.purePreseason2026).toBe(false);
    expect(result.transitionPolicyAuthorized).toBe(false);
    expect(result.preseasonBridgeAuthorized).toBe(false);
    expect(result.ratingsWriteAuthorized).toBe(false);
    expect(result.modelChangeAuthorized).toBe(false);
  });

  it('2026 existingV1FbsRows=1 fails closed', () => {
    const result = buildBalancedV1TransitionTimingEvaluation(
      healthyInput({ existingV1FbsRows2026: 1 })
    );
    expect(result.ok).toBe(false);
    expect(result.confirm2026.purePreseason2026).toBe(false);
  });

  it('healthy 2026 zero/zero state -> purePreseason2026=true with exact 138 identity', () => {
    const result = buildBalancedV1TransitionTimingEvaluation(healthyInput());
    expect(result.ok).toBe(true);
    expect(result.confirm2026.purePreseason2026).toBe(true);
    expect(result.confirm2026.fbsCount).toBe(138);
    expect(result.confirm2026.distinctFbs).toBe(138);
    expect(result.confirm2026.talentRows2026Fbs).toBe(138);
    expect(result.confirm2026.talentDistinctFbs2026).toBe(138);
    expect(result.confirm2026.finiteTalent2026).toBe(138);
    expect(result.confirm2026.talentSetExact2026).toBe(true);
    expect(result.confirm2026.duplicateTalentTeamIds2026).toBe(0);
    expect(result.confirm2026.finalFbsVsFbsGames).toBe(0);
    expect(result.confirm2026.existingV1FbsRows).toBe(0);
    expect(result.confirm2026.highlightTeamsPresent).toBe(true);
  });

  it('wrong 2026 FBS count fails', () => {
    const ids = fbs2026().slice(0, 137);
    const result = buildBalancedV1TransitionTimingEvaluation(
      healthyInput({ fbsIds2026: ids, talent2026: talentFor(ids) })
    );
    expect(result.ok).toBe(false);
  });

  it('duplicate 2026 talent fails', () => {
    const ids = fbs2026();
    const talent = talentFor(ids);
    talent.push({ ...talent[0] });
    const result = buildBalancedV1TransitionTimingEvaluation(
      healthyInput({ talent2026: talent })
    );
    expect(result.ok).toBe(false);
    expect(result.confirm2026.duplicateTalentTeamIds2026).toBeGreaterThan(0);
  });

  it('missing 2026 talent team fails', () => {
    const ids = fbs2026();
    const talent = talentFor(ids).slice(0, 137);
    const result = buildBalancedV1TransitionTimingEvaluation(
      healthyInput({ talent2026: talent })
    );
    expect(result.ok).toBe(false);
    expect(result.confirm2026.talentSetExact2026).toBe(false);
  });

  it('NDSU missing from 2026 FBS fails', () => {
    const ids = fbs2026().filter((id) => id !== 'north-dakota-state');
    ids.push('extra-team-for-count');
    const result = buildBalancedV1TransitionTimingEvaluation(
      healthyInput({ fbsIds2026: ids, talent2026: talentFor(ids) })
    );
    expect(result.ok).toBe(false);
    expect(result.confirm2026.highlightTeamsPresent).toBe(false);
    expect(result.findings.some((f) => f.includes(HIGHLIGHT_TEAM_IDS[0]))).toBe(
      true
    );
  });

  it('Sacramento State missing from 2026 FBS fails', () => {
    const ids = fbs2026().filter((id) => id !== 'sacramento-state');
    ids.push('extra-team-for-count');
    const result = buildBalancedV1TransitionTimingEvaluation(
      healthyInput({ fbsIds2026: ids, talent2026: talentFor(ids) })
    );
    expect(result.ok).toBe(false);
    expect(result.confirm2026.highlightTeamsPresent).toBe(false);
  });

  it('hardSwitchWeekCandidate remains INCONCLUSIVE when 95% have one game in Week 1', () => {
    const result = buildBalancedV1TransitionTimingEvaluation(healthyInput());
    expect(result.firstWeek95PctHaveOneGame).toBe(1);
    expect(result.hardSwitchWeekCandidate).toBe('INCONCLUSIVE');
    expect(recommendHardSwitchWeek({ firstWeek95PctHaveOneGame: 1 })).toBe(
      'INCONCLUSIVE'
    );
  });

  it('hardSwitchWeekCandidate remains INCONCLUSIVE even with excellent coverage evidence', () => {
    const result = buildBalancedV1TransitionTimingEvaluation(healthyInput());
    expect(result.week1CanonicalCoveragePct).toBeGreaterThan(90);
    expect(result.hardSwitchWeekCandidate).toBe('INCONCLUSIVE');
    expect(result.switchThresholdDefined).toBe(false);
    expect(result.transitionPolicyAuthorized).toBe(false);
    expect(result.mixedPolicyAuthorized).toBe(false);
  });

  it('switchThresholdDefined=false', () => {
    const result = buildBalancedV1TransitionTimingEvaluation(healthyInput());
    expect(result.switchThresholdDefined).toBe(false);
  });

  it('normal Week 1–8 chronological fixture -> weekDateChronologySafe=true', () => {
    const ids = fbs2025();
    const games = buildWeeklyGames(ids, 8);
    const assessment = assessWeekDateChronology(games, [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(assessment.weekDateChronologySafe).toBe(true);
    expect(assessment.chronologyViolationCount).toBe(0);
    const result = buildBalancedV1TransitionTimingEvaluation(
      healthyInput({
        games2025: games,
        epa2025: epaForGames(games),
        cutoffWeeks: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      })
    );
    expect(result.weekDateChronologySafe).toBe(true);
    expect(result.ok).toBe(true);
  });

  it('postponed week-2 game after earliest week-3 date fails chronology', () => {
    const ids = fbs2025();
    const games = buildWeeklyGames(ids, 4);
    const week3Min = games
      .filter((g) => g.week === 3 && g.status === 'final')
      .map((g) => g.date)
      .sort()[0];
    // Move one week-2 final after earliest week-3 date (synthetic postpone)
    const week2 = games.find((g) => g.week === 2 && g.status === 'final')!;
    week2.date = '2025-09-15T19:00:00.000Z';
    expect(week2.date >= week3Min).toBe(true);

    const assessment = assessWeekDateChronology(games, [1, 2, 3, 4]);
    expect(assessment.weekDateChronologySafe).toBe(false);
    expect(assessment.chronologyViolationCount).toBeGreaterThan(0);

    const result = buildBalancedV1TransitionTimingEvaluation(
      healthyInput({
        games2025: games,
        epa2025: epaForGames(games),
        cutoffWeeks: [0, 1, 2, 3, 4],
      })
    );
    expect(result.weekDateChronologySafe).toBe(false);
    expect(result.ok).toBe(false);
    // EPA for that postponed game still only included when week<=cutoff includes it by week number
    const through1 = filterGamesThroughCutoff(games, 1);
    expect(through1.some((g) => g.gameId === week2.gameId)).toBe(false);
    const epaFiltered = filterEpaThroughCutoff(
      epaForGames(games),
      through1,
      1
    );
    expect(epaFiltered.some((e) => e.gameId === week2.gameId)).toBe(false);
  });

  it('no writes/providers/Odds; read-only store has no mutation methods', () => {
    const store: BalancedV1TransitionTimingReadStore = {
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
    expect(Object.keys(store).every((k) => /^(load|count)/.test(k))).toBe(
      true
    );
    const result = buildBalancedV1TransitionTimingEvaluation(healthyInput());
    expect(result.providersInvoked).toBe(false);
    expect(result.mutationsInvoked).toBe(false);
    expect(result.Odds).toBe(false);
    expect(result.ratingsWriteAuthorized).toBe(false);
  });

  it('safe error handling; legacy compute_ratings_v1 untouched', () => {
    const safe = sanitizeBalancedV1TransitionTimingError(
      new Error('postgres://user:s3cret@host/db')
    );
    expect(safe).toContain('connection and secret details suppressed');
    expect(safe).not.toMatch(/postgres|s3cret/i);
    expect(
      parseBalancedV1TransitionTimingArgs(['--study-season', '2026']).ok
    ).toBe(false);
    expect(
      parseBalancedV1TransitionTimingArgs(['--study-season', '2025'])
    ).toEqual({ ok: true, studySeason: 2025 });
    const v1 = fs.readFileSync(
      path.join(__dirname, '../src/ratings/compute_ratings_v1.ts'),
      'utf8'
    );
    expect(v1).toContain('LEGACY');
    const wf = fs.readFileSync(
      path.join(
        __dirname,
        '../../../.github/workflows/evaluate-balanced-v1-transition-timing.yml'
      ),
      'utf8'
    );
    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).toContain('CFBD_API_KEY: not provided');
    const evalSrc = fs.readFileSync(
      path.join(
        __dirname,
        '../src/preseason/balanced-v1-transition-timing-eval.ts'
      ),
      'utf8'
    );
    expect(evalSrc).not.toMatch(/if \(w === 1\) return 'WEEK_1'/);
    expect(evalSrc).toContain("return 'INCONCLUSIVE'");
  });

  it('milestones report first weeks for coverage thresholds as facts only', () => {
    const result = buildBalancedV1TransitionTimingEvaluation(healthyInput());
    expect(result.milestones.length).toBeGreaterThanOrEqual(5);
    expect(
      result.milestones.every((m) => typeof m.label === 'string')
    ).toBe(true);
    expect(result.hardSwitchWeekCandidate).toBe('INCONCLUSIVE');
  });
});
