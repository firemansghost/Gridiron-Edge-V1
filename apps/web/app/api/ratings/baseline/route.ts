import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const season = parseInt(searchParams.get('season') || '2025');
    const limit = parseInt(searchParams.get('limit') || '25');

    const ratings = await prisma.teamSeasonRating.findMany({
      where: { season },
      orderBy: { rating: 'desc' },
      take: limit,
      select: {
        teamId: true,
        games: true,
        pointsFor: true,
        pointsAgainst: true,
        movAvg: true,
        rating: true,
        offenseRating: true,
        defenseRating: true,
        sigma: true,
        createdAt: true
      }
    });

    return NextResponse.json({
      season,
      ratings: ratings.map(r => ({
        teamId: r.teamId,
        games: r.games,
        pointsFor: r.pointsFor,
        pointsAgainst: r.pointsAgainst,
        movAvg: r.movAvg ? Number(r.movAvg) : null,
        rating: r.rating ? Number(r.rating) : null,
        offenseRating: r.offenseRating ? Number(r.offenseRating) : null,
        defenseRating: r.defenseRating ? Number(r.defenseRating) : null,
        sigma: r.sigma ? Number(r.sigma) : null,
        createdAt: r.createdAt
      })),
      count: ratings.length
    });
  } catch (error) {
    console.error('Error fetching baseline ratings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch baseline ratings' },
      { status: 500 }
    );
  }
}
