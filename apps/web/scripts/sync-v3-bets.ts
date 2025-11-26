/**
 * Sync V3 Totals Picks to Bets
 * 
 * Creates synthetic "V3 (Totals)" bet records based on Drive Efficiency model:
 * - Quality Drive Rate: % of drives that gain 40+ yards
 * - Tempo: Drives per game
 * - Formula: Projected Score = (DrivesPerGame * QualityDriveRate) * 5.0
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

const STRATEGY_TAG = 'v3_totals';
const FLAT_STAKE = 100.0;
const EDGE_THRESHOLD = 1.5; // Minimum edge (points) to create a bet

interface DriveStats {
  total_drives: number;
  quality_drives: number;
  quality_drive_rate: number;
  drives_per_game: number;
  total_games: number;
  total_yards: number;
  total_plays: number;
  scoring_drives: number;
  points_per_drive?: number;
}

interface TeamDriveMetrics {
  teamId: string;
  qualityDriveRate: number;
  drivesPerGame: number;
  defensiveQualityRateAllowed: number;
  gamesPlayed: number;
}

interface V3Pick {
  gameId: string;
  marketType: 'spread' | 'total' | 'moneyline';
  side: 'home' | 'away' | 'over' | 'under';
  modelPrice: number; // V3 projected total
  closePrice: number | null; // Closing total line
  pickLabel: string; // Human-readable pick (e.g., "Over 54.5")
  edge: number; // Edge magnitude (points)
}

/**
 * Extract drive stats from TeamSeasonStat rawJson
 */
function extractDriveStats(rawJson: any): DriveStats | null {
  if (!rawJson || typeof rawJson !== 'object') {
    return null;
  }

  const driveStats = rawJson.drive_stats;
  if (!driveStats || typeof driveStats !== 'object') {
    return null;
  }

  return {
    total_drives: driveStats.total_drives || 0,
    quality_drives: driveStats.quality_drives || 0,
    quality_drive_rate: driveStats.quality_drive_rate || 0,
    drives_per_game: driveStats.drives_per_game || 0,
    total_games: driveStats.total_games || 0,
    total_yards: driveStats.total_yards || 0,
    total_plays: driveStats.total_plays || 0,
    scoring_drives: driveStats.scoring_drives || 0,
    points_per_drive: driveStats.points_per_drive || 0,
  };
}

/**
 * Calculate defensive quality rate allowed
 * Average quality drive rate of opponents when facing this team
 */
async function calculateDefensiveQualityRate(
  teamId: string,
  season: number,
  allTeamMetrics: Map<string, TeamDriveMetrics>
): Promise<number> {
  const games = await prisma.game.findMany({
    where: {
      season,
      OR: [
        { homeTeamId: teamId },
        { awayTeamId: teamId },
      ],
      status: 'final',
    },
    select: {
      homeTeamId: true,
      awayTeamId: true,
    },
  });

  if (games.length === 0) {
    return 0.4; // Default fallback
  }

  let totalOpponentRate = 0;
  let count = 0;

  for (const game of games) {
    const opponentId = game.homeTeamId === teamId ? game.awayTeamId : game.homeTeamId;
    const opponentMetrics = allTeamMetrics.get(opponentId);
    
    if (opponentMetrics) {
      totalOpponentRate += opponentMetrics.qualityDriveRate;
      count++;
    }
  }

  return count > 0 ? totalOpponentRate / count : 0.4;
}

/**
 * Load team drive metrics for a season
 */
async function loadTeamDriveMetrics(season: number): Promise<Map<string, TeamDriveMetrics>> {
  const teamStats = await prisma.teamSeasonStat.findMany({
    where: { season },
    select: {
      teamId: true,
      rawJson: true,
    },
  });

  const metrics = new Map<string, TeamDriveMetrics>();

  for (const stat of teamStats) {
    const driveStats = extractDriveStats(stat.rawJson);
    if (!driveStats || driveStats.total_drives < 20) {
      continue;
    }

    metrics.set(stat.teamId, {
      teamId: stat.teamId,
      qualityDriveRate: driveStats.quality_drive_rate,
      drivesPerGame: driveStats.drives_per_game,
      defensiveQualityRateAllowed: 0, // Will be calculated below
      gamesPlayed: driveStats.total_games,
    });
  }

  // Calculate defensive quality rates
  for (const [teamId, metric] of metrics.entries()) {
    metric.defensiveQualityRateAllowed = await calculateDefensiveQualityRate(
      teamId,
      season,
      metrics
    );
  }

  return metrics;
}

