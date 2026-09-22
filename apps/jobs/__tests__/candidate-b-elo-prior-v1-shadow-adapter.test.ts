/**
 * Candidate B Elo Prior V1 Generic Shadow PREVIEW tests.
 * No providers. No database. No production capture.
 */

import * as fs from 'fs';
import * as path from 'path';
import { computeEffectiveHfa } from '../../web/lib/core-v1-spread';
import { LIVE_ODDS_SOURCE, SPREAD_EDGE_FLOOR } from '../../web/lib/core-v1-weekly-card';
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
  CANDIDATE_B_ELO_DERIVED_ARTIFACT_HASH,
  CANDIDATE_B_ELO_EXPECTED_TEAM_COUNT,
  CANDIDATE_B_ELO_MAPPING_HASH,
  CANDIDATE_B_ELO_MEAN,
  CANDIDATE_B_ELO_POINTS_PER_Z,
  CANDIDATE_B_ELO_POPULATION_SD,
  CANDIDATE_B_ELO_SOURCE_RAW_SHA256,
  loadCandidateBEloPriorRuntimeArtifact,
} from '../src/research/candidate-b/candidate-b-elo-prior-v1-runtime-artifact';
import {
  CANDIDATE_B_ELO_FEATURE_DEFINITION_HASH,
  CANDIDATE_B_ELO_FIRST_PROSPECTIVE_WEEK,
  CANDIDATE_B_ELO_GENERIC_SHADOW_MODEL_ID,
  CANDIDATE_B_ELO_MODEL_DEFINITION_HASH,
  CANDIDATE_B_ELO_POLICY_DEFINITION_HASH,
  FROZEN_CANDIDATE_B_ELO_FEATURE_DEFINITION_HASH,
  FROZEN_CANDIDATE_B_ELO_GENERIC_SHADOW_MANIFEST_HASH,
  FROZEN_CANDIDATE_B_ELO_MODEL_DEFINITION_HASH,
  FROZEN_CANDIDATE_B_ELO_POLICY_DEFINITION_HASH,
  computeCandidateBEloShadowHma,
  createCandidateBEloPriorShadowDefinition,
} from '../src/research/candidate-b/candidate-b-elo-prior-v1-shadow-adapter';

const NOW = new Date('2026-09-22T16:00:00.000Z');
const KICKOFF = new Date('2026-09-26T19:00:00.000Z');
const MARKET_TS = new Date('2026-09-22T15:50:00.000Z');
const ROOT = path.resolve(__dirname, '../../..');
const CLI = path.join(ROOT, 'apps/jobs/capture-shadow-model-predictions-2026.ts');
const WF = path.join(
  ROOT,
  '.github/workflows/capture-shadow-model-predictions-2026-manual.yml'
);
const RUNTIME = path.join(
  ROOT,
  'apps/jobs/src/research/candidate-b/candidate-b-elo-prior-v1-runtime-artifact.ts'
);
const T30 = path.join(ROOT, 'apps/web/lib/shadow-model-t30-closing-v1.ts');

