/**
 * Check Week 9 Details
 */

import { prisma } from '../lib/prisma';

async function checkDetails() {
  // Check model version
  const sample = await prisma.matchupOutput.findFirst({
    where: { season: 2025, week: 9 },
    select: { modelVersion: true },
  });
  console.log('Sample modelVersion:', sample?.modelVersion);

  // Check ungraded bet
  const ungraded = await prisma.bet.findFirst({
    where: {
      season: 2025,
      week: 9,
      strategyTag: 'official_flat_100',
      result: null,
    },
    include: {
      game: {
        include: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });

  if (ungraded) {
    console.log('\nUngraded bet:');
    console.log('  Game:', ungraded.game.id);
    console.log('  Matchup:', `${ungraded.game.awayTeam.name} @ ${ungraded.game.homeTeam.name}`);
    console.log('  Market:', ungraded.marketType, ungraded.side);
    console.log('  Game status:', ungraded.game.status);
    console.log('  Scores:', `${ungraded.game.awayScore} @ ${ungraded.game.homeScore}`);

    // Check if game has matchup output
    const output = await prisma.matchupOutput.findFirst({
      where: {
        gameId: ungraded.game.id,
        season: 2025,
        week: 9,
      },
    });
    console.log('  Has matchup output:', !!output);
  }

  // Check how many games need scores
  const gamesNeedingScores = await prisma.game.count({
    where: {
      season: 2025,
      week: 9,
      OR: [
        { status: { not: 'final' } },
        { homeScore: null },
        { awayScore: null },
      ],
    },
  });

  console.log(`\nGames needing scores: ${gamesNeedingScores} / 307`);

  await prisma.$disconnect();
}

checkDetails().catch(console.error);



