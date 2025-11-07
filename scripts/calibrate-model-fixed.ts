/**
 * Model Calibration Script (Fixed Ratings Version)
 * 
 * This version RECALCULATES power ratings using the correct formula
 * instead of using the broken DB values.
 * 
 * Usage: npx tsx calibrate-model-fixed.ts [season] [weeks]
 * Example: npx tsx calibrate-model-fixed.ts 2025 8-11
 */

import { prisma } from '../apps/web/lib/prisma';

const HFA = 2.0;

// Correct weights from documentation
const WEIGHTS = {
  successOff: 0.20,
  successDef: 0.25,
  epaOff: 0.15,
  epaDef: 0.20,
  yppOff: 0.30,
  yppDef: 0.20
};

interface CalibrationPoint {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeRating: number; // RECALCULATED (correct formula)
  awayRating: number; // RECALCULATED (correct formula)
  ratingDiff: number;
  marketSpread: number;
  neutralSite: boolean;
}

interface StatMetrics {
  mean: number;
  stddev: number;
}

/**
 * Calculate mean and standard deviation
 */
function calcMeanStdDev(values: number[]): StatMetrics {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  const stddev = Math.sqrt(variance);
  return { mean, stddev };
}

/**
 * Recalculate power rating using correct formula
 */
function calculatePowerRating(
  stats: any,
  leagueMetrics: Record<string, StatMetrics>
): number {
  // Calculate z-scores
  const zScores: Record<string, number> = {};
  
  // Offensive stats (higher is better)
  zScores.epaOff = (Number(stats.epaOff || 0) - leagueMetrics.epaOff.mean) / leagueMetrics.epaOff.stddev;
  zScores.yppOff = (Number(stats.yppOff || 0) - leagueMetrics.yppOff.mean) / leagueMetrics.yppOff.stddev;
  zScores.successOff = (Number(stats.successOff || 0) - leagueMetrics.successOff.mean) / leagueMetrics.successOff.stddev;
  
  // Defensive stats (LOWER is better, so negate)
  zScores.epaDef = -(Number(stats.epaDef || 0) - leagueMetrics.epaDef.mean) / leagueMetrics.epaDef.stddev;
  zScores.yppDef = -(Number(stats.yppDef || 0) - leagueMetrics.yppDef.mean) / leagueMetrics.yppDef.stddev;
  zScores.successDef = -(Number(stats.successDef || 0) - leagueMetrics.successDef.mean) / leagueMetrics.successDef.stddev;
  
  // Calculate weighted sum
  const rating = 
    WEIGHTS.epaOff * zScores.epaOff +
    WEIGHTS.epaDef * zScores.epaDef +
    WEIGHTS.yppOff * zScores.yppOff +
    WEIGHTS.yppDef * zScores.yppDef +
    WEIGHTS.successOff * zScores.successOff +
    WEIGHTS.successDef * zScores.successDef;
  
  return rating;
}

/**
 * Fetch and recalculate ratings
 */
