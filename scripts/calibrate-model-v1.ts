/**
 * Phase 5: Model Calibration (Fit #1 Core, Fit #2 Extended)
 * 
 * Elastic Net regression with walk-forward validation
 * Target: market_spread_favorite_centric (home_minus_away frame)
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const prisma = new PrismaClient();

interface TrainingRow {
  gameId: string;
  season: number;
  week: number;
  setLabel: string;
  rowWeight: number;
  targetSpreadHma: number | null;
  
  // Core features (Fit #1)
  ratingDiffV2: number | null;
  hfaPoints: number | null;
  neutralSite: boolean;
  restDeltaDiff: number | null;
  p5VsG5: boolean;
  byeHome: boolean;
  byeAway: boolean;
  
  // Extended features (Fit #2)
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
    ratingDiffSq?: number;
  };
  residualSlices: {
    '0-7': number;
    '7-14': number;
    '14-28': number;
    '>28': number;
  };
  allPassed: boolean;
}

// ============================================================================
// ELASTIC NET IMPLEMENTATION
// ============================================================================

/**
 * Elastic Net: α * (l1_ratio * L1 + (1 - l1_ratio) * L2)
 * Minimizes: ||y - Xβ||² + α * (l1_ratio * ||β||₁ + (1 - l1_ratio) * ||β||²)
 */
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
// DATA LOADING & PREPROCESSING
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
  
  console.log(`   Loaded ${rows.length} training rows\n`);
  
  // Compute ratingDiffV2 and hfaPoints if missing
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
          ratingDiffV2 = homeRatingVal - awayRatingVal;
        }
        
        if (hfaPoints === null) {
          // HFA is team-specific, 0 on neutral site
          const hfaTeam = row.neutralSite ? 0 : (homeRating.hfaTeam !== null ? Number(homeRating.hfaTeam) : 2.0);
          hfaPoints = hfaTeam;
        }
      }
    }
    
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
      offAdjSrDiff: row.offAdjSrDiff !== null ? Number(row.offAdjSrDiff) : null,
      defAdjSrDiff: null, // Not in schema yet
      offAdjExplosivenessDiff: row.offAdjExplDiff !== null ? Number(row.offAdjExplDiff) : null,
      defAdjExplosivenessDiff: null,
      offAdjPpaDiff: row.offAdjPpaDiff !== null ? Number(row.offAdjPpaDiff) : null,
      defAdjPpaDiff: null,
      offAdjEpaDiff: null,
      defAdjEpaDiff: null,
      havocFront7Diff: row.havocFront7Diff !== null ? Number(row.havocFront7Diff) : null,
      havocDbDiff: row.havocDbDiff !== null ? Number(row.havocDbDiff) : null,
      edgeSrDiff: null,
      ewma3OffAdjEpaDiff: null,
      ewma5OffAdjEpaDiff: null,
      talent247Diff: null,
      returningProdOffDiff: null,
      returningProdDefDiff: null,
    });
  }
  
  return trainingRows;
}

// ============================================================================
// FEATURE ENGINEERING
// ============================================================================

