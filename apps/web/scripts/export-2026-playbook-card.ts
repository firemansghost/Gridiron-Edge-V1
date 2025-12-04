/**
 * Export 2026 Playbook Card
 * 
 * Prints a human-friendly weekly card and optionally CSV, driven by the 2026 rules.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/export-2026-playbook-card.ts --season 2025 --week 14
 *   npx tsx apps/web/scripts/export-2026-playbook-card.ts --season 2025 --week 14 --csv
 */

import { prisma } from '../lib/prisma';

interface BetWithGame {
  id: string;
  gameId: string;
  season: number;
  week: number;
  side: 'home' | 'away';
  modelPrice: number;
  closePrice: number | null;
  clv: number | null;
  hybridConflictType: string | null;
  game: {
    homeTeam: { name: string };
    awayTeam: { name: string };
  };
}

function parseArgs(): { season: number; week: number; csv: boolean } {
  const args = process.argv.slice(2);
  let season: number | null = null;
  let week: number | null = null;
  let csv = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && i + 1 < args.length) {
      season = parseInt(args[i + 1], 10);
    } else if (args[i] === '--week' && i + 1 < args.length) {
      week = parseInt(args[i + 1], 10);
    } else if (args[i] === '--csv') {
      csv = true;
    }
  }

  if (!season || !week || isNaN(season) || isNaN(week)) {
    console.error('Usage: npx tsx apps/web/scripts/export-2026-playbook-card.ts --season <YEAR> --week <WEEK> [--csv]');
    console.error('Example: npx tsx apps/web/scripts/export-2026-playbook-card.ts --season 2025 --week 14');
    console.error('Example: npx tsx apps/web/scripts/export-2026-playbook-card.ts --season 2025 --week 14 --csv');
    process.exit(1);
  }

  return { season, week, csv };
}

function getTierBucket(edge: number, conflictType: string | null): string {
  const absEdge = Math.abs(edge);
  
  if (conflictType === 'hybrid_strong') {
    if (absEdge >= 4.0) return 'super_tier_a';
    if (absEdge >= 3.0) return 'tier_a';
    if (absEdge >= 2.0) return 'tier_b';
  }
  
  return 'none';
}

function getTierLabel(tierBucket: string): string {
  const labels: Record<string, string> = {
    super_tier_a: 'Super Tier A',
    tier_a: 'Tier A (Strong)',
    tier_b: 'Tier B (Strong)',
    none: 'Other',
  };
  return labels[tierBucket] || 'Other';
}

