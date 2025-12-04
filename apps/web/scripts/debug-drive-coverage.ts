/**
 * Debug Drive Stats Coverage
 * 
 * Simple script to check how many teams have drive_stats populated for a season.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/debug-drive-coverage.ts --season 2024
 */

import { prisma } from '../lib/prisma';

async function checkCoverage() {
  const args = process.argv.slice(2);
  let season = 2024; // default

  // Parse --season argument
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && args[i + 1]) {
      season = parseInt(args[i + 1], 10);
      break;
    }
  }

  if (isNaN(season)) {
    console.error('Invalid season. Usage: npx tsx apps/web/scripts/debug-drive-coverage.ts --season 2024');
    process.exit(1);
  }

  console.log(`\nChecking drive_stats coverage for season ${season}...\n`);

  // Get all TeamSeasonStat rows for this season
  const stats = await prisma.teamSeasonStat.findMany({
    where: {
      season,
    },
    select: {
      teamId: true,
      rawJson: true,
    },
  });

  const total = stats.length;
  let withDriveStats = 0;

  for (const stat of stats) {
    const json = stat.rawJson as any;
    if (json?.drive_stats?.finishingDrives || json?.drive_stats?.availableYards) {
      withDriveStats++;
    }
  }

  const coverage = total > 0 ? (withDriveStats / total) * 100 : 0;

  console.log(`Season ${season}:`);
  console.log(`  Total teamSeasonStat rows: ${total}`);
  console.log(`  With drive_stats: ${withDriveStats}`);
  console.log(`  Coverage: ${coverage.toFixed(1)}%`);

  await prisma.$disconnect();
}

checkCoverage().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});












