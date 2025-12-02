/**
 * Analyze Super Tier A Stability
 * 
 * Slices Super Tier A bets (hybrid_v2, hybrid_strong, |edge| >= 4.0) by various dimensions
 * to verify stability across different buckets.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/analyze-super-tier-stability.ts --season 2025
 */

import { prisma } from '../lib/prisma';

interface BetRecord {
  id: string;
  season: number;
  week: number;
  gameId: string;
  side: 'home' | 'away';
  modelPrice: number;
  closePrice: number | null;
  clv: number | null;
  result: 'win' | 'loss' | 'push' | null;
  pnl: number | null;
  stake: number;
  game: {
    homeScore: number | null;
    awayScore: number | null;
    marketLines: Array<{
      lineType: string;
      lineValue: number;
      teamId: string | null;
    }>;
  };
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
    console.error('Usage: npx tsx apps/web/scripts/analyze-super-tier-stability.ts --season <YEAR>');
    console.error('Example: npx tsx apps/web/scripts/analyze-super-tier-stability.ts --season 2025');
    process.exit(1);
  }

  return { season };
}

function calculateStats(bets: BetRecord[]): {
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  roi: number;
  avgEdge: number;
  avgClv: number | null;
} {
  const wins = bets.filter(b => b.result === 'win').length;
  const losses = bets.filter(b => b.result === 'loss').length;
  const pushes = bets.filter(b => b.result === 'push').length;
  const totalStake = bets.reduce((sum, b) => sum + Number(b.stake), 0);
  const totalPnL = bets.reduce((sum, b) => sum + Number(b.pnl || 0), 0);
  const roi = totalStake > 0 ? (totalPnL / totalStake) * 100 : 0;
  const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;

  const betsWithEdge = bets.filter(b => b.closePrice !== null);
  const avgEdge = betsWithEdge.length > 0
    ? betsWithEdge.reduce((sum, b) => {
        const edge = Math.abs(Number(b.modelPrice) - Number(b.closePrice!));
        return sum + edge;
      }, 0) / betsWithEdge.length
    : 0;

  const betsWithClv = bets.filter(b => b.clv !== null);
  const avgClv = betsWithClv.length > 0
    ? betsWithClv.reduce((sum, b) => sum + Number(b.clv!), 0) / betsWithClv.length
    : null;

  return {
    bets: bets.length,
    wins,
    losses,
    pushes,
    winRate,
    roi,
    avgEdge,
    avgClv,
  };
}

function isFavorite(bet: BetRecord): boolean | null {
  // Find closing spread line for this game
  const spreadLine = bet.game.marketLines.find(
    ml => ml.lineType === 'spread' && ml.teamId !== null
  );

  if (!spreadLine || !bet.closePrice) return null;

  // If we're betting home and home team is the favorite (negative line), we're favorite
  // If we're betting away and away team is the favorite (negative line), we're favorite
  // This is simplified - in reality we'd need to check which team the line is for
  // For now, use heuristic: if closePrice (model) is positive, home is favored
  const modelPrice = Number(bet.modelPrice);
  const isHomeBet = bet.side === 'home';
  
  // If model says home is favored (positive) and we bet home, we're favorite
  // If model says away is favored (negative) and we bet away, we're favorite
  if (isHomeBet && modelPrice > 0) return true;
  if (!isHomeBet && modelPrice < 0) return true;
  return false;
}

