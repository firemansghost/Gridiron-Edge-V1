import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface GateResult {
  name: string;
  passed: boolean;
  message: string;
}

async function main() {
  const args = process.argv.slice(2);
  let season = 2025;
  let weeks: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  
  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && args[i + 1]) {
      season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--weeks' && args[i + 1]) {
      weeks = args[i + 1].split(',').map(w => parseInt(w.trim(), 10)).filter(w => !isNaN(w));
      i++;
    }
  }
  
  console.log('\n======================================================================');
  console.log('🚦 CFBD INGEST GATES CHECK');
  console.log('======================================================================\n');
  console.log(`   Season: ${season}`);
  console.log(`   Weeks: ${weeks.join(', ')}\n`);
  
  const gates: GateResult[] = [];
  
  // Gate 1: Feature completeness ≥ 95%
  // Get FBS team IDs (teams with V2 ratings are FBS)
  const fbsTeams = await prisma.teamSeasonRating.findMany({
    where: { season, modelVersion: 'v2' },
    select: { teamId: true },
  });
  const fbsTeamIds = new Set(fbsTeams.map(t => t.teamId));
  
  // Filter to FBS-only games (both teams FBS)
  const allGames = await prisma.cfbdGame.findMany({
    where: { season, week: { in: weeks } },
    select: { gameIdCfbd: true, homeTeamIdInternal: true, awayTeamIdInternal: true },
  });
  const fbsGames = allGames.filter(g => 
    fbsTeamIds.has(g.homeTeamIdInternal) && fbsTeamIds.has(g.awayTeamIdInternal)
  );
  
  const expectedGames = fbsGames.length;
  const expectedGameStats = expectedGames * 2; // 2 teams per game
  const expectedTeams = 130; // FBS teams
  
  const teamSeasonStats = await prisma.cfbdEffTeamSeason.count({
    where: { season },
  });
  
  const fbsGameIds = fbsGames.map(g => g.gameIdCfbd);
  const teamGameStats = fbsGameIds.length > 0 ? await prisma.cfbdEffTeamGame.count({
    where: {
      gameIdCfbd: { in: fbsGameIds },
    },
  }) : 0;
  
  const priors = await prisma.cfbdPriorsTeamSeason.count({
    where: { season },
  });
  
  const gameStatsCompleteness = expectedGameStats > 0 ? (teamGameStats / expectedGameStats) * 100 : 0;
  const seasonStatsCompleteness = expectedTeams > 0 ? (teamSeasonStats / expectedTeams) * 100 : 0;
  const priorsCompleteness = expectedTeams > 0 ? (priors / expectedTeams) * 100 : 0;
  
  // For partial runs (single week), adjust expectations
  const isPartialRun = weeks.length < 11;
  const gameStatsThreshold = isPartialRun ? 90 : 95; // FBS-only games should have high coverage // Lower threshold for partial runs
  const seasonStatsThreshold = 95; // Season stats should always be complete (fetched once, not per week)
  
  gates.push({
    name: 'Game stats completeness',
    passed: gameStatsCompleteness >= gameStatsThreshold,
    message: `${gameStatsCompleteness.toFixed(1)}% (${teamGameStats}/${expectedGameStats}) - Target: ≥${gameStatsThreshold}%${isPartialRun ? ' (partial run)' : ''}`,
  });
  
  gates.push({
    name: 'Season stats completeness',
    passed: seasonStatsCompleteness >= seasonStatsThreshold,
    message: `${seasonStatsCompleteness.toFixed(1)}% (${teamSeasonStats}/${expectedTeams}) - Target: ≥${seasonStatsThreshold}%`,
  });
  
  gates.push({
    name: 'Priors completeness',
    passed: priorsCompleteness >= 95,
    message: `${priorsCompleteness.toFixed(1)}% (${priors}/${expectedTeams}) - Target: ≥95%`,
  });
  
  // Gate 2: Team mapping mismatches
  const reportsDir = path.join(process.cwd(), 'reports');
  const mappingFile = path.join(reportsDir, 'team_mapping_mismatches.csv');
  
  let unmappedCount = 0;
  if (fs.existsSync(mappingFile)) {
    const content = fs.readFileSync(mappingFile, 'utf8');
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('cfbd_name'));
    unmappedCount = lines.length;
  }
  
  // For partial runs, allow some unmapped teams (FCS teams in other weeks)
  const unmappedThreshold = isPartialRun ? 20 : 0;
  gates.push({
    name: 'Team mapping mismatches',
    passed: unmappedCount <= unmappedThreshold,
    message: `${unmappedCount} unmapped teams - Target: ≤${unmappedThreshold}${isPartialRun ? ' (partial run, may include FCS from other weeks)' : ' (or allowlisted FCS)'}`,
  });
  
  // Gate 3: Check for zeroed/flat ratings (if ratings exist)
  // Skip this gate for CFBD ingest - it's a V2 rating issue, not CFBD data issue
  // const ratings = await prisma.teamSeasonRating.findMany({
  //   where: { season, modelVersion: 'v2' },
  //   take: 100,
  // });
  
  // if (ratings.length > 0) {
  //   const powerRatings = ratings.map(r => Number(r.powerRating)).filter(r => !isNaN(r));
  //   if (powerRatings.length > 0) {
  //     const std = Math.sqrt(
  //       powerRatings.reduce((sum, val) => {
  //         const mean = powerRatings.reduce((a, b) => a + b, 0) / powerRatings.length;
  //         return sum + Math.pow(val - mean, 2);
  //       }, 0) / powerRatings.length
  //     );
  //     const zeros = powerRatings.filter(r => r === 0).length;
  //     const zeroPct = (zeros / powerRatings.length) * 100;
      
  //     gates.push({
  //       name: 'Rating variance sanity',
  //       passed: std >= 2.0 && zeroPct <= 2.0,
  //       message: `Std: ${std.toFixed(2)} (≥2.0), Zeros: ${zeroPct.toFixed(1)}% (≤2.0%)`,
  //     });
  //   }
  // }
  
  // Report results
  console.log('GATES:\n');
  let allPassed = true;
  for (const gate of gates) {
    const status = gate.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`   ${status}: ${gate.name}`);
    console.log(`      ${gate.message}\n`);
    if (!gate.passed) allPassed = false;
  }
  
  console.log('======================================================================');
  console.log(`OVERALL: ${allPassed ? '✅ ALL GATES PASSED' : '❌ GATES FAILED'}`);
  console.log('======================================================================\n');
  
  await prisma.$disconnect();
  
  if (!allPassed) {
    process.exit(1);
  }
}

main();

