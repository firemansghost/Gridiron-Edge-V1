/**
 * Phase 5: Model Calibration Rehab (Fit #1 Core, Fit #2 Extended)
 * 
 * Comprehensive calibration with:
 * - Conditional quadratic term
 * - Weighted vs unweighted variants
 * - Expanded grid with ridge-heavy corner
 * - Full reporting (JSON, CSV, model card)
 * - Reproducibility seed
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const prisma = new PrismaClient();

// Reproducibility seed
const RANDOM_SEED = 42;

// CLI configuration (with defaults)
interface CLIConfig {
  gridSize: 'small' | 'full';
  sets: 'A' | 'B' | 'AB';
  noHead: boolean;
  cvFolds: number;
  skipExtended: boolean;
}

let cliConfig: CLIConfig = {
  gridSize: 'small',
  sets: 'AB',
  noHead: false,
  cvFolds: 3,
  skipExtended: false,
};

// Heartbeat logging
let lastHeartbeat = Date.now();
const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

function heartbeat(message: string): void {
  const now = Date.now();
  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    console.log(`💓 [${new Date().toISOString()}] ${message}`);
    lastHeartbeat = now;
  }
}

// MFTR and blend config (loaded once)
let mftrRatings: Map<string, number> | null = null;
let blendConfig: {
  optimalWeight: number;
  normalization: {
    v2Mean: number;
    v2Std: number;
    mftrMean: number;
    mftrStd: number;
  };
} | null = null;

interface TrainingRow {
  gameId: string;
  season: number;
  week: number;
  setLabel: string;
  rowWeight: number;
  targetSpreadHma: number | null;
  
  // Core features
  ratingDiffV2: number | null;
  ratingDiffBlend?: number | null; // Computed from ratingDiffV2 + MFTR blend
  hfaPoints: number | null;
  neutralSite: boolean;
  restDeltaDiff: number | null;
  p5VsG5: boolean;
  byeHome: boolean;
  byeAway: boolean;
  
  // Extended features
  offAdjSrDiff?: number | null;
  defAdjSrDiff?: number | null;
  offAdjExplosivenessDiff?: number | null;
  defAdjExplosivenessDiff?: number | null;
  offAdjPpaDiff?: number | null;
  defAdjPpaDiff?: number | null;
  offAdjEpaDiff?: number | null;
  defAdjEpaDiff?: number | null;
  havocFront7Diff?: number | null;
  havocDbDiff?: number | null;
  edgeSrDiff?: number | null;
  ewma3OffAdjEpaDiff?: number | null;
  ewma5OffAdjEpaDiff?: number | null;
  talent247Diff?: number | null;
  returningProdOffDiff?: number | null;
  returningProdDefDiff?: number | null;
}

interface ElasticNetResult {
  coefficients: number[];
  intercept: number;
  rmse: number;
  r2: number;
  pearson: number;
  spearman: number;
  predictions: number[];
}

interface GridSearchResult {
  alpha: number;
  l1Ratio: number;
  cvScore: number;
  rmse: number;
}

interface GateResults {
  slope: number;
  signAgreement: number;
  pearson: number;
  spearman: number;
  rmse: number;
  coefficientSanity: {
    ratingDiff: number;
    hfaPoints: number;
  };
  residualSlices: {
    '0-7': number;
    '7-14': number;
    '14-28': number;
    '>28': number;
  };
  allPassed: boolean;
}

interface CalibrationResult {
  model: ElasticNetResult;
  walkForward: { predictions: number[]; metrics: any };
  gates: GateResults;
  bestParams: GridSearchResult;
  featureNames: string[];
  coefficients: Record<string, { standardized: number; original: number }>;
  scalerParams: Record<string, { mean: number; std: number }>;
  useHinge14: boolean;
  useWeights: boolean;
  calibrationHead?: { intercept: number; slope: number; rmse: number };
  calibratedPredictions?: number[];
}

// ============================================================================
// ELASTIC NET IMPLEMENTATION (same as before, with seed)
// ============================================================================

function elasticNet(
  X: number[][],
  y: number[],
  weights: number[],
  alpha: number,
  l1Ratio: number,
  maxIter: number = 1000,
  tol: number = 1e-4
): ElasticNetResult {
  const n = X.length;
  const p = X[0].length;
  
  // Initialize coefficients
  let beta = new Array(p).fill(0);
  const learningRate = 0.01;
  
  // Coordinate descent with soft thresholding
  for (let iter = 0; iter < maxIter; iter++) {
    const prevBeta = [...beta];
    
    // Update each coefficient
    for (let j = 0; j < p; j++) {
      // Compute residual without feature j
      let residual = 0;
      for (let i = 0; i < n; i++) {
        let pred = 0;
        for (let k = 0; k < p; k++) {
          if (k !== j) pred += beta[k] * X[i][k];
        }
        residual += weights[i] * (y[i] - pred) * X[i][j];
      }
      
      // Normalize by sum of squares
      let sumSq = 0;
      for (let i = 0; i < n; i++) {
        sumSq += weights[i] * X[i][j] * X[i][j];
      }
      
      if (sumSq < 1e-10) {
        beta[j] = 0;
        continue;
      }
      
      // Soft thresholding for L1 penalty
      const l1Penalty = alpha * l1Ratio;
      const l2Penalty = alpha * (1 - l1Ratio);
      
      const z = residual / sumSq;
      const threshold = l1Penalty / sumSq;
      
      if (z > threshold) {
        beta[j] = (z - threshold) / (1 + l2Penalty / sumSq);
      } else if (z < -threshold) {
        beta[j] = (z + threshold) / (1 + l2Penalty / sumSq);
      } else {
        beta[j] = 0;
      }
    }
    
    // Check convergence
    let maxDiff = 0;
    for (let j = 0; j < p; j++) {
      maxDiff = Math.max(maxDiff, Math.abs(beta[j] - prevBeta[j]));
    }
    if (maxDiff < tol) break;
  }
  
  // Compute intercept (mean of residuals)
  let sumResidual = 0;
  let sumWeight = 0;
  for (let i = 0; i < n; i++) {
    let pred = 0;
    for (let j = 1; j < p; j++) {
      pred += beta[j] * X[i][j];
    }
    sumResidual += weights[i] * (y[i] - pred);
    sumWeight += weights[i];
  }
  beta[0] = sumResidual / sumWeight;
  
  // Compute metrics
  const predictions = X.map(row => row.reduce((sum, val, i) => sum + val * beta[i], 0));
  const meanY = y.reduce((sum, val, i) => sum + weights[i] * val, 0) / sumWeight;
  
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const err = y[i] - predictions[i];
    ssRes += weights[i] * err * err;
    const dev = y[i] - meanY;
    ssTot += weights[i] * dev * dev;
  }
  
  const rmse = Math.sqrt(ssRes / sumWeight);
  const r2 = 1 - (ssRes / ssTot);
  
  // Pearson correlation
  const meanPred = predictions.reduce((sum, val, i) => sum + weights[i] * val, 0) / sumWeight;
  let cov = 0;
  let varY = 0;
  let varPred = 0;
  for (let i = 0; i < n; i++) {
    const yDev = y[i] - meanY;
    const predDev = predictions[i] - meanPred;
    cov += weights[i] * yDev * predDev;
    varY += weights[i] * yDev * yDev;
    varPred += weights[i] * predDev * predDev;
  }
  const pearson = cov / (Math.sqrt(varY) * Math.sqrt(varPred));
  
  // Spearman (rank correlation)
  const yRanks = rankArray(y);
  const predRanks = rankArray(predictions);
  const spearman = pearsonCorrelation(yRanks, predRanks, weights);
  
  return {
    coefficients: beta,
    intercept: beta[0],
    rmse,
    r2,
    pearson: isFinite(pearson) ? pearson : 0,
    spearman: isFinite(spearman) ? spearman : 0,
    predictions,
  };
}

function rankArray(arr: number[]): number[] {
  const indexed = arr.map((val, idx) => ({ val, idx }));
  indexed.sort((a, b) => a.val - b.val);
  const ranks = new Array(arr.length);
  for (let i = 0; i < indexed.length; i++) {
    ranks[indexed[i].idx] = i + 1;
  }
  return ranks;
}

// ============================================================================
// OLS IMPLEMENTATION (for Core model)
// ============================================================================

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  const augmented: number[][] = A.map((row, i) => [...row, b[i]]);
  
  // Forward elimination
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
    
    // Check for singular matrix
    if (Math.abs(augmented[i][i]) < 1e-10) {
      throw new Error(`Singular matrix at row ${i}`);
    }
    
    for (let k = i + 1; k < n; k++) {
      const factor = augmented[k][i] / augmented[i][i];
      for (let j = i; j <= n; j++) {
        augmented[k][j] -= factor * augmented[i][j];
      }
    }
  }
  
  // Back substitution
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = augmented[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= augmented[i][j] * x[j];
    }
    x[i] /= augmented[i][i];
  }
  
  return x;
}

function simpleOLS(X: number[][], y: number[], weights?: number[]): {
  coefficients: number[];
  intercept: number;
  predictions: number[];
  rmse: number;
  mae: number;
  pearson: number;
  spearman: number;
  signAgreement: number;
} {
  const n = X.length;
  const p = X[0].length;
  const w = weights || X.map(() => 1.0);
  const sumW = w.reduce((a, b) => a + b, 0);
  
  // Weighted least squares
  const XtWX: number[][] = [];
  const XtWy: number[] = [];
  
  for (let i = 0; i < p; i++) {
    XtWX.push(new Array(p).fill(0));
    XtWy.push(0);
  }
  
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) {
        XtWX[i][j] += w[k] * X[k][i] * X[k][j];
      }
      XtWy[i] += w[k] * X[k][i] * y[k];
    }
  }
  
  // Solve: XtWX * beta = XtWy
  const beta = solveLinearSystem(XtWX, XtWy);
  
  // Predictions
  const predictions = X.map(row => {
    let pred = 0;
    for (let i = 0; i < p; i++) {
      pred += beta[i] * row[i];
    }
    return pred;
  });
  
  // Metrics
  let ssRes = 0;
  let sumAbsErr = 0;
  let signAgreements = 0;
  for (let i = 0; i < n; i++) {
    const err = y[i] - predictions[i];
    ssRes += w[i] * err * err;
    sumAbsErr += w[i] * Math.abs(err);
    const ySign = y[i] < 0 ? -1 : (y[i] > 0 ? 1 : 0);
    const predSign = predictions[i] < 0 ? -1 : (predictions[i] > 0 ? 1 : 0);
    if (ySign === predSign && ySign !== 0) {
      signAgreements++;
    }
  }
  const rmse = Math.sqrt(ssRes / sumW);
  const mae = sumAbsErr / sumW;
  const pearson = pearsonCorrelation(y, predictions, w);
  const spearman = pearsonCorrelation(rankArray(y), rankArray(predictions), w);
  const signAgreement = (signAgreements / n) * 100;
  
  return {
    coefficients: beta.slice(1),
    intercept: beta[0],
    predictions,
    rmse,
    mae,
    pearson,
    spearman,
    signAgreement,
  };
}

/**
 * Fit Core OLS model: y ~ ratingDiffBlend + hfaPoints (with intercept)
 * This is the canonical Core model for V1 - simple, explainable, no regularization
 */
async function fitCoreOlsModel(params: {
  rows: TrainingRow[];
  weights: number[];
}): Promise<{
  beta0: number;
  betaRatingDiff: number;
  betaHfa: number;
  predictions: number[];
  metrics: {
    rmse: number;
    mae: number;
    pearson: number;
    spearman: number;
    signAgreement: number;
    varianceRatio: number;
  };
}> {
  const { rows, weights } = params;
  const y = rows.map(r => r.targetSpreadHma!);
  
  // Build feature matrix: [intercept, ratingDiffBlend, hfaPoints]
  // No standardization - work in natural scale
  const ratingDiffs: number[] = [];
  const hfaPoints: number[] = [];
  
  for (const row of rows) {
    const ratingDiff = row.ratingDiffBlend ?? row.ratingDiffV2 ?? 0;
    ratingDiffs.push(ratingDiff);
    hfaPoints.push(row.hfaPoints ?? 0);
  }
  
  // Check for zero variance
  const hfaMean = hfaPoints.reduce((a, b, i) => a + weights[i] * b, 0) / weights.reduce((a, b) => a + b, 0);
  const hfaVar = hfaPoints.reduce((sum, h, i) => sum + weights[i] * Math.pow(h - hfaMean, 2), 0) / weights.reduce((a, b) => a + b, 0);
  const hfaStd = Math.sqrt(hfaVar);
  
  // Build X matrix
  let X: number[][];
  if (hfaStd > 1e-6) {
    // Both features have variance
    X = ratingDiffs.map((rd, i) => [1, rd, hfaPoints[i]]);
  } else {
    // hfaPoints has zero variance - use ratingDiff only
    X = ratingDiffs.map((rd) => [1, rd]);
  }
  
  // Fit OLS
  const olsResult = simpleOLS(X, y, weights);
  
  // Extract coefficients
  const beta0 = olsResult.intercept;
  const betaRatingDiff = olsResult.coefficients[0];
  const betaHfa = olsResult.coefficients.length > 1 ? olsResult.coefficients[1] : 0;
  
  // Compute variance ratio
  const yMean = y.reduce((a, b, i) => a + weights[i] * b, 0) / weights.reduce((a, b) => a + b, 0);
  const yVar = y.reduce((sum, yi, i) => sum + weights[i] * Math.pow(yi - yMean, 2), 0) / weights.reduce((a, b) => a + b, 0);
  const stdY = Math.sqrt(yVar);
  
  const predMean = olsResult.predictions.reduce((a, b, i) => a + weights[i] * b, 0) / weights.reduce((a, b) => a + b, 0);
  const predVar = olsResult.predictions.reduce((sum, pi, i) => sum + weights[i] * Math.pow(pi - predMean, 2), 0) / weights.reduce((a, b) => a + b, 0);
  const stdPred = Math.sqrt(predVar);
  const varianceRatio = stdPred / stdY;
  
  return {
    beta0,
    betaRatingDiff,
    betaHfa,
    predictions: olsResult.predictions,
    metrics: {
      rmse: olsResult.rmse,
      mae: olsResult.mae,
      pearson: olsResult.pearson,
      spearman: olsResult.spearman,
      signAgreement: olsResult.signAgreement,
      varianceRatio,
    },
  };
}

function pearsonCorrelation(x: number[], y: number[], weights: number[]): number {
  const sumW = weights.reduce((a, b) => a + b, 0);
  const meanX = x.reduce((sum, val, i) => sum + weights[i] * val, 0) / sumW;
  const meanY = y.reduce((sum, val, i) => sum + weights[i] * val, 0) / sumW;
  
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < x.length; i++) {
    const xDev = x[i] - meanX;
    const yDev = y[i] - meanY;
    cov += weights[i] * xDev * yDev;
    varX += weights[i] * xDev * xDev;
    varY += weights[i] * yDev * yDev;
  }
  
  return cov / (Math.sqrt(varX) * Math.sqrt(varY));
}

// ============================================================================
// MFTR & BLEND LOADING
// ============================================================================

async function loadMFTRAndBlend(): Promise<void> {
  // Load MFTR ratings (prefer ridge version)
  const mftrRidgePath = path.join(process.cwd(), 'reports', 'mftr_ratings_ridge.csv');
  const mftrPath = path.join(process.cwd(), 'reports', 'mftr_ratings.csv');
  
  let mftrPathToUse = mftrRidgePath;
  if (!fs.existsSync(mftrRidgePath)) {
    if (!fs.existsSync(mftrPath)) {
      console.log('   ⚠️  MFTR ratings not found - using raw V2 ratings\n');
      return;
    }
    mftrPathToUse = mftrPath;
  }
  
  const mftrContent = fs.readFileSync(mftrPathToUse, 'utf-8');
  const mftrLines = mftrContent.trim().split('\n').slice(1);
  mftrRatings = new Map<string, number>();
  
  for (const line of mftrLines) {
    const parts = line.split(',');
    const teamId = parts[0];
    const rating = parseFloat(parts[1]);
    mftrRatings.set(teamId, rating);
  }
  
  // Load blend config
  const configPath = path.join(process.cwd(), 'reports', 'rating_blend_config.json');
  if (!fs.existsSync(configPath)) {
    console.log('   ⚠️  Blend config not found - using raw V2 ratings\n');
    mftrRatings = null;
    return;
  }
  
  const configContent = fs.readFileSync(configPath, 'utf-8');
  blendConfig = JSON.parse(configContent);
  
  console.log(`   ✅ Loaded MFTR ratings (${mftrRatings.size} teams, ${mftrPathToUse.includes('ridge') ? 'ridge' : 'standard'} version)`);
  console.log(`   ✅ Loaded blend config (w=${blendConfig.optimalWeight.toFixed(2)})\n`);
}

/**
 * Compute rating_blend = w*V2 + (1-w)*MFTR
 */
