/**
 * Cleanup Demo/Test Bets Script
 * 
 * This script identifies and optionally removes demo/test bets from the database.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/cleanup-demo-bets.ts [--dry-run] [--delete]
 * 
 * Options:
 *   --dry-run: Only log what would be deleted, don't actually delete (default)
 *   --delete: Actually delete the identified bets (use with caution!)
 * 
 * This script is for manual cleanup and should NOT be run automatically on deploy.
 */

import { prisma } from '../lib/prisma';
import { EXCLUDED_STRATEGY_TAGS, isExcludedStrategyTag } from '../lib/config/official-strategies';

async function cleanupDemoBets(dryRun: boolean = true) {
  console.log('🔍 Scanning for demo/test bets...\n');

  // Find all bets with excluded strategy tags
  const allBets = await prisma.bet.findMany({
    select: {
      id: true,
      season: true,
      week: true,
      strategyTag: true,
      source: true,
      createdAt: true,
      game: {
        select: {
          awayTeam: { select: { name: true } },
          homeTeam: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const demoBets = allBets.filter(bet => isExcludedStrategyTag(bet.strategyTag));

  console.log(`Found ${demoBets.length} demo/test bets out of ${allBets.length} total bets\n`);

  if (demoBets.length === 0) {
    console.log('✅ No demo/test bets found. Database is clean!');
    return;
  }

  // Group by strategy tag
  const byTag = new Map<string, typeof demoBets>();
  for (const bet of demoBets) {
    if (!byTag.has(bet.strategyTag)) {
      byTag.set(bet.strategyTag, []);
    }
    byTag.get(bet.strategyTag)!.push(bet);
  }

  console.log('Breakdown by strategy tag:');
  for (const [tag, bets] of byTag.entries()) {
    console.log(`  ${tag}: ${bets.length} bets`);
  }
  console.log('');

  // Show sample bets
  console.log('Sample bets (first 10):');
  for (const bet of demoBets.slice(0, 10)) {
    const gameName = `${bet.game.awayTeam.name} @ ${bet.game.homeTeam.name}`;
    console.log(`  ${bet.id.substring(0, 8)}... | ${bet.season} W${bet.week} | ${bet.strategyTag} | ${gameName}`);
  }
  if (demoBets.length > 10) {
    console.log(`  ... and ${demoBets.length - 10} more`);
  }
  console.log('');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No bets were deleted.');
    console.log('   To actually delete these bets, run with --delete flag');
    console.log('   Example: npx tsx apps/web/scripts/cleanup-demo-bets.ts --delete');
  } else {
    console.log('⚠️  DELETION MODE - This will permanently delete the bets listed above.');
    console.log('   Press Ctrl+C within 5 seconds to cancel...\n');
    
    await new Promise(resolve => setTimeout(resolve, 5000));

    const betIds = demoBets.map(bet => bet.id);
    const result = await prisma.bet.deleteMany({
      where: {
        id: { in: betIds },
      },
    });

    console.log(`✅ Deleted ${result.count} demo/test bets`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--delete');

  try {
    await cleanupDemoBets(dryRun);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

