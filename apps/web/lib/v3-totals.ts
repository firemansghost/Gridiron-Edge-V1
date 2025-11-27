/**
 * V3 Totals Helper
 * 
 * Shared utilities for calculating V3 Drive-Quality Totals model projections.
 * This matches the exact logic used in sync-v3-bets.ts and compute_ratings_v3_totals.ts.
 */

import { prisma } from './prisma';

export interface DriveStats {
  total_drives: number;
  quality_drives: number;
  quality_drive_rate: number;
  drives_per_game: number;
  total_games: number;
  total_yards: number;
  total_plays: number;
  scoring_drives: number;
  points_per_drive?: number;
}

export interface TeamDriveMetrics {
  teamId: string;
  qualityDriveRate: number;
  drivesPerGame: number;
  defensiveQualityRateAllowed: number; // Opponent quality drive rate when this team is on defense
  gamesPlayed: number;
}

export interface V3GameProjection {
  homeProjectedScore: number;
  awayProjectedScore: number;
  modelTotal: number;
}

export type V3TotalsDebugInfo = {
  source: 'v3' | 'fallback';
  gameId: string;
  season: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  home: {
    drives: number;
    qualityDrives: number;
    qualityRate: number;     // 0–1
    drivesPerGame: number;
    projectedPoints: number;
  };
  away: {
    drives: number;
    qualityDrives: number;
    qualityRate: number;
    drivesPerGame: number;
    projectedPoints: number;
  };
  expDrives: number;
  projectedTotal: number;
};

/**
 * Extract drive stats from TeamSeasonStat rawJson
 * Also returns raw stats for debugging
 */
function extractDriveStats(rawJson: any): DriveStats | null {
  if (!rawJson || typeof rawJson !== 'object') {
    return null;
  }

  const driveStats = rawJson.drive_stats;
  if (!driveStats || typeof driveStats !== 'object') {
    return null;
  }

  return {
    total_drives: driveStats.total_drives || 0,
    quality_drives: driveStats.quality_drives || 0,
    quality_drive_rate: driveStats.quality_drive_rate || 0,
    drives_per_game: driveStats.drives_per_game || 0,
    total_games: driveStats.total_games || 0,
    total_yards: driveStats.total_yards || 0,
    total_plays: driveStats.total_plays || 0,
    scoring_drives: driveStats.scoring_drives || 0,
    points_per_drive: driveStats.points_per_drive || 0,
  };
}

/**
 * Calculate defensive quality rate allowed
 * Average quality drive rate of opponents when facing this team
 */
async function calculateDefensiveQualityRate(
  teamId: string,
  season: number,
  allTeamMetrics: Map<string, TeamDriveMetrics>
): Promise<number> {
  const games = await prisma.game.findMany({
    where: {
      season,
      OR: [
        { homeTeamId: teamId },
        { awayTeamId: teamId },
      ],
      status: 'final',
    },
    select: {
      homeTeamId: true,
      awayTeamId: true,
    },
  });

  if (games.length === 0) {
    return 0.4; // Default fallback
  }

  let totalOpponentRate = 0;
  let count = 0;

  for (const game of games) {
    const opponentId = game.homeTeamId === teamId ? game.awayTeamId : game.homeTeamId;
    const opponentMetrics = allTeamMetrics.get(opponentId);
    
    if (opponentMetrics) {
      totalOpponentRate += opponentMetrics.qualityDriveRate;
      count++;
    }
  }

  return count > 0 ? totalOpponentRate / count : 0.4;
}

/**
 * Load team drive metrics for a season (with caching)
 */
