/**
 * Shadow Model Capture V1 — generic engine + Core V1 baseline tests.
 * No network. No DB. No production capture.
 */

import * as fs from 'fs';
import * as path from 'path';
import { computeEffectiveHfa } from '@/lib/core-v1-spread';
import { computeProductionCoreV1HmaFromV1Ratings } from '@/lib/shadow-snapshot-v1';
import {
  SHADOW_MODEL_ALLOWLIST,
  canonicalJsonString,
  sha256CanonicalJson,
  selectSpreadPredictionMarket,
  planShadowModelCaptureRun,
  executeShadowModelCapture,
  expectedShadowModelWriteConfirmation,
  validateCaptureContext,
  teamSidedPickValue,
  MAX_SHADOW_MODEL_MARKET_AGE_MS,
  type ExistingShadowModelCohort,
  type OperationalShadowModelFrame,
  type PlannedShadowModelCaptureRun,
  type PlannedShadowModelPrediction,
  type ShadowModelCapturePersistence,
  type ShadowModelMutationTx,
} from '@/lib/shadow-model-capture-v1';
import {
  CORE_V1_SHADOW_BASELINE_MODEL_ID,
  CORE_V1_SHADOW_BASELINE_MODEL_HASH,
  CORE_V1_SHADOW_BASELINE_MODEL_MANIFEST,
  CORE_V1_SHADOW_FEATURE_DEFINITION_HASH,
  CORE_V1_SHADOW_FEATURE_DEFINITION_MANIFEST,
  CORE_V1_SHADOW_POLICY_DEFINITION_HASH,
  CORE_V1_SHADOW_POLICY_DEFINITION_MANIFEST,
  computeCoreV1ShadowBaselineHma,
  createCoreV1ShadowBaselineDefinition,
} from '@/lib/shadow-models/core-v1-shadow-baseline-v1';

const NOW = new Date('2026-09-13T16:00:00.000Z');
const KICKOFF = new Date('2026-09-13T19:00:00.000Z');

function rating(teamId: string, value: number) {
  return {
    teamId,
    season: 2026,
    modelVersion: 'v1',
    powerRating: value,
    rating: value,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  };
}

function baseFrame(extra: Partial<OperationalShadowModelFrame> = {}): OperationalShadowModelFrame {
  return {
    games: [
      {
        id: 'g1',
        season: 2026,
        week: 3,
        homeTeamId: 'home',
        awayTeamId: 'away',
        kickoffTimestamp: KICKOFF,
        neutralSite: false,
      },
    ],
    ratings: [rating('home', 10), rating('away', 5)],
    marketLines: [
      {
        id: 'ml1',
        gameId: 'g1',
        lineType: 'spread',
        lineValue: -3.5,
        teamId: 'home',
        bookName: 'book-a',
        source: 'oddsapi',
        timestamp: new Date('2026-09-13T15:50:00.000Z'),
      },
    ],
    ...extra,
  };
}

