/**
 * Prisma Smoke Test
 * 
 * Quick connectivity and table verification before running feature engineering
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('\n======================================================================');
  console.log('🔥 PRISMA SMOKE TEST');
  console.log('======================================================================\n');
  
  try {
    // 1. Connectivity test
    console.log('1. Testing database connectivity...');
    await prisma.$queryRaw`SELECT 1`;
    console.log('   ✅ Database connection successful\n');
    
    // 2. Verify required tables exist
    console.log('2. Verifying required tables...');
    const requiredTables = [
      'cfbd_eff_team_game',
      'cfbd_eff_team_season',
      'cfbd_priors_team_season',
      'team_game_adj',
    ];
    
    for (const tableName of requiredTables) {
      const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
        tableName
      );
      
      if (result[0].count === BigInt(0)) {
        console.error(`   ❌ Table ${tableName} does not exist`);
        process.exit(1);
      }
      console.log(`   ✅ Table ${tableName} exists`);
    }
    console.log();
    
    // 3. Check team_game_adj is empty (fresh table)
    console.log('3. Checking team_game_adj is fresh...');
    const rowCount = await prisma.teamGameAdj.count();
    if (rowCount > 0) {
      console.log(`   ⚠️  Warning: team_game_adj has ${rowCount} rows (expected 0 for fresh table)`);
    } else {
      console.log('   ✅ team_game_adj is empty (fresh table)\n');
    }
    
    // 4. Verify unique index exists
    console.log('4. Verifying unique index on team_game_adj...');
    const indexResult = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'team_game_adj' AND indexname LIKE '%game_id%team_id%feature_version%'`
    );
    
    if (indexResult.length === 0) {
      // Check for primary key constraint instead
      const pkResult = await prisma.$queryRawUnsafe<Array<{ constraint_name: string }>>(
        `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'team_game_adj' AND constraint_type = 'PRIMARY KEY'`
      );
      
      if (pkResult.length === 0) {
        console.error('   ❌ No unique index or primary key found on (game_id, team_id, feature_version)');
        process.exit(1);
      } else {
        console.log(`   ✅ Primary key constraint exists: ${pkResult[0].constraint_name}\n`);
      }
    } else {
      console.log(`   ✅ Unique index exists: ${indexResult[0].indexname}\n`);
    }
    
    // 5. Check data availability
    console.log('5. Checking data availability...');
    const effGameCount = await prisma.cfbdEffTeamGame.count();
    const effSeasonCount = await prisma.cfbdEffTeamSeason.count();
    const priorsCount = await prisma.cfbdPriorsTeamSeason.count();
    
    console.log(`   cfbd_eff_team_game: ${effGameCount} rows`);
    console.log(`   cfbd_eff_team_season: ${effSeasonCount} rows`);
    console.log(`   cfbd_priors_team_season: ${priorsCount} rows`);
    
    if (effGameCount === 0) {
      console.error('   ❌ No efficiency game data found');
      process.exit(1);
    }
    if (effSeasonCount === 0) {
      console.error('   ❌ No efficiency season data found');
      process.exit(1);
    }
    if (priorsCount === 0) {
      console.error('   ❌ No priors data found');
      process.exit(1);
    }
    
    console.log('   ✅ Data available\n');
    
    console.log('======================================================================');
    console.log('✅ ALL CHECKS PASSED - Ready for feature engineering');
    console.log('======================================================================\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Smoke test failed:');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);

