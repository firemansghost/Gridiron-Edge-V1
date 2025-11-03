#!/usr/bin/env node

/**
 * Backtesting Runner
 * 
 * Runs historical backtests to evaluate model performance.
 * 
 * Logic:
 * 1. Freeze projections at a snapshot timestamp (as-of date)
 * 2. Load matchup outputs created before snapshot
 * 3. Load market lines available at snapshot
 * 4. Load game results
 * 5. Calculate hypothetical bets and outcomes
 * 6. Compute metrics: hit rate, CLV, ROI, drawdown, Kelly fraction
 * 
 * Usage:
 *   node apps/jobs/dist/src/backtesting/backtest_runner.js --season 2024 --snapshot-date "2024-10-01T00:00:00Z" --model-version v1
 */

import { PrismaClient, EdgeConfidence } from '@prisma/client';

const prisma = new PrismaClient();

interface BacktestConfig {
  season: number;
  snapshotDate: Date; // Freeze projections as-of this date
  modelVersion?: string; // Default: 'v1'
  minEdge?: number; // Minimum edge threshold (default: 0)
  minConfidence?: EdgeConfidence; // Minimum confidence tier
  betSizing?: 'flat' | 'kelly'; // Bet sizing strategy
  maxBetSize?: number; // Maximum bet size as fraction of bankroll (default: 0.05 = 5%)
  initialBankroll?: number; // Starting bankroll (default: 1000)
}

interface BetResult {
  gameId: string;
  season: number;
  week: number;
  marketType: 'spread' | 'total' | 'moneyline';
  modelPrice: number; // Model's projected line
  marketPrice: number; // Market line at snapshot
  closingPrice: number; // Closing line
  edge: number; // modelPrice - marketPrice
  confidence: EdgeConfidence;
  stake: number; // Amount bet
  result: 'win' | 'loss' | 'push' | null; // null = game not completed
  payout: number; // Payout amount (negative if loss)
  clv: number; // Closing line value (marketPrice - closingPrice)
  pnl: number; // Profit/Loss for this bet
}

interface BacktestResults {
  config: BacktestConfig;
  totalBets: number;
  completedBets: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number; // wins / (wins + losses) excluding pushes
  totalStaked: number;
  totalPnL: number;
  roi: number; // (totalPnL / totalStaked) * 100
  avgClv: number; // Average closing line value
  maxDrawdown: number; // Maximum peak-to-trough drawdown
  peakBankroll: number;
  finalBankroll: number;
  kellyFraction?: number; // Optimal Kelly fraction
  results: BetResult[];
}

/**
 * Get the latest matchup output for a game before snapshot date
 */
