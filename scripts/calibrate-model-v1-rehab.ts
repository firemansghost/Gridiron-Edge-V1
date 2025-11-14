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
  // Load MFTR ratings
  const mftrPath = path.join(process.cwd(), 'reports', 'mftr_ratings.csv');
  if (!fs.existsSync(mftrPath)) {
    console.log('   ⚠️  MFTR ratings not found - using raw V2 ratings\n');
    return;
  }
  
  const mftrContent = fs.readFileSync(mftrPath, 'utf-8');
  const mftrLines = mftrContent.trim().split('\n').slice(1);
  mftrRatings = new Map<string, number>();
  
  for (const line of mftrLines) {
    const [teamId, rating] = line.split(',');
    mftrRatings.set(teamId, parseFloat(rating));
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
  
  console.log(`   ✅ Loaded MFTR ratings (${mftrRatings.size} teams)`);
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
  
  // Return difference (HMA frame)
  return homeBlend - awayBlend;
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
    
    // Compute if missing
    if (ratingDiffV2 === null || hfaPoints === null) {
      const homeRating = await prisma.teamSeasonRating.findUnique({
        where: {
          season_teamId_modelVersion: {
            season: row.season,
            teamId: row.homeTeamId,
            modelVersion: 'v2',
          },
        },
      });
      
      const awayRating = await prisma.teamSeasonRating.findUnique({
        where: {
          season_teamId_modelVersion: {
            season: row.season,
            teamId: row.awayTeamId,
            modelVersion: 'v2',
          },
        },
      });
      
      if (homeRating && awayRating) {
        if (ratingDiffV2 === null) {
          const homeRatingVal = homeRating.powerRating !== null ? Number(homeRating.powerRating) : 0;
          const awayRatingVal = awayRating.powerRating !== null ? Number(awayRating.powerRating) : 0;
          
          // Try to use rating_blend if available, otherwise fall back to raw V2
          const ratingBlend = computeRatingBlend(
            row.homeTeamId,
            row.awayTeamId,
            homeRatingVal,
            awayRatingVal
          );
          
          ratingDiffV2 = ratingBlend !== null ? ratingBlend : (homeRatingVal - awayRatingVal);
        }
        
        if (hfaPoints === null) {
          const hfaTeam = row.neutralSite ? 0 : (homeRating.hfaTeam !== null ? Number(homeRating.hfaTeam) : 2.0);
          hfaPoints = hfaTeam;
        }
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

function buildFeatureMatrix(
  rows: TrainingRow[],
  fitType: 'core' | 'extended',
  includeHinge14: boolean = false
): { X: number[][]; featureNames: string[]; scalerParams: Record<string, { mean: number; std: number }> } {
  const featureNames: string[] = [];
  const featureValues: Record<string, number[]> = {};
  
  // Core features (always included)
  featureNames.push('intercept');
  featureNames.push(mftrRatings && blendConfig ? 'ratingDiffBlend' : 'ratingDiffV2');
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
    const ratingDiff = row.ratingDiffV2 ?? 0;
    const absRatingDiff = Math.abs(ratingDiff);
    
    featureValues['intercept'].push(1);
    featureValues['ratingDiffV2'].push(ratingDiff);
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
  
  // Standardize features (except intercept and binary flags)
  const scalerParams: Record<string, { mean: number; std: number }> = {};
  const X: number[][] = [];
  
  for (let i = 0; i < rows.length; i++) {
    X.push([]);
  }
  
  for (let j = 0; j < featureNames.length; j++) {
    const name = featureNames[j];
    const values = featureValues[name];
    
    // Skip standardization for intercept and binary flags
    if (name === 'intercept' || name === 'neutralSite' || name === 'p5VsG5') {
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
  nFolds: number = 5
): GridSearchResult {
  console.log(`   Grid search: ${alphas.length} alphas × ${l1Ratios.length} l1_ratios = ${alphas.length * l1Ratios.length} combinations\n`);
  
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
  
  for (const alpha of alphas) {
    for (const l1Ratio of l1Ratios) {
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
// GATE CHECKING (same as before)
// ============================================================================

function checkGates(
  y: number[],
  predictions: number[],
  weights: number[],
  coefficients: number[],
  featureNames: string[],
  fitType: 'core' | 'extended',
  rawPredictions?: number[] // Optional: raw predictions for variance ratio check
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
  const predsForVar = rawPredictions ? rawPredictions : predictions;
  const validPredsForVar = validIndices.map(i => predsForVar[i]);
  const validYForVar = validIndices.map(i => y[i]);
  const meanPredVar = validPredsForVar.reduce((a, b) => a + b, 0) / validPredsForVar.length;
  const meanYVar = validYForVar.reduce((a, b) => a + b, 0) / validYForVar.length;
  const varPredVar = validPredsForVar.reduce((sum, p) => sum + Math.pow(p - meanPredVar, 2), 0) / validPredsForVar.length;
  const varYVar = validYForVar.reduce((sum, t) => sum + Math.pow(t - meanYVar, 2), 0) / validYForVar.length;
  const stdPredVar = Math.sqrt(varPredVar);
  const stdYVar = Math.sqrt(varYVar);
  const varianceRatio = stdPredVar / stdYVar;
  
  // Check all gates (including variance ratio sanity gate)
  const rmseThreshold = fitType === 'core' ? 8.8 : 9.0;
  results.allPassed =
    results.slope >= 0.90 && results.slope <= 1.10 &&
    results.rmse <= rmseThreshold &&
    results.signAgreement >= 70 &&
    results.pearson >= 0.30 &&
    results.spearman >= 0.30 &&
    results.coefficientSanity.ratingDiff > 0 &&
    results.coefficientSanity.hfaPoints > 0 &&
    varianceRatio >= 0.6 && varianceRatio <= 1.2 && // Sanity gate: no silly compression
    Math.abs(results.residualSlices['0-7']) <= 2.0 &&
    Math.abs(results.residualSlices['7-14']) <= 2.0 &&
    Math.abs(results.residualSlices['14-28']) <= 2.0 &&
    Math.abs(results.residualSlices['>28']) <= 2.0;
  
  // Log variance ratio
  console.log(`   Variance ratio (std(ŷ)/std(y)): ${varianceRatio.toFixed(4)} (target: 0.6-1.2)`);
  
  return results;
}

// ============================================================================
// MAIN CALIBRATION FUNCTION (with conditional quadratic and weighted/unweighted)
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
  
  // Load data (try Set A+B with outlier trimming)
  const setLabels = ['A', 'B'];
  const trainingRows = await loadTrainingData(season, featureVersion, setLabels);
  
  // Filter to rows with valid target
  let validRows = trainingRows.filter(r => r.targetSpreadHma !== null);
  console.log(`   Loaded ${validRows.length} rows with valid target\n`);
  
  // ============================================================================
  // SANITY CHECKS (must pass before training)
  // ============================================================================
  console.log('🔍 SANITY CHECKS:\n');
  
  // 1. Target distribution (HMA frame)
  const setA = validRows.filter(r => r.setLabel === 'A');
  const setB = validRows.filter(r => r.setLabel === 'B');
  
  const analyzeTarget = (rows: TrainingRow[], label: string) => {
    const targets = rows.map(r => r.targetSpreadHma!);
    const mean = targets.reduce((a, b) => a + b, 0) / targets.length;
    const variance = targets.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / targets.length;
    const std = Math.sqrt(variance);
    const pos = targets.filter(t => t > 0).length;
    const neg = targets.filter(t => t < 0).length;
    const zero = targets.filter(t => t === 0).length;
    
    console.log(`   ${label}:`);
    console.log(`     Count: ${targets.length}`);
    console.log(`     Mean: ${mean.toFixed(4)}, Std: ${std.toFixed(4)}`);
    console.log(`     % y>0: ${((pos / targets.length) * 100).toFixed(1)}%`);
    console.log(`     % y<0: ${((neg / targets.length) * 100).toFixed(1)}%`);
    console.log(`     % y=0: ${((zero / targets.length) * 100).toFixed(1)}%\n`);
    
    if (neg / targets.length > 0.95) {
      console.log(`     ⚠️  WARNING: ${((neg / targets.length) * 100).toFixed(1)}% are negative - possible frame bug!\n`);
    }
    
    return { mean, std, pos, neg, zero };
  };
  
  const statsA = analyzeTarget(setA, 'Set A');
  const statsB = analyzeTarget(setB, 'Set B');
  const statsCombined = analyzeTarget(validRows, 'Combined');
  
  // 2. Raw signal check (pre-model)
  const ratingDiffs = validRows.map(r => r.ratingDiffV2 ?? 0);
  const targets = validRows.map(r => r.targetSpreadHma!);
  
  const meanRatingDiff = ratingDiffs.reduce((a, b) => a + b, 0) / ratingDiffs.length;
  const meanTarget = targets.reduce((a, b) => a + b, 0) / targets.length;
  const varRatingDiff = ratingDiffs.reduce((sum, d) => sum + Math.pow(d - meanRatingDiff, 2), 0) / ratingDiffs.length;
  const varTarget = targets.reduce((sum, t) => sum + Math.pow(t - meanTarget, 2), 0) / targets.length;
  const stdRatingDiff = Math.sqrt(varRatingDiff);
  const stdTarget = Math.sqrt(varTarget);
  
  let cov = 0;
  for (let i = 0; i < ratingDiffs.length; i++) {
    cov += (ratingDiffs[i] - meanRatingDiff) * (targets[i] - meanTarget);
  }
  cov /= ratingDiffs.length;
  const rawPearson = cov / (stdRatingDiff * stdTarget);
  
  // Spearman on raw signal
  const rankRatingDiff = rankArray(ratingDiffs);
  const rankTarget = rankArray(targets);
  const meanRankDiff = rankRatingDiff.reduce((a, b) => a + b, 0) / rankRatingDiff.length;
  const meanRankTarget = rankTarget.reduce((a, b) => a + b, 0) / rankTarget.length;
  const varRankDiff = rankRatingDiff.reduce((sum, r) => sum + Math.pow(r - meanRankDiff, 2), 0) / rankRatingDiff.length;
  const varRankTarget = rankTarget.reduce((sum, r) => sum + Math.pow(r - meanRankTarget, 2), 0) / rankTarget.length;
  let covRank = 0;
  for (let i = 0; i < rankRatingDiff.length; i++) {
    covRank += (rankRatingDiff[i] - meanRankDiff) * (rankTarget[i] - meanRankTarget);
  }
  covRank /= rankRatingDiff.length;
  const rawSpearman = covRank / (Math.sqrt(varRankDiff) * Math.sqrt(varRankTarget));
  
  console.log(`   Raw signal check (v2_rating_diff vs target):`);
  console.log(`     std(rating_diff): ${stdRatingDiff.toFixed(4)}`);
  console.log(`     std(target): ${stdTarget.toFixed(4)}`);
  console.log(`     Ratio: ${(stdRatingDiff / stdTarget).toFixed(4)}`);
  if (stdRatingDiff < 0.3 * stdTarget) {
    console.log(`     ⚠️  WARNING: std(rating_diff) << std(target) - scale/compression problem!\n`);
  }
  console.log(`     Raw Pearson: ${rawPearson.toFixed(4)}`);
  console.log(`     Raw Spearman: ${rawSpearman.toFixed(4)}\n`);
  
  if (validRows.length < 100) {
    throw new Error(`Insufficient training data: ${validRows.length} rows (need ≥100)`);
  }
  
  // Frame alignment: Both target and features are now in HMA frame
  // Target: HMA = home - away (positive = home better, negative = away better)
  // rating_diff: HMA = rating_home - rating_away (positive = home better)
  // hfa_points: additive HFA for home team (positive, 0 if neutral)
  // So: rating_diff > 0 (home better) → target > 0 (home better) → β should be positive
  const y = validRows.map(r => r.targetSpreadHma!); // Target: HMA frame (positive = home better)
  
  // No need to flip rating_diff - it's already in HMA frame
  // ratingDiffV2 should be (home - away) from the database
  
  // Ridge-heavy grid (lower alpha to reduce over-regularization)
  // Start with very low alpha to preserve variance
  const alphas = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25];
  const l1Ratios = [0.0, 0.05, 0.1, 0.25];
  
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
    
    const weights = variant.useWeights
      ? validRows.map(r => r.rowWeight)
      : validRows.map(() => 1.0);
    const weeks = validRows.map(r => r.week);
    
    // Test with and without hinge14
    for (const useHinge14 of [false, true]) {
      if (useHinge14) {
        console.log(`\n📊 Testing with hinge14...\n`);
      }
      
      const { X, featureNames, scalerParams } = buildFeatureMatrix(validRows, 'core', useHinge14);
      
      console.log(`   Features: ${featureNames.length} (${featureNames.join(', ')})\n`);
      
      // Grid search
      console.log('🔍 Step 1: Grid search with cross-validation...');
      const bestParams = gridSearch(X, y, weights, weeks, alphas, l1Ratios);
      console.log(`   ✅ Best: alpha=${bestParams.alpha}, l1_ratio=${bestParams.l1Ratio}, CV_RMSE=${bestParams.rmse.toFixed(4)}\n`);
      
      // Fit final model
      console.log('📐 Step 2: Fitting final model...');
      const finalModel = elasticNet(X, y, weights, bestParams.alpha, bestParams.l1Ratio);
      console.log(`   ✅ Train RMSE: ${finalModel.rmse.toFixed(4)}, R²: ${finalModel.r2.toFixed(4)}\n`);
      
      // Walk-forward validation
      console.log('🚶 Step 3: Walk-forward validation...');
      const wfResult = walkForwardValidation(X, y, weights, weeks, bestParams.alpha, bestParams.l1Ratio);
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
        calibrationHead = fitLinearCalibrationHead(y, wfResult.predictions, weights);
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
      const gateResults = checkGates(y, calibratedPredictions, weights, finalModel.coefficients, featureNames, 'core', wfResult.predictions);
      
      console.log(`   Slope (ŷ vs market): ${gateResults.slope.toFixed(4)} (target: 0.90-1.10)`);
      console.log(`   RMSE: ${gateResults.rmse.toFixed(4)} (target: ≤8.8)`);
      console.log(`   Sign agreement: ${gateResults.signAgreement.toFixed(1)}% (target: ≥70%)`);
      console.log(`   Pearson: ${gateResults.pearson.toFixed(4)} (target: ≥0.30)`);
      console.log(`   Spearman: ${gateResults.spearman.toFixed(4)} (target: ≥0.30)`);
      console.log(`   β(rating_diff): ${gateResults.coefficientSanity.ratingDiff.toFixed(4)} (target: >0)`);
      console.log(`   β(hfa_points): ${gateResults.coefficientSanity.hfaPoints.toFixed(4)} (target: >0)`);
      console.log(`   Residual slices: 0-7=${gateResults.residualSlices['0-7'].toFixed(2)}, 7-14=${gateResults.residualSlices['7-14'].toFixed(2)}, 14-28=${gateResults.residualSlices['14-28'].toFixed(2)}, >28=${gateResults.residualSlices['>28'].toFixed(2)}`);
      
      // Convert coefficients
      const coefficientsOriginal: Record<string, { standardized: number; original: number }> = {};
      for (let i = 0; i < featureNames.length; i++) {
        const name = featureNames[i];
        const stdCoeff = finalModel.coefficients[i];
        const scaler = scalerParams[name];
        
        let origCoeff = stdCoeff;
        if (name !== 'intercept' && scaler.std > 1e-10) {
          origCoeff = stdCoeff / scaler.std;
        }
        
        coefficientsOriginal[name] = {
          standardized: stdCoeff,
          original: origCoeff,
        };
      }
      
      // Check if hinge14 should be kept (only if it improves RMSE by ≥0.05)
      let keepHinge14 = useHinge14;
      if (useHinge14) {
        // Will compare with non-hinge14 version later
        // For now, keep it if gates pass
        if (!gateResults.allPassed) {
          keepHinge14 = false;
        }
      }
      
      results.push({
        model: finalModel,
        walkForward: wfResult,
        gates: gateResults,
        bestParams,
        featureNames,
        coefficients: coefficientsOriginal,
        scalerParams,
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
  
  // Find best result (prefer one that passes gates)
  const passingResults = results.filter(r => r.gates.allPassed);
  if (passingResults.length > 0) {
    // Prefer unweighted if both pass (better rank correlation)
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
// EXTENDED CALIBRATION FUNCTION
// ============================================================================

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
  
  // Load data
  const setLabels = ['A', 'B'];
  const trainingRows = await loadTrainingData(season, featureVersion, setLabels);
  
  // Filter to rows with valid target
  let validRows = trainingRows.filter(r => r.targetSpreadHma !== null);
  console.log(`   Loaded ${validRows.length} rows with valid target\n`);
  
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
  
  // No need to flip rating_diff - it's already in HMA frame
  
  // Ridge-heavy grid (lower alpha to reduce over-regularization)
  const alphas = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1];
  const l1Ratios = [0.0, 0.05, 0.1, 0.25];
  
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
    
    const weights = variant.useWeights
      ? validRows.map(r => r.rowWeight)
      : validRows.map(() => 1.0);
    const weeks = validRows.map(r => r.week);
    
    // Test with and without hinge14
    for (const useHinge14 of [false, true]) {
      if (useHinge14) {
        console.log(`\n📊 Testing with hinge14...\n`);
      }
      
      const { X, featureNames, scalerParams } = buildFeatureMatrix(validRows, 'extended', useHinge14);
      
      console.log(`   Features: ${featureNames.length} (${featureNames.filter(f => f !== 'intercept').join(', ')})\n`);
      
      // Grid search
      console.log('🔍 Step 1: Grid search with cross-validation...');
      const bestParams = gridSearch(X, y, weights, weeks, alphas, l1Ratios);
      console.log(`   ✅ Best: alpha=${bestParams.alpha}, l1_ratio=${bestParams.l1Ratio}, CV_RMSE=${bestParams.rmse.toFixed(4)}\n`);
      
      // Fit final model
      console.log('📐 Step 2: Fitting final model...');
      const finalModel = elasticNet(X, y, weights, bestParams.alpha, bestParams.l1Ratio);
      console.log(`   ✅ Train RMSE: ${finalModel.rmse.toFixed(4)}, R²: ${finalModel.r2.toFixed(4)}\n`);
      
      // Walk-forward validation
      console.log('🚶 Step 3: Walk-forward validation...');
      const wfResult = walkForwardValidation(X, y, weights, weeks, bestParams.alpha, bestParams.l1Ratio);
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
        calibrationHead = fitLinearCalibrationHead(y, wfResult.predictions, weights);
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
      const gateResults = checkGates(y, calibratedPredictions, weights, finalModel.coefficients, featureNames, 'extended', wfResult.predictions);
      
      console.log(`   Slope (ŷ vs market): ${gateResults.slope.toFixed(4)} (target: 0.90-1.10)`);
      console.log(`   RMSE: ${gateResults.rmse.toFixed(4)} (target: ≤9.0)`);
      console.log(`   Sign agreement: ${gateResults.signAgreement.toFixed(1)}% (target: ≥70%)`);
      console.log(`   Pearson: ${gateResults.pearson.toFixed(4)} (target: ≥0.30)`);
      console.log(`   Spearman: ${gateResults.spearman.toFixed(4)} (target: ≥0.30)`);
      console.log(`   β(rating_diff): ${gateResults.coefficientSanity.ratingDiff.toFixed(4)} (target: >0)`);
      console.log(`   β(hfa_points): ${gateResults.coefficientSanity.hfaPoints.toFixed(4)} (target: >0)`);
      console.log(`   Residual slices: 0-7=${gateResults.residualSlices['0-7'].toFixed(2)}, 7-14=${gateResults.residualSlices['7-14'].toFixed(2)}, 14-28=${gateResults.residualSlices['14-28'].toFixed(2)}, >28=${gateResults.residualSlices['>28'].toFixed(2)}`);
      
      // Convert coefficients
      const coefficientsOriginal: Record<string, { standardized: number; original: number }> = {};
      for (let i = 0; i < featureNames.length; i++) {
        const name = featureNames[i];
        const stdCoeff = finalModel.coefficients[i];
        const scaler = scalerParams[name];
        
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
        featureNames,
        coefficients: coefficientsOriginal,
        scalerParams,
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
  
  // 2. Residuals CSV (use calibrated predictions if available)
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
  
  // 2b. Top outliers CSV (use calibrated predictions if available)
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
    }
  }
  
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
    
    // Now run Extended
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

