/**
 * Phase 2.6b: Elastic Net Calibration
 * 
 * Elastic Net combines L1 (Lasso) and L2 (Ridge) regularization:
 * Penalty = α × λ × ||β||₁ + (1-α) × λ × ||β||₂²
 * 
 * Where:
 * - α = 0.0: Pure Ridge (L2 only)
 * - α = 0.5: Balanced Elastic Net
 * - α = 1.0: Pure Lasso (L1 only)
 * 
 * Features:
 * - rating_diff (away - home)
 * - rating_diff^2 (quadratic)
 * - HFA_pts (explicit, constant or team-specific)
 * - Context dummies: P5_P5, P5_G5, G5_G5
 * - Optional: talent_diff_z
 * 
 * Usage: npx tsx scripts/calibrate-model-elastic-net.ts [set] [season]
 * Example: npx tsx scripts/calibrate-model-elastic-net.ts A 2025
 *          npx tsx scripts/calibrate-model-elastic-net.ts B 2025
 */

import { prisma } from '../apps/web/lib/prisma';
import * as fs from 'fs';
import * as path from 'path';

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
  ratingDiffSq: number;
  hfa: number; // team-specific HFA in points, 0 if neutral
  isP5_P5: number;
  isP5_G5: number;
  isG5_G5: number;
  talentDiffZ: number | null;
  marketSpread: number; // home_minus_away (FIXED FRAME: positive = home favored)
  perBookCount: number;
  isPreKick: boolean;
  neutralSite: boolean;
  matchupClass: 'P5_P5' | 'P5_G5' | 'P5_FCS' | 'G5_G5' | 'G5_FCS';
}

interface ModelResult {
  coefficients: number[];
  featureNames: string[];
  rmse: number;
  r2: number;
  slope: number;
  intercept: number;
}

interface GridSearchResult {
  alpha: number;
  lambda: number;
  cvRmse: number;
  wfRmse: number;
  model: ModelResult;
}

interface BaselineResult {
  name: string;
  rmse: number;
  r2: number;
  slope: number;
  predictions: number[];
}

// ============================================================================
// DATASET CONFIGURATION
// ============================================================================

