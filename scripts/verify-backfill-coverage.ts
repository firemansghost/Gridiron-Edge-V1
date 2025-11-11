/**
 * Verify Backfill Coverage
 * 
 * Checks coverage after backfilling weeks 1-11:
 * - Games with pre-kick lines per week
 * - Median unique books per game
 * - Low-liquidity games (<2 books)
 * 
 * Usage: npx tsx scripts/verify-backfill-coverage.ts <season> <weeks>
 * Example: npx tsx scripts/verify-backfill-coverage.ts 2025 1-11
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseWeeks(weeksArg: string): number[] {
  if (weeksArg.includes(',')) {
    return weeksArg.split(',').map(w => parseInt(w.trim()));
  } else if (weeksArg.includes('-')) {
    const [start, end] = weeksArg.split('-').map(w => parseInt(w.trim()));
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  } else {
    return [parseInt(weeksArg)];
  }
}

interface WeekCoverage {
  week: number;
  totalGames: number;
  gamesWithPreKickLines: number;
  gamesWithAnyLines: number;
  medianBooksPerGame: number;
  lowLiquidityCount: number;
  lowLiquidityPct: number;
  coveragePct: number;
  sampleBooks: string[];
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: npx tsx scripts/verify-backfill-coverage.ts <season> <weeks>');
    console.error('Example: npx tsx scripts/verify-backfill-coverage.ts 2025 1-11');
    process.exit(1);
  }

  const season = parseInt(args[0]);
  const weeks = parseWeeks(args[1]);

  console.log('\n======================================================================');
  console.log('📊 BACKFILL COVERAGE VERIFICATION');
  console.log('======================================================================\n');
  console.log(`   Season: ${season}`);
  console.log(`   Weeks: ${weeks.join(', ')}`);
  console.log('');

  const results: WeekCoverage[] = [];

  for (const week of weeks) {
    // Get all final games for this week
    const games = await prisma.game.findMany({
      where: {
        season,
        week,
        status: 'final',
      },
      include: {
        marketLines: {
          where: { lineType: 'spread' },
        },
      },
    });

    const totalGames = games.length;

    // Count games with any spread lines
    const gamesWithAnyLines = games.filter(g => g.marketLines.length > 0).length;

    // For each game, check pre-kick window and count unique books
    const gamesWithPreKick: number[] = [];
    const booksPerGame: number[] = [];
    const allBooks = new Set<string>();
    let lowLiquidityCount = 0;

    for (const game of games) {
      if (game.marketLines.length === 0) continue;

      // Filter to pre-kick window (T-60 to T+5 around kickoff)
      const kickoff = game.date ? new Date(game.date) : null;
      let preKickLines = game.marketLines;

      if (kickoff) {
        const windowStart = new Date(kickoff.getTime() - 60 * 60 * 1000); // T-60 min
        const windowEnd = new Date(kickoff.getTime() + 5 * 60 * 1000); // T+5 min
        preKickLines = game.marketLines.filter(line => {
          const ts = new Date(line.timestamp);
          return ts >= windowStart && ts <= windowEnd;
        });
      }

      if (preKickLines.length > 0) {
        gamesWithPreKick.push(game.id);

        // Count unique books (normalized names)
        const uniqueBooks = new Set<string>();
        for (const line of preKickLines) {
          const bookName = line.bookName || 'Unknown';
          if (bookName !== 'Unknown') {
            uniqueBooks.add(bookName);
            allBooks.add(bookName);
          }
        }

        const bookCount = uniqueBooks.size;
        booksPerGame.push(bookCount);

        if (bookCount < 2) {
          lowLiquidityCount++;
        }
      }
    }

    // Calculate median books per game
    const sortedBooks = [...booksPerGame].sort((a, b) => a - b);
    const mid = Math.floor(sortedBooks.length / 2);
    const medianBooks = sortedBooks.length > 0
      ? (sortedBooks.length % 2 === 0
          ? (sortedBooks[mid - 1] + sortedBooks[mid]) / 2
          : sortedBooks[mid])
      : 0;

    const gamesWithPreKickCount = gamesWithPreKick.length;
    const coveragePct = totalGames > 0 ? (gamesWithPreKickCount / totalGames) * 100 : 0;
    const lowLiquidityPct = gamesWithPreKickCount > 0
      ? (lowLiquidityCount / gamesWithPreKickCount) * 100
      : 0;

    // Sample books (first 10 unique)
    const sampleBooks = Array.from(allBooks).slice(0, 10);

    results.push({
      week,
      totalGames,
      gamesWithPreKickLines: gamesWithPreKickCount,
      gamesWithAnyLines,
      medianBooksPerGame: medianBooks,
      lowLiquidityCount,
      lowLiquidityPct,
      coveragePct,
      sampleBooks,
    });
  }

  // Print results table
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 COVERAGE BY WEEK');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Week | Total | Pre-Kick | Any Lines | Med Books | Low Liq | Coverage');
  console.log('─────┼───────┼──────────┼───────────┼───────────┼─────────┼─────────');

  for (const result of results) {
    const status = result.coveragePct >= 80 ? '✅' : result.coveragePct >= 50 ? '⚠️ ' : '❌';
    console.log(
      `${result.week.toString().padStart(4)} | ${result.totalGames.toString().padStart(5)} | ${result.gamesWithPreKickLines.toString().padStart(8)} | ${result.gamesWithAnyLines.toString().padStart(9)} | ${result.medianBooksPerGame.toFixed(1).padStart(9)} | ${result.lowLiquidityCount.toString().padStart(7)} | ${result.coveragePct.toFixed(1)}% ${status}`
    );
  }

  console.log('');

  // Summary statistics
  const totalGames = results.reduce((sum, r) => sum + r.totalGames, 0);
  const totalPreKick = results.reduce((sum, r) => sum + r.gamesWithPreKickLines, 0);
  const overallCoverage = totalGames > 0 ? (totalPreKick / totalGames) * 100 : 0;
  const allMedians = results.flatMap(r => 
    Array(r.gamesWithPreKickLines).fill(r.medianBooksPerGame)
  );
  const overallMedian = allMedians.length > 0
    ? (() => {
        const sorted = [...allMedians].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
      })()
    : 0;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`   Total games: ${totalGames}`);
  console.log(`   Games with pre-kick lines: ${totalPreKick} (${overallCoverage.toFixed(1)}%)`);
  console.log(`   Overall median books per game: ${overallMedian.toFixed(1)}`);
  console.log('');

  // Check acceptance criteria
  const weeksBelow80 = results.filter(r => r.coveragePct < 80).length;
  const weeksBelow5Books = results.filter(r => r.medianBooksPerGame < 5).length;
  const weeksAbove10Books = results.filter(r => r.medianBooksPerGame > 10).length;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ ACCEPTANCE CRITERIA');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (overallCoverage >= 80) {
    console.log(`   ✅ Coverage ≥80%: ${overallCoverage.toFixed(1)}%`);
  } else {
    console.log(`   ❌ Coverage <80%: ${overallCoverage.toFixed(1)}% (target: ≥80%)`);
  }

  if (overallMedian >= 5 && overallMedian <= 10) {
    console.log(`   ✅ Median books 5-10: ${overallMedian.toFixed(1)}`);
  } else {
    console.log(`   ❌ Median books out of range: ${overallMedian.toFixed(1)} (target: 5-10)`);
  }

  if (weeksBelow80 === 0) {
    console.log(`   ✅ All weeks ≥80% coverage`);
  } else {
    console.log(`   ⚠️  ${weeksBelow80} week(s) below 80% coverage`);
  }

  console.log('');

  // Sample book names check
  const allSampleBooks = new Set<string>();
  results.forEach(r => r.sampleBooks.forEach(b => allSampleBooks.add(b)));
  const sampleBookList = Array.from(allSampleBooks).slice(0, 20);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📚 SAMPLE BOOK NAMES (Normalized)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (sampleBookList.length === 0) {
    console.log('   ⚠️  No book names found (all "Unknown")');
  } else {
    console.log(`   Found ${allSampleBooks.size} unique book names`);
    console.log(`   Sample: ${sampleBookList.join(', ')}`);
    
    const hasUndefined = sampleBookList.some(b => b === 'undefined' || b === 'Unknown');
    if (hasUndefined) {
      console.log('   ⚠️  WARNING: Some book names are still "Unknown" or "undefined"');
    } else {
      console.log('   ✅ All book names are normalized (no "Unknown" or "undefined")');
    }
  }

  console.log('');
  console.log('======================================================================');
  console.log('📊 VERIFICATION COMPLETE');
  console.log('======================================================================\n');

  await prisma.$disconnect();
}

main().catch(console.error);

