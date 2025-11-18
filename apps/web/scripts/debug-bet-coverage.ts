/**
 * Debug Bet Coverage
 * 
 * Quick diagnostic to see what weeks/seasons have strategy-run bets
 * and which strategy tags are present.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/debug-bet-coverage.ts
 */

import { prisma } from '../lib/prisma';

async function debugBetCoverage() {
  console.log('\n📊 Strategy-run bet coverage by season/week\n');

  // Get all strategy-run bets grouped by season, week, and strategyTag
  const bets = await prisma.bet.findMany({
    where: {
      source: 'strategy_run',
    },
    select: {
      season: true,
      week: true,
      strategyTag: true,
    },
    orderBy: [
      { season: 'asc' },
      { week: 'asc' },
      { strategyTag: 'asc' },
    ],
  });

  // Group by season -> week -> strategyTag
  const bySeason = new Map<number, Map<number, Map<string, number>>>();
  
  for (const bet of bets) {
    if (!bySeason.has(bet.season)) {
      bySeason.set(bet.season, new Map());
    }
    const seasonMap = bySeason.get(bet.season)!;
    
    if (!seasonMap.has(bet.week)) {
      seasonMap.set(bet.week, new Map());
    }
    const weekMap = seasonMap.get(bet.week)!;
    
    weekMap.set(bet.strategyTag, (weekMap.get(bet.strategyTag) || 0) + 1);
  }

  // Print results
  for (const [season, seasonMap] of Array.from(bySeason.entries()).sort((a, b) => a[0] - b[0])) {
    console.log(`Season ${season}`);
    
    for (const [week, weekMap] of Array.from(seasonMap.entries()).sort((a, b) => a[0] - b[0])) {
      console.log(`  Week ${week}:`);
      
      if (weekMap.size === 0) {
        console.log(`    (none)`);
      } else {
        for (const [tag, count] of Array.from(weekMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
          console.log(`    strategyTag=${tag}   count=${count}`);
        }
      }
    }
    console.log('');
  }

  // Summary stats
  const totalBets = bets.length;
  const uniqueSeasons = bySeason.size;
  const uniqueWeeks = Array.from(bySeason.values()).reduce((sum, seasonMap) => sum + seasonMap.size, 0);
  const uniqueTags = new Set(bets.map(b => b.strategyTag)).size;

  console.log(`\n📋 Summary:`);
  console.log(`  Total strategy-run bets: ${totalBets}`);
  console.log(`  Seasons: ${uniqueSeasons}`);
  console.log(`  Weeks: ${uniqueWeeks}`);
  console.log(`  Unique strategy tags: ${uniqueTags}`);
  console.log('');
}

async function main() {
  try {
    await debugBetCoverage();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

