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
  TARGET_SEASON,
  WRITE_CONFIRM_PHRASE,
  buildCoreV1LifecycleEvaluation,
  canonicalWeightForCompletedWeek,
  parseCoreV1LifecycleArgs,
  persistCoreV1LifecycleRatings,
  sanitizeCoreV1LifecycleError,
  toPersistRows,
  type CoreV1LifecycleInput,
} from '../src/ratings/core-v1-lifecycle';
import type { CoreV1LifecycleReadStore } from '../write-core-v1-lifecycle';

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

  it('future final game beyond completedThroughWeek → fail closed', () => {
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
      result.findings.some((f) =>
        f.includes('futureFinalFbsGamesBeyondCompletedWeek')
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

    const gamesThrough = filterGamesThroughCutoff(allGames, 3).filter(
      (g) =>
        ids.includes(g.homeTeamId.toLowerCase()) &&
        ids.includes(g.awayTeamId.toLowerCase())
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

describe('Core V1 lifecycle — CLI / store / COMMIT gates', () => {
  it('parseCoreV1LifecycleArgs defaults PREVIEW and completedThroughWeek 0', () => {
    expect(parseCoreV1LifecycleArgs([])).toEqual({
      ok: true,
      season: TARGET_SEASON,
      completedThroughWeek: 0,
      mode: 'PREVIEW',
      confirmation: '',
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
        WRITE_CONFIRM_PHRASE,
      ])
    ).toEqual({
      ok: true,
      season: 2026,
      completedThroughWeek: 3,
      mode: 'COMMIT',
      confirmation: WRITE_CONFIRM_PHRASE,
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

    const result = buildCoreV1LifecycleEvaluation(
      healthyWeek0({
        mode: 'COMMIT',
        confirmation: WRITE_CONFIRM_PHRASE,
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

  it('workflow yml is workflow_dispatch only, no CFBD, confirmation WRITE_2026_CORE_V1', () => {
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
    expect(wf).toContain('WRITE_2026_CORE_V1');
    expect(wf).toContain('GLOBAL_BLEND_W3_W6');
    expect(wf).toMatch(/default:\s*PREVIEW/);
    expect(wf).not.toMatch(/CFBD_API_KEY:\s*\$\{\{\s*secrets/);
    expect(wf).not.toMatch(/ODDS_API_KEY:\s*\$\{\{\s*secrets/);
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
    const summaryIdx = wf.indexOf('- name: Summary');
    expect(installIdx).toBeGreaterThan(-1);
    expect(prismaIdx).toBeGreaterThan(-1);
    expect(lifecycleIdx).toBeGreaterThan(-1);
    expect(summaryIdx).toBeGreaterThan(-1);

    const installBlock = wf.slice(installIdx, prismaIdx);
    const prismaBlock = wf.slice(prismaIdx, lifecycleIdx);
    const lifecycleBlock = wf.slice(lifecycleIdx, summaryIdx);
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
