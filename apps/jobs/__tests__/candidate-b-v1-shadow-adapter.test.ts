/**
 * Candidate B V1 Generic Shadow adapter tests.
 * No DATABASE_URL. No providers. No PREVIEW/COMMIT. No production writes.
 */

import * as fs from 'fs';
import * as path from 'path';
import { computeEffectiveHfa } from '../../web/lib/core-v1-spread';
import { SPREAD_EDGE_FLOOR, LIVE_ODDS_SOURCE } from '../../web/lib/core-v1-weekly-card';
import {
  SHADOW_MODEL_ALLOWLIST,
  SHADOW_MODEL_COMMIT_ALLOWLIST,
  isShadowModelAllowlisted,
  isShadowModelCommitAllowlisted,
  planShadowModelCaptureRun,
  executeShadowModelCapture,
  sha256CanonicalJson,
  shadowModelCommitAuthorizationError,
  expectedShadowModelWriteConfirmation,
  type FrozenShadowFeatureSnapshot,
  type OperationalShadowModelFrame,
  type PlannedShadowModelCaptureRun,
  type PlannedShadowModelPrediction,
  type ShadowModelCapturePersistence,
  type ShadowModelMutationTx,
} from '../../web/lib/shadow-model-capture-v1';
import { CORE_V1_SHADOW_BASELINE_MODEL_ID } from '../../web/lib/shadow-models/core-v1-shadow-baseline-v1';
import { CANDIDATE_B_ELO_GENERIC_SHADOW_MODEL_ID } from '../src/research/candidate-b/candidate-b-elo-prior-v1-shadow-adapter';
import {
  FEATURE_DEFINITION_HASH,
  FEATURE_DEFINITION_ID,
  FEATURE_DEFINITION_MANIFEST,
  FEATURE_DEFINITION_VERSION,
} from '../src/research/candidate-b/candidate-b-v1-feature-snapshot';
import { CANDIDATE_B_FROZEN_FEATURE_SNAPSHOT_HASH } from '../src/research/candidate-b/candidate-b-v1-runtime-snapshot';
import {
  CANDIDATE_B_GENERIC_SHADOW_MODEL_DEFINITION_HASH,
  CANDIDATE_B_GENERIC_SHADOW_MODEL_ID,
  CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_HASH,
  CANDIDATE_B_V1_GENERIC_SHADOW_ADAPTER_CONTRACT_HASH,
  FROZEN_CANDIDATE_B_FEATURE_DEFINITION_HASH,
  FROZEN_CANDIDATE_B_GENERIC_SHADOW_MODEL_DEFINITION_HASH,
  FROZEN_CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_HASH,
  FROZEN_CANDIDATE_B_V1_GENERIC_SHADOW_ADAPTER_CONTRACT_HASH,
  computeCandidateBShadowHma,
  createCandidateBRosterPriorShadowDefinition,
} from '../src/research/candidate-b/candidate-b-v1-shadow-adapter';

const NOW = new Date('2026-09-13T16:00:00.000Z');
const KICKOFF = new Date('2026-09-13T19:00:00.000Z');
const MARKET_TS = new Date('2026-09-13T15:50:00.000Z');
const REPO_SHA = 'a'.repeat(40);
const ROOT = path.resolve(__dirname, '../../..');
const CLI = path.join(ROOT, 'apps/jobs/capture-shadow-model-predictions-2026.ts');
const WF = path.join(
  ROOT,
  '.github/workflows/capture-shadow-model-predictions-2026-manual.yml'
);

function teamRow(
  teamId: string,
  points: number | null,
  extra: Partial<FrozenShadowFeatureSnapshot['teamsById'][string]> = {}
) {
  return {
    teamId,
    season: 2026,
    availabilityStatus: points == null ? 'UNAVAILABLE' : 'AVAILABLE',
    unavailableReasons: points == null ? ['TEAM_FEATURE_VECTOR_UNAVAILABLE'] : [],
    priorCoreRaw: points == null ? null : 1,
    talentRaw: points == null ? null : 2,
    returningRaw: points == null ? null : 0.3,
    portalRaw: points == null ? null : 0.01,
    zCore: points == null ? null : 0.4,
    zTalent: points == null ? null : -0.2,
    zReturning: points == null ? null : 0.1,
    zPortal: points == null ? null : 0.05,
    candidateBRawComposite: points == null ? null : 0.08,
    candidateBCompositeZ: points == null ? null : points / 3.5,
    candidateBTeamRatingPoints: points,
    rowHash: `row-${teamId}`,
    ...extra,
  };
}

