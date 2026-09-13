/**
 * Core V1 Shadow Baseline adapter — first model on Shadow Model Capture V1.
 *
 * Reuses production Core V1 spread math (V1 ratings + computeEffectiveHfa) and
 * official-card selection semantics (getATSPick / SPREAD_EDGE_FLOOR = 0.1).
 * Does not change Core V1 math, write Bet rows, or activate Hybrid.
 */

import {
  computeATSEdgeHma,
  computeEffectiveHfa,
  getATSPick,
} from '../core-v1-spread';
import { SPREAD_EDGE_FLOOR } from '../core-v1-weekly-card';
import hfaConfig from '../data/core_v1_hfa_config.json';
import {
  SHADOW_MODEL_EVALUATION_PROTOCOL,
  MAX_SHADOW_MODEL_MARKET_AGE_SECONDS,
  MAX_SHADOW_MODEL_MARKET_AGE_MS,
  isFiniteNumber,
  sha256CanonicalJson,
  teamSidedPickValue,
  toDate,
  type ShadowModelDefinition,
  type ShadowModelUnavailableReason,
  type ShadowModelSelectedSide,
  type ShadowModelRatingRow,
} from '../shadow-model-capture-v1';

export const CORE_V1_SHADOW_BASELINE_MODEL_ID = 'core_v1_shadow_baseline_v1';
export const CORE_V1_SHADOW_BASELINE_FAMILY = 'core_v1';
export const CORE_V1_SHADOW_FEATURE_DEFINITION_ID = 'core_v1_ratings_hfa_v1';
export const CORE_V1_SHADOW_FEATURE_DEFINITION_VERSION = 'v1';
export const CORE_V1_SHADOW_POLICY_DEFINITION_ID = 'core_v1_shadow_baseline_policy_v1';

function ratingUsedValue(row: ShadowModelRatingRow): number | null {
  if (isFiniteNumber(row.powerRating)) return row.powerRating;
  if (isFiniteNumber(row.rating)) return row.rating;
  return null;
}

