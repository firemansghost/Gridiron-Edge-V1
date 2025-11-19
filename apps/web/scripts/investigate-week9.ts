/**
 * Investigate Week 9 Issues
 */

import { prisma } from '../lib/prisma';

async function investigate() {
  console.log('🔍 Week 9 Investigation\n');

  // Find games without matchup outputs
  const allGames = await prisma.game.findMany({
    where: { season: 2025, week: 9 },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      matchupOutputs: {
        where: { modelVersion: 'v1' },
        select: { id: true },
      },
    },
  });

  const gamesWithoutOutputs = allGames.filter(
    (g) => g.matchupOutputs.length === 0
  );

  console.log(`Games without matchup outputs: ${gamesWithoutOutputs.length}`);
  if (gamesWithoutOutputs.length > 0) {
    console.log('First 5:');
    gamesWithoutOutputs.slice(0, 5).forEach((g) => {
      console.log(
        `  ${g.awayTeam.name} @ ${g.homeTeam.name} (${g.id})`
      );
    });
  }

  // Find games that should have official picks but don't
  const gamesWithOutputs = allGames.filter(
    (g) => g.matchupOutputs.length > 0
  );

  const gamesWithBets = await prisma.bet.groupBy({
    by: ['gameId'],
    where: {
      season: 2025,
      week: 9,
      strategyTag: 'official_flat_100',
    },
    _count: { _all: true },
  });

  const gameIdsWithBets = new Set(gamesWithBets.map((b) => b.gameId));

  const gamesNeedingBets = gamesWithOutputs.filter(
    (g) => !gameIdsWithBets.has(g.id)
  );

  console.log(
    `\nGames with matchup outputs but no official bets: ${gamesNeedingBets.length}`
  );
  if (gamesNeedingBets.length > 0) {
    console.log('First 5:');
    gamesNeedingBets.slice(0, 5).forEach((g) => {
      console.log(
        `  ${g.awayTeam.name} @ ${g.homeTeam.name} (${g.id})`
      );
    });
  }

  // Check ungraded bets
  const ungradedBets = await prisma.bet.findMany({
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

  console.log(`\nUngraded bets: ${ungradedBets.length}`);
  ungradedBets.forEach((bet) => {
    console.log(
      `  ${bet.game.awayTeam.name} @ ${bet.game.homeTeam.name} - ${bet.marketType} ${bet.side}`
    );
    console.log(`    Game status: ${bet.game.status}`);
    console.log(
      `    Scores: ${bet.game.awayScore} @ ${bet.game.homeScore}`
    );
  });

  await prisma.$disconnect();
}

investigate().catch(console.error);



