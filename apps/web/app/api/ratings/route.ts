/**
 * API Route: Get All Team Ratings
 * 
 * Returns all FBS teams with their V1 model ratings for a given season
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSeasonWeek } from '@/lib/current-week';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonParam = searchParams.get('season');
    
    // Get season - use param if provided, otherwise get latest from DB
    let season: number;
    if (seasonParam) {
      season = parseInt(seasonParam, 10);
      if (isNaN(season)) {
        return NextResponse.json(
          { success: false, error: 'Invalid season parameter' },
          { status: 400 }
        );
      }
    } else {
      const current = await getCurrentSeasonWeek(prisma);
      season = current.season;
    }

    // Get all FBS teams for this season
    const fbsMemberships = await prisma.teamMembership.findMany({
      where: {
        season,
        level: 'fbs',
      },
      select: {
        teamId: true,
      },
    });

    const fbsTeamIds = new Set(fbsMemberships.map(m => m.teamId.toLowerCase()));

    // Get all team ratings for this season (V1 model)
    const ratings = await prisma.teamSeasonRating.findMany({
      where: {
        season,
        modelVersion: 'v1',
        teamId: {
          in: Array.from(fbsTeamIds),
        },
      },
      // Note: TeamSeasonRating doesn't have a direct relation to Team in schema
      // We'll join manually below
    });

    // Get team details
    const teamIds = Array.from(new Set(ratings.map(r => r.teamId)));
    const teams = await prisma.team.findMany({
      where: {
        id: {
          in: teamIds,
        },
      },
      select: {
        id: true,
        name: true,
        conference: true,
      },
    });

    // Create team lookup map
    const teamMap = new Map(teams.map(t => [t.id.toLowerCase(), t]));

    // Combine ratings with team info and calculate rank
    const ratingsWithTeams = ratings
      .map(rating => {
        const team = teamMap.get(rating.teamId.toLowerCase());
        if (!team) return null;

        const powerRating = Number(rating.powerRating || rating.rating || 0);
        
        return {
          teamId: rating.teamId,
          team: team.name,
          conference: team.conference || 'Unknown',
          rating: powerRating,
          offenseRating: rating.offenseRating ? Number(rating.offenseRating) : null,
          defenseRating: rating.defenseRating ? Number(rating.defenseRating) : null,
          games: rating.games,
          confidence: rating.confidence ? Number(rating.confidence) : null,
          dataSource: rating.dataSource || null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // Sort by rating (descending) and assign ranks
    ratingsWithTeams.sort((a, b) => b.rating - a.rating);
    const ratingsWithRanks = ratingsWithTeams.map((r, index) => ({
      ...r,
      rank: index + 1,
    }));

    return NextResponse.json({
      success: true,
      season,
      ratings: ratingsWithRanks,
      count: ratingsWithRanks.length,
    });
  } catch (error) {
    console.error('Error fetching ratings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch ratings' },
      { status: 500 }
    );
  }
}

