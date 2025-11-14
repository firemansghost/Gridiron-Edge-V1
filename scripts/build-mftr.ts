/**
 * Market-Fitted Team Ratings (MFTR)
 * 
 * Builds team strength ratings by solving a linear system from HMA spreads
 * with an HFA constant. This provides a market-based rating system to compare
 * against V2 ratings and create a blended rating.
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const prisma = new PrismaClient();

interface TeamRating {
  teamId: string;
  rating: number;
}

interface GameRow {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  targetSpreadHma: number;
  week: number;
}

/**
 * Build MFTR from Set A (Weeks 8-11) by solving:
 * targetSpreadHma = homeRating - awayRating + hfaConstant
 * 
 * We solve this as a least-squares problem: Ax = b
 * where x = [team_ratings..., hfa_constant]
 */
async function buildMFTR(
  season: number = 2025,
  weeks: number[] = [8, 9, 10, 11]
): Promise<{ ratings: Map<string, number>; hfaConstant: number; rmse: number; pearson: number }> {
  console.log('='.repeat(70));
  console.log(`🔧 BUILDING MARKET-FITTED TEAM RATINGS (MFTR)`);
  console.log(`   Season: ${season}, Weeks: ${weeks.join(', ')}`);
  console.log('='.repeat(70) + '\n');
  
  // Load training rows for Set A
  const rows = await prisma.gameTrainingRow.findMany({
    where: {
      season,
      week: { in: weeks },
      featureVersion: 'fe_v1',
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
    orderBy: { week: 'asc' },
  });
  
  console.log(`📊 Loaded ${rows.length} games from Set A\n`);
  
  if (rows.length < 50) {
    throw new Error(`Insufficient games for MFTR: ${rows.length} (need ≥50)`);
  }
  
  // Build game list and team set
  const games: GameRow[] = [];
  const teamSet = new Set<string>();
  
  for (const row of rows) {
    if (row.targetSpreadHma === null) continue;
    if (!row.game?.homeTeamId || !row.game?.awayTeamId) continue;
    
    games.push({
      gameId: row.gameId,
      homeTeamId: row.game.homeTeamId,
      awayTeamId: row.game.awayTeamId,
      targetSpreadHma: Number(row.targetSpreadHma),
      week: row.week,
    });
    
    teamSet.add(row.game.homeTeamId);
    teamSet.add(row.game.awayTeamId);
  }
  
  const teams = Array.from(teamSet);
  const nTeams = teams.length;
  const nGames = games.length;
  
  console.log(`   Teams: ${nTeams}, Games: ${nGames}\n`);
  
  // Build linear system: Ax = b
  // x = [team_ratings[0..nTeams-1], hfa_constant]
  // Each row: targetSpreadHma = homeRating - awayRating + hfaConstant
  // We'll use least squares: A^T A x = A^T b
  
  // Initialize matrices
  const A: number[][] = [];
  const b: number[] = [];
  
  // Create team index map
  const teamIndex = new Map<string, number>();
  teams.forEach((teamId, idx) => {
    teamIndex.set(teamId, idx);
  });
  
  // Build A and b
  for (const game of games) {
    const homeIdx = teamIndex.get(game.homeTeamId);
    const awayIdx = teamIndex.get(game.awayTeamId);
    
    if (homeIdx === undefined || awayIdx === undefined) continue;
    
    // Row: [team_ratings..., hfa_constant]
    const row = new Array(nTeams + 1).fill(0);
    row[homeIdx] = 1;   // home rating coefficient
    row[awayIdx] = -1;  // away rating coefficient (negative)
    row[nTeams] = 1;    // HFA constant coefficient
    
    A.push(row);
    b.push(game.targetSpreadHma);
  }
  
  console.log(`   Built linear system: ${A.length} equations, ${nTeams + 1} unknowns\n`);
  
  // Solve using normal equations: (A^T A) x = A^T b
  // We'll use a simple iterative solver (Gauss-Seidel) or direct solve if small
  
  // Compute A^T A
  const AtA: number[][] = [];
  for (let i = 0; i < nTeams + 1; i++) {
    AtA.push(new Array(nTeams + 1).fill(0));
  }
  
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < nTeams + 1; j++) {
      for (let k = 0; k < nTeams + 1; k++) {
        AtA[j][k] += A[i][j] * A[i][k];
      }
    }
  }
  
  // Compute A^T b
  const Atb: number[] = new Array(nTeams + 1).fill(0);
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < nTeams + 1; j++) {
      Atb[j] += A[i][j] * b[i];
    }
  }
  
  // Add regularization to make system well-conditioned
  // Add small diagonal term (ridge): (A^T A + λI) x = A^T b
  const lambda = 0.01;
  for (let i = 0; i < nTeams + 1; i++) {
    AtA[i][i] += lambda;
  }
  
  // Solve using Gaussian elimination with partial pivoting
  const x = solveLinearSystem(AtA, Atb);
  
  // Extract ratings and HFA constant
  const ratings = new Map<string, number>();
  for (let i = 0; i < nTeams; i++) {
    ratings.set(teams[i], x[i]);
  }
  const hfaConstant = x[nTeams];
  
  // Center ratings (mean = 0) for interpretability
  const ratingValues = Array.from(ratings.values());
  const meanRating = ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length;
  for (const teamId of teams) {
    ratings.set(teamId, ratings.get(teamId)! - meanRating);
  }
  
  console.log(`   ✅ Solved MFTR system\n`);
  console.log(`   HFA Constant: ${hfaConstant.toFixed(4)}\n`);
  
  // Evaluate on Set A
  const predictions: number[] = [];
  const targets: number[] = [];
  
  for (const game of games) {
    const homeRating = ratings.get(game.homeTeamId) ?? 0;
    const awayRating = ratings.get(game.awayTeamId) ?? 0;
    const pred = homeRating - awayRating + hfaConstant;
    
    predictions.push(pred);
    targets.push(game.targetSpreadHma);
  }
  
  // Compute metrics
  const meanTarget = targets.reduce((a, b) => a + b, 0) / targets.length;
  const meanPred = predictions.reduce((a, b) => a + b, 0) / predictions.length;
  
  let ssRes = 0;
  let ssTot = 0;
  let cov = 0;
  let varTarget = 0;
  let varPred = 0;
  
  for (let i = 0; i < targets.length; i++) {
    const tDev = targets[i] - meanTarget;
    const pDev = predictions[i] - meanPred;
    ssRes += Math.pow(targets[i] - predictions[i], 2);
    ssTot += tDev * tDev;
    cov += tDev * pDev;
    varTarget += tDev * tDev;
    varPred += pDev * pDev;
  }
  
  const rmse = Math.sqrt(ssRes / targets.length);
  const r2 = 1 - (ssRes / ssTot);
  const pearson = cov / (Math.sqrt(varTarget) * Math.sqrt(varPred));
  
  // Slope (OLS: target ~ pred)
  const slope = cov / varPred;
  const intercept = meanTarget - slope * meanPred;
  
  console.log(`📊 MFTR Evaluation (Set A):`);
  console.log(`   RMSE: ${rmse.toFixed(4)} (target: ≤7.0)`);
  console.log(`   R²: ${r2.toFixed(4)}`);
  console.log(`   Pearson: ${pearson.toFixed(4)} (target: ≥0.55)`);
  console.log(`   Slope: ${slope.toFixed(4)} (target: 0.90-1.10)`);
  console.log(`   Intercept: ${intercept.toFixed(4)}\n`);
  
  // Save ratings to CSV
  const ratingsArray = Array.from(ratings.entries())
    .map(([teamId, rating]) => ({ teamId, rating }))
    .sort((a, b) => b.rating - a.rating);
  
  const csvPath = path.join(process.cwd(), 'reports', 'mftr_ratings.csv');
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  
  let csv = 'teamId,rating\n';
  for (const { teamId, rating } of ratingsArray) {
    csv += `${teamId},${rating.toFixed(4)}\n`;
  }
  fs.writeFileSync(csvPath, csv);
  console.log(`   ✅ Saved ratings to ${csvPath}\n`);
  
  return { ratings, hfaConstant, rmse, pearson };
}