function memoryPersistence(options: {
  frame: OperationalShadowModelFrame;
  existing?: ExistingShadowModelCohort | null;
  now?: () => Date;
  failCreate?: boolean;
}): {
  persistence: ShadowModelCapturePersistence;
  store: {
    runs: PlannedShadowModelCaptureRun[];
    predictions: PlannedShadowModelPrediction[];
    createCalls: number;
  };
} {
  const store = {
    runs: [] as PlannedShadowModelCaptureRun[],
    predictions: [] as PlannedShadowModelPrediction[],
    createCalls: 0,
  };
  let existing = options.existing ?? null;
  const clock = options.now ?? (() => NOW);

  const toExisting = (): ExistingShadowModelCohort | null => {
    if (existing) return existing;
    if (store.runs.length === 0) return null;
    const run = store.runs[0];
    return {
      run: {
        id: run.id,
        status: run.status,
        season: run.season,
        week: run.week,
        evaluationProtocol: run.evaluationProtocol,
        captureContext: run.captureContext,
        modelDefinitionId: run.modelDefinitionId,
        modelDefinitionHash: run.modelDefinitionHash,
        featureDefinitionId: run.featureDefinitionId,
        featureDefinitionHash: run.featureDefinitionHash,
        policyDefinitionId: run.policyDefinitionId,
        policyDefinitionHash: run.policyDefinitionHash,
        expectedGameIds: run.expectedGameIds,
        totalGames: run.totalGames,
        availableCount: run.availableCount,
        unavailableCount: run.unavailableCount,
        selectionCount: run.selectionCount,
        noSelectionCount: run.noSelectionCount,
      },
      predictions: store.predictions.map((p) => ({
        id: p.id,
        gameId: p.gameId,
        predictionStatus: p.predictionStatus,
        selectedSide: p.selectedSide,
      })),
    };
  };

  const bindTx = (): ShadowModelMutationTx => ({
    findCohort: async () => toExisting(),
    loadFrame: async () => options.frame,
    now: clock,
    createRun: async (run) => {
      store.createCalls += 1;
      if (options.failCreate) throw new Error('forced_create_failure');
      store.runs.push(run);
    },
    createPredictions: async (rows) => {
      if (options.failCreate) throw new Error('forced_create_failure');
      store.predictions.push(...rows);
      return rows.length;
    },
    countPredictions: async (captureRunId) =>
      store.predictions.filter((p) => p.captureRunId === captureRunId).length,
  });

  return {
    store,
    persistence: {
      now: clock,
      createId: () => `id-${store.createCalls}-${store.predictions.length}-${Math.random()}`,
      findCohort: async () => toExisting(),
      loadFrame: async () => options.frame,
      runTransaction: async (fn) => fn(bindTx()),
      readRun: async (id) => {
        const found = toExisting();
        if (!found || found.run.id !== id) return null;
        return found;
      },
      countOfficialBetsTouched: async () => 0,
    },
  };
}

describe('Shadow Model Capture V1 — definition hashes', () => {
  it('model-definition hash is deterministic', () => {
    expect(CORE_V1_SHADOW_BASELINE_MODEL_HASH).toBe(
      sha256CanonicalJson(CORE_V1_SHADOW_BASELINE_MODEL_MANIFEST)
    );
    expect(CORE_V1_SHADOW_BASELINE_MODEL_HASH).toBe(
      sha256CanonicalJson(JSON.parse(canonicalJsonString(CORE_V1_SHADOW_BASELINE_MODEL_MANIFEST)))
    );
  });

  it('feature-definition hash is deterministic', () => {
    expect(CORE_V1_SHADOW_FEATURE_DEFINITION_HASH).toBe(
      sha256CanonicalJson(CORE_V1_SHADOW_FEATURE_DEFINITION_MANIFEST)
    );
  });

  it('policy-definition hash is deterministic', () => {
    expect(CORE_V1_SHADOW_POLICY_DEFINITION_HASH).toBe(
      sha256CanonicalJson(CORE_V1_SHADOW_POLICY_DEFINITION_MANIFEST)
    );
  });

  it('allowlist contains only core_v1_shadow_baseline_v1 in this PR', () => {
    expect(SHADOW_MODEL_ALLOWLIST).toEqual([CORE_V1_SHADOW_BASELINE_MODEL_ID]);
  });
});

