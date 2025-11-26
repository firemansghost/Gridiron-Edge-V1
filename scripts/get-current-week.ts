import { getCurrentSeasonWeek } from '../apps/web/lib/current-week';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const { season, week } = await getCurrentSeasonWeek(prisma);
  console.log(week);
  await prisma.$disconnect();
}

main().catch(console.error);

