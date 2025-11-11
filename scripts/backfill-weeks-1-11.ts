#!/usr/bin/env node

/**
 * Backfill Weeks 1-11 (2025) with Normalized Bookmaker Names
 * 
 * This script re-runs the odds ingestion for weeks 1-11 to populate
 * normalized bookmaker names and ensure proper pre-kick window coverage.
 * 
 * Usage: npx tsx scripts/backfill-weeks-1-11.ts
 * 
 * Note: This uses the oddsapi adapter. Make sure ODDS_API_KEY is set.
 */

import { execSync } from 'child_process';
import * as path from 'path';

const SEASON = 2025;
const WEEKS = '1,2,3,4,5,6,7,8,9,10,11';

async function main() {
  console.log('\n======================================================================');
  console.log('🔄 BACKFILL WEEKS 1-11 (2025)');
  console.log('======================================================================\n');
  console.log(`   Season: ${SEASON}`);
  console.log(`   Weeks: ${WEEKS}`);
  console.log(`   Adapter: oddsapi`);
  console.log('');

  // Check if ODDS_API_KEY is set
  if (!process.env.ODDS_API_KEY) {
    console.error('   ❌ ERROR: ODDS_API_KEY environment variable not set');
    console.error('   Please set ODDS_API_KEY before running this script');
    process.exit(1);
  }

  console.log('   ✅ ODDS_API_KEY found');
  console.log('');

  // Build the jobs first
  console.log('📦 Building jobs...');
  try {
    execSync('npm run build:jobs', { stdio: 'inherit', cwd: process.cwd() });
    console.log('   ✅ Build complete\n');
  } catch (error) {
    console.error('   ❌ Build failed');
    process.exit(1);
  }

  // Run ingest for each week (to avoid rate limits)
  const weekList = WEEKS.split(',').map(w => w.trim());
  
  console.log('📥 Starting backfill...\n');

  for (let i = 0; i < weekList.length; i++) {
    const week = weekList[i];
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📅 Week ${week} (${i + 1}/${weekList.length})`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    try {
      const command = `node apps/jobs/dist/ingest.js oddsapi --season ${SEASON} --weeks ${week}`;
      execSync(command, { stdio: 'inherit', cwd: process.cwd() });
      console.log(`\n   ✅ Week ${week} complete\n`);
    } catch (error) {
      console.error(`\n   ⚠️  Week ${week} failed (continuing...)\n`);
      // Continue with other weeks even if one fails
    }

    // Rate limiting: wait 2 seconds between weeks
    if (i < weekList.length - 1) {
      console.log('   ⏳ Waiting 2 seconds for rate limiting...\n');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ BACKFILL COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('📊 Next steps:');
  console.log('   1. Run verification: npx tsx scripts/verify-backfill-coverage.ts 2025 1-11');
  console.log('   2. Run audit: npx tsx scripts/audit-calibration-data.ts 2025 1-11');
  console.log('');
}

main().catch(console.error);

