/**
 * Labs Portal Continuity API Route
 * Returns teams with continuity scores for a given season
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSeasonWeek } from '@/lib/current-week';

type RiskBand = "low" | "medium" | "high";

interface PortalContinuityRow {
  teamId: string;
  teamName: string;
  conference?: string | null;
  continuityScore: number; // 0–1
  positionalShock?: number | null; // 0–1
  mercenaryIndex?: number | null; // 0–1
  portalAggressor?: number | null; // 0–1
  riskLabel: string;
  riskBand: RiskBand;
}

function classifyPortalRisk(meta: {
  continuityScore: number | null;
  positionalShock: number | null;
  mercenaryIndex: number | null;
  portalAggressor: number | null;
} | null): { riskLabel: string; riskBand: RiskBand } {
  if (!meta) {
    return { riskLabel: "Unknown", riskBand: "medium" };
  }

  const { continuityScore, positionalShock, mercenaryIndex, portalAggressor } = meta;

  let riskScore = 0;

  // Lower continuity = more risk
  if (continuityScore != null) {
    if (continuityScore < 0.5) riskScore += 2;
    else if (continuityScore < 0.7) riskScore += 1;
    else riskScore += 0;
  }

  // High positional shock (QB/OL/DEF turnover) = more risk
  if (positionalShock != null) {
    if (positionalShock > 0.67) riskScore += 2;
    else if (positionalShock > 0.33) riskScore += 1;
  }

  // Heavy mercenary behavior = more risk
  if (mercenaryIndex != null) {
    if (mercenaryIndex > 0.67) riskScore += 2;
    else if (mercenaryIndex > 0.33) riskScore += 1;
  }

  // Aggressive portal net gain = some extra variance
  if (portalAggressor != null && portalAggressor > 0.67) {
    riskScore += 1;
  }

  let riskBand: RiskBand;
  let riskLabel: string;

  if (riskScore >= 5) {
    riskBand = "high";
    riskLabel = "Portal Chaos";
  } else if (riskScore >= 3) {
    riskBand = "medium";
    riskLabel = "High-Churn Reload";
  } else {
    riskBand = "low";
    riskLabel = "Solid Core";
  }

  return { riskLabel, riskBand };
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

    // Extract rows with portal meta indices
    const rows: PortalContinuityRow[] = [];

    for (const teamSeason of teamSeasons) {
      const rawJson = (teamSeason.rawJson as any) || {};
      const portalMeta = rawJson.portal_meta;
      
      if (portalMeta && typeof portalMeta.continuityScore === 'number') {
        const team = teamMap.get(teamSeason.teamId);
        if (team) {
          const risk = classifyPortalRisk({
            continuityScore: portalMeta.continuityScore ?? null,
            positionalShock: typeof portalMeta.positionalShock === 'number' ? portalMeta.positionalShock : null,
            mercenaryIndex: typeof portalMeta.mercenaryIndex === 'number' ? portalMeta.mercenaryIndex : null,
            portalAggressor: typeof portalMeta.portalAggressor === 'number' ? portalMeta.portalAggressor : null,
          });

          rows.push({
            teamId: teamSeason.teamId,
            teamName: team.name,
            conference: team.conference || null,
            continuityScore: portalMeta.continuityScore,
            positionalShock: typeof portalMeta.positionalShock === 'number' ? portalMeta.positionalShock : null,
            mercenaryIndex: typeof portalMeta.mercenaryIndex === 'number' ? portalMeta.mercenaryIndex : null,
            portalAggressor: typeof portalMeta.portalAggressor === 'number' ? portalMeta.portalAggressor : null,
            riskLabel: risk.riskLabel,
            riskBand: risk.riskBand,
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

