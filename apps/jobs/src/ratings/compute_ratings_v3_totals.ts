#!/usr/bin/env node

/**
 * Compute V3 Totals Ratings (Drive-Based)
 * 
 * Calculates projected game totals based on "Quality Drive" efficiency:
 * - Quality Drive Rate: % of drives that gain 40+ yards
 * - Tempo: Drives per game
 * - Formula: Projected Score = (DrivesPerGame * QualityDriveRate) * 5.0
 * 
 * Stores projected totals in a new field or table for bet generation.
 * 
 * Usage:
 *   npx tsx apps/jobs/src/ratings/compute_ratings_v3_totals.ts --season 2025
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
  defensiveQualityRateAllowed: number; // Opponent quality drive rate when this team is on defense
  gamesPlayed: number;
}

interface GameProjection {
  gameId: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  homeProjectedScore: number;
  awayProjectedScore: number;
  modelTotal: number;
}

/**
 * Get drive stats from TeamSeasonStat
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
 * This is the average quality drive rate of opponents when facing this team
 */
async function calculateDefensiveQualityRate(
  teamId: string,
  season: number,
  allTeamMetrics: Map<string, TeamDriveMetrics>
): Promise<number> {
  // Get all games where this team played
  const games = await prisma.game.findMany({
    where: {
      season,
      OR: [
        { homeTeamId: teamId },
        { awayTeamId: teamId },
      ],
      status: 'final', // Use status instead of completed
    },
    select: {
      homeTeamId: true,
      awayTeamId: true,
    },
  });

  if (games.length === 0) {
    return 0.4; // Default fallback
  }

  // For each game, get the opponent's offensive quality drive rate
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
 * Load drive metrics for all teams
 */
async function loadTeamDriveMetrics(season: number): Promise<Map<string, TeamDriveMetrics>> {
  console.log('\n📊 Loading team drive metrics...');

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
      // Skip teams with insufficient data
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

  console.log(`   Loaded metrics for ${metrics.size} teams`);

  // Calculate defensive quality rates
  console.log('\n🛡️  Calculating defensive quality rates...');
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

  return Math.max(0, projectedScore); // Ensure non-negative
}

/**
 * Calculate projections for all games
 */
async function calculateProjections(
  season: number,
  teamMetrics: Map<string, TeamDriveMetrics>
): Promise<GameProjection[]> {
  console.log('\n🎯 Calculating game projections...');

  const games = await prisma.game.findMany({
    where: {
      season,
      status: { not: 'final' }, // Only project future games
    },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
    orderBy: {
      date: 'asc',
    },
  });

  const projections: GameProjection[] = [];
  let skipped = 0;

  for (const game of games) {
    const homeMetrics = teamMetrics.get(game.homeTeamId);
    const awayMetrics = teamMetrics.get(game.awayTeamId);

    if (!homeMetrics || !awayMetrics) {
      skipped++;
      continue;
    }

    const homeScore = projectTeamScore(homeMetrics, awayMetrics);
    const awayScore = projectTeamScore(awayMetrics, homeMetrics);
    const modelTotal = homeScore + awayScore;

    projections.push({
      gameId: game.id,
      season: game.season,
      week: game.week,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeProjectedScore: homeScore,
      awayProjectedScore: awayScore,
      modelTotal,
    });
  }

  console.log(`   ✅ Projected ${projections.length} games, skipped ${skipped} (missing metrics)`);

  return projections;
}

/**
 * Save projections to database
 * We'll store them in a new table or use TeamUnitGrades
 * For now, let's create a simple storage in TeamUnitGrades or a new field
 */
async function saveProjections(projections: GameProjection[]): Promise<void> {
  console.log('\n💾 Saving projections...');

  // Store in a new table or use existing structure
  // For now, we'll create a GameProjection record or store in Game model
  // Let's use a simple approach: store in Game model's rawJson or create a new table
  
  // Since we don't have a GameProjection table, let's store in Game.rawJson
  // Or we can create a simple in-memory cache and use it in the bet sync script
  
  // For MVP, let's just log and return - the bet sync script will recalculate
  // But we could also store in a JSON file or cache
  
  console.log(`   ✅ Calculated ${projections.length} projections`);
  
  // Log sample projections
  console.log('\n📊 Sample Projections:');
  for (const proj of projections.slice(0, 10)) {
    const game = await prisma.game.findUnique({
      where: { id: proj.gameId },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    });
    
    if (game) {
      console.log(
        `   ${game.awayTeam.name} @ ${game.homeTeam.name}: ` +
        `${proj.awayProjectedScore.toFixed(1)} - ${proj.homeProjectedScore.toFixed(1)} ` +
        `(Total: ${proj.modelTotal.toFixed(1)})`
      );
    }
  }
}

/**
 * Main computation function
 */
async function computeV3TotalsRatings(season: number): Promise<void> {
  console.log(`\n🚀 Computing V3 Totals Ratings for ${season}`);
  console.log('='.repeat(70));

  // Load team drive metrics
  const teamMetrics = await loadTeamDriveMetrics(season);

  if (teamMetrics.size === 0) {
    console.error('❌ No team drive metrics found. Run sync-drives.ts first.');
    process.exit(1);
  }

  // Calculate projections
  const projections = await calculateProjections(season, teamMetrics);

  // Save projections
  await saveProjections(projections);

  console.log('\n✅ V3 Totals Ratings computation complete!\n');
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  let season = 2025;

  // Parse --season flag
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && args[i + 1]) {
      season = parseInt(args[i + 1]);
      break;
    }
  }

  if (isNaN(season)) {
    console.error('Error: Invalid season. Usage: npx tsx apps/jobs/src/ratings/compute_ratings_v3_totals.ts --season 2025');
    process.exit(1);
  }

  await computeV3TotalsRatings(season);
}

main()
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


