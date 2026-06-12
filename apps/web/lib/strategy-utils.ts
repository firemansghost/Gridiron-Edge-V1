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
 * Default strategy tag for review pages (legacy until Phase E).
 * Prefers official_flat_100 if available, otherwise 'all'.
 * For 2026 production default (hybrid_v2 first), use getDefaultProductionStrategyTag.
 */
export function getDefaultStrategyTag(availableTags: string[]): string {
  if (availableTags.includes('official_flat_100')) {
    return 'official_flat_100';
  }
  return 'all';
}