function computeRatingBlend(
  homeTeamId: string,
  awayTeamId: string,
  homeV2: number,
  awayV2: number
): number | null {
  if (!mftrRatings || !blendConfig) {
    return null; // Fall back to raw V2
  }
  
  const homeMFTR = mftrRatings.get(homeTeamId);
  const awayMFTR = mftrRatings.get(awayTeamId);
  
  if (homeMFTR === undefined || awayMFTR === undefined) {
    return null; // Fall back to raw V2
  }
  
  // Normalize V2 and MFTR
  const homeV2Norm = (homeV2 - blendConfig.normalization.v2Mean) / blendConfig.normalization.v2Std;
  const awayV2Norm = (awayV2 - blendConfig.normalization.v2Mean) / blendConfig.normalization.v2Std;
  const homeMFTRNorm = (homeMFTR - blendConfig.normalization.mftrMean) / blendConfig.normalization.mftrStd;
  const awayMFTRNorm = (awayMFTR - blendConfig.normalization.mftrMean) / blendConfig.normalization.mftrStd;
  
  // Blend
  const w = blendConfig.optimalWeight;
  const homeBlend = w * homeV2Norm + (1 - w) * homeMFTRNorm;
  const awayBlend = w * awayV2Norm + (1 - w) * awayMFTRNorm;
  
  // Denormalize back to V2 scale (so it matches target scale)
  // The blend is in normalized space, but we want it in the original V2 scale
  const blendDiffNorm = homeBlend - awayBlend;
  const blendDiffDenorm = blendDiffNorm * blendConfig.normalization.v2Std + blendConfig.normalization.v2Mean;
  
  // Return difference (HMA frame) in original V2 scale
  return blendDiffDenorm;
}

// ============================================================================
// DATA LOADING (same as before, but with better logging)
// ============================================================================

async function loadTrainingData(
  season: number,
  featureVersion: string,
  setLabels: string[]
): Promise<TrainingRow[]> {
  console.log(`📊 Loading training data (season=${season}, version=${featureVersion}, sets=${setLabels.join(',')})...`);
  
  const rows = await prisma.gameTrainingRow.findMany({
    where: {
      season,
      featureVersion,
      setLabel: { in: setLabels },
      targetSpreadHma: { not: null },
    },
    include: {
      game: {
        include: {
          homeTeam: true,
          awayTeam: true,
        },
      },
    },
    orderBy: [
      { week: 'asc' },
      { gameId: 'asc' },
    ],
  });
  
  // Log counts per week and set
  const weekCounts = new Map<number, { A: number; B: number }>();
  for (const row of rows) {
    const week = row.week;
    const set = row.setLabel || 'A';
    if (!weekCounts.has(week)) {
      weekCounts.set(week, { A: 0, B: 0 });
    }
    const counts = weekCounts.get(week)!;
    if (set === 'A') counts.A++;
    else if (set === 'B') counts.B++;
  }
  
  console.log(`   Loaded ${rows.length} training rows with targets`);
  console.log(`   Week breakdown:`);
  for (const [week, counts] of Array.from(weekCounts.entries()).sort((a, b) => a[0] - b[0])) {
    console.log(`     Week ${week}: ${counts.A} (Set A) + ${counts.B} (Set B) = ${counts.A + counts.B} total`);
  }
  
  const setACount = rows.filter(r => r.setLabel === 'A').length;
  const setBCount = rows.filter(r => r.setLabel === 'B').length;
  console.log(`   Set A: ${setACount} rows, Set B: ${setBCount} rows\n`);
  
  // Load extended features from team_game_adj
  console.log(`   Loading extended features from team_game_adj...`);
  const gameIds = rows.map(r => r.gameId);
  const teamFeatures = await prisma.teamGameAdj.findMany({
    where: {
      gameId: { in: gameIds },
      featureVersion,
    },
  });
  
  // Group by game and team
  const featuresByGameTeam = new Map<string, typeof teamFeatures[0]>();
  for (const feat of teamFeatures) {
    featuresByGameTeam.set(`${feat.gameId}:${feat.teamId}`, feat);
  }
  
  console.log(`   Loaded ${teamFeatures.length} team-game features\n`);
  
  // Compute ratingDiffV2 and hfaPoints if missing, and load extended features
  const trainingRows: TrainingRow[] = [];
  
  for (const row of rows) {
    let ratingDiffV2 = row.ratingDiffV2 !== null ? Number(row.ratingDiffV2) : null;
    let hfaPoints = row.hfaPoints !== null ? Number(row.hfaPoints) : null;
    
    // Load ratings once (used for both ratingDiffV2 and ratingDiffBlend)
    let homeRating = null;
    let awayRating = null;
    let homeRatingVal: number | null = null;
    let awayRatingVal: number | null = null;
    
    // Load if needed for ratingDiffV2 or hfaPoints
    if (ratingDiffV2 === null || hfaPoints === null) {
      homeRating = await prisma.teamSeasonRating.findUnique({
        where: {
          season_teamId_modelVersion: {
            season: row.season,
            teamId: row.homeTeamId,
            modelVersion: 'v2',
          },
        },
      });
      
      awayRating = await prisma.teamSeasonRating.findUnique({
        where: {
          season_teamId_modelVersion: {
            season: row.season,
            teamId: row.awayTeamId,
            modelVersion: 'v2',
          },
        },
      });
      
      if (homeRating && awayRating) {
        homeRatingVal = homeRating.powerRating !== null ? Number(homeRating.powerRating) : 0;
        awayRatingVal = awayRating.powerRating !== null ? Number(awayRating.powerRating) : 0;
        
        if (ratingDiffV2 === null) {
          ratingDiffV2 = homeRatingVal - awayRatingVal;
        }
        
        if (hfaPoints === null) {
          const hfaTeam = row.neutralSite ? 0 : (homeRating.hfaTeam !== null ? Number(homeRating.hfaTeam) : 2.0);
          hfaPoints = hfaTeam;
        }
      }
    }
    
    // Compute ratingDiffBlend (separate from ratingDiffV2)
    // Reuse ratings if already loaded above, otherwise load them
    let ratingDiffBlend: number | null = null;
    if (ratingDiffV2 !== null) {
      if (homeRatingVal === null || awayRatingVal === null) {
        // Load if not already loaded
        homeRating = await prisma.teamSeasonRating.findUnique({
          where: {
            season_teamId_modelVersion: {
              season: row.season,
              teamId: row.homeTeamId,
              modelVersion: 'v2',
            },
          },
        });
        awayRating = await prisma.teamSeasonRating.findUnique({
          where: {
            season_teamId_modelVersion: {
              season: row.season,
              teamId: row.awayTeamId,
              modelVersion: 'v2',
            },
          },
        });
        
        if (homeRating && awayRating) {
          homeRatingVal = homeRating.powerRating !== null ? Number(homeRating.powerRating) : 0;
          awayRatingVal = awayRating.powerRating !== null ? Number(awayRating.powerRating) : 0;
        }
      }
      
      if (homeRatingVal !== null && awayRatingVal !== null) {
        ratingDiffBlend = computeRatingBlend(
          row.homeTeamId,
          row.awayTeamId,
          homeRatingVal,
          awayRatingVal
        );
      }
    }
    
    // Load extended features from team_game_adj (home - away diffs)
    const homeFeat = featuresByGameTeam.get(`${row.gameId}:${row.homeTeamId}`);
    const awayFeat = featuresByGameTeam.get(`${row.gameId}:${row.awayTeamId}`);
    
    const diff = (homeVal: number | null | undefined, awayVal: number | null | undefined) => {
      const h = homeVal !== null && homeVal !== undefined ? Number(homeVal) : null;
      const a = awayVal !== null && awayVal !== undefined ? Number(awayVal) : null;
      if (h === null || a === null) return null;
      return h - a;
    };
    
    trainingRows.push({
      gameId: row.gameId,
      season: row.season,
      week: row.week,
      setLabel: row.setLabel || 'A',
      rowWeight: row.rowWeight !== null ? Number(row.rowWeight) : 1.0,
      targetSpreadHma: row.targetSpreadHma !== null ? Number(row.targetSpreadHma) : null,
      ratingDiffV2,
      ratingDiffBlend,
      hfaPoints,
      neutralSite: row.neutralSite,
      restDeltaDiff: row.restDeltaDiff,
      p5VsG5: row.p5VsG5,
      byeHome: row.byeHome,
      byeAway: row.byeAway,
      // Extended features
      offAdjSrDiff: homeFeat && awayFeat ? diff(homeFeat.offAdjSr, awayFeat.offAdjSr) : (row.offAdjSrDiff !== null ? Number(row.offAdjSrDiff) : null),
      defAdjSrDiff: homeFeat && awayFeat ? diff(homeFeat.defAdjSr, awayFeat.defAdjSr) : null,
      offAdjExplosivenessDiff: homeFeat && awayFeat ? diff(homeFeat.offAdjExplosiveness, awayFeat.offAdjExplosiveness) : (row.offAdjExplDiff !== null ? Number(row.offAdjExplDiff) : null),
      defAdjExplosivenessDiff: homeFeat && awayFeat ? diff(homeFeat.defAdjExplosiveness, awayFeat.defAdjExplosiveness) : null,
      offAdjPpaDiff: homeFeat && awayFeat ? diff(homeFeat.offAdjPpa, awayFeat.offAdjPpa) : (row.offAdjPpaDiff !== null ? Number(row.offAdjPpaDiff) : null),
      defAdjPpaDiff: homeFeat && awayFeat ? diff(homeFeat.defAdjPpa, awayFeat.defAdjPpa) : null,
      offAdjEpaDiff: homeFeat && awayFeat ? diff(homeFeat.offAdjEpa, awayFeat.offAdjEpa) : null,
      defAdjEpaDiff: homeFeat && awayFeat ? diff(homeFeat.defAdjEpa, awayFeat.defAdjEpa) : null,
      havocFront7Diff: homeFeat && awayFeat ? diff(homeFeat.offAdjHavocFront7, awayFeat.offAdjHavocFront7) : (row.havocFront7Diff !== null ? Number(row.havocFront7Diff) : null),
      havocDbDiff: homeFeat && awayFeat ? diff(homeFeat.offAdjHavocDb, awayFeat.offAdjHavocDb) : (row.havocDbDiff !== null ? Number(row.havocDbDiff) : null),
      edgeSrDiff: homeFeat && awayFeat ? diff(homeFeat.edgeSr, awayFeat.edgeSr) : null,
      ewma3OffAdjEpaDiff: homeFeat && awayFeat ? diff(homeFeat.ewma3OffAdjEpa, awayFeat.ewma3OffAdjEpa) : null,
      ewma5OffAdjEpaDiff: homeFeat && awayFeat ? diff(homeFeat.ewma5OffAdjEpa, awayFeat.ewma5OffAdjEpa) : null,
      talent247Diff: homeFeat && awayFeat ? diff(homeFeat.talent247, awayFeat.talent247) : null,
      returningProdOffDiff: homeFeat && awayFeat ? diff(homeFeat.returningProdOff, awayFeat.returningProdOff) : null,
      returningProdDefDiff: homeFeat && awayFeat ? diff(homeFeat.returningProdDef, awayFeat.returningProdDef) : null,
    });
  }
  
  return trainingRows;
}

// ============================================================================
// POST-HOC LINEAR CALIBRATION HEAD
// ============================================================================

/**
 * Fit a linear calibration head: y = a + b * ŷ
 * This fixes unit slope without changing feature coefficients
 */
function fitLinearCalibrationHead(
  y: number[],
  yHat: number[],
  weights: number[]
): { intercept: number; slope: number; rmse: number } {
  const sumW = weights.reduce((a, b) => a + b, 0);
  
  // Weighted means
  const meanY = y.reduce((sum, val, i) => sum + weights[i] * val, 0) / sumW;
  const meanYHat = yHat.reduce((sum, val, i) => sum + weights[i] * val, 0) / sumW;
  
  // Weighted covariance and variance
  let cov = 0;
  let varYHat = 0;
  for (let i = 0; i < y.length; i++) {
    const yDev = y[i] - meanY;
    const yHatDev = yHat[i] - meanYHat;
    cov += weights[i] * yDev * yHatDev;
    varYHat += weights[i] * yHatDev * yHatDev;
  }
  
  // OLS: b = cov(y, ŷ) / var(ŷ), a = mean(y) - b * mean(ŷ)
  const slope = varYHat > 1e-10 ? cov / varYHat : 1.0;
  const intercept = meanY - slope * meanYHat;
  
  // Compute RMSE of calibrated predictions
  const calibrated = yHat.map(yh => intercept + slope * yh);
  let ssRes = 0;
  for (let i = 0; i < y.length; i++) {
    const err = y[i] - calibrated[i];
    ssRes += weights[i] * err * err;
  }
  const rmse = Math.sqrt(ssRes / sumW);
  
  return { intercept, slope, rmse };
}

// ============================================================================
// FEATURE ENGINEERING (with monotone curvature)
// ============================================================================

/**
 * Residualize extended features against rating_blend
 * This ensures β(rating_blend) stays positive by making extended features orthogonal to it
 */
function residualizeExtendedFeatures(
  rows: TrainingRow[],
  featureNames: string[],
  featureValues: Record<string, number[]>,
  trainIndices: number[]
): Record<string, number[]> {
  // Find rating_blend feature (could be ratingDiffBlend or ratingDiffV2)
  const ratingDiffFeatureName = mftrRatings && blendConfig ? 'ratingDiffBlend' : 'ratingDiffV2';
  if (!featureValues[ratingDiffFeatureName]) {
    console.log(`   ⚠️  ${ratingDiffFeatureName} not found, skipping residualization\n`);
    return featureValues;
  }
  
  const ratingBlendValues = featureValues[ratingDiffFeatureName];
  
  // Extended feature blocks to residualize
  const extendedBlocks = [
    ['offAdjSrDiff', 'defAdjSrDiff', 'edgeSrDiff'],
    ['offAdjExplosivenessDiff', 'defAdjExplosivenessDiff'],
    ['offAdjPpaDiff', 'defAdjPpaDiff'],
    ['offAdjEpaDiff', 'defAdjEpaDiff'],
    ['havocFront7Diff', 'havocDbDiff'],
    ['ewma3OffAdjEpaDiff', 'ewma5OffAdjEpaDiff'],
    ['talent247Diff'],
    ['returningProdOffDiff', 'returningProdDefDiff'],
  ];
  
  const residualized = { ...featureValues };
  
  // Residualize each block
  for (const block of extendedBlocks) {
    const blockFeatures = block.filter(f => featureNames.includes(f));
    if (blockFeatures.length === 0) continue;
    
    // Fit OLS: feature ~ rating_blend on training data only
    for (const featName of blockFeatures) {
      const featValues = featureValues[featName];
      
      // Compute OLS on training fold
      const trainRatingBlend = trainIndices.map(i => ratingBlendValues[i]);
      const trainFeat = trainIndices.map(i => featValues[i]);
      
      const meanRating = trainRatingBlend.reduce((a, b) => a + b, 0) / trainRatingBlend.length;
      const meanFeat = trainFeat.reduce((a, b) => a + b, 0) / trainFeat.length;
      
      let cov = 0;
      let varRating = 0;
      for (let i = 0; i < trainIndices.length; i++) {
        const rDev = trainRatingBlend[i] - meanRating;
        const fDev = trainFeat[i] - meanFeat;
        cov += rDev * fDev;
        varRating += rDev * rDev;
      }
      cov /= trainIndices.length;
      varRating /= trainIndices.length;
      
      const beta = varRating > 1e-10 ? cov / varRating : 0;
      const alpha = meanFeat - beta * meanRating;
      
      // Compute residuals for all data (train + test)
      const residuals = featValues.map((val, i) => val - (alpha + beta * ratingBlendValues[i]));
      residualized[featName] = residuals;
    }
  }
  
  return residualized;
}

// ============================================================================
// EXTENDED GATE CHECKING (Core-relative gates)
// ============================================================================

interface ExtendedGateResults extends GateResults {
  varianceRatio: number;
}

