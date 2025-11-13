import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const season = 2025;
  const weeks = [5, 6, 7];
  
  console.log('\n======================================================================');
  console.log('📊 ODDS DATA VERIFICATION - Weeks 5-7, 2025');
  console.log('======================================================================\n');
  
  for (const week of weeks) {
    console.log(`\n📅 WEEK ${week}:`);
    console.log('-'.repeat(70));
    
    // Total games
    const totalGames = await prisma.game.count({
      where: { season, week, status: 'final' },
    });
    
    // Games with any odds
    const gamesWithOdds = await prisma.game.count({
      where: {
        season,
        week,
        status: 'final',
        marketLines: { some: {} },
      },
    });
    
    // Total market lines
    const totalLines = await prisma.marketLine.count({
      where: {
        game: { season, week, status: 'final' },
        source: 'oddsapi',
      },
    });
    
    // Lines by type
    const spreadLines = await prisma.marketLine.count({
      where: {
        game: { season, week, status: 'final' },
        source: 'oddsapi',
        lineType: 'spread',
      },
    });
    
    const totalLines_count = await prisma.marketLine.count({
      where: {
        game: { season, week, status: 'final' },
        source: 'oddsapi',
        lineType: 'total',
      },
    });
    
    const mlLines = await prisma.marketLine.count({
      where: {
        game: { season, week, status: 'final' },
        source: 'oddsapi',
        lineType: 'moneyline',
      },
    });
    
    // Unique books
    const uniqueBooks = await prisma.marketLine.findMany({
      where: {
        game: { season, week, status: 'final' },
        source: 'oddsapi',
      },
      select: { bookName: true },
      distinct: ['bookName'],
    });
    
    // Pre-kick coverage
    const games = await prisma.game.findMany({
      where: { season, week, status: 'final' },
    });
    
    let preKickCount = 0;
    const bookCounts: number[] = [];
    
    for (const game of games) {
      if (!game.date) continue;
      const windowStart = new Date(new Date(game.date).getTime() - 60 * 60 * 1000);
      const windowEnd = new Date(new Date(game.date).getTime() + 5 * 60 * 1000);
      
      const preKickLines = await prisma.marketLine.findMany({
        where: {
          gameId: game.id,
          lineType: 'spread',
          source: 'oddsapi',
          timestamp: { gte: windowStart, lte: windowEnd },
        },
      });
      
      if (preKickLines.length > 0) {
        preKickCount++;
        const uniqueBooksForGame = new Set(preKickLines.map(l => l.bookName)).size;
        bookCounts.push(uniqueBooksForGame);
      }
    }
    
    const preKickPct = totalGames > 0 ? (preKickCount / totalGames) * 100 : 0;
    const medianBooks = bookCounts.length > 0
      ? bookCounts.sort((a, b) => a - b)[Math.floor(bookCounts.length / 2)]
      : 0;
    
    console.log(`   Total games: ${totalGames}`);
    console.log(`   Games with odds: ${gamesWithOdds} (${((gamesWithOdds / totalGames) * 100).toFixed(1)}%)`);
    console.log(`   Pre-kick coverage: ${preKickCount}/${totalGames} (${preKickPct.toFixed(1)}%)`);
    console.log(`   Median unique books: ${medianBooks}`);
    console.log(`   Total market lines: ${totalLines.toLocaleString()}`);
    console.log(`   - Spreads: ${spreadLines.toLocaleString()}`);
    console.log(`   - Totals: ${totalLines_count.toLocaleString()}`);
    console.log(`   - Moneyline: ${mlLines.toLocaleString()}`);
    console.log(`   Unique books: ${uniqueBooks.length}`);
    console.log(`   Books: ${uniqueBooks.map(b => b.bookName || 'unknown').slice(0, 10).join(', ')}${uniqueBooks.length > 10 ? '...' : ''}`);
  }
  
  // Overall summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 OVERALL SUMMARY (Weeks 5-7):');
  console.log('='.repeat(70));
  
  const allGames = await prisma.game.count({
    where: { season, week: { in: weeks }, status: 'final' },
  });
  
  const allLines = await prisma.marketLine.count({
    where: {
      game: { season, week: { in: weeks }, status: 'final' },
      source: 'oddsapi',
    },
  });
  
  let allPreKickCount = 0;
  const allBookCounts: number[] = [];
  const allGamesList = await prisma.game.findMany({
    where: { season, week: { in: weeks }, status: 'final' },
  });
  
  for (const game of allGamesList) {
    if (!game.date) continue;
    const windowStart = new Date(new Date(game.date).getTime() - 60 * 60 * 1000);
    const windowEnd = new Date(new Date(game.date).getTime() + 5 * 60 * 1000);
    
    const preKickLines = await prisma.marketLine.findMany({
      where: {
        gameId: game.id,
        lineType: 'spread',
        source: 'oddsapi',
        timestamp: { gte: windowStart, lte: windowEnd },
      },
    });
    
    if (preKickLines.length > 0) {
      allPreKickCount++;
      const uniqueBooksForGame = new Set(preKickLines.map(l => l.bookName)).size;
      allBookCounts.push(uniqueBooksForGame);
    }
  }
  
  const overallPreKickPct = allGames > 0 ? (allPreKickCount / allGames) * 100 : 0;
  const overallMedianBooks = allBookCounts.length > 0
    ? allBookCounts.sort((a, b) => a - b)[Math.floor(allBookCounts.length / 2)]
    : 0;
  
  console.log(`   Total games: ${allGames}`);
  console.log(`   Games with pre-kick odds: ${allPreKickCount} (${overallPreKickPct.toFixed(1)}%)`);
  console.log(`   Median unique books: ${overallMedianBooks}`);
  console.log(`   Total market lines: ${allLines.toLocaleString()}`);
  console.log(`   Average lines per game: ${(allLines / allGames).toFixed(1)}`);
  
  // Check gates
  const isEarlyWeeks = true; // Weeks 5-7 are still early weeks
  const coverageThreshold = 15;
  const passesCoverage = overallPreKickPct >= coverageThreshold;
  const passesBooks = overallMedianBooks >= 5;
  
  console.log('\n' + '='.repeat(70));
  console.log('🚦 GATES CHECK:');
  console.log('='.repeat(70));
  console.log(`   Pre-kick coverage: ${passesCoverage ? '✅ PASS' : '❌ FAIL'} - ${overallPreKickPct.toFixed(1)}% (target: ≥${coverageThreshold}%)`);
  console.log(`   Median unique books: ${passesBooks ? '✅ PASS' : '❌ FAIL'} - ${overallMedianBooks} (target: ≥5)`);
  console.log(`   Overall: ${passesCoverage && passesBooks ? '✅ ALL GATES PASSED' : '❌ GATES FAILED'}\n`);
  
  await prisma.$disconnect();
}

main().catch(console.error);


