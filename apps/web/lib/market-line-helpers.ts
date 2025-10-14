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
 * Extract the closing line value from a market line
 * Falls back to lineValue if closingLine is not available
 */
export function getLineValue(line: MarketLineInput | null): number | null {
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

