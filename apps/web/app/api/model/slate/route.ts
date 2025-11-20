/**
 * Model Slate API
 * 
 * Computes model spread and total for all games in a week
 * 
 * Query params:
 *   - season: number (required)
 *   - week: number (required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCoreV1SpreadFromTeams, getATSPick, computeATSEdgeHma } from '@/lib/core-v1-spread';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const season = parseInt(searchParams.get('season') || '');
    const week = parseInt(searchParams.get('week') || '');

    if (!season || !week) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: season, week' },
        { status: 400 }
      );
    }

    // Load all games for this week
    const games = await prisma.game.findMany({
      where: { season, week },
      include: {
        homeTeam: true,
        awayTeam: true,
        marketLines: true,
        matchupOutputs: {
          where: { modelVersion: 'v1.0.0' },
          take: 1,
        },
      },
      orderBy: { date: 'asc' },
    });

    // Compute projections for each game using Core V1
    const projections = await Promise.all(
      games.map(async (game) => {
        try {
          // Get Core V1 spread
          const coreSpreadInfo = await getCoreV1SpreadFromTeams(
            season,
            game.homeTeamId,
            game.awayTeamId,
            game.neutralSite || false,
            game.homeTeam.name,
            game.awayTeam.name
          );

          const modelSpreadHma = coreSpreadInfo.coreSpreadHma;

          // Get market lines
          const spreadLine = game.marketLines.find(l => l.lineType === 'spread');
          const totalLine = game.marketLines.find(l => l.lineType === 'total');
          
          // Market spread in HMA frame (lineValue is home minus away)
          const marketSpreadHma = spreadLine?.lineValue ?? null;

          // Compute ATS edge and pick
          let spreadPick: string | null = null;
          let spreadEdgePts: number | null = null;
          let maxEdge: number | null = null;

          if (marketSpreadHma !== null) {
            const atsPick = getATSPick(
              modelSpreadHma,
              marketSpreadHma,
              game.homeTeam.name,
              game.awayTeam.name,
              game.homeTeamId,
              game.awayTeamId,
              0.1 // edgeFloor (raw model, minimal threshold)
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
          let confidenceTier: string | null = null;
          if (maxEdge !== null) {
            if (maxEdge >= 4.0) confidenceTier = 'A';
            else if (maxEdge >= 3.0) confidenceTier = 'B';
            else if (maxEdge >= 2.0) confidenceTier = 'C';
          }

          return {
            gameId: game.id,
            modelSpread: Math.round(modelSpreadHma * 10) / 10,
            modelTotal: null, // Disabled for V1
            marketSpread: marketSpreadHma,
            marketTotal: totalLine?.closingLine ?? totalLine?.lineValue ?? null,
            spreadPick,
            totalPick: null, // Disabled for V1
            spreadEdgePts,
            totalEdgePts: null, // Disabled for V1
            maxEdge,
            confidence: confidenceTier,
            dataSource: 'core_v1',
            avgConfidence: null,
          };
        } catch (error) {
          console.error(`Error computing Core V1 spread for game ${game.id}:`, error);
          return {
            gameId: game.id,
            modelSpread: null,
            modelTotal: null,
            marketSpread: null,
            marketTotal: null,
            spreadPick: null,
            totalPick: null,
            spreadEdgePts: null,
            totalEdgePts: null,
            maxEdge: null,
            confidence: null,
            dataSource: null,
            avgConfidence: null,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      season,
      week,
      games: projections,
      count: projections.length,
    });
  } catch (error) {
    console.error('Error computing slate:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

