/**
 * Analyze Hybrid Conflict Performance
 * 
 * Slices Hybrid V2 and Fade V4 (Labs) performance by:
 * - hybrid_conflict_type (hybrid_strong, hybrid_weak, hybrid_only)
 * - Edge buckets (tier_c, tier_b, tier_a, tier_a_plus)
 * 
 * Usage:
 *   npx tsx apps/web/scripts/analyze-hybrid-conflict-performance.ts --season 2025
 */

import { prisma } from '../lib/prisma';

interface BetRecord {
  id: string;
  season: number;
  week: number;
  gameId: string;
  strategyTag: string;
  hybridConflictType: string | null;
  side: 'home' | 'away';
  stake: number;
  result: 'win' | 'loss' | 'push';
  pnl: number | null;
  modelPrice: number;
  closePrice: number | null;
  clv: number | null;
  edgePts: number | null; // Calculated from |modelPrice - closePrice|
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
  avgClv: number | null;
}

type ConflictType = 'hybrid_strong' | 'hybrid_weak' | 'hybrid_only' | 'none';
type EdgeBucket = 'tier_c' | 'tier_b' | 'tier_a' | 'tier_a_plus';

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
    console.error('Usage: npx tsx apps/web/scripts/analyze-hybrid-conflict-performance.ts --season <YEAR>');
    console.error('Example: npx tsx apps/web/scripts/analyze-hybrid-conflict-performance.ts --season 2025');
    process.exit(1);
  }

  return { season };
}

function getEdgeBucket(edgePts: number | null): EdgeBucket | null {
  if (edgePts === null) return null;
  const absEdge = Math.abs(edgePts);
  if (absEdge < 2.0) return 'tier_c';
  if (absEdge < 3.0) return 'tier_b';
  if (absEdge < 4.0) return 'tier_a';
  return 'tier_a_plus';
}

function getConflictType(hybridConflictType: string | null): ConflictType {
  if (!hybridConflictType) return 'none';
  if (hybridConflictType === 'hybrid_strong' || hybridConflictType === 'hybrid_weak' || hybridConflictType === 'hybrid_only') {
    return hybridConflictType;
  }
  return 'none';
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
    totalStake,
    totalPnL,
    roi,
    avgEdge,
    avgClv,
  };
}

function formatStats(stats: BucketStats, bucket: EdgeBucket): string {
  const record = `${stats.wins}W-${stats.losses}L${stats.pushes > 0 ? `-${stats.pushes}P` : ''}`;
  const winRateStr = stats.winRate.toFixed(1);
  const roiStr = stats.roi >= 0 ? `+${stats.roi.toFixed(2)}%` : `${stats.roi.toFixed(2)}%`;
  const edgeStr = stats.avgEdge !== null ? `${stats.avgEdge.toFixed(2)}` : 'N/A';
  const clvStr = stats.avgClv !== null ? `${stats.avgClv.toFixed(2)}` : 'N/A';

  const bucketLabel = {
    tier_c: 'Tier C (|edge| < 2.0)',
    tier_b: 'Tier B (2.0 <= |edge| < 3.0)',
    tier_a: 'Tier A (3.0 <= |edge| < 4.0)',
    tier_a_plus: 'Tier A+ (|edge| >= 4.0)',
  }[bucket];

  return `  Bucket: ${bucketLabel}
    Bets: ${stats.bets}
    Record: ${record}
    Win rate: ${winRateStr}%
    ROI: ${roiStr}
    Avg edge: ${edgeStr}
    Avg CLV: ${clvStr}`;
}

