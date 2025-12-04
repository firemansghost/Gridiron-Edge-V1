/**
 * Labs Hybrid Slate API Route
 * Returns games with V1, V2, and Hybrid spread predictions for comparison
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateHybridSpread, calculateV1Spread } from '@/lib/core-v2-spread';
import { getCoreV1SpreadFromTeams } from '@/lib/core-v1-spread';

interface HybridGame {
  gameId: string;
  date: string;
  kickoffLocal: string;
  status: 'final' | 'scheduled' | 'in_progress';
  awayTeamId: string;
  awayTeamName: string;
  homeTeamId: string;
  homeTeamName: string;
  awayScore: number | null;
  homeScore: number | null;
  neutralSite: boolean;
  // Spread predictions
  v1Spread: {
    hma: number; // Home minus Away
    favoriteSpread: number; // Favorite-centric (negative)
    favoriteTeamId: string | null;
    favoriteName: string | null;
  };
  v2Spread: {
    hma: number;
    favoriteSpread: number;
    favoriteTeamId: string | null;
    favoriteName: string | null;
  };
  hybridSpread: {
    hma: number;
    favoriteSpread: number;
    favoriteTeamId: string | null;
    favoriteName: string | null;
  };
  // Difference between Hybrid and V1
  diff: number; // Hybrid - V1 (in favorite-centric terms)
  // Market line for comparison
  marketSpread: {
    value: number | null;
    favoriteTeamId: string | null;
  } | null;
  // Validation flags
  favoritesDisagree?: boolean;
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

    console.log(`🔬 Fetching hybrid slate for ${season} Week ${week}`);

    // Fetch games with teams and unit grades
    const games = await prisma.game.findMany({
      where: {
        season,
        week,
      },
      include: {
        homeTeam: {
          include: {
            unitGrades: {
              where: { season },
            },
          },
        },
        awayTeam: {
          include: {
            unitGrades: {
              where: { season },
            },
          },
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    // Fetch V1 ratings for all teams
    const teamIds = new Set<string>();
    games.forEach(game => {
      teamIds.add(game.homeTeamId);
      teamIds.add(game.awayTeamId);
    });

    const v1Ratings = await prisma.teamSeasonRating.findMany({
      where: {
        season,
        teamId: { in: Array.from(teamIds) },
        modelVersion: 'v1',
      },
      select: {
        teamId: true,
        powerRating: true,
        rating: true,
      },
    });

    const ratingsMap = new Map<string, number>();
    for (const rating of v1Ratings) {
      const value = rating.powerRating !== null 
        ? Number(rating.powerRating) 
        : (rating.rating !== null ? Number(rating.rating) : null);
      if (value !== null) {
        ratingsMap.set(rating.teamId, value);
      }
    }

    // Fetch market spreads
    const gameIds = games.map(g => g.id);
    const marketLines = await prisma.marketLine.findMany({
      where: {
        gameId: { in: gameIds },
        lineType: 'spread',
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    // Group by game and get most recent
    const marketMap = new Map<string, { value: number; favoriteTeamId: string | null }>();
    for (const line of marketLines) {
      if (!marketMap.has(line.gameId)) {
        marketMap.set(line.gameId, {
          value: line.lineValue,
          favoriteTeamId: line.teamId,
        });
      }
    }

    // Calculate hybrid spreads for each game
    const hybridGames: HybridGame[] = [];

    for (const game of games) {
      const homeRating = ratingsMap.get(game.homeTeamId);
      const awayRating = ratingsMap.get(game.awayTeamId);
      const homeGrades = game.homeTeam.unitGrades.find(g => g.season === season);
      const awayGrades = game.awayTeam.unitGrades.find(g => g.season === season);

      // Skip if missing required data
      if (!homeRating || !awayRating || !homeGrades || !awayGrades) {
        console.log(`⚠️  Skipping game ${game.id}: missing ratings or unit grades`);
        continue;
      }

      // Calculate V1 spread using the same logic as hybrid blend
      // This ensures consistency between V1 display and hybrid calculation
      const v1SpreadHma = calculateV1Spread(
        homeRating,
        awayRating,
        game.neutralSite || false
      );
      
      // Determine favorite for V1
      const isV1HomeFavorite = v1SpreadHma > 0;
      const v1FavoriteTeamId = isV1HomeFavorite ? game.homeTeamId : game.awayTeamId;
      const v1FavoriteName = isV1HomeFavorite ? game.homeTeam.name : game.awayTeam.name;
      
      // Convert to favorite-centric: if home favored (HMA > 0), favorite spread = -HMA; if away favored (HMA < 0), favorite spread = HMA (already negative)
      const v1FavoriteSpread = v1SpreadHma > 0 ? -v1SpreadHma : v1SpreadHma;

      // Calculate Hybrid spread
      const hybridResult = calculateHybridSpread(
        homeRating,
        awayRating,
        {
          offRunGrade: homeGrades.offRunGrade,
          defRunGrade: homeGrades.defRunGrade,
          offPassGrade: homeGrades.offPassGrade,
          defPassGrade: homeGrades.defPassGrade,
          offExplosiveness: homeGrades.offExplosiveness,
          defExplosiveness: homeGrades.defExplosiveness,
        },
        {
          offRunGrade: awayGrades.offRunGrade,
          defRunGrade: awayGrades.defRunGrade,
          offPassGrade: awayGrades.offPassGrade,
          defPassGrade: awayGrades.defPassGrade,
          offExplosiveness: awayGrades.offExplosiveness,
          defExplosiveness: awayGrades.defExplosiveness,
        },
        game.neutralSite || false,
        game.homeTeamId,
        game.awayTeamId
      );

      // Get favorite names
      const v2FavoriteName = hybridResult.favoriteTeamId === game.homeTeamId 
        ? game.homeTeam.name 
        : game.awayTeam.name;
      const hybridFavoriteName = hybridResult.favoriteTeamId === game.homeTeamId 
        ? game.homeTeam.name 
        : game.awayTeam.name;

      // Calculate difference (Hybrid - V1) in favorite-centric terms
      const diff = hybridResult.hybridFavoriteSpread - v1FavoriteSpread;

      // Get market spread
      const marketData = marketMap.get(game.id);

      // Compute favoritesDisagree: Check if hybrid model and market favor different teams
      let favoritesDisagree = false;
      if (hybridResult.favoriteTeamId && marketData?.favoriteTeamId) {
        favoritesDisagree = hybridResult.favoriteTeamId !== marketData.favoriteTeamId;
      }

      hybridGames.push({
        gameId: game.id,
        date: game.date.toISOString(),
        kickoffLocal: game.date.toLocaleString('en-US', {
          timeZone: 'America/Chicago',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
        status: game.status,
        awayTeamId: game.awayTeamId,
        awayTeamName: game.awayTeam.name,
        homeTeamId: game.homeTeamId,
        homeTeamName: game.homeTeam.name,
        awayScore: game.awayScore,
        homeScore: game.homeScore,
        neutralSite: game.neutralSite || false,
        v1Spread: {
          hma: v1SpreadHma,
          favoriteSpread: v1FavoriteSpread,
          favoriteTeamId: v1FavoriteTeamId,
          favoriteName: v1FavoriteName,
        },
        v2Spread: {
          hma: hybridResult.v2SpreadHma,
          favoriteSpread: hybridResult.v2FavoriteSpread,
          favoriteTeamId: hybridResult.favoriteTeamId,
          favoriteName: v2FavoriteName,
        },
        hybridSpread: {
          hma: hybridResult.hybridSpreadHma,
          favoriteSpread: hybridResult.hybridFavoriteSpread,
          favoriteTeamId: hybridResult.favoriteTeamId,
          favoriteName: hybridFavoriteName,
        },
        diff,
        marketSpread: marketData || null,
        favoritesDisagree,
      });
    }

    return NextResponse.json({
      season,
      week,
      games: hybridGames,
      count: hybridGames.length,
    });
  } catch (error) {
    console.error('❌ Error fetching hybrid slate:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hybrid slate', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

