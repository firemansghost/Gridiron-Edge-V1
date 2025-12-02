import { prisma } from '../lib/prisma';

async function checkDriveStats() {
  const stats = await prisma.teamSeasonStat.findMany({
    where: {
      season: 2024,
    },
    select: {
      teamId: true,
      rawJson: true,
    },
  });

  let withDriveStats = 0;
  for (const stat of stats) {
    const json = stat.rawJson as any;
    if (json?.drive_stats?.finishingDrives || json?.drive_stats?.availableYards) {
      withDriveStats++;
    }
  }

  console.log(`2024 TeamSeasonStat rows: ${stats.length}`);
  console.log(`Teams with drive_stats: ${withDriveStats}`);
  
  await prisma.$disconnect();
}

checkDriveStats().catch(console.error);










