import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Delaware team ID from audit CSV
  const teamId = 'delaware';
  
  const ratings = await prisma.teamSeasonRating.findMany({
    where: {
      season: 2025,
      teamId,
    },
    orderBy: { modelVersion: 'asc' },
  });
  
  console.log(`\nDelaware ratings for 2025:\n`);
  for (const r of ratings) {
    console.log(`Model: ${r.modelVersion}`);
    console.log(`  powerRating: ${r.powerRating}`);
    console.log(`  rating: ${r.rating}`);
    console.log(`  confidence: ${r.confidence}`);
    console.log(`  hfaTeam: ${(r as any).hfaTeam}`);
    console.log();
  }
  
  await prisma.$disconnect();
}

main();

