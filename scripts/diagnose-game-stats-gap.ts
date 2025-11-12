import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const season = 2025;
  const weeks = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  
  console.log(`\n🔍 Diagnosing Game Stats Gap (Season ${season})\n`);
  console.log('='.repeat(70));
  
  for (const week of weeks) {
    console.log(`\nWeek ${week}:`);
    
    // Check games
    const games = await prisma.cfbdGame.findMany({
      where: { season, week },
      select: { gameIdCfbd: true, homeTeamIdInternal: true, awayTeamIdInternal: true },
    });
    
    console.log(`   Games in cfbd_games: ${games.length}`);
    
    if (games.length === 0) {
      console.log(`   ⚠️  No games found - schedule not ingested`);
      continue;
    }
    
    // Check game stats
    const gameIds = games.map(g => g.gameIdCfbd);
    const stats = await prisma.cfbdEffTeamGame.findMany({
      where: { gameIdCfbd: { in: gameIds } },
      select: { gameIdCfbd: true, teamIdInternal: true },
    });
    
    const expected = games.length * 2; // 2 teams per game
    const coverage = expected > 0 ? (stats.length / expected) * 100 : 0;
    
    console.log(`   Game stats in cfbd_eff_team_game: ${stats.length}/${expected} (${coverage.toFixed(1)}%)`);
    
    // Sample a few games to see if they have stats
    const sample = games.slice(0, 3);
    for (const game of sample) {
      const gameStats = stats.filter(s => s.gameIdCfbd === game.gameIdCfbd);
      console.log(`      Game ${game.gameIdCfbd}: ${gameStats.length}/2 teams (${game.awayTeamIdInternal} @ ${game.homeTeamIdInternal})`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('\n💡 Diagnosis:');
  console.log('   If games exist but stats are 0%, the game-level stats ingestion failed.');
  console.log('   Check the workflow logs for errors in the "Run CFBD ingest" step.');
  
  await prisma.$disconnect();
}

main().catch(console.error);

