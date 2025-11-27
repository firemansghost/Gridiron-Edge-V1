/**
 * Official Bets Helper
 * 
 * Utilities for fetching and using official bet records as the source of truth
 * for edge, grade, and tier calculations.
 */

import { prisma } from './prisma';
import { getBetTier, calculateEdge } from './bet-tier-helpers';

export interface OfficialTotals {
  line: number;           // The line we bet (e.g., 57.5)
  edge: number;           // Edge at bet time (e.g., -7.1)
  tier: 'A' | 'B' | 'C'; // Tier from bet record
  side: 'over' | 'under'; // Bet side
  modelPrice: number;     // Model total at bet time
  closePrice: number;     // Closing line at bet time
}

/**
 * Fetch official V3 totals bet for a game
 * Returns null if no official bet exists
 */
export async function getOfficialTotalsBet(
  gameId: string,
  season: number,
  week: number
): Promise<OfficialTotals | null> {
  try {
    const bet = await prisma.bet.findFirst({
      where: {
        gameId,
        season,
        week,
        strategyTag: 'v3_totals',
        marketType: 'total',
      },
      orderBy: {
        createdAt: 'desc', // Get most recent if multiple
      },
    });

    if (!bet) {
      return null;
    }

    // Calculate edge and tier from bet record
    const edge = calculateEdge({
      modelPrice: Number(bet.modelPrice),
      closePrice: bet.closePrice ? Number(bet.closePrice) : null,
      marketType: 'total',
    });

    if (edge === null) {
      return null;
    }

    const tier = getBetTier({
      modelPrice: Number(bet.modelPrice),
      closePrice: bet.closePrice ? Number(bet.closePrice) : null,
      marketType: 'total',
    });

    if (tier === null) {
      return null;
    }

    // Determine side from bet.side
    const side = bet.side === 'over' ? 'over' : 'under';

    return {
      line: bet.closePrice ? Number(bet.closePrice) : Number(bet.modelPrice),
      edge,
      tier,
      side,
      modelPrice: Number(bet.modelPrice),
      closePrice: bet.closePrice ? Number(bet.closePrice) : null,
    };
  } catch (error) {
    console.error(`[Official Bets] Error fetching official totals bet for ${gameId}:`, error);
    return null;
  }
}

/**
 * Fetch official spread bet for a game (for consistency)
 */
export async function getOfficialSpreadBet(
  gameId: string,
  season: number,
  week: number,
  strategyTag: string = 'official_flat_100'
): Promise<{
  line: number;
  edge: number;
  tier: 'A' | 'B' | 'C' | null;
  side: string;
} | null> {
  try {
    const bet = await prisma.bet.findFirst({
      where: {
        gameId,
        season,
        week,
        strategyTag,
        marketType: 'spread',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!bet) {
      return null;
    }

    const edge = calculateEdge({
      modelPrice: Number(bet.modelPrice),
      closePrice: bet.closePrice ? Number(bet.closePrice) : null,
      marketType: 'spread',
    });

    if (edge === null) {
      return null;
    }

    const tier = getBetTier({
      modelPrice: Number(bet.modelPrice),
      closePrice: bet.closePrice ? Number(bet.closePrice) : null,
      marketType: 'spread',
    });

    return {
      line: bet.closePrice ? Number(bet.closePrice) : Number(bet.modelPrice),
      edge,
      tier: tier || null,
      side: bet.side,
    };
  } catch (error) {
    console.error(`[Official Bets] Error fetching official spread bet for ${gameId}:`, error);
    return null;
  }
}

