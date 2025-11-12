import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const season = 2025;
  const failedWeeks = [7, 11];
  
  console.log(`\n🔍 Diagnosing Failed Weeks (Season ${season})\n`);
  console.log('='.repeat(70));
  
  // Get FBS team IDs
  const fbsTeams = await prisma.teamSeasonRating.findMany({
    where: { season, modelVersion: 'v2' },
    select: { teamId: true },
  });
  const fbsTeamIds = new Set(fbsTeams.map(t => t.teamId));
  
  for (const week of failedWeeks) {
    console.log(`\n📅 Week ${week}:`);
    console.log('-'.repeat(70));
    
    // Check games
    const games = await prisma.cfbdGame.findMany({
      where: { season, week },
      select: { 
        gameIdCfbd: true, 
        homeTeamIdInternal: true, 
        awayTeamIdInternal: true,
        date: true,
      },
    });
    
    console.log(`   Total games: ${games.length}`);
    
    // Filter to FBS games
    const fbsGames = games.filter(g => 
      fbsTeamIds.has(g.homeTeamIdInternal) && fbsTeamIds.has(g.awayTeamIdInternal)
    );
    console.log(`   FBS games: ${fbsGames.length}`);
    
    if (fbsGames.length === 0) {
      console.log(`   ⚠️  No FBS games found`);
      continue;
    }
    
    // Check game stats
    const fbsGameIds = fbsGames.map(g => g.gameIdCfbd);
    const stats = await prisma.cfbdEffTeamGame.findMany({
      where: { gameIdCfbd: { in: fbsGameIds } },
      select: { gameIdCfbd: true, teamIdInternal: true },
    });
    
    const expected = fbsGames.length * 2;
    const coverage = expected > 0 ? (stats.length / expected) * 100 : 0;
    
    console.log(`   Game stats: ${stats.length}/${expected} (${coverage.toFixed(1)}%)`);
    
    // Find games missing stats
    const gamesWithStats = new Set(stats.map(s => s.gameIdCfbd));
    const missingStats = fbsGames.filter(g => !gamesWithStats.has(g.gameIdCfbd));
    
    if (missingStats.length > 0) {
      console.log(`   ⚠️  ${missingStats.length} FBS games missing stats:`);
      for (const game of missingStats.slice(0, 5)) {
        console.log(`      - ${game.gameIdCfbd}: ${game.awayTeamIdInternal} @ ${game.homeTeamIdInternal}`);
      }
      if (missingStats.length > 5) {
        console.log(`      ... and ${missingStats.length - 5} more`);
      }
    }
    
    // Check for any obvious issues (e.g., future dates, null teams)
    const futureGames = games.filter(g => g.date > new Date());
    const nullTeamGames = games.filter(g => !g.homeTeamIdInternal || !g.awayTeamIdInternal);
    
    if (futureGames.length > 0) {
      console.log(`   ⚠️  ${futureGames.length} games with future dates (may not have stats yet)`);
    }
    if (nullTeamGames.length > 0) {
      console.log(`   ⚠️  ${nullTeamGames.length} games with null team IDs`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('\n💡 Next Steps:');
  console.log('   1. Check GitHub Actions logs for weeks 7 and 11');
  console.log('   2. Look for API errors, rate limits, or timeouts');
  console.log('   3. Re-run just those weeks: weeks=7,11');
  
  await prisma.$disconnect();
}

main().catch(console.error);

