/**
 * Totals Model V1 Training Script
 * 
 * Fits β where: actualTotal - closingTotal ≈ β * (modelSpread - closingSpread)
 * 
 * Uses historical games with:
 * - Final scores (homeScore, awayScore)
 * - Closing spreads and totals from MarketLine
 * - Core V1 model spreads computed retroactively
 */

import { PrismaClient } from '@prisma/client';
import { getCoreV1SpreadFromTeams } from '../lib/core-v1-spread';
import { selectClosingLine } from '../lib/closing-line-helpers';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface TrainingRow {
  gameId: string;
  season: number;
  week: number;
  closingSpread: number;
  closingTotal: number;
  modelSpread: number;
  actualTotal: number;
  spreadDiff: number;
  residualTotal: number;
}

interface TotalsConfig {
  beta_spread_diff_to_total: number;
  max_overlay_points: number;
  min_edge_for_pick: number;
  grade_thresholds: {
    A: number;
    B: number;
    C: number;
  };
  training_stats: {
    sample_size: number;
    r_squared: number;
    mean_abs_error: number;
    beta_std_error?: number;
  };
  trained_on: string;
  timestamp: string;
}

/**
 * Simple linear regression: y = βx
 * Returns β that minimizes Σ(y - βx)²
 */
function fitLinearRegression(x: number[], y: number[]): { beta: number; rSquared: number; mae: number } {
  if (x.length !== y.length || x.length === 0) {
    throw new Error('Arrays must have same length and be non-empty');
  }

  // Compute β = Σ(xy) / Σ(x²)
  let sumXY = 0;
  let sumX2 = 0;
  let sumY = 0;
  let sumY2 = 0;

  for (let i = 0; i < x.length; i++) {
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY += y[i];
    sumY2 += y[i] * y[i];
  }

  const beta = sumX2 !== 0 ? sumXY / sumX2 : 0;

  // Compute R² and MAE
  const n = x.length;
  const meanY = sumY / n;
  let ssRes = 0; // Sum of squares of residuals
  let ssTot = 0; // Total sum of squares
  let absErrors: number[] = [];

  for (let i = 0; i < x.length; i++) {
    const predicted = beta * x[i];
    const residual = y[i] - predicted;
    ssRes += residual * residual;
    ssTot += (y[i] - meanY) * (y[i] - meanY);
    absErrors.push(Math.abs(residual));
  }

  const rSquared = ssTot !== 0 ? 1 - (ssRes / ssTot) : 0;
  const mae = absErrors.reduce((a, b) => a + b, 0) / absErrors.length;

  return { beta, rSquared, mae };
}