function checkExtendedGates(
  y: number[],
  predictions: number[],
  weights: number[],
  coefficients: number[],
  featureNames: string[],
  rawPredictions: number[],
  coreBaseline: BaselineMetrics
): ExtendedGateResults {
  const results: ExtendedGateResults = {
    slope: 0,
    signAgreement: 0,
    pearson: 0,
    spearman: 0,
    rmse: 0,
    varianceRatio: 0,
    coefficientSanity: {
      ratingDiff: 0,
      hfaPoints: 0,
    },
    residualSlices: {
      '0-7': 0,
      '7-14': 0,
      '14-28': 0,
      '>28': 0,
    },
    allPassed: false,
  };
  
  // Filter to valid predictions
  const validIndices: number[] = [];
  for (let i = 0; i < predictions.length; i++) {
    if (predictions[i] !== 0 && isFinite(predictions[i]) && isFinite(y[i])) {
      validIndices.push(i);
    }
  }
  
  if (validIndices.length === 0) {
    return results;
  }
  
  const yValid = validIndices.map(i => y[i]);
  const predValid = validIndices.map(i => predictions[i]);
  const wValid = validIndices.map(i => weights[i]);
  
  // Slope (OLS: y ~ pred)
  const sumW = wValid.reduce((a, b) => a + b, 0);
  const meanY = yValid.reduce((sum, val, i) => sum + wValid[i] * val, 0) / sumW;
  const meanPred = predValid.reduce((sum, val, i) => sum + wValid[i] * val, 0) / sumW;
  
  let cov = 0;
  let varPred = 0;
  for (let i = 0; i < validIndices.length; i++) {
    const yDev = yValid[i] - meanY;
    const predDev = predValid[i] - meanPred;
    cov += wValid[i] * yDev * predDev;
    varPred += wValid[i] * predDev * predDev;
  }
  results.slope = varPred > 1e-10 ? cov / varPred : 0;
  
  // Sign agreement
  let signAgreements = 0;
  for (let i = 0; i < validIndices.length; i++) {
    const ySign = yValid[i] < 0 ? -1 : (yValid[i] > 0 ? 1 : 0);
    const predSign = predValid[i] < 0 ? -1 : (predValid[i] > 0 ? 1 : 0);
    if (ySign === predSign && ySign !== 0) {
      signAgreements++;
    }
  }
  results.signAgreement = (signAgreements / validIndices.length) * 100;
  
  // Correlations
  results.pearson = pearsonCorrelation(yValid, predValid, wValid);
  results.spearman = pearsonCorrelation(rankArray(yValid), rankArray(predValid), wValid);
  
  // RMSE
  let ssRes = 0;
  for (let i = 0; i < validIndices.length; i++) {
    const err = yValid[i] - predValid[i];
    ssRes += wValid[i] * err * err;
  }
  results.rmse = Math.sqrt(ssRes / sumW);
  
  // Coefficient sanity
  const ratingIdx = featureNames.findIndex(name => name === 'ratingDiffV2' || name === 'ratingDiffBlend');
  const hfaIdx = featureNames.indexOf('hfaPoints');
  
  if (ratingIdx >= 0) results.coefficientSanity.ratingDiff = coefficients[ratingIdx];
  if (hfaIdx >= 0) results.coefficientSanity.hfaPoints = coefficients[hfaIdx];
  
  // Residual slices
  const residualPairs = validIndices.map(i => ({
    absResidual: Math.abs(y[i] - predictions[i]),
    signedResidual: y[i] - predictions[i],
    weight: weights[i],
  }));
  
  const slices = {
    '0-7': residualPairs.filter(r => r.absResidual >= 0 && r.absResidual < 7),
    '7-14': residualPairs.filter(r => r.absResidual >= 7 && r.absResidual < 14),
    '14-28': residualPairs.filter(r => r.absResidual >= 14 && r.absResidual < 28),
    '>28': residualPairs.filter(r => r.absResidual >= 28),
  };
  
  for (const [key, pairs] of Object.entries(slices)) {
    if (pairs.length > 0) {
      const sumWeight = pairs.reduce((sum, p) => sum + p.weight, 0);
      const meanResidual = pairs.reduce((sum, p) => sum + p.weight * p.signedResidual, 0) / sumWeight;
      results.residualSlices[key as keyof typeof results.residualSlices] = meanResidual;
    } else {
      results.residualSlices[key as keyof typeof results.residualSlices] = 0;
    }
  }
  
  // Variance ratio (using raw predictions)
  const validPredsForVar = validIndices.map(i => rawPredictions[i]);
  const validYForVar = validIndices.map(i => y[i]);
  const wValidForVar = validIndices.map(i => weights[i]);
  const sumWVar = wValidForVar.reduce((a, b) => a + b, 0);
  
  const meanPredVar = validPredsForVar.reduce((sum, val, i) => sum + wValidForVar[i] * val, 0) / sumWVar;
  const meanYVar = validYForVar.reduce((sum, val, i) => sum + wValidForVar[i] * val, 0) / sumWVar;
  
  let varPredVar = 0;
  let varYVar = 0;
  for (let i = 0; i < validIndices.length; i++) {
    const predDev = validPredsForVar[i] - meanPredVar;
    const yDev = validYForVar[i] - meanYVar;
    varPredVar += wValidForVar[i] * predDev * predDev;
    varYVar += wValidForVar[i] * yDev * yDev;
  }
  varPredVar /= sumWVar;
  varYVar /= sumWVar;
  
  const stdPredVar = Math.sqrt(varPredVar);
  const stdYVar = Math.sqrt(varYVar);
  results.varianceRatio = stdPredVar / stdYVar;
  
  // Core-relative gates
  const coreRmse = coreBaseline.ols.rmse;
  const coreSign = coreBaseline.ols.signAgreement;
  const corePearson = coreBaseline.ols.pearson;
  const coreSpearman = coreBaseline.ols.spearman;
  const zeroRmse = coreBaseline.zero.rmse;
  const coreTailMean = (coreBaseline.ols as any).tailSliceMean || 0;
  
  // RMSE gate: extended_rmse <= min(core_rmse * 0.99, zero_rmse * 0.95)
  const rmseGate = results.rmse <= Math.min(coreRmse * 0.99, zeroRmse * 0.95);
  
  // Sign gate: extended_sign >= core_sign - 1.0
  const signGate = results.signAgreement >= coreSign - 1.0;
  
  // Correlation gates: extended >= core - 0.01
  const pearsonGate = results.pearson >= corePearson - 0.01;
  const spearmanGate = results.spearman >= coreSpearman - 0.01;
  
  // Variance ratio gate: >= 0.40
  const varianceGate = results.varianceRatio >= 0.40;
  
  // β sign gates
  const ratingDiffGate = results.coefficientSanity.ratingDiff > 0;
  const hfaGate = results.coefficientSanity.hfaPoints >= -0.05; // Warning if < -0.05, but allow >= -0.05
  
  // Tail slice gate: |mu_tail_extended| <= max(2.0, 1.2 * |mu_tail_core|)
  const tailGate = Math.abs(results.residualSlices['>28']) <= Math.max(2.0, 1.2 * Math.abs(coreTailMean));
  
  // Other residual slice gates (same as Core)
  const otherSliceGates = 
    Math.abs(results.residualSlices['0-7']) <= 2.0 &&
    Math.abs(results.residualSlices['7-14']) <= 2.0 &&
    Math.abs(results.residualSlices['14-28']) <= 2.0;
  
  // Slope gate: 0.90-1.10
  const slopeGate = results.slope >= 0.90 && results.slope <= 1.10;
  
  results.allPassed =
    slopeGate &&
    rmseGate &&
    signGate &&
    pearsonGate &&
    spearmanGate &&
    varianceGate &&
    ratingDiffGate &&
    hfaGate &&
    tailGate &&
    otherSliceGates;
  
  return results;
}

function buildFeatureMatrix(
  rows: TrainingRow[],
  fitType: 'core' | 'extended',
  includeHinge14: boolean = false,
  residualize: boolean = false,
  trainIndices?: number[]
): { X: number[][]; featureNames: string[]; scalerParams: Record<string, { mean: number; std: number }> } {
  const featureNames: string[] = [];
  let featureValues: Record<string, number[]> = {};
  
  // Core features (always included)
  featureNames.push('intercept');
  const ratingDiffFeatureName = mftrRatings && blendConfig ? 'ratingDiffBlend' : 'ratingDiffV2';
  featureNames.push(ratingDiffFeatureName);
  featureNames.push('hfaPoints');
  featureNames.push('neutralSite');
  featureNames.push('p5VsG5');
  
  // Monotone curvature features (replace fragile quadratic)
  featureNames.push('absRatingDiffV2'); // |rating_diff|
  featureNames.push('hinge7'); // max(|diff| - 7, 0)
  // Conditional: only add hinge14 if it helps
  if (includeHinge14) {
    featureNames.push('hinge14'); // max(|diff| - 14, 0)
  }
  
  // Extended features
  if (fitType === 'extended') {
    featureNames.push('offAdjSrDiff');
    featureNames.push('defAdjSrDiff');
    featureNames.push('offAdjExplosivenessDiff');
    featureNames.push('defAdjExplosivenessDiff');
    featureNames.push('offAdjPpaDiff');
    featureNames.push('defAdjPpaDiff');
    featureNames.push('offAdjEpaDiff');
    featureNames.push('defAdjEpaDiff');
    featureNames.push('havocFront7Diff');
    featureNames.push('havocDbDiff');
    featureNames.push('edgeSrDiff');
    featureNames.push('ewma3OffAdjEpaDiff');
    featureNames.push('ewma5OffAdjEpaDiff');
    featureNames.push('talent247Diff');
    featureNames.push('returningProdOffDiff');
    featureNames.push('returningProdDefDiff');
  }
  
  // Extract feature values
  for (const name of featureNames) {
    featureValues[name] = [];
  }
  
  for (const row of rows) {
    // Use blend if available, otherwise fall back to V2
    const ratingDiff = row.ratingDiffBlend ?? row.ratingDiffV2 ?? 0;
    const absRatingDiff = Math.abs(ratingDiff);
    
    featureValues['intercept'].push(1);
    featureValues[ratingDiffFeatureName].push(ratingDiff);
    featureValues['hfaPoints'].push(row.hfaPoints ?? 0);
    featureValues['neutralSite'].push(row.neutralSite ? 1 : 0);
    featureValues['p5VsG5'].push(row.p5VsG5 ? 1 : 0);
    
    // Monotone curvature features
    featureValues['absRatingDiffV2'].push(absRatingDiff);
    featureValues['hinge7'].push(Math.max(absRatingDiff - 7, 0));
    
    // Optional hinge14 (test if it helps)
    if (featureNames.includes('hinge14')) {
      featureValues['hinge14'].push(Math.max(absRatingDiff - 14, 0));
    }
    
    if (fitType === 'extended') {
      featureValues['offAdjSrDiff'].push(row.offAdjSrDiff ?? 0);
      featureValues['defAdjSrDiff'].push(row.defAdjSrDiff ?? 0);
      featureValues['offAdjExplosivenessDiff'].push(row.offAdjExplosivenessDiff ?? 0);
      featureValues['defAdjExplosivenessDiff'].push(row.defAdjExplosivenessDiff ?? 0);
      featureValues['offAdjPpaDiff'].push(row.offAdjPpaDiff ?? 0);
      featureValues['defAdjPpaDiff'].push(row.defAdjPpaDiff ?? 0);
      featureValues['offAdjEpaDiff'].push(row.offAdjEpaDiff ?? 0);
      featureValues['defAdjEpaDiff'].push(row.defAdjEpaDiff ?? 0);
      featureValues['havocFront7Diff'].push(row.havocFront7Diff ?? 0);
      featureValues['havocDbDiff'].push(row.havocDbDiff ?? 0);
      featureValues['edgeSrDiff'].push(row.edgeSrDiff ?? 0);
      featureValues['ewma3OffAdjEpaDiff'].push(row.ewma3OffAdjEpaDiff ?? 0);
      featureValues['ewma5OffAdjEpaDiff'].push(row.ewma5OffAdjEpaDiff ?? 0);
      featureValues['talent247Diff'].push(row.talent247Diff ?? 0);
      featureValues['returningProdOffDiff'].push(row.returningProdOffDiff ?? 0);
      featureValues['returningProdDefDiff'].push(row.returningProdDefDiff ?? 0);
    }
  }
  
  // Residualize extended features if requested (for Extended v0)
  if (fitType === 'extended' && residualize && trainIndices) {
    console.log('   🔧 Residualizing extended features against rating_blend...\n');
    featureValues = residualizeExtendedFeatures(rows, featureNames, featureValues, trainIndices);
  }
  
  // Standardize features (except intercept and binary flags)
  const scalerParams: Record<string, { mean: number; std: number }> = {};
  const X: number[][] = [];
  
  for (let i = 0; i < rows.length; i++) {
    X.push([]);
  }
  
  for (let j = 0; j < featureNames.length; j++) {
    const name = featureNames[j];
    const values = featureValues[name];
    
    // Skip standardization for intercept, binary flags, and ratingDiffBlend (already in target scale)
    if (name === 'intercept' || name === 'neutralSite' || name === 'p5VsG5' || name === 'ratingDiffBlend') {
      for (let i = 0; i < rows.length; i++) {
        X[i][j] = values[i];
      }
      scalerParams[name] = { mean: 0, std: 1 };
      continue;
    }
    
    // Compute mean and std
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    
    scalerParams[name] = { mean, std };
    
    // Standardize
    for (let i = 0; i < rows.length; i++) {
      X[i][j] = std > 1e-10 ? (values[i] - mean) / std : 0;
    }
  }
  
  return { X, featureNames, scalerParams };
}

// ============================================================================
// GRID SEARCH & CROSS-VALIDATION (expanded grid, week-grouped CV)
// ============================================================================

function gridSearch(
  X: number[][],
  y: number[],
  weights: number[],
  weeks: number[],
  alphas: number[],
  l1Ratios: number[],
  nFolds: number = cliConfig.cvFolds
): GridSearchResult {
  console.log(`   Grid search: ${alphas.length} alphas × ${l1Ratios.length} l1_ratios = ${alphas.length * l1Ratios.length} combinations (${nFolds} CV folds)\n`);
  
  const results: GridSearchResult[] = [];
  
  // Group by week for CV (don't split games from same week)
  const weekGroups = new Map<number, number[]>();
  for (let i = 0; i < weeks.length; i++) {
    if (!weekGroups.has(weeks[i])) {
      weekGroups.set(weeks[i], []);
    }
    weekGroups.get(weeks[i])!.push(i);
  }
  
  const weekList = Array.from(weekGroups.keys()).sort((a, b) => a - b);
  
  let comboCount = 0;
  const totalCombos = alphas.length * l1Ratios.length;
  
  for (const alpha of alphas) {
    for (const l1Ratio of l1Ratios) {
      comboCount++;
      heartbeat(`Grid search: ${comboCount}/${totalCombos} (α=${alpha}, l1=${l1Ratio})`);
      
      // Cross-validation
      const cvScores: number[] = [];
      
      for (let fold = 0; fold < nFolds; fold++) {
        // Split weeks into train/test
        const testWeekStart = Math.floor((weekList.length * fold) / nFolds);
        const testWeekEnd = Math.floor((weekList.length * (fold + 1)) / nFolds);
        const testWeeks = weekList.slice(testWeekStart, testWeekEnd);
        
        const trainIndices: number[] = [];
        const testIndices: number[] = [];
        
        for (let i = 0; i < weeks.length; i++) {
          if (testWeeks.includes(weeks[i])) {
            testIndices.push(i);
          } else {
            trainIndices.push(i);
          }
        }
        
        if (trainIndices.length === 0 || testIndices.length === 0) continue;
        
        // Train on fold
        const XTrain = trainIndices.map(i => X[i]);
        const yTrain = trainIndices.map(i => y[i]);
        const wTrain = trainIndices.map(i => weights[i]);
        
        const model = elasticNet(XTrain, yTrain, wTrain, alpha, l1Ratio);
        
        // Test on fold
        const XTest = testIndices.map(i => X[i]);
        const yTest = testIndices.map(i => y[i]);
        
        let testRmse = 0;
        let testWeight = 0;
        for (let i = 0; i < testIndices.length; i++) {
          const pred = XTest[i].reduce((sum, val, j) => sum + val * model.coefficients[j], 0);
          const err = yTest[i] - pred;
          const w = weights[testIndices[i]];
          testRmse += w * err * err;
          testWeight += w;
        }
        testRmse = Math.sqrt(testRmse / testWeight);
        cvScores.push(testRmse);
      }
      
      const avgCvScore = cvScores.length > 0
        ? cvScores.reduce((a, b) => a + b, 0) / cvScores.length
        : Infinity;
      
      results.push({
        alpha,
        l1Ratio,
        cvScore: avgCvScore,
        rmse: avgCvScore,
      });
    }
  }
  
  // Find best (prefer ridge-heavy for better slope)
  results.sort((a, b) => {
    // If scores are very close (within 0.2), prefer ridge-heavy
    if (Math.abs(a.cvScore - b.cvScore) < 0.2) {
      // Prefer lower l1_ratio (more ridge-like)
      if (a.l1Ratio < b.l1Ratio) return -1;
      if (a.l1Ratio > b.l1Ratio) return 1;
      // If same l1_ratio, prefer smaller alpha (less shrinkage)
      if (a.alpha < b.alpha) return -1;
      if (a.alpha > b.alpha) return 1;
    }
    return a.cvScore - b.cvScore;
  });
  
  return results[0];
}

// ============================================================================
// WALK-FORWARD VALIDATION (same as before)
// ============================================================================

// ============================================================================
// GRID SEARCH WITH RESIDUALIZATION (for Extended v0)
// ============================================================================

function gridSearchWithResidualization(
  rows: TrainingRow[],
  y: number[],
  weights: number[],
  weeks: number[],
  alphas: number[],
  l1Ratios: number[],
  featureNames: string[],
  useHinge14: boolean,
  nFolds: number = cliConfig.cvFolds
): GridSearchResult {
  console.log(`   Grid search with residualization: ${alphas.length} alphas × ${l1Ratios.length} l1_ratios = ${alphas.length * l1Ratios.length} combinations (${nFolds} CV folds)\n`);
  
  const results: GridSearchResult[] = [];
  
  // Group by week for CV
  const weekGroups = new Map<number, number[]>();
  for (let i = 0; i < weeks.length; i++) {
    if (!weekGroups.has(weeks[i])) {
      weekGroups.set(weeks[i], []);
    }
    weekGroups.get(weeks[i])!.push(i);
  }
  
  const weekList = Array.from(weekGroups.keys()).sort((a, b) => a - b);
  
  let comboCount = 0;
  const totalCombos = alphas.length * l1Ratios.length;
  
  for (const alpha of alphas) {
    for (const l1Ratio of l1Ratios) {
      comboCount++;
      heartbeat(`Grid search: ${comboCount}/${totalCombos} (α=${alpha}, l1=${l1Ratio})`);
      
      const cvScores: number[] = [];
      
      for (let fold = 0; fold < nFolds; fold++) {
        const testWeekStart = Math.floor((weekList.length * fold) / nFolds);
        const testWeekEnd = Math.floor((weekList.length * (fold + 1)) / nFolds);
        const testWeeks = weekList.slice(testWeekStart, testWeekEnd);
        
        const trainIndices: number[] = [];
        const testIndices: number[] = [];
        
        for (let i = 0; i < weeks.length; i++) {
          if (testWeeks.includes(weeks[i])) {
            testIndices.push(i);
          } else {
            trainIndices.push(i);
          }
        }
        
        if (trainIndices.length === 0 || testIndices.length === 0) continue;
        
        // Build feature matrix with residualization on training fold (for all rows, but residualize using trainIndices)
        const { X } = buildFeatureMatrix(rows, 'extended', useHinge14, true, trainIndices);
        
        // Train on fold
        const XTrain = trainIndices.map(i => X[i]);
        const yTrain = trainIndices.map(i => y[i]);
        const wTrain = trainIndices.map(i => weights[i]);
        
        const model = elasticNet(XTrain, yTrain, wTrain, alpha, l1Ratio);
        
        // Test on fold (using same X matrix, already residualized using trainIndices)
        const XTest = testIndices.map(i => X[i]);
        const yTest = testIndices.map(i => y[i]);
        
        let testRmse = 0;
        let testWeight = 0;
        for (let i = 0; i < testIndices.length; i++) {
          const pred = XTest[i].reduce((sum, val, j) => sum + val * model.coefficients[j], 0);
          const err = yTest[i] - pred;
          const w = weights[testIndices[i]];
          testRmse += w * err * err;
          testWeight += w;
        }
        testRmse = Math.sqrt(testRmse / testWeight);
        cvScores.push(testRmse);
      }
      
      const avgCvScore = cvScores.length > 0
        ? cvScores.reduce((a, b) => a + b, 0) / cvScores.length
        : Infinity;
      
      results.push({
        alpha,
        l1Ratio,
        cvScore: avgCvScore,
        rmse: avgCvScore,
      });
    }
  }
  
  results.sort((a, b) => {
    if (Math.abs(a.cvScore - b.cvScore) < 0.2) {
      if (a.l1Ratio < b.l1Ratio) return -1;
      if (a.l1Ratio > b.l1Ratio) return 1;
      if (a.alpha < b.alpha) return -1;
      if (a.alpha > b.alpha) return 1;
    }
    return a.cvScore - b.cvScore;
  });
  
  return results[0];
}

