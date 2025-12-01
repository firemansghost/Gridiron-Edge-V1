/**
 * Generate V4 Overlay Performance Report
 * 
 * Generates a comprehensive performance report for overlay strategies across seasons
 */

import { prisma } from '../lib/prisma';

interface StrategyStats {
  strategy: string;
  totalBets: number;
  gradedBets: number;
  wins: number;
  losses: number;
  pushes: number;
  totalStake: number;
  totalPnl: number;
  roi: number;
  tierABets: number;
  tierAWins: number;
  tierALosses: number;
  tierAPushes: number;
  tierAStake: number;
  tierAPnl: number;
  tierARoi: number;
  avgClv?: number;
  tierAAvgClv?: number;
}

async function calculateStrategyStats(
  season: number,
  strategyTag: string
): Promise<StrategyStats> {
  // Get all graded bets for this strategy
  const gradedBets = await prisma.bet.findMany({
    where: {
      season,
      strategyTag,
      marketType: 'spread',
      result: { in: ['win', 'loss', 'push'] },
    },
    select: {
      modelPrice: true,
      closePrice: true,
      result: true,
      stake: true,
      pnl: true,
    },
  });

  const wins = gradedBets.filter(b => b.result === 'win').length;
  const losses = gradedBets.filter(b => b.result === 'loss').length;
  const pushes = gradedBets.filter(b => b.result === 'push').length;
  const totalStake = gradedBets.reduce((sum, b) => sum + Number(b.stake), 0);
  const totalPnl = gradedBets.reduce((sum, b) => sum + Number(b.pnl || 0), 0);
  const roi = totalStake > 0 ? (totalPnl / totalStake) * 100 : 0;

  // Calculate CLV (Closing Line Value) - difference between model price and closing price
  const betsWithClv = gradedBets.filter(b => b.closePrice !== null);
  const avgClv = betsWithClv.length > 0
    ? betsWithClv.reduce((sum, b) => {
        const clv = Number(b.modelPrice) - Number(b.closePrice!);
        return sum + clv;
      }, 0) / betsWithClv.length
    : undefined;

  // Calculate Tier A stats (edge >= 3.0 points)
  const tierABets = gradedBets.filter(bet => {
    if (!bet.closePrice) return false;
    const edge = Math.abs(Number(bet.modelPrice) - Number(bet.closePrice));
    return edge >= 3.0;
  });

  const tierAWins = tierABets.filter(b => b.result === 'win').length;
  const tierALosses = tierABets.filter(b => b.result === 'loss').length;
  const tierAPushes = tierABets.filter(b => b.result === 'push').length;
  const tierAStake = tierABets.reduce((sum, b) => sum + Number(b.stake), 0);
  const tierAPnl = tierABets.reduce((sum, b) => sum + Number(b.pnl || 0), 0);
  const tierARoi = tierAStake > 0 ? (tierAPnl / tierAStake) * 100 : 0;

  const tierABetsWithClv = tierABets.filter(b => b.closePrice !== null);
  const tierAAvgClv = tierABetsWithClv.length > 0
    ? tierABetsWithClv.reduce((sum, b) => {
        const clv = Number(b.modelPrice) - Number(b.closePrice!);
        return sum + clv;
      }, 0) / tierABetsWithClv.length
    : undefined;

  // Get total bet count (including ungraded)
  const totalBets = await prisma.bet.count({
    where: {
      season,
      strategyTag,
      marketType: 'spread',
    },
  });

  return {
    strategy: strategyTag,
    totalBets,
    gradedBets: gradedBets.length,
    wins,
    losses,
    pushes,
    totalStake,
    totalPnl,
    roi,
    tierABets: tierABets.length,
    tierAWins,
    tierALosses,
    tierAPushes,
    tierAStake,
    tierAPnl,
    tierARoi,
    avgClv,
    tierAAvgClv,
  };
}

