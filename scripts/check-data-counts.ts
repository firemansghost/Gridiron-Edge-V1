/**
 * Quick check of data availability
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const season = 2025;
  const weeks = [3, 4, 5, 6, 7, 8, 9, 10, 11];

  // Count games
  const games = await prisma.game.findMany({
    where: { season, week: { in: weeks }, status: 'final' },
    select: { id: true, week: true, homeTeamId: true, awayTeamId: true }
  });

  // Count market lines
  const lines = await prisma.marketLine.findMany({
    where: { season, week: { in: weeks }, lineType: 'spread' },
    select: { gameId: true }
  });
  const uniqueGamesWithLines = new Set(lines.map(l => l.gameId)).size;

  // Count V2 ratings
  const ratings = await prisma.teamSeasonRating.findMany({
    where: { season, modelVersion: 'v2' },
    select: { teamId: true, powerRating: true }
  });

  // Count games with both ratings and lines
  const gameIds = games.map(g => g.id);
  const gamesWithLines = gameIds.filter(id => lines.some(l => l.gameId === id));
  
  const allTeamIds = Array.from(new Set(games.flatMap(g => [g.homeTeamId, g.awayTeamId])));
  const gamesWithRatings = games.filter(g => {
    const homeRating = ratings.find(r => r.teamId === g.homeTeamId);
    const awayRating = ratings.find(r => r.teamId === g.awayTeamId);
    return homeRating && awayRating;
  });

  const gamesWithBoth = games.filter(g => {
    const hasLine = lines.some(l => l.gameId === g.id);
    const homeRating = ratings.find(r => r.teamId === g.homeTeamId);
    const awayRating = ratings.find(r => r.teamId === g.awayTeamId);
    return hasLine && homeRating && awayRating;
  });

  console.log('\n📊 DATA AVAILABILITY CHECK\n');
  console.log(`Season: ${season}, Weeks: ${weeks.join(', ')}\n`);
  console.log(`Final games: ${games.length}`);
  console.log(`Games with spread lines: ${uniqueGamesWithLines}`);
  console.log(`Teams with V2 ratings: ${ratings.length}`);
  console.log(`Games with both ratings: ${gamesWithRatings.length}`);
  console.log(`Games with both ratings AND lines: ${gamesWithBoth.length}`);
  
  // Sample rating values
  if (ratings.length > 0) {
    const sampleRatings = ratings.slice(0, 10);
    console.log(`\n📈 Sample V2 Power Ratings:`);
    sampleRatings.forEach(r => {
      console.log(`   ${r.teamId}: ${r.powerRating?.toFixed(2) ?? 'NULL'}`);
    });
  }

  await prisma.$disconnect();
}

main().catch(console.error);

