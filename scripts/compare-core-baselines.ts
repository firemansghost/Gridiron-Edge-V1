/**
 * Compare Core model performance against simple baselines
 * 
 * Baselines:
 * 1. Zero model (always predicts 0)
 * 2. HFA-only model (OLS: intercept + hfaPoints)
 * 3. Full OLS (ratingDiffBlend + hfaPoints)
 * 
 * Compare against current Core fit
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const prisma = new PrismaClient();

// Load MFTR and blend config
let mftrRatings: Map<string, number> | null = null;
let blendConfig: any = null;

async function loadMFTRAndBlend() {
  const mftrRidgePath = path.join(process.cwd(), 'reports', 'mftr_ratings_ridge.csv');
  const mftrPath = path.join(process.cwd(), 'reports', 'mftr_ratings.csv');
  let mftrPathToUse = mftrRidgePath;
  
  if (!fs.existsSync(mftrRidgePath)) {
    if (!fs.existsSync(mftrPath)) {
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
  
  const configPath = path.join(process.cwd(), 'reports', 'rating_blend_config.json');
  if (fs.existsSync(configPath)) {
    blendConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
}

function computeRatingBlend(
  homeTeamId: string,
  awayTeamId: string,
  homeV2: number,
  awayV2: number
): number {
  if (!mftrRatings || !blendConfig) {
    return homeV2 - awayV2;
  }
  
  const homeMFTR = mftrRatings.get(homeTeamId);
  const awayMFTR = mftrRatings.get(awayTeamId);
  
  if (homeMFTR === undefined || awayMFTR === undefined) {
    return homeV2 - awayV2;
  }
  
  const homeV2Norm = (homeV2 - blendConfig.normalization.v2Mean) / blendConfig.normalization.v2Std;
  const awayV2Norm = (awayV2 - blendConfig.normalization.v2Std) / blendConfig.normalization.v2Std;
  const homeMFTRNorm = (homeMFTR - blendConfig.normalization.mftrMean) / blendConfig.normalization.mftrStd;
  const awayMFTRNorm = (awayMFTR - blendConfig.normalization.mftrMean) / blendConfig.normalization.mftrStd;
  
  const w = blendConfig.optimalWeight;
  const homeBlend = w * homeV2Norm + (1 - w) * homeMFTRNorm;
  const awayBlend = w * awayV2Norm + (1 - w) * awayMFTRNorm;
  
  const blendDiffNorm = homeBlend - awayBlend;
  return blendDiffNorm * blendConfig.normalization.v2Std + blendConfig.normalization.v2Mean;
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

async function compareBaselines(setLabel: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`BASELINE COMPARISON: Set ${setLabel}`);
  console.log('='.repeat(70));
  
  await loadMFTRAndBlend();
  
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
  
  const y: number[] = [];
  const weights: number[] = [];
  const ratingDiffs: number[] = [];
  const hfaPoints: number[] = [];
  
  for (const row of rows) {
    y.push(Number(row.targetSpreadHma!));
    weights.push(row.setLabel === 'A' ? 1.0 : 0.6);
    
    // Compute ratingDiffBlend
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
    
    const ratingDiff = computeRatingBlend(row.homeTeamId, row.awayTeamId, homeV2, awayV2);
    ratingDiffs.push(ratingDiff);
    hfaPoints.push(row.hfaPoints !== null ? Number(row.hfaPoints) : 0);
  }
  
  const results: any[] = [];
  
  // Baseline 1: Zero model
  const zeroPreds = y.map(() => 0);
  const zeroRmse = Math.sqrt(zeroPreds.reduce((sum, p, i) => sum + weights[i] * Math.pow(y[i] - p, 2), 0) / weights.reduce((a, b) => a + b, 0));
  const zeroMae = zeroPreds.reduce((sum, p, i) => sum + weights[i] * Math.abs(y[i] - p), 0) / weights.reduce((a, b) => a + b, 0);
  const zeroPearson = pearsonCorrelation(y, zeroPreds, weights);
  const zeroSpearman = pearsonCorrelation(rankArray(y), rankArray(zeroPreds), weights);
  const zeroSignAgreement = (y.filter((yi, i) => {
    const ySign = yi < 0 ? -1 : (yi > 0 ? 1 : 0);
    const predSign = zeroPreds[i] < 0 ? -1 : (zeroPreds[i] > 0 ? 1 : 0);
    return ySign === predSign && ySign !== 0;
  }).length / y.length) * 100;
  
  results.push({
    model: 'zero',
    rmse: zeroRmse,
    mae: zeroMae,
    pearson: zeroPearson,
    spearman: zeroSpearman,
    signAgreement: zeroSignAgreement,
  });
  
  // Baseline 2: HFA-only (OLS: intercept + hfaPoints)
  const hfaStd = Math.sqrt(hfaPoints.reduce((sum, h, i) => sum + weights[i] * Math.pow(h - hfaPoints.reduce((a, b, j) => a + weights[j] * b, 0) / weights.reduce((a, b) => a + b, 0), 2), 0) / weights.reduce((a, b) => a + b, 0));
  if (hfaStd > 1e-6) {
    const hfaX = hfaPoints.map(hfa => [1, hfa]);
    try {
      const hfaOls = simpleOLS(hfaX, y, weights);
      results.push({
        model: 'hfa_only',
        rmse: hfaOls.rmse,
        mae: hfaOls.mae,
        pearson: hfaOls.pearson,
        spearman: hfaOls.spearman,
        signAgreement: hfaOls.signAgreement,
      });
    } catch (e) {
      console.log(`   ⚠️  HFA-only OLS failed: ${e}`);
      results.push({
        model: 'hfa_only',
        rmse: zeroRmse,
        mae: zeroMae,
        pearson: 0,
        spearman: 0,
        signAgreement: 0,
      });
    }
  } else {
    console.log(`   ⚠️  hfaPoints has zero variance, skipping HFA-only model`);
    results.push({
      model: 'hfa_only',
      rmse: zeroRmse,
      mae: zeroMae,
      pearson: 0,
      spearman: 0,
      signAgreement: 0,
    });
  }
  
  // Baseline 3: Full OLS (ratingDiffBlend + hfaPoints, but drop hfaPoints if zero variance)
  const ratingDiffStd = Math.sqrt(ratingDiffs.reduce((sum, rd, i) => sum + weights[i] * Math.pow(rd - ratingDiffs.reduce((a, b, j) => a + weights[j] * b, 0) / weights.reduce((a, b) => a + b, 0), 2), 0) / weights.reduce((a, b) => a + b, 0));
  let fullX: number[][];
  if (hfaStd > 1e-6 && ratingDiffStd > 1e-6) {
    // Both features have variance - use both
    fullX = ratingDiffs.map((rd, i) => [1, rd, hfaPoints[i]]);
  } else if (ratingDiffStd > 1e-6) {
    // Only ratingDiff has variance
    console.log(`   ⚠️  hfaPoints has zero variance, using ratingDiff only for OLS`);
    fullX = ratingDiffs.map((rd) => [1, rd]);
  } else {
    // Both have zero variance - fall back to zero model
    console.log(`   ⚠️  Both features have zero variance, using zero model for OLS`);
    results.push({
      model: 'ols_ratingdiff_hfa',
      rmse: zeroRmse,
      mae: zeroMae,
      pearson: 0,
      spearman: 0,
      signAgreement: 0,
    });
    // Skip to Core metrics
  }
  
  if (fullX) {
    try {
      const fullOls = simpleOLS(fullX, y, weights);
      results.push({
        model: 'ols_ratingdiff_hfa',
        rmse: fullOls.rmse,
        mae: fullOls.mae,
        pearson: fullOls.pearson,
        spearman: fullOls.spearman,
        signAgreement: fullOls.signAgreement,
      });
    } catch (e) {
      console.log(`   ⚠️  Full OLS failed: ${e}`);
      results.push({
        model: 'ols_ratingdiff_hfa',
        rmse: zeroRmse,
        mae: zeroMae,
        pearson: 0,
        spearman: 0,
        signAgreement: 0,
      });
    }
  }
  
  // Load Core metrics from artifacts
  const metricsPath = path.join(process.cwd(), 'reports', 'cal_fit_core.json');
  let coreMetrics: any = null;
  if (fs.existsSync(metricsPath)) {
    coreMetrics = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'));
  }
  
  if (coreMetrics && coreMetrics.walkForward) {
    results.push({
      model: 'core_current',
      rmse: coreMetrics.walkForward.metrics.rmse,
      mae: coreMetrics.walkForward.metrics.mae || 0,
      pearson: coreMetrics.walkForward.metrics.pearson,
      spearman: coreMetrics.walkForward.metrics.spearman,
      signAgreement: coreMetrics.gates?.signAgreement || 0,
    });
  }
  
  console.log(`\n   Baseline Comparison:`);
  console.log('   ' + '-'.repeat(75));
  console.log('   | Model | RMSE | MAE | Pearson | Spearman | Sign Agreement |');
  console.log('   ' + '-'.repeat(75));
  for (const r of results) {
    console.log(`   | ${r.model.padEnd(18)} | ${r.rmse.toFixed(2).padStart(5)} | ${r.mae.toFixed(2).padStart(4)} | ${r.pearson.toFixed(4).padStart(7)} | ${r.spearman.toFixed(4).padStart(8)} | ${r.signAgreement.toFixed(1).padStart(14)}% |`);
  }
  console.log('   ' + '-'.repeat(75));
  
  // Write to CSV
  const csvPath = path.join(process.cwd(), 'reports', `core_baseline_comparison_set${setLabel}.csv`);
  const csvLines = ['model_name,rmse,mae,pearson,spearman,sign_agreement'];
  for (const r of results) {
    csvLines.push(`${r.model},${r.rmse.toFixed(4)},${r.mae.toFixed(4)},${r.pearson.toFixed(4)},${r.spearman.toFixed(4)},${r.signAgreement.toFixed(2)}`);
  }
  fs.writeFileSync(csvPath, csvLines.join('\n'));
  console.log(`\n   ✅ Written to ${csvPath}`);
  
  return results;
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('CORE BASELINE COMPARISON');
  console.log('='.repeat(70));
  
  const resultsA = await compareBaselines('A');
  const resultsAB = await compareBaselines('AB');
  
  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`\nSet A: Core RMSE vs baselines`);
  if (resultsA.length >= 4) {
    console.log(`   Zero: ${resultsA[0].rmse.toFixed(2)}, HFA-only: ${resultsA[1].rmse.toFixed(2)}, OLS: ${resultsA[2].rmse.toFixed(2)}, Core: ${resultsA[3].rmse.toFixed(2)}`);
  }
  console.log(`\nSet AB: Core RMSE vs baselines`);
  if (resultsAB.length >= 4) {
    console.log(`   Zero: ${resultsAB[0].rmse.toFixed(2)}, HFA-only: ${resultsAB[1].rmse.toFixed(2)}, OLS: ${resultsAB[2].rmse.toFixed(2)}, Core: ${resultsAB[3].rmse.toFixed(2)}`);
  }
  
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(console.error);
}

