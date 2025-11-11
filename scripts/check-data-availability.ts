import { prisma } from '../apps/web/lib/prisma';

async function checkDataAvailability() {
  console.log('\n📊 DATA AVAILABILITY REPORT\n');
  console.log('='.repeat(60));
  
  // Check both 2024 and 2025
  for (const season of [2024, 2025]) {
    console.log(`\n📅 SEASON ${season}\n`);
    
    // Get count of final games
    const finalGamesCount = await prisma.game.count({
      where: {
        season,
        status: 'final'
      }
    });
    
    // Get count of games with v1 ratings
    const ratedGamesCount = await prisma.teamSeasonRating.count({
      where: {
        season,
        modelVersion: 'v1'
      }
    });
    
    // Get count of total spread lines
    const spreadLinesCount = await prisma.marketLine.count({
      where: {
        game: { season },
        lineType: 'spread'
      }
    });
    
    // Get games with spread lines
    const gamesWithLines = await prisma.marketLine.groupBy({
      by: ['gameId'],
      where: {
        game: { season },
        lineType: 'spread'
      }
    });
    
    console.log(`  Final games: ${finalGamesCount}`);
    console.log(`  V1 ratings: ${ratedGamesCount}`);
    console.log(`  Total spread lines: ${spreadLinesCount}`);
    console.log(`  Games with spread lines: ${gamesWithLines.length}/${finalGamesCount} (${finalGamesCount > 0 ? ((gamesWithLines.length / finalGamesCount) * 100).toFixed(1) : '0'}%)`);
    
    // Get breakdown by week
    console.log(`\n  📅 By Week:\n`);
    
    const maxWeek = season === 2024 ? 15 : 12; // 2024 full season, 2025 current week
    
    for (let week = 1; week <= maxWeek; week++) {
      const weekGames = await prisma.game.count({
        where: { season, week, status: 'final' }
      });
      
      if (weekGames === 0) continue;
      
      const weekLines = await prisma.marketLine.groupBy({
        by: ['gameId'],
        where: {
          game: { season, week },
          lineType: 'spread'
        }
      });
      
      const pct = weekGames > 0 ? ((weekLines.length / weekGames) * 100).toFixed(0) : '0';
      const status = weekLines.length > 0 ? '✅' : '❌';
      console.log(`     Week ${week.toString().padStart(2)}: ${weekGames.toString().padStart(3)} games, ${weekLines.length.toString().padStart(3)} with lines (${pct.padStart(2)}%) ${status}`);
    }
    
    console.log('\n' + '-'.repeat(60));
  }
  
  console.log('\n📊 COMBINED DATASET\n');
  
  const totalGames2024 = await prisma.marketLine.groupBy({
    by: ['gameId'],
    where: { game: { season: 2024 }, lineType: 'spread' }
  });
  
  const totalGames2025 = await prisma.marketLine.groupBy({
    by: ['gameId'],
    where: { game: { season: 2025 }, lineType: 'spread' }
  });
  
  const total = totalGames2024.length + totalGames2025.length;
  
  console.log(`  2024 games: ${totalGames2024.length}`);
  console.log(`  2025 games: ${totalGames2025.length}`);
  console.log(`  TOTAL: ${total} games with market lines\n`);
  
  // Calibration readiness
  console.log('🎯 CALIBRATION READINESS\n');
  
  if (total < 400) {
    console.log('  ❌ Insufficient data (<400 games)');
    console.log('  → Need: ' + (400 - total) + ' more games');
  } else if (total < 600) {
    console.log('  ⚠️  Minimum viable (400-600 games)');
    console.log('  → Recommended: ' + (600 - total) + ' more games for production');
  } else if (total < 1000) {
    console.log('  ✅ Production-ready (600-1000 games)');
    console.log('  → Optional: ' + (1000 - total) + ' more games for academic quality');
  } else {
    console.log('  🏆 Academic-quality (1000+ games)');
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  await prisma.$disconnect();
}

checkDataAvailability().catch(console.error);
