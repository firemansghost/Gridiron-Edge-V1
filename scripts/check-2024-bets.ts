import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const bets = await prisma.bet.findMany({
    where: {
      season: 2024,
      result: { in: ['win', 'loss', 'push'] },
    },
    select: {
      strategyTag: true,
    },
    distinct: ['strategyTag'],
  });
  
  console.log('2024 strategies with graded bets:', bets.map(b => b.strategyTag));
  
  // Also check total counts
  const officialCount = await prisma.bet.count({
    where: {
      season: 2024,
      strategyTag: 'official_flat_100',
      result: { in: ['win', 'loss', 'push'] },
    },
  });
  
  const hybridCount = await prisma.bet.count({
    where: {
      season: 2024,
      strategyTag: 'hybrid_v2',
      result: { in: ['win', 'loss', 'push'] },
    },
  });
  
  console.log(`\nofficial_flat_100: ${officialCount} graded bets`);
  console.log(`hybrid_v2: ${hybridCount} graded bets`);
  
  await prisma.$disconnect();
}

main().catch(console.error);



