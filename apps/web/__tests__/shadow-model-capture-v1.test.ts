/**
 * Shadow Model Capture V1 — generic engine + Core V1 baseline tests.
 * No network. No DB. No production capture.
 */

import * as fs from 'fs';
import * as path from 'path';
import { LIVE_ODDS_SOURCE } from '@/lib/core-v1-weekly-card';
import { computeEffectiveHfa } from '@/lib/core-v1-spread';
import { pickDisplaySpread, selectBookSpreadSnapshots } from '@/lib/market-line-snapshot';
import { computeProductionCoreV1HmaFromV1Ratings } from '@/lib/shadow-snapshot-v1';
import {
  SHADOW_MODEL_ALLOWLIST,
  UNAVAILABLE_REASON_ORDER,
  canonicalJsonString,
  sha256CanonicalJson,
  selectAuthorizedCoherentSpreadMarket,
  planShadowModelCaptureRun,
  executeShadowModelCapture,
  expectedShadowModelWriteConfirmation,
  validateCaptureContext,
  fingerprintOfficialFlat100BetRows,
  MAX_SHADOW_MODEL_MARKET_AGE_MS,
  type ExistingShadowModelCohort,
  type OperationalShadowModelFrame,
  type PlannedShadowModelCaptureRun,
  type PlannedShadowModelPrediction,
  type ShadowModelCapturePersistence,
  type ShadowModelDefinition,
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
const MARKET_TS = new Date('2026-09-13T15:50:00.000Z');
const REPO_SHA = 'a'.repeat(40);

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

function coherentOddsApiPair(extra: {
  homeId?: string;
  awayId?: string;
  book?: string;
  timestamp?: Date;
  homeLine?: number;
  awayLine?: number;
  source?: string;
} = {}) {
  const ts = extra.timestamp ?? MARKET_TS;
  const homeLine = extra.homeLine ?? -3.5;
  const awayLine = extra.awayLine ?? 3.5;
  const book = extra.book ?? 'book-a';
  const source = extra.source ?? LIVE_ODDS_SOURCE;
  return [
    {
      id: extra.homeId ?? 'ml-home',
      gameId: 'g1',
      lineType: 'spread',
      lineValue: homeLine,
      teamId: 'home',
      bookName: book,
      source,
      timestamp: ts,
    },
    {
      id: extra.awayId ?? 'ml-away',
      gameId: 'g1',
      lineType: 'spread',
      lineValue: awayLine,
      teamId: 'away',
      bookName: book,
      source,
      timestamp: ts,
    },
  ];
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
    marketLines: coherentOddsApiPair(),
    ...extra,
  };
}

function memoryPersistence(options: {
  frame: OperationalShadowModelFrame;
  existing?: ExistingShadowModelCohort | null;
  now?: () => Date;
  failCreate?: boolean;
  betFingerprint?: { value: string };
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
  const betFingerprint = options.betFingerprint ?? { value: 'stable-bet-fingerprint' };

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
        repoCommitSha: run.repoCommitSha,
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
      fingerprintOfficialFlat100Bets: async () => betFingerprint.value,
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

  it('keeps Core unavailable-reason order and inserts team_feature_vector_unavailable before markets', () => {
    expect(UNAVAILABLE_REASON_ORDER).toEqual([
      'post_kickoff',
      'missing_rating',
      'rating_provenance_unavailable',
      'team_feature_vector_unavailable',
      'missing_market',
      'incoherent_market',
      'stale_market',
      'invalid_model_output',
      'market_selector_unimplemented',
    ]);
  });
});

