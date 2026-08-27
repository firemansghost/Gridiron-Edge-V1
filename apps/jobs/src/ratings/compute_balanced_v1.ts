/**
 * Pure Balanced V1 rating calculation (25/25/25/25 × 14.0).
 *
 * Shared by:
 * - compute_ratings_balanced.ts (writer)
 * - balanced-v1-historical-parity-audit (read-only forensic)
 *
 * Do not change weights, calibration factor, EPA/net/win semantics, or FBS filtering.
 */

export const BALANCED_V1_CALIBRATION_FACTOR = 14.0 as const;
export const BALANCED_WEIGHT_TALENT = 0.25 as const;
export const BALANCED_WEIGHT_EPA = 0.25 as const;
export const BALANCED_WEIGHT_NET_POINTS = 0.25 as const;
export const BALANCED_WEIGHT_WIN_PCT = 0.25 as const;
export const BALANCED_MODEL_VERSION = 'v1' as const;

/** Documented upsert UPDATE fields — writer leaves legacy metadata untouched on UPDATE. */
export const BALANCED_V1_UPSERT_UPDATE_FIELDS = [
  'powerRating',
  'rating',
  'games',
] as const;

/** Fields intentionally NOT updated on existing V1 rows by Balanced writer. */
export const BALANCED_V1_UPSERT_UPDATE_LEAVES_UNCHANGED = [
  'offenseRating',
  'defenseRating',
  'confidence',
  'dataSource',
] as const;

export const BALANCED_WRITER_CAN_LEAVE_LEGACY_METADATA = true as const;

export interface BalancedTeamMetrics {
  teamId: string;
  teamName: string;
  talentScore: number;
  epaOverall: number;
  netPointsPerGame: number;
  winPct: number;
  gamesPlayed: number;
  /** Diagnostic detail (not required by original writer return). */
  wins?: number;
  losses?: number;
  pointsFor?: number;
  pointsAgainst?: number;
  avgEpaOff?: number;
  avgEpaDef?: number;
}

export interface BalancedV1ComputedRating {
  teamId: string;
  teamName: string;
  powerRating: number;
  games: number;
  talentScore: number;
  talentZ: number;
  epaOverall: number;
  epaZ: number;
  netPointsPerGame: number;
  netPointsZ: number;
  winPct: number;
  winPctZ: number;
  zComposite: number;
  calibrationFactor: typeof BALANCED_V1_CALIBRATION_FACTOR;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  avgEpaOff: number;
  avgEpaDef: number;
}

export interface BalancedZStats {
  mean: number;
  stdDev: number;
}

export function calculateBalancedZScores(values: number[]): BalancedZStats {
  if (values.length === 0) {
    return { mean: 0, stdDev: 1 };
  }
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance) || 1;
  return { mean, stdDev };
}

