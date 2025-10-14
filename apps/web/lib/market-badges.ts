/**
 * Market Source Badge Helpers
 * 
 * Utilities for displaying market line sources in the UI
 */

/**
 * Abbreviate market source names for compact display
 * 
 * @param src - The source string (e.g., 'sgo', 'VegasInsider', 'draftkings')
 * @returns Abbreviated source name or original if not recognized
 */
export function abbrevSource(src?: string | null): string {
  if (!src) return '';
  
  const s = src.toLowerCase();
  
  if (s === 'sgo' || s === 'sportsgameodds') return 'SGO';
  if (s === 'vegasinsider') return 'VI';
  if (s === 'the-odds-api') return 'ODDS';
  if (s === 'draftkings') return 'DK';
  if (s === 'fanduel') return 'FD';
  if (s === 'pinnacle') return 'PIN';
  if (s === 'consensus') return 'CONS';
  if (s === 'mock') return 'MOCK';
  
  // Fallback: show original (capitalized first letter)
  return src.charAt(0).toUpperCase() + src.slice(1);
}

/**
 * Format a tooltip string with source and timestamp
 * 
 * @param source - The market line source
 * @param timestamp - The timestamp when the line was fetched
 * @returns Formatted tooltip string
 */
export function formatSourceTooltip(source?: string | null, timestamp?: Date | string | null): string {
  if (!source) return '';
  
  let tooltip = source;
  
  if (timestamp) {
    try {
      const date = new Date(timestamp);
      tooltip += ` — ${date.toLocaleString()}`;
    } catch {
      // Invalid date, skip timestamp
    }
  }
  
  return tooltip;
}

