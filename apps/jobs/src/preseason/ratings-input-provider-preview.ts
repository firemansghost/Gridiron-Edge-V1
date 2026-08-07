/**
 * Phase 2C-2C — Read-only 2026 ratings-input / provider preview.
 *
 * Pure logic: no Prisma, no network. Provider/DB I/O belongs in the CLI adapter.
 *
 * Authoritative denominator: DB 2026 FBS TeamMembership (expected 138).
 * Provider responses never redefine membership.
 */

export const TARGET_SEASON = 2026 as const;
export const EXPECTED_FBS_COUNT = 138 as const;

export type FindingSeverity = 'info' | 'review' | 'structural';

export interface AuditFinding {
  code: string;
  severity: FindingSeverity;
  message: string;
}

/** Injectable team-name → canonical id resolver (mirrors TeamResolver.resolveTeam). */
export type ResolveTeamId = (providerTeamName: string) => string | null;

export interface RawTalentRow {
  team?: string;
  conference?: string;
  season?: number;
  year?: number;
  talent?: number;
  recruiting?: {
    fiveStars?: number;
    fourStars?: number;
    threeStars?: number;
  };
  [key: string]: unknown;
}

export interface RawCommitsRow {
  team?: string;
  conference?: string;
  year?: number;
  season?: number;
  rank?: number;
  points?: number;
  totalPoints?: number;
  averageRating?: number;
  commits?: number;
  fiveStars?: number;
  fourStars?: number;
  threeStars?: number;
  [key: string]: unknown;
}

export interface WouldBeTalentRow {
  teamId: string;
  season: number;
  providerTeamName: string;
  talentComposite: number | null;
  fiveStar: number | null;
  fourStar: number | null;
  threeStar: number | null;
  blueChipsPct: number | null;
  providerSeason: number | null;
}

export interface WouldBeCommitsRow {
  teamId: string;
  season: number;
  providerTeamName: string;
  commitsTotal: number | null;
  fiveStarCommits: number | null;
  fourStarCommits: number | null;
  threeStarCommits: number | null;
  avgCommitRating: number | null;
  classRank: number | null;
  providerPoints: number | null;
  providerSeason: number | null;
  /** True when ingest would coerce undefined commits → 0 */
  wouldPersistZeroCommits: boolean;
}

export interface ProviderFamilyCoverage {
  rawRowCount: number;
  normalizedTeamCount: number;
  matchedFbsCount: number;
  matchedFbsIds: string[];
  missingFbsIds: string[];
  unexpectedNonFbsIds: string[];
  unresolvedProviderNames: string[];
  duplicateTeamIds: string[];
  mappingCollisions: Array<{ teamId: string; providerNames: string[] }>;
  providerSeasonValues: number[];
  staleSeasonRows: number;
  seasonMismatch: boolean;
}

export interface TalentPreviewSummary extends ProviderFamilyCoverage {
  talentCompositeFiniteCount: number;
  blueChipsPctFiniteCount: number;
  talentMin: number | null;
  talentAvg: number | null;
  talentMax: number | null;
  wouldBeRows: WouldBeTalentRow[];
}

export interface CommitsPreviewSummary extends ProviderFamilyCoverage {
  classRankFiniteCount: number;
  avgRatingFiniteCount: number;
  totalCommitsNonNullCount: number;
  zeroCommitRows: number;
  wouldPersistZeroCommitCount: number;
  pointsPresentCount: number;
  commitsFieldPresentCount: number;
  averageRatingFieldPresentCount: number;
  schemaMismatchLikely: boolean;
  wouldRepeat2025ZeroCommitAnomaly: boolean;
  commitsMin: number | null;
  commitsAvg: number | null;
  commitsMax: number | null;
  wouldBeRows: WouldBeCommitsRow[];
}

export type UnitGradeClassification =
  | 'required_preseason'
  | 'derived_after_games'
  | 'optional'
  | 'unknown_requires_followup';

export interface UnitGradesInvestigation {
  producers: string[];
  consumers: string[];
  upstreamTables: string[];
  source: string;
  meaningfulPreseason: boolean;
  hybridV2Requires: boolean;
  coreV1Requires: boolean;
  classification: UnitGradeClassification;
  findings: AuditFinding[];
}