function buildFeatureMatrix(
  rows: TrainingRow[],
  fitType: 'core' | 'extended'
): { X: number[][]; featureNames: string[]; scalerParams: Record<string, { mean: number; std: number }> } {
  const featureNames: string[] = [];
  const featureValues: Record<string, number[]> = {};
  
  // Core features (always included)
  featureNames.push('intercept');
  featureNames.push('ratingDiffV2');
  featureNames.push('hfaPoints');
  featureNames.push('neutralSite');
  featureNames.push('restDeltaDiff');
  featureNames.push('p5VsG5');
  featureNames.push('byeHome');
  featureNames.push('byeAway');
  
  // Optional quadratic term
  featureNames.push('ratingDiffV2Sq');
  
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
    featureValues['intercept'].push(1);
    featureValues['ratingDiffV2'].push(row.ratingDiffV2 ?? 0);
    featureValues['hfaPoints'].push(row.hfaPoints ?? 0);
    featureValues['neutralSite'].push(row.neutralSite ? 1 : 0);
    featureValues['restDeltaDiff'].push(row.restDeltaDiff ?? 0);
    featureValues['p5VsG5'].push(row.p5VsG5 ? 1 : 0);
    featureValues['byeHome'].push(row.byeHome ? 1 : 0);
    featureValues['byeAway'].push(row.byeAway ? 1 : 0);
    featureValues['ratingDiffV2Sq'].push((row.ratingDiffV2 ?? 0) ** 2 / 100); // Normalized
    
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
    if (name === 'intercept' || name === 'neutralSite' || name === 'p5VsG5' || name === 'byeHome' || name === 'byeAway') {
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
// GRID SEARCH & CROSS-VALIDATION
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
  
  // Find best
  results.sort((a, b) => a.cvScore - b.cvScore);
  return results[0];
}

// ============================================================================
// WALK-FORWARD VALIDATION
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
// GATE CHECKING
// ============================================================================

function checkGates(
  y: number[],
  predictions: number[],
  weights: number[],
  coefficients: number[],
  featureNames: string[],
  fitType: 'core' | 'extended'
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
  
  // Sign agreement
  let signAgreements = 0;
  for (let i = 0; i < validIndices.length; i++) {
    if ((yValid[i] < 0 && predValid[i] < 0) || (yValid[i] > 0 && predValid[i] > 0)) {
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
  const ratingIdx = featureNames.indexOf('ratingDiffV2');
  const hfaIdx = featureNames.indexOf('hfaPoints');
  const ratingSqIdx = featureNames.indexOf('ratingDiffV2Sq');
  
  if (ratingIdx >= 0) results.coefficientSanity.ratingDiff = coefficients[ratingIdx];
  if (hfaIdx >= 0) results.coefficientSanity.hfaPoints = coefficients[hfaIdx];
  if (ratingSqIdx >= 0) results.coefficientSanity.ratingDiffSq = coefficients[ratingSqIdx];
  
  // Residual slices
  const residuals = validIndices.map(i => Math.abs(y[i] - predictions[i]));
  const slices = {
    '0-7': residuals.filter(r => r >= 0 && r < 7),
    '7-14': residuals.filter(r => r >= 7 && r < 14),
    '14-28': residuals.filter(r => r >= 14 && r < 28),
    '>28': residuals.filter(r => r >= 28),
  };
  
  for (const [key, values] of Object.entries(slices)) {
    results.residualSlices[key as keyof typeof results.residualSlices] = values.length > 0
      ? values.reduce((a, b) => a + b, 0) / values.length
      : 0;
  }
  
  // Check all gates
  const rmseThreshold = fitType === 'core' ? 8.8 : 9.0;
  results.allPassed =
    results.slope >= 0.90 && results.slope <= 1.10 &&
    results.rmse <= rmseThreshold &&
    results.signAgreement >= 70 &&
    results.pearson >= 0.30 &&
    results.spearman >= 0.30 &&
    results.coefficientSanity.ratingDiff > 0 &&
    results.coefficientSanity.hfaPoints > 0 &&
    (ratingSqIdx < 0 || (results.coefficientSanity.ratingDiffSq ?? 0) >= 0) &&
    Math.abs(results.residualSlices['0-7']) <= 2.0 &&
    Math.abs(results.residualSlices['7-14']) <= 2.0 &&
    Math.abs(results.residualSlices['14-28']) <= 2.0 &&
    Math.abs(results.residualSlices['>28']) <= 2.0;
  
  return results;
}

// ============================================================================
// MAIN CALIBRATION FUNCTION
// ============================================================================

async function calibrate(
  fitType: 'core' | 'extended',
  season: number = 2025,
  featureVersion: string = 'fe_v1',
  modelVersion: string = 'cal_v1'
) {
  console.log('\n' + '='.repeat(70));
  console.log(`🔧 MODEL CALIBRATION: Fit #${fitType === 'core' ? '1' : '2'} ${fitType.toUpperCase()}`);
  console.log('='.repeat(70) + '\n');
  
  // Load data
  const setLabels = ['A', 'B'];
  const trainingRows = await loadTrainingData(season, featureVersion, setLabels);
  
  // Filter to rows with valid target
  const validRows = trainingRows.filter(r => r.targetSpreadHma !== null);
  console.log(`   Using ${validRows.length} rows with valid target\n`);
  
  if (validRows.length < 100) {
    throw new Error(`Insufficient training data: ${validRows.length} rows (need ≥100)`);
  }
  
  // Build feature matrix
  const { X, featureNames, scalerParams } = buildFeatureMatrix(validRows, fitType);
  const y = validRows.map(r => r.targetSpreadHma!);
  const weights = validRows.map(r => r.rowWeight);
  const weeks = validRows.map(r => r.week);
  
  console.log(`   Features: ${featureNames.length} (${featureNames.join(', ')})\n`);
  
  // Grid search
  const alphas = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];
  const l1Ratios = [0.0, 0.1, 0.25, 0.5];
  
  console.log('🔍 Step 1: Grid search with cross-validation...');
  const bestParams = gridSearch(X, y, weights, weeks, alphas, l1Ratios);
  console.log(`   ✅ Best: alpha=${bestParams.alpha}, l1_ratio=${bestParams.l1Ratio}, CV_RMSE=${bestParams.rmse.toFixed(4)}\n`);
  
  // Fit final model on all training data
  console.log('📐 Step 2: Fitting final model...');
  const finalModel = elasticNet(X, y, weights, bestParams.alpha, bestParams.l1Ratio);
  console.log(`   ✅ Train RMSE: ${finalModel.rmse.toFixed(4)}, R²: ${finalModel.r2.toFixed(4)}\n`);
  
  // Walk-forward validation
  console.log('🚶 Step 3: Walk-forward validation...');
  const wfResult = walkForwardValidation(X, y, weights, weeks, bestParams.alpha, bestParams.l1Ratio);
  console.log(`   ✅ Walk-forward RMSE: ${wfResult.metrics.rmse.toFixed(4)}, R²: ${wfResult.metrics.r2.toFixed(4)}\n`);
  
  // Check gates
  console.log('🚦 Step 4: Checking gates...');
  const gateResults = checkGates(y, wfResult.predictions, weights, finalModel.coefficients, featureNames, fitType);
  
  console.log(`   Slope (ŷ vs market): ${gateResults.slope.toFixed(4)} (target: 0.90-1.10)`);
  console.log(`   RMSE: ${gateResults.rmse.toFixed(4)} (target: ≤${fitType === 'core' ? '8.8' : '9.0'})`);
  console.log(`   Sign agreement: ${gateResults.signAgreement.toFixed(1)}% (target: ≥70%)`);
  console.log(`   Pearson: ${gateResults.pearson.toFixed(4)} (target: ≥0.30)`);
  console.log(`   Spearman: ${gateResults.spearman.toFixed(4)} (target: ≥0.30)`);
  console.log(`   β(rating_diff): ${gateResults.coefficientSanity.ratingDiff.toFixed(4)} (target: >0)`);
  console.log(`   β(hfa_points): ${gateResults.coefficientSanity.hfaPoints.toFixed(4)} (target: >0)`);
  console.log(`   Residual slices: 0-7=${gateResults.residualSlices['0-7'].toFixed(2)}, 7-14=${gateResults.residualSlices['7-14'].toFixed(2)}, 14-28=${gateResults.residualSlices['14-28'].toFixed(2)}, >28=${gateResults.residualSlices['>28'].toFixed(2)}`);
  
  if (gateResults.allPassed) {
    console.log(`\n   ✅ ALL GATES PASSED\n`);
  } else {
    console.log(`\n   ❌ GATES FAILED\n`);
  }
  
  // Convert coefficients to original scale
  const coefficientsOriginal: Record<string, { standardized: number; original: number }> = {};
  for (let i = 0; i < featureNames.length; i++) {
    const name = featureNames[i];
    const stdCoeff = finalModel.coefficients[i];
    const scaler = scalerParams[name];
    
    // Original scale = standardized / std (for non-intercept features)
    let origCoeff = stdCoeff;
    if (name !== 'intercept' && scaler.std > 1e-10) {
      origCoeff = stdCoeff / scaler.std;
    }
    
    coefficientsOriginal[name] = {
      standardized: stdCoeff,
      original: origCoeff,
    };
  }
  
  // Persist to database
  if (gateResults.allPassed) {
    console.log('💾 Step 5: Persisting to database...');
    
    await prisma.modelCalibration.upsert({
      where: {
        modelVersion_fitLabel: {
          modelVersion,
          fitLabel: fitType,
        },
      },
      update: {
        season,
        featureVersion,
        bestAlpha: bestParams.alpha,
        bestL1Ratio: bestParams.l1Ratio,
        coefficients: coefficientsOriginal as any,
        intercept: finalModel.intercept,
        scalerParams: scalerParams as any,
        trainRmse: finalModel.rmse,
        trainR2: finalModel.r2,
        trainPearson: finalModel.pearson,
        trainSpearman: finalModel.spearman,
        walkForwardRmse: wfResult.metrics.rmse,
        walkForwardR2: wfResult.metrics.r2,
        walkForwardPearson: wfResult.metrics.pearson,
        walkForwardSpearman: wfResult.metrics.spearman,
        slope: gateResults.slope,
        signAgreement: gateResults.signAgreement,
        gatesPassed: true,
        gateDetails: gateResults as any,
        residualSummary: gateResults.residualSlices as any,
        trainingRowIds: validRows.map(r => r.gameId),
        setLabels,
      },
      create: {
        modelVersion,
        fitLabel: fitType,
        season,
        featureVersion,
        bestAlpha: bestParams.alpha,
        bestL1Ratio: bestParams.l1Ratio,
        coefficients: coefficientsOriginal as any,
        intercept: finalModel.intercept,
        scalerParams: scalerParams as any,
        trainRmse: finalModel.rmse,
        trainR2: finalModel.r2,
        trainPearson: finalModel.pearson,
        trainSpearman: finalModel.spearman,
        walkForwardRmse: wfResult.metrics.rmse,
        walkForwardR2: wfResult.metrics.r2,
        walkForwardPearson: wfResult.metrics.pearson,
        walkForwardSpearman: wfResult.metrics.spearman,
        slope: gateResults.slope,
        signAgreement: gateResults.signAgreement,
        gatesPassed: true,
        gateDetails: gateResults as any,
        residualSummary: gateResults.residualSlices as any,
        trainingRowIds: validRows.map(r => r.gameId),
        setLabels,
      },
    });
    
    console.log(`   ✅ Persisted to database\n`);
  }
  
  // Generate reports
  console.log('📄 Step 6: Generating reports...');
  await generateReports(fitType, finalModel, wfResult, gateResults, featureNames, coefficientsOriginal, bestParams, season, featureVersion);
  console.log(`   ✅ Reports generated\n`);
  
  return {
    model: finalModel,
    walkForward: wfResult,
    gates: gateResults,
    bestParams,
  };
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

async function generateReports(
  fitType: string,
  model: ElasticNetResult,
  wfResult: { predictions: number[]; metrics: any },
  gates: GateResults,
  featureNames: string[],
  coefficients: Record<string, { standardized: number; original: number }>,
  bestParams: GridSearchResult,
  season: number,
  featureVersion: string
) {
  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  // Fit report JSON
  const fitReport = {
    fitType,
    season,
    featureVersion,
    bestParams,
    trainMetrics: {
      rmse: model.rmse,
      r2: model.r2,
      pearson: model.pearson,
      spearman: model.spearman,
    },
    walkForwardMetrics: wfResult.metrics,
    gates,
    coefficients,
    featureNames,
  };
  
  fs.writeFileSync(
    path.join(reportsDir, `cal_fit_${fitType}.json`),
    JSON.stringify(fitReport, null, 2)
  );
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  let fitType: 'core' | 'extended' = 'core';
  let season = 2025;
  let featureVersion = 'fe_v1';
  let modelVersion = 'cal_v1';
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--fit' && args[i + 1]) {
      fitType = args[i + 1] as 'core' | 'extended';
      i++;
    } else if (args[i] === '--season' && args[i + 1]) {
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
    await calibrate(fitType, season, featureVersion, modelVersion);
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

