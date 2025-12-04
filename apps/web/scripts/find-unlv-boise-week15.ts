import { prisma } from '../lib/prisma';

async function main() {
  // Find Week 15 UNLV @ Boise State
  const game = await prisma.game.findFirst({
    where: {
      season: 2025,
      week: 15,
      homeTeam: {
        name: { contains: 'Boise', mode: 'insensitive' },
      },
      awayTeam: {
        name: { contains: 'UNLV', mode: 'insensitive' },
      },
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  if (!game) {
    console.log('Week 15 game not found');
    await prisma.$disconnect();
    return;
  }

  console.log(`\nWeek 15 Game: ${game.awayTeam.name} @ ${game.homeTeam.name}`);
  console.log(`Game ID: ${game.id}`);
  console.log(`Date: ${game.date}`);

  // Check all strategies
  const allBets = await prisma.bet.findMany({
    where: {
      gameId: game.id,
      marketType: 'spread',
    },
  });

  console.log(`\nAll Spread Bets for this game:`);
  for (const bet of allBets) {
    const betTeamId = bet.side === 'home' ? game.homeTeamId : game.awayTeamId;
    const betTeamName = bet.side === 'home' ? game.homeTeam.name : game.awayTeam.name;
    const closePrice = bet.closePrice ? Number(bet.closePrice) : null;
    const modelPrice = bet.modelPrice ? Number(bet.modelPrice) : null;
    const edge = modelPrice !== null && closePrice !== null ? Math.abs(modelPrice - closePrice) : null;
    
    console.log(`  Strategy: ${bet.strategyTag}`);
    console.log(`    Side: ${bet.side}`);
    console.log(`    Bet Team: ${betTeamName}`);
    console.log(`    closePrice: ${closePrice}`);
    console.log(`    modelPrice: ${modelPrice}`);
    console.log(`    Edge: ${edge}`);
    if (closePrice !== null) {
      const lineStr = closePrice >= 0 ? `+${closePrice.toFixed(1)}` : closePrice.toFixed(1);
      console.log(`    Label: ${betTeamName} ${lineStr}`);
    }
    console.log('');
  }

  // Check market lines
  const marketLines = await prisma.marketLine.findMany({
    where: {
      gameId: game.id,
      lineType: 'spread',
    },
    orderBy: { timestamp: 'desc' },
    take: 5,
  });

  console.log(`\nRecent Market Lines:`);
  for (const line of marketLines) {
    console.log(`  ${line.timestamp}: ${line.teamId} ${line.lineValue} (${line.bookName})`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);

