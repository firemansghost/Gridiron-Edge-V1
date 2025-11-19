/**
 * Generate Matchup Outputs for Weeks 1-8
 * 
 * This script generates matchup outputs (model predictions) for games in weeks 1-8.
 * It uses team ratings and market lines to compute implied spreads/totals.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/generate-matchup-outputs.ts 2025 1 4
 *   npx tsx apps/web/scripts/generate-matchup-outputs.ts 2025 5 8
 */

import { prisma } from '../lib/prisma';
import { selectClosingLine } from '../lib/closing-line-helpers';

const MODEL_VERSION = 'v0.0.1';
const HFA = 2.0; // Home field advantage in points
const CONFIDENCE_THRESHOLDS = {
  A: 4.0, // ≥ 4.0 pts edge
  B: 3.0, // ≥ 3.0 pts edge  
  C: 2.0  // ≥ 2.0 pts edge
};

interface TeamRating {
  teamId: string;
  rating: number;
  powerRating?: number;
}

/**
 * Get team rating for a specific season/week
 * Tries multiple sources: team_season_ratings, power_ratings
 */
async function getTeamRating(teamId: string, season: number, week: number): Promise<number | null> {
  // Try team_season_ratings first (v1 model)
  const seasonRating = await prisma.teamSeasonRating.findFirst({
    where: {
      teamId,
      season,
      modelVersion: 'v1',
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  if (seasonRating?.powerRating !== null && seasonRating?.powerRating !== undefined) {
    return Number(seasonRating.powerRating);
  }
  if (seasonRating?.rating !== null && seasonRating?.rating !== undefined) {
    return Number(seasonRating.rating);
  }

  // Fallback: try power_ratings table
  const powerRating = await prisma.powerRating.findFirst({
    where: {
      teamId,
      season,
      week: { lte: week },
      modelVersion: MODEL_VERSION,
    },
    orderBy: {
      week: 'desc',
    },
  });

  if (powerRating) {
    return Number(powerRating.rating);
  }

  return null;
}

/**
 * Compute implied spread and total for a game
 */
async function computeImpliedLines(
  game: any,
  homeRating: number,
  awayRating: number
): Promise<{
  impliedSpread: number;
  impliedTotal: number;
  marketSpread: number;
  marketTotal: number;
  edgeConfidence: 'A' | 'B' | 'C';
}> {
  // Model spread = (home_rating - away_rating) + HFA (if not neutral)
  const ratingDiff = homeRating - awayRating;
  const impliedSpread = ratingDiff + (game.neutralSite ? 0 : HFA);

  // Model total: Use a simple baseline (can be improved with pace/efficiency)
  // For now, use a conservative baseline of 45 + rating sum adjustment
  const ratingSum = Math.abs(homeRating) + Math.abs(awayRating);
  const impliedTotal = 45 + (ratingSum * 0.5); // Adjust based on team strength

  // Get market lines
  const marketSpreadLine = await selectClosingLine(game.id, 'spread');
  const marketTotalLine = await selectClosingLine(game.id, 'total');

  // Use implied values as fallback if market lines don't exist
  // (schema requires non-null values)
  const marketSpread = marketSpreadLine?.value ?? impliedSpread;
  const marketTotal = marketTotalLine?.value ?? impliedTotal;

  // Compute edge and confidence
  // Since we use implied values as fallback, we can always compute edge
  const spreadEdge = Math.abs(impliedSpread - marketSpread);
  const totalEdge = Math.abs(impliedTotal - marketTotal);
  const maxEdge = Math.max(spreadEdge, totalEdge);

  let edgeConfidence: 'A' | 'B' | 'C' = 'C';
  if (maxEdge >= CONFIDENCE_THRESHOLDS.A) {
    edgeConfidence = 'A';
  } else if (maxEdge >= CONFIDENCE_THRESHOLDS.B) {
    edgeConfidence = 'B';
  }

  return {
    impliedSpread,
    impliedTotal,
    marketSpread,
    marketTotal,
    edgeConfidence,
  };
}

/**
 * Generate matchup outputs for a single week
 */
async function generateWeek(season: number, week: number): Promise<{
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}> {
  console.log(`\n📊 Processing ${season} Week ${week}...`);

  // Get all games for this week
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

  let processed = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const game of games) {
    try {
      // Get team ratings
      const homeRating = await getTeamRating(game.homeTeamId, season, week);
      const awayRating = await getTeamRating(game.awayTeamId, season, week);

      if (homeRating === null || awayRating === null) {
        console.log(`   ⚠️  Skipping ${game.id}: Missing ratings (home: ${homeRating !== null ? '✅' : '❌'}, away: ${awayRating !== null ? '✅' : '❌'})`);
        skipped++;
        continue;
      }

      // Compute implied lines
      const lines = await computeImpliedLines(game, homeRating, awayRating);

      // Check if record exists before upsert
      const existedBefore = await prisma.matchupOutput.findUnique({
        where: {
          gameId_modelVersion: {
            gameId: game.id,
            modelVersion: MODEL_VERSION,
          },
        },
      });

      // Upsert matchup output
      // Note: When creating, we need to connect the game relation
      await prisma.matchupOutput.upsert({
        where: {
          gameId_modelVersion: {
            gameId: game.id,
            modelVersion: MODEL_VERSION,
          },
        },
        update: {
          season,
          week,
          impliedSpread: lines.impliedSpread,
          impliedTotal: lines.impliedTotal,
          marketSpread: lines.marketSpread,
          marketTotal: lines.marketTotal,
          edgeConfidence: lines.edgeConfidence,
        },
        create: {
          game: {
            connect: { id: game.id },
          },
          season,
          week,
          impliedSpread: lines.impliedSpread,
          impliedTotal: lines.impliedTotal,
          marketSpread: lines.marketSpread,
          marketTotal: lines.marketTotal,
          edgeConfidence: lines.edgeConfidence,
          modelVersion: MODEL_VERSION,
        },
      });

      // Track created vs updated
      if (existedBefore) {
        updated++;
      } else {
        created++;
      }

      processed++;
    } catch (error) {
      console.error(`   ❌ Error processing ${game.id}:`, error);
      errors++;
    }
  }

  console.log(`   ✅ Week ${week}: processed ${processed}, created ${created}, updated ${updated}, skipped ${skipped}, errors ${errors}`);

  return { processed, created, updated, skipped, errors };
}

async function main() {
  const args = process.argv.slice(2);
  const season = parseInt(args[0]) || 2025;
  const startWeek = parseInt(args[1]) || 1;
  const endWeek = parseInt(args[2]) || startWeek;

  console.log(`\n🎯 Generating Matchup Outputs for ${season} Weeks ${startWeek}-${endWeek}\n`);

  // Check if ratings exist
  const ratingCount = await prisma.teamSeasonRating.count({
    where: {
      season,
      modelVersion: 'v1',
    },
  });

  if (ratingCount === 0) {
    console.error('❌ No team ratings found for 2025 season (modelVersion: v1)');
    console.error('   Please run ratings computation first.');
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`✅ Found ${ratingCount} team ratings for ${season}`);

  const totals = {
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  for (let week = startWeek; week <= endWeek; week++) {
    const result = await generateWeek(season, week);
    totals.processed += result.processed;
    totals.created += result.created;
    totals.updated += result.updated;
    totals.skipped += result.skipped;
    totals.errors += result.errors;
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Processed: ${totals.processed}`);
  console.log(`   Created: ${totals.created}`);
  console.log(`   Updated: ${totals.updated}`);
  console.log(`   Skipped: ${totals.skipped}`);
  console.log(`   Errors: ${totals.errors}`);

  await prisma.$disconnect();
}

main().catch(console.error);

