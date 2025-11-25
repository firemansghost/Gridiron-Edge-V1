/**
 * V3 Ratings Computation (Barnes Luck-Adjusted Model)
 * 
 * Implements the "Robert Barnes" philosophy: segregating luck from results.
 * Calculates Power Ratings based solely on Net Yards and Yards Per Play (YPP)
 * performance, adjusted for opponents. Ignores W/L records.
 * 
 * The "Barnes Margin" Calculation:
 * - YardDiff = HomeYards - AwayYards
 * - YardPoints = YardDiff / 15.0
 * - YppDiff = HomeYPP - AwayYPP
 * - YppPoints = YppDiff / 0.1
 * - ImpliedMargin = (YardPoints + YppPoints) / 2.0
 * 
 * Uses iterative SRS (Simple Rating System) to calculate opponent-adjusted ratings.
 * 
 * Usage:
 *   npx tsx apps/jobs/src/ratings/compute_ratings_v3.ts --season 2025
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface GameData {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeYards: number;
  awayYards: number;
  homeYPP: number;
  awayYPP: number;
  impliedMargin: number; // Calculated Barnes margin
}

interface TeamRating {
  teamId: string;
  rating: number;
}

/**
 * Extract yards from TeamGameStat (from JSON or calculated from YPP * plays)
 */
function extractYards(stat: any): number | null {
  // Primary: Get from offensive_stats.yards (this is the structure we saw)
  if (stat.offensive_stats && typeof stat.offensive_stats === 'object') {
    const offStats = stat.offensive_stats as any;
    if (offStats.yards != null) return Number(offStats.yards);
    if (offStats.totalYards != null) return Number(offStats.totalYards);
    // Calculate from pass + rush if available
    if (offStats.passingYards != null && offStats.rushingYards != null) {
      return Number(offStats.passingYards) + Number(offStats.rushingYards);
    }
  }
  
  // Try rawJson (CFBD API response)
  if (stat.rawJson && typeof stat.rawJson === 'object') {
    const raw = stat.rawJson as any;
    if (raw.yards != null) return Number(raw.yards);
    if (raw.totalYards != null) return Number(raw.totalYards);
    // Try offense.yards or similar nested structure
    if (raw.offense && raw.offense.yards != null) return Number(raw.offense.yards);
  }
  
  // Fallback: Calculate from YPP * plays if we have both
  // Try ypp from offensive_stats first (since yppOff column is often null)
  let ypp: number | null = null;
  if (stat.offensive_stats && typeof stat.offensive_stats === 'object') {
    const offStats = stat.offensive_stats as any;
    if (offStats.ypp != null) {
      ypp = Number(offStats.ypp);
    }
  }
  if (ypp === null && stat.yppOff != null) {
    ypp = Number(stat.yppOff);
  }
  
  if (ypp != null) {
    // Try to get plays from JSON
    if (stat.offensive_stats && typeof stat.offensive_stats === 'object') {
      const offStats = stat.offensive_stats as any;
      if (offStats.plays != null) {
        return ypp * Number(offStats.plays);
      }
      if (offStats.passAtt != null && offStats.rushAtt != null) {
        const plays = Number(offStats.passAtt) + Number(offStats.rushAtt);
        if (plays > 0) return ypp * plays;
      }
    }
    
    // Try rawJson for plays
    if (stat.rawJson && typeof stat.rawJson === 'object') {
      const raw = stat.rawJson as any;
      if (raw.plays != null) {
        return ypp * Number(raw.plays);
      }
      if (raw.passing && raw.passing.attempts != null && raw.rushing && raw.rushing.attempts != null) {
        const plays = Number(raw.passing.attempts) + Number(raw.rushing.attempts);
        if (plays > 0) return ypp * plays;
      }
    }
  }
  
  return null;
}

/**
 * Extract YPP from TeamGameStat (from column or JSON)
 */