/**
 * Project score for a team in a game
 */
function projectTeamScore(
  teamMetrics: TeamDriveMetrics,
  opponentMetrics: TeamDriveMetrics
): number {
  // Expected drives = average of both teams' tempo
  const expectedDrives = (teamMetrics.drivesPerGame + opponentMetrics.drivesPerGame) / 2.0;

  // Quality drive rate = average of team's offensive rate and opponent's defensive rate allowed
  const qualityRate = (teamMetrics.qualityDriveRate + opponentMetrics.defensiveQualityRateAllowed) / 2.0;

  // Projected quality drives
  const projectedQualityDrives = expectedDrives * qualityRate;

  // Projected score = quality drives * 5.0 points per quality drive
  const projectedScore = projectedQualityDrives * 5.0;

  return Math.max(0, projectedScore);
}

/**
 * Determine V3 Totals pick for a game
 */
async function getV3TotalsPick(
  game: any,
  modelTotal: number,
  marketTotal: number
): Promise<V3Pick | null> {
  if (!Number.isFinite(modelTotal) || !Number.isFinite(marketTotal)) {
    return null;
  }

  // Calculate edge: |Model Total - Market Total|
  const edge = Math.abs(modelTotal - marketTotal);

  // Only create pick if edge >= threshold
  if (edge < EDGE_THRESHOLD) {
    return null;
  }

  // Determine which side has value
  // If Model > Market: Bet Over
  // If Model < Market: Bet Under
  const side = modelTotal > marketTotal ? 'over' : 'under';
  const pickLabel = `${side === 'over' ? 'Over' : 'Under'} ${marketTotal.toFixed(1)}`;

  return {
    gameId: game.id,
    marketType: 'total',
    side,
    modelPrice: modelTotal,
    closePrice: marketTotal,
    pickLabel,
    edge,
  };
}

/**
 * Get V3 Totals picks for a game
 */
async function getV3PicksForGame(
  game: any,
  teamMetrics: Map<string, TeamDriveMetrics>
): Promise<V3Pick[]> {
  const picks: V3Pick[] = [];

  try {
    const homeMetrics = teamMetrics.get(game.homeTeamId);
    const awayMetrics = teamMetrics.get(game.awayTeamId);

    if (!homeMetrics || !awayMetrics) {
      return picks; // Missing drive metrics
    }

    // Project scores
    const homeScore = projectTeamScore(homeMetrics, awayMetrics);
    const awayScore = projectTeamScore(awayMetrics, homeMetrics);
    const modelTotal = homeScore + awayScore;

    // Get closing total line
    const closingTotalLine = await prisma.marketLine.findFirst({
      where: {
        gameId: game.id,
        lineType: 'total',
      },
      orderBy: { timestamp: 'desc' },
      select: {
        lineValue: true,
      },
    });

    if (!closingTotalLine) {
      return picks; // No closing total = no pick
    }

    const marketTotal = Number(closingTotalLine.lineValue);

    // Totals pick
    const totalsPick = await getV3TotalsPick(game, modelTotal, marketTotal);
    if (totalsPick) {
      picks.push(totalsPick);
    }

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

    const notes = `Auto: V3 (Totals) pick, $100 flat. ${pick.pickLabel} (Edge: ${pick.edge.toFixed(1)} pts)`;

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

  // Load team drive metrics (cache for all games in the week)
  const teamMetrics = await loadTeamDriveMetrics(season);
  console.log(`   Loaded drive metrics for ${teamMetrics.size} teams`);

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
    const picks = await getV3PicksForGame(game, teamMetrics);
    
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

  console.log(`   ✅ ${season} Week ${week}: created ${created}, updated ${updated}, skipped ${skipped} bets (V3 Totals)`);

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

  console.log(`\n🚀 Syncing V3 (Totals) bets`);
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



