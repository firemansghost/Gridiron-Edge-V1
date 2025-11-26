import { prisma } from '../apps/web/lib/prisma';

async function main() {
  const games = await prisma.game.findMany({
    where: { season: 2025, week: 14 },
    take: 10,
    select: { id: true, homeTeamId: true, awayTeamId: true },
  });
  
  const totals = await prisma.marketLine.findMany({
    where: { 
      season: 2025, 
      week: 14, 
      lineType: 'total' 
    },
    select: { gameId: true, lineValue: true, timestamp: true },
  });
  
  console.log(`Week 14 Games: ${games.length}`);
  console.log(`Week 14 Total Lines: ${totals.length}`);
  console.log(`Games with totals: ${new Set(totals.map(t => t.gameId)).size}`);
  
  if (totals.length > 0) {
    console.log('\nSample total lines:');
    totals.slice(0, 5).forEach(t => {
      console.log(`  Game ${t.gameId}: ${t.lineValue} (${t.timestamp.toISOString()})`);
    });
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);