async function fetchCalibrationDataWithCorrectRatings(
  season: number,
  weeks: number[]
): Promise<CalibrationPoint[]> {
  console.log(`\n📊 Fetching data and RECALCULATING ratings for ${season} Weeks ${weeks.join(', ')}...\n`);
  
  // Get all team stats for league averages
  const allStats = await prisma.teamSeasonStat.findMany({
    where: { season }
  });
  
  console.log(`   Found ${allStats.length} teams with stats`);
  
  // Calculate league metrics
  const leagueMetrics: Record<string, StatMetrics> = {
    epaOff: calcMeanStdDev(allStats.map(s => Number(s.epaOff || 0))),
    epaDef: calcMeanStdDev(allStats.map(s => Number(s.epaDef || 0))),
    yppOff: calcMeanStdDev(allStats.map(s => Number(s.yppOff || 0))),
    yppDef: calcMeanStdDev(allStats.map(s => Number(s.yppDef || 0))),
    successOff: calcMeanStdDev(allStats.map(s => Number(s.successOff || 0))),
    successDef: calcMeanStdDev(allStats.map(s => Number(s.successDef || 0)))
  };
  
  console.log(`   Calculated league averages\n`);
  
  const points: CalibrationPoint[] = [];
  
  for (const week of weeks) {
    const games = await prisma.game.findMany({
      where: {
        season,
        week,
        status: 'final'
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        marketLines: {
          where: { lineType: 'spread' },
          orderBy: { timestamp: 'desc' },
          take: 1
        }
      }
    });
    
    console.log(`   Week ${week}: Found ${games.length} completed games`);
    
    // Get stats for all teams in these games
    const teamIds = [...new Set(games.flatMap(g => [g.homeTeamId, g.awayTeamId]))];
    const stats = await prisma.teamSeasonStat.findMany({
      where: {
        season,
        teamId: { in: teamIds }
      }
    });
    
    const statsMap = new Map(stats.map(s => [s.teamId, s]));
    
    // Process each game
    for (const game of games) {
      const homeStats = statsMap.get(game.homeTeamId);
      const awayStats = statsMap.get(game.awayTeamId);
      const marketLine = game.marketLines[0];
      
      if (!homeStats || !awayStats || !marketLine) {
        continue;
      }
      
      // RECALCULATE ratings using correct formula
      const homeRating = calculatePowerRating(homeStats, leagueMetrics);
      const awayRating = calculatePowerRating(awayStats, leagueMetrics);
      const ratingDiff = homeRating - awayRating;
      const marketSpread = Number(marketLine.lineValue);
      
      points.push({
        gameId: game.id,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name,
        homeRating,
        awayRating,
        ratingDiff,
        marketSpread,
        neutralSite: game.neutralSite
      });
    }
  }
  
  console.log(`   ✅ Collected ${points.length} calibration points (with RECALCULATED ratings)\n`);
  
  return points;
}

/**
 * Linear regression
 */
function linearRegression(x: number[], y: number[]): { alpha: number; beta: number; rsquared: number } {
  const n = x.length;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (x[i] - meanX) * (y[i] - meanY);
    denominator += (x[i] - meanX) ** 2;
  }
  const beta = numerator / denominator;
  const alpha = meanY - beta * meanX;
  
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = alpha + beta * x[i];
    ssRes += (y[i] - predicted) ** 2;
    ssTot += (y[i] - meanY) ** 2;
  }
  const rsquared = 1 - (ssRes / ssTot);
  
  return { alpha, beta, rsquared };
}

/**
 * Calculate errors
 */
function calculateErrors(points: CalibrationPoint[], alpha: number, beta: number) {
  const errors = points.map(p => {
    const predicted = alpha + beta * p.ratingDiff;
    return Math.abs(predicted - p.marketSpread);
  });
  
  const rmse = Math.sqrt(errors.reduce((sum, e) => sum + e ** 2, 0) / errors.length);
  const avgError = errors.reduce((sum, e) => sum + e, 0) / errors.length;
  const medianError = errors.sort((a, b) => a - b)[Math.floor(errors.length / 2)];
  
  return { rmse, avgError, medianError };
}

/**
 * Main calibration
 */
