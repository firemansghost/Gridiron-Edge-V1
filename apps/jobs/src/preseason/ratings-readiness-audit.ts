/**
 * Phase 2C-2A — Read-only 2026 ratings-input readiness audit (pure logic).
 *
 * No Prisma import. No provider import. No mutation APIs.
 * ratingsWriteAuthorized is always false.
 */

export const AUDIT_SEASON = 2026 as const;
export const COMPARISON_SEASON = 2025 as const;
export const SAMPLE_MISSING_CAP = 20 as const;

export type FindingSeverity = 'info' | 'review' | 'structural';

export interface AuditFinding {
  code: string;
  severity: FindingSeverity;
  message: string;
}

export interface TeamRow {
  id: string;
  name: string;
  conference: string;
}

export interface MembershipRow {
  season: number;
  teamId: string;
  level: string;
}

export interface ScheduleGameRow {
  id: string;
  season: number;
  week: number;
  date: Date | string | null;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeTeamId: string;
  awayTeamId: string;
}

export interface TalentRow {
  season: number;
  teamId: string;
  talentComposite: number | null;
  blueChipsPct: number | null;
  sourceUpdatedAt: Date | string | null;
}

export interface CommitsRow {
  season: number;
  teamId: string;
  commitsTotal: number;
  classRank: number | null;
  avgCommitRating: number | null;
  sourceUpdatedAt: Date | string | null;
}

export interface SeasonStatRow {
  season: number;
  teamId: string;
  yppOff: number | null;
  successOff: number | null;
  epaOff: number | null;
  yppDef: number | null;
  successDef: number | null;
  epaDef: number | null;
  createdAt: Date | string | null;
}

export interface GameStatRow {
  season: number;
  teamId: string;
  week: number;
  yppOff: number | null;
  successOff: number | null;
  epaOff: number | null;
  yppDef: number | null;
  successDef: number | null;
  epaDef: number | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}

export interface SeasonRatingRow {
  season: number;
  teamId: string;
  modelVersion: string;
  games: number;
  rating: number | null;
  powerRating: number | null;
  confidence: number | null;
  dataSource: string | null;
}

export interface PowerRatingRow {
  id: string;
  teamId: string;
  season: number;
  week: number;
  rating: number;
  modelVersion: string;
  confidence: number;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}

export interface UnitGradeRow {
  teamId: string;
  season: number;
  offRunGrade: number;
  defRunGrade: number;
  offPassGrade: number;
  defPassGrade: number;
  offExplosiveness: number;
  defExplosiveness: number;
  havocGrade: number;
}

/** Narrow read-store — named SELECT methods only. */
export interface RatingsReadinessReadStore {
  loadTeams(): Promise<TeamRow[]>;
  loadMemberships(seasons: number[]): Promise<MembershipRow[]>;
  loadGames(season: number): Promise<ScheduleGameRow[]>;
  loadTalent(seasons: number[]): Promise<TalentRow[]>;
  loadCommits(seasons: number[]): Promise<CommitsRow[]>;
  loadSeasonStats(seasons: number[]): Promise<SeasonStatRow[]>;
  loadGameStats(seasons: number[]): Promise<GameStatRow[]>;
  loadSeasonRatings(seasons: number[]): Promise<SeasonRatingRow[]>;
  loadPowerRatings(season: number): Promise<PowerRatingRow[]>;
  loadUnitGrades(seasons: number[]): Promise<UnitGradeRow[]>;
}

export interface CoverageSeasonSummary {
  season: number;
  totalRows: number;
  distinctTeamIds: number;
  fbsCovered: number;
  fbsMissing: number;
  coveragePct: number | null;
  sampleMissingFbsIds: string[];
}

export interface TalentSeasonSummary extends CoverageSeasonSummary {
  nonNullTalentComposite: number;
  nonNullBlueChipsPct: number;
  talentCompositeMin: number | null;
  talentCompositeAvg: number | null;
  talentCompositeMax: number | null;
  earliestSourceUpdatedAt: string | null;
  latestSourceUpdatedAt: string | null;
}

export interface CommitsSeasonSummary extends CoverageSeasonSummary {
  nonNullClassRank: number;
  nonNullAvgRating: number;
  zeroTotalCommits: number;
  earliestSourceUpdatedAt: string | null;
  latestSourceUpdatedAt: string | null;
}

export interface StatsSeasonSummary extends CoverageSeasonSummary {
  meaningfulOffense: number;
  meaningfulDefense: number;
  withEpa: number;
  withSuccessRate: number;
  withYpp: number;
  earliestTimestamp: string | null;
  latestTimestamp: string | null;
}

export interface ModelVersionRatingSummary {
  modelVersion: string;
  rowCount: number;
  distinctTeams: number;
  nonNullRating: number;
  nonNullPowerRating: number;
  nonNullConfidence: number;
  confidenceMin: number | null;
  confidenceAvg: number | null;
  confidenceMax: number | null;
  powerRatingMin: number | null;
  powerRatingAvg: number | null;
  powerRatingMax: number | null;
  dataSourceBreakdown: Record<string, number>;
  gamesCountSummary: { min: number; avg: number; max: number } | null;
  fbsMissingCount: number;
  sampleMissingFbsIds: string[];
  nonFbsRowCount: number;
  sampleTeamIds: string[];
}