function extractYPP(stat: any): number | null {
  // Try column first
  if (stat.yppOff != null) {
    return Number(stat.yppOff);
  }
  
  // Try offensive_stats.ypp (this is the structure we saw)
  if (stat.offensive_stats && typeof stat.offensive_stats === 'object') {
    const offStats = stat.offensive_stats as any;
    if (offStats.ypp != null) return Number(offStats.ypp);
  }
  
  // Try rawJson
  if (stat.rawJson && typeof stat.rawJson === 'object') {
    const raw = stat.rawJson as any;
    if (raw.offense && raw.offense.yardsPerPlay != null) {
      return Number(raw.offense.yardsPerPlay);
    }
  }
  
  return null;
}

/**
 * Fetch game-level stats and calculate Barnes margins
 */
async function fetchGameData(season: number): Promise<GameData[]> {
  console.log(`\n📊 Fetching game data for season ${season}...`);

  // Get all completed FBS games
  const games = await prisma.game.findMany({
    where: {
      season,
      status: 'final',
      homeScore: { not: null },
      awayScore: { not: null },
    },
    include: {
      homeTeam: {
        select: { id: true },
      },
      awayTeam: {
        select: { id: true },
      },
    },
    orderBy: {
      date: 'asc',
    },
  });

  console.log(`   Found ${games.length} completed games`);

  // Get all team game stats for these games
  // Note: We need stats for BOTH teams in each game to calculate Barnes margin
  const gameIds = games.map(g => g.id);
  console.log(`   Querying TeamGameStat for ${gameIds.length} games...`);
  
  const allTeamGameStats = await prisma.teamGameStat.findMany({
    where: {
      season,
      // Don't filter by gameId - get all stats for the season, then match
    },
    select: {
      gameId: true,
      teamId: true,
      yppOff: true,
      yppDef: true,
      offensive_stats: true,
      defensive_stats: true,
      rawJson: true,
    },
  });
  
  // Filter to only games we care about
  const relevantStats = allTeamGameStats.filter(s => gameIds.includes(s.gameId));
  console.log(`   Relevant stats (matching our games): ${relevantStats.length}`);

  // Create a map of gameId -> { home: stats, away: stats }
  const gameStatsMap = new Map<string, { home?: any; away?: any }>();
  let mappedCount = 0;
  let unmatchedGameCount = 0;
  let unmatchedTeamCount = 0;
  
  for (const stat of relevantStats) {
    const game = games.find(g => g.id === stat.gameId);
    if (!game) {
      unmatchedGameCount++;
      continue;
    }
    
    const isHome = stat.teamId.toLowerCase() === game.homeTeamId.toLowerCase();
    if (!gameStatsMap.has(stat.gameId)) {
      gameStatsMap.set(stat.gameId, {});
    }
    const gameStats = gameStatsMap.get(stat.gameId)!;
    
    if (isHome) {
      gameStats.home = stat;
      mappedCount++;
    } else if (stat.teamId.toLowerCase() === game.awayTeamId.toLowerCase()) {
      gameStats.away = stat;
      mappedCount++;
    } else {
      unmatchedTeamCount++;
      // Debug first few mismatches
      if (unmatchedTeamCount <= 3) {
        console.log(`   ⚠️  Team mismatch: stat.teamId=${stat.teamId}, game.homeTeamId=${game.homeTeamId}, game.awayTeamId=${game.awayTeamId}`);
      }
    }
  }
  
  const gamesWithBothStats = Array.from(gameStatsMap.values()).filter(g => g.home && g.away).length;
  console.log(`   Games with both home and away stats: ${gamesWithBothStats}`);
  
  if (gamesWithBothStats === 0) {
    console.log(`\n   ⚠️  WARNING: No games have stats for both teams.`);
    console.log(`   This script requires TeamGameStat records for BOTH teams in each game.`);
    console.log(`   Please ensure stats are ingested for both home and away teams.`);
    console.log(`   Expected: 2 TeamGameStat records per game (one for each team).\n`);
  }

  const gameData: GameData[] = [];
  let skippedNoStats = 0;
  let skippedNoYards = 0;
  let skippedNoYPP = 0;

  for (const game of games) {
    const stats = gameStatsMap.get(game.id);
    if (!stats || !stats.home || !stats.away) {
      skippedNoStats++;
      continue; // Skip games without stats
    }

    // Extract yards
    const homeYards = extractYards(stats.home);
    const awayYards = extractYards(stats.away);
    
    if (homeYards === null || awayYards === null) {
      skippedNoYards++;
      continue; // Skip if we can't get yards
    }

    // Get YPP (using extraction function)
    const homeYPP = extractYPP(stats.home);
    const awayYPP = extractYPP(stats.away);
    
    if (homeYPP === null || awayYPP === null) {
      skippedNoYPP++;
      continue; // Skip if we can't get YPP
    }

    // Calculate Barnes Margin
    const yardDiff = homeYards - awayYards;
    const yardPoints = yardDiff / 15.0;
    
    const yppDiff = homeYPP - awayYPP;
    const yppPoints = yppDiff / 0.1;
    
    const impliedMargin = (yardPoints + yppPoints) / 2.0;

    gameData.push({
      gameId: game.id,
      homeTeamId: game.homeTeamId.toLowerCase(),
      awayTeamId: game.awayTeamId.toLowerCase(),
      homeYards,
      awayYards,
      homeYPP,
      awayYPP,
      impliedMargin,
    });
  }

  console.log(`   ✅ Processed ${gameData.length} games with complete stats`);
  console.log(`   ⚠️  Skipped: ${skippedNoStats} (no stats), ${skippedNoYards} (no yards), ${skippedNoYPP} (no YPP)`);
  return gameData;
}

