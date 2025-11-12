import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n📊 QUICK STATUS CHECK\n');
  
  // Phase 2: Quick odds check
  const lines = await prisma.marketLine.findMany({
    where: {
      season: 2025,
      week: { in: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
      source: 'oddsapi',
      lineType: 'spread',
    },
    select: {
      gameId: true,
      bookName: true,
      timestamp: true,
    },
    take: 1000,
  });
  
  const uniqueBooks = new Set(lines.map(l => l.bookName)).size;
  console.log(`Phase 2 (Odds): ${lines.length} spread lines sampled, ${uniqueBooks} unique books`);
  
  // Phase 3: Quick CFBD check
  const cfbdGames = await prisma.cfbdGame.count({
    where: { season: 2025 },
  });
  
  const teamSeason = await prisma.cfbdEffTeamSeason.count({
    where: { season: 2025 },
  });
  
  const teamGame = await prisma.cfbdEffTeamGame.count({
    take: 1,
  });
  
  const priors = await prisma.cfbdPriorsTeamSeason.count({
    where: { season: 2025 },
  });
  
  console.log(`Phase 3 (CFBD): ${cfbdGames} games, ${teamSeason} season stats, ${teamGame > 0 ? 'game stats present' : '0 game stats'}, ${priors} priors`);
  
  // Check if processes are still running
  console.log(`\n💡 Both processes should still be running in background.`);
  console.log(`   Check terminal windows for progress logs.`);
  
  await prisma.$disconnect();
}

main();

