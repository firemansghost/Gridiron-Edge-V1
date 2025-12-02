/**
 * Simulate Strategy Portfolios
 * 
 * Simulates different betting portfolio strategies using existing graded bets
 * to understand what we'd want to run in 2026.
 * 
 * Portfolios:
 * - A: Hybrid Only (baseline)
 * - B: Hybrid + Fade V4 (Non-overlap - Fade V4 only fills gaps)
 * - C: Hybrid + Fade V4 (All Bets - include everything)
 * 
 * Usage:
 *   npx tsx apps/web/scripts/simulate-strategy-portfolios.ts --season 2024
 *   npx tsx apps/web/scripts/simulate-strategy-portfolios.ts --season 2025
 */

import { prisma } from '../lib/prisma';

interface BetRecord {
  id: string;
  season: number;
  week: number;
  gameId: string;
  strategyTag: string;
  side: 'home' | 'away';
  stake: number;
  result: 'win' | 'loss' | 'push';
  pnl: number | null;
}

interface PortfolioStats {
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  totalStake: number;
  totalPnL: number;
  roi: number;
  hybridContributionPnL: number;
  fadeContributionPnL: number;
}

function parseArgs(): { season: number } {
  const args = process.argv.slice(2);
  let season: number | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && i + 1 < args.length) {
      season = parseInt(args[i + 1], 10);
      break;
    }
  }

  if (!season || isNaN(season)) {
    console.error('Usage: npx tsx apps/web/scripts/simulate-strategy-portfolios.ts --season <YEAR>');
    console.error('Example: npx tsx apps/web/scripts/simulate-strategy-portfolios.ts --season 2025');
    process.exit(1);
  }

  return { season };
}

function calculatePortfolioStats(bets: BetRecord[]): PortfolioStats {
  const wins = bets.filter(b => b.result === 'win').length;
  const losses = bets.filter(b => b.result === 'loss').length;
  const pushes = bets.filter(b => b.result === 'push').length;
  const totalStake = bets.reduce((sum, b) => sum + Number(b.stake), 0);
  const totalPnL = bets.reduce((sum, b) => sum + Number(b.pnl || 0), 0);
  const roi = totalStake > 0 ? (totalPnL / totalStake) * 100 : 0;
  const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;

  // Calculate contribution from each strategy
  const hybridBets = bets.filter(b => b.strategyTag === 'hybrid_v2');
  const fadeBets = bets.filter(b => b.strategyTag === 'fade_v4_labs');
  
  const hybridContributionPnL = hybridBets.reduce((sum, b) => sum + Number(b.pnl || 0), 0);
  const fadeContributionPnL = fadeBets.reduce((sum, b) => sum + Number(b.pnl || 0), 0);

  return {
    bets: bets.length,
    wins,
    losses,
    pushes,
    winRate,
    totalStake,
    totalPnL,
    roi,
    hybridContributionPnL,
    fadeContributionPnL,
  };
}

function formatPortfolioStats(stats: PortfolioStats, portfolioName: string): void {
  const record = `${stats.wins}W-${stats.losses}L${stats.pushes > 0 ? `-${stats.pushes}P` : ''}`;
  
  console.log(`\n[${portfolioName}]`);
  console.log(`  Bets: ${stats.bets}`);
  console.log(`  Record: ${record}`);
  console.log(`  Win rate: ${stats.winRate.toFixed(1)}%`);
  console.log(`  Stake: $${stats.totalStake.toFixed(2)}`);
  console.log(`  PnL: $${stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL.toFixed(2)}`);
  console.log(`  ROI: ${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(2)}%`);
  
  if (stats.hybridContributionPnL !== 0 || stats.fadeContributionPnL !== 0) {
    console.log(`  PnL from Hybrid: $${stats.hybridContributionPnL >= 0 ? '+' : ''}${stats.hybridContributionPnL.toFixed(2)}`);
    console.log(`  PnL from Fade V4: $${stats.fadeContributionPnL >= 0 ? '+' : ''}${stats.fadeContributionPnL.toFixed(2)}`);
  }
}