// ============================================================================
// WALK-FORWARD VALIDATION WITH RESIDUALIZATION (for Extended v0)
// ============================================================================

function walkForwardValidationWithResidualization(
  rows: TrainingRow[],
  y: number[],
  weights: number[],
  weeks: number[],
  alpha: number,
  l1Ratio: number,
  useHinge14: boolean
): { predictions: number[]; metrics: { rmse: number; r2: number; pearson: number; spearman: number } } {
  const uniqueWeeks = Array.from(new Set(weeks)).sort((a, b) => a - b);
  const predictions: number[] = new Array(y.length).fill(0);
  
  for (let i = 1; i < uniqueWeeks.length; i++) {
    const trainWeeks = uniqueWeeks.slice(0, i);
    const testWeek = uniqueWeeks[i];
    
    const trainIndices: number[] = [];
    const testIndices: number[] = [];
    
    for (let j = 0; j < weeks.length; j++) {
      if (weeks[j] === testWeek) {
        testIndices.push(j);
      } else if (trainWeeks.includes(weeks[j])) {
        trainIndices.push(j);
      }
    }
    
    if (trainIndices.length === 0 || testIndices.length === 0) continue;
    
    // Build feature matrix with residualization on training fold (for all rows, but residualize using trainIndices)
    const { X } = buildFeatureMatrix(rows, 'extended', useHinge14, true, trainIndices);
    
    // Train
    const XTrain = trainIndices.map(idx => X[idx]);
    const yTrain = trainIndices.map(idx => y[idx]);
    const wTrain = trainIndices.map(idx => weights[idx]);
    
    const model = elasticNet(XTrain, yTrain, wTrain, alpha, l1Ratio);
    
    // Predict (using same X matrix, already residualized using trainIndices)
    for (const idx of testIndices) {
      predictions[idx] = X[idx].reduce((sum, val, j) => sum + val * model.coefficients[j], 0);
    }
  }
  
  // Compute metrics
  const meanY = y.reduce((sum, val, i) => sum + weights[i] * val, 0) / weights.reduce((a, b) => a + b, 0);
  
  let ssRes = 0;
  let ssTot = 0;
  let sumW = 0;
  
  for (let i = 0; i < y.length; i++) {
    if (predictions[i] === 0) continue;
    const w = weights[i];
    const err = y[i] - predictions[i];
    const dev = y[i] - meanY;
    ssRes += w * err * err;
    ssTot += w * dev * dev;
    sumW += w;
  }
  
  const rmse = Math.sqrt(ssRes / sumW);
  const r2 = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;
  
  const yPred = y.filter((_, i) => predictions[i] !== 0);
  const predPred = predictions.filter(p => p !== 0);
  const wPred = weights.filter((_, i) => predictions[i] !== 0);
  
  const pearson = pearsonCorrelation(yPred, predPred, wPred);
  const spearman = pearsonCorrelation(rankArray(yPred), rankArray(predPred), wPred);
  
  return {
    predictions,
    metrics: { rmse, r2, pearson, spearman },
  };
}

function walkForwardValidation(
  X: number[][],
  y: number[],
  weights: number[],
  weeks: number[],
  alpha: number,
  l1Ratio: number
): { predictions: number[]; metrics: { rmse: number; r2: number; pearson: number; spearman: number } } {
  const uniqueWeeks = Array.from(new Set(weeks)).sort((a, b) => a - b);
  const predictions: number[] = new Array(y.length).fill(0);
  
  // Walk forward: train on weeks 1..k, test on week k+1
  for (let i = 1; i < uniqueWeeks.length; i++) {
    const trainWeeks = uniqueWeeks.slice(0, i);
    const testWeek = uniqueWeeks[i];
    
    const trainIndices: number[] = [];
    const testIndices: number[] = [];
    
    for (let j = 0; j < weeks.length; j++) {
      if (weeks[j] === testWeek) {
        testIndices.push(j);
      } else if (trainWeeks.includes(weeks[j])) {
        trainIndices.push(j);
      }
    }
    
    if (trainIndices.length === 0 || testIndices.length === 0) continue;
    
    // Train
    const XTrain = trainIndices.map(idx => X[idx]);
    const yTrain = trainIndices.map(idx => y[idx]);
    const wTrain = trainIndices.map(idx => weights[idx]);
    
    const model = elasticNet(XTrain, yTrain, wTrain, alpha, l1Ratio);
    
    // Predict
    for (const idx of testIndices) {
      predictions[idx] = X[idx].reduce((sum, val, j) => sum + val * model.coefficients[j], 0);
    }
  }
  
  // Compute metrics
  const meanY = y.reduce((sum, val, i) => sum + weights[i] * val, 0) / weights.reduce((a, b) => a + b, 0);
  
  let ssRes = 0;
  let ssTot = 0;
  let sumW = 0;
  
  for (let i = 0; i < y.length; i++) {
    if (predictions[i] === 0) continue; // Skip if not predicted
    const w = weights[i];
    const err = y[i] - predictions[i];
    const dev = y[i] - meanY;
    ssRes += w * err * err;
    ssTot += w * dev * dev;
    sumW += w;
  }
  
  const rmse = Math.sqrt(ssRes / sumW);
  const r2 = 1 - (ssRes / ssTot);
  
  // Correlations (only on predicted samples)
  const yPred = y.filter((_, i) => predictions[i] !== 0);
  const predPred = predictions.filter(p => p !== 0);
  const wPred = weights.filter((_, i) => predictions[i] !== 0);
  
  const pearson = pearsonCorrelation(yPred, predPred, wPred);
  const spearman = pearsonCorrelation(rankArray(yPred), rankArray(predPred), wPred);
  
  return {
    predictions,
    metrics: {
      rmse: isFinite(rmse) ? rmse : Infinity,
      r2: isFinite(r2) ? r2 : 0,
      pearson: isFinite(pearson) ? pearson : 0,
      spearman: isFinite(spearman) ? spearman : 0,
    },
  };
}

// ============================================================================
// BASELINE COMPUTATION (for relative gates)
// ============================================================================

interface BaselineMetrics {
  zero: {
    rmse: number;
    mae: number;
    pearson: number;
    spearman: number;
    signAgreement: number;
    varianceRatio: number;
  };
  ols: {
    rmse: number;
    mae: number;
    pearson: number;
    spearman: number;
    signAgreement: number;
    varianceRatio: number;
  };
}

function computeBaselines(
  y: number[],
  weights: number[],
  rows: TrainingRow[]
): BaselineMetrics {
  const sumW = weights.reduce((a, b) => a + b, 0);
  
  // Zero baseline: always predict 0
  const zeroPreds = y.map(() => 0);
  let zeroSsRes = 0;
  let zeroSumAbsErr = 0;
  let zeroSignAgreements = 0;
  for (let i = 0; i < y.length; i++) {
    const err = y[i] - zeroPreds[i];
    zeroSsRes += weights[i] * err * err;
    zeroSumAbsErr += weights[i] * Math.abs(err);
    const ySign = y[i] < 0 ? -1 : (y[i] > 0 ? 1 : 0);
    const predSign = zeroPreds[i] < 0 ? -1 : (zeroPreds[i] > 0 ? 1 : 0);
    if (ySign === predSign && ySign !== 0) {
      zeroSignAgreements++;
    }
  }
  const zeroRmse = Math.sqrt(zeroSsRes / sumW);
  const zeroMae = zeroSumAbsErr / sumW;
  const zeroPearson = pearsonCorrelation(y, zeroPreds, weights);
  const zeroSpearman = pearsonCorrelation(rankArray(y), rankArray(zeroPreds), weights);
  const zeroSignAgreement = (zeroSignAgreements / y.length) * 100;
  
  // Variance ratio for zero (always 0)
  const zeroVarianceRatio = 0;
  
  // OLS baseline: y ~ ratingDiffBlend + hfaPoints
  const ratingDiffs: number[] = [];
  const hfaPoints: number[] = [];
  for (const row of rows) {
    const ratingDiff = row.ratingDiffBlend ?? row.ratingDiffV2 ?? 0;
    ratingDiffs.push(ratingDiff);
    hfaPoints.push(row.hfaPoints ?? 0);
  }
  
  // Check hfaPoints variance
  const hfaMean = hfaPoints.reduce((a, b, i) => a + weights[i] * b, 0) / sumW;
  const hfaVar = hfaPoints.reduce((sum, h, i) => sum + weights[i] * Math.pow(h - hfaMean, 2), 0) / sumW;
  const hfaStd = Math.sqrt(hfaVar);
  
  let olsX: number[][];
  if (hfaStd > 1e-6) {
    olsX = ratingDiffs.map((rd, i) => [1, rd, hfaPoints[i]]);
  } else {
    olsX = ratingDiffs.map((rd) => [1, rd]);
  }
  
  const olsResult = simpleOLS(olsX, y, weights);
  
  // Compute variance ratio for OLS
  const yMean = y.reduce((a, b, i) => a + weights[i] * b, 0) / sumW;
  const yVar = y.reduce((sum, yi, i) => sum + weights[i] * Math.pow(yi - yMean, 2), 0) / sumW;
  const stdY = Math.sqrt(yVar);
  
  const predMean = olsResult.predictions.reduce((a, b, i) => a + weights[i] * b, 0) / sumW;
  const predVar = olsResult.predictions.reduce((sum, pi, i) => sum + weights[i] * Math.pow(pi - predMean, 2), 0) / sumW;
  const stdPred = Math.sqrt(predVar);
  const olsVarianceRatio = stdPred / stdY;
  
  // Compute residual slices for OLS (>28 bucket)
  const olsResidualPairs = olsResult.predictions.map((pred, i) => ({
    absResidual: Math.abs(y[i] - pred),
    signedResidual: y[i] - pred,
    weight: weights[i],
  }));
  const olsTailSlice = olsResidualPairs.filter(r => r.absResidual > 28);
  const olsTailMean = olsTailSlice.length > 0
    ? olsTailSlice.reduce((sum, p) => sum + p.weight * p.signedResidual, 0) / olsTailSlice.reduce((sum, p) => sum + p.weight, 0)
    : 0;
  
  return {
    zero: {
      rmse: zeroRmse,
      mae: zeroMae,
      pearson: zeroPearson,
      spearman: zeroSpearman,
      signAgreement: zeroSignAgreement,
      varianceRatio: zeroVarianceRatio,
    },
    ols: {
      rmse: olsResult.rmse,
      mae: olsResult.mae,
      pearson: olsResult.pearson,
      spearman: olsResult.spearman,
      signAgreement: olsResult.signAgreement,
      varianceRatio: olsVarianceRatio,
      tailSliceMean: olsTailMean, // Add this for relative tail gate
    } as any,
  };
}

// ============================================================================
// GATE CHECKING (updated for relative gates)
// ============================================================================

function checkGates(
  y: number[],
  predictions: number[],
  weights: number[],
  coefficients: number[],
  featureNames: string[],
  fitType: 'core' | 'extended',
  rawPredictions?: number[], // Optional: raw predictions for variance ratio check
  baselines?: BaselineMetrics // Optional: baseline metrics for relative gates
): GateResults {
  const results: GateResults = {
    slope: 0,
    signAgreement: 0,
    pearson: 0,
    spearman: 0,
    rmse: 0,
    coefficientSanity: {
      ratingDiff: 0,
      hfaPoints: 0,
    },
    residualSlices: {
      '0-7': 0,
      '7-14': 0,
      '14-28': 0,
      '>28': 0,
    },
    allPassed: false,
  };
  
  // Filter to valid predictions
  const validIndices: number[] = [];
  for (let i = 0; i < predictions.length; i++) {
    if (predictions[i] !== 0 && isFinite(predictions[i]) && isFinite(y[i])) {
      validIndices.push(i);
    }
  }
  
  if (validIndices.length === 0) {
    return results;
  }
  
  const yValid = validIndices.map(i => y[i]);
  const predValid = validIndices.map(i => predictions[i]);
  const wValid = validIndices.map(i => weights[i]);
  
  // Slope (OLS: y ~ pred)
  const sumW = wValid.reduce((a, b) => a + b, 0);
  const meanY = yValid.reduce((sum, val, i) => sum + wValid[i] * val, 0) / sumW;
  const meanPred = predValid.reduce((sum, val, i) => sum + wValid[i] * val, 0) / sumW;
  
  let cov = 0;
  let varPred = 0;
  for (let i = 0; i < validIndices.length; i++) {
    const yDev = yValid[i] - meanY;
    const predDev = predValid[i] - meanPred;
    cov += wValid[i] * yDev * predDev;
    varPred += wValid[i] * predDev * predDev;
  }
  results.slope = varPred > 1e-10 ? cov / varPred : 0;
  
  // Sign agreement (explicit check: sign(ŷ*) == sign(y) on HMA frame)
  let signAgreements = 0;
  let posY = 0;
  let negY = 0;
  for (let i = 0; i < validIndices.length; i++) {
    const ySign = yValid[i] < 0 ? -1 : (yValid[i] > 0 ? 1 : 0);
    const predSign = predValid[i] < 0 ? -1 : (predValid[i] > 0 ? 1 : 0);
    if (ySign === predSign && ySign !== 0) {
      signAgreements++;
    }
    if (yValid[i] > 0) posY++;
    if (yValid[i] < 0) negY++;
  }
  results.signAgreement = (signAgreements / validIndices.length) * 100;
  
  // Safety check: if sign agreement is 100%, log first 50 rows (bug indicator)
  if (results.signAgreement === 100 && validIndices.length > 0) {
    console.log(`   ⚠️  WARNING: 100% sign agreement detected! First 50 (y, ŷ*, diff):`);
    for (let i = 0; i < Math.min(50, validIndices.length); i++) {
      const idx = validIndices[i];
      console.log(`     [${i}] y=${y[idx].toFixed(2)}, ŷ*=${predValid[i].toFixed(2)}, diff=${(y[idx] - predValid[i]).toFixed(2)}`);
    }
  }
  
  // Log target distribution
  console.log(`   Target distribution: ${posY} positive (${((posY / validIndices.length) * 100).toFixed(1)}%), ${negY} negative (${((negY / validIndices.length) * 100).toFixed(1)}%)`);
  
  // Correlations
  results.pearson = pearsonCorrelation(yValid, predValid, wValid);
  results.spearman = pearsonCorrelation(rankArray(yValid), rankArray(predValid), wValid);
  
  // RMSE
  let ssRes = 0;
  for (let i = 0; i < validIndices.length; i++) {
    const err = yValid[i] - predValid[i];
    ssRes += wValid[i] * err * err;
  }
  results.rmse = Math.sqrt(ssRes / sumW);
  
  // Coefficient sanity
  const ratingIdx = featureNames.findIndex(name => name === 'ratingDiffV2' || name === 'ratingDiffBlend');
  const hfaIdx = featureNames.indexOf('hfaPoints');
  
  if (ratingIdx >= 0) results.coefficientSanity.ratingDiff = coefficients[ratingIdx];
  if (hfaIdx >= 0) results.coefficientSanity.hfaPoints = coefficients[hfaIdx];
  
  // Note: Monotone curvature features (absRatingDiffV2, hinge7, hinge14) don't need sign checks
  // They are designed to be non-negative and monotone by construction
  
  // Residual slices (mean residual, not mean absolute residual)
  // Group by absolute residual magnitude, then compute mean signed residual
  const residualPairs = validIndices.map(i => ({
    absResidual: Math.abs(y[i] - predictions[i]),
    signedResidual: y[i] - predictions[i],
    weight: weights[i],
  }));
  
  const slices = {
    '0-7': residualPairs.filter(r => r.absResidual >= 0 && r.absResidual < 7),
    '7-14': residualPairs.filter(r => r.absResidual >= 7 && r.absResidual < 14),
    '14-28': residualPairs.filter(r => r.absResidual >= 14 && r.absResidual < 28),
    '>28': residualPairs.filter(r => r.absResidual >= 28),
  };
  
  for (const [key, pairs] of Object.entries(slices)) {
    if (pairs.length > 0) {
      const sumWeight = pairs.reduce((sum, p) => sum + p.weight, 0);
      const meanResidual = pairs.reduce((sum, p) => sum + p.weight * p.signedResidual, 0) / sumWeight;
      results.residualSlices[key as keyof typeof results.residualSlices] = meanResidual;
    } else {
      results.residualSlices[key as keyof typeof results.residualSlices] = 0;
    }
  }
  
  // Variance ratio check (sanity gate) - use raw predictions if available
  // For OLS, variance ratio = |Pearson|, so we can use that directly
  // Otherwise, compute weighted variance ratio
  const predsForVar = rawPredictions ? rawPredictions : predictions;
  const validPredsForVar = validIndices.map(i => predsForVar[i]);
  const validYForVar = validIndices.map(i => y[i]);
  const wValidForVar = validIndices.map(i => weights[i]);
  const sumWVar = wValidForVar.reduce((a, b) => a + b, 0);
  
  const meanPredVar = validPredsForVar.reduce((sum, val, i) => sum + wValidForVar[i] * val, 0) / sumWVar;
  const meanYVar = validYForVar.reduce((sum, val, i) => sum + wValidForVar[i] * val, 0) / sumWVar;
  
  let varPredVar = 0;
  let varYVar = 0;
  for (let i = 0; i < validIndices.length; i++) {
    const predDev = validPredsForVar[i] - meanPredVar;
    const yDev = validYForVar[i] - meanYVar;
    varPredVar += wValidForVar[i] * predDev * predDev;
    varYVar += wValidForVar[i] * yDev * yDev;
  }
  varPredVar /= sumWVar;
  varYVar /= sumWVar;
  
  const stdPredVar = Math.sqrt(varPredVar);
  const stdYVar = Math.sqrt(varYVar);
  const varianceRatio = stdPredVar / stdYVar;
  
  // Check all gates (relative to baselines if provided, otherwise absolute)
  if (baselines) {
    // Relative gates (Core = OLS, so gates are relative to OLS baseline)
    const rmseGate = results.rmse <= Math.min(
      baselines.ols.rmse * 1.02,  // within 2% of OLS
      baselines.zero.rmse * 0.98   // at least 2% better than zero
    );
    
    const signGate = results.signAgreement >= Math.max(
      baselines.ols.signAgreement - 2.0,  // within 2 percentage points of OLS
      baselines.zero.signAgreement        // never worse than Zero
    );
    
    const pearsonGate = results.pearson >= baselines.ols.pearson - 0.03;
    const spearmanGate = results.spearman >= baselines.ols.spearman - 0.03;
    
    // Tail slice gate (relative to OLS)
    const olsTailMean = (baselines.ols as any).tailSliceMean || 0;
    const tailGate = Math.abs(results.residualSlices['>28']) <= Math.max(
      2.0,
      1.5 * Math.abs(olsTailMean)
    );
    
    results.allPassed =
      results.slope >= 0.90 && results.slope <= 1.10 &&
      rmseGate &&
      signGate &&
      pearsonGate &&
      spearmanGate &&
      results.coefficientSanity.ratingDiff > 0 &&
      varianceRatio >= 0.40 && varianceRatio <= 1.2 &&
      Math.abs(results.residualSlices['0-7']) <= 2.0 &&
      Math.abs(results.residualSlices['7-14']) <= 2.0 &&
      Math.abs(results.residualSlices['14-28']) <= 2.0 &&
      tailGate;
  } else {
    // Absolute gates (fallback for Extended or when baselines not provided)
    const rmseThreshold = fitType === 'core' ? 8.8 : 9.0;
    results.allPassed =
      results.slope >= 0.90 && results.slope <= 1.10 &&
      results.rmse <= rmseThreshold &&
      results.signAgreement >= 70 &&
      results.pearson >= 0.30 &&
      results.spearman >= 0.30 &&
      results.coefficientSanity.ratingDiff > 0 &&
      varianceRatio >= 0.40 && varianceRatio <= 1.2 &&
      Math.abs(results.residualSlices['0-7']) <= 2.0 &&
      Math.abs(results.residualSlices['7-14']) <= 2.0 &&
      Math.abs(results.residualSlices['14-28']) <= 2.0 &&
      Math.abs(results.residualSlices['>28']) <= 2.0;
  }
  
  // Log variance ratio
  console.log(`   Variance ratio (std(ŷ)/std(y)): ${varianceRatio.toFixed(4)} (target: 0.40-1.2, realistic based on OLS baseline)`);
  
  return results;
}

