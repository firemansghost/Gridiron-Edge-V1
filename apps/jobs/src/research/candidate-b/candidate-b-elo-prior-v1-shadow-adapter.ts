/**
 * Candidate B Elo Prior V1 Generic Shadow adapter.
 *
 * Research-only PREVIEW implementation. Reads only the repo-pinned, hash-verified
 * 2026 preseason Elo artifact. No provider calls. No DB feature writes.
 */

import {
  computeATSEdgeHma,
  computeEffectiveHfa,
  getATSPick,
} from '../../../../web/lib/core-v1-spread';
import { SPREAD_EDGE_FLOOR } from '../../../../web/lib/core-v1-weekly-card';
import {
  isFiniteNumber,
  sha256CanonicalJson,
  teamSidedPickValue,
  toDate,
  type ShadowModelDefinition,
  type ShadowModelUnavailableReason,
} from '../../../../web/lib/shadow-model-capture-v1';
import manifest from '../../../../../research/candidate-b/CANDIDATE_B_ELO_PRIOR_V1_GENERIC_SHADOW_MANIFEST.json';
import {
  CANDIDATE_B_ELO_DERIVED_ARTIFACT_HASH,
  CANDIDATE_B_ELO_FEATURE_DEFINITION_ID,
  CANDIDATE_B_ELO_FEATURE_DEFINITION_VERSION,
  CANDIDATE_B_ELO_MODEL_ID,
  CANDIDATE_B_ELO_SOURCE_RAW_SHA256,
  loadCandidateBEloPriorRuntimeArtifact,
  type CandidateBEloRuntimeTeamRow,
} from './candidate-b-elo-prior-v1-runtime-artifact';

export const CANDIDATE_B_ELO_GENERIC_SHADOW_MODEL_ID = CANDIDATE_B_ELO_MODEL_ID;
export const CANDIDATE_B_ELO_GENERIC_SHADOW_MODEL_FAMILY = 'candidate_b_elo_prior';
export const CANDIDATE_B_ELO_GENERIC_SHADOW_POLICY_DEFINITION_ID =
  'candidate_b_elo_prior_spread_policy_v1';
export const CANDIDATE_B_ELO_FIRST_PROSPECTIVE_WEEK = 5 as const;

export const FROZEN_CANDIDATE_B_ELO_MODEL_DEFINITION_HASH =
  'd9f469f5c9ac252bd93de2c94653c8ec9a5c967231f2197af8fba60453751add';
export const FROZEN_CANDIDATE_B_ELO_FEATURE_DEFINITION_HASH =
  'd056deba3e625deda6b95ffab04130294c4f47d28cd093a3f81d34c06a58888c';
export const FROZEN_CANDIDATE_B_ELO_POLICY_DEFINITION_HASH =
  'f82f24fdbeb56488f21c48051aad0093841ea21452fa6f6b88ebab0a999e5035';
export const FROZEN_CANDIDATE_B_ELO_GENERIC_SHADOW_MANIFEST_HASH =
  '2956bb3a6ba00fb2b6ff277398eba5c440f4431d751f313da7901fddb7a29b84';

export const CANDIDATE_B_ELO_MODEL_DEFINITION_MANIFEST = manifest.modelDefinition;
export const CANDIDATE_B_ELO_FEATURE_DEFINITION_MANIFEST = manifest.featureDefinition;
export const CANDIDATE_B_ELO_POLICY_DEFINITION_MANIFEST = manifest.policyDefinition;

export const CANDIDATE_B_ELO_MODEL_DEFINITION_HASH = sha256CanonicalJson(
  CANDIDATE_B_ELO_MODEL_DEFINITION_MANIFEST
);
export const CANDIDATE_B_ELO_FEATURE_DEFINITION_HASH = sha256CanonicalJson(
  CANDIDATE_B_ELO_FEATURE_DEFINITION_MANIFEST
);
export const CANDIDATE_B_ELO_POLICY_DEFINITION_HASH = sha256CanonicalJson(
  CANDIDATE_B_ELO_POLICY_DEFINITION_MANIFEST
);