async function analyzeSeason(season: number): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Hybrid Conflict Performance Analysis - Season ${season}`);
  console.log('='.repeat(80));

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
      hybridConflictType: true,
      side: true,
      stake: true,
      result: true,
      pnl: true,
      modelPrice: true,
      closePrice: true,
      clv: true,
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
      hybridConflictType: bet.hybridConflictType,
      side: bet.side as 'home' | 'away',
      stake: Number(bet.stake),
      result: bet.result as 'win' | 'loss' | 'push',
      pnl: bet.pnl ? Number(bet.pnl) : null,
      modelPrice,
      closePrice,
      clv: bet.clv ? Number(bet.clv) : null,
      edgePts,
    };
  });

  console.log(`\nFound ${bets.length} graded bets (Hybrid + Fade V4)`);
  console.log(`  Hybrid bets: ${bets.filter(b => b.strategyTag === 'hybrid_v2').length}`);
  console.log(`  Fade V4 bets: ${bets.filter(b => b.strategyTag === 'fade_v4_labs').length}`);

  // Group bets by strategy, conflict type, and edge bucket
  const buckets = new Map<string, BetRecord[]>();

  for (const bet of bets) {
    const conflictType = getConflictType(bet.hybridConflictType);
    const edgeBucket = getEdgeBucket(bet.edgePts);
    
    if (!edgeBucket) continue; // Skip bets without edge

    const key = `${bet.strategyTag}|${conflictType}|${edgeBucket}`;
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key)!.push(bet);
  }

  // Calculate stats for each bucket
  const statsMap = new Map<string, BucketStats>();
  for (const [key, bucketBets] of Array.from(buckets.entries())) {
    statsMap.set(key, calculateStats(bucketBets));
  }

  // Print results grouped by strategy and conflict type
  const strategies = ['hybrid_v2', 'fade_v4_labs'];
  const conflictTypes: ConflictType[] = ['hybrid_strong', 'hybrid_weak', 'hybrid_only', 'none'];
  const edgeBuckets: EdgeBucket[] = ['tier_c', 'tier_b', 'tier_a', 'tier_a_plus'];

  for (const strategy of strategies) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Strategy: ${strategy}`);
    console.log('='.repeat(80));

    for (const conflictType of conflictTypes) {
      const hasData = Array.from(statsMap.keys()).some(key => 
        key.startsWith(`${strategy}|${conflictType}|`)
      );

      if (!hasData) continue;

      const conflictLabel = {
        hybrid_strong: 'Hybrid Strong (Hybrid vs V4 disagree)',
        hybrid_weak: 'Hybrid Weak (Hybrid vs V4 agree)',
        hybrid_only: 'Hybrid Only (no V4 bet)',
        none: 'No Conflict Type',
      }[conflictType];

      console.log(`\nConflict: ${conflictLabel}`);

      // Print each edge bucket
      for (const edgeBucket of edgeBuckets) {
        const key = `${strategy}|${conflictType}|${edgeBucket}`;
        const stats = statsMap.get(key);

        if (stats && stats.bets > 0) {
          console.log(formatStats(stats, edgeBucket));
        }
      }

      // Print overall stats for this conflict type (all buckets combined)
      const allBetsForConflict = Array.from(buckets.entries())
        .filter(([k]) => k.startsWith(`${strategy}|${conflictType}|`))
        .flatMap(([, bets]) => bets);
      
      if (allBetsForConflict.length > 0) {
        const overallStats = calculateStats(allBetsForConflict);
        console.log(`\n  Overall (all buckets):`);
        console.log(`    Bets: ${overallStats.bets}`);
        console.log(`    Record: ${overallStats.wins}W-${overallStats.losses}L${overallStats.pushes > 0 ? `-${overallStats.pushes}P` : ''}`);
        console.log(`    Win rate: ${overallStats.winRate.toFixed(1)}%`);
        console.log(`    ROI: ${overallStats.roi >= 0 ? '+' : ''}${overallStats.roi.toFixed(2)}%`);
        console.log(`    Avg edge: ${overallStats.avgEdge !== null ? overallStats.avgEdge.toFixed(2) : 'N/A'}`);
        console.log(`    Avg CLV: ${overallStats.avgClv !== null ? overallStats.avgClv.toFixed(2) : 'N/A'}`);
      }
    }
  }

  // Auto-commentary section
  console.log(`\n${'='.repeat(80)}`);
  console.log('Auto-Commentary');
  console.log('='.repeat(80));

  // Super-tier candidate: hybrid_v2 + hybrid_strong + tier_a_plus
  const superTierKey = 'hybrid_v2|hybrid_strong|tier_a_plus';
  const superTierStats = statsMap.get(superTierKey);
  if (superTierStats && superTierStats.bets > 0) {
    console.log(`\n🎯 Super-tier candidate: hybrid_v2, hybrid_strong, |edge| >= 4.0`);
    console.log(`   ${superTierStats.bets} bets, ${superTierStats.winRate.toFixed(1)}% win rate, ${superTierStats.roi >= 0 ? '+' : ''}${superTierStats.roi.toFixed(2)}% ROI`);
  }

  // Hybrid strong overall
  const hybridStrongOverall = Array.from(buckets.entries())
    .filter(([k]) => k.startsWith('hybrid_v2|hybrid_strong|'))
    .flatMap(([, bets]) => bets);
  if (hybridStrongOverall.length > 0) {
    const hybridStrongStats = calculateStats(hybridStrongOverall);
    console.log(`\n📊 Hybrid Strong (all buckets):`);
    console.log(`   ${hybridStrongStats.bets} bets, ${hybridStrongStats.winRate.toFixed(1)}% win rate, ${hybridStrongStats.roi >= 0 ? '+' : ''}${hybridStrongStats.roi.toFixed(2)}% ROI`);
  }

  // Hybrid weak overall
  const hybridWeakOverall = Array.from(buckets.entries())
    .filter(([k]) => k.startsWith('hybrid_v2|hybrid_weak|'))
    .flatMap(([, bets]) => bets);
  if (hybridWeakOverall.length > 0) {
    const hybridWeakStats = calculateStats(hybridWeakOverall);
    const behavior = hybridWeakStats.roi > 5 ? 'profitable' : hybridWeakStats.roi > -2 ? 'break-even' : 'poor';
    console.log(`\n📉 Hybrid Weak (all buckets):`);
    console.log(`   ${hybridWeakStats.bets} bets, ${hybridWeakStats.winRate.toFixed(1)}% win rate, ${hybridWeakStats.roi >= 0 ? '+' : ''}${hybridWeakStats.roi.toFixed(2)}% ROI`);
    console.log(`   Hybrid_weak buckets show ${behavior} behavior.`);
  }

  // Fade V4 overall
  const fadeOverall = Array.from(buckets.entries())
    .filter(([k]) => k.startsWith('fade_v4_labs|'))
    .flatMap(([, bets]) => bets);
  if (fadeOverall.length > 0) {
    const fadeStats = calculateStats(fadeOverall);
    console.log(`\n🔄 Fade V4 Labs (all buckets, all conflict types):`);
    console.log(`   ${fadeStats.bets} bets, ${fadeStats.winRate.toFixed(1)}% win rate, ${fadeStats.roi >= 0 ? '+' : ''}${fadeStats.roi.toFixed(2)}% ROI`);
  }
}

async function main() {
  const { season } = parseArgs();
  await analyzeSeason(season);
  await prisma.$disconnect();
}

main().catch(console.error);


