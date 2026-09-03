/**
 * Labs Hybrid Slate API
 * Read-only Game-frame shadow comparison. Does not authorize Hybrid,
 * persist records, or substitute Core V1 as Hybrid.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  HYBRID_LIVE_MUTABLE_SHADOW,
  buildHybridShadowCoverage,
  buildHybridShadowGame,
  buildHybridShadowStatus,
  isFiniteRating,
  type HybridShadowMarket,
  type HybridShadowUnitGrades,
} from '@/lib/labs/hybrid-shadow-truth';

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toUnitGrades(row: unknown): HybridShadowUnitGrades | null {
  if (row == null || typeof row !== 'object') return null;
  const grades = row as Record<string, unknown>;
  const mapped: HybridShadowUnitGrades = {
    offRunGrade: Number(grades.offRunGrade),
    defRunGrade: Number(grades.defRunGrade),
    offPassGrade: Number(grades.offPassGrade),
    defPassGrade: Number(grades.defPassGrade),
    offExplosiveness: Number(grades.offExplosiveness),
    defExplosiveness: Number(grades.defExplosiveness),
  };
  return Object.values(mapped).every(isFiniteRating) ? mapped : null;
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

    const teamIds = new Set<string>();
    games.forEach((game) => {
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
      const value =
        rating.powerRating !== null && rating.powerRating !== undefined
          ? Number(rating.powerRating)
          : rating.rating !== null && rating.rating !== undefined
            ? Number(rating.rating)
            : NaN;
      if (isFiniteRating(value)) {
        ratingsMap.set(rating.teamId, value);
      }
    }

    const gameIds = games.map((g) => g.id);
    const marketLines = await prisma.marketLine.findMany({
      where: {
        gameId: { in: gameIds },
        lineType: 'spread',
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    const marketMap = new Map<string, HybridShadowMarket>();
    for (const line of marketLines) {
      if (!marketMap.has(line.gameId)) {
        marketMap.set(line.gameId, {
          value: toFiniteNumber(line.lineValue),
          favoriteTeamId: line.teamId,
          book: line.bookName || null,
          timestamp: line.timestamp ? line.timestamp.toISOString() : null,
          source: line.source || null,
        });
      }
    }

    const shadowGames = games.map((game) => {
      const homeGrades = toUnitGrades(
        game.homeTeam.unitGrades.find((g) => g.season === season)
      );
      const awayGrades = toUnitGrades(
        game.awayTeam.unitGrades.find((g) => g.season === season)
      );

      return buildHybridShadowGame({
        gameId: game.id,
        date: game.date.toISOString(),
        status: game.status,
        awayTeamId: game.awayTeamId,
        awayTeamName: game.awayTeam.name,
        homeTeamId: game.homeTeamId,
        homeTeamName: game.homeTeam.name,
        awayScore: game.awayScore,
        homeScore: game.homeScore,
        neutralSite: game.neutralSite || false,
        homeRating: ratingsMap.has(game.homeTeamId)
          ? ratingsMap.get(game.homeTeamId)
          : null,
        awayRating: ratingsMap.has(game.awayTeamId)
          ? ratingsMap.get(game.awayTeamId)
          : null,
        homeGrades,
        awayGrades,
        market: marketMap.get(game.id) || null,
      });
    });

    const coverage = buildHybridShadowCoverage(shadowGames);
    const status = buildHybridShadowStatus(season);

    return NextResponse.json({
      season,
      week,
      liveMutable: HYBRID_LIVE_MUTABLE_SHADOW,
      status,
      coverage,
      games: shadowGames.map((game) => ({
        ...game,
        kickoffLocal: new Date(game.date).toLocaleString('en-US', {
          timeZone: 'America/Chicago',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
      })),
      count: shadowGames.length,
    });
  } catch (error) {
    console.error('Error fetching hybrid slate:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch hybrid slate',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
