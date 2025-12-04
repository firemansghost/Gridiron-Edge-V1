/**
 * Analyze Portal Meta v2 vs ATS Performance
 * 
 * Analyzes how portal meta indices (PositionalShock, MercenaryIndex, PortalAggressor)
 * correlate with ATS results for a given season + strategy.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/analyze-portal-meta-vs-ats.ts --season 2025 --strategy official_flat_100
 *   npx tsx apps/web/scripts/analyze-portal-meta-vs-ats.ts --season 2025 --strategy hybrid_v2
 */

import { prisma } from '../lib/prisma';

interface BetWithPortalMeta {
  id: string;
  season: number;
  week: number;
  gameId: string;
  strategyTag: string;
  side: 'home' | 'away';
  stake: number;
  result: 'win' | 'loss' | 'push';
  pnl: number | null;
  betTeamId: string;
  betTeamPositionalShock: number;
  betTeamMercenaryIndex: number;
  betTeamPortalAggressor: number;
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
}

type IndexBand = 'low' | 'mid' | 'high';

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
    console.error('Usage: npx tsx apps/web/scripts/analyze-portal-meta-vs-ats.ts --season <YEAR> --strategy <TAG>');
    console.error('Example: npx tsx apps/web/scripts/analyze-portal-meta-vs-ats.ts --season 2025 --strategy official_flat_100');
    process.exit(1);
  }

  return { season, strategy };
}

function getIndexBand(score: number): IndexBand {
  if (score < 0.33) return 'low';
  if (score < 0.67) return 'mid';
  return 'high';
}