const DATASET_CONFIG = {
  A: {
    name: 'Set A (High Quality)',
    weeks: [8, 9, 10, 11],
    filterFBS: true,
    filterP5: false, // FBS only, no P5 filter
    minBooks: 3,
    preKickOnly: true, // Pre-kick only
  },
  B: {
    name: 'Set B (Broad, P5-heavy)',
    weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    filterFBS: false,
    filterP5: true, // P5_P5 + P5_G5 only
    minBooks: 3,
    preKickOnly: true, // Pre-kick only
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function winsorize(values: number[], lower: number, upper: number): number[] {
  return values.map(v => Math.max(lower, Math.min(upper, v)));
}

function standardize(values: number[]): { standardized: number[]; mean: number; std: number } {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const std = Math.sqrt(variance);
  return {
    standardized: values.map(v => std > 0.0001 ? (v - mean) / std : 0),
    mean,
    std,
  };
}

function calcMeanStdDev(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  const stddev = Math.sqrt(variance);
  return { mean, stddev };
}

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
// DATA LOADING
// ============================================================================

async function loadCalibrationData(
  season: number,
  config: typeof DATASET_CONFIG.A
): Promise<CalibrationRow[]> {
  console.log(`\n📥 Loading calibration data for ${config.name}...`);
  console.log(`   Weeks: ${config.weeks.join(', ')}`);
  console.log(`   Filters: FBS=${config.filterFBS}, P5-only=${config.filterP5}, minBooks=${config.minBooks}`);

  const rows: CalibrationRow[] = [];
  const P5_CONFERENCES = new Set(['ACC', 'Big Ten', 'B1G', 'Big 12', 'SEC', 'Pac-12', 'Pac-10']);
  const G5_CONFERENCES = new Set([
    'American Athletic', 'AAC', 'Mountain West', 'MWC', 'Sun Belt',
    'Mid-American', 'MAC', 'Conference USA', 'C-USA'
  ]);

  // Get all talent data for normalization
  const allSeasonTalent = await prisma.teamSeasonTalent.findMany({
    where: { season },
    select: { talentComposite: true, teamId: true },
  });

  const teamConferences = await prisma.team.findMany({
    where: { id: { in: allSeasonTalent.map(t => t.teamId) } },
    select: { id: true, conference: true },
  });
  const conferenceMap = new Map(teamConferences.map(t => [t.id, t.conference]));

  const isG5 = (conf: string | null) => conf !== null && G5_CONFERENCES.has(conf);
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
    g5P10 = g5TalentValues[Math.floor(g5TalentValues.length * 0.10)];
  }

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

  // Collect games
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

    const talentData = await prisma.teamSeasonTalent.findMany({
      where: { season, teamId: { in: gameTeamIds } },
    });
    const talentMap = new Map(talentData.map(t => [t.teamId, t]));

    for (const game of games) {
      // Quality filters
      if (!game.date) continue; // Missing kickoff date
      
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

      // Pre-kick filter
      if (config.preKickOnly && preKickLines.length === 0) continue;

      const linesToUse = preKickLines.length > 0 ? preKickLines : game.marketLines;
      if (linesToUse.length === 0) continue;

      // Compute consensus spread (per-book dedupe, then convert to home_minus_away)
      // Match audit script logic: normalize each line to favorite-centric first
      const spreadsByBook = new Map<string, number[]>();
      for (const line of linesToUse) {
        const book = line.bookName || 'unknown';
        const value = line.lineValue !== null && line.lineValue !== undefined ? Number(line.lineValue) : null;
        if (value === null || !isFinite(value)) continue;
        
        // Normalize to favorite-centric (negative = favorite)
        // If line has teamId, we know which team it's for
        // Otherwise, assume negative = favorite (standard convention)
        const fcValue = value < 0 ? value : -Math.abs(value);
        
        if (!spreadsByBook.has(book)) {
          spreadsByBook.set(book, []);
        }
        spreadsByBook.get(book)!.push(fcValue);
      }

      // Dedupe per book (take median)
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

      // Consensus spread (median across books) - still in favorite-centric
      const sortedSpreads = [...dedupedSpreads].sort((a, b) => a - b);
      const mid = Math.floor(sortedSpreads.length / 2);
      const consensusSpreadFC = sortedSpreads.length % 2 === 0
        ? (sortedSpreads[mid - 1] + sortedSpreads[mid]) / 2
        : sortedSpreads[mid];

      // Filter out junk
      if (Math.abs(consensusSpreadFC) > 60) continue;

      // Convert favorite-centric to home_minus_away frame
      // If favorite is home (negative), keep as-is but flip sign
      // If favorite is away (positive, shouldn't happen but handle it), flip sign
      const marketFavIsHome = consensusSpreadFC < 0;
      const marketSpreadHMA = marketFavIsHome ? -consensusSpreadFC : consensusSpreadFC;

      // FIXED FRAME: rating_diff = home - away (positive = home is better)
      const ratingDiff = homeRating - awayRating;
      const ratingDiffSq = ratingDiff * ratingDiff;

      // Matchup class
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

      // Apply filters
      if (config.filterFBS && (homeTier === 'FCS' || awayTier === 'FCS')) continue;
      if (config.filterP5) {
        const tierOrder = { P5: 3, G5: 2, FCS: 1 };
        const [higher, lower] = tierOrder[homeTier] >= tierOrder[awayTier] ? [homeTier, awayTier] : [awayTier, homeTier];
        if (!(higher === 'P5' && (lower === 'P5' || lower === 'G5'))) continue;
      }

      const tierOrder = { P5: 3, G5: 2, FCS: 1 };
      const [higher, lower] = tierOrder[homeTier] >= tierOrder[awayTier] ? [homeTier, awayTier] : [awayTier, homeTier];
      let matchupClass: 'P5_P5' | 'P5_G5' | 'P5_FCS' | 'G5_G5' | 'G5_FCS' = 'P5_P5';
      if (higher === 'P5' && lower === 'P5') matchupClass = 'P5_P5';
      else if (higher === 'P5' && lower === 'G5') matchupClass = 'P5_G5';
      else if (higher === 'P5' && lower === 'FCS') matchupClass = 'P5_FCS';
      else if (higher === 'G5' && lower === 'G5') matchupClass = 'G5_G5';
      else if (higher === 'G5' && lower === 'FCS') matchupClass = 'G5_FCS';

      const isP5_P5 = matchupClass === 'P5_P5' ? 1 : 0;
      const isP5_G5 = matchupClass === 'P5_G5' ? 1 : 0;
      const isG5_G5 = matchupClass === 'G5_G5' ? 1 : 0;

      // HFA: team-specific, 0 if neutral site
      let homeHFA = 0;
      if (!game.neutralSite) {
        homeHFA = (homeRatingRecord as any).hfaTeam !== null && (homeRatingRecord as any).hfaTeam !== undefined
          ? Number((homeRatingRecord as any).hfaTeam)
          : 2.0; // Default if team-specific not available
      }

      // Talent diff z-score
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
        ratingDiffSq,
        hfa: homeHFA,
        isP5_P5,
        isP5_G5,
        isG5_G5,
        talentDiffZ: talentDiffZ ?? 0, // Use 0 if null
        marketSpread: marketSpreadHMA, // FIXED FRAME: home_minus_away
        perBookCount: dedupedSpreads.length,
        isPreKick: preKickLines.length > 0,
        neutralSite: game.neutralSite || false,
        matchupClass,
      });
    }
  }

  console.log(`   ✅ Loaded ${rows.length} calibration rows`);
  console.log(`   Pre-kick: ${rows.filter(r => r.isPreKick).length} (${((rows.filter(r => r.isPreKick).length / rows.length) * 100).toFixed(1)}%)`);
  console.log(`   Median books: ${rows.map(r => r.perBookCount).sort((a, b) => a - b)[Math.floor(rows.length / 2)]}`);

  return rows;
}