async function getFrozenProjection(gameId: string, snapshotDate: Date, modelVersion: string) {
  const output = await prisma.matchupOutput.findFirst({
    where: {
      gameId,
      modelVersion,
      createdAt: { lte: snapshotDate },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return output;
}

/**
 * Get the market line closest to snapshot date (before or at snapshot)
 */
async function getMarketLineAtSnapshot(
  gameId: string,
  lineType: 'spread' | 'total',
  snapshotDate: Date
) {
  const line = await prisma.marketLine.findFirst({
    where: {
      gameId,
      lineType,
      timestamp: { lte: snapshotDate },
    },
    orderBy: {
      timestamp: 'desc',
    },
  });

  return line;
}

/**
 * Get the closing line (latest line before game)
 */
async function getClosingLine(gameId: string, lineType: 'spread' | 'total') {
  const line = await prisma.marketLine.findFirst({
    where: {
      gameId,
      lineType,
    },
    orderBy: {
      timestamp: 'desc',
    },
  });

  return line;
}

/**
 * Calculate bet result for spread bet
 */
function calculateSpreadResult(
  modelSpread: number,
  marketSpread: number,
  closingSpread: number,
  homeScore: number,
  awayScore: number
): { result: 'win' | 'loss' | 'push'; clv: number } {
  const actualMargin = homeScore - awayScore;
  const clv = marketSpread - closingSpread; // Positive = we got better line

  // For spread bets: we bet on the model's favored team
  // If model says home -3.5, we bet home -3.5
  // Market says home -4.5, so we bet home -4.5 (better for us)
  // Closing is home -5.5, CLV = 1.0 (we got 1 pt better than closing)

  // Win if actual margin covers the market spread we bet
  if (actualMargin > marketSpread) {
    return { result: 'win', clv };
  } else if (actualMargin < marketSpread) {
    return { result: 'loss', clv };
  } else {
    return { result: 'push', clv };
  }
}

/**
 * Calculate bet result for total bet
 */
function calculateTotalResult(
  modelTotal: number,
  marketTotal: number,
  closingTotal: number,
  homeScore: number,
  awayScore: number
): { result: 'win' | 'loss' | 'push'; clv: number } {
  const actualTotal = homeScore + awayScore;
  const clv = marketTotal - closingTotal; // Positive = we got better line

  // Over bet wins if actual > market
  // For simplicity, assume we always bet over when model says over
  if (actualTotal > marketTotal) {
    return { result: 'win', clv };
  } else if (actualTotal < marketTotal) {
    return { result: 'loss', clv };
  } else {
    return { result: 'push', clv };
  }
}

/**
 * Calculate bet sizing using flat or Kelly criterion
 */
function calculateBetSize(
  edge: number,
  confidence: EdgeConfidence,
  config: BacktestConfig,
  currentBankroll: number
): number {
  if (config.betSizing === 'kelly') {
    // Simplified Kelly: edge / closing_line for spread/total
    // Using 1/4 Kelly for safety
    const kellyFraction = Math.abs(edge) / 10.0; // Simplified: assume avg closing line ~10
    const quarterKelly = kellyFraction * 0.25;
    const betSize = Math.min(quarterKelly, config.maxBetSize || 0.05);
    return currentBankroll * betSize;
  } else {
    // Flat betting: fixed % of bankroll
    const betSize = config.maxBetSize || 0.05; // 5% default
    return currentBankroll * betSize;
  }
}

/**
 * Run backtest
 */
export async function runBacktest(config: BacktestConfig): Promise<BacktestResults> {
  const modelVersion = config.modelVersion || 'v1';
  const minEdge = config.minEdge || 0;
  const initialBankroll = config.initialBankroll || 1000;

  console.log(`\n🧪 Running backtest...`);
  console.log(`   Season: ${config.season}`);
  console.log(`   Snapshot: ${config.snapshotDate.toISOString()}`);
  console.log(`   Model: ${modelVersion}`);
  console.log(`   Min Edge: ${minEdge} pts`);
  console.log(`   Bet Sizing: ${config.betSizing || 'flat'}`);
  console.log(`   Initial Bankroll: $${initialBankroll.toFixed(2)}\n`);

  // Load all games for the season
  const games = await prisma.game.findMany({
    where: {
      season: config.season,
      status: 'final', // Only completed games
      homeScore: { not: null },
      awayScore: { not: null },
    },
    orderBy: [
      { week: 'asc' },
      { date: 'asc' },
    ],
  });

  console.log(`📊 Found ${games.length} completed games for season ${config.season}\n`);

  const results: BetResult[] = [];
  let currentBankroll = initialBankroll;
  let peakBankroll = initialBankroll;
  let maxDrawdown = 0;
  let runningPnL = 0;

  for (const game of games) {
    // Get frozen projection
    const projection = await getFrozenProjection(game.id, config.snapshotDate, modelVersion);
    if (!projection) {
      continue; // Skip if no projection available
    }

    // Check edge and confidence
    const spreadEdge = projection.impliedSpread - projection.marketSpread;
    const totalEdge = projection.impliedTotal - projection.marketTotal;

    // Skip if edge too low or confidence too low
    if (config.minConfidence) {
      const confidenceOrder = { A: 3, B: 2, C: 1 };
      if (confidenceOrder[projection.edgeConfidence] < confidenceOrder[config.minConfidence]) {
        continue;
      }
    }

    // Process spread bet if edge meets threshold
    if (Math.abs(spreadEdge) >= minEdge) {
      const marketLine = await getMarketLineAtSnapshot(game.id, 'spread', config.snapshotDate);
      const closingLine = await getClosingLine(game.id, 'spread');

      if (marketLine && closingLine && game.homeScore !== null && game.awayScore !== null) {
        const { result, clv } = calculateSpreadResult(
          projection.impliedSpread,
          projection.marketSpread,
          closingLine.lineValue,
          game.homeScore,
          game.awayScore
        );

        const stake = calculateBetSize(Math.abs(spreadEdge), projection.edgeConfidence, config, currentBankroll);
        const payout = result === 'win' ? stake * 1.91 : result === 'loss' ? -stake : 0; // -110 odds = 1.91 payout
        const pnl = payout;

        results.push({
          gameId: game.id,
          season: game.season,
          week: game.week,
          marketType: 'spread',
          modelPrice: projection.impliedSpread,
          marketPrice: projection.marketSpread,
          closingPrice: closingLine.lineValue,
          edge: spreadEdge,
          confidence: projection.edgeConfidence,
          stake,
          result,
          payout,
          clv,
          pnl,
        });

        currentBankroll += pnl;
        runningPnL += pnl;
        peakBankroll = Math.max(peakBankroll, currentBankroll);
        maxDrawdown = Math.max(maxDrawdown, peakBankroll - currentBankroll);
      }
    }

    // Process total bet if edge meets threshold
    if (Math.abs(totalEdge) >= minEdge) {
      const marketLine = await getMarketLineAtSnapshot(game.id, 'total', config.snapshotDate);
      const closingLine = await getClosingLine(game.id, 'total');

      if (marketLine && closingLine && game.homeScore !== null && game.awayScore !== null) {
        const { result, clv } = calculateTotalResult(
          projection.impliedTotal,
          projection.marketTotal,
          closingLine.lineValue,
          game.homeScore,
          game.awayScore
        );

        const stake = calculateBetSize(Math.abs(totalEdge), projection.edgeConfidence, config, currentBankroll);
        const payout = result === 'win' ? stake * 1.91 : result === 'loss' ? -stake : 0;
        const pnl = payout;

        results.push({
          gameId: game.id,
          season: game.season,
          week: game.week,
          marketType: 'total',
          modelPrice: projection.impliedTotal,
          marketPrice: projection.marketTotal,
          closingPrice: closingLine.lineValue,
          edge: totalEdge,
          confidence: projection.edgeConfidence,
          stake,
          result,
          payout,
          clv,
          pnl,
        });

        currentBankroll += pnl;
        runningPnL += pnl;
        peakBankroll = Math.max(peakBankroll, currentBankroll);
        maxDrawdown = Math.max(maxDrawdown, peakBankroll - currentBankroll);
      }
    }
  }

  // Calculate summary statistics
  const completedBets = results.filter(r => r.result !== null);
  const wins = completedBets.filter(r => r.result === 'win').length;
  const losses = completedBets.filter(r => r.result === 'loss').length;
  const pushes = completedBets.filter(r => r.result === 'push').length;
  const hitRate = wins + losses > 0 ? wins / (wins + losses) : 0;
  const totalStaked = results.reduce((sum, r) => sum + r.stake, 0);
  const totalPnL = results.reduce((sum, r) => sum + r.pnl, 0);
  const roi = totalStaked > 0 ? (totalPnL / totalStaked) * 100 : 0;
  const avgClv = completedBets.length > 0
    ? completedBets.reduce((sum, r) => sum + r.clv, 0) / completedBets.length
    : 0;

  return {
    config,
    totalBets: results.length,
    completedBets: completedBets.length,
    wins,
    losses,
    pushes,
    hitRate,
    totalStaked,
    totalPnL,
    roi,
    avgClv,
    maxDrawdown,
    peakBankroll,
    finalBankroll: currentBankroll,
    results,
  };
}

/**
 * CLI entry point
 */
async function main() {
  try {
    const yargs = require('yargs/yargs');
    const argv = yargs(process.argv.slice(2))
      .option('season', { type: 'number', demandOption: true })
      .option('snapshot-date', { type: 'string', demandOption: true, description: 'ISO date string' })
      .option('model-version', { type: 'string', default: 'v1' })
      .option('min-edge', { type: 'number', default: 0, description: 'Minimum edge threshold' })
      .option('min-confidence', { type: 'string', choices: ['A', 'B', 'C'], description: 'Minimum confidence tier' })
      .option('bet-sizing', { type: 'string', default: 'flat', choices: ['flat', 'kelly'] })
      .option('max-bet-size', { type: 'number', default: 0.05, description: 'Max bet size as fraction (0.05 = 5%)' })
      .option('initial-bankroll', { type: 'number', default: 1000 })
      .parse();

    const config: BacktestConfig = {
      season: argv.season,
      snapshotDate: new Date(argv.snapshotDate),
      modelVersion: argv.modelVersion,
      minEdge: argv.minEdge,
      minConfidence: argv.minConfidence,
      betSizing: argv.betSizing,
      maxBetSize: argv.maxBetSize,
      initialBankroll: argv.initialBankroll,
    };

    const results = await runBacktest(config);

    // Print results
    console.log(`\n📊 Backtest Results:\n`);
    console.log(`   Total Bets: ${results.totalBets}`);
    console.log(`   Completed: ${results.completedBets}`);
    console.log(`   Wins: ${results.wins}`);
    console.log(`   Losses: ${results.losses}`);
    console.log(`   Pushes: ${results.pushes}`);
    console.log(`   Hit Rate: ${(results.hitRate * 100).toFixed(2)}%`);
    console.log(`   Total Staked: $${results.totalStaked.toFixed(2)}`);
    console.log(`   Total P/L: $${results.totalPnL.toFixed(2)}`);
    console.log(`   ROI: ${results.roi.toFixed(2)}%`);
    console.log(`   Avg CLV: ${results.avgClv.toFixed(2)} pts`);
    console.log(`   Max Drawdown: $${results.maxDrawdown.toFixed(2)}`);
    console.log(`   Final Bankroll: $${results.finalBankroll.toFixed(2)}`);
    console.log(`   Bankroll Growth: ${((results.finalBankroll / config.initialBankroll - 1) * 100).toFixed(2)}%\n`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

