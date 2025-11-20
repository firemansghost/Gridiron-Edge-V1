/**
 * Verify Conference Adjustments Applied
 * 
 * Checks that teams with updated conferences have correct ratings
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const season = 2025;

  console.log(`\n🔍 VERIFYING CONFERENCE ADJUSTMENTS (Season ${season})\n`);
  console.log('='.repeat(70));

  // Teams we updated and their expected conferences
  const teamsToCheck = [
    { name: 'Oregon', expectedConf: 'Big Ten' },
    { name: 'Washington', expectedConf: 'Big Ten' },
    { name: 'UCLA', expectedConf: 'Big Ten' },
    { name: 'USC', expectedConf: 'Big Ten' },
    { name: 'Rutgers', expectedConf: 'Big Ten' },
    { name: 'Texas', expectedConf: 'SEC' },
    { name: 'Oklahoma', expectedConf: 'SEC' },
    { name: 'California', expectedConf: 'ACC' },
    { name: 'Stanford', expectedConf: 'ACC' },
    { name: 'Utah', expectedConf: 'Big 12' },
    { name: 'Arizona', expectedConf: 'Big 12' },
    { name: 'Colorado', expectedConf: 'Big 12' },
  ];

  for (const { name, expectedConf } of teamsToCheck) {
    const team = await prisma.team.findFirst({
      where: {
        name: {
          contains: name,
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
      const rating = await prisma.teamSeasonRating.findUnique({
        where: {
          season_teamId_modelVersion: {
            season,
            teamId: team.id,
            modelVersion: 'v1',
          },
        },
        select: {
          powerRating: true,
        },
      });

      const ratingValue = rating?.powerRating ? Number(rating.powerRating).toFixed(2) : 'NULL';
      const confMatch = team.conference === expectedConf ? '✅' : '❌';
      
      console.log(`${confMatch} ${team.name}:`);
      console.log(`   Conference: ${team.conference || 'NULL'} (expected: ${expectedConf})`);
      console.log(`   Power Rating: ${ratingValue}`);
    } else {
      console.log(`⚠️  ${name}: Not found`);
    }
  }

  console.log('\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

