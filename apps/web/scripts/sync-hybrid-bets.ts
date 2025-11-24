/**
 * Sync Hybrid V2 Picks to Bets
 * 
 * Creates synthetic "Hybrid V2 (70/30)" bet records for every Hybrid model pick
 * (ATS only for now) so Week Review can grade them and compare against V1.
 * 
 * Usage:
 *   # Sync a single week
 *   npx tsx apps/web/scripts/sync-hybrid-bets.ts 2025 9
 * 
 *   # Sync a range of weeks
 *   npx tsx apps/web/scripts/sync-hybrid-bets.ts 2025 1 13
 */

import { prisma } from '../lib/prisma';
import { calculateHybridSpread } from '../lib/core-v2-spread';
import { selectClosingLine } from '../lib/closing-line-helpers';
import { Decimal } from '@prisma/client/runtime/library';

const STRATEGY_TAG = 'hybrid_v2';
const V2_STRATEGY_TAG = 'v2_matchup';
const FLAT_STAKE = 100.0;
const EDGE_THRESHOLD = 0.1; // Minimum edge to create a bet

interface HybridPick {
  gameId: string;
  marketType: 'spread' | 'total' | 'moneyline';
  side: 'home' | 'away' | 'over' | 'under';
  modelPrice: number; // Hybrid spread in HMA format
  closePrice: number | null; // Closing line/price
  pickLabel: string; // Human-readable pick (e.g., "Alabama -6.5")
  edge: number; // Edge magnitude
  isV2?: boolean; // Flag to indicate if this is a V2 pick
}

/**
 * Determine Hybrid ATS pick for a game
 */
async function getHybridATSPick(
  game: any,
  hybridSpreadHma: number,
  marketSpreadHma: number
): Promise<HybridPick | null> {
  if (!Number.isFinite(hybridSpreadHma) || !Number.isFinite(marketSpreadHma)) {
    return null;
  }

  // Calculate edge: |Hybrid Margin - Market Margin|
  const edge = Math.abs(hybridSpreadHma - marketSpreadHma);

  // Only create pick if edge >= threshold
  if (edge < EDGE_THRESHOLD) {
    return null;
  }

  // Determine which team has value
  // If Hybrid > Market: Home has value (bet home)
  // If Hybrid < Market: Away has value (bet away)
  const homeHasValue = hybridSpreadHma > marketSpreadHma;
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
    modelPrice: hybridSpreadHma, // Model spread in HMA format
    closePrice: closingValue,
    pickLabel,
    edge,
  };
}

/**
 * Get Hybrid picks for a game (ATS only for now)
 */
async function getHybridPicksForGame(game: any): Promise<HybridPick[]> {
  const picks: HybridPick[] = [];

  try {
    // Fetch V1 ratings
    const [homeRating, awayRating] = await Promise.all([
      prisma.teamSeasonRating.findFirst({
        where: {
          season: game.season,
          teamId: game.homeTeamId,
          modelVersion: 'v1',
        },
        select: {
          powerRating: true,
          rating: true,
        },
      }),
      prisma.teamSeasonRating.findFirst({
        where: {
          season: game.season,
          teamId: game.awayTeamId,
          modelVersion: 'v1',
        },
        select: {
          powerRating: true,
          rating: true,
        },
      }),
    ]);

    if (!homeRating || !awayRating) {
      return picks; // Missing ratings
    }

    const homeRatingValue = homeRating.powerRating !== null
      ? Number(homeRating.powerRating)
      : (homeRating.rating !== null ? Number(homeRating.rating) : null);
    const awayRatingValue = awayRating.powerRating !== null
      ? Number(awayRating.powerRating)
      : (awayRating.rating !== null ? Number(awayRating.rating) : null);

    if (homeRatingValue === null || awayRatingValue === null) {
      return picks; // Invalid ratings
    }

    // Fetch unit grades
    const [homeGrades, awayGrades] = await Promise.all([
      prisma.teamUnitGrades.findFirst({
        where: {
          season: game.season,
          teamId: game.homeTeamId,
        },
      }),
      prisma.teamUnitGrades.findFirst({
        where: {
          season: game.season,
          teamId: game.awayTeamId,
        },
      }),
    ]);

    if (!homeGrades || !awayGrades) {
      return picks; // Missing unit grades
    }

    // Calculate Hybrid spread
    const hybridResult = calculateHybridSpread(
      homeRatingValue,
      awayRatingValue,
      {
        offRunGrade: homeGrades.offRunGrade,
        defRunGrade: homeGrades.defRunGrade,
        offPassGrade: homeGrades.offPassGrade,
        defPassGrade: homeGrades.defPassGrade,
        offExplosiveness: homeGrades.offExplosiveness,
        defExplosiveness: homeGrades.defExplosiveness,
      },
      {
        offRunGrade: awayGrades.offRunGrade,
        defRunGrade: awayGrades.defRunGrade,
        offPassGrade: awayGrades.offPassGrade,
        defPassGrade: awayGrades.defPassGrade,
        offExplosiveness: awayGrades.offExplosiveness,
        defExplosiveness: awayGrades.defExplosiveness,
      },
      game.neutralSite || false,
      game.homeTeamId,
      game.awayTeamId,
      null // No weather adjustments for historical sync
    );

    const hybridSpreadHma = hybridResult.hybridSpreadHma;

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

    // ATS pick (Hybrid)
    const atsPick = await getHybridATSPick(game, hybridSpreadHma, marketSpreadHma);
    if (atsPick) {
      picks.push({ ...atsPick, isV2: false });
    }

    // ATS pick (Pure V2) - create separate pick with V2 spread
    const v2SpreadHma = hybridResult.v2SpreadHma;
    const v2AtsPick = await getHybridATSPick(game, v2SpreadHma, marketSpreadHma);
    if (v2AtsPick) {
      // Create V2 pick with V2 spread as modelPrice
      picks.push({
        ...v2AtsPick,
        modelPrice: v2SpreadHma, // Use V2 spread instead of hybrid
        isV2: true,
      });
    }

    // TODO: Add Total and Moneyline picks when needed

  } catch (error) {
    console.error(`[Game ${game.id}] Error determining hybrid picks:`, error);
  }

  return picks;
}

