import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('\n======================================================================');
  console.log('📊 PHASE 2 & 3 SUMMARY REPORT');
  console.log('======================================================================\n');
  
  // Phase 2: Odds Coverage
  console.log('PHASE 2: ODDS BACKFILL (Weeks 1-11)\n');
  
  const games = await prisma.game.findMany({
    where: {
      season: 2025,
      week: { in: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
      status: 'final',
    },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
  });
  
  let preKickCount = 0;
  const bookCounts: number[] = [];
  
  for (const game of games) {
    if (!game.date) continue;
    
    const windowStart = new Date(new Date(game.date).getTime() - 60 * 60 * 1000);
    const windowEnd = new Date(new Date(game.date).getTime() + 5 * 60 * 1000);
    
    const lines = await prisma.marketLine.findMany({
      where: {
        gameId: game.id,
        lineType: 'spread',
        source: 'oddsapi',
        timestamp: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
    });
    
    if (lines.length > 0) {
      preKickCount++;
      const uniqueBooks = new Set(lines.map(l => l.bookName)).size;
      bookCounts.push(uniqueBooks);
    }
  }
  
  const preKickPct = games.length > 0 ? (preKickCount / games.length) * 100 : 0;
  const medianBooks = bookCounts.length > 0
    ? bookCounts.sort((a, b) => a - b)[Math.floor(bookCounts.length / 2)]
    : 0;
  
  console.log(`   Total games: ${games.length}`);
  console.log(`   Games with pre-kick lines: ${preKickCount}`);
  console.log(`   Pre-kick coverage: ${preKickPct.toFixed(1)}%`);
  console.log(`   Median unique books: ${medianBooks}`);
  console.log(`   Gate: Pre-kick ≥80%: ${preKickPct >= 80 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Gate: Median books ≥5: ${medianBooks >= 5 ? '✅ PASS' : '❌ FAIL'}`);
  console.log();
  
  // Phase 3: CFBD Features
  console.log('PHASE 3: CFBD FEATURE INGEST (Weeks 1-11)\n');
  
  const cfbdGames = await prisma.cfbdGame.count({
    where: { season: 2025, week: { in: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] } },
  });
  
  const teamSeasonStats = await prisma.cfbdEffTeamSeason.count({
    where: { season: 2025 },
  });
  
  const teamGameStats = await prisma.cfbdEffTeamGame.count({
    where: {
      gameIdCfbd: {
        in: (await prisma.cfbdGame.findMany({
          where: { season: 2025, week: { in: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] } },
          select: { gameIdCfbd: true },
        })).map(g => g.gameIdCfbd),
      },
    },
  });
  
  const priors = await prisma.cfbdPriorsTeamSeason.count({
    where: { season: 2025 },
  });
  
  const mappings = await prisma.cfbdTeamMap.count();
  
  const expectedGames = cfbdGames;
  const expectedGameStats = expectedGames * 2; // 2 teams per game
  const expectedTeams = 130; // FBS teams
  
  const gameStatsCompleteness = expectedGameStats > 0 ? (teamGameStats / expectedGameStats) * 100 : 0;
  const seasonStatsCompleteness = expectedTeams > 0 ? (teamSeasonStats / expectedTeams) * 100 : 0;
  const priorsCompleteness = expectedTeams > 0 ? (priors / expectedTeams) * 100 : 0;
  
  console.log(`   CFBD Games: ${cfbdGames}`);
  console.log(`   Team-Season Stats: ${teamSeasonStats} (${seasonStatsCompleteness.toFixed(1)}% of ${expectedTeams} teams)`);
  console.log(`   Team-Game Stats: ${teamGameStats} (${gameStatsCompleteness.toFixed(1)}% of ${expectedGameStats} expected)`);
  console.log(`   Priors: ${priors} (${priorsCompleteness.toFixed(1)}% of ${expectedTeams} teams)`);
  console.log(`   Team Mappings: ${mappings}`);
  console.log(`   Gate: Game stats ≥95%: ${gameStatsCompleteness >= 95 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Gate: Season stats ≥95%: ${seasonStatsCompleteness >= 95 ? '✅ PASS' : '❌ FAIL'}`);
  console.log();
  
  // Check reports
  const reportsDir = path.join(process.cwd(), 'reports');
  const reports = {
    coverage: fs.existsSync(path.join(reportsDir, 'consensus_coverage_by_week.csv')),
    mapping: fs.existsSync(path.join(reportsDir, 'team_mapping_mismatches.csv')),
    completeness: fs.existsSync(path.join(reportsDir, 'feature_completeness.csv')),
    stats: fs.existsSync(path.join(reportsDir, 'feature_store_stats.csv')),
  };
  
  console.log('DELIVERABLES:\n');
  console.log(`   consensus_coverage_by_week.csv: ${reports.coverage ? '✅' : '❌'}`);
  console.log(`   team_mapping_mismatches.csv: ${reports.mapping ? '✅' : '❌'}`);
  console.log(`   feature_completeness.csv: ${reports.completeness ? '✅' : '❌'}`);
  console.log(`   feature_store_stats.csv: ${reports.stats ? '✅' : '❌'}`);
  console.log();
  
  // Final verdict
  const phase2Pass = preKickPct >= 80 && medianBooks >= 5;
  const phase3Pass = gameStatsCompleteness >= 95 && seasonStatsCompleteness >= 95;
  const allReportsExist = Object.values(reports).every(r => r);
  
  console.log('======================================================================');
  console.log('FINAL VERDICT');
  console.log('======================================================================\n');
  console.log(`Coverage: ${preKickPct.toFixed(1)}% pre-kick, median books ${medianBooks}`);
  console.log(`Features: ${gameStatsCompleteness.toFixed(1)}% complete (game), ${seasonStatsCompleteness.toFixed(1)}% (season)`);
  console.log(`Mismatches: ${mappings} mappings (check CSV for unresolved)`);
  console.log(`Ready for Phase 4: ${phase2Pass && phase3Pass && allReportsExist ? '✅ YES' : '❌ NO'}`);
  console.log();
  
  await prisma.$disconnect();
}

main();

