/**
 * Ratings Peek API
 * 
 * Debug endpoint to inspect raw features and computed ratings for a team
 * 
 * Query params:
 *   - season: number (required)
 *   - teamId: string (required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function toNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value);
  if (value && typeof value.toNumber === 'function') return value.toNumber();
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const season = parseInt(searchParams.get('season') || '');
    const teamId = searchParams.get('teamId');

    if (!season || !teamId) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: season, teamId' },
        { status: 400 }
      );
    }

    // Load features - try season stats first (simpler than game-level for peek)
    const seasonStats = await prisma.teamSeasonStat.findUnique({
      where: {
        season_teamId: {
          season,
          teamId,
        },
      },
    });

    // Try game-level stats as fallback
    const gameStats = await prisma.teamGameStat.findMany({
      where: {
        teamId,
        season,
      },
      take: 10,
      orderBy: { updatedAt: 'desc' },
    });

    let features: any = {
      dataSource: 'missing',
      confidence: 0,
      gamesCount: 0,
      lastUpdated: null,
    };

    if (seasonStats) {
      features = {
        yppOff: toNumber(seasonStats.yppOff),
        successOff: toNumber(seasonStats.successOff),
        epaOff: toNumber(seasonStats.epaOff),
        paceOff: toNumber(seasonStats.paceOff),
        passYpaOff: toNumber(seasonStats.passYpaOff),
        rushYpcOff: toNumber(seasonStats.rushYpcOff),
        yppDef: toNumber(seasonStats.yppDef),
        successDef: toNumber(seasonStats.successDef),
        epaDef: toNumber(seasonStats.epaDef),
        paceDef: toNumber(seasonStats.paceDef),
        passYpaDef: toNumber(seasonStats.passYpaDef),
        rushYpcDef: toNumber(seasonStats.rushYpcDef),
        dataSource: seasonStats.successOff !== null && seasonStats.epaOff !== null ? 'season' : 'baseline',
        confidence: 0.7,
        gamesCount: 0,
        lastUpdated: seasonStats.createdAt,
      };
    } else if (gameStats.length > 0) {
      // Calculate averages from game stats
      const validStats = gameStats.filter(s => s.yppOff !== null || s.successOff !== null);
      if (validStats.length > 0) {
        const sums = validStats.reduce((acc, stat) => ({
          yppOff: acc.yppOff + (stat.yppOff || 0),
          successOff: acc.successOff + (stat.successOff || 0),
          epaOff: acc.epaOff + (stat.epaOff || 0),
          paceOff: acc.paceOff + (stat.pace || 0),
          yppDef: acc.yppDef + (stat.yppDef || 0),
          successDef: acc.successDef + (stat.successDef || 0),
          epaDef: acc.epaDef + (stat.epaDef || 0),
        }), { yppOff: 0, successOff: 0, epaOff: 0, paceOff: 0, yppDef: 0, successDef: 0, epaDef: 0 });
        
        const count = validStats.length;
        features = {
          yppOff: sums.yppOff / count,
          successOff: sums.successOff / count,
          epaOff: sums.epaOff / count,
          paceOff: sums.paceOff / count,
          yppDef: sums.yppDef / count,
          successDef: sums.successDef / count,
          epaDef: sums.epaDef / count,
          dataSource: 'game',
          confidence: Math.min(1.0, count / 8),
          gamesCount: count,
          lastUpdated: validStats[0]?.updatedAt || null,
        };
      }
    }

    // Load rating from database
    const rating = await prisma.teamSeasonRating.findUnique({
      where: {
        season_teamId: {
          season,
          teamId,
        },
      },
    });


    return NextResponse.json({
      success: true,
      teamId,
      season,
      features: {
        // Offensive
        yppOff: features.yppOff,
        successOff: features.successOff,
        epaOff: features.epaOff,
        paceOff: features.paceOff,
        passYpaOff: features.passYpaOff,
        rushYpcOff: features.rushYpcOff,
        // Defensive
        yppDef: features.yppDef,
        successDef: features.successDef,
        epaDef: features.epaDef,
        paceDef: features.paceDef,
        passYpaDef: features.passYpaDef,
        rushYpcDef: features.rushYpcDef,
        // Metadata
        dataSource: features.dataSource,
        confidence: features.confidence,
        gamesCount: features.gamesCount,
        lastUpdated: features.lastUpdated?.toISOString() || null,
      },
      rating: rating ? {
        offenseRating: rating.offenseRating ? Number(rating.offenseRating) : null,
        defenseRating: rating.defenseRating ? Number(rating.defenseRating) : null,
        powerRating: rating.powerRating ? Number(rating.powerRating) : rating.rating ? Number(rating.rating) : null,
        confidence: rating.confidence ? Number(rating.confidence) : null,
        dataSource: rating.dataSource || null,
        createdAt: rating.createdAt.toISOString(),
        updatedAt: rating.updatedAt?.toISOString() || null,
      } : null,
    });
  } catch (error) {
    console.error('Error in ratings peek:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

