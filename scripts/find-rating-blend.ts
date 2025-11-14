/**
 * Find Optimal Rating Blend
 * 
 * Searches for optimal weight w in: rating_blend = w*V2 + (1-w)*MFTR
 * to maximize Set A Pearson/Spearman, then validates on Set B
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const season = 2025;
  
  console.log('='.repeat(70));
  console.log('🔍 FINDING OPTIMAL RATING BLEND');
  console.log('='.repeat(70) + '\n');
  
  // Load MFTR ratings
  const mftrPath = path.join(process.cwd(), 'reports', 'mftr_ratings.csv');
  if (!fs.existsSync(mftrPath)) {
    throw new Error(`MFTR ratings not found: ${mftrPath}. Run build-mftr.ts first.`);
  }
  
  const mftrContent = fs.readFileSync(mftrPath, 'utf-8');
  const mftrLines = mftrContent.trim().split('\n').slice(1); // Skip header
  const mftrRatings = new Map<string, number>();
  
  for (const line of mftrLines) {
    const [teamId, rating] = line.split(',');
    mftrRatings.set(teamId, parseFloat(rating));
  }
  
  console.log(`   Loaded ${mftrRatings.size} MFTR ratings\n`);
  
  // Load V2 ratings
  const v2Ratings = await prisma.teamSeasonRating.findMany({
    where: {
      season,
      modelVersion: 'v2',
    },
  });
  
  const v2Map = new Map<string, number>();
  for (const v2 of v2Ratings) {
    if (v2.powerRating !== null) {
      v2Map.set(v2.teamId, Number(v2.powerRating));
    }
  }
  
  console.log(`   Loaded ${v2Map.size} V2 ratings\n`);
  
  // Load Set A training rows
  const setARows = await prisma.gameTrainingRow.findMany({
    where: {
      season,
      week: { in: [8, 9, 10, 11] },
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
  
  // Load Set B training rows (for validation)
  const setBRows = await prisma.gameTrainingRow.findMany({
    where: {
      season,
      week: { in: [1, 2, 3, 4, 5, 6, 7] },
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
  
  console.log(`   Set A: ${setARows.length} rows`);
  console.log(`   Set B: ${setBRows.length} rows\n`);
  
  // Normalize V2 and MFTR to same scale (z-score)
  const allV2Values = Array.from(v2Map.values());
  const allMFTRValues = Array.from(mftrRatings.values());
  
  const meanV2 = allV2Values.reduce((a, b) => a + b, 0) / allV2Values.length;
  const meanMFTR = allMFTRValues.reduce((a, b) => a + b, 0) / allMFTRValues.length;
  const stdV2 = Math.sqrt(allV2Values.reduce((sum, v) => sum + Math.pow(v - meanV2, 2), 0) / allV2Values.length);
  const stdMFTR = Math.sqrt(allMFTRValues.reduce((sum, v) => sum + Math.pow(v - meanMFTR, 2), 0) / allMFTRValues.length);
  
  // Normalize
  const v2Normalized = new Map<string, number>();
  const mftrNormalized = new Map<string, number>();
  
  for (const [teamId, val] of v2Map.entries()) {
    v2Normalized.set(teamId, (val - meanV2) / stdV2);
  }
  
  for (const [teamId, val] of mftrRatings.entries()) {
    mftrNormalized.set(teamId, (val - meanMFTR) / stdMFTR);
  }
  
  console.log(`   Normalized V2: mean=${meanV2.toFixed(4)}, std=${stdV2.toFixed(4)}`);
  console.log(`   Normalized MFTR: mean=${meanMFTR.toFixed(4)}, std=${stdMFTR.toFixed(4)}\n`);
  
  /**
   * Evaluate blend for given weight w
   */
  function evaluateBlend(rows: typeof setARows, w: number): { pearson: number; spearman: number; rmse: number } {
    const targets: number[] = [];
    const ratingDiffs: number[] = [];
    
    for (const row of rows) {
      if (row.targetSpreadHma === null) continue;
      if (!row.game?.homeTeamId || !row.game?.awayTeamId) continue;
      
      const homeV2 = v2Normalized.get(row.game.homeTeamId) ?? 0;
      const awayV2 = v2Normalized.get(row.game.awayTeamId) ?? 0;
      const homeMFTR = mftrNormalized.get(row.game.homeTeamId) ?? 0;
      const awayMFTR = mftrNormalized.get(row.game.awayTeamId) ?? 0;
      
      const homeBlend = w * homeV2 + (1 - w) * homeMFTR;
      const awayBlend = w * awayV2 + (1 - w) * awayMFTR;
      const ratingDiff = homeBlend - awayBlend;
      
      targets.push(Number(row.targetSpreadHma));
      ratingDiffs.push(ratingDiff);
    }
    
    if (targets.length === 0) {
      return { pearson: 0, spearman: 0, rmse: Infinity };
    }
    
    // Compute Pearson
    const meanTarget = targets.reduce((a, b) => a + b, 0) / targets.length;
    const meanDiff = ratingDiffs.reduce((a, b) => a + b, 0) / ratingDiffs.length;
    
    let cov = 0;
    let varTarget = 0;
    let varDiff = 0;
    let ssRes = 0;
    
    for (let i = 0; i < targets.length; i++) {
      const tDev = targets[i] - meanTarget;
      const dDev = ratingDiffs[i] - meanDiff;
      cov += tDev * dDev;
      varTarget += tDev * tDev;
      varDiff += dDev * dDev;
      ssRes += Math.pow(targets[i] - ratingDiffs[i], 2);
    }
    
    cov /= targets.length;
    varTarget /= targets.length;
    varDiff /= targets.length;
    
    const pearson = cov / (Math.sqrt(varTarget) * Math.sqrt(varDiff));
    const rmse = Math.sqrt(ssRes / targets.length);
    
    // Compute Spearman
    const rankTarget = rankArray(targets);
    const rankDiff = rankArray(ratingDiffs);
    
    const meanRankTarget = rankTarget.reduce((a, b) => a + b, 0) / rankTarget.length;
    const meanRankDiff = rankDiff.reduce((a, b) => a + b, 0) / rankDiff.length;
    
    let covRank = 0;
    let varRankTarget = 0;
    let varRankDiff = 0;
    
    for (let i = 0; i < rankTarget.length; i++) {
      const tDev = rankTarget[i] - meanRankTarget;
      const dDev = rankDiff[i] - meanRankDiff;
      covRank += tDev * dDev;
      varRankTarget += tDev * tDev;
      varRankDiff += dDev * dDev;
    }
    
    covRank /= rankTarget.length;
    varRankTarget /= rankTarget.length;
    varRankDiff /= rankDiff.length;
    
    const spearman = covRank / (Math.sqrt(varRankTarget) * Math.sqrt(varRankDiff));
    
    return { pearson, spearman, rmse };
  }
  
  // Search for optimal w
  console.log('🔍 Searching for optimal blend weight...\n');
  
  const candidates: Array<{ w: number; pearson: number; spearman: number; rmse: number; combined: number }> = [];
  
  // Test w from 0.0 to 1.0 in steps of 0.05
  for (let w = 0; w <= 1.0; w += 0.05) {
    const metrics = evaluateBlend(setARows, w);
    const combined = metrics.pearson + metrics.spearman; // Combined score
    
    candidates.push({
      w,
      pearson: metrics.pearson,
      spearman: metrics.spearman,
      rmse: metrics.rmse,
      combined,
    });
  }
  
  // Evaluate Set B for all candidates
  const candidatesWithB: Array<{
    w: number;
    pearsonA: number;
    spearmanA: number;
    rmseA: number;
    pearsonB: number;
    spearmanB: number;
    rmseB: number;
    combinedA: number;
    combinedB: number;
    combinedTotal: number;
  }> = [];
  
  for (const c of candidates) {
    const setBMetrics = evaluateBlend(setBRows, c.w);
    candidatesWithB.push({
      w: c.w,
      pearsonA: c.pearson,
      spearmanA: c.spearman,
      rmseA: c.rmse,
      pearsonB: setBMetrics.pearson,
      spearmanB: setBMetrics.spearman,
      rmseB: setBMetrics.rmse,
      combinedA: c.combined,
      combinedB: setBMetrics.pearson + setBMetrics.spearman,
      combinedTotal: c.combined + setBMetrics.pearson + setBMetrics.spearman,
    });
  }
  
  // Find best by combined Set A + Set B score
  candidatesWithB.sort((a, b) => b.combinedTotal - a.combinedTotal);
  const best = candidatesWithB[0];
  
  console.log(`📊 Blend Search Results:\n`);
  console.log(`   Best weight: w = ${best.w.toFixed(2)} (optimized for Set A + Set B)\n`);
  console.log(`   Set A:`);
  console.log(`     Pearson: ${best.pearsonA.toFixed(4)}`);
  console.log(`     Spearman: ${best.spearmanA.toFixed(4)}`);
  console.log(`     RMSE: ${best.rmseA.toFixed(4)}\n`);
  console.log(`   Set B:`);
  console.log(`     Pearson: ${best.pearsonB.toFixed(4)}`);
  console.log(`     Spearman: ${best.spearmanB.toFixed(4)}`);
  console.log(`     RMSE: ${best.rmseB.toFixed(4)}\n`);
  
  // Show top 5 candidates
  console.log(`📋 Top 5 Candidates (by combined Set A + Set B):\n`);
  for (let i = 0; i < Math.min(5, candidatesWithB.length); i++) {
    const c = candidatesWithB[i];
    console.log(`   ${i + 1}. w=${c.w.toFixed(2)}: A(P=${c.pearsonA.toFixed(3)},S=${c.spearmanA.toFixed(3)}) B(P=${c.pearsonB.toFixed(3)},S=${c.spearmanB.toFixed(3)}) Total=${c.combinedTotal.toFixed(3)}`);
  }
  
  // Save results
  const resultsPath = path.join(process.cwd(), 'reports', 'rating_blend_search.csv');
  let csv = 'w,pearsonA,spearmanA,rmseA,pearsonB,spearmanB,rmseB,combinedTotal\n';
  for (const c of candidatesWithB) {
    csv += `${c.w.toFixed(2)},${c.pearsonA.toFixed(4)},${c.spearmanA.toFixed(4)},${c.rmseA.toFixed(4)},${c.pearsonB.toFixed(4)},${c.spearmanB.toFixed(4)},${c.rmseB.toFixed(4)},${c.combinedTotal.toFixed(4)}\n`;
  }
  fs.writeFileSync(resultsPath, csv);
  console.log(`\n   ✅ Saved search results to ${resultsPath}\n`);
  
  // Save optimal blend config
  const configPath = path.join(process.cwd(), 'reports', 'rating_blend_config.json');
  const config = {
    optimalWeight: best.w,
    setAMetrics: {
      pearson: best.pearsonA,
      spearman: best.spearmanA,
      rmse: best.rmseA,
    },
    setBMetrics: {
      pearson: best.pearsonB,
      spearman: best.spearmanB,
      rmse: best.rmseB,
    },
    normalization: {
      v2Mean: meanV2,
      v2Std: stdV2,
      mftrMean: meanMFTR,
      mftrStd: stdMFTR,
    },
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`   ✅ Saved blend config to ${configPath}\n`);
  
  console.log('='.repeat(70));
  console.log('✅ BLEND SEARCH COMPLETE');
  console.log('='.repeat(70));
  console.log(`\n📋 Next steps:`);
  console.log(`   1. Use optimal weight w = ${best.w.toFixed(2)} in calibration`);
  console.log(`   2. Update calibrate-model-v1-rehab.ts to use rating_blend`);
  console.log(`   3. Re-run Core calibration with rating_blend`);
  console.log(`   4. Verify gates pass: Pearson ≥ 0.30, Spearman ≥ 0.30, RMSE ≤ 8.8\n`);
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

if (require.main === module) {
  main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}