describe('Shadow Model Capture V1 — Core coherent market parity', () => {
  const model = createCoreV1ShadowBaselineDefinition();

  it('lone home/away row is not treated as a coherent official-style spread', () => {
    const loneHome = selectAuthorizedCoherentSpreadMarket({
      rows: [coherentOddsApiPair()[0]],
      gameId: 'g1',
      homeTeamId: 'home',
      awayTeamId: 'away',
      predictionTimestamp: NOW,
    });
    expect(loneHome.status).toBe('incoherent_market');

    const loneAway = selectAuthorizedCoherentSpreadMarket({
      rows: [coherentOddsApiPair()[1]],
      gameId: 'g1',
      homeTeamId: 'home',
      awayTeamId: 'away',
      predictionTimestamp: NOW,
    });
    expect(loneAway.status).toBe('incoherent_market');
  });

  it('incoherent pair fails closed', () => {
    const result = selectAuthorizedCoherentSpreadMarket({
      rows: coherentOddsApiPair({ homeLine: -3.5, awayLine: 4.0 }),
      gameId: 'g1',
      homeTeamId: 'home',
      awayTeamId: 'away',
      predictionTimestamp: NOW,
    });
    expect(result.status).toBe('incoherent_market');
  });

  it('newer non-oddsapi data cannot override authorized live-odds data', () => {
    const rows = [
      ...coherentOddsApiPair({
        homeId: 'odds-home',
        awayId: 'odds-away',
        homeLine: -3.5,
        awayLine: 3.5,
        timestamp: new Date('2026-09-13T15:40:00.000Z'),
      }),
      ...coherentOddsApiPair({
        homeId: 'other-home',
        awayId: 'other-away',
        book: 'book-b',
        source: 'not-oddsapi',
        homeLine: -10,
        awayLine: 10,
        timestamp: new Date('2026-09-13T15:55:00.000Z'),
      }),
    ];
    const result = selectAuthorizedCoherentSpreadMarket({
      rows,
      gameId: 'g1',
      homeTeamId: 'home',
      awayTeamId: 'away',
      predictionTimestamp: NOW,
    });
    expect(result.status).toBe('selected');
    expect(result.selected?.canonicalMarketValue).toBeCloseTo(3.5, 10);
    expect(result.selected?.marketSource).toBe(LIVE_ODDS_SOURCE);
    expect(result.selected?.homeRowId).toBe('odds-home');
  });

  it('latest eligible coherent pair is selected deterministically', () => {
    const older = coherentOddsApiPair({
      homeId: 'old-home',
      awayId: 'old-away',
      book: 'book-a',
      homeLine: -1,
      awayLine: 1,
      timestamp: new Date('2026-09-13T15:30:00.000Z'),
    });
    const newer = coherentOddsApiPair({
      homeId: 'new-home',
      awayId: 'new-away',
      book: 'book-b',
      homeLine: -7,
      awayLine: 7,
      timestamp: new Date('2026-09-13T15:55:00.000Z'),
    });
    const result = selectAuthorizedCoherentSpreadMarket({
      rows: [...older, ...newer],
      gameId: 'g1',
      homeTeamId: 'home',
      awayTeamId: 'away',
      predictionTimestamp: NOW,
    });
    expect(result.status).toBe('selected');
    expect(result.selected?.homeRowId).toBe('new-home');
    expect(result.selected?.canonicalMarketValue).toBeCloseTo(7, 10);
  });

  it('same-timestamp tie behavior matches existing selector behavior', () => {
    const rows = [
      ...coherentOddsApiPair({
        homeId: 'aaa-home',
        awayId: 'aaa-away',
        book: 'book-a',
        homeLine: -2,
        awayLine: 2,
      }),
      ...coherentOddsApiPair({
        homeId: 'zzz-home',
        awayId: 'zzz-away',
        book: 'book-z',
        homeLine: -9,
        awayLine: 9,
      }),
    ];
    const observations = rows.map((r) => ({
      id: r.id,
      gameId: r.gameId,
      lineType: r.lineType,
      lineValue: r.lineValue,
      bookName: r.bookName ?? '',
      timestamp: r.timestamp,
      teamId: r.teamId,
      source: r.source,
    }));
    const { snapshots } = selectBookSpreadSnapshots(observations, 'home', 'away');
    const expected = pickDisplaySpread(snapshots);
    const result = selectAuthorizedCoherentSpreadMarket({
      rows,
      gameId: 'g1',
      homeTeamId: 'home',
      awayTeamId: 'away',
      predictionTimestamp: NOW,
    });
    expect(result.status).toBe('selected');
    expect(result.selected?.homeRowId).toBe(expected?.homeRowId);
    expect(result.selected?.awayRowId).toBe(expected?.awayRowId);
  });

  it('market timestamp remains <= predictionTimestamp', () => {
    const result = selectAuthorizedCoherentSpreadMarket({
      rows: coherentOddsApiPair({
        timestamp: new Date('2026-09-13T16:05:00.000Z'),
      }),
      gameId: 'g1',
      homeTeamId: 'home',
      awayTeamId: 'away',
      predictionTimestamp: NOW,
    });
    expect(result.status).toBe('stale_market');
  });

  it('age >1800s is unavailable', () => {
    const plan = planShadowModelCaptureRun({
      season: 2026,
      week: 3,
      mode: 'PREVIEW',
      captureContext: 'stale_market',
      confirmation: '',
      repoCommitSha: REPO_SHA,
      predictionTimestamp: NOW,
      frame: baseFrame({
        marketLines: coherentOddsApiPair({
          timestamp: new Date(NOW.getTime() - MAX_SHADOW_MODEL_MARKET_AGE_MS - 1000),
        }),
      }),
      model,
    });
    expect(plan.predictions[0].unavailableReasons).toContain('stale_market');
  });

  it('selection-side / team-sided line sign semantics use coherent pair lines', () => {
    const plan = planShadowModelCaptureRun({
      season: 2026,
      week: 3,
      mode: 'PREVIEW',
      captureContext: 'parity_check',
      confirmation: '',
      repoCommitSha: REPO_SHA,
      predictionTimestamp: NOW,
      frame: baseFrame(),
      model,
      createId: () => 'fixed-id',
    });
    expect(plan.ok).toBe(true);
    const row = plan.predictions[0];
    expect(row.predictionStatus).toBe('AVAILABLE');
    expect(row.selectedSide).toBe('HOME');
    expect(row.selectedTeamId).toBe('home');
    expect(row.selectedMarketLineId).toBe('ml-home');
    expect(row.selectedMarketLineValue).toBeCloseTo(-3.5, 10);
    expect(row.predictionPickValue).toBeCloseTo(-3.5, 10);
    expect(row.marketProvenance).toMatchObject({
      homeRowId: 'ml-home',
      awayRowId: 'ml-away',
      homeLine: -3.5,
      awayLine: 3.5,
      sourceFilter: LIVE_ODDS_SOURCE,
    });
  });

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
      repoCommitSha: REPO_SHA,
      predictionTimestamp: new Date('2026-09-13T20:00:00.000Z'),
      frame: baseFrame(),
      model,
    });
    expect(plan.predictions[0].predictionStatus).toBe('UNAVAILABLE');
    expect(plan.predictions[0].unavailableReasons).toContain('post_kickoff');
  });

  it('missing rating becomes unavailable', () => {
    const plan = planShadowModelCaptureRun({
      season: 2026,
      week: 3,
      mode: 'PREVIEW',
      captureContext: 'missing_rating',
      confirmation: '',
      repoCommitSha: REPO_SHA,
      predictionTimestamp: NOW,
      frame: baseFrame({ ratings: [rating('home', 10)] }),
      model,
    });
    expect(plan.predictions[0].unavailableReasons).toContain('missing_rating');
  });

  it('does not require frozenFeatureSnapshots and never emits team_feature_vector_unavailable', () => {
    const withSnapshot = planShadowModelCaptureRun({
      season: 2026,
      week: 3,
      mode: 'PREVIEW',
      captureContext: 'core_ignores_frozen_features',
      confirmation: '',
      repoCommitSha: REPO_SHA,
      predictionTimestamp: NOW,
      frame: baseFrame({
        frozenFeatureSnapshots: [
          {
            parentId: 'ignored',
            season: 2026,
            snapshotHash: '0'.repeat(64),
            featureDefinitionId: 'ignored',
            featureDefinitionVersion: 'v1',
            featureDefinitionHash: '0'.repeat(64),
            derivationDefinitionId: 'ignored',
            derivationDefinitionHash: '0'.repeat(64),
            sourceManifestHash: '0'.repeat(64),
            sourceProvenanceManifestHash: '0'.repeat(64),
            normalizationManifestHash: '0'.repeat(64),
            populationManifestHash: '0'.repeat(64),
            expectedTeamCount: 0,
            rowCount: 0,
            completeVectorCount: 0,
            unavailableVectorCount: 0,
            portalAvailableCount: 0,
            teamsById: {},
          },
        ],
      }),
      model,
    });
    const withoutSnapshot = planShadowModelCaptureRun({
      season: 2026,
      week: 3,
      mode: 'PREVIEW',
      captureContext: 'core_no_frozen_features',
      confirmation: '',
      repoCommitSha: REPO_SHA,
      predictionTimestamp: NOW,
      frame: baseFrame(),
      model,
    });
    expect(withSnapshot.ok).toBe(true);
    expect(withoutSnapshot.ok).toBe(true);
    expect(withSnapshot.predictions[0].predictionStatus).toBe('AVAILABLE');
    expect(withoutSnapshot.predictions[0].predictionStatus).toBe('AVAILABLE');
    expect(withSnapshot.predictions[0].unavailableReasons).not.toContain(
      'team_feature_vector_unavailable'
    );
    expect(withoutSnapshot.predictions[0].unavailableReasons).not.toContain(
      'team_feature_vector_unavailable'
    );
  });

  it('missing market becomes unavailable', () => {
    const plan = planShadowModelCaptureRun({
      season: 2026,
      week: 3,
      mode: 'PREVIEW',
      captureContext: 'missing_market',
      confirmation: '',
      repoCommitSha: REPO_SHA,
      predictionTimestamp: NOW,
      frame: baseFrame({ marketLines: [] }),
      model,
    });
    expect(plan.predictions[0].unavailableReasons).toContain('missing_market');
  });

  it('TOTAL market type fails closed before silent proceed', () => {
    const totalModel: ShadowModelDefinition = {
      ...createCoreV1ShadowBaselineDefinition(),
      marketType: 'TOTAL',
    };
    const plan = planShadowModelCaptureRun({
      season: 2026,
      week: 3,
      mode: 'PREVIEW',
      captureContext: 'total_block',
      confirmation: '',
      repoCommitSha: REPO_SHA,
      predictionTimestamp: NOW,
      frame: baseFrame(),
      model: totalModel,
    });
    expect(plan.writeSafe).toBe(false);
    expect(plan.writeBlockers.some((b) => b.includes('market_selector_unimplemented'))).toBe(
      true
    );
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
      repoCommitSha: REPO_SHA,
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
      repoCommitSha: REPO_SHA,
      model,
      persistence,
    });
    expect(second.execution.transactionalIdempotentNoOp).toBe(true);
    expect(second.execution.mutationsInvoked).toBe(false);
    expect(store.runs).toHaveLength(1);
  });

  it('same cohort identity on a different repo SHA fails closed', async () => {
    const { persistence, store } = memoryPersistence({ frame: baseFrame() });
    const first = await executeShadowModelCapture({
      season: 2026,
      week: 3,
      mode: 'COMMIT',
      captureContext: 'sha_conflict',
      confirmation: expectedShadowModelWriteConfirmation(3, CORE_V1_SHADOW_BASELINE_MODEL_ID),
      repoCommitSha: REPO_SHA,
      model,
      persistence,
    });
    expect(first.execution.commitSucceeded).toBe(true);
    expect(store.runs[0].repoCommitSha).toBe(REPO_SHA);

    const second = await executeShadowModelCapture({
      season: 2026,
      week: 3,
      mode: 'COMMIT',
      captureContext: 'sha_conflict',
      confirmation: expectedShadowModelWriteConfirmation(3, CORE_V1_SHADOW_BASELINE_MODEL_ID),
      repoCommitSha: 'b'.repeat(40),
      model,
      persistence,
    });
    expect(second.plan.writeSafe).toBe(false);
    expect(second.execution.mutationsInvoked).toBe(false);
    expect(second.execution.transactionalIdempotentNoOp).toBe(false);
    expect(second.execution.error).toContain('existing_cohort_repo_commit_sha_mismatch');
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
        repoCommitSha: REPO_SHA,
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
      repoCommitSha: REPO_SHA,
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
      repoCommitSha: REPO_SHA,
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
      repoCommitSha: REPO_SHA,
      model,
      persistence,
    });
    expect(result.execution.mutationsInvoked).toBe(false);
    expect(result.report.mutationsInvoked).toBe(false);
    expect(store.createCalls).toBe(0);
    expect(store.runs).toHaveLength(0);
  });

  it('official Bet fingerprint change fails closed', async () => {
    const betFingerprint = { value: 'before' };
    const { persistence } = memoryPersistence({
      frame: baseFrame(),
      betFingerprint,
    });
    const original = persistence.fingerprintOfficialFlat100Bets;
    let calls = 0;
    persistence.fingerprintOfficialFlat100Bets = async () => {
      calls += 1;
      if (calls === 1) return 'before';
      return 'after-mutated';
    };
    const result = await executeShadowModelCapture({
      season: 2026,
      week: 3,
      mode: 'COMMIT',
      captureContext: 'bet_fingerprint',
      confirmation: expectedShadowModelWriteConfirmation(3, CORE_V1_SHADOW_BASELINE_MODEL_ID),
      repoCommitSha: REPO_SHA,
      model,
      persistence,
    });
    persistence.fingerprintOfficialFlat100Bets = original;
    expect(result.execution.verificationOk).toBe(false);
    expect(result.execution.verificationReasons).toContain(
      'official_flat_100_bet_fingerprint_changed'
    );
  });

  it('fingerprint helper is deterministic over sorted Bet rows', () => {
    const a = fingerprintOfficialFlat100BetRows([
      {
        id: 'b2',
        season: 2026,
        week: 3,
        gameId: 'g2',
        marketType: 'spread',
        side: 'home',
        modelPrice: 1,
        closePrice: -3,
        stake: 100,
        strategyTag: 'official_flat_100',
        source: 'strategy_run',
        result: null,
        pnl: null,
        clv: null,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'b1',
        season: 2026,
        week: 3,
        gameId: 'g1',
        marketType: 'spread',
        side: 'away',
        modelPrice: 2,
        closePrice: 3,
        stake: 100,
        strategyTag: 'official_flat_100',
        source: 'strategy_run',
        result: null,
        pnl: null,
        clv: null,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);
    const b = fingerprintOfficialFlat100BetRows([
      {
        id: 'b1',
        season: 2026,
        week: 3,
        gameId: 'g1',
        marketType: 'spread',
        side: 'away',
        modelPrice: 2,
        closePrice: 3,
        stake: 100,
        strategyTag: 'official_flat_100',
        source: 'strategy_run',
        result: null,
        pnl: null,
        clv: null,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'b2',
        season: 2026,
        week: 3,
        gameId: 'g2',
        marketType: 'spread',
        side: 'home',
        modelPrice: 1,
        closePrice: -3,
        stake: 100,
        strategyTag: 'official_flat_100',
        source: 'strategy_run',
        result: null,
        pnl: null,
        clv: null,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);
    expect(a).toBe(b);
  });

  it('no official Bet writes', async () => {
    const { persistence } = memoryPersistence({ frame: baseFrame() });
    const result = await executeShadowModelCapture({
      season: 2026,
      week: 3,
      mode: 'COMMIT',
      captureContext: 'no_bets',
      confirmation: expectedShadowModelWriteConfirmation(3, CORE_V1_SHADOW_BASELINE_MODEL_ID),
      repoCommitSha: REPO_SHA,
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
    expect(sql).toContain('ShadowModelSelectionSide');
    expect(sql).toContain('market_provenance');
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
