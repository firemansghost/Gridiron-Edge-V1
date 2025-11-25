/**
 * Strategy Display Utilities
 * 
 * Centralizes strategy tag to human-readable label mapping.
 * Used across Season Review and Week Review pages.
 */

export const STRATEGY_LABELS: Record<string, string> = {
  'official_flat_100': 'V1 (Composite)',
  'hybrid_v2': 'Hybrid (70/30)',
  'v2_matchup': 'V2 (Matchup)',
  'v3_barnes': 'V3 (Barnes)',
  'all': 'All Strategies',
};

/**
 * Get a human-readable label for a strategy tag.
 * Falls back to formatting the tag if no mapping exists.
 */
export function getStrategyLabel(tag: string): string {
  if (STRATEGY_LABELS[tag]) {
    return STRATEGY_LABELS[tag];
  }
  
  // Fallback: format the tag to be more readable
  return tag
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Get the default strategy tag to use when loading the page.
 * Prefers 'official_flat_100' if available, otherwise falls back to 'all'.
 */
export function getDefaultStrategyTag(availableTags: string[]): string {
  if (availableTags.includes('official_flat_100')) {
    return 'official_flat_100';
  }
  return 'all';
}