describe('Shadow Model Capture V1 — Core adapter parity', () => {
  const model = createCoreV1ShadowBaselineDefinition();

  it('Core adapter parity with production Core V1 calculation', () => {
    const viaAdapter = computeCoreV1ShadowBaselineHma({
      homeTeamId: 'alabama',
      homeRating: 12.5,
      awayRating: 4.25,
      neutralSite: false,
    });
    const viaHybridHelper = computeProductionCoreV1HmaFromV1Ratings({
      homeTeamId: 'alabama',
      homeRating: 12.5,
      awayRating: 4.25,
      neutralSite: false,
    });
    const viaEffectiveHfa =
      12.5 - 4.25 + computeEffectiveHfa('alabama', false).effectiveHfa;
    expect(viaAdapter).toBeCloseTo(viaHybridHelper, 12);
    expect(viaAdapter).toBeCloseTo(viaEffectiveHfa, 12);
  });

  it('selection-side / team-sided line sign semantics', () => {
    const plan = planShadowModelCaptureRun({
      season: 2026,
      week: 3,
      mode: 'PREVIEW',
      captureContext: 'parity_check',
      confirmation: '',
      repoCommitSha: 'a'.repeat(40),
      predictionTimestamp: NOW,
      frame: baseFrame(),
      model,
      createId: () => 'fixed-id',
    });
    expect(plan.ok).toBe(true);
    const row = plan.predictions[0];
    // model 10-5+HFA vs market HMA +3.5 => home edge positive
    expect(row.predictionStatus).toBe('AVAILABLE');
    expect(row.selectedSide).toBe('HOME');
    expect(row.selectedTeamId).toBe('home');
    expect(row.canonicalMarketValue).toBeCloseTo(3.5, 10);
    expect(row.predictionPickValue).toBeCloseTo(teamSidedPickValue(true, 3.5), 10);
    expect(row.predictionPickValue).toBeCloseTo(-3.5, 10);
  });
});

describe('Shadow Model Capture V1 — market and eligibility guards', () => {
  const model = createCoreV1ShadowBaselineDefinition();

  it('no post-kick capture', () => {
    const plan = planShadowModelCaptureRun({
      season: 2026,
      week: 3,
      mode: 'PREVIEW',
      captureContext: 'post_kick',
      confirmation: '',
      repoCommitSha: 'a'.repeat(40),
      predictionTimestamp: new Date('2026-09-13T20:00:00.000Z'),
      frame: baseFrame(),
      model,
    });
    expect(plan.predictions[0].predictionStatus).toBe('UNAVAILABLE');
    expect(plan.predictions[0].unavailableReasons).toContain('post_kickoff');
  });

  it('market timestamp cannot exceed prediction timestamp', () => {
    const result = selectSpreadPredictionMarket({
      rows: [
        {
          id: 'future',
          gameId: 'g1',
          lineType: 'spread',
          lineValue: -3,
          teamId: 'home',
          bookName: 'b',
          source: 'oddsapi',
          timestamp: new Date('2026-09-13T16:05:00.000Z'),
        },
      ],
      gameId: 'g1',
      homeTeamId: 'home',
      awayTeamId: 'away',
      predictionTimestamp: NOW,
    });
    expect(result.status).toBe('stale_market');
  });

  it('market age >1800 seconds becomes unavailable', () => {
    const plan = planShadowModelCaptureRun({
      season: 2026,
      week: 3,
      mode: 'PREVIEW',
      captureContext: 'stale_market',
      confirmation: '',
      repoCommitSha: 'a'.repeat(40),
      predictionTimestamp: NOW,
      frame: baseFrame({
        marketLines: [
          {
            id: 'old',
            gameId: 'g1',
            lineType: 'spread',
            lineValue: -3.5,
            teamId: 'home',
            bookName: 'book-a',
            source: 'oddsapi',
            timestamp: new Date(NOW.getTime() - MAX_SHADOW_MODEL_MARKET_AGE_MS - 1000),
          },
        ],
      }),
      model,
    });
    expect(plan.predictions[0].unavailableReasons).toContain('stale_market');
  });

  it('missing rating becomes unavailable', () => {
    const plan = planShadowModelCaptureRun({
      season: 2026,
      week: 3,
      mode: 'PREVIEW',
      captureContext: 'missing_rating',
      confirmation: '',
      repoCommitSha: 'a'.repeat(40),
      predictionTimestamp: NOW,
      frame: baseFrame({ ratings: [rating('home', 10)] }),
      model,
    });
    expect(plan.predictions[0].unavailableReasons).toContain('missing_rating');
  });

  it('missing market becomes unavailable', () => {
    const plan = planShadowModelCaptureRun({
      season: 2026,
      week: 3,
      mode: 'PREVIEW',
      captureContext: 'missing_market',
      confirmation: '',
      repoCommitSha: 'a'.repeat(40),
      predictionTimestamp: NOW,
      frame: baseFrame({ marketLines: [] }),
      model,
    });
    expect(plan.predictions[0].unavailableReasons).toContain('missing_market');
  });
});

