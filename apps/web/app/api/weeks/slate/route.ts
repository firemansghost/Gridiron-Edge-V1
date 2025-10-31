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

    // Filter to FBS games only using team_membership table
    const fbsTeamIds = new Set(
      (await prisma.teamMembership.findMany({
        where: {
          season,
          level: 'fbs'
        },
        select: { teamId: true }
      })).map(m => m.teamId.toLowerCase())
    );

    const fbsGames = filteredGames.filter(g => 
      fbsTeamIds.has(g.homeTeam.id.toLowerCase()) && 
      fbsTeamIds.has(g.awayTeam.id.toLowerCase())
    );

    console.log(`   Filtered to ${fbsGames.length} FBS games (from ${filteredGames.length} total)`);

    // Batch fetch closing lines for all games to avoid N+1 queries
    const gameIds = fbsGames.map(g => g.id);
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

    console.log(`   Found ${spreadLines.length} spread lines and ${totalLines.length} total lines for ${gameIds.length} games`);

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

    // Diagnostic: Log games without market lines
    const gamesWithoutSpread = fbsGames.filter(g => !spreadMap.has(g.id));
    const gamesWithoutTotal = fbsGames.filter(g => !totalMap.has(g.id));
    if (gamesWithoutSpread.length > 0 || gamesWithoutTotal.length > 0) {
      console.log(`   ⚠️  ${gamesWithoutSpread.length} games missing spread lines, ${gamesWithoutTotal.length} games missing total lines`);
      if (gamesWithoutSpread.length <= 10) {
        gamesWithoutSpread.forEach(g => {
          console.log(`      No spread: ${g.awayTeam.name} @ ${g.homeTeam.name} (${g.id})`);
        });
      }
    }

    // Process each game
    const slateGames: SlateGame[] = [];
    
    for (const game of fbsGames) {
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
      // Load all team ratings for this season in one query
      const teamRatings = await prisma.teamSeasonRating.findMany({
        where: { season },
      });
      const ratingsMap = new Map(
        teamRatings.map(r => [r.teamId, r])
      );

      // Load all team stats for this season in one query
      const teamStats = await prisma.teamSeasonStat.findMany({
        where: { season },
      });
      const statsMap = new Map(
        teamStats.map(s => [s.teamId, s])
      );

      // Compute projections for each game
      const HFA = 2.0;
      for (const game of slateGames) {
        const homeRating = ratingsMap.get(game.homeTeamId);
        const awayRating = ratingsMap.get(game.awayTeamId);
        const homeStats = statsMap.get(game.homeTeamId);
        const awayStats = statsMap.get(game.awayTeamId);

        if (homeRating && awayRating) {
          const homePower = Number(homeRating.powerRating || homeRating.rating || 0);
          const awayPower = Number(awayRating.powerRating || awayRating.rating || 0);
          
          // Get game to check neutral site
          const fullGame = fbsGames.find(g => g.id === game.gameId);
          const isNeutral = fullGame?.neutralSite || false;
          
          // Model Spread
          const modelSpread = homePower - awayPower + (isNeutral ? 0 : HFA);

          // Model Total
          const homeEpaOff = homeStats?.epaOff ? Number(homeStats.epaOff) : null;
          const awayEpaOff = awayStats?.epaOff ? Number(awayStats.epaOff) : null;
          const homeYppOff = homeStats?.yppOff ? Number(homeStats.yppOff) : null;
          const awayYppOff = awayStats?.yppOff ? Number(awayStats.yppOff) : null;
          
          const homePaceOff = homeStats?.paceOff ? Number(homeStats.paceOff) : 70;
          const awayPaceOff = awayStats?.paceOff ? Number(awayStats.paceOff) : 70;

          const homePpp = homeEpaOff !== null 
            ? Math.max(0, Math.min(1.0, 7 * homeEpaOff))
            : homeYppOff !== null 
              ? 0.8 * homeYppOff
              : 0.4;
          
          const awayPpp = awayEpaOff !== null
            ? Math.max(0, Math.min(1.0, 7 * awayEpaOff))
            : awayYppOff !== null
              ? 0.8 * awayYppOff
              : 0.4;

          const modelTotal = (homePpp * homePaceOff) + (awayPpp * awayPaceOff);

          // Compute picks and edges
          const marketSpread = game.closingSpread?.value ?? null;
          const marketTotal = game.closingTotal?.value ?? null;

          let spreadPick: string | null = null;
          let totalPick: string | null = null;
          let spreadEdgePts: number | null = null;
          let totalEdgePts: number | null = null;

          if (marketSpread !== null) {
            spreadEdgePts = Math.abs(modelSpread - marketSpread);
            const favoredSide = modelSpread < 0 ? 'home' : 'away';
            const favoredTeam = favoredSide === 'home' 
              ? fullGame?.homeTeam.name || 'Home'
              : fullGame?.awayTeam.name || 'Away';
            const sign = modelSpread >= 0 ? '+' : '';
            spreadPick = `${favoredTeam} ${sign}${Math.abs(Math.round(modelSpread * 2) / 2).toFixed(1)}`;
          }

          if (marketTotal !== null) {
            totalEdgePts = Math.abs(modelTotal - marketTotal);
            const pick = modelTotal > marketTotal ? 'Over' : 'Under';
            const roundedTotal = Math.round(marketTotal * 2) / 2;
            totalPick = `${pick} ${roundedTotal.toFixed(1)}`;
          }

          const maxEdge = spreadEdgePts !== null && totalEdgePts !== null
            ? Math.max(spreadEdgePts, totalEdgePts)
            : spreadEdgePts ?? totalEdgePts ?? null;

          // Confidence tier
          let confidence: string | null = null;
          if (maxEdge !== null) {
            if (maxEdge >= 4.0) confidence = 'A';
            else if (maxEdge >= 3.0) confidence = 'B';
            else if (maxEdge >= 2.0) confidence = 'C';
          }

          // Assign to game
          game.modelSpread = Math.round(modelSpread * 10) / 10;
          game.modelTotal = Math.round(modelTotal * 10) / 10;
          game.pickSpread = spreadPick;
          game.pickTotal = totalPick;
          game.maxEdge = maxEdge !== null ? Math.round(maxEdge * 10) / 10 : null;
          game.confidence = confidence;
        }
      }
      
      console.log(`   Computed model projections for slate games`);
    } catch (error) {
      console.warn('   Failed to compute model projections:', error);
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
