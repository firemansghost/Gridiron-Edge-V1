/**
 * Check the Alabama State @ Alabama A M game
 */

import { prisma } from '../lib/prisma';

async function checkGame() {
  const gameId = '2025-wk9-alabama-state-alabama-a-m';
  
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  if (!game) {
    console.log('Game not found');
    await prisma.$disconnect();
    return;
  }

  console.log('Game:', game);
  console.log(`Home: ${game.homeTeam.name}`);
  console.log(`Away: ${game.awayTeam.name}`);
  console.log(`Scores: ${game.awayScore} @ ${game.homeScore}`);
  console.log(`Status: ${game.status}`);
  console.log(`Date: ${game.date}`);

  // Check if this is an FCS game (might not be in CFBD FBS data)
  console.log('\nNote: This might be an FCS game, which CFBD sync filters out (only fetches FBS games)');

  await prisma.$disconnect();
}

checkGame().catch(console.error);




