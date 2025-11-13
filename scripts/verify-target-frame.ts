/**
 * Verify Target Frame Sanity
 * 
 * Checks that targets have proper sign diversity (≥25% negative for away favorites)
 * and that ratingDiffV2 is computed correctly in HMA frame
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  let season = 2025;
  let featureVersion = 'fe_v1';
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && args[i + 1]) {
      season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--featureVersion' && args[i + 1]) {
      featureVersion = args[i + 1];
      i++;
    }
  }
  
  console.log('='.repeat(70));
  console.log(`🔍 TARGET FRAME SANITY CHECK (Season ${season}, Version ${featureVersion})`);
  console.log('='.repeat(70) + '\n');
  
  // Load training rows
  const rows = await prisma.gameTrainingRow.findMany({
    where: {
      season,
      featureVersion,
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
  
  console.log(`📊 Loaded ${rows.length} training rows with targets\n`);
  
  // 1. Target distribution
  const targets = rows.map(r => Number(r.targetSpreadHma!));
  const posCount = targets.filter(t => t > 0).length;
  const negCount = targets.filter(t => t < 0).length;
  const zeroCount = targets.filter(t => t === 0).length;
  
  const mean = targets.reduce((a, b) => a + b, 0) / targets.length;
  const variance = targets.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / targets.length;
  const std = Math.sqrt(variance);
  
  console.log('📈 Target Distribution:');
  console.log(`   Count: ${targets.length}`);
  console.log(`   Mean: ${mean.toFixed(4)}, Std: ${std.toFixed(4)}`);
  console.log(`   % Positive (home better): ${((posCount / targets.length) * 100).toFixed(1)}%`);
  console.log(`   % Negative (away better): ${((negCount / targets.length) * 100).toFixed(1)}%`);
  console.log(`   % Zero (pick'em): ${((zeroCount / targets.length) * 100).toFixed(1)}%\n`);
  
  if (negCount / targets.length < 0.25) {
    console.log(`   ⚠️  WARNING: Only ${((negCount / targets.length) * 100).toFixed(1)}% are negative (away favorites)`);
    console.log(`   Expected ≥25% for proper sign diversity. This suggests a frame bug.\n`);
  } else {
    console.log(`   ✅ Sign diversity OK (≥25% negatives)\n`);
  }
  
  // 2. Verify ratingDiffV2 computation
  console.log('🔍 Verifying ratingDiffV2 computation (HMA frame)...\n');
  
  let ratingDiffCorrect = 0;
  let ratingDiffMismatch = 0;
  const samples: Array<{ game: string; homeRating: number; awayRating: number; storedDiff: number | null; computedDiff: number }> = [];
  
  for (const row of rows.slice(0, 50)) { // Check first 50
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
      const homeVal = homeRating.powerRating !== null ? Number(homeRating.powerRating) : 0;
      const awayVal = awayRating.powerRating !== null ? Number(awayRating.powerRating) : 0;
      const computedDiff = homeVal - awayVal; // HMA: home - away
      const storedDiff = row.ratingDiffV2 !== null ? Number(row.ratingDiffV2) : null;
      
      if (storedDiff !== null) {
        if (Math.abs(storedDiff - computedDiff) < 0.01) {
          ratingDiffCorrect++;
        } else {
          ratingDiffMismatch++;
          if (samples.length < 5) {
            samples.push({
              game: `${row.game?.awayTeam.name} @ ${row.game?.homeTeam.name}`,
              homeRating: homeVal,
              awayRating: awayVal,
              storedDiff,
              computedDiff,
            });
          }
        }
      }
    }
  }
  
  console.log(`   Checked ${ratingDiffCorrect + ratingDiffMismatch} rows:`);
  console.log(`   ✅ Correct: ${ratingDiffCorrect}`);
  if (ratingDiffMismatch > 0) {
    console.log(`   ❌ Mismatch: ${ratingDiffMismatch}`);
    console.log(`\n   Sample mismatches:`);
    for (const s of samples) {
      console.log(`     ${s.game}:`);
      console.log(`       Home: ${s.homeRating.toFixed(2)}, Away: ${s.awayRating.toFixed(2)}`);
      console.log(`       Stored diff: ${s.storedDiff?.toFixed(2)}, Computed: ${s.computedDiff.toFixed(2)}`);
    }
  } else {
    console.log(`   ✅ All ratingDiffV2 values match computed (home - away)\n`);
  }
  
  // 3. Quick OLS sanity check
  console.log('📐 Quick OLS sanity check (ratingDiffV2 vs target)...\n');
  
  const validRows = rows.filter(r => 
    r.targetSpreadHma !== null && 
    r.ratingDiffV2 !== null
  );
  
  if (validRows.length > 0) {
    const y = validRows.map(r => Number(r.targetSpreadHma!));
    const x = validRows.map(r => Number(r.ratingDiffV2!));
    
    const meanX = x.reduce((a, b) => a + b, 0) / x.length;
    const meanY = y.reduce((a, b) => a + b, 0) / y.length;
    
    let cov = 0;
    let varX = 0;
    for (let i = 0; i < x.length; i++) {
      cov += (x[i] - meanX) * (y[i] - meanY);
      varX += Math.pow(x[i] - meanX, 2);
    }
    cov /= x.length;
    varX /= x.length;
    
    const beta = varX > 1e-10 ? cov / varX : 0;
    const alpha = meanY - beta * meanX;
    
    console.log(`   Simple OLS: target = ${alpha.toFixed(4)} + ${beta.toFixed(4)} * ratingDiffV2`);
    console.log(`   β(ratingDiffV2): ${beta.toFixed(4)}`);
    
    if (beta > 0) {
      console.log(`   ✅ β is positive (expected for HMA frame)\n`);
    } else {
      console.log(`   ❌ β is negative (frame misalignment!)\n`);
    }
  }
  
  // 4. Sample away-favorite games
  const awayFavorites = rows.filter(r => r.targetSpreadHma !== null && Number(r.targetSpreadHma!) < 0);
  console.log(`📋 Sample away-favorite games (${awayFavorites.length} total):\n`);
  
  for (const row of awayFavorites.slice(0, 10)) {
    const game = row.game;
    const target = Number(row.targetSpreadHma!);
    const ratingDiff = row.ratingDiffV2 !== null ? Number(row.ratingDiffV2) : null;
    console.log(`   ${game?.awayTeam.name} @ ${game?.homeTeam.name} (Week ${row.week}):`);
    console.log(`     Target (HMA): ${target.toFixed(2)} (away better)`);
    console.log(`     ratingDiffV2: ${ratingDiff !== null ? ratingDiff.toFixed(2) : 'null'}`);
    if (ratingDiff !== null) {
      console.log(`     Expected: ratingDiff < 0 (away better) → target < 0`);
      if (ratingDiff < 0 && target < 0) {
        console.log(`     ✅ Signs align\n`);
      } else {
        console.log(`     ⚠️  Signs don't align\n`);
      }
    } else {
      console.log(`     ⚠️  Missing ratingDiffV2\n`);
    }
  }
  
  console.log('='.repeat(70));
  console.log('✅ Frame sanity check complete');
  console.log('='.repeat(70) + '\n');
}

if (require.main === module) {
  main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}

