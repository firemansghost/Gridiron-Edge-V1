/**
 * Optimize Ratings Weights
 * 
 * Tests different weighting scenarios (Talent vs. Efficiency vs. Wins) against
 * actual game results from Weeks 8-12 to find the optimal formula.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TeamMetrics {
  teamId: string;
  teamName: string;
  talentScore: number;
  epaOverall: number;
  netPointsPerGame: number;
  winPct: number;
  gamesPlayed: number;
}

interface GameResult {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  actualMargin: number; // Home - Away
}

interface Scenario {
  name: string;
  weights: {
    talent: number;
    epa: number;
    netPoints: number;
    winPct: number;
  };
}

interface ScenarioResult {
  scenario: Scenario;
  mae: number; // Mean Absolute Error
  ratings: Map<string, number>; // teamId -> rating
  rankings: Array<{ teamId: string; teamName: string; rating: number; rank: number }>;
}

const SCENARIOS: Scenario[] = [
  {
    name: 'Balanced',
    weights: {
      talent: 0.25,
      epa: 0.25,
      netPoints: 0.25,
      winPct: 0.25,
    },
  },
  {
    name: 'Efficiency Heavy',
    weights: {
      talent: 0.10,
      epa: 0.60,
      netPoints: 0.30,
      winPct: 0.00,
    },
  },
  {
    name: 'Talent Heavy',
    weights: {
      talent: 0.50,
      epa: 0.20,
      netPoints: 0.00,
      winPct: 0.30,
    },
  },
];

const CALIBRATION_FACTOR = 14.0; // Convert z-scores to point scale
const HFA = 2.5; // Home field advantage

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

  // Get V1 ratings (for talent component estimation)
  const ratings = await prisma.teamSeasonRating.findMany({
    where: {
      season,
      modelVersion: 'v1',
      teamId: { in: Array.from(fbsTeamIds) },
    },
  });

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

  // Get talent scores from TeamSeasonTalent table
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

  // Fallback: If no talent data, use 0 (will be normalized to z-score anyway)
  console.log(`   Loaded talent data for ${talentMap.size} teams`);

  // Build metrics array
  const metrics: TeamMetrics[] = [];
  for (const teamId of Array.from(fbsTeamIds)) {
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
 * Load game results for backtesting
 */
