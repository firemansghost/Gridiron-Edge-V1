/**
 * Calibration Data Sanity Audit
 * 
 * Before tuning anything, verify:
 * 1. Target integrity (pre-kick consensus, one row per game)
 * 2. Sign conventions (favorite-centric, home-minus-away, rating_diff)
 * 3. Actual correlation between rating_diff and market spread
 * 4. HFA double-count check
 * 5. Visual scatter plot
 * 
 * Usage: npx tsx scripts/audit-calibration-data.ts <season> <weeks>
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

interface AuditRow {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeRating: number;
  awayRating: number;
  ratingDiffHMA: number; // home - away
  ratingDiffFC: number; // favorite-centric (negative = fav is home)
  marketFavTeam: string;
  marketSpreadHMA: number; // home - away
  marketSpreadFC: number; // favorite-centric (negative always)
  marketTotal: number;
  bookCount: number;
  isPreKick: boolean;
  matchupClass: string;
}

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

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: npx tsx scripts/audit-calibration-data.ts <season> <weeks>');
    console.error('Example: npx tsx scripts/audit-calibration-data.ts 2025 1-11');
    process.exit(1);
  }

  const season = parseInt(args[0]);
  const weeks = parseWeeks(args[1]);

  console.log('\n======================================================================');
  console.log('📊 CALIBRATION DATA SANITY AUDIT');
  console.log('======================================================================\n');
  console.log(`   Season: ${season}`);
  console.log(`   Weeks: ${weeks.join(', ')}`);
  console.log('');

  // Collect all games with spreads
  const games = await prisma.game.findMany({
    where: {
      season,
      week: { in: weeks },
      status: 'final',
    },
    include: {
      marketLines: {
        where: { lineType: 'spread' },
        orderBy: { timestamp: 'desc' },
      },
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  console.log(`   ✅ ${games.length} final games collected\n`);

  // Get ratings for all teams
  const gameTeamIds = Array.from(new Set(games.flatMap(g => [g.homeTeamId, g.awayTeamId])));
  const ratings = await prisma.teamSeasonRating.findMany({
    where: { season, teamId: { in: gameTeamIds }, modelVersion: 'v2' }
  });
  const ratingsMap = new Map(ratings.map(r => [r.teamId, r]));

  // Build audit rows
  const auditRows: AuditRow[] = [];

  for (const game of games) {
    const homeRatingRecord = ratingsMap.get(game.homeTeamId);
    const awayRatingRecord = ratingsMap.get(game.awayTeamId);

    if (!homeRatingRecord || !awayRatingRecord) continue;

    const homeRating = homeRatingRecord.powerRating !== null && homeRatingRecord.powerRating !== undefined
      ? Number(homeRatingRecord.powerRating)
      : 0;
    const awayRating = awayRatingRecord.powerRating !== null && awayRatingRecord.powerRating !== undefined
      ? Number(awayRatingRecord.powerRating)
      : 0;

    // Filter to pre-kick window (T-60 to T+5 around kickoff)
    const kickoff = game.date ? new Date(game.date) : null;
    let preKickLines = game.marketLines;
    let isPreKick = false;

    if (kickoff) {
      const windowStart = new Date(kickoff.getTime() - 60 * 60 * 1000); // T-60 min
      const windowEnd = new Date(kickoff.getTime() + 5 * 60 * 1000); // T+5 min
      preKickLines = game.marketLines.filter(line => {
        const ts = new Date(line.timestamp);
        return ts >= windowStart && ts <= windowEnd;
      });
      isPreKick = preKickLines.length > 0;
    }

    const linesToUse = isPreKick ? preKickLines : game.marketLines;

    if (linesToUse.length === 0) continue;

    // Compute consensus spread (per-book dedupe, favorite-centric)
    const spreadsByBook = new Map<string, number[]>();
    for (const line of linesToUse) {
      const book = line.bookName || 'unknown';
      const value = line.lineValue !== null && line.lineValue !== undefined ? Number(line.lineValue) : null;
      if (value === null || !isFinite(value)) continue;
      
      // Normalize to favorite-centric (negative)
      const fcValue = -Math.abs(value);
      
      if (!spreadsByBook.has(book)) {
        spreadsByBook.set(book, []);
      }
      spreadsByBook.get(book)!.push(fcValue);
    }

    // Dedupe per book (take median or first)
    const dedupedSpreads: number[] = [];
    for (const [book, values] of spreadsByBook.entries()) {
      if (values.length === 0) continue;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
      dedupedSpreads.push(median);
    }

    if (dedupedSpreads.length === 0) continue;

    // Consensus spread (median across books)
    const sortedSpreads = [...dedupedSpreads].sort((a, b) => a - b);
    const mid = Math.floor(sortedSpreads.length / 2);
    const consensusSpreadFC = sortedSpreads.length % 2 === 0
      ? (sortedSpreads[mid - 1] + sortedSpreads[mid]) / 2
      : sortedSpreads[mid];

    // Determine market favorite from consensus spread
    const marketFavIsHome = consensusSpreadFC < 0;
    const marketFavTeam = marketFavIsHome ? game.homeTeam.name : game.awayTeam.name;

    // Market spread in home-minus-away convention
    const marketSpreadHMA = marketFavIsHome ? consensusSpreadFC : -consensusSpreadFC;

    // Rating diff in both conventions
    const ratingDiffHMA = homeRating - awayRating;
    const modelFavIsHome = ratingDiffHMA > 0;
    const ratingDiffFC = modelFavIsHome ? ratingDiffHMA : -ratingDiffHMA;

    // Matchup class (simplified)
    let matchupClass = 'unknown';
    // TODO: Get from team_membership if available, for now use simplified logic

    auditRows.push({
      gameId: game.id,
      homeTeam: game.homeTeam.name,
      awayTeam: game.awayTeam.name,
      homeRating,
      awayRating,
      ratingDiffHMA,
      ratingDiffFC,
      marketFavTeam,
      marketSpreadHMA,
      marketSpreadFC: consensusSpreadFC,
      marketTotal: 0, // Not critical for this audit
      bookCount: spreadsByBook.size,
      isPreKick,
      matchupClass,
    });
  }

  console.log(`   ✅ ${auditRows.length} games with valid rating + market data\n`);

  // ========================================================================
  // 1. TARGET INTEGRITY
  // ========================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('1️⃣  TARGET INTEGRITY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const preKickCount = auditRows.filter(r => r.isPreKick).length;
  const fallbackCount = auditRows.length - preKickCount;
  const lowLiquidityCount = auditRows.filter(r => r.bookCount < 2).length;

  console.log(`   Training rows: ${auditRows.length}`);
  console.log(`   Pre-kick window: ${preKickCount} (${(preKickCount / auditRows.length * 100).toFixed(1)}%)`);
  console.log(`   Fallback (all lines): ${fallbackCount} (${(fallbackCount / auditRows.length * 100).toFixed(1)}%)`);
  console.log(`   Low liquidity (<2 books): ${lowLiquidityCount} (${(lowLiquidityCount / auditRows.length * 100).toFixed(1)}%)`);
  console.log('');

  if (fallbackCount > auditRows.length * 0.1) {
    console.log('   ⚠️  WARNING: >10% of rows using fallback (not pre-kick consensus)');
  } else {
    console.log('   ✅ Target integrity looks good (mostly pre-kick consensus)');
  }

  if (lowLiquidityCount > auditRows.length * 0.05) {
    console.log('   ⚠️  WARNING: >5% of rows have <2 books (low liquidity)');
  }

  console.log('');

  // ========================================================================
  // 2. SIGN & UNITS SANITY
  // ========================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('2️⃣  SIGN & UNITS SANITY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('   First 10 rows:\n');
  console.log('   Home Team                | Away Team                | H-Rtg  | A-Rtg  | RD(H-A) | RD(FC)  | Mkt Fav         | MktSpread(H-A) | MktSpread(FC)');
  console.log('   ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────');

  for (let i = 0; i < Math.min(10, auditRows.length); i++) {
    const row = auditRows[i];
    const homeShort = row.homeTeam.substring(0, 24).padEnd(24);
    const awayShort = row.awayTeam.substring(0, 24).padEnd(24);
    const favShort = row.marketFavTeam.substring(0, 15).padEnd(15);
    console.log(
      `   ${homeShort} | ${awayShort} | ${row.homeRating.toFixed(2).padStart(6)} | ${row.awayRating.toFixed(2).padStart(6)} | ${row.ratingDiffHMA.toFixed(2).padStart(7)} | ${row.ratingDiffFC.toFixed(2).padStart(7)} | ${favShort} | ${row.marketSpreadHMA.toFixed(1).padStart(14)} | ${row.marketSpreadFC.toFixed(1).padStart(13)}`
    );
  }

  console.log('\n   Sign conventions:');
  console.log('   • RD(H-A): Home rating - Away rating (positive = home is better)');
  console.log('   • RD(FC): Favorite-centric rating diff (always positive, model fav has higher rating)');
  console.log('   • MktSpread(H-A): Home-minus-away market spread (negative = home favored)');
  console.log('   • MktSpread(FC): Favorite-centric market spread (always negative)');
  console.log('');

  // Check for sign mismatches
  let signMismatches = 0;
  for (const row of auditRows) {
    // Market spread FC should always be negative
    if (row.marketSpreadFC >= 0) {
      signMismatches++;
    }
    // Rating diff FC should always be positive
    if (row.ratingDiffFC < 0) {
      signMismatches++;
    }
  }

  if (signMismatches > 0) {
    console.log(`   ⚠️  WARNING: ${signMismatches} rows have sign convention violations`);
  } else {
    console.log('   ✅ Sign conventions look consistent');
  }

  console.log('');

  // ========================================================================
  // 3. CORRELATION ANALYSIS
  // ========================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('3️⃣  CORRELATION ANALYSIS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Helper function for Pearson correlation
  function correlation(xs: number[], ys: number[]): number {
    const n = xs.length;
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((sum, x, i) => sum + x * ys[i], 0);
    const sumX2 = xs.reduce((sum, x) => sum + x * x, 0);
    const sumY2 = ys.reduce((sum, y) => sum + y * y, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return numerator / denominator;
  }

  // Helper function for simple OLS
  function ols(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
    const n = xs.length;
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((sum, x, i) => sum + x * ys[i], 0);
    const sumX2 = xs.reduce((sum, x) => sum + x * x, 0);

    const meanX = sumX / n;
    const meanY = sumY / n;

    const slope = (sumXY - n * meanX * meanY) / (sumX2 - n * meanX * meanX);
    const intercept = meanY - slope * meanX;

    // R²
    const yPred = xs.map(x => slope * x + intercept);
    const ssTot = ys.reduce((sum, y) => sum + Math.pow(y - meanY, 2), 0);
    const ssRes = ys.reduce((sum, y, i) => sum + Math.pow(y - yPred[i], 2), 0);
    const r2 = 1 - ssRes / ssTot;

    return { slope, intercept, r2 };
  }

  // Overall analysis (using abs of market spread FC as target, and rating diff FC as feature)
  // Note: We want to predict the magnitude of the spread, so use abs(marketSpreadFC)
  const allX = auditRows.map(r => r.ratingDiffFC);
  const allY = auditRows.map(r => Math.abs(r.marketSpreadFC));

  const overallCorr = correlation(allX, allY);
  const overallOLS = ols(allX, allY);

  console.log('   Overall (all games):');
  console.log(`   • Pearson r: ${overallCorr.toFixed(4)}`);
  console.log(`   • OLS: spread_magnitude = ${overallOLS.intercept.toFixed(2)} + ${overallOLS.slope.toFixed(4)} × rating_diff`);
  console.log(`   • R²: ${(overallOLS.r2 * 100).toFixed(2)}%`);
  console.log('');

  if (overallCorr < 0.1) {
    console.log('   ⚠️  WARNING: Correlation is extremely weak (< 0.1)');
  } else if (overallCorr < 0.3) {
    console.log('   ⚠️  Correlation is weak (0.1-0.3)');
  } else if (overallCorr < 0.5) {
    console.log('   ✅ Correlation is moderate (0.3-0.5)');
  } else {
    console.log('   ✅ Correlation is strong (> 0.5)');
  }

  if (overallOLS.slope < 1.0) {
    console.log(`   ⚠️  WARNING: OLS slope is very weak (${overallOLS.slope.toFixed(4)} < 1.0)`);
    console.log('   → Rating differences are not translating well to spread magnitude');
  } else if (overallOLS.slope < 3.0) {
    console.log(`   ⚠️  OLS slope is weak (${overallOLS.slope.toFixed(4)} < 3.0)`);
  } else {
    console.log(`   ✅ OLS slope is reasonable (${overallOLS.slope.toFixed(4)} >= 3.0)`);
  }

  console.log('');

  // By matchup class (if we have that data - for now skip since we don't have it populated)
  // TODO: Add matchup class segmentation

  // ========================================================================
  // 4. HFA DOUBLE-COUNT CHECK
  // ========================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('4️⃣  HFA DOUBLE-COUNT CHECK');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // To check for HFA double-count, we need to see if V2 ratings already have HFA baked in
  // V2 ratings are shrunk, SoS-adjusted, but should NOT include HFA in the powerRating itself
  // HFA is added during matchup calculation, not in the rating

  // Compare home vs away win rates when rating differences are similar
  const homeWins = auditRows.filter(r => {
    // "Home wins" = market spread is negative (home is favored)
    // and rating diff HMA is small (< 2 pts difference)
    return Math.abs(r.ratingDiffHMA) < 2 && r.marketSpreadHMA < 0;
  }).length;

  const awayWins = auditRows.filter(r => {
    return Math.abs(r.ratingDiffHMA) < 2 && r.marketSpreadHMA > 0;
  }).length;

  const evenGames = auditRows.filter(r => Math.abs(r.ratingDiffHMA) < 2).length;

  console.log(`   Even matchups (|rating_diff| < 2 pts): ${evenGames} games`);
  console.log(`   • Home favored: ${homeWins} (${(homeWins / evenGames * 100).toFixed(1)}%)`);
  console.log(`   • Away favored: ${awayWins} (${(awayWins / evenGames * 100).toFixed(1)}%)`);
  console.log('');

  if (homeWins / evenGames > 0.65) {
    console.log('   ✅ Market shows strong home advantage in even matchups');
    console.log('   → This suggests HFA is NOT already baked into V2 ratings');
    console.log('   → We should include an explicit HFA feature in calibration');
  } else if (homeWins / evenGames < 0.35) {
    console.log('   ⚠️  Market shows away advantage in even matchups (unusual)');
  } else {
    console.log('   ⚠️  Home/away split is roughly even in even matchups');
    console.log('   → This could indicate HFA is already baked into V2 ratings');
    console.log('   → Or the V2 ratings are not distinguishing home/away well');
  }

  console.log('');

  // ========================================================================
  // 5. VISUAL GUT-CHECK
  // ========================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('5️⃣  VISUAL GUT-CHECK');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Export scatter data to CSV for external plotting
  const scatterPath = `reports/calibration_scatter_${season}_wk${weeks[0]}-${weeks[weeks.length - 1]}.csv`;
  const scatterCSV = [
    'rating_diff_fc,market_spread_magnitude,home_team,away_team',
    ...auditRows.map(r =>
      `${r.ratingDiffFC.toFixed(4)},${Math.abs(r.marketSpreadFC).toFixed(4)},${r.homeTeam},${r.awayTeam}`
    )
  ].join('\n');

  fs.writeFileSync(scatterPath, scatterCSV);
  console.log(`   ✅ Scatter data exported to: ${scatterPath}`);
  console.log(`   → Use Excel/Python/R to plot rating_diff_fc vs market_spread_magnitude`);
  console.log(`   → Expected: positive linear relationship with slope ~3-5`);
  console.log('');

  // ========================================================================
  // 6. DIAGNOSIS & FIX PLAN
  // ========================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('6️⃣  DIAGNOSIS & FIX PLAN');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Diagnose based on findings
  const issues: string[] = [];

  if (fallbackCount > auditRows.length * 0.1) {
    issues.push('Too many rows using fallback (not pre-kick consensus)');
  }

  if (signMismatches > 0) {
    issues.push('Sign convention violations detected');
  }

  if (overallCorr < 0.1) {
    issues.push('Extremely weak correlation between rating_diff and market spread');
  }

  if (overallOLS.slope < 1.0) {
    issues.push(`Very weak OLS slope (${overallOLS.slope.toFixed(4)} < 1.0)`);
  }

  if (issues.length === 0) {
    console.log('   ✅ No major issues detected in audit');
    console.log('   → Data looks reasonable for calibration');
    console.log('   → Low R² in ridge model might be due to:');
    console.log('      • Over-regularization (λ too high)');
    console.log('      • Missing features');
    console.log('      • V2 ratings needing more tuning');
    console.log('');
    console.log('   Recommended next steps:');
    console.log('   1. Try Elastic Net with lower λ');
    console.log('   2. Tune V2 parameters (SoS %, shrinkage %)');
    console.log('   3. Add more predictive features');
  } else {
    console.log('   ⚠️  ISSUES DETECTED:');
    issues.forEach((issue, i) => {
      console.log(`   ${i + 1}. ${issue}`);
    });
    console.log('');
    console.log('   Recommended fixes:');

    if (overallCorr < 0.1 || overallOLS.slope < 1.0) {
      console.log('   • Check if V2 ratings are correctly scaled (calibration_factor=8.0 applied?)');
      console.log('   • Verify rating_diff calculation matches target sign convention');
      console.log('   • Consider reducing shrinkage in V2 (currently 40-60%)');
      console.log('   • Check if SoS adjustments are working as intended');
    }

    if (signMismatches > 0) {
      console.log('   • Fix sign convention in data preparation');
      console.log('   • Ensure favorite-centric convention is consistently applied');
    }

    if (fallbackCount > auditRows.length * 0.1) {
      console.log('   • Ingest more pre-kick market lines');
      console.log('   • Or adjust pre-kick window (currently T-60 to T+5)');
    }
  }

  console.log('');
  console.log('======================================================================');
  console.log('📊 AUDIT COMPLETE');
  console.log('======================================================================\n');

  await prisma.$disconnect();
}

main().catch(console.error);

