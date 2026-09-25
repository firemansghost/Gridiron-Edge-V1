/**
 * V4 Prospective V1 Generic Shadow tests.
 * No providers. No database. No production capture.
 */

import * as fs from 'fs';
import * as path from 'path';
import { LIVE_ODDS_SOURCE } from '../../web/lib/core-v1-weekly-card';
import {
  SHADOW_MODEL_ALLOWLIST,
  SHADOW_MODEL_COMMIT_ALLOWLIST,
  isShadowModelAllowlisted,
  isShadowModelCommitAllowlisted,
  planShadowModelCaptureRun,
  shadowModelCommitAuthorizationError,
  type OperationalShadowModelFrame,
} from '../../web/lib/shadow-model-capture-v1';
import {
  V4_PROSPECTIVE_HFA_POINTS,
  V4_PROSPECTIVE_MODEL_ID,
  V4_PROSPECTIVE_RUNTIME_ARTIFACT_HASH,
  V4_PROSPECTIVE_SELECTION_THRESHOLD_ABS,
  V4_PROSPECTIVE_TARGET_WEEK,
  loadV4ProspectiveRuntimeArtifact,
} from '../src/research/v4-prospective/v4-prospective-v1-runtime-artifact';
import {
  V4_PROSPECTIVE_FEATURE_DEFINITION_HASH,
  V4_PROSPECTIVE_GENERIC_SHADOW_MODEL_ID,
  V4_PROSPECTIVE_MODEL_DEFINITION_HASH,
  V4_PROSPECTIVE_POLICY_DEFINITION_HASH,
  computeV4ProspectiveHma,
  createV4ProspectiveShadowDefinition,
} from '../src/research/v4-prospective/v4-prospective-v1-shadow-adapter';

const NOW = new Date('2026-09-24T17:00:00.000Z');
const KICKOFF = new Date('2026-09-25T00:30:00.000Z');
const MARKET_TS = new Date('2026-09-24T16:50:00.000Z');
const ROOT = path.resolve(__dirname, '../../..');
const CLI = path.join(ROOT, 'apps/jobs/capture-shadow-model-predictions-2026.ts');
const WF = path.join(
  ROOT,
  '.github/workflows/capture-shadow-model-predictions-2026-manual.yml'
);
const RUNTIME = path.join(
  ROOT,
  'apps/jobs/src/research/v4-prospective/v4-prospective-v1-runtime-artifact.ts'
);
const ARTIFACT = path.join(
  ROOT,
  'research/v4-prospective/V4_PROSPECTIVE_V1_RUNTIME_ARTIFACT.json'
);
const T30 = path.join(ROOT, 'apps/web/lib/shadow-model-t30-closing-v1.ts');

function frame(marketHma?: number): OperationalShadowModelFrame {
  const home = 'coastal-carolina';
  const away = 'liberty';
  const homeLine = marketHma == null ? 2.5 : -marketHma;
  const awayLine = -homeLine;
  return {
    games: [
      {
        id: '2026-wk4-liberty-coastal-carolina',
        season: 2026,
        week: 4,
        homeTeamId: home,
        awayTeamId: away,
        kickoffTimestamp: KICKOFF,
        neutralSite: false,
      },
    ],
    ratings: [],
    marketLines: [
      {
        id: 'v4-home',
        gameId: '2026-wk4-liberty-coastal-carolina',
        lineType: 'spread',
        lineValue: homeLine,
        teamId: home,
        bookName: 'book-a',
        source: LIVE_ODDS_SOURCE,
        timestamp: MARKET_TS,
      },
      {
        id: 'v4-away',
        gameId: '2026-wk4-liberty-coastal-carolina',
        lineType: 'spread',
        lineValue: awayLine,
        teamId: away,
        bookName: 'book-a',
        source: LIVE_ODDS_SOURCE,
        timestamp: MARKET_TS,
      },
    ],
  };
}

