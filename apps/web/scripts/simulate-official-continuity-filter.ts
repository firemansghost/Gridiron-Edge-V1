/**
 * Simulate Official Card Continuity Filter
 * 
 * Wrapper script that calls the generalized continuity filter simulation
 * for the official_flat_100 strategy.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/simulate-official-continuity-filter.ts --season 2025
 */

import { simulateContinuityFilter } from './simulate-continuity-filter';
import { prisma } from '../lib/prisma';

interface PortfolioStats {
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  totalStake: number;
  totalPnL: number;
  roi: number;
}

function parseArgs(): { season: number } {
  const args = process.argv.slice(2);
  let season: number | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && i + 1 < args.length) {
      season = parseInt(args[i + 1], 10);
      i++;
    }
  }

  if (!season || isNaN(season)) {
    console.error('Usage: npx tsx apps/web/scripts/simulate-official-continuity-filter.ts --season <YEAR>');
    console.error('Example: npx tsx apps/web/scripts/simulate-official-continuity-filter.ts --season 2025');
    process.exit(1);
  }

  return { season };
}

function formatStats(stats: PortfolioStats, label: string): void {
  const record = `${stats.wins}W-${stats.losses}L${stats.pushes > 0 ? `-${stats.pushes}P` : ''}`;
  console.log(`\n${label}:`);
  console.log(`    Bets: ${stats.bets}`);
  console.log(`    Record: ${record}`);
  console.log(`    Win rate: ${stats.winRate.toFixed(1)}%`);
  console.log(`    ROI: ${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(2)}%`);
  console.log(`    PnL: $${stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL.toFixed(2)}`);
}

async function main() {
  const { season } = parseArgs();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Official Card Continuity Filter – Season ${season}`);
  console.log('='.repeat(60));

  const result = await simulateContinuityFilter(season, 'official_flat_100');

  // Print results
  formatStats(result.baseline, 'Baseline Official Card (all bets)');
  formatStats(result.removedSubset, 'Removed subset – Low-Continuity Dogs (spreads only)');
  formatStats(result.filtered, 'Filtered Official Card (dropping low-continuity dogs)');

  // Calculate delta
  const pnLImprovement = result.filtered.totalPnL - result.baseline.totalPnL;
  const roiChange = result.filtered.roi - result.baseline.roi;

  console.log(`\nDelta vs Baseline:`);
  console.log(`    Bets removed: ${result.removedCount}`);
  console.log(`    PnL improvement: $${pnLImprovement >= 0 ? '+' : ''}${pnLImprovement.toFixed(2)}`);
  console.log(`    ROI change: ${roiChange >= 0 ? '+' : ''}${roiChange.toFixed(2)} percentage points`);

  console.log(`\n${'='.repeat(60)}\n`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
