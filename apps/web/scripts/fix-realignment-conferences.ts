/**
 * Fix Conference Realignments for 2024/2025
 * 
 * Updates team conferences to reflect the major realignments:
 * - Oregon, Washington, UCLA, USC -> Big Ten
 * - Texas, Oklahoma -> SEC
 * - California, Stanford, SMU -> ACC
 * - Utah, Arizona, Arizona State, Colorado -> Big 12
 * 
 * Also diagnoses Rutgers rating to understand the Ohio State spread issue.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/fix-realignment-conferences.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Conference realignment updates for 2024/2025
const UPDATES: Record<string, string[]> = {
  'Big Ten': ['Oregon', 'Oregon Ducks', 'Washington', 'UCLA', 'USC', 'Rutgers'],
  'SEC': ['Texas', 'Texas Longhorns', 'Oklahoma', 'Oklahoma Sooners'],
  'ACC': ['California', 'Stanford', 'Smu', 'SMU'],
  'Big 12': ['Utah', 'Arizona', 'Arizona State', 'Colorado'],
};

async function main() {
  const season = 2025;

  console.log(`\n🔄 FIXING CONFERENCE REALIGNMENTS (Season ${season})\n`);
  console.log('='.repeat(70));

  let totalUpdated = 0;

  // Update conferences for each realignment
  for (const [newConference, teamNames] of Object.entries(UPDATES)) {
    console.log(`\n📝 Updating teams to ${newConference}:`);
    
    for (const teamName of teamNames) {
      try {
        // Find team by name (case-insensitive)
        const team = await prisma.team.findFirst({
          where: {
            name: {
              equals: teamName,
              mode: 'insensitive',
            },
          },
          select: {
            id: true,
            name: true,
            conference: true,
          },
        });

        if (team) {
          if (team.conference !== newConference) {
            await prisma.team.update({
              where: { id: team.id },
              data: { conference: newConference },
            });
            console.log(`   ✅ ${team.name}: ${team.conference || 'NULL'} → ${newConference}`);
            totalUpdated++;
          } else {
            console.log(`   ⏭️  ${team.name}: Already ${newConference}`);
          }
        } else {
          console.log(`   ⚠️  ${teamName}: Not found in database`);
        }
      } catch (error: any) {
        console.error(`   ❌ Error updating ${teamName}: ${error.message}`);
      }
    }
  }

  console.log(`\n✅ Updated ${totalUpdated} teams`);

  // ============================================================================
  // RUTGERS DIAGNOSIS
  // ============================================================================
  console.log(`\n\n🔍 RUTGERS RATING DIAGNOSIS\n`);
  console.log('='.repeat(70));

  // Find Rutgers team
  const rutgersTeam = await prisma.team.findFirst({
    where: {
      name: {
        contains: 'Rutgers',
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      name: true,
      conference: true,
    },
  });

  if (!rutgersTeam) {
    console.log('❌ Rutgers team not found in database');
    return;
  }

  console.log(`\n📊 Team Info:`);
  console.log(`   ID: ${rutgersTeam.id}`);
  console.log(`   Name: ${rutgersTeam.name}`);
  console.log(`   Conference: ${rutgersTeam.conference || 'NULL'}`);

  // Get V1 rating
  const v1Rating = await prisma.teamSeasonRating.findUnique({
    where: {
      season_teamId_modelVersion: {
        season,
        teamId: rutgersTeam.id,
        modelVersion: 'v1',
      },
    },
    select: {
      powerRating: true,
      offenseRating: true,
      defenseRating: true,
      games: true,
      confidence: true,
      dataSource: true,
    },
  });

  console.log(`\n📈 V1 Rating Data:`);
  if (v1Rating) {
    console.log(`   Power Rating: ${v1Rating.powerRating ? Number(v1Rating.powerRating).toFixed(2) : 'NULL'}`);
    console.log(`   Offense Rating: ${v1Rating.offenseRating ? Number(v1Rating.offenseRating).toFixed(2) : 'NULL'}`);
    console.log(`   Defense Rating: ${v1Rating.defenseRating ? Number(v1Rating.defenseRating).toFixed(2) : 'NULL'}`);
    console.log(`   Games: ${v1Rating.games}`);
    console.log(`   Confidence: ${v1Rating.confidence ? (Number(v1Rating.confidence) * 100).toFixed(1) + '%' : 'NULL'}`);
    console.log(`   Data Source: ${v1Rating.dataSource || 'NULL'}`);
  } else {
    console.log(`   ❌ No V1 rating found`);
  }

  // Get V2 rating for comparison
  const v2Rating = await prisma.teamSeasonRating.findUnique({
    where: {
      season_teamId_modelVersion: {
        season,
        teamId: rutgersTeam.id,
        modelVersion: 'v2',
      },
    },
    select: {
      powerRating: true,
      games: true,
    },
  });

  if (v2Rating) {
    console.log(`\n📈 V2 Rating Data (for comparison):`);
    console.log(`   Power Rating: ${v2Rating.powerRating ? Number(v2Rating.powerRating).toFixed(2) : 'NULL'}`);
    console.log(`   Games: ${v2Rating.games}`);
  }

  // Get season stats
  const seasonStats = await prisma.teamSeasonStat.findUnique({
    where: {
      season_teamId: {
        season,
        teamId: rutgersTeam.id,
      },
    },
    select: {
      yppOff: true,
      yppDef: true,
      epaOff: true,
      epaDef: true,
      successOff: true,
      successDef: true,
    },
  });

  if (seasonStats) {
    console.log(`\n📊 Season Stats:`);
    console.log(`   YPP Off: ${seasonStats.yppOff || 'NULL'}`);
    console.log(`   YPP Def: ${seasonStats.yppDef || 'NULL'}`);
    console.log(`   EPA Off: ${seasonStats.epaOff || 'NULL'}`);
    console.log(`   EPA Def: ${seasonStats.epaDef || 'NULL'}`);
    console.log(`   Success Off: ${seasonStats.successOff || 'NULL'}`);
    console.log(`   Success Def: ${seasonStats.successDef || 'NULL'}`);
  } else {
    console.log(`\n📊 Season Stats: ❌ Not found`);
  }

  // Get game count
  const gameCount = await prisma.game.count({
    where: {
      season,
      status: 'final',
      OR: [
        { homeTeamId: rutgersTeam.id },
        { awayTeamId: rutgersTeam.id },
      ],
    },
  });

  console.log(`\n🎮 Games:`);
  console.log(`   Final games in DB: ${gameCount}`);

  // Get Ohio State for comparison
  const ohioStateTeam = await prisma.team.findFirst({
    where: {
      name: {
        contains: 'Ohio State',
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (ohioStateTeam && v1Rating) {
    const ohioStateRating = await prisma.teamSeasonRating.findUnique({
      where: {
        season_teamId_modelVersion: {
          season,
          teamId: ohioStateTeam.id,
          modelVersion: 'v1',
        },
      },
      select: {
        powerRating: true,
      },
    });

    if (ohioStateRating && ohioStateRating.powerRating && v1Rating.powerRating) {
      const rutgersRating = Number(v1Rating.powerRating);
      const osuRating = Number(ohioStateRating.powerRating);
      const ratingDiff = osuRating - rutgersRating;
      
      console.log(`\n⚖️  Comparison with Ohio State:`);
      console.log(`   Ohio State Rating: ${osuRating.toFixed(2)}`);
      console.log(`   Rutgers Rating: ${rutgersRating.toFixed(2)}`);
      console.log(`   Rating Difference: ${ratingDiff.toFixed(2)}`);
      console.log(`   Expected Spread (OSU home): ~${(ratingDiff + 2.0).toFixed(1)} (rating diff + HFA)`);
      
      if (rutgersRating > 40) {
        console.log(`\n   ⚠️  WARNING: Rutgers rating is abnormally high (>40)!`);
        console.log(`   This suggests a data issue (small sample size, missing stats, etc.)`);
      } else if (ratingDiff < 10) {
        console.log(`\n   ⚠️  WARNING: Rating difference is too small (<10 points)!`);
        console.log(`   This would explain why the model spread is only -3.5`);
      } else {
        console.log(`\n   ✅ Ratings look reasonable. The spread issue might be in the calculation logic.`);
      }
    }
  }

  console.log('\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

