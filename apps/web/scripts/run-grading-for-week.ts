/**
 * Run Grading for a Week
 * 
 * Manually triggers grading for a specific season/week.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/run-grading-for-week.ts 2025 10
 */

import { prisma } from '../lib/prisma';

async function runGrading(season: number, week: number) {
  console.log(`\n🎯 Running grading for ${season} Week ${week}\n`);

  // Call the grading API logic directly
  const whereClause: any = {
    season,
    week,
    source: 'strategy_run',
    result: null, // Only grade bets with null result
  };

  const ungradedBets = await prisma.bet.findMany({
    where: whereClause,
    include: {
      game: {
        select: {
          id: true,
          date: true,
          homeScore: true,
          awayScore: true,
        },
      },
    },
  });

  console.log(`Found ${ungradedBets.length} ungraded bets`);

  let graded = 0;
  let pushes = 0;
  let failed = 0;
  let filledClosePrice = 0;

  for (const bet of ungradedBets) {
    try {
      const game = bet.game;
      
      // Skip if game hasn't finished (no scores)
      if (game.homeScore === null || game.awayScore === null) {
        continue;
      }

      const kickoffTime = new Date(game.date);
      const now = new Date();
      
      // Skip if game hasn't started yet
      if (kickoffTime > now) {
        continue;
      }

      // Fill closePrice if missing
      let closePrice: any = bet.closePrice;
      if (!closePrice) {
        const latestLine = await prisma.marketLine.findFirst({
          where: {
            gameId: bet.gameId,
            lineType: bet.marketType === 'moneyline' ? 'moneyline' : bet.marketType,
            timestamp: { lte: kickoffTime },
          },
          orderBy: { timestamp: 'desc' },
        });
        
        if (latestLine) {
          closePrice = latestLine.lineValue;
          filledClosePrice++;
        }
      }

      // Calculate result
      const homeScore = Number(game.homeScore);
      const awayScore = Number(game.awayScore);
      const margin = homeScore - awayScore;
      const totalPoints = homeScore + awayScore;

      let result: 'win' | 'loss' | 'push' | null = null;
      let pnl: number | null = null;
      let clv: number | null = null;

      if (bet.marketType === 'spread') {
        const closeLine = Number(closePrice) || 0;
        const sideMargin = bet.side === 'home' ? margin : -margin;
        const diff = sideMargin - closeLine;
        
        if (Math.abs(diff) < 0.5) {
          result = 'push';
          pnl = 0;
        } else {
          result = diff > 0 ? 'win' : 'loss';
          pnl = result === 'win' ? Number(bet.stake) * 0.909 : -Number(bet.stake);
        }
        
        if (closePrice) {
          const modelLine = Number(bet.modelPrice);
          const closeLineNum = Number(closePrice);
          if (bet.side === 'home') {
            clv = modelLine - closeLineNum;
          } else {
            clv = closeLineNum - modelLine;
          }
        }
      } else if (bet.marketType === 'total') {
        const totalLine = Number(closePrice) || 0;
        let betWins = false;
        
        if (bet.side === 'over') {
          betWins = totalPoints > totalLine;
        } else if (bet.side === 'under') {
          betWins = totalPoints < totalLine;
        }
        
        if (Math.abs(totalPoints - totalLine) < 0.5) {
          result = 'push';
          pnl = 0;
        } else {
          result = betWins ? 'win' : 'loss';
          pnl = betWins ? Number(bet.stake) * 0.909 : -Number(bet.stake);
        }
        
        if (closePrice) {
          const modelLine = Number(bet.modelPrice);
          const closeLine = Number(closePrice);
          if (bet.side === 'over') {
            clv = modelLine - closeLine;
          } else {
            clv = closeLine - modelLine;
          }
        }
      } else if (bet.marketType === 'moneyline') {
        let betWins = false;
        
        if (bet.side === 'home') {
          betWins = margin > 0;
        } else if (bet.side === 'away') {
          betWins = margin < 0;
        }
        
        if (margin === 0) {
          result = 'push';
          pnl = 0;
        } else {
          result = betWins ? 'win' : 'loss';
          if (betWins) {
            const odds = Number(bet.modelPrice);
            if (odds < 0) {
              pnl = Number(bet.stake) * (100 / Math.abs(odds));
            } else {
              pnl = Number(bet.stake) * (odds / 100);
            }
          } else {
            pnl = -Number(bet.stake);
          }
        }
        
        if (closePrice) {
          const modelOdds = Number(bet.modelPrice);
          const closeOdds = Number(closePrice);
          const modelProb = modelOdds < 0 ? 100 / (100 + Math.abs(modelOdds)) : modelOdds / (100 + modelOdds);
          const closeProb = closeOdds < 0 ? 100 / (100 + Math.abs(closeOdds)) : closeOdds / (100 + closeOdds);
          clv = modelProb - closeProb;
        }
      }

      // Update the bet
      if (result) {
        await prisma.bet.update({
          where: { id: bet.id },
          data: {
            result: result as any,
            pnl: pnl ? Number(pnl) : null,
            clv: clv ? Number(clv) : null,
            closePrice: closePrice || bet.closePrice,
            updatedAt: new Date(),
          },
        });

        graded++;
        if (result === 'push') pushes++;
      }

    } catch (err) {
      console.error(`Failed to grade bet ${bet.id}:`, err);
      failed++;
    }
  }

  console.log(`\n✅ Grading complete:`);
  console.log(`   Graded: ${graded}`);
  console.log(`   Pushes: ${pushes}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Filled close prices: ${filledClosePrice}`);
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: npx tsx apps/web/scripts/run-grading-for-week.ts <season> <week>');
    console.error('Example: npx tsx apps/web/scripts/run-grading-for-week.ts 2025 10');
    process.exit(1);
  }

  const season = parseInt(args[0]);
  const week = parseInt(args[1]);

  if (isNaN(season) || isNaN(week)) {
    console.error('Error: season and week must be valid numbers');
    process.exit(1);
  }

  try {
    await runGrading(season, week);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