const manifestBase = { ...manifest } as Record<string, unknown>;
delete manifestBase.manifestHash;
const computedManifestHash = sha256CanonicalJson(manifestBase);

if (computedManifestHash !== FROZEN_CANDIDATE_B_ELO_GENERIC_SHADOW_MANIFEST_HASH) {
  throw new Error('candidate_b_elo_generic_shadow_manifest_hash_mismatch:' + computedManifestHash);
}
if (manifest.manifestHash !== FROZEN_CANDIDATE_B_ELO_GENERIC_SHADOW_MANIFEST_HASH) {
  throw new Error('candidate_b_elo_generic_shadow_manifest_hash_field_mismatch');
}
if (CANDIDATE_B_ELO_MODEL_DEFINITION_HASH !== FROZEN_CANDIDATE_B_ELO_MODEL_DEFINITION_HASH) {
  throw new Error('candidate_b_elo_model_definition_hash_mismatch');
}
if (CANDIDATE_B_ELO_FEATURE_DEFINITION_HASH !== FROZEN_CANDIDATE_B_ELO_FEATURE_DEFINITION_HASH) {
  throw new Error('candidate_b_elo_feature_definition_hash_mismatch');
}
if (CANDIDATE_B_ELO_POLICY_DEFINITION_HASH !== FROZEN_CANDIDATE_B_ELO_POLICY_DEFINITION_HASH) {
  throw new Error('candidate_b_elo_policy_definition_hash_mismatch');
}
if (manifest.hashes.modelDefinitionHash !== FROZEN_CANDIDATE_B_ELO_MODEL_DEFINITION_HASH) {
  throw new Error('candidate_b_elo_model_definition_hash_field_mismatch');
}
if (manifest.hashes.featureDefinitionHash !== FROZEN_CANDIDATE_B_ELO_FEATURE_DEFINITION_HASH) {
  throw new Error('candidate_b_elo_feature_definition_hash_field_mismatch');
}
if (manifest.hashes.policyDefinitionHash !== FROZEN_CANDIDATE_B_ELO_POLICY_DEFINITION_HASH) {
  throw new Error('candidate_b_elo_policy_definition_hash_field_mismatch');
}

