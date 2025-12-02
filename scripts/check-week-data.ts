/**
 * Quick script to check Week 14 vs Week 15 data
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking Week 14 vs Week 15 data...\n');
  
  // Week 14
  const week14Games = await prisma.game.count({
    where: { season: 2025, week: 14 }
  });
  
  const week14Bets = await prisma.bet.count({
    where: { 
      season: 2025, 
      week: 14,
      strategyTag: 'hybrid_v2'
    }
  });
  
  // Week 15
  const week15Games = await prisma.game.count({
    where: { season: 2025, week: 15 }
  });
  
  const week15Bets = await prisma.bet.count({
    where: { 
      season: 2025, 
      week: 15,
      strategyTag: 'hybrid_v2'
    }
  });
  
  console.log('Week 14:');
  console.log(`  Games: ${week14Games}`);
  console.log(`  Hybrid V2 Bets: ${week14Bets}\n`);
  
  console.log('Week 15:');
  console.log(`  Games: ${week15Games}`);
  console.log(`  Hybrid V2 Bets: ${week15Bets}\n`);
  
  await prisma.$disconnect();
}

main().catch(console.error);

