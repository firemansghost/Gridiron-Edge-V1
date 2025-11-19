/**
 * Check Week 9 games and their scores
 */

import { prisma } from '../lib/prisma';

async function checkWeek9() {
  console.log('\n🔍 Checking Week 9 games and bets...\n');

  // Get ungraded bets
  const ungradedBets = await prisma.bet.findMany({
    where: {
      season: 2025,
      week: 9,
      result: null,
      source: 'strategy_run',
    },
    include: {
      game: {
        select: {
          id: true,
          homeScore: true,
          awayScore: true,
          date: true,
          status: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });

  console.log(`Found ${ungradedBets.length} ungraded bets\n`);

  for (const bet of ungradedBets) {
    const game = bet.game;
    const hasScores = game.homeScore !== null && game.awayScore !== null;
    console.log(`Bet: ${bet.id.substring(0, 8)}...`);
    console.log(`  Game: ${game.awayTeam.name} @ ${game.homeTeam.name}`);
    console.log(`  Game ID: ${game.id}`);
    console.log(`  Date: ${game.date}`);
    console.log(`  Status: ${game.status}`);
    console.log(`  Scores: ${game.awayScore} @ ${game.homeScore} ${hasScores ? '✅' : '❌'}`);
    console.log('');
  }

  // Check if we need to sync scores
  const gamesNeedingScores = ungradedBets.filter(b => 
    b.game.homeScore === null || b.game.awayScore === null
  );

  if (gamesNeedingScores.length > 0) {
    console.log(`\n⚠️  ${gamesNeedingScores.length} games need scores. Run CFBD sync:`);
    console.log(`   node apps/jobs/dist/src/cfbd-game-results.js --season 2025 --weeks 9`);
  } else {
    console.log('\n✅ All games have scores. Re-run grading:');
    console.log(`   npx tsx apps/web/scripts/run-grading-for-week.ts 2025 9`);
  }

  await prisma.$disconnect();
}

checkWeek9().catch(console.error);