function snapshot(teamsById: FrozenShadowFeatureSnapshot['teamsById']): FrozenShadowFeatureSnapshot {
  return {
    parentId: 'parent-b',
    season: 2026,
    snapshotHash: CANDIDATE_B_FROZEN_FEATURE_SNAPSHOT_HASH,
    featureDefinitionId: FEATURE_DEFINITION_ID,
    featureDefinitionVersion: FEATURE_DEFINITION_VERSION,
    featureDefinitionHash: FEATURE_DEFINITION_HASH,
    derivationDefinitionId: 'candidate_b_roster_prior_derivation_v1',
    derivationDefinitionHash: '6c04627787edbcc7d1d42549f3cb19c525a6c4c31de572549f01e3efa64a638c',
    sourceManifestHash: '183e07cec8ab146247f8b15eda93331a1dfe03f624b06fd8b0dae886d14b14d6',
    sourceProvenanceManifestHash: '89ea635c89898aa2de5fad66a43e6eca36ef917f6945cc82635536746347f8da',
    normalizationManifestHash: '9de2fdbf94581f05671349111ae36e458c94ac637b93e8db0eaea701abdeaa96',
    populationManifestHash: 'ce7a633f3230864c785048047698a3ba55fef1e25339e87db2a090bd65c59f2c',
    expectedTeamCount: 138,
    rowCount: 138,
    completeVectorCount: 103,
    unavailableVectorCount: 35,
    portalAvailableCount: 104,
    teamsById,
  };
}

function coherentPair() {
  return [
    {
      id: 'ml-home',
      gameId: 'g1',
      lineType: 'spread',
      lineValue: -3.5,
      teamId: 'home',
      bookName: 'book-a',
      source: LIVE_ODDS_SOURCE,
      timestamp: MARKET_TS,
    },
    {
      id: 'ml-away',
      gameId: 'g1',
      lineType: 'spread',
      lineValue: 3.5,
      teamId: 'away',
      bookName: 'book-a',
      source: LIVE_ODDS_SOURCE,
      timestamp: MARKET_TS,
    },
  ];
}

