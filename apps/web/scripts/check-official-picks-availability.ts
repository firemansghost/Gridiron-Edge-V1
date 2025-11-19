/**
 * Check if official picks can be generated for weeks 1-8
 * 
 * Checks for:
 * - Games with scores
 * - Matchup outputs (model predictions)
 * - Market lines (for closing prices)
 * 
 * Usage:
 *   npx tsx apps/web/scripts/check-official-picks-availability.ts 2025 1 4
 */

import { prisma } from '../lib/prisma';

async function checkWeek(season: number, week: number) {
  console.log(`\n📊 Week ${week} - Checking data availability...`);

  // Check games with scores
  const gamesWithScores = await prisma.game.count({
    where: {
      season,
      week,
      homeScore: { not: null },
      awayScore: { not: null },
    },
  });

  console.log(`  Games with scores: ${gamesWithScores}`);

  // Check games with matchup outputs
  const gamesWithOutputs = await prisma.game.findMany({
    where: {
      season,
      week,
    },
    include: {
      matchupOutputs: {
        where: {
          modelVersion: 'v0.0.1',
        },
      },
    },
  });

  const gamesWithModel = gamesWithOutputs.filter(g => g.matchupOutputs.length > 0);
  console.log(`  Games with matchup outputs: ${gamesWithModel.length}`);

  // Check games with market lines (spread)
  const gamesWithSpreadLines = await prisma.game.findMany({
    where: {
      season,
      week,
    },
    include: {
      marketLines: {
        where: {
          lineType: 'spread',
        },
        take: 1,
      },
    },
  });

  const gamesWithSpread = gamesWithSpreadLines.filter(g => g.marketLines.length > 0);
  console.log(`  Games with spread lines: ${gamesWithSpread.length}`);

  // Check games with market lines (total)
  const gamesWithTotalLines = await prisma.game.findMany({
    where: {
      season,
      week,
    },
    include: {
      marketLines: {
        where: {
          lineType: 'total',
        },
        take: 1,
      },
    },
  });

  const gamesWithTotal = gamesWithTotalLines.filter(g => g.marketLines.length > 0);
  console.log(`  Games with total lines: ${gamesWithTotal.length}`);

  // Estimate how many picks we could generate
  // Need: game with scores + matchup output + market line (spread or total)
  // Check each game individually for market lines
  const gamesWithAllData: typeof gamesWithOutputs = [];
  for (const game of gamesWithOutputs) {
    const hasModel = game.matchupOutputs.length > 0;
    const hasScores = game.homeScore !== null && game.awayScore !== null;
    
    // Check for market lines separately
    const spreadLines = await prisma.marketLine.findFirst({
      where: { gameId: game.id, lineType: 'spread' },
    });
    const totalLines = await prisma.marketLine.findFirst({
      where: { gameId: game.id, lineType: 'total' },
    });
    
    const hasSpread = spreadLines !== null;
    const hasTotal = totalLines !== null;
    
    if (hasModel && (hasSpread || hasTotal) && hasScores) {
      gamesWithAllData.push(game);
    }
  }

  console.log(`  Games with all data (scores + model + lines): ${gamesWithAllData.length}`);

  // Check if official_flat_100 bets already exist
  const existingBets = await prisma.bet.count({
    where: {
      season,
      week,
      strategyTag: 'official_flat_100',
      source: 'strategy_run',
    },
  });

  console.log(`  Existing official_flat_100 bets: ${existingBets}`);

  return {
    week,
    gamesWithScores,
    gamesWithModel: gamesWithModel.length,
    gamesWithSpread: gamesWithSpread.length,
    gamesWithTotal: gamesWithTotal.length,
    gamesWithAllData: gamesWithAllData.length,
    existingBets,
    canGenerate: gamesWithAllData.length > 0,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const season = parseInt(args[0]) || 2025;
  const startWeek = parseInt(args[1]) || 1;
  const endWeek = parseInt(args[2]) || startWeek;

  console.log(`\n🔍 Checking official picks availability for ${season} Weeks ${startWeek}-${endWeek}\n`);

  const results = [];
  for (let week = startWeek; week <= endWeek; week++) {
    const result = await checkWeek(season, week);
    results.push(result);
  }

  console.log(`\n📋 Summary:`);
  console.log(`Week | Scores | Model | Spread | Total | All Data | Existing | Can Generate`);
  console.log(`-----|--------|-------|--------|-------|----------|----------|--------------`);
  for (const r of results) {
    const canGen = r.canGenerate ? '✅' : '❌';
    console.log(`${r.week.toString().padStart(4)} | ${r.gamesWithScores.toString().padStart(6)} | ${r.gamesWithModel.toString().padStart(5)} | ${r.gamesWithSpread.toString().padStart(6)} | ${r.gamesWithTotal.toString().padStart(5)} | ${r.gamesWithAllData.toString().padStart(9)} | ${r.existingBets.toString().padStart(8)} | ${canGen}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);




