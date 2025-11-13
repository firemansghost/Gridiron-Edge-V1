/**
 * Diagnose Model Compression Issues
 * 
 * Quick diagnostic to identify why raw predictions have low variance
 * and why calibration head is crushing variance
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const season = 2025;
  const featureVersion = 'fe_v1';
  
  console.log('='.repeat(70));
  console.log('🔍 DIAGNOSING MODEL COMPRESSION');
  console.log('='.repeat(70) + '\n');
  
  // Load training rows
  const rows = await prisma.gameTrainingRow.findMany({
    where: {
      season,
      featureVersion,
      targetSpreadHma: { not: null },
      ratingDiffV2: { not: null },
    },
    take: 100, // Sample for quick check
  });
  
  console.log(`📊 Loaded ${rows.length} sample rows\n`);
  
  // 1. Check target vs ratingDiffV2 alignment
  const targets = rows.map(r => Number(r.targetSpreadHma!));
  const ratingDiffs = rows.map(r => Number(r.ratingDiffV2!));
  
  const meanTarget = targets.reduce((a, b) => a + b, 0) / targets.length;
  const meanRating = ratingDiffs.reduce((a, b) => a + b, 0) / ratingDiffs.length;
  
  let cov = 0;
  let varTarget = 0;
  let varRating = 0;
  for (let i = 0; i < targets.length; i++) {
    const tDev = targets[i] - meanTarget;
    const rDev = ratingDiffs[i] - meanRating;
    cov += tDev * rDev;
    varTarget += tDev * tDev;
    varRating += rDev * rDev;
  }
  cov /= targets.length;
  varTarget /= targets.length;
  varRating /= targets.length;
  
  const pearson = cov / (Math.sqrt(varTarget) * Math.sqrt(varRating));
  const stdTarget = Math.sqrt(varTarget);
  const stdRating = Math.sqrt(varRating);
  
  console.log('📈 Target vs ratingDiffV2 alignment:');
  console.log(`   std(target): ${stdTarget.toFixed(4)}`);
  console.log(`   std(ratingDiffV2): ${stdRating.toFixed(4)}`);
  console.log(`   Ratio: ${(stdRating / stdTarget).toFixed(4)}`);
  console.log(`   Pearson: ${pearson.toFixed(4)}`);
  console.log(`   Mean target: ${meanTarget.toFixed(4)}`);
  console.log(`   Mean ratingDiff: ${meanRating.toFixed(4)}\n`);
  
  // 2. Check sign alignment
  let sameSign = 0;
  let oppositeSign = 0;
  for (let i = 0; i < targets.length; i++) {
    if ((targets[i] > 0 && ratingDiffs[i] > 0) || (targets[i] < 0 && ratingDiffs[i] < 0)) {
      sameSign++;
    } else if ((targets[i] > 0 && ratingDiffs[i] < 0) || (targets[i] < 0 && ratingDiffs[i] > 0)) {
      oppositeSign++;
    }
  }
  
  console.log('🔍 Sign alignment:');
  console.log(`   Same sign: ${sameSign} (${((sameSign / targets.length) * 100).toFixed(1)}%)`);
  console.log(`   Opposite sign: ${oppositeSign} (${((oppositeSign / targets.length) * 100).toFixed(1)}%)\n`);
  
  // 3. Sample rows showing alignment
  console.log('📋 Sample rows (target vs ratingDiffV2):');
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const target = targets[i];
    const rating = ratingDiffs[i];
    const aligned = (target > 0 && rating > 0) || (target < 0 && rating < 0);
    console.log(`   Row ${i + 1}: target=${target.toFixed(2)}, ratingDiff=${rating.toFixed(2)}, ${aligned ? '✅ aligned' : '❌ misaligned'}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Diagnostic complete');
  console.log('='.repeat(70) + '\n');
}

if (require.main === module) {
  main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}

