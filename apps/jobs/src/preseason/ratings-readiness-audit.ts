/**
 * Phase 2C-2A — Read-only 2026 ratings-input readiness audit (pure logic).
 *
 * No Prisma import. No provider import. No mutation APIs.
 * ratingsWriteAuthorized is always false.
 */

import {
  EXPECTED_FBS_COUNT,
  canonicalizeConferenceForPersistence,
  isRecognizedV1Conference,
  resolveSeasonAwareConferenceMap,
} from './season-conference-preview';

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
  /** Present for 2026+ season-aware path; may be null historically */
  conference?: string | null;
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
  teamSeasonRatingCollisionRisk: boolean;
  weeklyPowerRatingCollisionRisk: boolean;
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
    fbsMembershipMissingFromTeam: string[];
    scheduleTeamCount: number;
    scheduleTeamsMissingFromTeam: string[];
    scheduleTeamsMissingFromFbs: string[];
    fbsTeamsAbsentFromSchedule: string[];
    conferenceBreakdown: Record<string, number>;
    membershipMissingConference: number;
    /** Authoritative source used for target-season conference breakdown */
    conferenceSource: string;
    conferenceUnrecognized: number;
    conferenceLegacyFallback: boolean;
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
    code: 'ratings_v1_yml',
    severity: 'review',
    message:
      'ratings-v1.yml: workflow_dispatch only (no schedule in YAML); season default 2025; accepts arbitrary season; checkout@v4 + setup-node@v4 + Node 18; calls compute_ratings_v1 (DB upserts); count-based >=98% verify; NOT safe for direct 2026 execution',
  },
  {
    code: 'ratings_v2_yml',
    severity: 'review',
    message:
      'ratings-v2.yml: workflow_dispatch only (no schedule in YAML); season default 2025; accepts arbitrary season; checkout@v4 + setup-node@v4 + Node 18; calls compute_ratings_v2 (DB upserts); count-based >=98% verify; NOT safe for direct 2026 execution',
  },
  {
    code: 'ratings_talent_only_fallback',
    severity: 'review',
    message:
      'compute_ratings_v1.ts early-season path can produce talent-only / low-confidence ratings when base features are missing',
  },
  {
    code: 'talent_cfbd_yml',
    severity: 'review',
    message:
      'talent-cfbd.yml: workflow_dispatch ONLY (schedule removed Phase 2C-2H-2); legacy ≤2025 manual sync; season default 2025; writer refuses 2026+; checkout@v4 + setup-node@v4 + Node 18; still calls CFBD and writes talent for ≤2025 — not the 2026 write path. GitHub UI enable/disable cannot be proven from source alone',
  },
  {
    code: 'talent_roster_sync_yml',
    severity: 'review',
    message:
      'talent-roster-sync.yml: workflow_dispatch ONLY (schedule removed Phase 2C-2H-2); legacy ≤2025 manual sync; season default 2025; writer refuses 2026+; checkout@v4 + setup-node@v4 + Node 20; still calls CFBD and writes for ≤2025 — not the 2026 write path. UI enable/disable not proven from source',
  },
  {
    code: 'talent_commits_sync_yml',
    severity: 'review',
    message:
      'talent-commits-sync.yml: yearly schedule present in YAML; season default 2025; arbitrary season input; checkout@v4 + setup-node@v4 + Node 20; calls CFBD and writes; NOT safe for direct 2026 execution. UI enable/disable not proven from source',
  },
  {
    code: 'stats_cfbd_yml',
    severity: 'review',
    message:
      'stats-cfbd.yml: schedule trigger commented out (dispatch-only in YAML); season default 2025; arbitrary season; checkout@v4 + setup-node@v4 + Node 18; calls CFBD and writes TeamGameStat; NOT safe for direct 2026 execution',
  },
  {
    code: 'stats_season_cfbd_yml',
    severity: 'review',
    message:
      'stats-season-cfbd.yml: active nightly schedule remains in YAML; season default 2025; arbitrary season; checkout@v4 + setup-node@v4 + Node 18; calls CFBD and writes TeamSeasonStat; NOT safe for direct 2026 execution. UI enable/disable not proven from source',
  },
  {
    code: 'stats_advanced_cfbd_yml',
    severity: 'review',
    message:
      'stats-advanced-cfbd.yml: workflow_dispatch ONLY (nightly schedule removed); legacy TeamSeasonStat aggregation / manual-use only; season default 2025; arbitrary season; checkout@v4 + setup-node@v4 + Node 18; calls CFBD and writes advanced/season stats; NOT the guarded 2026 TeamGameStat path; NOT safe for direct 2026 execution. UI enable/disable not proven from source',
  },
  {
    code: 'nightly_ingest_yml',
    severity: 'review',
    message:
      'nightly-ingest.yml: schedule present in YAML; remains unapproved for 2026; checkout@v4 + setup-node@v4 + Node 20; multi-step provider ingest + writes; must NOT be invoked in Phase 2C-2A. UI enable/disable not proven from source',
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

  const fbsMembershipMissingFromTeam = fbsIds.filter((id) => !teamIdSet.has(id));
  if (fbsMembershipMissingFromTeam.length > 0) {
    structuralIssues.push({
      code: 'fbs_membership_missing_from_team',
      severity: 'structural',
      message: `${season} FBS membership team IDs absent from Team: ${fbsMembershipMissingFromTeam.slice(0, SAMPLE_MISSING_CAP).join(', ')}`,
    });
  }

  if (games.length === 0) {
    structuralIssues.push({
      code: 'no_schedule_games',
      severity: 'structural',
      message: `No ${season} Game rows loaded — cannot validate schedule-team alignment`,
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

  const membershipByTeamId: Record<string, string | null | undefined> = {};
  for (const m of fbsMembership) {
    membershipByTeamId[m.teamId] = m.conference ?? null;
  }

  const conferenceBreakdown: Record<string, number> = {};
  let membershipMissingConference = 0;
  let conferenceUnrecognized = 0;
  let conferenceLegacyFallback = false;
  let conferenceSource = 'TeamMembership.conference';

  if (season >= AUDIT_SEASON) {
    const resolved = resolveSeasonAwareConferenceMap({
      targetSeason: season,
      expectedFbsIds: fbsIds,
      seasonConferenceByTeamId: membershipByTeamId,
      allowLegacyTeamConferenceFallback: false,
    });
    conferenceLegacyFallback = resolved.usedLegacyFallback;
    membershipMissingConference = resolved.missingTeamIds.length;
    conferenceUnrecognized = resolved.unrecognizedTeamIds.length;
    if (resolved.ok) {
      for (const conf of Object.values(resolved.conferenceByTeamId)) {
        conferenceBreakdown[conf] = (conferenceBreakdown[conf] ?? 0) + 1;
      }
    } else {
      for (const id of fbsIds) {
        const raw = membershipByTeamId[id];
        const canonical = canonicalizeConferenceForPersistence(
          raw === null || raw === undefined ? null : String(raw)
        );
        if (!canonical) {
          conferenceBreakdown['(blank)'] =
            (conferenceBreakdown['(blank)'] ?? 0) + 1;
        } else if (!isRecognizedV1Conference(canonical)) {
          conferenceBreakdown[canonical] =
            (conferenceBreakdown[canonical] ?? 0) + 1;
        } else {
          conferenceBreakdown[canonical] =
            (conferenceBreakdown[canonical] ?? 0) + 1;
        }
      }
    }
  } else {
    // Historical / comparison seasons: static Team.conference (membership conference not required)
    conferenceSource = 'Team.conference (historical/static)';
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
  }

  if (season >= AUDIT_SEASON) {
    if (fbsIds.length !== EXPECTED_FBS_COUNT) {
      structuralIssues.push({
        code: 'fbs_membership_count_not_138',
        severity: 'structural',
        message: `2026 FBS membership count ${fbsIds.length} != ${EXPECTED_FBS_COUNT} (authoritative denominator requires ${EXPECTED_FBS_COUNT})`,
      });
    }
    if (membershipMissingConference > 0 || conferenceUnrecognized > 0) {
      structuralIssues.push({
        code: 'membership_conference_incomplete',
        severity: 'structural',
        message: `TeamMembership.conference incomplete for ${season}: missing=${membershipMissingConference} unrecognized=${conferenceUnrecognized} (static Team.conference fallback prohibited)`,
      });
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
  if (games.length > 0 && earliestKickoff == null) {
    structuralIssues.push({
      code: 'no_valid_kickoff',
      severity: 'structural',
      message: `All ${season} game dates are invalid — earliest kickoff cannot be determined`,
    });
  }
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
    if ((targetSeasonStats?.totalRows ?? 0) === 0 && (targetGameStats?.totalRows ?? 0) === 0) {
      dataCoverageFindings.push({
        code: 'preseason_empty_stats_expected',
        severity: 'info',
        message: `preseason=true; empty ${season} season/game stats are allowed`,
      });
    }
    if ((targetSeasonStats?.totalRows ?? 0) > 0) {
      dataCoverageFindings.push({
        code: 'preseason_season_stats_present',
        severity: 'review',
        message: `preseason=true but ${season} TeamSeasonStat rows=${targetSeasonStats?.totalRows} distinctTeams=${targetSeasonStats?.distinctTeamIds} — operator review required (do not auto-delete)`,
      });
    }
    if ((targetGameStats?.totalRows ?? 0) > 0) {
      dataCoverageFindings.push({
        code: 'preseason_game_stats_present',
        severity: 'review',
        message: `preseason=true but ${season} TeamGameStat rows=${targetGameStats?.totalRows} distinctTeams=${targetGameStats?.distinctTeamIds} — operator review required (do not auto-delete)`,
      });
    }
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

  const teamSeasonRatingCollisionRisk = targetRatings.length > 0;
  const weeklyPowerRatingCollisionRisk = powerRatings.length > 0;
  // Note: powerRatings loop below; collision OR computed after both known.
  // Placeholder — recomputed after power inventory.
  let writeCollisionRisk = teamSeasonRatingCollisionRisk;

  if (teamSeasonRatingCollisionRisk) {
    existingOutputFindings.push({
      code: 'team_season_rating_collision',
      severity: 'review',
      message: `${targetRatings.length} existing ${season} TeamSeasonRating row(s) — teamSeasonRatingCollisionRisk=true; do not overwrite without operator review`,
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

  writeCollisionRisk =
    teamSeasonRatingCollisionRisk || weeklyPowerRatingCollisionRisk;

  if (weeklyPowerRatingCollisionRisk) {
    existingOutputFindings.push({
      code: 'weekly_power_rating_collision',
      severity: 'review',
      message: `${powerRatings.length} existing ${season} PowerRating row(s) — weeklyPowerRatingCollisionRisk=true; do not overwrite without operator review`,
    });
  } else {
    existingOutputFindings.push({
      code: 'no_existing_power_ratings',
      severity: 'info',
      message: `No ${season} PowerRating rows present`,
    });
  }

  const weeksNotInSchedule = [...weeksNotInScheduleSet].sort((a, b) => a - b);
  if (weeksNotInSchedule.length > 0) {
    existingOutputFindings.push({
      code: 'power_rating_weeks_not_in_schedule',
      severity: 'review',
      message: `PowerRating weeks not present in verified schedule: [${weeksNotInSchedule.join(', ')}] — inventory only; no mutation`,
    });
  }

  if (writeCollisionRisk) {
    existingOutputFindings.push({
      code: 'write_collision_risk',
      severity: 'review',
      message: `writeCollisionRisk=true (teamSeasonRatingCollisionRisk=${teamSeasonRatingCollisionRisk}, weeklyPowerRatingCollisionRisk=${weeklyPowerRatingCollisionRisk})`,
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
    teamSeasonRatingCollisionRisk,
    weeklyPowerRatingCollisionRisk,
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
      fbsMembershipMissingFromTeam,
      scheduleTeamCount: scheduleTeams.length,
      scheduleTeamsMissingFromTeam,
      scheduleTeamsMissingFromFbs,
      fbsTeamsAbsentFromSchedule,
      conferenceBreakdown,
      membershipMissingConference,
      conferenceSource,
      conferenceUnrecognized,
      conferenceLegacyFallback,
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
      weeksNotInSchedule,
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
  const sample = (ids: string[]) =>
    ids.length === 0
      ? ''
      : `\n    sample=[${ids.slice(0, SAMPLE_MISSING_CAP).join(', ')}]`;

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
    `  scheduleTeamsMissingFromTeam: ${f.scheduleTeamsMissingFromTeam.length}${sample(f.scheduleTeamsMissingFromTeam)}`
  );
  push(
    `  scheduleTeamsMissingFromFbs: ${f.scheduleTeamsMissingFromFbs.length}${sample(f.scheduleTeamsMissingFromFbs)}`
  );
  push(
    `  fbsTeamsAbsentFromSchedule: ${f.fbsTeamsAbsentFromSchedule.length}${sample(f.fbsTeamsAbsentFromSchedule)}`
  );
  push(
    `  fbsMembershipMissingFromTeam: ${f.fbsMembershipMissingFromTeam.length}${sample(f.fbsMembershipMissingFromTeam)}`
  );
  push(
    `  duplicateMembershipKeys: ${f.duplicateMembershipKeys.length}${sample(f.duplicateMembershipKeys)}`
  );
  push(`  membershipMissingConference: ${f.membershipMissingConference}`);
  push(`  conferenceSource: ${f.conferenceSource}`);
  push(`  conferenceUnrecognized: ${f.conferenceUnrecognized}`);
  push(`  conferenceLegacyFallback: ${f.conferenceLegacyFallback}`);
  push(`  conferenceBreakdown: ${JSON.stringify(f.conferenceBreakdown)}`);
  push('');

  push('4. Talent coverage');
  for (const t of result.talentBySeason) {
    push(
      `  season=${t.season} rows=${t.totalRows} distinctTeams=${t.distinctTeamIds} fbsCovered=${t.fbsCovered} fbsMissing=${t.fbsMissing} coveragePct=${t.coveragePct ?? 'n/a'}`
    );
    push(
      `    nonNullTalentComposite=${t.nonNullTalentComposite} nonNullBlueChipsPct=${t.nonNullBlueChipsPct} compositeMin/Avg/Max=${t.talentCompositeMin}/${t.talentCompositeAvg}/${t.talentCompositeMax}`
    );
    push(
      `    sourceUpdatedAt earliest=${t.earliestSourceUpdatedAt ?? 'n/a'} latest=${t.latestSourceUpdatedAt ?? 'n/a'}`
    );
    if (t.sampleMissingFbsIds.length > 0) {
      push(`    missingFbsSample=[${t.sampleMissingFbsIds.join(', ')}]`);
    }
  }
  push('');

  push('5. Recruiting-commit coverage');
  for (const c of result.commitsBySeason) {
    push(
      `  season=${c.season} rows=${c.totalRows} distinctTeams=${c.distinctTeamIds} fbsCovered=${c.fbsCovered} fbsMissing=${c.fbsMissing} coveragePct=${c.coveragePct ?? 'n/a'}`
    );
    push(
      `    nonNullClassRank=${c.nonNullClassRank} nonNullAvgRating=${c.nonNullAvgRating} zeroTotalCommits=${c.zeroTotalCommits}`
    );
    push(
      `    sourceUpdatedAt earliest=${c.earliestSourceUpdatedAt ?? 'n/a'} latest=${c.latestSourceUpdatedAt ?? 'n/a'}`
    );
    if (c.sampleMissingFbsIds.length > 0) {
      push(`    missingFbsSample=[${c.sampleMissingFbsIds.join(', ')}]`);
    }
  }
  push('');

  push('6. Season-stat coverage');
  for (const s of result.seasonStatsBySeason) {
    push(
      `  season=${s.season} rows=${s.totalRows} distinctTeams=${s.distinctTeamIds} fbsCovered=${s.fbsCovered} fbsMissing=${s.fbsMissing} coveragePct=${s.coveragePct ?? 'n/a'}`
    );
    push(
      `    meaningfulOffense=${s.meaningfulOffense} meaningfulDefense=${s.meaningfulDefense} epa=${s.withEpa} successRate=${s.withSuccessRate} ypp=${s.withYpp}`
    );
    push(
      `    timestamps earliest=${s.earliestTimestamp ?? 'n/a'} latest=${s.latestTimestamp ?? 'n/a'}`
    );
    if (s.sampleMissingFbsIds.length > 0) {
      push(`    missingFbsSample=[${s.sampleMissingFbsIds.join(', ')}]`);
    }
  }
  push('');

  push('7. Game-stat coverage');
  for (const s of result.gameStatsBySeason) {
    push(
      `  season=${s.season} rows=${s.totalRows} distinctTeams=${s.distinctTeamIds} fbsCovered=${s.fbsCovered} fbsMissing=${s.fbsMissing} coveragePct=${s.coveragePct ?? 'n/a'}`
    );
    push(
      `    meaningfulOffense=${s.meaningfulOffense} meaningfulDefense=${s.meaningfulDefense} epa=${s.withEpa} successRate=${s.withSuccessRate} ypp=${s.withYpp}`
    );
    push(
      `    timestamps earliest=${s.earliestTimestamp ?? 'n/a'} latest=${s.latestTimestamp ?? 'n/a'}`
    );
    if (s.sampleMissingFbsIds.length > 0) {
      push(`    missingFbsSample=[${s.sampleMissingFbsIds.join(', ')}]`);
    }
  }
  push('');

  const printRatingModels = (
    label: string,
    totalRows: number,
    models: ModelVersionRatingSummary[]
  ) => {
    push(`  ${label} totalRows=${totalRows}`);
    for (const m of models) {
      push(
        `    model=${m.modelVersion} rows=${m.rowCount} distinctTeams=${m.distinctTeams} nonNullRating=${m.nonNullRating} nonNullPowerRating=${m.nonNullPowerRating} nonNullConfidence=${m.nonNullConfidence}`
      );
      push(
        `      confidenceMin/Avg/Max=${m.confidenceMin}/${m.confidenceAvg}/${m.confidenceMax} powerMin/Avg/Max=${m.powerRatingMin}/${m.powerRatingAvg}/${m.powerRatingMax}`
      );
      push(`      dataSources=${JSON.stringify(m.dataSourceBreakdown)}`);
      push(
        `      gamesMin/Avg/Max=${m.gamesCountSummary ? `${m.gamesCountSummary.min}/${m.gamesCountSummary.avg}/${m.gamesCountSummary.max}` : 'n/a'} fbsMissing=${m.fbsMissingCount} nonFbsRows=${m.nonFbsRowCount}`
      );
      push(`      sampleTeamIds=[${m.sampleTeamIds.join(', ')}]`);
      if (m.sampleMissingFbsIds.length > 0) {
        push(`      missingFbsSample=[${m.sampleMissingFbsIds.join(', ')}]`);
      }
    }
  };

  push('8. Existing team-season ratings');
  push(
    `  teamSeasonRatingCollisionRisk=${result.teamSeasonRatingCollisionRisk} writeCollisionRisk=${result.writeCollisionRisk}`
  );
  printRatingModels(
    String(result.season),
    result.seasonRatingsTarget.totalRows,
    result.seasonRatingsTarget.byModelVersion
  );
  printRatingModels(
    String(result.comparisonSeason),
    result.seasonRatingsComparison.totalRows,
    result.seasonRatingsComparison.byModelVersion
  );
  push('');

  push('9. Existing weekly power ratings');
  const p = result.powerRatings;
  push(
    `  totalRows=${p.totalRows} distinctTeams=${p.distinctTeams} weeklyPowerRatingCollisionRisk=${result.weeklyPowerRatingCollisionRisk}`
  );
  push(`  byModelVersion=${JSON.stringify(p.byModelVersion)}`);
  push(`  byWeek=${JSON.stringify(p.byWeek)}`);
  push(
    `  earliestCreatedAt=${p.earliestCreatedAt ?? 'n/a'} latestUpdatedAt=${p.latestUpdatedAt ?? 'n/a'}`
  );
  push(
    `  weeksNotInSchedule=[${p.weeksNotInSchedule.join(', ')}] nonFinite=${p.nonFiniteCount}`
  );
  push(
    `  duplicateLogicalKeys=${p.duplicateLogicalKeys.length}${sample(p.duplicateLogicalKeys)}`
  );
  push('');

  push('10. Unit-grade coverage');
  for (const u of result.unitGradesBySeason) {
    push(
      `  season=${u.season} rows=${u.totalRows} distinctTeams=${u.distinctTeamIds} fbsCovered=${u.fbsCovered} fbsMissing=${u.fbsMissing} coveragePct=${u.coveragePct ?? 'n/a'}`
    );
    if (u.sampleMissingFbsIds.length > 0) {
      push(`    missingFbsSample=[${u.sampleMissingFbsIds.join(', ')}]`);
    }
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
  push(
    `  teamSeasonRatingCollisionRisk: ${result.teamSeasonRatingCollisionRisk}`
  );
  push(
    `  weeklyPowerRatingCollisionRisk: ${result.weeklyPowerRatingCollisionRisk}`
  );
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
  level = 'fbs',
  conference: string | null = season >= AUDIT_SEASON ? 'SEC' : null
): MembershipRow {
  return { season, teamId, level, conference };
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