async function main() {
  console.log('🚂 Training Totals Model V1...\n');

  // Fetch final games with scores
  console.log('📊 Fetching final games with scores...');
  const finalGames = await prisma.game.findMany({
    where: {
      status: 'final',
      homeScore: { not: null },
      awayScore: { not: null },
      season: { gte: 2024 }, // Focus on recent seasons
    },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
    orderBy: [
      { season: 'desc' },
      { week: 'desc' },
    ],
  });

  console.log(`   Found ${finalGames.length} final games\n`);

  // Process games
  const trainingRows: TrainingRow[] = [];
  let processed = 0;
  let skipped = 0;

  for (const game of finalGames) {
    try {
      // Get closing lines
      const [closingSpread, closingTotal] = await Promise.all([
        selectClosingLine(game.id, 'spread'),
        selectClosingLine(game.id, 'total'),
      ]);

      if (!closingSpread || !closingTotal) {
        skipped++;
        continue;
      }

      // Compute Core V1 spread
      let modelSpreadHma: number;
      try {
        const coreSpreadInfo = await getCoreV1SpreadFromTeams(
          game.season,
          game.homeTeamId,
          game.awayTeamId,
          game.neutralSite || false,
          game.homeTeam.name,
          game.awayTeam.name
        );
        modelSpreadHma = coreSpreadInfo.coreSpreadHma;
      } catch (error) {
        console.warn(`   Skipping ${game.id}: Core V1 computation failed: ${error}`);
        skipped++;
        continue;
      }

      // Get the actual MarketLine to check teamId and convert to HMA
      const spreadLine = await prisma.marketLine.findFirst({
        where: {
          gameId: game.id,
          lineType: 'spread',
          timestamp: { lte: game.date },
        },
        orderBy: { timestamp: 'desc' },
        select: {
          lineValue: true,
          teamId: true,
        },
      });

      if (!spreadLine) {
        skipped++;
        continue;
      }

      // Convert closing spread to HMA format
      // If teamId is set, the spread is for that team (positive = team favored)
      // HMA format: positive = home favored, negative = away favored
      const closingSpreadValue = Number(spreadLine.lineValue);
      let closingSpreadHmaFinal: number;
      
      if (spreadLine.teamId) {
        // Spread is team-specific
        const isHomeTeam = spreadLine.teamId === game.homeTeamId;
        // If home team: positive value means home favored (HMA positive)
        // If away team: positive value means away favored (HMA negative)
        closingSpreadHmaFinal = isHomeTeam ? closingSpreadValue : -closingSpreadValue;
      } else {
        // No teamId - assume lineValue is already in HMA format
        // (This is a fallback, but most spreads should have teamId)
        closingSpreadHmaFinal = closingSpreadValue;
      }

      // Compute actual total
      const actualTotal = (game.homeScore || 0) + (game.awayScore || 0);

      // Compute spreadDiff and residualTotal
      const spreadDiff = modelSpreadHma - closingSpreadHmaFinal;
      const residualTotal = actualTotal - closingTotal.value;

      trainingRows.push({
        gameId: game.id,
        season: game.season,
        week: game.week,
        closingSpread: closingSpreadHmaFinal,
        closingTotal: closingTotal.value,
        modelSpread: modelSpreadHma,
        actualTotal,
        spreadDiff,
        residualTotal,
      });

      processed++;
      if (processed % 100 === 0) {
        console.log(`   Processed ${processed} games...`);
      }
    } catch (error) {
      console.warn(`   Error processing game ${game.id}: ${error}`);
      skipped++;
    }
  }

  console.log(`\n✅ Processed ${processed} games, skipped ${skipped} games\n`);

  if (trainingRows.length < 50) {
    console.error(`❌ Insufficient training data: ${trainingRows.length} rows (need at least 50)`);
    process.exit(1);
  }

  // Extract arrays for regression
  const spreadDiffs = trainingRows.map(r => r.spreadDiff);
  const residualTotals = trainingRows.map(r => r.residualTotal);

  // Fit regression
  console.log('📈 Fitting linear regression: residualTotal ≈ β * spreadDiff...');
  const { beta, rSquared, mae } = fitLinearRegression(spreadDiffs, residualTotals);

  console.log(`\n📊 Training Results:`);
  console.log(`   β (beta_spread_diff_to_total): ${beta.toFixed(4)}`);
  console.log(`   R²: ${rSquared.toFixed(4)}`);
  console.log(`   MAE: ${mae.toFixed(2)} pts`);
  console.log(`   Sample size: ${trainingRows.length}`);

  // Create config
  const config: TotalsConfig = {
    beta_spread_diff_to_total: beta,
    max_overlay_points: 4.0,
    min_edge_for_pick: 2.5,
    grade_thresholds: {
      A: 6.0,
      B: 4.0,
      C: 2.5,
    },
    training_stats: {
      sample_size: trainingRows.length,
      r_squared: rSquared,
      mean_abs_error: mae,
    },
    trained_on: new Date().toISOString(),
    timestamp: new Date().toISOString(),
  };

  // Write config file
  const configPath = path.join(__dirname, '../lib/data/core_v1_totals_config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`\n✅ Wrote config to: ${configPath}`);

  // Sample diagnostics
  console.log(`\n📋 Sample predictions (first 10):`);
  for (let i = 0; i < Math.min(10, trainingRows.length); i++) {
    const row = trainingRows[i];
    const predictedResidual = beta * row.spreadDiff;
    const predictedTotal = row.closingTotal + predictedResidual;
    console.log(`   Game ${row.gameId}: spreadDiff=${row.spreadDiff.toFixed(2)}, actualResidual=${row.residualTotal.toFixed(2)}, predictedResidual=${predictedResidual.toFixed(2)}, actualTotal=${row.actualTotal}, predictedTotal=${predictedTotal.toFixed(1)}`);
  }

  await prisma.$disconnect();
  console.log('\n✅ Training complete!');
}

main().catch((error) => {
  console.error('❌ Training failed:', error);
  process.exit(1);
});

