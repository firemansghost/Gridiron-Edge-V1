import { prisma } from '../apps/web/lib/prisma';

async function main() {
  const bets = await prisma.bet.findMany({
    where: {
      season: 2025,
      week: 14,
      strategyTag: 'v3_totals',
    },
    include: {
      game: {
        include: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
    take: 10,
  });

  console.log('Sample V3 Totals bets:');
  bets.forEach(b => {
    const matchup = b.game ? `${b.game.awayTeam.name} @ ${b.game.homeTeam.name}` : b.gameId;
    console.log(`  ${matchup}: ${b.side} ${b.modelPrice}, close ${b.closePrice || 'N/A'}`);
  });

  const count = await prisma.bet.count({
    where: {
      season: 2025,
      week: 14,
      strategyTag: 'v3_totals',
    },
  });

  console.log(`\nTotal V3 Totals bets for Week 14: ${count}`);

  // Check Navy @ Memphis specifically
  const navyMemphis = await prisma.game.findUnique({
    where: { id: '2025-wk14-navy-memphis' },
    include: {
      bets: {
        where: { strategyTag: 'v3_totals' },
        select: { side: true, modelPrice: true, closePrice: true },
      },
    },
  });

  if (navyMemphis) {
    console.log(`\nNavy @ Memphis V3 bets: ${navyMemphis.bets.length}`);
    navyMemphis.bets.forEach(b => {
      console.log(`  ${b.side} ${b.modelPrice}: close ${b.closePrice || 'N/A'}`);
    });
  }

  await prisma.$disconnect();
}

main().catch(console.error);

