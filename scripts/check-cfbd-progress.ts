import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking CFBD ingest progress...\n');
  
  // Check games
  const gamesCount = await prisma.cfbdGame.count({
    where: { season: 2025 },
  });
  console.log(`CFBD Games: ${gamesCount}`);
  
  // Check team-season stats
  const seasonStats = await prisma.cfbdEffTeamSeason.count({
    where: { season: 2025 },
  });
  console.log(`CFBD Team-Season Stats: ${seasonStats}`);
  
  // Check team-game stats
  const gameStats = await prisma.cfbdEffTeamGame.count({
    where: {
      gameIdCfbd: {
        in: (await prisma.cfbdGame.findMany({
          where: { season: 2025 },
          select: { gameIdCfbd: true },
          take: 1000,
        })).map(g => g.gameIdCfbd),
      },
    },
  });
  console.log(`CFBD Team-Game Stats: ${gameStats}`);
  
  // Check priors
  const priors = await prisma.cfbdPriorsTeamSeason.count({
    where: { season: 2025 },
  });
  console.log(`CFBD Priors: ${priors}`);
  
  // Check team mappings
  const mappings = await prisma.cfbdTeamMap.count();
  console.log(`CFBD Team Mappings: ${mappings}`);
  
  await prisma.$disconnect();
}

main();

