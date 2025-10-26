#!/usr/bin/env node

/**
 * Baseline Ratings from Scores
 * Produces team ratings from points for/against and opponent strength (Massey-style linear system)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface GameResult {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  margin: number; // home - away
}

interface TeamStats {
  teamId: string;
  games: number;
  pointsFor: number;
  pointsAgainst: number;
  movAvg: number;
}

interface TeamRating {
  teamId: string;
  rating: number;
  offenseRating: number;
  defenseRating: number;
  sigma: number;
}

/**
 * Fetch final games for a season
 */
async function fetchFinalGames(season: number): Promise<GameResult[]> {
  const games = await prisma.game.findMany({
    where: {
      season,
      status: 'final',
      homeScore: { not: null },
      awayScore: { not: null }
    },
    select: {
      id: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true
    }
  });

  return games.map(game => ({
    gameId: game.id,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeScore: game.homeScore!,
    awayScore: game.awayScore!,
    margin: game.homeScore! - game.awayScore!
  }));
}

/**
 * Calculate team statistics from games
 */
function calculateTeamStats(games: GameResult[]): Map<string, TeamStats> {
  const teamStats = new Map<string, TeamStats>();

  for (const game of games) {
    // Home team stats
    if (!teamStats.has(game.homeTeamId)) {
      teamStats.set(game.homeTeamId, {
        teamId: game.homeTeamId,
        games: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        movAvg: 0
      });
    }
    const homeStats = teamStats.get(game.homeTeamId)!;
    homeStats.games++;
    homeStats.pointsFor += game.homeScore;
    homeStats.pointsAgainst += game.awayScore;
    homeStats.movAvg += game.margin;

    // Away team stats
    if (!teamStats.has(game.awayTeamId)) {
      teamStats.set(game.awayTeamId, {
        teamId: game.awayTeamId,
        games: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        movAvg: 0
      });
    }
    const awayStats = teamStats.get(game.awayTeamId)!;
    awayStats.games++;
    awayStats.pointsFor += game.awayScore;
    awayStats.pointsAgainst += game.homeScore;
    awayStats.movAvg -= game.margin; // Away team margin is negative
  }

  // Calculate averages
  for (const stats of teamStats.values()) {
    if (stats.games > 0) {
      stats.movAvg = stats.movAvg / stats.games;
    }
  }

  return teamStats;
}

/**
 * Solve Massey-style linear system for team ratings
 */
function solveRatings(games: GameResult[], teamStats: Map<string, TeamStats>): Map<string, TeamRating> {
  const teamIds = Array.from(teamStats.keys());
  const n = teamIds.length;
  
  if (n === 0) {
    return new Map();
  }

  // Create team ID to index mapping
  const teamIndex = new Map<string, number>();
  teamIds.forEach((teamId, index) => {
    teamIndex.set(teamId, index);
  });

  // Build Massey matrix: M * r = p
  // M[i][j] = -games between i and j, M[i][i] = total games for i
  const M = Array(n).fill(null).map(() => Array(n).fill(0));
  const p = Array(n).fill(0);

  // Initialize diagonal with total games
  for (let i = 0; i < n; i++) {
    const teamId = teamIds[i];
    const stats = teamStats.get(teamId)!;
    M[i][i] = stats.games;
  }

  // Add game results
  for (const game of games) {
    const homeIdx = teamIndex.get(game.homeTeamId);
    const awayIdx = teamIndex.get(game.awayTeamId);
    
    if (homeIdx !== undefined && awayIdx !== undefined) {
      // Home team vs Away team
      M[homeIdx][awayIdx] -= 1;
      M[awayIdx][homeIdx] -= 1;
      
      // Point differential
      p[homeIdx] += game.margin;
      p[awayIdx] -= game.margin;
    }
  }

  // Solve the system (simplified: use least squares)
  // For now, use a simple iterative method
  const ratings = Array(n).fill(0);
  const maxIterations = 100;
  const tolerance = 0.001;

  for (let iter = 0; iter < maxIterations; iter++) {
    const newRatings = Array(n).fill(0);
    
    for (let i = 0; i < n; i++) {
      let sum = p[i];
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          sum += M[i][j] * ratings[j];
        }
      }
      newRatings[i] = sum / M[i][i];
    }

    // Check convergence
    let maxDiff = 0;
    for (let i = 0; i < n; i++) {
      const diff = Math.abs(newRatings[i] - ratings[i]);
      maxDiff = Math.max(maxDiff, diff);
    }

    ratings.splice(0, n, ...newRatings);

    if (maxDiff < tolerance) {
      break;
    }
  }

  // Center ratings around 0
  const avgRating = ratings.reduce((sum, r) => sum + r, 0) / n;
  for (let i = 0; i < n; i++) {
    ratings[i] -= avgRating;
  }

  // Calculate offense/defense ratings and residuals
  const teamRatings = new Map<string, TeamRating>();
  
  for (let i = 0; i < n; i++) {
    const teamId = teamIds[i];
    const stats = teamStats.get(teamId)!;
    
    // Calculate residuals for sigma
    let residuals = 0;
    let residualCount = 0;
    
    for (const game of games) {
      if (game.homeTeamId === teamId) {
        const awayIdx = teamIndex.get(game.awayTeamId);
        if (awayIdx !== undefined) {
          const predicted = ratings[i] - ratings[awayIdx];
          const actual = game.margin;
          residuals += Math.pow(actual - predicted, 2);
          residualCount++;
        }
      } else if (game.awayTeamId === teamId) {
        const homeIdx = teamIndex.get(game.homeTeamId);
        if (homeIdx !== undefined) {
          const predicted = ratings[homeIdx] - ratings[i];
          const actual = -game.margin; // Away team margin
          residuals += Math.pow(actual - predicted, 2);
          residualCount++;
        }
      }
    }

    const sigma = residualCount > 0 ? Math.sqrt(residuals / residualCount) : 0;
    
    // Derive offense/defense ratings from points and schedule
    const offenseRating = stats.games > 0 ? (stats.pointsFor / stats.games) : 0;
    const defenseRating = stats.games > 0 ? (stats.pointsAgainst / stats.games) : 0;

    teamRatings.set(teamId, {
      teamId,
      rating: ratings[i],
      offenseRating,
      defenseRating,
      sigma
    });
  }

  return teamRatings;
}