/**
 * Upsert a bet record (idempotent)
 */
async function upsertBet(pick: HybridPick, season: number, week: number, strategyTag: string = STRATEGY_TAG): Promise<'created' | 'updated' | 'skipped'> {
  try {
    // Check if bet already exists
    const existing = await prisma.bet.findFirst({
      where: {
        gameId: pick.gameId,
        marketType: pick.marketType,
        side: pick.side,
        strategyTag,
        season,
        week,
      },
    });

    // Determine notes based on strategy
    const notes = strategyTag === V2_STRATEGY_TAG
      ? `Auto: V2 (Matchup) pick, $100 flat. ${pick.pickLabel} (Edge: ${pick.edge.toFixed(1)} pts)`
      : `Auto: Hybrid V2 (70/30) pick, $100 flat. ${pick.pickLabel} (Edge: ${pick.edge.toFixed(1)} pts)`;

    const betData = {
      gameId: pick.gameId,
      marketType: pick.marketType,
      side: pick.side,
      modelPrice: new Decimal(pick.modelPrice),
      closePrice: pick.closePrice !== null ? new Decimal(pick.closePrice) : null,
      stake: new Decimal(FLAT_STAKE),
      strategyTag,
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
 * Sync hybrid picks to bets for a single week
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
    const picks = await getHybridPicksForGame(game);
    
    // Process picks: use isV2 flag to determine strategy tag
    for (const pick of picks) {
      const strategyTag = pick.isV2 ? V2_STRATEGY_TAG : STRATEGY_TAG;
      const result = await upsertBet(pick, season, week, strategyTag);
      if (result === 'created') {
        created++;
      } else if (result === 'updated') {
        updated++;
      } else {
        skipped++;
      }
    }
  }

  console.log(`   ✅ ${season} Week ${week}: created ${created}, updated ${updated}, skipped ${skipped} bets (Hybrid + V2)`);

  return { created, updated, skipped };
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: npx tsx apps/web/scripts/sync-hybrid-bets.ts <season> <weekStart> [weekEnd]');
    console.error('Example: npx tsx apps/web/scripts/sync-hybrid-bets.ts 2025 9');
    console.error('Example: npx tsx apps/web/scripts/sync-hybrid-bets.ts 2025 1 13');
    process.exit(1);
  }

  const season = parseInt(args[0]);
  const weekStart = parseInt(args[1]);
  const weekEnd = args.length >= 3 ? parseInt(args[2]) : weekStart;

  if (isNaN(season) || isNaN(weekStart) || isNaN(weekEnd)) {
    console.error('Error: season, weekStart, and weekEnd must be valid numbers');
    process.exit(1);
  }

  console.log(`\n🚀 Syncing Hybrid V2 (70/30) bets`);
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