describe('Shadow Model Capture V1 — append-only runtime guarantees', () => {
  const model = createCoreV1ShadowBaselineDefinition();

  it('identical retry is deterministic no-op', async () => {
    const { persistence, store } = memoryPersistence({ frame: baseFrame() });
    const first = await executeShadowModelCapture({
      season: 2026,
      week: 3,
      mode: 'COMMIT',
      captureContext: 'retry_same',
      confirmation: expectedShadowModelWriteConfirmation(3, CORE_V1_SHADOW_BASELINE_MODEL_ID),
      repoCommitSha: 'a'.repeat(40),
      model,
      persistence,
    });
    expect(first.execution.commitSucceeded).toBe(true);
    expect(store.runs).toHaveLength(1);

    const second = await executeShadowModelCapture({
      season: 2026,
      week: 3,
      mode: 'COMMIT',
      captureContext: 'retry_same',
      confirmation: expectedShadowModelWriteConfirmation(3, CORE_V1_SHADOW_BASELINE_MODEL_ID),
      repoCommitSha: 'a'.repeat(40),
      model,
      persistence,
    });
    expect(second.execution.transactionalIdempotentNoOp).toBe(true);
    expect(second.execution.mutationsInvoked).toBe(false);
    expect(store.runs).toHaveLength(1);
  });

  it('conflicting retry fails closed', async () => {
    const malformed: ExistingShadowModelCohort = {
      run: {
        id: 'bad',
        status: 'COMPLETE',
        season: 2026,
        week: 3,
        evaluationProtocol: 'CORE_EVAL_V1',
        captureContext: 'conflict',
        modelDefinitionId: CORE_V1_SHADOW_BASELINE_MODEL_ID,
        modelDefinitionHash: CORE_V1_SHADOW_BASELINE_MODEL_HASH,
        featureDefinitionId: 'core_v1_ratings_hfa_v1',
        featureDefinitionHash: CORE_V1_SHADOW_FEATURE_DEFINITION_HASH,
        policyDefinitionId: 'core_v1_shadow_baseline_policy_v1',
        policyDefinitionHash: CORE_V1_SHADOW_POLICY_DEFINITION_HASH,
        expectedGameIds: ['g1'],
        totalGames: 1,
        availableCount: 1,
        unavailableCount: 0,
        selectionCount: 1,
        noSelectionCount: 0,
      },
      predictions: [],
    };
    const { persistence } = memoryPersistence({
      frame: baseFrame(),
      existing: malformed,
    });
    const result = await executeShadowModelCapture({
      season: 2026,
      week: 3,
      mode: 'COMMIT',
      captureContext: 'conflict',
      confirmation: expectedShadowModelWriteConfirmation(3, CORE_V1_SHADOW_BASELINE_MODEL_ID),
      repoCommitSha: 'a'.repeat(40),
      model,
      persistence,
    });
    expect(result.plan.writeSafe).toBe(false);
    expect(result.execution.mutationsInvoked).toBe(false);
    expect(result.execution.error).toContain('existing_cohort_malformed');
  });

  it('full-run atomicity rolls back on create failure', async () => {
    const { persistence, store } = memoryPersistence({
      frame: baseFrame(),
      failCreate: true,
    });
    const result = await executeShadowModelCapture({
      season: 2026,
      week: 3,
      mode: 'COMMIT',
      captureContext: 'atomic',
      confirmation: expectedShadowModelWriteConfirmation(3, CORE_V1_SHADOW_BASELINE_MODEL_ID),
      repoCommitSha: 'a'.repeat(40),
      model,
      persistence,
    });
    expect(result.execution.rolledBack).toBe(true);
    expect(store.runs).toHaveLength(0);
    expect(store.predictions).toHaveLength(0);
  });

  it('PREVIEW invokes zero mutations', async () => {
    const { persistence, store } = memoryPersistence({ frame: baseFrame() });
    const result = await executeShadowModelCapture({
      season: 2026,
      week: 3,
      mode: 'PREVIEW',
      captureContext: 'preview_only',
      confirmation: '',
      repoCommitSha: 'a'.repeat(40),
      model,
      persistence,
    });
    expect(result.execution.mutationsInvoked).toBe(false);
    expect(result.report.mutationsInvoked).toBe(false);
    expect(store.createCalls).toBe(0);
    expect(store.runs).toHaveLength(0);
  });

  it('no official Bet writes', async () => {
    const { persistence } = memoryPersistence({ frame: baseFrame() });
    const result = await executeShadowModelCapture({
      season: 2026,
      week: 3,
      mode: 'COMMIT',
      captureContext: 'no_bets',
      confirmation: expectedShadowModelWriteConfirmation(3, CORE_V1_SHADOW_BASELINE_MODEL_ID),
      repoCommitSha: 'a'.repeat(40),
      model,
      persistence,
    });
    expect(result.execution.betWrites).toBe(false);
    expect(result.report.betWrites).toBe(false);
    expect(result.report.hybridShadowWrites).toBe(false);
  });
});

