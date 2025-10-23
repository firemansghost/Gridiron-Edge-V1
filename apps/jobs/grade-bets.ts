import { PrismaClient, BetResult, BetType, BetSide } from '@prisma/client';

/**
 * Outcome grading job
 * - Grades ungraded bets where the underlying game is final
 * - Fills closePrice from last market line at kickoff if missing
 * - Computes PnL and CLV
 * - Idempotent: only grades bets with result=null unless --force
 */

const prisma = new PrismaClient();

type Args = {
  force: boolean;
  limit: number;
  season?: number;
  week?: number;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = { force: false, limit: 500 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') args.force = true;
    else if (a === '--limit' && argv[i + 1]) {
      args.limit = Math.max(1, parseInt(argv[++i]!, 10) || 500);
    } else if (a === '--season' && argv[i + 1]) {
      args.season = parseInt(argv[++i]!, 10);
    } else if (a === '--week' && argv[i + 1]) {
      args.week = parseInt(argv[++i]!, 10);
    }
  }
  return args;
}

function americanToProb(price: number): number {
  if (price === 0 || !isFinite(price)) return 0;
  return price > 0 ? 100 / (price + 100) : Math.abs(price) / (Math.abs(price) + 100);
}

async function findCloseLineAtCutoff(
  gameId: string,
  marketType: BetType,
  cutoff: Date
): Promise<number | null> {
  // Use the same logic as the web app helper for consistency
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

type GradeCounts = {
  graded: number;
  pushes: number;
  failed: number;
  filledClosePrice: number;
};

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
    if (sideMargin > closeLine) result = 'win';
    else if (sideMargin < closeLine) result = 'loss';
    else result = 'push';
  } else {
    // total
    if (side === 'over') {
      if (totalPts > closeLine) result = 'win';
      else if (totalPts < closeLine) result = 'loss';
      else result = 'push';
    } else {
      if (totalPts < closeLine) result = 'win';
      else if (totalPts > closeLine) result = 'loss';
      else result = 'push';
    }
  }

  // PnL: assume -110 if no explicit price (profit if win, else -stake, push 0)
  const winProfit = stake * (100 / 110);
  const pnl = result === 'win' ? winProfit : result === 'loss' ? -stake : 0;

  // CLV (bettor perspective)
  let clv: number;
  if (marketType === 'spread') {
    clv = side === 'home' ? modelLine - closeLine : closeLine - modelLine;
  } else {
    clv = side === 'over' ? modelLine - closeLine : closeLine - modelLine;
  }

  return { result, pnl, clv };
}

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

async function main() {
  const args = parseArgs();

  console.log('🧮 Grade Bets Job');
  console.log(`   force=${args.force} limit=${args.limit} season=${args.season ?? '-'} week=${args.week ?? '-'}`);

  // Find candidate bets to grade
  const whereClause: any = {
    ...(args.force ? {} : { result: null }),
    ...(args.season ? { season: args.season } : {}),
    ...(args.week ? { week: args.week } : {}),
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
    take: args.limit
  });

  console.log(`   Found ${candidates.length} bet(s) to grade`);

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

      // If still no close price, we can grade result (except ML CLV) but prefer to skip to keep data consistent
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
        const modelLine = Number(bet.modelPrice); // modelPrice stores line for spread/total in our design
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
      console.error(`   ❌ Failed to grade bet ${bet.id}:`, (err as Error).message);
      counts.failed++;
    }
  }

  console.log(`\n[GRADE_BETS] Summary:`);
  console.log(`   graded=${counts.graded} pushes=${counts.pushes} failed=${counts.failed} filledClosePrice=${counts.filledClosePrice}`);
}

main()
  .catch((e) => {
    console.error('Fatal error grading bets:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


