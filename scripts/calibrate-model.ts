/**
 * Model Calibration Script
 * Fits α, β parameters to calibrate power ratings to market spreads
 * 
 * Formula: market_spread ≈ α + β * rating_diff + HFA
 * Where: rating_diff = home_power - away_power
 * 
 * Usage: npx tsx calibrate-model.ts [season] [weeks]
 * Example: npx tsx calibrate-model.ts 2025 8-11
 */

import { prisma } from '../apps/web/lib/prisma';

const HFA = 2.0; // Home field advantage (constant for now)

interface CalibrationPoint {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homePower: number;
  awayPower: number;
  ratingDiff: number; // home - away
  marketSpread: number; // negative = home favored
  neutralSite: boolean;
  hfa: number;
}

interface CalibrationResult {
  season: number;
  weeks: number[];
  alpha: number;
  beta: number;
  rsquared: number;
  rmse: number;
  sampleSize: number;
  avgError: number;
  medianError: number;
}

/**
 * Simple linear regression: y = α + βx
 * Returns { alpha, beta, rsquared }
 */
function linearRegression(x: number[], y: number[]): { alpha: number; beta: number; rsquared: number } {
  const n = x.length;
  
  // Calculate means
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  
  // Calculate beta (slope)
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (x[i] - meanX) * (y[i] - meanY);
    denominator += (x[i] - meanX) ** 2;
  }
  const beta = numerator / denominator;
  
  // Calculate alpha (intercept)
  const alpha = meanY - beta * meanX;
  
  // Calculate R-squared
  let ssRes = 0; // Sum of squared residuals
  let ssTot = 0; // Total sum of squares
  for (let i = 0; i < n; i++) {
    const predicted = alpha + beta * x[i];
    ssRes += (y[i] - predicted) ** 2;
    ssTot += (y[i] - meanY) ** 2;
  }
  const rsquared = 1 - (ssRes / ssTot);
  
  return { alpha, beta, rsquared };
}

/**
 * Calculate RMSE and other error metrics
 */
