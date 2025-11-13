import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('\n======================================================================');
  console.log('📊 CFBD DATA STATUS CHECK');
  console.log('======================================================================\n');
  
  const season = 2025;
  const weeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  
  // Check each table
  const effGame = await prisma.cfbdEffTeamGame.count();
  const effSeason = await prisma.cfbdEffTeamSeason.count();
  const ppaGame = await prisma.cfbdPpaTeamGame.count();
  const ppaSeason = await prisma.cfbdPpaTeamSeason.count();
  const drives = await prisma.cfbdDrivesTeamGame.count();
  const priors = await prisma.cfbdPriorsTeamSeason.count();
  const weather = await prisma.cfbdWeatherGame.count();
  const games = await prisma.cfbdGame.count({
    where: { season, week: { in: weeks } },
  });
  
  console.log('CFBD Tables Status:');
  console.log(`  cfbd_games: ${games} games (Weeks 1-11, 2025)`);
  console.log(`  cfbd_eff_team_game: ${effGame} rows`);
  console.log(`  cfbd_eff_team_season: ${effSeason} rows`);
  console.log(`  cfbd_ppa_team_game: ${ppaGame} rows`);
  console.log(`  cfbd_ppa_team_season: ${ppaSeason} rows`);
  console.log(`  cfbd_drives_team_game: ${drives} rows`);
  console.log(`  cfbd_priors_team_season: ${priors} rows`);
  console.log(`  cfbd_weather_game: ${weather} rows`);
  
  // Check coverage for FBS games
  const fbsGames = await prisma.cfbdGame.count({
    where: {
      season,
      week: { in: weeks },
    },
  });
  
  const gamesWithEff = await prisma.cfbdEffTeamGame.findMany({
    where: {
      gameIdCfbd: {
        in: (await prisma.cfbdGame.findMany({
          where: { season, week: { in: weeks } },
          select: { gameIdCfbd: true },
        })).map(g => g.gameIdCfbd),
      },
    },
    distinct: ['gameIdCfbd'],
  });
  
  const effCoverage = fbsGames > 0 ? (gamesWithEff.length / fbsGames) * 100 : 0;
  
  console.log(`\nCoverage (FBS games):`);
  console.log(`  Efficiency stats: ${effCoverage.toFixed(1)}% (${gamesWithEff.length}/${fbsGames} games)`);
  
  await prisma.$disconnect();
}

main().catch(console.error);


