/**
 * Verify Week Review Data
 * 
 * Quick sanity check to see what bets exist in the DB for specific weeks
 * and whether the official strategy filter is working correctly.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/verify-week-review-data.ts [season] [week]
 * 
 * Example:
 *   npx tsx apps/web/scripts/verify-week-review-data.ts 2025 9
 */

import { prisma } from '../lib/prisma';
import { getOfficialStrategyTagsForFilter, isExcludedStrategyTag } from '../lib/config/official-strategies';

async function verifyWeekData(season: number, week: number) {
  console.log(`\n📊 Verifying ${season} Week ${week} data...\n`);

  // Query 1: All strategy_run bets for this week
  const allStrategyRunBets = await prisma.bet.findMany({
    where: {
      season,
      week,
      source: 'strategy_run',
    },
    select: {
      strategyTag: true,
    },
  });

  // Group by strategyTag
  const byTag = new Map<string, number>();
  for (const bet of allStrategyRunBets) {
    byTag.set(bet.strategyTag, (byTag.get(bet.strategyTag) || 0) + 1);
  }

  console.log(`Total strategy_run bets: ${allStrategyRunBets.length}`);
  console.log(`\nBreakdown by strategyTag:`);
  for (const [tag, count] of Array.from(byTag.entries()).sort((a, b) => b[1] - a[1])) {
    const isExcluded = isExcludedStrategyTag(tag);
    const marker = isExcluded ? '❌ (excluded)' : '✅ (official)';
    console.log(`  ${tag}: ${count} ${marker}`);
  }

  // Query 2: Official bets using the new filter
  const officialTags = await getOfficialStrategyTagsForFilter();
  console.log(`\nOfficial strategy tags from config:`, officialTags);

  const officialBets = await prisma.bet.findMany({
    where: {
      season,
      week,
      source: 'strategy_run',
      strategyTag: { in: officialTags },
    },
    select: {
      strategyTag: true,
    },
  });

  console.log(`\nOfficial bets (after filter): ${officialBets.length}`);
  if (officialBets.length > 0) {
    const officialByTag = new Map<string, number>();
    for (const bet of officialBets) {
      officialByTag.set(bet.strategyTag, (officialByTag.get(bet.strategyTag) || 0) + 1);
    }
    console.log(`Breakdown:`);
    for (const [tag, count] of Array.from(officialByTag.entries())) {
      console.log(`  ${tag}: ${count}`);
    }
  }

  // Identify demo/test tags present
  const demoTags = Array.from(byTag.keys()).filter(tag => isExcludedStrategyTag(tag));
  
  console.log(`\n📋 Summary:`);
  console.log(`  Total strategy_run bets: ${allStrategyRunBets.length}`);
  console.log(`  Official bets: ${officialBets.length}`);
  console.log(`  Demo/test bets: ${allStrategyRunBets.length - officialBets.length}`);
  if (demoTags.length > 0) {
    console.log(`  Demo/test tags present: ${demoTags.join(', ')}`);
  }

  if (allStrategyRunBets.length > 0 && officialBets.length === 0) {
    console.log(`\n⚠️  WARNING: Strategy-run bets exist but none are official!`);
    console.log(`   This means Week Review will show 0 bets (expected behavior).`);
    console.log(`   Demo/test bets are being correctly excluded.`);
  } else if (allStrategyRunBets.length === 0) {
    console.log(`\n✅ No strategy-run bets found for this week (expected if no strategies have run yet).`);
  } else {
    console.log(`\n✅ Official bets found - Week Review should show data.`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const season = args[0] ? parseInt(args[0]) : 2025;
  const week = args[1] ? parseInt(args[1]) : 9;

  try {
    await verifyWeekData(season, week);
    
    // Also check Week 11 if Week 9 was specified
    if (week === 9) {
      await verifyWeekData(season, 11);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