export interface ConferenceInvestigation {
  sourceField: string;
  seasonSpecific: boolean;
  teamMembershipHasConference: boolean;
  independentAdjustment: number;
  unknownAdjustment: number;
  fbsCount: number;
  conferenceCounts: Record<string, number>;
  independentOrMissingCount: number;
  wouldReceiveIndependentOrUnknownAdj: number;
  affectsCoreV1: boolean;
  affectsHybridV2ViaV1: boolean;
  affectsRatingsV2Directly: boolean;
  recommendedNextStep: string;
  findings: AuditFinding[];
}

export interface RatingsInputPreviewResult {
  ok: boolean;
  structuralOk: boolean;
  mutationsInvoked: false;
  ratingsComputed: false;
  ratingsPersisted: false;
  oddsInvoked: false;
  talentWrites: false;
  commitWrites: false;
  unitGradeWrites: false;
  statsWrites: false;
  targetSeason: number;
  dbFbsCount: number;
  providerRequestCount: number;
  providerEndpoints: string[];
  talent: TalentPreviewSummary;
  commits: CommitsPreviewSummary;
  unitGrades: UnitGradesInvestigation;
  conference: ConferenceInvestigation;
  wouldWriteTalentRows: number;
  wouldWriteCommitRows: number;
  findings: AuditFinding[];
}

export type ParsePreviewArgsResult =
  | { ok: true; season: number; preview: true }
  | { ok: false; errors: string[] };

const WRITE_FLAGS = new Set([
  '--write',
  '--execute',
  '--upsert',
  '--persist',
  '--force',
  '--force-write',
  '--allow-write',
  '--confirm-write',
]);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function sortedUnique(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
}

function numericStats(values: number[]): {
  min: number | null;
  avg: number | null;
  max: number | null;
} {
  if (values.length === 0) return { min: null, avg: null, max: null };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { min, avg, max };
}

function calculateBlueChipsPct(row: {
  fiveStar: number | null;
  fourStar: number | null;
  threeStar: number | null;
}): number | null {
  const five = row.fiveStar ?? 0;
  const four = row.fourStar ?? 0;
  const three = row.threeStar ?? 0;
  const total = five + four + three;
  if (total === 0) return null;
  return ((five + four) / total) * 100;
}

/**
 * Mirrors `mapCFBDTalentToTalentData` + blue-chip calc from cfbd_team_roster_talent.ts
 * (in-memory only — no persistence).
 */
export function mapTalentProviderRow(
  raw: RawTalentRow,
  resolveTeamId: ResolveTeamId,
  requestedSeason: number
): WouldBeTalentRow | { unresolved: string } {
  const name = typeof raw.team === 'string' ? raw.team.trim() : '';
  if (!name) return { unresolved: '(blank)' };
  const teamId = resolveTeamId(name);
  if (!teamId) return { unresolved: name };

  const providerSeason = isFiniteNumber(raw.season)
    ? raw.season
    : isFiniteNumber(raw.year)
      ? raw.year
      : null;
  const fiveStar = isFiniteNumber(raw.recruiting?.fiveStars)
    ? raw.recruiting!.fiveStars!
    : null;
  const fourStar = isFiniteNumber(raw.recruiting?.fourStars)
    ? raw.recruiting!.fourStars!
    : null;
  const threeStar = isFiniteNumber(raw.recruiting?.threeStars)
    ? raw.recruiting!.threeStars!
    : null;

  return {
    teamId,
    season: providerSeason ?? requestedSeason,
    providerTeamName: name,
    talentComposite: isFiniteNumber(raw.talent) ? raw.talent : null,
    fiveStar,
    fourStar,
    threeStar,
    blueChipsPct: calculateBlueChipsPct({ fiveStar, fourStar, threeStar }),
    providerSeason,
  };
}

/**
 * Mirrors `mapCFBDRecruitingToCommitsData` from cfbd_team_class_commits.ts.
 * Documents that `/recruiting/teams` typically exposes year/rank/team/points —
 * not commits/averageRating — which explains the 2025 zero-commit anomaly.
 */
