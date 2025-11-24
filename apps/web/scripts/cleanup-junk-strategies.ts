/**
 * Cleanup Junk Strategies
 * 
 * Removes test/demo strategy data from the database.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/cleanup-junk-strategies.ts
 */

import { prisma } from '../lib/prisma';

const JUNK_STRATEGY_TAGS = [
  'demo_seed',
  'test_1',
  'test_2',
  'rule_test_3',
  'test_strategy',
];

async function main() {
  console.log('\n🧹 Cleaning up junk strategies...\n');

  // Delete bets with junk strategy tags
  console.log('📊 Deleting bets with junk strategy tags...');
  let totalBetsDeleted = 0;
  
  for (const tag of JUNK_STRATEGY_TAGS) {
    const count = await prisma.bet.count({
      where: { strategyTag: tag },
    });
    
    if (count > 0) {
      const result = await prisma.bet.deleteMany({
        where: { strategyTag: tag },
      });
      console.log(`   ✅ Deleted ${result.count} bet(s) with strategyTag="${tag}"`);
      totalBetsDeleted += result.count;
    } else {
      console.log(`   ⚪ No bets found with strategyTag="${tag}"`);
    }
  }

  // Delete rulesets with junk IDs
  console.log('\n📋 Deleting rulesets with junk IDs...');
  let totalRulesetsDeleted = 0;
  
  for (const id of JUNK_STRATEGY_TAGS) {
    const count = await prisma.ruleset.count({
      where: { id },
    });
    
    if (count > 0) {
      const result = await prisma.ruleset.deleteMany({
        where: { id },
      });
      console.log(`   ✅ Deleted ${result.count} ruleset(s) with id="${id}"`);
      totalRulesetsDeleted += result.count;
    } else {
      console.log(`   ⚪ No rulesets found with id="${id}"`);
    }
  }

  console.log('\n✅ Cleanup complete!');
  console.log(`   Total bets deleted: ${totalBetsDeleted}`);
  console.log(`   Total rulesets deleted: ${totalRulesetsDeleted}`);
  console.log('');
}

main()
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

