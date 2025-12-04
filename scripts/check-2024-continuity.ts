import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const teams = await prisma.teamSeasonStat.findMany({
    where: { season: 2024 },
  });
  
  let withScore = 0;
  for (const ts of teams) {
    const raw = (ts.rawJson as any) || {};
    if (raw.portal_meta?.continuityScore !== undefined) {
      withScore++;
    }
  }
  
  console.log(`2024 teams with continuityScore: ${withScore} of ${teams.length}`);
  
  await prisma.$disconnect();
}

main().catch(console.error);