function toIso(value: Date | string | null | undefined): string | null {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

function provenanceIsFuture(
  createdAt: Date | string | null | undefined,
  updatedAt: Date | string | null | undefined,
  predictionTimestamp: Date
): boolean {
  const created = toDate(createdAt);
  const updated = toDate(updatedAt);
  if (created && created.getTime() > predictionTimestamp.getTime()) return true;
  if (updated && updated.getTime() > predictionTimestamp.getTime()) return true;
  return false;
}

/** Exact production Core V1 HMA when V1 ratings are present. */
export function computeCoreV1ShadowBaselineHma(input: {
  homeTeamId: string;
  homeRating: number;
  awayRating: number;
  neutralSite: boolean;
}): number {
  const hfaPoints = computeEffectiveHfa(input.homeTeamId, input.neutralSite).effectiveHfa;
  return input.homeRating - input.awayRating + hfaPoints;
}

export const CORE_V1_SHADOW_BASELINE_MODEL_MANIFEST = {
  id: CORE_V1_SHADOW_BASELINE_MODEL_ID,
  version: 'shadow_model_capture_v1',
  family: CORE_V1_SHADOW_BASELINE_FAMILY,
  official: false,
  productionHold: true,
  status: 'SHADOW / RESEARCH ONLY — NOT OFFICIAL',
  marketType: 'spread',
  formula: {
    identity: 'production_core_v1_v1_ratings_path',
    expression:
      'homeV1Rating - awayV1Rating + computeEffectiveHfa(homeTeamId, neutralSite).effectiveHfa',
    sourceModule: 'apps/web/lib/core-v1-spread.ts#computeEffectiveHfa',
    noSilentZeroFill: true,
    noHybridBlend: true,
    noUnitGrades: true,
  },
  hfa: {
    source: 'apps/web/lib/data/core_v1_hfa_config.json',
    baseHfaPoints: (hfaConfig as { baseHfaPoints: number }).baseHfaPoints,
    clipRange: (hfaConfig as { clipRange: number[] }).clipRange,
    neutralSite: 0,
  },
} as const;

export const CORE_V1_SHADOW_FEATURE_DEFINITION_MANIFEST = {
  id: CORE_V1_SHADOW_FEATURE_DEFINITION_ID,
  version: CORE_V1_SHADOW_FEATURE_DEFINITION_VERSION,
  required: {
    ratings: {
      modelVersion: 'v1',
      fields: ['powerRating|rating', 'createdAt', 'updatedAt'],
      provenanceMustBeAtOrBeforePredictionTimestamp: true,
      missingFailsClosed: true,
      noSilentZeroFill: true,
    },
    market: {
      lineType: 'spread',
      source: 'persisted_MarketLine_only',
      noProviderFetch: true,
    },
  },
} as const;

export const CORE_V1_SHADOW_POLICY_DEFINITION_MANIFEST = {
  id: CORE_V1_SHADOW_POLICY_DEFINITION_ID,
  version: 'shadow_model_capture_v1',
  evaluationProtocol: SHADOW_MODEL_EVALUATION_PROTOCOL,
  predictionMarket: {
    marketType: 'spread',
    selectorId: 'core_v1_coherent_spread_pair_v1',
    authorizedSource: 'oddsapi',
    coherentHomeAwayPairRequired: true,
    reuseModules: [
      'apps/web/lib/market-line-snapshot.ts#selectBookSpreadSnapshots',
      'apps/web/lib/market-line-snapshot.ts#pickDisplaySpread',
    ],
    freshnessMaxSeconds: MAX_SHADOW_MODEL_MARKET_AGE_SECONDS,
    freshnessMaxMilliseconds: MAX_SHADOW_MODEL_MARKET_AGE_MS,
    eligibility: 'marketTimestamp <= predictionTimestamp',
    ordering: ['timestamp DESC', 'homeRowId DESC (via pickDisplaySpread)'],
    noFutureMarketFallback: true,
    loneTeamRowNotSufficient: true,
  },
  selection: {
    source: 'apps/web/lib/core-v1-spread.ts#getATSPick',
    edgeFloor: SPREAD_EDGE_FLOOR,
    edgeFormula: 'edgeValue = modelValue - canonicalMarketValue (HMA)',
    sides: {
      noSelection: 'abs(edgeValue) < 0.1',
      home: 'edgeValue >= +0.1 (via getATSPick edge > 0 after floor)',
      away: 'edgeValue <= -0.1 (via getATSPick edge < 0 after floor)',
    },
    noSelectionRemainsAvailable: true,
    teamSidedPickValue: {
      HOME: '-canonicalMarketValue',
      AWAY: '+canonicalMarketValue',
      NO_SELECTION: null,
    },
    officialCardParity: {
      planner: 'apps/web/lib/core-v1-weekly-card.ts#planSpreadBet',
      edgeFloorConstant: 'SPREAD_EDGE_FLOOR',
      note: 'Shadow baseline freezes selection semantics; does not write Bet rows.',
    },
  },
  postKickoff: 'unavailable',
  noRetrospectiveBackfill: true,
  researchOnly: true,
} as const;

export const CORE_V1_SHADOW_BASELINE_MODEL_HASH = sha256CanonicalJson(
  CORE_V1_SHADOW_BASELINE_MODEL_MANIFEST
);
export const CORE_V1_SHADOW_FEATURE_DEFINITION_HASH = sha256CanonicalJson(
  CORE_V1_SHADOW_FEATURE_DEFINITION_MANIFEST
);
export const CORE_V1_SHADOW_POLICY_DEFINITION_HASH = sha256CanonicalJson(
  CORE_V1_SHADOW_POLICY_DEFINITION_MANIFEST
);

export function createCoreV1ShadowBaselineDefinition(): ShadowModelDefinition {
  return {
    modelFamily: CORE_V1_SHADOW_BASELINE_FAMILY,
    modelDefinitionId: CORE_V1_SHADOW_BASELINE_MODEL_ID,
    modelDefinitionManifest: {
      ...CORE_V1_SHADOW_BASELINE_MODEL_MANIFEST,
    },
    modelDefinitionHash: CORE_V1_SHADOW_BASELINE_MODEL_HASH,
    featureDefinitionId: CORE_V1_SHADOW_FEATURE_DEFINITION_ID,
    featureDefinitionVersion: CORE_V1_SHADOW_FEATURE_DEFINITION_VERSION,
    featureDefinitionManifest: {
      ...CORE_V1_SHADOW_FEATURE_DEFINITION_MANIFEST,
    },
    featureDefinitionHash: CORE_V1_SHADOW_FEATURE_DEFINITION_HASH,
    policyDefinitionId: CORE_V1_SHADOW_POLICY_DEFINITION_ID,
    policyDefinitionManifest: {
      ...CORE_V1_SHADOW_POLICY_DEFINITION_MANIFEST,
    },
    policyDefinitionHash: CORE_V1_SHADOW_POLICY_DEFINITION_HASH,
    marketType: 'SPREAD',
    evaluateGame(input) {
      const unavailableReasons: ShadowModelUnavailableReason[] = [];
      const homeRating = input.frame.ratings.find(
        (r) =>
          r.teamId === input.game.homeTeamId &&
          r.season === input.game.season &&
          r.modelVersion === 'v1'
      );
      const awayRating = input.frame.ratings.find(
        (r) =>
          r.teamId === input.game.awayTeamId &&
          r.season === input.game.season &&
          r.modelVersion === 'v1'
      );

      const homeValue = homeRating ? ratingUsedValue(homeRating) : null;
      const awayValue = awayRating ? ratingUsedValue(awayRating) : null;

      if (homeValue == null || awayValue == null) {
        unavailableReasons.push('missing_rating');
      } else if (
        !homeRating ||
        !awayRating ||
        !toDate(homeRating.createdAt) ||
        !toDate(homeRating.updatedAt) ||
        !toDate(awayRating.createdAt) ||
        !toDate(awayRating.updatedAt)
      ) {
        unavailableReasons.push('rating_provenance_unavailable');
      } else if (
        provenanceIsFuture(
          homeRating.createdAt,
          homeRating.updatedAt,
          input.predictionTimestamp
        ) ||
        provenanceIsFuture(
          awayRating.createdAt,
          awayRating.updatedAt,
          input.predictionTimestamp
        )
      ) {
        unavailableReasons.push('rating_provenance_unavailable');
      }

      if (input.marketStatus === 'missing_market') {
        // Engine already records missing_market; adapter does not invent a market.
      } else if (input.marketStatus === 'incoherent_market') {
        // Engine already records incoherent_market.
      } else if (input.marketStatus === 'stale_market') {
        // Engine already records stale_market.
      } else if (!input.market) {
        unavailableReasons.push('missing_market');
      }

      let modelValue: number | null = null;
      let edgeValue: number | null = null;
      let absEdgeValue: number | null = null;
      let selectedSide: ShadowModelSelectedSide | null = null;
      let selectedTeamId: string | null = null;
      let predictionPickValue: number | null = null;

      if (
        unavailableReasons.length === 0 &&
        homeValue != null &&
        awayValue != null &&
        input.market
      ) {
        modelValue = computeCoreV1ShadowBaselineHma({
          homeTeamId: input.game.homeTeamId,
          homeRating: homeValue,
          awayRating: awayValue,
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
          selectedTeamId = null;
          predictionPickValue = null;
        } else if (ats.recommendedTeamId === input.game.homeTeamId) {
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
        homeRating: homeRating
          ? {
              teamId: homeRating.teamId,
              season: homeRating.season,
              modelVersion: homeRating.modelVersion,
              powerRating: homeRating.powerRating,
              rating: homeRating.rating,
              usedValue: homeValue,
              createdAt: toIso(homeRating.createdAt),
              updatedAt: toIso(homeRating.updatedAt),
            }
          : null,
        awayRating: awayRating
          ? {
              teamId: awayRating.teamId,
              season: awayRating.season,
              modelVersion: awayRating.modelVersion,
              powerRating: awayRating.powerRating,
              rating: awayRating.rating,
              usedValue: awayValue,
              createdAt: toIso(awayRating.createdAt),
              updatedAt: toIso(awayRating.updatedAt),
            }
          : null,
        hfa:
          homeValue != null
            ? computeEffectiveHfa(input.game.homeTeamId, Boolean(input.game.neutralSite))
            : null,
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
        homeRating: homeValue,
        awayRating: awayValue,
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
        modelDefinitionId: CORE_V1_SHADOW_BASELINE_MODEL_ID,
        featureDefinitionId: CORE_V1_SHADOW_FEATURE_DEFINITION_ID,
        policyDefinitionId: CORE_V1_SHADOW_POLICY_DEFINITION_ID,
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
