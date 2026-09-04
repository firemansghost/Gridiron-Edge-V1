/**
 * Legacy TeamUnitGrades calculation parity (pure).
 *
 * Reproduces the existing numerical calculation in
 * apps/jobs/src/v2/compute_unit_grades.ts for COMPLETE, already-validated
 * team-metric rows. Inspection / identity only.
 *
 * This is "legacy TeamUnitGrades calculation parity".
 * It is not frozen methodology.
 * It is not newly authorized methodology.
 * It does not authorize TeamUnitGrades writes, Hybrid, Shadow, or compute.
 *
 * Complete-input contract: every required metric must be a finite number.
 * Literal 0 is valid. null / undefined / NaN / ±Infinity reject.
 * This module does not zero-fill missing evidence.
 *
 * Existing writer notes (not copied into this complete-input path):
 * - calculateZScoreStats uses `stdDev || 1`; for identical finite values the
 *   resulting z-scores are still 0, matching "if stdDev is 0, z-score = 0".
 * - Missing z-scores are coalesced to 0 before upsert. This module rejects
 *   instead of zero-filling.
 * - Defense PPA is overall ppaDefense for both rush and pass; runEpaDef /
 *   passEpaDef buckets exist in the writer but are never populated.
 * Canonical teamId order of a defensive copy drives all means/z-scores/grades.
 * Grade outputs are the direct IEEE results of the seven legacy formulas.
 */

export const LEGACY_TEAM_UNIT_GRADES_MATH_KIND =
  'legacy TeamUnitGrades calculation parity' as const;

export const LEGACY_TEAM_UNIT_GRADES_MATH_DISCLAIMER =
  'legacy TeamUnitGrades calculation parity. Not frozen methodology. Not newly authorized methodology.' as const;

export const LEGACY_GRADE_BLEND_WEIGHT = 0.5 as const;

export const LEGACY_TEAM_UNIT_GRADE_METRICS = [
  'lineYardsOff',
  'rushPpaOff',
  'stuffRate',
  'rushPpaDef',
  'passPpaOff',
  'passSrOff',
  'passPpaDef',
  'passSrDef',
  'isoPppOff',
  'isoPppDef',
  'havocOff',
  'havocDef',
] as const;

export type LegacyTeamUnitGradeMetric =
  (typeof LEGACY_TEAM_UNIT_GRADE_METRICS)[number];

export const LEGACY_TEAM_UNIT_GRADE_OUTPUTS = [
  'offRunGrade',
  'defRunGrade',
  'offPassGrade',
  'defPassGrade',
  'offExplosiveness',
  'defExplosiveness',
  'havocGrade',
] as const;

export type LegacyTeamUnitGradeOutput =
  (typeof LEGACY_TEAM_UNIT_GRADE_OUTPUTS)[number];

export type LegacyTeamUnitGradeCandidate = {
  teamId: unknown;
} & Partial<Record<LegacyTeamUnitGradeMetric, unknown>>;

export type LegacyTeamUnitGradeInput = {
  teamId: string;
} & Record<LegacyTeamUnitGradeMetric, number>;

export type LegacyTeamUnitGrades = {
  teamId: string;
} & Record<LegacyTeamUnitGradeOutput, number>;

export type LegacyMathErr = { ok: false; blockers: string[] };

export type LegacyPopulationZResult =
  | {
      ok: true;
      mean: number;
      variance: number;
      stdDev: number;
      zScores: number[];
    }
  | LegacyMathErr;

export interface LegacyZStatSummary {
  mean: number;
  variance: number;
  stdDev: number;
}

export type LegacyTeamUnitGradesComputeResult =
  | {
      ok: true;
      grades: LegacyTeamUnitGrades[];
      zStats: Record<LegacyTeamUnitGradeMetric, LegacyZStatSummary>;
    }
  | LegacyMathErr;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function compareTeamId(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function uniqueSorted(values: string[]): string[] {
  const seen: Record<string, true> = Object.create(null);
  const out: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (seen[v]) continue;
    seen[v] = true;
    out.push(v);
  }
  out.sort(compareTeamId);
  return out;
}

