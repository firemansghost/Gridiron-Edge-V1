/**
 * Strategy Display Utilities
 *
 * Centralizes strategy tag to human-readable label mapping.
 * Used across Season Review and Week Review pages.
 *
 * Database `strategyTag` values are historical — see production-models.ts.
 */

import {
  STRATEGY_TAG_LABELS,
  getDefaultProductionStrategyTag,
  getStrategyTagLabel,
} from '@/lib/config/production-models';
import { isExcludedStrategyTag } from '@/lib/config/official-strategies';

/** @deprecated Prefer STRATEGY_TAG_LABELS from production-models — kept for imports. */
export const STRATEGY_LABELS: Record<string, string> = STRATEGY_TAG_LABELS;

/**
 * Get a human-readable label for a strategy tag.
 * Falls back to formatting the tag if no mapping exists.
 */
export function getStrategyLabel(tag: string): string {
  return getStrategyTagLabel(tag);
}

/**
 * Default strategy tag for Week Review and Season Review (2026+).
 * Prefers hybrid_v2, then official_flat_100 (Core V1), then 'all'.
 */
export function getDefaultStrategyTag(availableTags: string[]): string {
  return getDefaultProductionStrategyTag(availableTags);
}

/**
 * REVIEW-SPECIFIC default strategy tag for Week/Season Review truth (Phase 2A+).
 *
 * Rules:
 * - 2026+:
 *   1) official_flat_100 if available
 *   2) otherwise a valid persisted non-demo strategy (excluding hybrid_v2 which is held)
 *   3) otherwise 'all'
 * - Historical <= 2025:
 *   1) hybrid_v2 when available
 *   2) then official_flat_100
 *   3) otherwise 'all'
 *
 * Demo/test tags never become the automatic production-review default.
 */
export function getDefaultReviewStrategyTag(
  season: number,
  availableTags: string[]
): string {
  const tags = Array.from(new Set(availableTags)).filter(Boolean);

  const has = (t: string) => tags.includes(t);
  const isNonDemo = (t: string) => !isExcludedStrategyTag(t);

  if (season >= 2026) {
    if (has('official_flat_100') && isNonDemo('official_flat_100')) {
      return 'official_flat_100';
    }

    // Hybrid V2 is explicitly held for 2026; do not activate as an automatic default.
    const fallback = tags.filter((t) => isNonDemo(t) && t !== 'hybrid_v2');
    return fallback.length > 0 ? fallback[0] : 'all';
  }

  // Historical seasons (<= 2025)
  if (has('hybrid_v2') && isNonDemo('hybrid_v2')) {
    return 'hybrid_v2';
  }
  if (has('official_flat_100') && isNonDemo('official_flat_100')) {
    return 'official_flat_100';
  }
  return 'all';
}

const EXPLICIT_REVIEW_STRATEGY_TAGS = new Set([
  'hybrid_v2',
  'official_flat_100',
  'v4_labs',
  'fade_v4_labs',
  'all',
]);

/**
 * Resolve review strategy from URL param and available tags.
 * Explicit URL wins; otherwise uses getDefaultStrategyTag (hybrid_v2 first).
 */
export function resolveReviewStrategySelection(
  urlStrategy: string | null | undefined,
  availableTags: string[]
): string {
  const trimmed = urlStrategy?.trim();
  if (trimmed) {
    if (trimmed === 'all') {
      return 'all';
    }
    if (EXPLICIT_REVIEW_STRATEGY_TAGS.has(trimmed)) {
      return trimmed;
    }
    if (availableTags.includes(trimmed)) {
      return trimmed;
    }
  }
  return getDefaultStrategyTag(availableTags);
}

/** Map review strategy tag to Week Review empty-string convention ('all' => ''). */
export function reviewStrategyToWeekReviewState(strategy: string): string {
  return strategy === 'all' ? '' : strategy;
}