function calculateErrors(points: CalibrationPoint[], alpha: number, beta: number): { rmse: number; avgError: number; medianError: number } {
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
 * Fetch calibration data from database
 */
async function fetchCalibrationData(season: number, weeks: number[]): Promise<CalibrationPoint[]> {
  console.log(`\n📊 Fetching calibration data for ${season} Weeks ${weeks.join(', ')}...\n`);
  
  const points: CalibrationPoint[] = [];
  
  for (const week of weeks) {
    // Get all completed games with market lines
    const games = await prisma.game.findMany({
      where: {
        season,
        week,
        status: 'final' // Only use completed games
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        marketLines: {
          where: { lineType: 'spread' },
          orderBy: { timestamp: 'desc' },
          take: 1 // Most recent (closing) line
        }
      }
    });
    
    console.log(`   Week ${week}: Found ${games.length} completed games`);
    
    // Get power ratings for all teams
    const teamIds = [...new Set(games.flatMap(g => [g.homeTeamId, g.awayTeamId]))];
    const ratings = await prisma.teamSeasonRating.findMany({
      where: {
        season,
        modelVersion: 'v1',
        teamId: { in: teamIds }
      }
    });
    
    const ratingsMap = new Map(ratings.map(r => [r.teamId, r]));
    
    // Process each game
    for (const game of games) {
      const homeRating = ratingsMap.get(game.homeTeamId);
      const awayRating = ratingsMap.get(game.awayTeamId);
      const marketLine = game.marketLines[0];
      
      // Skip if missing data
      if (!homeRating || !awayRating || !marketLine) {
        continue;
      }
      
      const homePower = Number(homeRating.powerRating || homeRating.rating || 0);
      const awayPower = Number(awayRating.powerRating || awayRating.rating || 0);
      const ratingDiff = homePower - awayPower;
      const marketSpread = Number(marketLine.lineValue);
      const hfa = game.neutralSite ? 0 : HFA;
      
      points.push({
        gameId: game.id,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name,
        homePower,
        awayPower,
        ratingDiff,
        marketSpread,
        neutralSite: game.neutralSite,
        hfa
      });
    }
  }
  
  console.log(`   ✅ Collected ${points.length} calibration points\n`);
  
  return points;
}

/**
 * Main calibration function
 */
async function calibrateSpread(season: number, weeks: number[]): Promise<CalibrationResult> {
  // Fetch data
  const points = await fetchCalibrationData(season, weeks);
  
  if (points.length < 30) {
    throw new Error(`Insufficient data for calibration: only ${points.length} points (need at least 30)`);
  }
  
  // Prepare regression data
  // X = rating_diff (home - away)
  // Y = market_spread (negative = home favored)
  const X = points.map(p => p.ratingDiff);
  const Y = points.map(p => p.marketSpread);
  
  console.log(`📐 Running linear regression...\n`);
  
  // Fit regression
  const { alpha, beta, rsquared } = linearRegression(X, Y);
  
  // Calculate errors
  const { rmse, avgError, medianError } = calculateErrors(points, alpha, beta);
  
  // Display results
  console.log(`${'='.repeat(70)}`);
  console.log(`📊 CALIBRATION RESULTS`);
  console.log(`${'='.repeat(70)}\n`);
  
  console.log(`📋 PARAMETERS:`);
  console.log(`   α (alpha/intercept): ${alpha.toFixed(4)}`);
  console.log(`   β (beta/slope): ${beta.toFixed(4)}`);
  console.log(`   HFA: ${HFA.toFixed(1)} (constant)\n`);
  
  console.log(`📈 FIT QUALITY:`);
  console.log(`   R²: ${rsquared.toFixed(4)} (${(rsquared * 100).toFixed(1)}% of variance explained)`);
  console.log(`   RMSE: ${rmse.toFixed(2)} points`);
  console.log(`   Avg Error: ${avgError.toFixed(2)} points`);
  console.log(`   Median Error: ${medianError.toFixed(2)} points\n`);
  
  console.log(`📊 SAMPLE:`);
  console.log(`   Games: ${points.length}`);
  console.log(`   Season: ${season}`);
  console.log(`   Weeks: ${weeks.join(', ')}\n`);
  
  console.log(`🎯 FORMULA:`);
  console.log(`   calibrated_spread = α + β × rating_diff + HFA`);
  console.log(`   calibrated_spread = ${alpha.toFixed(4)} + ${beta.toFixed(4)} × (home_power - away_power) + ${HFA.toFixed(1)}\n`);
  
  // Show example predictions
  console.log(`📝 SAMPLE PREDICTIONS (first 5 games):\n`);
  for (let i = 0; i < Math.min(5, points.length); i++) {
    const p = points[i];
    const predicted = alpha + beta * p.ratingDiff;
    const error = Math.abs(predicted - p.marketSpread);
    
    console.log(`   ${i + 1}. ${p.awayTeam} @ ${p.homeTeam}`);
    console.log(`      Rating Diff: ${p.ratingDiff.toFixed(2)}`);
    console.log(`      Predicted: ${predicted.toFixed(1)} | Market: ${p.marketSpread.toFixed(1)} | Error: ${error.toFixed(1)}\n`);
  }
  
  console.log(`${'='.repeat(70)}\n`);
  
  return {
    season,
    weeks,
    alpha,
    beta,
    rsquared,
    rmse,
    sampleSize: points.length,
    avgError,
    medianError
  };
}

/**
 * Save calibration to database
 */
async function saveCalibration(result: CalibrationResult): Promise<void> {
  console.log(`💾 Saving calibration to database...\n`);
  
  try {
    // For now, we'll create a simple JSON record
    // TODO: Create proper model_calibration table in schema
    const calibrationData = {
      season: result.season,
      weeks: result.weeks,
      calibrationType: 'spread',
      parameters: {
        alpha: result.alpha,
        beta: result.beta,
        hfa: HFA
      },
      metrics: {
        rsquared: result.rsquared,
        rmse: result.rmse,
        avgError: result.avgError,
        medianError: result.medianError,
        sampleSize: result.sampleSize
      },
      createdAt: new Date(),
      modelVersion: 'v1'
    };
    
    console.log(`   Calibration data ready for storage:`);
    console.log(JSON.stringify(calibrationData, null, 2));
    console.log();
    console.log(`   ⚠️  NOTE: model_calibration table not yet created in schema`);
    console.log(`   📝 TODO: Add this to prisma/schema.prisma:\n`);
    console.log(`   model ModelCalibration {`);
    console.log(`     id              String   @id @default(cuid())`);
    console.log(`     season          Int`);
    console.log(`     weeks           Json     // Array of weeks used`);
    console.log(`     calibrationType String   // 'spread', 'total', 'moneyline'`);
    console.log(`     parameters      Json     // { alpha, beta, etc. }`);
    console.log(`     metrics         Json     // { rsquared, rmse, etc. }`);
    console.log(`     modelVersion    String   @default("v1")`);
    console.log(`     createdAt       DateTime @default(now())`);
    console.log();
    console.log(`     @@unique([season, calibrationType, modelVersion])`);
    console.log(`     @@map("model_calibrations")`);
    console.log(`   }\n`);
    
    console.log(`   ✅ Calibration computed successfully\n`);
    
  } catch (error) {
    console.error(`   ❌ Error saving calibration:`, error);
    throw error;
  }
}

/**
 * Parse week range (e.g., "8-11" or "11")
 */
function parseWeeks(weekStr: string): number[] {
  if (weekStr.includes('-')) {
    const [start, end] = weekStr.split('-').map(Number);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
  return [parseInt(weekStr)];
}

/**
 * Main entry point
 */
async function main() {
  const season = parseInt(process.argv[2] || '2025', 10);
  const weekStr = process.argv[3] || '8-11'; // Default: last 4 weeks
  const weeks = parseWeeks(weekStr);
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔬 MODEL CALIBRATION (SPREAD)`);
  console.log(`${'='.repeat(70)}\n`);
  
  try {
    const result = await calibrateSpread(season, weeks);
    await saveCalibration(result);
    
    console.log(`✅ Calibration complete!\n`);
    console.log(`📌 NEXT STEPS:`);
    console.log(`   1. Add ModelCalibration table to schema`);
    console.log(`   2. Run: npx prisma migrate dev --name add_model_calibration`);
    console.log(`   3. Re-run this script to save to DB`);
    console.log(`   4. Update API to read α, β from model_calibrations table`);
    console.log(`   5. Test on OSU @ Purdue using: npx tsx scripts/audit-game.ts 2025-wk11-ohio-state-purdue\n`);
    
  } catch (error) {
    console.error(`\n❌ Calibration failed:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run calibration
main().catch(console.error);

