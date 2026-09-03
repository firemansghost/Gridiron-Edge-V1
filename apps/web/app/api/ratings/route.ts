/**
 * API Route: Get All Team Ratings
 *
 * Read-only. Returns persisted TeamSeasonRating rows (modelVersion=v1)
 * for the season-specific FBS population. 2026+ conference comes from
 * TeamMembership only — never Team.conference.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSeasonWeek } from '@/lib/current-week';
import {
  CORE_V1_RATINGS_MODEL_VERSION,
  RatingsConferenceIntegrityError,
  assertRatingsPageConferences,
  buildRatingsProvenance,
  isSeasonAwareConferenceSeason,
  lifecycleGamesSample,
  lifecycleOffenseDefenseAvailable,
} from '@/lib/ratings-truth';

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(String(value));
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonParam = searchParams.get('season');

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

    const seasonAware = isSeasonAwareConferenceSeason(season);

    const fbsMemberships = await prisma.teamMembership.findMany({
      where: {
        season,
        level: 'fbs',
      },
      select: {
        teamId: true,
        conference: true,
      },
    });

    if (seasonAware) {
      const seen = new Map<string, number>();
      for (const row of fbsMemberships) {
        const key = row.teamId.toLowerCase();
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      const duplicateTeamIds = Array.from(seen.entries())
        .filter(([, count]) => count > 1)
        .map(([id]) => id);
      if (duplicateTeamIds.length > 0) {
        throw new RatingsConferenceIntegrityError(season, duplicateTeamIds);
      }
    }

    const membershipConferenceByTeamId = new Map(
      fbsMemberships.map((row) => [row.teamId.toLowerCase(), row.conference])
    );
    const fbsTeamIds = Array.from(membershipConferenceByTeamId.keys());

    const ratings = await prisma.teamSeasonRating.findMany({
      where: {
        season,
        modelVersion: CORE_V1_RATINGS_MODEL_VERSION,
        teamId: {
          in: fbsTeamIds,
        },
      },
    });

    const teamIds = Array.from(new Set(ratings.map((r) => r.teamId)));
    const teams = await prisma.team.findMany({
      where: {
        id: {
          in: teamIds,
        },
      },
      select: seasonAware
        ? { id: true, name: true }
        : { id: true, name: true, conference: true },
    });

    const teamMap = new Map(teams.map((t) => [t.id.toLowerCase(), t]));

    const withTeams = ratings
      .map((rating) => {
        const team = teamMap.get(rating.teamId.toLowerCase());
        if (!team) return null;
        return { rating, team };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const conferences = assertRatingsPageConferences(
      season,
      withTeams.map(({ rating, team }) => ({
        teamId: rating.teamId,
        membershipConference: membershipConferenceByTeamId.get(
          rating.teamId.toLowerCase()
        ),
        teamConference: seasonAware
          ? undefined
          : 'conference' in team
            ? (team.conference as string | null)
            : undefined,
      }))
    );

    const mapped = withTeams.map(({ rating, team }, index) => {
      const dataSource = rating.dataSource || null;
      const offenseAvailable = lifecycleOffenseDefenseAvailable(dataSource);
      const games = rating.games ?? 0;

      return {
        teamId: rating.teamId,
        team: team.name,
        conference: conferences[index],
        rating: Number(rating.powerRating || rating.rating || 0),
        offenseRating: offenseAvailable
          ? toFiniteNumber(rating.offenseRating)
          : null,
        defenseRating: offenseAvailable
          ? toFiniteNumber(rating.defenseRating)
          : null,
        games,
        gamesSample: lifecycleGamesSample(games),
        confidence: toFiniteNumber(rating.confidence),
        dataSource,
      };
    });

    mapped.sort((a, b) => b.rating - a.rating);
    const ratingsWithRanks = mapped.map((r, index) => ({
      ...r,
      rank: index + 1,
    }));

    return NextResponse.json({
      success: true,
      season,
      provenance: buildRatingsProvenance(season),
      ratings: ratingsWithRanks,
      count: ratingsWithRanks.length,
    });
  } catch (error) {
    if (error instanceof RatingsConferenceIntegrityError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          teamIds: error.teamIds,
        },
        { status: 409 }
      );
    }

    console.error('Error fetching ratings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch ratings' },
      { status: 500 }
    );
  }
}
