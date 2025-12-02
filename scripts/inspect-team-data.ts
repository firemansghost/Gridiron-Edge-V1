/**
 * Inspect team data for a specific season
 * 
 * Usage:
 *   npx tsx scripts/inspect-team-data.ts --season 2025 --team lsu
 *   npx tsx scripts/inspect-team-data.ts --season 2024 --team "Ohio State"
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  let season: number | undefined;
  let teamArg: string | undefined;
  
  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && i + 1 < args.length) {
      season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--team' && i + 1 < args.length) {
      teamArg = args[i + 1];
      i++;
    }
  }
  
  if (!season || !teamArg) {
    console.error('Usage: npx tsx scripts/inspect-team-data.ts --season <season> --team <team>');
    console.error('Example: npx tsx scripts/inspect-team-data.ts --season 2025 --team lsu');
    console.error('Example: npx tsx scripts/inspect-team-data.ts --season 2024 --team "Ohio State"');
    process.exit(1);
  }
  
  // Resolve team by name (exact match first, then contains)
  const team = await prisma.team.findFirst({
    where: {
      OR: [
        { name: { equals: teamArg, mode: 'insensitive' } },
        { name: { contains: teamArg, mode: 'insensitive' } },
      ],
    },
  });
  
  if (!team) {
    console.log(`❌ No team found matching: "${teamArg}"`);
    console.log('   Try using part of the team name (e.g., "LSU", "Ohio State").');
    await prisma.$disconnect();
    process.exit(0);
  }
  
  console.log(`\n🔍 Team Data Inspector`);
  console.log(`   Season: ${season}`);
  console.log(`   Team: ${team.name}`);
  console.log(`   Team ID: ${team.id}\n`);
  
  // Fetch TeamSeasonStat
  const teamSeasonStat = await prisma.teamSeasonStat.findUnique({
    where: {
      season_teamId: {
        season,
        teamId: team.id,
      },
    },
  });
  
  if (!teamSeasonStat) {
    console.log(`⚠️  No team season stats found for ${team.name} in ${season}`);
    console.log('   This team may not have played in this season, or data has not been ingested yet.');
    await prisma.$disconnect();
    process.exit(0);
  }
  
  // Print core efficiency metrics
  console.log('📊 Core Efficiency Metrics:');
  console.log('   Offense:');
  console.log(`     YPP: ${teamSeasonStat.yppOff?.toString() || 'N/A'}`);
  console.log(`     Success Rate: ${teamSeasonStat.successOff?.toString() || 'N/A'}`);
  console.log(`     Pass YPA: ${teamSeasonStat.passYpaOff?.toString() || 'N/A'}`);
  console.log(`     Rush YPC: ${teamSeasonStat.rushYpcOff?.toString() || 'N/A'}`);
  console.log(`     Pace: ${teamSeasonStat.paceOff?.toString() || 'N/A'}`);
  console.log(`     EPA: ${teamSeasonStat.epaOff?.toString() || 'N/A'}`);
  console.log('   Defense:');
  console.log(`     YPP Allowed: ${teamSeasonStat.yppDef?.toString() || 'N/A'}`);
  console.log(`     Success Rate Allowed: ${teamSeasonStat.successDef?.toString() || 'N/A'}`);
  console.log(`     Pass YPA Allowed: ${teamSeasonStat.passYpaDef?.toString() || 'N/A'}`);
  console.log(`     Rush YPC Allowed: ${teamSeasonStat.rushYpcDef?.toString() || 'N/A'}`);
  console.log(`     Pace: ${teamSeasonStat.paceDef?.toString() || 'N/A'}`);
  console.log(`     EPA: ${teamSeasonStat.epaDef?.toString() || 'N/A'}`);
  console.log('');
  
  // Parse and print rawJson blocks
  const rawJson = teamSeasonStat.rawJson as any;
  
  if (!rawJson) {
    console.log('📦 Raw JSON: (empty)');
    await prisma.$disconnect();
    return;
  }
  
  if (rawJson.drive_stats) {
    console.log('🚗 Drive Stats:');
    console.dir(rawJson.drive_stats, { depth: 3 });
    console.log('');
  }
  
  if (rawJson.roster_churn) {
    console.log('👥 Roster Churn:');
    console.dir(rawJson.roster_churn, { depth: 3 });
    console.log('');
  }
  
  if (rawJson.sgo_stats) {
    console.log('📈 SGO Stats (Labs):');
    console.dir(rawJson.sgo_stats, { depth: 3 });
    console.log('');
  }
  
  if (rawJson.portal_meta) {
    console.log('🏈 Portal & NIL Indices:');
    console.dir(rawJson.portal_meta, { depth: 3 });
    console.log('');
  }
  
  // Check for any other rawJson keys
  const knownKeys = ['drive_stats', 'roster_churn', 'sgo_stats', 'portal_meta'];
  const otherKeys = Object.keys(rawJson).filter(k => !knownKeys.includes(k));
  if (otherKeys.length > 0) {
    console.log(`📦 Other Raw JSON Keys: ${otherKeys.join(', ')}`);
    otherKeys.forEach(key => {
      console.log(`\n   ${key}:`);
      console.dir(rawJson[key], { depth: 2 });
    });
  }
  
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

