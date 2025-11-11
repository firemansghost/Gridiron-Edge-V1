/**
 * Phase 2.5: Quadratic Calibration with Ridge Regularization
 * 
 * Formula: market_spread ≈ α + β₁×rating_diff + β₂×rating_diff² + β₃×talent_diff_z 
 *                           + β₄×hfa_team_home + class_dummies
 * 
 * Ridge regularization (L2): Adds penalty λ(β₁² + β₂² + β₃² + β₄²) to prevent overfitting
 * 
 * Benefits:
 * - Prevents overfitting when features are correlated
 * - Shrinks coefficients toward zero
 * - Better generalization to unseen games
 * - Reduces variance in predictions
 * 
 * Usage: npx tsx scripts/calibrate-model-ridge.ts [season] [weeks] [lambda]
 * Example: npx tsx scripts/calibrate-model-ridge.ts 2025 1-12 0.1
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

interface CalibrationPoint {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  ratingDiff: number;
  marketSpread: number;
  talentDiffZ: number | null;
  isP5_G5: number;
  isP5_FCS: number;
  isG5_G5: number;
  isG5_FCS: number;
  hfaTeamHome: number;
}

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
 * Ridge Regression with L2 Regularization
 * 
 * Minimizes: Σ(y - ŷ)² + λ Σβ²
 * 
 * Features (X):
 * - X0: intercept (always 1)
 * - X1: rating_diff
 * - X2: rating_diff²
 * - X3: talent_diff_z (optional, 0 if missing)
 * - X4: is_P5_G5 dummy
 * - X5: is_P5_FCS dummy
 * - X6: is_G5_G5 dummy
 * - X7: is_G5_FCS dummy
 * - X8: hfa_team_home
 * 
 * @param X - Feature matrix (n × p)
 * @param y - Target vector (n × 1)
 * @param lambda - Regularization strength (0 = no regularization, higher = more shrinkage)
 * @returns coefficients (β) including intercept
 */
function ridgeRegression(
  X: number[][], // n × p feature matrix
  y: number[],   // n × 1 target vector
  lambda: number
): {
  coefficients: number[];
  rsquared: number;
  rmse: number;
  adjRsquared: number;
} {
  const n = X.length; // number of samples
  const p = X[0].length; // number of features (including intercept)
  
  // Gradient descent with L2 regularization
  let beta = new Array(p).fill(0);
  let learningRate = 0.01;
  const maxIterations = 5000;
  const tolerance = 1e-6;
  
  let prevLoss = Infinity;
  
  for (let iter = 0; iter < maxIterations; iter++) {
    const gradients = new Array(p).fill(0);
    
    // Calculate gradients with L2 penalty
    for (let i = 0; i < n; i++) {
      let predicted = 0;
      for (let j = 0; j < p; j++) {
        predicted += beta[j] * X[i][j];
      }
      const error = predicted - y[i];
      
      for (let j = 0; j < p; j++) {
        // Gradient of squared error
        gradients[j] += error * X[i][j];
        
        // Add L2 penalty gradient (don't penalize intercept)
        if (j > 0) {
          gradients[j] += lambda * beta[j];
        }
      }
    }
    
    // Update coefficients
    for (let j = 0; j < p; j++) {
      beta[j] -= learningRate * gradients[j] / n;
    }
    
    // Calculate loss for convergence check
    let loss = 0;
    for (let i = 0; i < n; i++) {
      let predicted = 0;
      for (let j = 0; j < p; j++) {
        predicted += beta[j] * X[i][j];
      }
      loss += (y[i] - predicted) ** 2;
    }
    
    // Add L2 penalty to loss
    let l2Penalty = 0;
    for (let j = 1; j < p; j++) { // Skip intercept
      l2Penalty += beta[j] ** 2;
    }
    loss += lambda * l2Penalty;
    
    // Check convergence
    if (Math.abs(prevLoss - loss) < tolerance) {
      console.log(`   Converged at iteration ${iter}`);
      break;
    }
    prevLoss = loss;
  }
  
  // Calculate R² and RMSE
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let ssRes = 0;
  let ssTot = 0;
  
  for (let i = 0; i < n; i++) {
    let predicted = 0;
    for (let j = 0; j < p; j++) {
      predicted += beta[j] * X[i][j];
    }
    ssRes += (y[i] - predicted) ** 2;
    ssTot += (y[i] - meanY) ** 2;
  }
  
  const rsquared = 1 - (ssRes / ssTot);
  const rmse = Math.sqrt(ssRes / n);
  
  // Adjusted R² to account for number of features
  const adjRsquared = 1 - ((1 - rsquared) * (n - 1) / (n - p));
  
  return { coefficients: beta, rsquared, rmse, adjRsquared };
}

