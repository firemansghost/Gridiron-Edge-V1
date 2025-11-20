/**
 * Balanced Ratings Computation
 * 
 * Implements the optimized 25/25/25/25 formula:
 * - 25% Talent
 * - 25% EPA (Efficiency)
 * - 25% Net Points per Game
 * - 25% Win Percentage
 * 
 * Scaled by 14.0 to convert z-scores to spread points.
 * 
 * Usage:
 *   npm run build:jobs
 *   node apps/jobs/dist/src/ratings/compute_ratings_balanced.js --season 2025
 */

import { PrismaClient } from '@prisma/client';
import { TeamResolver } from '../../adapters/TeamResolver';

const prisma = new PrismaClient();

const CALIBRATION_FACTOR = 14.0; // Convert z-scores to spread points

interface TeamMetrics {
  teamId: string;
  teamName: string;
  talentScore: number;
  epaOverall: number;
  netPointsPerGame: number;
  winPct: number;
  gamesPlayed: number;
}

/**
 * Calculate z-scores for a metric
 */
function calculateZScores(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) {
    return { mean: 0, stdDev: 1 };
  }

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance) || 1;

  return { mean, stdDev };
}

/**
 * Get z-score for a value
 */
function getZScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

/**
 * Load team metrics from database
 */
async function loadTeamMetrics(season: number): Promise<TeamMetrics[]> {
  console.log(`\n📊 Loading team metrics for season ${season}...`);

  // Get all FBS teams
  const fbsMemberships = await prisma.teamMembership.findMany({
    where: { season, level: 'fbs' },
    select: { teamId: true },
  });
  const fbsTeamIds = new Set(fbsMemberships.map(m => m.teamId.toLowerCase()));

  // Get team names
  const teams = await prisma.team.findMany({
    where: {
      id: { in: Array.from(fbsTeamIds) },
    },
    select: {
      id: true,
      name: true,
    },
  });
  const teamNameMap = new Map(teams.map(t => [t.id.toLowerCase(), t.name]));

  // Get talent scores from TeamSeasonTalent
  const talentData = await prisma.teamSeasonTalent.findMany({
    where: {
      season,
      teamId: { in: Array.from(fbsTeamIds) },
    },
    select: {
      teamId: true,
      talentComposite: true,
    },
  });

  const talentMap = new Map<string, number>();
  for (const talent of talentData) {
    const teamId = talent.teamId.toLowerCase();
    talentMap.set(teamId, Number(talent.talentComposite || 0));
  }

  // Get game results to calculate win percentage and net points
  const games = await prisma.game.findMany({
    where: {
      season,
      status: 'final',
      OR: [
        { homeTeamId: { in: Array.from(fbsTeamIds) } },
        { awayTeamId: { in: Array.from(fbsTeamIds) } },
      ],
    },
    select: {
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
    },
  });

  // Calculate win percentage and net points per game for each team
  const teamStats = new Map<string, {
    wins: number;
    losses: number;
    pointsFor: number;
    pointsAgainst: number;
    games: number;
  }>();

  for (const game of games) {
    const homeId = game.homeTeamId.toLowerCase();
    const awayId = game.awayTeamId.toLowerCase();

    if (!fbsTeamIds.has(homeId) || !fbsTeamIds.has(awayId)) continue;

    const homeScore = game.homeScore || 0;
    const awayScore = game.awayScore || 0;

    // Home team
    if (!teamStats.has(homeId)) {
      teamStats.set(homeId, { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: 0 });
    }
    const homeStat = teamStats.get(homeId)!;
    homeStat.pointsFor += homeScore;
    homeStat.pointsAgainst += awayScore;
    homeStat.games++;
    if (homeScore > awayScore) homeStat.wins++;
    else if (awayScore > homeScore) homeStat.losses++;

    // Away team
    if (!teamStats.has(awayId)) {
      teamStats.set(awayId, { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: 0 });
    }
    const awayStat = teamStats.get(awayId)!;
    awayStat.pointsFor += awayScore;
    awayStat.pointsAgainst += homeScore;
    awayStat.games++;
    if (awayScore > homeScore) awayStat.wins++;
    else if (homeScore > awayScore) awayStat.losses++;
  }

  // Get team game stats for EPA
  const teamGameStats = await prisma.teamGameStat.findMany({
    where: {
      season,
      teamId: { in: Array.from(fbsTeamIds) },
      game: {
        status: 'final',
      },
    },
    select: {
      teamId: true,
      epaOff: true,
      epaDef: true,
    },
  });

  // Calculate average EPA per team
  const epaMap = new Map<string, { epaOff: number[]; epaDef: number[] }>();
  for (const stat of teamGameStats) {
    const teamId = stat.teamId.toLowerCase();
    if (!epaMap.has(teamId)) {
      epaMap.set(teamId, { epaOff: [], epaDef: [] });
    }
    const epa = epaMap.get(teamId)!;
    if (stat.epaOff !== null) epa.epaOff.push(stat.epaOff);
    if (stat.epaDef !== null) epa.epaDef.push(stat.epaDef);
  }

  // Build metrics array
  const metrics: TeamMetrics[] = [];
  for (const teamId of fbsTeamIds) {
    const stat = teamStats.get(teamId);
    if (!stat || stat.games === 0) continue;

    const epa = epaMap.get(teamId);
    const avgEpaOff = epa && epa.epaOff.length > 0
      ? epa.epaOff.reduce((sum, v) => sum + v, 0) / epa.epaOff.length
      : 0;
    const avgEpaDef = epa && epa.epaDef.length > 0
      ? epa.epaDef.reduce((sum, v) => sum + v, 0) / epa.epaDef.length
      : 0;
    const epaOverall = avgEpaOff - avgEpaDef; // Net EPA

    const winPct = stat.games > 0 ? stat.wins / stat.games : 0;
    const netPointsPerGame = stat.games > 0
      ? (stat.pointsFor - stat.pointsAgainst) / stat.games
      : 0;

    const talentScore = talentMap.get(teamId) || 0;

    metrics.push({
      teamId,
      teamName: teamNameMap.get(teamId) || teamId,
      talentScore,
      epaOverall,
      netPointsPerGame,
      winPct,
      gamesPlayed: stat.games,
    });
  }

  console.log(`   Loaded metrics for ${metrics.length} teams`);
  return metrics;
}

