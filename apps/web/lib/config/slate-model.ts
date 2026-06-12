/**
 * Slate API model parameter resolution and response helpers (Phase D).
 */

import {
  AVAILABLE_PRODUCTION_MODELS,
  DEFAULT_PRODUCTION_MODEL,
  type ProductionModelId,
} from './production-models';
import { isValidProductionModelId } from './production-model-preference';

export type SlateModelScope = 'hybrid_v2' | 'core_v1' | 'current';

export interface SlateModelFallbackMeta {
  used: boolean;
  reason?: string;
  from?: 'hybrid_v2';
  to?: 'core_v1';
  gamesAffected?: number;
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
}

export function resolveSlateModelParam(modelParam: string | null | undefined): {
  activeModel: ProductionModelId;
  invalidRequest: boolean;
} {
  if (!modelParam) {
    return { activeModel: DEFAULT_PRODUCTION_MODEL, invalidRequest: false };
  }
  if (isValidProductionModelId(modelParam)) {
    return { activeModel: modelParam, invalidRequest: false };
  }
  return { activeModel: DEFAULT_PRODUCTION_MODEL, invalidRequest: true };
}

export function buildSlateResponseMeta(options: {
  activeModel: ProductionModelId;
  requestedModel?: string | null;
  invalidModelFallback?: boolean;
  fallback?: SlateModelFallbackMeta;
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
  };
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
