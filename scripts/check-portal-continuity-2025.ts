/**
 * Check Portal Continuity Data for 2025
 * 
 * Queries the database to see if 2025 has portal_meta data.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n📊 Checking Portal Continuity Data by Season\n');

  // Check all seasons
  const allSeasons = await prisma.teamSeasonStat.findMany({
    select: {
      season: true,
      rawJson: true,
    },
  });

  // Group by season and count teams with portal_meta
  const seasonStats = new Map<number, { total: number; withPortalMeta: number; withRosterChurn: number }>();

  for (const row of allSeasons) {
    const season = row.season;
    const stats = seasonStats.get(season) || { total: 0, withPortalMeta: 0, withRosterChurn: 0 };
    stats.total++;

    const rawJson = row.rawJson as any;
    if (rawJson?.roster_churn) {
      stats.withRosterChurn++;
    }
    if (rawJson?.portal_meta?.continuityScore !== undefined) {
      stats.withPortalMeta++;
    }

    seasonStats.set(season, stats);
  }

  // Print results
  const seasons = Array.from(seasonStats.keys()).sort((a, b) => b - a);
  
  for (const season of seasons) {
    const stats = seasonStats.get(season)!;
    const hasPortalMeta = stats.withPortalMeta > 0;
    const hasRosterChurn = stats.withRosterChurn > 0;
    
    console.log(`Season ${season}:`);
    console.log(`  Total teams: ${stats.total}`);
    console.log(`  Teams with roster_churn: ${stats.withRosterChurn} (${((stats.withRosterChurn / stats.total) * 100).toFixed(1)}%)`);
    console.log(`  Teams with portal_meta: ${stats.withPortalMeta} (${((stats.withPortalMeta / stats.total) * 100).toFixed(1)}%)`);
    
    if (season === 2025) {
      if (!hasPortalMeta) {
        console.log(`  ⚠️  2025 has NO portal_meta data - need to run sync_portal_indices.ts`);
      } else {
        console.log(`  ✅ 2025 has portal_meta data`);
      }
      if (!hasRosterChurn) {
        console.log(`  ⚠️  2025 has NO roster_churn data - cannot compute portal indices`);
      }
    }
    console.log('');
  }

  // Specifically check 2025
  const season2025 = await prisma.teamSeasonStat.findMany({
    where: { season: 2025 },
    select: {
      teamId: true,
      rawJson: true,
    },
  });

  console.log(`\n🔍 Detailed 2025 Check:\n`);
  console.log(`Total 2025 teams: ${season2025.length}`);
  
  const withRosterChurn = season2025.filter(ts => {
    const rawJson = ts.rawJson as any;
    return rawJson?.roster_churn !== undefined;
  });
  
  const withPortalMeta = season2025.filter(ts => {
    const rawJson = ts.rawJson as any;
    return rawJson?.portal_meta?.continuityScore !== undefined;
  });

  console.log(`Teams with roster_churn: ${withRosterChurn.length}`);
  console.log(`Teams with portal_meta.continuityScore: ${withPortalMeta.length}`);

  if (withRosterChurn.length > 0 && withPortalMeta.length === 0) {
    console.log(`\n✅ 2025 has roster_churn data but NO portal_meta - ready to sync!`);
    console.log(`   Run: npx tsx apps/jobs/src/talent/sync_portal_indices.ts --season 2025`);
  } else if (withRosterChurn.length === 0) {
    console.log(`\n⚠️  2025 has NO roster_churn data - cannot compute portal indices`);
    console.log(`   Need to sync roster_churn data first (from CFBD API)`);
  } else if (withPortalMeta.length > 0) {
    console.log(`\n✅ 2025 already has portal_meta data`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

