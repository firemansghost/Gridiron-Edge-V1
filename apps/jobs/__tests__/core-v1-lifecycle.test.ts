/**
 * Phase 2C-2H-9 — Core V1 2026 lifecycle pure-module tests.
 * No network. No production DB. No providers. No Odds. No ratings persistence.
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildBaseFbsFixture } from '../src/preseason/fbs-membership-init';
import {
  BALANCED_V1_CALIBRATION_FACTOR,
  BALANCED_WEIGHT_TALENT,
  aggregateBalancedEpa,
  aggregateBalancedGameStats,
  buildBalancedTeamMetrics,
  computeBalancedV1Ratings,
} from '../src/ratings/compute_balanced_v1';
import {
  CANDIDATE_A_TALENT_SCALE,
  computeTalentOnlyBridgeRatings,
} from '../src/preseason/balanced-v1-preseason-bridge-eval';
import { blendRatings } from '../src/preseason/balanced-v1-transition-blend-eval';
import {
  filterEpaThroughCutoff,
  filterGamesThroughCutoff,
  type TransitionEpaRow,
  type TransitionGameRow,
} from '../src/preseason/balanced-v1-transition-timing-eval';
import {
  CORE_V1_2026_TRANSITION_POLICY,
  EXPECTED_FBS_COUNT,
  MODEL_VERSION_V1,
  PHASE,
  TARGET_SEASON,
  WRITE_CONFIRM_PHRASE,
  buildCoreV1LifecycleEvaluation,
  buildFailedCommitExecution,
  buildPreviewExecution,
  buildRolledBackExecution,
  buildSuccessfulCommitExecution,
  canonicalWeightForCompletedWeek,
  executeAtomicCoreV1LifecycleCommit,
  expectedCoreV1LifecycleConfirmation,
  finalizeCoreV1LifecycleReport,
  parseCoreV1LifecycleArgs,
  persistCoreV1LifecycleRatings,
  sanitizeCoreV1LifecycleError,
  toPersistRows,
  verifyCoreV1LifecyclePostWrite,
  type CoreV1LifecycleInput,
} from '../src/ratings/core-v1-lifecycle';
import {
  runCoreV1Lifecycle,
  type CoreV1LifecycleReadStore,
  type CoreV1LifecycleWriteDeps,
} from '../write-core-v1-lifecycle';
import * as os from 'os';

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

/** Chronologically safe weekly finals; all teams play each week. */
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
        date: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T19:00:00.000Z`,
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

/** Only first half of teams play through maxWeek → incomplete canonical coverage. */
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

function healthyWeek0(
  overrides: Partial<CoreV1LifecycleInput> = {}
): CoreV1LifecycleInput {
  const ids = fbs2026();
  return {
    season: TARGET_SEASON,
    completedThroughWeek: 0,
    mode: 'PREVIEW',
    confirmation: '',
    fbsIds: ids,
    talentRows: talentFor(ids),
    games: [],
    epaRows: [],
    existingV1FbsRows: 0,
    existingV1TeamIds: [],
    ...overrides,
  };
}

function healthyThroughWeek(
  completedThroughWeek: number,
  overrides: Partial<CoreV1LifecycleInput> = {}
): CoreV1LifecycleInput {
  const ids = fbs2026();
  const games = buildWeeklyGames(ids, completedThroughWeek);
  return {
    season: TARGET_SEASON,
    completedThroughWeek,
    mode: 'PREVIEW',
    confirmation: '',
    fbsIds: ids,
    talentRows: talentFor(ids),
    games,
    epaRows: epaForGames(games),
    existingV1FbsRows: 0,
    existingV1TeamIds: [],
    ...overrides,
  };
}

describe('Core V1 lifecycle — B1 weights', () => {
  it('completedThroughWeek 0/1/2 → weight 0', () => {
    expect(canonicalWeightForCompletedWeek(0)).toBe(0);
    expect(canonicalWeightForCompletedWeek(1)).toBe(0);
    expect(canonicalWeightForCompletedWeek(2)).toBe(0);
  });

  it('week3 → 0.25', () => {
    expect(canonicalWeightForCompletedWeek(3)).toBe(0.25);
  });

  it('week4 → 0.50', () => {
    expect(canonicalWeightForCompletedWeek(4)).toBe(0.5);
  });

  it('week5 → 0.75', () => {
    expect(canonicalWeightForCompletedWeek(5)).toBe(0.75);
  });

  it('week6+ → 1', () => {
    expect(canonicalWeightForCompletedWeek(6)).toBe(1);
    expect(canonicalWeightForCompletedWeek(8)).toBe(1);
    expect(canonicalWeightForCompletedWeek(12)).toBe(1);
  });

  it("CORE_V1_2026_TRANSITION_POLICY === 'GLOBAL_BLEND_W3_W6'", () => {
    expect(CORE_V1_2026_TRANSITION_POLICY).toBe('GLOBAL_BLEND_W3_W6');
  });
});

describe('Core V1 lifecycle — formulas', () => {
  it('Candidate A exactly talentZ*3.5 (CANDIDATE_A_TALENT_SCALE)', () => {
    expect(CANDIDATE_A_TALENT_SCALE).toBe(3.5);
    expect(CANDIDATE_A_TALENT_SCALE).toBe(
      BALANCED_WEIGHT_TALENT * BALANCED_V1_CALIBRATION_FACTOR
    );
    const ids = fbs2026();
    const talent = talentFor(ids);
    const bridge = computeTalentOnlyBridgeRatings(
      talent.map((t) => ({
        teamId: t.teamId,
        talentComposite: t.talentComposite as number,
      }))
    );
    for (const r of bridge) {
      expect(r.candidateA).toBeCloseTo(r.talentZ * CANDIDATE_A_TALENT_SCALE, 12);
    }
    const result = buildCoreV1LifecycleEvaluation(healthyWeek0());
    expect(result.candidateAScale).toBe(CANDIDATE_A_TALENT_SCALE);
    expect(result.candidateAFormula).toBe('talentZ*3.5');
    const byId = new Map(bridge.map((r) => [r.teamId, r.candidateA] as const));
    for (const row of result.rows) {
      expect(row.candidateA).toBeCloseTo(byId.get(row.teamId)!, 12);
    }
  });

  it('canonical formula unchanged (computeBalancedV1Ratings ×14)', () => {
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
      expect(r.calibrationFactor).toBe(BALANCED_V1_CALIBRATION_FACTOR);
    }
  });

  it('blend formula exact via blendRatings and lifecycle rows', () => {
    expect(blendRatings(10, 20, 0)).toBe(10);
    expect(blendRatings(10, 20, 1)).toBe(20);
    expect(blendRatings(10, 20, 0.25)).toBeCloseTo(12.5, 12);
    expect(blendRatings(10, 20, 0.5)).toBeCloseTo(15, 12);
    expect(blendRatings(10, 20, 0.75)).toBeCloseTo(17.5, 12);

    const result = buildCoreV1LifecycleEvaluation(healthyThroughWeek(3));
    expect(result.ok).toBe(true);
    expect(result.canonicalWeight).toBe(0.25);
    for (const row of result.rows) {
      expect(row.canonicalRating).not.toBeNull();
      expect(row.finalPowerRating).toBeCloseTo(
        blendRatings(row.candidateA, row.canonicalRating!, row.canonicalWeight),
        12
      );
    }
  });
});

describe('Core V1 lifecycle — FBS / talent gates', () => {
  it('requires exact 138 FBS', () => {
    const ids = fbs2026().slice(0, 137);
    const result = buildCoreV1LifecycleEvaluation(
      healthyWeek0({ fbsIds: ids, talentRows: talentFor(ids) })
    );
    expect(result.ok).toBe(false);
    expect(result.fbsCount).toBe(137);
    expect(result.findings.some((f) => f.includes('FBS count'))).toBe(true);
  });

  it('requires exact 138 finite talent', () => {
    const ids = fbs2026();
    const talentRows = talentFor(ids).map((t, i) =>
      i === 0 ? { ...t, talentComposite: null } : t
    );
    const result = buildCoreV1LifecycleEvaluation(
      healthyWeek0({ talentRows })
    );
    expect(result.ok).toBe(false);
    expect(result.finiteTalent).toBe(137);
    expect(result.findings.some((f) => f.includes('finiteTalent'))).toBe(true);
  });

  it('requires NDSU and Sacramento State', () => {
    const base = buildBaseFbsFixture(138);
    expect(base.includes('north-dakota-state')).toBe(false);
    const noNdsu = buildCoreV1LifecycleEvaluation(
      healthyWeek0({
        fbsIds: base,
        talentRows: talentFor(base),
      })
    );
    expect(noNdsu.ok).toBe(false);
    expect(noNdsu.highlightTeamsPresent).toBe(false);

    const withHighlights = fbs2026();
    expect(withHighlights).toContain('north-dakota-state');
    expect(withHighlights).toContain('sacramento-state');
    const healthy = buildCoreV1LifecycleEvaluation(healthyWeek0());
    expect(healthy.ok).toBe(true);
    expect(healthy.highlightTeamsPresent).toBe(true);
  });
});

describe('Core V1 lifecycle — weight / canonical coverage', () => {
  it('weight=0 does not require canonical coverage (healthy week0 preseason)', () => {
    const result = buildCoreV1LifecycleEvaluation(healthyWeek0());
    expect(result.ok).toBe(true);
    expect(result.canonicalWeight).toBe(0);
    expect(result.canonicalCount).toBe(0);
    expect(result.finalFbsGamesThroughCompletedWeek).toBe(0);
    expect(result.outputCount).toBe(EXPECTED_FBS_COUNT);
    expect(result.rows).toHaveLength(138);
    for (const row of result.rows) {
      expect(row.canonicalWeight).toBe(0);
      expect(row.canonicalRating).toBeNull();
      expect(row.finalPowerRating).toBe(row.candidateA);
      expect(row.games).toBe(0);
    }
  });

  it('weight>0 requires canonical exact 138 (incomplete games at week3 fail)', () => {
    const ids = fbs2026();
    const games = buildIncompleteGames(ids, 3);
    const result = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(3, {
        games,
        epaRows: epaForGames(games),
      })
    );
    expect(result.ok).toBe(false);
    expect(result.canonicalWeight).toBe(0.25);
    expect(result.canonicalCount).toBeLessThan(EXPECTED_FBS_COUNT);
    expect(
      result.findings.some(
        (f) =>
          f.includes('canonicalCount') ||
          f.includes('exact authoritative FBS') ||
          f.includes('canonicalFinite')
      )
    ).toBe(true);
  });

  it('partial canonical → fail closed', () => {
    const ids = fbs2026();
    // Only ~4 teams play → far from 138 canonical
    const games = buildWeeklyGames(ids.slice(0, 4), 3);
    const result = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(3, {
        games,
        epaRows: epaForGames(games),
      })
    );
    expect(result.ok).toBe(false);
    expect(result.canonicalExactFbsSet).toBe(false);
  });

  it('no per-team fallback (global weight only)', () => {
    const result = buildCoreV1LifecycleEvaluation(healthyThroughWeek(4));
    expect(result.ok).toBe(true);
    expect(result.canonicalWeight).toBe(0.5);
    const weights = new Set(result.rows.map((r) => r.canonicalWeight));
    expect(weights.size).toBe(1);
    expect(weights.has(0.5)).toBe(true);
  });

  it('future final FBS-vs-FBS beyond completedThroughWeek → fail closed', () => {
    const ids = fbs2026();
    const games = buildWeeklyGames(ids, 4); // includes week 4 finals
    const result = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(3, {
        games,
        epaRows: epaForGames(games),
      })
    );
    expect(result.ok).toBe(false);
    expect(result.futureFinalFbsGamesBeyondCompletedWeek).toBeGreaterThan(0);
    expect(
      result.futureFinalGamesWithFbsParticipantBeyondCutoff
    ).toBeGreaterThan(0);
    expect(
      result.findings.some((f) =>
        f.includes('futureFinalGamesWithFbsParticipantBeyondCutoff')
      )
    ).toBe(true);
  });

  it('future EPA excluded (filter via included games)', () => {
    const ids = fbs2026();
    const games = buildWeeklyGames(ids, 3);
    const scheduledFuture: TransitionGameRow = {
      gameId: 'future-scheduled',
      week: 4,
      date: '2026-09-20T19:00:00.000Z',
      status: 'scheduled',
      homeTeamId: ids[0],
      awayTeamId: ids[1],
      homeScore: null,
      awayScore: null,
    };
    const allGames = [...games, scheduledFuture];
    const epa = [
      ...epaForGames(games),
      {
        gameId: 'future-scheduled',
        week: 4,
        teamId: ids[0],
        epaOff: 99,
        epaDef: 99,
      },
      {
        gameId: 'orphan-future-epa',
        week: 5,
        teamId: ids[2],
        epaOff: 50,
        epaDef: 50,
      },
    ];

    const fbsSet = new Set(ids.map((id) => id.toLowerCase()));
    const gamesThrough = filterGamesThroughCutoff(allGames, 3).filter(
      (g) =>
        fbsSet.has(g.homeTeamId.toLowerCase()) ||
        fbsSet.has(g.awayTeamId.toLowerCase())
    );
    const epaThrough = filterEpaThroughCutoff(epa, gamesThrough, 3);
    expect(epaThrough.every((e) => e.gameId !== 'future-scheduled')).toBe(true);
    expect(epaThrough.every((e) => e.gameId !== 'orphan-future-epa')).toBe(true);
    expect(epaThrough.every((e) => gamesThrough.some((g) => g.gameId === e.gameId))).toBe(
      true
    );

    const withFutureEpa = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(3, { games: allGames, epaRows: epa })
    );
    const withoutFutureEpa = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(3, { games, epaRows: epaForGames(games) })
    );
    expect(withFutureEpa.ok).toBe(true);
    expect(withoutFutureEpa.ok).toBe(true);
    expect(withFutureEpa.rows.map((r) => r.finalPowerRating)).toEqual(
      withoutFutureEpa.rows.map((r) => r.finalPowerRating)
    );
  });

  it('weight=1 equals canonical exactly when full coverage', () => {
    const result = buildCoreV1LifecycleEvaluation(healthyThroughWeek(6));
    expect(result.ok).toBe(true);
    expect(result.canonicalWeight).toBe(1);
    expect(result.canonicalCount).toBe(EXPECTED_FBS_COUNT);
    expect(result.canonicalExactFbsSet).toBe(true);
    for (const row of result.rows) {
      expect(row.canonicalRating).not.toBeNull();
      expect(row.finalPowerRating).toBe(row.canonicalRating);
    }
  });
});

describe('Core V1 lifecycle — canonical FBS-vs-FCS EPA asymmetry', () => {
  const FCS = 'fcs-northwestern-state';

  function fbsVsFcsFinal(
    fbsTeamId: string,
    week: number,
    gameId: string,
    status: string = 'final'
  ): TransitionGameRow {
    return {
      gameId,
      week,
      date: `2026-09-${String(Math.min(28, 10 + week)).padStart(2, '0')}T19:00:00.000Z`,
      status,
      homeTeamId: fbsTeamId,
      awayTeamId: FCS,
      homeScore: status === 'final' ? 42 : null,
      awayScore: status === 'final' ? 7 : null,
    };
  }

  function fcsVsFcsFinal(week: number, gameId: string): TransitionGameRow {
    return {
      gameId,
      week,
      date: `2026-09-${String(Math.min(28, 10 + week)).padStart(2, '0')}T17:00:00.000Z`,
      status: 'final',
      homeTeamId: 'fcs-a',
      awayTeamId: 'fcs-b',
      homeScore: 21,
      awayScore: 14,
    };
  }

  /** Historical-writer reconstruction: participant finals → stats helper + EPA filter. */
  function reconstructCanonicalBalanced(input: {
    fbsIds: string[];
    talentRows: { teamId: string; talentComposite: number }[];
    games: TransitionGameRow[];
    epaRows: TransitionEpaRow[];
    completedThroughWeek: number;
  }) {
    const fbs = [...new Set(input.fbsIds.map((id) => id.toLowerCase()))].sort();
    const fbsSet = new Set(fbs);
    const finalsWithFbsParticipantThroughCutoff = filterGamesThroughCutoff(
      input.games,
      input.completedThroughWeek
    ).filter(
      (g) =>
        fbsSet.has(g.homeTeamId.toLowerCase()) ||
        fbsSet.has(g.awayTeamId.toLowerCase())
    );
    const aggregates = aggregateBalancedGameStats(
      finalsWithFbsParticipantThroughCutoff,
      fbsSet
    );
    const epaThrough = filterEpaThroughCutoff(
      input.epaRows,
      finalsWithFbsParticipantThroughCutoff,
      input.completedThroughWeek
    ).filter((e) => fbsSet.has(e.teamId.toLowerCase()));
    const epaByTeam = aggregateBalancedEpa(epaThrough);
    const built = buildBalancedTeamMetrics({
      fbsTeamIds: fbs,
      talentRows: input.talentRows,
      gameAggregates: aggregates,
      epaByTeam,
    });
    return {
      ratings: computeBalancedV1Ratings(built.metrics),
      aggregates,
      epaThrough,
      finalsWithFbsParticipantThroughCutoff,
      metrics: built.metrics,
    };
  }

  it('FBS-vs-FBS final affects gamesPlayed / winPct / netPoints and includes EPA', () => {
    const base = healthyThroughWeek(6);
    const team = base.fbsIds[0];
    const partner = base.fbsIds[1];
    const extra: TransitionGameRow = {
      gameId: 'extra-fbs-fbs',
      week: 6,
      date: '2026-10-01T19:00:00.000Z',
      status: 'final',
      homeTeamId: team,
      awayTeamId: partner,
      homeScore: 35,
      awayScore: 10,
    };
    const without = reconstructCanonicalBalanced({
      fbsIds: base.fbsIds,
      talentRows: base.talentRows as { teamId: string; talentComposite: number }[],
      games: base.games,
      epaRows: base.epaRows,
      completedThroughWeek: 6,
    });
    const withExtra = reconstructCanonicalBalanced({
      fbsIds: base.fbsIds,
      talentRows: base.talentRows as { teamId: string; talentComposite: number }[],
      games: [...base.games, extra],
      epaRows: [
        ...base.epaRows,
        {
          gameId: extra.gameId,
          week: 6,
          teamId: team,
          epaOff: 0.4,
          epaDef: -0.2,
        },
        {
          gameId: extra.gameId,
          week: 6,
          teamId: partner,
          epaOff: -0.1,
          epaDef: 0.1,
        },
      ],
      completedThroughWeek: 6,
    });
    const a0 = without.aggregates.get(team)!;
    const a1 = withExtra.aggregates.get(team)!;
    expect(a1.games).toBe(a0.games + 1);
    expect(a1.wins).toBe(a0.wins + 1);
    expect(a1.pointsFor - a1.pointsAgainst).toBe(
      a0.pointsFor - a0.pointsAgainst + 25
    );
    expect(withExtra.epaThrough.some((e) => e.gameId === extra.gameId)).toBe(
      true
    );
  });

  it('FBS-vs-FCS final through cutoff: no games/win/net; FBS EPA included', () => {
    const base = healthyThroughWeek(6);
    const team = base.fbsIds[0];
    const fcsGame = fbsVsFcsFinal(team, 6, 'fbs-fcs-through');
    const fcsEpa: TransitionEpaRow = {
      gameId: fcsGame.gameId,
      week: 6,
      teamId: team,
      epaOff: 0.9,
      epaDef: -0.4,
    };
    const without = reconstructCanonicalBalanced({
      fbsIds: base.fbsIds,
      talentRows: base.talentRows as { teamId: string; talentComposite: number }[],
      games: base.games,
      epaRows: base.epaRows,
      completedThroughWeek: 6,
    });
    const withFcs = reconstructCanonicalBalanced({
      fbsIds: base.fbsIds,
      talentRows: base.talentRows as { teamId: string; talentComposite: number }[],
      games: [...base.games, fcsGame],
      epaRows: [...base.epaRows, fcsEpa],
      completedThroughWeek: 6,
    });
    const a0 = without.aggregates.get(team)!;
    const a1 = withFcs.aggregates.get(team)!;
    expect(a1.games).toBe(a0.games);
    expect(a1.wins).toBe(a0.wins);
    expect(a1.losses).toBe(a0.losses);
    expect(a1.pointsFor).toBe(a0.pointsFor);
    expect(a1.pointsAgainst).toBe(a0.pointsAgainst);
    expect(withFcs.epaThrough.some((e) => e.gameId === fcsGame.gameId)).toBe(
      true
    );

    const lifeWithout = buildCoreV1LifecycleEvaluation(base);
    const lifeWith = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(6, {
        games: [...base.games, fcsGame],
        epaRows: [...base.epaRows, fcsEpa],
      })
    );
    expect(lifeWith.ok).toBe(true);
    expect(lifeWith.rows.find((r) => r.teamId === team)!.games).toBe(
      lifeWithout.rows.find((r) => r.teamId === team)!.games
    );
    expect(
      lifeWith.finalGamesWithFbsParticipantThroughCutoff
    ).toBeGreaterThan(lifeWith.finalFbsGamesThroughCompletedWeek);
    expect(lifeWith.epaEligibleGameCount).toBe(
      lifeWith.finalGamesWithFbsParticipantThroughCutoff
    );
    // Distinct EPA changes canonical / weight=1 final vs FBS-only EPA
    expect(
      lifeWith.rows.find((r) => r.teamId === team)!.finalPowerRating
    ).not.toBe(
      lifeWithout.rows.find((r) => r.teamId === team)!.finalPowerRating
    );
  });

  it('FBS-vs-FCS after cutoff: EPA excluded', () => {
    const base = healthyThroughWeek(3);
    const team = base.fbsIds[0];
    const fcsGame = fbsVsFcsFinal(team, 4, 'fbs-fcs-after');
    const fcsEpa: TransitionEpaRow = {
      gameId: fcsGame.gameId,
      week: 4,
      teamId: team,
      epaOff: 0.9,
      epaDef: -0.4,
    };
    // Include the future final so we can inspect filter in isolation via reconstruct
    // at cutoff 3 (without running lifecycle fail-closed).
    const recon = reconstructCanonicalBalanced({
      fbsIds: base.fbsIds,
      talentRows: base.talentRows as { teamId: string; talentComposite: number }[],
      games: [...base.games, fcsGame],
      epaRows: [...base.epaRows, fcsEpa],
      completedThroughWeek: 3,
    });
    expect(recon.epaThrough.every((e) => e.gameId !== fcsGame.gameId)).toBe(
      true
    );
    expect(
      recon.finalsWithFbsParticipantThroughCutoff.every(
        (g) => g.gameId !== fcsGame.gameId
      )
    ).toBe(true);
  });

  it('FBS-vs-FCS scheduled/non-final inside cutoff: fail closed (EPA still excluded from filter)', () => {
    const base = healthyThroughWeek(6);
    const team = base.fbsIds[0];
    const scheduled = fbsVsFcsFinal(team, 6, 'fbs-fcs-scheduled', 'scheduled');
    const fcsEpa: TransitionEpaRow = {
      gameId: scheduled.gameId,
      week: 6,
      teamId: team,
      epaOff: 0.9,
      epaDef: -0.4,
    };
    const recon = reconstructCanonicalBalanced({
      fbsIds: base.fbsIds,
      talentRows: base.talentRows as { teamId: string; talentComposite: number }[],
      games: [...base.games, scheduled],
      epaRows: [...base.epaRows, fcsEpa],
      completedThroughWeek: 6,
    });
    expect(recon.epaThrough.every((e) => e.gameId !== scheduled.gameId)).toBe(
      true
    );
    const life = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(6, {
        games: [...base.games, scheduled],
        epaRows: [...base.epaRows, fcsEpa],
      })
    );
    expect(life.ok).toBe(false);
    expect(life.writeSafe).toBe(false);
    expect(life.nonFinalRelevantGamesThroughCutoff).toBeGreaterThan(0);
    expect(
      life.findings.some((f) => f.includes('nonFinalRelevantGamesThroughCutoff'))
    ).toBe(true);
  });

  it('future final FBS-vs-FCS beyond cutoff → fail closed (no write auth)', () => {
    const base = healthyThroughWeek(3);
    const team = base.fbsIds[0];
    const futureFcs = fbsVsFcsFinal(team, 4, 'fbs-fcs-future-final');
    const result = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(3, {
        games: [...base.games, futureFcs],
        epaRows: [
          ...base.epaRows,
          {
            gameId: futureFcs.gameId,
            week: 4,
            teamId: team,
            epaOff: 0.5,
            epaDef: -0.1,
          },
        ],
      })
    );
    expect(result.ok).toBe(false);
    expect(result.futureFinalFbsGamesBeyondCompletedWeek).toBe(0);
    expect(
      result.futureFinalGamesWithFbsParticipantBeyondCutoff
    ).toBeGreaterThan(0);
    expect(result.ratingsWriteAuthorized).toBe(false);
    expect(result.commitEligible).toBe(false);
    expect(
      result.findings.some((f) =>
        f.includes('futureFinalGamesWithFbsParticipantBeyondCutoff')
      )
    ).toBe(true);
  });

  it('pure FCS-vs-FCS final ignored for aggregates, EPA eligibility, and ratings', () => {
    const base = healthyThroughWeek(6);
    const pure = fcsVsFcsFinal(6, 'pure-fcs-fcs');
    const lifeBase = buildCoreV1LifecycleEvaluation(base);
    const life = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(6, {
        games: [...base.games, pure],
        epaRows: [
          ...base.epaRows,
          {
            gameId: pure.gameId,
            week: 6,
            teamId: 'fcs-a',
            epaOff: 1,
            epaDef: 1,
          },
        ],
      })
    );
    expect(life.ok).toBe(true);
    expect(life.finalGamesWithFbsParticipantThroughCutoff).toBe(
      lifeBase.finalGamesWithFbsParticipantThroughCutoff
    );
    expect(life.finalFbsGamesThroughCompletedWeek).toBe(
      lifeBase.finalFbsGamesThroughCompletedWeek
    );
    expect(life.rows.map((r) => r.finalPowerRating)).toEqual(
      lifeBase.rows.map((r) => r.finalPowerRating)
    );
  });

  it('lifecycle matches historical Balanced reconstruction with FBS-vs-FCS EPA', () => {
    const base = healthyThroughWeek(6);
    const team = base.fbsIds[0];
    const fcsGame = fbsVsFcsFinal(team, 5, 'parity-fbs-fcs');
    const games = [...base.games, fcsGame];
    const epaRows = [
      ...base.epaRows,
      {
        gameId: fcsGame.gameId,
        week: 5,
        teamId: team,
        epaOff: 0.55,
        epaDef: -0.22,
      },
    ];
    const recon = reconstructCanonicalBalanced({
      fbsIds: base.fbsIds,
      talentRows: base.talentRows as { teamId: string; talentComposite: number }[],
      games,
      epaRows,
      completedThroughWeek: 6,
    });
    const life = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(6, { games, epaRows })
    );
    expect(life.ok).toBe(true);
    expect(life.canonicalWeight).toBe(1);
    const reconById = new Map(
      recon.ratings.map((r) => [r.teamId.toLowerCase(), r.powerRating] as const)
    );
    for (const row of life.rows) {
      expect(row.finalPowerRating).toBeCloseTo(reconById.get(row.teamId)!, 10);
      expect(row.games).toBe(recon.aggregates.get(row.teamId)?.games ?? 0);
    }
  });

  it('weight=1 equals canonical Balanced exactly when FBS-vs-FCS EPA present', () => {
    const base = healthyThroughWeek(6);
    const team = base.fbsIds[2];
    const fcsGame = fbsVsFcsFinal(team, 6, 'w1-fcs-epa');
    const games = [...base.games, fcsGame];
    const epaRows = [
      ...base.epaRows,
      {
        gameId: fcsGame.gameId,
        week: 6,
        teamId: team,
        epaOff: 0.7,
        epaDef: -0.3,
      },
    ];
    const life = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(6, { games, epaRows })
    );
    const recon = reconstructCanonicalBalanced({
      fbsIds: base.fbsIds,
      talentRows: base.talentRows as { teamId: string; talentComposite: number }[],
      games,
      epaRows,
      completedThroughWeek: 6,
    });
    expect(life.ok).toBe(true);
    expect(life.canonicalWeight).toBe(1);
    for (const row of life.rows) {
      expect(row.finalPowerRating).toBe(row.canonicalRating);
      const c = recon.ratings.find((r) => r.teamId === row.teamId)!;
      expect(row.finalPowerRating).toBeCloseTo(c.powerRating, 10);
    }
  });

  it('persisted games remain FBS-vs-FBS games only (FCS does not inflate)', () => {
    const base = healthyThroughWeek(6);
    const team = base.fbsIds[0];
    const fcsGame = fbsVsFcsFinal(team, 6, 'persist-fcs');
    const without = buildCoreV1LifecycleEvaluation(base);
    const withFcs = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(6, {
        games: [...base.games, fcsGame],
        epaRows: [
          ...base.epaRows,
          {
            gameId: fcsGame.gameId,
            week: 6,
            teamId: team,
            epaOff: 0.2,
            epaDef: -0.1,
          },
        ],
      })
    );
    const g0 = without.rows.find((r) => r.teamId === team)!.games;
    const g1 = withFcs.rows.find((r) => r.teamId === team)!.games;
    expect(g1).toBe(g0);
    expect(toPersistRows(withFcs).find((r) => r.teamId === team)!.games).toBe(
      g0
    );
    expect(withFcs.fbsVsFbsFinalsThroughCutoff).toBe(
      withFcs.finalFbsGamesThroughCompletedWeek
    );
    expect(withFcs.finalGamesWithFbsParticipantThroughCutoff).toBe(
      without.finalGamesWithFbsParticipantThroughCutoff + 1
    );
  });
});

describe('Core V1 lifecycle — CLI / store / COMMIT gates', () => {
  it('parseCoreV1LifecycleArgs defaults PREVIEW and completedThroughWeek 0', () => {
    expect(parseCoreV1LifecycleArgs([])).toEqual({
      ok: true,
      season: TARGET_SEASON,
      completedThroughWeek: 0,
      mode: 'PREVIEW',
      confirmation: '',
      reportPath: null,
    });
    expect(
      parseCoreV1LifecycleArgs([
        '--season',
        '2026',
        '--completed-through-week',
        '3',
        '--mode',
        'COMMIT',
        '--confirm',
        expectedCoreV1LifecycleConfirmation(3),
        '--report',
        'reports/out.json',
      ])
    ).toEqual({
      ok: true,
      season: 2026,
      completedThroughWeek: 3,
      mode: 'COMMIT',
      confirmation: expectedCoreV1LifecycleConfirmation(3),
      reportPath: 'reports/out.json',
    });
  });

  it('PREVIEW read-only store has only load methods', () => {
    const store: CoreV1LifecycleReadStore = {
      async loadFbsTeamIds() {
        return [];
      },
      async loadTalentRows() {
        return [];
      },
      async loadGames() {
        return [];
      },
      async loadEpaRows() {
        return [];
      },
      async loadExistingV1Fbs() {
        return [];
      },
    };
    expect(Object.keys(store).every((k) => /^load/.test(k))).toBe(true);
    expect(Object.keys(store).some((k) => /write|upsert|mutate|persist/i.test(k))).toBe(
      false
    );
  });

  it('COMMIT without confirmation fails', () => {
    const result = buildCoreV1LifecycleEvaluation(
      healthyWeek0({ mode: 'COMMIT', confirmation: '' })
    );
    expect(result.ok).toBe(false);
    expect(result.confirmationValid).toBe(false);
    expect(result.commitEligible).toBe(false);
    expect(
      result.findings.some((f) => f.includes('COMMIT requires confirmation'))
    ).toBe(true);
  });

  it('wrong confirmation fails', () => {
    const result = buildCoreV1LifecycleEvaluation(
      healthyWeek0({ mode: 'COMMIT', confirmation: 'WRONG_PHRASE' })
    );
    expect(result.ok).toBe(false);
    expect(result.confirmationValid).toBe(false);
    expect(result.commitEligible).toBe(false);
  });

  it('old generic WRITE_CONFIRM_PHRASE does not authorize COMMIT', () => {
    expect(WRITE_CONFIRM_PHRASE).toBe('WRITE_2026_CORE_V1');
    expect(expectedCoreV1LifecycleConfirmation(0)).toBe(
      'WRITE_2026_CORE_V1_THROUGH_WEEK_0'
    );
    expect(expectedCoreV1LifecycleConfirmation(3)).toBe(
      'WRITE_2026_CORE_V1_THROUGH_WEEK_3'
    );
    const withLegacy = buildCoreV1LifecycleEvaluation(
      healthyWeek0({
        mode: 'COMMIT',
        confirmation: WRITE_CONFIRM_PHRASE,
      })
    );
    expect(withLegacy.ok).toBe(false);
    expect(withLegacy.confirmationValid).toBe(false);
    expect(withLegacy.commitEligible).toBe(false);

    const withThroughWeek = buildCoreV1LifecycleEvaluation(
      healthyWeek0({
        mode: 'COMMIT',
        confirmation: expectedCoreV1LifecycleConfirmation(0),
      })
    );
    expect(withThroughWeek.ok).toBe(true);
    expect(withThroughWeek.confirmationValid).toBe(true);
    expect(withThroughWeek.commitEligible).toBe(true);
  });

  it('season != 2026 fails', () => {
    const parsed = parseCoreV1LifecycleArgs(['--season', '2025']);
    expect(parsed.ok).toBe(false);
    const result = buildCoreV1LifecycleEvaluation(
      healthyWeek0({ season: 2025 })
    );
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.includes('season must be 2026'))).toBe(
      true
    );
  });

  it('output exactly 138 before persistence', () => {
    const result = buildCoreV1LifecycleEvaluation(healthyWeek0());
    expect(result.ok).toBe(true);
    expect(result.outputCount).toBe(138);
    expect(toPersistRows(result)).toHaveLength(138);
  });
});

describe('Core V1 lifecycle — persist targeting / safety', () => {
  it('only season2026/modelVersion=v1 targeted; persist refuses wrong season/count', async () => {
    expect(TARGET_SEASON).toBe(2026);
    expect(MODEL_VERSION_V1).toBe('v1');
    expect(WRITE_CONFIRM_PHRASE).toBe('WRITE_2026_CORE_V1');
    expect(EXPECTED_FBS_COUNT).toBe(138);

    expect(PHASE).toBe('2C-2J-6D-2');
    const result = buildCoreV1LifecycleEvaluation(
      healthyWeek0({
        mode: 'COMMIT',
        confirmation: expectedCoreV1LifecycleConfirmation(0),
      })
    );
    expect(result.ok).toBe(true);
    expect(result.modelVersion).toBe(MODEL_VERSION_V1);
    const rows = toPersistRows(result);
    expect(rows.every((r) => r.season === TARGET_SEASON)).toBe(true);

    await expect(
      persistCoreV1LifecycleRatings(
        { teamSeasonRating: { upsert: async () => ({}) } },
        rows.slice(0, 137)
      )
    ).rejects.toThrow(/refuse persist: expected 138/);

    await expect(
      persistCoreV1LifecycleRatings(
        { teamSeasonRating: { upsert: async () => ({}) } },
        rows.map((r) => ({ ...r, season: 2025 }))
      )
    ).rejects.toThrow(/refuse persist: season must be 2026/);

    const calls: unknown[] = [];
    const upserted = await persistCoreV1LifecycleRatings(
      {
        teamSeasonRating: {
          upsert: async (args: unknown) => {
            calls.push(args);
            return {};
          },
        },
      },
      rows
    );
    expect(upserted).toEqual({ upserted: 138 });
    const first = calls[0] as {
      where: {
        season_teamId_modelVersion: {
          season: number;
          modelVersion: string;
        };
      };
      update: Record<string, unknown>;
    };
    expect(first.where.season_teamId_modelVersion.season).toBe(2026);
    expect(first.where.season_teamId_modelVersion.modelVersion).toBe('v1');
    expect(Object.keys(first.update).sort()).toEqual([
      'games',
      'powerRating',
      'rating',
    ]);
  });

  it('note 2025 untouched (persist only TARGET_SEASON)', () => {
    const result = buildCoreV1LifecycleEvaluation(healthyWeek0());
    const rows = toPersistRows(result);
    expect(rows.every((r) => r.season === 2026)).toBe(true);
    expect(rows.some((r) => r.season === 2025)).toBe(false);
    const src = fs.readFileSync(
      path.join(__dirname, '../src/ratings/core-v1-lifecycle.ts'),
      'utf8'
    );
    expect(src).toContain('TARGET_SEASON = 2026');
    expect(src).toContain('modelVersion: MODEL_VERSION_V1');
    expect(src).toMatch(/season must be \$\{TARGET_SEASON\}/);
  });

  it('no providers/Odds flags false', () => {
    const result = buildCoreV1LifecycleEvaluation(healthyWeek0());
    expect(result.providersInvoked).toBe(false);
    expect(result.Odds).toBe(false);
    expect(result.mutationsInvoked).toBe(false);
    expect(result.ratingsPersistenceInvoked).toBe(false);
    expect(result.productionWriteAuthorizedByThisPhase).toBe(false);
  });

  it('legacy compute_ratings_v1 untouched (contains LEGACY)', () => {
    const v1 = fs.readFileSync(
      path.join(__dirname, '../src/ratings/compute_ratings_v1.ts'),
      'utf8'
    );
    expect(v1).toContain('LEGACY');
  });

  it('compute_ratings_balanced historical persist still updates only powerRating/rating/games', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/ratings/compute_ratings_balanced.ts'),
      'utf8'
    );
    expect(src).toMatch(
      /update:\s*\{\s*powerRating:\s*rating\.powerRating,\s*rating:\s*rating\.powerRating.*?games:\s*rating\.games/s
    );
    const updateBlock = src.slice(
      src.indexOf('update: {'),
      src.indexOf('create: {')
    );
    expect(updateBlock).toMatch(/powerRating:\s*rating\.powerRating/);
    expect(updateBlock).toMatch(/rating:\s*rating\.powerRating/);
    expect(updateBlock).toMatch(/games:\s*rating\.games/);
    // Comments may mention offense/defense; ensure they are not assigned in update
    expect(updateBlock).not.toMatch(/^\s*offenseRating\s*:/m);
    expect(updateBlock).not.toMatch(/^\s*defenseRating\s*:/m);
    expect(updateBlock).not.toMatch(/^\s*confidence\s*:/m);
  });

  it('safe error handling sanitizeCoreV1LifecycleError', () => {
    const safe = sanitizeCoreV1LifecycleError(
      new Error('postgres://user:s3cret@host/db')
    );
    expect(safe).toContain('connection and secret details suppressed');
    expect(safe).not.toMatch(/postgres|s3cret/i);
  });

  it('workflow yml is workflow_dispatch only, no CFBD, through-week confirmation', () => {
    const wf = fs.readFileSync(
      path.join(
        __dirname,
        '../../../.github/workflows/write-core-v1-lifecycle-ratings.yml'
      ),
      'utf8'
    );
    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/^\s*push:/m);
    expect(wf).not.toMatch(/^\s*pull_request:/m);
    expect(wf).toContain('CFBD_API_KEY: not provided');
    expect(wf).toContain('ODDS_API_KEY: not provided');
    expect(wf).toContain('WRITE_2026_CORE_V1_THROUGH_WEEK_');
    expect(wf).toContain('GLOBAL_BLEND_W3_W6');
    expect(wf).toMatch(/default:\s*PREVIEW/);
    expect(wf).toContain('--report');
    expect(wf).toContain('upload-artifact');
    expect(wf).toContain('core-v1-lifecycle-2026-through-w');
    expect(wf).toContain('cancel-in-progress: false');
    expect(wf).toContain('actions/checkout@v6');
    expect(wf).toContain('actions/setup-node@v6');
    expect(wf).not.toMatch(/CFBD_API_KEY:\s*\$\{\{\s*secrets/);
    expect(wf).not.toMatch(/ODDS_API_KEY:\s*\$\{\{\s*secrets/);
    // Old generic phrase must not authorize COMMIT in preflight
    expect(wf).not.toMatch(
      /CONFIRM" != "WRITE_2026_CORE_V1"/
    );
  });

  it('workflow security: no job-wide production DB secret; inputs via step env only', () => {
    const wf = fs
      .readFileSync(
        path.join(
          __dirname,
          '../../../.github/workflows/write-core-v1-lifecycle-ratings.yml'
        ),
        'utf8'
      )
      .replace(/\r\n/g, '\n');

    // No job-level production DB secrets under jobs.write
    const jobsWriteIdx = wf.indexOf('jobs:\n  write:');
    expect(jobsWriteIdx).toBeGreaterThanOrEqual(0);
    const stepsIdx = wf.indexOf('\n    steps:', jobsWriteIdx);
    expect(stepsIdx).toBeGreaterThan(jobsWriteIdx);
    const jobPreamble = wf.slice(jobsWriteIdx, stepsIdx);
    expect(jobPreamble).not.toMatch(
      /DATABASE_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/
    );
    expect(jobPreamble).not.toMatch(
      /DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/
    );

    // No direct ${{ inputs.* }} interpolation inside run-script shell assignments
    expect(wf).not.toMatch(/SEASON="\$\{\{\s*inputs\.season\s*\}\}"/);
    expect(wf).not.toMatch(
      /WEEK="\$\{\{\s*inputs\.completed_through_week\s*\}\}"/
    );
    expect(wf).not.toMatch(/MODE="\$\{\{\s*inputs\.mode\s*\}\}"/);
    expect(wf).not.toMatch(
      /CONFIRM="\$\{\{\s*inputs\.confirmation\s*\}\}"/
    );
    expect(wf).not.toMatch(
      /--season\s+"\$\{\{\s*inputs\.season\s*\}\}"/
    );
    expect(wf).not.toMatch(
      /--completed-through-week\s+"\$\{\{\s*inputs\.completed_through_week\s*\}\}"/
    );
    expect(wf).not.toMatch(
      /--confirm\s+"\$\{\{\s*inputs\.confirmation\s*\}\}"/
    );
    expect(wf).not.toMatch(
      /echo "season:\s*\$\{\{\s*inputs\.season\s*\}\}"/
    );
    expect(wf).not.toMatch(
      /echo "mode:\s*\$\{\{\s*inputs\.mode\s*\}\}"/
    );

    // Lifecycle CLI and Summary consume normal shell env variables
    expect(wf).toContain('SEASON="$INPUT_SEASON"');
    expect(wf).toContain('WEEK="$INPUT_COMPLETED_THROUGH_WEEK"');
    expect(wf).toContain('MODE="$INPUT_MODE"');
    expect(wf).toContain('CONFIRM="$INPUT_CONFIRMATION"');
    expect(wf).toContain('--season "$INPUT_SEASON"');
    expect(wf).toContain(
      '--completed-through-week "$INPUT_COMPLETED_THROUGH_WEEK"'
    );
    expect(wf).toContain('--mode "$INPUT_MODE"');
    expect(wf).toContain('--confirm "$INPUT_CONFIRMATION"');
    expect(wf).toContain('echo "season: ${INPUT_SEASON}"');
    expect(wf).toContain('echo "mode: ${INPUT_MODE}"');
    expect(wf).toContain(
      'echo "completedThroughWeek: ${INPUT_COMPLETED_THROUGH_WEEK}"'
    );

    // Confirmation value never echoed (error text may mention the required phrase)
    expect(wf).not.toMatch(/echo\s+"\$\{?CONFIRM/);
    expect(wf).not.toMatch(/echo\s+"\$INPUT_CONFIRMATION/);
    expect(wf).not.toMatch(/echo\s+"confirmation=/);
    expect(wf).not.toMatch(/echo\s+confirmation:/);

    // Production DIRECT_URL appears only for Preflight + lifecycle execution steps
    const secretDirectMatches = [
      ...wf.matchAll(
        /DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/g
      ),
    ];
    expect(secretDirectMatches.length).toBe(2);
    const dbSecretMatches = [
      ...wf.matchAll(
        /DATABASE_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/g
      ),
    ];
    expect(dbSecretMatches.length).toBe(1);

    // Install / Prisma generate use inert placeholders, not production secret
    const installIdx = wf.indexOf('- name: Install dependencies');
    const prismaIdx = wf.indexOf('- name: Generate Prisma client');
    const lifecycleIdx = wf.indexOf(
      '- name: Run Core V1 lifecycle (guarded)'
    );
    const uploadIdx = wf.indexOf('- name: Upload lifecycle report artifact');
    const summaryIdx = wf.indexOf('- name: Summary');
    expect(installIdx).toBeGreaterThan(-1);
    expect(prismaIdx).toBeGreaterThan(-1);
    expect(lifecycleIdx).toBeGreaterThan(-1);
    expect(uploadIdx).toBeGreaterThan(lifecycleIdx);
    expect(summaryIdx).toBeGreaterThan(uploadIdx);

    const installBlock = wf.slice(installIdx, prismaIdx);
    const prismaBlock = wf.slice(prismaIdx, lifecycleIdx);
    const lifecycleBlock = wf.slice(lifecycleIdx, uploadIdx);
    const summaryBlock = wf.slice(summaryIdx);

    expect(installBlock).not.toMatch(/secrets\.DIRECT_URL/);
    expect(prismaBlock).not.toMatch(/secrets\.DIRECT_URL/);
    expect(summaryBlock).not.toMatch(/secrets\.DIRECT_URL/);
    expect(installBlock).toContain('prisma_generate_placeholder');
    expect(prismaBlock).toContain('prisma_generate_placeholder');
    expect(lifecycleBlock).toMatch(
      /DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/
    );
    expect(lifecycleBlock).toMatch(
      /DATABASE_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/
    );
  });

  it('workflow treats shell-metacharacter dispatch values only as env (never shell source)', () => {
    // Static proof: dangerous tokens must not appear as interpolated ${{ inputs.* }}
    // inside run: script bodies. Env assignment of INPUT_* is the only input path.
    const wf = fs
      .readFileSync(
        path.join(
          __dirname,
          '../../../.github/workflows/write-core-v1-lifecycle-ratings.yml'
        ),
        'utf8'
      )
      .replace(/\r\n/g, '\n');
    const runBlocks = [
      ...wf.matchAll(/run:\s*\|\n((?:[ \t]+.*\n)*)/g),
    ].map((m) => m[1]);
    expect(runBlocks.length).toBeGreaterThanOrEqual(3);
    for (const block of runBlocks) {
      expect(block).not.toMatch(/\$\{\{\s*inputs\./);
      // Metacharacter injection payload must not be baked into shell source
      expect(block).not.toContain('echo INJECTED');
      expect(block).not.toMatch(/foo"; echo INJECTED/);
    }
    // Env wiring still present so values (including metacharacters) stay data-only
    expect(wf).toContain('INPUT_SEASON: ${{ inputs.season }}');
    expect(wf).toContain(
      'INPUT_COMPLETED_THROUGH_WEEK: ${{ inputs.completed_through_week }}'
    );
    expect(wf).toContain('INPUT_MODE: ${{ inputs.mode }}');
    expect(wf).toContain('INPUT_CONFIRMATION: ${{ inputs.confirmation }}');

    // CLI/parser rejects metacharacter season (treated as value, not shell)
    const parsed = parseCoreV1LifecycleArgs([
      '--season',
      'foo"; echo INJECTED; #',
      '--mode',
      'PREVIEW',
    ]);
    expect(parsed.ok).toBe(false);
  });
});

describe('Core V1 lifecycle — completed-week integrity (2C-2J-6D-2)', () => {
  it('completedThroughWeek=1 with Week 1 scheduled relevant game → FAIL', () => {
    const ids = fbs2026();
    const games = buildWeeklyGames(ids, 1).map((g, i) =>
      i === 0 ? { ...g, status: 'scheduled', homeScore: null, awayScore: null } : g
    );
    const result = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(1, { games, epaRows: epaForGames(games) })
    );
    expect(result.ok).toBe(false);
    expect(result.nonFinalRelevantGamesThroughCutoff).toBeGreaterThan(0);
    expect(
      result.findings.some((f) => f.includes('nonFinalRelevantGamesThroughCutoff'))
    ).toBe(true);
  });

  it('completedThroughWeek=3 with one Week 3 scheduled relevant game → FAIL', () => {
    const ids = fbs2026();
    const games = buildWeeklyGames(ids, 3);
    const week3Idx = games.findIndex((g) => g.week === 3);
    expect(week3Idx).toBeGreaterThanOrEqual(0);
    games[week3Idx] = {
      ...games[week3Idx],
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
    };
    const result = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(3, { games, epaRows: epaForGames(games) })
    );
    expect(result.ok).toBe(false);
    expect(result.canonicalWeight).toBe(0.25);
    expect(result.nonFinalRelevantGamesThroughCutoff).toBe(1);
  });

  it('scheduled future Week 4 while completedThroughWeek=3 → allowed', () => {
    const base = healthyThroughWeek(3);
    const scheduledFuture: TransitionGameRow = {
      gameId: 'future-w4-scheduled',
      week: 4,
      date: '2026-09-20T19:00:00.000Z',
      status: 'scheduled',
      homeTeamId: base.fbsIds[0],
      awayTeamId: base.fbsIds[1],
      homeScore: null,
      awayScore: null,
    };
    const result = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(3, {
        games: [...base.games, scheduledFuture],
        epaRows: base.epaRows,
      })
    );
    expect(result.ok).toBe(true);
    expect(result.nonFinalRelevantGamesThroughCutoff).toBe(0);
    expect(result.missingRelevantCanonicalWeeks).toEqual([]);
  });

  it('missing an entire canonical completed week → FAIL', () => {
    const ids = fbs2026();
    // Only week 1 games, but claim completedThroughWeek=2
    const games = buildWeeklyGames(ids, 1);
    const result = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(2, { games, epaRows: epaForGames(games) })
    );
    expect(result.ok).toBe(false);
    expect(result.missingRelevantCanonicalWeeks).toContain(2);
    expect(
      result.findings.some((f) => f.includes('missingRelevantCanonicalWeeks'))
    ).toBe(true);
  });

  it('final FBS-vs-FBS with null homeScore → FAIL', () => {
    const base = healthyThroughWeek(1);
    const games = base.games.map((g, i) =>
      i === 0 ? { ...g, homeScore: null } : g
    );
    const result = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(1, { games, epaRows: epaForGames(games) })
    );
    expect(result.ok).toBe(false);
    expect(result.finalFbsVsFbsMissingScoreGames).toBeGreaterThan(0);
    expect(
      result.findings.some((f) => f.includes('finalFbsVsFbsMissingScoreGames'))
    ).toBe(true);
  });

  it('final FBS-vs-FBS with null awayScore → FAIL', () => {
    const base = healthyThroughWeek(1);
    const games = base.games.map((g, i) =>
      i === 0 ? { ...g, awayScore: null } : g
    );
    const result = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(1, { games, epaRows: epaForGames(games) })
    );
    expect(result.ok).toBe(false);
    expect(result.finalFbsVsFbsMissingScoreGames).toBeGreaterThan(0);
  });

  it('fully final scored completed weeks pass integrity gates', () => {
    for (const week of [1, 2, 3]) {
      const result = buildCoreV1LifecycleEvaluation(healthyThroughWeek(week));
      expect(result.ok).toBe(true);
      expect(result.missingRelevantCanonicalWeeks).toEqual([]);
      expect(result.nonFinalRelevantGamesThroughCutoff).toBe(0);
      expect(result.finalFbsVsFbsMissingScoreGames).toBe(0);
      expect(result.relevantCanonicalWeeksPresent).toEqual(
        Array.from({ length: week }, (_, i) => i + 1)
      );
    }
  });
});

describe('Core V1 lifecycle — EPA readiness (2C-2J-6D-2)', () => {
  it('canonicalWeight=0 with zero TeamGameStat EPA → allowed', () => {
    const result = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(2, { epaRows: [] })
    );
    expect(result.canonicalWeight).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.expectedEpaParticipantRows).toBeGreaterThan(0);
    expect(result.actualEpaParticipantRows).toBe(0);
    expect(result.missingEpaKeys.length).toBeGreaterThan(0);
    expect(result.epaCoverageExact).toBe(false);
  });

  it('canonicalWeight>0 with exact EPA keys and finite fields → allowed', () => {
    const result = buildCoreV1LifecycleEvaluation(healthyThroughWeek(3));
    expect(result.canonicalWeight).toBe(0.25);
    expect(result.ok).toBe(true);
    expect(result.epaCoverageExact).toBe(true);
    expect(result.missingEpaKeys).toEqual([]);
    expect(result.unexpectedEpaKeys).toEqual([]);
    expect(result.duplicateEpaKeys).toEqual([]);
    expect(result.nullOrNonFiniteEpaRows).toEqual([]);
  });

  it('unexpected EPA natural key → FAIL when weight>0', () => {
    const base = healthyThroughWeek(3);
    const sample = base.epaRows[0];
    const game = base.games.find((g) => g.gameId === sample.gameId)!;
    const stranger = base.fbsIds.find(
      (id) =>
        id.toLowerCase() !== game.homeTeamId.toLowerCase() &&
        id.toLowerCase() !== game.awayTeamId.toLowerCase()
    )!;
    const extra: TransitionEpaRow = {
      gameId: sample.gameId,
      week: sample.week,
      teamId: stranger,
      epaOff: 0.5,
      epaDef: -0.2,
    };
    const result = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(3, { epaRows: [...base.epaRows, extra] })
    );
    expect(result.unexpectedEpaKeys.length).toBe(1);
    expect(result.epaCoverageExact).toBe(false);
    expect(result.writeSafe).toBe(false);
    expect(result.ok).toBe(false);
    expect(
      result.findings.some((f) => f.includes('unexpectedEpaKeys'))
    ).toBe(true);

    const commitResult = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(3, {
        mode: 'COMMIT',
        confirmation: expectedCoreV1LifecycleConfirmation(3),
        epaRows: [...base.epaRows, extra],
      })
    );
    expect(commitResult.commitEligible).toBe(false);
  });

  it('missing expected EPA key → FAIL when weight>0', () => {
    const base = healthyThroughWeek(3);
    const result = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(3, { epaRows: base.epaRows.slice(1) })
    );
    expect(result.ok).toBe(false);
    expect(result.missingEpaKeys.length).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.includes('missingEpaKeys'))).toBe(
      true
    );
  });

  it('duplicate EPA natural key → FAIL when weight>0', () => {
    const base = healthyThroughWeek(3);
    const dup = { ...base.epaRows[0] };
    const result = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(3, { epaRows: [...base.epaRows, dup] })
    );
    expect(result.ok).toBe(false);
    expect(result.duplicateEpaKeys.length).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.includes('duplicateEpaKeys'))).toBe(
      true
    );
  });

  it('expected EPA row with null epaOff → FAIL when weight>0', () => {
    const base = healthyThroughWeek(3);
    const epaRows = base.epaRows.map((e, i) =>
      i === 0 ? { ...e, epaOff: null } : e
    );
    const result = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(3, { epaRows })
    );
    expect(result.ok).toBe(false);
    expect(result.nullOrNonFiniteEpaRows.length).toBeGreaterThan(0);
  });

  it('expected EPA row with null epaDef → FAIL when weight>0', () => {
    const base = healthyThroughWeek(3);
    const epaRows = base.epaRows.map((e, i) =>
      i === 0 ? { ...e, epaDef: null } : e
    );
    const result = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(3, { epaRows })
    );
    expect(result.ok).toBe(false);
    expect(result.nullOrNonFiniteEpaRows.length).toBeGreaterThan(0);
  });

  it('future-game EPA remains excluded', () => {
    const ids = fbs2026();
    const games = buildWeeklyGames(ids, 3);
    const scheduledFuture: TransitionGameRow = {
      gameId: 'future-scheduled',
      week: 4,
      date: '2026-09-20T19:00:00.000Z',
      status: 'scheduled',
      homeTeamId: ids[0],
      awayTeamId: ids[1],
      homeScore: null,
      awayScore: null,
    };
    const allGames = [...games, scheduledFuture];
    const epa = [
      ...epaForGames(games),
      {
        gameId: 'future-scheduled',
        week: 4,
        teamId: ids[0],
        epaOff: 99,
        epaDef: 99,
      },
    ];
    const withFuture = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(3, { games: allGames, epaRows: epa })
    );
    const without = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(3, { games, epaRows: epaForGames(games) })
    );
    expect(withFuture.ok).toBe(true);
    expect(without.ok).toBe(true);
    expect(withFuture.rows.map((r) => r.finalPowerRating)).toEqual(
      without.rows.map((r) => r.finalPowerRating)
    );
  });

  it('FBS-vs-FCS expected EPA semantics: one authoritative FBS row', () => {
    const base = healthyThroughWeek(6);
    const team = base.fbsIds[0];
    const fcsGame: TransitionGameRow = {
      gameId: 'fbs-fcs-epa-expect',
      week: 6,
      date: '2026-10-01T19:00:00.000Z',
      status: 'final',
      homeTeamId: team,
      awayTeamId: 'fcs-northwestern-state',
      homeScore: 42,
      awayScore: 7,
    };
    const without = buildCoreV1LifecycleEvaluation(base);
    const withFcs = buildCoreV1LifecycleEvaluation(
      healthyThroughWeek(6, {
        games: [...base.games, fcsGame],
        epaRows: [
          ...base.epaRows,
          {
            gameId: fcsGame.gameId,
            week: 6,
            teamId: team,
            epaOff: 0.5,
            epaDef: -0.2,
          },
        ],
      })
    );
    expect(withFcs.ok).toBe(true);
    expect(withFcs.expectedEpaParticipantRows).toBe(
      without.expectedEpaParticipantRows + 1
    );
    expect(withFcs.epaCoverageExact).toBe(true);
  });
});

describe('Core V1 lifecycle — Serializable COMMIT / PREVIEW (2C-2J-6D-2)', () => {
  function mockStoreFromInput(
    input: CoreV1LifecycleInput,
    mutate?: {
      games?: TransitionGameRow[];
      epaRows?: TransitionEpaRow[];
    }
  ): CoreV1LifecycleReadStore {
    return {
      async loadFbsTeamIds() {
        return [...input.fbsIds];
      },
      async loadTalentRows() {
        return input.talentRows.map((t) => ({
          teamId: t.teamId,
          talentComposite: t.talentComposite,
        }));
      },
      async loadGames() {
        const games = mutate?.games ?? input.games;
        return games.map((g) => ({
          gameId: g.gameId,
          week: g.week,
          date: new Date(g.date),
          status: g.status,
          homeTeamId: g.homeTeamId,
          awayTeamId: g.awayTeamId,
          homeScore: g.homeScore,
          awayScore: g.awayScore,
        }));
      },
      async loadEpaRows() {
        return [...(mutate?.epaRows ?? input.epaRows)];
      },
      async loadExistingV1Fbs() {
        return input.existingV1TeamIds.map((teamId) => ({ teamId }));
      },
      async loadV1Ratings(_season, fbsTeamIds) {
        return fbsTeamIds.map((teamId) => ({
          teamId,
          powerRating: 0,
          rating: 0,
          games: 0,
        }));
      },
    };
  }

  it('PREVIEW never invokes transaction/write persistence', async () => {
    const input = healthyWeek0();
    let txCalls = 0;
    const writeDeps: CoreV1LifecycleWriteDeps = {
      async transaction() {
        txCalls += 1;
        throw new Error('should not enter transaction in PREVIEW');
      },
    };
    const reportPath = path.join(
      os.tmpdir(),
      `core-v1-preview-${Date.now()}.json`
    );
    const { exitCode, execution } = await runCoreV1Lifecycle({
      season: TARGET_SEASON,
      completedThroughWeek: 0,
      mode: 'PREVIEW',
      confirmation: '',
      reportPath,
      store: mockStoreFromInput(input),
      writeDeps,
    });
    expect(exitCode).toBe(0);
    expect(txCalls).toBe(0);
    expect(execution.mutationsInvoked).toBe(false);
    expect(execution.commitAttempted).toBe(false);
    expect(execution.transactionStarted).toBe(false);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    expect(report.mutationsInvoked).toBe(false);
    expect(report.execution.mutationsInvoked).toBe(false);
    expect(report.providerCalls).toBe(0);
    try {
      fs.unlinkSync(reportPath);
    } catch {
      /* ignore */
    }
  });

  it('successful transactional verification returns commitSucceeded=true', async () => {
    const input = healthyWeek0({
      mode: 'COMMIT',
      confirmation: expectedCoreV1LifecycleConfirmation(0),
    });
    const planned = buildCoreV1LifecycleEvaluation(input);
    const storeRatings = new Map<
      string,
      { powerRating: number; rating: number; games: number }
    >();

    const outcome = await executeAtomicCoreV1LifecycleCommit({
      season: TARGET_SEASON,
      completedThroughWeek: 0,
      confirmation: expectedCoreV1LifecycleConfirmation(0),
      loadFbsTeamIds: async () => [...input.fbsIds],
      loadTalentRows: async () =>
        input.talentRows.map((t) => ({
          teamId: t.teamId,
          talentComposite: t.talentComposite as number,
        })),
      loadGames: async () => [],
      loadEpaRows: async () => [],
      loadExistingV1Fbs: async () => [],
      persist: async (rows) => {
        for (const r of rows) {
          storeRatings.set(r.teamId.toLowerCase(), {
            powerRating: r.powerRating,
            rating: r.powerRating,
            games: r.games,
          });
        }
        return { upserted: rows.length };
      },
      loadAfterV1Ratings: async (ids) =>
        ids.map((teamId) => {
          const row = storeRatings.get(teamId.toLowerCase())!;
          return { teamId, ...row };
        }),
    });
    expect(outcome.verification.ok).toBe(true);
    expect(outcome.upserted).toBe(138);
    expect(outcome.result.ok).toBe(true);

    const exec = buildSuccessfulCommitExecution({
      upsertCount: outcome.upserted,
    });
    expect(exec.commitSucceeded).toBe(true);
    expect(exec.postWriteVerificationSucceeded).toBe(true);
    expect(planned.outputCount).toBe(138);
  });

  it('if Game becomes non-final between plan and tx re-read → refuse write', async () => {
    const input = healthyThroughWeek(1, {
      mode: 'COMMIT',
      confirmation: expectedCoreV1LifecycleConfirmation(1),
    });
    const pre = buildCoreV1LifecycleEvaluation(input);
    expect(pre.ok).toBe(true);

    const mutatedGames = input.games.map((g, i) =>
      i === 0
        ? { ...g, status: 'scheduled', homeScore: null, awayScore: null }
        : g
    );
    await expect(
      executeAtomicCoreV1LifecycleCommit({
        season: TARGET_SEASON,
        completedThroughWeek: 1,
        confirmation: expectedCoreV1LifecycleConfirmation(1),
        loadFbsTeamIds: async () => [...input.fbsIds],
        loadTalentRows: async () =>
          input.talentRows.map((t) => ({
            teamId: t.teamId,
            talentComposite: t.talentComposite as number,
          })),
        loadGames: async () => mutatedGames,
        loadEpaRows: async () => input.epaRows,
        loadExistingV1Fbs: async () => [],
        persist: async () => {
          throw new Error('persist should not run');
        },
        loadAfterV1Ratings: async () => [],
      })
    ).rejects.toThrow(/lifecycle safety failed|nonFinalRelevant/);
  });

  it('if TeamGameStat coverage changes between plan and tx → refuse write', async () => {
    const input = healthyThroughWeek(3, {
      mode: 'COMMIT',
      confirmation: expectedCoreV1LifecycleConfirmation(3),
    });
    const pre = buildCoreV1LifecycleEvaluation(input);
    expect(pre.ok).toBe(true);

    await expect(
      executeAtomicCoreV1LifecycleCommit({
        season: TARGET_SEASON,
        completedThroughWeek: 3,
        confirmation: expectedCoreV1LifecycleConfirmation(3),
        loadFbsTeamIds: async () => [...input.fbsIds],
        loadTalentRows: async () =>
          input.talentRows.map((t) => ({
            teamId: t.teamId,
            talentComposite: t.talentComposite as number,
          })),
        loadGames: async () => input.games,
        loadEpaRows: async () => input.epaRows.slice(2),
        loadExistingV1Fbs: async () => [],
        persist: async () => {
          throw new Error('persist should not run');
        },
        loadAfterV1Ratings: async () => [],
      })
    ).rejects.toThrow(/lifecycle safety failed|missingEpaKeys/);
  });

  it('transactional post-write mismatch throws and rolls back', async () => {
    const input = healthyWeek0({
      mode: 'COMMIT',
      confirmation: expectedCoreV1LifecycleConfirmation(0),
    });
    let persisted = false;
    await expect(
      executeAtomicCoreV1LifecycleCommit({
        season: TARGET_SEASON,
        completedThroughWeek: 0,
        confirmation: expectedCoreV1LifecycleConfirmation(0),
        loadFbsTeamIds: async () => [...input.fbsIds],
        loadTalentRows: async () =>
          input.talentRows.map((t) => ({
            teamId: t.teamId,
            talentComposite: t.talentComposite as number,
          })),
        loadGames: async () => [],
        loadEpaRows: async () => [],
        loadExistingV1Fbs: async () => [],
        persist: async (rows) => {
          persisted = true;
          return { upserted: rows.length };
        },
        loadAfterV1Ratings: async (ids) =>
          ids.map((teamId) => ({
            teamId,
            powerRating: 999,
            rating: 999,
            games: 0,
          })),
      })
    ).rejects.toThrow(/post-write verification failed/);
    expect(persisted).toBe(true);

    const rolled = buildRolledBackExecution({
      mutationAttempts: 138,
      error: 'post-write verification failed',
      postWriteVerificationSucceeded: false,
    });
    expect(rolled.commitSucceeded).toBe(false);
    expect(rolled.postWriteVerificationSucceeded).toBe(false);
  });

  it('verifyCoreV1LifecyclePostWrite requires exact 138 and managed fields', () => {
    const input = healthyWeek0();
    const result = buildCoreV1LifecycleEvaluation(input);
    const rows = toPersistRows(result);
    const ok = verifyCoreV1LifecyclePostWrite({
      plannedRows: rows,
      afterRows: rows.map((r) => ({
        teamId: r.teamId,
        powerRating: r.powerRating,
        rating: r.powerRating,
        games: r.games,
      })),
      fbsTeamIds: input.fbsIds,
    });
    expect(ok.ok).toBe(true);
    expect(ok.verifiedTeams).toBe(138);

    const bad = verifyCoreV1LifecyclePostWrite({
      plannedRows: rows,
      afterRows: rows.slice(0, 137).map((r) => ({
        teamId: r.teamId,
        powerRating: r.powerRating,
        rating: r.powerRating,
        games: r.games,
      })),
      fbsTeamIds: input.fbsIds,
    });
    expect(bad.ok).toBe(false);
  });

  it('successful commit can only report postWriteVerificationSucceeded=true', () => {
    const exec = buildSuccessfulCommitExecution({ upsertCount: 138 });
    expect(exec.commitSucceeded).toBe(true);
    expect(exec.postWriteVerificationSucceeded).toBe(true);
    const preview = buildPreviewExecution();
    expect(preview.commitSucceeded).toBe(false);
    expect(preview.postWriteVerificationSucceeded).toBeNull();
  });

  it('mocked persistence reporting 137 rejects inside atomic commit', async () => {
    const input = healthyWeek0({
      mode: 'COMMIT',
      confirmation: expectedCoreV1LifecycleConfirmation(0),
    });
    await expect(
      executeAtomicCoreV1LifecycleCommit({
        season: TARGET_SEASON,
        completedThroughWeek: 0,
        confirmation: expectedCoreV1LifecycleConfirmation(0),
        loadFbsTeamIds: async () => [...input.fbsIds],
        loadTalentRows: async () =>
          input.talentRows.map((t) => ({
            teamId: t.teamId,
            talentComposite: t.talentComposite as number,
          })),
        loadGames: async () => [],
        loadEpaRows: async () => [],
        loadExistingV1Fbs: async () => [],
        persist: async () => ({ upserted: 137 }),
        loadAfterV1Ratings: async () => {
          throw new Error('loadAfter should not run after upsert count failure');
        },
      })
    ).rejects.toThrow(/upserted 137/);
  });

  it('finalize report keeps isolationLevel null on PREVIEW / non-tx paths', () => {
    const result = buildCoreV1LifecycleEvaluation(healthyWeek0());
    const previewReport = finalizeCoreV1LifecycleReport({
      result,
      execution: buildPreviewExecution(),
      verification: null,
    });
    expect((previewReport.meta as { isolationLevel: unknown }).isolationLevel).toBeNull();
    expect(
      (previewReport.execution as { isolationLevel: unknown }).isolationLevel
    ).toBeNull();

    const blocked = finalizeCoreV1LifecycleReport({
      result,
      execution: buildFailedCommitExecution({
        error: 'blocked before transaction',
      }),
      verification: null,
    });
    expect((blocked.meta as { isolationLevel: unknown }).isolationLevel).toBeNull();

    const success = finalizeCoreV1LifecycleReport({
      result,
      execution: buildSuccessfulCommitExecution({ upsertCount: 138 }),
      verification: { ok: true, reasons: [], afterRows: 138, verifiedTeams: 138 },
    });
    expect(
      (success.meta as { isolationLevel: unknown }).isolationLevel
    ).toBe('Serializable');
  });

  it('CLI source uses Serializable isolation', () => {
    const cli = fs.readFileSync(
      path.join(__dirname, '../write-core-v1-lifecycle.ts'),
      'utf8'
    );
    expect(cli).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(cli).toContain('executeAtomicCoreV1LifecycleCommit');
    expect(cli).toContain('--report');
  });
});
