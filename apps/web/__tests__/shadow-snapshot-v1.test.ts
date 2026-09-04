/**
 * Shadow Snapshot V1 planning/contract tests. No network. No DB.
 */

import { calculateHybridSpread } from '@/lib/core-v2-spread';
import { computeEffectiveHfa } from '@/lib/core-v1-spread';
import { computeProductionCoreV1HmaFromV1Ratings as liveCoreV1Hma } from '@/lib/labs/hybrid-shadow-truth';
import {
  SHADOW_MODEL_DEFINITION_HASH,
  SHADOW_POLICY_DEFINITION_HASH,
  SHADOW_MODEL_DEFINITION_ID,
  SHADOW_POLICY_DEFINITION_ID,
  SHADOW_MODEL_DEFINITION_MANIFEST,
  SHADOW_POLICY_DEFINITION_MANIFEST,
  SHADOW_WEATHER_STATE_UNUSED,
  FROZEN_HYBRID_V2_MODEL_MATH,
  canonicalJsonString,
  sha256CanonicalJson,
  canonicalizeJson,
  expectedWriteConfirmation,
  validateCaptureContext,
  deriveShadowSelectedSide,
  selectPredictionMarket,
  resolveV4Comparison,
  qualifyShadowSnapshot,
  planShadowCaptureRun,
  planShadowGameSnapshot,
  reconcileShadowRunCounts,
  deriveShadowRunCounts,
  validateExistingCompleteCohort,
  executeShadowCapture,
  computeProductionCoreV1HmaFromV1Ratings,
  type OperationalShadowFrame,
  type ExistingShadowCohort,
  type ShadowCaptureAdapter,
  type ShadowMutationTx,
  type PlannedShadowCaptureRun,
  type PlannedShadowPredictionSnapshot,
} from '@/lib/shadow-snapshot-v1';

const NOW = new Date('2026-09-05T16:00:00.000Z');
const KICKOFF = new Date('2026-09-05T19:00:00.000Z');
const ZERO_GRADES = {
  offRunGrade: 0,
  defRunGrade: 0,
  offPassGrade: 0,
  defPassGrade: 0,
  offExplosiveness: 0,
  defExplosiveness: 0,
};

const PINNED_MODEL_HASH =
  'fc4c9ba8d22fd13a99aa1ed5f910fc9de25a0d22e1d9b3fa4de989d57aeb13da';
const PINNED_POLICY_HASH =
  'daf88ac0a7e409e519b6e256af3c07f317bf0a1e4d43d078062f894579e93cd4';

function rating(
  teamId: string,
  value: number,
  extra: Record<string, unknown> = {}
) {
  return {
    teamId,
    season: 2026,
    modelVersion: 'v1',
    powerRating: value,
    rating: value,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...extra,
  };
}

function grades(teamId: string, extra: Record<string, unknown> = {}) {
  return {
    id: `ug-${teamId}`,
    teamId,
    season: 2026,
    ...ZERO_GRADES,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...extra,
  };
}

function game(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    season: 2026,
    week: 2,
    homeTeamId: `${id}-home`,
    awayTeamId: `${id}-away`,
    kickoffTimestamp: KICKOFF,
    neutralSite: false,
    ...extra,
  };
}

function homeMarket(
  gameId: string,
  marketHma: number,
  extra: Record<string, unknown> = {}
) {
  return {
    id: `ml-${gameId}`,
    gameId,
    lineType: 'spread',
    lineValue: -marketHma,
    teamId: `${gameId}-home`,
    bookName: 'pinnacle',
    source: 'oddsapi',
    timestamp: new Date(NOW.getTime() - 15 * 60 * 1000),
    ...extra,
  };
}

function availableFrame(gameId = 'g1', marketHma = 6): OperationalShadowFrame {
  const g = game(gameId);
  return {
    games: [g],
    ratings: [rating(g.homeTeamId, 5), rating(g.awayTeamId, 0)],
    unitGrades: [grades(g.homeTeamId), grades(g.awayTeamId)],
    marketLines: [homeMarket(gameId, marketHma)],
    v4Bets: [],
  };
}