function calculateStats(bets: BetWithPortalMeta[]): BucketStats {
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

function formatStats(stats: BucketStats): string {
  const record = `${stats.wins}W-${stats.losses}L${stats.pushes > 0 ? `-${stats.pushes}P` : ''}`;
  const winRateStr = stats.winRate.toFixed(1);
  const roiStr = stats.roi >= 0 ? `+${stats.roi.toFixed(2)}%` : `${stats.roi.toFixed(2)}%`;
  const pnlStr = stats.totalPnL >= 0 ? `+$${stats.totalPnL.toFixed(2)}` : `$${stats.totalPnL.toFixed(2)}`;

  return `    Bets: ${stats.bets}
    Record: ${record}
    Win rate: ${winRateStr}%
    ROI: ${roiStr}
    PnL: ${pnlStr}`;
}

async function main() {
  const { season, strategy } = parseArgs();

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Portal Meta v2 vs ATS Analysis – Season ${season}, Strategy: ${strategy}`);
  console.log('='.repeat(80));

  // Fetch all graded spread bets for the strategy and season
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
        },
      },
    },
    orderBy: [
      { week: 'asc' },
      { gameId: 'asc' },
    ],
  });

  console.log(`\nFound ${betsRaw.length} graded spread bets`);

  // Load portal meta for all teams in this season
  const teamSeasons = await prisma.teamSeasonStat.findMany({
    where: { season },
  });

  const portalMetaMap = new Map<string, {
    positionalShock: number | null;
    mercenaryIndex: number | null;
    portalAggressor: number | null;
  }>();

  for (const ts of teamSeasons) {
    const rawJson = (ts.rawJson as any) || {};
    const portalMeta = rawJson.portal_meta;
    if (portalMeta) {
      portalMetaMap.set(ts.teamId, {
        positionalShock: typeof portalMeta.positionalShock === 'number' ? portalMeta.positionalShock : null,
        mercenaryIndex: typeof portalMeta.mercenaryIndex === 'number' ? portalMeta.mercenaryIndex : null,
        portalAggressor: typeof portalMeta.portalAggressor === 'number' ? portalMeta.portalAggressor : null,
      });
    }
  }

  console.log(`Found ${portalMetaMap.size} teams with portal meta data`);

  // Process bets and attach portal meta
  const betsWithMeta: BetWithPortalMeta[] = [];
  let missingMetaCount = 0;

  for (const bet of betsRaw) {
    // Determine bet team ID
    const betTeamId = bet.side === 'home' ? bet.game.homeTeamId : bet.game.awayTeamId;
    
    const portalMeta = portalMetaMap.get(betTeamId);
    
    // Only include bets where all three indices are non-null
    if (!portalMeta || 
        portalMeta.positionalShock === null || 
        portalMeta.mercenaryIndex === null || 
        portalMeta.portalAggressor === null) {
      missingMetaCount++;
      continue;
    }

    betsWithMeta.push({
      id: bet.id,
      season: bet.season,
      week: bet.week,
      gameId: bet.gameId,
      strategyTag: bet.strategyTag,
      side: bet.side as 'home' | 'away',
      stake: Number(bet.stake),
      result: bet.result as 'win' | 'loss' | 'push',
      pnl: bet.pnl ? Number(bet.pnl) : null,
      betTeamId,
      betTeamPositionalShock: portalMeta.positionalShock,
      betTeamMercenaryIndex: portalMeta.mercenaryIndex,
      betTeamPortalAggressor: portalMeta.portalAggressor,
    });
  }

  if (missingMetaCount > 0) {
    console.log(`\n⚠️  Warning: ${missingMetaCount} bets have missing portal meta data (excluded from analysis)`);
  }

  if (betsWithMeta.length === 0) {
    console.log('\n❌ No bets with complete portal meta data found. Cannot perform analysis.');
    await prisma.$disconnect();
    return;
  }

  console.log(`\nAnalyzing ${betsWithMeta.length} bets with complete portal meta data\n`);

  // Section A: By PositionalShock band
  console.log(`${'='.repeat(80)}`);
  console.log('Section A: By Bet Team PositionalShock Band');
  console.log('='.repeat(80));

  const psBands: IndexBand[] = ['low', 'mid', 'high'];
  const psBandLabels = {
    low: 'Low (0.00–0.33)',
    mid: 'Mid (0.33–0.67)',
    high: 'High (0.67–1.00)',
  };

  for (const band of psBands) {
    const bandBets = betsWithMeta.filter(b => getIndexBand(b.betTeamPositionalShock) === band);
    if (bandBets.length === 0) continue;

    const stats = calculateStats(bandBets);
    console.log(`\n${psBandLabels[band]}:`);
    console.log(formatStats(stats));
  }

  // Section B: By MercenaryIndex band
  console.log(`\n${'='.repeat(80)}`);
  console.log('Section B: By Bet Team MercenaryIndex Band');
  console.log('='.repeat(80));

  const miBands: IndexBand[] = ['low', 'mid', 'high'];
  const miBandLabels = {
    low: 'Low (0.00–0.33)',
    mid: 'Mid (0.33–0.67)',
    high: 'High (0.67–1.00)',
  };

  for (const band of miBands) {
    const bandBets = betsWithMeta.filter(b => getIndexBand(b.betTeamMercenaryIndex) === band);
    if (bandBets.length === 0) continue;

    const stats = calculateStats(bandBets);
    console.log(`\n${miBandLabels[band]}:`);
    console.log(formatStats(stats));
  }

  // Section C: By PortalAggressor band
  console.log(`\n${'='.repeat(80)}`);
  console.log('Section C: By Bet Team PortalAggressor Band');
  console.log('='.repeat(80));

  const paBands: IndexBand[] = ['low', 'mid', 'high'];
  const paBandLabels = {
    low: 'Low (0.00–0.33)',
    mid: 'Mid (0.33–0.67)',
    high: 'High (0.67–1.00)',
  };

  for (const band of paBands) {
    const bandBets = betsWithMeta.filter(b => getIndexBand(b.betTeamPortalAggressor) === band);
    if (bandBets.length === 0) continue;

    const stats = calculateStats(bandBets);
    console.log(`\n${paBandLabels[band]}:`);
    console.log(formatStats(stats));
  }

  // Global stats
  const globalStats = calculateStats(betsWithMeta);
  console.log(`\n${'='.repeat(80)}`);
  console.log('Global Stats (All Bets with Portal Meta):');
  console.log('='.repeat(80));
  console.log(formatStats(globalStats));

  console.log(`\n${'='.repeat(80)}\n`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});