function toIso(value: Date | string | null | undefined): string | null {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

function teamPayload(row: CandidateBEloRuntimeTeamRow | undefined, teamId: string) {
  return {
    teamId: row?.teamId ?? teamId,
    providerTeam: row?.providerTeam ?? null,
    conference: row?.conference ?? null,
    rawElo: row?.rawElo ?? null,
    zElo: row?.zElo ?? null,
    candidateBEloTeamRatingPoints: row?.candidateBEloTeamRatingPoints ?? null,
    resolutionMethod: row?.resolutionMethod ?? null,
    sourceRawRowIndex: row?.sourceRawRowIndex ?? null,
    rowHash: row?.rowHash ?? null,
  };
}

function teamProvenance(row: CandidateBEloRuntimeTeamRow | undefined, teamId: string) {
  return {
    teamId: row?.teamId ?? teamId,
    available: Boolean(row),
    rawElo: row?.rawElo ?? null,
    zElo: row?.zElo ?? null,
    candidateBEloTeamRatingPoints: row?.candidateBEloTeamRatingPoints ?? null,
    rowHash: row?.rowHash ?? null,
  };
}

export function computeCandidateBEloShadowHma(input: {
  homeTeamId: string;
  homeCandidateBEloTeamRatingPoints: number;
  awayCandidateBEloTeamRatingPoints: number;
  neutralSite: boolean;
}): number {
  const hfa = computeEffectiveHfa(input.homeTeamId, input.neutralSite).effectiveHfa;
  return (
    input.homeCandidateBEloTeamRatingPoints -
    input.awayCandidateBEloTeamRatingPoints +
    hfa
  );
}

export function createCandidateBEloPriorShadowDefinition(): ShadowModelDefinition {
  const artifact = loadCandidateBEloPriorRuntimeArtifact();
  const teamsById = new Map(artifact.teams.map((row) => [row.teamId, row] as const));

  if (artifact.artifactHash !== CANDIDATE_B_ELO_DERIVED_ARTIFACT_HASH) {
    throw new Error('candidate_b_elo_runtime_artifact_hash_unexpected');
  }
  if (artifact.source.rawSha256 !== CANDIDATE_B_ELO_SOURCE_RAW_SHA256) {
    throw new Error('candidate_b_elo_runtime_raw_hash_unexpected');
  }

  return {
    modelFamily: CANDIDATE_B_ELO_GENERIC_SHADOW_MODEL_FAMILY,
    modelDefinitionId: CANDIDATE_B_ELO_GENERIC_SHADOW_MODEL_ID,
    modelDefinitionManifest: {
      ...CANDIDATE_B_ELO_MODEL_DEFINITION_MANIFEST,
    },
    modelDefinitionHash: CANDIDATE_B_ELO_MODEL_DEFINITION_HASH,
    featureDefinitionId: CANDIDATE_B_ELO_FEATURE_DEFINITION_ID,
    featureDefinitionVersion: CANDIDATE_B_ELO_FEATURE_DEFINITION_VERSION,
    featureDefinitionManifest: {
      ...CANDIDATE_B_ELO_FEATURE_DEFINITION_MANIFEST,
    },
    featureDefinitionHash: CANDIDATE_B_ELO_FEATURE_DEFINITION_HASH,
    policyDefinitionId: CANDIDATE_B_ELO_GENERIC_SHADOW_POLICY_DEFINITION_ID,
    policyDefinitionManifest: {
      ...CANDIDATE_B_ELO_POLICY_DEFINITION_MANIFEST,
    },
    policyDefinitionHash: CANDIDATE_B_ELO_POLICY_DEFINITION_HASH,
    marketType: 'SPREAD',
    evaluateGame(input) {
      const unavailableReasons: ShadowModelUnavailableReason[] = [];
      const homeRow = teamsById.get(input.game.homeTeamId);
      const awayRow = teamsById.get(input.game.awayTeamId);

      if (!homeRow || !awayRow) {
        unavailableReasons.push('team_feature_vector_unavailable');
      }

      if (input.marketStatus === 'missing_market') {
        // Engine records missing_market.
      } else if (input.marketStatus === 'incoherent_market') {
        // Engine records incoherent_market.
      } else if (input.marketStatus === 'stale_market') {
        // Engine records stale_market.
      } else if (!input.market) {
        unavailableReasons.push('missing_market');
      }

      const hfa = computeEffectiveHfa(input.game.homeTeamId, Boolean(input.game.neutralSite));

      let modelValue: number | null = null;
      let edgeValue: number | null = null;
      let absEdgeValue: number | null = null;
      let selectedSide: ReturnType<ShadowModelDefinition['evaluateGame']>['selectedSide'] = null;
      let selectedTeamId: string | null = null;
      let predictionPickValue: number | null = null;

      if (unavailableReasons.length === 0 && homeRow && awayRow && input.market) {
        modelValue = computeCandidateBEloShadowHma({
          homeTeamId: input.game.homeTeamId,
          homeCandidateBEloTeamRatingPoints: homeRow.candidateBEloTeamRatingPoints,
          awayCandidateBEloTeamRatingPoints: awayRow.candidateBEloTeamRatingPoints,
          neutralSite: Boolean(input.game.neutralSite),
        });
        edgeValue = computeATSEdgeHma(modelValue, input.market.canonicalMarketValue);
        absEdgeValue = Math.abs(edgeValue);

        const ats = getATSPick(
          modelValue,
          input.market.canonicalMarketValue,
          input.game.homeTeamId,
          input.game.awayTeamId,
          input.game.homeTeamId,
          input.game.awayTeamId,
          SPREAD_EDGE_FLOOR
        );

        if (!ats.recommendedTeamId) {
          selectedSide = 'NO_SELECTION';
        } else if (ats.recommendedTeamId === input.game.homeTeamId) {
          selectedSide = 'HOME';
          selectedTeamId = input.game.homeTeamId;
          predictionPickValue = teamSidedPickValue(true, input.market.canonicalMarketValue);
        } else {
          selectedSide = 'AWAY';
          selectedTeamId = input.game.awayTeamId;
          predictionPickValue = teamSidedPickValue(false, input.market.canonicalMarketValue);
        }

        if (!isFiniteNumber(modelValue) || !isFiniteNumber(edgeValue)) {
          unavailableReasons.push('invalid_model_output');
          modelValue = null;
          edgeValue = null;
          absEdgeValue = null;
          selectedSide = null;
          selectedTeamId = null;
          predictionPickValue = null;
        }
      }

      const featureProvenance = {
        featureArtifactId: artifact.artifactId,
        featureArtifactHash: artifact.artifactHash,
        sourceRawSha256: artifact.source.rawSha256,
        sourceAuditReportSha256: artifact.source.auditReportSha256,
        discoveryRunId: artifact.source.discoveryRunId,
        firstProspectiveWeek: CANDIDATE_B_ELO_FIRST_PROSPECTIVE_WEEK,
        home: teamProvenance(homeRow, input.game.homeTeamId),
        away: teamProvenance(awayRow, input.game.awayTeamId),
        hfa: {
          effectiveHfa: hfa.effectiveHfa,
          baseHfa: hfa.baseHfa,
          teamAdjustment: hfa.teamAdjustment,
          rawHfa: hfa.rawHfa,
        },
      };

      const inputPayload = {
        gameId: input.game.id,
        season: input.game.season,
        week: input.game.week,
        homeTeamId: input.game.homeTeamId,
        awayTeamId: input.game.awayTeamId,
        neutralSite: Boolean(input.game.neutralSite),
        kickoffTimestamp: toIso(input.game.kickoffTimestamp),
        predictionTimestamp: input.predictionTimestamp.toISOString(),
        featureArtifactId: artifact.artifactId,
        featureArtifactHash: artifact.artifactHash,
        sourceRawSha256: artifact.source.rawSha256,
        modelDefinitionId: CANDIDATE_B_ELO_GENERIC_SHADOW_MODEL_ID,
        featureDefinitionId: CANDIDATE_B_ELO_FEATURE_DEFINITION_ID,
        policyDefinitionId: CANDIDATE_B_ELO_GENERIC_SHADOW_POLICY_DEFINITION_ID,
        home: teamPayload(homeRow, input.game.homeTeamId),
        away: teamPayload(awayRow, input.game.awayTeamId),
        hfa: {
          homeTeamId: input.game.homeTeamId,
          neutralSite: Boolean(input.game.neutralSite),
          effectiveHfa: hfa.effectiveHfa,
          baseHfa: hfa.baseHfa,
          teamAdjustment: hfa.teamAdjustment,
          rawHfa: hfa.rawHfa,
        },
        market: input.market
          ? {
              selectedMarketLineId: input.market.selectedMarketLineId,
              selectedMarketTeamId: input.market.selectedMarketTeamId,
              selectedMarketLineValue: input.market.selectedMarketLineValue,
              canonicalMarketValue: input.market.canonicalMarketValue,
              marketTimestamp: input.market.marketTimestamp.toISOString(),
              marketAgeSeconds: input.market.marketAgeSeconds,
              marketBook: input.market.marketBook,
              marketSource: input.market.marketSource,
              marketProvenance: input.market.marketProvenance,
              homeRowId: input.market.homeRowId,
              awayRowId: input.market.awayRowId,
              homeLine: input.market.homeLine,
              awayLine: input.market.awayLine,
            }
          : null,
      };

      const modelOutput = {
        modelValue,
        edgeValue,
        absEdgeValue,
        selectedSide,
        selectedTeamId,
        predictionPickValue,
        edgeFloor: SPREAD_EDGE_FLOOR,
        selectionSource: 'getATSPick',
      };

      return {
        unavailableReasons,
        inputPayload,
        featureProvenance,
        modelOutput,
        modelValue,
        edgeValue,
        absEdgeValue,
        selectedSide,
        selectedTeamId,
        predictionPickValue,
      };
    },
  };
}
