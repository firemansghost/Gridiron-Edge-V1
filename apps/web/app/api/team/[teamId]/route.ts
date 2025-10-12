/**
 * API Route: Get Team Detail
 * 
 * Returns team information with latest power rating
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    const { teamId } = params;
    const { searchParams } = new URL(request.url);
    const season = searchParams.get('season');
    const week = searchParams.get('week');

    // Fetch team data
    const team = await prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      return NextResponse.json(
        { success: false, error: 'Team not found' },
        { status: 404 }
      );
    }

    // Fetch latest power rating (or specific season/week if provided)
    let powerRating;
    if (season && week) {
      powerRating = await prisma.powerRating.findFirst({
        where: {
          teamId: teamId,
          season: parseInt(season),
          week: parseInt(week),
        },
        orderBy: { modelVersion: 'desc' },
      });
    } else {
      // Get most recent rating
      powerRating = await prisma.powerRating.findFirst({
        where: { teamId: teamId },
        orderBy: [
          { season: 'desc' },
          { week: 'desc' },
          { modelVersion: 'desc' },
        ],
      });
    }

    // Fetch recent games (last 5)
    const recentGames = await prisma.game.findMany({
      where: {
        OR: [
          { homeTeamId: teamId },
          { awayTeamId: teamId },
        ],
      },
      orderBy: { date: 'desc' },
      take: 5,
      include: {
        homeTeam: true,
        awayTeam: true,
      },
    });

    return NextResponse.json({
      success: true,
      team: {
        id: team.id,
        name: team.name,
        conference: team.conference,
        division: team.division,
        city: team.city,
        state: team.state,
        mascot: team.mascot,
        logoUrl: team.logoUrl,
        primaryColor: team.primaryColor,
        secondaryColor: team.secondaryColor,
      },
      rating: powerRating ? {
        rating: powerRating.rating,
        season: powerRating.season,
        week: powerRating.week,
        modelVersion: powerRating.modelVersion,
      } : null,
      recentGames: recentGames.map(game => ({
        gameId: game.id,
        date: game.date.toISOString(),
        opponent: game.homeTeamId === teamId ? game.awayTeam.name : game.homeTeam.name,
        isHome: game.homeTeamId === teamId,
        venue: game.venue,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        status: game.status,
      })),
    });
  } catch (error) {
    console.error('Error fetching team:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch team data' },
      { status: 500 }
    );
  }
}

