/**
 * Analyze Continuity vs ATS Performance
 * 
 * Analyzes how roster continuity correlates with ATS results for a given season + strategy.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/analyze-continuity-vs-ats.ts --season 2025 --strategy official_flat_100
 *   npx tsx apps/web/scripts/analyze-continuity-vs-ats.ts --season 2025 --strategy hybrid_v2
 */

import { prisma } from '../lib/prisma';

interface BetWithContinuity {
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
  clv: number | null;
  edge: number | null;
  betTeamId: string;
  oppTeamId: string;
  betTeamCont: number;
  oppCont: number;
  contDiff: number;
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

type ContinuityBand = 'low' | 'mid' | 'high';
type ContDiffBand = 'very_negative' | 'negative' | 'neutral' | 'positive';
type WeekRange = 'early' | 'mid' | 'late' | 'championship';

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

  if (!season || isNaN(season)) {
    console.error('Usage: npx tsx apps/web/scripts/analyze-continuity-vs-ats.ts --season <YEAR> [--strategy <TAG>]');
    console.error('Example: npx tsx apps/web/scripts/analyze-continuity-vs-ats.ts --season 2025 --strategy official_flat_100');
    console.error('Example: npx tsx apps/web/scripts/analyze-continuity-vs-ats.ts --season 2025 --strategy hybrid_v2');
    process.exit(1);
  }

  // Default strategy
  if (!strategy) {
    strategy = 'official_flat_100';
  }

  return { season, strategy };
}

function getContinuityBand(score: number): ContinuityBand {
  if (score < 0.60) return 'low';
  if (score < 0.80) return 'mid';
  return 'high';
}

function getContDiffBand(diff: number): ContDiffBand {
  if (diff <= -0.20) return 'very_negative';
  if (diff < 0.0) return 'negative';
  if (diff < 0.20) return 'neutral';
  return 'positive';
}

function getWeekRange(week: number): WeekRange {
  if (week <= 4) return 'early';
  if (week <= 8) return 'mid';
  if (week <= 13) return 'late';
  return 'championship';
}

