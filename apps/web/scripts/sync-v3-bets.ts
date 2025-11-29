/**
 * Sync V3 Drive-Based Totals Picks to Bets
 * 
 * Creates v3_totals strategy bet records for games where the V3 Drive-Based Totals
 * model identifies an edge. Uses drive_stats (tempo, qualityDriveRate) from TeamSeasonStat.
 * 
 * Usage:
 *   # Sync a single week
 *   npx tsx apps/web/scripts/sync-v3-bets.ts 2025 14
 * 
 *   # Sync a range of weeks
 *   npx tsx apps/web/scripts/sync-v3-bets.ts 2025 1 13
 */

import { prisma } from '../lib/prisma';
import { selectClosingLine } from '../lib/closing-line-helpers';
import { Decimal } from '@prisma/client/runtime/library';

const STRATEGY_TAG = 'v3_totals';
const FLAT_STAKE = 100.0;
const MIN_EDGE_THRESHOLD = 2.0; // Minimum edge (in points) to create a bet

interface V3TotalsPick {
  gameId: string;
  marketType: 'total';
  side: 'over' | 'under';
  modelPrice: number; // V3 model total
  closePrice: number | null; // Closing line/price
  pickLabel: string; // Human-readable pick (e.g., "Over 45.5")
  edge: number; // Edge magnitude in points
}

interface DriveStats {
  tempo?: number; // Drives per game
  qualityDrives?: number;
  qualityDriveRate?: number; // qualityDrives / totalDrives
}

/**
 * Calculate V3 model total for a game
 * Formula: Model Total = (Home Projected Points + Away Projected Points)
 * Where: Projected Points = (Expected Drives × Quality Drive Rate) × 5.0
 * And: Expected Drives = Average of home and away team tempo
 */
function calculateV3Total(
  homeDriveStats: DriveStats | null,
  awayDriveStats: DriveStats | null
): number | null {
  if (!homeDriveStats || !awayDriveStats) {
    return null;
  }
  
  const homeTempo = homeDriveStats.tempo;
  const awayTempo = awayDriveStats.tempo;
  const homeQualityRate = homeDriveStats.qualityDriveRate;
  const awayQualityRate = awayDriveStats.qualityDriveRate;
  
  if (
    homeTempo === undefined || homeTempo === null ||
    awayTempo === undefined || awayTempo === null ||
    homeQualityRate === undefined || homeQualityRate === null ||
    awayQualityRate === undefined || awayQualityRate === null
  ) {
    return null;
  }
  
  // Expected drives = average of both teams' tempo
  const expectedDrives = (homeTempo + awayTempo) / 2;
  
  // Projected points for each team
  const homeProjectedPoints = (expectedDrives * homeQualityRate) * 5.0;
  const awayProjectedPoints = (expectedDrives * awayQualityRate) * 5.0;
  
  // Model total
  const modelTotal = homeProjectedPoints + awayProjectedPoints;
  
  return modelTotal;
}

/**
 * Determine V3 totals pick for a game
 */
async function getV3TotalsPick(
  game: any,
  modelTotal: number | null,
  marketTotal: number | null
): Promise<V3TotalsPick | null> {
  if (modelTotal === null || !Number.isFinite(modelTotal)) {
    return null;
  }
  if (marketTotal === null || !Number.isFinite(marketTotal)) {
    return null;
  }
  
  // Calculate edge
  const edge = Math.abs(modelTotal - marketTotal);
  
  // Only create pick if edge >= threshold
  if (edge < MIN_EDGE_THRESHOLD) {
    return null;
  }
  
  // Determine side: Over if model > market, Under if model < market
  const isOver = modelTotal > marketTotal;
  const side = isOver ? 'over' : 'under';
  
  // Get closing total
  const closingTotal = await selectClosingLine(game.id, 'total');
  const closePrice = closingTotal?.value ?? null;
  
  // Create pick label
  const pickLabel = `${isOver ? 'Over' : 'Under'} ${marketTotal.toFixed(1)}`;
  
  return {
    gameId: game.id,
    marketType: 'total',
    side,
    modelPrice: modelTotal,
    closePrice,
    pickLabel,
    edge,
  };
}

/**
 * Get V3 totals pick for a game
 */
async function getV3TotalsPickForGame(game: any): Promise<V3TotalsPick | null> {
  try {
    // Load drive stats for both teams
    const [homeStats, awayStats] = await Promise.all([
      prisma.teamSeasonStat.findUnique({
        where: {
          season_teamId: {
            season: game.season,
            teamId: game.homeTeamId,
          },
        },
      }),
      prisma.teamSeasonStat.findUnique({
        where: {
          season_teamId: {
            season: game.season,
            teamId: game.awayTeamId,
          },
        },
      }),
    ]);
    
    const homeDriveStats = homeStats?.rawJson ? ((homeStats.rawJson as any).drive_stats as DriveStats | undefined) ?? null : null;
    const awayDriveStats = awayStats?.rawJson ? ((awayStats.rawJson as any).drive_stats as DriveStats | undefined) ?? null : null;
    
    // Calculate V3 model total
    const modelTotal = calculateV3Total(homeDriveStats, awayDriveStats);
    if (modelTotal === null) {
      return null; // No drive stats available
    }
    
    // Get market total
    const closingTotal = await selectClosingLine(game.id, 'total');
    const marketTotal = closingTotal?.value ?? null;
    
    if (marketTotal === null) {
      return null; // No market total available
    }
    
    // Get pick
    return await getV3TotalsPick(game, modelTotal, marketTotal);
  } catch (error) {
    console.error(`[Game ${game.id}] Error determining V3 totals pick:`, error);
    return null;
  }
}

/**
 * Upsert a bet record (idempotent)
 */
async function upsertBet(pick: V3TotalsPick, season: number, week: number): Promise<'created' | 'updated' | 'skipped'> {
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
      notes: `Auto: V3 Drive-Based Totals pick, $100 flat. ${pick.pickLabel} (Edge: ${pick.edge.toFixed(1)} pts)`,
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
 * Sync V3 totals picks to bets for a single week
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
    const pick = await getV3TotalsPickForGame(game);
    
    if (pick) {
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
  
  console.log(`   ✅ ${season} Week ${week}: created ${created}, updated ${updated}, skipped ${skipped} V3 totals bets`);
  
  return { created, updated, skipped };
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: npx tsx apps/web/scripts/sync-v3-bets.ts <season> <weekStart> [weekEnd]');
    console.error('Example: npx tsx apps/web/scripts/sync-v3-bets.ts 2025 14');
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
  
  console.log(`\n🚀 Syncing V3 Drive-Based Totals bets`);
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