describe('V4 Prospective V1 pinned runtime artifact', () => {
  it('verifies the complete audited 138-team Week 4 artifact and every row hash', () => {
    const artifact = loadV4ProspectiveRuntimeArtifact();
    expect(artifact.artifactHash).toBe(V4_PROSPECTIVE_RUNTIME_ARTIFACT_HASH);
    expect(artifact.modelId).toBe(V4_PROSPECTIVE_MODEL_ID);
    expect(artifact.targetWeek).toBe(V4_PROSPECTIVE_TARGET_WEEK);
    expect(artifact.teamCount).toBe(138);
    expect(artifact.teams).toHaveLength(138);
    expect(new Set(artifact.teams.map((row) => row.teamId)).size).toBe(138);
    expect(artifact.finalScoreExactMatches).toBe(157);
    expect(artifact.finalScoreExpectedGames).toBe(157);
    expect(artifact.invalidScoringEvents).toBe(0);
    expect(artifact.sourceRunId).toBe(36084777413);
    expect(artifact.sourceArtifactId).toBe(10843139601);
  });

  it('is repo-only and has no provider or database path', () => {
    const runtime = fs.readFileSync(RUNTIME, 'utf8');
    const artifact = fs.readFileSync(ARTIFACT, 'utf8');
    expect(runtime).not.toContain('fetch(');
    expect(runtime).not.toContain('PrismaClient');
    expect(runtime).not.toContain('CFBD_API_KEY');
    expect(runtime).not.toContain('ODDS_API_KEY');
    expect(artifact).not.toContain('CFBD_API_KEY');
    expect(artifact).not.toContain('ODDS_API_KEY');
  });
});

