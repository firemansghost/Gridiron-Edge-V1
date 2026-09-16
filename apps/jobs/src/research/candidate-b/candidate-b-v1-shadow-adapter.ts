/**
 * Candidate B V1 Generic Shadow adapter — pure model definition.
 *
 * Consumes the persisted Candidate B feature snapshot from the generic
 * frozenFeatureSnapshots frame. Does not query Prisma or providers.
 */

import {
  computeATSEdgeHma,
  computeEffectiveHfa,
  getATSPick,
} from '../../../../web/lib/core-v1-spread';
import { SPREAD_EDGE_FLOOR } from '../../../../web/lib/core-v1-weekly-card';
import {
  MAX_SHADOW_MODEL_MARKET_AGE_MS,
  MAX_SHADOW_MODEL_MARKET_AGE_SECONDS,
  SHADOW_MODEL_EVALUATION_PROTOCOL,
  isFiniteNumber,
  sha256CanonicalJson,
  teamSidedPickValue,
  toDate,
  type FrozenShadowFeatureSnapshot,
  type OperationalShadowModelFrame,
  type ShadowModelDefinition,
  type ShadowModelUnavailableReason,
} from '../../../../web/lib/shadow-model-capture-v1';
import {
  DERIVATION_DEFINITION_HASH,
  DERIVATION_DEFINITION_ID,
  FEATURE_DEFINITION_HASH,
  FEATURE_DEFINITION_ID,
  FEATURE_DEFINITION_MANIFEST,
  FEATURE_DEFINITION_VERSION,
  MODEL_DEFINITION_ID,
  MODEL_FAMILY,
} from './candidate-b-v1-feature-snapshot';
import {
  CANDIDATE_B_FEATURE_SNAPSHOT_ABSENT,
  CANDIDATE_B_FROZEN_FEATURE_SNAPSHOT_HASH,
  asCandidateBFrozenTeamRow,
  type CandidateBFrozenShadowFeatureTeamRow,
} from './candidate-b-v1-runtime-snapshot';

export const CANDIDATE_B_GENERIC_SHADOW_MODEL_ID = MODEL_DEFINITION_ID;
export const CANDIDATE_B_GENERIC_SHADOW_MODEL_FAMILY = MODEL_FAMILY;
export const CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_ID =
  'candidate_b_roster_prior_spread_policy_v1';
export const CANDIDATE_B_V1_GENERIC_SHADOW_ADAPTER_CONTRACT_ID =
  'candidate_b_v1_generic_shadow_adapter_contract_v1';

export const FROZEN_CANDIDATE_B_GENERIC_SHADOW_MODEL_DEFINITION_HASH =
  '1e5bbf0119832caf10e7b769afe5e8c02dbcda1b358022ec31803df40bca3d8c';
export const FROZEN_CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_HASH =
  'b1b292c0ea01ed692dcbfdfd7f6adf28b951d20786f08dac0993444c8b1e1fba';
export const FROZEN_CANDIDATE_B_V1_GENERIC_SHADOW_ADAPTER_CONTRACT_HASH =
  '89ea502df175846f7d942dc485779e33fdd15fe17cd2bcaebba5b3926274ebf6';
export const FROZEN_CANDIDATE_B_FEATURE_DEFINITION_HASH =
  '6f1f8ecc132cdd87650252d57597a657ece0dd908bdf5010897023cafe988972';

