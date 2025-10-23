/**
 * Closing Line Selection Helpers
 * 
 * Provides deterministic selection of closing lines for games.
 * Rule: Pick the last line at or before kickoff; if none exist, pick the latest available.
 */

import { prisma } from '@/lib/prisma';

export interface ClosingLine {
  value: number;
  book: string;
  timestamp: string;
}

/**
 * Selects the closing line for a specific game and line type.
 * 
 * Rule:
 * 1. Pick market_lines row with max(timestamp) where timestamp ≤ game.kickoff
 * 2. If none exist, pick market_lines row with max(timestamp) (any time)
 * 
 * @param gameId - The game ID to get closing line for
 * @param lineType - The line type ('spread' or 'total')
 * @returns Closing line data or null if no lines exist
 */
export async function selectClosingLine(
  gameId: string, 
  lineType: 'spread' | 'total'
): Promise<ClosingLine | null> {
  try {
    // First, get the game's kickoff time
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { date: true }
    });

    if (!game?.date) {
      console.warn(`[CLOSING_LINE] Game ${gameId} not found or has no date`);
      return null;
    }

    const kickoff = new Date(game.date);
    console.log(`[CLOSING_LINE] Game ${gameId} kickoff: ${kickoff.toISOString()}`);

    // Try to find the latest line before or at kickoff
    const preKickoffLine = await prisma.marketLine.findFirst({
      where: {
        gameId,
        lineType,
        timestamp: { lte: kickoff }
      },
      orderBy: { timestamp: 'desc' },
      select: {
        lineValue: true,
        bookName: true,
        timestamp: true
      }
    });

    if (preKickoffLine) {
      console.log(`[CLOSING_LINE] Found pre-kickoff line for ${gameId} ${lineType}: ${preKickoffLine.lineValue} @ ${preKickoffLine.timestamp.toISOString()}`);
      return {
        value: Number(preKickoffLine.lineValue),
        book: preKickoffLine.bookName,
        timestamp: preKickoffLine.timestamp.toISOString()
      };
    }

    // Fallback: get the latest line regardless of time
    const latestLine = await prisma.marketLine.findFirst({
      where: {
        gameId,
        lineType
      },
      orderBy: { timestamp: 'desc' },
      select: {
        lineValue: true,
        bookName: true,
        timestamp: true
      }
    });

    if (latestLine) {
      console.log(`[CLOSING_LINE] Using fallback latest line for ${gameId} ${lineType}: ${latestLine.lineValue} @ ${latestLine.timestamp.toISOString()}`);
      return {
        value: Number(latestLine.lineValue),
        book: latestLine.bookName,
        timestamp: latestLine.timestamp.toISOString()
      };
    }

    console.log(`[CLOSING_LINE] No lines found for ${gameId} ${lineType}`);
    return null;

  } catch (error) {
    console.error(`[CLOSING_LINE] Error selecting closing line for ${gameId} ${lineType}:`, error);
    return null;
  }
}

/**
 * Gets closing lines for both spread and total for a game.
 * 
 * @param gameId - The game ID to get closing lines for
 * @returns Object with spread and total closing lines
 */
export async function getClosingLines(gameId: string): Promise<{
  spread: ClosingLine | null;
  total: ClosingLine | null;
}> {
  const [spread, total] = await Promise.all([
    selectClosingLine(gameId, 'spread'),
    selectClosingLine(gameId, 'total')
  ]);

  return { spread, total };
}

/**
 * Batch gets closing lines for multiple games.
 * 
 * @param gameIds - Array of game IDs
 * @param lineType - The line type to get for all games
 * @returns Map of gameId to closing line
 */
export async function getBatchClosingLines(
  gameIds: string[], 
  lineType: 'spread' | 'total'
): Promise<Map<string, ClosingLine | null>> {
  const results = new Map<string, ClosingLine | null>();
  
  // Process in parallel for better performance
  const promises = gameIds.map(async (gameId) => {
    const closingLine = await selectClosingLine(gameId, lineType);
    return { gameId, closingLine };
  });

  const resolved = await Promise.all(promises);
  
  for (const { gameId, closingLine } of resolved) {
    results.set(gameId, closingLine);
  }

  return results;
}
