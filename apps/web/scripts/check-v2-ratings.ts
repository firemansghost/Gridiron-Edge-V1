/**
 * Check V2 Ratings Status
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const season = 2025;

  const v1Count = await prisma.teamSeasonRating.count({
    where: { season, modelVersion: 'v1' },
  });

  const v2Count = await prisma.teamSeasonRating.count({
    where: { season, modelVersion: 'v2' },
  });

  console.log(`\n📊 RATINGS STATUS (Season ${season})\n`);
  console.log(`V1 ratings: ${v1Count}`);
  console.log(`V2 ratings: ${v2Count}`);

  // Check specific teams
  const ohioState = await prisma.teamSeasonRating.findFirst({
    where: {
      season,
      teamId: { in: ['ohio-state', 'ohio-state-buckeyes'] },
    },
  });

  const rutgers = await prisma.teamSeasonRating.findFirst({
    where: {
      season,
      teamId: 'rutgers',
    },
  });

  if (ohioState) {
    console.log(`\nOhio State (${ohioState.modelVersion}): ${ohioState.powerRating ? Number(ohioState.powerRating).toFixed(2) : 'NULL'}`);
  }
  if (rutgers) {
    console.log(`Rutgers (${rutgers.modelVersion}): ${rutgers.powerRating ? Number(rutgers.powerRating).toFixed(2) : 'NULL'}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);