/**
 * Cross-validation to find optimal lambda
 * 
 * Uses k-fold cross-validation to test different lambda values
 * and selects the one with the lowest validation error
 */
function crossValidateRidge(
  X: number[][],
  y: number[],
  lambdas: number[],
  kFolds: number = 5
): { bestLambda: number; cvScores: Array<{ lambda: number; rmse: number; rsquared: number }> } {
  const n = X.length;
  const foldSize = Math.floor(n / kFolds);
  
  const cvScores: Array<{ lambda: number; rmse: number; rsquared: number }> = [];
  
  console.log(`\n🔍 Cross-validation with ${kFolds} folds...`);
  
  for (const lambda of lambdas) {
    const foldRmses: number[] = [];
    const foldRsquares: number[] = [];
    
    for (let fold = 0; fold < kFolds; fold++) {
      // Split into train and validation
      const valStart = fold * foldSize;
      const valEnd = fold === kFolds - 1 ? n : valStart + foldSize;
      
      const XTrain: number[][] = [];
      const yTrain: number[] = [];
      const XVal: number[][] = [];
      const yVal: number[] = [];
      
      for (let i = 0; i < n; i++) {
        if (i >= valStart && i < valEnd) {
          XVal.push(X[i]);
          yVal.push(y[i]);
        } else {
          XTrain.push(X[i]);
          yTrain.push(y[i]);
        }
      }
      
      // Train on this fold
      const { coefficients } = ridgeRegression(XTrain, yTrain, lambda);
      
      // Validate
      let ssRes = 0;
      let ssTot = 0;
      const meanYVal = yVal.reduce((a, b) => a + b, 0) / yVal.length;
      
      for (let i = 0; i < XVal.length; i++) {
        let predicted = 0;
        for (let j = 0; j < coefficients.length; j++) {
          predicted += coefficients[j] * XVal[i][j];
        }
        ssRes += (yVal[i] - predicted) ** 2;
        ssTot += (yVal[i] - meanYVal) ** 2;
      }
      
      const foldRmse = Math.sqrt(ssRes / XVal.length);
      const foldRsquared = 1 - (ssRes / ssTot);
      
      foldRmses.push(foldRmse);
      foldRsquares.push(foldRsquared);
    }
    
    const avgRmse = foldRmses.reduce((a, b) => a + b, 0) / foldRmses.length;
    const avgRsquared = foldRsquares.reduce((a, b) => a + b, 0) / foldRsquares.length;
    
    cvScores.push({ lambda, rmse: avgRmse, rsquared: avgRsquared });
    console.log(`   λ=${lambda.toFixed(3)}: RMSE=${avgRmse.toFixed(3)}, R²=${avgRsquared.toFixed(4)}`);
  }
  
  // Find best lambda (lowest RMSE)
  cvScores.sort((a, b) => a.rmse - b.rmse);
  const bestLambda = cvScores[0].lambda;
  
  console.log(`\n   ✅ Best λ: ${bestLambda.toFixed(3)} (RMSE: ${cvScores[0].rmse.toFixed(3)})\n`);
  
  return { bestLambda, cvScores };
}

