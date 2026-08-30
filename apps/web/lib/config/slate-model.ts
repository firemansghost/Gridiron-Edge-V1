/**
 * Slate API model parameter resolution and response helpers (Phase D + 2C-2I-2).
 */

import {
  AVAILABLE_PRODUCTION_MODELS,
  DEFAULT_PRODUCTION_MODEL,
  PRODUCTION_MODEL_LABELS,
  type ProductionModelId,
} from './production-models';
import { isValidProductionModelId } from './production-model-preference';
import {
  HYBRID_V2_PRODUCTION_HOLD_REASON,
  isHybridV2ProductionAuthorized,
} from './hybrid-production-activation';

export type SlateModelScope = 'hybrid_v2' | 'core_v1' | 'current';

export interface SlateModelFallbackMeta {
  used: boolean;
  reason?: string;
  from?: 'hybrid_v2';
  to?: 'core_v1';
  gamesAffected?: number;
}

/** Authorization hold: requested Hybrid, effective Core V1 (distinct from missing-input fallback). */
export interface SlateActivationOverrideMeta {
  used: boolean;
  requested: 'hybrid_v2';
  effective: 'core_v1';
  reason: string;
}

export interface SlateResponseMeta {
  activeModel: ProductionModelId;
  requestedModel?: string | null;
  defaultModel: ProductionModelId;
  availableModels: ProductionModelId[];
  invalidModelFallback?: boolean;
  modelScope: {
    spread: SlateModelScope;
    total: 'current';
    moneyline: 'current';
  };
  fallback?: SlateModelFallbackMeta;
  activationOverride?: SlateActivationOverrideMeta;
}

export interface ResolveSlateModelResult {
  /** Effective model used for computation and meta.activeModel. */
  activeModel: ProductionModelId;
  /** Preferred model after param validation, before activation hold. */
  preferredModel: ProductionModelId;
  invalidRequest: boolean;
  /** True when Hybrid was preferred but production authorization hold forced Core V1. */
  activationHold: boolean;
}

/**
 * Resolve slate model param, then apply Hybrid production authorization hold.
 *
 * When `season` is omitted, activation hold is not applied (param-only resolution).
 * Callers that serve live slates should pass season/week.
 */
export function resolveSlateModelParam(
  modelParam: string | null | undefined,
  season?: number,
  week?: number
): ResolveSlateModelResult {
  let preferredModel: ProductionModelId = DEFAULT_PRODUCTION_MODEL;
  let invalidRequest = false;

  if (!modelParam) {
    preferredModel = DEFAULT_PRODUCTION_MODEL;
    invalidRequest = false;
  } else if (isValidProductionModelId(modelParam)) {
    preferredModel = modelParam;
    invalidRequest = false;
  } else {
    preferredModel = DEFAULT_PRODUCTION_MODEL;
    invalidRequest = true;
  }

  let activeModel = preferredModel;
  let activationHold = false;

  if (
    preferredModel === 'hybrid_v2' &&
    season !== undefined &&
    Number.isFinite(season) &&
    !isHybridV2ProductionAuthorized(season, week)
  ) {
    activeModel = 'core_v1';
    activationHold = true;
  }

  return {
    activeModel,
    preferredModel,
    invalidRequest,
    activationHold,
  };
}

export function buildSlateResponseMeta(options: {
  activeModel: ProductionModelId;
  requestedModel?: string | null;
  invalidModelFallback?: boolean;
  fallback?: SlateModelFallbackMeta;
  activationOverride?: SlateActivationOverrideMeta;
}): SlateResponseMeta {
  const spreadScope: SlateModelScope =
    options.activeModel === 'hybrid_v2' ? 'hybrid_v2' : 'core_v1';

  return {
    activeModel: options.activeModel,
    requestedModel: options.requestedModel ?? null,
    defaultModel: DEFAULT_PRODUCTION_MODEL,
    availableModels: [...AVAILABLE_PRODUCTION_MODELS],
    invalidModelFallback: options.invalidModelFallback ?? false,
    modelScope: {
      spread: spreadScope,
      total: 'current',
      moneyline: 'current',
    },
    ...(options.fallback ? { fallback: options.fallback } : {}),
    ...(options.activationOverride
      ? { activationOverride: options.activationOverride }
      : {}),
  };
}

export function buildHybridActivationOverrideMeta(): Omit<
  SlateActivationOverrideMeta,
  never
> {
  return {
    used: true,
    requested: 'hybrid_v2',
    effective: 'core_v1',
    reason: HYBRID_V2_PRODUCTION_HOLD_REASON,
  };
}

export function getProductionModelDisplayLabel(
  modelId: ProductionModelId
): string {
  return PRODUCTION_MODEL_LABELS[modelId];
}

/** Hybrid Strong / Super Tier A filters apply only when Hybrid is effective. */
export function shouldShowHybridPlaybookFilters(
  effectiveModel: ProductionModelId
): boolean {
  return effectiveModel === 'hybrid_v2';
}

/**
 * Whether Core V1 slate path may load persisted hybrid_v2 bets for comparison
 * conflict/tier metadata.
 *
 * Explicit Core V1 requests: yes (historical comparison preserved).
 * Authorization-held Hybrid requests (active Core V1 + hold): no — pure Core V1.
 * Effective Hybrid runtime: no (uses runtime Hybrid, not this lookup).
 */
export function shouldLoadCoreHybridComparisonMetadata(
  activeModel: ProductionModelId,
  activationHold: boolean
): boolean {
  return activeModel === 'core_v1' && !activationHold;
}

export function buildSlateApiUrl(
  season: number,
  week: number,
  model: ProductionModelId
): string {
  return `/api/weeks/slate?season=${season}&week=${week}&model=${model}`;
}

/** Normalize slate API body — supports legacy array or `{ games, meta }`. */
export function normalizeSlateApiResponse<T = unknown>(data: unknown): {
  games: T[];
  meta: SlateResponseMeta | null;
} {
  if (Array.isArray(data)) {
    return { games: data as T[], meta: null };
  }
  if (data && typeof data === 'object' && 'games' in data) {
    const payload = data as { games?: T[]; meta?: SlateResponseMeta };
    return {
      games: Array.isArray(payload.games) ? payload.games : [],
      meta: payload.meta ?? null,
    };
  }
  return { games: [], meta: null };
}

export function computeSlateConfidenceSummary(games: Array<{ confidence?: string | null }>): {
  totalGames: number;
  confidenceBreakdown: { A: number; B: number; C: number };
} {
  return {
    totalGames: games.length,
    confidenceBreakdown: {
      A: games.filter((g) => g.confidence === 'A').length,
      B: games.filter((g) => g.confidence === 'B').length,
      C: games.filter((g) => g.confidence === 'C').length,
    },
  };
}

/** Public Current Slate summary: count by spread grade only (not mixed game.confidence). */
export function computeSlateSpreadTierSummary(
  games: Array<{ picks?: { spread?: { grade?: string | null } | null } | null }>
): {
  totalGames: number;
  spreadTier: { A: number; B: number; C: number };
} {
  return {
    totalGames: games.length,
    spreadTier: {
      A: games.filter((g) => g.picks?.spread?.grade === 'A').length,
      B: games.filter((g) => g.picks?.spread?.grade === 'B').length,
      C: games.filter((g) => g.picks?.spread?.grade === 'C').length,
    },
  };
}
