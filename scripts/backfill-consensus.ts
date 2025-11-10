/**
 * Historical Backfill: Recompute and verify consensus for all final games
 * 
 * This script:
 * 1. Finds all final games from Weeks 1-12
 * 2. For each game, computes consensus using pre-kick window (T-60 to T+5)
 * 3. Logs results and statistics
 * 4. Identifies games with issues (no pre-kick lines, price leaks, etc.)
 * 
 * Run: npx tsx scripts/backfill-consensus.ts [season] [startWeek] [endWeek]
 * Example: npx tsx scripts/backfill-consensus.ts 2025 1 12
 */

import { PrismaClient } from '@prisma/client';
import { getPointValue, getLineValue, looksLikePriceLeak } from '../apps/web/lib/market-line-helpers';

const prisma = new PrismaClient();

interface ConsensusResult {
  spread: {
    value: number | null;
    rawCount: number;
    perBookCount: number;
    deduped: boolean;
    books: string[];
    excluded: number;
  };
  total: {
    value: number | null;
    count: number;
    books: string[];
    excluded: number;
  };
  moneyline: {
    favoritePrice: number | null;
    dogPrice: number | null;
    perBookCount: number;
    rawCount: number;
    deduped: boolean;
    books: string[];
    excluded: number;
  };
  usingPreKickLines: boolean;
  windowStart: string | null;
  windowEnd: string | null;
}

function computeSpreadConsensus(
  lines: Array<{ lineValue: number | null; bookName?: string | null; source?: string | null; lineType: string }>,
  priceLeakFilter: (value: number) => boolean
): ConsensusResult['spread'] {
  const validValues: { value: number; book: string }[] = [];
  let excludedCount = 0;

  for (const line of lines) {
    if (line.lineType !== 'spread') continue;
    
    const value = getPointValue(line, 'spread');
    if (value === null || value === undefined) {
      excludedCount++;
      continue;
    }

    if (priceLeakFilter(value)) {
      excludedCount++;
      continue;
    }

    const book = line.bookName || line.source || 'unknown';
    validValues.push({ value, book });
  }

  const rawCount = validValues.length;

  if (rawCount === 0) {
    return {
      value: null,
      rawCount: 0,
      perBookCount: 0,
      deduped: true,
      books: [],
      excluded: excludedCount
    };
  }

  // Normalize to favorite-centric
  const normalizedValues = validValues.map(v => ({
    value: -Math.abs(v.value),
    book: v.book
  }));

  // Dedupe per book
  const perBookMap = new Map<string, number>();
  for (const { value, book } of normalizedValues) {
    const rounded = Math.round(value * 2) / 2;
    if (!perBookMap.has(book)) {
      perBookMap.set(book, rounded);
    }
  }

  const dedupedValues = Array.from(perBookMap.entries()).map(([book, value]) => ({ book, value }));
  const perBookCount = dedupedValues.length;

  if (dedupedValues.length === 0) {
    return {
      value: null,
      rawCount,
      perBookCount: 0,
      deduped: true,
      books: [],
      excluded: excludedCount
    };
  }

  // Compute median
  const sorted = dedupedValues.map(v => v.value).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];

  const uniqueBooks = Array.from(new Set(dedupedValues.map(v => v.book)));

  return {
    value: median,
    rawCount,
    perBookCount,
    deduped: true,
    books: uniqueBooks,
    excluded: excludedCount
  };
}

function computeTotalConsensus(
  lines: Array<{ lineValue: number | null; bookName?: string | null; source?: string | null; lineType: string }>,
  priceLeakFilter: (value: number) => boolean
): ConsensusResult['total'] {
  const validValues: { value: number; book: string }[] = [];
  let excludedCount = 0;

  for (const line of lines) {
    if (line.lineType !== 'total') continue;
    
    const value = getPointValue(line, 'total');
    if (value === null || value === undefined) {
      excludedCount++;
      continue;
    }

    if (priceLeakFilter(value)) {
      excludedCount++;
      continue;
    }

    // Reject negative totals
    if (value < 0) {
      excludedCount++;
      continue;
    }

    const book = line.bookName || line.source || 'unknown';
    validValues.push({ value, book });
  }

  if (validValues.length === 0) {
    return {
      value: null,
      count: 0,
      books: [],
      excluded: excludedCount
    };
  }

  const sorted = validValues.map(v => v.value).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];

  const uniqueBooks = Array.from(new Set(validValues.map(v => v.book)));

  return {
    value: median,
    count: validValues.length,
    books: uniqueBooks,
    excluded: excludedCount
  };
}

