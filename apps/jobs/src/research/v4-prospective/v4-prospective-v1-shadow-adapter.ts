import {
  MAX_SHADOW_MODEL_MARKET_AGE_MS,
  MAX_SHADOW_MODEL_MARKET_AGE_SECONDS,
  SHADOW_MODEL_EVALUATION_PROTOCOL,
  isFiniteNumber,
  sha256CanonicalJson,
  teamSidedPickValue,
  toDate,
  type ShadowModelDefinition,
  type ShadowModelUnavailableReason,
} from '../../../../web/lib/shadow-model-capture-v1';
import {
  V4_PROSPECTIVE_HFA_POINTS,
  V4_PROSPECTIVE_MODEL_FAMILY,
  V4_PROSPECTIVE_MODEL_ID,
  V4_PROSPECTIVE_RUNTIME_ARTIFACT_HASH,
  V4_PROSPECTIVE_SELECTION_THRESHOLD_ABS,
  V4_PROSPECTIVE_TARGET_WEEK,
  loadV4ProspectiveRuntimeArtifact,
  type V4ProspectiveRuntimeTeamRow,
} from './v4-prospective-v1-runtime-artifact';

export const V4_PROSPECTIVE_GENERIC_SHADOW_MODEL_ID = V4_PROSPECTIVE_MODEL_ID;
export const V4_PROSPECTIVE_GENERIC_SHADOW_MODEL_FAMILY =
  V4_PROSPECTIVE_MODEL_FAMILY;
export const V4_PROSPECTIVE_FEATURE_DEFINITION_ID =
  'v4_prospective_v1_week4_w1_w3_rating_artifact';
export const V4_PROSPECTIVE_FEATURE_DEFINITION_VERSION = 'v1';
export const V4_PROSPECTIVE_POLICY_DEFINITION_ID =
  'v4_prospective_v1_spread_policy_v1';

const artifact = loadV4ProspectiveRuntimeArtifact();

export const V4_PROSPECTIVE_FEATURE_DEFINITION_MANIFEST = {
  id: V4_PROSPECTIVE_FEATURE_DEFINITION_ID,
  version: V4_PROSPECTIVE_FEATURE_DEFINITION_VERSION,
  source: 'repo_pinned_audited_runtime_artifact',
  artifactId: artifact.artifactId,
  artifactHash: artifact.artifactHash,
  sourceRunId: artifact.sourceRunId,
  sourceRepoSha: artifact.sourceRepoSha,
  sourceArtifactId: artifact.sourceArtifactId,
  sourceArtifactArchiveSha256: artifact.sourceArtifactArchiveSha256,
  teamRatingsSha256: artifact.teamRatingsSha256,
  completedSourceWeeks: artifact.completedSourceWeeks,
  targetWeek: artifact.targetWeek,
  teamCount: artifact.teamCount,
  finalScoreValidation: {
    exactMatches: artifact.finalScoreExactMatches,
    expectedGames: artifact.finalScoreExpectedGames,
  },
  scoringAudit: {
    rows: artifact.scoringRows,
    invalidEvents: artifact.invalidScoringEvents,
  },
} as const;

export const V4_PROSPECTIVE_MODEL_DEFINITION_MANIFEST = {
  id: V4_PROSPECTIVE_GENERIC_SHADOW_MODEL_ID,
  version: 'generic_shadow_v1',
  family: V4_PROSPECTIVE_GENERIC_SHADOW_MODEL_FAMILY,
  official: false,
  productionHold: true,
  status: 'SHADOW / RESEARCH ONLY — NOT OFFICIAL',
  marketType: 'spread',
  formula: {
    expression:
      'homeRating + (neutralSite ? 0 : 2.0) - awayRating',
    hfaPoints: V4_PROSPECTIVE_HFA_POINTS,
    neutralHfaPoints: 0,
    ratingSource: 'repo_pinned_audited_runtime_artifact',
    noCoreBlend: true,
    noHybridBlend: true,
    noFallback: true,
  },
  featureArtifactHash: V4_PROSPECTIVE_RUNTIME_ARTIFACT_HASH,
} as const;

