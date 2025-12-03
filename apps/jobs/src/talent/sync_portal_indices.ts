/**
 * Sync Portal Indices
 * 
 * Computes and stores portal indices (Continuity Score, etc.) in team_season_stats.raw_json.portal_meta.
 * 
 * Usage:
 *   npx tsx apps/jobs/src/talent/sync_portal_indices.ts --season 2025
 */

import { PrismaClient } from '@prisma/client';
import { computeContinuityScore } from './portal_indices';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  let season: number | null = null;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && i + 1 < args.length) {
      season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  if (!season || isNaN(season)) {
    console.error('Usage: npx tsx apps/jobs/src/talent/sync_portal_indices.ts --season <YEAR> [--dry-run]');
    console.error('Example: npx tsx apps/jobs/src/talent/sync_portal_indices.ts --season 2025');
    process.exit(1);
  }

  console.log(`\n🔄 Syncing Portal Indices for ${season}`);
  if (dryRun) {
    console.log('   Mode: DRY RUN (no changes will be saved)\n');
  }

  // Load all TeamSeasonStat rows for this season
  const teamSeasons = await prisma.teamSeasonStat.findMany({
    where: { season },
  });

  console.log(`   Found ${teamSeasons.length} team-season records\n`);

  let updated = 0;
  let skipped = 0;
  const skipReasons: Record<string, number> = {};

  for (const teamSeason of teamSeasons) {
    // Parse rawJson safely
    const rawJson = (teamSeason.rawJson as any) || {};
    
    // Check if roster_churn exists
    if (!rawJson.roster_churn) {
      skipped++;
      skipReasons['missing roster_churn'] = (skipReasons['missing roster_churn'] || 0) + 1;
      continue;
    }

    // Compute continuity score
    const continuityScore = computeContinuityScore(teamSeason);
    
    if (continuityScore === null) {
      skipped++;
      skipReasons['could not compute continuity score'] = (skipReasons['could not compute continuity score'] || 0) + 1;
      continue;
    }

    // Update raw_json.portal_meta.continuityScore
    // Preserve all existing keys
    const updatedRawJson = {
      ...rawJson,
      portal_meta: {
        ...(rawJson.portal_meta || {}),
        continuityScore,
      },
    };

    if (!dryRun) {
      await prisma.teamSeasonStat.update({
        where: {
          season_teamId: {
            season: teamSeason.season,
            teamId: teamSeason.teamId,
          },
        },
        data: {
          rawJson: updatedRawJson,
        },
      });
    }

    updated++;
  }

  console.log(`✅ Sync complete:`);
  console.log(`   Season: ${season}`);
  console.log(`   Teams updated: ${updated}`);
  console.log(`   Teams skipped: ${skipped}`);
  
  if (Object.keys(skipReasons).length > 0) {
    console.log(`   Skip reasons:`);
    for (const [reason, count] of Object.entries(skipReasons)) {
      console.log(`     ${reason}: ${count}`);
    }
  }

  if (dryRun) {
    console.log(`\n⚠️  DRY RUN: No changes were saved.`);
  }

  console.log('');
  
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});