async function analyzeStability(season: number): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Super Tier A Stability Analysis - Season ${season}`);
  console.log('='.repeat(80));

  // Fetch Super Tier A bets (hybrid_v2, hybrid_strong, |edge| >= 4.0, graded)
  const betsRaw = await prisma.bet.findMany({
    where: {
      season,
      strategyTag: 'hybrid_v2',
      marketType: 'spread',
      hybridConflictType: 'hybrid_strong',
      result: { in: ['win', 'loss', 'push'] },
    },
    select: {
      id: true,
      season: true,
      week: true,
      gameId: true,
      side: true,
      modelPrice: true,
      closePrice: true,
      clv: true,
      result: true,
      pnl: true,
      stake: true,
      game: {
        select: {
          homeScore: true,
          awayScore: true,
          marketLines: {
            select: {
              lineType: true,
              lineValue: true,
              teamId: true,
            },
          },
        },
      },
    },
  });

  // Filter to only bets with |edge| >= 4.0
  const bets: BetRecord[] = betsRaw
    .map(bet => {
      const modelPrice = Number(bet.modelPrice);
      const closePrice = bet.closePrice ? Number(bet.closePrice) : null;
      const edge = closePrice !== null ? Math.abs(modelPrice - closePrice) : 0;
      return { ...bet, edge };
    })
    .filter(bet => bet.edge >= 4.0) as BetRecord[];

  console.log(`\nFound ${bets.length} Super Tier A bets (hybrid_strong, |edge| >= 4.0, graded)\n`);

  // 1. By week bucket
  console.log(`${'='.repeat(80)}`);
  console.log('1. By Week Bucket');
  console.log('='.repeat(80));
  
  const weekBuckets = [
    { name: 'Weeks 1-4', weeks: [1, 2, 3, 4] },
    { name: 'Weeks 5-8', weeks: [5, 6, 7, 8] },
    { name: 'Weeks 9-12', weeks: [9, 10, 11, 12] },
    { name: 'Weeks 13+', weeks: (bets: BetRecord[]) => bets.filter(b => b.week >= 13) },
  ];

  for (const bucket of weekBuckets) {
    let bucketBets: BetRecord[];
    if (typeof bucket.weeks === 'function') {
      bucketBets = bucket.weeks(bets);
    } else {
      bucketBets = bets.filter(b => bucket.weeks.includes(b.week));
    }

    if (bucketBets.length > 0) {
      const stats = calculateStats(bucketBets);
      console.log(`\n${bucket.name}:`);
      console.log(`  Bets: ${stats.bets}`);
      console.log(`  Record: ${stats.wins}W-${stats.losses}L${stats.pushes > 0 ? `-${stats.pushes}P` : ''}`);
      console.log(`  Win rate: ${stats.winRate.toFixed(1)}%`);
      console.log(`  ROI: ${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(2)}%`);
      console.log(`  Avg edge: ${stats.avgEdge.toFixed(2)}`);
      console.log(`  Avg CLV: ${stats.avgClv !== null ? `${stats.avgClv >= 0 ? '+' : ''}${stats.avgClv.toFixed(2)}` : 'N/A'}`);
    }
  }

  // 2. By favorite vs dog
  console.log(`\n${'='.repeat(80)}`);
  console.log('2. By Favorite vs Dog');
  console.log('='.repeat(80));

  const favoriteBets = bets.filter(b => isFavorite(b) === true);
  const dogBets = bets.filter(b => isFavorite(b) === false);
  const unknownBets = bets.filter(b => isFavorite(b) === null);

  if (favoriteBets.length > 0) {
    const stats = calculateStats(favoriteBets);
    console.log(`\nFavorite:`);
    console.log(`  Bets: ${stats.bets}`);
    console.log(`  Win rate: ${stats.winRate.toFixed(1)}%`);
    console.log(`  ROI: ${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(2)}%`);
  }

  if (dogBets.length > 0) {
    const stats = calculateStats(dogBets);
    console.log(`\nDog:`);
    console.log(`  Bets: ${stats.bets}`);
    console.log(`  Win rate: ${stats.winRate.toFixed(1)}%`);
    console.log(`  ROI: ${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(2)}%`);
  }

  if (unknownBets.length > 0) {
    console.log(`\nUnknown (could not determine favorite/dog): ${unknownBets.length} bets`);
  }

  // 3. By edge band
  console.log(`\n${'='.repeat(80)}`);
  console.log('3. By Edge Band');
  console.log('='.repeat(80));

  const edgeBands = [
    { name: '4.0-6.99', min: 4.0, max: 6.99 },
    { name: '7.0-9.99', min: 7.0, max: 9.99 },
    { name: '10.0-14.99', min: 10.0, max: 14.99 },
    { name: '15.0+', min: 15.0, max: Infinity },
  ];

  for (const band of edgeBands) {
    const bandBets = bets.filter(b => {
      const edge = b.closePrice !== null ? Math.abs(Number(b.modelPrice) - Number(b.closePrice)) : 0;
      return edge >= band.min && edge <= band.max;
    });

    if (bandBets.length > 0) {
      const stats = calculateStats(bandBets);
      console.log(`\n${band.name}:`);
      console.log(`  Bets: ${stats.bets}`);
      console.log(`  Win rate: ${stats.winRate.toFixed(1)}%`);
      console.log(`  ROI: ${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(2)}%`);
      console.log(`  Avg CLV: ${stats.avgClv !== null ? `${stats.avgClv >= 0 ? '+' : ''}${stats.avgClv.toFixed(2)}` : 'N/A'}`);
    }
  }

  // 4. By CLV band
  console.log(`\n${'='.repeat(80)}`);
  console.log('4. By CLV Band');
  console.log('='.repeat(80));

  const clvBands = [
    { name: 'CLV >= 10', min: 10, max: Infinity },
    { name: 'CLV 5-9.99', min: 5, max: 9.99 },
    { name: 'CLV 0-4.99', min: 0, max: 4.99 },
    { name: 'CLV < 0', min: -Infinity, max: -0.01 },
  ];

  for (const band of clvBands) {
    const bandBets = bets.filter(b => {
      if (b.clv === null) return false;
      const clv = Number(b.clv);
      return clv >= band.min && clv <= band.max;
    });

    if (bandBets.length > 0) {
      const stats = calculateStats(bandBets);
      console.log(`\n${band.name}:`);
      console.log(`  Bets: ${stats.bets}`);
      console.log(`  Win rate: ${stats.winRate.toFixed(1)}%`);
      console.log(`  ROI: ${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(2)}%`);
    }
  }

  // Overall summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('Overall Summary');
  console.log('='.repeat(80));
  const overallStats = calculateStats(bets);
  console.log(`  Total bets: ${overallStats.bets}`);
  console.log(`  Record: ${overallStats.wins}W-${overallStats.losses}L${overallStats.pushes > 0 ? `-${overallStats.pushes}P` : ''}`);
  console.log(`  Win rate: ${overallStats.winRate.toFixed(1)}%`);
  console.log(`  ROI: ${overallStats.roi >= 0 ? '+' : ''}${overallStats.roi.toFixed(2)}%`);
  console.log(`  Avg edge: ${overallStats.avgEdge.toFixed(2)}`);
  console.log(`  Avg CLV: ${overallStats.avgClv !== null ? `${overallStats.avgClv >= 0 ? '+' : ''}${overallStats.avgClv.toFixed(2)}` : 'N/A'}`);
}

async function main() {
  const { season } = parseArgs();
  await analyzeStability(season);
  await prisma.$disconnect();
}

main().catch(console.error);


