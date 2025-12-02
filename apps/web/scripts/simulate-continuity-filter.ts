/**
 * Simulate Continuity Filter
 * 
 * Simulates what happens to a strategy's portfolio if we drop all
 * low-continuity dogs (spread bets only).
 * 
 * Low-continuity dog definition:
 * - Spread bet
 * - Bet team's continuityScore < 0.60
 * - Bet team is a dog (getting points) based on closing spread
 * 
 * Usage:
 *   npx tsx apps/web/scripts/simulate-continuity-filter.ts --season 2025 --strategy official_flat_100
 *   npx tsx apps/web/scripts/simulate-continuity-filter.ts --season 2025 --strategy hybrid_v2
 */

import { prisma } from '../lib/prisma';

interface BetRecord {
  id: string;
  season: number;
  week: number;
  gameId: string;
  marketType: string;
  side: 'home' | 'away';
  stake: number;
  result: 'win' | 'loss' | 'push';
  pnl: number | null;
  closePrice: number | null;
  betTeamId: string;
  betTeamContinuity: number | null;
  isLowContinuityDog: boolean;
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
}

function parseArgs(): { season: number; strategy: string } {
  const args = process.argv.slice(2);
  let season: number | null = null;
  let strategy: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && i + 1 < args.length) {
      season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--strategy' && i + 1 < args.length) {
      strategy = args[i + 1];
      i++;
    }
  }

  if (!season || isNaN(season) || !strategy) {
    console.error('Usage: npx tsx apps/web/scripts/simulate-continuity-filter.ts --season <YEAR> --strategy <STRATEGY_TAG>');
    console.error('Example: npx tsx apps/web/scripts/simulate-continuity-filter.ts --season 2025 --strategy hybrid_v2');
    process.exit(1);
  }

  return { season, strategy };
}

/**
 * Determine if bet team is favorite or dog based on closing spread
 * 
 * For spread bets, closePrice is stored in favorite-centric format:
 * - Negative value = favorite (laying points)
 * - Positive value = dog (getting points)
 * - Zero = pick'em (treat as dog)
 * 
 * From the bet's perspective:
 * - If closePrice < 0: bet team is favorite (laying points)
 * - If closePrice >= 0: bet team is dog (getting points)
 */
function isBetTeamDog(closePrice: number | null): boolean {
  if (closePrice === null) return false; // Can't determine, treat as unclassified
  // If closePrice >= 0, bet team is getting points (dog)
  // If closePrice < 0, bet team is laying points (favorite)
  return Number(closePrice) >= 0;
}

