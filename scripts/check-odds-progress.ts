import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking Phase 2 (Odds Backfill) progress...\n');
  
  // Check market lines for Weeks 1-7
  const lines = await prisma.marketLine.findMany({
    where: {
      season: 2025,
      week: { in: [1, 2, 3, 4, 5, 6, 7] },
      source: 'oddsapi',
    },
    select: {
      gameId: true,
      bookName: true,
      lineType: true,
      timestamp: true,
    },
  });
  
  const gamesWithLines = new Set(lines.map(l => l.gameId)).size;
  const uniqueBooks = new Set(lines.map(l => l.bookName)).size;
  const booksByGame = new Map<string, Set<string>>();
  
  for (const line of lines) {
    if (!booksByGame.has(line.gameId)) {
      booksByGame.set(line.gameId, new Set());
    }
    booksByGame.get(line.gameId)!.add(line.bookName || 'unknown');
  }
  
  const bookCounts = Array.from(booksByGame.values()).map(books => books.size);
  const medianBooks = bookCounts.length > 0
    ? bookCounts.sort((a, b) => a - b)[Math.floor(bookCounts.length / 2)]
    : 0;
  
  console.log(`Total market lines: ${lines.length}`);
  console.log(`Games with lines: ${gamesWithLines}`);
  console.log(`Unique bookmakers: ${uniqueBooks}`);
  console.log(`Median books per game: ${medianBooks}`);
  console.log(`Book count range: [${Math.min(...bookCounts, 0)}, ${Math.max(...bookCounts, 0)}]`);
  
  // Check for normalized book names
  const bookNames = new Set(lines.map(l => l.bookName).filter(Boolean));
  const suspicious = Array.from(bookNames).filter(name => 
    name === 'unknown' || 
    name === 'undefined' || 
    name?.toLowerCase().includes('undefined')
  );
  
  if (suspicious.length > 0) {
    console.log(`\n⚠️  Suspicious book names found: ${suspicious.length}`);
  } else {
    console.log(`\n✅ All book names appear normalized`);
  }
  
  await prisma.$disconnect();
}

main();