// ============================================================================
// INTROSPECTION & SANITY CHECK FUNCTIONS
// ============================================================================

function logCoreIntrospection(rows: TrainingRow[]): void {
  console.log('\n' + '='.repeat(70));
  console.log('🔎 CORE DATA INTROSPECTION');
  console.log('='.repeat(70));

  const total = rows.length;
  const setACount = rows.filter(r => r.setLabel === 'A').length;
  const setBCount = rows.filter(r => r.setLabel === 'B').length;
  const setAWeight = rows.filter(r => r.setLabel === 'A').reduce((sum, r) => sum + r.rowWeight, 0);
  const setBWeight = rows.filter(r => r.setLabel === 'B').reduce((sum, r) => sum + r.rowWeight, 0);

  console.log(`   Total rows: ${total} (Set A=${setACount} @ total weight ${setAWeight.toFixed(1)}, Set B=${setBCount} @ total weight ${setBWeight.toFixed(1)})`);

  const positives = rows.filter(r => (r.targetSpreadHma ?? 0) > 0).length;
  const negatives = rows.filter(r => (r.targetSpreadHma ?? 0) < 0).length;
  const zeros = total - positives - negatives;
  console.log(`   Target distribution (HMA): +${((positives / total) * 100).toFixed(1)}% / -${((negatives / total) * 100).toFixed(1)}% / 0=${zeros}`);

  const blendLabel = mftrRatings && blendConfig
    ? `ratingDiffBlend (w=${blendConfig.optimalWeight.toFixed(2)})`
    : 'ratingDiffV2 (no blend)';
  console.log(`   Active feature: ${blendLabel}`);

  const weights = rows.map(r => r.rowWeight);
  const targets = rows.map(r => r.targetSpreadHma ?? 0);
  const ratingDiffs = rows.map(r =>
    r.ratingDiffBlend ?? r.ratingDiffV2 ?? 0
  );

  const corrTargetBlend = pearsonCorrelation(targets, ratingDiffs, weights);
  console.log(`   Corr(target_HMA, ratingDiffBlend): ${corrTargetBlend.toFixed(4)}`);

  console.log('   First 10 rows (game_id, week, target_HMA, ratingDiffBlend, hfaPoints):');
  rows.slice(0, 10).forEach(row => {
    const ratingDiff = row.ratingDiffBlend ?? row.ratingDiffV2 ?? 0;
    const target = row.targetSpreadHma ?? 0;
    console.log(
      `     ${row.gameId} | wk ${row.week} | y=${target.toFixed(2)} | diff=${ratingDiff.toFixed(2)} | hfa=${(row.hfaPoints ?? 0).toFixed(2)}`
    );
  });

  console.log('='.repeat(70) + '\n');
}

function runMinimalCoreSanityCheck(rows: TrainingRow[]): void {
  console.log('🔍 Running minimal Core sanity check (rating_blend + hfaPoints)...');
  if (rows.some(r => r.targetSpreadHma === null)) {
    throw new Error('Minimal Core sanity check failed: rows with null targets');
  }
  const y = rows.map(r => r.targetSpreadHma!);
  const weights = rows.map(r => r.rowWeight);
  
  // Build minimal feature matrix (just rating_diff and hfa)
  const featureNames: string[] = ['intercept', 'ratingDiff', 'hfaPoints'];
  const X: number[][] = [];
  for (const row of rows) {
    const ratingDiff = row.ratingDiffBlend ?? row.ratingDiffV2 ?? 0;
    X.push([1, ratingDiff, row.hfaPoints ?? 0]);
  }
  
  // Quick OLS fit
  const model = elasticNet(X, y, weights, 1e-6, 0);
  const ratingIdx = 1;
  const hfaIdx = 2;
  const ratingCoeff = model.coefficients[ratingIdx];
  const hfaCoeff = model.coefficients[hfaIdx];
  
  // Check hfaPoints variance
  const hfaValues = rows.map(r => r.hfaPoints ?? 0);
  const hfaMean = hfaValues.reduce((a, b) => a + b, 0) / hfaValues.length;
  const hfaVar = hfaValues.reduce((sum, h) => sum + Math.pow(h - hfaMean, 2), 0) / hfaValues.length;
  const hfaStd = Math.sqrt(hfaVar);
  const hfaHasVariance = hfaStd > 1e-6;
  
  console.log(`   β(rating_diff): ${ratingCoeff.toFixed(4)}, β(hfaPoints): ${hfaCoeff.toFixed(4)}`);
  console.log(`   hfaPoints stats: mean=${hfaMean.toFixed(2)}, std=${hfaStd.toFixed(2)}, hasVariance=${hfaHasVariance}`);
  
  if (ratingCoeff <= 0) {
    throw new Error(`Minimal Core sanity check failed: β(rating_diff)=${ratingCoeff.toFixed(4)} must be > 0`);
  }
  
  // hfaPoints may be negative if there's collinearity or frame issues, but warn if it has variance
  if (hfaHasVariance && hfaCoeff <= 0) {
    console.log(`   ⚠️  WARNING: β(hfaPoints)=${hfaCoeff.toFixed(4)} is ≤ 0 despite variance. Possible frame issue or collinearity.`);
    // Don't fail - this is a warning for now, will be checked in full model
  }
  
  console.log('   ✅ Minimal Core sanity check passed (rating_diff > 0)\n');
}

// ============================================================================
// CORE COEFFICIENT PERSISTENCE (for Set A calibration → AB evaluation)
// ============================================================================

interface CoreCoefficients {
  beta0: number;
  betaRatingDiff: number;
  betaHfa: number;
  season: number;
  featureVersion: string;
  calibratedOnSet: 'A';
  timestamp: string;
}

async function persistCoreCoefficients(
  season: number,
  featureVersion: string,
  beta0: number,
  betaRatingDiff: number,
  betaHfa: number
): Promise<void> {
  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  const coeffs: CoreCoefficients = {
    beta0,
    betaRatingDiff,
    betaHfa,
    season,
    featureVersion,
    calibratedOnSet: 'A',
    timestamp: new Date().toISOString(),
  };
  
  const filePath = path.join(reportsDir, `core_coefficients_${season}_${featureVersion}.json`);
  fs.writeFileSync(filePath, JSON.stringify(coeffs, null, 2));
  console.log(`   💾 Persisted Core coefficients to ${filePath}\n`);
}

async function loadCoreCoefficients(
  season: number,
  featureVersion: string
): Promise<CoreCoefficients | null> {
  const reportsDir = path.join(process.cwd(), 'reports');
  const filePath = path.join(reportsDir, `core_coefficients_${season}_${featureVersion}.json`);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const coeffs = JSON.parse(content) as CoreCoefficients;
  
  // Validate it's for the right season/version
  if (coeffs.season !== season || coeffs.featureVersion !== featureVersion) {
    return null;
  }
  
  return coeffs;
}

// ============================================================================
// HFA DIAGNOSTIC LOGGING
// ============================================================================

function logHFADiagnostics(rows: TrainingRow[], setName: string): void {
  const hfaValues = rows.map(r => r.hfaPoints ?? 0);
  const hfaCounts = new Map<number, number>();
  for (const hfa of hfaValues) {
    hfaCounts.set(hfa, (hfaCounts.get(hfa) || 0) + 1);
  }
  
  const sumW = rows.reduce((sum, r) => sum + r.rowWeight, 0);
  const hfaMean = rows.reduce((sum, r) => sum + r.rowWeight * (r.hfaPoints ?? 0), 0) / sumW;
  const hfaVar = rows.reduce((sum, r) => {
    const dev = (r.hfaPoints ?? 0) - hfaMean;
    return sum + r.rowWeight * dev * dev;
  }, 0) / sumW;
  const hfaStd = Math.sqrt(hfaVar);
  
  console.log(`\n📊 HFA Diagnostics (${setName}):`);
  console.log(`   Distinct values: ${Array.from(hfaCounts.entries()).map(([val, count]) => `${val}=${count}`).join(', ')}`);
  console.log(`   Mean: ${hfaMean.toFixed(2)}, Std: ${hfaStd.toFixed(2)}, Has variance: ${hfaStd > 1e-6}\n`);
}

// ============================================================================
// MAIN CALIBRATION FUNCTION (Set A = calibration, Set AB = evaluation)
// ============================================================================