describe('Shadow Model Capture V1 — Hybrid Snapshot V1 unchanged + append-only SQL', () => {
  it('existing Hybrid Snapshot V1 behavior remains unchanged (pinned hashes)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const hybrid = require('@/lib/shadow-snapshot-v1') as {
      SHADOW_MODEL_DEFINITION_HASH: string;
      SHADOW_POLICY_DEFINITION_HASH: string;
      SHADOW_MODEL_DEFINITION_ID: string;
    };
    expect(hybrid.SHADOW_MODEL_DEFINITION_ID).toBe('hybrid_v2_shadow_snapshot_v1');
    expect(hybrid.SHADOW_MODEL_DEFINITION_HASH).toBe(
      '1532c6440a0751317e74606c648201d104de03acaec4bf2ee31a6d3d0d3d6104'
    );
    expect(hybrid.SHADOW_POLICY_DEFINITION_HASH).toBe(
      'f770f9eb3abe7bac8f6d2ed30d435063facc344a2381e56c471d4f428c1b7d52'
    );
  });

  it('append-only update/delete protections exist in migration SQL', () => {
    const sqlPath = path.resolve(
      __dirname,
      '../../../prisma/migrations/20260913120000_add_shadow_model_capture_v1/migration.sql'
    );
    const sql = fs.readFileSync(sqlPath, 'utf8');
    expect(sql).toContain('shadow_model_capture_v1_reject_mutation');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON "shadow_model_capture_runs"');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON "shadow_model_predictions"');
    expect(sql).not.toContain('shadow_capture_runs');
    expect(sql).not.toContain('shadow_prediction_snapshots');
  });

  it('capture_context validation and confirmation include model id', () => {
    expect(validateCaptureContext('ok_ctx').ok).toBe(true);
    expect(validateCaptureContext('BAD').ok).toBe(false);
    expect(expectedShadowModelWriteConfirmation(4, CORE_V1_SHADOW_BASELINE_MODEL_ID)).toBe(
      'CAPTURE_2026_WEEK_4_SHADOW_MODEL_core_v1_shadow_baseline_v1'
    );
  });
});
