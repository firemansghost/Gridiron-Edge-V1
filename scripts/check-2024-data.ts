import { prisma } from '../apps/web/lib/prisma';

async function check2024Data() {
  try {
    // Check 2024 games
    const s2024Games = await prisma.game.count({ where: { season: 2024 } });
    
    // Check 2024 market lines
    const s2024Lines = await prisma.marketLine.count({
      where: { game: { season: 2024 } }
    });
    
    // Check games with lines
    const gamesWithLines = await prisma.marketLine.groupBy({
      where: { game: { season: 2024 } },
      by: ['gameId']
    });
    
    console.log('📊 Season 2024 Data Check\n');
    console.log('  Total games:', s2024Games);
    console.log('  Total lines:', s2024Lines);
    console.log('  Games with lines:', gamesWithLines.length);
    
    if (gamesWithLines.length > 0) {
      // Get week breakdown
      const byWeek = await prisma.$queryRaw<Array<{ week: number; games_with_lines: bigint; total_lines: bigint }>>`
        SELECT 
          g.week,
          COUNT(DISTINCT ml."gameId") as games_with_lines,
          COUNT(*) as total_lines
        FROM "MarketLine" ml
        JOIN "Game" g ON ml."gameId" = g.id
        WHERE g.season = 2024
        GROUP BY g.week
        ORDER BY g.week
      `;
      
      console.log('\n📅 By Week:');
      byWeek.forEach(row => {
        console.log(`  Week ${row.week}: ${row.games_with_lines} games, ${row.total_lines} lines`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

check2024Data();