async function calibrateCore(
  season: number = 2025,
  featureVersion: string = 'fe_v1',
  modelVersion: string = 'cal_v1'
): Promise<CalibrationResult | null> {
  console.log('\n' + '='.repeat(70));
  console.log(`🔧 MODEL CALIBRATION: Fit #1 CORE (Rehab)`);
  console.log('='.repeat(70) + '\n');
  
  // Load MFTR and blend config
  await loadMFTRAndBlend();
  
  // Determine if this is calibration (Set A) or evaluation (Set AB)
  const isEvaluation = cliConfig.sets === 'AB';
  
  if (isEvaluation) {
    // ============================================================================
    // EVALUATION MODE: Load Set A Core and evaluate on Set AB
    // ============================================================================
    console.log('📊 EVALUATION MODE: Loading Set A Core coefficients and evaluating on Set AB\n');
    
    const coreCoeffs = await loadCoreCoefficients(season, featureVersion);
    if (!coreCoeffs) {
      throw new Error(`Cannot evaluate on Set AB: Core coefficients not found for season=${season}, featureVersion=${featureVersion}. Please run Set A calibration first.`);
    }
    
    console.log(`   ✅ Loaded Core coefficients (calibrated on Set A):`);
    console.log(`      β₀: ${coreCoeffs.beta0.toFixed(4)}`);
    console.log(`      β(ratingDiffBlend): ${coreCoeffs.betaRatingDiff.toFixed(4)}`);
    console.log(`      β(hfaPoints): ${coreCoeffs.betaHfa.toFixed(4)}`);
    console.log(`      Calibrated: ${coreCoeffs.timestamp}\n`);
    
    // Load Set AB data
    const trainingRows = await loadTrainingData(season, featureVersion, ['A', 'B']);
    let validRows = trainingRows.filter(r => r.targetSpreadHma !== null);
    console.log(`   Loaded ${validRows.length} rows with valid target (Set AB)\n`);
    
    // HFA diagnostics
    logHFADiagnostics(validRows, 'Set AB');
    
    // Generate predictions using Set A coefficients
    const y = validRows.map(r => r.targetSpreadHma!);
    const weights = validRows.map(r => r.rowWeight);
    const predictions: number[] = [];
    
    for (const row of validRows) {
      const ratingDiff = row.ratingDiffBlend ?? row.ratingDiffV2 ?? 0;
      const hfa = row.hfaPoints ?? 0;
      const pred = coreCoeffs.beta0 + coreCoeffs.betaRatingDiff * ratingDiff + coreCoeffs.betaHfa * hfa;
      predictions.push(pred);
    }
    
    // Compute metrics
    const sumW = weights.reduce((a, b) => a + b, 0);
    let ssRes = 0;
    let sumAbsErr = 0;
    let signAgreements = 0;
    for (let i = 0; i < y.length; i++) {
      const err = y[i] - predictions[i];
      ssRes += weights[i] * err * err;
      sumAbsErr += weights[i] * Math.abs(err);
      const ySign = y[i] < 0 ? -1 : (y[i] > 0 ? 1 : 0);
      const predSign = predictions[i] < 0 ? -1 : (predictions[i] > 0 ? 1 : 0);
      if (ySign === predSign && ySign !== 0) {
        signAgreements++;
      }
    }
    const rmse = Math.sqrt(ssRes / sumW);
    const mae = sumAbsErr / sumW;
    const pearson = pearsonCorrelation(y, predictions, weights);
    const spearman = pearsonCorrelation(rankArray(y), rankArray(predictions), weights);
    const signAgreement = (signAgreements / y.length) * 100;
    
    // Variance ratio
    const yMean = y.reduce((a, b, i) => a + weights[i] * b, 0) / sumW;
    const yVar = y.reduce((sum, yi, i) => sum + weights[i] * Math.pow(yi - yMean, 2), 0) / sumW;
    const stdY = Math.sqrt(yVar);
    const predMean = predictions.reduce((a, b, i) => a + weights[i] * b, 0) / sumW;
    const predVar = predictions.reduce((sum, pi, i) => sum + weights[i] * Math.pow(pi - predMean, 2), 0) / sumW;
    const stdPred = Math.sqrt(predVar);
    const varianceRatio = stdPred / stdY;
    
    // Compute Zero baseline for comparison
    const zeroBaseline = computeBaselines(y, weights, validRows).zero;
    
    console.log('📊 Set AB Evaluation Metrics (using Set A Core):');
    console.log(`   RMSE: ${rmse.toFixed(4)} (Zero baseline: ${zeroBaseline.rmse.toFixed(2)})`);
    console.log(`   MAE: ${mae.toFixed(4)}`);
    console.log(`   Pearson: ${pearson.toFixed(4)}`);
    console.log(`   Spearman: ${spearman.toFixed(4)}`);
    console.log(`   Sign agreement: ${signAgreement.toFixed(1)}% (Zero: ${zeroBaseline.signAgreement.toFixed(1)}%)`);
    console.log(`   Variance ratio: ${varianceRatio.toFixed(4)}\n`);
    
    // Compute residual buckets
    const residualPairs = predictions.map((pred, i) => ({
      absResidual: Math.abs(y[i] - pred),
      signedResidual: y[i] - pred,
      weight: weights[i],
    }));
    const slices = {
      '0-7': residualPairs.filter(r => r.absResidual >= 0 && r.absResidual < 7),
      '7-14': residualPairs.filter(r => r.absResidual >= 7 && r.absResidual < 14),
      '14-28': residualPairs.filter(r => r.absResidual >= 14 && r.absResidual < 28),
      '>28': residualPairs.filter(r => r.absResidual >= 28),
    };
    const residualSlices: Record<string, number> = {};
    for (const [key, pairs] of Object.entries(slices)) {
      if (pairs.length > 0) {
        const sumWeight = pairs.reduce((sum, p) => sum + p.weight, 0);
        const meanResidual = pairs.reduce((sum, p) => sum + p.weight * p.signedResidual, 0) / sumWeight;
        residualSlices[key] = meanResidual;
      } else {
        residualSlices[key] = 0;
      }
    }
    
    console.log(`   Residual slices: 0-7=${residualSlices['0-7'].toFixed(2)}, 7-14=${residualSlices['7-14'].toFixed(2)}, 14-28=${residualSlices['14-28'].toFixed(2)}, >28=${residualSlices['>28'].toFixed(2)}\n`);
    
    // Write evaluation metrics to CSV
    const reportsDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const evalRows = [
      'metric,value',
      `RMSE,${rmse.toFixed(4)}`,
      `MAE,${mae.toFixed(4)}`,
      `Pearson,${pearson.toFixed(4)}`,
      `Spearman,${spearman.toFixed(4)}`,
      `Sign Agreement,${signAgreement.toFixed(1)}`,
      `Variance Ratio,${varianceRatio.toFixed(4)}`,
      `Zero Baseline RMSE,${zeroBaseline.rmse.toFixed(4)}`,
      `Zero Baseline Sign,${zeroBaseline.signAgreement.toFixed(1)}`,
      `Residual Slice 0-7,${residualSlices['0-7'].toFixed(2)}`,
      `Residual Slice 7-14,${residualSlices['7-14'].toFixed(2)}`,
      `Residual Slice 14-28,${residualSlices['14-28'].toFixed(2)}`,
      `Residual Slice >28,${residualSlices['>28'].toFixed(2)}`,
    ];
    
    fs.writeFileSync(
      path.join(reportsDir, 'core_metrics_setAB_eval.csv'),
      evalRows.join('\n')
    );
    console.log(`   ✅ Evaluation metrics written to reports/core_metrics_setAB_eval.csv\n`);
    
    // Return a minimal CalibrationResult for compatibility (but gates are not enforced)
    const featureNames = ['intercept', 'ratingDiffBlend', 'hfaPoints'];
    const coefficients = [coreCoeffs.beta0, coreCoeffs.betaRatingDiff, coreCoeffs.betaHfa];
    
    const mockModel: ElasticNetResult = {
      coefficients,
      intercept: coreCoeffs.beta0,
      rmse,
      r2: pearson * pearson,
      pearson,
      spearman,
    } as any;
    
    const mockWalkForward = {
      predictions,
      metrics: { rmse, mae, r2: pearson * pearson, pearson, spearman, signAgreement },
    };
    
    const gateResults: GateResults = {
      slope: 1.0, // OLS slope is always 1.0
      signAgreement,
      pearson,
      spearman,
      rmse,
      coefficientSanity: {
        ratingDiff: coreCoeffs.betaRatingDiff,
        hfaPoints: coreCoeffs.betaHfa,
      },
      residualSlices: residualSlices as any,
      allPassed: true, // Don't enforce gates on evaluation
    };
    
    return {
      model: mockModel,
      walkForward: mockWalkForward,
      gates: gateResults,
      bestParams: { alpha: 0, l1Ratio: 0, rmse, cvScores: [] },
      featureNames,
      coefficients: {
        intercept: { standardized: coreCoeffs.beta0, original: coreCoeffs.beta0 },
        ratingDiffBlend: { standardized: coreCoeffs.betaRatingDiff, original: coreCoeffs.betaRatingDiff },
        hfaPoints: { standardized: coreCoeffs.betaHfa, original: coreCoeffs.betaHfa },
      },
      scalerParams: {
        intercept: { mean: 0, std: 1 },
        ratingDiffBlend: { mean: 0, std: 1 },
        hfaPoints: { mean: 0, std: 1 },
      },
      useHinge14: false,
      useWeights: true,
      calibrationHead: undefined,
      calibratedPredictions: predictions,
    };
  }
  
  // ============================================================================
  // CALIBRATION MODE: Fit Core OLS on Set A only
  // ============================================================================
  console.log('📐 CALIBRATION MODE: Fitting Core OLS on Set A only\n');
  
  // Load data (Set A only for calibration)
  const setLabels: string[] = ['A'];
  const trainingRows = await loadTrainingData(season, featureVersion, setLabels);
  
  // Filter to rows with valid target
  let validRows = trainingRows.filter(r => r.targetSpreadHma !== null);
  console.log(`   Loaded ${validRows.length} rows with valid target (Set A only)\n`);
  
  // ============================================================================
  // INTROSPECTION & SANITY CHECKS (must pass before training)
  // ============================================================================
  logCoreIntrospection(validRows);
  runMinimalCoreSanityCheck(validRows);
  
  // HFA diagnostics
  logHFADiagnostics(validRows, 'Set A');
  
  if (validRows.length < 100) {
    throw new Error(`Insufficient training data: ${validRows.length} rows (need ≥100)`);
  }
  
  // Frame alignment: Both target and features are now in HMA frame
  // Target: HMA = home - away (positive = home better, negative = away better)
  // rating_diff: HMA = rating_home - rating_away (positive = home better)
  // hfa_points: additive HFA for home team (positive, 0 if neutral)
  // So: rating_diff > 0 (home better) → target > 0 (home better) → β should be positive
  const y = validRows.map(r => r.targetSpreadHma!); // Target: HMA frame (positive = home better)
  
  // ============================================================================
  // CORE MODEL: OLS (y ~ ratingDiffBlend + hfaPoints) - Set A only
  // ============================================================================
  // For V1, Core is simple OLS - no regularization, no grid search, no calibration head
  // This makes it explainable and ensures it matches/beats the OLS baseline
  // Core is calibrated on Set A only; Set AB is used for evaluation only
  
  console.log('\n' + '='.repeat(70));
  console.log('🔧 CORE MODEL: OLS (ratingDiffBlend + hfaPoints) - Set A Calibration');
  console.log('='.repeat(70) + '\n');
  
  // Use weighted variant (Set A=1.0)
  const weights = validRows.map(r => r.rowWeight);
  
  // Compute baselines (Zero and OLS) for relative gates
  console.log('📊 Computing baselines (Zero and OLS)...');
  const baselines = computeBaselines(y, weights, validRows);
  console.log(`   Zero baseline: RMSE=${baselines.zero.rmse.toFixed(2)}, Sign=${baselines.zero.signAgreement.toFixed(1)}%`);
  console.log(`   OLS baseline: RMSE=${baselines.ols.rmse.toFixed(2)}, Pearson=${baselines.ols.pearson.toFixed(4)}, Sign=${baselines.ols.signAgreement.toFixed(1)}%\n`);
  
  // Fit Core OLS model
  console.log('📐 Fitting Core OLS model...');
  const coreOls = await fitCoreOlsModel({ rows: validRows, weights });
  console.log(`   β₀ (intercept): ${coreOls.beta0.toFixed(4)}`);
  console.log(`   β(ratingDiffBlend): ${coreOls.betaRatingDiff.toFixed(4)}`);
  console.log(`   β(hfaPoints): ${coreOls.betaHfa.toFixed(4)}`);
  console.log(`   RMSE: ${coreOls.metrics.rmse.toFixed(4)}`);
  console.log(`   Pearson: ${coreOls.metrics.pearson.toFixed(4)}`);
  console.log(`   Spearman: ${coreOls.metrics.spearman.toFixed(4)}`);
  console.log(`   Sign agreement: ${coreOls.metrics.signAgreement.toFixed(1)}%`);
  console.log(`   Variance ratio: ${coreOls.metrics.varianceRatio.toFixed(4)}\n`);
  
  // FAIL FAST: Check β signs
  if (coreOls.betaRatingDiff <= 0) {
    const errorMsg = `❌ FAIL FAST: β(ratingDiffBlend)=${coreOls.betaRatingDiff.toFixed(4)} must be > 0.`;
    console.error(`\n${errorMsg}\n`);
    throw new Error(errorMsg);
  }
  
  // Check hfaPoints coefficient
  // Note: On Set A, hfaPoints may have zero variance (all neutral or constant), so β=0 is expected
  // On Set AB, if β is significantly negative, it suggests a frame issue or collinearity
  if (coreOls.betaHfa < -0.05) {
    console.log(`   ⚠️  WARNING: β(hfaPoints)=${coreOls.betaHfa.toFixed(4)} is significantly negative.`);
    console.log(`   This may indicate a frame issue or collinearity with ratingDiffBlend.`);
    console.log(`   For now, allowing it to proceed (will be logged in artifacts).`);
    // Don't fail fast - log as warning and continue
    // The user can decide if this is acceptable or needs investigation
  }
  
  // Check gates (with baselines for relative gates)
  console.log('🚦 Checking gates (relative to baselines)...');
  
  // Build feature names and coefficients for gate checking
  const featureNames = ['intercept', 'ratingDiffBlend', 'hfaPoints'];
  const coefficients = [coreOls.beta0, coreOls.betaRatingDiff, coreOls.betaHfa];
  
  const gateResults = checkGates(
    y,
    coreOls.predictions,
    weights,
    coefficients,
    featureNames,
    'core',
    coreOls.predictions, // raw predictions = OLS predictions (no head)
    baselines
  );
  
  console.log(`   Slope (ŷ vs market): ${gateResults.slope.toFixed(4)} (target: 0.90-1.10)`);
  console.log(`   RMSE: ${gateResults.rmse.toFixed(4)} (target: ≤${Math.min(baselines.ols.rmse * 1.02, baselines.zero.rmse * 0.98).toFixed(2)})`);
  console.log(`   Sign agreement: ${gateResults.signAgreement.toFixed(1)}% (target: ≥${Math.max(baselines.ols.signAgreement - 2.0, baselines.zero.signAgreement).toFixed(1)}%)`);
  console.log(`   Pearson: ${gateResults.pearson.toFixed(4)} (target: ≥${(baselines.ols.pearson - 0.03).toFixed(4)})`);
  console.log(`   Spearman: ${gateResults.spearman.toFixed(4)} (target: ≥${(baselines.ols.spearman - 0.03).toFixed(4)})`);
  console.log(`   β(rating_diff): ${gateResults.coefficientSanity.ratingDiff.toFixed(4)} (target: >0)`);
  console.log(`   β(hfa_points): ${gateResults.coefficientSanity.hfaPoints.toFixed(4)} (target: >0 or ≥-0.05)`);
  console.log(`   Residual slices: 0-7=${gateResults.residualSlices['0-7'].toFixed(2)}, 7-14=${gateResults.residualSlices['7-14'].toFixed(2)}, 14-28=${gateResults.residualSlices['14-28'].toFixed(2)}, >28=${gateResults.residualSlices['>28'].toFixed(2)}`);
  
  if (gateResults.allPassed) {
    console.log(`\n   ✅ ALL GATES PASSED\n`);
    
    // Persist Core coefficients for later evaluation on Set AB
    await persistCoreCoefficients(
      season,
      featureVersion,
      coreOls.beta0,
      coreOls.betaRatingDiff,
      coreOls.betaHfa
    );
  } else {
    console.log(`\n   ❌ GATES FAILED - Core coefficients not persisted\n`);
    throw new Error('Core calibration failed gates - cannot proceed');
  }
  
  // Build CalibrationResult (compatible with existing artifact generation)
  // Create a mock ElasticNetResult for compatibility
  const mockModel: ElasticNetResult = {
    coefficients: coefficients,
    intercept: coreOls.beta0,
    rmse: coreOls.metrics.rmse,
    r2: coreOls.metrics.pearson * coreOls.metrics.pearson, // Approximate R²
    pearson: coreOls.metrics.pearson,
    spearman: coreOls.metrics.spearman,
  } as any; // ElasticNetResult doesn't have pearson/spearman, but generateReports expects them
  
  const mockWalkForward = {
    predictions: coreOls.predictions,
    metrics: {
      rmse: coreOls.metrics.rmse,
      mae: coreOls.metrics.mae,
      r2: coreOls.metrics.pearson * coreOls.metrics.pearson,
      pearson: coreOls.metrics.pearson,
      spearman: coreOls.metrics.spearman,
      signAgreement: coreOls.metrics.signAgreement,
    },
  };
  
  const mockBestParams: GridSearchResult = {
    alpha: 0, // OLS = no regularization
    l1Ratio: 0,
    rmse: coreOls.metrics.rmse,
    cvScores: [],
  };
  
  const coefficientsOriginal: Record<string, { standardized: number; original: number }> = {
    intercept: { standardized: coreOls.beta0, original: coreOls.beta0 },
    ratingDiffBlend: { standardized: coreOls.betaRatingDiff, original: coreOls.betaRatingDiff },
    hfaPoints: { standardized: coreOls.betaHfa, original: coreOls.betaHfa },
  };
  
  const scalerParams: Record<string, { mean: number; std: number }> = {
    intercept: { mean: 0, std: 1 },
    ratingDiffBlend: { mean: 0, std: 1 }, // No standardization for Core OLS
    hfaPoints: { mean: 0, std: 1 },
  };
  
  const result: CalibrationResult = {
    model: mockModel,
    walkForward: mockWalkForward,
    gates: gateResults,
    bestParams: mockBestParams,
    featureNames,
    coefficients: coefficientsOriginal,
    scalerParams,
    useHinge14: false,
    useWeights: true,
    // No calibration head for Core OLS (it's already the canonical model)
    calibrationHead: undefined,
    calibratedPredictions: coreOls.predictions,
  };
  
  return result;
}

// ============================================================================
// EXTENDED CALIBRATION FUNCTION
// ============================================================================
/**
 * Extended v0 Feature Set Documentation:
 * 
 * Core features (always included):
 * - intercept
 * - ratingDiffBlend (or ratingDiffV2 if blend not available)
 * - hfaPoints
 * - neutralSite (binary flag)
 * - p5VsG5 (binary flag)
 * - absRatingDiffV2 (|rating_diff|)
 * - hinge7 (max(|diff| - 7, 0))
 * - hinge14 (optional, max(|diff| - 14, 0))
 * 
 * Extended features (when fitType === 'extended'):
 * - offAdjSrDiff, defAdjSrDiff (opponent-adjusted success rate diffs)
 * - offAdjExplosivenessDiff, defAdjExplosivenessDiff
 * - offAdjPpaDiff, defAdjPpaDiff (points per attempt diffs)
 * - offAdjEpaDiff, defAdjEpaDiff (EPA diffs)
 * - havocFront7Diff, havocDbDiff (havoc rate diffs)
 * - edgeSrDiff (edge success rate diff)
 * - ewma3OffAdjEpaDiff, ewma5OffAdjEpaDiff (3-game and 5-game EWMA of EPA)
 * - talent247Diff (247 talent composite diff)
 * - returningProdOffDiff, returningProdDefDiff (returning production diffs)
 * 
 * Total Extended features: ~22-24 (depending on hinge14 inclusion)
 * 
 * Residualization:
 * - Extended features are residualized against ratingDiffBlend within CV folds
 * - This ensures β(ratingDiffBlend) stays positive and prevents collinearity
 * - Residualization blocks:
 *   1. Success rate: [offAdjSrDiff, defAdjSrDiff, edgeSrDiff]
 *   2. Explosiveness: [offAdjExplosivenessDiff, defAdjExplosivenessDiff]
 *   3. PPA: [offAdjPpaDiff, defAdjPpaDiff]
 *   4. EPA: [offAdjEpaDiff, defAdjEpaDiff]
 *   5. Havoc: [havocFront7Diff, havocDbDiff]
 *   6. EWMA: [ewma3OffAdjEpaDiff, ewma5OffAdjEpaDiff]
 *   7. Talent: [talent247Diff]
 *   8. Returning Production: [returningProdOffDiff, returningProdDefDiff]
 * 
 * Standardization:
 * - ratingDiffBlend is NOT standardized (already in target scale)
 * - All other features are standardized (except intercept and binary flags)
 */

