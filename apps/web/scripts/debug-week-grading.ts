/**
 * Debug Week Grading Status
 * 
 * Shows bet counts and grading status for a given week.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/debug-week-grading.ts 2025 10
 */

import { prisma } from '../lib/prisma';

async function debugWeekGrading(season: number, week: number) {
  console.log(`\n📊 Grading status for ${season} Week ${week}\n`);

  // Get all strategy_run bets for this week
  const allBets = await prisma.bet.findMany({
    where: {
      season,
      week,
      source: 'strategy_run',
    },
    select: {
      id: true,
      strategyTag: true,
      marketType: true,
      result: true,
      gameId: true,
      game: {
        select: {
          homeScore: true,
          awayScore: true,
          date: true,
        },
      },
    },
  });

  // Group by strategyTag
  const byTag = new Map<string, typeof allBets>();
  for (const bet of allBets) {
    const tag = bet.strategyTag || '(no tag)';
    if (!byTag.has(tag)) {
      byTag.set(tag, []);
    }
    byTag.get(tag)!.push(bet);
  }

  // Count by result status
  const countByResult = (bets: typeof allBets) => {
    const counts = {
      pending: 0,
      null: 0,
      win: 0,
      loss: 0,
      push: 0,
      other: 0,
    };
    for (const bet of bets) {
      if (bet.result === null) {
        counts.null++;
      } else if (bet.result === 'pending') {
        counts.pending++;
      } else if (bet.result === 'win' || bet.result === 'W') {
        counts.win++;
      } else if (bet.result === 'loss' || bet.result === 'L') {
        counts.loss++;
      } else if (bet.result === 'push' || bet.result === 'Push') {
        counts.push++;
      } else {
        counts.other++;
      }
    }
    return counts;
  };

  // Count games with scores
  const gamesWithScores = new Set<string>();
  for (const bet of allBets) {
    if (bet.game?.homeScore !== null && bet.game?.awayScore !== null) {
      gamesWithScores.add(bet.gameId);
    }
  }

  console.log(`Total strategy_run bets: ${allBets.length}`);
  console.log(`Games with scores: ${gamesWithScores.size}`);
  console.log('');

  // Show breakdown by strategyTag
  for (const [tag, bets] of Array.from(byTag.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const counts = countByResult(bets);
    const ungraded = counts.null + counts.pending;
    const graded = counts.win + counts.loss + counts.push + counts.other;
    
    console.log(`Strategy: ${tag}`);
    console.log(`  Total bets: ${bets.length}`);
    console.log(`  Graded: ${graded} (W: ${counts.win}, L: ${counts.loss}, P: ${counts.push}, Other: ${counts.other})`);
    console.log(`  Ungraded: ${ungraded} (null: ${counts.null}, pending: ${counts.pending})`);
    console.log('');
  }

  // Show sample of ungraded bets
  const ungradedBets = allBets.filter(bet => 
    bet.result === null || bet.result === 'pending'
  );
  
  if (ungradedBets.length > 0) {
    console.log(`\nSample of ${Math.min(5, ungradedBets.length)} ungraded bets:`);
    for (const bet of ungradedBets.slice(0, 5)) {
      const hasScores = bet.game?.homeScore !== null && bet.game?.awayScore !== null;
      console.log(`  ${bet.id.substring(0, 8)}... ${bet.marketType} ${bet.side} - Game has scores: ${hasScores}`);
    }
    if (ungradedBets.length > 5) {
      console.log(`  ... and ${ungradedBets.length - 5} more`);
    }
  }
  
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: npx tsx apps/web/scripts/debug-week-grading.ts <season> <week>');
    console.error('Example: npx tsx apps/web/scripts/debug-week-grading.ts 2025 10');
    process.exit(1);
  }

  const season = parseInt(args[0]);
  const week = parseInt(args[1]);

  if (isNaN(season) || isNaN(week)) {
    console.error('Error: season and week must be valid numbers');
    process.exit(1);
  }

  try {
    await debugWeekGrading(season, week);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

