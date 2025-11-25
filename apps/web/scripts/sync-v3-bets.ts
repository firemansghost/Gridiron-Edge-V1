/**
 * Sync V3 Barnes Picks to Bets
 * 
 * Creates synthetic "V3 (Barnes)" bet records based on Barnes ratings
 * (luck-adjusted ratings based on Net Yards + YPP).
 * 
 * Usage:
 *   # Sync a single week
 *   npx tsx apps/web/scripts/sync-v3-bets.ts 2025 9
 * 
 *   # Sync a range of weeks
 *   npx tsx apps/web/scripts/sync-v3-bets.ts 2025 1 13
 */

import { prisma } from '../lib/prisma';
import { selectClosingLine } from '../lib/closing-line-helpers';
import { Decimal } from '@prisma/client/runtime/library';

const STRATEGY_TAG = 'v3_barnes';
const FLAT_STAKE = 100.0;
const HFA = 2.0; // Home Field Advantage
const EDGE_THRESHOLD = 0.1; // Minimum edge to create a bet

interface V3Pick {
  gameId: string;
  marketType: 'spread' | 'total' | 'moneyline';
  side: 'home' | 'away' | 'over' | 'under';
  modelPrice: number; // V3 spread in HMA format
  closePrice: number | null; // Closing line/price
  pickLabel: string; // Human-readable pick (e.g., "Alabama -6.5")
  edge: number; // Edge magnitude
}

/**
 * Determine V3 ATS pick for a game
 */
async function getV3ATSPick(
  game: any,
  v3SpreadHma: number,
  marketSpreadHma: number
): Promise<V3Pick | null> {
  if (!Number.isFinite(v3SpreadHma) || !Number.isFinite(marketSpreadHma)) {
    return null;
  }

  // Calculate edge: |V3 Margin - Market Margin|
  const edge = Math.abs(v3SpreadHma - marketSpreadHma);

  // Only create pick if edge >= threshold
  if (edge < EDGE_THRESHOLD) {
    return null;
  }

  // Determine which team has value
  // If V3 > Market: Home has value (bet home)
  // If V3 < Market: Away has value (bet away)
  const homeHasValue = v3SpreadHma > marketSpreadHma;
  const side = homeHasValue ? 'home' : 'away';
  const recommendedTeamId = homeHasValue ? game.homeTeamId : game.awayTeamId;
  const recommendedTeamName = homeHasValue ? game.homeTeam.name : game.awayTeam.name;

  // Get closing line with teamId
  const closingSpreadLine = await prisma.marketLine.findFirst({
    where: {
      gameId: game.id,
      lineType: 'spread',
    },
    orderBy: { timestamp: 'desc' },
    select: {
      lineValue: true,
      teamId: true,
      timestamp: true,
    },
  });

  if (!closingSpreadLine) {
    return null;
  }

  // Format pick label: "Team -X.X" or "Team +X.X"
  // Closing spread is favorite-centric (negative for favorite)
  const closingValue = Number(closingSpreadLine.lineValue);
  const isHomeMarketFavorite = closingSpreadLine.teamId === game.homeTeamId;
  const marketFavoriteSpread = -Math.abs(closingValue);
  const marketDogSpread = Math.abs(closingValue);
  
  // Determine recommended line based on which team we're betting
  let pickLabel: string;
  if (homeHasValue) {
    // Betting home team
    pickLabel = isHomeMarketFavorite
      ? `${recommendedTeamName} ${marketFavoriteSpread.toFixed(1)}`
      : `${recommendedTeamName} +${marketDogSpread.toFixed(1)}`;
  } else {
    // Betting away team
    pickLabel = isHomeMarketFavorite
      ? `${recommendedTeamName} +${marketDogSpread.toFixed(1)}`
      : `${recommendedTeamName} ${marketFavoriteSpread.toFixed(1)}`;
  }

  return {
    gameId: game.id,
    marketType: 'spread',
    side,
    modelPrice: v3SpreadHma, // Model spread in HMA format
    closePrice: closingValue,
    pickLabel,
    edge,
  };
}

/**
 * Get V3 picks for a game (ATS only for now)
 */
