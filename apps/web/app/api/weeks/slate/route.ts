/**
 * Weeks Slate API Route
 * Returns games for a specific week with closing lines and scores
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { selectClosingLine } from '@/lib/closing-line-helpers';
import { getCoreV1SpreadFromTeams, getATSPick, computeATSEdgeHma } from '@/lib/core-v1-spread';

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
  hasOdds?: boolean; // Indicates if game has any market lines
  // Advanced columns (optional)
  modelSpread?: number | null;
  modelTotal?: number | null;
  pickSpread?: string | null;
  pickTotal?: string | null;
  maxEdge?: number | null;
  confidence?: string | null;
  // Debug info (only when debug=1 query param is present)
  coreV1Debug?: {
    attempted: boolean;
    success: boolean;
    modelSpreadHma?: number | null;
    edgeHma?: number | null;
    errorMessage?: string | null;
  };
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
    const debug = url.searchParams.get('debug') === '1' || url.searchParams.get('debug') === 'true';

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

    // Show ALL games (for backtesting and to identify which games need odds)
    // Query market lines by season/week to populate odds data for games that have it
    const [spreadLines, totalLines, moneylineLines] = await Promise.all([
      prisma.marketLine.findMany({
        where: {
          season: season,
          week: week,
          lineType: 'spread'
        },
        orderBy: { timestamp: 'desc' }
      }),
      prisma.marketLine.findMany({
        where: {
          season: season,
          week: week,
          lineType: 'total'
        },
        orderBy: { timestamp: 'desc' }
      }),
      prisma.marketLine.findMany({
        where: {
          season: season,
          week: week,
          lineType: 'moneyline'
        },
        orderBy: { timestamp: 'desc' }
      })
    ]);

    // Track which games have odds (for reference, but we'll show all games)
    const gamesWithOdds = new Set([
      ...spreadLines.map(l => l.gameId),
      ...totalLines.map(l => l.gameId),
      ...moneylineLines.map(l => l.gameId)
    ]);

    console.log(`   Found ${spreadLines.length} spread lines, ${totalLines.length} total lines, ${moneylineLines.length} moneyline lines`);
    console.log(`   ${gamesWithOdds.size} unique games have odds out of ${filteredGames.length} total games`);

    // Show ALL games, not just those with odds
    // This helps identify which games need odds ingestion
    let finalGamesToInclude = filteredGames;
    
    // Apply date limiting if requested
    if (limitDates > 0) {
      // Helper function to get date key for timezone conversion
      const getDateKey = (dateString: string): string => {
        try {
          const d = new Date(dateString);
          const localDateStr = d.toLocaleDateString('en-US', { 
            timeZone: 'America/Chicago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          });
          const [month, day, year] = localDateStr.split('/');
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        } catch {
          return 'unknown';
        }
      };
      
      const uniqueDates = Array.from(new Set(finalGamesToInclude.map(g => getDateKey(g.date.toISOString()))));
      const limitedDates = uniqueDates.slice(0, limitDates);
      finalGamesToInclude = finalGamesToInclude.filter(g => {
        const dateKey = getDateKey(g.date.toISOString());
        return limitedDates.includes(dateKey);
      });
      console.log(`   After date limiting: ${finalGamesToInclude.length} games`);
    }

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
    
    for (const game of finalGamesToInclude) {
      // Determine status
      let status: 'final' | 'scheduled' | 'in_progress' = 'scheduled';
      if (game.status === 'final') {
        status = 'final';
      } else if (game.status === 'in_progress') {
        status = 'in_progress';
      }

      // Get closing lines from batch data (may be null if game doesn't have odds yet)
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
      
      // Track if this game has odds (for UI indication)
      const hasOdds = gamesWithOdds.has(game.id);

      // Format kickoff time - just use the ISO string, frontend will format with correct timezone
      // The date from Prisma is already in UTC, we'll let the frontend convert it properly
      const kickoffLocal = game.date.toISOString();

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
        closingTotal,
        hasOdds, // Indicate if this game has odds data
        // Initialize model fields to null (will be populated by Core V1 computation)
        modelSpread: null,
        modelTotal: null,
        pickSpread: null,
        pickTotal: null,
        maxEdge: null,
        confidence: null,
      };

      slateGames.push(slateGame);
    }

    console.log(`   Processed ${slateGames.length} games with closing lines`);

    // Fetch model projections using Core V1
    // ALWAYS compute Core V1 - no query parameter gates
    console.log(`   Computing Core V1 projections for ${slateGames.length} games...`);
    
    let gamesWithModelData = 0;
    let gamesWithErrors = 0;
    
    // Compute Core V1 projections for each game
    for (const game of slateGames) {
      // Initialize debug block if debug mode is enabled
      if (debug) {
        game.coreV1Debug = {
          attempted: true,
          success: false,
          modelSpreadHma: null,
          edgeHma: null,
          errorMessage: null,
        };
      }
      
      try {
        // Get full game info for team names and neutral site
        const fullGame = finalGamesToInclude.find(g => g.id === game.gameId);
        if (!fullGame) {
          const errorMsg = `Game ${game.gameId} not found in finalGamesToInclude`;
          console.warn(`[Slate API] ${errorMsg}, skipping Core V1 computation`);
          if (debug) {
            game.coreV1Debug!.errorMessage = errorMsg;
          }
          continue;
        }

        // Get Core V1 spread
        const coreSpreadInfo = await getCoreV1SpreadFromTeams(
          season,
          game.homeTeamId,
          game.awayTeamId,
          fullGame.neutralSite || false,
          fullGame.homeTeam.name,
          fullGame.awayTeam.name
        );

        const modelSpreadHma = coreSpreadInfo.coreSpreadHma;
        
        // Validate Core V1 result
        if (!Number.isFinite(modelSpreadHma)) {
          const errorMsg = `Core V1 returned non-finite spread: ${modelSpreadHma}`;
          console.error(`[Slate API] ${errorMsg} for game ${game.gameId}`);
          if (debug) {
            game.coreV1Debug!.errorMessage = errorMsg;
          }
          continue;
        }
        
        const modelSpread = Math.round(modelSpreadHma * 10) / 10;

        // Get market spread in HMA frame
        const marketSpreadHma = game.closingSpread?.value ?? null;

        // Compute ATS edge and pick
        let spreadPick: string | null = null;
        let spreadEdgePts: number | null = null;
        let maxEdge: number | null = null;
        let edgeHma: number | null = null;

        if (marketSpreadHma !== null && Number.isFinite(marketSpreadHma)) {
          // Compute raw edge in HMA frame (model - market)
          edgeHma = modelSpreadHma - marketSpreadHma;
          
          const atsPick = getATSPick(
            modelSpreadHma,
            marketSpreadHma,
            fullGame.homeTeam.name,
            fullGame.awayTeam.name,
            game.homeTeamId,
            game.awayTeamId,
            2.0 // edgeFloor
          );
          
          spreadPick = atsPick.pickLabel;
          spreadEdgePts = atsPick.edgePts;
          maxEdge = spreadEdgePts;
        }

        // Totals: Disabled for V1
        const modelTotal: number | null = null;
        const totalPick: string | null = null;
        const totalEdgePts: number | null = null;

        // Confidence tier (A ≥ 4.0, B ≥ 3.0, C ≥ 2.0) - based on ATS edge only
        let confidence: string | null = null;
        if (maxEdge !== null && Number.isFinite(maxEdge)) {
          if (maxEdge >= 4.0) confidence = 'A';
          else if (maxEdge >= 3.0) confidence = 'B';
          else if (maxEdge >= 2.0) confidence = 'C';
        }

        // Assign to game - CRITICAL: Always assign, even if some fields are null
        game.modelSpread = modelSpread;
        game.modelTotal = null; // Disabled for V1
        game.pickSpread = spreadPick;
        game.pickTotal = null; // Disabled for V1
        game.maxEdge = maxEdge !== null && Number.isFinite(maxEdge) ? Math.round(maxEdge * 10) / 10 : null;
        game.confidence = confidence;
        
        // Populate debug block on success
        if (debug) {
          game.coreV1Debug!.success = true;
          game.coreV1Debug!.modelSpreadHma = modelSpreadHma;
          game.coreV1Debug!.edgeHma = edgeHma;
          game.coreV1Debug!.errorMessage = null;
        }
        
        if (game.modelSpread !== null) {
          gamesWithModelData++;
        }
      } catch (error) {
        gamesWithErrors++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Slate API] Error computing Core V1 spread for game ${game.gameId}:`, error);
        if (error instanceof Error) {
          console.error(`[Slate API] Error details: ${error.message}`, error.stack);
        }
        
        // Populate debug block on error
        if (debug) {
          game.coreV1Debug!.success = false;
          game.coreV1Debug!.errorMessage = errorMsg;
        }
        // Fields are already initialized to null, so we don't need to set them again
        // But log the error for debugging
      }
    }
    
    console.log(`   ✅ Computed Core V1 projections for ${gamesWithModelData} of ${slateGames.length} games`);
    if (gamesWithErrors > 0) {
      console.warn(`   ⚠️  ${gamesWithErrors} games had errors during Core V1 computation`);
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
