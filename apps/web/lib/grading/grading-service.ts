/**
 * Grading Service (2C-2J-6A)
 *
 * Serverless-friendly grading for strategy-run bets with final scores.
 * Settlement math lives in ./settlement.ts — moneyline PnL uses closePrice.
 */

import { BetResult, BetSide, BetType } from '@prisma/client';
import { prisma } from '../prisma';
import {
  findCloseLineAtCutoff,
  gradeMoneyline,
  gradeSpreadTotal,
  isOfficial2026MissingClosePrice,
  type GradeMarketType,
} from './settlement';

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
  force?: boolean;
}

function prismaCloseLineDeps() {
  return {
    findFirst: async (args: {
      where: Record<string, unknown>;
      orderBy: Array<Record<string, 'asc' | 'desc'>>;
    }) =>
      prisma.marketLine.findFirst({
        where: args.where as any,
        orderBy: args.orderBy as any,
        select: { lineValue: true, id: true },
      }),
  };
}

/**
 * Grade available bets for a season/week.
 */
export async function gradeAvailableBets(
  options: GradeOptions = {}
): Promise<GradeCounts> {
  const { season, week, limit = 500, force = false } = options;

  const whereClause: any = {
    source: 'strategy_run',
    ...(force ? {} : { result: null }),
    ...(season ? { season } : {}),
    ...(week ? { week } : {}),
    game: {
      status: 'final',
      homeScore: { not: null },
      awayScore: { not: null },
    },
  };

  const candidates = await prisma.bet.findMany({
    where: whereClause,
    include: { game: true },
    take: limit,
  });

  const counts: GradeCounts = {
    graded: 0,
    pushes: 0,
    failed: 0,
    filledClosePrice: 0,
  };

  for (const bet of candidates) {
    try {
      const game = bet.game as any;
      if (
        !game ||
        game.homeScore == null ||
        game.awayScore == null ||
        !game.date
      ) {
        counts.failed++;
        continue;
      }

      const margin = Number(game.homeScore) - Number(game.awayScore);
      const totalPts = Number(game.homeScore) + Number(game.awayScore);
      const kickoff = new Date(game.date);
      const side = bet.side as BetSide;
      const marketType = bet.marketType as GradeMarketType;

      // Explicit null check — closePrice=0 (pick'em) is valid.
      let closePrice: number | null =
        bet.closePrice !== null && bet.closePrice !== undefined
          ? Number(bet.closePrice)
          : null;

      if (
        isOfficial2026MissingClosePrice({
          season: bet.season,
          strategyTag: bet.strategyTag,
          closePrice,
        })
      ) {
        // Do not guess/reconstruct; do not mutate the Bet.
        counts.failed++;
        continue;
      }

      if (closePrice === null) {
        const fetched = await findCloseLineAtCutoff(prismaCloseLineDeps(), {
          gameId: bet.gameId,
          marketType,
          side,
          homeTeamId: game.homeTeamId,
          awayTeamId: game.awayTeamId,
          cutoff: kickoff,
        });
        if (fetched !== null && fetched !== undefined) {
          closePrice = fetched;
          counts.filledClosePrice++;
        }
      }

      if (closePrice === null || closePrice === undefined) {
        counts.failed++;
        continue;
      }

      const stake = Number(bet.stake);
      let result: BetResult;
      let pnl = 0;
      let clv = 0;

      if (marketType === 'moneyline') {
        const modelPrice = Number(bet.modelPrice);
        const graded = gradeMoneyline(
          side,
          modelPrice,
          closePrice,
          margin,
          stake
        );
        result = graded.result as BetResult;
        pnl = graded.pnl;
        clv = graded.clv;
      } else {
        const modelLine = Number(bet.modelPrice);
        const graded = gradeSpreadTotal(
          marketType,
          side,
          modelLine,
          closePrice,
          margin,
          totalPts,
          stake
        );
        result = graded.result as BetResult;
        pnl = graded.pnl;
        clv = graded.clv;
      }

      // Persist numeric zeros explicitly (do not coerce 0 → null).
      await prisma.bet.update({
        where: { id: bet.id },
        data: {
          result,
          pnl,
          clv,
          closePrice,
        },
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

// Re-export settlement helpers for callers/tests.
export {
  americanOddsWinPnl,
  americanToProb,
  findCloseLineAtCutoff,
  gradeMoneyline,
  gradeSpreadTotal,
  isOfficial2026MissingClosePrice,
  isValidAmericanOdds,
  resolveSideTeamId,
} from './settlement';
