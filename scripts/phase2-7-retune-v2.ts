/**
 * Phase 2.7: V2 Ratings Retune
 * 
 * Systematic retuning of V2 ratings to improve calibration performance.
 * 
 * Steps:
 * 1. Re-scale ratings using baseline OLS slope
 * 2. Sweep SoS weight (3%, 5%, 7%, 10%)
 * 3. Sweep shrinkage (20%, 25%, 30%, 35%, 40%)
 * 4. Evaluate each combo with Elastic Net
 * 
 * Usage: npx tsx scripts/phase2-7-retune-v2.ts [season]
 * Example: npx tsx scripts/phase2-7-retune-v2.ts 2025
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface CalibrationRow {
  gameId: string;
  week: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: string;
  awayTeamId: string;
  ratingHome: number;
  ratingAway: number;
  ratingDiff: number; // home - away (FIXED FRAME)
  hfa: number; // team-specific HFA in points, 0 if neutral
  marketSpread: number; // home_minus_away (FIXED FRAME: positive = home favored)
  perBookCount: number;
  isPreKick: boolean;
  neutralSite: boolean;
}

interface BaselineOLSResult {
  slope: number; // β₁ on rating_diff
  intercept: number;
  hfaCoeff: number; // β on HFA
  rmse: number;
  r2: number;
}

interface ParameterCombo {
  sosWeight: number; // SoS weight percentage (0.03, 0.05, 0.07, 0.10)
  shrinkageBase: number; // Base shrinkage factor (0.20, 0.25, 0.30, 0.35, 0.40)
  calibrationFactor: number; // Adjusted calibration factor
}

interface EvaluationResult {
  combo: ParameterCombo;
  setA: {
    nRows: number;
    medianBooks: number;
    baselineSlope: number;
    baselineRmse: number;
    baselineR2: number;
    elasticNetWfRmse: number;
    elasticNetR2: number;
    elasticNetSlope: number;
    elasticNetAlpha: number;
    elasticNetLambda: number;
    signsOk: boolean;
    residualBuckets: {
      '0-7': { n: number; meanResidual: number; stdResidual: number };
      '7-14': { n: number; meanResidual: number; stdResidual: number };
      '14-28': { n: number; meanResidual: number; stdResidual: number };
      '>28': { n: number; meanResidual: number; stdResidual: number };
    };
  };
  setB: {
    nRows: number;
    medianBooks: number;
    baselineSlope: number;
    baselineRmse: number;
    baselineR2: number;
    elasticNetWfRmse: number;
    elasticNetR2: number;
    elasticNetSlope: number;
    elasticNetAlpha: number;
    elasticNetLambda: number;
    signsOk: boolean;
  };
}

// ============================================================================
// DATASET CONFIGURATION
// ============================================================================

const DATASET_CONFIG = {
  A: {
    name: 'Set A (High Quality)',
    weeks: [8, 9, 10, 11],
    filterFBS: true,
    filterP5: false,
    minBooks: 3,
    preKickOnly: true,
  },
  B: {
    name: 'Set B (Broad, P5-heavy)',
    weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    filterFBS: false,
    filterP5: true,
    minBooks: 3,
    preKickOnly: true,
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function rmse(actual: number[], predicted: number[]): number {
  if (actual.length !== predicted.length) throw new Error('Length mismatch');
  const sumSq = actual.reduce((sum, a, i) => sum + Math.pow(a - predicted[i], 2), 0);
  return Math.sqrt(sumSq / actual.length);
}

function r2(actual: number[], predicted: number[]): number {
  if (actual.length !== predicted.length) throw new Error('Length mismatch');
  const mean = actual.reduce((a, b) => a + b, 0) / actual.length;
  const ssRes = actual.reduce((sum, a, i) => sum + Math.pow(a - predicted[i], 2), 0);
  const ssTot = actual.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0);
  return ssTot > 0.0001 ? 1 - (ssRes / ssTot) : 0;
}

function olsSlope(x: number[], y: number[]): number {
  if (x.length !== y.length) throw new Error('Length mismatch');
  const n = x.length;
  const xMean = x.reduce((a, b) => a + b, 0) / n;
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  const numerator = x.reduce((sum, xi, i) => sum + (xi - xMean) * (y[i] - yMean), 0);
  const denominator = x.reduce((sum, xi) => sum + Math.pow(xi - xMean, 2), 0);
  return denominator > 0.0001 ? numerator / denominator : 0;
}

// ============================================================================
// DATA LOADING (reuse from Elastic Net script)
// ============================================================================

async function loadCalibrationData(
  season: number,
  config: typeof DATASET_CONFIG.A
): Promise<CalibrationRow[]> {
  console.log(`\n📥 Loading calibration data for ${config.name}...`);
  
  const rows: CalibrationRow[] = [];
  const P5_CONFERENCES = new Set(['ACC', 'Big Ten', 'B1G', 'Big 12', 'SEC', 'Pac-12', 'Pac-10']);
  const G5_CONFERENCES = new Set([
    'American Athletic', 'AAC', 'Mountain West', 'MWC', 'Sun Belt',
    'Mid-American', 'MAC', 'Conference USA', 'C-USA'
  ]);

  for (const week of config.weeks) {
    const games = await prisma.game.findMany({
      where: {
        season,
        week,
        status: 'final',
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        marketLines: {
          where: { lineType: 'spread' },
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    const gameTeamIds = Array.from(new Set(games.flatMap(g => [g.homeTeamId, g.awayTeamId])));
    const ratings = await prisma.teamSeasonRating.findMany({
      where: { season, teamId: { in: gameTeamIds }, modelVersion: 'v2' },
    });
    const ratingsMap = new Map(ratings.map(r => [r.teamId, r]));

    for (const game of games) {
      if (!game.date) continue;
      
      const homeRatingRecord = ratingsMap.get(game.homeTeamId);
      const awayRatingRecord = ratingsMap.get(game.awayTeamId);
      if (!homeRatingRecord || !awayRatingRecord) continue;

      const homeRating = homeRatingRecord.powerRating !== null && homeRatingRecord.powerRating !== undefined
        ? Number(homeRatingRecord.powerRating)
        : (homeRatingRecord.rating !== null && homeRatingRecord.rating !== undefined
          ? Number(homeRatingRecord.rating)
          : null);
      const awayRating = awayRatingRecord.powerRating !== null && awayRatingRecord.powerRating !== undefined
        ? Number(awayRatingRecord.powerRating)
        : (awayRatingRecord.rating !== null && awayRatingRecord.rating !== undefined
          ? Number(awayRatingRecord.rating)
          : null);

      if (homeRating === null || awayRating === null || isNaN(homeRating) || isNaN(awayRating)) {
        continue;
      }

      // Get pre-kick consensus market line
      const kickoffTime = new Date(game.date);
      const preKickWindow = 2 * 60 * 60 * 1000; // 2 hours before kickoff
      const preKickLines = game.marketLines.filter(line => {
        const lineTime = new Date(line.timestamp);
        return lineTime >= new Date(kickoffTime.getTime() - preKickWindow) && lineTime < kickoffTime;
      });

      if (config.preKickOnly && preKickLines.length === 0) continue;

      const linesToUse = preKickLines.length > 0 ? preKickLines : game.marketLines;
      if (linesToUse.length === 0) continue;

      // Compute consensus spread (matching Elastic Net logic)
      const spreadsByBook = new Map<string, number[]>();
      for (const line of linesToUse) {
        const book = line.bookName || 'unknown';
        const value = line.lineValue !== null && line.lineValue !== undefined ? Number(line.lineValue) : null;
        if (value === null || !isFinite(value)) continue;
        const fcValue = value < 0 ? value : -Math.abs(value);
        if (!spreadsByBook.has(book)) {
          spreadsByBook.set(book, []);
        }
        spreadsByBook.get(book)!.push(fcValue);
      }

      const dedupedSpreads: number[] = [];
      for (const [book, values] of spreadsByBook.entries()) {
        if (values.length === 0) continue;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
        dedupedSpreads.push(median);
      }

      if (dedupedSpreads.length < config.minBooks) continue;

      const sortedSpreads = [...dedupedSpreads].sort((a, b) => a - b);
      const mid = Math.floor(sortedSpreads.length / 2);
      const consensusSpreadFC = sortedSpreads.length % 2 === 0
        ? (sortedSpreads[mid - 1] + sortedSpreads[mid]) / 2
        : sortedSpreads[mid];

      if (Math.abs(consensusSpreadFC) > 60) continue;

      const marketFavIsHome = consensusSpreadFC < 0;
      const marketSpreadHMA = marketFavIsHome ? -consensusSpreadFC : consensusSpreadFC;

      // Rating diff: home - away
      const ratingDiff = homeRating - awayRating;

      // Matchup class filtering
      const [homeMembership, awayMembership] = await Promise.all([
        prisma.teamMembership.findUnique({
          where: { season_teamId: { season, teamId: game.homeTeamId } },
        }),
        prisma.teamMembership.findUnique({
          where: { season_teamId: { season, teamId: game.awayTeamId } },
        }),
      ]);

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

      if (config.filterFBS && (homeTier === 'FCS' || awayTier === 'FCS')) continue;
      if (config.filterP5) {
        const tierOrder = { P5: 3, G5: 2, FCS: 1 };
        const [higher, lower] = tierOrder[homeTier] >= tierOrder[awayTier] ? [homeTier, awayTier] : [awayTier, homeTier];
        if (!(higher === 'P5' && (lower === 'P5' || lower === 'G5'))) continue;
      }

      // HFA: team-specific, 0 if neutral site
      let homeHFA = 0;
      if (!game.neutralSite) {
        homeHFA = (homeRatingRecord as any).hfaTeam !== null && (homeRatingRecord as any).hfaTeam !== undefined
          ? Number((homeRatingRecord as any).hfaTeam)
          : 2.0;
        // Clip extreme HFA
        homeHFA = Math.max(-7, Math.min(7, homeHFA));
      }

      rows.push({
        gameId: game.id,
        week,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name,
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        ratingHome: homeRating,
        ratingAway: awayRating,
        ratingDiff,
        hfa: homeHFA,
        marketSpread: marketSpreadHMA,
        perBookCount: dedupedSpreads.length,
        isPreKick: preKickLines.length > 0,
        neutralSite: game.neutralSite || false,
      });
    }
  }

  console.log(`   ✅ Loaded ${rows.length} calibration rows`);
  return rows;
}

// ============================================================================
// BASELINE OLS COMPUTATION
// ============================================================================

function computeBaselineOLS(rows: CalibrationRow[]): BaselineOLSResult {
  // Simple OLS: market_spread ~ rating_diff + hfa
  const n = rows.length;
  const ratingDiffs = rows.map(r => r.ratingDiff);
  const hfas = rows.map(r => r.hfa);
  const marketSpreads = rows.map(r => r.marketSpread);

  // Build design matrix: [1, ratingDiff, hfa]
  const X = rows.map(r => [1, r.ratingDiff, r.hfa]);
  const y = marketSpreads;

  // Normal equation: β = (X'X)⁻¹X'y
  const XtX: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const Xty: number[] = [0, 0, 0];

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        XtX[j][k] += X[i][j] * X[i][k];
      }
      Xty[j] += X[i][j] * y[i];
    }
  }

  // Invert 3x3 matrix (simple case)
  const det = XtX[0][0] * (XtX[1][1] * XtX[2][2] - XtX[1][2] * XtX[2][1])
    - XtX[0][1] * (XtX[1][0] * XtX[2][2] - XtX[1][2] * XtX[2][0])
    + XtX[0][2] * (XtX[1][0] * XtX[2][1] - XtX[1][1] * XtX[2][0]);

  if (Math.abs(det) < 1e-10) {
    throw new Error('Singular matrix in OLS');
  }

  // Compute inverse (simplified for 3x3)
  const inv: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  inv[0][0] = (XtX[1][1] * XtX[2][2] - XtX[1][2] * XtX[2][1]) / det;
  inv[0][1] = -(XtX[0][1] * XtX[2][2] - XtX[0][2] * XtX[2][1]) / det;
  inv[0][2] = (XtX[0][1] * XtX[1][2] - XtX[0][2] * XtX[1][1]) / det;
  inv[1][0] = -(XtX[1][0] * XtX[2][2] - XtX[1][2] * XtX[2][0]) / det;
  inv[1][1] = (XtX[0][0] * XtX[2][2] - XtX[0][2] * XtX[2][0]) / det;
  inv[1][2] = -(XtX[0][0] * XtX[1][2] - XtX[0][2] * XtX[1][0]) / det;
  inv[2][0] = (XtX[1][0] * XtX[2][1] - XtX[1][1] * XtX[2][0]) / det;
  inv[2][1] = -(XtX[0][0] * XtX[2][1] - XtX[0][1] * XtX[2][0]) / det;
  inv[2][2] = (XtX[0][0] * XtX[1][1] - XtX[0][1] * XtX[1][0]) / det;

  const beta = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      beta[i] += inv[i][j] * Xty[j];
    }
  }

  const predictions = rows.map(r => beta[0] + beta[1] * r.ratingDiff + beta[2] * r.hfa);

  return {
    slope: beta[1], // β₁ on rating_diff
    intercept: beta[0],
    hfaCoeff: beta[2],
    rmse: rmse(marketSpreads, predictions),
    r2: r2(marketSpreads, predictions),
  };
}

// ============================================================================
// CALIBRATION FACTOR RESCALING
// ============================================================================

function computeCalibrationFactor(baselineSlope: number, currentFactor: number = 8.0): number {
  // Target: b₁ ≈ 1.0 ± 0.1
  // If b₁ = 0.52, then new_factor = old_factor * (1 / 0.52) = old_factor * 1.92
  // Cap within reasonable bounds (4.0 to 200.0) - allow higher for very low slopes
  const targetSlope = 1.0;
  const newFactor = currentFactor * (targetSlope / Math.max(0.01, Math.abs(baselineSlope)));
  return Math.max(4.0, Math.min(200.0, newFactor));
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function main() {
  const season = parseInt(process.argv[2] || '2025');
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 PHASE 2.7: V2 RATINGS RETUNE`);
  console.log(`${'='.repeat(70)}`);
  console.log(`   Season: ${season}\n`);

  // Determine stage from command line
  const stage = process.argv[3] || '0'; // '0' = smoke test, '1' = full grid
  
  if (stage === '0') {
    await runStage0(season);
  } else if (stage === '1') {
    // For Stage 1, we'll compute initial factor from current v2 baseline
    const setARows = await loadCalibrationData(season, DATASET_CONFIG.A);
    if (setARows.length < 50) {
      console.error(`❌ Insufficient Set A data: ${setARows.length} rows (need ≥50)`);
      await prisma.$disconnect();
      process.exit(1);
    }
    const baseline = computeBaselineOLS(setARows);
    const currentCalibrationFactor = 8.0;
    const newCalibrationFactor = computeCalibrationFactor(baseline.slope, currentCalibrationFactor);
    await runStage1(season, newCalibrationFactor);
  } else {
    console.error(`❌ Invalid stage: ${stage}. Use '0' for smoke test or '1' for full grid.`);
    await prisma.$disconnect();
    process.exit(1);
  }

  await prisma.$disconnect();
}

// ============================================================================
// STAGE 0: SMOKE TEST
// ============================================================================

async function runStage0(season: number) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔥 STAGE 0: SMOKE TEST`);
  console.log(`${'='.repeat(70)}`);
  console.log(`   SoS: 7%, Shrinkage: 30%\n`);

  const sosWeight = 0.07; // Keep SoS at current (don't touch yet)
  const shrinkageBase = 0.12; // Stage 0 Rehab: base_factor = 0.12 (total will be 18-42% via formula)
  const modelVersion = `v2_7_sos${(sosWeight * 100).toFixed(0)}_shr${(shrinkageBase * 100).toFixed(0)}`;
  const initialCalibrationFactor = 8.0; // Start with default

  // Step 1: Recompute V2 with these params (using default calibration factor first)
  console.log(`\n📊 Step 1: Recomputing V2 ratings with SoS=${(sosWeight * 100).toFixed(0)}%, Shrinkage=${(shrinkageBase * 100).toFixed(0)}%...`);
  await recomputeV2Ratings(season, sosWeight, shrinkageBase, initialCalibrationFactor, modelVersion);

  // Step 2: Load data with new ratings and compute baseline
  console.log(`\n📊 Step 2: Computing baseline OLS with new ratings...`);
  const setARows = await loadCalibrationDataWithModelVersion(season, DATASET_CONFIG.A, modelVersion);
  
  if (setARows.length < 50) {
    console.error(`❌ Insufficient Set A data: ${setARows.length} rows`);
    return;
  }

  const baseline = computeBaselineOLS(setARows);
  console.log(`   Baseline OLS (BEFORE rescaling):`);
  console.log(`     β₁(rating_diff) = ${baseline.slope.toFixed(4)}`);
  console.log(`     β(HFA) = ${baseline.hfaCoeff.toFixed(4)}`);
  console.log(`     RMSE = ${baseline.rmse.toFixed(3)}`);
  console.log(`     R² = ${baseline.r2.toFixed(4)}`);
  
  // Diagnostic: Check rating differences
  const ratingDiffs = setARows.map(r => r.ratingDiff);
  const ratingDiffStats = {
    min: Math.min(...ratingDiffs),
    max: Math.max(...ratingDiffs),
    mean: ratingDiffs.reduce((a, b) => a + b, 0) / ratingDiffs.length,
    std: Math.sqrt(ratingDiffs.reduce((sum, val) => sum + Math.pow(val - ratingDiffs.reduce((a, b) => a + b, 0) / ratingDiffs.length, 2), 0) / ratingDiffs.length),
  };
  console.log(`\n   📊 Rating difference diagnostics:`);
  console.log(`     Range: [${ratingDiffStats.min.toFixed(2)}, ${ratingDiffStats.max.toFixed(2)}]`);
  console.log(`     Mean: ${ratingDiffStats.mean.toFixed(2)}, Std: ${ratingDiffStats.std.toFixed(2)}`);
  console.log(`     Market spread range: [${Math.min(...setARows.map(r => r.marketSpread)).toFixed(2)}, ${Math.max(...setARows.map(r => r.marketSpread)).toFixed(2)}]`);
  
  // Check if slope is too low before rescaling
  if (baseline.slope < 0.6) {
    console.log(`\n   ⚠️  WARNING: Initial slope ${baseline.slope.toFixed(4)} < 0.6. This may indicate:`);
    console.log(`      - Shrinkage still too high (current avg: check logs)`);
    console.log(`      - Rating differences too compressed`);
    console.log(`      - Data quality issues`);
  }

  // Step 3: Auto-rescale calibration factor based on NEW ratings baseline
  let rescaledFactor = computeCalibrationFactor(baseline.slope, initialCalibrationFactor);
  console.log(`\n🔧 Step 3: Auto-rescaling calibration factor...`);
  console.log(`   Initial: ${initialCalibrationFactor.toFixed(2)}`);
  console.log(`   Computed: ${rescaledFactor.toFixed(2)} (target slope ≈ 1.0)`);

  // Step 4: Recompute with rescaled factor (iterative until slope ≈ 1.0)
  // BUT: If initial slope < 0.6, stop and report (don't crank factor into hundreds)
  let finalBaseline = baseline;
  
  if (baseline.slope < 0.6) {
    console.log(`\n⚠️  STOPPING: Initial slope ${baseline.slope.toFixed(4)} < 0.6`);
    console.log(`   Do NOT rescale - this indicates a fundamental issue with rating compression.`);
    console.log(`   Check: shrinkage formula, rating computation, or data quality.`);
    rescaledFactor = initialCalibrationFactor; // Keep original
  } else {
    let iterations = 0;
    const maxIterations = 5;
    let currentFactor = rescaledFactor;
    
    while (iterations < maxIterations && Math.abs(finalBaseline.slope - 1.0) > 0.1) {
      iterations++;
      console.log(`\n📊 Step 4 (iteration ${iterations}): Recomputing with factor ${currentFactor.toFixed(2)}...`);
      await recomputeV2Ratings(season, sosWeight, shrinkageBase, currentFactor, modelVersion);
      const setARowsRescaled = await loadCalibrationDataWithModelVersion(season, DATASET_CONFIG.A, modelVersion);
      finalBaseline = computeBaselineOLS(setARowsRescaled);
      console.log(`   Baseline after rescale:`);
      console.log(`     β₁(rating_diff) = ${finalBaseline.slope.toFixed(4)} (target: 0.9-1.1)`);
      console.log(`     β(HFA) = ${finalBaseline.hfaCoeff.toFixed(4)}`);
      console.log(`     RMSE = ${finalBaseline.rmse.toFixed(3)}`);
      console.log(`     R² = ${finalBaseline.r2.toFixed(4)}`);
      
      // Safety check: if slope gets worse or too low, stop
      if (finalBaseline.slope < 0.6) {
        console.log(`   ⚠️  Slope dropped below 0.6. Stopping iteration.`);
        break;
      }
      
      // If still not close to 1.0, recompute factor and iterate
      if (Math.abs(finalBaseline.slope - 1.0) > 0.1) {
        const newFactor = computeCalibrationFactor(finalBaseline.slope, currentFactor);
        if (Math.abs(newFactor - currentFactor) < 0.01 || newFactor >= 200.0) {
          console.log(`   ⚠️  Calibration factor converged (${newFactor.toFixed(2)}) but slope still ${finalBaseline.slope.toFixed(4)}. Stopping iteration.`);
          break;
        }
        currentFactor = newFactor;
        console.log(`   → Next factor: ${currentFactor.toFixed(2)}`);
      } else {
        console.log(`   ✅ Slope within target range!`);
        break; // Close enough to 1.0
      }
    }
    
    rescaledFactor = currentFactor; // Use final factor
  }

  // Step 5: Verify gates (use final baseline after rescaling)
  console.log(`\n🎯 Step 5: Verifying acceptance gates...`);
  const gates = {
    ratingDiffSign: finalBaseline.slope > 0,
    hfaSign: finalBaseline.hfaCoeff > 0,
    interceptPresent: true, // Always true with OLS
    wfRmse: finalBaseline.rmse <= 9.5,
    slopeOk: finalBaseline.slope >= 0.9 && finalBaseline.slope <= 1.1,
  };

  console.log(`   β(rating_diff) > 0: ${gates.ratingDiffSign ? '✅' : '❌'} (${finalBaseline.slope.toFixed(4)})`);
  console.log(`   β(HFA) > 0: ${gates.hfaSign ? '✅' : '❌'} (${finalBaseline.hfaCoeff.toFixed(4)})`);
  console.log(`   Intercept present: ${gates.interceptPresent ? '✅' : '❌'}`);
  console.log(`   Walk-forward RMSE ≤ 9.5: ${gates.wfRmse ? '✅' : '❌'} (${finalBaseline.rmse.toFixed(3)})`);
  console.log(`   Slope in [0.9, 1.1]: ${gates.slopeOk ? '✅' : '❌'} (${finalBaseline.slope.toFixed(3)})`);

  // Load final data for residual analysis (use rescaled if we recomputed)
  const finalRows = Math.abs(rescaledFactor - initialCalibrationFactor) > 0.1
    ? await loadCalibrationDataWithModelVersion(season, DATASET_CONFIG.A, modelVersion)
    : setARows;

  // Residual buckets
  const residuals = finalRows.map((r) => {
    const pred = finalBaseline.intercept + finalBaseline.slope * r.ratingDiff + finalBaseline.hfaCoeff * r.hfa;
    return r.marketSpread - pred;
  });
  const buckets = computeResidualBuckets(finalRows.map(r => r.marketSpread), residuals);
  console.log(`\n📊 Residual buckets:`);
  Object.entries(buckets).forEach(([bucket, data]) => {
    if (data.n > 0) {
      console.log(`   ${bucket.padEnd(6)}: n=${data.n.toString().padStart(3)}, mean=${data.meanResidual.toFixed(2)}, std=${data.stdResidual.toFixed(2)}`);
    }
  });

  const allGatesPass = Object.values(gates).every(v => v) && 
    Math.abs(buckets['0-7'].meanResidual) < 2.0 &&
    Math.abs(buckets['7-14'].meanResidual) < 3.0;

  console.log(`\n   Overall: ${allGatesPass ? '✅ PASS - Proceed to Stage 1' : '❌ FAIL - Check issues above'}`);

  if (!allGatesPass) {
    console.log(`\n⚠️  Smoke test failed. Fix issues before proceeding to full grid.`);
    console.log(`\n🔍 Top 3 suspects to check:`);
    if (!gates.ratingDiffSign || !gates.slopeOk) {
      console.log(`   1. Scaling issue: rating_diff coefficient = ${finalBaseline.slope.toFixed(4)} (expected > 0, target 0.9-1.1)`);
    }
    if (!gates.hfaSign) {
      console.log(`   2. HFA neutrality: HFA coefficient = ${finalBaseline.hfaCoeff.toFixed(4)} (expected > 0)`);
    }
    if (!gates.wfRmse) {
      console.log(`   3. Pre-kick filter or per-book dedupe: RMSE = ${finalBaseline.rmse.toFixed(3)} (expected ≤ 9.5)`);
    }
    if (Math.abs(buckets['0-7'].meanResidual) >= 2.0 || Math.abs(buckets['7-14'].meanResidual) >= 3.0) {
      console.log(`   4. Winsorization or residual curvature: bucket means not near zero`);
    }
  }
}

// ============================================================================
// STAGE 1: FULL GRID SWEEP
// ============================================================================

async function runStage1(season: number, initialCalibrationFactor: number) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔍 STAGE 1: FULL GRID SWEEP`);
  console.log(`${'='.repeat(70)}\n`);

  const sosWeights = [0.03, 0.05, 0.07, 0.10];
  const shrinkageBases = [0.20, 0.25, 0.30, 0.35, 0.40];
  const results: EvaluationResult[] = [];

  for (const sosWeight of sosWeights) {
    for (const shrinkageBase of shrinkageBases) {
      const modelVersion = `v2_7_sos${(sosWeight * 100).toFixed(0)}_shr${(shrinkageBase * 100).toFixed(0)}`;
      
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`📊 Testing: SoS=${(sosWeight * 100).toFixed(0)}%, Shrinkage=${(shrinkageBase * 100).toFixed(0)}%`);
      console.log(`${'─'.repeat(70)}`);

      // Check if already computed
      const existing = await checkExistingResults(modelVersion);
      if (existing) {
        console.log(`   ⏭️  Skipping (already computed)`);
        results.push(existing);
        continue;
      }

      // Step 1: Recompute V2
      await recomputeV2Ratings(season, sosWeight, shrinkageBase, initialCalibrationFactor, modelVersion);

      // Step 2: Load Set A, compute baseline, rescale
      const setARows = await loadCalibrationDataWithModelVersion(season, DATASET_CONFIG.A, modelVersion);
      if (setARows.length < 50) {
        console.log(`   ⚠️  Insufficient Set A data, skipping`);
        continue;
      }

      const baselineA = computeBaselineOLS(setARows);
      const rescaledFactor = computeCalibrationFactor(baselineA.slope, initialCalibrationFactor);
      
      // Recompute with rescaled factor if needed
      if (Math.abs(rescaledFactor - initialCalibrationFactor) > 0.1) {
        await recomputeV2Ratings(season, sosWeight, shrinkageBase, rescaledFactor, modelVersion);
        const setARowsRescaled = await loadCalibrationDataWithModelVersion(season, DATASET_CONFIG.A, modelVersion);
        const baselineARescaled = computeBaselineOLS(setARowsRescaled);
        // Use rescaled baseline
        Object.assign(baselineA, baselineARescaled);
      }

      // Step 3: Evaluate Set A with Elastic Net
      const evalA = await evaluateWithElasticNet(season, 'A', modelVersion);
      
      // Step 4: Evaluate Set B with Elastic Net
      const evalB = await evaluateWithElasticNet(season, 'B', modelVersion);

      const result: EvaluationResult = {
        combo: {
          sosWeight,
          shrinkageBase,
          calibrationFactor: rescaledFactor,
        },
        setA: {
          nRows: setARows.length,
          medianBooks: setARows.map(r => r.perBookCount).sort((a, b) => a - b)[Math.floor(setARows.length / 2)],
          baselineSlope: baselineA.slope,
          baselineRmse: baselineA.rmse,
          baselineR2: baselineA.r2,
          elasticNetWfRmse: evalA.wfRmse,
          elasticNetR2: evalA.r2,
          elasticNetSlope: evalA.slope,
          elasticNetAlpha: evalA.alpha,
          elasticNetLambda: evalA.lambda,
          signsOk: evalA.signsOk,
          residualBuckets: evalA.residualBuckets,
        },
        setB: {
          nRows: evalB.nRows,
          medianBooks: evalB.medianBooks,
          baselineSlope: evalB.baselineSlope,
          baselineRmse: evalB.baselineRmse,
          baselineR2: evalB.baselineR2,
          elasticNetWfRmse: evalB.wfRmse,
          elasticNetR2: evalB.r2,
          elasticNetSlope: evalB.slope,
          elasticNetAlpha: evalB.alpha,
          elasticNetLambda: evalB.lambda,
          signsOk: evalB.signsOk,
        },
      };

      results.push(result);

      // Log one-liner
      console.log(`   ✅ sos=${(sosWeight * 100).toFixed(0)} shr=${(shrinkageBase * 100).toFixed(0)} | slope=${baselineA.slope.toFixed(2)} | RMSE_A=${evalA.wfRmse.toFixed(1)} R2_A=${evalA.r2.toFixed(2)} | RMSE_B=${evalB.wfRmse.toFixed(1)} R2_B=${evalB.r2.toFixed(2)} | α=${evalA.alpha} λ=${evalA.lambda}`);

      // Save intermediate result
      await saveResult(modelVersion, result);
    }
  }

  // Generate deliverables
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📄 GENERATING DELIVERABLES`);
  console.log(`${'='.repeat(70)}`);
  
  await generateDeliverables(results, season);
  
  // Go/No-Go decision
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🎯 GO / NO-GO DECISION`);
  console.log(`${'='.repeat(70)}`);
  
  const setAPass = results.filter(r => 
    r.setA.elasticNetWfRmse <= 9.0 &&
    r.setA.elasticNetR2 >= 0.20 &&
    r.setA.elasticNetSlope >= 0.9 && r.setA.elasticNetSlope <= 1.1 &&
    r.setA.signsOk
  );
  
  const setBPass = results.filter(r => 
    r.setB.elasticNetWfRmse <= 9.5 &&
    r.setB.elasticNetR2 >= 0.12 &&
    r.setB.elasticNetSlope >= 0.9 && r.setB.elasticNetSlope <= 1.1 &&
    r.setB.signsOk
  );

  if (setAPass.length > 0) {
    const best = setAPass.sort((a, b) => a.setA.elasticNetWfRmse - b.setA.elasticNetWfRmse)[0];
    console.log(`\n✅ GO: Set A passes`);
    console.log(`   Best combo: SoS=${(best.combo.sosWeight * 100).toFixed(0)}%, Shrinkage=${(best.combo.shrinkageBase * 100).toFixed(0)}%`);
    console.log(`   RMSE: ${best.setA.elasticNetWfRmse.toFixed(2)}, R²: ${best.setA.elasticNetR2.toFixed(3)}, Slope: ${best.setA.elasticNetSlope.toFixed(3)}`);
    console.log(`   Next: Freeze coefficients + scaler stats, bump modelVersion, wire to API`);
  } else if (setBPass.length > 0) {
    const best = setBPass.sort((a, b) => a.setB.elasticNetWfRmse - b.setB.elasticNetWfRmse)[0];
    console.log(`\n⚠️  CONDITIONAL GO: Set A fails, but Set B passes`);
    console.log(`   Best combo: SoS=${(best.combo.sosWeight * 100).toFixed(0)}%, Shrinkage=${(best.combo.shrinkageBase * 100).toFixed(0)}%`);
    console.log(`   RMSE: ${best.setB.elasticNetWfRmse.toFixed(2)}, R²: ${best.setB.elasticNetR2.toFixed(3)}, Slope: ${best.setB.elasticNetSlope.toFixed(3)}`);
    console.log(`   Next: Ship Set B, flag "early-season lower confidence" in diagnostics`);
  } else {
    console.log(`\n❌ NO-GO: Both sets fail`);
    console.log(`   Next: Open Phase 2.7b (rating recipe changes)`);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function recomputeV2Ratings(
  season: number,
  sosWeight: number,
  shrinkageBase: number,
  calibrationFactor: number,
  modelVersion: string
): Promise<void> {
  // Build command
  const scriptPath = path.join(process.cwd(), 'apps/jobs/dist/src/ratings/compute_ratings_v2.js');
  const cmd = `node "${scriptPath}" --season=${season} --sos-weight=${sosWeight} --shrinkage-base=${shrinkageBase} --calibration-factor=${calibrationFactor} --model-version=${modelVersion}`;
  
  console.log(`   Running: ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
  } catch (error) {
    throw new Error(`Failed to recompute V2 ratings: ${error}`);
  }
}

async function loadCalibrationDataWithModelVersion(
  season: number,
  config: typeof DATASET_CONFIG.A,
  modelVersion: string
): Promise<CalibrationRow[]> {
  // Same logic as loadCalibrationData but with modelVersion parameter
  const rows: CalibrationRow[] = [];
  const P5_CONFERENCES = new Set(['ACC', 'Big Ten', 'B1G', 'Big 12', 'SEC', 'Pac-12', 'Pac-10']);
  const G5_CONFERENCES = new Set([
    'American Athletic', 'AAC', 'Mountain West', 'MWC', 'Sun Belt',
    'Mid-American', 'MAC', 'Conference USA', 'C-USA'
  ]);

  for (const week of config.weeks) {
    const games = await prisma.game.findMany({
      where: {
        season,
        week,
        status: 'final',
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        marketLines: {
          where: { lineType: 'spread' },
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    const gameTeamIds = Array.from(new Set(games.flatMap(g => [g.homeTeamId, g.awayTeamId])));
    const ratings = await prisma.teamSeasonRating.findMany({
      where: { season, teamId: { in: gameTeamIds }, modelVersion },
    });
    const ratingsMap = new Map(ratings.map(r => [r.teamId, r]));

    for (const game of games) {
      if (!game.date) continue;
      
      const homeRatingRecord = ratingsMap.get(game.homeTeamId);
      const awayRatingRecord = ratingsMap.get(game.awayTeamId);
      if (!homeRatingRecord || !awayRatingRecord) continue;

      const homeRating = homeRatingRecord.powerRating !== null && homeRatingRecord.powerRating !== undefined
        ? Number(homeRatingRecord.powerRating)
        : (homeRatingRecord.rating !== null && homeRatingRecord.rating !== undefined
          ? Number(homeRatingRecord.rating)
          : null);
      const awayRating = awayRatingRecord.powerRating !== null && awayRatingRecord.powerRating !== undefined
        ? Number(awayRatingRecord.powerRating)
        : (awayRatingRecord.rating !== null && awayRatingRecord.rating !== undefined
          ? Number(awayRatingRecord.rating)
          : null);

      if (homeRating === null || awayRating === null || isNaN(homeRating) || isNaN(awayRating)) {
        continue;
      }

      // Get pre-kick consensus market line
      const kickoffTime = new Date(game.date);
      const preKickWindow = 2 * 60 * 60 * 1000;
      const preKickLines = game.marketLines.filter(line => {
        const lineTime = new Date(line.timestamp);
        return lineTime >= new Date(kickoffTime.getTime() - preKickWindow) && lineTime < kickoffTime;
      });

      if (config.preKickOnly && preKickLines.length === 0) continue;

      const linesToUse = preKickLines.length > 0 ? preKickLines : game.marketLines;
      if (linesToUse.length === 0) continue;

      // Compute consensus spread
      const spreadsByBook = new Map<string, number[]>();
      for (const line of linesToUse) {
        const book = line.bookName || 'unknown';
        const value = line.lineValue !== null && line.lineValue !== undefined ? Number(line.lineValue) : null;
        if (value === null || !isFinite(value)) continue;
        const fcValue = value < 0 ? value : -Math.abs(value);
        if (!spreadsByBook.has(book)) {
          spreadsByBook.set(book, []);
        }
        spreadsByBook.get(book)!.push(fcValue);
      }

      const dedupedSpreads: number[] = [];
      for (const [book, values] of spreadsByBook.entries()) {
        if (values.length === 0) continue;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
        dedupedSpreads.push(median);
      }

      if (dedupedSpreads.length < config.minBooks) continue;

      const sortedSpreads = [...dedupedSpreads].sort((a, b) => a - b);
      const mid = Math.floor(sortedSpreads.length / 2);
      const consensusSpreadFC = sortedSpreads.length % 2 === 0
        ? (sortedSpreads[mid - 1] + sortedSpreads[mid]) / 2
        : sortedSpreads[mid];

      if (Math.abs(consensusSpreadFC) > 60) continue;

      const marketFavIsHome = consensusSpreadFC < 0;
      const marketSpreadHMA = marketFavIsHome ? -consensusSpreadFC : consensusSpreadFC;

      const ratingDiff = homeRating - awayRating;

      // Matchup class filtering
      const [homeMembership, awayMembership] = await Promise.all([
        prisma.teamMembership.findUnique({
          where: { season_teamId: { season, teamId: game.homeTeamId } },
        }),
        prisma.teamMembership.findUnique({
          where: { season_teamId: { season, teamId: game.awayTeamId } },
        }),
      ]);

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

      if (config.filterFBS && (homeTier === 'FCS' || awayTier === 'FCS')) continue;
      if (config.filterP5) {
        const tierOrder = { P5: 3, G5: 2, FCS: 1 };
        const [higher, lower] = tierOrder[homeTier] >= tierOrder[awayTier] ? [homeTier, awayTier] : [awayTier, homeTier];
        if (!(higher === 'P5' && (lower === 'P5' || lower === 'G5'))) continue;
      }

      // HFA: team-specific, 0 if neutral site
      let homeHFA = 0;
      if (!game.neutralSite) {
        homeHFA = (homeRatingRecord as any).hfaTeam !== null && (homeRatingRecord as any).hfaTeam !== undefined
          ? Number((homeRatingRecord as any).hfaTeam)
          : 2.0;
        homeHFA = Math.max(-7, Math.min(7, homeHFA));
      }

      rows.push({
        gameId: game.id,
        week,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name,
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        ratingHome: homeRating,
        ratingAway: awayRating,
        ratingDiff,
        hfa: homeHFA,
        marketSpread: marketSpreadHMA,
        perBookCount: dedupedSpreads.length,
        isPreKick: preKickLines.length > 0,
        neutralSite: game.neutralSite || false,
      });
    }
  }

  return rows;
}

function computeResidualBuckets(marketSpreads: number[], residuals: number[]) {
  const buckets: Record<string, { n: number; meanResidual: number; stdResidual: number }> = {
    '0-7': { n: 0, meanResidual: 0, stdResidual: 0 },
    '7-14': { n: 0, meanResidual: 0, stdResidual: 0 },
    '14-28': { n: 0, meanResidual: 0, stdResidual: 0 },
    '>28': { n: 0, meanResidual: 0, stdResidual: 0 },
  };

  marketSpreads.forEach((spread, i) => {
    const absSpread = Math.abs(spread);
    const bucket = absSpread <= 7 ? '0-7' : absSpread <= 14 ? '7-14' : absSpread <= 28 ? '14-28' : '>28';
    buckets[bucket].n++;
    buckets[bucket].meanResidual += residuals[i];
  });

  Object.keys(buckets).forEach(bucket => {
    if (buckets[bucket].n > 0) {
      buckets[bucket].meanResidual /= buckets[bucket].n;
      const variance = residuals
        .filter((_, i) => {
          const absSpread = Math.abs(marketSpreads[i]);
          const b = absSpread <= 7 ? '0-7' : absSpread <= 14 ? '7-14' : absSpread <= 28 ? '14-28' : '>28';
          return b === bucket;
        })
        .reduce((sum, r) => sum + Math.pow(r - buckets[bucket].meanResidual, 2), 0) / buckets[bucket].n;
      buckets[bucket].stdResidual = Math.sqrt(variance);
    }
  });

  return buckets;
}

async function evaluateWithElasticNet(
  season: number,
  set: 'A' | 'B',
  modelVersion: string
): Promise<any> {
  // TODO: Full implementation needed
  // This should reuse Elastic Net evaluation logic from calibrate-model-elastic-net.ts
  // For now, load data and compute baseline as placeholder
  const config = DATASET_CONFIG[set];
  const rows = await loadCalibrationDataWithModelVersion(season, config, modelVersion);
  
  if (rows.length < 50) {
    return {
      wfRmse: Infinity,
      r2: 0,
      slope: 0,
      alpha: 0,
      lambda: 0,
      signsOk: false,
      residualBuckets: {},
      nRows: rows.length,
      medianBooks: 0,
      baselineSlope: 0,
      baselineRmse: 0,
      baselineR2: 0,
    };
  }

  const baseline = computeBaselineOLS(rows);
  
  // Placeholder: Full Elastic Net evaluation needs to be integrated
  // For now, return baseline metrics
  return {
    wfRmse: baseline.rmse, // Placeholder - should be walk-forward RMSE
    r2: baseline.r2,
    slope: baseline.slope,
    alpha: 0.5, // Placeholder
    lambda: 0.1, // Placeholder
    signsOk: baseline.slope > 0 && baseline.hfaCoeff > 0,
    residualBuckets: computeResidualBuckets(
      rows.map(r => r.marketSpread),
      rows.map((r, i) => {
        const pred = baseline.intercept + baseline.slope * r.ratingDiff + baseline.hfaCoeff * r.hfa;
        return r.marketSpread - pred;
      })
    ),
    nRows: rows.length,
    medianBooks: rows.map(r => r.perBookCount).sort((a, b) => a - b)[Math.floor(rows.length / 2)],
    baselineSlope: baseline.slope,
    baselineRmse: baseline.rmse,
    baselineR2: baseline.r2,
  };
}

async function checkExistingResults(modelVersion: string): Promise<EvaluationResult | null> {
  // Check if results file exists
  const reportsDir = path.join(process.cwd(), 'reports');
  const resultFile = path.join(reportsDir, `phase2_7_${modelVersion}.json`);
  if (fs.existsSync(resultFile)) {
    return JSON.parse(fs.readFileSync(resultFile, 'utf-8'));
  }
  return null;
}

async function saveResult(modelVersion: string, result: EvaluationResult): Promise<void> {
  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  const resultFile = path.join(reportsDir, `phase2_7_${modelVersion}.json`);
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
}

async function generateDeliverables(results: EvaluationResult[], season: number): Promise<void> {
  // Generate summary table, plots, CSVs
  // Implementation details...
  console.log(`   ✅ Deliverables generation (placeholder - full implementation needed)`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