export const V4_PROSPECTIVE_POLICY_DEFINITION_MANIFEST = {
  id: V4_PROSPECTIVE_POLICY_DEFINITION_ID,
  version: 'generic_shadow_v1',
  evaluationProtocol: SHADOW_MODEL_EVALUATION_PROTOCOL,
  predictionMarket: {
    marketType: 'spread',
    selectorId: 'core_v1_coherent_spread_pair_v1',
    authorizedSource: 'oddsapi',
    coherentHomeAwayPairRequired: true,
    freshnessMaxSeconds: MAX_SHADOW_MODEL_MARKET_AGE_SECONDS,
    freshnessMaxMilliseconds: MAX_SHADOW_MODEL_MARKET_AGE_MS,
    eligibility: 'marketTimestamp <= predictionTimestamp',
    noFutureMarketFallback: true,
  },
  selection: {
    edgeFormula: 'edgeValue = modelValue - canonicalMarketValue',
    thresholdAbs: V4_PROSPECTIVE_SELECTION_THRESHOLD_ABS,
    noSelection: 'abs(edgeValue) < 0.1',
    home: 'edgeValue >= +0.1',
    away: 'edgeValue <= -0.1',
    noSelectionRemainsAvailable: true,
  },
  postKickoff: 'unavailable',
  noRetrospectiveBackfill: true,
  researchOnly: true,
} as const;

export const V4_PROSPECTIVE_MODEL_DEFINITION_HASH = sha256CanonicalJson(
  V4_PROSPECTIVE_MODEL_DEFINITION_MANIFEST
);
export const V4_PROSPECTIVE_FEATURE_DEFINITION_HASH = sha256CanonicalJson(
  V4_PROSPECTIVE_FEATURE_DEFINITION_MANIFEST
);
export const V4_PROSPECTIVE_POLICY_DEFINITION_HASH = sha256CanonicalJson(
  V4_PROSPECTIVE_POLICY_DEFINITION_MANIFEST
);