const metricsCache = new Map<string, { metrics: Map<string, TeamDriveMetrics>; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache

export async function loadTeamDriveMetrics(season: number, useCache: boolean = true): Promise<Map<string, TeamDriveMetrics>> {
  const cacheKey = `season-${season}`;
  const cached = metricsCache.get(cacheKey);
  
  if (useCache && cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.metrics;
  }

  const teamStats = await prisma.teamSeasonStat.findMany({
    where: { season },
    select: {
      teamId: true,
      rawJson: true,
    },
  });

  const metrics = new Map<string, TeamDriveMetrics>();

  for (const stat of teamStats) {
    const driveStats = extractDriveStats(stat.rawJson);
    if (!driveStats || driveStats.total_drives < 20) {
      continue; // Skip teams with insufficient data
    }

    metrics.set(stat.teamId, {
      teamId: stat.teamId,
      qualityDriveRate: driveStats.quality_drive_rate,
      drivesPerGame: driveStats.drives_per_game,
      defensiveQualityRateAllowed: 0, // Will be calculated below
      gamesPlayed: driveStats.total_games,
    });
  }

  // Calculate defensive quality rates
  for (const [teamId, metric] of Array.from(metrics.entries())) {
    metric.defensiveQualityRateAllowed = await calculateDefensiveQualityRate(
      teamId,
      season,
      metrics
    );
  }

  // Update cache
  if (useCache) {
    metricsCache.set(cacheKey, { metrics, timestamp: Date.now() });
  }

  return metrics;
}

/**
 * Project score for a team in a game
 * Formula: (Expected Drives * Quality Rate) * 5.0
 */
export function projectTeamScore(
  teamMetrics: TeamDriveMetrics,
  opponentMetrics: TeamDriveMetrics
): number {
  // Expected drives = average of both teams' tempo
  const expectedDrives = (teamMetrics.drivesPerGame + opponentMetrics.drivesPerGame) / 2.0;

  // Quality drive rate = average of team's offensive rate and opponent's defensive rate allowed
  const qualityRate = (teamMetrics.qualityDriveRate + opponentMetrics.defensiveQualityRateAllowed) / 2.0;

  // Projected quality drives
  const projectedQualityDrives = expectedDrives * qualityRate;

  // Projected score = quality drives * 5.0 points per quality drive
  const projectedScore = projectedQualityDrives * 5.0;

  return Math.max(0, projectedScore);
}

/**
 * Calculate V3 game total projection
 * Returns null if metrics are unavailable for either team
 */
export async function calculateV3GameTotal(
  homeTeamId: string,
  awayTeamId: string,
  season: number
): Promise<V3GameProjection | null> {
  try {
    const teamMetrics = await loadTeamDriveMetrics(season);
    
    const homeMetrics = teamMetrics.get(homeTeamId);
    const awayMetrics = teamMetrics.get(awayTeamId);

    if (!homeMetrics || !awayMetrics) {
      return null; // Missing drive metrics
    }

    // Project scores
    const homeScore = projectTeamScore(homeMetrics, awayMetrics);
    const awayScore = projectTeamScore(awayMetrics, homeMetrics);
    const modelTotal = homeScore + awayScore;

    return {
      homeProjectedScore: homeScore,
      awayProjectedScore: awayScore,
      modelTotal,
    };
  } catch (error) {
    console.error(`[V3 Totals] Error calculating game total for ${homeTeamId} vs ${awayTeamId}:`, error);
    return null;
  }
}

/**
 * Explain V3 game total calculation with detailed breakdown
 * Uses the exact same logic as calculateV3GameTotal for consistency
 */
export async function explainV3GameTotal(gameId: string): Promise<V3TotalsDebugInfo | null> {
  try {
    // Load game info
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    });

    if (!game) {
      return null;
    }

    // Load team drive metrics (same as calculateV3GameTotal)
    const teamMetrics = await loadTeamDriveMetrics(game.season);
    
    const homeMetrics = teamMetrics.get(game.homeTeamId);
    const awayMetrics = teamMetrics.get(game.awayTeamId);

    // Determine source
    const source: 'v3' | 'fallback' = (homeMetrics && awayMetrics) ? 'v3' : 'fallback';

    if (!homeMetrics || !awayMetrics) {
      // Return fallback info even if metrics are missing
      return {
        source: 'fallback',
        gameId: game.id,
        season: game.season,
        week: game.week,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name,
        home: {
          drives: 0,
          qualityDrives: 0,
          qualityRate: 0,
          drivesPerGame: 0,
          projectedPoints: 0,
        },
        away: {
          drives: 0,
          qualityDrives: 0,
          qualityRate: 0,
          drivesPerGame: 0,
          projectedPoints: 0,
        },
        expDrives: 0,
        projectedTotal: 0,
      };
    }

    // Get raw drive stats for detailed breakdown
    const homeStats = await prisma.teamSeasonStat.findUnique({
      where: {
        season_teamId: {
          season: game.season,
          teamId: game.homeTeamId,
        },
      },
      select: { rawJson: true },
    });

    const awayStats = await prisma.teamSeasonStat.findUnique({
      where: {
        season_teamId: {
          season: game.season,
          teamId: game.awayTeamId,
        },
      },
      select: { rawJson: true },
    });

    const homeDriveStats = extractDriveStats(homeStats?.rawJson);
    const awayDriveStats = extractDriveStats(awayStats?.rawJson);

    // Calculate projections (same logic as calculateV3GameTotal)
    const expectedDrives = (homeMetrics.drivesPerGame + awayMetrics.drivesPerGame) / 2.0;
    
    const homeQualityRate = (homeMetrics.qualityDriveRate + awayMetrics.defensiveQualityRateAllowed) / 2.0;
    const awayQualityRate = (awayMetrics.qualityDriveRate + homeMetrics.defensiveQualityRateAllowed) / 2.0;
    
    const homeProjectedQualityDrives = expectedDrives * homeQualityRate;
    const awayProjectedQualityDrives = expectedDrives * awayQualityRate;
    
    const homeProjectedPoints = homeProjectedQualityDrives * 5.0;
    const awayProjectedPoints = awayProjectedQualityDrives * 5.0;
    const projectedTotal = homeProjectedPoints + awayProjectedPoints;

    return {
      source: 'v3',
      gameId: game.id,
      season: game.season,
      week: game.week,
      homeTeam: game.homeTeam.name,
      awayTeam: game.awayTeam.name,
      home: {
        drives: homeDriveStats?.total_drives || 0,
        qualityDrives: homeDriveStats?.quality_drives || 0,
        qualityRate: homeMetrics.qualityDriveRate,
        drivesPerGame: homeMetrics.drivesPerGame,
        projectedPoints: homeProjectedPoints,
      },
      away: {
        drives: awayDriveStats?.total_drives || 0,
        qualityDrives: awayDriveStats?.quality_drives || 0,
        qualityRate: awayMetrics.qualityDriveRate,
        drivesPerGame: awayMetrics.drivesPerGame,
        projectedPoints: awayProjectedPoints,
      },
      expDrives: expectedDrives,
      projectedTotal,
    };
  } catch (error) {
    console.error(`[V3 Totals] Error explaining game total for ${gameId}:`, error);
    return null;
  }
}

