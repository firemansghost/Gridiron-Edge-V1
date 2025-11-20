/**
 * Check which weeks have been regenerated for Season 2025
 * 
 * Usage:
 *   npx tsx apps/web/scripts/check-regeneration-status.ts
 */

import { prisma } from '../lib/prisma';

async function main() {
  console.log('\n📊 Checking regeneration status for Season 2025...\n');

  // Get all official_flat_100 bets grouped by week (strategyTag = 'official_flat_100')
  const bets = await prisma.bet.groupBy({
    by: ['week'],
    where: {
      season: 2025,
      strategyTag: 'official_flat_100',
    },
    _count: {
      _all: true,
    },
    _max: {
      updatedAt: true,
    },
  });

  console.log('Week | Bet Count | Last Updated');
  console.log('-----|-----------|--------------');
  
  const weeks = new Set<number>();
  for (const b of bets.sort((a, b) => a.week - b.week)) {
    weeks.add(b.week);
    const date = b._max.updatedAt 
      ? new Date(b._max.updatedAt).toISOString().split('T')[0] 
      : 'N/A';
    console.log(`${b.week.toString().padStart(4)} | ${b._count._all.toString().padStart(9)} | ${date}`);
  }

  // Check which weeks 1-13 are missing
  console.log('\n📋 Missing weeks (1-13):');
  const missing: number[] = [];
  for (let week = 1; week <= 13; week++) {
    if (!weeks.has(week)) {
      missing.push(week);
    }
  }
  
  if (missing.length === 0) {
    console.log('  ✅ All weeks 1-13 have betting records!');
  } else {
    console.log(`  ❌ Missing weeks: ${missing.join(', ')}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);

