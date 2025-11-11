import { prisma } from '../apps/web/lib/prisma';

async function check2024Scores() {
  const games2024 = await prisma.game.count({
    where: { season: 2024, status: 'final' }
  });
  
  const gamesWithScores = await prisma.game.count({
    where: {
      season: 2024,
      status: 'final',
      homeScore: { not: null },
      awayScore: { not: null }
    }
  });
  
  console.log('\n📊 2024 Season Score Check\n');
  console.log(`  Total final games: ${games2024}`);
  console.log(`  Games with scores: ${gamesWithScores}`);
  console.log(`  Coverage: ${games2024 > 0 ? ((gamesWithScores / games2024) * 100).toFixed(1) : '0'}%`);
  
  if (gamesWithScores < games2024 * 0.9) {
    console.log('\n⚠️  Warning: Less than 90% of games have scores');
    console.log('   Ratings computation may be limited');
  } else {
    console.log('\n✅ Sufficient score coverage for ratings computation');
  }
  
  await prisma.$disconnect();
}

check2024Scores();

