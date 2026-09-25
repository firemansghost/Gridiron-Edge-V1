/**
 * V4 Prospective V1 — pure research comparator math.
 *
 * No providers. No database access. No persistence.
 * Contract: research/v4-prospective/V4_PROSPECTIVE_V1_CONTRACT.md
 */

export const V4_PROSPECTIVE_V1_ID = 'v4_prospective_v1' as const;
export const V4_PROSPECTIVE_V1_SEASON = 2026;
export const V4_PROSPECTIVE_V1_TARGET_WEEK = 4;
export const V4_PROSPECTIVE_V1_COMPLETED_WEEKS = [1, 2, 3] as const;
export const V4_PROSPECTIVE_V1_PROVIDER_CALL_BUDGET = 6;
export const V4_PROSPECTIVE_V1_EXPECTED_FBS = 138;
export const V4_PROSPECTIVE_V1_HFA = 2.0;
export const V4_PROSPECTIVE_V1_EDGE_THRESHOLD = 0.1;
export const V4_PROSPECTIVE_V1_MAX_MARKET_AGE_SECONDS = 1800;

export const V4_PROSPECTIVE_V1_WEIGHTS = {
  success: 0.50,
  explosiveness: 0.25,
  finishing: 0.15,
  availableYards: 0.10,
} as const;

export interface MappedAdvancedRow {
  teamId: string;
  offense: {
    plays: number;
    successRate: number;
    explosiveness: number;
  };
  defense: {
    plays: number;
    successRate: number;
    explosiveness: number;
  };
}

export interface MappedDriveRow {
  offenseTeamId: string;
  defenseTeamId: string;
  startYardline: number | null;
  endYardline: number | null;
  yards: number | null;
  offensePointsFromPlays: number | null;
}

export interface AdvancedTeamFeature {
  teamId: string;
  offSuccess: number | null;
  defSuccess: number | null;
  rawOffExplosiveness: number | null;
  rawDefExplosiveness: number | null;
  offensePlays: number;
  defensePlays: number;
  offenseSuccessfulPlayWeight: number;
  defenseSuccessfulPlayWeight: number;
}

export interface DriveTeamFeature {
  teamId: string;
  offFinishing: number | null;
  defFinishing: number | null;
  offAvailableYardsPct: number | null;
  defAvailableYardsPct: number | null;
  offScoringOpps: number;
  defScoringOpps: number;
  offScoringOppsMissingPoints: number;
  defScoringOppsMissingPoints: number;
  offAvailableDrives: number;
  defAvailableDrives: number;
}

export interface V4ProspectiveTeamFeature extends AdvancedTeamFeature, DriveTeamFeature {
  offExplosivenessGrade: number | null;
  defExplosivenessGrade: number | null;
}

export interface ZStats {
  mean: number;
  stdDev: number;
  count: number;
}

export interface V4ProspectiveRating {
  teamId: string;
  offenseRating: number;
  defenseRating: number;
  netV4: number;
  rating: number;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function calculateZStats(values: number[]): ZStats {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) return { mean: 0, stdDev: 1, count: 0 };
  const mean = finiteValues.reduce((a, b) => a + b, 0) / finiteValues.length;
  const variance =
    finiteValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
    finiteValues.length;
  return {
    mean,
    stdDev: Math.sqrt(variance) || 1,
    count: finiteValues.length,
  };
}

export function zScore(value: number, stats: ZStats): number {
  return (value - stats.mean) / stats.stdDev;
}