export function getBalancedZScore(
  value: number,
  mean: number,
  stdDev: number
): number {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

export interface BalancedGameRow {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface BalancedEpaStatRow {
  teamId: string;
  epaOff: number | null;
  epaDef: number | null;
}

export interface BalancedTalentRow {
  teamId: string;
  talentComposite: number | null;
}

export interface TeamGameAggregate {
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  games: number;
}

/**
 * Aggregate FBS-vs-FBS final game results.
 * Non-FBS opponents are excluded (both teams must be in fbsTeamIds).
 * Team IDs are lowercased to match the existing writer.
 */
export function aggregateBalancedGameStats(
  games: BalancedGameRow[],
  fbsTeamIds: Set<string>
): Map<string, TeamGameAggregate> {
  const teamStats = new Map<string, TeamGameAggregate>();
  const fbs = new Set([...fbsTeamIds].map((id) => id.toLowerCase()));

  for (const game of games) {
    const homeId = game.homeTeamId.toLowerCase();
    const awayId = game.awayTeamId.toLowerCase();
    if (!fbs.has(homeId) || !fbs.has(awayId)) continue;

    const homeScore = game.homeScore || 0;
    const awayScore = game.awayScore || 0;

    if (!teamStats.has(homeId)) {
      teamStats.set(homeId, {
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        games: 0,
      });
    }
    const homeStat = teamStats.get(homeId)!;
    homeStat.pointsFor += homeScore;
    homeStat.pointsAgainst += awayScore;
    homeStat.games++;
    if (homeScore > awayScore) homeStat.wins++;
    else if (awayScore > homeScore) homeStat.losses++;

    if (!teamStats.has(awayId)) {
      teamStats.set(awayId, {
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        games: 0,
      });
    }
    const awayStat = teamStats.get(awayId)!;
    awayStat.pointsFor += awayScore;
    awayStat.pointsAgainst += homeScore;
    awayStat.games++;
    if (awayScore > homeScore) awayStat.wins++;
    else if (homeScore > awayScore) awayStat.losses++;
  }

  return teamStats;
}

/**
 * Aggregate EPA arrays per team. Null EPA values are skipped (same as writer).
 */
export function aggregateBalancedEpa(
  rows: BalancedEpaStatRow[]
): Map<string, { epaOff: number[]; epaDef: number[] }> {
  const epaMap = new Map<string, { epaOff: number[]; epaDef: number[] }>();
  for (const stat of rows) {
    const teamId = stat.teamId.toLowerCase();
    if (!epaMap.has(teamId)) {
      epaMap.set(teamId, { epaOff: [], epaDef: [] });
    }
    const epa = epaMap.get(teamId)!;
    if (stat.epaOff !== null) epa.epaOff.push(stat.epaOff);
    if (stat.epaDef !== null) epa.epaDef.push(stat.epaDef);
  }
  return epaMap;
}

/**
 * Build per-team Balanced metrics.
 * Preserves writer behavior: skip teams with 0 FBS-vs-FBS final games;
 * missing EPA → avgEpaOff=0, avgEpaDef=0; missing talent → 0.
 */
export function buildBalancedTeamMetrics(options: {
  fbsTeamIds: string[];
  teamNameById?: Map<string, string>;
  talentRows: BalancedTalentRow[];
  gameAggregates: Map<string, TeamGameAggregate>;
  epaByTeam: Map<string, { epaOff: number[]; epaDef: number[] }>;
}): {
  metrics: BalancedTeamMetrics[];
  skippedZeroGameTeams: string[];
  teamsWithUsableEpa: number;
  teamsMissingEpa: string[];
} {
  const fbsLower = options.fbsTeamIds.map((id) => id.toLowerCase());
  const talentMap = new Map<string, number>();
  for (const t of options.talentRows) {
    talentMap.set(t.teamId.toLowerCase(), Number(t.talentComposite || 0));
  }

  const metrics: BalancedTeamMetrics[] = [];
  const skippedZeroGameTeams: string[] = [];
  const teamsMissingEpa: string[] = [];
  let teamsWithUsableEpa = 0;

  for (const teamId of fbsLower) {
    const stat = options.gameAggregates.get(teamId);
    if (!stat || stat.games === 0) {
      skippedZeroGameTeams.push(teamId);
      continue;
    }

    const epa = options.epaByTeam.get(teamId);
    const hasEpa =
      !!epa && (epa.epaOff.length > 0 || epa.epaDef.length > 0);
    if (hasEpa) teamsWithUsableEpa++;
    else teamsMissingEpa.push(teamId);

    const avgEpaOff =
      epa && epa.epaOff.length > 0
        ? epa.epaOff.reduce((sum, v) => sum + v, 0) / epa.epaOff.length
        : 0;
    const avgEpaDef =
      epa && epa.epaDef.length > 0
        ? epa.epaDef.reduce((sum, v) => sum + v, 0) / epa.epaDef.length
        : 0;
    const epaOverall = avgEpaOff - avgEpaDef;

    const winPct = stat.games > 0 ? stat.wins / stat.games : 0;
    const netPointsPerGame =
      stat.games > 0
        ? (stat.pointsFor - stat.pointsAgainst) / stat.games
        : 0;
    const talentScore = talentMap.get(teamId) || 0;

    metrics.push({
      teamId,
      teamName: options.teamNameById?.get(teamId) || teamId,
      talentScore,
      epaOverall,
      netPointsPerGame,
      winPct,
      gamesPlayed: stat.games,
      wins: stat.wins,
      losses: stat.losses,
      pointsFor: stat.pointsFor,
      pointsAgainst: stat.pointsAgainst,
      avgEpaOff,
      avgEpaDef,
    });
  }

  return { metrics, skippedZeroGameTeams, teamsWithUsableEpa, teamsMissingEpa };
}

/**
 * Pure Balanced V1 ratings from team metrics (z-score blend × 14.0).
 */
export function computeBalancedV1Ratings(
  metrics: BalancedTeamMetrics[]
): BalancedV1ComputedRating[] {
  const talentValues = metrics.map((m) => m.talentScore);
  const epaValues = metrics.map((m) => m.epaOverall);
  const netPointsValues = metrics.map((m) => m.netPointsPerGame);
  const winPctValues = metrics.map((m) => m.winPct);

  const zStats = {
    talent: calculateBalancedZScores(talentValues),
    epa: calculateBalancedZScores(epaValues),
    netPoints: calculateBalancedZScores(netPointsValues),
    winPct: calculateBalancedZScores(winPctValues),
  };

  return metrics.map((metric) => {
    const talentZ = getBalancedZScore(
      metric.talentScore,
      zStats.talent.mean,
      zStats.talent.stdDev
    );
    const epaZ = getBalancedZScore(
      metric.epaOverall,
      zStats.epa.mean,
      zStats.epa.stdDev
    );
    const netPointsZ = getBalancedZScore(
      metric.netPointsPerGame,
      zStats.netPoints.mean,
      zStats.netPoints.stdDev
    );
    const winPctZ = getBalancedZScore(
      metric.winPct,
      zStats.winPct.mean,
      zStats.winPct.stdDev
    );

    const zComposite =
      talentZ * BALANCED_WEIGHT_TALENT +
      epaZ * BALANCED_WEIGHT_EPA +
      netPointsZ * BALANCED_WEIGHT_NET_POINTS +
      winPctZ * BALANCED_WEIGHT_WIN_PCT;

    const powerRating = zComposite * BALANCED_V1_CALIBRATION_FACTOR;

    return {
      teamId: metric.teamId,
      teamName: metric.teamName,
      powerRating,
      games: metric.gamesPlayed,
      talentScore: metric.talentScore,
      talentZ,
      epaOverall: metric.epaOverall,
      epaZ,
      netPointsPerGame: metric.netPointsPerGame,
      netPointsZ,
      winPct: metric.winPct,
      winPctZ,
      zComposite,
      calibrationFactor: BALANCED_V1_CALIBRATION_FACTOR,
      wins: metric.wins ?? 0,
      losses: metric.losses ?? 0,
      pointsFor: metric.pointsFor ?? 0,
      pointsAgainst: metric.pointsAgainst ?? 0,
      avgEpaOff: metric.avgEpaOff ?? 0,
      avgEpaDef: metric.avgEpaDef ?? 0,
    };
  });
}
