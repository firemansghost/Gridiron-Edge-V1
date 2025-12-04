import { prisma } from '../lib/prisma';

async function check2024Data() {
  console.log('Checking 2024 data availability...\n');
  
  // Check drive stats
  const statsWithDrives = await prisma.teamSeasonStat.findMany({
    where: {
      season: 2024,
    },
    select: {
      teamId: true,
      rawJson: true,
    },
    take: 5,
  });
  
  const hasDriveStats = statsWithDrives.some(s => {
    const json = s.rawJson as any;
    return json?.drive_stats?.finishingDrives || json?.drive_stats?.availableYards;
  });
  
  console.log(`Drive stats sample: ${hasDriveStats ? '✅ Found' : '❌ Missing'}`);
  if (!hasDriveStats && statsWithDrives.length > 0) {
    const sample = statsWithDrives[0].rawJson as any;
    console.log(`  Sample rawJson keys: ${Object.keys(sample || {}).join(', ')}`);
  }
  
  // Check V4 ratings
  const v4Ratings = await prisma.teamSeasonRating.count({
    where: {
      season: 2024,
      modelVersion: 'v4',
    },
  });
  console.log(`V4 ratings: ${v4Ratings > 0 ? `✅ ${v4Ratings} teams` : '❌ None'}`);
  
  // Check V4 bets
  const v4Bets = await prisma.bet.count({
    where: {
      season: 2024,
      strategyTag: 'v4_labs',
    },
  });
  console.log(`V4 bets: ${v4Bets > 0 ? `✅ ${v4Bets} bets` : '❌ None'}`);
  
  // Check Hybrid bets
  const hybridBets = await prisma.bet.count({
    where: {
      season: 2024,
      strategyTag: 'hybrid_v2',
    },
  });
  console.log(`Hybrid bets: ${hybridBets > 0 ? `✅ ${hybridBets} bets` : '❌ None'}`);
  
  // Check overlay bets
  const agreeBets = await prisma.bet.count({
    where: {
      season: 2024,
      strategyTag: 'hybrid_v4_agree',
    },
  });
  const fadeBets = await prisma.bet.count({
    where: {
      season: 2024,
      strategyTag: 'fade_v4_labs',
    },
  });
  console.log(`Overlay bets: ${agreeBets > 0 || fadeBets > 0 ? `✅ Agree: ${agreeBets}, Fade: ${fadeBets}` : '❌ None'}`);
  
  await prisma.$disconnect();
}

check2024Data().catch(console.error);












