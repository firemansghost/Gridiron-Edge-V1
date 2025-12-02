/**
 * Sync Hybrid Conflict Tags
 * 
 * Tags all bets for games with Hybrid V2 spread bets with a conflict_type
 * based on how Hybrid V2 and V4 Labs agree/disagree on the spread side.
 * 
 * Conflict types:
 * - hybrid_strong: Hybrid and V4 disagree on side (H.side !== V4.side)
 * - hybrid_weak: Hybrid and V4 agree on side (H.side === V4.side)
 * - hybrid_only: Hybrid bet exists but no V4 bet for that game
 * 
 * Usage:
 *   npx tsx apps/web/scripts/sync-hybrid-conflict-tags.ts 2024
 *   npx tsx apps/web/scripts/sync-hybrid-conflict-tags.ts 2025 1 15
 */

import { prisma } from '../lib/prisma';

type ConflictType = 'hybrid_strong' | 'hybrid_weak' | 'hybrid_only';

interface HybridBet {
  id: string;
  gameId: string;
  season: number;
  week: number;
  side: 'home' | 'away';
}

interface V4Bet {
  id: string;
  gameId: string;
  season: number;
  week: number;
  side: 'home' | 'away';
}

function parseArgs(): { season: number; weekStart?: number; weekEnd?: number } {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: npx tsx apps/web/scripts/sync-hybrid-conflict-tags.ts <season> [weekStart] [weekEnd]');
    console.error('Example: npx tsx apps/web/scripts/sync-hybrid-conflict-tags.ts 2024');
    console.error('Example: npx tsx apps/web/scripts/sync-hybrid-conflict-tags.ts 2025 1 15');
    process.exit(1);
  }

  const season = parseInt(args[0], 10);
  if (isNaN(season)) {
    console.error('Error: season must be a valid number');
    process.exit(1);
  }

  let weekStart: number | undefined;
  let weekEnd: number | undefined;

  if (args.length >= 2) {
    weekStart = parseInt(args[1], 10);
    if (isNaN(weekStart)) {
      console.error('Error: weekStart must be a valid number');
      process.exit(1);
    }
  }

  if (args.length >= 3) {
    weekEnd = parseInt(args[2], 10);
    if (isNaN(weekEnd)) {
      console.error('Error: weekEnd must be a valid number');
      process.exit(1);
    }
  } else if (args.length === 2) {
    // If only weekStart is provided, treat it as a single week
    weekEnd = weekStart;
  }

  return { season, weekStart, weekEnd };
}

