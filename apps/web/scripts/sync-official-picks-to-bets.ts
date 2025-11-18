/**
 * Sync Official Trust-Market Picks to Bets
 * 
 * Creates synthetic "Official $100 Flat" bet records for every Official Trust-Market pick
 * (ATS, totals, moneyline) so Week Review can grade them.
 * 
 * Usage:
 *   # Sync a single week
 *   npx tsx apps/web/scripts/sync-official-picks-to-bets.ts 2025 9
 * 
 *   # Sync a range of weeks
 *   npx tsx apps/web/scripts/sync-official-picks-to-bets.ts 2025 1 11
 */

import { prisma } from '../lib/prisma';
import { getCoreV1SpreadFromTeams, getATSPick } from '../lib/core-v1-spread';
import { getOUPick } from '../lib/core-v1-total';
import { selectClosingLine } from '../lib/closing-line-helpers';
import { Decimal } from '@prisma/client/runtime/library';

const STRATEGY_TAG = 'official_flat_100';
const FLAT_STAKE = 100.0;

interface OfficialPick {
  gameId: string;
  marketType: 'spread' | 'total' | 'moneyline';
  side: 'home' | 'away' | 'over' | 'under';
  modelPrice: number; // Model fair line/price
  closePrice: number | null; // Closing line/price
  pickLabel: string; // Human-readable pick (e.g., "Alabama -6.5", "Over 45.5")
}

/**
 * Determine official ATS pick for a game
 */
async function getOfficialATSPick(
  game: any,
  modelSpreadHma: number | null,
  marketSpreadHma: number | null
): Promise<OfficialPick | null> {
  if (modelSpreadHma === null || !Number.isFinite(modelSpreadHma)) {
    return null;
  }
  if (marketSpreadHma === null || !Number.isFinite(marketSpreadHma)) {
    return null;
  }

  // Use Core V1 ATS pick helper (edge floor = 2.0)
  const atsPick = getATSPick(
    modelSpreadHma,
    marketSpreadHma,
    game.homeTeam.name,
    game.awayTeam.name,
    game.homeTeamId,
    game.awayTeamId,
    2.0 // edgeFloor
  );

  if (!atsPick.pickLabel || !atsPick.recommendedTeamId) {
    return null; // No pick if edge too small
  }

  // Get closing line
  const closingSpread = await selectClosingLine(game.id, 'spread');
  if (!closingSpread) {
    return null;
  }

  // Determine side from recommended team
  const side = atsPick.recommendedTeamId === game.homeTeamId ? 'home' : 'away';

  return {
    gameId: game.id,
    marketType: 'spread',
    side,
    modelPrice: modelSpreadHma, // Model spread in HMA format
    closePrice: closingSpread.value,
    pickLabel: atsPick.pickLabel,
  };
}

/**
 * Determine official Total pick for a game
 */
async function getOfficialTotalPick(
  game: any,
  marketTotal: number | null,
  marketSpreadHma: number | null,
  modelSpreadHma: number | null
): Promise<OfficialPick | null> {
  if (marketTotal === null || !Number.isFinite(marketTotal)) {
    return null;
  }
  if (marketSpreadHma === null || !Number.isFinite(marketSpreadHma)) {
    return null;
  }
  if (modelSpreadHma === null || !Number.isFinite(modelSpreadHma)) {
    return null;
  }

  // Use Core V1 totals model
  const ouPick = getOUPick(marketTotal, marketSpreadHma, modelSpreadHma);
  
  if (!ouPick.pickLabel) {
    return null; // No pick if edge too small or model total invalid
  }

  // Get closing total
  const closingTotal = await selectClosingLine(game.id, 'total');
  if (!closingTotal) {
    return null;
  }

  // Determine side from pick label
  const isOver = ouPick.pickLabel.startsWith('Over');
  const side = isOver ? 'over' : 'under';

  return {
    gameId: game.id,
    marketType: 'total',
    side,
    modelPrice: ouPick.modelTotal || marketTotal, // Model total
    closePrice: closingTotal.value,
    pickLabel: ouPick.pickLabel,
  };
}

/**
 * Determine official Moneyline pick for a game
 * 
 * NOTE: Moneyline pick logic is complex and depends on spread overlay.
 * For now, we'll skip moneyline picks and focus on ATS + totals.
 * TODO: Add moneyline pick logic when needed.
 */
async function getOfficialMoneylinePick(
  game: any,
  modelSpreadHma: number | null,
  marketSpreadHma: number | null
): Promise<OfficialPick | null> {
  // Skip moneyline for now - logic is complex and depends on overlay calculations
  // TODO: Implement moneyline pick detection when needed
  return null;
}

/**
 * Get all official picks for a game
 */