async function calibrateRidge(season: number, weeks: number[], lambdaParam?: number) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 PHASE 2.5: RIDGE REGULARIZED QUADRATIC CALIBRATION`);
  console.log(`${'='.repeat(70)}\n`);
  console.log(`   Season: ${season}`);
  console.log(`   Weeks: ${weeks.join(', ')}`);
  console.log(`   Model: Quadratic + Talent + Class + Team HFA + Ridge L2\n`);
  
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
  const points: CalibrationPoint[] = [];
  
  // Get all talent data for the season
  const allSeasonTalent = await prisma.teamSeasonTalent.findMany({
    where: { season },
    select: { talentComposite: true, teamId: true },
  });
  
  // Get team conferences
  const teamIds = Array.from(new Set(allSeasonTalent.map(t => t.teamId)));
  const teamConferences = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: { id: true, conference: true },
  });
  const conferenceMap = new Map(teamConferences.map(t => [t.id, t.conference]));
  
  const G5_CONFERENCES = new Set([
    'American Athletic', 'Conference USA', 'Mid-American', 'Mountain West', 'Sun Belt'
  ]);
  const isG5 = (conf: string | null) => conf !== null && G5_CONFERENCES.has(conf);
  
  // Calculate G5 p10 for imputation
  const g5TalentValues: number[] = [];
  for (const talent of allSeasonTalent) {
    if (talent.talentComposite !== null && isFinite(talent.talentComposite)) {
      const conf = conferenceMap.get(talent.teamId);
      if (conf && isG5(conf)) {
        g5TalentValues.push(talent.talentComposite);
      }
    }
  }
  
  let g5P10: number | null = null;
  if (g5TalentValues.length >= 10) {
    g5TalentValues.sort((a, b) => a - b);
    const n = g5TalentValues.length;
    const p10 = g5TalentValues[Math.floor(n * 0.10)];
    g5P10 = p10;
  }
  
  // Calculate talent normalization params
  const allTalentValues = allSeasonTalent
    .map(t => t.talentComposite)
    .filter(v => v !== null && isFinite(v)) as number[];
  const talentMean = allTalentValues.length > 0 
    ? allTalentValues.reduce((a, b) => a + b, 0) / allTalentValues.length 
    : null;
  const talentVariance = talentMean !== null
    ? allTalentValues.reduce((sum, val) => sum + Math.pow(val - talentMean, 2), 0) / allTalentValues.length
    : 0;
  const talentStd = Math.sqrt(talentVariance);
  
  // Collect game data
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
    
    const gameTeamIds = Array.from(new Set(games.flatMap(g => [g.homeTeamId, g.awayTeamId])));
    const stats = await prisma.teamSeasonStat.findMany({
      where: { season, teamId: { in: gameTeamIds } }
    });
    const statsMap = new Map(stats.map(s => [s.teamId, s]));
    
    const ratings = await prisma.teamSeasonRating.findMany({
      where: { season, teamId: { in: gameTeamIds }, modelVersion: 'v1' }
    });
    const ratingsMap = new Map(ratings.map(r => [r.teamId, r]));
    
    const talentData = await prisma.teamSeasonTalent.findMany({
      where: { season, teamId: { in: gameTeamIds } }
    });
    const talentMap = new Map(talentData.map(t => [t.teamId, t]));
    
    for (const game of games) {
      const homeStats = statsMap.get(game.homeTeamId);
      const awayStats = statsMap.get(game.awayTeamId);
      const marketLine = game.marketLines[0];
      
      if (!homeStats || !awayStats || !marketLine) continue;
      
      // Calculate power ratings
      const homeRatingCalc = calculatePowerRating(homeStats, leagueMetrics);
      const awayRatingCalc = calculatePowerRating(awayStats, leagueMetrics);
      const ratingDiff = homeRatingCalc - awayRatingCalc;
      
      // Talent gap feature
      const homeTalentRaw = talentMap.get(game.homeTeamId)?.talentComposite ?? null;
      const awayTalentRaw = talentMap.get(game.awayTeamId)?.talentComposite ?? null;
      const homeTalentUsed = homeTalentRaw ?? g5P10;
      const awayTalentUsed = awayTalentRaw ?? g5P10;
      
      let talentDiffZ: number | null = null;
      if (homeTalentUsed !== null && awayTalentUsed !== null && talentStd > 0.1 && talentMean !== null) {
        const homeTalentZ = (homeTalentUsed - talentMean) / talentStd;
        const awayTalentZ = (awayTalentUsed - talentMean) / talentStd;
        talentDiffZ = homeTalentZ - awayTalentZ;
      }
      
      // Matchup class feature
      const [homeMembership, awayMembership] = await Promise.all([
        prisma.teamMembership.findUnique({
          where: { season_teamId: { season, teamId: game.homeTeamId } }
        }),
        prisma.teamMembership.findUnique({
          where: { season_teamId: { season, teamId: game.awayTeamId } }
        })
      ]);
      
      const P5_CONFERENCES = new Set(['ACC', 'Big Ten', 'B1G', 'Big 12', 'SEC', 'Pac-12']);
      
      const classifyTier = (teamId: string, membership: typeof homeMembership, conf: string | null): 'P5' | 'G5' | 'FCS' => {
        if (membership?.level === 'fcs') return 'FCS';
        if (teamId === 'notre-dame') return 'P5';
        if (conf && P5_CONFERENCES.has(conf)) return 'P5';
        if (conf && G5_CONFERENCES.has(conf)) return 'G5';
        if (membership?.level === 'fbs') return 'G5';
        return 'FCS';
      };
      
      const homeTier = classifyTier(game.homeTeamId, homeMembership, game.homeTeam.conference);
      const awayTier = classifyTier(game.awayTeamId, awayMembership, game.awayTeam.conference);
      
      const tierOrder = { P5: 3, G5: 2, FCS: 1 };
      const [higher, lower] = tierOrder[homeTier] >= tierOrder[awayTier] ? [homeTier, awayTier] : [awayTier, homeTier];
      
      let matchupClass: 'P5_P5' | 'P5_G5' | 'P5_FCS' | 'G5_G5' | 'G5_FCS' = 'P5_P5';
      if (higher === 'P5' && lower === 'P5') matchupClass = 'P5_P5';
      else if (higher === 'P5' && lower === 'G5') matchupClass = 'P5_G5';
      else if (higher === 'P5' && lower === 'FCS') matchupClass = 'P5_FCS';
      else if (higher === 'G5' && lower === 'G5') matchupClass = 'G5_G5';
      else if (higher === 'G5' && lower === 'FCS') matchupClass = 'G5_FCS';
      
      const isP5_G5 = matchupClass === 'P5_G5' ? 1 : 0;
      const isP5_FCS = matchupClass === 'P5_FCS' ? 1 : 0;
      const isG5_G5 = matchupClass === 'G5_G5' ? 1 : 0;
      const isG5_FCS = matchupClass === 'G5_FCS' ? 1 : 0;
      
      // Team-specific HFA
      const homeRatingRecord = ratingsMap.get(game.homeTeamId);
      const homeRatingWithHFA = homeRatingRecord as typeof homeRatingRecord & {
        hfaTeam?: number | null;
      };
      const homeHFA = homeRatingWithHFA && homeRatingWithHFA.hfaTeam !== null && homeRatingWithHFA.hfaTeam !== undefined
        ? Number(homeRatingWithHFA.hfaTeam)
        : (game.neutralSite ? 0 : 2.0);
      
      points.push({
        gameId: game.id,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name,
        ratingDiff,
        marketSpread: Number(marketLine.lineValue),
        talentDiffZ: talentDiffZ ?? 0, // Impute 0 if missing
        isP5_G5,
        isP5_FCS,
        isG5_G5,
        isG5_FCS,
        hfaTeamHome: homeHFA
      });
    }
  }
  
  console.log(`   ✅ ${points.length} games collected\n`);
  
  // Build feature matrix X and target vector y
  // Features: [1, ratingDiff, ratingDiff², talentDiffZ, isP5_G5, isP5_FCS, isG5_G5, isG5_FCS, hfaTeamHome]
  const X: number[][] = points.map(p => [
    1,                          // X0: intercept
    p.ratingDiff,               // X1: linear term
    p.ratingDiff * p.ratingDiff, // X2: quadratic term
    p.talentDiffZ || 0,         // X3: talent gap (z-score)
    p.isP5_G5,                  // X4: P5 vs G5 dummy
    p.isP5_FCS,                 // X5: P5 vs FCS dummy
    p.isG5_G5,                  // X6: G5 vs G5 dummy
    p.isG5_FCS,                 // X7: G5 vs FCS dummy
    p.hfaTeamHome               // X8: team-specific HFA
  ]);
  
  const y: number[] = points.map(p => p.marketSpread);
  
  // Cross-validation to find optimal lambda (if not provided)
  let lambda = lambdaParam !== undefined ? lambdaParam : 0.1;
  
  if (lambdaParam === undefined) {
    const lambdas = [0, 0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0];
    const { bestLambda } = crossValidateRidge(X, y, lambdas, 5);
    lambda = bestLambda;
  } else {
    console.log(`\n   Using provided λ: ${lambda}\n`);
  }
  
  // Fit final model with chosen lambda
  console.log(`\n📐 Fitting ridge regression model (λ=${lambda})...\n`);
  
  const { coefficients, rsquared, rmse, adjRsquared } = ridgeRegression(X, y, lambda);
  
  // Display results
  console.log(`${'='.repeat(70)}`);
  console.log(`📊 RIDGE REGRESSION RESULTS`);
  console.log(`${'='.repeat(70)}\n`);
  
  console.log(`📋 HYPERPARAMETER:`);
  console.log(`   λ (regularization): ${lambda.toFixed(4)}\n`);
  
  console.log(`📋 COEFFICIENTS:`);
  console.log(`   α  (intercept):         ${coefficients[0].toFixed(4)}`);
  console.log(`   β₁ (rating_diff):       ${coefficients[1].toFixed(4)}`);
  console.log(`   β₂ (rating_diff²):      ${coefficients[2].toFixed(4)}`);
  console.log(`   β₃ (talent_diff_z):     ${coefficients[3].toFixed(4)}`);
  console.log(`   β₄ (P5_G5 dummy):       ${coefficients[4].toFixed(4)}`);
  console.log(`   β₅ (P5_FCS dummy):      ${coefficients[5].toFixed(4)}`);
  console.log(`   β₆ (G5_G5 dummy):       ${coefficients[6].toFixed(4)}`);
  console.log(`   β₇ (G5_FCS dummy):      ${coefficients[7].toFixed(4)}`);
  console.log(`   β₈ (hfa_team_home):     ${coefficients[8].toFixed(4)}\n`);
  
  console.log(`📈 FIT QUALITY:`);
  console.log(`   R²:          ${rsquared.toFixed(4)} (${(rsquared * 100).toFixed(1)}%)`);
  console.log(`   Adjusted R²: ${adjRsquared.toFixed(4)} (${(adjRsquared * 100).toFixed(1)}%)`);
  console.log(`   RMSE:        ${rmse.toFixed(2)} points`);
  console.log(`   ${rsquared > 0.35 ? '✅ Good fit' : rsquared > 0.25 ? '⚠️  Fair fit' : '❌ Poor fit'}\n`);
  
  // Compare to unregularized model
  console.log(`🎯 REGULARIZATION EFFECT:`);
  const { rsquared: rsquaredUnreg, rmse: rmseUnreg } = ridgeRegression(X, y, 0);
  console.log(`   Unregularized R²:  ${rsquaredUnreg.toFixed(4)}`);
  console.log(`   Regularized R²:    ${rsquared.toFixed(4)}`);
  console.log(`   Unregularized RMSE: ${rmseUnreg.toFixed(2)} pts`);
  console.log(`   Regularized RMSE:   ${rmse.toFixed(2)} pts`);
  console.log(`   ${rmse < rmseUnreg ? '✅ Ridge improves generalization' : '⚠️  Ridge may be too strong'}\n`);
  
  // Export formula
  console.log(`🎯 FORMULA:`);
  console.log(`   spread = ${coefficients[0].toFixed(4)}`);
  console.log(`          + ${coefficients[1].toFixed(4)} × rating_diff`);
  console.log(`          + ${coefficients[2].toFixed(4)} × rating_diff²`);
  console.log(`          + ${coefficients[3].toFixed(4)} × talent_diff_z`);
  console.log(`          + ${coefficients[4].toFixed(4)} × P5_G5`);
  console.log(`          + ${coefficients[5].toFixed(4)} × P5_FCS`);
  console.log(`          + ${coefficients[6].toFixed(4)} × G5_G5`);
  console.log(`          + ${coefficients[7].toFixed(4)} × G5_FCS`);
  console.log(`          + ${coefficients[8].toFixed(4)} × hfa_team_home\n`);
  
  // Test on example game
  console.log(`📝 Example Prediction: OSU (rating 2.64) @ Purdue (rating -0.53):`);
  const osuRatingDiff = 2.64 - (-0.53);
  const osuTalentDiffZ = 0; // Assume average
  const osuIsP5_G5 = 1; // P5 vs G5
  const osuHFA = 2.0;
  const osuPredicted = coefficients[0] 
    + coefficients[1] * osuRatingDiff 
    + coefficients[2] * (osuRatingDiff ** 2)
    + coefficients[3] * osuTalentDiffZ
    + coefficients[4] * osuIsP5_G5
    + coefficients[5] * 0 // P5_FCS
    + coefficients[6] * 0 // G5_G5
    + coefficients[7] * 0 // G5_FCS
    + coefficients[8] * osuHFA;
  console.log(`   Rating diff: ${osuRatingDiff.toFixed(2)}`);
  console.log(`   Talent diff (z): ${osuTalentDiffZ}`);
  console.log(`   Matchup class: P5_G5`);
  console.log(`   HFA: ${osuHFA.toFixed(1)}`);
  console.log(`   Predicted spread: ${osuPredicted.toFixed(1)}`);
  console.log(`   Market spread: -29.5`);
  console.log(`   Error: ${Math.abs(osuPredicted - (-29.5)).toFixed(1)} points\n`);
  
  console.log(`${'='.repeat(70)}\n`);
  
  // Export CSV for external analysis
  console.log(`📄 CSV Export (first 5 games):`);
  console.log(`gameId,homeTeam,awayTeam,ratingDiff,talentDiffZ,matchupClass,hfaTeamHome,marketSpread`);
  for (let i = 0; i < Math.min(5, points.length); i++) {
    const p = points[i];
    const cls = p.isP5_G5 ? 'P5_G5' : p.isP5_FCS ? 'P5_FCS' : p.isG5_G5 ? 'G5_G5' : p.isG5_FCS ? 'G5_FCS' : 'P5_P5';
    console.log(`${p.gameId},${p.homeTeam},${p.awayTeam},${p.ratingDiff.toFixed(2)},${(p.talentDiffZ || 0).toFixed(2)},${cls},${p.hfaTeamHome.toFixed(1)},${p.marketSpread.toFixed(1)}`);
  }
  console.log(`   ... (${points.length - 5} more games)\n`);
  
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
const weekStr = process.argv[3] || '1-12';
const lambdaArg = process.argv[4] ? parseFloat(process.argv[4]) : undefined;
const weeks = parseWeeks(weekStr);

calibrateRidge(season, weeks, lambdaArg).catch(console.error);

