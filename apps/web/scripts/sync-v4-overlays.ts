/**
 * Sync V4 Overlay Strategies
 * 
 * Creates overlay strategies that combine Hybrid and V4:
 * - hybrid_v4_agree: When Hybrid and V4 agree on the same side
 * - fade_v4_labs: Fade V4 (take opposite side of every V4 bet)
 * 
 * Usage:
 *   # Sync a range of weeks
 *   npx tsx apps/web/scripts/sync-v4-overlays.ts 2025 1 14
 * 
 *   # Sync a single week
 *   npx tsx apps/web/scripts/sync-v4-overlays.ts 2025 7 7
 */

import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { BetType, BetSide } from '@prisma/client';

const HYBRID_TAG = 'hybrid_v2';
const V4_TAG = 'v4_labs';
const AGREE_TAG = 'hybrid_v4_agree';
const FADE_TAG = 'fade_v4_labs';
const DEFAULT_STAKE = 100.0;

interface BetData {
  id: string;
  gameId: string;
  season: number;
  week: number;
  marketType: BetType;
  side: BetSide;
  modelPrice: number;
  closePrice: number | null;
  edge: number | null;
  stake: number;
  source: string;
}

/**
 * Flip ATS side (home <-> away)
 */
function flipSide(side: BetSide): BetSide {
  if (side === BetSide.home) return BetSide.away;
  if (side === BetSide.away) return BetSide.home;
  return side; // For over/under, return as-is (though we only handle ATS here)
}

/**
 * Upsert a bet record (idempotent)
 */
async function upsertBet(
  gameId: string,
  marketType: BetType,
  side: BetSide,
  modelPrice: number,
  closePrice: number | null,
  edge: number,
  strategyTag: string,
  season: number,
  week: number,
  stake: number,
  source: string,
  notes: string
): Promise<'created' | 'updated' | 'skipped'> {
  try {
    // Check if bet already exists
    const existing = await prisma.bet.findFirst({
      where: {
        gameId,
        marketType,
        side,
        strategyTag,
        season,
        week,
      },
    });

    const betData = {
      gameId,
      marketType: marketType as BetType,
      side: side as BetSide,
      modelPrice: new Decimal(modelPrice),
      closePrice: closePrice !== null ? new Decimal(closePrice) : null,
      stake: new Decimal(stake),
      strategyTag,
      source: source as any,
      season,
      week,
      notes,
    };

    if (existing) {
      // Update existing bet
      await prisma.bet.update({
        where: { id: existing.id },
        data: betData,
      });
      return 'updated';
    } else {
      // Create new bet
      await prisma.bet.create({
        data: betData,
      });
      return 'created';
    }
  } catch (error) {
    console.error(`[Bet upsert] Error for ${gameId} ${marketType} ${strategyTag}:`, error);
    return 'skipped';
  }
}

/**
 * Process overlay strategies for a single week
 */