export function aggregateAdvancedFeatures(
  fbsTeamIds: readonly string[],
  rows: readonly MappedAdvancedRow[]
): AdvancedTeamFeature[] {
  type Acc = {
    offPlays: number;
    offSuccesses: number;
    offExpWeighted: number;
    offExpWeight: number;
    defPlays: number;
    defSuccesses: number;
    defExpWeighted: number;
    defExpWeight: number;
  };
  const fbs = new Set(fbsTeamIds);
  const acc = new Map<string, Acc>();
  for (const id of fbsTeamIds) {
    acc.set(id, {
      offPlays: 0,
      offSuccesses: 0,
      offExpWeighted: 0,
      offExpWeight: 0,
      defPlays: 0,
      defSuccesses: 0,
      defExpWeighted: 0,
      defExpWeight: 0,
    });
  }

  for (const row of rows) {
    if (!fbs.has(row.teamId)) continue;
    const a = acc.get(row.teamId)!;
    const op = finite(row.offense.plays);
    const os = finite(row.offense.successRate);
    const oe = finite(row.offense.explosiveness);
    if (op !== null && op > 0 && os !== null && os >= 0 && os <= 1) {
      const successful = op * os;
      a.offPlays += op;
      a.offSuccesses += successful;
      if (oe !== null && successful > 0) {
        a.offExpWeighted += oe * successful;
        a.offExpWeight += successful;
      }
    }

    const dp = finite(row.defense.plays);
    const ds = finite(row.defense.successRate);
    const de = finite(row.defense.explosiveness);
    if (dp !== null && dp > 0 && ds !== null && ds >= 0 && ds <= 1) {
      const successful = dp * ds;
      a.defPlays += dp;
      a.defSuccesses += successful;
      if (de !== null && successful > 0) {
        a.defExpWeighted += de * successful;
        a.defExpWeight += successful;
      }
    }
  }

  return [...fbsTeamIds].sort().map((teamId) => {
    const a = acc.get(teamId)!;
    return {
      teamId,
      offSuccess: a.offPlays > 0 ? a.offSuccesses / a.offPlays : null,
      defSuccess: a.defPlays > 0 ? a.defSuccesses / a.defPlays : null,
      rawOffExplosiveness:
        a.offExpWeight > 0 ? a.offExpWeighted / a.offExpWeight : null,
      rawDefExplosiveness:
        a.defExpWeight > 0 ? a.defExpWeighted / a.defExpWeight : null,
      offensePlays: a.offPlays,
      defensePlays: a.defPlays,
      offenseSuccessfulPlayWeight: a.offExpWeight,
      defenseSuccessfulPlayWeight: a.defExpWeight,
    };
  });
}