function teamIdOf(row: LegacyTeamUnitGradeCandidate): string {
  return typeof row.teamId === 'string' ? row.teamId : '';
}

/**
 * Population z-scores: mean, variance = sum((x-mean)^2)/N, stdDev = sqrt(var).
 * If stdDev is 0, every z-score is 0.
 * Rejects any non-finite value. Does not filter nulls (callers must pass finite).
 */
export function computeLegacyPopulationZScores(
  values: readonly unknown[]
): LegacyPopulationZResult {
  const blockers: string[] = [];
  const finite: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!isFiniteNumber(v)) {
      blockers.push('nonfinite_z_score_value');
    } else {
      finite.push(v);
    }
  }
  if (blockers.length > 0) {
    return { ok: false, blockers: uniqueSorted(blockers) };
  }
  if (finite.length === 0) {
    return { ok: false, blockers: ['empty_z_score_values'] };
  }
  const n = finite.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += finite[i];
  const mean = sum / n;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const d = finite[i] - mean;
    sumSq += d * d;
  }
  const variance = sumSq / n;
  const stdDev = Math.sqrt(variance);
  const zScores: number[] = [];
  for (let i = 0; i < n; i++) {
    zScores.push(stdDev === 0 ? 0 : (finite[i] - mean) / stdDev);
  }
  return { ok: true, mean, variance, stdDev, zScores };
}

function collectInputBlockers(
  rows: readonly LegacyTeamUnitGradeCandidate[]
): string[] {
  const blockers: string[] = [];
  const seen: Record<string, number> = Object.create(null);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const teamId = teamIdOf(row);
    if (teamId.trim() === '') {
      blockers.push('blank_team_id');
      continue;
    }
    seen[teamId] = (seen[teamId] || 0) + 1;
    for (let m = 0; m < LEGACY_TEAM_UNIT_GRADE_METRICS.length; m++) {
      const metric = LEGACY_TEAM_UNIT_GRADE_METRICS[m];
      if (!isFiniteNumber(row[metric])) {
        blockers.push(`nonfinite:${metric}`);
      }
    }
  }
  const teamIds = Object.keys(seen);
  for (let i = 0; i < teamIds.length; i++) {
    if (seen[teamIds[i]] > 1) blockers.push('duplicate_team_id');
  }
  return uniqueSorted(blockers);
}

function readCompleteRow(
  row: LegacyTeamUnitGradeCandidate
): LegacyTeamUnitGradeInput {
  const out = { teamId: teamIdOf(row) } as LegacyTeamUnitGradeInput;
  for (let m = 0; m < LEGACY_TEAM_UNIT_GRADE_METRICS.length; m++) {
    const metric = LEGACY_TEAM_UNIT_GRADE_METRICS[m];
    out[metric] = row[metric] as number;
  }
  return out;
}

function gradesFromZ(teamId: string, z: Record<LegacyTeamUnitGradeMetric, number>): LegacyTeamUnitGrades {
  const w = LEGACY_GRADE_BLEND_WEIGHT;
  return {
    teamId,
    offRunGrade: w * z.lineYardsOff + w * z.rushPpaOff,
    defRunGrade: w * z.stuffRate + w * -z.rushPpaDef,
    offPassGrade: w * z.passPpaOff + w * z.passSrOff,
    defPassGrade: w * -z.passPpaDef + w * -z.passSrDef,
    offExplosiveness: z.isoPppOff,
    defExplosiveness: -z.isoPppDef,
    havocGrade: w * z.havocDef - w * z.havocOff,
  };
}

/**
 * Batch calculation for complete team rows (any count, including 138).
 * The 138-FBS authorization boundary is owned by source/planner gates, not here.
 */
