import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const season = 2025;
  const weeks = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  
  console.log(`\n📊 FBS Game Coverage Check (Season ${season})\n`);
  console.log('='.repeat(70));
  
  // Get FBS team IDs from team_season_rating (teams with V2 ratings are FBS)
  const fbsTeams = await prisma.teamSeasonRating.findMany({
    where: { season, modelVersion: 'v2' },
    select: { teamId: true },
  });
  const fbsTeamIds = new Set(fbsTeams.map(t => t.teamId));
  console.log(`\nFBS teams with V2 ratings: ${fbsTeamIds.size}`);
  
  let totalGames = 0;
  let totalFbsGames = 0;
  let totalStats = 0;
  let totalExpectedStats = 0;
  
  for (const week of weeks) {
    const games = await prisma.cfbdGame.findMany({
      where: { season, week },
      select: { gameIdCfbd: true, homeTeamIdInternal: true, awayTeamIdInternal: true },
    });
    
    // Filter to FBS-only games (both teams FBS)
    const fbsGames = games.filter(g => 
      fbsTeamIds.has(g.homeTeamIdInternal) && fbsTeamIds.has(g.awayTeamIdInternal)
    );
    
    const gameIds = fbsGames.map(g => g.gameIdCfbd);
    const stats = gameIds.length > 0 ? await prisma.cfbdEffTeamGame.count({
      where: { gameIdCfbd: { in: gameIds } },
    }) : 0;
    
    const expected = fbsGames.length * 2;
    const coverage = expected > 0 ? (stats / expected) * 100 : 0;
    const status = coverage >= 90 ? '✅' : coverage >= 70 ? '⚠️' : '❌';
    
    console.log(`Week ${week}: ${fbsGames.length} FBS games (${games.length} total) • ${stats}/${expected} stats (${coverage.toFixed(1)}%) ${status}`);
    
    totalGames += games.length;
    totalFbsGames += fbsGames.length;
    totalStats += stats;
    totalExpectedStats += expected;
  }
  
  const overallCoverage = totalExpectedStats > 0 ? (totalStats / totalExpectedStats) * 100 : 0;
  console.log('\n' + '='.repeat(70));
  console.log(`\nOverall:`);
  console.log(`   Total games: ${totalGames}`);
  console.log(`   FBS-only games: ${totalFbsGames} (${((totalFbsGames / totalGames) * 100).toFixed(1)}%)`);
  console.log(`   Game stats: ${totalStats}/${totalExpectedStats} (${overallCoverage.toFixed(1)}%)`);
  console.log(`   ${overallCoverage >= 90 ? '✅' : overallCoverage >= 70 ? '⚠️' : '❌'} Target: ≥90% for FBS games`);
  
  await prisma.$disconnect();
}

main().catch(console.error);