export interface RatingsReadinessAuditInput {
  season: number;
  comparisonSeason: number;
  asOf: Date;
  teams: TeamRow[];
  memberships: MembershipRow[];
  games: ScheduleGameRow[];
  talent: TalentRow[];
  commits: CommitsRow[];
  seasonStats: SeasonStatRow[];
  gameStats: GameStatRow[];
  seasonRatings: SeasonRatingRow[];
  powerRatings: PowerRatingRow[];
  unitGrades: UnitGradeRow[];
  /** Static workflow/code risk bullets from repository inspection. */
  workflowRiskFindings: AuditFinding[];
}

export interface RatingsReadinessAuditResult {
  structuralOk: boolean;
  preseason: boolean;
  dataCoverageFindings: AuditFinding[];
  existingOutputFindings: AuditFinding[];
  workflowRiskFindings: AuditFinding[];
  structuralIssues: AuditFinding[];
  operatorReviewRequired: boolean;
  ratingsWriteAuthorized: false;
  writeCollisionRisk: boolean;
  asOfIso: string;
  season: number;
  comparisonSeason: number;
  scheduleContext: {
    totalGames: number;
    distinctWeeks: number[];
    earliestKickoff: string | null;
    latestKickoff: string | null;
    finalGameCount: number;
    scoredRowCount: number;
  };
  fbsPopulation: {
    totalTeamRows: number;
    fbsMembershipCount: number;
    distinctFbsTeamIds: number;
    duplicateMembershipKeys: string[];
    scheduleTeamCount: number;
    scheduleTeamsMissingFromTeam: string[];
    scheduleTeamsMissingFromFbs: string[];
    fbsTeamsAbsentFromSchedule: string[];
    conferenceBreakdown: Record<string, number>;
    membershipMissingConference: number;
  };
  talentBySeason: TalentSeasonSummary[];
  commitsBySeason: CommitsSeasonSummary[];
  seasonStatsBySeason: StatsSeasonSummary[];
  gameStatsBySeason: StatsSeasonSummary[];
  seasonRatingsTarget: {
    totalRows: number;
    byModelVersion: ModelVersionRatingSummary[];
  };
  seasonRatingsComparison: {
    totalRows: number;
    byModelVersion: ModelVersionRatingSummary[];
  };
  powerRatings: {
    totalRows: number;
    byModelVersion: Record<string, number>;
    byWeek: Record<string, number>;
    distinctTeams: number;
    earliestCreatedAt: string | null;
    latestUpdatedAt: string | null;
    weeksNotInSchedule: number[];
    nonFiniteCount: number;
    duplicateLogicalKeys: string[];
  };
  unitGradesBySeason: CoverageSeasonSummary[];
  unitGradeInvalidCount: number;
}

export type ParseRatingsReadinessArgsResult =
  | { ok: true; season: number }
  | { ok: false; errors: string[] };

const WRITE_FLAGS = new Set([
  '--write',
  '--execute',
  '--upsert',
  '--persist',
  '--confirm-write',
  '--force',
  '--force-write',
  '--allow-write',
]);

export function parseRatingsReadinessArgs(
  argv: string[]
): ParseRatingsReadinessArgsResult {
  const errors: string[] = [];
  let season: number | undefined;
  let seasonSeen = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (WRITE_FLAGS.has(arg)) {
      errors.push(
        `${arg} is not allowed — ratings readiness audit is read-only`
      );
      continue;
    }
    if (arg === '--season') {
      if (seasonSeen) {
        errors.push('--season may be provided exactly once');
        i += 1;
        continue;
      }
      seasonSeen = true;
      const raw = argv[++i];
      if (raw === undefined || raw === '') {
        errors.push('--season requires an integer value');
        continue;
      }
      if (/[,-]/.test(raw)) {
        errors.push(`--season rejects lists/ranges: ${raw}`);
        continue;
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || Number.isNaN(n)) {
        errors.push(`--season must be an integer (got ${raw})`);
        continue;
      }
      season = n;
      continue;
    }
    if (arg.startsWith('-')) {
      errors.push(`Unknown flag: ${arg}`);
      continue;
    }
    errors.push(`Unexpected positional argument: ${arg}`);
  }

  if (season === undefined) {
    errors.push('--season is required (must be 2026)');
  } else if (season !== AUDIT_SEASON) {
    errors.push(`--season must be ${AUDIT_SEASON} (got ${season})`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, season: AUDIT_SEASON };
}