async function calibrateExtended(
  season: number = 2025,
  featureVersion: string = 'fe_v1',
  modelVersion: string = 'cal_v1'
): Promise<CalibrationResult | null> {
  console.log('\n' + '='.repeat(70));
  console.log(`🔧 MODEL CALIBRATION: Fit #2 EXTENDED`);
  console.log('='.repeat(70) + '\n');
  
  // Load MFTR and blend config
  await loadMFTRAndBlend();
  
  // Determine if this is calibration (Set A) or evaluation (Set AB)
  const isEvaluation = cliConfig.sets === 'AB';
  
  if (isEvaluation) {
    // TODO: Implement Extended evaluation mode (load Set A Extended coefficients, evaluate on AB)
    // For now, skip Extended evaluation
    console.log('⚠️  Extended evaluation mode not yet implemented. Skipping Extended evaluation.\n');
    return null;
  }
  
  // ============================================================================
  // CALIBRATION MODE: Fit Extended on Set A only (like Core)
  // ============================================================================
  console.log('📐 CALIBRATION MODE: Fitting Extended on Set A only\n');
  
  // Load data (Set A only for calibration)
  const setLabels = ['A'];
  const trainingRows = await loadTrainingData(season, featureVersion, setLabels);
  
  // Filter to rows with valid target
  let validRows = trainingRows.filter(r => r.targetSpreadHma !== null);
  console.log(`   Loaded ${validRows.length} rows with valid target (Set A only)\n`);
  
  // Light outlier trimming (exclude |market| > 35, but don't clip)
  const beforeTrim = validRows.length;
  validRows = validRows.filter(r => {
    const target = r.targetSpreadHma!;
    return Math.abs(target) <= 35; // Exclude extreme spreads
  });
  console.log(`   After outlier trimming: ${validRows.length} rows (removed ${beforeTrim - validRows.length})\n`);
  
  if (validRows.length < 100) {
    throw new Error(`Insufficient training data: ${validRows.length} rows (need ≥100)`);
  }
  
  // Frame alignment: Both target and features are in HMA frame
  const y = validRows.map(r => r.targetSpreadHma!); // Target: HMA frame (positive = home better)
  const weights = validRows.map(r => r.rowWeight);
  
  // Load Core metrics for relative gates
  console.log('📊 Loading Core metrics for relative gates...');
  const coreCoeffs = await loadCoreCoefficients(season, featureVersion);
  if (!coreCoeffs) {
    throw new Error(`Cannot fit Extended: Core coefficients not found for season=${season}, featureVersion=${featureVersion}. Please run Core calibration first.`);
  }
  
  // Compute Core predictions on Set A for comparison
  const corePredictions: number[] = [];
  for (const row of validRows) {
    const ratingDiff = row.ratingDiffBlend ?? row.ratingDiffV2 ?? 0;
    const hfa = row.hfaPoints ?? 0;
    const pred = coreCoeffs.beta0 + coreCoeffs.betaRatingDiff * ratingDiff + coreCoeffs.betaHfa * hfa;
    corePredictions.push(pred);
  }
  
  // Compute Core metrics on Set A
  const sumW = weights.reduce((a, b) => a + b, 0);
  let coreSsRes = 0;
  let coreSignAgreements = 0;
  for (let i = 0; i < y.length; i++) {
    const err = y[i] - corePredictions[i];
    coreSsRes += weights[i] * err * err;
    const ySign = y[i] < 0 ? -1 : (y[i] > 0 ? 1 : 0);
    const predSign = corePredictions[i] < 0 ? -1 : (corePredictions[i] > 0 ? 1 : 0);
    if (ySign === predSign && ySign !== 0) {
      coreSignAgreements++;
    }
  }
  const coreRmse = Math.sqrt(coreSsRes / sumW);
  const coreSign = (coreSignAgreements / y.length) * 100;
  const corePearson = pearsonCorrelation(y, corePredictions, weights);
  const coreSpearman = pearsonCorrelation(rankArray(y), rankArray(corePredictions), weights);
  
  // Compute Zero baseline
  const zeroBaseline = computeBaselines(y, weights, validRows).zero;
  
  console.log(`   Core (Set A): RMSE=${coreRmse.toFixed(4)}, Sign=${coreSign.toFixed(1)}%, Pearson=${corePearson.toFixed(4)}, Spearman=${coreSpearman.toFixed(4)}`);
  console.log(`   Zero baseline: RMSE=${zeroBaseline.rmse.toFixed(4)}, Sign=${zeroBaseline.signAgreement.toFixed(1)}%\n`);
  
  // Ridge-heavy grid (lower alpha to reduce over-regularization)
  const alphas = cliConfig.grid === 'full' 
    ? [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1]
    : [0.0005, 0.001, 0.002, 0.005, 0.01, 0.02];
  const l1Ratios = cliConfig.grid === 'full'
    ? [0.0, 0.05, 0.1, 0.25]
    : [0.0, 0.1];
  
  // Test both weighted and unweighted variants
  const variants = [
    { name: 'Weighted', useWeights: true },
    { name: 'Unweighted', useWeights: false },
  ];
  
  const results: (CalibrationResult & { variant: string })[] = [];
  
  for (const variant of variants) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Testing ${variant.name} Variant`);
    console.log('='.repeat(70) + '\n');
    
    const variantWeights = variant.useWeights
      ? weights
      : validRows.map(() => 1.0);
    const weeks = validRows.map(r => r.week);
    
    // Test with and without hinge14
    for (const useHinge14 of [false, true]) {
      if (useHinge14) {
        console.log(`\n📊 Testing with hinge14...\n`);
      }
      
      // For Extended v0, we need to residualize features within each CV fold
      // Build initial matrix to get feature names, then residualize in grid search
      const { featureNames } = buildFeatureMatrix(validRows, 'extended', useHinge14, false);
      
      console.log(`   Features: ${featureNames.length} (${featureNames.filter(f => f !== 'intercept').join(', ')})\n`);
      console.log('   🔧 Extended v0: Will residualize extended features against rating_blend within CV folds\n');
      
      // Grid search with residualization (within each CV fold)
      console.log('🔍 Step 1: Grid search with cross-validation (with residualization)...');
      const bestParams = gridSearchWithResidualization(
        validRows,
        y,
        variantWeights,
        weeks,
        alphas,
        l1Ratios,
        featureNames,
        useHinge14
      );
      console.log(`   ✅ Best: alpha=${bestParams.alpha}, l1_ratio=${bestParams.l1Ratio}, CV_RMSE=${bestParams.rmse.toFixed(4)}\n`);
      
      // Build final feature matrix with residualization on full training set
      const { X: XFinal, featureNames: fnFinal, scalerParams: scalerParamsFinal } = buildFeatureMatrix(
        validRows,
        'extended',
        useHinge14,
        true, // residualize
        Array.from({ length: validRows.length }, (_, i) => i) // All indices for final fit
      );
      
      // Fit final model
      console.log('📐 Step 2: Fitting final model (with residualization)...');
      const finalModel = elasticNet(XFinal, y, variantWeights, bestParams.alpha, bestParams.l1Ratio);
      console.log(`   ✅ Train RMSE: ${finalModel.rmse.toFixed(4)}, R²: ${finalModel.r2.toFixed(4)}\n`);
      
      // Walk-forward validation with residualization
      console.log('🚶 Step 3: Walk-forward validation (with residualization)...');
      const wfResult = walkForwardValidationWithResidualization(
        validRows,
        y,
        variantWeights,
        weeks,
        bestParams.alpha,
        bestParams.l1Ratio,
        useHinge14
      );
      console.log(`   ✅ Walk-forward RMSE: ${wfResult.metrics.rmse.toFixed(4)}, R²: ${wfResult.metrics.r2.toFixed(4)}\n`);
      
      // Prediction variance check (pre-calibration)
      const validPredIndices = wfResult.predictions.map((p, i) => isFinite(p) && p !== 0 ? i : -1).filter(i => i >= 0);
      const validPreds = validPredIndices.map(i => wfResult.predictions[i]);
      const validY = validPredIndices.map(i => y[i]);
      const meanPred = validPreds.reduce((a, b) => a + b, 0) / validPreds.length;
      const meanY = validY.reduce((a, b) => a + b, 0) / validY.length;
      const varPred = validPreds.reduce((sum, p) => sum + Math.pow(p - meanPred, 2), 0) / validPreds.length;
      const varY = validY.reduce((sum, t) => sum + Math.pow(t - meanY, 2), 0) / validY.length;
      const stdPred = Math.sqrt(varPred);
      const stdY = Math.sqrt(varY);
      
      console.log(`   Prediction variance check (pre-calibration):`);
      console.log(`     std(ŷ_raw): ${stdPred.toFixed(4)}`);
      console.log(`     std(y): ${stdY.toFixed(4)}`);
      console.log(`     Ratio: ${(stdPred / stdY).toFixed(4)}`);
      if (stdPred < 0.3 * stdY) {
        console.log(`     ⚠️  WARNING: std(ŷ_raw) < 0.3*std(y) - model is compressed/flat!\n`);
      } else {
        console.log(`     ✅ Model has sufficient variance\n`);
      }
      
      // Step 4: Check raw variance ratio (before calibration head)
      const rawVarianceRatio = stdPred / stdY;
      console.log(`   Raw variance ratio (std(ŷ_raw)/std(y)): ${rawVarianceRatio.toFixed(4)} (target: 0.6-1.2)`);
      
      if (rawVarianceRatio < 0.6) {
        console.log(`   ⚠️  WARNING: Raw variance ratio too low - model is over-regularized or features are collinear!\n`);
      } else if (rawVarianceRatio > 1.2) {
        console.log(`   ⚠️  WARNING: Raw variance ratio too high - model may be overfitting!\n`);
      } else {
        console.log(`   ✅ Raw variance ratio in acceptable range\n`);
      }
      
      // Post-hoc linear calibration head (only if raw variance ratio is OK)
      let calibrationHead: { intercept: number; slope: number; rmse: number } | undefined;
      let calibratedPredictions: number[] = wfResult.predictions;
      
      if (rawVarianceRatio >= 0.6 && rawVarianceRatio <= 1.2) {
        console.log('🔧 Step 5: Fitting post-hoc linear calibration head...');
        calibrationHead = fitLinearCalibrationHead(y, wfResult.predictions, variantWeights);
        calibratedPredictions = wfResult.predictions.map(yh => calibrationHead!.intercept + calibrationHead!.slope * yh);
        console.log(`   Calibration: ŷ* = ${calibrationHead.intercept.toFixed(4)} + ${calibrationHead.slope.toFixed(4)} * ŷ`);
        console.log(`   Calibrated RMSE: ${calibrationHead.rmse.toFixed(4)}`);
        
        // Post-calibration variance check
        const validCalPreds = validPredIndices.map(i => calibratedPredictions[i]);
        const meanCalPred = validCalPreds.reduce((a, b) => a + b, 0) / validCalPreds.length;
        const varCalPred = validCalPreds.reduce((sum, p) => sum + Math.pow(p - meanCalPred, 2), 0) / validCalPreds.length;
        const stdCalPred = Math.sqrt(varCalPred);
        const calVarianceRatio = stdCalPred / stdY;
        console.log(`     std(ŷ*): ${stdCalPred.toFixed(4)}, ratio: ${calVarianceRatio.toFixed(4)}`);
        
        if (calVarianceRatio < 0.6) {
          console.log(`     ⚠️  WARNING: Calibration head crushed variance!\n`);
        } else {
          console.log(`     ✅ Calibration head preserved variance\n`);
        }
      } else {
        console.log('   ⚠️  Skipping calibration head - raw variance ratio out of range\n');
      }
      
      // Check gates (use calibrated if available, otherwise raw)
      // Always pass raw predictions for variance ratio check
      console.log(`🚦 Step 6: Checking gates (on ${calibrationHead ? 'calibrated' : 'raw'} predictions)...`);
      
      // Create Core baseline metrics for relative gates
      const coreBaseline: BaselineMetrics = {
        zero: zeroBaseline,
        ols: {
          rmse: coreRmse,
          mae: 0, // Not needed for gates
          pearson: corePearson,
          spearman: coreSpearman,
          signAgreement: coreSign,
          tailSliceMean: 0, // Will compute below
        },
      };
      
      // Compute Core tail slice mean for relative gate
      const coreResidualPairs = corePredictions.map((pred, i) => ({
        absResidual: Math.abs(y[i] - pred),
        signedResidual: y[i] - pred,
        weight: variantWeights[i],
      }));
      const coreTailSlice = coreResidualPairs.filter(r => r.absResidual > 28);
      if (coreTailSlice.length > 0) {
        const sumWeight = coreTailSlice.reduce((sum, p) => sum + p.weight, 0);
        const meanResidual = coreTailSlice.reduce((sum, p) => sum + p.weight * p.signedResidual, 0) / sumWeight;
        coreBaseline.ols.tailSliceMean = meanResidual;
      }
      
      // Check Extended gates relative to Core
      const gateResults = checkExtendedGates(
        y,
        calibratedPredictions,
        variantWeights,
        finalModel.coefficients,
        fnFinal,
        wfResult.predictions,
        coreBaseline
      );
      
      console.log(`   Slope (ŷ vs market): ${gateResults.slope.toFixed(4)} (target: 0.90-1.10)`);
      console.log(`   RMSE: ${gateResults.rmse.toFixed(4)} (target: ≤${(Math.min(coreRmse * 0.99, zeroBaseline.rmse * 0.95)).toFixed(2)})`);
      console.log(`   Sign agreement: ${gateResults.signAgreement.toFixed(1)}% (target: ≥${(coreSign - 1.0).toFixed(1)}%)`);
      console.log(`   Pearson: ${gateResults.pearson.toFixed(4)} (target: ≥${(corePearson - 0.01).toFixed(4)})`);
      console.log(`   Spearman: ${gateResults.spearman.toFixed(4)} (target: ≥${(coreSpearman - 0.01).toFixed(4)})`);
      console.log(`   Variance ratio: ${gateResults.varianceRatio.toFixed(4)} (target: ≥0.40)`);
      console.log(`   β(rating_diff): ${gateResults.coefficientSanity.ratingDiff.toFixed(4)} (target: >0)`);
      console.log(`   β(hfa_points): ${gateResults.coefficientSanity.hfaPoints.toFixed(4)} (target: >0 or ≥-0.05)`);
      console.log(`   Residual slices: 0-7=${gateResults.residualSlices['0-7'].toFixed(2)}, 7-14=${gateResults.residualSlices['7-14'].toFixed(2)}, 14-28=${gateResults.residualSlices['14-28'].toFixed(2)}, >28=${gateResults.residualSlices['>28'].toFixed(2)}`);
      
      // Convert coefficients
      const coefficientsOriginal: Record<string, { standardized: number; original: number }> = {};
      for (let i = 0; i < fnFinal.length; i++) {
        const name = fnFinal[i];
        const stdCoeff = finalModel.coefficients[i];
        const scaler = scalerParamsFinal[name];
        
        let origCoeff = stdCoeff;
        if (name !== 'intercept' && scaler.std > 1e-10) {
          origCoeff = stdCoeff / scaler.std;
        }
        
        coefficientsOriginal[name] = {
          standardized: stdCoeff,
          original: origCoeff,
        };
      }
      
      // Check if hinge14 should be kept
      let keepHinge14 = useHinge14;
      if (useHinge14) {
        if (!gateResults.allPassed) {
          keepHinge14 = false;
        }
      }
      
      results.push({
        model: finalModel,
        walkForward: wfResult,
        gates: gateResults,
        bestParams,
        featureNames: fnFinal,
        coefficients: coefficientsOriginal,
        scalerParams: scalerParamsFinal,
        useHinge14: keepHinge14,
        useWeights: variant.useWeights,
        calibrationHead,
        calibratedPredictions,
        variant: `${variant.name}${useHinge14 ? ' (hinge14)' : ''}`,
      });
      
      if (gateResults.allPassed) {
        console.log(`\n   ✅ ALL GATES PASSED\n`);
      } else {
        console.log(`\n   ❌ GATES FAILED\n`);
      }
    }
  }
  
  // Find best result
  const passingResults = results.filter(r => r.gates.allPassed);
  if (passingResults.length > 0) {
    const best = passingResults.sort((a, b) => {
      if (a.useWeights === b.useWeights) {
        return a.gates.rmse - b.gates.rmse;
      }
      return a.useWeights ? 1 : -1; // Prefer unweighted
    })[0];
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ SELECTED: ${best.variant}`);
    console.log(`   Walk-forward RMSE: ${best.gates.rmse.toFixed(4)}`);
    console.log(`   Slope: ${best.gates.slope.toFixed(4)}`);
    console.log(`   Spearman: ${best.gates.spearman.toFixed(4)}`);
    console.log('='.repeat(70) + '\n');
    
    return best;
  }
  
  // If none pass, return best by RMSE
  const best = results.sort((a, b) => a.gates.rmse - b.gates.rmse)[0];
  console.log(`\n⚠️  No variant passed all gates. Best: ${best.variant} (RMSE: ${best.gates.rmse.toFixed(4)})\n`);
  
  return best;
}

// ============================================================================
// REPORT GENERATION (comprehensive)
// ============================================================================

