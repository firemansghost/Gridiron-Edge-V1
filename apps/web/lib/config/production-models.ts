/**
 * Production model configuration for Dual-Model Mode (2026).
 *
 * Hybrid V2 is the configured DEFAULT_PRODUCTION_MODEL and future in-season
 * primary spread model. Phase 2C-2I-2 holds Hybrid production authorization for
 * season >= 2026 until same-season inputs are ready and activation is explicitly
 * approved — see hybrid-production-activation.ts / resolveSlateModelParam.
 * Core V1 remains available for comparison and is the effective 2026 Week1 model.
 *
 * Scope (2026): Hybrid V2 applies to SPREADS only. Totals and moneyline picks
 * continue to use existing Core V1 logic until separate Hybrid totals/ML exists.
 *
 * Strategy tags in the database are historical identifiers — do NOT rename
 * `official_flat_100` or other tags in Postgres; update display labels only.
 */

export type ProductionModelId = 'hybrid_v2' | 'core_v1';

/** Server and client default for live spread picks (Phase D+). */
export const DEFAULT_PRODUCTION_MODEL: ProductionModelId = 'hybrid_v2';

/** Production models exposed in the future model selector (labs excluded). */
export const AVAILABLE_PRODUCTION_MODELS: readonly ProductionModelId[] = [
  'hybrid_v2',
  'core_v1',
] as const;

/** Human-readable labels for production model selector UI. */
export const PRODUCTION_MODEL_LABELS: Record<ProductionModelId, string> = {
  hybrid_v2: 'Hybrid V2',
  core_v1: 'Core V1',
};

/**
 * Maps a production model id to the `bets.strategyTag` used for graded/synced bets.
 * Live computed picks and synced bet rows are separate concepts — do not mix tags.
 */
export const PRODUCTION_MODEL_STRATEGY_TAGS: Record<ProductionModelId, string> = {
  hybrid_v2: 'hybrid_v2',
  // Historical DB tag; sync script uses Core V1 math — label as Core V1 in UI only.
  core_v1: 'official_flat_100',
};

/**
 * Strategy tag display labels for Week Review, Season Review, and reporting.
 * Keys are persisted `bets.strategyTag` values — never rename tags in the database.
 */
export const STRATEGY_TAG_LABELS: Record<string, string> = {
  hybrid_v2: 'Hybrid V2 (Flat $100)',
  // official_flat_100 rows are produced by Core V1 sync — not Hybrid V2.
  official_flat_100: 'Core V1 Card (Flat $100)',
  v4_labs: 'V4 Labs (Flat $100)',
  fade_v4_labs: 'Fade V4 Labs (Flat $100)',
  demo_seed: 'Demo Data (Seed)',
  all: 'All Strategies',
};

/** Strategy tags excluded from official production analytics. */
export const EXCLUDED_DEMO_STRATEGY_TAGS = ['demo_seed', 'test_grader', 'test', 'demo', 'experimental'] as const;

export function isLabsStrategyTag(tag: string): boolean {
  return tag === 'v4_labs' || tag === 'fade_v4_labs';
}

export function getProductionModelStrategyTag(modelId: ProductionModelId): string {
  return PRODUCTION_MODEL_STRATEGY_TAGS[modelId];
}

export function getStrategyTagLabel(tag: string): string {
  if (STRATEGY_TAG_LABELS[tag]) {
    return STRATEGY_TAG_LABELS[tag];
  }
  return tag
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Default strategy tag for production dual-model surfaces (Phase D+).
 * Review pages keep legacy `getDefaultStrategyTag` until Phase E.
 */
export function getDefaultProductionStrategyTag(availableTags: string[]): string {
  if (availableTags.includes('hybrid_v2')) {
    return 'hybrid_v2';
  }
  if (availableTags.includes('official_flat_100')) {
    return 'official_flat_100';
  }
  return 'all';
}
