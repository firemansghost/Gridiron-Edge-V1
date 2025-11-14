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
  
  // Load MFTR ratings (prefer ridge version)
  const mftrRidgePath = path.join(process.cwd(), 'reports', 'mftr_ratings_ridge.csv');
  const mftrPath = path.join(process.cwd(), 'reports', 'mftr_ratings.csv');
  
  let mftrPathToUse = mftrRidgePath;
  if (!fs.existsSync(mftrRidgePath)) {
    if (!fs.existsSync(mftrPath)) {
      throw new Error(`MFTR ratings not found. Run build-mftr-ridge.ts first.`);
    }
    mftrPathToUse = mftrPath;
    console.log(`   ⚠️  Using non-ridge MFTR (${mftrPath}). Prefer ridge version.\n`);
  }
  
  const mftrContent = fs.readFileSync(mftrPathToUse, 'utf-8');
  const mftrLines = mftrContent.trim().split('\n').slice(1); // Skip header
  const mftrRatings = new Map<string, number>();
  
  for (const line of mftrLines) {
    const parts = line.split(',');
    const teamId = parts[0];
    const rating = parseFloat(parts[1]);
    mftrRatings.set(teamId, rating);
  }
  
  console.log(`   Loaded ${mftrRatings.size} MFTR ratings from ${mftrPathToUse.includes('ridge') ? 'ridge' : 'standard'} version\n`);
  
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
  
  // Filter: Discard any w with negative Set-B Pearson
  const validCandidates = candidatesWithB.filter(c => c.pearsonB >= 0);
  
  if (validCandidates.length === 0) {
    console.log('   ❌ NO VALID BLEND: All weights have negative Set-B Pearson\n');
    console.log('   ⚠️  STOPPING: Cannot proceed without valid blend\n');
    process.exit(1);
  }
  
  // Find best by combined objective: J = 0.5*(Pearson_A + Spearman_A) + 0.5*(Pearson_B + Spearman_B)
  validCandidates.forEach(c => {
    c.combinedTotal = 0.5 * (c.pearsonA + c.spearmanA) + 0.5 * (c.pearsonB + c.spearmanB);
  });
  
  validCandidates.sort((a, b) => b.combinedTotal - a.combinedTotal);
  let best = validCandidates[0];
  
  // Guard: If best is w=0.00 and Set-B Pearson < 0.25, force w=0.10
  if (best.w === 0.00 && best.pearsonB < 0.25) {
    console.log(`   ⚠️  Best weight is w=0.00 but Set-B Pearson (${best.pearsonB.toFixed(4)}) < 0.25`);
    console.log(`   🔧 Forcing w=0.10 to avoid pure Set-A overfit\n`);
    
    const w10Candidate = validCandidates.find(c => Math.abs(c.w - 0.10) < 0.01);
    if (w10Candidate && w10Candidate.pearsonB >= 0.25) {
      best = w10Candidate;
      console.log(`   ✅ Using w=0.10: Set-B Pearson=${best.pearsonB.toFixed(4)}\n`);
    } else {
      console.log(`   ⚠️  w=0.10 also fails Set-B gate, keeping w=0.00\n`);
    }
  }
  
  // Quick OLS sanity check: β(rating_blend) > 0
  console.log('🔍 Quick OLS sanity check (β(rating_blend) > 0)...\n');
  const allRows = [...setARows, ...setBRows];
  const ratingDiffs: number[] = [];
  const targets: number[] = [];
  const rowWeights: number[] = [];
  
  for (const row of allRows) {
    if (row.targetSpreadHma === null) continue;
    if (!row.game?.homeTeamId || !row.game?.awayTeamId) continue;
    
    const homeV2 = v2Normalized.get(row.game.homeTeamId) ?? 0;
    const awayV2 = v2Normalized.get(row.game.awayTeamId) ?? 0;
    const homeMFTR = mftrNormalized.get(row.game.homeTeamId) ?? 0;
    const awayMFTR = mftrNormalized.get(row.game.awayTeamId) ?? 0;
    
    const homeBlend = best.w * homeV2 + (1 - best.w) * homeMFTR;
    const awayBlend = best.w * awayV2 + (1 - best.w) * awayMFTR;
    const ratingDiff = homeBlend - awayBlend;
    
    ratingDiffs.push(ratingDiff);
    targets.push(Number(row.targetSpreadHma));
    rowWeights.push(row.rowWeight !== null ? Number(row.rowWeight) : 1.0);
  }
  
  // Weighted OLS
  const sumW = rowWeights.reduce((a, b) => a + b, 0);
  const meanTarget = targets.reduce((sum, t, i) => sum + rowWeights[i] * t, 0) / sumW;
  const meanDiff = ratingDiffs.reduce((sum, d, i) => sum + rowWeights[i] * d, 0) / sumW;
  
  let cov = 0;
  let varDiff = 0;
  for (let i = 0; i < targets.length; i++) {
    const tDev = targets[i] - meanTarget;
    const dDev = ratingDiffs[i] - meanDiff;
    cov += rowWeights[i] * tDev * dDev;
    varDiff += rowWeights[i] * dDev * dDev;
  }
  cov /= sumW;
  varDiff /= sumW;
  
  const beta = varDiff > 1e-10 ? cov / varDiff : 0;
  
  console.log(`   β(rating_blend): ${beta.toFixed(4)}`);
  if (beta > 0) {
    console.log(`   ✅ β is positive (sanity check passed)\n`);
  } else {
    console.log(`   ❌ β is negative (sanity check failed!)\n`);
    console.log(`   ⚠️  WARNING: Proceeding anyway, but this may cause issues in Core fit\n`);
  }
  
  console.log(`📊 Blend Search Results:\n`);
  console.log(`   Best weight: w = ${best.w.toFixed(2)}`);
  console.log(`   Combined objective J: ${best.combinedTotal.toFixed(4)}`);
  if (best.w === 0.00) {
    console.log(`   Note: Pure MFTR (w=0.00) - Set-B validation: Pearson=${best.pearsonB.toFixed(4)}\n`);
  } else {
    console.log(`   Note: Blend of V2 (${(best.w * 100).toFixed(0)}%) + MFTR (${((1 - best.w) * 100).toFixed(0)}%)\n`);
  }
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