async function syncConflictTags(
  season: number,
  weekStart?: number,
  weekEnd?: number
): Promise<void> {
  console.log(`\n🔄 Syncing Hybrid conflict tags for season ${season}...`);
  if (weekStart !== undefined && weekEnd !== undefined) {
    console.log(`   Weeks: ${weekStart}${weekStart === weekEnd ? '' : `-${weekEnd}`}`);
  } else {
    console.log(`   All weeks`);
  }

  // Build where clause for Hybrid bets
  const hybridWhere: any = {
    season,
    strategyTag: 'hybrid_v2',
    marketType: 'spread',
    source: 'strategy_run',
  };

  if (weekStart !== undefined && weekEnd !== undefined) {
    hybridWhere.week = { gte: weekStart, lte: weekEnd };
  }

  // Load all Hybrid V2 spread bets
  const hybridBets = await prisma.bet.findMany({
    where: hybridWhere,
    select: {
      id: true,
      gameId: true,
      season: true,
      week: true,
      side: true,
    },
  }) as HybridBet[];

  console.log(`   Found ${hybridBets.length} Hybrid V2 spread bets`);

  if (hybridBets.length === 0) {
    console.log('   No Hybrid bets found. Exiting.');
    return;
  }

  // Get unique game keys
  const gameKeys = new Set(hybridBets.map(b => `${b.season}-${b.week}-${b.gameId}`));
  const gameIds = Array.from(new Set(hybridBets.map(b => b.gameId)));

  // Load corresponding V4 Labs spread bets for the same games
  const v4Where: any = {
    season,
    strategyTag: 'v4_labs',
    marketType: 'spread',
    gameId: { in: gameIds },
  };

  if (weekStart !== undefined && weekEnd !== undefined) {
    v4Where.week = { gte: weekStart, lte: weekEnd };
  }

  const v4Bets = await prisma.bet.findMany({
    where: v4Where,
    select: {
      id: true,
      gameId: true,
      season: true,
      week: true,
      side: true,
    },
  }) as V4Bet[];

  console.log(`   Found ${v4Bets.length} V4 Labs spread bets for the same games`);

  // Build game-level maps
  const hybridByGame = new Map<string, HybridBet>();
  const v4ByGame = new Map<string, V4Bet>();

  for (const bet of hybridBets) {
    const key = `${bet.season}-${bet.week}-${bet.gameId}`;
    hybridByGame.set(key, bet);
  }

  for (const bet of v4Bets) {
    const key = `${bet.season}-${bet.week}-${bet.gameId}`;
    v4ByGame.set(key, bet);
  }

  // Determine conflict type for each game
  const conflictMap = new Map<string, ConflictType>();
  const counts = {
    hybrid_strong: 0,
    hybrid_weak: 0,
    hybrid_only: 0,
  };

  for (const gameKey of Array.from(gameKeys)) {
    const hybridBet = hybridByGame.get(gameKey);
    if (!hybridBet) continue;

    const v4Bet = v4ByGame.get(gameKey);

    let conflictType: ConflictType;
    if (!v4Bet) {
      conflictType = 'hybrid_only';
      counts.hybrid_only++;
    } else if (hybridBet.side !== v4Bet.side) {
      conflictType = 'hybrid_strong';
      counts.hybrid_strong++;
    } else {
      conflictType = 'hybrid_weak';
      counts.hybrid_weak++;
    }

    conflictMap.set(gameKey, conflictType);
  }

  console.log(`\n   Conflict type breakdown:`);
  console.log(`     hybrid_strong: ${counts.hybrid_strong} games`);
  console.log(`     hybrid_weak: ${counts.hybrid_weak} games`);
  console.log(`     hybrid_only: ${counts.hybrid_only} games`);

  // Update all bets for each game with the conflict type
  let updated = 0;
  let cleared = 0;

  console.log(`\n   Processing ${conflictMap.size} games for conflict tagging...`);

  for (const [gameKey, conflictType] of Array.from(conflictMap.entries())) {
    // gameKey format: "season-week-gameId" where gameId may contain dashes
    // Split and rejoin: take first 2 parts (season, week), rest is gameId
    const parts = gameKey.split('-');
    const seasonStr = parts[0];
    const weekStr = parts[1];
    const gameId = parts.slice(2).join('-'); // Rejoin remaining parts as gameId
    const gameSeason = parseInt(seasonStr, 10);
    const gameWeek = parseInt(weekStr, 10);

    // Update all bets for this game (all strategies)
    const result = await prisma.bet.updateMany({
      where: {
        season: gameSeason,
        week: gameWeek,
        gameId,
      },
      data: {
        hybridConflictType: conflictType,
      },
    });

    updated += result.count;
  }

  // Clear conflict type for games that no longer have Hybrid bets
  // (e.g., if Hybrid bet was deleted, but we're not tracking that here)
  // For now, we'll only update games that currently have Hybrid bets

  console.log(`\n   Updated ${updated} bet records with conflict types`);

  // Log strategy breakdown
  const hybridBetsByConflict = new Map<ConflictType, number>();
  const fadeBetsByConflict = new Map<ConflictType, number>();

  for (const [gameKey, conflictType] of Array.from(conflictMap.entries())) {
    const parts = gameKey.split('-');
    const seasonStr = parts[0];
    const weekStr = parts[1];
    const gameId = parts.slice(2).join('-'); // Rejoin remaining parts as gameId
    const gameSeason = parseInt(seasonStr, 10);
    const gameWeek = parseInt(weekStr, 10);

    const hybridCount = await prisma.bet.count({
      where: {
        season: gameSeason,
        week: gameWeek,
        gameId,
        strategyTag: 'hybrid_v2',
        marketType: 'spread',
      },
    });

    const fadeCount = await prisma.bet.count({
      where: {
        season: gameSeason,
        week: gameWeek,
        gameId,
        strategyTag: 'fade_v4_labs',
        marketType: 'spread',
      },
    });

    hybridBetsByConflict.set(
      conflictType,
      (hybridBetsByConflict.get(conflictType) || 0) + hybridCount
    );

    fadeBetsByConflict.set(
      conflictType,
      (fadeBetsByConflict.get(conflictType) || 0) + fadeCount
    );
  }

  console.log(`\n   Strategy breakdown by conflict type:`);
  for (const [type, count] of Array.from(hybridBetsByConflict.entries())) {
    console.log(`     ${type}:`);
    console.log(`       Hybrid bets: ${count}`);
    console.log(`       Fade V4 bets: ${fadeBetsByConflict.get(type) || 0}`);
  }

  console.log(`\n✅ Conflict tag sync complete`);
}

async function main() {
  const { season, weekStart, weekEnd } = parseArgs();

  try {
    await syncConflictTags(season, weekStart, weekEnd);
  } catch (error) {
    console.error('\n❌ Error syncing conflict tags:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();


