/**
 * Check game dates for Week 14 vs Week 15
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  console.log(`Current date: ${now.toISOString()}\n`);
  
  // Week 14 games
  const week14Games = await prisma.game.findMany({
    where: { season: 2025, week: 14 },
    select: { id: true, date: true },
    orderBy: { date: 'asc' },
    take: 5
  });
  
  // Week 15 games
  const week15Games = await prisma.game.findMany({
    where: { season: 2025, week: 15 },
    select: { id: true, date: true },
    orderBy: { date: 'asc' },
    take: 5
  });
  
  console.log('Week 14 games (first 5):');
  week14Games.forEach(g => {
    const date = new Date(g.date);
    const diff = Math.abs(date.getTime() - now.getTime());
    const days = Math.round(diff / (1000 * 60 * 60 * 24));
    console.log(`  ${g.id}: ${date.toISOString()} (${days} days ${date > now ? 'future' : 'past'})`);
  });
  
  console.log('\nWeek 15 games (first 5):');
  week15Games.forEach(g => {
    const date = new Date(g.date);
    const diff = Math.abs(date.getTime() - now.getTime());
    const days = Math.round(diff / (1000 * 60 * 60 * 24));
    console.log(`  ${g.id}: ${date.toISOString()} (${days} days ${date > now ? 'future' : 'past'})`);
  });
  
  await prisma.$disconnect();
}

main().catch(console.error);