export function mapCommitsProviderRow(
  raw: RawCommitsRow,
  resolveTeamId: ResolveTeamId,
  requestedSeason: number
): WouldBeCommitsRow | { unresolved: string } {
  const name = typeof raw.team === 'string' ? raw.team.trim() : '';
  if (!name) return { unresolved: '(blank)' };
  const teamId = resolveTeamId(name);
  if (!teamId) return { unresolved: name };

  const providerSeason = isFiniteNumber(raw.year)
    ? raw.year
    : isFiniteNumber(raw.season)
      ? raw.season
      : null;

  const commitsPresent = Object.prototype.hasOwnProperty.call(raw, 'commits');
  const commitsTotal = isFiniteNumber(raw.commits) ? raw.commits : null;
  // Existing upsert uses `data.commitsTotal || 0` — undefined becomes 0
  const wouldPersistZeroCommits =
    !commitsPresent || commitsTotal === null || commitsTotal === 0;

  const points = isFiniteNumber(raw.points)
    ? raw.points
    : isFiniteNumber(raw.totalPoints)
      ? raw.totalPoints
      : null;

  return {
    teamId,
    season: providerSeason ?? requestedSeason,
    providerTeamName: name,
    commitsTotal,
    fiveStarCommits: isFiniteNumber(raw.fiveStars) ? raw.fiveStars : null,
    fourStarCommits: isFiniteNumber(raw.fourStars) ? raw.fourStars : null,
    threeStarCommits: isFiniteNumber(raw.threeStars) ? raw.threeStars : null,
    avgCommitRating: isFiniteNumber(raw.averageRating)
      ? raw.averageRating
      : null,
    classRank: isFiniteNumber(raw.rank) ? raw.rank : null,
    providerPoints: points,
    providerSeason,
    wouldPersistZeroCommits,
  };
}

function buildCoverage(options: {
  fbsIds: string[];
  mapped: Array<{ teamId: string; providerTeamName: string; providerSeason: number | null }>;
  unresolved: string[];
  requestedSeason: number;
}): ProviderFamilyCoverage {
  const fbsSet = new Set(options.fbsIds);
  const byTeam = new Map<string, string[]>();
  for (const row of options.mapped) {
    const names = byTeam.get(row.teamId) ?? [];
    names.push(row.providerTeamName);
    byTeam.set(row.teamId, names);
  }

  const duplicateTeamIds: string[] = [];
  const mappingCollisions: Array<{ teamId: string; providerNames: string[] }> =
    [];
  for (const [teamId, names] of byTeam) {
    if (names.length > 1) {
      duplicateTeamIds.push(teamId);
      mappingCollisions.push({
        teamId,
        providerNames: [...new Set(names)].sort(),
      });
    }
  }

  const normalizedIds = sortedUnique([...byTeam.keys()]);
  const matchedFbsIds = normalizedIds.filter((id) => fbsSet.has(id));
  const unexpectedNonFbsIds = normalizedIds.filter((id) => !fbsSet.has(id));
  const missingFbsIds = options.fbsIds.filter((id) => !byTeam.has(id)).sort();

  const providerSeasonValues = [
    ...new Set(
      options.mapped
        .map((m) => m.providerSeason)
        .filter((s): s is number => isFiniteNumber(s))
    ),
  ].sort((a, b) => a - b);

  const staleSeasonRows = options.mapped.filter(
    (m) =>
      m.providerSeason !== null && m.providerSeason !== options.requestedSeason
  ).length;

  return {
    rawRowCount: options.mapped.length + options.unresolved.length,
    normalizedTeamCount: normalizedIds.length,
    matchedFbsCount: matchedFbsIds.length,
    matchedFbsIds: matchedFbsIds.sort(),
    missingFbsIds,
    unexpectedNonFbsIds: unexpectedNonFbsIds.sort(),
    unresolvedProviderNames: [...options.unresolved].sort(),
    duplicateTeamIds: duplicateTeamIds.sort(),
    mappingCollisions,
    providerSeasonValues,
    staleSeasonRows,
    seasonMismatch:
      staleSeasonRows > 0 ||
      (providerSeasonValues.length > 0 &&
        providerSeasonValues.some((s) => s !== options.requestedSeason)),
  };
}

export function previewTalentInputs(options: {
  fbsIds: string[];
  rawRows: RawTalentRow[];
  resolveTeamId: ResolveTeamId;
  requestedSeason?: number;
}): TalentPreviewSummary {
  const requestedSeason = options.requestedSeason ?? TARGET_SEASON;
  const mapped: WouldBeTalentRow[] = [];
  const unresolved: string[] = [];

  for (const raw of options.rawRows) {
    const result = mapTalentProviderRow(
      raw,
      options.resolveTeamId,
      requestedSeason
    );
    if ('unresolved' in result) {
      unresolved.push(result.unresolved);
    } else {
      mapped.push(result);
    }
  }

  // Coverage uses unique mapping set; rawRowCount includes all provider rows
  const coverageBase = buildCoverage({
    fbsIds: options.fbsIds,
    mapped,
    unresolved,
    requestedSeason,
  });
  coverageBase.rawRowCount = options.rawRows.length;

  const fbsMapped = mapped.filter((m) => options.fbsIds.includes(m.teamId));
  const talentValues = fbsMapped
    .map((m) => m.talentComposite)
    .filter(isFiniteNumber);
  const blueChipValues = fbsMapped
    .map((m) => m.blueChipsPct)
    .filter(isFiniteNumber);
  const stats = numericStats(talentValues);

  return {
    ...coverageBase,
    talentCompositeFiniteCount: talentValues.length,
    blueChipsPctFiniteCount: blueChipValues.length,
    talentMin: stats.min,
    talentAvg: stats.avg,
    talentMax: stats.max,
    wouldBeRows: mapped,
  };
}