function toIso(value: Date | string | null | undefined): string | null {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

function teamPayload(row: V4ProspectiveRuntimeTeamRow | undefined, teamId: string) {
  return {
    teamId: row?.teamId ?? teamId,
    rating: row?.rating ?? null,
    rowHash: row?.rowHash ?? null,
  };
}

export function computeV4ProspectiveHma(input: {
  homeRating: number;
  awayRating: number;
  neutralSite: boolean;
}): number {
  return (
    input.homeRating +
    (input.neutralSite ? 0 : V4_PROSPECTIVE_HFA_POINTS) -
    input.awayRating
  );
}

export function createV4ProspectiveShadowDefinition(): ShadowModelDefinition {
  if (artifact.targetWeek !== V4_PROSPECTIVE_TARGET_WEEK) {
    throw new Error('v4_prospective_runtime_target_week_unexpected');
  }
  const teamsById = new Map(artifact.teams.map((row) => [row.teamId, row] as const));

  return {
    modelFamily: V4_PROSPECTIVE_GENERIC_SHADOW_MODEL_FAMILY,
    modelDefinitionId: V4_PROSPECTIVE_GENERIC_SHADOW_MODEL_ID,
    modelDefinitionManifest: { ...V4_PROSPECTIVE_MODEL_DEFINITION_MANIFEST },
    modelDefinitionHash: V4_PROSPECTIVE_MODEL_DEFINITION_HASH,
    featureDefinitionId: V4_PROSPECTIVE_FEATURE_DEFINITION_ID,
    featureDefinitionVersion: V4_PROSPECTIVE_FEATURE_DEFINITION_VERSION,
    featureDefinitionManifest: { ...V4_PROSPECTIVE_FEATURE_DEFINITION_MANIFEST },
    featureDefinitionHash: V4_PROSPECTIVE_FEATURE_DEFINITION_HASH,
    policyDefinitionId: V4_PROSPECTIVE_POLICY_DEFINITION_ID,
    policyDefinitionManifest: { ...V4_PROSPECTIVE_POLICY_DEFINITION_MANIFEST },
    policyDefinitionHash: V4_PROSPECTIVE_POLICY_DEFINITION_HASH,
    marketType: 'SPREAD',
    evaluateGame(input) {
      const unavailableReasons: ShadowModelUnavailableReason[] = [];
      const homeRow = teamsById.get(input.game.homeTeamId);
      const awayRow = teamsById.get(input.game.awayTeamId);

      if (input.game.week !== V4_PROSPECTIVE_TARGET_WEEK) {
        unavailableReasons.push('team_feature_vector_unavailable');
      }
      if (!homeRow || !awayRow) {
        unavailableReasons.push('team_feature_vector_unavailable');
      }
      if (!input.market && input.marketStatus == null) {
        unavailableReasons.push('missing_market');
      }

      let modelValue: number | null = null;
      let edgeValue: number | null = null;
      let absEdgeValue: number | null = null;
      let selectedSide: ReturnType<ShadowModelDefinition['evaluateGame']>['selectedSide'] = null;
      let selectedTeamId: string | null = null;
      let predictionPickValue: number | null = null;

      if (
        unavailableReasons.length === 0 &&
        homeRow &&
        awayRow &&
        input.market
      ) {
        modelValue = computeV4ProspectiveHma({
          homeRating: homeRow.rating,
          awayRating: awayRow.rating,
          neutralSite: Boolean(input.game.neutralSite),
        });
        edgeValue = modelValue - input.market.canonicalMarketValue;
        absEdgeValue = Math.abs(edgeValue);

        if (absEdgeValue < V4_PROSPECTIVE_SELECTION_THRESHOLD_ABS) {
          selectedSide = 'NO_SELECTION';
        } else if (edgeValue > 0) {
          selectedSide = 'HOME';
          selectedTeamId = input.game.homeTeamId;
          predictionPickValue = teamSidedPickValue(
            true,
            input.market.canonicalMarketValue
          );
        } else {
          selectedSide = 'AWAY';
          selectedTeamId = input.game.awayTeamId;
          predictionPickValue = teamSidedPickValue(
            false,
            input.market.canonicalMarketValue
          );
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
        artifactId: artifact.artifactId,
        artifactHash: artifact.artifactHash,
        sourceRunId: artifact.sourceRunId,
        sourceRepoSha: artifact.sourceRepoSha,
        sourceArtifactId: artifact.sourceArtifactId,
        sourceArtifactArchiveSha256: artifact.sourceArtifactArchiveSha256,
        teamRatingsSha256: artifact.teamRatingsSha256,
        home: teamPayload(homeRow, input.game.homeTeamId),
        away: teamPayload(awayRow, input.game.awayTeamId),
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
        artifactId: artifact.artifactId,
        artifactHash: artifact.artifactHash,
        home: teamPayload(homeRow, input.game.homeTeamId),
        away: teamPayload(awayRow, input.game.awayTeamId),
        hfaPoints: input.game.neutralSite ? 0 : V4_PROSPECTIVE_HFA_POINTS,
        market: input.market
          ? {
              canonicalMarketValue: input.market.canonicalMarketValue,
              selectedMarketLineId: input.market.selectedMarketLineId,
              marketTimestamp: input.market.marketTimestamp.toISOString(),
              marketAgeSeconds: input.market.marketAgeSeconds,
              marketBook: input.market.marketBook,
              marketSource: input.market.marketSource,
              marketProvenance: input.market.marketProvenance,
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
        thresholdAbs: V4_PROSPECTIVE_SELECTION_THRESHOLD_ABS,
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