/** Static findings from repository inspection (Phase 2C-2A). Not mutated. */
export const DEFAULT_WORKFLOW_RISK_FINDINGS: AuditFinding[] = [
  {
    code: 'ratings_v1_default_2025',
    severity: 'review',
    message:
      'ratings-v1.yml defaults season to 2025; accepts arbitrary season string; writes via compute_ratings_v1 upsert',
  },
  {
    code: 'ratings_v2_default_2025',
    severity: 'review',
    message:
      'ratings-v2.yml defaults season to 2025; accepts arbitrary season; writes via compute_ratings_v2 upsert',
  },
  {
    code: 'ratings_workflows_outdated_runtime',
    severity: 'review',
    message:
      'ratings-v1.yml and ratings-v2.yml use actions/checkout@v4, setup-node@v4, and Node 18 (preseason audits use @v6 / Node 20)',
  },
  {
    code: 'ratings_verify_count_only',
    severity: 'review',
    message:
      'Ratings workflows verify primarily by FBS membership vs rating row count (>=98%); weak base-feature / talent-only quality is not blocked',
  },
  {
    code: 'ratings_talent_only_fallback',
    severity: 'review',
    message:
      'compute_ratings_v1.ts early-season path can produce talent-only ratings when base features are missing',
  },
  {
    code: 'talent_stats_workflows_default_2025',
    severity: 'review',
    message:
      'talent-cfbd.yml and stats-cfbd.yml default season to 2025; use checkout@v4 / Node 18; call CFBD providers and write tables',
  },
  {
    code: 'ratings_workflows_unsafe_for_direct_2026',
    severity: 'review',
    message:
      'Existing ratings/talent/stats workflows are NOT safe for direct 2026 execution without separate approval — they upsert, call providers, and lack this audit gate',
  },
  {
    code: 'no_provider_in_this_audit',
    severity: 'info',
    message:
      'This readiness audit does not call CFBD, Odds API, or any provider; DIRECT_URL is application-level read only (not a DB read-only role)',
  },
];

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function isFiniteNumber(n: number | null | undefined): boolean {
  return n != null && Number.isFinite(n);
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function minMax(nums: number[]): {
  min: number | null;
  max: number | null;
  avg: number | null;
} {
  if (nums.length === 0) return { min: null, max: null, avg: null };
  return {
    min: Math.min(...nums),
    max: Math.max(...nums),
    avg: avg(nums),
  };
}

function coveragePct(covered: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((covered / total) * 1000) / 10;
}

function sampleMissing(
  fbsIds: string[],
  present: Set<string>,
  cap = SAMPLE_MISSING_CAP
): string[] {
  return fbsIds.filter((id) => !present.has(id)).slice(0, cap);
}

function timestampRange(
  values: Array<Date | string | null | undefined>
): { earliest: string | null; latest: string | null } {
  let earliest: Date | null = null;
  let latest: Date | null = null;
  for (const v of values) {
    const d = toDate(v);
    if (!d) continue;
    if (!earliest || d < earliest) earliest = d;
    if (!latest || d > latest) latest = d;
  }
  return { earliest: isoOrNull(earliest), latest: isoOrNull(latest) };
}

function baseCoverage(
  season: number,
  fbsIds: string[],
  rowTeamIds: string[]
): CoverageSeasonSummary {
  const present = new Set(rowTeamIds);
  const fbsCovered = fbsIds.filter((id) => present.has(id)).length;
  const fbsMissing = fbsIds.length - fbsCovered;
  return {
    season,
    totalRows: rowTeamIds.length,
    distinctTeamIds: present.size,
    fbsCovered,
    fbsMissing,
    coveragePct: coveragePct(fbsCovered, fbsIds.length),
    sampleMissingFbsIds: sampleMissing(fbsIds, present),
  };
}

function summarizeTalent(
  season: number,
  fbsIds: string[],
  rows: TalentRow[]
): TalentSeasonSummary {
  const seasonRows = rows.filter((r) => r.season === season);
  const base = baseCoverage(
    season,
    fbsIds,
    seasonRows.map((r) => r.teamId)
  );
  const composites = seasonRows
    .map((r) => r.talentComposite)
    .filter(isFiniteNumber) as number[];
  const range = timestampRange(seasonRows.map((r) => r.sourceUpdatedAt));
  const mm = minMax(composites);
  return {
    ...base,
    totalRows: seasonRows.length,
    nonNullTalentComposite: composites.length,
    nonNullBlueChipsPct: seasonRows.filter((r) =>
      isFiniteNumber(r.blueChipsPct)
    ).length,
    talentCompositeMin: mm.min,
    talentCompositeAvg: mm.avg,
    talentCompositeMax: mm.max,
    earliestSourceUpdatedAt: range.earliest,
    latestSourceUpdatedAt: range.latest,
  };
}

function summarizeCommits(
  season: number,
  fbsIds: string[],
  rows: CommitsRow[]
): CommitsSeasonSummary {
  const seasonRows = rows.filter((r) => r.season === season);
  const base = baseCoverage(
    season,
    fbsIds,
    seasonRows.map((r) => r.teamId)
  );
  const range = timestampRange(seasonRows.map((r) => r.sourceUpdatedAt));
  return {
    ...base,
    totalRows: seasonRows.length,
    nonNullClassRank: seasonRows.filter((r) => r.classRank != null).length,
    nonNullAvgRating: seasonRows.filter((r) =>
      isFiniteNumber(r.avgCommitRating)
    ).length,
    zeroTotalCommits: seasonRows.filter((r) => r.commitsTotal === 0).length,
    earliestSourceUpdatedAt: range.earliest,
    latestSourceUpdatedAt: range.latest,
  };
}

function summarizeSeasonStats(
  season: number,
  fbsIds: string[],
  rows: SeasonStatRow[]
): StatsSeasonSummary {
  const seasonRows = rows.filter((r) => r.season === season);
  const base = baseCoverage(
    season,
    fbsIds,
    seasonRows.map((r) => r.teamId)
  );
  const range = timestampRange(seasonRows.map((r) => r.createdAt));
  return {
    ...base,
    totalRows: seasonRows.length,
    meaningfulOffense: seasonRows.filter(
      (r) =>
        isFiniteNumber(r.yppOff) ||
        isFiniteNumber(r.successOff) ||
        isFiniteNumber(r.epaOff)
    ).length,
    meaningfulDefense: seasonRows.filter(
      (r) =>
        isFiniteNumber(r.yppDef) ||
        isFiniteNumber(r.successDef) ||
        isFiniteNumber(r.epaDef)
    ).length,
    withEpa: seasonRows.filter(
      (r) => isFiniteNumber(r.epaOff) || isFiniteNumber(r.epaDef)
    ).length,
    withSuccessRate: seasonRows.filter(
      (r) => isFiniteNumber(r.successOff) || isFiniteNumber(r.successDef)
    ).length,
    withYpp: seasonRows.filter(
      (r) => isFiniteNumber(r.yppOff) || isFiniteNumber(r.yppDef)
    ).length,
    earliestTimestamp: range.earliest,
    latestTimestamp: range.latest,
  };
}

function summarizeGameStats(
  season: number,
  fbsIds: string[],
  rows: GameStatRow[]
): StatsSeasonSummary {
  const seasonRows = rows.filter((r) => r.season === season);
  const teamIds = [...new Set(seasonRows.map((r) => r.teamId))];
  const base = baseCoverage(season, fbsIds, teamIds);
  const range = timestampRange(
    seasonRows.flatMap((r) => [r.createdAt, r.updatedAt])
  );
  return {
    ...base,
    totalRows: seasonRows.length,
    meaningfulOffense: seasonRows.filter(
      (r) =>
        isFiniteNumber(r.yppOff) ||
        isFiniteNumber(r.successOff) ||
        isFiniteNumber(r.epaOff)
    ).length,
    meaningfulDefense: seasonRows.filter(
      (r) =>
        isFiniteNumber(r.yppDef) ||
        isFiniteNumber(r.successDef) ||
        isFiniteNumber(r.epaDef)
    ).length,
    withEpa: seasonRows.filter(
      (r) => isFiniteNumber(r.epaOff) || isFiniteNumber(r.epaDef)
    ).length,
    withSuccessRate: seasonRows.filter(
      (r) => isFiniteNumber(r.successOff) || isFiniteNumber(r.successDef)
    ).length,
    withYpp: seasonRows.filter(
      (r) => isFiniteNumber(r.yppOff) || isFiniteNumber(r.yppDef)
    ).length,
    earliestTimestamp: range.earliest,
    latestTimestamp: range.latest,
  };
}

function summarizeRatingsByModel(
  rows: SeasonRatingRow[],
  fbsIds: string[],
  fbsSet: Set<string>
): ModelVersionRatingSummary[] {
  const byModel = new Map<string, SeasonRatingRow[]>();
  for (const r of rows) {
    const list = byModel.get(r.modelVersion) ?? [];
    list.push(r);
    byModel.set(r.modelVersion, list);
  }
  const versions = [...byModel.keys()].sort();
  return versions.map((modelVersion) => {
    const modelRows = byModel.get(modelVersion) ?? [];
    const teamIds = [...new Set(modelRows.map((r) => r.teamId))];
    const present = new Set(teamIds);
    const ratings = modelRows
      .map((r) => r.rating)
      .filter(isFiniteNumber) as number[];
    const powers = modelRows
      .map((r) => r.powerRating)
      .filter(isFiniteNumber) as number[];
    const confs = modelRows
      .map((r) => r.confidence)
      .filter(isFiniteNumber) as number[];
    const games = modelRows.map((r) => r.games);
    const dataSourceBreakdown: Record<string, number> = {};
    for (const r of modelRows) {
      const key = r.dataSource ?? '(null)';
      dataSourceBreakdown[key] = (dataSourceBreakdown[key] ?? 0) + 1;
    }
    const confMm = minMax(confs);
    const powerMm = minMax(powers);
    return {
      modelVersion,
      rowCount: modelRows.length,
      distinctTeams: teamIds.length,
      nonNullRating: ratings.length,
      nonNullPowerRating: powers.length,
      nonNullConfidence: confs.length,
      confidenceMin: confMm.min,
      confidenceAvg: confMm.avg,
      confidenceMax: confMm.max,
      powerRatingMin: powerMm.min,
      powerRatingAvg: powerMm.avg,
      powerRatingMax: powerMm.max,
      dataSourceBreakdown,
      gamesCountSummary:
        games.length > 0
          ? {
              min: Math.min(...games),
              avg: avg(games) ?? 0,
              max: Math.max(...games),
            }
          : null,
      fbsMissingCount: fbsIds.filter((id) => !present.has(id)).length,
      sampleMissingFbsIds: sampleMissing(fbsIds, present),
      nonFbsRowCount: modelRows.filter((r) => !fbsSet.has(r.teamId)).length,
      sampleTeamIds: teamIds.slice(0, 10),
    };
  });
}

/**
 * Pure ratings-input readiness audit.
 */
export function auditRatingsReadiness(
  input: RatingsReadinessAuditInput
): RatingsReadinessAuditResult {
  const {
    season,
    comparisonSeason,
    asOf,
    teams,
    memberships,
    games,
    talent,
    commits,
    seasonStats,
    gameStats,
    seasonRatings,
    powerRatings,
    unitGrades,
    workflowRiskFindings,
  } = input;

  const structuralIssues: AuditFinding[] = [];
  const dataCoverageFindings: AuditFinding[] = [];
  const existingOutputFindings: AuditFinding[] = [];

  const teamIdSet = new Set(teams.map((t) => t.id));
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const membershipKeys = new Map<string, number>();
  for (const m of memberships) {
    const key = `${m.season}|${m.teamId}`;
    membershipKeys.set(key, (membershipKeys.get(key) ?? 0) + 1);
  }
  const duplicateMembershipKeys = [...membershipKeys.entries()]
    .filter(([, c]) => c > 1)
    .map(([k]) => k);
  if (duplicateMembershipKeys.length > 0) {
    structuralIssues.push({
      code: 'duplicate_membership',
      severity: 'structural',
      message: `Duplicate membership keys in loaded data: ${duplicateMembershipKeys.slice(0, 10).join(', ')}`,
    });
  }

  const fbsMembership = memberships.filter(
    (m) => m.season === season && m.level.toLowerCase() === 'fbs'
  );
  const fbsIds = [...new Set(fbsMembership.map((m) => m.teamId))].sort();
  const fbsSet = new Set(fbsIds);
  const comparisonFbsIds = [
    ...new Set(
      memberships
        .filter(
          (m) =>
            m.season === comparisonSeason && m.level.toLowerCase() === 'fbs'
        )
        .map((m) => m.teamId)
    ),
  ].sort();

  if (fbsMembership.length === 0) {
    structuralIssues.push({
      code: 'no_fbs_membership',
      severity: 'structural',
      message: `No ${season} FBS TeamMembership rows`,
    });
  }

  const scheduleTeamIds = new Set<string>();
  for (const g of games) {
    scheduleTeamIds.add(g.homeTeamId);
    scheduleTeamIds.add(g.awayTeamId);
  }
  const scheduleTeams = [...scheduleTeamIds].sort();
  const scheduleTeamsMissingFromTeam = scheduleTeams.filter(
    (id) => !teamIdSet.has(id)
  );
  const scheduleTeamsMissingFromFbs = scheduleTeams.filter(
    (id) => !fbsSet.has(id)
  );
  const fbsTeamsAbsentFromSchedule = fbsIds.filter(
    (id) => !scheduleTeamIds.has(id)
  );

  if (scheduleTeamsMissingFromTeam.length > 0) {
    structuralIssues.push({
      code: 'schedule_team_missing_from_team',
      severity: 'structural',
      message: `Schedule teams missing from Team: ${scheduleTeamsMissingFromTeam.slice(0, SAMPLE_MISSING_CAP).join(', ')}`,
    });
  }
  if (scheduleTeamsMissingFromFbs.length > 0) {
    structuralIssues.push({
      code: 'schedule_team_missing_from_fbs',
      severity: 'structural',
      message: `Schedule teams missing from ${season} FBS membership: ${scheduleTeamsMissingFromFbs.slice(0, SAMPLE_MISSING_CAP).join(', ')}`,
    });
  }
  if (fbsTeamsAbsentFromSchedule.length > 0) {
    dataCoverageFindings.push({
      code: 'fbs_absent_from_schedule',
      severity: 'review',
      message: `${fbsTeamsAbsentFromSchedule.length} FBS teams absent from schedule (sample: ${fbsTeamsAbsentFromSchedule.slice(0, SAMPLE_MISSING_CAP).join(', ')})`,
    });
  }

  const conferenceBreakdown: Record<string, number> = {};
  let membershipMissingConference = 0;
  for (const id of fbsIds) {
    const conf = teamById.get(id)?.conference?.trim() ?? '';
    if (!conf || conf.toLowerCase() === 'unknown') {
      membershipMissingConference += 1;
      const key = conf || '(blank)';
      conferenceBreakdown[key] = (conferenceBreakdown[key] ?? 0) + 1;
    } else {
      conferenceBreakdown[conf] = (conferenceBreakdown[conf] ?? 0) + 1;
    }
  }

  // Schedule / preseason context
  let earliestKickoff: Date | null = null;
  let latestKickoff: Date | null = null;
  let finalGameCount = 0;
  let scoredRowCount = 0;
  const weeks = new Set<number>();
  for (const g of games) {
    weeks.add(g.week);
    const d = toDate(g.date);
    if (d) {
      if (!earliestKickoff || d < earliestKickoff) earliestKickoff = d;
      if (!latestKickoff || d > latestKickoff) latestKickoff = d;
    }
    if (g.status === 'final') finalGameCount += 1;
    if (g.homeScore != null || g.awayScore != null) scoredRowCount += 1;
  }
  const distinctWeeks = [...weeks].sort((a, b) => a - b);
  const preseason =
    earliestKickoff != null ? asOf.getTime() < earliestKickoff.getTime() : true;

  if (preseason && finalGameCount > 0) {
    structuralIssues.push({
      code: 'final_before_kickoff',
      severity: 'structural',
      message: `${finalGameCount} final game(s) present before earliest kickoff`,
    });
  }
  if (preseason && scoredRowCount > 0) {
    structuralIssues.push({
      code: 'scores_before_kickoff',
      severity: 'structural',
      message: `${scoredRowCount} scored row(s) present before earliest kickoff`,
    });
  }

  const talentBySeason = [
    summarizeTalent(season, fbsIds, talent),
    summarizeTalent(comparisonSeason, comparisonFbsIds, talent),
  ];
  const commitsBySeason = [
    summarizeCommits(season, fbsIds, commits),
    summarizeCommits(comparisonSeason, comparisonFbsIds, commits),
  ];
  const seasonStatsBySeason = [
    summarizeSeasonStats(season, fbsIds, seasonStats),
    summarizeSeasonStats(comparisonSeason, comparisonFbsIds, seasonStats),
  ];
  const gameStatsBySeason = [
    summarizeGameStats(season, fbsIds, gameStats),
    summarizeGameStats(comparisonSeason, comparisonFbsIds, gameStats),
  ];

  for (const t of talentBySeason) {
    if (t.fbsMissing > 0) {
      dataCoverageFindings.push({
        code: `talent_incomplete_${t.season}`,
        severity: 'review',
        message: `Season ${t.season} talent FBS coverage ${t.coveragePct ?? 0}% (${t.fbsCovered}/${t.fbsCovered + t.fbsMissing}); missing ${t.fbsMissing}`,
      });
    }
  }
  for (const c of commitsBySeason) {
    if (c.fbsMissing > 0) {
      dataCoverageFindings.push({
        code: `commits_incomplete_${c.season}`,
        severity: 'review',
        message: `Season ${c.season} commits FBS coverage ${c.coveragePct ?? 0}% ; missing ${c.fbsMissing}`,
      });
    }
  }

  const targetSeasonStats = seasonStatsBySeason.find((s) => s.season === season);
  const targetGameStats = gameStatsBySeason.find((s) => s.season === season);
  if (preseason) {
    dataCoverageFindings.push({
      code: 'preseason_empty_stats_expected',
      severity: 'info',
      message: `preseason=true; empty ${season} season/game stats are allowed (seasonStatRows=${targetSeasonStats?.totalRows ?? 0}, gameStatRows=${targetGameStats?.totalRows ?? 0})`,
    });
  } else {
    if ((targetSeasonStats?.totalRows ?? 0) === 0) {
      dataCoverageFindings.push({
        code: 'season_stats_empty_in_season',
        severity: 'review',
        message: `${season} TeamSeasonStat rows are empty after earliest kickoff`,
      });
    }
    if ((targetGameStats?.totalRows ?? 0) === 0) {
      dataCoverageFindings.push({
        code: 'game_stats_empty_in_season',
        severity: 'review',
        message: `${season} TeamGameStat rows are empty after earliest kickoff`,
      });
    }
  }

  const targetRatings = seasonRatings.filter((r) => r.season === season);
  const comparisonRatings = seasonRatings.filter(
    (r) => r.season === comparisonSeason
  );
  const seasonRatingsTarget = {
    totalRows: targetRatings.length,
    byModelVersion: summarizeRatingsByModel(targetRatings, fbsIds, fbsSet),
  };
  const seasonRatingsComparison = {
    totalRows: comparisonRatings.length,
    byModelVersion: summarizeRatingsByModel(
      comparisonRatings,
      comparisonFbsIds,
      new Set(comparisonFbsIds)
    ),
  };

  const writeCollisionRisk = targetRatings.length > 0;
  if (writeCollisionRisk) {
    existingOutputFindings.push({
      code: 'write_collision_risk',
      severity: 'review',
      message: `${targetRatings.length} existing ${season} TeamSeasonRating row(s) — writeCollisionRisk=true; do not overwrite without operator review`,
    });
  } else {
    existingOutputFindings.push({
      code: 'no_existing_season_ratings',
      severity: 'info',
      message: `No ${season} TeamSeasonRating rows present`,
    });
  }

  for (const r of targetRatings) {
    if (r.rating != null && !Number.isFinite(Number(r.rating))) {
      structuralIssues.push({
        code: 'non_finite_season_rating',
        severity: 'structural',
        message: `Non-finite rating for ${r.teamId} model=${r.modelVersion}`,
      });
    }
    if (r.powerRating != null && !Number.isFinite(Number(r.powerRating))) {
      structuralIssues.push({
        code: 'non_finite_power_rating_field',
        severity: 'structural',
        message: `Non-finite powerRating for ${r.teamId} model=${r.modelVersion}`,
      });
    }
    if (r.confidence != null && !Number.isFinite(Number(r.confidence))) {
      structuralIssues.push({
        code: 'non_finite_confidence',
        severity: 'structural',
        message: `Non-finite confidence for ${r.teamId} model=${r.modelVersion}`,
      });
    }
  }

  const byModelVersion: Record<string, number> = {};
  const byWeek: Record<string, number> = {};
  const powerTeamIds = new Set<string>();
  const logicalKeys = new Map<string, number>();
  let nonFiniteCount = 0;
  const scheduleWeekSet = new Set(distinctWeeks);
  const weeksNotInScheduleSet = new Set<number>();
  for (const p of powerRatings) {
    byModelVersion[p.modelVersion] =
      (byModelVersion[p.modelVersion] ?? 0) + 1;
    byWeek[String(p.week)] = (byWeek[String(p.week)] ?? 0) + 1;
    powerTeamIds.add(p.teamId);
    const key = `${p.teamId}|${p.season}|${p.week}|${p.modelVersion}`;
    logicalKeys.set(key, (logicalKeys.get(key) ?? 0) + 1);
    if (!Number.isFinite(p.rating) || !Number.isFinite(p.confidence)) {
      nonFiniteCount += 1;
    }
    if (!scheduleWeekSet.has(p.week)) {
      weeksNotInScheduleSet.add(p.week);
    }
  }
  const duplicateLogicalKeys = [...logicalKeys.entries()]
    .filter(([, c]) => c > 1)
    .map(([k]) => k);
  if (nonFiniteCount > 0) {
    structuralIssues.push({
      code: 'non_finite_weekly_power',
      severity: 'structural',
      message: `${nonFiniteCount} PowerRating row(s) have non-finite rating/confidence`,
    });
  }
  if (duplicateLogicalKeys.length > 0) {
    structuralIssues.push({
      code: 'duplicate_power_logical_key',
      severity: 'structural',
      message: `Duplicate PowerRating logical keys: ${duplicateLogicalKeys.slice(0, 10).join(', ')}`,
    });
  }
  if (powerRatings.length > 0) {
    existingOutputFindings.push({
      code: 'existing_power_ratings',
      severity: 'review',
      message: `${powerRatings.length} ${season} PowerRating row(s) present — inventory only; no mutation`,
    });
  }
  const powerTs = timestampRange(
    powerRatings.flatMap((p) => [p.createdAt, p.updatedAt])
  );

  const unitGradesBySeason = [season, comparisonSeason].map((s) => {
    const ids = s === season ? fbsIds : comparisonFbsIds;
    const rows = unitGrades.filter((u) => u.season === s);
    return {
      ...baseCoverage(
        s,
        ids,
        rows.map((r) => r.teamId)
      ),
      totalRows: rows.length,
    };
  });
  let unitGradeInvalidCount = 0;
  for (const u of unitGrades.filter((r) => r.season === season)) {
    const vals = [
      u.offRunGrade,
      u.defRunGrade,
      u.offPassGrade,
      u.defPassGrade,
      u.offExplosiveness,
      u.defExplosiveness,
      u.havocGrade,
    ];
    if (vals.some((v) => !Number.isFinite(v))) {
      unitGradeInvalidCount += 1;
    }
  }
  if (unitGradeInvalidCount > 0) {
    structuralIssues.push({
      code: 'non_finite_unit_grades',
      severity: 'structural',
      message: `${unitGradeInvalidCount} TeamUnitGrades row(s) have non-finite required grades`,
    });
  }
  for (const u of unitGradesBySeason) {
    if (u.fbsMissing > 0) {
      dataCoverageFindings.push({
        code: `unit_grades_incomplete_${u.season}`,
        severity: 'review',
        message: `Season ${u.season} unit-grade FBS coverage ${u.coveragePct ?? 0}%; missing ${u.fbsMissing}`,
      });
    }
  }

  const structuralOk = structuralIssues.length === 0;
  const operatorReviewRequired =
    !structuralOk ||
    dataCoverageFindings.some((f) => f.severity === 'review') ||
    existingOutputFindings.some((f) => f.severity === 'review') ||
    writeCollisionRisk ||
    workflowRiskFindings.some((f) => f.severity === 'review');

  if (dataCoverageFindings.some((f) => f.severity === 'review')) {
    // already tracked via operatorReviewRequired
  }

  return {
    structuralOk,
    preseason,
    dataCoverageFindings,
    existingOutputFindings,
    workflowRiskFindings: [...workflowRiskFindings],
    structuralIssues,
    operatorReviewRequired,
    ratingsWriteAuthorized: false,
    writeCollisionRisk,
    asOfIso: asOf.toISOString(),
    season,
    comparisonSeason,
    scheduleContext: {
      totalGames: games.length,
      distinctWeeks,
      earliestKickoff: isoOrNull(earliestKickoff),
      latestKickoff: isoOrNull(latestKickoff),
      finalGameCount,
      scoredRowCount,
    },
    fbsPopulation: {
      totalTeamRows: teams.length,
      fbsMembershipCount: fbsMembership.length,
      distinctFbsTeamIds: fbsIds.length,
      duplicateMembershipKeys,
      scheduleTeamCount: scheduleTeams.length,
      scheduleTeamsMissingFromTeam,
      scheduleTeamsMissingFromFbs,
      fbsTeamsAbsentFromSchedule,
      conferenceBreakdown,
      membershipMissingConference,
    },
    talentBySeason,
    commitsBySeason,
    seasonStatsBySeason,
    gameStatsBySeason,
    seasonRatingsTarget,
    seasonRatingsComparison,
    powerRatings: {
      totalRows: powerRatings.length,
      byModelVersion,
      byWeek,
      distinctTeams: powerTeamIds.size,
      earliestCreatedAt: powerTs.earliest,
      latestUpdatedAt: powerTs.latest,
      weeksNotInSchedule: [...weeksNotInScheduleSet].sort((a, b) => a - b),
      nonFiniteCount,
      duplicateLogicalKeys,
    },
    unitGradesBySeason,
    unitGradeInvalidCount,
  };
}

export function formatRatingsReadinessReport(
  result: RatingsReadinessAuditResult
): string {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);

  push('============================================');
  push('2026 RATINGS READINESS AUDIT (READ ONLY)');
  push('============================================');
  push('');
  push('1. Audit boundary and as-of time');
  push(`  asOf: ${result.asOfIso}`);
  push(`  season: ${result.season}`);
  push(`  comparisonSeason: ${result.comparisonSeason}`);
  push('  providersInvoked: false');
  push('  mutationsInvoked: false');
  push('  ratingsComputationInvoked: false');
  push('  ratingsPersistenceInvoked: false');
  push('');

  push('2. Season/schedule context');
  push(`  totalGames: ${result.scheduleContext.totalGames}`);
  push(
    `  distinctWeeks: [${result.scheduleContext.distinctWeeks.join(', ')}]`
  );
  push(`  earliestKickoff: ${result.scheduleContext.earliestKickoff ?? 'n/a'}`);
  push(`  latestKickoff: ${result.scheduleContext.latestKickoff ?? 'n/a'}`);
  push(`  finalGameCount: ${result.scheduleContext.finalGameCount}`);
  push(`  scoredRowCount: ${result.scheduleContext.scoredRowCount}`);
  push(`  preseason: ${result.preseason}`);
  push('');

  push('3. FBS population and schedule alignment');
  const f = result.fbsPopulation;
  push(`  totalTeamRows: ${f.totalTeamRows}`);
  push(`  fbsMembershipCount: ${f.fbsMembershipCount}`);
  push(`  distinctFbsTeamIds: ${f.distinctFbsTeamIds}`);
  push(`  scheduleTeamCount: ${f.scheduleTeamCount}`);
  push(
    `  scheduleTeamsMissingFromTeam: ${f.scheduleTeamsMissingFromTeam.length}`
  );
  push(
    `  scheduleTeamsMissingFromFbs: ${f.scheduleTeamsMissingFromFbs.length}`
  );
  push(
    `  fbsTeamsAbsentFromSchedule: ${f.fbsTeamsAbsentFromSchedule.length}`
  );
  push(`  membershipMissingConference: ${f.membershipMissingConference}`);
  push(`  conferenceBreakdown: ${JSON.stringify(f.conferenceBreakdown)}`);
  push('');

  push('4. Talent coverage');
  for (const t of result.talentBySeason) {
    push(
      `  season=${t.season} rows=${t.totalRows} fbsCovered=${t.fbsCovered} missing=${t.fbsMissing} coveragePct=${t.coveragePct ?? 'n/a'} compositeMin/Avg/Max=${t.talentCompositeMin}/${t.talentCompositeAvg}/${t.talentCompositeMax}`
    );
  }
  push('');

  push('5. Recruiting-commit coverage');
  for (const c of result.commitsBySeason) {
    push(
      `  season=${c.season} rows=${c.totalRows} fbsCovered=${c.fbsCovered} missing=${c.fbsMissing} coveragePct=${c.coveragePct ?? 'n/a'} zeroCommits=${c.zeroTotalCommits}`
    );
  }
  push('');

  push('6. Season-stat coverage');
  for (const s of result.seasonStatsBySeason) {
    push(
      `  season=${s.season} rows=${s.totalRows} fbsCovered=${s.fbsCovered} missing=${s.fbsMissing} offense=${s.meaningfulOffense} defense=${s.meaningfulDefense} epa=${s.withEpa}`
    );
  }
  push('');

  push('7. Game-stat coverage');
  for (const s of result.gameStatsBySeason) {
    push(
      `  season=${s.season} rows=${s.totalRows} distinctTeams=${s.distinctTeamIds} fbsCovered=${s.fbsCovered} missing=${s.fbsMissing}`
    );
  }
  push('');

  push('8. Existing team-season ratings');
  push(
    `  ${result.season} totalRows=${result.seasonRatingsTarget.totalRows} writeCollisionRisk=${result.writeCollisionRisk}`
  );
  for (const m of result.seasonRatingsTarget.byModelVersion) {
    push(
      `    model=${m.modelVersion} rows=${m.rowCount} teams=${m.distinctTeams} power=${m.nonNullPowerRating} conf=${m.nonNullConfidence} fbsMissing=${m.fbsMissingCount} sources=${JSON.stringify(m.dataSourceBreakdown)}`
    );
  }
  push(
    `  ${result.comparisonSeason} totalRows=${result.seasonRatingsComparison.totalRows}`
  );
  for (const m of result.seasonRatingsComparison.byModelVersion) {
    push(
      `    model=${m.modelVersion} rows=${m.rowCount} teams=${m.distinctTeams}`
    );
  }
  push('');

  push('9. Existing weekly power ratings');
  const p = result.powerRatings;
  push(
    `  totalRows=${p.totalRows} distinctTeams=${p.distinctTeams} byModel=${JSON.stringify(p.byModelVersion)} byWeek=${JSON.stringify(p.byWeek)} weeksNotInSchedule=[${p.weeksNotInSchedule.join(', ')}] nonFinite=${p.nonFiniteCount}`
  );
  push('');

  push('10. Unit-grade coverage');
  for (const u of result.unitGradesBySeason) {
    push(
      `  season=${u.season} rows=${u.totalRows} fbsCovered=${u.fbsCovered} missing=${u.fbsMissing} coveragePct=${u.coveragePct ?? 'n/a'}`
    );
  }
  push(`  unitGradeInvalidCount: ${result.unitGradeInvalidCount}`);
  push('');

  push('11. Workflow/code risks');
  for (const w of result.workflowRiskFindings) {
    push(`  [${w.severity}/${w.code}] ${w.message}`);
  }
  push('');

  push('12. Structural issues');
  if (result.structuralIssues.length === 0) push('  (none)');
  else
    for (const i of result.structuralIssues)
      push(`  [${i.code}] ${i.message}`);
  push('');

  push('13. Data-coverage findings');
  if (result.dataCoverageFindings.length === 0) push('  (none)');
  else
    for (const i of result.dataCoverageFindings)
      push(`  [${i.severity}/${i.code}] ${i.message}`);
  push('');

  push('14. Existing-output collision findings');
  for (const i of result.existingOutputFindings)
    push(`  [${i.severity}/${i.code}] ${i.message}`);
  push('');

  push('15. Final classifications');
  push(`  structuralOk: ${result.structuralOk}`);
  push(`  preseason: ${result.preseason}`);
  push(`  writeCollisionRisk: ${result.writeCollisionRisk}`);
  push(`  operatorReviewRequired: ${result.operatorReviewRequired}`);
  push(`  ratingsWriteAuthorized: ${result.ratingsWriteAuthorized}`);
  push('');

  return lines.join('\n');
}

/** Deterministic small fixture helpers for tests. */
export function buildFixtureTeam(id: string, conference = 'SEC'): TeamRow {
  return { id, name: id, conference };
}

export function buildFixtureMembership(
  season: number,
  teamId: string,
  level = 'fbs'
): MembershipRow {
  return { season, teamId, level };
}

export function buildFixtureGame(
  overrides: Partial<ScheduleGameRow> & {
    homeTeamId: string;
    awayTeamId: string;
  }
): ScheduleGameRow {
  return {
    id: overrides.id ?? `2026-wk1-${overrides.awayTeamId}-${overrides.homeTeamId}`,
    season: overrides.season ?? 2026,
    week: overrides.week ?? 1,
    date: overrides.date ?? new Date('2026-08-29T16:00:00.000Z'),
    status: overrides.status ?? 'scheduled',
    homeScore: overrides.homeScore ?? null,
    awayScore: overrides.awayScore ?? null,
    homeTeamId: overrides.homeTeamId,
    awayTeamId: overrides.awayTeamId,
  };
}