export function previewCommitsInputs(options: {
  fbsIds: string[];
  rawRows: RawCommitsRow[];
  resolveTeamId: ResolveTeamId;
  requestedSeason?: number;
}): CommitsPreviewSummary {
  const requestedSeason = options.requestedSeason ?? TARGET_SEASON;
  const mapped: WouldBeCommitsRow[] = [];
  const unresolved: string[] = [];

  for (const raw of options.rawRows) {
    const result = mapCommitsProviderRow(
      raw,
      options.resolveTeamId,
      requestedSeason
    );
    if ('unresolved' in result) {
      unresolved.push(result.unresolved);
    } else {
      mapped.push(result);
    }
  }

  const coverageBase = buildCoverage({
    fbsIds: options.fbsIds,
    mapped,
    unresolved,
    requestedSeason,
  });
  coverageBase.rawRowCount = options.rawRows.length;

  const fbsMapped = mapped.filter((m) => options.fbsIds.includes(m.teamId));
  const classRanks = fbsMapped.map((m) => m.classRank).filter(isFiniteNumber);
  const avgRatings = fbsMapped
    .map((m) => m.avgCommitRating)
    .filter(isFiniteNumber);
  const commitsNonNull = fbsMapped.filter((m) => m.commitsTotal !== null);
  const commitValues = commitsNonNull
    .map((m) => m.commitsTotal!)
    .filter(isFiniteNumber);
  const stats = numericStats(commitValues);

  const pointsPresentCount = options.rawRows.filter(
    (r) => isFiniteNumber(r.points) || isFiniteNumber(r.totalPoints)
  ).length;
  const commitsFieldPresentCount = options.rawRows.filter((r) =>
    Object.prototype.hasOwnProperty.call(r, 'commits')
  ).length;
  const averageRatingFieldPresentCount = options.rawRows.filter((r) =>
    Object.prototype.hasOwnProperty.call(r, 'averageRating')
  ).length;

  // Classic /recruiting/teams schema: points+rank present, commits/avgRating absent
  const schemaMismatchLikely =
    options.rawRows.length > 0 &&
    pointsPresentCount > 0 &&
    commitsFieldPresentCount === 0 &&
    averageRatingFieldPresentCount === 0;

  const wouldPersistZeroCommitCount = fbsMapped.filter(
    (m) => m.wouldPersistZeroCommits
  ).length;
  const zeroCommitRows = fbsMapped.filter(
    (m) => m.commitsTotal === 0 || m.commitsTotal === null
  ).length;

  const wouldRepeat2025ZeroCommitAnomaly =
    schemaMismatchLikely ||
    (fbsMapped.length > 0 &&
      avgRatings.length === 0 &&
      wouldPersistZeroCommitCount === fbsMapped.length);

  return {
    ...coverageBase,
    classRankFiniteCount: classRanks.length,
    avgRatingFiniteCount: avgRatings.length,
    totalCommitsNonNullCount: commitsNonNull.length,
    zeroCommitRows,
    wouldPersistZeroCommitCount,
    pointsPresentCount,
    commitsFieldPresentCount,
    averageRatingFieldPresentCount,
    schemaMismatchLikely,
    wouldRepeat2025ZeroCommitAnomaly,
    commitsMin: stats.min,
    commitsAvg: stats.avg,
    commitsMax: stats.max,
    wouldBeRows: mapped,
  };
}

/**
 * Static investigation — TeamUnitGrades are derived from CFBD game-level features,
 * not a direct preseason provider feed.
 */