export const CANDIDATE_B_GENERIC_SHADOW_MODEL_DEFINITION_MANIFEST = {
  id: CANDIDATE_B_GENERIC_SHADOW_MODEL_ID,
  version: 'shadow_model_capture_v1',
  family: CANDIDATE_B_GENERIC_SHADOW_MODEL_FAMILY,
  official: false,
  productionHold: true,
  status: 'SHADOW / RESEARCH ONLY — NOT OFFICIAL',
  marketType: 'spread',
  formula: {
    identity: 'candidate_b_roster_prior_v1_matchup',
    candidateBTeamRatingPointsSource: 'PERSISTED_CANDIDATE_B_FEATURE_SNAPSHOT_ONLY',
    expression:
      'homeCandidateBTeamRatingPoints - awayCandidateBTeamRatingPoints + computeEffectiveHfa(homeTeamId, neutralSite).effectiveHfa',
    hfaAppliedExactlyOnce: true,
    sourceModule: 'apps/web/lib/core-v1-spread.ts#computeEffectiveHfa',
    noFallback: true,
    noSilentZeroFill: true,
    noCoreRatingBlend: true,
    noHybridBlend: true,
    noLifecycleBlend: true,
    noUnitGradeBlend: true,
    noMissingValueFallback: true,
  },
  hfa: {
    source: 'apps/web/lib/core-v1-spread.ts#computeEffectiveHfa',
    configSource: 'apps/web/lib/data/core_v1_hfa_config.json',
    baseHfaPoints: 2,
    clipRange: [0.5, 3.5],
    neutralSite: 0,
    candidateBSpecificTuning: false,
  },
  frozenFeatureSnapshot: {
    season: 2026,
    snapshotHash: CANDIDATE_B_FROZEN_FEATURE_SNAPSHOT_HASH,
    featureDefinitionId: FEATURE_DEFINITION_ID,
    featureDefinitionVersion: FEATURE_DEFINITION_VERSION,
    featureDefinitionHash: FROZEN_CANDIDATE_B_FEATURE_DEFINITION_HASH,
    derivationDefinitionId: DERIVATION_DEFINITION_ID,
    derivationDefinitionHash: DERIVATION_DEFINITION_HASH,
    teamResolutionPolicyId: 'candidate_b_v1_team_resolution_policy_v1',
    teamResolutionPolicyHash: 'de627563f2c4c2b1e195182bcd6b66dd3226daf9800e209e5f55244f94ea0efe',
    sourceManifestHash: '183e07cec8ab146247f8b15eda93331a1dfe03f624b06fd8b0dae886d14b14d6',
    sourceProvenanceManifestHash: '89ea635c89898aa2de5fad66a43e6eca36ef917f6945cc82635536746347f8da',
    normalizationManifestHash: '9de2fdbf94581f05671349111ae36e458c94ac637b93e8db0eaea701abdeaa96',
    populationManifestHash: 'ce7a633f3230864c785048047698a3ba55fef1e25339e87db2a090bd65c59f2c',
    expectedTeamCount: 138,
    completeVectorCount: 103,
    unavailableVectorCount: 35,
  },
  runtimeFeatureSource: 'PERSISTED_CANDIDATE_B_FEATURE_SNAPSHOT_ONLY',
} as const;

