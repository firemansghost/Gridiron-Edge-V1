import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Check games with market lines
  const gamesWithLines = await prisma.game.findMany({
    where: {
      season: 2025,
      week: { in: [1, 2, 3] },
      marketLines: { some: { lineType: 'spread' } }
    },
    include: {
      marketLines: { where: { lineType: 'spread' }, take: 5 }
    },
    take: 5
  });

  console.log(`\nFound ${gamesWithLines.length} games with spread lines`);

  for (const game of gamesWithLines) {
    console.log(`\nGame: ${game.id}`);
    console.log(`  Week: ${game.week}, Status: ${game.status}`);
    console.log(`  Scheduled: ${game.scheduledDate}`);
    console.log(`  Market lines: ${game.marketLines.length}`);
    
    const books = new Set(game.marketLines.map(l => l.bookmaker));
    console.log(`  Unique books: ${books.size} (${Array.from(books).slice(0, 5).join(', ')})`);
    
    if (game.marketLines.length > 0) {
      console.log(`  Sample lines:`);
      game.marketLines.slice(0, 3).forEach(l => {
        console.log(`    ${l.bookmaker}: ${l.timestamp} (lineValue: ${l.lineValue}, closingLine: ${l.closingLine})`);
      });
    }
  }

  // Count total games with lines by week
  console.log('\n\n=== Games with lines by week ===');
  for (const week of [1, 2, 3, 4, 5]) {
    const count = await prisma.game.count({
      where: {
        season: 2025,
        week,
        marketLines: { some: { lineType: 'spread' } }
      }
    });
    console.log(`Week ${week}: ${count} games`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);

