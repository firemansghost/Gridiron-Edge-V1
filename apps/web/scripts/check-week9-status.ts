/**
 * Check Week 9 Status
 */

import { prisma } from '../lib/prisma';

async function checkWeek9() {
  console.log('📊 Week 9 Status Check\n');

  // Check matchup outputs
  const outputs = await prisma.matchupOutput.count({
    where: { season: 2025, week: 9 },
  });

  // Check official bets
  const bets = await prisma.bet.count({
    where: { season: 2025, week: 9, strategyTag: 'official_flat_100' },
  });

  const graded = await prisma.bet.count({
    where: {
      season: 2025,
      week: 9,
      strategyTag: 'official_flat_100',
      result: { not: null },
    },
  });

  const ungraded = await prisma.bet.count({
    where: {
      season: 2025,
      week: 9,
      strategyTag: 'official_flat_100',
      result: null,
    },
  });

  // Check games with scores
  const gamesWithScores = await prisma.game.count({
    where: {
      season: 2025,
      week: 9,
      status: 'final',
      homeScore: { not: null },
      awayScore: { not: null },
    },
  });

  const totalGames = await prisma.game.count({
    where: { season: 2025, week: 9 },
  });

  console.log('Matchup Outputs:', outputs);
  console.log('Official Bets:', bets);
  console.log('  Graded:', graded);
  console.log('  Ungraded:', ungraded);
  console.log('\nGames:');
  console.log('  Total:', totalGames);
  console.log('  With scores (final):', gamesWithScores);

  // Check for the Alabama State game issue
  const alabamaGame = await prisma.game.findUnique({
    where: { id: '2025-wk9-alabama-state-alabama-a-m' },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  if (alabamaGame) {
    console.log('\n⚠️  Alabama State @ Alabama A M:');
    console.log('  Status:', alabamaGame.status);
    console.log('  Scores:', `${alabamaGame.awayScore} @ ${alabamaGame.homeScore}`);
    console.log('  Home:', alabamaGame.homeTeam.name);
    console.log('  Away:', alabamaGame.awayTeam.name);
  }

  await prisma.$disconnect();
}

checkWeek9().catch(console.error);



