import { PrismaClient } from '@prisma/client';
import { CFBDClient } from '../apps/jobs/src/cfbd/cfbd-client';
import { CFBDTeamMapper } from '../apps/jobs/src/cfbd/team-mapper';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const season = 2025;
  
  if (!process.env.CFBD_API_KEY) {
    console.error('❌ CFBD_API_KEY not set');
    process.exit(1);
  }
  
  console.log(`📊 Backfilling CFBD season stats for ${season}...\n`);
  
  const client = new CFBDClient();
  const mapper = new CFBDTeamMapper();
  const unmapped: string[] = [];
  
  try {
    // Advanced stats season
    console.log(`   Fetching advanced stats (season)...`);
    const advStats = await client.getAdvancedStatsSeason(season);
    console.log(`   ✅ API returned ${advStats.length} teams`);
    
    let advSeasonUpserted = 0;
    let advSeasonSkipped = 0;
    
    for (const stat of advStats) {
      const teamName = stat.team || stat.teamName;
      if (!teamName) {
        advSeasonSkipped++;
        continue;
      }
      
      const teamId = await mapper.mapToInternal(teamName, season);
      if (!teamId) {
        if (!unmapped.includes(teamName)) unmapped.push(teamName);
        advSeasonSkipped++;
        continue;
      }
      
      try {
        await prisma.cfbdEffTeamSeason.upsert({
          where: { season_teamIdInternal: { season, teamIdInternal: teamId } },
          update: {
            offEpa: stat.offense?.epa || null,
            offSr: stat.offense?.successRate || null,
            isoPppOff: stat.offense?.explosiveness || null,
            ppoOff: stat.offense?.pointsPerOpportunity || null,
            lineYardsOff: stat.offense?.lineYards || null,
            havocOff: stat.offense?.havoc || null,
            defEpa: stat.defense?.epa || null,
            defSr: stat.defense?.successRate || null,
            isoPppDef: stat.defense?.explosiveness || null,
            ppoDef: stat.defense?.pointsPerOpportunity || null,
            stuffRate: stat.defense?.stuffRate || null,
            powerSuccess: stat.offense?.powerSuccess || null,
            havocDef: stat.defense?.havoc || null,
            runEpa: stat.offense?.rushingPlays?.epa || null,
            passEpa: stat.offense?.passingPlays?.epa || null,
            runSr: stat.offense?.rushingPlays?.successRate || null,
            passSr: stat.offense?.passingPlays?.successRate || null,
            earlyDownEpa: stat.offense?.firstDown?.epa || null,
            lateDownEpa: stat.offense?.secondDown?.epa || null,
            avgFieldPosition: stat.fieldPosition?.averageStartingFieldPosition || null,
            asOf: new Date(),
          },
          create: {
            season,
            teamIdInternal: teamId,
            offEpa: stat.offense?.epa || null,
            offSr: stat.offense?.successRate || null,
            isoPppOff: stat.offense?.explosiveness || null,
            ppoOff: stat.offense?.pointsPerOpportunity || null,
            lineYardsOff: stat.offense?.lineYards || null,
            havocOff: stat.offense?.havoc || null,
            defEpa: stat.defense?.epa || null,
            defSr: stat.defense?.successRate || null,
            isoPppDef: stat.defense?.explosiveness || null,
            ppoDef: stat.defense?.pointsPerOpportunity || null,
            stuffRate: stat.defense?.stuffRate || null,
            powerSuccess: stat.offense?.powerSuccess || null,
            havocDef: stat.defense?.havoc || null,
            runEpa: stat.offense?.rushingPlays?.epa || null,
            passEpa: stat.offense?.passingPlays?.epa || null,
            runSr: stat.offense?.rushingPlays?.successRate || null,
            passSr: stat.offense?.passingPlays?.successRate || null,
            earlyDownEpa: stat.offense?.firstDown?.epa || null,
            lateDownEpa: stat.offense?.secondDown?.epa || null,
            avgFieldPosition: stat.fieldPosition?.averageStartingFieldPosition || null,
          },
        });
        advSeasonUpserted++;
      } catch (error: any) {
        console.error(`   ⚠️  Failed to upsert for ${teamName}: ${error.message}`);
        advSeasonSkipped++;
      }
    }
    
    console.log(`   ✅ CFBD/team-season-eff: ${advSeasonUpserted} rows • skipped: ${advSeasonSkipped}`);
    
    if (unmapped.length > 0) {
      console.log(`   ⚠️  ${unmapped.length} unmapped teams: ${unmapped.slice(0, 5).join(', ')}${unmapped.length > 5 ? '...' : ''}`);
    }
    
    // Verify final count
    const finalCount = await prisma.cfbdEffTeamSeason.count({ where: { season } });
    console.log(`\n   📊 Final count in database: ${finalCount} rows`);
    
    if (finalCount > 0) {
      console.log(`   ✅ Season stats backfill complete!`);
    } else {
      console.log(`   ❌ No rows inserted - check errors above`);
    }
    
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