function computeMoneylineConsensus(
  lines: Array<{ closingLine?: number | null; lineValue?: number | null; bookName?: string | null; source?: string | null; lineType: string }>
): ConsensusResult['moneyline'] {
  const favoritePrices: { value: number; book: string }[] = [];
  const dogPrices: { value: number; book: string }[] = [];
  let excludedCount = 0;

  for (const line of lines) {
    if (line.lineType !== 'moneyline') continue;
    
    const value = getLineValue(line);
    if (value === null || value === undefined) {
      excludedCount++;
      continue;
    }

    // Guardrails
    if (Math.abs(value) < 100) {
      excludedCount++;
      continue;
    }

    if (Math.abs(value) % 5 !== 0) {
      excludedCount++;
      continue;
    }

    const book = line.bookName || line.source || 'unknown';

    if (value < 0) {
      favoritePrices.push({ value, book });
    } else {
      dogPrices.push({ value, book });
    }
  }

  const rawCount = favoritePrices.length + dogPrices.length;

  // Dedupe per book
  const favoritePerBook = new Map<string, number>();
  const dogPerBook = new Map<string, number>();

  for (const { value, book } of favoritePrices) {
    const rounded = Math.round(value / 5) * 5;
    if (!favoritePerBook.has(book)) {
      favoritePerBook.set(book, rounded);
    }
  }

  for (const { value, book } of dogPrices) {
    const rounded = Math.round(value / 5) * 5;
    if (!dogPerBook.has(book)) {
      dogPerBook.set(book, rounded);
    }
  }

  const dedupedFavoritePrices = Array.from(favoritePerBook.values());
  const dedupedDogPrices = Array.from(dogPerBook.values());
  const perBookCount = Math.max(favoritePerBook.size, dogPerBook.size);

  // Compute medians
  const favoriteMedian = dedupedFavoritePrices.length > 0
    ? (() => {
        const sorted = dedupedFavoritePrices.sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
      })()
    : null;

  const dogMedian = dedupedDogPrices.length > 0
    ? (() => {
        const sorted = dedupedDogPrices.sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
      })()
    : null;

  const allBooks = Array.from(new Set([
    ...Array.from(favoritePerBook.keys()),
    ...Array.from(dogPerBook.keys())
  ]));

  return {
    favoritePrice: favoriteMedian,
    dogPrice: dogMedian,
    perBookCount,
    rawCount,
    deduped: true,
    books: allBooks,
    excluded: excludedCount
  };
}

async function computeConsensusForGame(game: any): Promise<ConsensusResult> {
  const isCompletedGame = game.status === 'final';
  let marketLinesToUse = game.marketLines;
  let usingPreKickLines = false;
  let windowStart: string | null = null;
  let windowEnd: string | null = null;

  if (isCompletedGame) {
    const kickoffTime = new Date(game.date);
    const preKickWindowStart = new Date(kickoffTime.getTime() - 60 * 60 * 1000);
    const preKickWindowEnd = new Date(kickoffTime.getTime() + 5 * 60 * 1000);

    const preKickLines = game.marketLines.filter((line: any) => {
      const lineTime = new Date(line.timestamp);
      return lineTime >= preKickWindowStart && lineTime <= preKickWindowEnd;
    });

    if (preKickLines.length > 0) {
      marketLinesToUse = preKickLines;
      usingPreKickLines = true;
      windowStart = preKickWindowStart.toISOString();
      windowEnd = preKickWindowEnd.toISOString();
    }
  }

  const spreadConsensus = computeSpreadConsensus(marketLinesToUse, looksLikePriceLeak);
  const totalConsensus = computeTotalConsensus(marketLinesToUse, looksLikePriceLeak);
  const moneylineConsensus = computeMoneylineConsensus(marketLinesToUse);

  return {
    spread: spreadConsensus,
    total: totalConsensus,
    moneyline: moneylineConsensus,
    usingPreKickLines,
    windowStart,
    windowEnd
  };
}

