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
 * Pick the best market line from a list, preferring lines with teamId, then SGO and latest timestamp
 * 
 * @param lines - Array of market lines to choose from
 * @param type - Type of line to find ('spread', 'total', 'moneyline')
 * @returns The best matching line, or null if none found
 * 
 * Selection logic:
 * 1. Filter to matching line type
 * 2. For spreads: prefer lines with teamId populated (new data), then pick negative line (favorite's line)
 * 3. Prefer lines with teamId populated (data quality - ensures we have definitive team association)
 * 4. Prefer SGO source (most reliable)
 * 5. Within same source, prefer latest timestamp
 * 6. If no SGO, use latest from any source
 */
export function pickMarketLine<T extends MarketLineInput>(
  lines: T[],
  type: 'spread' | 'total' | 'moneyline'
): T | null {
  // Filter to matching line type
  let sameType = lines.filter(l => l.lineType === type);
  
  if (sameType.length === 0) {
    return null;
  }
  
  // CRITICAL: For spreads, prefer lines with teamId populated (new data with definitive team association)
  // Then pick the NEGATIVE line (favorite's line)
  // The database stores TWO spread lines per game (one for each team)
  // We must pick the favorite's line (negative value) as the canonical representation
  if (type === 'spread') {
    // First, separate lines with teamId from those without
    const linesWithTeamId = sameType.filter(l => {
      const teamId = (l as any).teamId;
      return teamId !== null && teamId !== undefined && teamId !== 'NULL';
    });
    
    const linesWithoutTeamId = sameType.filter(l => {
      const teamId = (l as any).teamId;
      return teamId === null || teamId === undefined || teamId === 'NULL';
    });
    
    // Prefer lines with teamId (new data)
    let candidateLines = linesWithTeamId.length > 0 ? linesWithTeamId : linesWithoutTeamId;
    
    // Within candidate lines, filter to negative lines (favorite's line)
    const negativeLines = candidateLines.filter(l => {
      const value = l.closingLine !== null && l.closingLine !== undefined ? l.closingLine : l.lineValue;
      return value !== null && value !== undefined && value < 0;
    });
    
    if (negativeLines.length > 0) {
      sameType = negativeLines;
    } else {
      // If no negative lines in candidate set, use all candidate lines
      sameType = candidateLines;
    }
  } else {
    // For totals and moneylines, prefer lines with teamId populated
    const linesWithTeamId = sameType.filter(l => {
      const teamId = (l as any).teamId;
      return teamId !== null && teamId !== undefined && teamId !== 'NULL';
    });
    
    if (linesWithTeamId.length > 0) {
      sameType = linesWithTeamId;
    }
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
 * Check if a value looks like an American price (odds) rather than a point spread/total
 * 
 * Price characteristics:
 * - abs >= 50 (spreads/totals rarely exceed ±50)
 * - Multiple of 5 (American odds are typically -110, -115, +120, etc.)
 * - NOT a half-point (.5) or quarter-point (.25, .75)
 * 
 * @param value - Numeric value to check
 * @returns true if value looks like a price, false if it looks like a point
 */
export function looksLikePriceLeak(value: number): boolean {
  const absValue = Math.abs(value);
  
  // American odds are typically >= 100, but we'll use 50 as a conservative threshold
  if (absValue < 50) return false;
  
  // American odds are always multiples of 5 (e.g., -110, -115, +120, +155)
  if (absValue % 5 !== 0) return false;
  
  // Spreads/totals use half-point increments (.5) or sometimes quarter-points
  // If it has .5 or .25/.75, it's likely a point, not a price
  const decimal = Math.abs(value - Math.floor(value));
  if (Math.abs(decimal - 0.5) < 0.01) return false; // .5
  if (Math.abs(decimal - 0.25) < 0.01) return false; // .25
  if (Math.abs(decimal - 0.75) < 0.01) return false; // .75
  
  // If abs >= 50, multiple of 5, and no half/quarter-point: likely a price
  return true;
}

/**
 * Extract a POINT value (spread or total) from a market line
 * CRITICAL: Only reads lineValue field (points), never closingLine (prices)
 * 
 * For spread/total: lineValue contains points (e.g., 29.5, -6.5)
 * For moneyline: closingLine contains prices (e.g., -110, +155)
 * 
 * @param line - Market line object
 * @param fieldType - Type of field ('spread' or 'total')
 * @returns Point value, or null if unavailable or looks like a price
 */
export function getPointValue(
  line?: { closingLine?: number | null; lineValue?: number | null } | null,
  fieldType?: 'spread' | 'total'
): number | null {
  if (!line) return null;
  
  // CRITICAL: For spread/total, ONLY read lineValue (points), never closingLine (prices)
  // closingLine contains American odds (-110, -115) which are PRICES, not POINTS
  let value: number | null = null;
  
  // Only use lineValue for spread/total
  if (line.lineValue !== null && line.lineValue !== undefined) {
    value = line.lineValue;
  }
  
  // Never use closingLine for spread/total - that's for moneyline prices only
  
  if (value === null) return null;
  
  // Sanity check: filter out values that look like prices (safety net)
  if (fieldType && looksLikePriceLeak(value)) {
    console.warn(`[market-line-helpers] Price leak detected in ${fieldType} field:`, {
      value,
      fieldType,
      line: { lineValue: line.lineValue, closingLine: line.closingLine }
    });
    return null;
  }
  
  return value;
}

/**
 * Get line value with fallback information
 * Returns both the value and whether it's a closing line or latest snapshot
 * 
 * @param line - Market line object or null/undefined
 * @returns Object with value and isClosing flag
 */
export function getLineValueWithFallback(
  line?: { closingLine?: number | null; lineValue?: number | null } | null
): { value: number | null; isClosing: boolean } {
  if (!line) return { value: null, isClosing: false };
  
  // Prefer closingLine if available
  if (line.closingLine !== null && line.closingLine !== undefined) {
    return { value: line.closingLine, isClosing: true };
  }
  
  // Fallback to lineValue (latest snapshot)
  if (line.lineValue !== null && line.lineValue !== undefined) {
    return { value: line.lineValue, isClosing: false };
  }
  
  return { value: null, isClosing: false };
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