export function computeLegacyTeamUnitGrades(
  rows: readonly LegacyTeamUnitGradeCandidate[]
): LegacyTeamUnitGradesComputeResult {
  const blockers = collectInputBlockers(rows);
  if (blockers.length > 0) {
    return { ok: false, blockers };
  }
  if (rows.length === 0) {
    return {
      ok: true,
      grades: [],
      zStats: emptyZStats(),
    };
  }

  const complete: LegacyTeamUnitGradeInput[] = [];
  for (let i = 0; i < rows.length; i++) {
    complete.push(readCompleteRow(rows[i]));
  }
  const canonical = complete.slice();
  canonical.sort((a, b) => compareTeamId(a.teamId, b.teamId));

  const zStats = {} as Record<LegacyTeamUnitGradeMetric, LegacyZStatSummary>;
  const zByMetric = {} as Record<LegacyTeamUnitGradeMetric, number[]>;
  for (let m = 0; m < LEGACY_TEAM_UNIT_GRADE_METRICS.length; m++) {
    const metric = LEGACY_TEAM_UNIT_GRADE_METRICS[m];
    const values: number[] = [];
    for (let i = 0; i < canonical.length; i++) values.push(canonical[i][metric]);
    const computed = computeLegacyPopulationZScores(values);
    if (computed.ok === false) {
      return { ok: false, blockers: computed.blockers };
    }
    zStats[metric] = {
      mean: computed.mean,
      variance: computed.variance,
      stdDev: computed.stdDev,
    };
    zByMetric[metric] = computed.zScores;
  }

  const grades: LegacyTeamUnitGrades[] = [];
  for (let i = 0; i < canonical.length; i++) {
    const z = {} as Record<LegacyTeamUnitGradeMetric, number>;
    for (let m = 0; m < LEGACY_TEAM_UNIT_GRADE_METRICS.length; m++) {
      const metric = LEGACY_TEAM_UNIT_GRADE_METRICS[m];
      z[metric] = zByMetric[metric][i];
    }
    grades.push(gradesFromZ(canonical[i].teamId, z));
  }
  return { ok: true, grades, zStats };
}

export const computeLegacyTeamUnitGradesBatch = computeLegacyTeamUnitGrades;

function emptyZStats(): Record<
  LegacyTeamUnitGradeMetric,
  { mean: number; variance: number; stdDev: number }
> {
  const out = {} as Record<
    LegacyTeamUnitGradeMetric,
    { mean: number; variance: number; stdDev: number }
  >;
  for (let m = 0; m < LEGACY_TEAM_UNIT_GRADE_METRICS.length; m++) {
    out[LEGACY_TEAM_UNIT_GRADE_METRICS[m]] = { mean: 0, variance: 0, stdDev: 0 };
  }
  return out;
}

export interface LegacyEffTeamGameAggRow {
  teamIdInternal: unknown;
  lineYardsOff: unknown;
  runEpa: unknown;
  passEpa: unknown;
  passSr: unknown;
  defSr: unknown;
  isoPppOff: unknown;
  isoPppDef: unknown;
}

export interface LegacyPpaTeamGameAggRow {
  teamIdInternal: unknown;
  ppaOffense: unknown;
  ppaDefense: unknown;
}

export interface LegacyEffTeamSeasonAggRow {
  teamIdInternal: unknown;
  stuffRate: unknown;
  havocOff: unknown;
  havocDef: unknown;
}

export type LegacyAggregatedTeamStats = {
  teamId: string;
} & Record<LegacyTeamUnitGradeMetric, number | null>;

export type LegacyAggregateResult =
  | { ok: true; rows: LegacyAggregatedTeamStats[] }
  | LegacyMathErr;

interface EffBuckets {
  lineYardsOff: number[];
  isoPppOff: number[];
  isoPppDef: number[];
  passSrOff: number[];
  passSrDef: number[];
  runEpaOff: number[];
  passEpaOff: number[];
}

interface PpaBuckets {
  ppaOffense: number[];
  ppaDefense: number[];
}

function meanOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

