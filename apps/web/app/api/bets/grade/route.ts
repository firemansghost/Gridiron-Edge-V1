import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    // Check if grading UI is enabled
    if (process.env.NEXT_PUBLIC_ENABLE_GRADE_UI !== 'true') {
      return NextResponse.json({ error: 'Grading UI not enabled' }, { status: 403 });
    }

    const { season, week } = await request.json();

    if (!season) {
      return NextResponse.json({ error: 'Season is required' }, { status: 400 });
    }

    // Find ungraded bets for the specified season/week
    const whereClause: any = {
      season: parseInt(season),
      result: null,
    };
    
    if (week) {
      whereClause.week = parseInt(week);
    }

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
        let closePrice = bet.closePrice;
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

        let result: 'W' | 'L' | 'Push' | null = null;
        let pnl: number | null = null;
        let clv: number | null = null;

        if (bet.marketType === 'spread') {
          const spreadLine = Number(closePrice) || 0;
          let betWins = false;
          
          if (bet.side === 'home') {
            betWins = margin > spreadLine;
          } else if (bet.side === 'away') {
            betWins = -margin > spreadLine;
          }
          
          if (Math.abs(margin - spreadLine) < 0.5) {
            result = 'Push';
            pnl = 0;
          } else {
            result = betWins ? 'W' : 'L';
            pnl = betWins ? Number(bet.stake) * 0.909 : -Number(bet.stake); // -110 odds
          }
          
          // Calculate CLV
          if (closePrice) {
            const modelLine = Number(bet.modelPrice);
            const closeLine = Number(closePrice);
            if (bet.side === 'home') {
              clv = modelLine - closeLine;
            } else {
              clv = closeLine - modelLine;
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
            result = 'Push';
            pnl = 0;
          } else {
            result = betWins ? 'W' : 'L';
            pnl = betWins ? Number(bet.stake) * 0.909 : -Number(bet.stake);
          }
          
          // Calculate CLV
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
            result = 'Push';
            pnl = 0;
          } else {
            result = betWins ? 'W' : 'L';
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
          
          // Calculate CLV for moneyline
          if (closePrice) {
            const modelOdds = Number(bet.modelPrice);
            const closeOdds = Number(closePrice);
            const modelProb = modelOdds < 0 ? 100 / (100 + Math.abs(modelOdds)) : modelOdds / (100 + modelOdds);
            const closeProb = closeOdds < 0 ? 100 / (100 + Math.abs(closeOdds)) : closeOdds / (100 + closeOdds);
            clv = modelProb - closeProb;
          }
        }

        // Update the bet
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
        if (result === 'Push') pushes++;

      } catch (err) {
        console.error(`Failed to grade bet ${bet.id}:`, err);
        failed++;
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        graded,
        pushes,
        failed,
        filledClosePrice,
        total: ungradedBets.length,
      },
    });

  } catch (error) {
    console.error('BETS_API_ERROR grade', error);
    return NextResponse.json(
      { error: 'Internal error', detail: String((error as Error)?.message ?? error) },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
