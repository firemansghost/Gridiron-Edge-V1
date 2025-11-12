import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const season = 2025;
  const weeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  
  console.log(`\n📊 Phase 3 Completion Check (Season ${season})\n`);
  console.log('='.repeat(70));
  
  // Get FBS team IDs
  const fbsTeams = await prisma.teamSeasonRating.findMany({
    where: { season, modelVersion: 'v2' },
    select: { teamId: true },
  });
  const fbsTeamIds = new Set(fbsTeams.map(t => t.teamId));
  console.log(`FBS teams: ${fbsTeamIds.size}\n`);
  
  // Check season-level stats
  const seasonStats = await prisma.cfbdEffTeamSeason.count({ where: { season } });
  const priors = await prisma.cfbdPriorsTeamSeason.count({ where: { season } });
  
  console.log(`✅ Season-level stats:`);
  console.log(`   cfbd_eff_team_season: ${seasonStats}/${fbsTeamIds.size} (${((seasonStats / fbsTeamIds.size) * 100).toFixed(1)}%)`);
  console.log(`   cfbd_priors_team_season: ${priors}/${fbsTeamIds.size} (${((priors / fbsTeamIds.size) * 100).toFixed(1)}%)`);
  
  // Check game-level stats by week
  console.log(`\n✅ Game-level stats by week:`);
  let totalFbsGames = 0;
  let totalGameStats = 0;
  
  for (const week of weeks) {
    const games = await prisma.cfbdGame.findMany({
      where: { season, week },
      select: { gameIdCfbd: true, homeTeamIdInternal: true, awayTeamIdInternal: true },
    });
    
    const fbsGames = games.filter(g => 
      fbsTeamIds.has(g.homeTeamIdInternal) && fbsTeamIds.has(g.awayTeamIdInternal)
    );
    
    const fbsGameIds = fbsGames.map(g => g.gameIdCfbd);
    const stats = fbsGameIds.length > 0 ? await prisma.cfbdEffTeamGame.count({
      where: { gameIdCfbd: { in: fbsGameIds } },
    }) : 0;
    
    const expected = fbsGames.length * 2;
    const coverage = expected > 0 ? (stats / expected) * 100 : 0;
    const status = coverage >= 95 ? '✅' : coverage >= 90 ? '⚠️' : '❌';
    
    console.log(`   Week ${week}: ${stats}/${expected} (${coverage.toFixed(1)}%) ${status} [${fbsGames.length} FBS games]`);
    
    totalFbsGames += fbsGames.length;
    totalGameStats += stats;
  }
  
  const overallCoverage = totalFbsGames > 0 ? (totalGameStats / (totalFbsGames * 2)) * 100 : 0;
  console.log(`\n   Overall: ${totalGameStats}/${totalFbsGames * 2} (${overallCoverage.toFixed(1)}%)`);
  
  // Check for missing endpoints (drives, weather, PPA)
  console.log(`\n⚠️  Additional endpoints (not yet ingested):`);
  const drivesCount = await prisma.cfbdDrivesTeamGame.count({
    where: {
      gameIdCfbd: {
        in: (await prisma.cfbdGame.findMany({
          where: { season, week: { in: weeks } },
          select: { gameIdCfbd: true },
        })).map(g => g.gameIdCfbd),
      },
    },
  });
  console.log(`   cfbd_drives_team_game: ${drivesCount} rows`);
  
  const weatherCount = await prisma.cfbdWeatherGame.count({
    where: {
      gameIdCfbd: {
        in: (await prisma.cfbdGame.findMany({
          where: { season, week: { in: weeks } },
          select: { gameIdCfbd: true },
        })).map(g => g.gameIdCfbd),
      },
    },
  });
  console.log(`   cfbd_weather_game: ${weatherCount} rows`);
  
  // Check for PPA tables (if they exist)
  const ppaGameCount = await prisma.cfbdPpaTeamGame.count({
    where: {
      gameIdCfbd: {
        in: (await prisma.cfbdGame.findMany({
          where: { season, week: { in: weeks } },
          select: { gameIdCfbd: true },
        })).map(g => g.gameIdCfbd),
      },
    },
  }).catch(() => 0);
  console.log(`   cfbd_ppa_team_game: ${ppaGameCount} rows`);
  
  console.log('\n' + '='.repeat(70));
  console.log(`\n📋 Phase 3 Status:`);
  console.log(`   ✅ Season stats: ${seasonStats >= 130 ? 'COMPLETE' : 'INCOMPLETE'}`);
  console.log(`   ✅ Priors: ${priors >= 130 ? 'COMPLETE' : 'INCOMPLETE'}`);
  console.log(`   ✅ Game stats: ${overallCoverage >= 95 ? 'COMPLETE' : 'INCOMPLETE'} (${overallCoverage.toFixed(1)}%)`);
  console.log(`   ⚠️  Drives: ${drivesCount > 0 ? 'PARTIAL' : 'NOT STARTED'}`);
  console.log(`   ⚠️  Weather: ${weatherCount > 0 ? 'PARTIAL' : 'NOT STARTED'}`);
  console.log(`   ⚠️  PPA: ${ppaGameCount > 0 ? 'PARTIAL' : 'NOT STARTED'}`);
  
  await prisma.$disconnect();
}

main().catch(console.error);