function calculateStats(bets: BetWithContinuity[]): BucketStats {
  const wins = bets.filter(b => b.result === 'win').length;
  const losses = bets.filter(b => b.result === 'loss').length;
  const pushes = bets.filter(b => b.result === 'push').length;
  const totalStake = bets.reduce((sum, b) => sum + Number(b.stake), 0);
  const totalPnL = bets.reduce((sum, b) => sum + Number(b.pnl || 0), 0);
  const roi = totalStake > 0 ? (totalPnL / totalStake) * 100 : 0;
  const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;

  const betsWithEdge = bets.filter(b => b.edge !== null);
  const avgEdge = betsWithEdge.length > 0
    ? betsWithEdge.reduce((sum, b) => sum + Number(b.edge!), 0) / betsWithEdge.length
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

function formatStats(stats: BucketStats): string {
  const record = `${stats.wins}W-${stats.losses}L${stats.pushes > 0 ? `-${stats.pushes}P` : ''}`;
  const winRateStr = stats.winRate.toFixed(1);
  const roiStr = stats.roi >= 0 ? `+${stats.roi.toFixed(2)}%` : `${stats.roi.toFixed(2)}%`;
  const edgeStr = stats.avgEdge !== null ? `${stats.avgEdge.toFixed(2)}` : '—';
  const clvStr = stats.avgClv !== null ? `${stats.avgClv.toFixed(2)}` : '—';

  return `    Bets: ${stats.bets}
    Record: ${record}
    Win rate: ${winRateStr}%
    ROI: ${roiStr}
    Avg edge: ${edgeStr}
    Avg CLV: ${clvStr}`;
}

async function main() {
  const { season, strategy } = parseArgs();

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Continuity vs ATS Analysis - Season ${season}, Strategy: ${strategy}`);
  console.log('='.repeat(80));

  // Fetch all graded spread bets for the strategy
  const betsRaw = await prisma.bet.findMany({
    where: {
      season,
      strategyTag: strategy,
      marketType: 'spread',
      result: { in: ['win', 'loss', 'push'] },
    },
    include: {
      game: {
        select: {
          id: true,
          homeTeamId: true,
          awayTeamId: true,
          week: true,
        },
      },
    },
    orderBy: [
      { week: 'asc' },
      { gameId: 'asc' },
    ],
  });

  console.log(`\nFound ${betsRaw.length} graded spread bets for ${strategy}`);

  // Load all team season stats with continuity scores for this season
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

  console.log(`Found ${continuityMap.size} teams with continuity scores`);

  // Process bets and add continuity data
  const betsWithContinuity: BetWithContinuity[] = [];
  let skipped = 0;

  for (const bet of betsRaw) {
    // Determine bet team and opponent
    const betTeamId = bet.side === 'home' ? bet.game.homeTeamId : bet.game.awayTeamId;
    const oppTeamId = bet.side === 'home' ? bet.game.awayTeamId : bet.game.homeTeamId;

    // Look up continuity scores
    const betTeamCont = continuityMap.get(betTeamId);
    const oppCont = continuityMap.get(oppTeamId);

    if (betTeamCont === undefined || oppCont === undefined) {
      skipped++;
      continue;
    }

    // Calculate edge and CLV
    const modelPrice = Number(bet.modelPrice);
    const closePrice = bet.closePrice ? Number(bet.closePrice) : null;
    const edge = closePrice !== null ? Math.abs(modelPrice - closePrice) : null;
    const clv = bet.clv ? Number(bet.clv) : null;

    betsWithContinuity.push({
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
      clv,
      edge,
      betTeamId,
      oppTeamId,
      betTeamCont,
      oppCont,
      contDiff: betTeamCont - oppCont,
    });
  }

  console.log(`\nBets with continuity data: ${betsWithContinuity.length}`);
  console.log(`Bets skipped (missing continuity): ${skipped}`);

  if (betsWithContinuity.length === 0) {
    console.log('\n⚠️  No bets with continuity data found. Exiting.');
    await prisma.$disconnect();
    return;
  }

  // Section A: By bet team continuity band
  console.log(`\n${'='.repeat(80)}`);
  console.log('Section A: By Bet Team Continuity Band');
  console.log('='.repeat(80));

  const bands: ContinuityBand[] = ['low', 'mid', 'high'];
  const bandLabels = {
    low: 'Low (< 0.60)',
    mid: 'Mid (0.60 - < 0.80)',
    high: 'High (>= 0.80)',
  };

  for (const band of bands) {
    const bandBets = betsWithContinuity.filter(b => getContinuityBand(b.betTeamCont) === band);
    if (bandBets.length === 0) continue;

    const stats = calculateStats(bandBets);
    console.log(`\n${bandLabels[band]}:`);
    console.log(formatStats(stats));
  }

  // Section B: By continuity difference band
  console.log(`\n${'='.repeat(80)}`);
  console.log('Section B: By Continuity Difference Band (Bet Team - Opponent)');
  console.log('='.repeat(80));

  const diffBands: ContDiffBand[] = ['very_negative', 'negative', 'neutral', 'positive'];
  const diffBandLabels = {
    very_negative: '<= -0.20',
    negative: '-0.20 - < 0.0',
    neutral: '0.0 - < 0.20',
    positive: '>= 0.20',
  };

  for (const band of diffBands) {
    const bandBets = betsWithContinuity.filter(b => getContDiffBand(b.contDiff) === band);
    if (bandBets.length === 0) continue;

    const stats = calculateStats(bandBets);
    console.log(`\n${diffBandLabels[band]}:`);
    console.log(formatStats(stats));
  }

  // Section C: By week range x continuity band
  console.log(`\n${'='.repeat(80)}`);
  console.log('Section C: By Week Range x Bet Team Continuity Band');
  console.log('='.repeat(80));

  const weekRanges: WeekRange[] = ['early', 'mid', 'late', 'championship'];
  const weekRangeLabels = {
    early: '1-4 (Early)',
    mid: '5-8 (Mid)',
    late: '9-13 (Late)',
    championship: '14+ (Championship/Bowls)',
  };

  for (const weekRange of weekRanges) {
    for (const band of bands) {
      const cellBets = betsWithContinuity.filter(b => 
        getWeekRange(b.week) === weekRange && getContinuityBand(b.betTeamCont) === band
      );

      if (cellBets.length < 10) continue; // Skip cells with < 10 bets

      const stats = calculateStats(cellBets);
      console.log(`\n${weekRangeLabels[weekRange]} × ${bandLabels[band]}:`);
      console.log(`    Bets: ${stats.bets}, Win rate: ${stats.winRate.toFixed(1)}%, ROI: ${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(2)}%`);
    }
  }

  // Section D: Favorite vs Dog by continuity band
  console.log(`\n${'='.repeat(80)}`);
  console.log('Section D: Favorite vs Dog by Bet Team Continuity Band');
  console.log('='.repeat(80));
  console.log('(Favorite = bet team laying points, Dog = bet team getting points)');

  for (const band of bands) {
    const bandBets = betsWithContinuity.filter(b => getContinuityBand(b.betTeamCont) === band);
    
    // Classify as favorite or dog based on closing spread
    // If closePrice < 0, bet team is favorite (laying points)
    // If closePrice > 0, bet team is dog (getting points)
    // If closePrice === 0 or null, treat as dog
    const favoriteBets = bandBets.filter(b => b.closePrice !== null && Number(b.closePrice) < 0);
    const dogBets = bandBets.filter(b => b.closePrice === null || Number(b.closePrice) >= 0);

    if (favoriteBets.length > 0) {
      const stats = calculateStats(favoriteBets);
      console.log(`\n${bandLabels[band]} / Favorite:`);
      console.log(formatStats(stats));
    }

    if (dogBets.length > 0) {
      const stats = calculateStats(dogBets);
      console.log(`\n${bandLabels[band]} / Dog:`);
      console.log(formatStats(stats));
    }
  }

  // Section E: Spread bands by continuity band
  console.log(`\n${'='.repeat(80)}`);
  console.log('Section E: Spread Bands by Bet Team Continuity Band');
  console.log('='.repeat(80));

  type SpreadBand = '0-3' | '3-7' | '7-14' | '14+';
  const spreadBands: SpreadBand[] = ['0-3', '3-7', '7-14', '14+'];
  const spreadBandLabels = {
    '0-3': '0-3',
    '3-7': '3-7',
    '7-14': '7-14',
    '14+': '14+',
  };

  function getSpreadBand(closePrice: number | null): SpreadBand | null {
    if (closePrice === null) return null;
    const absSpread = Math.abs(Number(closePrice));
    if (absSpread < 3) return '0-3';
    if (absSpread < 7) return '3-7';
    if (absSpread < 14) return '7-14';
    return '14+';
  }

  for (const band of bands) {
    const bandBets = betsWithContinuity.filter(b => getContinuityBand(b.betTeamCont) === band);
    
    console.log(`\n${bandLabels[band]}:`);
    
    for (const spreadBand of spreadBands) {
      const spreadBets = bandBets.filter(b => getSpreadBand(b.closePrice) === spreadBand);
      
      if (spreadBets.length === 0) continue;

      const stats = calculateStats(spreadBets);
      console.log(`\n  Spread ${spreadBandLabels[spreadBand]}:`);
      console.log(formatStats(stats).split('\n').map(line => `    ${line}`).join('\n'));
    }
  }

  console.log(`\n${'='.repeat(80)}\n`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