/**
 * Upsert team season ratings to database
 */
async function upsertTeamSeasonRatings(
  season: number,
  teamStats: Map<string, TeamStats>,
  teamRatings: Map<string, TeamRating>
): Promise<{ upserted: number; errors: number }> {
  let upserted = 0;
  let errors = 0;

  for (const [teamId, stats] of teamStats) {
    try {
      const rating = teamRatings.get(teamId);
      if (!rating) {
        console.warn(`   [RATINGS] No rating calculated for ${teamId}`);
        continue;
      }

      await prisma.teamSeasonRating.upsert({
        where: {
          season_teamId: {
            season,
            teamId
          }
        },
        update: {
          games: stats.games,
          pointsFor: stats.pointsFor,
          pointsAgainst: stats.pointsAgainst,
          movAvg: stats.movAvg,
          rating: rating.rating,
          offenseRating: rating.offenseRating,
          defenseRating: rating.defenseRating,
          sigma: rating.sigma
        },
        create: {
          season,
          teamId,
          games: stats.games,
          pointsFor: stats.pointsFor,
          pointsAgainst: stats.pointsAgainst,
          movAvg: stats.movAvg,
          rating: rating.rating,
          offenseRating: rating.offenseRating,
          defenseRating: rating.defenseRating,
          sigma: rating.sigma
        }
      });
      upserted++;
    } catch (error) {
      console.error(`   [RATINGS] Failed to upsert rating for ${teamId}:`, error);
      errors++;
    }
  }

  return { upserted, errors };
}

/**
 * Main function
 */
async function main() {
  try {
    const args = process.argv.slice(2);
    const seasonArg = args.find(arg => arg.startsWith('--season='));
    const season = seasonArg ? parseInt(seasonArg.split('=')[1]) : new Date().getFullYear();

    console.log(`🏈 Starting baseline ratings calculation for ${season}...`);

    // Fetch final games
    const games = await fetchFinalGames(season);
    console.log(`   Found ${games.length} final games`);

    if (games.length === 0) {
      console.log(`   ℹ️  No final games found for ${season}`);
      return;
    }

    // Calculate team statistics
    const teamStats = calculateTeamStats(games);
    console.log(`   Calculated stats for ${teamStats.size} teams`);

    // Solve ratings
    const teamRatings = solveRatings(games, teamStats);
    console.log(`   Calculated ratings for ${teamRatings.size} teams`);

    // Upsert to database
    const { upserted, errors } = await upsertTeamSeasonRatings(season, teamStats, teamRatings);
    
    console.log(`   ✅ Upserted ${upserted} ratings, ${errors} errors`);
    
    // Show top 10 teams
    const topTeams = Array.from(teamRatings.values())
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 10);
    
    console.log('\n📊 Top 10 Teams:');
    for (const team of topTeams) {
      console.log(`   ${team.teamId}: ${team.rating.toFixed(2)} (σ=${team.sigma.toFixed(2)})`);
    }

    console.log('\n📊 Summary:');
    console.log(`   Games processed: ${games.length}`);
    console.log(`   Teams rated: ${teamRatings.size}`);
    console.log(`   Ratings upserted: ${upserted}`);
    console.log(`   Errors: ${errors}`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
