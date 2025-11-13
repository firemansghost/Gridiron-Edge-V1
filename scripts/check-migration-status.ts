/**
 * Quick check to verify if team_game_adj migration was applied
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('\n======================================================================');
  console.log('🔍 CHECKING MIGRATION STATUS');
  console.log('======================================================================\n');
  
  try {
    // Check if table exists
    console.log('1. Checking if team_game_adj table exists...');
    const tableCheck = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'team_game_adj'
      ) as exists`
    );
    
    if (!tableCheck[0].exists) {
      console.log('   ❌ Table team_game_adj does NOT exist');
      console.log('   → Migration needs to be applied\n');
      process.exit(1);
    }
    console.log('   ✅ Table team_game_adj exists\n');
    
    // Check row count
    console.log('2. Checking row count...');
    const rowCount = await prisma.teamGameAdj.count();
    console.log(`   Row count: ${rowCount} (expected 0 for fresh table)\n`);
    
    // Check primary key constraint
    console.log('3. Checking primary key constraint...');
    const pkCheck = await prisma.$queryRawUnsafe<Array<{ constraint_name: string }>>(
      `SELECT constraint_name 
       FROM information_schema.table_constraints 
       WHERE table_name = 'team_game_adj' 
       AND constraint_type = 'PRIMARY KEY'`
    );
    
    if (pkCheck.length === 0) {
      console.log('   ❌ Primary key constraint not found');
      process.exit(1);
    }
    console.log(`   ✅ Primary key: ${pkCheck[0].constraint_name}\n`);
    
    // Check indexes
    console.log('4. Checking indexes...');
    const indexes = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes 
       WHERE tablename = 'team_game_adj' 
       ORDER BY indexname`
    );
    console.log(`   Found ${indexes.length} indexes:`);
    indexes.forEach(idx => console.log(`     - ${idx.indexname}`));
    console.log();
    
    // Check foreign keys
    console.log('5. Checking foreign key constraints...');
    const fks = await prisma.$queryRawUnsafe<Array<{ constraint_name: string; table_name: string }>>(
      `SELECT constraint_name, table_name
       FROM information_schema.table_constraints 
       WHERE constraint_name LIKE '%team_game_adj%'
       AND constraint_type = 'FOREIGN KEY'`
    );
    console.log(`   Found ${fks.length} foreign key constraints:`);
    fks.forEach(fk => console.log(`     - ${fk.constraint_name}`));
    console.log();
    
    // Check columns
    console.log('6. Checking key columns...');
    const columns = await prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = 'team_game_adj' 
       AND column_name IN ('game_id', 'team_id', 'feature_version', 'off_adj_epa', 'ewma3_off_adj_epa')
       ORDER BY column_name`
    );
    console.log(`   Key columns found:`);
    columns.forEach(col => console.log(`     - ${col.column_name} (${col.data_type})`));
    console.log();
    
    console.log('======================================================================');
    console.log('✅ MIGRATION STATUS: READY');
    console.log('======================================================================\n');
    
    process.exit(0);
  } catch (error: any) {
    if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
      console.error('\n❌ Table does not exist - migration needs to be applied');
      console.error('   Run the Prisma Migrate workflow or apply migration manually\n');
      process.exit(1);
    }
    console.error('\n❌ Error checking migration status:');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);


