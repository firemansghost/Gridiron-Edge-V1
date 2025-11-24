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

  // Step 1: Audit - Fetch and log all existing rulesets and strategy tags
  console.log('📋 Step 1: Auditing existing data...\n');
  
  const allRulesets = await prisma.ruleset.findMany({
    select: {
      id: true,
      name: true,
      active: true,
    },
    orderBy: {
      name: 'asc',
    },
  });
  
  console.log(`   Current Rulesets (${allRulesets.length} total):`);
  allRulesets.forEach(r => {
    console.log(`     - "${r.name}" (id: ${r.id}, active: ${r.active})`);
  });
  
  const allBetTags = await prisma.bet.findMany({
    select: {
      strategyTag: true,
    },
    distinct: ['strategyTag'],
    orderBy: {
      strategyTag: 'asc',
    },
  });
  
  console.log(`\n   Current Bet Strategy Tags (${allBetTags.length} distinct):`);
  allBetTags.forEach(b => {
    console.log(`     - "${b.strategyTag}"`);
  });
  
  console.log('\n');

  // Step 2: Delete bets with junk strategy tags
  console.log('📊 Step 2: Deleting bets with junk strategy tags...');
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

  // Step 3: Find and delete rulesets by exact name match
  console.log('\n📋 Step 3: Finding rulesets by exact name match...');
  const junkRulesetsExact = await prisma.ruleset.findMany({
    where: {
      name: { in: JUNK_RULESET_NAMES },
    },
    select: {
      id: true,
      name: true,
    },
  });

  let rulesetsDeletedByName = 0;
  if (junkRulesetsExact.length > 0) {
    console.log(`   Found ${junkRulesetsExact.length} ruleset(s) matching exact names: ${junkRulesetsExact.map(r => r.name).join(', ')}`);
    const junkRulesetIds = junkRulesetsExact.map(r => r.id);
    
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
  } else {
    console.log('   ⚪ No rulesets found matching exact junk names');
  }

  // Step 4: Case-insensitive fuzzy search for "Rule test" variants
  console.log('\n📋 Step 4: Finding rulesets with case-insensitive "Rule test" match...');
  const allRulesetsForFuzzy = await prisma.ruleset.findMany({
    select: {
      id: true,
      name: true,
    },
  });

  const fuzzyJunkRulesets = allRulesetsForFuzzy.filter(r => {
    const nameLower = r.name.toLowerCase();
    return nameLower.includes('rule test') || 
           nameLower.includes('ruletest') ||
           nameLower.includes('test 1') ||
           nameLower.includes('test 2') ||
           nameLower.includes('test1') ||
           nameLower.includes('test2') ||
           nameLower.includes('demo data') ||
           nameLower.includes('demodata');
  });

  if (fuzzyJunkRulesets.length > 0) {
    console.log(`   Found ${fuzzyJunkRulesets.length} ruleset(s) with fuzzy match: ${fuzzyJunkRulesets.map(r => r.name).join(', ')}`);
    const fuzzyRulesetIds = fuzzyJunkRulesets.map(r => r.id);
    
    // Delete StrategyRun records
    const fuzzyStrategyRunsDeleted = await prisma.strategyRun.deleteMany({
      where: {
        rulesetId: { in: fuzzyRulesetIds },
      },
    });
    if (fuzzyStrategyRunsDeleted.count > 0) {
      console.log(`   ✅ Deleted ${fuzzyStrategyRunsDeleted.count} StrategyRun record(s)`);
    }
    
    // Delete bets with matching strategyTag
    let fuzzyBetsDeleted = 0;
    for (const rulesetId of fuzzyRulesetIds) {
      const count = await prisma.bet.count({
        where: { strategyTag: rulesetId },
      });
      if (count > 0) {
        const result = await prisma.bet.deleteMany({
          where: { strategyTag: rulesetId },
        });
        console.log(`   ✅ Deleted ${result.count} bet(s) with strategyTag="${rulesetId}"`);
        fuzzyBetsDeleted += result.count;
      }
    }
    totalBetsDeleted += fuzzyBetsDeleted;
    
    // Delete the fuzzy-matched rulesets
    const fuzzyRulesetsDeleted = await prisma.ruleset.deleteMany({
      where: {
        id: { in: fuzzyRulesetIds },
      },
    });
    rulesetsDeletedByName += fuzzyRulesetsDeleted.count;
    console.log(`   ✅ Deleted ${fuzzyRulesetsDeleted.count} fuzzy-matched ruleset(s)`);
  } else {
    console.log('   ⚪ No rulesets found with fuzzy "Rule test" match');
  }

  // Step 5: Delete bets with fuzzy strategyTag matches
  console.log('\n📋 Step 5: Finding bets with fuzzy strategyTag matches...');
  const allBetTagsForFuzzy = await prisma.bet.findMany({
    select: {
      strategyTag: true,
    },
    distinct: ['strategyTag'],
  });

  const fuzzyJunkTags = allBetTagsForFuzzy
    .map(b => b.strategyTag)
    .filter(tag => {
      const tagLower = tag.toLowerCase();
      return tagLower.includes('rule_test') ||
             tagLower.includes('ruletest') ||
             tagLower.includes('test_1') ||
             tagLower.includes('test_2') ||
             tagLower.includes('test1') ||
             tagLower.includes('test2') ||
             tagLower.includes('demo_seed') ||
             tagLower.includes('demoseed');
    });

  if (fuzzyJunkTags.length > 0) {
    console.log(`   Found ${fuzzyJunkTags.length} fuzzy strategyTag(s): ${fuzzyJunkTags.join(', ')}`);
    for (const tag of fuzzyJunkTags) {
      const count = await prisma.bet.count({
        where: { strategyTag: tag },
      });
      if (count > 0) {
        const result = await prisma.bet.deleteMany({
          where: { strategyTag: tag },
        });
        console.log(`   ✅ Deleted ${result.count} bet(s) with strategyTag="${tag}"`);
        totalBetsDeleted += result.count;
      }
    }
  } else {
    console.log('   ⚪ No bets found with fuzzy strategyTag matches');
  }

  // Step 6: Also try deleting rulesets with junk IDs (for backwards compatibility)
  console.log('\n📋 Step 6: Checking for rulesets with junk IDs (legacy check)...');
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