export function investigateUnitGrades(): UnitGradesInvestigation {
  const findings: AuditFinding[] = [
    {
      code: 'unit_grades_producer',
      severity: 'info',
      message:
        'Sole producer: apps/jobs/src/v2/compute_unit_grades.ts (calculateUnitGrades) upserts TeamUnitGrades from CfbdPpaTeamGame / CfbdEffTeamGame / CfbdEffTeamSeason',
    },
    {
      code: 'unit_grades_hybrid_required',
      severity: 'review',
      message:
        'Hybrid V2 spreads require TeamUnitGrades (≈30% blend); slate falls back when grades missing',
    },
    {
      code: 'unit_grades_core_v1_not_required',
      severity: 'info',
      message:
        'Core V1 / compute_ratings_v1 and ratings V2 FeatureLoader do not read TeamUnitGrades',
    },
    {
      code: 'unit_grades_preseason',
      severity: 'info',
      message:
        '0/138 unit grades is expected preseason — meaningful grades require game-level CFBD advanced stats after games are played',
    },
  ];

  return {
    producers: ['apps/jobs/src/v2/compute_unit_grades.ts#calculateUnitGrades'],
    consumers: [
      'apps/web/lib/core-v2-spread.ts (Hybrid V2)',
      'apps/web/lib/slate-hybrid-spread.ts',
      'apps/web/scripts/sync-hybrid-bets.ts',
      'apps/web/app/api/weeks/slate/route.ts',
    ],
    upstreamTables: [
      'CfbdPpaTeamGame',
      'CfbdEffTeamGame',
      'CfbdEffTeamSeason',
      'TeamMembership',
    ],
    source:
      'Derived z-score blends from CFBD game-level PPA/efficiency/havoc — not a direct provider talent endpoint',
    meaningfulPreseason: false,
    hybridV2Requires: true,
    coreV1Requires: false,
    classification: 'derived_after_games',
    findings,
  };
}

/**
 * Conference investigation for Core V1 adjustment path.
 * Source is static Team.conference — not season-aware.
 */
export function investigateConferenceAlignment(options: {
  fbsIds: string[];
  conferenceByTeamId: Record<string, string | null | undefined>;
}): ConferenceInvestigation {
  const findings: AuditFinding[] = [];
  const counts: Record<string, number> = {};
  let independentOrMissing = 0;
  let wouldReceiveDefaultAdj = 0;

  const knownKeys = new Set([
    'SEC',
    'Big Ten',
    'B1G',
    'ACC',
    'Big 12',
    'Pac-12',
    'Pac-10',
    'American Athletic',
    'AAC',
    'Mountain West',
    'MWC',
    'Sun Belt',
    'Mid-American',
    'MAC',
    'Conference USA',
    'C-USA',
    'C-USA (FCS)',
    'Independent',
    'Unknown',
    'Big Sky',
    'Big Sky (FCS)',
    'FCS',
  ]);

  for (const id of options.fbsIds) {
    const conf = options.conferenceByTeamId[id];
    const label =
      conf === null || conf === undefined || String(conf).trim() === ''
        ? '(missing)'
        : String(conf).trim();
    counts[label] = (counts[label] ?? 0) + 1;
    if (label === 'Independent' || label === '(missing)' || label === 'Unknown') {
      independentOrMissing += 1;
      wouldReceiveDefaultAdj += 1;
    } else if (!knownKeys.has(label)) {
      // getConferenceAdjustment falls through to Independent (−5)
      wouldReceiveDefaultAdj += 1;
    }
  }

  findings.push({
    code: 'conference_source_team_table',
    severity: 'structural',
    message:
      'Core V1 conference adjustment reads Team.conference only (compute_ratings_v1.ts) — not season-specific',
  });
  findings.push({
    code: 'conference_independent_adjustment',
    severity: 'review',
    message:
      'Independent / Unknown / unrecognized conference strings receive −5.0 via getConferenceAdjustment',
  });
  findings.push({
    code: 'conference_membership_no_field',
    severity: 'info',
    message:
      'TeamMembership has no conference column; Game.conferenceGame is a boolean only',
  });

  if (independentOrMissing >= 50) {
    findings.push({
      code: 'conference_distribution_suspicious',
      severity: 'structural',
      message: `${independentOrMissing}/${options.fbsIds.length} FBS teams are Independent/missing — unreliable for 2026 V1 conference adjustment`,
    });
  }

  return {
    sourceField: 'Team.conference',
    seasonSpecific: false,
    teamMembershipHasConference: false,
    independentAdjustment: -5.0,
    unknownAdjustment: -5.0,
    fbsCount: options.fbsIds.length,
    conferenceCounts: counts,
    independentOrMissingCount: independentOrMissing,
    wouldReceiveIndependentOrUnknownAdj: wouldReceiveDefaultAdj,
    affectsCoreV1: true,
    affectsHybridV2ViaV1: true,
    affectsRatingsV2Directly: false,
    recommendedNextStep:
      'Do not mutate Team.conference in this phase. Prefer a future season-aware conference source (e.g. CFBD team/season conference or schedule-derived mapping) before any 2026 V1 ratings compute; Hybrid V2 inherits V1 power ratings that already bake this adjustment.',
    findings,
  };
}

