/**
 * Non-linear Model Calibration
 * 
 * Formula: market_spread ≈ α + β₁ × rating_diff + β₂ × rating_diff²
 * 
 * The quadratic term allows large rating differences to produce
 * even larger spreads (e.g., elite vs. bad = blowout).
 */

import { prisma } from '../apps/web/lib/prisma';

const HFA = 2.0;

const WEIGHTS = {
  successOff: 0.20,
  successDef: 0.25,
  epaOff: 0.15,
  epaDef: 0.20,
  yppOff: 0.30,
  yppDef: 0.20
};

function calcMeanStdDev(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  const stddev = Math.sqrt(variance);
  return { mean, stddev };
}

function calculatePowerRating(stats: any, leagueMetrics: any): number {
  const zScores: any = {};
  
  zScores.epaOff = (Number(stats.epaOff || 0) - leagueMetrics.epaOff.mean) / leagueMetrics.epaOff.stddev;
  zScores.yppOff = (Number(stats.yppOff || 0) - leagueMetrics.yppOff.mean) / leagueMetrics.yppOff.stddev;
  zScores.successOff = (Number(stats.successOff || 0) - leagueMetrics.successOff.mean) / leagueMetrics.successOff.stddev;
  
  zScores.epaDef = -(Number(stats.epaDef || 0) - leagueMetrics.epaDef.mean) / leagueMetrics.epaDef.stddev;
  zScores.yppDef = -(Number(stats.yppDef || 0) - leagueMetrics.yppDef.mean) / leagueMetrics.yppDef.stddev;
  zScores.successDef = -(Number(stats.successDef || 0) - leagueMetrics.successDef.mean) / leagueMetrics.successDef.stddev;
  
  return (
    WEIGHTS.epaOff * zScores.epaOff +
    WEIGHTS.epaDef * zScores.epaDef +
    WEIGHTS.yppOff * zScores.yppOff +
    WEIGHTS.yppDef * zScores.yppDef +
    WEIGHTS.successOff * zScores.successOff +
    WEIGHTS.successDef * zScores.successDef
  );
}

/**
 * Multiple linear regression with quadratic term
 * Y = α + β₁×X₁ + β₂×X₂
 */
function multipleRegression(
  X1: number[], // rating_diff
  X2: number[], // rating_diff²
  Y: number[]   // market_spread
): { alpha: number; beta1: number; beta2: number; rsquared: number } {
  const n = X1.length;
  
  // Use matrix approach (simplified)
  // For now, use iterative approach
  
  let alpha = 0;
  let beta1 = 1;
  let beta2 = 0;
  let learningRate = 0.01;
  const iterations = 1000;
  
  for (let iter = 0; iter < iterations; iter++) {
    let gradAlpha = 0;
    let gradBeta1 = 0;
    let gradBeta2 = 0;
    
    for (let i = 0; i < n; i++) {
      const predicted = alpha + beta1 * X1[i] + beta2 * X2[i];
      const error = predicted - Y[i];
      
      gradAlpha += error;
      gradBeta1 += error * X1[i];
      gradBeta2 += error * X2[i];
    }
    
    alpha -= learningRate * gradAlpha / n;
    beta1 -= learningRate * gradBeta1 / n;
    beta2 -= learningRate * gradBeta2 / n;
  }
  
  // Calculate R²
  const meanY = Y.reduce((a, b) => a + b, 0) / n;
  let ssRes = 0;
  let ssTot = 0;
  
  for (let i = 0; i < n; i++) {
    const predicted = alpha + beta1 * X1[i] + beta2 * X2[i];
    ssRes += (Y[i] - predicted) ** 2;
    ssTot += (Y[i] - meanY) ** 2;
  }
  
  const rsquared = 1 - (ssRes / ssTot);
  
  return { alpha, beta1, beta2, rsquared };
}

