/**
 * Labs Portal Continuity API Route
 * Returns teams with continuity scores for a given season
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSeasonWeek } from '@/lib/current-week';

interface PortalContinuityRow {
  teamId: string;
  teamName: string;
  conference?: string | null;
  continuityScore: number; // 0–1
  // TODO: Add wins, losses, atsWins, atsLosses if easy to compute
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonParam = searchParams.get('season');
    
    // Get season (default to current season)
    let season: number;
    if (seasonParam) {
      season = parseInt(seasonParam, 10);
      if (isNaN(season)) {
        return NextResponse.json(
          { error: 'Invalid season parameter' },
          { status: 400 }
        );
      }
    } else {
      const current = await getCurrentSeasonWeek(prisma);
      season = current.season;
    }

    // Load TeamSeasonStat rows
    const teamSeasons = await prisma.teamSeasonStat.findMany({
      where: { season },
    });

    // Load team info separately
    const teamIds = Array.from(new Set(teamSeasons.map(ts => ts.teamId)));
    const teams = await prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: {
        id: true,
        name: true,
        conference: true,
      },
    });

    const teamMap = new Map(teams.map(t => [t.id, t]));

    // Extract rows with continuity scores
    const rows: PortalContinuityRow[] = [];

    for (const teamSeason of teamSeasons) {
      const rawJson = (teamSeason.rawJson as any) || {};
      const portalMeta = rawJson.portal_meta;
      
      if (portalMeta && typeof portalMeta.continuityScore === 'number') {
        const team = teamMap.get(teamSeason.teamId);
        if (team) {
          rows.push({
            teamId: teamSeason.teamId,
            teamName: team.name,
            conference: team.conference || null,
            continuityScore: portalMeta.continuityScore,
          });
        }
      }
    }

    // Sort by continuity score descending (highest first)
    rows.sort((a, b) => b.continuityScore - a.continuityScore);

    return NextResponse.json(rows);

  } catch (error) {
    console.error('Error fetching portal continuity data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch portal continuity data' },
      { status: 500 }
    );
  }
}

