/**
 * Diagnostic script to investigate variance compression in Core calibration
 * 
 * Runs:
 * 1. Minimal OLS probe (no scaling, no regularization)
 * 2. Scaler audit (pre/post standardization stats)
 * 3. Blend scale check
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// Load MFTR and blend config
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

async function loadMFTRAndBlend() {
  const fs = require('fs');
  const path = require('path');
  
  // Load MFTR ratings
  const mftrPath = path.join(process.cwd(), 'reports', 'mftr_ratings_ridge.csv');
  if (fs.existsSync(mftrPath)) {
    mftrRatings = new Map();
    const content = fs.readFileSync(mftrPath, 'utf-8');
    const lines = content.split('\n').slice(1).filter((l: string) => l.trim());
    for (const line of lines) {
      const [teamId, ratingStr] = line.split(',');
      if (teamId && ratingStr) {
        mftrRatings.set(teamId.trim(), parseFloat(ratingStr.trim()));
      }
    }
    console.log(`   ✅ Loaded MFTR ratings (${mftrRatings.size} teams, ridge version)`);
  }
  
  // Load blend config
  const blendPath = path.join(process.cwd(), 'reports', 'rating_blend_config.json');
  if (fs.existsSync(blendPath)) {
    blendConfig = JSON.parse(fs.readFileSync(blendPath, 'utf-8'));
    console.log(`   ✅ Loaded blend config (w=${blendConfig.optimalWeight})`);
  }
}

function computeRatingBlend(
  season: number,
  homeTeamId: string,
  awayTeamId: string
): number {
  if (!mftrRatings || !blendConfig) return 0;
  
  // Get V2 ratings
  // For now, we'll compute from teamSeasonRating if needed
  // But for this diagnostic, we'll use the stored ratingDiffBlend if available
  
  // This is a simplified version - in practice, we'd load from DB
  return 0; // Will be computed from actual data
}

function pearsonCorrelation(x: number[], y: number[], weights?: number[]): number {
  if (x.length !== y.length) return 0;
  const n = x.length;
  const w = weights || x.map(() => 1.0);
  const sumW = w.reduce((a, b) => a + b, 0);
  
  const meanX = x.reduce((sum, val, i) => sum + w[i] * val, 0) / sumW;
  const meanY = y.reduce((sum, val, i) => sum + w[i] * val, 0) / sumW;
  
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const xDev = x[i] - meanX;
    const yDev = y[i] - meanY;
    cov += w[i] * xDev * yDev;
    varX += w[i] * xDev * xDev;
    varY += w[i] * yDev * yDev;
  }
  
  const stdX = Math.sqrt(varX / sumW);
  const stdY = Math.sqrt(varY / sumW);
  
  return stdX > 1e-10 && stdY > 1e-10 ? (cov / sumW) / (stdX * stdY) : 0;
}

function rankArray(arr: number[]): number[] {
  const sorted = [...arr].map((val, idx) => ({ val, idx })).sort((a, b) => a.val - b.val);
  const ranks = new Array(arr.length);
  sorted.forEach((item, rank) => {
    ranks[item.idx] = rank + 1;
  });
  return ranks;
}

// Simple OLS (no regularization, no scaling)
function simpleOLS(X: number[][], y: number[], weights?: number[]): {
  coefficients: number[];
  intercept: number;
  predictions: number[];
  rmse: number;
  pearson: number;
  spearman: number;
} {
  const n = X.length;
  const p = X[0].length;
  const w = weights || X.map(() => 1.0);
  const sumW = w.reduce((a, b) => a + b, 0);
  
  // Weighted least squares: (X'WX)^(-1) X'Wy
  // For simplicity, we'll use the normal equations with weights
  
  // Build X'WX and X'Wy
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
  // Simple Gaussian elimination (for 2-3 features, this is fine)
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
  for (let i = 0; i < n; i++) {
    const err = y[i] - predictions[i];
    ssRes += w[i] * err * err;
  }
  const rmse = Math.sqrt(ssRes / sumW);
  const pearson = pearsonCorrelation(y, predictions, w);
  const spearman = pearsonCorrelation(rankArray(y), rankArray(predictions), w);
  
  return {
    coefficients: beta.slice(1), // Exclude intercept
    intercept: beta[0],
    predictions,
    rmse,
    pearson,
    spearman,
  };
}

// Simple linear system solver (Gaussian elimination with partial pivoting)
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  const augmented: number[][] = A.map((row, i) => [...row, b[i]]);
  
  // Forward elimination
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
    
    // Eliminate
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

async function runOLSProbe(setLabel: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`OLS PROBE: Set ${setLabel}`);
  console.log('='.repeat(70));
  
  const rows = await prisma.gameTrainingRow.findMany({
    where: {
      season: 2025,
      featureVersion: 'fe_v1',
      setLabel: setLabel === 'AB' ? { in: ['A', 'B'] } : setLabel,
      targetSpreadHma: { not: null },
    },
    orderBy: { week: 'asc' },
  });
  
  console.log(`   Loaded ${rows.length} rows`);
  
  // Load team ratings to compute blend if needed
  const y: number[] = [];
  const ratingDiffs: number[] = [];
  const hfaPoints: number[] = [];
  const weights: number[] = [];
  
  for (const row of rows) {
    y.push(Number(row.targetSpreadHma!));
    weights.push(row.setLabel === 'A' ? 1.0 : 0.6);
    
    // Compute ratingDiffBlend from V2 ratings and MFTR
    const homeRating = await prisma.teamSeasonRating.findUnique({
      where: {
        season_teamId_modelVersion: {
          season: 2025,
          teamId: row.homeTeamId,
          modelVersion: 'v2',
        },
      },
    });
    const awayRating = await prisma.teamSeasonRating.findUnique({
      where: {
        season_teamId_modelVersion: {
          season: 2025,
          teamId: row.awayTeamId,
          modelVersion: 'v2',
        },
      },
    });
    
    const homeV2 = (homeRating?.powerRating !== null && homeRating?.powerRating !== undefined) ? Number(homeRating.powerRating) : 0;
    const awayV2 = (awayRating?.powerRating !== null && awayRating?.powerRating !== undefined) ? Number(awayRating.powerRating) : 0;
    
    let ratingDiff: number;
    if (mftrRatings && blendConfig) {
      // Compute blend (same logic as calibrate-model-v1-rehab.ts)
      const homeMFTR = mftrRatings.get(row.homeTeamId);
      const awayMFTR = mftrRatings.get(row.awayTeamId);
      
      if (homeMFTR !== undefined && awayMFTR !== undefined) {
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
        const blendDiffNorm = homeBlend - awayBlend;
        ratingDiff = blendDiffNorm * blendConfig.normalization.v2Std + blendConfig.normalization.v2Mean;
      } else {
        // Fall back to raw V2
        ratingDiff = homeV2 - awayV2;
      }
    } else {
      // Fall back to raw V2
      ratingDiff = homeV2 - awayV2;
    }
    
    ratingDiffs.push(ratingDiff);
    hfaPoints.push(row.hfaPoints !== null ? Number(row.hfaPoints) : 0);
  }
  
  // Feature stats (pre-standardization)
  const meanRating = ratingDiffs.reduce((a, b) => a + b, 0) / ratingDiffs.length;
  const meanHfa = hfaPoints.reduce((a, b) => a + b, 0) / hfaPoints.length;
  const meanY = y.reduce((a, b) => a + b, 0) / y.length;
  
  const varRating = ratingDiffs.reduce((sum, d) => sum + Math.pow(d - meanRating, 2), 0) / ratingDiffs.length;
  const varHfa = hfaPoints.reduce((sum, h) => sum + Math.pow(h - meanHfa, 2), 0) / hfaPoints.length;
  const varY = y.reduce((sum, t) => sum + Math.pow(t - meanY, 2), 0) / y.length;
  
  const stdRating = Math.sqrt(varRating);
  const stdHfa = Math.sqrt(varHfa);
  const stdY = Math.sqrt(varY);
  
  console.log(`\n   Pre-standardization stats:`);
  console.log(`     ratingDiffBlend: mean=${meanRating.toFixed(4)}, std=${stdRating.toFixed(4)}, range=[${Math.min(...ratingDiffs).toFixed(2)}, ${Math.max(...ratingDiffs).toFixed(2)}]`);
  console.log(`     hfaPoints: mean=${meanHfa.toFixed(4)}, std=${stdHfa.toFixed(4)}, range=[${Math.min(...hfaPoints).toFixed(2)}, ${Math.max(...hfaPoints).toFixed(2)}]`);
  console.log(`     target (y): mean=${meanY.toFixed(4)}, std=${stdY.toFixed(4)}, range=[${Math.min(...y).toFixed(2)}, ${Math.max(...y).toFixed(2)}]`);
  
  // Check if hfaPoints has variance (if not, exclude it)
  const hfaHasVariance = stdHfa > 1e-6;
  
  // Build feature matrix [intercept, ratingDiff, hfaPoints (if has variance)]
  const X: number[][] = ratingDiffs.map((rd, i) => {
    if (hfaHasVariance) {
      return [1, rd, hfaPoints[i]];
    } else {
      return [1, rd];
    }
  });
  
  // Run OLS
  const olsResult = simpleOLS(X, y, weights);
  
  console.log(`\n   OLS Results (no scaling, no regularization):`);
  console.log(`     β(ratingDiffBlend): ${olsResult.coefficients[0].toFixed(4)}`);
  if (hfaHasVariance) {
    console.log(`     β(hfaPoints): ${olsResult.coefficients[1].toFixed(4)}`);
  } else {
    console.log(`     β(hfaPoints): N/A (zero variance)`);
  }
  console.log(`     intercept: ${olsResult.intercept.toFixed(4)}`);
  console.log(`     RMSE: ${olsResult.rmse.toFixed(4)}`);
  console.log(`     Pearson: ${olsResult.pearson.toFixed(4)}`);
  console.log(`     Spearman: ${olsResult.spearman.toFixed(4)}`);
  
  // Variance ratio
  const meanPred = olsResult.predictions.reduce((a, b) => a + b, 0) / olsResult.predictions.length;
  const predStd = Math.sqrt(olsResult.predictions.reduce((sum, p) => {
    return sum + Math.pow(p - meanPred, 2);
  }, 0) / olsResult.predictions.length);
  const varianceRatio = predStd / stdY;
  
  console.log(`\n   Variance Analysis:`);
  console.log(`     std(y): ${stdY.toFixed(4)}`);
  console.log(`     std(ŷ_OLS): ${predStd.toFixed(4)}`);
  console.log(`     Variance ratio: ${varianceRatio.toFixed(4)} (target: ≥0.6, ideal: ≥0.8)`);
  
  // β sign check
  const betaRating = olsResult.coefficients[0];
  const betaHfa = hfaHasVariance ? olsResult.coefficients[1] : 0;
  const signsOK = betaRating > 0 && (!hfaHasVariance || betaHfa > 0);
  
  console.log(`\n   β Sign Check:`);
  console.log(`     β(ratingDiffBlend) > 0: ${betaRating > 0 ? '✅' : '❌'} (${betaRating.toFixed(4)})`);
  if (hfaHasVariance) {
    console.log(`     β(hfaPoints) > 0: ${betaHfa > 0 ? '✅' : '❌'} (${betaHfa.toFixed(4)})`);
  } else {
    console.log(`     β(hfaPoints): N/A (zero variance)`);
  }
  
  return {
    setLabel,
    nRows: rows.length,
    varianceRatio,
    betaRating,
    betaHfa,
    pearson: olsResult.pearson,
    spearman: olsResult.spearman,
    stdRating,
    stdY,
    signsOK,
  };
}

async function main() {
  await loadMFTRAndBlend();
  
  console.log('\n' + '='.repeat(70));
  console.log('VARIANCE COMPRESSION DIAGNOSTIC');
  console.log('='.repeat(70));
  
  const resultsA = await runOLSProbe('A');
  const resultsAB = await runOLSProbe('AB');
  
  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`\nSet A:`);
  console.log(`   Variance ratio: ${resultsA.varianceRatio.toFixed(4)} ${resultsA.varianceRatio >= 0.6 ? '✅' : '❌'}`);
  console.log(`   β signs: ${resultsA.signsOK ? '✅' : '❌'}`);
  console.log(`   Pearson: ${resultsA.pearson.toFixed(4)}`);
  console.log(`   Spearman: ${resultsA.spearman.toFixed(4)}`);
  console.log(`   std(ratingDiffBlend): ${resultsA.stdRating.toFixed(4)}`);
  console.log(`   std(y): ${resultsA.stdY.toFixed(4)}`);
  
  console.log(`\nSet AB:`);
  console.log(`   Variance ratio: ${resultsAB.varianceRatio.toFixed(4)} ${resultsAB.varianceRatio >= 0.6 ? '✅' : '❌'}`);
  console.log(`   β signs: ${resultsAB.signsOK ? '✅' : '❌'}`);
  console.log(`   Pearson: ${resultsAB.pearson.toFixed(4)}`);
  console.log(`   Spearman: ${resultsAB.spearman.toFixed(4)}`);
  console.log(`   std(ratingDiffBlend): ${resultsAB.stdRating.toFixed(4)}`);
  console.log(`   std(y): ${resultsAB.stdY.toFixed(4)}`);
  
  console.log(`\n${'='.repeat(70)}\n`);
  
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(console.error);
}