async function calibrateQuadratic(season: number, weeks: number[]) {
  console.log(`\n📊 Quadratic Calibration for ${season} Weeks ${weeks.join(', ')}...\n`);
  
  // Get league stats
  const allStats = await prisma.teamSeasonStat.findMany({ where: { season } });
  
  const leagueMetrics = {
    epaOff: calcMeanStdDev(allStats.map(s => Number(s.epaOff || 0))),
    epaDef: calcMeanStdDev(allStats.map(s => Number(s.epaDef || 0))),
    yppOff: calcMeanStdDev(allStats.map(s => Number(s.yppOff || 0))),
    yppDef: calcMeanStdDev(allStats.map(s => Number(s.yppDef || 0))),
    successOff: calcMeanStdDev(allStats.map(s => Number(s.successOff || 0))),
    successDef: calcMeanStdDev(allStats.map(s => Number(s.successDef || 0)))
  };
  
  // Collect data points
  const points: any[] = [];
  
  for (const week of weeks) {
    const games = await prisma.game.findMany({
      where: { season, week, status: 'final' },
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
    
    const teamIds = [...new Set(games.flatMap(g => [g.homeTeamId, g.awayTeamId]))];
    const stats = await prisma.teamSeasonStat.findMany({
      where: { season, teamId: { in: teamIds } }
    });
    const statsMap = new Map(stats.map(s => [s.teamId, s]));
    
    for (const game of games) {
      const homeStats = statsMap.get(game.homeTeamId);
      const awayStats = statsMap.get(game.awayTeamId);
      const marketLine = game.marketLines[0];
      
      if (!homeStats || !awayStats || !marketLine) continue;
      
      const homeRating = calculatePowerRating(homeStats, leagueMetrics);
      const awayRating = calculatePowerRating(awayStats, leagueMetrics);
      const ratingDiff = homeRating - awayRating;
      
      points.push({
        gameId: game.id,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name,
        ratingDiff,
        marketSpread: Number(marketLine.lineValue)
      });
    }
  }
  
  console.log(`   ✅ ${points.length} games collected\n`);
  
  // Prepare regression
  const X1 = points.map(p => p.ratingDiff); // Linear term
  const X2 = points.map(p => p.ratingDiff * p.ratingDiff); // Quadratic term
  const Y = points.map(p => p.marketSpread);
  
  console.log(`📐 Fitting quadratic model...\n`);
  
  const { alpha, beta1, beta2, rsquared } = multipleRegression(X1, X2, Y);
  
  // Calculate RMSE
  let sumSqError = 0;
  for (let i = 0; i < points.length; i++) {
    const predicted = alpha + beta1 * X1[i] + beta2 * X2[i];
    sumSqError += (predicted - Y[i]) ** 2;
  }
  const rmse = Math.sqrt(sumSqError / points.length);
  
  console.log(`${'='.repeat(70)}`);
  console.log(`📊 QUADRATIC CALIBRATION RESULTS`);
  console.log(`${'='.repeat(70)}\n`);
  
  console.log(`📋 PARAMETERS:`);
  console.log(`   α: ${alpha.toFixed(4)}`);
  console.log(`   β₁ (linear): ${beta1.toFixed(4)}`);
  console.log(`   β₂ (quadratic): ${beta2.toFixed(4)}`);
  console.log(`   HFA: ${HFA.toFixed(1)}\n`);
  
  console.log(`📈 FIT QUALITY:`);
  console.log(`   R²: ${rsquared.toFixed(4)} (${(rsquared * 100).toFixed(1)}%)`);
  console.log(`   ${rsquared > 0.3 ? '✅ Good fit' : '⚠️ Poor fit'}`);
  console.log(`   RMSE: ${rmse.toFixed(2)} points\n`);
  
  console.log(`🎯 FORMULA:`);
  console.log(`   spread = ${alpha.toFixed(4)} + ${beta1.toFixed(4)}×RD + ${beta2.toFixed(4)}×RD² + HFA`);
  console.log(`   where RD = rating_diff (home - away)\n`);
  
  // Test on OSU if possible
  console.log(`📝 Example: OSU (rating 2.64) @ Purdue (rating -0.53):`);
  const osuRatingDiff = 2.64 - (-0.53);
  const osuPredicted = alpha + beta1 * osuRatingDiff + beta2 * (osuRatingDiff ** 2) + HFA;
  console.log(`   Rating diff: ${osuRatingDiff.toFixed(2)}`);
  console.log(`   Predicted spread: ${osuPredicted.toFixed(1)}`);
  console.log(`   Market spread: -29.5`);
  console.log(`   Error: ${Math.abs(osuPredicted - (-29.5)).toFixed(1)} points\n`);
  
  console.log(`${'='.repeat(70)}\n`);
  
  await prisma.$disconnect();
}

function parseWeeks(weekStr: string): number[] {
  if (weekStr.includes('-')) {
    const [start, end] = weekStr.split('-').map(Number);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
  return [parseInt(weekStr)];
}

const season = parseInt(process.argv[2] || '2025', 10);
const weekStr = process.argv[3] || '8-11';
const weeks = parseWeeks(weekStr);

calibrateQuadratic(season, weeks).catch(console.error);

