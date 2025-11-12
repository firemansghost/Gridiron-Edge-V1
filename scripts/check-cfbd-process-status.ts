import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('\n🔍 CFBD PROCESS STATUS CHECK\n');
  
  // Check database state
  const games = await prisma.cfbdGame.count({ where: { season: 2025 } });
  const seasonStats = await prisma.cfbdEffTeamSeason.count({ where: { season: 2025 } });
  const gameStats = await prisma.cfbdEffTeamGame.count();
  const priors = await prisma.cfbdPriorsTeamSeason.count({ where: { season: 2025 } });
  const mappings = await prisma.cfbdTeamMap.count();
  
  console.log('Database State:');
  console.log(`  Games: ${games}`);
  console.log(`  Team-Season Stats: ${seasonStats}`);
  console.log(`  Team-Game Stats: ${gameStats}`);
  console.log(`  Priors: ${priors}`);
  console.log(`  Mappings: ${mappings}`);
  console.log();
  
  // Check if reports exist
  const reportsDir = path.join(process.cwd(), 'reports');
  const reports = {
    mapping: fs.existsSync(path.join(reportsDir, 'team_mapping_mismatches.csv')),
    completeness: fs.existsSync(path.join(reportsDir, 'feature_completeness.csv')),
    stats: fs.existsSync(path.join(reportsDir, 'feature_store_stats.csv')),
  };
  
  console.log('Reports Generated:');
  console.log(`  team_mapping_mismatches.csv: ${reports.mapping ? '✅' : '❌'}`);
  console.log(`  feature_completeness.csv: ${reports.completeness ? '✅' : '❌'}`);
  console.log(`  feature_store_stats.csv: ${reports.stats ? '✅' : '❌'}`);
  console.log();
  
  // Diagnosis
  if (games > 0 && seasonStats === 0 && gameStats === 0) {
    console.log('⚠️  DIAGNOSIS: Process likely stuck at Step 3 (team-season stats)');
    console.log('   - Games are stored (Step 2 complete)');
    console.log('   - No stats ingested yet (Step 3 not complete)');
    console.log('   - Possible causes:');
    console.log('     1. API call taking very long (rate limiting)');
    console.log('     2. Process crashed silently');
    console.log('     3. API endpoint issue');
    console.log();
    console.log('   💡 Recommendation: Check terminal for process output or restart');
  } else if (seasonStats > 0 && gameStats === 0) {
    console.log('✅ Step 3 complete, Step 4 (team-game stats) in progress or pending');
  } else if (gameStats > 0) {
    console.log('✅ Steps 3-4 complete, process likely finished or on Step 5');
  }
  
  await prisma.$disconnect();
}

main();