// ============================================================================
// ELASTIC NET IMPLEMENTATION
// ============================================================================

/**
 * Elastic Net Regression
 * 
 * Minimizes: Σ(y - Xβ)² + αλ||β||₁ + (1-α)λ||β||₂²
 * 
 * Uses coordinate descent algorithm
 */
function elasticNet(
  X: number[][], // n × p feature matrix
  y: number[],   // n × 1 target vector
  alpha: number, // mixing parameter (0 = ridge, 1 = lasso)
  lambda: number, // regularization strength
  maxIter: number = 1000,
  tol: number = 1e-6
): number[] {
  const n = X.length;
  const p = X[0].length;
  
  // Initialize coefficients
  let beta = new Array(p).fill(0);
  let betaOld = new Array(p).fill(0);
  
  // Precompute X'X and X'y
  const XtX: number[][] = [];
  const Xty: number[] = [];
  
  for (let j = 0; j < p; j++) {
    XtX[j] = [];
    Xty[j] = 0;
    for (let k = 0; k < p; k++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += X[i][j] * X[i][k];
      }
      XtX[j][k] = sum;
    }
    for (let i = 0; i < n; i++) {
      Xty[j] += X[i][j] * y[i];
    }
  }
  
  // Coordinate descent
  for (let iter = 0; iter < maxIter; iter++) {
    betaOld = [...beta];
    
    for (let j = 0; j < p; j++) {
      // Calculate residual without feature j
      let rj = Xty[j];
      for (let k = 0; k < p; k++) {
        if (k !== j) {
          rj -= XtX[j][k] * beta[k];
        }
      }
      
      // Soft thresholding for L1 penalty
      const l1Penalty = alpha * lambda;
      const l2Penalty = (1 - alpha) * lambda;
      
      // Update coefficient
      const denominator = XtX[j][j] + l2Penalty;
      if (Math.abs(denominator) < 1e-10) {
        beta[j] = 0;
      } else {
        const softThreshold = Math.sign(rj) * Math.max(0, Math.abs(rj) - l1Penalty);
        beta[j] = softThreshold / denominator;
      }
    }
    
    // Check convergence
    const maxChange = Math.max(...beta.map((b, i) => Math.abs(b - betaOld[i])));
    if (maxChange < tol) break;
  }
  
  return beta;
}

// ============================================================================
// BASELINES
// ============================================================================

function baselineMean(y: number[]): BaselineResult {
  const mean = y.reduce((a, b) => a + b, 0) / y.length;
  const predictions = y.map(() => mean);
  return {
    name: 'Mean',
    rmse: rmse(y, predictions),
    r2: r2(y, predictions),
    slope: 0,
    predictions,
  };
}