async function getOfficialPicksForGame(game: any): Promise<OfficialPick[]> {
  const picks: OfficialPick[] = [];

  try {
    // Get Core V1 model spread
    const coreV1SpreadInfo = await getCoreV1SpreadFromTeams(
      game.homeTeamId,
      game.awayTeamId,
      game.season,
      game.neutralSite || false
    );

    if (!coreV1SpreadInfo || coreV1SpreadInfo.spreadHma === null) {
      return picks; // No model spread available
    }

    const modelSpreadHma = coreV1SpreadInfo.spreadHma;

    // Get closing lines
    const [closingSpread, closingTotal] = await Promise.all([
      selectClosingLine(game.id, 'spread'),
      selectClosingLine(game.id, 'total'),
    ]);

    if (!closingSpread) {
      return picks; // No closing spread = no ATS pick
    }

    const marketSpreadHma = closingSpread.value;
    const marketTotal = closingTotal?.value ?? null;

    // ATS pick
    const atsPick = await getOfficialATSPick(game, modelSpreadHma, marketSpreadHma);
    if (atsPick) {
      picks.push(atsPick);
    }

    // Total pick (if market total exists)
    if (marketTotal !== null) {
      const totalPick = await getOfficialTotalPick(game, marketTotal, marketSpreadHma, modelSpreadHma);
      if (totalPick) {
        picks.push(totalPick);
      }
    }

    // Moneyline pick (skipped for now)
    // const mlPick = await getOfficialMoneylinePick(game, modelSpreadHma, marketSpreadHma);
    // if (mlPick) {
    //   picks.push(mlPick);
    // }

  } catch (error) {
    console.error(`[Game ${game.id}] Error determining official picks:`, error);
  }

  return picks;
}

/**
 * Upsert a bet record (idempotent)
 */
async function upsertBet(pick: OfficialPick, season: number, week: number): Promise<'created' | 'updated' | 'skipped'> {
  try {
    // Check if bet already exists
    const existing = await prisma.bet.findFirst({
      where: {
        gameId: pick.gameId,
        marketType: pick.marketType,
        side: pick.side,
        strategyTag: STRATEGY_TAG,
        season,
        week,
      },
    });

    const betData = {
      gameId: pick.gameId,
      marketType: pick.marketType,
      side: pick.side,
      modelPrice: new Decimal(pick.modelPrice),
      closePrice: pick.closePrice !== null ? new Decimal(pick.closePrice) : null,
      stake: new Decimal(FLAT_STAKE),
      strategyTag: STRATEGY_TAG,
      source: 'strategy_run' as const,
      season,
      week,
      notes: `Auto: Official Trust-Market pick, $100 flat. ${pick.pickLabel}`,
    };

    if (existing) {
      // Update existing bet
      await prisma.bet.update({
        where: { id: existing.id },
        data: betData,
      });
      return 'updated';
    } else {
      // Create new bet
      await prisma.bet.create({
        data: betData,
      });
      return 'created';
    }
  } catch (error) {
    console.error(`[Bet upsert] Error for ${pick.gameId} ${pick.marketType}:`, error);
    return 'skipped';
  }
}

/**
 * Sync official picks to bets for a single week
 */
async function syncWeek(season: number, week: number): Promise<{ created: number; updated: number; skipped: number }> {
  console.log(`\n📅 Processing ${season} Week ${week}...`);

  // Fetch all games for this week
  const games = await prisma.game.findMany({
    where: {
      season,
      week,
    },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
    orderBy: {
      date: 'asc',
    },
  });

  console.log(`   Found ${games.length} games`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const game of games) {
    const picks = await getOfficialPicksForGame(game);
    
    for (const pick of picks) {
      const result = await upsertBet(pick, season, week);
      if (result === 'created') {
        created++;
      } else if (result === 'updated') {
        updated++;
      } else {
        skipped++;
      }
    }
  }

  console.log(`   ✅ ${season} Week ${week}: created ${created}, updated ${updated}, skipped ${skipped} Official $100 Flat bets`);

  return { created, updated, skipped };
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: npx tsx apps/web/scripts/sync-official-picks-to-bets.ts <season> <weekStart> [weekEnd]');
    console.error('Example: npx tsx apps/web/scripts/sync-official-picks-to-bets.ts 2025 9');
    console.error('Example: npx tsx apps/web/scripts/sync-official-picks-to-bets.ts 2025 1 11');
    process.exit(1);
  }

  const season = parseInt(args[0]);
  const weekStart = parseInt(args[1]);
  const weekEnd = args.length >= 3 ? parseInt(args[2]) : weekStart;

  if (isNaN(season) || isNaN(weekStart) || isNaN(weekEnd)) {
    console.error('Error: season, weekStart, and weekEnd must be valid numbers');
    process.exit(1);
  }

  console.log(`\n🚀 Syncing Official $100 Flat bets`);
  console.log(`   Season: ${season}`);
  console.log(`   Weeks: ${weekStart} to ${weekEnd}`);

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (let week = weekStart; week <= weekEnd; week++) {
    const result = await syncWeek(season, week);
    totalCreated += result.created;
    totalUpdated += result.updated;
    totalSkipped += result.skipped;
  }

  console.log(`\n✅ Complete!`);
  console.log(`   Total created: ${totalCreated}`);
  console.log(`   Total updated: ${totalUpdated}`);
  console.log(`   Total skipped: ${totalSkipped}`);
  console.log('');
}

main()
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

