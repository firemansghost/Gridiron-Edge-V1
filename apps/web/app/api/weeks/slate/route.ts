/**
 * Weeks Slate API Route
 * Returns games for a specific week with closing lines and scores
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface SlateGame {
  gameId: string;
  date: string;
  kickoffLocal: string;
  status: 'final' | 'scheduled' | 'in_progress';
  awayTeamId: string;
  homeTeamId: string;
  awayScore: number | null;
  homeScore: number | null;
  closingSpread: {
    value: number;
    book: string;
    timestamp: string;
  } | null;
  closingTotal: {
    value: number;
    book: string;
    timestamp: string;
  } | null;
}

async function getClosingLine(gameId: string, lineType: 'spread' | 'total'): Promise<{
  value: number;
  book: string;
  timestamp: string;
} | null> {
  try {
    // Get the latest market line before kickoff for this game
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { date: true }
    });

    if (!game?.date) return null;

    const kickoff = new Date(game.date);
    
    // Find the latest line before kickoff
    const latestLine = await prisma.marketLine.findFirst({
      where: {
        gameId,
        lineType,
        timestamp: { lt: kickoff }
      },
      orderBy: { timestamp: 'desc' },
      select: {
        lineValue: true,
        bookName: true,
        timestamp: true
      }
    });

    if (!latestLine) return null;

    return {
      value: Number(latestLine.lineValue),
      book: latestLine.bookName,
      timestamp: latestLine.timestamp.toISOString()
    };
  } catch (error) {
    console.error(`Error getting closing ${lineType} for game ${gameId}:`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const season = parseInt(url.searchParams.get('season') || '2025', 10);
    const week = parseInt(url.searchParams.get('week') || '9', 10);

    if (!season || !week) {
      return NextResponse.json(
        { error: 'Invalid season or week parameter' },
        { status: 400 }
      );
    }

    console.log(`📅 Fetching slate for ${season} Week ${week}`);

    // Get games with team info
    const games = await prisma.game.findMany({
      where: { season, week },
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } }
      },
      orderBy: { date: 'asc' }
    });

    console.log(`   Found ${games.length} games for ${season} Week ${week}`);

    // Process each game
    const slateGames: SlateGame[] = [];
    
    for (const game of games) {
      // Determine status
      let status: 'final' | 'scheduled' | 'in_progress' = 'scheduled';
      if (game.status === 'final') {
        status = 'final';
      } else if (game.status === 'in_progress') {
        status = 'in_progress';
      }

      // Get closing lines
      const [closingSpread, closingTotal] = await Promise.all([
        getClosingLine(game.id, 'spread'),
        getClosingLine(game.id, 'total')
      ]);

      // Format kickoff time (convert to local timezone)
      const kickoffDate = new Date(game.date);
      const kickoffLocal = kickoffDate.toISOString().replace('Z', '-05:00'); // CST/CDT

      const slateGame: SlateGame = {
        gameId: game.id,
        date: game.date.toISOString(),
        kickoffLocal,
        status,
        awayTeamId: game.awayTeam.id,
        homeTeamId: game.homeTeam.id,
        awayScore: game.awayScore,
        homeScore: game.homeScore,
        closingSpread,
        closingTotal
      };

      slateGames.push(slateGame);
    }

    console.log(`   Processed ${slateGames.length} games with closing lines`);

    return NextResponse.json(slateGames);

  } catch (error) {
    console.error('Slate API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
