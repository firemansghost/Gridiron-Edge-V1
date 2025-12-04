/**
 * Debug script to verify current week detection
 */
import { PrismaClient } from '@prisma/client';
import { getCurrentSeasonWeek } from '../apps/web/lib/current-week';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Debug: Current Week Detection\n');
  
  // Get current week using the same helper as the API
  const result = await getCurrentSeasonWeek(prisma);
  
  console.log(`Current season: ${result.season}`);
  console.log(`Current week: ${result.week}\n`);
  
  // Get detailed info about the selected week
  const weekGames = await prisma.game.findMany({
    where: {
      season: result.season,
      week: result.week,
    },
    select: {
      id: true,
      date: true,
    },
    orderBy: {
      date: 'asc',
    },
  });
  
  if (weekGames.length > 0) {
    const dates = weekGames.map(g => new Date(g.date));
    const firstDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const lastDate = new Date(Math.max(...dates.map(d => d.getTime())));
    
    console.log(`Week ${result.week} date range:`);
    console.log(`  First game: ${firstDate.toISOString()}`);
    console.log(`  Last game: ${lastDate.toISOString()}`);
    console.log(`  Total games: ${weekGames.length}\n`);
    
    // Show today's date in Chicago timezone for comparison
    const today = new Date();
    const chicagoTime = new Date(today.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    console.log(`Today (America/Chicago): ${chicagoTime.toISOString()}\n`);
    
    // Check if today is within the week's range
    if (firstDate.getTime() <= chicagoTime.getTime() && chicagoTime.getTime() <= lastDate.getTime()) {
      console.log('✅ Today is within this week\'s date range');
    } else if (firstDate.getTime() > chicagoTime.getTime()) {
      console.log('📅 This is a future week (first game is after today)');
    } else {
      console.log('📅 This is a past week (last game is before today)');
    }
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);




