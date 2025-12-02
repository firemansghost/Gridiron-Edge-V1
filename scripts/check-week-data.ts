/**
 * Check data counts for a specific season/week
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  let season = 2025;
  let week: number | undefined;
  
  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && i + 1 < args.length) {
      season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--week' && i + 1 < args.length) {
      week = parseInt(args[i + 1], 10);
      i++;
    }
  }
  
  if (!week) {
    console.error('Usage: npx tsx scripts/check-week-data.ts --season <season> --week <week>');
    console.error('Example: npx tsx scripts/check-week-data.ts --season 2025 --week 15');
    process.exit(1);
  }
  
  console.log(`Checking ${season} Week ${week} data...\n`);
  
  // Games
  const gamesCount = await prisma.game.count({
    where: { season, week }
  });
  
  // Market lines
  const marketLinesCount = await prisma.marketLine.count({
    where: { season, week }
  });
  
  // Bets by strategy
  const betsByStrategy = await prisma.bet.groupBy({
    by: ['strategyTag'],
    where: { 
      season, 
      week,
      source: 'strategy_run'
    },
    _count: { _all: true }
  });
  
  console.log(`${season} Week ${week}:`);
  console.log(`  Games: ${gamesCount}`);
  console.log(`  Market Lines: ${marketLinesCount}`);
  console.log(`  Bets by Strategy:`);
  
  if (betsByStrategy.length === 0) {
    console.log(`    (none)`);
  } else {
    betsByStrategy.forEach(s => {
      console.log(`    ${s.strategyTag || '(null)'}: ${s._count._all}`);
    });
  }
  
  console.log('');
  
  await prisma.$disconnect();
}

main().catch(console.error);

