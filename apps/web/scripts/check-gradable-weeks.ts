/**
 * Check which weeks have scores available for grading
 * 
 * Usage:
 *   npx tsx apps/web/scripts/check-gradable-weeks.ts [season]
 */

import { prisma } from '../lib/prisma';

async function checkGradableWeeks(season: number = 2025) {
  console.log(`\n📊 Checking gradable weeks for ${season} season...\n`);

  // Get all games with scores for this season
  const gamesWithScores = await prisma.game.findMany({
    where: {
      season,
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: {
      id: true,
      week: true,
      date: true,
      homeScore: true,
      awayScore: true,
      status: true,
    },
    orderBy: [
      { week: 'asc' },
      { date: 'asc' },
    ],
  });

  // Group by week
  const byWeek = new Map<number, typeof gamesWithScores>();
  for (const game of gamesWithScores) {
    if (!byWeek.has(game.week)) {
      byWeek.set(game.week, []);
    }
    byWeek.get(game.week)!.push(game);
  }

  // Check which weeks have strategy_run bets
  const weeksWithBets = await prisma.bet.groupBy({
    by: ['week'],
    where: {
      season,
      source: 'strategy_run',
    },
    _count: { _all: true },
  });

  const weeksWithBetsSet = new Set(weeksWithBets.map(w => w.week));

  console.log('Week | Games w/ Scores | Strategy Bets | Gradable?');
  console.log('-----|-----------------|---------------|-----------');

  for (const week of Array.from(byWeek.keys()).sort((a, b) => a - b)) {
    const games = byWeek.get(week)!;
    const hasBets = weeksWithBetsSet.has(week);
    const betCount = weeksWithBets.find(w => w.week === week)?._count._all || 0;
    const gradable = hasBets && games.length > 0 ? '✅' : '❌';
    
    console.log(`${week.toString().padStart(4)} | ${games.length.toString().padStart(15)} | ${betCount.toString().padStart(13)} | ${gradable}`);
  }

  // Check ungraded bets by week
  console.log('\n📋 Ungraded bets by week:');
  const ungradedBets = await prisma.bet.findMany({
    where: {
      season,
      source: 'strategy_run',
      result: null,
      game: {
        homeScore: { not: null },
        awayScore: { not: null },
      },
    },
    select: {
      week: true,
      gameId: true,
      game: {
        select: {
          homeScore: true,
          awayScore: true,
        },
      },
    },
  });

  const ungradedByWeek = new Map<number, number>();
  for (const bet of ungradedBets) {
    ungradedByWeek.set(bet.week, (ungradedByWeek.get(bet.week) || 0) + 1);
  }

  if (ungradedByWeek.size > 0) {
    for (const [week, count] of Array.from(ungradedByWeek.entries()).sort((a, b) => a[0] - b[0])) {
      console.log(`  Week ${week}: ${count} ungraded bet(s) with scores`);
    }
  } else {
    console.log('  All bets with scores are graded! ✅');
  }

  // SQL query for Supabase
  console.log('\n📝 SQL Query for Supabase:');
  console.log(`
-- Check which weeks have scores and strategy_run bets
SELECT 
  g.week,
  COUNT(DISTINCT g.id) as games_with_scores,
  COUNT(DISTINCT b.id) as strategy_bets,
  COUNT(DISTINCT CASE WHEN b.result IS NULL AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL THEN b.id END) as ungraded_with_scores
FROM games g
LEFT JOIN bets b ON b.game_id = g.id AND b.source = 'strategy_run'
WHERE g.season = ${season}
  AND g.home_score IS NOT NULL
  AND g.away_score IS NOT NULL
GROUP BY g.week
ORDER BY g.week;
  `);

  await prisma.$disconnect();
}

const season = process.argv[2] ? parseInt(process.argv[2]) : 2025;
checkGradableWeeks(season).catch(console.error);