function frame(): OperationalShadowModelFrame {
  return {
    games: [
      {
        id: 'elo-g1',
        season: 2026,
        week: 5,
        homeTeamId: 'alabama',
        awayTeamId: 'auburn',
        kickoffTimestamp: KICKOFF,
        neutralSite: false,
      },
    ],
    ratings: [
      {
        teamId: 'alabama',
        season: 2026,
        modelVersion: 'v1',
        powerRating: -99,
        rating: -99,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
      {
        teamId: 'auburn',
        season: 2026,
        modelVersion: 'v1',
        powerRating: 99,
        rating: 99,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    ],
    marketLines: [
      {
        id: 'elo-ml-home',
        gameId: 'elo-g1',
        lineType: 'spread',
        lineValue: -3.5,
        teamId: 'alabama',
        bookName: 'book-a',
        source: LIVE_ODDS_SOURCE,
        timestamp: MARKET_TS,
      },
      {
        id: 'elo-ml-away',
        gameId: 'elo-g1',
        lineType: 'spread',
        lineValue: 3.5,
        teamId: 'auburn',
        bookName: 'book-a',
        source: LIVE_ODDS_SOURCE,
        timestamp: MARKET_TS,
      },
    ],
  };
}

describe('Candidate B Elo Prior V1 frozen runtime artifact', () => {
  it('reconstructs exactly 138 teams from the hash-pinned raw source and mapping', () => {
    const artifact = loadCandidateBEloPriorRuntimeArtifact();
    expect(artifact.artifactHash).toBe(CANDIDATE_B_ELO_DERIVED_ARTIFACT_HASH);
    expect(artifact.source.rawSha256).toBe(CANDIDATE_B_ELO_SOURCE_RAW_SHA256);
    expect(artifact.population.count).toBe(CANDIDATE_B_ELO_EXPECTED_TEAM_COUNT);
    expect(artifact.teams).toHaveLength(138);
    expect(new Set(artifact.teams.map((row) => row.teamId)).size).toBe(138);
    expect(artifact.population.meanElo).toBe(CANDIDATE_B_ELO_MEAN);
    expect(artifact.population.populationStdDevElo).toBe(CANDIDATE_B_ELO_POPULATION_SD);
    expect(artifact.population.scalePointsPerZ).toBe(CANDIDATE_B_ELO_POINTS_PER_Z);

    const alabama = artifact.teams.find((row) => row.teamId === 'alabama');
    expect(alabama).toBeDefined();
    expect(alabama!.rawElo).toBe(1738);
    expect(alabama!.candidateBEloTeamRatingPoints).toBeCloseTo(
      3.5 * alabama!.zElo,
      12
    );
    expect(alabama!.rowHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('pins the corrected source/mapping/artifact hashes and has no provider path', () => {
    expect(CANDIDATE_B_ELO_SOURCE_RAW_SHA256).toBe(
      '97e40e9f8220f9e7bafd8c6cd68dbf9ecb4b94208fe5911b97b07891f9fa4e64'
    );
    expect(CANDIDATE_B_ELO_MAPPING_HASH).toBe(
      'f6465665aa20ffcc55d0be9b03e00d39a03d3a7a961fc8c5225552d0c180c527'
    );
    expect(CANDIDATE_B_ELO_DERIVED_ARTIFACT_HASH).toBe(
      '9c36fdcfd12ab95ffc24c8b5a3704a153d0b4ebcaf86c8309b1d200891b6fd20'
    );

    const src = fs.readFileSync(RUNTIME, 'utf8');
    expect(src).not.toContain('fetch(');
    expect(src).not.toContain('CFBD_API_KEY');
    expect(src).not.toContain('PrismaClient');
    expect(src).not.toContain('teamSeasonRating');
    expect(src).not.toContain('teamSeasonTalent');
  });
});

describe('Candidate B Elo Prior V1 Generic Shadow identities', () => {
  it('freezes exact model / feature / policy / manifest hashes', () => {
    expect(CANDIDATE_B_ELO_MODEL_DEFINITION_HASH).toBe(
      FROZEN_CANDIDATE_B_ELO_MODEL_DEFINITION_HASH
    );
    expect(CANDIDATE_B_ELO_FEATURE_DEFINITION_HASH).toBe(
      FROZEN_CANDIDATE_B_ELO_FEATURE_DEFINITION_HASH
    );
    expect(CANDIDATE_B_ELO_POLICY_DEFINITION_HASH).toBe(
      FROZEN_CANDIDATE_B_ELO_POLICY_DEFINITION_HASH
    );
    expect(FROZEN_CANDIDATE_B_ELO_GENERIC_SHADOW_MANIFEST_HASH).toBe(
      '2956bb3a6ba00fb2b6ff277398eba5c440f4431d751f313da7901fddb7a29b84'
    );
    expect(CANDIDATE_B_ELO_FIRST_PROSPECTIVE_WEEK).toBe(5);
  });

  it('uses Elo points + Core HFA exactly once and ignores Core ratings', () => {
    const artifact = loadCandidateBEloPriorRuntimeArtifact();
    const home = artifact.teams.find((row) => row.teamId === 'alabama')!;
    const away = artifact.teams.find((row) => row.teamId === 'auburn')!;
    const hfa = computeEffectiveHfa('alabama', false);

    const expected = computeCandidateBEloShadowHma({
      homeTeamId: 'alabama',
      homeCandidateBEloTeamRatingPoints: home.candidateBEloTeamRatingPoints,
      awayCandidateBEloTeamRatingPoints: away.candidateBEloTeamRatingPoints,
      neutralSite: false,
    });
    expect(expected).toBeCloseTo(
      home.candidateBEloTeamRatingPoints -
        away.candidateBEloTeamRatingPoints +
        hfa.effectiveHfa,
      12
    );

    const plan = planShadowModelCaptureRun({
      season: 2026,
      week: 5,
      mode: 'PREVIEW',
      captureContext: 'candidate_b_elo_preview_test',
      confirmation: '',
      repoCommitSha: 'a'.repeat(40),
      predictionTimestamp: NOW,
      frame: frame(),
      model: createCandidateBEloPriorShadowDefinition(),
    });

    expect(plan.writeSafe).toBe(true);
    expect(plan.predictions).toHaveLength(1);
    const row = plan.predictions[0];
    expect(row.predictionStatus).toBe('AVAILABLE');
    expect(row.modelValue).toBeCloseTo(expected, 12);
    expect(row.modelValue).not.toBeCloseTo(-99 - 99 + hfa.effectiveHfa, 5);
    expect((row.modelOutput as { edgeFloor: number }).edgeFloor).toBe(
      SPREAD_EDGE_FLOOR
    );
    expect(row.marketSource).toBe(LIVE_ODDS_SOURCE);
    expect(row.marketAgeSeconds).toBe(600);

    const payload = row.inputPayload as Record<string, unknown>;
    expect(payload.featureArtifactHash).toBe(CANDIDATE_B_ELO_DERIVED_ARTIFACT_HASH);
    expect(payload.sourceRawSha256).toBe(CANDIDATE_B_ELO_SOURCE_RAW_SHA256);
    expect(payload.home).toEqual(
      expect.objectContaining({
        teamId: 'alabama',
        rawElo: 1738,
        zElo: expect.any(Number),
        candidateBEloTeamRatingPoints: expect.any(Number),
        rowHash: expect.any(String),
      })
    );
    expect(payload.away).toEqual(
      expect.objectContaining({
        teamId: 'auburn',
        rawElo: 1613,
        zElo: expect.any(Number),
        candidateBEloTeamRatingPoints: expect.any(Number),
        rowHash: expect.any(String),
      })
    );
    expect(payload).not.toHaveProperty('teams');
    expect(payload).not.toHaveProperty('teamsById');
    expect(JSON.stringify(payload)).not.toContain('"wyoming"');
  });

  it('uses neutral-site HFA = 0', () => {
    const artifact = loadCandidateBEloPriorRuntimeArtifact();
    const home = artifact.teams.find((row) => row.teamId === 'alabama')!;
    const away = artifact.teams.find((row) => row.teamId === 'auburn')!;
    expect(
      computeCandidateBEloShadowHma({
        homeTeamId: 'alabama',
        homeCandidateBEloTeamRatingPoints: home.candidateBEloTeamRatingPoints,
        awayCandidateBEloTeamRatingPoints: away.candidateBEloTeamRatingPoints,
        neutralSite: true,
      })
    ).toBeCloseTo(
      home.candidateBEloTeamRatingPoints - away.candidateBEloTeamRatingPoints,
      12
    );
  });
});

describe('Candidate B Elo Prior V1 staging safety', () => {
  it('is PREVIEW and guarded COMMIT allowlisted for the Week 5+ research path', () => {
    expect(SHADOW_MODEL_ALLOWLIST).toContain(CANDIDATE_B_ELO_GENERIC_SHADOW_MODEL_ID);
    expect(isShadowModelAllowlisted(CANDIDATE_B_ELO_GENERIC_SHADOW_MODEL_ID)).toBe(true);
    expect(
      (SHADOW_MODEL_COMMIT_ALLOWLIST as readonly string[]).includes(
        CANDIDATE_B_ELO_GENERIC_SHADOW_MODEL_ID
      )
    ).toBe(true);
    expect(isShadowModelCommitAllowlisted(CANDIDATE_B_ELO_GENERIC_SHADOW_MODEL_ID)).toBe(true);
    expect(
      shadowModelCommitAuthorizationError('PREVIEW', CANDIDATE_B_ELO_GENERIC_SHADOW_MODEL_ID)
    ).toBeNull();
    expect(
      shadowModelCommitAuthorizationError('COMMIT', CANDIDATE_B_ELO_GENERIC_SHADOW_MODEL_ID)
    ).toBeNull();
  });

  it('extends Generic T-30 support through the shared model allowlist', () => {
    const t30 = fs.readFileSync(T30, 'utf8');
    const supportedBlock = t30.slice(
      t30.indexOf('GENERIC_SHADOW_T30_SUPPORTED_MODEL_IDS'),
      t30.indexOf('export type GenericShadowT30SupportedModelId')
    );
    expect(supportedBlock).toContain('core_v1_shadow_baseline_v1');
    expect(supportedBlock).toContain('candidate_b_roster_prior_v1');
    expect(supportedBlock).toContain('candidate_b_elo_prior_v1');
  });

  it('hard-gates Week 1-4 before Prisma and keeps exact confirmation on Elo COMMIT', () => {
    const cli = fs.readFileSync(CLI, 'utf8');
    const wf = fs.readFileSync(WF, 'utf8');
    const mainSrc = cli.slice(cli.indexOf('async function main()'));

    expect(mainSrc).toContain('candidate_b_elo_prior_not_authorized_before_week_5');
    expect(mainSrc.indexOf('candidate_b_elo_prior_not_authorized_before_week_5')).toBeLessThan(
      mainSrc.indexOf('new PrismaClient()')
    );
    expect(wf).toContain('candidate_b_elo_prior_v1 first prospective observation is Week 5');
    expect(wf).not.toContain(
      'candidate_b_elo_prior_v1 is PREVIEW-only; COMMIT is not authorized'
    );
    expect(wf).toContain('COMMIT requires confirm=${EXPECTED}');
    expect(wf).toContain('CFBD_API_KEY: not provided');
    expect(wf).toContain('ODDS_API_KEY: not provided');
  });
});
