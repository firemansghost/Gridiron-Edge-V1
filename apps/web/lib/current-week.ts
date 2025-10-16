/**
 * Current Week Detection
 * 
 * Auto-detects the current CFB season/week based on database content
 */

import { PrismaClient } from '@prisma/client';

export interface SeasonWeek {
  season: number;
  week: number;
}

/**
 * Get the current season and week based on database content
 * 
 * Logic:
 * 1. Find the latest season that has any games
 * 2. For that season, find the week with games closest to now (within ±3-7 days)
 * 3. Fallback to the greatest week ≤ now, or smallest week if none
 */
export async function getCurrentSeasonWeek(prisma: PrismaClient): Promise<SeasonWeek> {
  const now = new Date();
  
  try {
    // Step 1: Find the latest season that has any games
    const latestSeasonResult = await prisma.game.aggregate({
      _max: {
        season: true
      }
    });
    
    if (!latestSeasonResult._max.season) {
      // No games in database, return fallback
      return { season: new Date().getFullYear(), week: 1 };
    }
    
    const latestSeason = latestSeasonResult._max.season;
    
    // Step 2: Get all weeks for this season with their game dates
    const games = await prisma.game.findMany({
      where: {
        season: latestSeason
      },
      select: {
        week: true,
        date: true
      },
      orderBy: {
        week: 'asc'
      }
    });
    
    if (games.length === 0) {
      return { season: latestSeason, week: 1 };
    }
    
    // Group games by week and find the best match
    const weekGroups = new Map<number, Date[]>();
    
    for (const game of games) {
      if (!weekGroups.has(game.week)) {
        weekGroups.set(game.week, []);
      }
      weekGroups.get(game.week)!.push(game.date);
    }
    
    // Find the week with games closest to now
    let bestWeek = 1;
    let minDifference = Infinity;
    
    for (const [week, dates] of weekGroups) {
      // Find the game date closest to now for this week
      const closestDate = dates.reduce((closest, date) => {
        const diff = Math.abs(date.getTime() - now.getTime());
        const closestDiff = Math.abs(closest.getTime() - now.getTime());
        return diff < closestDiff ? date : closest;
      });
      
      const difference = Math.abs(closestDate.getTime() - now.getTime());
      
      // Check if this week is within our target range (±3-7 days)
      const daysDiff = difference / (1000 * 60 * 60 * 24);
      if (daysDiff <= 7 && difference < minDifference) {
        minDifference = difference;
        bestWeek = week;
      }
    }
    
    // Step 3: Fallback logic
    if (minDifference === Infinity) {
      // No week within 7 days, find the greatest week ≤ now
      const weeksWithPastGames = Array.from(weekGroups.keys()).filter(week => {
        const weekDates = weekGroups.get(week)!;
        return weekDates.some(date => date <= now);
      });
      
      if (weeksWithPastGames.length > 0) {
        bestWeek = Math.max(...weeksWithPastGames);
      } else {
        // No past games, pick the smallest week
        bestWeek = Math.min(...Array.from(weekGroups.keys()));
      }
    }
    
    return { season: latestSeason, week: bestWeek };
    
  } catch (error) {
    console.error('Error detecting current season/week:', error);
    // Fallback to current year, week 1
    return { season: new Date().getFullYear(), week: 1 };
  }
}