function calculatePortfolioStats(bets: BetRecord[]): PortfolioStats {
  const wins = bets.filter(b => b.result === 'win').length;
  const losses = bets.filter(b => b.result === 'loss').length;
  const pushes = bets.filter(b => b.result === 'push').length;
  const totalStake = bets.reduce((sum, b) => sum + Number(b.stake), 0);
  const totalPnL = bets.reduce((sum, b) => sum + Number(b.pnl || 0), 0);
  const roi = totalStake > 0 ? (totalPnL / totalStake) * 100 : 0;
  const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;

  return {
    bets: bets.length,
    wins,
    losses,
    pushes,
    winRate,
    totalStake,
    totalPnL,
    roi,
  };
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

export async function simulateContinuityFilter(
  season: number,
  strategyTag: string
): Promise<{
  baseline: PortfolioStats;
  removedSubset: PortfolioStats;
  filtered: PortfolioStats;
  removedCount: number;
}> {
  // Fetch all graded bets for the strategy and season
  const betsRaw = await prisma.bet.findMany({
    where: {
      season,
      strategyTag,
      result: { in: ['win', 'loss', 'push'] },
    },
    include: {
      game: {
        select: {
          id: true,
          homeTeamId: true,
          awayTeamId: true,
        },
      },
    },
    orderBy: [
      { week: 'asc' },
      { gameId: 'asc' },
    ],
  });

  // Load continuity scores for all teams in this season
  const teamSeasons = await prisma.teamSeasonStat.findMany({
    where: { season },
  });

  const continuityMap = new Map<string, number>();
  for (const ts of teamSeasons) {
    const rawJson = (ts.rawJson as any) || {};
    const portalMeta = rawJson.portal_meta;
    if (portalMeta && typeof portalMeta.continuityScore === 'number') {
      continuityMap.set(ts.teamId, portalMeta.continuityScore);
    }
  }

  // Process bets and identify low-continuity dogs
  const bets: BetRecord[] = [];
  let missingClosePriceCount = 0;
  let missingContinuityCount = 0;

  for (const bet of betsRaw) {
    // Only process spread bets for the filter
    if (bet.marketType !== 'spread') {
      // Non-spread bets are always included in both baseline and filtered
      bets.push({
        id: bet.id,
        season: bet.season,
        week: bet.week,
        gameId: bet.gameId,
        marketType: bet.marketType,
        side: bet.side as 'home' | 'away',
        stake: Number(bet.stake),
        result: bet.result as 'win' | 'loss' | 'push',
        pnl: bet.pnl ? Number(bet.pnl) : null,
        closePrice: bet.closePrice ? Number(bet.closePrice) : null,
        betTeamId: bet.side === 'home' ? bet.game.homeTeamId : bet.game.awayTeamId,
        betTeamContinuity: null,
        isLowContinuityDog: false,
      });
      continue;
    }

    // Determine bet team ID
    const betTeamId = bet.side === 'home' ? bet.game.homeTeamId : bet.game.awayTeamId;
    
    // Get continuity score
    const betTeamContinuity = continuityMap.get(betTeamId) ?? null;
    
    if (betTeamContinuity === null) {
      missingContinuityCount++;
    }

    // Determine if bet team is dog (for spread bets only)
    let isLowContinuityDog = false;
    
    const closePrice = bet.closePrice ? Number(bet.closePrice) : null;
    
    if (closePrice === null) {
      missingClosePriceCount++;
      // Can't classify, so not a low-continuity dog
      isLowContinuityDog = false;
    } else {
      const betIsDog = isBetTeamDog(closePrice);
      const isLowContinuity = betTeamContinuity !== null && betTeamContinuity < 0.60;
      
      isLowContinuityDog = betIsDog && isLowContinuity;
    }

    bets.push({
      id: bet.id,
      season: bet.season,
      week: bet.week,
      gameId: bet.gameId,
      marketType: bet.marketType,
      side: bet.side as 'home' | 'away',
      stake: Number(bet.stake),
      result: bet.result as 'win' | 'loss' | 'push',
      pnl: bet.pnl ? Number(bet.pnl) : null,
      closePrice,
      betTeamId,
      betTeamContinuity,
      isLowContinuityDog,
    });
  }

  if (missingClosePriceCount > 0) {
    console.log(`\n⚠️  Warning: ${missingClosePriceCount} spread bets have null closePrice (treated as unclassified)`);
  }
  if (missingContinuityCount > 0) {
    console.log(`⚠️  Warning: ${missingContinuityCount} spread bets have missing continuity data (included in both portfolios)`);
  }

  // Calculate stats for three portfolios
  const baselineBets = bets;
  const removedBets = bets.filter(b => b.isLowContinuityDog);
  const filteredBets = bets.filter(b => !b.isLowContinuityDog);

  const baselineStats = calculatePortfolioStats(baselineBets);
  const removedStats = calculatePortfolioStats(removedBets);
  const filteredStats = calculatePortfolioStats(filteredBets);

  return {
    baseline: baselineStats,
    removedSubset: removedStats,
    filtered: filteredStats,
    removedCount: removedBets.length,
  };
}

async function main() {
  const { season, strategy } = parseArgs();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Continuity Filter Simulation – Season ${season}, Strategy: ${strategy}`);
  console.log('='.repeat(60));

  const result = await simulateContinuityFilter(season, strategy);

  // Print results
  formatStats(result.baseline, 'Baseline (all bets)');
  formatStats(result.removedSubset, 'Removed subset – Low-Continuity Dogs (spreads only)');
  formatStats(result.filtered, 'Filtered (dropping low-continuity dogs)');

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