/**
 * Solve linear system Ax = b using Gaussian elimination with partial pivoting
 */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  const augmented: number[][] = A.map((row, i) => [...row, b[i]]);
  
  // Forward elimination with partial pivoting
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }
    
    // Swap rows
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
    
    // Eliminate
    for (let k = i + 1; k < n; k++) {
      const factor = augmented[k][i] / augmented[i][i];
      for (let j = i; j < n + 1; j++) {
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

/**
 * Compare V2 ratings vs MFTR
 */
async function compareV2vsMFTR(
  season: number,
  mftrRatings: Map<string, number>
): Promise<{ pearson: number; spearman: number; samples: Array<{ teamId: string; v2Rating: number; mftrRating: number }> }> {
  console.log('='.repeat(70));
  console.log('🔍 COMPARING V2 vs MFTR');
  console.log('='.repeat(70) + '\n');
  
  // Load V2 ratings
  const v2Ratings = await prisma.teamSeasonRating.findMany({
    where: {
      season,
      modelVersion: 'v2',
      teamId: { in: Array.from(mftrRatings.keys()) },
    },
  });
  
  const samples: Array<{ teamId: string; v2Rating: number; mftrRating: number }> = [];
  const v2Values: number[] = [];
  const mftrValues: number[] = [];
  
  for (const v2 of v2Ratings) {
    const mftr = mftrRatings.get(v2.teamId);
    if (mftr === undefined) continue;
    
    const v2Val = v2.powerRating !== null ? Number(v2.powerRating) : 0;
    v2Values.push(v2Val);
    mftrValues.push(mftr);
    samples.push({ teamId: v2.teamId, v2Rating: v2Val, mftrRating: mftr });
  }
  
  if (v2Values.length < 10) {
    throw new Error(`Insufficient overlap: ${v2Values.length} teams (need ≥10)`);
  }
  
  // Compute Pearson
  const meanV2 = v2Values.reduce((a, b) => a + b, 0) / v2Values.length;
  const meanMFTR = mftrValues.reduce((a, b) => a + b, 0) / mftrValues.length;
  
  let cov = 0;
  let varV2 = 0;
  let varMFTR = 0;
  
  for (let i = 0; i < v2Values.length; i++) {
    const v2Dev = v2Values[i] - meanV2;
    const mftrDev = mftrValues[i] - meanMFTR;
    cov += v2Dev * mftrDev;
    varV2 += v2Dev * v2Dev;
    varMFTR += mftrDev * mftrDev;
  }
  
  cov /= v2Values.length;
  varV2 /= v2Values.length;
  varMFTR /= mftrValues.length;
  
  const pearson = cov / (Math.sqrt(varV2) * Math.sqrt(varMFTR));
  
  // Compute Spearman
  const rankV2 = rankArray(v2Values);
  const rankMFTR = rankArray(mftrValues);
  
  const meanRankV2 = rankV2.reduce((a, b) => a + b, 0) / rankV2.length;
  const meanRankMFTR = rankMFTR.reduce((a, b) => a + b, 0) / rankMFTR.length;
  
  let covRank = 0;
  let varRankV2 = 0;
  let varRankMFTR = 0;
  
  for (let i = 0; i < rankV2.length; i++) {
    const v2Dev = rankV2[i] - meanRankV2;
    const mftrDev = rankMFTR[i] - meanRankMFTR;
    covRank += v2Dev * mftrDev;
    varRankV2 += v2Dev * v2Dev;
    varRankMFTR += mftrDev * mftrDev;
  }
  
  covRank /= rankV2.length;
  varRankV2 /= rankV2.length;
  varRankMFTR /= rankMFTR.length;
  
  const spearman = covRank / (Math.sqrt(varRankV2) * Math.sqrt(varRankMFTR));
  
  console.log(`📊 V2 vs MFTR Comparison:`);
  console.log(`   Teams: ${samples.length}`);
  console.log(`   Pearson: ${pearson.toFixed(4)} (target: ≥0.60)`);
  console.log(`   Spearman: ${spearman.toFixed(4)}\n`);
  
  if (pearson < 0.40) {
    console.log(`   ⚠️  WARNING: Low correlation - V2 may be mis-scaled or mis-specified\n`);
  } else if (pearson >= 0.60) {
    console.log(`   ✅ Strong correlation - V2 and MFTR are well-aligned\n`);
  } else {
    console.log(`   ⚠️  Moderate correlation - blending may help\n`);
  }
  
  // Save comparison CSV
  const csvPath = path.join(process.cwd(), 'reports', 'v2_vs_mftr.csv');
  let csv = 'teamId,v2Rating,mftrRating\n';
  for (const s of samples.sort((a, b) => b.mftrRating - a.mftrRating)) {
    csv += `${s.teamId},${s.v2Rating.toFixed(4)},${s.mftrRating.toFixed(4)}\n`;
  }
  fs.writeFileSync(csvPath, csv);
  console.log(`   ✅ Saved comparison to ${csvPath}\n`);
  
  return { pearson, spearman, samples };
}

/**
 * Rank array (1 = lowest, n = highest)
 */
function rankArray(arr: number[]): number[] {
  const indexed = arr.map((val, idx) => ({ val, idx }));
  indexed.sort((a, b) => a.val - b.val);
  
  const ranks = new Array(arr.length);
  for (let i = 0; i < indexed.length; i++) {
    ranks[indexed[i].idx] = i + 1;
  }
  
  return ranks;
}

async function main() {
  const args = process.argv.slice(2);
  let season = 2025;
  let weeks = [8, 9, 10, 11];
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && args[i + 1]) {
      season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--weeks' && args[i + 1]) {
      weeks = args[i + 1].split(',').map(w => parseInt(w.trim(), 10));
      i++;
    }
  }
  
  try {
    // Step 1: Build MFTR
    const { ratings, hfaConstant, rmse, pearson } = await buildMFTR(season, weeks);
    
    // Step 2: Compare V2 vs MFTR
    const comparison = await compareV2vsMFTR(season, ratings);
    
    // Summary
    console.log('='.repeat(70));
    console.log('✅ MFTR BUILD COMPLETE');
    console.log('='.repeat(70));
    console.log(`\n📊 Summary:`);
    console.log(`   MFTR RMSE (Set A): ${rmse.toFixed(4)} (target: ≤7.0)`);
    console.log(`   MFTR Pearson (Set A): ${pearson.toFixed(4)} (target: ≥0.55)`);
    console.log(`   V2 vs MFTR Pearson: ${comparison.pearson.toFixed(4)} (target: ≥0.60)`);
    console.log(`   HFA Constant: ${hfaConstant.toFixed(4)}\n`);
    
    console.log('📋 Next steps:');
    console.log('   1. If V2 vs MFTR Pearson < 0.60, create rating_blend = w*V2 + (1-w)*MFTR');
    console.log('   2. Search w ∈ [0..1] to maximize Set A Pearson/Spearman');
    console.log('   3. Use rating_blend in Core calibration instead of raw V2');
    console.log('   4. Re-run Core with rating_blend and verify gates pass\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