function createMemoryAdapter(opts: {
  frame: OperationalShadowFrame;
  existing?: ExistingShadowCohort | null;
  now?: Date;
  failAfterCreateRun?: boolean;
}): {
  adapter: ShadowCaptureAdapter;
  state: {
    runs: PlannedShadowCaptureRun[];
    snapshots: PlannedShadowPredictionSnapshot[];
  };
} {
  const state = {
    runs: [] as PlannedShadowCaptureRun[],
    snapshots: [] as PlannedShadowPredictionSnapshot[],
    existing: opts.existing ?? null,
  };
  let idSeq = 0;
  const clock = () => opts.now ?? NOW;

  const bindTx = (): ShadowMutationTx => ({
    findCohort: async () => state.existing,
    loadFrame: async () => opts.frame,
    now: clock,
    createRun: async (run) => {
      state.runs.push(run);
      if (opts.failAfterCreateRun) {
        throw new Error('forced_transaction_failure');
      }
    },
    createPredictionSnapshots: async (rows) => {
      state.snapshots.push(...rows);
      return rows.length;
    },
    countPredictions: async (captureRunId) =>
      state.snapshots.filter((s) => s.captureRunId === captureRunId).length,
  });

  const adapter: ShadowCaptureAdapter = {
    now: clock,
    createId: () => `id-${++idSeq}`,
    findCohort: async () => state.existing,
    loadFrame: async () => opts.frame,
    runTransaction: async (fn) => {
      const snapRuns = [...state.runs];
      const snapSnaps = [...state.snapshots];
      try {
        return await fn(bindTx());
      } catch (err) {
        state.runs = snapRuns;
        state.snapshots = snapSnaps;
        throw err;
      }
    },
    readRun: async (id) => {
      const run = state.runs.find((r) => r.id === id);
      if (!run) return null;
      const snapshots = state.snapshots.filter((s) => s.captureRunId === id);
      return {
        run: {
          ...run,
          expectedGameIds: run.expectedGameIds,
        },
        snapshots: snapshots.map((s) => ({
          id: s.id,
          gameId: s.gameId,
          predictionStatus: s.predictionStatus,
          qualificationStatus: s.qualificationStatus,
          v4ComparisonStatus: s.v4ComparisonStatus,
        })),
        closingCount: 0,
        evaluationCount: 0,
      };
    },
    countClosingSnapshots: async () => 0,
    countEvaluationResults: async () => 0,
  };

  return { adapter, state };
}

