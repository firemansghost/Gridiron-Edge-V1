import { prisma } from '../apps/web/lib/prisma';

async function checkWeekStatus() {
  const season = 2025;
  
  for (const week of [9, 12]) {
    const games = await prisma.game.findMany({
      where: { season, week },
      select: { status: true }
    });
    
    const statuses = games.reduce((acc: Record<string, number>, g) => {
      acc[g.status] = (acc[g.status] || 0) + 1;
      return acc;
    }, {});
    
    console.log(`\nWeek ${week} (Season ${season}):`);
    console.log(`  Total games: ${games.length}`);
    console.log(`  Status breakdown:`, JSON.stringify(statuses, null, 2));
  }
  
  await prisma.$disconnect();
}

checkWeekStatus();

