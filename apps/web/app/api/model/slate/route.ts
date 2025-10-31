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
import { computeSpreadPick, computeTotalPick } from '@/lib/pick-helpers';

const HFA = 2.0; // Home field advantage in points

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
      teamStats.map(s => [`${s.season}_${s.teamId}`, s])
    );

    // Compute projections for each game
    const projections = await Promise.all(
      games.map(async (game) => {
        const homeRating = ratingsMap.get(game.homeTeamId);
        const awayRating = ratingsMap.get(game.awayTeamId);
        const homeStats = statsMap.get(`${season}_${game.homeTeamId}`);
        const awayStats = statsMap.get(`${season}_${game.awayTeamId}`);

        if (!homeRating || !awayRating) {
          return {
            gameId: game.id,
            modelSpread: null,
            modelTotal: null,
            confidence: null,
            dataSource: null,
            error: 'Missing ratings',
          };
        }

        const homePower = Number(homeRating.powerRating || homeRating.rating || 0);
        const awayPower = Number(awayRating.powerRating || awayRating.rating || 0);

        // Model Spread
        const modelSpread = homePower - awayPower + (game.neutralSite ? 0 : HFA);

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

        // Confidence
        const homeConfidence = Number(homeRating.confidence || 0);
        const awayConfidence = Number(awayRating.confidence || 0);
        const avgConfidence = (homeConfidence + awayConfidence) / 2;

        // Data source
        const homeDataSource = homeRating.dataSource || 'unknown';
        const awayDataSource = awayRating.dataSource || 'unknown';
        const dataSources = homeDataSource === awayDataSource 
          ? homeDataSource 
          : `${homeDataSource}/${awayDataSource}`;

        // Get market lines
        const spreadLine = game.marketLines.find(l => l.lineType === 'spread');
        const totalLine = game.marketLines.find(l => l.lineType === 'total');
        const marketSpread = spreadLine?.closingLine ?? spreadLine?.lineValue ?? null;
        const marketTotal = totalLine?.closingLine ?? totalLine?.lineValue ?? null;

        // Compute picks
        let spreadPick = null;
        let totalPick = null;
        let spreadEdgePts = null;
        let totalEdgePts = null;
        let maxEdge = null;

        if (marketSpread !== null && modelSpread !== null) {
          const pickResult = computeSpreadPick(
            modelSpread,
            game.homeTeam.name,
            game.awayTeam.name,
            game.homeTeamId,
            game.awayTeamId
          );
          spreadPick = pickResult.spreadPickLabel;
          spreadEdgePts = Math.abs(modelSpread - marketSpread);
        }

        if (marketTotal !== null && modelTotal !== null) {
          const pickResult = computeTotalPick(modelTotal, marketTotal);
          totalPick = pickResult.totalPickLabel;
          totalEdgePts = Math.abs(modelTotal - marketTotal);
        }

        if (spreadEdgePts !== null && totalEdgePts !== null) {
          maxEdge = Math.max(Math.abs(spreadEdgePts), Math.abs(totalEdgePts));
        } else if (spreadEdgePts !== null) {
          maxEdge = Math.abs(spreadEdgePts);
        } else if (totalEdgePts !== null) {
          maxEdge = Math.abs(totalEdgePts);
        }

        // Confidence tier (A ≥ 4.0, B ≥ 3.0, C ≥ 2.0)
        let confidenceTier: string | null = null;
        if (maxEdge !== null) {
          if (maxEdge >= 4.0) confidenceTier = 'A';
          else if (maxEdge >= 3.0) confidenceTier = 'B';
          else if (maxEdge >= 2.0) confidenceTier = 'C';
        }

        return {
          gameId: game.id,
          modelSpread: modelSpread !== null ? Math.round(modelSpread * 10) / 10 : null,
          modelTotal: modelTotal !== null ? Math.round(modelTotal * 10) / 10 : null,
          marketSpread,
          marketTotal,
          spreadPick,
          totalPick,
          spreadEdgePts,
          totalEdgePts,
          maxEdge,
          confidence: confidenceTier,
          dataSource: dataSources,
          avgConfidence: Math.round(avgConfidence * 100) / 100,
        };
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

