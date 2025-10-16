/**
 * M3 Seed Slate API Route
 * 
 * Returns this week's seed games with implied vs market data and confidence tiers.
 * Reads from database (Prisma client) to prove end-to-end wiring.
 */

import { prisma } from '@/lib/prisma';
import { computeSpreadPick, computeTotalPick } from '@/lib/pick-helpers';
import { 
  applyAdjustments, 
  calculateConfidenceTier,
  getMockInjuries,
  getMockWeather 
} from '@/lib/adjustment-helpers';
import { pickMarketLine, getLineValue, pickMoneyline, americanToProb } from '@/lib/market-line-helpers';
import { logDataMode } from '@/lib/data-mode';
import { getSeasonWeekFromParams } from '@/lib/season-week-helpers';
import { getCurrentSeasonWeek } from '@/lib/current-week';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  // Log data mode
  const dataMode = logDataMode('API: /api/seed-slate');
  
  // Get adjustment toggles from query params
  const searchParams = request.nextUrl.searchParams;
  const injuriesOn = searchParams.get('injuries') === 'on';
  const weatherOn = searchParams.get('weather') === 'on';
  
  // Get season/week from params or auto-detect from database
  let season: number, week: number;
  if (searchParams.get('season') && searchParams.get('week')) {
    const params = getSeasonWeekFromParams(searchParams);
    season = params.season;
    week = params.week;
  } else {
    const current = await getCurrentSeasonWeek(prisma);
    season = current.season;
    week = current.week;
  }
  
  try {
    // Get this week's games
    const games = await prisma.game.findMany({
      where: {
        season,
        week
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        marketLines: true,
        matchupOutputs: {
          where: {
            modelVersion: 'v0.0.1'
          }
        }
      },
      orderBy: {
        date: 'asc'
      }
    });

    // Format response with implied vs market data
    const slate = games.map(game => {
      const matchupOutput = game.matchupOutputs[0];
      
      // Use helper to pick best market lines (prefers SGO, then latest)
      const spreadLine = pickMarketLine(game.marketLines, 'spread');
      const totalLine = pickMarketLine(game.marketLines, 'total');
      
      // Convert date to America/Chicago timezone
      const kickoffTime = new Date(game.date).toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      const baseImpliedSpread = matchupOutput?.impliedSpread || 0;
      const baseImpliedTotal = matchupOutput?.impliedTotal || 45;
      
      // Get line values (prefers closingLine, falls back to lineValue)
      const marketSpread = getLineValue(spreadLine) || 0;
      const marketTotal = getLineValue(totalLine) || 45;

      // Extract market metadata for source badges
      const spreadMeta = spreadLine ? {
        source: spreadLine.source ?? null,
        bookName: spreadLine.bookName ?? null,
        timestamp: spreadLine.timestamp ?? null,
      } : null;

      const totalMeta = totalLine ? {
        source: totalLine.source ?? null,
        bookName: totalLine.bookName ?? null,
        timestamp: totalLine.timestamp ?? null,
      } : null;

      // Pick moneyline and extract metadata
      const mlLine = pickMoneyline(game.marketLines);
      const mlVal = getLineValue(mlLine); // American odds (negative favorite, positive dog)
      const mlMeta = mlLine ? {
        source: mlLine.source ?? null,
        bookName: mlLine.bookName ?? null,
        timestamp: mlLine.timestamp ?? null,
      } : null;

      // Only create moneyline object if we have actual moneyline data
      let moneyline = null;
      if (mlVal != null) {
        // Determine moneyline pick label
        const fav = mlVal < 0 ? game.homeTeam.name : game.awayTeam.name;
        const moneylinePickLabel = `${fav} ML`;

        moneyline = {
          price: mlVal,
          pickLabel: moneylinePickLabel,
          impliedProb: americanToProb(mlVal),
          meta: mlMeta
        };
      }

      // Apply adjustments if enabled
      let impliedSpread = baseImpliedSpread;
      let impliedTotal = baseImpliedTotal;
      let adjustments = null;

      if (injuriesOn || weatherOn) {
        const injuries = injuriesOn ? getMockInjuries(game.id) : [];
        const weather = weatherOn ? getMockWeather(game.id) : null;
        
        const adjustmentResult = applyAdjustments(
          baseImpliedSpread,
          baseImpliedTotal,
          game.homeTeamId,
          game.awayTeamId,
          injuries,
          weather
        );

        impliedSpread = adjustmentResult.impliedSpreadAdj;
        impliedTotal = adjustmentResult.impliedTotalAdj;
        adjustments = adjustmentResult.adjustments;
      }

      // Compute spread pick details
      const spreadPick = computeSpreadPick(
        impliedSpread,
        game.homeTeam.name,
        game.awayTeam.name,
        game.homeTeamId,
        game.awayTeamId
      );

      // Compute total pick details
      const totalPick = computeTotalPick(impliedTotal, marketTotal);

      // Calculate edge points (using adjusted values)
      const spreadEdgePts = Math.abs(impliedSpread - marketSpread);
      const totalEdgePts = Math.abs(impliedTotal - marketTotal);

      // Recalculate confidence based on adjusted edge
      const maxEdge = Math.max(spreadEdgePts, totalEdgePts);
      const confidence = calculateConfidenceTier(maxEdge);

      return {
        gameId: game.id,
        matchup: `${game.awayTeam.name} @ ${game.homeTeam.name}`,
        kickoff: kickoffTime,
        venue: game.venue,
        neutralSite: game.neutralSite,
        
        // Team information
        homeTeam: {
          id: game.homeTeam.id,
          name: game.homeTeam.name,
          conference: game.homeTeam.conference,
          division: game.homeTeam.division,
          city: game.homeTeam.city,
          state: game.homeTeam.state,
          mascot: game.homeTeam.mascot,
          logoUrl: game.homeTeam.logoUrl,
          primaryColor: game.homeTeam.primaryColor,
          secondaryColor: game.homeTeam.secondaryColor
        },
        awayTeam: {
          id: game.awayTeam.id,
          name: game.awayTeam.name,
          conference: game.awayTeam.conference,
          division: game.awayTeam.division,
          city: game.awayTeam.city,
          state: game.awayTeam.state,
          mascot: game.awayTeam.mascot,
          logoUrl: game.awayTeam.logoUrl,
          primaryColor: game.awayTeam.primaryColor,
          secondaryColor: game.awayTeam.secondaryColor
        },
        
        // Market data
        marketSpread,
        marketTotal,
        marketMeta: {
          spread: spreadMeta,
          total: totalMeta,
        },
        moneyline,
        
        // Implied data
        impliedSpread,
        impliedTotal,
        
        // Edge analysis (keep existing for backward compatibility)
        spreadEdge: spreadEdgePts,
        totalEdge: totalEdgePts,
        maxEdge: Math.max(spreadEdgePts, totalEdgePts),
        
        // New explicit pick fields
        ...spreadPick,
        spreadEdgePts,
        ...totalPick,
        totalEdgePts,
        
        // Confidence tier (adjusted)
        confidence,
        
        // Model info
        modelVersion: matchupOutput?.modelVersion || 'v0.0.1',
        
        // Adjustments (M6)
        adjustments,
        adjustmentsEnabled: {
          injuries: injuriesOn,
          weather: weatherOn,
        },
        
        // Game results (if available)
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        status: game.status
      };
    });

    return Response.json({
      success: true,
      week,
      season,
      modelVersion: 'v0.0.1',
      games: slate,
      summary: {
        totalGames: slate.length,
        confidenceBreakdown: {
          A: slate.filter(g => g.confidence === 'A').length,
          B: slate.filter(g => g.confidence === 'B').length,
          C: slate.filter(g => g.confidence === 'C').length
        }
      },
      signConvention: {
        spread: 'home_minus_away',
        hfaPoints: 2.0
      }
    });

  } catch (error) {
    console.error('Error fetching seed slate:', error);
    return Response.json(
      { 
        success: false, 
        error: 'Failed to fetch seed slate data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
