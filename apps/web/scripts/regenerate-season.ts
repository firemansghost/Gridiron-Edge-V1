/**
 * Regenerate Season Bets
 * 
 * Re-syncs official picks to bets for a range of weeks to update
 * betting records with new model calculations.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/regenerate-season.ts 2025 11 13
 */

import { syncWeek } from './sync-official-picks-to-bets';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error('Usage: npx tsx apps/web/scripts/regenerate-season.ts <season> <startWeek> <endWeek>');
    console.error('Example: npx tsx apps/web/scripts/regenerate-season.ts 2025 11 13');
    process.exit(1);
  }

  const season = parseInt(args[0], 10);
  const startWeek = parseInt(args[1], 10);
  const endWeek = parseInt(args[2], 10);

  if (isNaN(season) || isNaN(startWeek) || isNaN(endWeek)) {
    console.error('Error: season, startWeek, and endWeek must be numbers');
    process.exit(1);
  }

  if (startWeek > endWeek) {
    console.error('Error: startWeek must be <= endWeek');
    process.exit(1);
  }

  console.log(`\n🔄 Regenerating bets for Season ${season}, Weeks ${startWeek}-${endWeek}...`);
  console.log('='.repeat(70));

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  // Process each week sequentially
  for (let week = startWeek; week <= endWeek; week++) {
    console.log(`\n📅 Processing Week ${week}...`);
    try {
      const result = await syncWeek(season, week);
      totalCreated += result.created;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      console.log(`✅ Week ${week} complete`);
    } catch (error) {
      console.error(`❌ Error processing Week ${week}:`, error);
      if (error instanceof Error) {
        console.error(`   Message: ${error.message}`);
      }
      // Continue with next week even if one fails
    }
  }

  console.log(`\n✅ Regeneration complete for Weeks ${startWeek}-${endWeek}`);
  console.log(`   Total created: ${totalCreated}`);
  console.log(`   Total updated: ${totalUpdated}`);
  console.log(`   Total skipped: ${totalSkipped}`);
}

main().catch(console.error);

