/**
 * Debug Strategies Script
 * 
 * Queries the Bet table to verify strategy tags exist in the database.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/debug-strategies.ts [season] [week] [strategyTag]
 * 
 * Examples:
 *   npx tsx apps/web/scripts/debug-strategies.ts 2025 13 hybrid_v2
 *   npx tsx apps/web/scripts/debug-strategies.ts 2025 13
 */

import { prisma } from '../lib/prisma';

async function main() {
  const args = process.argv.slice(2);
  
  const season = args[0] ? parseInt(args[0]) : 2025;
  const week = args[1] ? parseInt(args[1]) : 13;
  const strategyTag = args[2] || 'hybrid_v2';

  if (isNaN(season) || isNaN(week)) {
    console.error('Error: season and week must be valid numbers');
    process.exit(1);
  }

  console.log(`\n🔍 Debugging Strategy Tags`);
  console.log(`   Season: ${season}`);
  console.log(`   Week: ${week}`);
  console.log(`   Strategy Tag: ${strategyTag}`);
  console.log('');

  // Count bets with the specific strategy tag
  const count = await prisma.bet.count({
    where: {
      season,
      week,
      strategyTag,
      source: 'strategy_run',
    },
  });

  console.log(`✅ Found ${count} bet(s) with strategyTag="${strategyTag}"`);

  // Get sample bets
  const sampleBets = await prisma.bet.findMany({
    where: {
      season,
      week,
      strategyTag,
      source: 'strategy_run',
    },
    take: 5,
    select: {
      id: true,
      gameId: true,
      marketType: true,
      side: true,
      strategyTag: true,
      source: true,
      result: true,
      pnl: true,
    },
  });

  if (sampleBets.length > 0) {
    console.log(`\n📋 Sample bets (showing first ${sampleBets.length}):`);
    sampleBets.forEach((bet, idx) => {
      console.log(`   ${idx + 1}. ${bet.gameId} | ${bet.marketType} ${bet.side} | result=${bet.result} | pnl=${bet.pnl}`);
    });
  }

  // Get all distinct strategy tags for this week
  const allTags = await prisma.bet.findMany({
    where: {
      season,
      week,
      source: 'strategy_run',
    },
    select: {
      strategyTag: true,
    },
    distinct: ['strategyTag'],
  });

  console.log(`\n📊 All strategy tags for ${season} Week ${week}:`);
  for (const tag of allTags) {
    const tagCount = await prisma.bet.count({
      where: {
        season,
        week,
        strategyTag: tag.strategyTag,
        source: 'strategy_run',
      },
    });
    console.log(`   - ${tag.strategyTag || '(null)'}: ${tagCount} bet(s)`);
  }

  // Check if there's a ruleset for this strategy tag
  if (strategyTag) {
    const ruleset = await prisma.ruleset.findFirst({
      where: {
        id: strategyTag,
      },
    });

    console.log(`\n🔧 Ruleset check:`);
    if (ruleset) {
      console.log(`   ✅ Ruleset exists: "${ruleset.name}" (active=${ruleset.active})`);
    } else {
      console.log(`   ⚠️  No ruleset found with id="${strategyTag}"`);
      console.log(`   💡 This strategy tag exists in bets but not in rulesets table`);
    }
  }

  console.log('');
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