function normalizedYardline(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

export function legacyScoringOpportunity(input: {
  startYardline: number | null;
  endYardline: number | null;
  yards: number | null;
}): boolean | null {
  const start = normalizedYardline(input.startYardline);
  const end = normalizedYardline(input.endYardline);
  const yards = finite(input.yards);
  let finalYardline: number | null = null;
  if (end !== null) finalYardline = end;
  else if (start !== null && yards !== null) {
    finalYardline = Math.min(100, start + yards);
  }
  return finalYardline === null ? null : finalYardline >= 60;
}

export function legacyAvailableYardsPct(input: {
  startYardline: number | null;
  yards: number | null;
}): number | null {
  const start = normalizedYardline(input.startYardline);
  const yards = finite(input.yards);
  if (start === null || yards === null) return null;
  const available = Math.max(0, 100 - start);
  if (available <= 0) return null;
  return clamp01(Math.max(0, yards) / available);
}

export function prospectiveDriveOffensePoints(row: MappedDriveRow): number | null {
  const points = finite(row.offensePointsFromPlays);
  if (points === null || points < 0) return null;
  return points;
}

export function aggregateDriveFeatures(
  fbsTeamIds: readonly string[],
  rows: readonly MappedDriveRow[]
): DriveTeamFeature[] {
  type Acc = {
    offOpps: number;
    offPoints: number;
    offMissingPoints: number;
    defOpps: number;
    defPoints: number;
    defMissingPoints: number;
    offAvailCount: number;
    offAvailSum: number;
    defAvailCount: number;
    defAvailSum: number;
  };
  const fbs = new Set(fbsTeamIds);
  const acc = new Map<string, Acc>();
  for (const id of fbsTeamIds) {
    acc.set(id, {
      offOpps: 0,
      offPoints: 0,
      offMissingPoints: 0,
      defOpps: 0,
      defPoints: 0,
      defMissingPoints: 0,
      offAvailCount: 0,
      offAvailSum: 0,
      defAvailCount: 0,
      defAvailSum: 0,
    });
  }

  for (const row of rows) {
    const scoring = legacyScoringOpportunity(row);
    const avail = legacyAvailableYardsPct(row);
    const points = prospectiveDriveOffensePoints(row);

    if (fbs.has(row.offenseTeamId)) {
      const a = acc.get(row.offenseTeamId)!;
      if (scoring === true) {
        a.offOpps += 1;
        if (points === null) a.offMissingPoints += 1;
        else a.offPoints += points;
      }
      if (avail !== null) {
        a.offAvailCount += 1;
        a.offAvailSum += avail;
      }
    }
    if (fbs.has(row.defenseTeamId)) {
      const a = acc.get(row.defenseTeamId)!;
      if (scoring === true) {
        a.defOpps += 1;
        if (points === null) a.defMissingPoints += 1;
        else a.defPoints += points;
      }
      if (avail !== null) {
        a.defAvailCount += 1;
        a.defAvailSum += avail;
      }
    }
  }

  return [...fbsTeamIds].sort().map((teamId) => {
    const a = acc.get(teamId)!;
    return {
      teamId,
      offFinishing:
        a.offOpps > 0 && a.offMissingPoints === 0
          ? a.offPoints / a.offOpps
          : null,
      defFinishing:
        a.defOpps > 0 && a.defMissingPoints === 0
          ? a.defPoints / a.defOpps
          : null,
      offAvailableYardsPct:
        a.offAvailCount > 0 ? a.offAvailSum / a.offAvailCount : null,
      defAvailableYardsPct:
        a.defAvailCount > 0 ? a.defAvailSum / a.defAvailCount : null,
      offScoringOpps: a.offOpps,
      defScoringOpps: a.defOpps,
      offScoringOppsMissingPoints: a.offMissingPoints,
      defScoringOppsMissingPoints: a.defMissingPoints,
      offAvailableDrives: a.offAvailCount,
      defAvailableDrives: a.defAvailCount,
    };
  });
}

export function combineProspectiveFeatures(input: {
  fbsTeamIds: readonly string[];
  advanced: readonly AdvancedTeamFeature[];
  drives: readonly DriveTeamFeature[];
}): {
  features: V4ProspectiveTeamFeature[];
  missingTeamIds: string[];
  explosivenessRawStats: { offense: ZStats; defense: ZStats };
} {
  const advancedByTeam = new Map(input.advanced.map((r) => [r.teamId, r]));
  const driveByTeam = new Map(input.drives.map((r) => [r.teamId, r]));
  const completeAdvanced = input.advanced.filter(
    (r) =>
      r.rawOffExplosiveness !== null &&
      r.rawDefExplosiveness !== null &&
      r.offSuccess !== null &&
      r.defSuccess !== null
  );
  const offExpStats = calculateZStats(
    completeAdvanced
      .map((r) => r.rawOffExplosiveness)
      .filter((v): v is number => v !== null)
  );
  const defExpStats = calculateZStats(
    completeAdvanced
      .map((r) => r.rawDefExplosiveness)
      .filter((v): v is number => v !== null)
  );

  const missingTeamIds: string[] = [];
  const features = [...input.fbsTeamIds].sort().map((teamId) => {
    const a = advancedByTeam.get(teamId);
    const d = driveByTeam.get(teamId);
    const offRaw = a?.rawOffExplosiveness ?? null;
    const defRaw = a?.rawDefExplosiveness ?? null;
    const feature: V4ProspectiveTeamFeature = {
      teamId,
      offSuccess: a?.offSuccess ?? null,
      defSuccess: a?.defSuccess ?? null,
      rawOffExplosiveness: offRaw,
      rawDefExplosiveness: defRaw,
      offensePlays: a?.offensePlays ?? 0,
      defensePlays: a?.defensePlays ?? 0,
      offenseSuccessfulPlayWeight: a?.offenseSuccessfulPlayWeight ?? 0,
      defenseSuccessfulPlayWeight: a?.defenseSuccessfulPlayWeight ?? 0,
      offFinishing: d?.offFinishing ?? null,
      defFinishing: d?.defFinishing ?? null,
      offAvailableYardsPct: d?.offAvailableYardsPct ?? null,
      defAvailableYardsPct: d?.defAvailableYardsPct ?? null,
      offScoringOpps: d?.offScoringOpps ?? 0,
      defScoringOpps: d?.defScoringOpps ?? 0,
      offScoringOppsMissingPoints: d?.offScoringOppsMissingPoints ?? 0,
      defScoringOppsMissingPoints: d?.defScoringOppsMissingPoints ?? 0,
      offAvailableDrives: d?.offAvailableDrives ?? 0,
      defAvailableDrives: d?.defAvailableDrives ?? 0,
      offExplosivenessGrade:
        offRaw !== null ? zScore(offRaw, offExpStats) : null,
      defExplosivenessGrade:
        defRaw !== null ? -zScore(defRaw, defExpStats) : null,
    };
    if (
      feature.offSuccess === null ||
      feature.defSuccess === null ||
      feature.offExplosivenessGrade === null ||
      feature.defExplosivenessGrade === null ||
      feature.offFinishing === null ||
      feature.defFinishing === null ||
      feature.offAvailableYardsPct === null ||
      feature.defAvailableYardsPct === null
    ) {
      missingTeamIds.push(teamId);
    }
    return feature;
  });

  return {
    features,
    missingTeamIds,
    explosivenessRawStats: { offense: offExpStats, defense: defExpStats },
  };
}

export function buildV4ProspectiveRatings(
  features: readonly V4ProspectiveTeamFeature[]
): {
  ratings: V4ProspectiveRating[];
  zStats: Record<string, ZStats>;
  meanNetV4: number;
  stdDevNetV4Diagnostic: number;
} {
  if (features.length !== V4_PROSPECTIVE_V1_EXPECTED_FBS) {
    throw new Error(
      `expected ${V4_PROSPECTIVE_V1_EXPECTED_FBS} complete FBS features, got ${features.length}`
    );
  }
  for (const f of features) {
    const required = [
      f.offSuccess,
      f.defSuccess,
      f.offExplosivenessGrade,
      f.defExplosivenessGrade,
      f.offFinishing,
      f.defFinishing,
      f.offAvailableYardsPct,
      f.defAvailableYardsPct,
    ];
    if (!required.every((v) => v !== null && Number.isFinite(v))) {
      throw new Error(`incomplete feature row for ${f.teamId}`);
    }
  }

  const stat = (selector: (f: V4ProspectiveTeamFeature) => number | null) =>
    calculateZStats(
      features
        .map(selector)
        .filter((v): v is number => v !== null && Number.isFinite(v))
    );

  const zStats = {
    offSuccess: stat((f) => f.offSuccess),
    defSuccess: stat((f) => f.defSuccess),
    offExplosiveness: stat((f) => f.offExplosivenessGrade),
    defExplosiveness: stat((f) => f.defExplosivenessGrade),
    offFinishing: stat((f) => f.offFinishing),
    defFinishing: stat((f) => f.defFinishing),
    offAvailableYardsPct: stat((f) => f.offAvailableYardsPct),
    defAvailableYardsPct: stat((f) => f.defAvailableYardsPct),
  };

  const interim = features.map((f) => {
    const zOffSuccess = zScore(f.offSuccess!, zStats.offSuccess);
    const zDefSuccess = -zScore(f.defSuccess!, zStats.defSuccess);
    const zOffExplosiveness = zScore(
      f.offExplosivenessGrade!,
      zStats.offExplosiveness
    );
    // Preserve historical V4 direction behavior, including the second inversion.
    const zDefExplosiveness = -zScore(
      f.defExplosivenessGrade!,
      zStats.defExplosiveness
    );
    const zOffFinishing = zScore(f.offFinishing!, zStats.offFinishing);
    const zDefFinishing = -zScore(f.defFinishing!, zStats.defFinishing);
    const zOffAvail = zScore(
      f.offAvailableYardsPct!,
      zStats.offAvailableYardsPct
    );
    const zDefAvail = -zScore(
      f.defAvailableYardsPct!,
      zStats.defAvailableYardsPct
    );

    const offenseV4 =
      V4_PROSPECTIVE_V1_WEIGHTS.success * zOffSuccess +
      V4_PROSPECTIVE_V1_WEIGHTS.explosiveness * zOffExplosiveness +
      V4_PROSPECTIVE_V1_WEIGHTS.finishing * zOffFinishing +
      V4_PROSPECTIVE_V1_WEIGHTS.availableYards * zOffAvail;

    const defenseV4 =
      V4_PROSPECTIVE_V1_WEIGHTS.success * zDefSuccess +
      V4_PROSPECTIVE_V1_WEIGHTS.explosiveness * zDefExplosiveness +
      V4_PROSPECTIVE_V1_WEIGHTS.finishing * zDefFinishing +
      V4_PROSPECTIVE_V1_WEIGHTS.availableYards * zDefAvail;

    return {
      teamId: f.teamId,
      offenseV4,
      defenseV4,
      netV4: offenseV4 - defenseV4,
    };
  });

  const meanNetV4 =
    interim.reduce((sum, r) => sum + r.netV4, 0) / interim.length;
  const variance =
    interim.reduce(
      (sum, r) => sum + Math.pow(r.netV4 - meanNetV4, 2),
      0
    ) / interim.length;
  const stdDevNetV4Diagnostic = Math.sqrt(variance) || 1;

  return {
    ratings: interim.map((r) => ({
      teamId: r.teamId,
      offenseRating: r.offenseV4 * 10,
      defenseRating: r.defenseV4 * 10,
      netV4: r.netV4,
      // Exact historical implementation: center then multiply by 10.
      rating: (r.netV4 - meanNetV4) * 10,
    })),
    zStats,
    meanNetV4,
    stdDevNetV4Diagnostic,
  };
}

export function v4ProspectiveHma(input: {
  homeRating: number;
  awayRating: number;
  neutralSite: boolean;
}): number {
  return (
    input.homeRating +
    (input.neutralSite ? 0 : V4_PROSPECTIVE_V1_HFA) -
    input.awayRating
  );
}

export function v4ProspectiveDecision(input: {
  v4Hma: number;
  marketHma: number;
}): {
  edgeHma: number;
  absEdge: number;
  side: 'HOME' | 'AWAY' | 'NO_SELECTION';
} {
  const edgeHma = input.v4Hma - input.marketHma;
  const absEdge = Math.abs(edgeHma);
  return {
    edgeHma,
    absEdge,
    side:
      absEdge < V4_PROSPECTIVE_V1_EDGE_THRESHOLD
        ? 'NO_SELECTION'
        : edgeHma > 0
          ? 'HOME'
          : 'AWAY',
  };
}