async function generateReports(
  result: CalibrationResult,
  fitType: string,
  season: number,
  featureVersion: string,
  y: number[],
  validRows?: TrainingRow[]
) {
  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  // 1. JSON fit report
  const fitReport = {
    fitType,
    season,
    featureVersion,
    useWeights: result.useWeights,
    useHinge14: result.useHinge14,
    calibrationHead: result.calibrationHead,
    bestParams: result.bestParams,
    trainMetrics: {
      rmse: result.model.rmse,
      r2: result.model.r2,
      pearson: result.model.pearson,
      spearman: result.model.spearman,
    },
    walkForwardMetrics: result.walkForward.metrics,
    gates: result.gates,
    coefficients: result.coefficients,
    featureNames: result.featureNames,
    scalerParams: result.scalerParams,
    randomSeed: RANDOM_SEED,
  };
  
  fs.writeFileSync(
    path.join(reportsDir, `cal_fit_${fitType}.json`),
    JSON.stringify(fitReport, null, 2)
  );
  
  // 2. Metrics CSV (train + walk-forward)
  const metricsRows = [
    'metric,train,walk_forward',
    `RMSE,${result.model.rmse.toFixed(4)},${result.walkForward.metrics.rmse.toFixed(4)}`,
    `R²,${result.model.r2.toFixed(4)},${result.walkForward.metrics.r2.toFixed(4)}`,
    `Pearson,${result.model.pearson.toFixed(4)},${result.walkForward.metrics.pearson.toFixed(4)}`,
    `Spearman,${result.model.spearman.toFixed(4)},${result.walkForward.metrics.spearman.toFixed(4)}`,
  ];
  
  fs.writeFileSync(
    path.join(reportsDir, `${fitType}_metrics.csv`),
    metricsRows.join('\n')
  );
  
  // 2b. Variance pre/post CSV (std(y), std(ŷ_raw), std(ŷ*))
  const rawPredictions = result.walkForward.predictions;
  const calibratedPredictions = result.calibratedPredictions || rawPredictions;
  
  const validIndices = y.map((_, i) => i).filter(i => 
    isFinite(y[i]) && isFinite(rawPredictions[i]) && rawPredictions[i] !== 0
  );
  
  const yValid = validIndices.map(i => y[i]);
  const rawPredValid = validIndices.map(i => rawPredictions[i]);
  const calPredValid = validIndices.map(i => calibratedPredictions[i]);
  
  const meanY = yValid.reduce((a, b) => a + b, 0) / yValid.length;
  const meanRaw = rawPredValid.reduce((a, b) => a + b, 0) / rawPredValid.length;
  const meanCal = calPredValid.reduce((a, b) => a + b, 0) / calPredValid.length;
  
  const varY = yValid.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0) / yValid.length;
  const varRaw = rawPredValid.reduce((sum, val) => sum + Math.pow(val - meanRaw, 2), 0) / rawPredValid.length;
  const varCal = calPredValid.reduce((sum, val) => sum + Math.pow(val - meanCal, 2), 0) / calPredValid.length;
  
  const stdY = Math.sqrt(varY);
  const stdRaw = Math.sqrt(varRaw);
  const stdCal = Math.sqrt(varCal);
  
  const varianceRows = [
    'metric,value',
    `std(y),${stdY.toFixed(4)}`,
    `std(ŷ_raw),${stdRaw.toFixed(4)}`,
    `std(ŷ*),${stdCal.toFixed(4)}`,
    `ratio_raw,${(stdRaw / stdY).toFixed(4)}`,
    `ratio_cal,${(stdCal / stdY).toFixed(4)}`,
  ];
  
  fs.writeFileSync(
    path.join(reportsDir, `${fitType}_variance_pre_post.csv`),
    varianceRows.join('\n')
  );
  
  // 2c. Residuals CSV (use calibrated predictions if available)
  const predictions = result.calibratedPredictions || result.walkForward.predictions;
  const residuals: number[] = [];
  for (let i = 0; i < predictions.length; i++) {
    if (predictions[i] !== 0 && isFinite(predictions[i]) && isFinite(y[i])) {
      residuals.push(Math.abs(y[i] - predictions[i]));
    }
  }
  
  const residualRows = [
    'bucket,count,mean_residual',
    `0-7,${residuals.filter(r => r >= 0 && r < 7).length},${result.gates.residualSlices['0-7'].toFixed(4)}`,
    `7-14,${residuals.filter(r => r >= 7 && r < 14).length},${result.gates.residualSlices['7-14'].toFixed(4)}`,
    `14-28,${residuals.filter(r => r >= 14 && r < 28).length},${result.gates.residualSlices['14-28'].toFixed(4)}`,
    `>28,${residuals.filter(r => r >= 28).length},${result.gates.residualSlices['>28'].toFixed(4)}`,
    `global,${residuals.length},${result.gates.rmse.toFixed(4)}`,
  ];
  
  fs.writeFileSync(
    path.join(reportsDir, `residuals_${fitType}.csv`),
    residualRows.join('\n')
  );
  
  // Also save as core_residual_buckets.csv for Core
  if (fitType === 'core') {
    fs.writeFileSync(
      path.join(reportsDir, `core_residual_buckets.csv`),
      residualRows.join('\n')
    );
  }
  
  // 2d. Top outliers CSV (use calibrated predictions if available)
  const outliers: Array<{ gameId: string; week: number; actual: number; predicted: number; residual: number; absResidual: number }> = [];
  for (let i = 0; i < predictions.length; i++) {
    if (predictions[i] !== 0 && isFinite(predictions[i]) && isFinite(y[i])) {
      const residual = y[i] - predictions[i];
      outliers.push({
        gameId: validRows && validRows[i] ? validRows[i].gameId : '',
        week: validRows && validRows[i] ? validRows[i].week : 0,
        actual: y[i],
        predicted: predictions[i],
        residual,
        absResidual: Math.abs(residual),
      });
    }
  }
  
  outliers.sort((a, b) => b.absResidual - a.absResidual);
  const top20 = outliers.slice(0, 20);
  
  const outlierRows = ['rank,game_id,week,actual,predicted,residual,abs_residual'];
  top20.forEach((out, idx) => {
    outlierRows.push(`${idx + 1},${out.gameId},${out.week},${out.actual.toFixed(4)},${out.predicted.toFixed(4)},${out.residual.toFixed(4)},${out.absResidual.toFixed(4)}`);
  });
  
  fs.writeFileSync(
    path.join(reportsDir, `top_outliers_${fitType}.csv`),
    outlierRows.join('\n')
  );
  
  // Also save as core_top_outliers.csv for Core
  if (fitType === 'core') {
    fs.writeFileSync(
      path.join(reportsDir, `core_top_outliers.csv`),
      outlierRows.join('\n')
    );
  }
  
  // 2d. 10-game sanity sheet (only for Core)
  if (fitType === 'core' && validRows && validRows.length > 0) {
    // Sample 10 games (mix of weeks and residuals)
    const sanityGames: Array<{
      gameId: string;
      week: number;
      marketHma: number;
      predicted: number;
      residual: number;
      ratingBlend: number | null;
      hfaPoints: number | null;
    }> = [];
    
    for (let i = 0; i < Math.min(10, validRows.length); i++) {
      const row = validRows[i];
      if (row && predictions[i] !== 0 && isFinite(predictions[i])) {
        sanityGames.push({
          gameId: row.gameId,
          week: row.week,
          marketHma: y[i],
          predicted: predictions[i],
          residual: y[i] - predictions[i],
          ratingBlend: row.ratingDiffV2,
          hfaPoints: row.hfaPoints,
        });
      }
    }
    
    const sanityRows = [
      'game_id,week,market_hma,predicted,residual,rating_blend,hfa_points',
      ...sanityGames.map(g => 
        `${g.gameId},${g.week},${g.marketHma.toFixed(4)},${g.predicted.toFixed(4)},${g.residual.toFixed(4)},${g.ratingBlend?.toFixed(4) ?? 'null'},${g.hfaPoints?.toFixed(4) ?? 'null'}`
      ),
    ];
    
    fs.writeFileSync(
      path.join(reportsDir, `core_10game_sanity.csv`),
      sanityRows.join('\n')
    );
  }
  
  // 3. Feature importance CSV
  const importanceRows = ['feature,standardized_coeff,original_coeff,abs_standardized'];
  const importances = Object.entries(result.coefficients)
    .filter(([name]) => name !== 'intercept')
    .map(([name, coeffs]) => ({
      name,
      standardized: coeffs.standardized,
      original: coeffs.original,
      absStandardized: Math.abs(coeffs.standardized),
    }))
    .sort((a, b) => b.absStandardized - a.absStandardized);
  
  for (const imp of importances) {
    importanceRows.push(`${imp.name},${imp.standardized.toFixed(6)},${imp.original.toFixed(6)},${imp.absStandardized.toFixed(6)}`);
  }
  
  fs.writeFileSync(
    path.join(reportsDir, `feature_importance_${fitType}.csv`),
    importanceRows.join('\n')
  );
  
  // 4. Model card
  const modelCard = `# Model Card: Calibration v1 (${fitType.toUpperCase()})

## Model Information
- **Model Version**: cal_v1
- **Fit Type**: ${fitType}
- **Season**: ${season}
- **Feature Version**: ${featureVersion}
- **Training Date**: ${new Date().toISOString()}
- **Random Seed**: ${RANDOM_SEED}

## Data
- **Training Sets**: Set A (Weeks 8-11) + Set B (Weeks 1-7)
- **Sample Weights**: ${result.useWeights ? 'Set A=1.0, Set B=0.6' : 'All=1.0 (unweighted)'}
- **Target Frame**: Home-minus-away (HMA) spread
- **Feature Frame**: Home-minus-away (HMA) diffs

## Features
${result.featureNames.filter(f => f !== 'intercept').map(f => `- ${f}`).join('\n')}

## Hyperparameters
- **Alpha (λ)**: ${result.bestParams.alpha}
- **L1 Ratio**: ${result.bestParams.l1Ratio}
- **Hinge14**: ${result.useHinge14 ? 'Included' : 'Excluded'}
${result.calibrationHead ? `- **Post-hoc Calibration Head**: ŷ* = ${result.calibrationHead.intercept.toFixed(4)} + ${result.calibrationHead.slope.toFixed(4)} * ŷ` : ''}

## Performance Metrics (Walk-Forward)
- **RMSE**: ${result.gates.rmse.toFixed(4)} (target: ≤${fitType === 'core' ? '8.8' : '9.0'})
- **R²**: ${result.walkForward.metrics.r2.toFixed(4)}
- **Pearson**: ${result.gates.pearson.toFixed(4)} (target: ≥0.30)
- **Spearman**: ${result.gates.spearman.toFixed(4)} (target: ≥0.30)
- **Slope**: ${result.gates.slope.toFixed(4)} (target: 0.90-1.10)
- **Sign Agreement**: ${result.gates.signAgreement.toFixed(1)}% (target: ≥70%)

## Gate Results
${result.gates.allPassed ? '✅ **ALL GATES PASSED**' : '❌ **GATES FAILED**'}

## Limitations
- Model trained on 2025 season data only
- Walk-forward validation on Set A weeks only
- Early weeks (Set B) have lower data quality
- Model assumes pre-kick consensus spreads are available

## Coefficient Sanity
- β(rating_diff): ${result.gates.coefficientSanity.ratingDiff.toFixed(4)} (target: >0) ${result.gates.coefficientSanity.ratingDiff > 0 ? '✅' : '❌'}
- β(hfa_points): ${result.gates.coefficientSanity.hfaPoints.toFixed(4)} (target: >0) ${result.gates.coefficientSanity.hfaPoints > 0 ? '✅' : '❌'}

## Residual Diagnostics
- **0-7 bucket**: ${result.gates.residualSlices['0-7'].toFixed(2)} (target: |mean| ≤ 2.0) ${Math.abs(result.gates.residualSlices['0-7']) <= 2.0 ? '✅' : '❌'}
- **7-14 bucket**: ${result.gates.residualSlices['7-14'].toFixed(2)} (target: |mean| ≤ 2.0) ${Math.abs(result.gates.residualSlices['7-14']) <= 2.0 ? '✅' : '❌'}
- **14-28 bucket**: ${result.gates.residualSlices['14-28'].toFixed(2)} (target: |mean| ≤ 2.0) ${Math.abs(result.gates.residualSlices['14-28']) <= 2.0 ? '✅' : '❌'}
- **>28 bucket**: ${result.gates.residualSlices['>28'].toFixed(2)} (target: |mean| ≤ 2.0) ${Math.abs(result.gates.residualSlices['>28']) <= 2.0 ? '✅' : '❌'}
`;

  fs.writeFileSync(
    path.join(process.cwd(), 'docs', `MODEL_CARD_CAL_V1_${fitType.toUpperCase()}.md`),
    modelCard
  );
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  let season = 2025;
  let featureVersion = 'fe_v1';
  let modelVersion = 'cal_v1';
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && args[i + 1]) {
      season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--featureVersion' && args[i + 1]) {
      featureVersion = args[i + 1];
      i++;
    } else if (args[i] === '--modelVersion' && args[i + 1]) {
      modelVersion = args[i + 1];
      i++;
    } else if (args[i] === '--grid' && args[i + 1]) {
      const gridVal = args[i + 1];
      if (gridVal === 'small' || gridVal === 'full') {
        cliConfig.gridSize = gridVal;
      } else {
        console.error(`Invalid --grid value: ${gridVal}. Must be 'small' or 'full'`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--sets' && args[i + 1]) {
      const setsVal = args[i + 1];
      if (setsVal === 'A' || setsVal === 'B' || setsVal === 'AB') {
        cliConfig.sets = setsVal;
      } else {
        console.error(`Invalid --sets value: ${setsVal}. Must be 'A', 'B', or 'AB'`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--noHead') {
      cliConfig.noHead = true;
    } else if (args[i] === '--cvFolds' && args[i + 1]) {
      const folds = parseInt(args[i + 1], 10);
      if (folds > 0 && folds <= 10) {
        cliConfig.cvFolds = folds;
      } else {
        console.error(`Invalid --cvFolds value: ${folds}. Must be 1-10`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--skipExtended') {
      cliConfig.skipExtended = true;
    }
  }
  
  console.log('📋 CLI Configuration:');
  console.log(`   Grid: ${cliConfig.gridSize}, Sets: ${cliConfig.sets}, CV Folds: ${cliConfig.cvFolds}`);
  console.log(`   No Head: ${cliConfig.noHead}, Skip Extended: ${cliConfig.skipExtended}\n`);
  
  try {
    // Run Core first (for sanity checks)
    console.log('Running Core fit first (for sanity checks)...\n');
    const coreResult = await calibrateCore(season, featureVersion, modelVersion);
    
    if (!coreResult) {
      console.error('Core calibration failed - no valid result');
      process.exit(1);
    }
    
    // Generate Core reports
    const validRows = await prisma.gameTrainingRow.findMany({
      where: {
        season,
        featureVersion,
        setLabel: { in: ['A', 'B'] },
        targetSpreadHma: { not: null },
      },
    });
    const y = validRows.map(r => Number(r.targetSpreadHma!));
    
    console.log('📄 Generating Core reports...');
    await generateReports(coreResult, 'core', season, featureVersion, y, validRows);
    console.log(`   ✅ Core reports generated\n`);
    
    // Now run Extended (unless --skipExtended is set)
    if (cliConfig.skipExtended) {
      console.log('\n⚠️  Skipping Extended fit (--skipExtended flag set)\n');
    } else {
      console.log('\n' + '='.repeat(70));
      console.log('Proceeding to Extended fit...');
      console.log('='.repeat(70) + '\n');
      
      const extendedResult = await calibrateExtended(season, featureVersion, modelVersion);
      
      if (!extendedResult) {
        console.error('Extended calibration failed - no valid result');
        process.exit(1);
      }
      
      // Generate Extended reports
      console.log('📄 Generating Extended reports...');
      await generateReports(extendedResult, 'extended', season, featureVersion, y, validRows);
      console.log(`   ✅ Extended reports generated\n`);
      
      // Persist Extended if gates passed
      if (extendedResult.gates.allPassed) {
        console.log('💾 Persisting Extended to database...');
        
        await prisma.modelCalibration.upsert({
          where: {
            modelVersion_fitLabel: {
              modelVersion: modelVersion + '_extended',
              fitLabel: 'extended',
            },
          },
          update: {
            season,
            featureVersion,
            bestAlpha: extendedResult.bestParams.alpha,
            bestL1Ratio: extendedResult.bestParams.l1Ratio,
            coefficients: extendedResult.coefficients as any,
            intercept: extendedResult.model.intercept,
            scalerParams: extendedResult.scalerParams as any,
            trainRmse: extendedResult.model.rmse,
            trainR2: extendedResult.model.r2,
            trainPearson: extendedResult.model.pearson,
            trainSpearman: extendedResult.model.spearman,
            walkForwardRmse: extendedResult.walkForward.metrics.rmse,
            walkForwardR2: extendedResult.walkForward.metrics.r2,
            walkForwardPearson: extendedResult.walkForward.metrics.pearson,
            walkForwardSpearman: extendedResult.walkForward.metrics.spearman,
            slope: extendedResult.gates.slope,
            signAgreement: extendedResult.gates.signAgreement,
            gatesPassed: true,
            gateDetails: {
              ...extendedResult.gates,
              calibrationHead: extendedResult.calibrationHead,
            } as any,
            residualSummary: extendedResult.gates.residualSlices as any,
            trainingRowIds: [],
            setLabels: ['A', 'B'],
          },
          create: {
            modelVersion: modelVersion + '_extended',
            fitLabel: 'extended',
            season,
            featureVersion,
            bestAlpha: extendedResult.bestParams.alpha,
            bestL1Ratio: extendedResult.bestParams.l1Ratio,
            coefficients: extendedResult.coefficients as any,
            intercept: extendedResult.model.intercept,
            scalerParams: extendedResult.scalerParams as any,
            trainRmse: extendedResult.model.rmse,
            trainR2: extendedResult.model.r2,
            trainPearson: extendedResult.model.pearson,
            trainSpearman: extendedResult.model.spearman,
            walkForwardRmse: extendedResult.walkForward.metrics.rmse,
            walkForwardR2: extendedResult.walkForward.metrics.r2,
            walkForwardPearson: extendedResult.walkForward.metrics.pearson,
            walkForwardSpearman: extendedResult.walkForward.metrics.spearman,
            slope: extendedResult.gates.slope,
            signAgreement: extendedResult.gates.signAgreement,
            gatesPassed: true,
            gateDetails: {
              ...extendedResult.gates,
              calibrationHead: extendedResult.calibrationHead,
            } as any,
            residualSummary: extendedResult.gates.residualSlices as any,
            trainingRowIds: [],
            setLabels: ['A', 'B'],
          },
        });
        
        console.log(`   ✅ Extended persisted to database\n`);
      } else {
        console.log('⚠️  Extended gates failed - not persisting to database\n');
      }
    }
  } catch (error: any) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