function pushPresent(bucket: number[], value: unknown): void {
  if (value === null || value === undefined) return;
  bucket.push(Number(value));
}

function emptyAggStats(teamId: string): LegacyAggregatedTeamStats {
  return {
    teamId,
    lineYardsOff: null,
    rushPpaOff: null,
    stuffRate: null,
    rushPpaDef: null,
    passPpaOff: null,
    passSrOff: null,
    passPpaDef: null,
    passSrDef: null,
    isoPppOff: null,
    isoPppDef: null,
    havocOff: null,
    havocDef: null,
  };
}

/**
 * Inspection-only aggregation parity with existing fetchTeamStats:
 * - lineYardsOff / isoPpp / passSr / defSr / runEpa / passEpa: simple mean of
 *   present (non-null/undefined) team-game values
 * - runEpa -> rushPpaOff; passEpa -> passPpaOff
 * - passSr -> passSrOff; defSr -> passSrDef
 * - ppaDefense mean supplies BOTH rushPpaDef and passPpaDef
 * - ppaOffense mean is used only when rushPpaOff or passPpaOff is still null
 * - season stuffRate / havocOff / havocDef overwrite those fields
 *
 * Does not initialize missing metrics to 0. Does not write TeamUnitGrades.
 * Membership filtering matches existing: stats for unknown teamIds are skipped.
 */
