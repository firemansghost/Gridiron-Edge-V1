/**
 * Backtest Framework
 * Tests model predictions against historical results
 */

import { prisma } from '../apps/web/lib/prisma';

const HFA = 2.0;

interface BacktestResult {
  gameId: string;
  date: Date;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  actualMargin: number; // homeScore - awayScore
  modelSpread: number | null;
  marketSpread: number | null;
  modelError: number | null; // |modelSpread - actualMargin|
  marketError: number | null; // |marketSpread - actualMargin|
  atsWinner: 'home' | 'away' | 'push' | null;
  modelPick: 'home' | 'away' | null;
  marketPick: 'home' | 'away' | null;
  modelCorrect: boolean | null;
  marketCorrect: boolean | null;
  edge: number | null; // |modelSpread - marketSpread|
}

async function backtest(season: number, weeks: number[]) {
  console.log(`\n📊 BACKTESTING ${season} Weeks ${weeks.join(', ')}\n`);

  const results: BacktestResult[] = [];

  for (const week of weeks) {
    console.log(`\n📅 Processing Week ${week}...`);

    // Get all final games for this week
    const games = await prisma.game.findMany({
      where: {
        season,
        week,
        status: 'final',
        homeScore: { not: null },
        awayScore: { not: null }
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        marketLines: {
          where: { lineType: 'spread' },
          orderBy: { timestamp: 'desc' },
          take: 1
        }
      }
    });

    console.log(`   Found ${games.length} completed games`);

    // Get ratings for all teams in these games
    const teamIds = [...new Set(games.flatMap(g => [g.homeTeamId, g.awayTeamId]))];
    const ratings = await prisma.teamSeasonRating.findMany({
      where: {
        season,
        modelVersion: 'v1',
        teamId: { in: teamIds }
      }
    });

    const ratingsMap = new Map(ratings.map(r => [r.teamId, r]));

    // Process each game
    for (const game of games) {
      const homeRating = ratingsMap.get(game.homeTeamId);
      const awayRating = ratingsMap.get(game.awayTeamId);
      const marketLine = game.marketLines[0];

      if (!homeRating || !awayRating || !marketLine) {
        continue; // Skip if missing data
      }

      const homePower = Number(homeRating.powerRating || homeRating.rating || 0);
      const awayPower = Number(awayRating.powerRating || awayRating.rating || 0);
      const modelSpread = homePower - awayPower + (game.neutralSite ? 0 : HFA);
      const marketSpread = Number(marketLine.lineValue);

      const actualMargin = game.homeScore! - game.awayScore!;
      const modelError = Math.abs(modelSpread - actualMargin);
      const marketError = Math.abs(marketSpread - actualMargin);
      const edge = Math.abs(modelSpread - marketSpread);

      // Determine ATS winner
      let atsWinner: 'home' | 'away' | 'push' = 'push';
      if (actualMargin + marketSpread > 0.5) {
        atsWinner = 'home'; // Home covered
      } else if (actualMargin + marketSpread < -0.5) {
        atsWinner = 'away'; // Away covered
      }

      // Model pick: which side does the model favor?
      const modelPick: 'home' | 'away' = modelSpread < 0 ? 'home' : 'away';
      const marketPick: 'home' | 'away' = marketSpread < 0 ? 'home' : 'away';

      // Did the model pick correctly?
      const modelCorrect = (modelPick === 'home' && atsWinner === 'home') || 
                           (modelPick === 'away' && atsWinner === 'away');
      const marketCorrect = (marketPick === 'home' && atsWinner === 'home') ||
                            (marketPick === 'away' && atsWinner === 'away');

      results.push({
        gameId: game.id,
        date: game.date,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name,
        homeScore: game.homeScore!,
        awayScore: game.awayScore!,
        actualMargin,
        modelSpread,
        marketSpread,
        modelError,
        marketError,
        edge,
        atsWinner,
        modelPick,
        marketPick,
        modelCorrect,
        marketCorrect
      });
    }
  }

  console.log(`\n✅ Processed ${results.length} games\n`);

  // Calculate metrics
  const totalGames = results.length;
  const modelCorrectCount = results.filter(r => r.modelCorrect).length;
  const marketCorrectCount = results.filter(r => r.marketCorrect).length;
  const modelWinRate = (modelCorrectCount / totalGames) * 100;
  const marketWinRate = (marketCorrectCount / totalGames) * 100;

  const avgModelError = results.reduce((sum, r) => sum + (r.modelError || 0), 0) / totalGames;
  const avgMarketError = results.reduce((sum, r) => sum + (r.marketError || 0), 0) / totalGames;
  const avgEdge = results.reduce((sum, r) => sum + (r.edge || 0), 0) / totalGames;

  // Calculate ROI (assuming -110 odds, need 52.4% to break even)
  const modelROI = ((modelWinRate - 52.4) / 52.4) * 100;
  const marketROI = ((marketWinRate - 52.4) / 52.4) * 100;

  console.log(`${'='.repeat(70)}`);
  console.log(`📈 BACKTEST RESULTS`);
  console.log(`${'='.repeat(70)}\n`);

  console.log(`📊 OVERALL METRICS:`);
  console.log(`   Total Games: ${totalGames}`);
  console.log(`   Average Edge: ${avgEdge.toFixed(2)} points\n`);

  console.log(`🤖 MODEL PERFORMANCE:`);
  console.log(`   Win Rate: ${modelWinRate.toFixed(1)}% (${modelCorrectCount}/${totalGames})`);
  console.log(`   ROI (vs. -110 odds): ${modelROI >= 0 ? '+' : ''}${modelROI.toFixed(1)}%`);
  console.log(`   Average Error: ${avgModelError.toFixed(2)} points`);
  console.log(`   Profitable: ${modelWinRate >= 52.4 ? '✅ YES' : '❌ NO'}\n`);

  console.log(`📊 MARKET PERFORMANCE (baseline):`);
  console.log(`   Win Rate: ${marketWinRate.toFixed(1)}% (${marketCorrectCount}/${totalGames})`);
  console.log(`   ROI (vs. -110 odds): ${marketROI >= 0 ? '+' : ''}${marketROI.toFixed(1)}%`);
  console.log(`   Average Error: ${avgMarketError.toFixed(2)} points\n`);

  console.log(`📉 MODEL vs MARKET:`);
  console.log(`   Win Rate Difference: ${(modelWinRate - marketWinRate >= 0 ? '+' : '')}${(modelWinRate - marketWinRate).toFixed(1)}%`);
  console.log(`   Error Difference: ${(avgModelError - avgMarketError >= 0 ? '+' : '')}${(avgModelError - avgMarketError).toFixed(2)} points`);
  console.log(`   Model is ${modelWinRate > marketWinRate ? 'BETTER' : 'WORSE'} than market\n`);

  // Breakdown by edge buckets
  const edgeBuckets = {
    '0-3': results.filter(r => r.edge! >= 0 && r.edge! < 3),
    '3-6': results.filter(r => r.edge! >= 3 && r.edge! < 6),
    '6-10': results.filter(r => r.edge! >= 6 && r.edge! < 10),
    '10+': results.filter(r => r.edge! >= 10)
  };

  console.log(`📊 PERFORMANCE BY EDGE:`);
  Object.entries(edgeBuckets).forEach(([bucket, games]) => {
    if (games.length > 0) {
      const winRate = (games.filter(g => g.modelCorrect).length / games.length) * 100;
      const roi = ((winRate - 52.4) / 52.4) * 100;
      console.log(`   ${bucket} pts (n=${games.length}): ${winRate.toFixed(1)}% win rate, ${roi >= 0 ? '+' : ''}${roi.toFixed(1)}% ROI`);
    }
  });

  console.log(`\n${'='.repeat(70)}\n`);

  // Show worst predictions
  const worstPredictions = results
    .sort((a, b) => (b.modelError || 0) - (a.modelError || 0))
    .slice(0, 5);

  console.log(`❌ WORST 5 PREDICTIONS:\n`);
  worstPredictions.forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.awayTeam} @ ${r.homeTeam}`);
    console.log(`      Actual: ${r.awayTeam} ${r.awayScore}, ${r.homeTeam} ${r.homeScore} (margin: ${r.actualMargin >= 0 ? '+' : ''}${r.actualMargin})`);
    console.log(`      Model Spread: ${r.modelSpread?.toFixed(1)} | Market: ${r.marketSpread?.toFixed(1)}`);
    console.log(`      Model Error: ${r.modelError?.toFixed(1)} points\n`);
  });

  await prisma.$disconnect();
}

// Run backtest
const season = parseInt(process.argv[2] || '2024', 10);
const weekStr = process.argv[3] || '1-14';
const weeks = weekStr.includes('-')
  ? Array.from(
      { length: parseInt(weekStr.split('-')[1]) - parseInt(weekStr.split('-')[0]) + 1 },
      (_, i) => parseInt(weekStr.split('-')[0]) + i
    )
  : [parseInt(weekStr)];

backtest(season, weeks).catch(console.error);