export function parsePreviewRatingsInputArgs(
  argv: string[]
): ParsePreviewArgsResult {
  const errors: string[] = [];
  let season: number | undefined;
  let seasonSeen = false;
  let preview = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
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
    if (arg === '--preview') {
      preview = true;
      continue;
    }
    if (WRITE_FLAGS.has(arg)) {
      errors.push(`${arg} is not allowed on the read-only preview CLI`);
      continue;
    }
    if (arg.startsWith('-')) {
      errors.push(`Unknown flag: ${arg}`);
      continue;
    }
    errors.push(`Unexpected positional argument: ${arg}`);
  }

  if (!preview) {
    errors.push('--preview is required (read-only boundary)');
  }
  if (season === undefined) {
    errors.push('--season is required (must be 2026)');
  } else if (season !== TARGET_SEASON) {
    errors.push(`--season must be ${TARGET_SEASON} (got ${season})`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, season: TARGET_SEASON, preview: true };
}

export function sanitizeRatingsInputPreviewError(_err?: unknown): string {
  return 'Ratings input preview failed; connection and secret details suppressed';
}

export function buildRatingsInputPreview(options: {
  fbsIds: string[];
  talentRaw: RawTalentRow[];
  commitsRaw: RawCommitsRow[];
  resolveTeamId: ResolveTeamId;
  conferenceByTeamId: Record<string, string | null | undefined>;
  providerRequestCount: number;
  providerEndpoints: string[];
  requestedSeason?: number;
}): RatingsInputPreviewResult {
  const requestedSeason = options.requestedSeason ?? TARGET_SEASON;
  const findings: AuditFinding[] = [];
  const fbsIds = sortedUnique(options.fbsIds);

  let structuralOk = true;
  if (fbsIds.length !== EXPECTED_FBS_COUNT) {
    structuralOk = false;
    findings.push({
      code: 'fbs_count_mismatch',
      severity: 'structural',
      message: `DB FBS count ${fbsIds.length} != expected ${EXPECTED_FBS_COUNT}`,
    });
  }

  const talent = previewTalentInputs({
    fbsIds,
    rawRows: options.talentRaw,
    resolveTeamId: options.resolveTeamId,
    requestedSeason,
  });
  const commits = previewCommitsInputs({
    fbsIds,
    rawRows: options.commitsRaw,
    resolveTeamId: options.resolveTeamId,
    requestedSeason,
  });
  const unitGrades = investigateUnitGrades();
  const conference = investigateConferenceAlignment({
    fbsIds,
    conferenceByTeamId: options.conferenceByTeamId,
  });

  findings.push(...unitGrades.findings, ...conference.findings);

  if (talent.seasonMismatch) {
    findings.push({
      code: 'talent_season_mismatch',
      severity: 'structural',
      message: `Talent provider returned season values [${talent.providerSeasonValues.join(', ')}] for requested ${requestedSeason}`,
    });
  }
  if (commits.seasonMismatch) {
    findings.push({
      code: 'commits_season_mismatch',
      severity: 'structural',
      message: `Commits provider returned season values [${commits.providerSeasonValues.join(', ')}] for requested ${requestedSeason}`,
    });
  }
  if (commits.wouldRepeat2025ZeroCommitAnomaly) {
    findings.push({
      code: 'commits_schema_anomaly',
      severity: 'review',
      message:
        'Current cfbd_team_class_commits mapper would repeat the 2025 zero-commit / null avgRating anomaly against /recruiting/teams (points present; commits/averageRating absent)',
    });
  }
  if (talent.matchedFbsCount < EXPECTED_FBS_COUNT) {
    findings.push({
      code: 'talent_partial_coverage',
      severity: 'review',
      message: `Talent matched ${talent.matchedFbsCount}/${EXPECTED_FBS_COUNT} FBS teams`,
    });
  }
  if (commits.matchedFbsCount < EXPECTED_FBS_COUNT) {
    findings.push({
      code: 'commits_partial_coverage',
      severity: 'review',
      message: `Commits matched ${commits.matchedFbsCount}/${EXPECTED_FBS_COUNT} FBS teams`,
    });
  }

  // Provider must not redefine FBS membership
  const providerOnlyIds = [
    ...new Set([
      ...talent.unexpectedNonFbsIds,
      ...commits.unexpectedNonFbsIds,
    ]),
  ];
  if (providerOnlyIds.length > 0) {
    findings.push({
      code: 'provider_non_fbs_ignored_for_membership',
      severity: 'info',
      message: `${providerOnlyIds.length} provider-mapped team(s) are outside DB FBS set and do not redefine membership`,
    });
  }

  const wouldWriteTalentUnique = new Set(
    talent.wouldBeRows
      .filter((r) => fbsIds.includes(r.teamId))
      .map((r) => r.teamId)
  ).size;
  const wouldWriteCommitUnique = new Set(
    commits.wouldBeRows
      .filter((r) => fbsIds.includes(r.teamId))
      .map((r) => r.teamId)
  ).size;

  // Conference findings are investigative — do not fail provider preview alone.
  // Structural fail: wrong FBS count or provider season mismatch.
  const previewOk =
    structuralOk && !talent.seasonMismatch && !commits.seasonMismatch;

  return {
    ok: previewOk,
    structuralOk,
    mutationsInvoked: false,
    ratingsComputed: false,
    ratingsPersisted: false,
    oddsInvoked: false,
    talentWrites: false,
    commitWrites: false,
    unitGradeWrites: false,
    statsWrites: false,
    targetSeason: requestedSeason,
    dbFbsCount: fbsIds.length,
    providerRequestCount: options.providerRequestCount,
    providerEndpoints: [...options.providerEndpoints],
    talent,
    commits,
    unitGrades,
    conference,
    wouldWriteTalentRows: wouldWriteTalentUnique,
    wouldWriteCommitRows: wouldWriteCommitUnique,
    findings,
  };
}