function baselineLinear(X: number[][], y: number[]): BaselineResult {
  // Simple OLS: y = Xβ
  // Features: [1, ratingDiff, hfa]
  // Note: X has [intercept, ratingDiff, ratingDiffSq, hfa, ...]
  // We want: [intercept, ratingDiff, hfa] = columns [0, 1, 3]
  const n = X.length;
  const p = 3; // intercept, ratingDiff, hfa
  
  // Build reduced feature matrix (use original X columns: 0=intercept, 1=ratingDiff, 3=hfa)
  const XReduced = X.map(row => [1, row[1], row[3]]); // intercept=1, ratingDiff, hfa
  
  // Normal equation: β = (X'X)⁻¹X'y
  const XtX: number[][] = [];
  const Xty: number[] = [];
  
  for (let j = 0; j < p; j++) {
    XtX[j] = [];
    Xty[j] = 0;
    for (let k = 0; k < p; k++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += XReduced[i][j] * XReduced[i][k];
      }
      XtX[j][k] = sum;
    }
    for (let i = 0; i < n; i++) {
      Xty[j] += XReduced[i][j] * y[i];
    }
  }
  
  // Invert 3x3 matrix (simple case)
  const det = XtX[0][0] * (XtX[1][1] * XtX[2][2] - XtX[1][2] * XtX[2][1])
    - XtX[0][1] * (XtX[1][0] * XtX[2][2] - XtX[1][2] * XtX[2][0])
    + XtX[0][2] * (XtX[1][0] * XtX[2][1] - XtX[1][1] * XtX[2][0]);
  
  if (Math.abs(det) < 1e-10) {
    // Fallback to mean
    return baselineMean(y);
  }
  
  const invXtX: number[][] = [
    [
      (XtX[1][1] * XtX[2][2] - XtX[1][2] * XtX[2][1]) / det,
      -(XtX[0][1] * XtX[2][2] - XtX[0][2] * XtX[2][1]) / det,
      (XtX[0][1] * XtX[1][2] - XtX[0][2] * XtX[1][1]) / det,
    ],
    [
      -(XtX[1][0] * XtX[2][2] - XtX[1][2] * XtX[2][0]) / det,
      (XtX[0][0] * XtX[2][2] - XtX[0][2] * XtX[2][0]) / det,
      -(XtX[0][0] * XtX[1][2] - XtX[0][2] * XtX[1][0]) / det,
    ],
    [
      (XtX[1][0] * XtX[2][1] - XtX[1][1] * XtX[2][0]) / det,
      -(XtX[0][0] * XtX[2][1] - XtX[0][1] * XtX[2][0]) / det,
      (XtX[0][0] * XtX[1][1] - XtX[0][1] * XtX[1][0]) / det,
    ],
  ];
  
  const beta = invXtX.map((row, i) => row.reduce((sum, val, j) => sum + val * Xty[j], 0));
  const predictions = XReduced.map(row => row.reduce((sum, val, i) => sum + val * beta[i], 0));
  
  return {
    name: 'Linear',
    rmse: rmse(y, predictions),
    r2: r2(y, predictions),
    slope: beta[1], // ratingDiff coefficient
    predictions,
  };
}

function baselineRidge(X: number[][], y: number[], lambda: number = 0.1): BaselineResult {
  // Ridge regression: β = (X'X + λI)⁻¹X'y
  const n = X.length;
  const p = X[0].length;
  
  const XtX: number[][] = [];
  const Xty: number[] = [];
  
  for (let j = 0; j < p; j++) {
    XtX[j] = [];
    Xty[j] = 0;
    for (let k = 0; k < p; k++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += X[i][j] * X[i][k];
      }
      XtX[j][k] = sum;
    }
    for (let i = 0; i < n; i++) {
      Xty[j] += X[i][j] * y[i];
    }
  }
  
  // Add ridge penalty: X'X + λI
  for (let j = 0; j < p; j++) {
    XtX[j][j] += lambda;
  }
  
  // Solve using Gaussian elimination (simplified for small p)
  const beta = solveLinearSystem(XtX, Xty);
  const predictions = X.map(row => row.reduce((sum, val, i) => sum + val * beta[i], 0));
  
  return {
    name: 'Ridge',
    rmse: rmse(y, predictions),
    r2: r2(y, predictions),
    slope: beta[1], // ratingDiff coefficient
    predictions,
  };
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  // Simple Gaussian elimination for small systems
  const n = A.length;
  const augmented = A.map((row, i) => [...row, b[i]]);
  
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
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = augmented[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= augmented[i][j] * x[j];
    }
    x[i] /= augmented[i][i];
  }
  
  return x;
}

// ============================================================================
// CROSS-VALIDATION & WALK-FORWARD
// ============================================================================

function kFoldCV(
  X: number[][],
  y: number[],
  k: number,
  alpha: number,
  lambda: number
): number {
  const n = X.length;
  const foldSize = Math.floor(n / k);
  const rmseScores: number[] = [];
  
  for (let fold = 0; fold < k; fold++) {
    const start = fold * foldSize;
    const end = fold < k - 1 ? (fold + 1) * foldSize : n;
    
    const XTrain: number[][] = [];
    const yTrain: number[] = [];
    const XTest: number[][] = [];
    const yTest: number[] = [];
    
    for (let i = 0; i < n; i++) {
      if (i >= start && i < end) {
        XTest.push(X[i]);
        yTest.push(y[i]);
      } else {
        XTrain.push(X[i]);
        yTrain.push(y[i]);
      }
    }
    
    const beta = elasticNet(XTrain, yTrain, alpha, lambda);
    const predictions = XTest.map(row => row.reduce((sum, val, i) => sum + val * beta[i], 0));
    rmseScores.push(rmse(yTest, predictions));
  }
  
  return rmseScores.reduce((a, b) => a + b, 0) / rmseScores.length;
}