/**
 * Main function
 */
async function main() {
  try {
    const yargs = require('yargs/yargs');
    const { hideBin } = require('yargs/helpers');
    const argv = yargs(hideBin(process.argv))
      .option('season', {
        type: 'number',
        description: 'Season year',
        default: 2025,
      })
      .parseSync();

    const season = argv.season;

    console.log(`\n🚀 Starting Balanced Ratings computation for season=${season}...`);
    console.log(`   Formula: 25% Talent + 25% EPA + 25% Net Points + 25% Win %`);
    console.log(`   Calibration Factor: ${CALIBRATION_FACTOR}`);

    // Load team metrics
    const metrics = await loadTeamMetrics(season);

    if (metrics.length === 0) {
      console.error('❌ No team metrics found');
      return;
    }

    // Calculate z-score statistics
    console.log(`\n📐 Calculating z-score statistics...`);
    const talentValues = metrics.map(m => m.talentScore);
    const epaValues = metrics.map(m => m.epaOverall);
    const netPointsValues = metrics.map(m => m.netPointsPerGame);
    const winPctValues = metrics.map(m => m.winPct);

    const zStats = {
      talent: calculateZScores(talentValues),
      epa: calculateZScores(epaValues),
      netPoints: calculateZScores(netPointsValues),
      winPct: calculateZScores(winPctValues),
    };

    console.log(`   Talent: mean=${zStats.talent.mean.toFixed(3)}, std=${zStats.talent.stdDev.toFixed(3)}`);
    console.log(`   EPA: mean=${zStats.epa.mean.toFixed(3)}, std=${zStats.epa.stdDev.toFixed(3)}`);
    console.log(`   Net Points: mean=${zStats.netPoints.mean.toFixed(3)}, std=${zStats.netPoints.stdDev.toFixed(3)}`);
    console.log(`   Win %: mean=${zStats.winPct.mean.toFixed(3)}, std=${zStats.winPct.stdDev.toFixed(3)}`);

    // Compute balanced ratings
    console.log(`\n🧮 Computing balanced ratings...`);
    const ratings = metrics.map(metric => {
      const talentZ = getZScore(metric.talentScore, zStats.talent.mean, zStats.talent.stdDev);
      const epaZ = getZScore(metric.epaOverall, zStats.epa.mean, zStats.epa.stdDev);
      const netPointsZ = getZScore(metric.netPointsPerGame, zStats.netPoints.mean, zStats.netPoints.stdDev);
      const winPctZ = getZScore(metric.winPct, zStats.winPct.mean, zStats.winPct.stdDev);

      // Balanced composite: 25% each
      const zComposite = 
        talentZ * 0.25 +
        epaZ * 0.25 +
        netPointsZ * 0.25 +
        winPctZ * 0.25;

      // Scale to spread points
      const powerRating = zComposite * CALIBRATION_FACTOR;

      return {
        season,
        teamId: metric.teamId,
        powerRating,
        games: metric.gamesPlayed,
        // Store component z-scores for diagnostics
        talentZ,
        epaZ,
        netPointsZ,
        winPctZ,
        teamName: metric.teamName,
      };
    });

    // Sort by rating for display
    const sortedRatings = [...ratings].sort((a, b) => b.powerRating - a.powerRating);

    console.log(`\n📊 Top 10 Balanced Ratings:`);
    for (let i = 0; i < Math.min(10, sortedRatings.length); i++) {
      const r = sortedRatings[i];
      console.log(`   ${(i + 1).toString().padStart(2)}. ${r.teamName.padEnd(35)} ${r.powerRating.toFixed(2)}`);
    }

    // Show Missouri and Oklahoma
    const missouri = sortedRatings.find(r => 
      r.teamName.toLowerCase().includes('missouri') && 
      !r.teamName.toLowerCase().includes('southeast') &&
      !r.teamName.toLowerCase().includes('state')
    );
    const oklahoma = sortedRatings.find(r => 
      r.teamName.toLowerCase().includes('oklahoma') &&
      !r.teamName.toLowerCase().includes('state')
    );

    if (missouri) {
      const rank = sortedRatings.findIndex(r => r.teamId === missouri.teamId) + 1;
      console.log(`\n📊 Missouri:`);
      console.log(`   Rating: ${missouri.powerRating.toFixed(2)}`);
      console.log(`   Rank: #${rank} of ${sortedRatings.length}`);
    }

    if (oklahoma) {
      const rank = sortedRatings.findIndex(r => r.teamId === oklahoma.teamId) + 1;
      console.log(`\n📊 Oklahoma:`);
      console.log(`   Rating: ${oklahoma.powerRating.toFixed(2)}`);
      console.log(`   Rank: #${rank} of ${sortedRatings.length}`);
    }

    if (missouri && oklahoma) {
      const predictedSpread = oklahoma.powerRating - missouri.powerRating + 2.5; // HFA
      console.log(`\n🎯 Predicted Spread (Missouri @ Oklahoma):`);
      console.log(`   Oklahoma Rating: ${oklahoma.powerRating.toFixed(2)}`);
      console.log(`   Missouri Rating: ${missouri.powerRating.toFixed(2)}`);
      console.log(`   HFA: 2.5`);
      console.log(`   Predicted Margin: ${predictedSpread.toFixed(2)}`);
      console.log(`   Betting Line: Oklahoma ${predictedSpread > 0 ? '-' : '+'}${Math.abs(predictedSpread).toFixed(1)}`);
    }

    // Save to database (update TeamSeasonRating with modelVersion='v1')
    console.log(`\n💾 Persisting balanced ratings to database...`);
    let upserted = 0;
    let errors = 0;

    for (const rating of ratings) {
      try {
        await prisma.teamSeasonRating.upsert({
          where: {
            season_teamId_modelVersion: {
              season: rating.season,
              teamId: rating.teamId,
              modelVersion: 'v1',
            },
          },
          update: {
            powerRating: rating.powerRating,
            rating: rating.powerRating, // Also update rating field for compatibility
            games: rating.games,
            // Keep existing offenseRating and defenseRating for now
            // They're not used in the balanced model but may be referenced elsewhere
          },
          create: {
            season: rating.season,
            teamId: rating.teamId,
            modelVersion: 'v1',
            powerRating: rating.powerRating,
            rating: rating.powerRating,
            games: rating.games,
            offenseRating: 0, // Not used in balanced model
            defenseRating: 0, // Not used in balanced model
            confidence: 0.5, // Default confidence
            dataSource: 'balanced', // Mark as balanced model
          },
        });
        upserted++;
      } catch (error) {
        console.error(`   Error upserting rating for ${rating.teamId}:`, error);
        errors++;
      }
    }

    console.log(`\n✅ Balanced ratings computation complete!`);
    console.log(`   Upserted: ${upserted}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Average power rating: ${(ratings.reduce((sum, r) => sum + r.powerRating, 0) / ratings.length).toFixed(2)}`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