async function getV3PicksForGame(game: any): Promise<V3Pick[]> {
  const picks: V3Pick[] = [];

  try {
    // Fetch V3 Barnes ratings from TeamUnitGrades
    const [homeGrades, awayGrades] = await Promise.all([
      prisma.teamUnitGrades.findFirst({
        where: {
          season: game.season,
          teamId: game.homeTeamId,
        },
        select: {
          barnesRating: true,
        },
      }),
      prisma.teamUnitGrades.findFirst({
        where: {
          season: game.season,
          teamId: game.awayTeamId,
        },
        select: {
          barnesRating: true,
        },
      }),
    ]);

    if (!homeGrades || !awayGrades) {
      return picks; // Missing unit grades
    }

    const homeBarnes = homeGrades.barnesRating;
    const awayBarnes = awayGrades.barnesRating;

    if (homeBarnes === null || awayBarnes === null) {
      return picks; // Missing Barnes ratings
    }

    const homeBarnesValue = Number(homeBarnes);
    const awayBarnesValue = Number(awayBarnes);

    // Calculate V3 spread: AwayBarnes - (HomeBarnes + HFA)
    // In HMA format: positive = home favored, negative = away favored
    const v3SpreadHma = awayBarnesValue - (homeBarnesValue + (game.neutralSite ? 0 : HFA));

    // Get closing spread with teamId
    const closingSpreadLine = await prisma.marketLine.findFirst({
      where: {
        gameId: game.id,
        lineType: 'spread',
      },
      orderBy: { timestamp: 'desc' },
      select: {
        lineValue: true,
        teamId: true,
      },
    });

    if (!closingSpreadLine) {
      return picks; // No closing spread = no ATS pick
    }

    // Convert closing spread to HMA format
    // Closing spread is favorite-centric (negative for favorite)
    // We need to convert to HMA: if home is favorite, HMA = -value; if away is favorite, HMA = value
    const closingValue = Number(closingSpreadLine.lineValue);
    const marketSpreadHma = closingSpreadLine.teamId === game.homeTeamId
      ? -closingValue
      : closingValue;

    // ATS pick (V3 Barnes)
    const atsPick = await getV3ATSPick(game, v3SpreadHma, marketSpreadHma);
    if (atsPick) {
      picks.push(atsPick);
    }

    // TODO: Add Total and Moneyline picks when needed

  } catch (error) {
    console.error(`[Game ${game.id}] Error determining V3 picks:`, error);
  }

  return picks;
}

/**
 * Upsert a bet record (idempotent)
 */
async function upsertBet(pick: V3Pick, season: number, week: number): Promise<'created' | 'updated' | 'skipped'> {
  try {
    // Check if bet already exists
    const existing = await prisma.bet.findFirst({
      where: {
        gameId: pick.gameId,
        marketType: pick.marketType,
        side: pick.side,
        strategyTag: STRATEGY_TAG,
        season,
        week,
      },
    });

    const notes = `Auto: V3 (Barnes) pick, $100 flat. ${pick.pickLabel} (Edge: ${pick.edge.toFixed(1)} pts)`;

    const betData = {
      gameId: pick.gameId,
      marketType: pick.marketType,
      side: pick.side,
      modelPrice: new Decimal(pick.modelPrice),
      closePrice: pick.closePrice !== null ? new Decimal(pick.closePrice) : null,
      stake: new Decimal(FLAT_STAKE),
      strategyTag: STRATEGY_TAG,
      source: 'strategy_run' as const,
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
    console.error(`[Bet upsert] Error for ${pick.gameId} ${pick.marketType}:`, error);
    return 'skipped';
  }
}

/**
 * Sync V3 picks to bets for a single week
 */
export async function syncWeek(season: number, week: number): Promise<{ created: number; updated: number; skipped: number }> {
  console.log(`\n📅 Processing ${season} Week ${week}...`);

  // Fetch all games for this week
  const games = await prisma.game.findMany({
    where: {
      season,
      week,
    },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
    orderBy: {
      date: 'asc',
    },
  });

  console.log(`   Found ${games.length} games`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const game of games) {
    const picks = await getV3PicksForGame(game);
    
    for (const pick of picks) {
      const result = await upsertBet(pick, season, week);
      if (result === 'created') {
        created++;
      } else if (result === 'updated') {
        updated++;
      } else {
        skipped++;
      }
    }
  }

  console.log(`   ✅ ${season} Week ${week}: created ${created}, updated ${updated}, skipped ${skipped} bets (V3 Barnes)`);

  return { created, updated, skipped };
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: npx tsx apps/web/scripts/sync-v3-bets.ts <season> <weekStart> [weekEnd]');
    console.error('Example: npx tsx apps/web/scripts/sync-v3-bets.ts 2025 9');
    console.error('Example: npx tsx apps/web/scripts/sync-v3-bets.ts 2025 1 13');
    process.exit(1);
  }

  const season = parseInt(args[0]);
  const weekStart = parseInt(args[1]);
  const weekEnd = args.length >= 3 ? parseInt(args[2]) : weekStart;

  if (isNaN(season) || isNaN(weekStart) || isNaN(weekEnd)) {
    console.error('Error: season, weekStart, and weekEnd must be valid numbers');
    process.exit(1);
  }

  console.log(`\n🚀 Syncing V3 (Barnes) bets`);
  console.log(`   Season: ${season}`);
  console.log(`   Weeks: ${weekStart} to ${weekEnd}`);

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (let week = weekStart; week <= weekEnd; week++) {
    const result = await syncWeek(season, week);
    totalCreated += result.created;
    totalUpdated += result.updated;
    totalSkipped += result.skipped;
  }

  console.log(`\n✅ Complete!`);
  console.log(`   Total created: ${totalCreated}`);
  console.log(`   Total updated: ${totalUpdated}`);
  console.log(`   Total skipped: ${totalSkipped}`);
  console.log('');
}

main()
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

