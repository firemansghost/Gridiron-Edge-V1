/**
 * Diagnostic script to inspect tail slice (>28) outliers and check for frame bugs
 * 
 * Tasks:
 * 1. Load Core artifacts (residual buckets, top outliers)
 * 2. Identify games in >28 bucket
 * 3. Check for sign-flip issues
 * 4. Report findings
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const prisma = new PrismaClient();

interface OutlierRow {
  gameId: string;
  season: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  isNeutral: boolean;
  marketHma: number;
  predHma: number;
  residual: number;
  absResidual: number;
}

async function loadCoreArtifacts(): Promise<{
  buckets: any[];
  outliers: any[];
  metrics: any;
}> {
  const reportsDir = path.join(process.cwd(), 'reports');
  
  // Load residual buckets
  const bucketsPath = path.join(reportsDir, 'core_residual_buckets.csv');
  const buckets: any[] = [];
  if (fs.existsSync(bucketsPath)) {
    const content = fs.readFileSync(bucketsPath, 'utf-8');
    const lines = content.split('\n').slice(1).filter(l => l.trim());
    for (const line of lines) {
      const [bucket, count, mean, std] = line.split(',');
      if (bucket && count) {
        buckets.push({
          bucket: bucket.trim(),
          count: parseInt(count.trim(), 10),
          mean: parseFloat(mean?.trim() || '0'),
          std: parseFloat(std?.trim() || '0'),
        });
      }
    }
  }
  
  // Load top outliers
  const outliersPath = path.join(reportsDir, 'core_top_outliers.csv');
  const outliers: any[] = [];
  if (fs.existsSync(outliersPath)) {
    const content = fs.readFileSync(outliersPath, 'utf-8');
    const lines = content.split('\n').slice(1).filter(l => l.trim());
    for (const line of lines) {
      const parts = line.split(',');
      // CSV format: rank,game_id,week,actual,predicted,residual,abs_residual
      if (parts.length >= 7) {
        outliers.push({
          rank: parseInt(parts[0]?.trim() || '0', 10),
          gameId: parts[1]?.trim(),
          week: parseInt(parts[2]?.trim() || '0', 10),
          marketHma: parseFloat(parts[3]?.trim() || '0'),
          predHma: parseFloat(parts[4]?.trim() || '0'),
          residual: parseFloat(parts[5]?.trim() || '0'),
          absResidual: Math.abs(parseFloat(parts[6]?.trim() || '0')),
        });
      }
    }
  }
  
  // Load metrics
  const metricsPath = path.join(reportsDir, 'cal_fit_core.json');
  let metrics: any = {};
  if (fs.existsSync(metricsPath)) {
    metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'));
  }
  
  return { buckets, outliers, metrics };
}

async function enrichOutliers(outliers: any[]): Promise<OutlierRow[]> {
  const enriched: OutlierRow[] = [];
  
  for (const outlier of outliers) {
    const gameId = outlier.gameId;
    if (!gameId) continue;
    
    // Parse game ID (format: 2025-wk8-team1-team2 or similar)
    const parts = gameId.split('-');
    if (parts.length < 4) {
      console.log(`   ⚠️  Cannot parse game ID: ${gameId}`);
      continue;
    }
    
    const season = parseInt(parts[0], 10);
    const weekStr = parts[1];
    const week = parseInt(weekStr.replace('wk', ''), 10);
    
    // Get game from training row (which has gameId)
    const trainingRow = await prisma.gameTrainingRow.findUnique({
      where: {
        gameId_featureVersion: {
          gameId,
          featureVersion: 'fe_v1',
        },
      },
    });
    
    if (!trainingRow) {
      console.log(`   ⚠️  Training row not found for ${gameId}`);
      continue;
    }
    
    // Get game by home/away team IDs
    const game = await prisma.game.findFirst({
      where: {
        season,
        week,
        homeTeamId: trainingRow.homeTeamId,
        awayTeamId: trainingRow.awayTeamId,
      },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
    });
    
    if (!game) {
      console.log(`   ⚠️  Game ${gameId} not found in DB`);
      continue;
    }
    
    // trainingRow already loaded above
    
    enriched.push({
      gameId,
      season,
      week,
      homeTeam: game.homeTeam.name,
      awayTeam: game.awayTeam.name,
      isNeutral: trainingRow?.neutralSite || false,
      marketHma: outlier.marketHma,
      predHma: outlier.predHma,
      residual: outlier.residual,
      absResidual: outlier.absResidual,
    });
  }
  
  return enriched;
}

function checkSignFlips(outlier: OutlierRow): {
  residualIfFlipMarket: number;
  residualIfFlipPred: number;
  flipMarketHelps: boolean;
  flipPredHelps: boolean;
} {
  // residual = pred - market
  // If we flip market sign: residual = pred - (-market) = pred + market
  const residualIfFlipMarket = outlier.predHma - (-outlier.marketHma);
  
  // If we flip pred sign: residual = (-pred) - market = -(pred + market)
  const residualIfFlipPred = (-outlier.predHma) - outlier.marketHma;
  
  const flipMarketHelps = Math.abs(residualIfFlipMarket) < Math.abs(outlier.residual) - 20;
  const flipPredHelps = Math.abs(residualIfFlipPred) < Math.abs(outlier.residual) - 20;
  
  return {
    residualIfFlipMarket,
    residualIfFlipPred,
    flipMarketHelps,
    flipPredHelps,
  };
}

async function diagnoseTailSlice(setLabel: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TAIL SLICE DIAGNOSTIC: Set ${setLabel}`);
  console.log('='.repeat(70));
  
  const { buckets, outliers, metrics } = await loadCoreArtifacts();
  
  // Find >28 bucket
  const tailBucket = buckets.find(b => b.bucket === '>28' || b.bucket.includes('>28'));
  if (!tailBucket) {
    console.log('   ⚠️  >28 bucket not found in artifacts');
    return;
  }
  
  console.log(`\n   >28 Bucket Summary:`);
  console.log(`     Count: ${tailBucket.count}`);
  console.log(`     Mean residual: ${tailBucket.mean.toFixed(2)}`);
  console.log(`     Std residual: ${tailBucket.std.toFixed(2)}`);
  
  // Filter outliers to >28 slice
  const tailOutliers = outliers.filter(o => Math.abs(o.residual || 0) > 28);
  console.log(`\n   Found ${tailOutliers.length} outliers with |residual| > 28`);
  
  // Enrich with game details
  console.log(`   Enriching outliers with game details...`);
  const enriched = await enrichOutliers(tailOutliers.slice(0, 20)); // Top 20
  
  console.log(`\n   Top ${Math.min(10, enriched.length)} Outliers in >28 Slice:`);
  console.log('   ' + '-'.repeat(68));
  console.log('   | Game ID | Week | Home | Away | Neutral | Market | Pred | Residual |');
  console.log('   ' + '-'.repeat(68));
  
  for (let i = 0; i < Math.min(10, enriched.length); i++) {
    const o = enriched[i];
    const flipCheck = checkSignFlips(o);
    
    console.log(`   | ${o.gameId.substring(0, 20).padEnd(20)} | ${o.week.toString().padStart(2)} | ${o.homeTeam.substring(0, 15).padEnd(15)} | ${o.awayTeam.substring(0, 15).padEnd(15)} | ${(o.isNeutral ? 'Y' : 'N').padEnd(7)} | ${o.marketHma.toFixed(1).padStart(6)} | ${o.predHma.toFixed(1).padStart(4)} | ${o.residual.toFixed(1).padStart(8)} |`);
    
    if (flipCheck.flipMarketHelps || flipCheck.flipPredHelps) {
      console.log(`     ⚠️  SIGN FLIP CHECK:`);
      if (flipCheck.flipMarketHelps) {
        console.log(`        Flipping market sign: |residual| drops from ${Math.abs(o.residual).toFixed(1)} to ${Math.abs(flipCheck.residualIfFlipMarket).toFixed(1)}`);
      }
      if (flipCheck.flipPredHelps) {
        console.log(`        Flipping pred sign: |residual| drops from ${Math.abs(o.residual).toFixed(1)} to ${Math.abs(flipCheck.residualIfFlipPred).toFixed(1)}`);
      }
    }
  }
  
  // Summary statistics
  const signFlipMarketCount = enriched.filter(o => checkSignFlips(o).flipMarketHelps).length;
  const signFlipPredCount = enriched.filter(o => checkSignFlips(o).flipPredHelps).length;
  const neutralCount = enriched.filter(o => o.isNeutral).length;
  
  console.log(`\n   Summary:`);
  console.log(`     Total outliers analyzed: ${enriched.length}`);
  console.log(`     Sign-flip market helps: ${signFlipMarketCount} (${((signFlipMarketCount / enriched.length) * 100).toFixed(1)}%)`);
  console.log(`     Sign-flip pred helps: ${signFlipPredCount} (${((signFlipPredCount / enriched.length) * 100).toFixed(1)}%)`);
  console.log(`     Neutral site games: ${neutralCount} (${((neutralCount / enriched.length) * 100).toFixed(1)}%)`);
  
  return {
    bucket: tailBucket,
    outlierCount: enriched.length,
    signFlipMarketCount,
    signFlipPredCount,
    neutralCount,
  };
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('TAIL SLICE & OUTLIER DIAGNOSTIC');
  console.log('='.repeat(70));
  
  // Note: Artifacts are from the most recent run (may be Set A or Set AB)
  // We'll analyze what we have
  const resultA = await diagnoseTailSlice('A');
  // If we have separate AB artifacts, we'd load them here
  
  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log('='.repeat(70));
  if (resultA) {
    console.log(`\n>28 Bucket:`);
    console.log(`   Count: ${resultA.bucket.count}`);
    console.log(`   Mean residual: ${resultA.bucket.mean.toFixed(2)}`);
    console.log(`   Potential sign-flip issues: ${resultA.signFlipMarketCount + resultA.signFlipPredCount} / ${resultA.outlierCount}`);
  }
  
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(console.error);
}

