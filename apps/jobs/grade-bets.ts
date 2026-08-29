import { PrismaClient, BetResult, BetType, BetSide } from '@prisma/client';
import {
  findCloseLineAtCutoff,
  gradeMoneyline,
  gradeSpreadTotal,
  isOfficial2026MissingClosePrice,
  type GradeMarketType,
} from './lib/grading-settlement';

/**
 * Outcome grading job (2C-2J-6A)
 * - Grades ungraded bets where the underlying game is final
 * - Fills closePrice from side-aware pre-kick MarketLine if missing (legacy only)
 * - 2026 official_flat_100 missing closePrice → fail closed (no MarketLine guess)
 * - Moneyline PnL uses sportsbook closePrice, never modelPrice
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

type GradeCounts = {
  graded: number;
  pushes: number;
  failed: number;
  filledClosePrice: number;
};

async function main() {
  const args = parseArgs();

  console.log('🧮 Grade Bets Job');
  console.log(
    `   force=${args.force} limit=${args.limit} season=${args.season ?? '-'} week=${args.week ?? '-'}`
  );

  const whereClause: any = {
    source: 'strategy_run',
    ...(args.force ? {} : { result: null }),
    ...(args.season ? { season: args.season } : {}),
    ...(args.week ? { week: args.week } : {}),
    game: {
      status: 'final',
      homeScore: { not: null },
      awayScore: { not: null },
    },
  };

  const candidates = await prisma.bet.findMany({
    where: whereClause,
    include: { game: true },
    take: args.limit,
  });

  console.log(`   Found ${candidates.length} bet(s) to grade`);

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
          marketType as Exclude<BetType, 'moneyline'>,
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
      console.error(`   ❌ Failed to grade bet ${bet.id}:`, (err as Error).message);
      counts.failed++;
    }
  }

  console.log(`\n[GRADE_BETS] Summary:`);
  console.log(
    `   graded=${counts.graded} pushes=${counts.pushes} failed=${counts.failed} filledClosePrice=${counts.filledClosePrice}`
  );
}

main()
  .catch((e) => {
    console.error('Fatal error grading bets:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