async function exportPlaybookCard(season: number, week: number, csv: boolean): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`2026 Playbook Card - ${season} Week ${week}`);
  console.log('='.repeat(80));

  // Fetch Hybrid V2 spread bets
  const bets = await prisma.bet.findMany({
    where: {
      season,
      week,
      strategyTag: 'hybrid_v2',
      marketType: 'spread',
    },
    select: {
      id: true,
      gameId: true,
      season: true,
      week: true,
      side: true,
      modelPrice: true,
      closePrice: true,
      clv: true,
      hybridConflictType: true,
      game: {
        select: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
    orderBy: [
      { hybridConflictType: 'asc' }, // hybrid_strong first
      { modelPrice: 'desc' }, // Higher edge first
    ],
  });

  console.log(`\nFound ${bets.length} Hybrid V2 spread bets\n`);

  // Calculate edge and tier for each bet
  const betsWithTier = bets.map(bet => {
    const modelPrice = Number(bet.modelPrice);
    const closePrice = bet.closePrice ? Number(bet.closePrice) : null;
    const edge = closePrice !== null ? modelPrice - closePrice : null;
    const absEdge = edge !== null ? Math.abs(edge) : 0;
    const tierBucket = getTierBucket(absEdge, bet.hybridConflictType);
    const isSuperTierA = tierBucket === 'super_tier_a';

    return {
      ...bet,
      edge,
      absEdge,
      tierBucket,
      isSuperTierA,
      clv: bet.clv ? Number(bet.clv) : null,
    };
  });

  // Group by tier
  const superTierA = betsWithTier.filter(b => b.tierBucket === 'super_tier_a');
  const tierA = betsWithTier.filter(b => b.tierBucket === 'tier_a');
  const tierB = betsWithTier.filter(b => b.tierBucket === 'tier_b');
  const hybridWeak = betsWithTier.filter(b => b.hybridConflictType === 'hybrid_weak');

  // Print sections
  if (superTierA.length > 0) {
    console.log(`\n${'='.repeat(80)}`);
    console.log('Section 1: Super Tier A (Hybrid Strong + |edge| >= 4.0)');
    console.log('='.repeat(80));
    for (const bet of superTierA) {
      const teamName = bet.side === 'home' ? bet.game.homeTeam.name : bet.game.awayTeam.name;
      const opponentName = bet.side === 'home' ? bet.game.awayTeam.name : bet.game.homeTeam.name;
      const line = bet.closePrice !== null ? bet.closePrice.toFixed(1) : 'N/A';
      const edgeStr = bet.edge !== null ? bet.edge.toFixed(1) : 'N/A';
      const clvStr = bet.clv !== null ? `${bet.clv >= 0 ? '+' : ''}${bet.clv.toFixed(1)}` : 'N/A';
      console.log(`  ${teamName} ${line} vs ${opponentName} — edge: ${edgeStr}, CLV: ${clvStr}, conflict: Strong`);
    }
  }

  if (tierA.length > 0) {
    console.log(`\n${'='.repeat(80)}`);
    console.log('Section 2: Tier A (Strong) (3.0–3.99, Hybrid Strong)');
    console.log('='.repeat(80));
    for (const bet of tierA) {
      const teamName = bet.side === 'home' ? bet.game.homeTeam.name : bet.game.awayTeam.name;
      const opponentName = bet.side === 'home' ? bet.game.awayTeam.name : bet.game.homeTeam.name;
      const line = bet.closePrice !== null ? bet.closePrice.toFixed(1) : 'N/A';
      const edgeStr = bet.edge !== null ? bet.edge.toFixed(1) : 'N/A';
      const clvStr = bet.clv !== null ? `${bet.clv >= 0 ? '+' : ''}${bet.clv.toFixed(1)}` : 'N/A';
      console.log(`  ${teamName} ${line} vs ${opponentName} — edge: ${edgeStr}, CLV: ${clvStr}, conflict: Strong`);
    }
  }

  if (tierB.length > 0) {
    console.log(`\n${'='.repeat(80)}`);
    console.log('Section 3: Tier B (Strong) (2.0–2.99, Hybrid Strong)');
    console.log('='.repeat(80));
    for (const bet of tierB) {
      const teamName = bet.side === 'home' ? bet.game.homeTeam.name : bet.game.awayTeam.name;
      const opponentName = bet.side === 'home' ? bet.game.awayTeam.name : bet.game.homeTeam.name;
      const line = bet.closePrice !== null ? bet.closePrice.toFixed(1) : 'N/A';
      const edgeStr = bet.edge !== null ? bet.edge.toFixed(1) : 'N/A';
      const clvStr = bet.clv !== null ? `${bet.clv >= 0 ? '+' : ''}${bet.clv.toFixed(1)}` : 'N/A';
      console.log(`  ${teamName} ${line} vs ${opponentName} — edge: ${edgeStr}, CLV: ${clvStr}, conflict: Strong`);
    }
  }

  if (hybridWeak.length > 0) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Note: ${hybridWeak.length} Hybrid Weak bet(s) exist but are not listed by default.`);
    console.log('='.repeat(80));
  }

  // CSV output
  if (csv) {
    console.log(`\n${'='.repeat(80)}`);
    console.log('CSV Output');
    console.log('='.repeat(80));
    console.log('season,week,gameId,strategyTag,side,line,edge,clv,hybridConflictType,tierBucket,isSuperTierA');
    for (const bet of betsWithTier) {
      const line = bet.closePrice !== null ? bet.closePrice.toFixed(1) : '';
      const edge = bet.edge !== null ? bet.edge.toFixed(1) : '';
      const clv = bet.clv !== null ? bet.clv.toFixed(1) : '';
      const conflictType = bet.hybridConflictType || '';
      console.log(`${bet.season},${bet.week},${bet.gameId},hybrid_v2,${bet.side},${line},${edge},${clv},${conflictType},${bet.tierBucket},${bet.isSuperTierA}`);
    }
  }
}

async function main() {
  const { season, week, csv } = parseArgs();
  await exportPlaybookCard(season, week, csv);
  await prisma.$disconnect();
}

main().catch(console.error);