/**
 * Calculate Barnes ratings using iterative SRS
 */
function calculateBarnesRatings(gameData: GameData[]): Map<string, number> {
  console.log(`\n🧮 Calculating Barnes ratings using iterative SRS...`);

  // Get all unique team IDs
  const teamIds = new Set<string>();
  for (const game of gameData) {
    teamIds.add(game.homeTeamId);
    teamIds.add(game.awayTeamId);
  }

  // Initialize all teams at 0
  const ratings = new Map<string, number>();
  for (const teamId of teamIds) {
    ratings.set(teamId, 0);
  }

  // Iterative SRS loop (1000 iterations)
  const ITERATIONS = 1000;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const newRatings = new Map<string, { sum: number; count: number }>();

    // Initialize new ratings
    for (const teamId of teamIds) {
      newRatings.set(teamId, { sum: 0, count: 0 });
    }

    // Process each game
    for (const game of gameData) {
      const homeRating = ratings.get(game.homeTeamId) || 0;
      const awayRating = ratings.get(game.awayTeamId) || 0;

      // Home team: impliedMargin + opponentRating
      const homeNew = newRatings.get(game.homeTeamId)!;
      homeNew.sum += game.impliedMargin + awayRating;
      homeNew.count += 1;

      // Away team: -impliedMargin + opponentRating
      const awayNew = newRatings.get(game.awayTeamId)!;
      awayNew.sum += -game.impliedMargin + homeRating;
      awayNew.count += 1;
    }

    // Update ratings
    for (const teamId of teamIds) {
      const newRating = newRatings.get(teamId)!;
      if (newRating.count > 0) {
        ratings.set(teamId, newRating.sum / newRating.count);
      }
    }
  }

  // Normalize (average = 0)
  const avgRating = Array.from(ratings.values()).reduce((sum, r) => sum + r, 0) / ratings.size;
  for (const teamId of teamIds) {
    ratings.set(teamId, (ratings.get(teamId) || 0) - avgRating);
  }

  console.log(`   ✅ Completed ${ITERATIONS} iterations`);
  return ratings;
}

/**
 * Main function
 */
