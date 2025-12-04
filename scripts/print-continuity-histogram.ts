/**
 * Print Continuity Score Histogram
 * 
 * Prints a histogram and summary statistics for continuity scores for a given season.
 * 
 * Usage:
 *   npx tsx scripts/print-continuity-histogram.ts --season 2025
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  let season: number | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && i + 1 < args.length) {
      season = parseInt(args[i + 1], 10);
      i++;
    }
  }

  if (!season || isNaN(season)) {
    console.error('Usage: npx tsx scripts/print-continuity-histogram.ts --season <YEAR>');
    console.error('Example: npx tsx scripts/print-continuity-histogram.ts --season 2025');
    process.exit(1);
  }

  console.log(`\n📊 Continuity Score v1 — ${season}\n`);

  // Load all TeamSeasonStat rows for this season
  const teamSeasons = await prisma.teamSeasonStat.findMany({
    where: { season },
  });

  // Extract continuity scores
  const continuityScores: number[] = [];
  
  for (const teamSeason of teamSeasons) {
    const rawJson = (teamSeason.rawJson as any) || {};
    const portalMeta = rawJson.portal_meta;
    
    if (portalMeta && typeof portalMeta.continuityScore === 'number') {
      continuityScores.push(portalMeta.continuityScore);
    }
  }

  if (continuityScores.length === 0) {
    console.log('⚠️  No teams with continuityScore found for this season.');
    console.log('   Run sync_portal_indices.ts first to compute scores.\n');
    await prisma.$disconnect();
    return;
  }

  // Compute statistics
  const count = continuityScores.length;
  const min = Math.min(...continuityScores);
  const max = Math.max(...continuityScores);
  const sum = continuityScores.reduce((a, b) => a + b, 0);
  const mean = sum / count;

  // Sort for median/quartiles
  const sorted = [...continuityScores].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

  // Bucket into bands
  const low: number[] = [];    // 0.00 - 0.60
  const mid: number[] = [];   // 0.60 - 0.80
  const high: number[] = [];  // 0.80 - 1.00

  for (const score of continuityScores) {
    if (score < 0.60) {
      low.push(score);
    } else if (score < 0.80) {
      mid.push(score);
    } else {
      high.push(score);
    }
  }

  const lowMean = low.length > 0 ? low.reduce((a, b) => a + b, 0) / low.length : 0;
  const midMean = mid.length > 0 ? mid.reduce((a, b) => a + b, 0) / mid.length : 0;
  const highMean = high.length > 0 ? high.reduce((a, b) => a + b, 0) / high.length : 0;

  // Print summary
  console.log(`Teams with continuityScore: ${count}`);
  console.log(`Min: ${min.toFixed(3)}   Max: ${max.toFixed(3)}   Mean: ${mean.toFixed(3)}   Median: ${median.toFixed(3)}\n`);

  console.log('Buckets:');
  console.log(`  Low  (0.00–0.60): ${low.length.toString().padStart(3)} teams (mean=${lowMean.toFixed(3)})`);
  console.log(`  Mid  (0.60–0.80): ${mid.length.toString().padStart(3)} teams (mean=${midMean.toFixed(3)})`);
  console.log(`  High (0.80–1.00): ${high.length.toString().padStart(3)} teams (mean=${highMean.toFixed(3)})\n`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});