async function loadGameResults(season: number, startWeek: number, endWeek: number): Promise<GameResult[]> {
  console.log(`\n🎮 Loading game results for weeks ${startWeek}-${endWeek}...`);

  const games = await prisma.game.findMany({
    where: {
      season,
      week: { gte: startWeek, lte: endWeek },
      status: 'final',
      homeScore: { not: null },
      awayScore: { not: null },
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { date: 'asc' },
  });

  const results: GameResult[] = games.map(game => ({
    gameId: game.id,
    homeTeamId: game.homeTeamId.toLowerCase(),
    awayTeamId: game.awayTeamId.toLowerCase(),
    homeTeamName: game.homeTeam.name,
    awayTeamName: game.awayTeam.name,
    homeScore: game.homeScore || 0,
    awayScore: game.awayScore || 0,
    actualMargin: (game.homeScore || 0) - (game.awayScore || 0),
  }));

  console.log(`   Loaded ${results.length} completed games`);
  return results;
}

/**
 * Compute ratings for a scenario
 */
function computeRatings(
  metrics: TeamMetrics[],
  scenario: Scenario,
  zStats: {
    talent: { mean: number; stdDev: number };
    epa: { mean: number; stdDev: number };
    netPoints: { mean: number; stdDev: number };
    winPct: { mean: number; stdDev: number };
  }
): Map<string, number> {
  const ratings = new Map<string, number>();

  for (const metric of metrics) {
    const talentZ = getZScore(metric.talentScore, zStats.talent.mean, zStats.talent.stdDev);
    const epaZ = getZScore(metric.epaOverall, zStats.epa.mean, zStats.epa.stdDev);
    const netPointsZ = getZScore(metric.netPointsPerGame, zStats.netPoints.mean, zStats.netPoints.stdDev);
    const winPctZ = getZScore(metric.winPct, zStats.winPct.mean, zStats.winPct.stdDev);

    const weightedZ = 
      talentZ * scenario.weights.talent +
      epaZ * scenario.weights.epa +
      netPointsZ * scenario.weights.netPoints +
      winPctZ * scenario.weights.winPct;

    const rating = weightedZ * CALIBRATION_FACTOR;
    ratings.set(metric.teamId, rating);
  }

  return ratings;
}

/**
 * Test a scenario against game results
 */
function testScenario(
  scenario: Scenario,
  metrics: TeamMetrics[],
  games: GameResult[],
  zStats: {
    talent: { mean: number; stdDev: number };
    epa: { mean: number; stdDev: number };
    netPoints: { mean: number; stdDev: number };
    winPct: { mean: number; stdDev: number };
  }
): ScenarioResult {
  // Compute ratings
  const ratings = computeRatings(metrics, scenario, zStats);

  // Test against games
  let totalError = 0;
  let gameCount = 0;

  for (const game of games) {
    const homeRating = ratings.get(game.homeTeamId) || 0;
    const awayRating = ratings.get(game.awayTeamId) || 0;

    // Skip if we don't have ratings for both teams
    if (!ratings.has(game.homeTeamId) || !ratings.has(game.awayTeamId)) {
      continue;
    }

    const predictedMargin = homeRating - awayRating + HFA;
    const error = Math.abs(predictedMargin - game.actualMargin);
    totalError += error;
    gameCount++;
  }

  const mae = gameCount > 0 ? totalError / gameCount : Infinity;

  // Create rankings
  const rankings = Array.from(ratings.entries())
    .map(([teamId, rating]) => {
      const metric = metrics.find(m => m.teamId === teamId);
      return {
        teamId,
        teamName: metric?.teamName || teamId,
        rating,
        rank: 0, // Will be set after sorting
      };
    })
    .sort((a, b) => b.rating - a.rating)
    .map((team, index) => ({
      ...team,
      rank: index + 1,
    }));

  return {
    scenario,
    mae,
    ratings,
    rankings,
  };
}

/**
 * Main function
 */
async function main() {
  const season = 2025;
  const startWeek = 8;
  const endWeek = 12;

  console.log('\n🔬 RATINGS WEIGHTS OPTIMIZATION');
  console.log('='.repeat(70));
  console.log(`Season: ${season}`);
  console.log(`Weeks: ${startWeek}-${endWeek}`);
  console.log(`Scenarios: ${SCENARIOS.length}`);

  // Load data
  const metrics = await loadTeamMetrics(season);
  const games = await loadGameResults(season, startWeek, endWeek);

  if (metrics.length === 0) {
    console.error('❌ No team metrics found');
    return;
  }

  if (games.length === 0) {
    console.error('❌ No games found for backtesting');
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

  // Test each scenario
  console.log(`\n🧪 Testing scenarios...`);
  const results: ScenarioResult[] = [];

  for (const scenario of SCENARIOS) {
    console.log(`   Testing: ${scenario.name}...`);
    const result = testScenario(scenario, metrics, games, zStats);
    results.push(result);
    console.log(`      MAE: ${result.mae.toFixed(2)} points`);
  }

  // Find winner
  const winner = results.reduce((best, current) => 
    current.mae < best.mae ? current : best
  );

  // Output results
  console.log(`\n📊 RESULTS`);
  console.log('='.repeat(70));
  console.log(`\n🏆 WINNER: ${winner.scenario.name}`);
  console.log(`   Mean Absolute Error: ${winner.mae.toFixed(2)} points`);
  console.log(`   Weights:`);
  console.log(`      Talent: ${(winner.scenario.weights.talent * 100).toFixed(0)}%`);
  console.log(`      EPA: ${(winner.scenario.weights.epa * 100).toFixed(0)}%`);
  console.log(`      Net Points: ${(winner.scenario.weights.netPoints * 100).toFixed(0)}%`);
  console.log(`      Win %: ${(winner.scenario.weights.winPct * 100).toFixed(0)}%`);

  console.log(`\n📈 All Scenarios:`);
  console.log(`   ${'Scenario'.padEnd(20)} ${'MAE'.padStart(10)}`);
  console.log(`   ${'-'.repeat(30)}`);
  for (const result of results.sort((a, b) => a.mae - b.mae)) {
    const marker = result === winner ? ' 🏆' : '';
    console.log(`   ${result.scenario.name.padEnd(20)} ${result.mae.toFixed(2).padStart(10)}${marker}`);
  }

  // Deep dive: Missouri and Oklahoma
  console.log(`\n🔍 DEEP DIVE: Missouri & Oklahoma (${winner.scenario.name} Scenario)`);
  console.log('='.repeat(70));

  const missouri = winner.rankings.find(r => 
    r.teamName.toLowerCase().includes('missouri') && 
    !r.teamName.toLowerCase().includes('southeast') &&
    !r.teamName.toLowerCase().includes('state')
  );

  const oklahoma = winner.rankings.find(r => 
    r.teamName.toLowerCase().includes('oklahoma') &&
    !r.teamName.toLowerCase().includes('state')
  );

  if (missouri) {
    console.log(`\n📊 Missouri:`);
    console.log(`   Rating: ${missouri.rating.toFixed(2)}`);
    console.log(`   Rank: #${missouri.rank} of ${winner.rankings.length}`);
  } else {
    console.log(`\n⚠️  Missouri not found in rankings`);
  }

  if (oklahoma) {
    console.log(`\n📊 Oklahoma:`);
    console.log(`   Rating: ${oklahoma.rating.toFixed(2)}`);
    console.log(`   Rank: #${oklahoma.rank} of ${winner.rankings.length}`);
  } else {
    console.log(`\n⚠️  Oklahoma not found in rankings`);
  }

  if (missouri && oklahoma) {
    const predictedSpread = oklahoma.rating - missouri.rating + HFA;
    console.log(`\n🎯 Predicted Spread (Missouri @ Oklahoma):`);
    console.log(`   Oklahoma Rating: ${oklahoma.rating.toFixed(2)}`);
    console.log(`   Missouri Rating: ${missouri.rating.toFixed(2)}`);
    console.log(`   HFA: ${HFA.toFixed(1)}`);
    console.log(`   Predicted Margin: ${predictedSpread.toFixed(2)}`);
    console.log(`   Betting Line: Oklahoma ${predictedSpread > 0 ? '-' : '+'}${Math.abs(predictedSpread).toFixed(1)}`);
  }

  // Show top 10 and bottom 10
  console.log(`\n🏆 Top 10 Teams (${winner.scenario.name}):`);
  for (let i = 0; i < Math.min(10, winner.rankings.length); i++) {
    const team = winner.rankings[i];
    console.log(`   ${team.rank.toString().padStart(3)}. ${team.teamName.padEnd(35)} ${team.rating.toFixed(2)}`);
  }

  console.log(`\n📉 Bottom 10 Teams (${winner.scenario.name}):`);
  for (let i = Math.max(0, winner.rankings.length - 10); i < winner.rankings.length; i++) {
    const team = winner.rankings[i];
    console.log(`   ${team.rank.toString().padStart(3)}. ${team.teamName.padEnd(35)} ${team.rating.toFixed(2)}`);
  }

  console.log('\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