async function syncWeek(season: number, week: number): Promise<{
  agreeCreated: number;
  agreeUpdated: number;
  fadeCreated: number;
  fadeUpdated: number;
}> {
  console.log(`\n📅 Processing ${season} Week ${week}...`);

  // Load Hybrid ATS bets for this week
  const hybridBets = await prisma.bet.findMany({
    where: {
      season,
      week,
      strategyTag: HYBRID_TAG,
      marketType: 'spread',
    },
    select: {
      id: true,
      gameId: true,
      season: true,
      week: true,
      marketType: true,
      side: true,
      modelPrice: true,
      closePrice: true,
      stake: true,
      source: true,
    },
  });

  // Load V4 ATS bets for this week
  const v4Bets = await prisma.bet.findMany({
    where: {
      season,
      week,
      strategyTag: V4_TAG,
      marketType: 'spread',
    },
    select: {
      id: true,
      gameId: true,
      season: true,
      week: true,
      marketType: true,
      side: true,
      modelPrice: true,
      closePrice: true,
      stake: true,
      source: true,
    },
  });

  console.log(`   Hybrid bets: ${hybridBets.length}`);
  console.log(`   V4 bets: ${v4Bets.length}`);

  // Convert to BetData format and calculate edge
  const hybridData: BetData[] = hybridBets.map(bet => {
    const modelPrice = Number(bet.modelPrice);
    const closePrice = bet.closePrice ? Number(bet.closePrice) : null;
    // Edge = modelPrice - closePrice (in HMA format)
    const edge = closePrice !== null ? modelPrice - closePrice : null;
    
    return {
      id: bet.id,
      gameId: bet.gameId,
      season: bet.season,
      week: bet.week,
      marketType: bet.marketType as BetType,
      side: bet.side as BetSide,
      modelPrice,
      closePrice,
      edge,
      stake: Number(bet.stake),
      source: bet.source,
    };
  });

  const v4Data: BetData[] = v4Bets.map(bet => {
    const modelPrice = Number(bet.modelPrice);
    const closePrice = bet.closePrice ? Number(bet.closePrice) : null;
    const edge = closePrice !== null ? modelPrice - closePrice : null;
    
    return {
      id: bet.id,
      gameId: bet.gameId,
      season: bet.season,
      week: bet.week,
      marketType: bet.marketType as BetType,
      side: bet.side as BetSide,
      modelPrice,
      closePrice,
      edge,
      stake: Number(bet.stake),
      source: bet.source,
    };
  });

  // Create maps by gameId for quick lookup
  const hybridByGame = new Map<string, BetData[]>();
  for (const bet of hybridData) {
    if (!hybridByGame.has(bet.gameId)) {
      hybridByGame.set(bet.gameId, []);
    }
    hybridByGame.get(bet.gameId)!.push(bet);
  }

  const v4ByGame = new Map<string, BetData[]>();
  for (const bet of v4Data) {
    if (!v4ByGame.has(bet.gameId)) {
      v4ByGame.set(bet.gameId, []);
    }
    v4ByGame.get(bet.gameId)!.push(bet);
  }

  let agreeCreated = 0;
  let agreeUpdated = 0;
  let fadeCreated = 0;
  let fadeUpdated = 0;

  // Process Hybrid + V4 Agreement strategy
  for (const [gameId, hybridBetsForGame] of Array.from(hybridByGame.entries())) {
    const v4BetsForGame = v4ByGame.get(gameId);
    if (!v4BetsForGame || v4BetsForGame.length === 0) continue;

    // Check if Hybrid and V4 agree on the same side
    for (const hybridBet of hybridBetsForGame) {
      for (const v4Bet of v4BetsForGame) {
        // They agree if they're on the same side
        if (hybridBet.side === v4Bet.side) {
          // Use Hybrid's side and line as the actual bet
          const absHybrid = Math.abs(hybridBet.edge ?? 0);
          const absV4 = Math.abs(v4Bet.edge ?? 0);
          const absMin = Math.min(absHybrid, absV4);
          const sign = (hybridBet.edge ?? 0) >= 0 ? 1 : -1;
          const edge = sign * absMin;

          const stake = hybridBet.stake || DEFAULT_STAKE;
          const notes = `Auto: Hybrid + V4 Agree (both on ${hybridBet.side}). Hybrid edge: ${hybridBet.edge?.toFixed(1) ?? 'N/A'} pts, V4 edge: ${v4Bet.edge?.toFixed(1) ?? 'N/A'} pts`;

          const result = await upsertBet(
            gameId,
            hybridBet.marketType,
            hybridBet.side,
            hybridBet.modelPrice,
            hybridBet.closePrice,
            edge,
            AGREE_TAG,
            season,
            week,
            stake,
            hybridBet.source,
            notes
          );

          if (result === 'created') agreeCreated++;
          else if (result === 'updated') agreeUpdated++;
          break; // Only create one agree bet per game
        }
      }
    }
  }

  // Process Fade V4 strategy (for every V4 bet, take opposite side)
  for (const [gameId, v4BetsForGame] of Array.from(v4ByGame.entries())) {
    for (const v4Bet of v4BetsForGame) {
      // Flip side and modelPrice
      const fadeSide = flipSide(v4Bet.side);
      if (fadeSide === v4Bet.side) {
        // Skip if we can't flip the side (e.g., over/under)
        continue;
      }

      const fadeModelPrice = v4Bet.modelPrice * -1; // Negate HMA format
      const fadeEdge = (v4Bet.edge ?? 0) * -1; // Mirrored edge
      const stake = v4Bet.stake || DEFAULT_STAKE;
      const notes = `Auto: Fade V4 (opposite of V4 ${v4Bet.side} pick). V4 edge: ${v4Bet.edge?.toFixed(1) ?? 'N/A'} pts, Fade edge: ${fadeEdge.toFixed(1)} pts`;

      const result = await upsertBet(
        gameId,
        v4Bet.marketType,
        fadeSide,
        fadeModelPrice,
        v4Bet.closePrice,
        fadeEdge,
        FADE_TAG,
        season,
        week,
        stake,
        v4Bet.source,
        notes
      );

      if (result === 'created') fadeCreated++;
      else if (result === 'updated') fadeUpdated++;
    }
  }

  console.log(`   ✅ ${season} Week ${week}:`);
  console.log(`      Hybrid+V4 agree: created ${agreeCreated}, updated ${agreeUpdated}`);
  console.log(`      Fade V4: created ${fadeCreated}, updated ${fadeUpdated}`);

  return {
    agreeCreated,
    agreeUpdated,
    fadeCreated,
    fadeUpdated,
  };
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: npx tsx apps/web/scripts/sync-v4-overlays.ts <season> <weekStart> [weekEnd]');
    console.error('Example: npx tsx apps/web/scripts/sync-v4-overlays.ts 2025 1 14');
    process.exit(1);
  }

  const season = parseInt(args[0], 10);
  const weekStart = parseInt(args[1], 10);
  const weekEnd = args.length >= 3 ? parseInt(args[2], 10) : weekStart;

  if (isNaN(season) || isNaN(weekStart) || isNaN(weekEnd)) {
    console.error('Invalid arguments. Season, weekStart, and weekEnd must be numbers.');
    process.exit(1);
  }

  if (weekStart < 1 || weekEnd < 1 || weekStart > weekEnd) {
    console.error('Invalid week range. weekStart must be >= 1 and weekEnd must be >= weekStart.');
    process.exit(1);
  }

  console.log(`🚀 Syncing V4 Overlay Strategies`);
  console.log(`   Season: ${season}`);
  console.log(`   Weeks: ${weekStart} to ${weekEnd}`);

  let totalAgreeCreated = 0;
  let totalAgreeUpdated = 0;
  let totalFadeCreated = 0;
  let totalFadeUpdated = 0;

  for (let week = weekStart; week <= weekEnd; week++) {
    try {
      const result = await syncWeek(season, week);
      totalAgreeCreated += result.agreeCreated;
      totalAgreeUpdated += result.agreeUpdated;
      totalFadeCreated += result.fadeCreated;
      totalFadeUpdated += result.fadeUpdated;
    } catch (error) {
      console.error(`❌ Error processing week ${week}:`, error);
      // Continue with other weeks
    }
  }

  console.log(`\n✅ Complete!`);
  console.log(`   Hybrid+V4 agree: created ${totalAgreeCreated}, updated ${totalAgreeUpdated}`);
  console.log(`   Fade V4: created ${totalFadeCreated}, updated ${totalFadeUpdated}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});