function frame(extra: Partial<OperationalShadowModelFrame> = {}): OperationalShadowModelFrame {
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
    ratings: [
      {
        teamId: 'home',
        season: 2026,
        modelVersion: 'v1',
        powerRating: 99,
        rating: 99,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
      {
        teamId: 'away',
        season: 2026,
        modelVersion: 'v1',
        powerRating: 1,
        rating: 1,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    ],
    marketLines: coherentPair(),
    frozenFeatureSnapshots: [
      snapshot({
        home: teamRow('home', 4),
        away: teamRow('away', 1),
      }),
    ],
    ...extra,
  };
}

function plan(frameInput: OperationalShadowModelFrame = frame()) {
  return planShadowModelCaptureRun({
    season: 2026,
    week: 3,
    mode: 'PREVIEW',
    captureContext: 'candidate_b_adapter',
    confirmation: '',
    repoCommitSha: REPO_SHA,
    predictionTimestamp: NOW,
    frame: frameInput,
    model: createCandidateBRosterPriorShadowDefinition(),
  });
}

describe('Candidate B Generic Shadow canonical identities', () => {
  it('freezes exact model, policy, adapter, and feature hashes', () => {
    expect(CANDIDATE_B_GENERIC_SHADOW_MODEL_DEFINITION_HASH).toBe(
      FROZEN_CANDIDATE_B_GENERIC_SHADOW_MODEL_DEFINITION_HASH
    );
    expect(CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_HASH).toBe(
      FROZEN_CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_HASH
    );
    expect(CANDIDATE_B_V1_GENERIC_SHADOW_ADAPTER_CONTRACT_HASH).toBe(
      FROZEN_CANDIDATE_B_V1_GENERIC_SHADOW_ADAPTER_CONTRACT_HASH
    );
    expect(FEATURE_DEFINITION_HASH).toBe(FROZEN_CANDIDATE_B_FEATURE_DEFINITION_HASH);
    expect(sha256CanonicalJson(FEATURE_DEFINITION_MANIFEST)).toBe(FEATURE_DEFINITION_HASH);
    const model = createCandidateBRosterPriorShadowDefinition();
    expect(model.featureDefinitionId).toBe(FEATURE_DEFINITION_ID);
    expect(model.featureDefinitionVersion).toBe(FEATURE_DEFINITION_VERSION);
    expect(sha256CanonicalJson(model.featureDefinitionManifest)).toBe(FEATURE_DEFINITION_HASH);
  });
});

describe('Candidate B Generic Shadow adapter', () => {
  it('uses Candidate B ratings plus Core HFA exactly once, not Core ratings', () => {
    const result = plan();
    const row = result.predictions[0];
    const hfa = computeEffectiveHfa('home', false);
    const expected = computeCandidateBShadowHma({
      homeTeamId: 'home',
      homeCandidateBTeamRatingPoints: 4,
      awayCandidateBTeamRatingPoints: 1,
      neutralSite: false,
    });
    expect(expected).toBeCloseTo(4 - 1 + hfa.effectiveHfa, 10);
    expect(row.modelValue).toBeCloseTo(expected, 10);
    expect(row.modelValue).not.toBeCloseTo(99 - 1 + hfa.effectiveHfa, 5);
    expect(row.featureProvenance).toMatchObject({
      hfa: {
        effectiveHfa: hfa.effectiveHfa,
        baseHfa: hfa.baseHfa,
        teamAdjustment: hfa.teamAdjustment,
        rawHfa: hfa.rawHfa,
      },
    });
  });

  it('neutral site HFA is 0', () => {
    const result = plan(
      frame({
        games: [
          {
            id: 'g1',
            season: 2026,
            week: 3,
            homeTeamId: 'home',
            awayTeamId: 'away',
            kickoffTimestamp: KICKOFF,
            neutralSite: true,
          },
        ],
      })
    );
    expect(result.predictions[0].modelValue).toBeCloseTo(3, 10);
    expect((result.predictions[0].featureProvenance as { hfa: { effectiveHfa: number } }).hfa.effectiveHfa).toBe(0);
  });

  it('emits team_feature_vector_unavailable without missing_rating or zero-fill', () => {
    const missingAway = plan(
      frame({
        frozenFeatureSnapshots: [
          snapshot({
            home: teamRow('home', 4),
            away: teamRow('away', null),
          }),
        ],
      })
    );
    expect(missingAway.predictions[0].predictionStatus).toBe('UNAVAILABLE');
    expect(missingAway.predictions[0].unavailableReasons).toEqual([
      'team_feature_vector_unavailable',
    ]);
    expect(missingAway.predictions[0].unavailableReasons).not.toContain('missing_rating');
    expect(missingAway.predictions[0].modelValue).toBeNull();
    expect(
      (missingAway.predictions[0].inputPayload as { away: { candidateBTeamRatingPoints: number | null } })
        .away.candidateBTeamRatingPoints
    ).toBeNull();

    const missingRow = plan(
      frame({
        frozenFeatureSnapshots: [snapshot({ home: teamRow('home', 4) })],
      })
    );
    expect(missingRow.predictions[0].unavailableReasons).toEqual([
      'team_feature_vector_unavailable',
    ]);
    expect(missingRow.predictions[0].unavailableReasons).not.toContain('missing_rating');
  });

  it('selects HOME/AWAY through getATSPick and NO_SELECTION below the 0.1 floor', () => {
    const home = plan();
    expect(home.predictions[0].selectedSide).toBe('HOME');
    expect(home.predictions[0].selectedTeamId).toBe('home');
    expect((home.predictions[0].modelOutput as { edgeFloor: number }).edgeFloor).toBe(
      SPREAD_EDGE_FLOOR
    );
    expect(home.predictions[0].predictionPickValue).toBeCloseTo(-3.5, 10);

    const hfa = computeEffectiveHfa('home', false);
    const noSelHomePoints = 3.5 - hfa.effectiveHfa;
    const noSel = plan(
      frame({
        frozenFeatureSnapshots: [
          snapshot({
            home: teamRow('home', noSelHomePoints),
            away: teamRow('away', 0),
          }),
        ],
      })
    );
    expect(noSel.predictions[0].modelValue).toBeCloseTo(3.5, 10);
    expect(noSel.predictions[0].selectedSide).toBe('NO_SELECTION');
    expect(noSel.predictions[0].predictionStatus).toBe('AVAILABLE');
    expect(noSel.predictions[0].selectedTeamId).toBeNull();
    expect(noSel.predictions[0].predictionPickValue).toBeNull();

    const away = plan(
      frame({
        frozenFeatureSnapshots: [
          snapshot({
            home: teamRow('home', -6),
            away: teamRow('away', 6),
          }),
        ],
      })
    );
    expect(away.predictions[0].selectedSide).toBe('AWAY');
    expect(away.predictions[0].selectedTeamId).toBe('away');
    expect(away.predictions[0].predictionPickValue).toBeCloseTo(3.5, 10);
  });

  it('records full home/away payload and provenance without the 138-team snapshot', () => {
    const row = plan().predictions[0];
    const payload = row.inputPayload as Record<string, unknown>;
    const home = payload.home as Record<string, unknown>;
    const away = payload.away as Record<string, unknown>;
    for (const side of [home, away]) {
      expect(side).toEqual(
        expect.objectContaining({
          teamId: expect.any(String),
          rowHash: expect.any(String),
          priorCoreRaw: expect.any(Number),
          talentRaw: expect.any(Number),
          returningRaw: expect.any(Number),
          portalRaw: expect.any(Number),
          zCore: expect.any(Number),
          zTalent: expect.any(Number),
          zReturning: expect.any(Number),
          zPortal: expect.any(Number),
          candidateBRawComposite: expect.any(Number),
          candidateBCompositeZ: expect.any(Number),
          candidateBTeamRatingPoints: expect.any(Number),
        })
      );
    }
    expect(payload.featureSnapshotHash).toBe(CANDIDATE_B_FROZEN_FEATURE_SNAPSHOT_HASH);
    expect(payload.hfa).toEqual(
      expect.objectContaining({
        homeTeamId: 'home',
        neutralSite: false,
        effectiveHfa: expect.any(Number),
        baseHfa: expect.any(Number),
        teamAdjustment: expect.any(Number),
        rawHfa: expect.any(Number),
      })
    );
    expect(payload.market).toEqual(
      expect.objectContaining({
        selectedMarketLineId: 'ml-home',
        canonicalMarketValue: 3.5,
        marketSource: LIVE_ODDS_SOURCE,
      })
    );
    expect(payload).not.toHaveProperty('teamsById');
    expect(payload).not.toHaveProperty('teams');
    const provenance = row.featureProvenance as Record<string, unknown>;
    expect(provenance.snapshotParentId).toBe('parent-b');
    expect(provenance.snapshotHash).toBe(CANDIDATE_B_FROZEN_FEATURE_SNAPSHOT_HASH);
    expect(JSON.stringify(payload)).not.toContain('t137');
  });
});

describe('Candidate B Generic Shadow staging safety', () => {
  it('allowlists Candidate B for PREVIEW and COMMIT', () => {
    expect(SHADOW_MODEL_ALLOWLIST).toEqual([
      CORE_V1_SHADOW_BASELINE_MODEL_ID,
      CANDIDATE_B_GENERIC_SHADOW_MODEL_ID,
      CANDIDATE_B_ELO_GENERIC_SHADOW_MODEL_ID,
    ]);
    expect(isShadowModelAllowlisted(CORE_V1_SHADOW_BASELINE_MODEL_ID)).toBe(true);
    expect(isShadowModelAllowlisted(CANDIDATE_B_GENERIC_SHADOW_MODEL_ID)).toBe(true);
    expect(isShadowModelAllowlisted(CANDIDATE_B_ELO_GENERIC_SHADOW_MODEL_ID)).toBe(true);
    expect(SHADOW_MODEL_COMMIT_ALLOWLIST).toEqual([
      CORE_V1_SHADOW_BASELINE_MODEL_ID,
      CANDIDATE_B_GENERIC_SHADOW_MODEL_ID,
      CANDIDATE_B_ELO_GENERIC_SHADOW_MODEL_ID,
    ]);
    expect(isShadowModelCommitAllowlisted(CORE_V1_SHADOW_BASELINE_MODEL_ID)).toBe(true);
    expect(isShadowModelCommitAllowlisted(CANDIDATE_B_GENERIC_SHADOW_MODEL_ID)).toBe(true);
    expect(isShadowModelCommitAllowlisted(CANDIDATE_B_ELO_GENERIC_SHADOW_MODEL_ID)).toBe(false);
  });

  it('CLI keeps the shared commit-allowlist gate before Prisma and permits Candidate B COMMIT', () => {
    const cli = fs.readFileSync(CLI, 'utf8');
    const wf = fs.readFileSync(WF, 'utf8');
    const mainSrc = cli.slice(cli.indexOf('async function main()'));
    expect(mainSrc.indexOf('isShadowModelAllowlisted')).toBeGreaterThan(-1);
    expect(mainSrc.indexOf('shadowModelCommitAuthorizationError')).toBeGreaterThan(-1);
    expect(mainSrc.indexOf('isShadowModelAllowlisted')).toBeLessThan(
      mainSrc.indexOf('shadowModelCommitAuthorizationError')
    );
    expect(mainSrc.indexOf('shadowModelCommitAuthorizationError')).toBeLessThan(
      mainSrc.indexOf('new PrismaClient()')
    );
    expect(mainSrc.indexOf('shadowModelCommitAuthorizationError')).toBeLessThan(
      mainSrc.indexOf('createPrismaPersistence')
    );
    expect(cli).toContain('model_id_not_commit_allowlisted');
    const commitGate = mainSrc.slice(
      mainSrc.indexOf('shadowModelCommitAuthorizationError'),
      mainSrc.indexOf('new PrismaClient()')
    );
    expect(commitGate).not.toContain('confirmation');
    expect(commitGate).not.toContain('args.confirmation');
    expect(
      shadowModelCommitAuthorizationError('COMMIT', CANDIDATE_B_GENERIC_SHADOW_MODEL_ID)
    ).toBeNull();
    expect(
      shadowModelCommitAuthorizationError('PREVIEW', CANDIDATE_B_GENERIC_SHADOW_MODEL_ID)
    ).toBeNull();
    expect(
      shadowModelCommitAuthorizationError('COMMIT', 'not_a_shadow_model')
    ).toEqual({
      error: 'model_id_not_commit_allowlisted',
      modelId: 'not_a_shadow_model',
      mode: 'COMMIT',
    });
    expect(
      expectedShadowModelWriteConfirmation(3, CANDIDATE_B_GENERIC_SHADOW_MODEL_ID)
    ).toBe('CAPTURE_2026_WEEK_3_SHADOW_MODEL_candidate_b_roster_prior_v1');
    expect(wf).toContain('candidate_b_roster_prior_v1');
    expect(wf).not.toContain('Candidate B V1 COMMIT is not authorized.');
    expect(wf).toContain('core_v1_shadow_baseline_v1');
  });

  it('in-memory COMMIT proceeds only with the exact Candidate B confirmation', async () => {
    const model = createCandidateBRosterPriorShadowDefinition();
    const frameInput = frame();
    const confirmation = expectedShadowModelWriteConfirmation(
      3,
      CANDIDATE_B_GENERIC_SHADOW_MODEL_ID
    );

    function memoryPersistence(): {
      persistence: ShadowModelCapturePersistence;
      store: {
        runs: PlannedShadowModelCaptureRun[];
        predictions: PlannedShadowModelPrediction[];
      };
    } {
      const store = {
        runs: [] as PlannedShadowModelCaptureRun[],
        predictions: [] as PlannedShadowModelPrediction[],
      };
      const bindTx = (): ShadowModelMutationTx => ({
        findCohort: async () => null,
        loadFrame: async () => frameInput,
        now: () => NOW,
        createRun: async (run) => {
          store.runs.push(run);
        },
        createPredictions: async (rows) => {
          store.predictions.push(...rows);
          return rows.length;
        },
        countPredictions: async (captureRunId) =>
          store.predictions.filter((p) => p.captureRunId === captureRunId).length,
      });
      return {
        store,
        persistence: {
          now: () => NOW,
          createId: () => 'candidate-b-commit-run',
          findCohort: async () => null,
          loadFrame: async () => frameInput,
          runTransaction: async (fn) => fn(bindTx()),
          readRun: async (id) =>
            store.runs[0] && store.runs[0].id === id
              ? {
                  run: {
                    id: store.runs[0].id,
                    status: store.runs[0].status,
                    season: store.runs[0].season,
                    week: store.runs[0].week,
                    evaluationProtocol: store.runs[0].evaluationProtocol,
                    captureContext: store.runs[0].captureContext,
                    modelDefinitionId: store.runs[0].modelDefinitionId,
                    modelDefinitionHash: store.runs[0].modelDefinitionHash,
                    featureDefinitionId: store.runs[0].featureDefinitionId,
                    featureDefinitionHash: store.runs[0].featureDefinitionHash,
                    policyDefinitionId: store.runs[0].policyDefinitionId,
                    policyDefinitionHash: store.runs[0].policyDefinitionHash,
                    repoCommitSha: store.runs[0].repoCommitSha,
                    expectedGameIds: store.runs[0].expectedGameIds,
                    totalGames: store.runs[0].totalGames,
                    availableCount: store.runs[0].availableCount,
                    unavailableCount: store.runs[0].unavailableCount,
                    selectionCount: store.runs[0].selectionCount,
                    noSelectionCount: store.runs[0].noSelectionCount,
                  },
                  predictions: store.predictions.map((p) => ({
                    id: p.id,
                    gameId: p.gameId,
                    predictionStatus: p.predictionStatus,
                    selectedSide: p.selectedSide,
                  })),
                }
              : null,
          fingerprintOfficialFlat100Bets: async () => 'stable-bet-fingerprint',
        },
      };
    }

    const wrong = memoryPersistence();
    const wrongResult = await executeShadowModelCapture({
      season: 2026,
      week: 3,
      mode: 'COMMIT',
      captureContext: 'candidate_b_commit_wrong',
      confirmation: 'WRONG_CONFIRMATION',
      repoCommitSha: REPO_SHA,
      model,
      persistence: wrong.persistence,
    });
    expect(wrongResult.plan.writeBlockers).toContain('confirmation_invalid');
    expect(wrongResult.execution.error).toBe('confirmation_invalid');
    expect(wrongResult.execution.mutationsInvoked).toBe(false);
    expect(wrong.store.runs).toHaveLength(0);
    expect(wrong.store.predictions).toHaveLength(0);

    const blank = memoryPersistence();
    const blankResult = await executeShadowModelCapture({
      season: 2026,
      week: 3,
      mode: 'COMMIT',
      captureContext: 'candidate_b_commit_blank',
      confirmation: '',
      repoCommitSha: REPO_SHA,
      model,
      persistence: blank.persistence,
    });
    expect(blankResult.plan.writeBlockers).toContain('confirmation_invalid');
    expect(blankResult.execution.mutationsInvoked).toBe(false);
    expect(blank.store.runs).toHaveLength(0);

    const ok = memoryPersistence();
    const okResult = await executeShadowModelCapture({
      season: 2026,
      week: 3,
      mode: 'COMMIT',
      captureContext: 'candidate_b_commit_ok',
      confirmation,
      repoCommitSha: REPO_SHA,
      model,
      persistence: ok.persistence,
    });
    expect(okResult.plan.writeSafe).toBe(true);
    expect(okResult.execution.commitSucceeded).toBe(true);
    expect(okResult.execution.mutationsInvoked).toBe(true);
    expect(ok.store.runs).toHaveLength(1);
    expect(ok.store.predictions).toHaveLength(frameInput.games.length);
    expect(ok.store.runs[0].modelDefinitionId).toBe(CANDIDATE_B_GENERIC_SHADOW_MODEL_ID);
    expect(okResult.execution.betWrites).toBe(false);
    expect(okResult.execution.hybridShadowWrites).toBe(false);
    expect(okResult.execution.providerCalls).toBe(0);
  });
});
