/**
 * Market Line Helper Functions
 * 
 * Utilities for selecting the best market line from multiple sources.
 */

interface MarketLineInput {
  lineType: string;
  source?: string;
  timestamp?: Date | string;
  lineValue?: number;
  closingLine?: number;
  [key: string]: any;
}

/**
 * Pick the best market line from a list, preferring SGO and latest timestamp
 * 
 * @param lines - Array of market lines to choose from
 * @param type - Type of line to find ('spread', 'total', 'moneyline')
 * @returns The best matching line, or null if none found
 * 
 * Selection logic:
 * 1. Filter to matching line type
 * 2. Prefer SGO source (most reliable)
 * 3. Within same source, prefer latest timestamp
 * 4. If no SGO, use latest from any source
 */
export function pickMarketLine<T extends MarketLineInput>(
  lines: T[],
  type: 'spread' | 'total' | 'moneyline'
): T | null {
  // Filter to matching line type
  const sameType = lines.filter(l => l.lineType === type);
  
  if (sameType.length === 0) {
    return null;
  }

  // 1) Prefer SGO source
  const sgo = sameType
    .filter(l => (l.source || '').toLowerCase() === 'sgo')
    .sort((a, b) => {
      const timeA = new Date(a.timestamp as any).getTime();
      const timeB = new Date(b.timestamp as any).getTime();
      return timeB - timeA; // Latest first
    });
  
  if (sgo.length > 0 && sgo[0]) {
    return sgo[0];
  }

  // 2) Else use latest by timestamp from any source
  return sameType.sort((a, b) => {
    const timeA = new Date(a.timestamp as any).getTime();
    const timeB = new Date(b.timestamp as any).getTime();
    return timeB - timeA; // Latest first
  })[0];
}

/**
 * Extract the line value from a market line
 * Prefers closingLine, falls back to lineValue
 * 
 * @param line - Market line object or null/undefined
 * @returns The line value, or null if not available
 */
export function getLineValue(
  line?: { closingLine?: number | null; lineValue?: number | null } | null
): number | null {
  if (!line) return null;
  
  // Prefer closingLine if available
  if (line.closingLine !== null && line.closingLine !== undefined) {
    return line.closingLine;
  }
  
  // Fallback to lineValue
  if (line.lineValue !== null && line.lineValue !== undefined) {
    return line.lineValue;
  }
  
  return null;
}

/**
 * Pick the best moneyline from a list of market lines
 * Uses the same selection logic as pickMarketLine (prefers SGO, then latest)
 * 
 * @param lines - Array of market lines to choose from
 * @returns The best moneyline, or null if none found
 */
export function pickMoneyline<T extends MarketLineInput>(lines: T[]): T | null {
  return pickMarketLine(lines, 'moneyline');
}

/**
 * Convert American odds to implied probability
 * Does not remove vigorish/juice
 * 
 * @param american - American odds (negative for favorite, positive for underdog)
 * @returns Implied probability as a decimal (0-1), or null if input is null
 * 
 * @example
 * americanToProb(-180) // 0.643 (64.3% implied probability)
 * americanToProb(+150) // 0.400 (40.0% implied probability)
 */
export function americanToProb(american?: number | null): number | null {
  if (american == null) return null;
  
  // Positive odds (underdog): probability = 100 / (odds + 100)
  if (american > 0) {
    return 100 / (american + 100);
  }
  
  // Negative odds (favorite): probability = |odds| / (|odds| + 100)
  return (-american) / ((-american) + 100);
}

