// apps/web/lib/current-week.ts
import { PrismaClient } from '@prisma/client';

type SeasonWeek = { season: number; week: number };
type WeekDateRange = {
  week: number;
  firstDate: Date;
  lastDate: Date;
};
type GameRow = { week: number | null; date: Date };

/**
 * Get current date/time in America/Chicago timezone (same TZ as the site)
 * Returns a Date object that represents the current moment, but we'll use it
 * to compare against game dates. Game dates in DB are stored in UTC.
 * For comparison purposes, we convert "now" to what it would be in Chicago time,
 * but since we're comparing against UTC dates, we need to be consistent.
 * 
 * The simplest approach: get the current UTC time and use it directly.
 * Game dates are in UTC, so comparisons will work correctly.
 */
function getTodayInChicago(): Date {
  // Return current UTC time - game dates in DB are also UTC
  // The algorithm will work correctly as long as we're consistent
  return new Date();
}

/**
 * Determine current week using the new algorithm:
 * Step 1: If today is within any week's date range (firstDate <= today <= lastDate), return that week
 * Step 2: Else, if there are future weeks, return the week with the smallest firstDate (next upcoming)
 * Step 3: Else, return the week with the latest lastDate (most recent completed week)
 */
function determineCurrentWeek(weekRanges: WeekDateRange[], today: Date): number {
  // Step 1: Check if today is within any week's date range
  for (const range of weekRanges) {
    if (range.firstDate.getTime() <= today.getTime() && today.getTime() <= range.lastDate.getTime()) {
      return range.week;
    }
  }

  // Step 2: Find future weeks (firstDate > today) and pick the one with smallest firstDate
  const futureWeeks = weekRanges.filter(r => r.firstDate.getTime() > today.getTime());
  if (futureWeeks.length > 0) {
    // Sort by firstDate ascending and return the first (earliest upcoming week)
    futureWeeks.sort((a, b) => a.firstDate.getTime() - b.firstDate.getTime());
    return futureWeeks[0].week;
  }

  // Step 3: No future weeks, return the week with the latest lastDate
  weekRanges.sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime());
  return weekRanges[0].week;
}

export async function getCurrentSeasonWeek(prisma: PrismaClient): Promise<SeasonWeek> {
  const today = getTodayInChicago();

  // 1) Find latest season that has any games
  const latestSeasonRow = await prisma.game.findFirst({
    orderBy: [{ season: 'desc' }, { week: 'desc' }],
    select: { season: true },
  });
  const season = latestSeasonRow?.season ?? today.getFullYear();

  // 2) Gather weeks and their game dates for that season (FBS already filtered at ingest)
  const games: GameRow[] = await prisma.game.findMany({
    where: { season },
    select: { week: true, date: true }, // NOTE: `date`, not `startDate`
  });

  if (!games.length) {
    // Nothing in DB: return a sensible default
    return { season, week: 1 };
  }

  // 3) Group games by week and compute firstDate/lastDate for each week
  const weekDateMap = new Map<number, Date[]>();
  for (const g of games) {
    const wk = g.week ?? 1;
    if (!weekDateMap.has(wk)) {
      weekDateMap.set(wk, []);
    }
    const d = g.date instanceof Date ? g.date : new Date((g as unknown as { date: string }).date);
    if (!isNaN(d.getTime())) {
      weekDateMap.get(wk)!.push(d);
    }
  }

  // 4) Build week date ranges
  const weekRanges: WeekDateRange[] = [];
  for (const week of Array.from(weekDateMap.keys())) {
    const dates = weekDateMap.get(week)!;
    if (dates.length === 0) continue;
    const firstDate = new Date(Math.min(...dates.map((d: Date) => d.getTime())));
    const lastDate = new Date(Math.max(...dates.map((d: Date) => d.getTime())));
    weekRanges.push({ week, firstDate, lastDate });
  }

  if (weekRanges.length === 0) {
    return { season, week: 1 };
  }

  // 5) Determine current week using new algorithm
  const currentWeek = determineCurrentWeek(weekRanges, today);

  return { season, week: currentWeek };
}

