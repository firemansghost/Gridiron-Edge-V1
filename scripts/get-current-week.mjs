#!/usr/bin/env node

/**
 * Get current CFB week from database
 * This script queries the database to find the current week
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function getCurrentWeek() {
  try {
    const now = new Date();
    
    // Find the latest season with games
    const latestGame = await prisma.game.findFirst({
      orderBy: [
        { season: 'desc' },
        { week: 'desc' },
        { date: 'desc' }
      ],
      select: {
        season: true,
        week: true,
        date: true
      }
    });

    if (!latestGame) {
      console.error('No games found in database');
      process.exit(1);
    }

    const season = latestGame.season;
    
    // Find all games for this season, grouped by week
    const games = await prisma.game.findMany({
      where: { season },
      select: { week: true, date: true },
      orderBy: { date: 'asc' }
    });

    // Group games by week and find the week with games closest to now
    const weekDates = {};
    for (const game of games) {
      const week = game.week || 1;
      if (!weekDates[week]) {
        weekDates[week] = [];
      }
      weekDates[week].push(new Date(game.date));
    }

    // Find the week with the closest game date to now
    let bestWeek = latestGame.week;
    let bestDelta = Infinity;

    for (const [weekStr, dates] of Object.entries(weekDates)) {
      const week = parseInt(weekStr);
      for (const date of dates) {
        const delta = Math.abs(date.getTime() - now.getTime());
        if (delta < bestDelta) {
          bestDelta = delta;
          bestWeek = week;
        }
      }
    }

    // If we're past all games, use the latest week
    const allPast = Object.values(weekDates).flat()
      .every(date => date.getTime() < now.getTime());
    
    if (allPast) {
      bestWeek = latestGame.week;
    }

    return bestWeek;
  } catch (error) {
    console.error('Error getting current week:', error.message);
    // Fallback: return week 10 for now
    return 10;
  } finally {
    await prisma.$disconnect();
  }
}

getCurrentWeek().then(week => {
  console.log(week);
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