describe('V4 Prospective V1 Generic Shadow adapter', () => {
  it('uses pinned V4 ratings + fixed 2.0 HFA and ignores Core ratings', () => {
    const artifact = loadV4ProspectiveRuntimeArtifact();
    const home = artifact.teams.find((row) => row.teamId === 'coastal-carolina')!;
    const away = artifact.teams.find((row) => row.teamId === 'liberty')!;

    expect(V4_PROSPECTIVE_HFA_POINTS).toBe(2);
    expect(V4_PROSPECTIVE_SELECTION_THRESHOLD_ABS).toBe(0.1);

    const expected = home.rating + 2 - away.rating;
    expect(
      computeV4ProspectiveHma({
        homeRating: home.rating,
        awayRating: away.rating,
        neutralSite: false,
      })
    ).toBeCloseTo(expected, 12);

    const plan = planShadowModelCaptureRun({
      season: 2026,
      week: 4,
      mode: 'PREVIEW',
      captureContext: 'v4_prospective_preview_test',
      confirmation: '',
      repoCommitSha: 'a'.repeat(40),
      predictionTimestamp: NOW,
      frame: frame(),
      model: createV4ProspectiveShadowDefinition(),
    });

    expect(plan.writeSafe).toBe(true);
    expect(plan.predictions).toHaveLength(1);
    const row = plan.predictions[0];
    expect(row.predictionStatus).toBe('AVAILABLE');
    expect(row.modelValue).toBeCloseTo(expected, 12);
    expect(row.selectedSide).toBe('HOME');
    expect(row.selectedTeamId).toBe('coastal-carolina');
    expect(row.marketSource).toBe(LIVE_ODDS_SOURCE);
    expect(row.marketAgeSeconds).toBe(600);
    expect(row.featureProvenance).toEqual(
      expect.objectContaining({
        artifactHash: V4_PROSPECTIVE_RUNTIME_ARTIFACT_HASH,
        sourceRunId: 36084777413,
        sourceArtifactId: 10843139601,
      })
    );
  });

  it('persists an AVAILABLE verified NO_SELECTION when edge is below 0.1', () => {
    const artifact = loadV4ProspectiveRuntimeArtifact();
    const home = artifact.teams.find((row) => row.teamId === 'coastal-carolina')!;
    const away = artifact.teams.find((row) => row.teamId === 'liberty')!;
    const modelHma = computeV4ProspectiveHma({
      homeRating: home.rating,
      awayRating: away.rating,
      neutralSite: false,
    });

    const plan = planShadowModelCaptureRun({
      season: 2026,
      week: 4,
      mode: 'PREVIEW',
      captureContext: 'v4_prospective_no_selection_test',
      confirmation: '',
      repoCommitSha: 'b'.repeat(40),
      predictionTimestamp: NOW,
      frame: frame(modelHma),
      model: createV4ProspectiveShadowDefinition(),
    });

    const row = plan.predictions[0];
    expect(row.predictionStatus).toBe('AVAILABLE');
    expect(row.edgeValue).toBeCloseTo(0, 12);
    expect(row.selectedSide).toBe('NO_SELECTION');
    expect(row.selectedTeamId).toBeNull();
    expect(row.predictionPickValue).toBeNull();
    expect(plan.counts.noSelectionCount).toBe(1);
    expect(plan.counts.selectionCount).toBe(0);
  });

  it('uses neutral-site HFA = 0', () => {
    expect(
      computeV4ProspectiveHma({
        homeRating: 4,
        awayRating: -1,
        neutralSite: true,
      })
    ).toBe(5);
  });

  it('freezes model, feature, and policy identities', () => {
    expect(V4_PROSPECTIVE_MODEL_DEFINITION_HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(V4_PROSPECTIVE_FEATURE_DEFINITION_HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(V4_PROSPECTIVE_POLICY_DEFINITION_HASH).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('V4 Prospective V1 capture boundary', () => {
  it('is allowlisted for the explicitly approved guarded Week 4 persistence proof', () => {
    expect(SHADOW_MODEL_ALLOWLIST).toContain(V4_PROSPECTIVE_GENERIC_SHADOW_MODEL_ID);
    expect(SHADOW_MODEL_COMMIT_ALLOWLIST).toContain(
      V4_PROSPECTIVE_GENERIC_SHADOW_MODEL_ID
    );
    expect(isShadowModelAllowlisted(V4_PROSPECTIVE_GENERIC_SHADOW_MODEL_ID)).toBe(true);
    expect(isShadowModelCommitAllowlisted(V4_PROSPECTIVE_GENERIC_SHADOW_MODEL_ID)).toBe(
      true
    );
    expect(
      shadowModelCommitAuthorizationError('PREVIEW', V4_PROSPECTIVE_GENERIC_SHADOW_MODEL_ID)
    ).toBeNull();
    expect(
      shadowModelCommitAuthorizationError('COMMIT', V4_PROSPECTIVE_GENERIC_SHADOW_MODEL_ID)
    ).toBeNull();
  });

  it('hard-gates the pinned artifact to Week 4 before Prisma', () => {
    const cli = fs.readFileSync(CLI, 'utf8');
    const wf = fs.readFileSync(WF, 'utf8');
    const mainSrc = cli.slice(cli.indexOf('async function main()'));

    expect(mainSrc).toContain('v4_prospective_v1_artifact_authorized_for_week_4_only');
    expect(
      mainSrc.indexOf('v4_prospective_v1_artifact_authorized_for_week_4_only')
    ).toBeLessThan(mainSrc.indexOf('new PrismaClient()'));
    expect(wf).toContain('v4_prospective_v1 pinned artifact is authorized for Week 4 only');
    expect(wf).toContain('COMMIT requires confirm=${EXPECTED}');
  });

  it('does not add V4 to T-30 automation in this slice', () => {
    const t30 = fs.readFileSync(T30, 'utf8');
    const supportedBlock = t30.slice(
      t30.indexOf('GENERIC_SHADOW_T30_SUPPORTED_MODEL_IDS'),
      t30.indexOf('export type GenericShadowT30SupportedModelId')
    );
    expect(supportedBlock).not.toContain('v4_prospective_v1');
  });
});