export function aggregateLegacyTeamUnitGradeInputs(input: {
  teamIds: readonly string[];
  effTeamGames: readonly LegacyEffTeamGameAggRow[];
  ppaTeamGames: readonly LegacyPpaTeamGameAggRow[];
  effTeamSeasons: readonly LegacyEffTeamSeasonAggRow[];
}): LegacyAggregateResult {
  const blockers: string[] = [];
  const seen: Record<string, number> = Object.create(null);
  for (let i = 0; i < input.teamIds.length; i++) {
    const id = input.teamIds[i];
    if (typeof id !== 'string' || id.trim() === '') {
      blockers.push('blank_team_id');
      continue;
    }
    seen[id] = (seen[id] || 0) + 1;
  }
  const teamIds = Object.keys(seen);
  for (let i = 0; i < teamIds.length; i++) {
    if (seen[teamIds[i]] > 1) blockers.push('duplicate_team_id');
  }
  if (blockers.length > 0) {
    return { ok: false, blockers: uniqueSorted(blockers) };
  }

  const membership: Record<string, true> = Object.create(null);
  const orderedIds = input.teamIds.slice();
  const statsByTeam: Record<string, LegacyAggregatedTeamStats> = Object.create(null);
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    membership[id] = true;
    statsByTeam[id] = emptyAggStats(id);
  }

  const effAggregates: Record<string, EffBuckets> = Object.create(null);
  function effBucket(teamId: string): EffBuckets {
    if (!effAggregates[teamId]) {
      effAggregates[teamId] = {
        lineYardsOff: [],
        isoPppOff: [],
        isoPppDef: [],
        passSrOff: [],
        passSrDef: [],
        runEpaOff: [],
        passEpaOff: [],
      };
    }
    return effAggregates[teamId];
  }

  for (let i = 0; i < input.effTeamGames.length; i++) {
    const stat = input.effTeamGames[i];
    const teamId = typeof stat.teamIdInternal === 'string' ? stat.teamIdInternal : '';
    if (!membership[teamId]) continue;
    const agg = effBucket(teamId);
    pushPresent(agg.lineYardsOff, stat.lineYardsOff);
    pushPresent(agg.isoPppOff, stat.isoPppOff);
    pushPresent(agg.isoPppDef, stat.isoPppDef);
    pushPresent(agg.passSrOff, stat.passSr);
    pushPresent(agg.passSrDef, stat.defSr);
    pushPresent(agg.runEpaOff, stat.runEpa);
    pushPresent(agg.passEpaOff, stat.passEpa);
  }

  const ppaAggregates: Record<string, PpaBuckets> = Object.create(null);
  for (let i = 0; i < input.ppaTeamGames.length; i++) {
    const stat = input.ppaTeamGames[i];
    const teamId = typeof stat.teamIdInternal === 'string' ? stat.teamIdInternal : '';
    if (!membership[teamId]) continue;
    if (!ppaAggregates[teamId]) {
      ppaAggregates[teamId] = { ppaOffense: [], ppaDefense: [] };
    }
    const agg = ppaAggregates[teamId];
    pushPresent(agg.ppaOffense, stat.ppaOffense);
    pushPresent(agg.ppaDefense, stat.ppaDefense);
  }

  const effTeamIds = Object.keys(effAggregates);
  for (let i = 0; i < effTeamIds.length; i++) {
    const teamId = effTeamIds[i];
    const agg = effAggregates[teamId];
    const stats = statsByTeam[teamId];
    stats.lineYardsOff = meanOrNull(agg.lineYardsOff);
    stats.isoPppOff = meanOrNull(agg.isoPppOff);
    stats.isoPppDef = meanOrNull(agg.isoPppDef);
    stats.passSrOff = meanOrNull(agg.passSrOff);
    stats.passSrDef = meanOrNull(agg.passSrDef);
    stats.rushPpaOff = meanOrNull(agg.runEpaOff);
    stats.passPpaOff = meanOrNull(agg.passEpaOff);
  }

  const ppaTeamIds = Object.keys(ppaAggregates);
  for (let i = 0; i < ppaTeamIds.length; i++) {
    const teamId = ppaTeamIds[i];
    const agg = ppaAggregates[teamId];
    const stats = statsByTeam[teamId];
    const avgPpaOff = meanOrNull(agg.ppaOffense);
    const avgPpaDef = meanOrNull(agg.ppaDefense);
    if (stats.rushPpaOff === null) stats.rushPpaOff = avgPpaOff;
    if (stats.passPpaOff === null) stats.passPpaOff = avgPpaOff;
    stats.rushPpaDef = avgPpaDef;
    stats.passPpaDef = avgPpaDef;
  }

  for (let i = 0; i < input.effTeamSeasons.length; i++) {
    const stat = input.effTeamSeasons[i];
    const teamId = typeof stat.teamIdInternal === 'string' ? stat.teamIdInternal : '';
    if (!membership[teamId]) continue;
    const stats = statsByTeam[teamId];
    stats.stuffRate =
      stat.stuffRate !== null && stat.stuffRate !== undefined
        ? Number(stat.stuffRate)
        : null;
    stats.havocOff =
      stat.havocOff !== null && stat.havocOff !== undefined
        ? Number(stat.havocOff)
        : null;
    stats.havocDef =
      stat.havocDef !== null && stat.havocDef !== undefined
        ? Number(stat.havocDef)
        : null;
  }

  const rows: LegacyAggregatedTeamStats[] = [];
  for (let i = 0; i < orderedIds.length; i++) {
    rows.push(statsByTeam[orderedIds[i]]);
  }
  return { ok: true, rows };
}

/**
 * Convert aggregated nullable stats into the complete-input contract.
 * Missing or non-finite metrics fail closed (no zero-fill).
 */
export function completeLegacyTeamUnitGradeInputs(
  rows: readonly LegacyAggregatedTeamStats[]
): { ok: true; rows: LegacyTeamUnitGradeCandidate[] } | LegacyMathErr {
  const candidates: LegacyTeamUnitGradeCandidate[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const candidate: LegacyTeamUnitGradeCandidate = { teamId: row.teamId };
    for (let m = 0; m < LEGACY_TEAM_UNIT_GRADE_METRICS.length; m++) {
      const metric = LEGACY_TEAM_UNIT_GRADE_METRICS[m];
      candidate[metric] = row[metric];
    }
    candidates.push(candidate);
  }
  const blockers = collectInputBlockers(candidates);
  if (blockers.length > 0) return { ok: false, blockers };
  return { ok: true, rows: candidates };
}
