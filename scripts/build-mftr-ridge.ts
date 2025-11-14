/**
 * Market-Fitted Team Ratings (MFTR) with Ridge Prior
 * 
 * Builds team strength ratings by solving a linear system from HMA spreads
 * with an HFA constant, using a ridge prior toward Talent + Returning Production.
 * This prevents overfitting to Set A by tethering teams to plausible priors.
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const prisma = new PrismaClient();

interface GameRow {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  targetSpreadHma: number;
  week: number;
  setLabel: string;
  rowWeight: number;
}

/**
 * Build MFTR with ridge prior from Weeks 1-11
 * 
 * Objective: minimize ||Ax - b||² + λ ||s - s_prior||²
 * where s_prior = standardized blend of Talent + Returning Production
 */
async function buildMFTRRidge(
  season: number = 2025,
  weeks: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  lambda: number = 0.1
): Promise<{
  ratings: Map<string, number>;
  hfaConstant: number;
  rmse: number;
  pearson: number;
  spearman: number;
  lambda: number;
}> {
  console.log('='.repeat(70));
  console.log(`🔧 BUILDING MARKET-FITTED TEAM RATINGS (MFTR) WITH RIDGE PRIOR`);
  console.log(`   Season: ${season}, Weeks: ${weeks.join(', ')}`);
  console.log(`   Lambda (ridge): ${lambda}`);
  console.log('='.repeat(70) + '\n');
  
  // Load training rows (Set A + Set B)
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
  
  console.log(`📊 Loaded ${rows.length} games from Weeks ${weeks[0]}-${weeks[weeks.length - 1]}\n`);
  
  // Trim outliers: exclude |market| > 35
  const filteredRows = rows.filter(r => {
    const spread = Math.abs(Number(r.targetSpreadHma!));
    return spread <= 35;
  });
  
  console.log(`   Trimmed outliers: ${rows.length - filteredRows.length} games with |market| > 35\n`);
  
  if (filteredRows.length < 50) {
    throw new Error(`Insufficient games for MFTR: ${filteredRows.length} (need ≥50)`);
  }
  
  // Build game list and team set
  const games: GameRow[] = [];
  const teamSet = new Set<string>();
  
  for (const row of filteredRows) {
    if (row.targetSpreadHma === null) continue;
    if (!row.game?.homeTeamId || !row.game?.awayTeamId) continue;
    
    games.push({
      gameId: row.gameId,
      homeTeamId: row.game.homeTeamId,
      awayTeamId: row.game.awayTeamId,
      targetSpreadHma: Number(row.targetSpreadHma),
      week: row.week,
      setLabel: row.setLabel || 'A',
      rowWeight: row.rowWeight !== null ? Number(row.rowWeight) : 1.0,
    });
    
    teamSet.add(row.game.homeTeamId);
    teamSet.add(row.game.awayTeamId);
  }
  
  const teams = Array.from(teamSet);
  const nTeams = teams.length;
  const nGames = games.length;
  
  console.log(`   Teams: ${nTeams}, Games: ${nGames}\n`);
  
  // Load priors (Talent + Returning Production) from team_game_adj
  console.log(`   Loading priors (Talent + Returning Production)...`);
  const teamPriors = new Map<string, { talent: number; returning: number }>();
  
  // Get latest team_game_adj for each team (use any week, they're season-level)
  const teamFeatures = await prisma.teamGameAdj.findMany({
    where: {
      season,
      teamId: { in: teams },
      featureVersion: 'fe_v1',
      talent247: { not: null },
    },
    distinct: ['teamId'],
    orderBy: { week: 'desc' },
  });
  
  for (const feat of teamFeatures) {
    const talent = feat.talent247 !== null ? Number(feat.talent247) : 0;
    const returningOff = feat.returningProdOff !== null ? Number(feat.returningProdOff) : 0;
    const returningDef = feat.returningProdDef !== null ? Number(feat.returningProdDef) : 0;
    const returning = (returningOff + returningDef) / 2; // Average of off/def
    
    teamPriors.set(feat.teamId, { talent, returning });
  }
  
  console.log(`   Loaded priors for ${teamPriors.size} teams\n`);
  
  // Build prior vector s_prior (standardized blend of Talent + Returning Production)
  const priorValues: number[] = [];
  for (const teamId of teams) {
    const prior = teamPriors.get(teamId);
    if (prior) {
      // Blend: equal weights
      priorValues.push((prior.talent + prior.returning) / 2);
    } else {
      priorValues.push(0); // Missing prior = 0
    }
  }
  
  // Normalize priors (mean=0, std=1)
  const meanPrior = priorValues.reduce((a, b) => a + b, 0) / priorValues.length;
  const varPrior = priorValues.reduce((sum, p) => sum + Math.pow(p - meanPrior, 2), 0) / priorValues.length;
  const stdPrior = Math.sqrt(varPrior);
  
  const sPrior = priorValues.map(p => stdPrior > 1e-10 ? (p - meanPrior) / stdPrior : 0);
  
  console.log(`   Prior stats: mean=${meanPrior.toFixed(4)}, std=${stdPrior.toFixed(4)}\n`);
  
  // Build linear system: Ax = b (weighted by rowWeight)
  // x = [team_ratings[0..nTeams-1], hfa_constant]
  // Each row: targetSpreadHma = homeRating - awayRating + hfaConstant
  
  // Create team index map
  const teamIndex = new Map<string, number>();
  teams.forEach((teamId, idx) => {
    teamIndex.set(teamId, idx);
  });
  
  // Build weighted A and b
  const A: number[][] = [];
  const b: number[] = [];
  const weights: number[] = [];
  
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
    weights.push(game.rowWeight);
  }
  
  console.log(`   Built linear system: ${A.length} equations, ${nTeams + 1} unknowns\n`);
  
  // Solve using normal equations with ridge prior: (A^T W A + λI) x = A^T W b + λ s_prior
  // where W is diagonal weight matrix
  
  // Compute A^T W A
  const AtWA: number[][] = [];
  for (let i = 0; i < nTeams + 1; i++) {
    AtWA.push(new Array(nTeams + 1).fill(0));
  }
  
  for (let i = 0; i < A.length; i++) {
    const w = weights[i];
    for (let j = 0; j < nTeams + 1; j++) {
      for (let k = 0; k < nTeams + 1; k++) {
        AtWA[j][k] += w * A[i][j] * A[i][k];
      }
    }
  }
  
  // Add ridge regularization: (A^T W A + λI) for team ratings only (not HFA)
  for (let i = 0; i < nTeams; i++) {
    AtWA[i][i] += lambda;
  }
  
  // Compute A^T W b
  const AtWb: number[] = new Array(nTeams + 1).fill(0);
  for (let i = 0; i < A.length; i++) {
    const w = weights[i];
    for (let j = 0; j < nTeams + 1; j++) {
      AtWb[j] += w * A[i][j] * b[i];
    }
  }
  
  // Add ridge prior term: λ s_prior (only for team ratings, not HFA)
  for (let i = 0; i < nTeams; i++) {
    AtWb[i] += lambda * sPrior[i];
  }
  
  // Solve
  const x = solveLinearSystem(AtWA, AtWb);
  
  // Extract ratings and HFA constant
  const ratings = new Map<string, number>();
  for (let i = 0; i < nTeams; i++) {
    ratings.set(teams[i], x[i]);
  }
  const hfaConstant = x[nTeams];
  
  // Center ratings (mean = 0) for identifiability
  const ratingValues = Array.from(ratings.values());
  const meanRating = ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length;
  for (const teamId of teams) {
    ratings.set(teamId, ratings.get(teamId)! - meanRating);
  }
  
  console.log(`   ✅ Solved MFTR system with ridge prior\n`);
  console.log(`   HFA Constant: ${hfaConstant.toFixed(4)}\n`);
  
  // Evaluate on Set A and Set B separately
  const setA = games.filter(g => g.setLabel === 'A');
  const setB = games.filter(g => g.setLabel === 'B');
  
  const evalSet = (gameSet: GameRow[]) => {
    const predictions: number[] = [];
    const targets: number[] = [];
    
    for (const game of gameSet) {
      const homeRating = ratings.get(game.homeTeamId) ?? 0;
      const awayRating = ratings.get(game.awayTeamId) ?? 0;
      const pred = homeRating - awayRating + hfaConstant;
      
      predictions.push(pred);
      targets.push(game.targetSpreadHma);
    }
    
    if (targets.length === 0) {
      return { rmse: 0, pearson: 0, spearman: 0 };
    }
    
    // Compute metrics
    const meanTarget = targets.reduce((a, b) => a + b, 0) / targets.length;
    const meanPred = predictions.reduce((a, b) => a + b, 0) / predictions.length;
    
    let ssRes = 0;
    let cov = 0;
    let varTarget = 0;
    let varPred = 0;
    
    for (let i = 0; i < targets.length; i++) {
      const tDev = targets[i] - meanTarget;
      const pDev = predictions[i] - meanPred;
      ssRes += Math.pow(targets[i] - predictions[i], 2);
      cov += tDev * pDev;
      varTarget += tDev * tDev;
      varPred += pDev * pDev;
    }
    
    ssRes /= targets.length;
    cov /= targets.length;
    varTarget /= targets.length;
    varPred /= targets.length;
    
    const rmse = Math.sqrt(ssRes);
    const pearson = cov / (Math.sqrt(varTarget) * Math.sqrt(varPred));
    
    // Spearman
    const rankTarget = rankArray(targets);
    const rankPred = rankArray(predictions);
    const meanRankTarget = rankTarget.reduce((a, b) => a + b, 0) / rankTarget.length;
    const meanRankPred = rankPred.reduce((a, b) => a + b, 0) / rankPred.length;
    
    let covRank = 0;
    let varRankTarget = 0;
    let varRankPred = 0;
    
    for (let i = 0; i < rankTarget.length; i++) {
      const tDev = rankTarget[i] - meanRankTarget;
      const pDev = rankPred[i] - meanRankPred;
      covRank += tDev * pDev;
      varRankTarget += tDev * tDev;
      varRankPred += pDev * pDev;
    }
    
    covRank /= rankTarget.length;
    varRankTarget /= rankTarget.length;
    varRankPred /= rankPred.length;
    
    const spearman = covRank / (Math.sqrt(varRankTarget) * Math.sqrt(varRankPred));
    
    return { rmse, pearson, spearman };
  };
  
  const metricsA = evalSet(setA);
  const metricsB = evalSet(setB);
  
  console.log(`📊 MFTR Evaluation:`);
  console.log(`   Set A (Weeks 8-11):`);
  console.log(`     RMSE: ${metricsA.rmse.toFixed(4)} (target: ≤7.2)`);
  console.log(`     Pearson: ${metricsA.pearson.toFixed(4)} (target: ≥0.55)`);
  console.log(`     Spearman: ${metricsA.spearman.toFixed(4)}\n`);
  console.log(`   Set B (Weeks 1-7):`);
  console.log(`     RMSE: ${metricsB.rmse.toFixed(4)}`);
  console.log(`     Pearson: ${metricsB.pearson.toFixed(4)} (target: ≥0.25)`);
  console.log(`     Spearman: ${metricsB.spearman.toFixed(4)} (target: ≥0.25)\n`);
  
  // Save ratings to CSV
  const ratingsArray = Array.from(ratings.entries())
    .map(([teamId, rating]) => {
      const prior = teamPriors.get(teamId);
      return {
        teamId,
        rating,
        priorTalent: prior?.talent ?? null,
        priorReturning: prior?.returning ?? null,
        priorBlend: prior ? (prior.talent + prior.returning) / 2 : null,
      };
    })
    .sort((a, b) => b.rating - a.rating);
  
  const csvPath = path.join(process.cwd(), 'reports', 'mftr_ratings_ridge.csv');
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  
  let csv = 'teamId,rating,priorTalent,priorReturning,priorBlend\n';
  for (const r of ratingsArray) {
    csv += `${r.teamId},${r.rating.toFixed(4)},${r.priorTalent !== null ? r.priorTalent.toFixed(4) : ''},${r.priorReturning !== null ? r.priorReturning.toFixed(4) : ''},${r.priorBlend !== null ? r.priorBlend.toFixed(4) : ''}\n`;
  }
  fs.writeFileSync(csvPath, csv);
  console.log(`   ✅ Saved ratings to ${csvPath}\n`);
  
  // Save metrics
  const metricsPath = path.join(process.cwd(), 'reports', 'mftr_metrics_ridge.json');
  const metrics = {
    lambda,
    setA: metricsA,
    setB: metricsB,
    hfaConstant,
    nTeams,
    nGames,
  };
  fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
  console.log(`   ✅ Saved metrics to ${metricsPath}\n`);
  
  return {
    ratings,
    hfaConstant,
    rmse: metricsA.rmse,
    pearson: metricsA.pearson,
    spearman: metricsA.spearman,
    lambda,
  };
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