export function formatRatingsInputPreviewReport(
  result: RatingsInputPreviewResult
): string {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);
  push('============================================');
  push('2026 RATINGS INPUT PROVIDER PREVIEW (READ ONLY)');
  push('============================================');
  push(`  mode: READ_ONLY`);
  push(`  targetSeason: ${result.targetSeason}`);
  push(`  dbFbsCount: ${result.dbFbsCount}`);
  push(`  structuralOk: ${result.structuralOk}`);
  push(`  ok: ${result.ok}`);
  push(`  providerRequestCount: ${result.providerRequestCount}`);
  push(`  providerEndpoints: [${result.providerEndpoints.join(', ')}]`);
  push(`  mutationsInvoked: ${result.mutationsInvoked}`);
  push(`  ratingsComputed: ${result.ratingsComputed}`);
  push(`  ratingsPersisted: ${result.ratingsPersisted}`);
  push(`  oddsInvoked: ${result.oddsInvoked}`);
  push(`  talentWrites: ${result.talentWrites}`);
  push(`  commitWrites: ${result.commitWrites}`);
  push(`  unitGradeWrites: ${result.unitGradeWrites}`);
  push(`  statsWrites: ${result.statsWrites}`);
  push('');
  push('--- Talent (CFBD /talent) ---');
  push(`  rawRowCount: ${result.talent.rawRowCount}`);
  push(`  normalizedTeamCount: ${result.talent.normalizedTeamCount}`);
  push(
    `  matchedFbs: ${result.talent.matchedFbsCount}/${EXPECTED_FBS_COUNT}`
  );
  push(`  missingFbsCount: ${result.talent.missingFbsIds.length}`);
  push(`  unresolvedCount: ${result.talent.unresolvedProviderNames.length}`);
  push(`  duplicateTeamIds: ${result.talent.duplicateTeamIds.length}`);
  push(
    `  talentCompositeFinite: ${result.talent.talentCompositeFiniteCount}`
  );
  push(`  blueChipsPctFinite: ${result.talent.blueChipsPctFiniteCount}`);
  push(
    `  talent min/avg/max: ${result.talent.talentMin}/${result.talent.talentAvg}/${result.talent.talentMax}`
  );
  push(
    `  providerSeasons: [${result.talent.providerSeasonValues.join(', ')}]`
  );
  push(`  seasonMismatch: ${result.talent.seasonMismatch}`);
  push(`  wouldWriteUniqueFbsRows: ${result.wouldWriteTalentRows}`);
  push('');
  push('--- Recruiting /commits (CFBD /recruiting/teams) ---');
  push(`  rawRowCount: ${result.commits.rawRowCount}`);
  push(`  normalizedTeamCount: ${result.commits.normalizedTeamCount}`);
  push(
    `  matchedFbs: ${result.commits.matchedFbsCount}/${EXPECTED_FBS_COUNT}`
  );
  push(`  missingFbsCount: ${result.commits.missingFbsIds.length}`);
  push(`  unresolvedCount: ${result.commits.unresolvedProviderNames.length}`);
  push(`  classRankFinite: ${result.commits.classRankFiniteCount}`);
  push(`  avgRatingFinite: ${result.commits.avgRatingFiniteCount}`);
  push(`  totalCommitsNonNull: ${result.commits.totalCommitsNonNullCount}`);
  push(`  zeroCommitRows: ${result.commits.zeroCommitRows}`);
  push(
    `  wouldPersistZeroCommits: ${result.commits.wouldPersistZeroCommitCount}`
  );
  push(`  pointsPresent: ${result.commits.pointsPresentCount}`);
  push(`  commitsFieldPresent: ${result.commits.commitsFieldPresentCount}`);
  push(
    `  averageRatingFieldPresent: ${result.commits.averageRatingFieldPresentCount}`
  );
  push(`  schemaMismatchLikely: ${result.commits.schemaMismatchLikely}`);
  push(
    `  wouldRepeat2025ZeroCommitAnomaly: ${result.commits.wouldRepeat2025ZeroCommitAnomaly}`
  );
  push(
    `  providerSeasons: [${result.commits.providerSeasonValues.join(', ')}]`
  );
  push(`  seasonMismatch: ${result.commits.seasonMismatch}`);
  push(`  wouldWriteUniqueFbsRows: ${result.wouldWriteCommitRows}`);
  push('');
  push('--- TeamUnitGrades (static investigation) ---');
  push(`  classification: ${result.unitGrades.classification}`);
  push(`  meaningfulPreseason: ${result.unitGrades.meaningfulPreseason}`);
  push(`  hybridV2Requires: ${result.unitGrades.hybridV2Requires}`);
  push(`  coreV1Requires: ${result.unitGrades.coreV1Requires}`);
  push(`  producers: ${result.unitGrades.producers.join('; ')}`);
  push('');
  push('--- Conference (Team.conference → V1 adjustment) ---');
  push(`  sourceField: ${result.conference.sourceField}`);
  push(`  seasonSpecific: ${result.conference.seasonSpecific}`);
  push(
    `  independentOrMissing: ${result.conference.independentOrMissingCount}/${result.conference.fbsCount}`
  );
  push(
    `  wouldReceiveIndependentOrUnknownAdj: ${result.conference.wouldReceiveIndependentOrUnknownAdj}`
  );
  push(`  affectsCoreV1: ${result.conference.affectsCoreV1}`);
  push(`  affectsHybridV2ViaV1: ${result.conference.affectsHybridV2ViaV1}`);
  push(
    `  affectsRatingsV2Directly: ${result.conference.affectsRatingsV2Directly}`
  );
  push(`  recommendedNextStep: ${result.conference.recommendedNextStep}`);
  push('  conferenceCounts:');
  for (const [k, v] of Object.entries(result.conference.conferenceCounts).sort(
    (a, b) => b[1] - a[1]
  )) {
    push(`    ${k}: ${v}`);
  }
  push('');
  push('--- Findings ---');
  for (const f of result.findings) {
    push(`  [${f.severity}] ${f.code}: ${f.message}`);
  }
  if (result.talent.missingFbsIds.length > 0) {
    push('');
    push(
      `  talentMissingFbsIds (first 20): ${result.talent.missingFbsIds.slice(0, 20).join(', ')}`
    );
  }
  if (result.commits.missingFbsIds.length > 0) {
    push('');
    push(
      `  commitsMissingFbsIds (first 20): ${result.commits.missingFbsIds.slice(0, 20).join(', ')}`
    );
  }
  push('============================================');
  return lines.join('\n');
}

/** Deterministic fixture helpers for tests */
export function buildFbsFixture(count = EXPECTED_FBS_COUNT): string[] {
  return Array.from({ length: count }, (_, i) =>
    `team-${String(i + 1).padStart(3, '0')}`
  );
}

export function buildIdentityResolver(
  nameToId: Record<string, string>
): ResolveTeamId {
  return (name: string) => nameToId[name] ?? null;
}
