import { PrismaClient } from '@prisma/client';
import { CFBDClient } from '../apps/jobs/src/cfbd/cfbd-client';
import { CFBDTeamMapper } from '../apps/jobs/src/cfbd/team-mapper';

const prisma = new PrismaClient();

async function main() {
  console.log('Diagnosing why cfbd_eff_team_season is empty...\n');
  
  // Check if API key is set
  if (!process.env.CFBD_API_KEY) {
    console.error('❌ CFBD_API_KEY not set');
    process.exit(1);
  }
  
  const client = new CFBDClient();
  const mapper = new CFBDTeamMapper();
  const season = 2025;
  
  try {
    console.log('1. Testing API call: getAdvancedStatsSeason(2025)...');
    const stats = await client.getAdvancedStatsSeason(season);
    console.log(`   ✅ API returned ${stats.length} teams`);
    
    if (stats.length > 0) {
      console.log(`   Sample team: ${stats[0].team || stats[0].teamName || 'unknown'}`);
      console.log(`   Has offense data: ${!!stats[0].offense}`);
      console.log(`   Has defense data: ${!!stats[0].defense}`);
    }
    
    console.log('\n2. Testing team mapping...');
    let mappedCount = 0;
    let unmappedCount = 0;
    const unmapped: string[] = [];
    
    for (let i = 0; i < Math.min(10, stats.length); i++) {
      const stat = stats[i];
      const teamName = stat.team || stat.teamName;
      if (!teamName) continue;
      
      const teamId = await mapper.mapToInternal(teamName, season);
      if (teamId) {
        mappedCount++;
      } else {
        unmappedCount++;
        if (!unmapped.includes(teamName)) unmapped.push(teamName);
      }
    }
    
    console.log(`   Mapped: ${mappedCount}/10 sample teams`);
    console.log(`   Unmapped: ${unmappedCount}/10 sample teams`);
    if (unmapped.length > 0) {
      console.log(`   Unmapped sample: ${unmapped.slice(0, 3).join(', ')}`);
    }
    
    console.log('\n3. Checking database table...');
    const existingCount = await prisma.cfbdEffTeamSeason.count({
      where: { season },
    });
    console.log(`   Current rows in cfbd_eff_team_season for season ${season}: ${existingCount}`);
    
    if (existingCount === 0 && stats.length > 0) {
      console.log('\n4. Attempting to insert one test row...');
      const testStat = stats[0];
      const testTeamName = testStat.team || testStat.teamName;
      if (testTeamName) {
        const testTeamId = await mapper.mapToInternal(testTeamName, season);
        if (testTeamId) {
          try {
            await prisma.cfbdEffTeamSeason.upsert({
              where: { season_teamIdInternal: { season, teamIdInternal: testTeamId } },
              update: {
                offEpa: testStat.offense?.epa || null,
                offSr: testStat.offense?.successRate || null,
                asOf: new Date(),
              },
              create: {
                season,
                teamIdInternal: testTeamId,
                offEpa: testStat.offense?.epa || null,
                offSr: testStat.offense?.successRate || null,
              },
            });
            console.log(`   ✅ Successfully inserted test row for ${testTeamName}`);
          } catch (error: any) {
            console.error(`   ❌ Failed to insert: ${error.message}`);
          }
        } else {
          console.log(`   ⚠️  Could not map test team: ${testTeamName}`);
        }
      }
    }
    
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main();

