/**
 * Grading Service
 * 
 * Serverless-friendly grading logic extracted from grade-bets.ts script.
 * Grades strategy-run bets based on final game scores.
 * 
 * This service can be called directly from API routes without spawning child processes.
 */

import { PrismaClient, BetResult, BetType, BetSide } from '@prisma/client';
import { prisma } from '../prisma';

export interface GradeCounts {
  graded: number;
  pushes: number;
  failed: number;
  filledClosePrice: number;
}

export interface GradeOptions {
  season?: number;
  week?: number;
  limit?: number;
  force?: boolean; // If true, re-grade bets that already have results
}

/**
 * Convert American odds to implied probability
 */
function americanToProb(price: number): number {
  if (price === 0 || !isFinite(price)) return 0;
  return price > 0 ? 100 / (price + 100) : Math.abs(price) / (Math.abs(price) + 100);
}

/**
 * Find the closing line at kickoff time for a game
 */
async function findCloseLineAtCutoff(
  gameId: string,
  marketType: BetType,
  cutoff: Date
): Promise<number | null> {
  // First try to find line at or before kickoff
  const preKickoffLine = await prisma.marketLine.findFirst({
    where: {
      gameId,
      lineType: marketType === 'moneyline' ? 'moneyline' : marketType,
      timestamp: { lte: cutoff }
    },
    orderBy: { timestamp: 'desc' }
  });

  if (preKickoffLine) {
    return Number(preKickoffLine.lineValue);
  }

  // Fallback: get the latest line regardless of time
  const latestLine = await prisma.marketLine.findFirst({
    where: {
      gameId,
      lineType: marketType === 'moneyline' ? 'moneyline' : marketType
    },
    orderBy: { timestamp: 'desc' }
  });

  return latestLine ? Number(latestLine.lineValue) : null;
}

/**
 * Grade a spread or total bet
 */
function gradeSpreadTotal(
  marketType: BetType,
  side: BetSide,
  modelLine: number,
  closeLine: number,
  margin: number,
  totalPts: number,
  stake: number
): { result: BetResult; pnl: number; clv: number } {
  let result: BetResult;
  if (marketType === 'spread') {
    // Compare from side perspective
    const sideMargin = side === 'home' ? margin : -margin;
    const diff = sideMargin - closeLine;
    
    // Check for push (within 0.5, accounting for floating point precision)
    if (Math.abs(diff) < 0.5) {
      result = 'push';
    } else {
      result = diff > 0 ? 'win' : 'loss';
    }
  } else {
    // total
    const diff = side === 'over' ? totalPts - closeLine : closeLine - totalPts;
    if (Math.abs(diff) < 0.5) {
      result = 'push';
    } else {
      result = diff > 0 ? 'win' : 'loss';
    }
  }

  // PnL: assume -110 odds (win = stake * 0.909, loss = -stake, push = 0)
  const pnl = result === 'win' ? stake * 0.909 : result === 'loss' ? -stake : 0;

  // CLV (bettor perspective)
  let clv: number;
  if (marketType === 'spread') {
    clv = side === 'home' ? modelLine - closeLine : closeLine - modelLine;
  } else {
    clv = side === 'over' ? modelLine - closeLine : closeLine - modelLine;
  }

  return { result, pnl, clv };
}

/**
 * Grade a moneyline bet
 */
function gradeMoneyline(
  side: BetSide,
  modelPrice: number,
  closePrice: number,
  margin: number,
  stake: number
): { result: BetResult; pnl: number; clv: number } {
  // Winner
  let winner: 'home' | 'away' | 'push';
  if (margin > 0) winner = 'home';
  else if (margin < 0) winner = 'away';
  else winner = 'push';

  let result: BetResult;
  if (winner === 'push') result = 'push';
  else result = (side === winner ? 'win' : 'loss');

  // PnL using American odds
  let pnl = 0;
  if (result === 'win') {
    if (modelPrice < 0) pnl = stake * (100 / Math.abs(modelPrice));
    else pnl = stake * (modelPrice / 100);
  } else if (result === 'loss') {
    pnl = -stake;
  }

  // CLV in probability space for bet side
  const pModel = americanToProb(modelPrice);
  const pClose = americanToProb(closePrice);
  const clv = pModel - pClose;

  return { result, pnl, clv };
}

/**
 * Grade available bets for a season/week
 * 
 * @param options Grading options (season, week, limit, force)
 * @returns Counts of graded bets, pushes, failures, and filled close prices
 */
export async function gradeAvailableBets(options: GradeOptions = {}): Promise<GradeCounts> {
  const {
    season,
    week,
    limit = 500,
    force = false,
  } = options;

  // Find candidate bets to grade
  // Only grade strategy_run bets (not manual entries)
  const whereClause: any = {
    source: 'strategy_run', // Only grade strategy-run bets
    ...(force ? {} : { result: null }),
    ...(season ? { season } : {}),
    ...(week ? { week } : {}),
    game: {
      // Only grade bets for games that are actually final
      status: 'final',
      homeScore: { not: null },
      awayScore: { not: null }
    }
  };

  const candidates = await prisma.bet.findMany({
    where: whereClause,
    include: { game: true },
    take: limit
  });

  const counts: GradeCounts = { graded: 0, pushes: 0, failed: 0, filledClosePrice: 0 };

  for (const bet of candidates) {
    try {
      const game = bet.game as any;
      if (!game || game.homeScore == null || game.awayScore == null || !game.date) {
        counts.failed++;
        continue;
      }

      const margin = Number(game.homeScore) - Number(game.awayScore);
      const totalPts = Number(game.homeScore) + Number(game.awayScore);
      const kickoff = new Date(game.date);

      let closePrice = bet.closePrice != null ? Number(bet.closePrice) : null;
      if (closePrice == null) {
        const fetched = await findCloseLineAtCutoff(bet.gameId, bet.marketType, kickoff);
        if (fetched != null) {
          closePrice = fetched;
          counts.filledClosePrice++;
        }
      }

      // If still no close price, skip to keep data consistent
      if (closePrice == null) {
        counts.failed++;
        continue;
      }

      const stake = Number(bet.stake);
      const side = bet.side as BetSide;

      let result: BetResult;
      let pnl = 0;
      let clv = 0;

      if (bet.marketType === 'moneyline') {
        const modelPrice = Number(bet.modelPrice);
        const graded = gradeMoneyline(side, modelPrice, closePrice, margin, stake);
        result = graded.result; pnl = graded.pnl; clv = graded.clv;
      } else {
        const modelLine = Number(bet.modelPrice); // modelPrice stores line for spread/total
        const graded = gradeSpreadTotal(bet.marketType, side, modelLine, closePrice, margin, totalPts, stake);
        result = graded.result; pnl = graded.pnl; clv = graded.clv;
      }

      await prisma.bet.update({
        where: { id: bet.id },
        data: {
          result,
          pnl,
          clv,
          closePrice,
        }
      });

      counts.graded++;
      if (result === 'push') counts.pushes++;
    } catch (err) {
      console.error(`Failed to grade bet ${bet.id}:`, (err as Error).message);
      counts.failed++;
    }
  }

  return counts;
}

