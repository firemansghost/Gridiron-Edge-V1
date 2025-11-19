/**
 * Find Texas A M @ LSU game
 */

import { prisma } from '../lib/prisma';

async function findGame() {
  // Check the specific game ID from the ungraded bet
  const game = await prisma.game.findUnique({
    where: { id: '2025-wk9-texas-a-m-lsu' },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  if (game) {
    console.log('Game ID:', game.id);
    console.log('Matchup:', `${game.awayTeam.name} @ ${game.homeTeam.name}`);
    console.log('Status:', game.status);
    console.log('Scores:', `${game.awayScore} @ ${game.homeScore}`);
    
    // Check if CFBD has this game with a different ID format
    console.log('\nChecking if CFBD might use different ID format...');
    const cfbdId = '2025-wk9-texas-am-lsu'; // What CFBD sync was looking for
    const cfbdGame = await prisma.game.findUnique({
      where: { id: cfbdId },
    });
    console.log('CFBD ID exists:', !!cfbdGame);
  } else {
    console.log('Game not found with ID: 2025-wk9-texas-a-m-lsu');
  }

  await prisma.$disconnect();
}

findGame().catch(console.error);