function walkForward(
  rows: CalibrationRow[],
  X: number[][],
  y: number[],
  alpha: number,
  lambda: number
): number {
  const weeks = [...new Set(rows.map(r => r.week))].sort((a, b) => a - b);
  const rmseScores: number[] = [];
  
  for (let i = 1; i < weeks.length; i++) {
    const trainWeeks = weeks.slice(0, i);
    const testWeek = weeks[i];
    
    const trainIndices: number[] = [];
    const testIndices: number[] = [];
    
    rows.forEach((row, idx) => {
      if (trainWeeks.includes(row.week)) {
        trainIndices.push(idx);
      } else if (row.week === testWeek) {
        testIndices.push(idx);
      }
    });
    
    if (trainIndices.length === 0 || testIndices.length === 0) continue;
    
    const XTrain = trainIndices.map(idx => X[idx]);
    const yTrain = trainIndices.map(idx => y[idx]);
    const XTest = testIndices.map(idx => X[idx]);
    const yTest = testIndices.map(idx => y[idx]);
    
    const beta = elasticNet(XTrain, yTrain, alpha, lambda);
    const predictions = XTest.map(row => row.reduce((sum, val, i) => sum + val * beta[i], 0));
    rmseScores.push(rmse(yTest, predictions));
  }
  
  return rmseScores.length > 0
    ? rmseScores.reduce((a, b) => a + b, 0) / rmseScores.length
    : Infinity;
}

// ============================================================================
// MAIN CALIBRATION FUNCTION
// ============================================================================

