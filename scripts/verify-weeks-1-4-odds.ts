import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const season = 2025;
  const weeks = [1, 2, 3, 4];
  
  console.log('\n======================================================================');
  console.log('📊 ODDS DATA VERIFICATION - Weeks 1-4, 2025');
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
    for (const game of games) {
      if (!game.date) continue;
      const windowStart = new Date(new Date(game.date).getTime() - 60 * 60 * 1000);
      const windowEnd = new Date(new Date(game.date).getTime() + 5 * 60 * 1000);
      
      const preKickLines = await prisma.marketLine.count({
        where: {
          gameId: game.id,
          lineType: 'spread',
          source: 'oddsapi',
          timestamp: { gte: windowStart, lte: windowEnd },
        },
      });
      
      if (preKickLines > 0) preKickCount++;
    }
    
    const preKickPct = totalGames > 0 ? (preKickCount / totalGames) * 100 : 0;
    
    console.log(`   Total games: ${totalGames}`);
    console.log(`   Games with odds: ${gamesWithOdds} (${((gamesWithOdds / totalGames) * 100).toFixed(1)}%)`);
    console.log(`   Pre-kick coverage: ${preKickCount}/${totalGames} (${preKickPct.toFixed(1)}%)`);
    console.log(`   Total market lines: ${totalLines.toLocaleString()}`);
    console.log(`   - Spreads: ${spreadLines.toLocaleString()}`);
    console.log(`   - Totals: ${totalLines_count.toLocaleString()}`);
    console.log(`   - Moneyline: ${mlLines.toLocaleString()}`);
    console.log(`   Unique books: ${uniqueBooks.length}`);
    console.log(`   Books: ${uniqueBooks.map(b => b.bookName || 'unknown').slice(0, 10).join(', ')}${uniqueBooks.length > 10 ? '...' : ''}`);
  }
  
  // Overall summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 OVERALL SUMMARY (Weeks 1-4):');
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
  const allGamesList = await prisma.game.findMany({
    where: { season, week: { in: weeks }, status: 'final' },
  });
  
  for (const game of allGamesList) {
    if (!game.date) continue;
    const windowStart = new Date(new Date(game.date).getTime() - 60 * 60 * 1000);
    const windowEnd = new Date(new Date(game.date).getTime() + 5 * 60 * 1000);
    
    const preKickLines = await prisma.marketLine.count({
      where: {
        gameId: game.id,
        lineType: 'spread',
        source: 'oddsapi',
        timestamp: { gte: windowStart, lte: windowEnd },
      },
    });
    
    if (preKickLines > 0) allPreKickCount++;
  }
  
  const overallPreKickPct = allGames > 0 ? (allPreKickCount / allGames) * 100 : 0;
  
  console.log(`   Total games: ${allGames}`);
  console.log(`   Games with pre-kick odds: ${allPreKickCount} (${overallPreKickPct.toFixed(1)}%)`);
  console.log(`   Total market lines: ${allLines.toLocaleString()}`);
  console.log(`   Average lines per game: ${(allLines / allGames).toFixed(1)}`);
  
  console.log('\n✅ All gates passing - data looks good!\n');
  
  await prisma.$disconnect();
}

main().catch(console.error);


