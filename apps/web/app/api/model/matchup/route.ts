/**
 * Model Matchup API
 * 
 * Computes model spread and total for a single matchup
 * 
 * Query params:
 *   - season: number (required)
 *   - homeId: string (required)
 *   - awayId: string (required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const HFA = 2.0; // Home field advantage in points

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const season = parseInt(searchParams.get('season') || '');
    const homeId = searchParams.get('homeId');
    const awayId = searchParams.get('awayId');

    if (!season || !homeId || !awayId) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: season, homeId, awayId' },
        { status: 400 }
      );
    }

    // Load team ratings
    const [homeRating, awayRating] = await Promise.all([
      prisma.teamSeasonRating.findUnique({
        where: {
          season_teamId: { season, teamId: homeId },
        },
      }),
      prisma.teamSeasonRating.findUnique({
        where: {
          season_teamId: { season, teamId: awayId },
        },
      }),
    ]);

    if (!homeRating || !awayRating) {
      return NextResponse.json(
        { success: false, error: 'Ratings not found for one or both teams' },
        { status: 404 }
      );
    }

    // Load team season stats for pace/EPA calculations
    const [homeStats, awayStats] = await Promise.all([
      prisma.teamSeasonStat.findUnique({
        where: {
          season_teamId: { season, teamId: homeId },
        },
      }),
      prisma.teamSeasonStat.findUnique({
        where: {
          season_teamId: { season, teamId: awayId },
        },
      }),
    ]);

    const homePower = Number(homeRating.powerRating || homeRating.rating || 0);
    const awayPower = Number(awayRating.powerRating || awayRating.rating || 0);

    // Model Spread = (home_power - away_power) + HFA
    const modelSpread = homePower - awayPower + HFA;

    // Model Total: Use pace + efficiency
    // If we have EPA, use points_per_play ≈ 7 * epa_off
    // Otherwise, fall back to ypp_off mapping
    const homeEpaOff = homeStats?.epaOff ? Number(homeStats.epaOff) : null;
    const awayEpaOff = awayStats?.epaOff ? Number(awayStats.epaOff) : null;
    const homeYppOff = homeStats?.yppOff ? Number(homeStats.yppOff) : null;
    const awayYppOff = awayStats?.yppOff ? Number(awayStats.yppOff) : null;
    
    // Pace is stored as plays per game (typically 70-80)
    // If it's stored as seconds per play (< 1.0), convert it
    let homePace = homeStats?.paceOff ? Number(homeStats.paceOff) : 70;
    let awayPace = awayStats?.paceOff ? Number(awayStats.paceOff) : 70;
    
    // If pace is < 10, it's likely seconds per play, convert to plays per game
    if (homePace < 10) {
      homePace = 60 / homePace; // Convert seconds/play to plays/game
    }
    if (awayPace < 10) {
      awayPace = 60 / awayPace;
    }
    
    // Estimate points per play (typically 0.4-0.8)
    const homePpp = homeEpaOff !== null 
      ? Math.max(0.3, Math.min(0.8, 7 * homeEpaOff)) // EPA typically 0.05-0.35, so 7*EPA = 0.35-2.45, clamp to 0.3-0.8
      : homeYppOff !== null 
        ? Math.max(0.3, Math.min(0.8, 0.14 * homeYppOff)) // YPP typically 4-8, so 0.14*YPP = 0.56-1.12, clamp to 0.3-0.8
        : 0.5; // Baseline
    
    const awayPpp = awayEpaOff !== null
      ? Math.max(0.3, Math.min(0.8, 7 * awayEpaOff))
      : awayYppOff !== null
        ? Math.max(0.3, Math.min(0.8, 0.14 * awayYppOff))
        : 0.5;

    // Model Total = (home_points_per_play * home_plays_per_game) + (away_points_per_play * away_plays_per_game)
    const modelTotal = (homePpp * homePace) + (awayPpp * awayPace);

    // Confidence: average of both teams, weighted by data source quality
    const homeConfidence = Number(homeRating.confidence || 0);
    const awayConfidence = Number(awayRating.confidence || 0);
    const avgConfidence = (homeConfidence + awayConfidence) / 2;

    // Data sources
    const homeDataSource = homeRating.dataSource || 'unknown';
    const awayDataSource = awayRating.dataSource || 'unknown';
    const dataSources = homeDataSource === awayDataSource 
      ? homeDataSource 
      : `${homeDataSource}/${awayDataSource}`;

    return NextResponse.json({
      success: true,
      modelSpread: Math.round(modelSpread * 10) / 10, // Round to 1 decimal
      modelTotal: Math.round(modelTotal * 10) / 10,
      components: {
        powerHome: Math.round(homePower * 100) / 100,
        powerAway: Math.round(awayPower * 100) / 100,
        hfa: HFA,
        paceHome: Math.round(homePace * 10) / 10,
        paceAway: Math.round(awayPace * 10) / 10,
        epaHome: homeEpaOff !== null ? Math.round(homeEpaOff * 1000) / 1000 : null,
        epaAway: awayEpaOff !== null ? Math.round(awayEpaOff * 1000) / 1000 : null,
        yppHome: homeYppOff !== null ? Math.round(homeYppOff * 10) / 10 : null,
        yppAway: awayYppOff !== null ? Math.round(awayYppOff * 10) / 10 : null,
        dataSources,
        confidence: Math.round(avgConfidence * 100) / 100,
        homeConfidence: Math.round(homeConfidence * 100) / 100,
        awayConfidence: Math.round(awayConfidence * 100) / 100,
      },
      ratings: {
        home: {
          teamId: homeId,
          offenseRating: Number(homeRating.offenseRating || 0),
          defenseRating: Number(homeRating.defenseRating || 0),
          powerRating: homePower,
          confidence: homeConfidence,
          dataSource: homeDataSource,
        },
        away: {
          teamId: awayId,
          offenseRating: Number(awayRating.offenseRating || 0),
          defenseRating: Number(awayRating.defenseRating || 0),
          powerRating: awayPower,
          confidence: awayConfidence,
          dataSource: awayDataSource,
        },
      },
    });
  } catch (error) {
    console.error('Error computing matchup:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