async function main() {
  const args = process.argv.slice(2);
  const season = args[0] ? parseInt(args[0], 10) : 2025;
  const startWeek = args[1] ? parseInt(args[1], 10) : 1;
  const endWeek = args[2] ? parseInt(args[2], 10) : 12;

  console.log(`\n📊 BACKFILL CONSENSUS: Season ${season}, Weeks ${startWeek}-${endWeek}\n`);

  const weeks = Array.from({ length: endWeek - startWeek + 1 }, (_, i) => startWeek + i);
  
  const stats = {
    totalGames: 0,
    gamesWithSpread: 0,
    gamesWithTotal: 0,
    gamesWithMoneyline: 0,
    gamesWithPreKickLines: 0,
    gamesWithoutPreKickLines: 0,
    gamesWithPriceLeaks: 0,
    gamesWithZeroMedian: 0,
    errors: [] as Array<{ gameId: string; error: string }>
  };

  for (const week of weeks) {
    console.log(`\n📅 Processing Week ${week}...`);

    const games = await prisma.game.findMany({
      where: {
        season,
        week,
        status: 'final'
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        marketLines: {
          orderBy: { timestamp: 'asc' }
        }
      },
      orderBy: { date: 'asc' }
    });

    console.log(`   Found ${games.length} final games`);

    for (const game of games) {
      stats.totalGames++;

      try {
        const consensus = await computeConsensusForGame(game);

        // Track statistics
        if (consensus.spread.value !== null) {
          stats.gamesWithSpread++;
          if (consensus.spread.perBookCount < 2) {
            stats.gamesWithZeroMedian++;
          }
        }

        if (consensus.total.value !== null) {
          stats.gamesWithTotal++;
        }

        if (consensus.moneyline.favoritePrice !== null || consensus.moneyline.dogPrice !== null) {
          stats.gamesWithMoneyline++;
        }

        if (consensus.usingPreKickLines) {
          stats.gamesWithPreKickLines++;
        } else if (game.status === 'final') {
          stats.gamesWithoutPreKickLines++;
        }

        if (consensus.spread.excluded > 0 || consensus.total.excluded > 0 || consensus.moneyline.excluded > 0) {
          stats.gamesWithPriceLeaks++;
        }

        // Log problematic games
        if (game.status === 'final' && !consensus.usingPreKickLines) {
          console.warn(`   ⚠️  ${game.awayTeam.name} @ ${game.homeTeam.name}: No pre-kick lines found`);
        }

        if (consensus.spread.value === null && game.marketLines.filter((l: any) => l.lineType === 'spread').length > 0) {
          console.warn(`   ⚠️  ${game.awayTeam.name} @ ${game.homeTeam.name}: Spread consensus failed (${consensus.spread.excluded} excluded, ${consensus.spread.rawCount} raw)`);
        }

      } catch (error: any) {
        stats.errors.push({
          gameId: game.id,
          error: error.message || String(error)
        });
        console.error(`   ❌ ${game.awayTeam.name} @ ${game.homeTeam.name}: ${error.message}`);
      }
    }
  }

  // Print summary
  console.log(`\n\n📊 BACKFILL SUMMARY`);
  console.log(`===================`);
  console.log(`Total games processed: ${stats.totalGames}`);
  console.log(`Games with spread consensus: ${stats.gamesWithSpread} (${((stats.gamesWithSpread / stats.totalGames) * 100).toFixed(1)}%)`);
  console.log(`Games with total consensus: ${stats.gamesWithTotal} (${((stats.gamesWithTotal / stats.totalGames) * 100).toFixed(1)}%)`);
  console.log(`Games with moneyline consensus: ${stats.gamesWithMoneyline} (${((stats.gamesWithMoneyline / stats.totalGames) * 100).toFixed(1)}%)`);
  console.log(`Games with pre-kick lines: ${stats.gamesWithPreKickLines} (${((stats.gamesWithPreKickLines / stats.totalGames) * 100).toFixed(1)}%)`);
  console.log(`Games without pre-kick lines: ${stats.gamesWithoutPreKickLines}`);
  console.log(`Games with price leaks filtered: ${stats.gamesWithPriceLeaks}`);
  console.log(`Games with low liquidity (perBookCount < 2): ${stats.gamesWithZeroMedian}`);
  console.log(`Errors: ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log(`\n❌ ERRORS:`);
    stats.errors.forEach(({ gameId, error }) => {
      console.log(`   ${gameId}: ${error}`);
    });
  }

  console.log(`\n✅ Backfill complete!\n`);
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

