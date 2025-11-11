import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Check a few week 1 games
  const games = await prisma.game.findMany({
    where: { season: 2025, week: 1, status: 'final' },
    include: {
      marketLines: { where: { lineType: 'spread' } }
    },
    take: 3
  });

  for (const game of games) {
    console.log(`\nGame: ${game.id}`);
    console.log(`  Scheduled: ${game.scheduledDate}`);
    console.log(`  Status: ${game.status}`);
    console.log(`  Market lines: ${game.marketLines.length}`);
    
    const books = new Set(game.marketLines.map(l => l.bookmaker));
    console.log(`  Unique books: ${books.size} (${Array.from(books).join(', ')})`);
    
    if (game.marketLines.length > 0) {
      console.log(`  Line timestamps:`);
      game.marketLines.slice(0, 3).forEach(l => {
        console.log(`    ${l.bookmaker}: ${l.timestamp} (lineValue: ${l.lineValue}, closingLine: ${l.closingLine})`);
      });
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);