async function generateReport(seasons: number[]) {
  console.log('# V4 Overlay Strategy Performance Report\n');
  console.log(`Generated: ${new Date().toISOString()}\n`);

  for (const season of seasons) {
    console.log(`## ${season} Season\n`);

    const strategies = ['hybrid_v2', 'v4_labs', 'hybrid_v4_agree', 'fade_v4_labs'];
    const allStats: StrategyStats[] = [];

    for (const strategy of strategies) {
      const stats = await calculateStrategyStats(season, strategy);
      allStats.push(stats);
    }

    // All Tiers Table
    console.log('### All Tiers\n');
    console.log('| Strategy | Bets | Record | Win Rate | Stake | PnL | ROI | Avg CLV |');
    console.log('|----------|------|--------|----------|-------|-----|-----|----------|');
    for (const stats of allStats) {
      const winRate = stats.gradedBets > 0
        ? ((stats.wins / (stats.gradedBets - stats.pushes)) * 100).toFixed(1)
        : '0.0';
      const record = `${stats.wins}W-${stats.losses}L${stats.pushes > 0 ? `-${stats.pushes}P` : ''}`;
      const clv = stats.avgClv !== undefined ? stats.avgClv.toFixed(2) : 'N/A';
      console.log(
        `| ${stats.strategy} | ${stats.gradedBets} | ${record} | ${winRate}% | $${stats.totalStake.toFixed(2)} | $${stats.totalPnl.toFixed(2)} | ${stats.roi.toFixed(2)}% | ${clv} |`
      );
    }

    console.log('\n');

    // Tier A Only Table
    console.log('### Tier A Only (Edge ≥ 3.0 pts)\n');
    console.log('| Strategy | Bets | Record | Win Rate | Stake | PnL | ROI | Avg CLV |');
    console.log('|----------|------|--------|----------|-------|-----|-----|----------|');
    for (const stats of allStats) {
      const winRate = stats.tierABets > 0
        ? ((stats.tierAWins / (stats.tierABets - stats.tierAPushes)) * 100).toFixed(1)
        : '0.0';
      const record = `${stats.tierAWins}W-${stats.tierALosses}L${stats.tierAPushes > 0 ? `-${stats.tierAPushes}P` : ''}`;
      const clv = stats.tierAAvgClv !== undefined ? stats.tierAAvgClv.toFixed(2) : 'N/A';
      console.log(
        `| ${stats.strategy} | ${stats.tierABets} | ${record} | ${winRate}% | $${stats.tierAStake.toFixed(2)} | $${stats.tierAPnl.toFixed(2)} | ${stats.tierARoi.toFixed(2)}% | ${clv} |`
      );
    }

    console.log('\n');
  }

  // Summary observations
  console.log('## Key Observations\n');
  console.log('### Patterns Across Seasons:\n');
  
  // Analyze patterns
  for (const season of seasons) {
    const fadeStats = await calculateStrategyStats(season, 'fade_v4_labs');
    const hybridStats = await calculateStrategyStats(season, 'hybrid_v2');
    const agreeStats = await calculateStrategyStats(season, 'hybrid_v4_agree');
    const v4Stats = await calculateStrategyStats(season, 'v4_labs');

    console.log(`**${season}:**`);
    console.log(`- Fade V4 Labs: ${fadeStats.roi >= 0 ? '✅ Profitable' : '❌ Unprofitable'} (${fadeStats.roi.toFixed(2)}% ROI)`);
    console.log(`- Hybrid V2: ${hybridStats.roi >= 0 ? '✅ Strong' : '❌ Weak'} (${hybridStats.roi.toFixed(2)}% ROI)`);
    console.log(`- Hybrid + V4 Agree: ${agreeStats.roi >= hybridStats.roi ? '✅ Better than Hybrid' : '❌ Weaker than Hybrid'} (${agreeStats.roi.toFixed(2)}% vs ${hybridStats.roi.toFixed(2)}%)`);
    console.log(`- V4 Labs standalone: ${v4Stats.roi >= 0 ? '✅ Profitable' : '❌ Unprofitable'} (${v4Stats.roi.toFixed(2)}% ROI)`);
    console.log('');
  }
}

async function main() {
  // Find eligible seasons (have V4 bets - Hybrid is optional for overlay analysis)
  const hybridSeasons = await prisma.bet.findMany({
    where: {
      strategyTag: 'hybrid_v2',
      source: 'strategy_run',
      marketType: 'spread',
    },
    select: { season: true },
    distinct: ['season'],
  });

  const v4Seasons = await prisma.bet.findMany({
    where: {
      strategyTag: 'v4_labs',
      source: 'strategy_run',
      marketType: 'spread',
    },
    select: { season: true },
    distinct: ['season'],
  });

  const hybridSeasonSet = new Set(hybridSeasons.map(b => b.season));
  const v4SeasonSet = new Set(v4Seasons.map(b => b.season));
  // Include seasons with V4 bets (Hybrid is optional - we can still analyze fade_v4_labs)
  const eligibleSeasons = Array.from(v4SeasonSet).sort();

  if (eligibleSeasons.length === 0) {
    console.log('No seasons found with both Hybrid and V4 bets.');
    await prisma.$disconnect();
    return;
  }

  await generateReport(eligibleSeasons);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});






