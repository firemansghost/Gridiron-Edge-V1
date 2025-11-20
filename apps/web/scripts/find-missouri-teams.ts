/**
 * Find all Missouri teams in database
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const teams = await prisma.team.findMany({
    where: {
      name: {
        contains: 'Missouri',
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      name: true,
      conference: true,
    },
  });

  console.log(`\n🔍 Found ${teams.length} teams with "Missouri" in name:\n`);
  for (const team of teams) {
    console.log(`   ${team.name} (${team.id})`);
    console.log(`   Conference: ${team.conference || 'NULL'}`);
    console.log('');
  }

  // Check for "Mizzou" as well
  const mizzou = await prisma.team.findMany({
    where: {
      OR: [
        { name: { contains: 'Mizzou', mode: 'insensitive' } },
        { name: { contains: 'Missouri Tigers', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      name: true,
      conference: true,
    },
  });

  if (mizzou.length > 0) {
    console.log(`\n🔍 Found ${mizzou.length} teams with "Mizzou" or "Missouri Tigers":\n`);
    for (const team of mizzou) {
      console.log(`   ${team.name} (${team.id})`);
      console.log(`   Conference: ${team.conference || 'NULL'}`);
      console.log('');
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

