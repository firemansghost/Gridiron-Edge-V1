import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.teamMembership.count({ where: { season: 2025 } });
  console.log(`TeamMembership rows for 2025: ${count}`);
  
  const sample = await prisma.teamMembership.findMany({
    where: { season: 2025 },
    take: 10,
    include: { team: true },
  });
  
  console.log('\nSample rows:');
  for (const row of sample) {
    console.log(`  ${row.team.name}: subdivision=${row.subdivision}, conference=${row.conference}`);
  }
  
  const p5Count = await prisma.teamMembership.count({
    where: { season: 2025, subdivision: 'P5' },
  });
  const g5Count = await prisma.teamMembership.count({
    where: { season: 2025, subdivision: 'G5' },
  });
  
  console.log(`\nP5 teams: ${p5Count}`);
  console.log(`G5 teams: ${g5Count}`);
  console.log(`FBS total (P5+G5): ${p5Count + g5Count}`);
  
  await prisma.$disconnect();
}

main();

