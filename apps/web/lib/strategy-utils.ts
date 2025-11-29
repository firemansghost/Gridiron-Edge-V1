/**
 * Strategy Display Utilities
 * 
 * Centralizes strategy tag to human-readable label mapping.
 * Used across Season Review and Week Review pages.
 */

export const STRATEGY_LABELS: Record<string, string> = {
  'official_flat_100': 'Official Flat ($100)',
  'hybrid_v2': 'Hybrid V2 (70/30)',
  'v3_totals': 'V3 Totals',
  'v4_labs': 'V4 (Labs)',
  'demo_seed': 'Demo Data (Seed)',
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

