/**
 * Debug Drive Efficiency Metrics
 * 
 * Reads and displays Finishing Drives and Available Yards metrics
 * from TeamSeasonStat.rawJson.drive_stats for sample teams.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/debug-drive-efficiency.ts --season 2025
 */

import { prisma } from '../lib/prisma';

interface DriveStats {
  tempo?: number;
  qualityDrives?: number;
  qualityDriveRate?: number;
  finishingDrives?: {
    off: {
      scoringOpps: number;
      pointsOnOpps: number;
      pointsPerOpp: number;
    };
    def: {
      scoringOpps: number;
      pointsOnOpps: number;
      pointsPerOpp: number;
    };
  };
  availableYards?: {
    off: {
      drives: number;
      avgAvailableYards: number;
      avgYardsGained: number;
      avgAvailableYardsPct: number;
    };
    def: {
      drives: number;
      avgAvailableYards: number;
      avgYardsGained: number;
      avgAvailableYardsPct: number;
    };
  };
}

/**
 * Sample teams to check (recognizable names)
 */
const SAMPLE_TEAMS = [
  'Georgia',
  'Oregon',
  'Iowa',
  'Navy',
  'Memphis',
];

async function main() {
  const args = process.argv.slice(2);
  let season: number = 2025;
  
  // Parse --season argument
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && i + 1 < args.length) {
      season = parseInt(args[i + 1], 10);
      break;
    }
  }
  
  console.log(`\n🔍 Debug Drive Efficiency Metrics (Season ${season})\n`);
  console.log('='.repeat(70));
  
  // Find teams by name
  const teams = await prisma.team.findMany({
    where: {
      name: {
        in: SAMPLE_TEAMS,
      },
    },
  });
  
  if (teams.length === 0) {
    console.log('❌ No teams found matching sample names');
    console.log('   Looking for:', SAMPLE_TEAMS.join(', '));
    process.exit(1);
  }
  
  console.log(`\nFound ${teams.length} teams:\n`);
  
  // Load drive stats for each team
  for (const team of teams) {
    const stats = await prisma.teamSeasonStat.findUnique({
      where: {
        season_teamId: {
          season,
          teamId: team.id,
        },
      },
    });
    
    if (!stats) {
      console.log(`\n${team.name} (${team.id}):`);
      console.log('   ⚠️  No TeamSeasonStat found for this season');
      continue;
    }
    
    const rawJson = stats.rawJson as any;
    const driveStats = rawJson?.drive_stats as DriveStats | undefined;
    
    if (!driveStats) {
      console.log(`\n${team.name} (${team.id}):`);
      console.log('   ⚠️  No drive_stats found in rawJson');
      continue;
    }
    
    console.log(`\n${team.name} (${team.id}) - Season ${season}:`);
    console.log('-'.repeat(70));
    
    // V3 Totals metrics
    if (driveStats.tempo !== undefined) {
      console.log(`  V3 Totals:`);
      console.log(`    Tempo: ${driveStats.tempo.toFixed(2)} drives/game`);
      console.log(`    Quality Drives: ${driveStats.qualityDrives || 0}`);
      console.log(`    Quality Drive Rate: ${((driveStats.qualityDriveRate || 0) * 100).toFixed(1)}%`);
    }
    
    // Finishing Drives
    if (driveStats.finishingDrives) {
      console.log(`  Finishing Drives (Offense):`);
      console.log(`    Scoring Opportunities: ${driveStats.finishingDrives.off.scoringOpps}`);
      console.log(`    Points on Opportunities: ${driveStats.finishingDrives.off.pointsOnOpps.toFixed(1)}`);
      console.log(`    Points per Opportunity: ${driveStats.finishingDrives.off.pointsPerOpp.toFixed(2)}`);
      
      console.log(`  Finishing Drives (Defense):`);
      console.log(`    Scoring Opportunities Allowed: ${driveStats.finishingDrives.def.scoringOpps}`);
      console.log(`    Points Allowed on Opportunities: ${driveStats.finishingDrives.def.pointsOnOpps.toFixed(1)}`);
      console.log(`    Points per Opportunity Allowed: ${driveStats.finishingDrives.def.pointsPerOpp.toFixed(2)}`);
    } else {
      console.log(`  ⚠️  Finishing Drives metrics not found`);
    }
    
    // Available Yards
    if (driveStats.availableYards) {
      console.log(`  Available Yards (Offense):`);
      console.log(`    Drives with Available Yards: ${driveStats.availableYards.off.drives}`);
      console.log(`    Avg Available Yards: ${driveStats.availableYards.off.avgAvailableYards.toFixed(1)}`);
      console.log(`    Avg Yards Gained: ${driveStats.availableYards.off.avgYardsGained.toFixed(1)}`);
      console.log(`    Avg Available Yards %: ${(driveStats.availableYards.off.avgAvailableYardsPct * 100).toFixed(1)}%`);
      
      console.log(`  Available Yards (Defense):`);
      console.log(`    Opponent Drives: ${driveStats.availableYards.def.drives}`);
      console.log(`    Avg Available Yards Allowed: ${driveStats.availableYards.def.avgAvailableYards.toFixed(1)}`);
      console.log(`    Avg Yards Allowed: ${driveStats.availableYards.def.avgYardsGained.toFixed(1)}`);
      console.log(`    Avg Available Yards % Allowed: ${(driveStats.availableYards.def.avgAvailableYardsPct * 100).toFixed(1)}%`);
    } else {
      console.log(`  ⚠️  Available Yards metrics not found`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('\n✅ Debug complete\n');
}

main()
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

