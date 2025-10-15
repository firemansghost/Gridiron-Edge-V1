const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const games = await prisma.game.findMany({
    where: { season: 2025, week: 1 },
    take: 10
  });
  
  console.log(`\nFound ${games.length} games for 2025 Week 1:\n`);
  games.forEach(g => {
    console.log(`  ${g.id}`);
    console.log(`    ${g.awayTeamId} @ ${g.homeTeamId}`);
  });
  
  await prisma.$disconnect();
}

main();

