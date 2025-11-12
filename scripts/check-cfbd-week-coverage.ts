import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const season = 2025;
  const allWeeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  
  console.log(`\n📊 CFBD Week Coverage Check (Season ${season})\n`);
  console.log('='.repeat(70));
  
  // Check games per week
  console.log('\nGames per week:');
  for (const week of allWeeks) {
    const gameCount = await prisma.cfbdGame.count({
      where: { season, week },
    });
    console.log(`   Week ${week}: ${gameCount} games`);
  }
  
  // Check game-level stats per week
  console.log('\nGame-level stats (cfbd_eff_team_game) per week:');
  for (const week of allWeeks) {
    const games = await prisma.cfbdGame.findMany({
      where: { season, week },
      select: { gameIdCfbd: true },
    });
    
    const gameIds = games.map(g => g.gameIdCfbd);
    const statsCount = gameIds.length > 0 ? await prisma.cfbdEffTeamGame.count({
      where: { gameIdCfbd: { in: gameIds } },
    }) : 0;
    
    const expected = games.length * 2; // 2 teams per game
    const coverage = expected > 0 ? (statsCount / expected) * 100 : 0;
    const status = coverage >= 70 ? '✅' : coverage > 0 ? '⚠️' : '❌';
    
    console.log(`   Week ${week}: ${statsCount}/${expected} (${coverage.toFixed(1)}%) ${status}`);
  }
  
  // Check season-level stats (should be 136 for all weeks)
  const seasonStatsCount = await prisma.cfbdEffTeamSeason.count({
    where: { season },
  });
  console.log(`\nSeason-level stats (cfbd_eff_team_season): ${seasonStatsCount} teams`);
  console.log(`   ${seasonStatsCount >= 130 ? '✅' : '❌'} Expected: ~136 FBS teams`);
  
  // Check priors
  const priorsCount = await prisma.cfbdPriorsTeamSeason.count({
    where: { season },
  });
  console.log(`\nPriors (cfbd_priors_team_season): ${priorsCount} teams`);
  console.log(`   ${priorsCount >= 130 ? '✅' : '❌'} Expected: ~136 FBS teams`);
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('\n📋 Summary:');
  console.log(`   Season stats: ${seasonStatsCount >= 130 ? '✅ Complete' : '❌ Missing'}`);
  console.log(`   Priors: ${priorsCount >= 130 ? '✅ Complete' : '❌ Missing'}`);
  console.log(`   Game stats: Check per-week coverage above`);
  
  await prisma.$disconnect();
}

main().catch(console.error);

