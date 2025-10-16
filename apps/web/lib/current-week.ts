// apps/web/lib/current-week.ts
import { PrismaClient } from '@prisma/client';

type SeasonWeek = { season: number; week: number };
type WeekDates = Record<number, Date[]>; // week -> list of game dates
type GameRow = { week: number | null; date: Date };

function absDiff(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime());
}

// Pick the week whose nearest game-time is closest to now
function pickClosestWeek(weekDates: WeekDates, now: Date): number | null {
  let bestWeek: number | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const weekStr of Object.keys(weekDates)) {
    const week = Number(weekStr);
    const dates = weekDates[week] || [];
    if (dates.length === 0) continue;

    // Closest date inside this week
    let localBest = Number.POSITIVE_INFINITY;
    for (const d of dates) {
      const delta = absDiff(d, now);
      if (delta < localBest) localBest = delta;
    }

    if (localBest < bestDelta) {
      bestDelta = localBest;
      bestWeek = week;
    }
  }
  return bestWeek;
}

// Fallbacks: last completed week (<= now), else smallest week available
function fallbackWeek(weekDates: WeekDates, now: Date): number {
  const weeks = Object.keys(weekDates).map(n => Number(n)).sort((a, b) => a - b);
  // Last week that has any game start <= now
  let lastCompleted: number | null = null;
  for (const w of weeks) {
    const dates = weekDates[w] || [];
    const anyPast = dates.some(d => d.getTime() <= now.getTime());
    if (anyPast) lastCompleted = w;
  }
  if (lastCompleted !== null) return lastCompleted;
  // Otherwise, earliest week we have
  return weeks[0] ?? 1;
}

export async function getCurrentSeasonWeek(prisma: PrismaClient): Promise<SeasonWeek> {
  const now = new Date();

  // 1) Find latest season that has any games
  const latestSeasonRow = await prisma.game.findFirst({
    orderBy: [{ season: 'desc' }, { week: 'desc' }],
    select: { season: true },
  });
  const season = latestSeasonRow?.season ?? now.getFullYear();

  // 2) Gather weeks and their game dates for that season (FBS already filtered at ingest)
  const games: GameRow[] = await prisma.game.findMany({
    where: { season },
    select: { week: true, date: true }, // NOTE: `date`, not `startDate`
  });

  if (!games.length) {
    // Nothing in DB: return a sensible default
    return { season, week: 1 };
  }

  const weekDates: WeekDates = {};
  for (const g of games) {
    const wk = g.week ?? 1;
    if (!weekDates[wk]) weekDates[wk] = [];
    const d = g.date instanceof Date ? g.date : new Date((g as unknown as { date: string }).date);
    if (!isNaN(d.getTime())) {
      weekDates[wk].push(d);
    }
  }

  // 3) Try closest-week selection
  const closest = pickClosestWeek(weekDates, now);
  if (closest !== null) {
    return { season, week: closest };
  }

  // 4) Fallbacks
  return { season, week: fallbackWeek(weekDates, now) };
}