async function calibrateSpread(season: number, weeks: number[]) {
  const points = await fetchCalibrationDataWithCorrectRatings(season, weeks);
  
  if (points.length < 30) {
    throw new Error(`Insufficient data: only ${points.length} points`);
  }
  
  console.log(`📐 Running linear regression (with CORRECT ratings)...\n`);
  
  const X = points.map(p => p.ratingDiff);
  const Y = points.map(p => p.marketSpread);
  
  const { alpha, beta, rsquared } = linearRegression(X, Y);
  const { rmse, avgError, medianError } = calculateErrors(points, alpha, beta);
  
  // Display results
  console.log(`${'='.repeat(70)}`);
  console.log(`📊 CALIBRATION RESULTS (FIXED RATINGS)`);
  console.log(`${'='.repeat(70)}\n`);
  
  console.log(`📋 PARAMETERS:`);
  console.log(`   α (alpha): ${alpha.toFixed(4)}`);
  console.log(`   β (beta): ${beta.toFixed(4)}`);
  console.log(`   HFA: ${HFA.toFixed(1)}\n`);
  
  console.log(`📈 FIT QUALITY:`);
  console.log(`   R²: ${rsquared.toFixed(4)} (${(rsquared * 100).toFixed(1)}% variance explained)`);
  console.log(`   ${rsquared > 0.3 ? '✅ Good fit' : '⚠️ Poor fit - need more data or better features'}`);
  console.log(`   RMSE: ${rmse.toFixed(2)} points`);
  console.log(`   Avg Error: ${avgError.toFixed(2)} points`);
  console.log(`   Median Error: ${medianError.toFixed(2)} points\n`);
  
  console.log(`📊 SAMPLE: ${points.length} games from ${season} weeks ${weeks.join(', ')}\n`);
  
  console.log(`🎯 FORMULA:`);
  console.log(`   calibrated_spread = ${alpha.toFixed(4)} + ${beta.toFixed(4)} × rating_diff + HFA\n`);
  
  // Test on specific example
  console.log(`📝 TEST: Ohio State @ Purdue (if in sample):`);
  const osuGame = points.find(p => 
    (p.homeTeam.includes('Ohio') && p.awayTeam.includes('Ohio')) ||
    (p.homeTeam.includes('Purdue') && p.awayTeam.includes('Purdue'))
  );
  if (osuGame) {
    const predicted = alpha + beta * osuGame.ratingDiff;
    console.log(`   Rating Diff: ${osuGame.ratingDiff.toFixed(2)}`);
    console.log(`   Predicted: ${predicted.toFixed(1)} | Market: ${osuGame.marketSpread.toFixed(1)}`);
    console.log(`   Error: ${Math.abs(predicted - osuGame.marketSpread).toFixed(1)}\n`);
  } else {
    console.log(`   (Not in sample)\n`);
  }
  
  // Sample predictions
  console.log(`📝 SAMPLE PREDICTIONS (first 5 games):\n`);
  for (let i = 0; i < Math.min(5, points.length); i++) {
    const p = points[i];
    const predicted = alpha + beta * p.ratingDiff;
    const error = Math.abs(predicted - p.marketSpread);
    
    console.log(`   ${i + 1}. ${p.awayTeam} @ ${p.homeTeam}`);
    console.log(`      Ratings: ${p.awayRating.toFixed(2)} @ ${p.homeRating.toFixed(2)} (diff: ${p.ratingDiff.toFixed(2)})`);
    console.log(`      Predicted: ${predicted.toFixed(1)} | Market: ${p.marketSpread.toFixed(1)} | Error: ${error.toFixed(1)}\n`);
  }
  
  console.log(`${'='.repeat(70)}\n`);
  
  console.log(`💾 CALIBRATION DATA:`);
  console.log(JSON.stringify({
    season,
    weeks,
    calibrationType: 'spread',
    parameters: { alpha, beta, hfa: HFA },
    metrics: { rsquared, rmse, avgError, medianError, sampleSize: points.length },
    createdAt: new Date(),
    modelVersion: 'v1'
  }, null, 2));
  console.log();
  
  await prisma.$disconnect();
}

/**
 * Parse week range
 */
function parseWeeks(weekStr: string): number[] {
  if (weekStr.includes('-')) {
    const [start, end] = weekStr.split('-').map(Number);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
  return [parseInt(weekStr)];
}

// Main
const season = parseInt(process.argv[2] || '2025', 10);
const weekStr = process.argv[3] || '8-11';
const weeks = parseWeeks(weekStr);

calibrateSpread(season, weeks).catch(console.error);