async function main() {
  try {
    const args = process.argv.slice(2);
    let season = 2025;

    // Parse --season argument
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--season' && args[i + 1]) {
        season = parseInt(args[i + 1], 10);
        break;
      }
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`🚀 V3 BARNES RATINGS COMPUTATION`);
    console.log(`${'='.repeat(70)}`);
    console.log(`   Season: ${season}`);
    console.log(`   Philosophy: Luck-adjusted ratings based on Net Yards + YPP`);
    console.log(`   Ignores: W/L records`);
    console.log();

    // Fetch game data
    const gameData = await fetchGameData(season);
    
    if (gameData.length === 0) {
      console.error('❌ No game data found. Make sure games are completed and stats are ingested.');
      process.exit(1);
    }

    // Calculate ratings
    const ratings = calculateBarnesRatings(gameData);

    // Get team names for display
    const teamIds = Array.from(ratings.keys());
    const teams = await prisma.team.findMany({
      where: {
        id: { in: teamIds },
      },
      select: {
        id: true,
        name: true,
      },
    });
    const teamNameMap = new Map(teams.map(t => [t.id.toLowerCase(), t.name]));

    // Save to database
    console.log(`\n💾 Saving ratings to TeamUnitGrades.barnesRating...`);
    let upserted = 0;
    let skipped = 0;

    for (const [teamId, rating] of ratings.entries()) {
      try {
        await prisma.teamUnitGrades.upsert({
          where: {
            teamId_season: {
              teamId,
              season,
            },
          },
          update: {
            barnesRating: rating,
          },
          create: {
            teamId,
            season,
            // Create with default values for other fields (will be filled by V2 script)
            offRunGrade: 0,
            defRunGrade: 0,
            offPassGrade: 0,
            defPassGrade: 0,
            offExplosiveness: 0,
            defExplosiveness: 0,
            havocGrade: 0,
            barnesRating: rating,
          },
        });
        upserted++;
      } catch (error: any) {
        console.error(`   ⚠️  Failed to upsert rating for ${teamId}: ${error.message}`);
        skipped++;
      }
    }

    console.log(`   ✅ Upserted ${upserted} ratings • skipped: ${skipped}`);

    // Display top 10 teams
    console.log(`\n🏆 TOP 10 BARNES RATINGS:\n`);
    const sortedRatings = Array.from(ratings.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    for (let i = 0; i < sortedRatings.length; i++) {
      const [teamId, rating] = sortedRatings[i];
      const teamName = teamNameMap.get(teamId) || teamId;
      console.log(`   ${(i + 1).toString().padStart(2)}. ${teamName.padEnd(30)} ${rating.toFixed(2)}`);
    }

    // Check specific teams mentioned in requirements
    const missouriId = teamIds.find(id => id.includes('missouri') || teamNameMap.get(id)?.toLowerCase().includes('missouri'));
    const alabamaId = teamIds.find(id => id.includes('alabama') || teamNameMap.get(id)?.toLowerCase().includes('alabama'));
    const oklahomaId = teamIds.find(id => id.includes('oklahoma') || teamNameMap.get(id)?.toLowerCase().includes('oklahoma'));

    if (missouriId) {
      const moRating = ratings.get(missouriId) || 0;
      const moName = teamNameMap.get(missouriId) || missouriId;
      console.log(`\n📊 ${moName}:`);
      console.log(`   Barnes Rating: ${moRating.toFixed(2)}`);
    }

    if (alabamaId) {
      const alRating = ratings.get(alabamaId) || 0;
      const alName = teamNameMap.get(alabamaId) || alabamaId;
      console.log(`\n📊 ${alName}:`);
      console.log(`   Barnes Rating: ${alRating.toFixed(2)}`);
    }

    if (oklahomaId) {
      const okRating = ratings.get(oklahomaId) || 0;
      const okName = teamNameMap.get(oklahomaId) || oklahomaId;
      console.log(`\n📊 ${okName}:`);
      console.log(`   Barnes Rating: ${okRating.toFixed(2)}`);
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ Barnes ratings computation complete!`);
    console.log(`${'='.repeat(70)}\n`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

