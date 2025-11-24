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

const JUNK_RULESET_NAMES = [
  'Rule Test 3',
  'Test 1',
  'Test 2',
  'Demo Data (Seed)',
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

  // Find and delete rulesets by name
  console.log('\n📋 Finding rulesets by name...');
  const junkRulesets = await prisma.ruleset.findMany({
    where: {
      name: { in: JUNK_RULESET_NAMES },
    },
    select: {
      id: true,
      name: true,
    },
  });

  let rulesetsDeletedByName = 0;
  if (junkRulesets.length === 0) {
    console.log('   ⚪ No rulesets found matching junk names');
  } else {
    console.log(`   Found ${junkRulesets.length} ruleset(s) matching names: ${junkRulesets.map(r => r.name).join(', ')}`);
    const junkRulesetIds = junkRulesets.map(r => r.id);
    
    // Delete StrategyRun records linked to these rulesets
    console.log('\n🗑️  Deleting StrategyRun records linked to junk rulesets...');
    const strategyRunsDeleted = await prisma.strategyRun.deleteMany({
      where: {
        rulesetId: { in: junkRulesetIds },
      },
    });
    console.log(`   ✅ Deleted ${strategyRunsDeleted.count} StrategyRun record(s)`);
    
    // Delete bets that might reference these ruleset IDs as strategyTag
    console.log('\n🗑️  Deleting bets with strategyTag matching junk ruleset IDs...');
    let betsDeletedByRulesetId = 0;
    for (const rulesetId of junkRulesetIds) {
      const count = await prisma.bet.count({
        where: { strategyTag: rulesetId },
      });
      if (count > 0) {
        const result = await prisma.bet.deleteMany({
          where: { strategyTag: rulesetId },
        });
        console.log(`   ✅ Deleted ${result.count} bet(s) with strategyTag="${rulesetId}"`);
        betsDeletedByRulesetId += result.count;
      }
    }
    totalBetsDeleted += betsDeletedByRulesetId;
    
    // Delete the rulesets themselves
    console.log('\n🗑️  Deleting junk rulesets...');
    const rulesetsDeleted = await prisma.ruleset.deleteMany({
      where: {
        id: { in: junkRulesetIds },
      },
    });
    rulesetsDeletedByName = rulesetsDeleted.count;
    console.log(`   ✅ Deleted ${rulesetsDeletedByName} ruleset(s)`);
  }

  // Also try deleting rulesets with junk IDs (for backwards compatibility)
  console.log('\n📋 Checking for rulesets with junk IDs (legacy check)...');
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
  console.log(`   Total rulesets deleted: ${rulesetsDeletedByName + totalRulesetsDeleted}`);
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