describe('canonical hashing', () => {
  it('hashes recursively key-sorted JSON stably', () => {
    const a = sha256CanonicalJson({ b: 1, a: { z: 2, y: [3, { k: 1, j: 0 }] } });
    const b = sha256CanonicalJson({ a: { y: [3, { j: 0, k: 1 }], z: 2 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(canonicalJsonString({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalizeJson({ b: 1, a: 2 })).toEqual({ a: 2, b: 1 });
  });

  it('pins model definition hash', () => {
    expect(SHADOW_MODEL_DEFINITION_ID).toBe('hybrid_v2_shadow_snapshot_v1');
    expect(sha256CanonicalJson(SHADOW_MODEL_DEFINITION_MANIFEST)).toBe(PINNED_MODEL_HASH);
    expect(SHADOW_MODEL_DEFINITION_HASH).toBe(PINNED_MODEL_HASH);
    expect(SHADOW_MODEL_DEFINITION_MANIFEST.weather.used).toBe(false);
  });

  it('pins policy definition hash', () => {
    expect(SHADOW_POLICY_DEFINITION_ID).toBe('core_eval_v1_shadow_policy_v1');
    expect(sha256CanonicalJson(SHADOW_POLICY_DEFINITION_MANIFEST)).toBe(PINNED_POLICY_HASH);
    expect(SHADOW_POLICY_DEFINITION_HASH).toBe(PINNED_POLICY_HASH);
    expect(SHADOW_POLICY_DEFINITION_MANIFEST.evaluationProtocol).toBe('CORE_EVAL_V1');
  });
});

describe('frozen Hybrid math alignment', () => {
  it('matches calculateHybridSpread 70/30 golden vector without weather', () => {
    const result = calculateHybridSpread(
      5,
      0,
      ZERO_GRADES,
      ZERO_GRADES,
      false,
      'home-team',
      'away-team',
      null
    );
    const v1 =
      5 - 0 + FROZEN_HYBRID_V2_MODEL_MATH.hybridHfaPoints;
    const v2 = FROZEN_HYBRID_V2_MODEL_MATH.hybridHfaPoints;
    const hybrid =
      v1 * FROZEN_HYBRID_V2_MODEL_MATH.v1Weight +
      v2 * FROZEN_HYBRID_V2_MODEL_MATH.v2Weight;
    expect(result.hybridSpreadHma).toBeCloseTo(hybrid, 10);
    expect(result.hybridSpreadHma).toBeCloseTo(6.0, 10);
    expect(SHADOW_WEATHER_STATE_UNUSED).toEqual({
      used: false,
      source: null,
      values: null,
    });
  });

  it('Core V1 comparison stays aligned with live production helper', () => {
    const live = liveCoreV1Hma({
      homeTeamId: 'any-team',
      homeRating: 5,
      awayRating: 0,
      neutralSite: false,
    });
    const writer = computeProductionCoreV1HmaFromV1Ratings({
      homeTeamId: 'any-team',
      homeRating: 5,
      awayRating: 0,
      neutralSite: false,
    });
    expect(writer).toBe(live);
    expect(writer).toBeCloseTo(5 - 0 + computeEffectiveHfa('any-team', false).effectiveHfa, 10);
  });
});

describe('capture context and confirmation', () => {
  it('validates capture_context conservatively', () => {
    expect(validateCaptureContext('friday_am').ok).toBe(true);
    expect(validateCaptureContext('manual_pre_kickoff').ok).toBe(true);
    expect(validateCaptureContext('Saturday').ok).toBe(false);
    expect(validateCaptureContext('').ok).toBe(false);
    expect(validateCaptureContext('-bad').ok).toBe(false);
  });

  it('builds exact COMMIT confirmation from week', () => {
    expect(expectedWriteConfirmation(1)).toBe('CAPTURE_2026_WEEK_1_SHADOW_V1');
    expect(expectedWriteConfirmation(12)).toBe('CAPTURE_2026_WEEK_12_SHADOW_V1');
  });
});

describe('inputs and unavailability', () => {
  it('treats persisted rating 0 as valid, not missing', () => {
    const g = game('g1');
    const snap = planShadowGameSnapshot({
      game: g,
      captureRunId: 'run',
      snapshotId: 's1',
      predictionTimestamp: NOW,
      ratingByTeam: new Map([
        [g.homeTeamId, rating(g.homeTeamId, 0)],
        [g.awayTeamId, rating(g.awayTeamId, 0)],
      ]),
      unitGradesByTeam: new Map([
        [g.homeTeamId, grades(g.homeTeamId)],
        [g.awayTeamId, grades(g.awayTeamId)],
      ]),
      marketLines: [homeMarket('g1', 2.5)],
      v4Bets: [],
    });
    expect(snap.homeV1Rating).toBe(0);
    expect(snap.predictionStatus).toBe('AVAILABLE');
    expect(snap.unavailableReasons).not.toContain('missing_rating');
  });

  it('missing rating -> unavailable', () => {
    const g = game('g1');
    const snap = planShadowGameSnapshot({
      game: g,
      captureRunId: 'run',
      snapshotId: 's1',
      predictionTimestamp: NOW,
      ratingByTeam: new Map([[g.awayTeamId, rating(g.awayTeamId, 1)]]),
      unitGradesByTeam: new Map([
        [g.homeTeamId, grades(g.homeTeamId)],
        [g.awayTeamId, grades(g.awayTeamId)],
      ]),
      marketLines: [homeMarket('g1', 6)],
      v4Bets: [],
    });
    expect(snap.predictionStatus).toBe('UNAVAILABLE');
    expect(snap.unavailableReasons).toContain('missing_rating');
  });

  it('missing unit grades -> unavailable', () => {
    const g = game('g1');
    const snap = planShadowGameSnapshot({
      game: g,
      captureRunId: 'run',
      snapshotId: 's1',
      predictionTimestamp: NOW,
      ratingByTeam: new Map([
        [g.homeTeamId, rating(g.homeTeamId, 5)],
        [g.awayTeamId, rating(g.awayTeamId, 0)],
      ]),
      unitGradesByTeam: new Map([[g.homeTeamId, grades(g.homeTeamId)]]),
      marketLines: [homeMarket('g1', 6)],
      v4Bets: [],
    });
    expect(snap.predictionStatus).toBe('UNAVAILABLE');
    expect(snap.unavailableReasons).toContain('missing_unit_grades');
  });

  it('post-kickoff -> unavailable', () => {
    const g = game('g1', { kickoffTimestamp: new Date(NOW.getTime() - 1000) });
    const plan = planShadowCaptureRun({
      season: 2026,
      week: 2,
      mode: 'PREVIEW',
      captureContext: 'friday_am',
      confirmation: '',
      repoCommitSha: 'a'.repeat(40),
      predictionTimestamp: NOW,
      frame: {
        ...availableFrame('g1', 6),
        games: [g],
        ratings: [rating(g.homeTeamId, 5), rating(g.awayTeamId, 0)],
        unitGrades: [grades(g.homeTeamId), grades(g.awayTeamId)],
        marketLines: [homeMarket('g1', 6)],
      },
    });
    expect(plan.snapshots[0].predictionStatus).toBe('UNAVAILABLE');
    expect(plan.snapshots[0].unavailableReasons).toContain('post_kickoff');
  });
});

describe('prediction market selector', () => {
  const base = {
    gameId: 'g1',
    homeTeamId: 'g1-home',
    awayTeamId: 'g1-away',
    predictionTimestamp: NOW,
  };

  it('never selects a future market; future-only is stale_market', () => {
    const result = selectPredictionMarket({
      ...base,
      rows: [
        homeMarket('g1', 6, {
          id: 'future',
          timestamp: new Date(NOW.getTime() + 1000),
        }),
      ],
    });
    expect(result.status).toBe('stale_market');
    expect(result.selected).toBeNull();
  });

  it('stale >30m market -> unavailable/stale', () => {
    const result = selectPredictionMarket({
      ...base,
      rows: [
        homeMarket('g1', 6, {
          timestamp: new Date(NOW.getTime() - 1801 * 1000),
        }),
      ],
    });
    expect(result.status).toBe('stale_market');
    expect(result.selected?.marketAgeSeconds).toBeGreaterThan(1800);
  });

  it('exactly 30m market is eligible', () => {
    const result = selectPredictionMarket({
      ...base,
      rows: [
        homeMarket('g1', 6, {
          timestamp: new Date(NOW.getTime() - 1800 * 1000),
        }),
      ],
    });
    expect(result.status).toBe('selected');
    expect(result.selected?.marketAgeSeconds).toBe(1800);
  });

  it('selects timestamp DESC', () => {
    const result = selectPredictionMarket({
      ...base,
      rows: [
        homeMarket('g1', 3, {
          id: 'older',
          timestamp: new Date(NOW.getTime() - 20 * 60 * 1000),
        }),
        homeMarket('g1', 7, {
          id: 'newer',
          timestamp: new Date(NOW.getTime() - 5 * 60 * 1000),
        }),
      ],
    });
    expect(result.selected?.selectedMarketLineId).toBe('newer');
    expect(result.selected?.predictionMarketHma).toBe(7);
  });

  it('same timestamp uses id DESC', () => {
    const ts = new Date(NOW.getTime() - 5 * 60 * 1000);
    const result = selectPredictionMarket({
      ...base,
      rows: [
        homeMarket('g1', 1, { id: 'aaa', timestamp: ts }),
        homeMarket('g1', 9, { id: 'zzz', timestamp: ts }),
      ],
    });
    expect(result.selected?.selectedMarketLineId).toBe('zzz');
  });

  it('skips a bad teamId row and takes the next usable row', () => {
    const result = selectPredictionMarket({
      ...base,
      rows: [
        homeMarket('g1', 9, {
          id: 'bad',
          teamId: 'other-team',
          timestamp: new Date(NOW.getTime() - 1 * 60 * 1000),
        }),
        homeMarket('g1', 4, {
          id: 'good',
          timestamp: new Date(NOW.getTime() - 2 * 60 * 1000),
        }),
      ],
    });
    expect(result.selected?.selectedMarketLineId).toBe('good');
  });

  it('home-row canonical HMA is -lineValue', () => {
    const result = selectPredictionMarket({
      ...base,
      rows: [homeMarket('g1', 6, { lineValue: -3.5, teamId: 'g1-home' })],
    });
    expect(result.selected?.predictionMarketHma).toBe(3.5);
  });

  it('away-row canonical HMA is +lineValue', () => {
    const result = selectPredictionMarket({
      ...base,
      rows: [
        homeMarket('g1', 6, {
          lineValue: 3.5,
          teamId: 'g1-away',
        }),
      ],
    });
    expect(result.selected?.predictionMarketHma).toBe(3.5);
  });
});

describe('selection, pick line, and qualification', () => {
  it('abs edge <0.1 -> NO_SELECTION', () => {
    expect(deriveShadowSelectedSide(0.09)).toBe('NO_SELECTION');
    expect(deriveShadowSelectedSide(-0.09)).toBe('NO_SELECTION');
    expect(deriveShadowSelectedSide(0)).toBe('NO_SELECTION');
  });

  it('+0.1 -> HOME and -0.1 -> AWAY', () => {
    expect(deriveShadowSelectedSide(0.1)).toBe('HOME');
    expect(deriveShadowSelectedSide(-0.1)).toBe('AWAY');
  });

  it('HOME pick line is -marketHma; AWAY pick line is +marketHma', () => {
    const home = planShadowCaptureRun({
      season: 2026,
      week: 2,
      mode: 'PREVIEW',
      captureContext: 'friday_am',
      confirmation: '',
      repoCommitSha: 'a'.repeat(40),
      predictionTimestamp: NOW,
      frame: availableFrame('g1', 4),
    });
    expect(home.snapshots[0].selectedSide).toBe('HOME');
    expect(home.snapshots[0].predictionPickLine).toBeCloseTo(-4, 10);
    expect(home.snapshots[0].selectedTeamId).toBe('g1-home');

    const away = planShadowCaptureRun({
      season: 2026,
      week: 2,
      mode: 'PREVIEW',
      captureContext: 'friday_am',
      confirmation: '',
      repoCommitSha: 'a'.repeat(40),
      predictionTimestamp: NOW,
      frame: availableFrame('g1', 8),
    });
    expect(away.snapshots[0].selectedSide).toBe('AWAY');
    expect(away.snapshots[0].predictionPickLine).toBeCloseTo(8, 10);
    expect(away.snapshots[0].selectedTeamId).toBe('g1-away');
  });

  it('NO_SELECTION remains AVAILABLE / NOT_QUALIFIED / false', () => {
    const plan = planShadowCaptureRun({
      season: 2026,
      week: 2,
      mode: 'PREVIEW',
      captureContext: 'friday_am',
      confirmation: '',
      repoCommitSha: 'a'.repeat(40),
      predictionTimestamp: NOW,
      frame: availableFrame('g1', 6),
    });
    const snap = plan.snapshots[0];
    expect(snap.selectedSide).toBe('NO_SELECTION');
    expect(snap.predictionStatus).toBe('AVAILABLE');
    expect(snap.qualificationStatus).toBe('NOT_QUALIFIED');
    expect(snap.isSuperTierA).toBe(false);
    expect(snap.selectedTeamId).toBeNull();
    expect(snap.predictionPickLine).toBeNull();
  });

  it('selection edge <4 is NOT_QUALIFIED independent of missing V4', () => {
    const plan = planShadowCaptureRun({
      season: 2026,
      week: 2,
      mode: 'PREVIEW',
      captureContext: 'friday_am',
      confirmation: '',
      repoCommitSha: 'a'.repeat(40),
      predictionTimestamp: NOW,
      frame: availableFrame('g1', 3),
    });
    const snap = plan.snapshots[0];
    expect(snap.absSpreadEdge).toBeCloseTo(3, 5);
    expect(snap.selectedSide).toBe('HOME');
    expect(snap.v4ComparisonStatus).toBe('PROVENANCE_UNAVAILABLE');
    expect(snap.qualificationStatus).toBe('NOT_QUALIFIED');
    expect(snap.isSuperTierA).toBe(false);
  });

  it('>=4 + opposite V4 -> hybrid_strong / QUALIFIED / true', () => {
    const q = qualifyShadowSnapshot({
      predictionStatus: 'AVAILABLE',
      selectedSide: 'HOME',
      absSpreadEdge: 4,
      v4ComparisonStatus: 'SIDE_AVAILABLE',
      v4ComparisonSide: 'AWAY',
    });
    expect(q).toMatchObject({
      hybridConflictType: 'hybrid_strong',
      qualificationStatus: 'QUALIFIED',
      isSuperTierA: true,
      tierBucket: 'super_tier_a',
    });
  });

  it('>=4 + same V4 -> hybrid_weak / NOT_QUALIFIED / false', () => {
    const q = qualifyShadowSnapshot({
      predictionStatus: 'AVAILABLE',
      selectedSide: 'HOME',
      absSpreadEdge: 4.2,
      v4ComparisonStatus: 'SIDE_AVAILABLE',
      v4ComparisonSide: 'HOME',
    });
    expect(q).toMatchObject({
      hybridConflictType: 'hybrid_weak',
      qualificationStatus: 'NOT_QUALIFIED',
      isSuperTierA: false,
      tierBucket: 'none',
    });
  });

  it('>=4 + V4 provenance unavailable -> qualification UNAVAILABLE / null', () => {
    const q = qualifyShadowSnapshot({
      predictionStatus: 'AVAILABLE',
      selectedSide: 'AWAY',
      absSpreadEdge: 5,
      v4ComparisonStatus: 'PROVENANCE_UNAVAILABLE',
      v4ComparisonSide: null,
    });
    expect(q.qualificationStatus).toBe('UNAVAILABLE');
    expect(q.isSuperTierA).toBeNull();
    expect(q.hybridConflictType).toBeNull();
    expect(q.tierBucket).toBeNull();
    expect(q.qualificationReasons).toContain('missing_v4_provenance');
  });

  it('no V4 row does NOT become VERIFIED_NO_SELECTION', () => {
    const v4 = resolveV4Comparison({
      rows: [],
      gameId: 'g1',
      predictionTimestamp: NOW,
    });
    expect(v4.v4ComparisonStatus).toBe('PROVENANCE_UNAVAILABLE');
    expect(v4.v4ComparisonSide).toBeNull();
  });
});

describe('run invariants', () => {
  it('reconciles available/unavailable/qualification/v4 counts', () => {
    const plan = planShadowCaptureRun({
      season: 2026,
      week: 2,
      mode: 'PREVIEW',
      captureContext: 'friday_am',
      confirmation: '',
      repoCommitSha: 'a'.repeat(40),
      predictionTimestamp: NOW,
      frame: {
        games: [game('g1'), game('g2')],
        ratings: [
          rating('g1-home', 5),
          rating('g1-away', 0),
          rating('g2-home', 5),
        ],
        unitGrades: [
          grades('g1-home'),
          grades('g1-away'),
          grades('g2-home'),
          grades('g2-away'),
        ],
        marketLines: [homeMarket('g1', 6)],
        v4Bets: [],
      },
    });
    expect(plan.ok).toBe(true);
    expect(plan.counts.totalGames).toBe(2);
    expect(
      plan.counts.hybridAvailableCount + plan.counts.hybridUnavailableCount
    ).toBe(2);
    expect(
      plan.counts.qualificationQualifiedCount +
        plan.counts.qualificationNotQualifiedCount +
        plan.counts.qualificationUnavailableCount
    ).toBe(2);
    expect(
      plan.counts.v4SideAvailableCount +
        plan.counts.v4VerifiedNoSelectionCount +
        plan.counts.v4ProvenanceUnavailableCount
    ).toBe(2);
    expect(plan.counts.v4VerifiedNoSelectionCount).toBe(0);
  });

  it('frame mismatch fails', () => {
    const blockers = reconcileShadowRunCounts(
      deriveShadowRunCounts([]),
      [{ gameId: 'g1' }],
      ['g2']
    );
    expect(blockers).toContain('frame_mismatch');
  });

  it('duplicate game snapshot fails', () => {
    const blockers = reconcileShadowRunCounts(
      {
        totalGames: 2,
        hybridAvailableCount: 2,
        hybridUnavailableCount: 0,
        qualificationQualifiedCount: 0,
        qualificationNotQualifiedCount: 2,
        qualificationUnavailableCount: 0,
        v4SideAvailableCount: 0,
        v4VerifiedNoSelectionCount: 0,
        v4ProvenanceUnavailableCount: 2,
      },
      [{ gameId: 'g1' }, { gameId: 'g1' }],
      ['g1', 'g2']
    );
    expect(blockers).toContain('duplicate_game_snapshot');
  });
});

describe('existing cohort and atomic commit', () => {
  it('existing valid COMPLETE cohort is an idempotent no-op', async () => {
    const existing: ExistingShadowCohort = {
      run: {
        id: 'run-1',
        status: 'COMPLETE',
        season: 2026,
        week: 2,
        evaluationProtocol: 'CORE_EVAL_V1',
        captureContext: 'friday_am',
        modelDefinitionId: SHADOW_MODEL_DEFINITION_ID,
        modelDefinitionHash: PINNED_MODEL_HASH,
        policyDefinitionId: SHADOW_POLICY_DEFINITION_ID,
        policyDefinitionHash: PINNED_POLICY_HASH,
        expectedGameIds: ['g1'],
        totalGames: 1,
        hybridAvailableCount: 1,
        hybridUnavailableCount: 0,
        qualificationQualifiedCount: 0,
        qualificationNotQualifiedCount: 1,
        qualificationUnavailableCount: 0,
        v4SideAvailableCount: 0,
        v4VerifiedNoSelectionCount: 0,
        v4ProvenanceUnavailableCount: 1,
      },
      snapshots: [
        {
          id: 's1',
          gameId: 'g1',
          predictionStatus: 'AVAILABLE',
          qualificationStatus: 'NOT_QUALIFIED',
          v4ComparisonStatus: 'PROVENANCE_UNAVAILABLE',
        },
      ],
      closingCount: 0,
      evaluationCount: 0,
    };
    expect(validateExistingCompleteCohort(existing)).toEqual([]);
    const { adapter, state } = createMemoryAdapter({
      frame: availableFrame('g1', 6),
      existing,
    });
    const result = await executeShadowCapture({
      season: 2026,
      week: 2,
      mode: 'COMMIT',
      captureContext: 'friday_am',
      confirmation: expectedWriteConfirmation(2),
      repoCommitSha: 'a'.repeat(40),
      adapter,
    });
    expect(result.execution.transactionalIdempotentNoOp).toBe(true);
    expect(result.execution.mutationsInvoked).toBe(false);
    expect(state.runs).toHaveLength(0);
    expect(state.snapshots).toHaveLength(0);
  });

  it('existing malformed/non-COMPLETE cohort fails closed', async () => {
    const existing: ExistingShadowCohort = {
      run: {
        id: 'run-bad',
        status: 'FAILED',
        season: 2026,
        week: 2,
        evaluationProtocol: 'CORE_EVAL_V1',
        captureContext: 'friday_am',
        modelDefinitionId: SHADOW_MODEL_DEFINITION_ID,
        modelDefinitionHash: PINNED_MODEL_HASH,
        policyDefinitionId: SHADOW_POLICY_DEFINITION_ID,
        policyDefinitionHash: PINNED_POLICY_HASH,
        expectedGameIds: ['g1'],
        totalGames: 1,
        hybridAvailableCount: 1,
        hybridUnavailableCount: 0,
        qualificationQualifiedCount: 0,
        qualificationNotQualifiedCount: 1,
        qualificationUnavailableCount: 0,
        v4SideAvailableCount: 0,
        v4VerifiedNoSelectionCount: 0,
        v4ProvenanceUnavailableCount: 1,
      },
      snapshots: [],
      closingCount: 0,
      evaluationCount: 0,
    };
    expect(existing.run.status).toBe('FAILED');
    expect(validateExistingCompleteCohort(existing)).toContain(
      'existing_cohort_not_complete'
    );
    const { adapter, state } = createMemoryAdapter({
      frame: availableFrame('g1', 6),
      existing,
    });
    const result = await executeShadowCapture({
      season: 2026,
      week: 2,
      mode: 'COMMIT',
      captureContext: 'friday_am',
      confirmation: expectedWriteConfirmation(2),
      repoCommitSha: 'a'.repeat(40),
      adapter,
    });
    expect({
      writeSafe: result.plan.writeSafe,
      blockers: result.plan.writeBlockers,
      existingCohort: result.report.existingCohort,
      noop: result.execution.transactionalIdempotentNoOp,
      mutationsInvoked: result.execution.mutationsInvoked,
    }).toEqual(
      expect.objectContaining({
        writeSafe: false,
        existingCohort: 'malformed',
        mutationsInvoked: false,
      })
    );
    expect(state.runs).toHaveLength(0);
  });

  it('PREVIEW mutation count is 0', async () => {
    const { adapter, state } = createMemoryAdapter({
      frame: availableFrame('g1', 6),
    });
    const result = await executeShadowCapture({
      season: 2026,
      week: 2,
      mode: 'PREVIEW',
      captureContext: 'friday_am',
      confirmation: '',
      repoCommitSha: 'a'.repeat(40),
      adapter,
    });
    expect(result.execution.mutationsInvoked).toBe(false);
    expect(result.report.mutationsInvoked).toBe(false);
    expect(result.report.providerCalls).toBe(0);
    expect(state.runs).toHaveLength(0);
    expect(state.snapshots).toHaveLength(0);
    expect(result.report.previewTimestampWillNotBecomeCommitTimestamp).toBe(true);
    expect(result.report.counts.totalGames).toBe(1);
    expect(result.report.counts.hybridAvailableCount).toBe(1);
    expect(result.report.counts.hybridUnavailableCount).toBe(0);
    expect(result.report.counts.qualificationNotQualifiedCount).toBe(1);
    expect(result.report.counts.v4ProvenanceUnavailableCount).toBe(1);
    expect(result.report.counts.v4VerifiedNoSelectionCount).toBe(0);
  });

  it('transaction failure leaves no partial run', async () => {
    const { adapter, state } = createMemoryAdapter({
      frame: availableFrame('g1', 6),
      failAfterCreateRun: true,
    });
    const result = await executeShadowCapture({
      season: 2026,
      week: 2,
      mode: 'COMMIT',
      captureContext: 'friday_am',
      confirmation: expectedWriteConfirmation(2),
      repoCommitSha: 'a'.repeat(40),
      adapter,
    });
    expect(result.execution.rolledBack).toBe(true);
    expect(state.runs).toHaveLength(0);
    expect(state.snapshots).toHaveLength(0);
  });
});
