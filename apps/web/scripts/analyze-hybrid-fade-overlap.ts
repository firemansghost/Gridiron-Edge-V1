/**
 * Analyze Hybrid vs Fade V4 Overlap
 * 
 * Analyzes the relationship between Hybrid (hybrid_v2) and Fade V4 (fade_v4_labs) bets
 * to understand where profit comes from and how they relate.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/analyze-hybrid-fade-overlap.ts --season 2024
 *   npx tsx apps/web/scripts/analyze-hybrid-fade-overlap.ts --season 2025
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
  modelPrice: number;
  closePrice: number | null;
  edgePts: number | null; // Calculated from modelPrice - closePrice
}

interface GameBucket {
  gameKey: string;
  season: number;
  week: number;
  gameId: string;
  hybridBet: BetRecord | null;
  fadeBet: BetRecord | null;
}

interface BucketStats {
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  totalStake: number;
  totalPnL: number;
  roi: number;
  avgEdge: number | null;
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
    console.error('Usage: npx tsx apps/web/scripts/analyze-hybrid-fade-overlap.ts --season <YEAR>');
    console.error('Example: npx tsx apps/web/scripts/analyze-hybrid-fade-overlap.ts --season 2025');
    process.exit(1);
  }

  return { season };
}

function calculateStats(bets: BetRecord[]): BucketStats {
  const wins = bets.filter(b => b.result === 'win').length;
  const losses = bets.filter(b => b.result === 'loss').length;
  const pushes = bets.filter(b => b.result === 'push').length;
  const totalStake = bets.reduce((sum, b) => sum + Number(b.stake), 0);
  const totalPnL = bets.reduce((sum, b) => sum + Number(b.pnl || 0), 0);
  const roi = totalStake > 0 ? (totalPnL / totalStake) * 100 : 0;
  const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;

  const betsWithEdge = bets.filter(b => b.edgePts !== null);
  const avgEdge = betsWithEdge.length > 0
    ? betsWithEdge.reduce((sum, b) => sum + Number(b.edgePts!), 0) / betsWithEdge.length
    : null;

  return {
    bets: bets.length,
    wins,
    losses,
    pushes,
    winRate,
    totalStake,
    totalPnL,
    roi,
    avgEdge,
  };
}

function formatStats(stats: BucketStats): string {
  const record = `${stats.wins}W-${stats.losses}L${stats.pushes > 0 ? `-${stats.pushes}P` : ''}`;
  const winRateStr = stats.winRate.toFixed(1);
  const roiStr = stats.roi >= 0 ? `+${stats.roi.toFixed(2)}%` : `${stats.roi.toFixed(2)}%`;
  const edgeStr = stats.avgEdge !== null ? `, avg edge: ${stats.avgEdge.toFixed(2)} pts` : '';
  
  return `${stats.bets} bets, ${record}, ${winRateStr}% win rate, ${roiStr} ROI${edgeStr}`;
}

async function analyzeSeason(season: number): Promise<void> {
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
      modelPrice: true,
      closePrice: true,
    },
    orderBy: [
      { week: 'asc' },
      { gameId: 'asc' },
    ],
  });

  // Convert to BetRecord with calculated edge
  const bets: BetRecord[] = betsRaw.map(bet => {
    const modelPrice = Number(bet.modelPrice);
    const closePrice = bet.closePrice ? Number(bet.closePrice) : null;
    const edgePts = closePrice !== null ? Math.abs(modelPrice - closePrice) : null;

    return {
      id: bet.id,
      season: bet.season,
      week: bet.week,
      gameId: bet.gameId,
      strategyTag: bet.strategyTag,
      side: bet.side as 'home' | 'away',
      stake: Number(bet.stake),
      result: bet.result as 'win' | 'loss' | 'push',
      pnl: bet.pnl ? Number(bet.pnl) : null,
      modelPrice,
      closePrice,
      edgePts,
    };
  });

  console.log(`\nFound ${bets.length} graded bets (Hybrid + Fade V4)`);

  // Group bets by game
  const gameMap = new Map<string, GameBucket>();

  for (const bet of bets) {
    const gameKey = `${bet.season}-${bet.week}-${bet.gameId}`;
    
    if (!gameMap.has(gameKey)) {
      gameMap.set(gameKey, {
        gameKey,
        season: bet.season,
        week: bet.week,
        gameId: bet.gameId,
        hybridBet: null,
        fadeBet: null,
      });
    }

    const bucket = gameMap.get(gameKey)!;
    if (bet.strategyTag === 'hybrid_v2') {
      bucket.hybridBet = bet as BetRecord;
    } else if (bet.strategyTag === 'fade_v4_labs') {
      bucket.fadeBet = bet as BetRecord;
    }
  }

  // Categorize games into buckets
  const hOnly: BetRecord[] = [];
  const fOnly: BetRecord[] = [];
  const bothSame: { hybrid: BetRecord; fade: BetRecord }[] = [];
  const bothOpposite: { hybrid: BetRecord; fade: BetRecord }[] = [];

  for (const bucket of gameMap.values()) {
    if (bucket.hybridBet && !bucket.fadeBet) {
      hOnly.push(bucket.hybridBet);
    } else if (!bucket.hybridBet && bucket.fadeBet) {
      fOnly.push(bucket.fadeBet);
    } else if (bucket.hybridBet && bucket.fadeBet) {
      if (bucket.hybridBet.side === bucket.fadeBet.side) {
        bothSame.push({ hybrid: bucket.hybridBet, fade: bucket.fadeBet });
      } else {
        bothOpposite.push({ hybrid: bucket.hybridBet, fade: bucket.fadeBet });
      }
    }
  }

  // Calculate stats for each bucket
  const hOnlyStats = calculateStats(hOnly);
  const fOnlyStats = calculateStats(fOnly);
  const bothSameHybridStats = calculateStats(bothSame.map(b => b.hybrid));
  const bothSameFadeStats = calculateStats(bothSame.map(b => b.fade));
  const bothOppositeHybridStats = calculateStats(bothOpposite.map(b => b.hybrid));
  const bothOppositeFadeStats = calculateStats(bothOpposite.map(b => b.fade));

  // Print report
  console.log('\n[Hybrid Only]');
  console.log(`  Hybrid: ${formatStats(hOnlyStats)}`);

  console.log('\n[Fade V4 Only]');
  console.log(`  Fade V4: ${formatStats(fOnlyStats)}`);

  console.log('\n[Both — Same Side]');
  console.log(`  Hybrid: ${formatStats(bothSameHybridStats)}`);
  console.log(`  Fade V4: ${formatStats(bothSameFadeStats)}`);

  console.log('\n[Both — Opposite Sides]');
  console.log(`  Hybrid: ${formatStats(bothOppositeHybridStats)}`);
  console.log(`  Fade V4: ${formatStats(bothOppositeFadeStats)}`);

  // Summary statistics
  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Total games analyzed: ${gameMap.size}`);
  console.log(`  H-only games: ${hOnly.length}`);
  console.log(`  F-only games: ${fOnly.length}`);
  console.log(`  Both (same side) games: ${bothSame.length}`);
  console.log(`  Both (opposite) games: ${bothOpposite.length}`);

  // Headline insights
  console.log('\nNotes:');
  
  const fadeTotalPnL = fOnlyStats.totalPnL + bothSameFadeStats.totalPnL + bothOppositeFadeStats.totalPnL;
  const fadeFOnlyPnL = fOnlyStats.totalPnL;
  const fadeBothSamePnL = bothSameFadeStats.totalPnL;
  const fadeBothOppositePnL = bothOppositeFadeStats.totalPnL;
  
  if (Math.abs(fadeTotalPnL) > 0.01) {
    const fadeFOnlyPct = (fadeFOnlyPnL / fadeTotalPnL) * 100;
    const fadeBothSamePct = (fadeBothSamePnL / fadeTotalPnL) * 100;
    const fadeBothOppositePct = (fadeBothOppositePnL / fadeTotalPnL) * 100;
    
    if (Math.abs(fadeFOnlyPct) > 50) {
      console.log(`- Most Fade V4 profit (${fadeFOnlyPct.toFixed(1)}%) comes from F-only games (no Hybrid bet).`);
    } else {
      console.log(`- Fade V4 profit breakdown: F-only: ${fadeFOnlyPct.toFixed(1)}% ($${fadeFOnlyPnL.toFixed(2)}), Both-same: ${fadeBothSamePct.toFixed(1)}% ($${fadeBothSamePnL.toFixed(2)}), Both-opposite: ${fadeBothOppositePct.toFixed(1)}% ($${fadeBothOppositePnL.toFixed(2)})`);
    }
  } else {
    console.log(`- Fade V4 total PnL: $${fadeTotalPnL.toFixed(2)}`);
  }

  if (bothSame.length > 0) {
    console.log(`- When Hybrid and Fade V4 fire on the same side (${bothSame.length} games):`);
    console.log(`    Hybrid ROI: ${bothSameHybridStats.roi.toFixed(2)}%`);
    console.log(`    Fade V4 ROI: ${bothSameFadeStats.roi.toFixed(2)}%`);
  }

  if (bothOpposite.length > 0) {
    console.log(`- When they oppose each other (${bothOpposite.length} games):`);
    console.log(`    Hybrid ROI: ${bothOppositeHybridStats.roi.toFixed(2)}%`);
    console.log(`    Fade V4 ROI: ${bothOppositeFadeStats.roi.toFixed(2)}%`);
  }

  const hybridTotalPnL = hOnlyStats.totalPnL + bothSameHybridStats.totalPnL + bothOppositeHybridStats.totalPnL;
  const hybridHOnlyPnL = hOnlyStats.totalPnL;
  
  if (Math.abs(hybridTotalPnL) > 0.01) {
    const hybridHOnlyPct = (hybridHOnlyPnL / hybridTotalPnL) * 100;
    if (Math.abs(hybridHOnlyPct) > 50) {
      console.log(`- Most Hybrid profit (${hybridHOnlyPct.toFixed(1)}%) comes from H-only games (no Fade V4 bet).`);
    }
  }
}

async function main() {
  try {
    const { season } = parseArgs();
    await analyzeSeason(season);
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