function rankArray(arr: number[]): number[] {
  const indexed = arr.map((val, idx) => ({ val, idx }));
  indexed.sort((a, b) => a.val - b.val);
  
  const ranks = new Array(arr.length);
  for (let i = 0; i < indexed.length; i++) {
    ranks[indexed[i].idx] = i + 1;
  }
  
  return ranks;
}

/**
 * Cross-validate lambda using leave-one-week-out CV
 */
async function crossValidateLambda(
  season: number,
  weeks: number[],
  lambdas: number[] = [0.01, 0.05, 0.1, 0.2, 0.5, 1.0]
): Promise<number> {
  console.log('='.repeat(70));
  console.log('🔍 CROSS-VALIDATING LAMBDA (Leave-One-Week-Out)');
  console.log('='.repeat(70) + '\n');
  
  // Only validate on Set A weeks (8-11)
  const setAWeeks = weeks.filter(w => w >= 8);
  
  if (setAWeeks.length < 2) {
    console.log('   ⚠️  Insufficient weeks for CV, using default lambda=0.1\n');
    return 0.1;
  }
  
  const results: Array<{ lambda: number; avgPearson: number }> = [];
  
  for (const lambda of lambdas) {
    const cvPearson: number[] = [];
    
    // Leave-one-week-out
    for (const testWeek of setAWeeks) {
      const trainWeeks = weeks.filter(w => w !== testWeek);
      
      try {
        const result = await buildMFTRRidge(season, trainWeeks, lambda);
        
        // Evaluate on test week
        const testRows = await prisma.gameTrainingRow.findMany({
          where: {
            season,
            week: testWeek,
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
        });
        
        const predictions: number[] = [];
        const targets: number[] = [];
        
        for (const row of testRows) {
          if (row.targetSpreadHma === null) continue;
          if (!row.game?.homeTeamId || !row.game?.awayTeamId) continue;
          
          const homeRating = result.ratings.get(row.game.homeTeamId) ?? 0;
          const awayRating = result.ratings.get(row.game.awayTeamId) ?? 0;
          const pred = homeRating - awayRating + result.hfaConstant;
          
          predictions.push(pred);
          targets.push(Number(row.targetSpreadHma));
        }
        
        if (targets.length > 0) {
          const meanTarget = targets.reduce((a, b) => a + b, 0) / targets.length;
          const meanPred = predictions.reduce((a, b) => a + b, 0) / predictions.length;
          
          let cov = 0;
          let varTarget = 0;
          let varPred = 0;
          
          for (let i = 0; i < targets.length; i++) {
            const tDev = targets[i] - meanTarget;
            const pDev = predictions[i] - meanPred;
            cov += tDev * pDev;
            varTarget += tDev * tDev;
            varPred += pDev * pDev;
          }
          
          cov /= targets.length;
          varTarget /= targets.length;
          varPred /= targets.length;
          
          const pearson = cov / (Math.sqrt(varTarget) * Math.sqrt(varPred));
          cvPearson.push(pearson);
        }
      } catch (error) {
        console.log(`   ⚠️  Error with lambda=${lambda}, week=${testWeek}: ${error}\n`);
      }
    }
    
    if (cvPearson.length > 0) {
      const avgPearson = cvPearson.reduce((a, b) => a + b, 0) / cvPearson.length;
      results.push({ lambda, avgPearson });
      console.log(`   Lambda=${lambda.toFixed(2)}: Avg Pearson=${avgPearson.toFixed(4)}\n`);
    }
  }
  
  if (results.length === 0) {
    console.log('   ⚠️  No valid CV results, using default lambda=0.1\n');
    return 0.1;
  }
  
  // Choose lambda with highest average Pearson
  results.sort((a, b) => b.avgPearson - a.avgPearson);
  const best = results[0];
  
  console.log(`   ✅ Best lambda: ${best.lambda.toFixed(2)} (avg Pearson: ${best.avgPearson.toFixed(4)})\n`);
  
  return best.lambda;
}

async function main() {
  const args = process.argv.slice(2);
  let season = 2025;
  let weeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  let skipCV = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && args[i + 1]) {
      season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--weeks' && args[i + 1]) {
      weeks = args[i + 1].split(',').map(w => parseInt(w.trim(), 10));
      i++;
    } else if (args[i] === '--skipCV') {
      skipCV = true;
    }
  }
  
  try {
    // Step 1: Cross-validate lambda
    let lambda = 0.1;
    if (!skipCV) {
      lambda = await crossValidateLambda(season, weeks);
    }
    
    // Step 2: Build MFTR with chosen lambda
    const result = await buildMFTRRidge(season, weeks, lambda);
    
    // Summary
    console.log('='.repeat(70));
    console.log('✅ MFTR BUILD COMPLETE (WITH RIDGE PRIOR)');
    console.log('='.repeat(70));
    console.log(`\n📊 Summary:`);
    console.log(`   Lambda: ${lambda.toFixed(4)}`);
    console.log(`   Set A RMSE: ${result.rmse.toFixed(4)} (target: ≤7.2)`);
    console.log(`   Set A Pearson: ${result.pearson.toFixed(4)} (target: ≥0.55)`);
    console.log(`   HFA Constant: ${result.hfaConstant.toFixed(4)}\n`);
    
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

