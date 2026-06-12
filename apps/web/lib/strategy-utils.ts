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