export const CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_MANIFEST = {
  id: CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_ID,
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

export const CANDIDATE_B_GENERIC_SHADOW_MODEL_DEFINITION_HASH = sha256CanonicalJson(
  CANDIDATE_B_GENERIC_SHADOW_MODEL_DEFINITION_MANIFEST
);
export const CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_HASH = sha256CanonicalJson(
  CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_MANIFEST
);

export const CANDIDATE_B_V1_GENERIC_SHADOW_ADAPTER_CONTRACT_MANIFEST = {
  contractId: CANDIDATE_B_V1_GENERIC_SHADOW_ADAPTER_CONTRACT_ID,
  modelDefinitionId: CANDIDATE_B_GENERIC_SHADOW_MODEL_ID,
  modelDefinitionHash: CANDIDATE_B_GENERIC_SHADOW_MODEL_DEFINITION_HASH,
  featureDefinitionId: FEATURE_DEFINITION_ID,
  featureDefinitionVersion: FEATURE_DEFINITION_VERSION,
  featureDefinitionHash: FEATURE_DEFINITION_HASH,
  derivationDefinitionId: DERIVATION_DEFINITION_ID,
  derivationDefinitionHash: DERIVATION_DEFINITION_HASH,
  policyDefinitionId: CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_ID,
  policyDefinitionHash: CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_HASH,
  frozenFeatureSnapshotHash: CANDIDATE_B_FROZEN_FEATURE_SNAPSHOT_HASH,
  teamResolutionPolicyHash: 'de627563f2c4c2b1e195182bcd6b66dd3226daf9800e209e5f55244f94ea0efe',
  runtimeFeatureSource: 'PERSISTED_CANDIDATE_B_FEATURE_SNAPSHOT_ONLY',
  providerCalls: 0,
  marketFreshnessMaxSeconds: 1800,
  runLevelSnapshotIntegrityRequired: true,
  gameLevelIncompleteVectorReason: 'team_feature_vector_unavailable',
  runtimePredictionWritesAuthorized: false,
} as const;

export const CANDIDATE_B_V1_GENERIC_SHADOW_ADAPTER_CONTRACT_HASH = sha256CanonicalJson(
  CANDIDATE_B_V1_GENERIC_SHADOW_ADAPTER_CONTRACT_MANIFEST
);

if (FEATURE_DEFINITION_HASH !== FROZEN_CANDIDATE_B_FEATURE_DEFINITION_HASH) {
  throw new Error(
    `candidate_b_feature_definition_hash_mismatch:${FEATURE_DEFINITION_HASH}!=${FROZEN_CANDIDATE_B_FEATURE_DEFINITION_HASH}`
  );
}
if (sha256CanonicalJson(FEATURE_DEFINITION_MANIFEST) !== FROZEN_CANDIDATE_B_FEATURE_DEFINITION_HASH) {
  throw new Error('candidate_b_feature_definition_manifest_hash_mismatch');
}
if (
  CANDIDATE_B_GENERIC_SHADOW_MODEL_DEFINITION_HASH !==
  FROZEN_CANDIDATE_B_GENERIC_SHADOW_MODEL_DEFINITION_HASH
) {
  throw new Error(
    `candidate_b_generic_shadow_model_hash_mismatch:${CANDIDATE_B_GENERIC_SHADOW_MODEL_DEFINITION_HASH}`
  );
}
if (
  CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_HASH !==
  FROZEN_CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_HASH
) {
  throw new Error(
    `candidate_b_generic_shadow_policy_hash_mismatch:${CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_HASH}`
  );
}
if (
  CANDIDATE_B_V1_GENERIC_SHADOW_ADAPTER_CONTRACT_HASH !==
  FROZEN_CANDIDATE_B_V1_GENERIC_SHADOW_ADAPTER_CONTRACT_HASH
) {
  throw new Error(
    `candidate_b_generic_shadow_adapter_hash_mismatch:${CANDIDATE_B_V1_GENERIC_SHADOW_ADAPTER_CONTRACT_HASH}`
  );
}

function toIso(value: Date | string | null | undefined): string | null {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

export function locateCandidateBFrozenSnapshot(
  frame: OperationalShadowModelFrame
): FrozenShadowFeatureSnapshot {
  const snapshots = frame.frozenFeatureSnapshots ?? [];
  const found = snapshots.find(
    (snapshot) =>
      snapshot.snapshotHash === CANDIDATE_B_FROZEN_FEATURE_SNAPSHOT_HASH &&
      snapshot.featureDefinitionId === FEATURE_DEFINITION_ID &&
      snapshot.derivationDefinitionId === DERIVATION_DEFINITION_ID
  );
  if (!found) {
    throw new Error(CANDIDATE_B_FEATURE_SNAPSHOT_ABSENT);
  }
  return found;
}

export function isCandidateBTeamVectorAvailable(
  row: CandidateBFrozenShadowFeatureTeamRow | undefined,
  season: number
): row is CandidateBFrozenShadowFeatureTeamRow {
  return (
    !!row &&
    row.season === season &&
    row.availabilityStatus === 'AVAILABLE' &&
    isFiniteNumber(row.candidateBTeamRatingPoints)
  );
}

function teamPayload(row: CandidateBFrozenShadowFeatureTeamRow | undefined, teamId: string) {
  return {
    teamId: row?.teamId ?? teamId,
    rowHash: row?.rowHash ?? null,
    priorCoreRaw: row?.priorCoreRaw ?? null,
    talentRaw: row?.talentRaw ?? null,
    returningRaw: row?.returningRaw ?? null,
    portalRaw: row?.portalRaw ?? null,
    zCore: row?.zCore ?? null,
    zTalent: row?.zTalent ?? null,
    zReturning: row?.zReturning ?? null,
    zPortal: row?.zPortal ?? null,
    candidateBRawComposite: row?.candidateBRawComposite ?? null,
    candidateBCompositeZ: row?.candidateBCompositeZ ?? null,
    candidateBTeamRatingPoints: row?.candidateBTeamRatingPoints ?? null,
  };
}

function teamProvenance(row: CandidateBFrozenShadowFeatureTeamRow | undefined, teamId: string) {
  return {
    teamId: row?.teamId ?? teamId,
    availabilityStatus: row?.availabilityStatus ?? null,
    unavailableReasons: row ? [...row.unavailableReasons] : [],
    candidateBTeamRatingPoints: row?.candidateBTeamRatingPoints ?? null,
    rowHash: row?.rowHash ?? null,
  };
}

export function computeCandidateBShadowHma(input: {
  homeTeamId: string;
  homeCandidateBTeamRatingPoints: number;
  awayCandidateBTeamRatingPoints: number;
  neutralSite: boolean;
}): number {
  const hfaPoints = computeEffectiveHfa(input.homeTeamId, input.neutralSite).effectiveHfa;
  return (
    input.homeCandidateBTeamRatingPoints - input.awayCandidateBTeamRatingPoints + hfaPoints
  );
}

export function createCandidateBRosterPriorShadowDefinition(): ShadowModelDefinition {
  return {
    modelFamily: CANDIDATE_B_GENERIC_SHADOW_MODEL_FAMILY,
    modelDefinitionId: CANDIDATE_B_GENERIC_SHADOW_MODEL_ID,
    modelDefinitionManifest: {
      ...CANDIDATE_B_GENERIC_SHADOW_MODEL_DEFINITION_MANIFEST,
    },
    modelDefinitionHash: CANDIDATE_B_GENERIC_SHADOW_MODEL_DEFINITION_HASH,
    featureDefinitionId: FEATURE_DEFINITION_ID,
    featureDefinitionVersion: FEATURE_DEFINITION_VERSION,
    featureDefinitionManifest: {
      ...FEATURE_DEFINITION_MANIFEST,
    },
    featureDefinitionHash: FEATURE_DEFINITION_HASH,
    policyDefinitionId: CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_ID,
    policyDefinitionManifest: {
      ...CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_MANIFEST,
    },
    policyDefinitionHash: CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_HASH,
    marketType: 'SPREAD',
    evaluateGame(input) {
      const snapshot = locateCandidateBFrozenSnapshot(input.frame);
      const unavailableReasons: ShadowModelUnavailableReason[] = [];
      const homeRow = asCandidateBFrozenTeamRow(snapshot.teamsById[input.game.homeTeamId]);
      const awayRow = asCandidateBFrozenTeamRow(snapshot.teamsById[input.game.awayTeamId]);
      const homeAvailable = isCandidateBTeamVectorAvailable(homeRow, input.game.season);
      const awayAvailable = isCandidateBTeamVectorAvailable(awayRow, input.game.season);

      if (!homeAvailable || !awayAvailable) {
        unavailableReasons.push('team_feature_vector_unavailable');
      }

      if (input.marketStatus === 'missing_market') {
        // Engine already records missing_market.
      } else if (input.marketStatus === 'incoherent_market') {
        // Engine already records incoherent_market.
      } else if (input.marketStatus === 'stale_market') {
        // Engine already records stale_market.
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

      if (
        unavailableReasons.length === 0 &&
        homeAvailable &&
        awayAvailable &&
        input.market
      ) {
        modelValue = computeCandidateBShadowHma({
          homeTeamId: input.game.homeTeamId,
          homeCandidateBTeamRatingPoints: homeRow.candidateBTeamRatingPoints,
          awayCandidateBTeamRatingPoints: awayRow.candidateBTeamRatingPoints,
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
        snapshotParentId: snapshot.parentId,
        snapshotHash: snapshot.snapshotHash,
        featureDefinitionHash: snapshot.featureDefinitionHash,
        derivationDefinitionHash: snapshot.derivationDefinitionHash,
        sourceManifestHash: snapshot.sourceManifestHash,
        sourceProvenanceManifestHash: snapshot.sourceProvenanceManifestHash,
        normalizationManifestHash: snapshot.normalizationManifestHash,
        populationManifestHash: snapshot.populationManifestHash,
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
        featureSnapshotHash: snapshot.snapshotHash,
        modelDefinitionId: CANDIDATE_B_GENERIC_SHADOW_MODEL_ID,
        featureDefinitionId: FEATURE_DEFINITION_ID,
        policyDefinitionId: CANDIDATE_B_GENERIC_SHADOW_POLICY_DEFINITION_ID,
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
