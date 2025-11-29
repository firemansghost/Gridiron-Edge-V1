/**
 * Sync V4 (Labs) Spread Picks to Bets
 * 
 * Creates v4_labs strategy bet records for games where the V4 SP+/FEI-inspired
 * spread model identifies an edge. Uses V4 ratings (modelVersion='v4') from TeamSeasonRating.
 * 
 * Usage:
 *   # Sync a single week
 *   npx tsx apps/web/scripts/sync-v4-bets.ts 2025 14
 * 
 *   # Sync a range of weeks
 *   npx tsx apps/web/scripts/sync-v4-bets.ts 2025 1 13
 */

import { prisma } from '../lib/prisma';
import { selectClosingLine } from '../lib/closing-line-helpers';
import { Decimal } from '@prisma/client/runtime/library';

const STRATEGY_TAG = 'v4_labs';
const FLAT_STAKE = 100.0;
const EDGE_THRESHOLD = 0.1; // Minimum edge to create a bet
const HFA = 2.0; // Home field advantage (points)

interface V4Pick {
  gameId: string;
  marketType: 'spread';
  side: 'home' | 'away';
  modelPrice: number; // V4 model spread in HMA format
  closePrice: number | null; // Closing line/price
  pickLabel: string; // Human-readable pick (e.g., "Alabama -6.5")
  edge: number; // Edge magnitude in points
}

/**
 * Determine V4 ATS pick for a game
 */
async function getV4ATSPick(
  game: any,
  v4SpreadHma: number,
  marketSpreadHma: number
): Promise<V4Pick | null> {
  if (!Number.isFinite(v4SpreadHma) || !Number.isFinite(marketSpreadHma)) {
    return null;
  }

  // Calculate edge: |V4 Margin - Market Margin|
  const edge = Math.abs(v4SpreadHma - marketSpreadHma);

  // Only create pick if edge >= threshold
  if (edge < EDGE_THRESHOLD) {
    return null;
  }

  // Determine which team has value
  // If V4 > Market: Home has value (bet home)
  // If V4 < Market: Away has value (bet away)
  const homeHasValue = v4SpreadHma > marketSpreadHma;
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
    modelPrice: v4SpreadHma, // Model spread in HMA format
    closePrice: closingValue,
    pickLabel,
    edge,
  };
}

/**
 * Get V4 picks for a game (ATS only for now)
 */
async function getV4PicksForGame(game: any): Promise<V4Pick[]> {
  const picks: V4Pick[] = [];

  try {
    // Fetch V4 ratings
    const [homeRating, awayRating] = await Promise.all([
      prisma.teamSeasonRating.findFirst({
        where: {
          season: game.season,
          teamId: game.homeTeamId,
          modelVersion: 'v4',
        },
        select: {
          rating: true,
          powerRating: true,
        },
      }),
      prisma.teamSeasonRating.findFirst({
        where: {
          season: game.season,
          teamId: game.awayTeamId,
          modelVersion: 'v4',
        },
        select: {
          rating: true,
          powerRating: true,
        },
      }),
    ]);

    if (!homeRating || !awayRating) {
      return picks; // Missing ratings
    }

    const homeRatingValue = homeRating.rating !== null
      ? Number(homeRating.rating)
      : (homeRating.powerRating !== null ? Number(homeRating.powerRating) : null);
    const awayRatingValue = awayRating.rating !== null
      ? Number(awayRating.rating)
      : (awayRating.powerRating !== null ? Number(awayRating.powerRating) : null);

    if (homeRatingValue === null || awayRatingValue === null) {
      return picks; // Invalid ratings
    }

    // Calculate V4 spread in HMA format
    // HMA: positive = home favored, negative = away favored
    // Formula: spread = (homeRating + HFA) - awayRating
    // In HMA: positive means home wins by that margin
    // Example: homeRating=20, awayRating=10, HFA=2 → spread = (20+2)-10 = 12 (home favored by 12)
    const effectiveHfa = game.neutralSite ? 0 : HFA;
    const v4SpreadHma = (homeRatingValue + effectiveHfa) - awayRatingValue;

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

    // ATS pick
    const atsPick = await getV4ATSPick(game, v4SpreadHma, marketSpreadHma);
    if (atsPick) {
      picks.push(atsPick);
    }

  } catch (error) {
    console.error(`[Game ${game.id}] Error determining V4 picks:`, error);
  }

  return picks;
}

/**
 * Upsert a bet record (idempotent)
 */
async function upsertBet(pick: V4Pick, season: number, week: number): Promise<'created' | 'updated' | 'skipped'> {
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
      notes: `Auto: V4 (Labs) SP+/FEI-inspired pick, $100 flat. ${pick.pickLabel} (Edge: ${pick.edge.toFixed(1)} pts)`,
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
 * Sync V4 picks to bets for a single week
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
    const picks = await getV4PicksForGame(game);
    
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

  console.log(`   ✅ ${season} Week ${week}: created ${created}, updated ${updated}, skipped ${skipped} V4 (Labs) bets`);

  return { created, updated, skipped };
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: npx tsx apps/web/scripts/sync-v4-bets.ts <season> <weekStart> [weekEnd]');
    console.error('Example: npx tsx apps/web/scripts/sync-v4-bets.ts 2025 14');
    console.error('Example: npx tsx apps/web/scripts/sync-v4-bets.ts 2025 1 13');
    process.exit(1);
  }

  const season = parseInt(args[0]);
  const weekStart = parseInt(args[1]);
  const weekEnd = args.length >= 3 ? parseInt(args[2]) : weekStart;

  if (isNaN(season) || isNaN(weekStart) || isNaN(weekEnd)) {
    console.error('Error: season, weekStart, and weekEnd must be valid numbers');
    process.exit(1);
  }

  console.log(`\n🚀 Syncing V4 (Labs) SP+/FEI-inspired bets`);
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

