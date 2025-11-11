import { prisma } from '../apps/web/lib/prisma';

async function checkData() {
  console.log('\n📊 Season 2025 Data Availability\n');
  
  const ratings = await prisma.teamSeasonRating.count({
    where: { season: 2025, modelVersion: 'v1' }
  });
  
  const games = await prisma.game.count({
    where: { season: 2025, status: 'final' }
  });
  
  const lines = await prisma.marketLine.count({
    where: { season: 2025, lineType: 'spread' }
  });
  
  const gamesWithLines = await prisma.game.findMany({
    where: { season: 2025, status: 'final' },
    include: {
      marketLines: {
        where: { lineType: 'spread' },
        take: 1
      }
    }
  });
  
  const gamesWithMarketData = gamesWithLines.filter(g => g.marketLines.length > 0).length;
  
  console.log(`  Final games: ${games}`);
  console.log(`  V1 ratings: ${ratings}`);
  console.log(`  Total spread lines: ${lines}`);
  console.log(`  Games with spread lines: ${gamesWithMarketData}/${games} (${((gamesWithMarketData/games)*100).toFixed(1)}%)`);
  
  // Check by week
  console.log('\n📅 Data by Week:\n');
  for (let week = 1; week <= 12; week++) {
    const weekGames = await prisma.game.count({
      where: { season: 2025, week, status: 'final' }
    });
    
    const weekGamesWithLines = await prisma.game.count({
      where: {
        season: 2025,
        week,
        status: 'final',
        marketLines: {
          some: { lineType: 'spread' }
        }
      }
    });
    
    console.log(`  Week ${week.toString().padStart(2)}: ${weekGames} games, ${weekGamesWithLines} with lines (${weekGames > 0 ? ((weekGamesWithLines/weekGames)*100).toFixed(0) : '0'}%)`);
  }
  
  await prisma.$disconnect();
}

checkData().catch(console.error);