async function simulatePortfolios(season: number): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Season ${season}`);
  console.log('='.repeat(60));

  // Fetch all graded bets for Hybrid and Fade V4
  const betsRaw = await prisma.bet.findMany({
    where: {
      season,
      strategyTag: { in: ['hybrid_v2', 'fade_v4_labs'] },
      marketType: 'spread',
      result: { in: ['win', 'loss', 'push'] },
    },
    select: {
      id: true,
      season: true,
      week: true,
      gameId: true,
      strategyTag: true,
      side: true,
      stake: true,
      result: true,
      pnl: true,
    },
    orderBy: [
      { week: 'asc' },
      { gameId: 'asc' },
    ],
  });

  // Convert to BetRecord
  const bets: BetRecord[] = betsRaw.map(bet => ({
    id: bet.id,
    season: bet.season,
    week: bet.week,
    gameId: bet.gameId,
    strategyTag: bet.strategyTag,
    side: bet.side as 'home' | 'away',
    stake: Number(bet.stake),
    result: bet.result as 'win' | 'loss' | 'push',
    pnl: bet.pnl ? Number(bet.pnl) : null,
  }));

  console.log(`\nFound ${bets.length} graded bets (Hybrid + Fade V4)`);

  // Separate bets by strategy
  const hybridBets = bets.filter(b => b.strategyTag === 'hybrid_v2');
  const fadeBets = bets.filter(b => b.strategyTag === 'fade_v4_labs');

  console.log(`  Hybrid bets: ${hybridBets.length}`);
  console.log(`  Fade V4 bets: ${fadeBets.length}`);

  // Build game set for overlap detection
  const hybridGameIds = new Set(hybridBets.map(b => b.gameId));
  const fadeGameIds = new Set(fadeBets.map(b => b.gameId));

  // Portfolio A: Hybrid Only
  const portfolioA = hybridBets;
  const statsA = calculatePortfolioStats(portfolioA);
  formatPortfolioStats(statsA, 'Portfolio A – Hybrid Only');

  // Portfolio B: Hybrid + Fade V4 (Non-overlap)
  // Include all Hybrid bets + Fade V4 bets only on games where Hybrid has no bet
  const fadeNonOverlap = fadeBets.filter(b => !hybridGameIds.has(b.gameId));
  const portfolioB = [...hybridBets, ...fadeNonOverlap];
  const statsB = calculatePortfolioStats(portfolioB);
  formatPortfolioStats(statsB, 'Portfolio B – Hybrid + Fade V4 (Non-overlap)');

  // Portfolio C: Hybrid + Fade V4 (All Bets)
  // Include all bets from both strategies, even if they overlap
  const portfolioC = [...hybridBets, ...fadeBets];
  const statsC = calculatePortfolioStats(portfolioC);
  formatPortfolioStats(statsC, 'Portfolio C – Hybrid + Fade V4 (All Bets)');

  // Summary comparison
  console.log('\n' + '='.repeat(60));
  console.log('Portfolio Comparison');
  console.log('='.repeat(60));
  console.log(`Portfolio A (Hybrid Only):      ${statsA.bets} bets, ${statsA.roi >= 0 ? '+' : ''}${statsA.roi.toFixed(2)}% ROI, $${statsA.totalPnL >= 0 ? '+' : ''}${statsA.totalPnL.toFixed(2)} PnL`);
  console.log(`Portfolio B (Non-overlap):      ${statsB.bets} bets, ${statsB.roi >= 0 ? '+' : ''}${statsB.roi.toFixed(2)}% ROI, $${statsB.totalPnL >= 0 ? '+' : ''}${statsB.totalPnL.toFixed(2)} PnL`);
  console.log(`Portfolio C (All Bets):         ${statsC.bets} bets, ${statsC.roi >= 0 ? '+' : ''}${statsC.roi.toFixed(2)}% ROI, $${statsC.totalPnL >= 0 ? '+' : ''}${statsC.totalPnL.toFixed(2)} PnL`);
  
  const improvementB = statsB.totalPnL - statsA.totalPnL;
  const improvementC = statsC.totalPnL - statsA.totalPnL;
  
  if (statsA.totalStake > 0) {
    const roiImpactB = (improvementB / statsA.totalStake) * 100;
    const roiImpactC = (improvementC / statsA.totalStake) * 100;
    console.log(`\nPortfolio B vs A: ${improvementB >= 0 ? '+' : ''}$${improvementB.toFixed(2)} additional PnL (${roiImpactB >= 0 ? '+' : ''}${roiImpactB.toFixed(2)}% ROI impact)`);
    console.log(`Portfolio C vs A: ${improvementC >= 0 ? '+' : ''}$${improvementC.toFixed(2)} additional PnL (${roiImpactC >= 0 ? '+' : ''}${roiImpactC.toFixed(2)}% ROI impact)`);
  } else {
    console.log(`\nPortfolio B vs A: ${improvementB >= 0 ? '+' : ''}$${improvementB.toFixed(2)} additional PnL`);
    console.log(`Portfolio C vs A: ${improvementC >= 0 ? '+' : ''}$${improvementC.toFixed(2)} additional PnL`);
  }
  
  if (fadeNonOverlap.length > 0) {
    console.log(`\nPortfolio B adds ${fadeNonOverlap.length} Fade V4 bets on games where Hybrid has no bet.`);
  }
  
  const overlapCount = fadeBets.filter(b => hybridGameIds.has(b.gameId)).length;
  if (overlapCount > 0) {
    console.log(`Portfolio C includes ${overlapCount} additional Fade V4 bets that overlap with Hybrid bets.`);
  }
}

async function main() {
  try {
    const { season } = parseArgs();
    await simulatePortfolios(season);
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

