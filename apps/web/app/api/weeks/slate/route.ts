/**
 * Weeks Slate API Route
 * Returns games for a specific week with closing lines and scores
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { selectClosingLine } from '@/lib/closing-line-helpers';

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
  // Advanced columns (optional)
  modelSpread?: number | null;
  modelTotal?: number | null;
  pickSpread?: string | null;
  pickTotal?: string | null;
  maxEdge?: number | null;
  confidence?: string | null;
}


export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const season = parseInt(url.searchParams.get('season') || '2025', 10);
    const week = parseInt(url.searchParams.get('week') || '9', 10);
    
    // Query parameters for performance optimization
    const limitDates = parseInt(url.searchParams.get('limitDates') || '0', 10);
    const afterDate = url.searchParams.get('afterDate');
    const includeAdvanced = url.searchParams.get('includeAdvanced') === 'true';

    if (!season || !week) {
      return NextResponse.json(
        { error: 'Invalid season or week parameter' },
        { status: 400 }
      );
    }

    console.log(`📅 Fetching slate for ${season} Week ${week}${limitDates > 0 ? ` (limitDates: ${limitDates})` : ''}${afterDate ? ` (afterDate: ${afterDate})` : ''}`);

    // Build where clause with date filtering
    const whereClause: any = { season, week };
    
    if (afterDate) {
      whereClause.date = { gt: new Date(afterDate) };
    }

    // Get games with team info
    const games = await prisma.game.findMany({
      where: whereClause,
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } }
      },
      orderBy: { date: 'asc' }
    });

    // Apply date limiting if requested
    let filteredGames = games;
    if (limitDates > 0) {
      const uniqueDates = Array.from(new Set(games.map(g => g.date.toISOString().split('T')[0])));
      const limitedDates = uniqueDates.slice(0, limitDates);
      filteredGames = games.filter(g => 
        limitedDates.includes(g.date.toISOString().split('T')[0])
      );
    }

    console.log(`   Found ${filteredGames.length} games for ${season} Week ${week}`);

    // Batch fetch closing lines for all games to avoid N+1 queries
    const gameIds = filteredGames.map(g => g.id);
    const [spreadLines, totalLines] = await Promise.all([
      prisma.marketLine.findMany({
        where: {
          gameId: { in: gameIds },
          lineType: 'spread'
        },
        orderBy: { timestamp: 'desc' }
      }),
      prisma.marketLine.findMany({
        where: {
          gameId: { in: gameIds },
          lineType: 'total'
        },
        orderBy: { timestamp: 'desc' }
      })
    ]);

    // Create lookup maps for closing lines
    const spreadMap = new Map<string, any>();
    const totalMap = new Map<string, any>();
    
    spreadLines.forEach(line => {
      if (!spreadMap.has(line.gameId)) {
        spreadMap.set(line.gameId, line);
      }
    });
    
    totalLines.forEach(line => {
      if (!totalMap.has(line.gameId)) {
        totalMap.set(line.gameId, line);
      }
    });

    // Process each game
    const slateGames: SlateGame[] = [];
    
    for (const game of filteredGames) {
      // Determine status
      let status: 'final' | 'scheduled' | 'in_progress' = 'scheduled';
      if (game.status === 'final') {
        status = 'final';
      } else if (game.status === 'in_progress') {
        status = 'in_progress';
      }

      // Get closing lines from batch data
      const spreadLine = spreadMap.get(game.id);
      const totalLine = totalMap.get(game.id);
      
      const closingSpread = spreadLine ? {
        value: Number(spreadLine.lineValue),
        book: spreadLine.bookName,
        timestamp: spreadLine.timestamp.toISOString()
      } : null;
      
      const closingTotal = totalLine ? {
        value: Number(totalLine.lineValue),
        book: totalLine.bookName,
        timestamp: totalLine.timestamp.toISOString()
      } : null;

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

    // Fetch model projections (always include if ratings are available)
    try {
      // Import the model slate function directly to avoid HTTP overhead
      const { GET: getModelSlate } = await import('../model/slate/route');
      const modelRequest = new NextRequest(
        new URL(`/api/model/slate?season=${season}&week=${week}`, request.url),
        { method: 'GET' }
      );
      const modelResponse = await getModelSlate(modelRequest);
      
      if (modelResponse.ok) {
        const modelData = await modelResponse.json();
        if (modelData.success && modelData.games) {
          // Create a map of gameId -> model projection
          const modelMap = new Map(
            modelData.games.map((g: any) => [g.gameId, g])
          );
          
          // Merge model projections into slate games
          slateGames.forEach(game => {
            const projection = modelMap.get(game.gameId);
            if (projection) {
              game.modelSpread = projection.modelSpread;
              game.modelTotal = projection.modelTotal;
              game.pickSpread = projection.spreadPick;
              game.pickTotal = projection.totalPick;
              game.maxEdge = projection.maxEdge;
              game.confidence = projection.confidence;
            }
          });
          
          console.log(`   Merged model projections for ${modelMap.size} games`);
        }
      }
    } catch (error) {
      console.warn('   Failed to fetch model projections:', error);
      // Continue without model data rather than failing
    }

    // Determine cache headers based on game status
    const hasFinalGames = slateGames.some(g => g.status === 'final');
    const cacheHeaders = hasFinalGames 
      ? { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' } // 10min cache for final games
      : { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' }; // 1min cache for live games

    return NextResponse.json(slateGames, { headers: cacheHeaders });

  } catch (error) {
    console.error('Slate API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