async function calibrateElasticNet(set: 'A' | 'B', season: number) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 PHASE 2.6b: ELASTIC NET CALIBRATION`);
  console.log(`${'='.repeat(70)}`);
  console.log(`   Set: ${set} - ${DATASET_CONFIG[set].name}`);
  console.log(`   Season: ${season}\n`);

  // Load data
  const rows = await loadCalibrationData(season, DATASET_CONFIG[set]);
  
  if (rows.length < 50) {
    console.error(`❌ Insufficient data: ${rows.length} rows (need ≥50)`);
    return;
  }

  // Frame check: Print first 10 rows for sanity
  console.log(`\n🔍 Frame Check (first 10 rows):`);
  console.log(`Home Team                | Away Team                | Rtg(H)  | Rtg(A)  | RD(H-A) | Mkt(H-A) | HFA  | Neutral`);
  console.log(`${'-'.repeat(100)}`);
  rows.slice(0, 10).forEach(row => {
    console.log(
      `${row.homeTeam.padEnd(23)} | ${row.awayTeam.padEnd(23)} | ${row.ratingHome.toFixed(2).padStart(7)} | ${row.ratingAway.toFixed(2).padStart(7)} | ${row.ratingDiff.toFixed(2).padStart(7)} | ${row.marketSpread.toFixed(2).padStart(8)} | ${row.hfa.toFixed(1).padStart(4)} | ${row.neutralSite ? 'Yes' : 'No'}`
    );
  });

  // Winsorize target
  const marketSpreads = rows.map(r => r.marketSpread);
  const winsorized = winsorize(marketSpreads, -35, 35);
  rows.forEach((r, i) => {
    r.marketSpread = winsorized[i];
  });

  // Build feature matrix
  const featureNames = [
    'intercept',
    'ratingDiff',
    'ratingDiffSq',
    'hfa',
    'isP5_P5',
    'isP5_G5',
    'isG5_G5',
    'talentDiffZ',
  ];

  const X = rows.map(row => [
    1, // intercept
    row.ratingDiff,
    row.ratingDiffSq,
    row.hfa,
    row.isP5_P5,
    row.isP5_G5,
    row.isG5_G5,
    row.talentDiffZ,
  ]);

  const y = rows.map(r => r.marketSpread);

  // Get feature indices early (before any modifications)
  const ratingDiffIdx = featureNames.indexOf('ratingDiff');
  const hfaIdx = featureNames.indexOf('hfa');
  const ratingDiffSqIdx = featureNames.indexOf('ratingDiffSq');
  const talentDiffZIdx = featureNames.indexOf('talentDiffZ');

  // Check for zero-variance features and drop them
  const featureVariances = featureNames.map((name, idx) => {
    const values = X.map(row => row[idx]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return { name, idx, variance };
  });

  const zeroVarianceFeatures = featureVariances.filter(f => f.variance < 1e-10 && f.name !== 'intercept');
  if (zeroVarianceFeatures.length > 0) {
    console.log(`\n⚠️  Dropping zero-variance features: ${zeroVarianceFeatures.map(f => f.name).join(', ')}`);
    // Remove from feature matrix (keep intercept - it's always 1, variance is 0 but we need it)
    const keepIndices = featureVariances
      .filter(f => f.variance >= 1e-10 || f.name === 'intercept')
      .map(f => f.idx);
    const newFeatureNames = keepIndices.map(i => featureNames[i]);
    const newX = X.map(row => keepIndices.map(i => row[i]));
    // Update references
    featureNames.length = 0;
    featureNames.push(...newFeatureNames);
    X.length = 0;
    X.push(...newX);
  }

  // Standardize continuous features (not intercept, dummies, HFA, or quadratic)
  // HFA is already in the right units (points), don't standardize
  // Quadratic term should not be standardized to preserve sign interpretation
  // Recompute indices after potential feature dropping
  const ratingDiffIdxFinal = featureNames.indexOf('ratingDiff');
  const talentDiffZIdxFinal = featureNames.indexOf('talentDiffZ');
  
  const continuousIndices: number[] = [];
  if (ratingDiffIdxFinal >= 0) {
    continuousIndices.push(ratingDiffIdxFinal);
  }
  if (talentDiffZIdxFinal >= 0) {
    continuousIndices.push(talentDiffZIdxFinal);
  }
  
  const standardizationParams: { mean: number; std: number }[] = [];
  
  for (const idx of continuousIndices) {
    const values = X.map(row => row[idx]);
    const { standardized, mean, std } = standardize(values);
    standardizationParams[idx] = { mean, std };
    X.forEach((row, i) => {
      row[idx] = standardized[i];
    });
  }

  // Grid search
  console.log(`\n🔍 Grid search over α and λ...`);
  const alphas = [0.0, 0.25, 0.5, 0.75, 1.0];
  const lambdas = [0.001, 0.01, 0.05, 0.1, 0.2, 0.5, 1, 2];
  const gridResults: GridSearchResult[] = [];

  for (const alpha of alphas) {
    for (const lambda of lambdas) {
      const cvRmse = kFoldCV(X, y, 5, alpha, lambda);
      const wfRmse = walkForward(rows, X, y, alpha, lambda);
      
      // Train on full data for final model
      const beta = elasticNet(X, y, alpha, lambda);
      const predictions = X.map(row => row.reduce((sum, val, i) => sum + val * beta[i], 0));
      
      gridResults.push({
        alpha,
        lambda,
        cvRmse,
        wfRmse,
        model: {
          coefficients: beta,
          featureNames,
          rmse: rmse(y, predictions),
          r2: r2(y, predictions),
          slope: olsSlope(predictions, y),
          intercept: beta[0],
        },
      });
    }
  }

  // Select best model (walk-forward RMSE, CV as tie-breaker)
  gridResults.sort((a, b) => {
    if (Math.abs(a.wfRmse - b.wfRmse) < 0.001) {
      return a.cvRmse - b.cvRmse;
    }
    return a.wfRmse - b.wfRmse;
  });

  const best = gridResults[0];
  console.log(`\n✅ Best model: α=${best.alpha}, λ=${best.lambda.toFixed(3)}`);
  console.log(`   Walk-forward RMSE: ${best.wfRmse.toFixed(3)}`);
  console.log(`   CV RMSE: ${best.cvRmse.toFixed(3)}`);

  // Baselines
  console.log(`\n📊 Computing baselines...`);
  const baselines = [
    baselineMean(y),
    baselineLinear(X, y),
    baselineRidge(X, y, 0.1),
  ];

  // Final model predictions
  const finalPredictions = X.map(row => 
    row.reduce((sum, val, i) => sum + val * best.model.coefficients[i], 0)
  );

  // Acceptance gates (updated per rehab plan)
  console.log(`\n🎯 Acceptance Gates:`);
  const wfRmseThreshold = set === 'A' ? 9.0 : 9.5;
  const r2Threshold = set === 'A' ? 0.20 : 0.12;
  const slopeMin = 0.9;
  const slopeMax = 1.1;
  
  // Get feature indices for gates (recompute after potential feature dropping)
  const ratingDiffIdxGate = featureNames.indexOf('ratingDiff');
  const hfaIdxGate = featureNames.indexOf('hfa');
  const ratingDiffSqIdxGate = featureNames.indexOf('ratingDiffSq');
  
  const gates = {
    wfRmse: best.wfRmse <= wfRmseThreshold,
    r2: best.model.r2 >= r2Threshold,
    slope: best.model.slope >= slopeMin && best.model.slope <= slopeMax,
    signs: {
      ratingDiff: ratingDiffIdxGate >= 0 ? best.model.coefficients[ratingDiffIdxGate] > 0 : false,
      hfa: hfaIdxGate >= 0 ? best.model.coefficients[hfaIdxGate] > 0 : false,
    },
    quadratic: ratingDiffSqIdxGate >= 0 && (best.model.coefficients[ratingDiffSqIdxGate] >= 0 || best.wfRmse < Math.min(...baselines.map(b => b.rmse))), // Allow negative if improves RMSE
  };

  console.log(`   Walk-forward RMSE ≤ ${wfRmseThreshold}: ${gates.wfRmse ? '✅' : '❌'} (${best.wfRmse.toFixed(3)})`);
  console.log(`   R² ≥ ${r2Threshold}: ${gates.r2 ? '✅' : '❌'} (${best.model.r2.toFixed(3)})`);
  console.log(`   Slope in [${slopeMin}, ${slopeMax}]: ${gates.slope ? '✅' : '❌'} (${best.model.slope.toFixed(3)})`);
  
  console.log(`   Coefficient signs:`);
  if (ratingDiffIdxGate >= 0) {
    console.log(`     ratingDiff > 0: ${gates.signs.ratingDiff ? '✅' : '❌'} (${best.model.coefficients[ratingDiffIdxGate].toFixed(4)})`);
  }
  if (hfaIdxGate >= 0) {
    console.log(`     HFA > 0: ${gates.signs.hfa ? '✅' : '❌'} (${best.model.coefficients[hfaIdxGate].toFixed(4)})`);
  }
  if (ratingDiffSqIdxGate >= 0) {
    console.log(`     ratingDiff²: ${best.model.coefficients[ratingDiffSqIdxGate].toFixed(4)} ${gates.quadratic ? '✅ (allowed negative, improves RMSE)' : best.model.coefficients[ratingDiffSqIdxGate] >= 0 ? '✅' : '⚠️ (negative, check residuals)'}`);
  }

  const allGatesPass = gates.signs.ratingDiff && gates.signs.hfa && gates.wfRmse && gates.r2 && gates.slope;
  console.log(`\n   Overall: ${allGatesPass ? '✅ GO' : '❌ NO-GO'}`);

  // Coefficient sign summary (reuse indices from gates)
  console.log(`\n📊 Coefficient Sign Summary:`);
  if (ratingDiffIdxGate >= 0) {
    console.log(`   β₁(ratingDiff) > 0: ${best.model.coefficients[ratingDiffIdxGate] > 0 ? '✅' : '❌'} (${best.model.coefficients[ratingDiffIdxGate].toFixed(4)})`);
  }
  if (hfaIdxGate >= 0) {
    console.log(`   β(HFA) > 0: ${best.model.coefficients[hfaIdxGate] > 0 ? '✅' : '❌'} (${best.model.coefficients[hfaIdxGate].toFixed(4)})`);
  }
  if (ratingDiffSqIdxGate >= 0) {
    console.log(`   β₂(ratingDiff²): ${best.model.coefficients[ratingDiffSqIdxGate].toFixed(4)} ${best.model.coefficients[ratingDiffSqIdxGate] >= 0 ? '✅' : '⚠️ (negative, check residuals)'}`);
  }
  console.log(`   Slope ≈ 1: ${gates.slope ? '✅' : '❌'} (${best.model.slope.toFixed(3)})`);

  // Residual buckets by spread size
  const residuals = y.map((actual, i) => actual - finalPredictions[i]);
  const spreadBuckets = {
    '0-7': { actual: [] as number[], pred: [] as number[], residual: [] as number[] },
    '7-14': { actual: [] as number[], pred: [] as number[], residual: [] as number[] },
    '14-28': { actual: [] as number[], pred: [] as number[], residual: [] as number[] },
    '>28': { actual: [] as number[], pred: [] as number[], residual: [] as number[] },
  };

  y.forEach((actual, i) => {
    const absSpread = Math.abs(actual);
    const bucket = absSpread <= 7 ? '0-7' : absSpread <= 14 ? '7-14' : absSpread <= 28 ? '14-28' : '>28';
    spreadBuckets[bucket].actual.push(actual);
    spreadBuckets[bucket].pred.push(finalPredictions[i]);
    spreadBuckets[bucket].residual.push(residuals[i]);
  });

  console.log(`\n📊 Residual Analysis by Spread Size:`);
  Object.entries(spreadBuckets).forEach(([bucket, data]) => {
    if (data.actual.length === 0) return;
    const bucketRmse = rmse(data.actual, data.pred);
    const bucketMeanResidual = data.residual.reduce((a, b) => a + b, 0) / data.residual.length;
    const bucketStdResidual = Math.sqrt(data.residual.reduce((sum, r) => sum + Math.pow(r - bucketMeanResidual, 2), 0) / data.residual.length);
    console.log(`   ${bucket.padEnd(6)}: n=${data.actual.length.toString().padStart(3)}, RMSE=${bucketRmse.toFixed(2)}, mean_residual=${bucketMeanResidual.toFixed(2)}, std_residual=${bucketStdResidual.toFixed(2)}`);
  });

  // Generate deliverables
  console.log(`\n📄 Generating deliverables...`);
  
  // Table
  const table = {
    dataset: DATASET_CONFIG[set].name,
    sampleSize: rows.length,
    coverage: `${rows.filter(r => r.isPreKick).length}/${rows.length} (${((rows.filter(r => r.isPreKick).length / rows.length) * 100).toFixed(1)}%)`,
    medianBooks: rows.map(r => r.perBookCount).sort((a, b) => a - b)[Math.floor(rows.length / 2)],
    cvRmse: best.cvRmse.toFixed(3),
    wfRmse: best.wfRmse.toFixed(3),
    r2: best.model.r2.toFixed(3),
    slope: best.model.slope.toFixed(3),
    alpha: best.alpha,
    lambda: best.lambda.toFixed(3),
    coefficients: best.model.coefficients.map((c, i) => ({
      feature: featureNames[i],
      value: c.toFixed(4),
    })),
  };

  // CSV predictions (home_minus_away frame)
  const csvRows = rows.map((row, i) => ({
    game_id: row.gameId,
    week: row.week,
    home_team: row.homeTeam,
    away_team: row.awayTeam,
    market_spread_home_minus_away: row.marketSpread,
    pred_spread: finalPredictions[i],
    residual: row.marketSpread - finalPredictions[i],
    books: row.perBookCount,
    matchup_class: row.matchupClass,
  }));

  // Write files
  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(reportsDir, `calib_elastic_net_set${set}.json`),
    JSON.stringify({ table, gates, baselines, gridResults: gridResults.slice(0, 10) }, null, 2)
  );

  fs.writeFileSync(
    path.join(reportsDir, `calib_preds_set${set}.csv`),
    'game_id,week,home_team,away_team,market_spread,pred_spread,residual,books,matchup_class\n' +
    csvRows.map(r => Object.values(r).join(',')).join('\n')
  );

  console.log(`   ✅ Wrote reports/calib_elastic_net_set${set}.json`);
  console.log(`   ✅ Wrote reports/calib_preds_set${set}.csv`);

  // Print summary table
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 RESULTS SUMMARY`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Dataset: ${table.dataset}`);
  console.log(`Sample size: ${table.sampleSize}`);
  console.log(`Coverage: ${table.coverage}`);
  console.log(`Median books: ${table.medianBooks}`);
  console.log(`\nBest Model (α=${table.alpha}, λ=${table.lambda}):`);
  console.log(`  Walk-forward RMSE: ${table.wfRmse}`);
  console.log(`  CV RMSE: ${table.cvRmse}`);
  console.log(`  R²: ${table.r2}`);
  console.log(`  Slope: ${table.slope}`);
  console.log(`\nCoefficients:`);
  table.coefficients.forEach(c => {
    console.log(`  ${c.feature.padEnd(15)}: ${c.value}`);
  });
  console.log(`\nBaselines:`);
  baselines.forEach(b => {
    console.log(`  ${b.name.padEnd(10)}: RMSE=${b.rmse.toFixed(3)}, R²=${b.r2.toFixed(3)}`);
  });
  console.log(`${'='.repeat(70)}\n`);

  return { table, gates, baselines, best };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: npx tsx scripts/calibrate-model-elastic-net.ts <set> <season>');
    console.error('  set: A (weeks 8-11, high quality) or B (weeks 1-11, P5-heavy)');
    console.error('  season: e.g., 2025');
    process.exit(1);
  }

  const set = args[0].toUpperCase() as 'A' | 'B';
  if (set !== 'A' && set !== 'B') {
    console.error('Error: set must be A or B');
    process.exit(1);
  }

  const season = parseInt(args[1]);
  if (isNaN(season)) {
    console.error('Error: season must be a number');
    process.exit(1);
  }

  try {
    await calibrateElasticNet(set, season);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

