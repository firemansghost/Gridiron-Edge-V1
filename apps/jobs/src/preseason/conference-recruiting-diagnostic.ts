/**
 * Phase 2C-2D — Read-only 2026 conference + recruiting-mapping diagnostic.
 *
 * Pure logic: no Prisma, no network.
 * Provider budget (CLI): exactly 2 CFBD calls — /teams/fbs and /recruiting/teams.
 * Does not call /talent.
 */

export const TARGET_SEASON = 2026 as const;
export const EXPECTED_FBS_COUNT = 138 as const;

/** Keys recognized by compute_ratings_v1 CONFERENCE_ADJUSTMENTS */
export const V1_CONFERENCE_ADJUSTMENT_KEYS = [
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
] as const;

export type FindingSeverity = 'info' | 'review' | 'structural';

export interface AuditFinding {
  code: string;
  severity: FindingSeverity;
  message: string;
}

export type ResolveTeamId = (providerTeamName: string) => string | null;

export type ResolveMethod =
  | 'cfbd_alias'
  | 'general_alias'
  | 'mis_map_guard'
  | 'normalized'
  | 'fuzzy'
  | 'unknown';

export type ResolveDetailed = (
  providerTeamName: string
) => { teamId: string; method: ResolveMethod } | null;

/** CFBD GET /teams/fbs?year=… Team object (canonical fields). */
export interface RawTeamsFbsRow {
  school?: string;
  conference?: string;
  classification?: string;
  id?: number;
  abbreviation?: string;
  mascot?: string;
  division?: string;
  /** Legacy/compat */
  team?: string;
  [key: string]: unknown;
}

/** CFBD GET /recruiting/teams?year=… */
export interface RawRecruitingRow {
  team?: string;
  year?: number;
  rank?: number;
  points?: number;
  [key: string]: unknown;
}

export type RecruitingBucket =
  | 'maps_to_db_fbs'
  | 'provider_fbs_resolver_failed'
  | 'non_fbs_unresolved'
  | 'non_fbs_false_positive_fbs'
  | 'duplicate_canonical_mapping'
  | 'other';

export interface MatchedConferenceRow {
  teamId: string;
  providerSchool: string;
  /** Raw CFBD /teams/fbs conference string */
  providerConference: string | null;
  /** V1-compatible conference after CFBD label normalization */
  providerConferenceNormalized: string | null;
  currentTeamConference: string | null;
  conferencesAgree: boolean;
  currentIsIndependentOrMissing: boolean;
  providerRecognizedByV1: boolean;
}

export interface ConferenceDiagnostic {
  rawProviderFbsRows: number;
  normalizedUniqueTeamIds: number;
  matchedDbFbsCount: number;
  matchedDbFbsIds: string[];
  dbFbsMissingFromProvider: string[];
  providerFbsOutsideDb: string[];
  unresolvedProviderSchools: string[];
  duplicateTeamIds: string[];
  mappingCollisions: Array<{ teamId: string; providerSchools: string[] }>;
  providerClassificationValues: string[];
  providerConferenceValues: string[];
  providerConferenceCounts: Record<string, number>;
  providerConferenceMissingCount: number;
  matchedRows: MatchedConferenceRow[];
  conferenceDifferences: Array<{
    teamId: string;
    currentConference: string | null;
    providerConference: string | null;
  }>;
  providerConferenceCoverage: number;
  currentIndependentCount: number;
  differFromProviderCount: number;
  independentButProviderHasConference: number;
  unrecognizedProviderConferenceCount: number;
  unrecognizedProviderConferences: string[];
  ndsu: {
    presentInProviderFbs: boolean;
    providerSchool: string | null;
    providerConference: string | null;
  };
  sacramentoState: {
    presentInProviderFbs: boolean;
    providerSchool: string | null;
    providerConference: string | null;
  };
  providerFbsSetExact: boolean;
  providerConferenceCoverageComplete: boolean;
  providerConferenceMapSafeForV1: boolean;
  currentTeamConferenceSafeFor2026: boolean;
  seasonAwareConferenceSolutionRequired: boolean;
  findings: AuditFinding[];
}

export interface RecruitingRowClassification {
  bucket: RecruitingBucket;
  providerTeamName: string;
  year: number | null;
  rank: number | null;
  points: number | null;
  resolvedTeamId: string | null;
  resolveMethod: ResolveMethod | null;
  inProviderFbs: boolean;
  otherProviderNamesForCanonical: string[];
}

export interface RecruitingDiagnostic {
  rawRowCount: number;
  unresolvedCount: number;
  mappedRowCount: number;
  normalizedUniqueTeamIds: number;
  resolverMatchedFbsCount: number;
  providerFbsValidatedMatchedCount: number;
  missingDbFbsIds: string[];
  excessMappedRows: RecruitingRowClassification[];
  collisions: RecruitingRowClassification[];
  falsePositiveMappings: RecruitingRowClassification[];
  unresolvedProviderFbsSchools: string[];
  recruitingResolverSafe: boolean;
  bucketCounts: Record<RecruitingBucket, number>;
  rows: RecruitingRowClassification[];
  ndsu: {
    presentInProviderFbs: boolean;
    providerSchool: string | null;
    presentInRecruiting: boolean;
    recruitingProviderTeam: string | null;
    resolvedTeamId: string | null;
    unresolvedLikelyMissingAlias: boolean;
  };
  sacramentoState: {
    presentInProviderFbs: boolean;
    providerSchool: string | null;
    presentInRecruiting: boolean;
    recruitingProviderTeam: string | null;
    resolvedTeamId: string | null;
    unresolvedLikelyMissingAlias: boolean;
  };
  findings: AuditFinding[];
}

export interface CoreV1PrerequisiteClassification {
  talentAvailableFor2026: false;
  coreV1TalentReady: false;
  currentConferenceReady: boolean;
  providerConferenceCandidateReady: boolean;
  recruitingPersistenceReady: false;
  unitGradesExpectedPreseason: false;
  ratingsComputeAuthorized: false;
  notes: string[];
}

export interface ConferenceRecruitingDiagnosticResult {
  ok: boolean;
  structuralOk: boolean;
  previewCompleted: true;
  mutationsInvoked: false;
  ratingsComputed: false;
  ratingsPersisted: false;
  talentWrites: false;
  commitWrites: false;
  teamWrites: false;
  membershipWrites: false;
  oddsInvoked: false;
  ratingsComputeAuthorized: false;
  recruitingResolverSafe: boolean;
  targetSeason: number;
  dbFbsCount: number;
  providerRequestCount: number;
  providerEndpoints: string[];
  conference: ConferenceDiagnostic;
  recruiting: RecruitingDiagnostic;
  coreV1: CoreV1PrerequisiteClassification;
  findings: AuditFinding[];
}

export type ParseArgsResult =
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

const V1_KEY_SET = new Set<string>(V1_CONFERENCE_ADJUSTMENT_KEYS);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function nonblank(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function sortedUnique(ids: string[]): string[] {
  return [...new Set(ids.map((s) => s.trim()).filter(Boolean))].sort();
}

function isIndependentOrMissing(conf: string | null | undefined): boolean {
  if (conf === null || conf === undefined) return true;
  const t = String(conf).trim();
  return t === '' || t === 'Independent' || t === 'Unknown';
}

function providerSchoolName(row: RawTeamsFbsRow): string | null {
  return nonblank(row.school) ?? nonblank(row.team);
}

function toDetailed(
  resolveTeamId: ResolveTeamId,
  resolveDetailed?: ResolveDetailed
): ResolveDetailed {
  if (resolveDetailed) return resolveDetailed;
  return (name) => {
    const id = resolveTeamId(name);
    return id ? { teamId: id, method: 'unknown' } : null;
  };
}

export function isRecognizedV1Conference(conference: string | null): boolean {
  if (!conference) return false;
  return V1_KEY_SET.has(conference.trim());
}

/**
 * Map CFBD /teams/fbs conference labels onto V1 CONFERENCE_ADJUSTMENTS keys.
 * Does not change weights. Preserves unrecognized strings as-is (trimmed).
 */
export function normalizeCfbdConferenceForV1(
  conference: string | null | undefined
): string | null {
  if (conference === null || conference === undefined) return null;
  const t = String(conference).trim();
  if (t === '') return null;
  if (t === 'FBS Independents') return 'Independent';
  return t;
}

/**
 * In-memory conference diagnostic from /teams/fbs vs DB FBS + Team.conference.
 */
export function diagnoseConferenceMap(options: {
  fbsIds: string[];
  teamsFbsRaw: RawTeamsFbsRow[];
  conferenceByTeamId: Record<string, string | null | undefined>;
  resolveTeamId: ResolveTeamId;
  resolveDetailed?: ResolveDetailed;
}): ConferenceDiagnostic {
  const findings: AuditFinding[] = [];
  const fbsIds = sortedUnique(options.fbsIds);
  const fbsSet = new Set(fbsIds);
  const detailed = toDetailed(options.resolveTeamId, options.resolveDetailed);

  const mapped: Array<{
    teamId: string;
    school: string;
    conference: string | null;
    classification: string | null;
  }> = [];
  const unresolved: string[] = [];

  for (const row of options.teamsFbsRaw) {
    const school = providerSchoolName(row);
    if (!school) {
      unresolved.push('(blank)');
      continue;
    }
    const resolved = detailed(school);
    if (!resolved) {
      unresolved.push(school);
      continue;
    }
    mapped.push({
      teamId: resolved.teamId,
      school,
      conference: nonblank(row.conference),
      classification: nonblank(row.classification),
    });
  }

  const byTeam = new Map<string, string[]>();
  for (const m of mapped) {
    const names = byTeam.get(m.teamId) ?? [];
    names.push(m.school);
    byTeam.set(m.teamId, names);
  }

  const duplicateTeamIds: string[] = [];
  const mappingCollisions: Array<{ teamId: string; providerSchools: string[] }> =
    [];
  for (const [teamId, schools] of byTeam) {
    if (schools.length > 1) {
      duplicateTeamIds.push(teamId);
      mappingCollisions.push({
        teamId,
        providerSchools: sortedUnique(schools),
      });
    }
  }

  const normalizedIds = sortedUnique([...byTeam.keys()]);
  const matchedDbFbsIds = normalizedIds.filter((id) => fbsSet.has(id)).sort();
  const providerFbsOutsideDb = normalizedIds
    .filter((id) => !fbsSet.has(id))
    .sort();
  const dbFbsMissingFromProvider = fbsIds
    .filter((id) => !byTeam.has(id))
    .sort();

  const firstByTeam = new Map<string, (typeof mapped)[0]>();
  for (const m of mapped) {
    if (!firstByTeam.has(m.teamId)) firstByTeam.set(m.teamId, m);
  }

  const matchedRows: MatchedConferenceRow[] = [];
  for (const id of matchedDbFbsIds) {
    const m = firstByTeam.get(id)!;
    const current = options.conferenceByTeamId[id] ?? null;
    const currentNorm =
      current === null || current === undefined || String(current).trim() === ''
        ? null
        : String(current).trim();
    const providerNormalized = normalizeCfbdConferenceForV1(m.conference);
    matchedRows.push({
      teamId: id,
      providerSchool: m.school,
      providerConference: m.conference,
      providerConferenceNormalized: providerNormalized,
      currentTeamConference: currentNorm,
      conferencesAgree:
        (currentNorm ?? '') === (providerNormalized ?? '') &&
        providerNormalized !== null &&
        currentNorm !== null,
      currentIsIndependentOrMissing: isIndependentOrMissing(currentNorm),
      providerRecognizedByV1: isRecognizedV1Conference(providerNormalized),
    });
  }

  const providerConferenceValues = sortedUnique(
    matchedRows
      .map((m) => m.providerConference)
      .filter((c): c is string => !!c)
  );
  const providerClassificationValues = sortedUnique(
    mapped.map((m) => m.classification).filter((c): c is string => !!c)
  );
  const providerConferenceCounts: Record<string, number> = {};
  for (const row of matchedRows) {
    const label = row.providerConference ?? '(missing)';
    providerConferenceCounts[label] = (providerConferenceCounts[label] ?? 0) + 1;
  }
  const providerConferenceMissingCount = matchedRows.filter(
    (r) => !r.providerConference
  ).length;

  const currentIndependentCount = fbsIds.filter((id) =>
    isIndependentOrMissing(options.conferenceByTeamId[id])
  ).length;
  const conferenceDifferences = matchedRows
    .filter((r) => !r.conferencesAgree)
    .map((r) => ({
      teamId: r.teamId,
      currentConference: r.currentTeamConference,
      providerConference: r.providerConference,
    }));
  // Missing-from-provider teams also count as differences
  for (const id of dbFbsMissingFromProvider) {
    const current = options.conferenceByTeamId[id] ?? null;
    const currentNorm =
      current === null || current === undefined || String(current).trim() === ''
        ? null
        : String(current).trim();
    conferenceDifferences.push({
      teamId: id,
      currentConference: currentNorm,
      providerConference: null,
    });
  }
  conferenceDifferences.sort((a, b) => a.teamId.localeCompare(b.teamId));

  const differFromProviderCount = conferenceDifferences.length;
  const independentButProviderHasConference = matchedRows.filter(
    (r) => r.currentIsIndependentOrMissing && !!r.providerConference
  ).length;
  const unrecognized = matchedRows
    .filter((r) => r.providerConference && !r.providerRecognizedByV1)
    .map((r) => r.providerConference!);
  const unrecognizedProviderConferences = sortedUnique(unrecognized);

  const ndsuRow = matchedRows.find((r) => r.teamId === 'north-dakota-state');
  const sacRow = matchedRows.find((r) => r.teamId === 'sacramento-state');

  const unresolvedProviderSchools = sortedUnique(unresolved);
  const providerConferenceCoverage = matchedRows.filter(
    (r) => !!r.providerConference
  ).length;

  const providerFbsSetExact =
    fbsIds.length === EXPECTED_FBS_COUNT &&
    matchedDbFbsIds.length === EXPECTED_FBS_COUNT &&
    dbFbsMissingFromProvider.length === 0 &&
    providerFbsOutsideDb.length === 0 &&
    unresolvedProviderSchools.length === 0 &&
    duplicateTeamIds.length === 0 &&
    mappingCollisions.length === 0 &&
    providerConferenceCoverage === EXPECTED_FBS_COUNT;

  const providerConferenceCoverageComplete =
    providerFbsSetExact &&
    providerConferenceCoverage === EXPECTED_FBS_COUNT;

  const providerConferenceMapSafeForV1 =
    providerFbsSetExact &&
    providerConferenceCoverageComplete &&
    unrecognizedProviderConferences.length === 0;

  const currentExactMatch =
    providerConferenceMapSafeForV1 &&
    matchedRows.length === EXPECTED_FBS_COUNT &&
    matchedRows.every((r) => r.conferencesAgree) &&
    matchedRows.every((r) => isRecognizedV1Conference(r.currentTeamConference));

  const currentTeamConferenceSafeFor2026 = currentExactMatch;
  const seasonAwareConferenceSolutionRequired =
    !currentTeamConferenceSafeFor2026;

  if (!providerFbsSetExact) {
    findings.push({
      code: 'provider_fbs_set_not_exact',
      severity: 'review',
      message: `Provider /teams/fbs set is not an exact 138 match (matched=${matchedDbFbsIds.length}, missing=${dbFbsMissingFromProvider.length}, outside=${providerFbsOutsideDb.length}, unresolved=${unresolvedProviderSchools.length}, duplicates=${duplicateTeamIds.length})`,
    });
  }
  if (!providerConferenceCoverageComplete) {
    findings.push({
      code: 'provider_conference_incomplete',
      severity: 'review',
      message: `Provider FBS conference coverage ${providerConferenceCoverage}/${EXPECTED_FBS_COUNT} (matched IDs ${matchedDbFbsIds.length})`,
    });
  }
  if (unrecognizedProviderConferences.length > 0) {
    findings.push({
      code: 'provider_conference_unrecognized_v1',
      severity: 'review',
      message: `Unrecognized V1 conference keys: ${unrecognizedProviderConferences.join(', ')}`,
    });
  }
  if (seasonAwareConferenceSolutionRequired) {
    findings.push({
      code: 'season_aware_conference_required',
      severity: 'review',
      message: `Current Team.conference unsafe for 2026 (exact provider match=${currentExactMatch}; differences=${differFromProviderCount}; Independent/missing=${currentIndependentCount})`,
    });
  }

  return {
    rawProviderFbsRows: options.teamsFbsRaw.length,
    normalizedUniqueTeamIds: normalizedIds.length,
    matchedDbFbsCount: matchedDbFbsIds.length,
    matchedDbFbsIds,
    dbFbsMissingFromProvider,
    providerFbsOutsideDb,
    unresolvedProviderSchools,
    duplicateTeamIds: duplicateTeamIds.sort(),
    mappingCollisions,
    providerClassificationValues,
    providerConferenceValues,
    providerConferenceCounts,
    providerConferenceMissingCount,
    matchedRows,
    conferenceDifferences,
    providerConferenceCoverage,
    currentIndependentCount,
    differFromProviderCount,
    independentButProviderHasConference,
    unrecognizedProviderConferenceCount: unrecognizedProviderConferences.length,
    unrecognizedProviderConferences,
    ndsu: {
      presentInProviderFbs: !!ndsuRow,
      providerSchool: ndsuRow?.providerSchool ?? null,
      providerConference: ndsuRow?.providerConference ?? null,
    },
    sacramentoState: {
      presentInProviderFbs: !!sacRow,
      providerSchool: sacRow?.providerSchool ?? null,
      providerConference: sacRow?.providerConference ?? null,
    },
    providerFbsSetExact,
    providerConferenceCoverageComplete,
    providerConferenceMapSafeForV1,
    currentTeamConferenceSafeFor2026,
    seasonAwareConferenceSolutionRequired,
    findings,
  };
}

export function diagnoseRecruitingMapping(options: {
  fbsIds: string[];
  recruitingRaw: RawRecruitingRow[];
  providerFbsSchoolNames: string[];
  resolveTeamId: ResolveTeamId;
  resolveDetailed?: ResolveDetailed;
}): RecruitingDiagnostic {
  const findings: AuditFinding[] = [];
  const fbsIds = sortedUnique(options.fbsIds);
  const fbsSet = new Set(fbsIds);
  const providerFbsSchoolSet = new Set(
    options.providerFbsSchoolNames.map((s) => s.toLowerCase())
  );
  const detailed = toDetailed(options.resolveTeamId, options.resolveDetailed);

  const bucketCounts: Record<RecruitingBucket, number> = {
    maps_to_db_fbs: 0,
    provider_fbs_resolver_failed: 0,
    non_fbs_unresolved: 0,
    non_fbs_false_positive_fbs: 0,
    duplicate_canonical_mapping: 0,
    other: 0,
  };

  const firstNameByCanonical = new Map<string, string>();
  const allNamesByCanonical = new Map<string, string[]>();
  const rows: RecruitingRowClassification[] = [];
  const falsePositiveMappings: RecruitingRowClassification[] = [];
  const collisions: RecruitingRowClassification[] = [];
  const excessMappedRows: RecruitingRowClassification[] = [];
  const unresolvedProviderFbsSchools: string[] = [];

  for (const raw of options.recruitingRaw) {
    const name = nonblank(raw.team) ?? '(blank)';
    const inProviderFbs = providerFbsSchoolSet.has(name.toLowerCase());
    const resolved = name === '(blank)' ? null : detailed(name);
    const year = isFiniteNumber(raw.year) ? raw.year : null;
    const rank = isFiniteNumber(raw.rank) ? raw.rank : null;
    const points = isFiniteNumber(raw.points) ? raw.points : null;

    let bucket: RecruitingBucket;
    let otherNames: string[] = [];

    if (!resolved) {
      bucket = inProviderFbs
        ? 'provider_fbs_resolver_failed'
        : 'non_fbs_unresolved';
      if (bucket === 'provider_fbs_resolver_failed' && name !== '(blank)') {
        unresolvedProviderFbsSchools.push(name);
      }
    } else if (!fbsSet.has(resolved.teamId)) {
      bucket = 'other';
    } else if (!inProviderFbs) {
      bucket = 'non_fbs_false_positive_fbs';
    } else if (!firstNameByCanonical.has(resolved.teamId)) {
      bucket = 'maps_to_db_fbs';
      firstNameByCanonical.set(resolved.teamId, name);
      allNamesByCanonical.set(resolved.teamId, [name]);
    } else {
      bucket = 'duplicate_canonical_mapping';
      const names = allNamesByCanonical.get(resolved.teamId) ?? [];
      otherNames = [...names];
      names.push(name);
      allNamesByCanonical.set(resolved.teamId, names);
    }

    const row: RecruitingRowClassification = {
      bucket,
      providerTeamName: name,
      year,
      rank,
      points,
      resolvedTeamId: resolved?.teamId ?? null,
      resolveMethod: resolved?.method ?? null,
      inProviderFbs,
      otherProviderNamesForCanonical: otherNames,
    };

    rows.push(row);
    bucketCounts[bucket] += 1;
    if (bucket === 'non_fbs_false_positive_fbs') {
      falsePositiveMappings.push(row);
    }
    if (bucket === 'duplicate_canonical_mapping') {
      collisions.push(row);
      excessMappedRows.push(row);
    }
  }

  const mappedRowCount = rows.filter((r) => r.resolvedTeamId !== null).length;
  const unresolvedCount = rows.filter((r) => r.resolvedTeamId === null).length;
  const normalizedUniqueTeamIds = new Set(
    rows
      .filter((r) => r.resolvedTeamId)
      .map((r) => r.resolvedTeamId!)
  ).size;

  const resolverMatchedIds = new Set(
    rows
      .filter(
        (r) =>
          r.resolvedTeamId &&
          fbsSet.has(r.resolvedTeamId) &&
          (r.bucket === 'maps_to_db_fbs' ||
            r.bucket === 'duplicate_canonical_mapping' ||
            r.bucket === 'non_fbs_false_positive_fbs')
      )
      .map((r) => r.resolvedTeamId!)
  );
  const validatedIds = new Set(
    rows
      .filter((r) => r.bucket === 'maps_to_db_fbs')
      .map((r) => r.resolvedTeamId!)
  );

  const missingDbFbsIds = fbsIds.filter((id) => !validatedIds.has(id)).sort();
  const unresolvedProviderFbsUnique = sortedUnique(unresolvedProviderFbsSchools);

  // Diagnostic discoveries — review, not structural (structuralOk tracks DB FBS count only)
  if (falsePositiveMappings.length > 0) {
    findings.push({
      code: 'recruiting_false_positive_fbs_mapping',
      severity: 'review',
      message: `${falsePositiveMappings.length} recruiting row(s) resolved to DB FBS but provider school is not in /teams/fbs`,
    });
  }
  if (unresolvedProviderFbsUnique.length > 0) {
    findings.push({
      code: 'recruiting_provider_fbs_resolver_failed',
      severity: 'review',
      message: `${unresolvedProviderFbsUnique.length} provider-FBS recruiting school(s) failed to resolve`,
    });
  }
  if (excessMappedRows.length > 0) {
    findings.push({
      code: 'recruiting_duplicate_canonical_mappings',
      severity: 'review',
      message: `${excessMappedRows.length} excess mapped recruiting row(s) collapse onto already-resolved canonical IDs`,
    });
  }

  const recruitingResolverSafe =
    falsePositiveMappings.length === 0 &&
    unresolvedProviderFbsUnique.length === 0 &&
    collisions.length === 0;

  const findSpecial = (nameHints: string[]) => {
    const fbsSchool =
      options.providerFbsSchoolNames.find((s) =>
        nameHints.some((h) => s.toLowerCase().includes(h))
      ) ?? null;
    const recruitingRow = rows.find((r) =>
      nameHints.some((h) => r.providerTeamName.toLowerCase().includes(h))
    );
    const unresolvedLikelyMissingAlias =
      !!fbsSchool && !options.resolveTeamId(fbsSchool);
    return {
      presentInProviderFbs: !!fbsSchool,
      providerSchool: fbsSchool,
      presentInRecruiting: !!recruitingRow,
      recruitingProviderTeam: recruitingRow?.providerTeamName ?? null,
      resolvedTeamId:
        recruitingRow?.resolvedTeamId ??
        (fbsSchool ? options.resolveTeamId(fbsSchool) : null),
      unresolvedLikelyMissingAlias,
    };
  };

  return {
    rawRowCount: options.recruitingRaw.length,
    unresolvedCount,
    mappedRowCount,
    normalizedUniqueTeamIds,
    resolverMatchedFbsCount: resolverMatchedIds.size,
    providerFbsValidatedMatchedCount: validatedIds.size,
    missingDbFbsIds,
    excessMappedRows,
    collisions,
    falsePositiveMappings,
    unresolvedProviderFbsSchools: unresolvedProviderFbsUnique,
    recruitingResolverSafe,
    bucketCounts,
    rows,
    ndsu: findSpecial(['north dakota state', 'ndsu']),
    sacramentoState: findSpecial(['sacramento state', 'sac state']),
    findings,
  };
}

export function classifyCoreV1Prerequisites(options: {
  conference: ConferenceDiagnostic;
}): CoreV1PrerequisiteClassification {
  return {
    talentAvailableFor2026: false,
    coreV1TalentReady: false,
    currentConferenceReady: options.conference.currentTeamConferenceSafeFor2026,
    providerConferenceCandidateReady:
      options.conference.providerConferenceMapSafeForV1,
    recruitingPersistenceReady: false,
    unitGradesExpectedPreseason: false,
    ratingsComputeAuthorized: false,
    notes: [
      '2026 /talent returned 0 rows in Phase 2C-2C production preview — talent composite unavailable',
      'Core V1 preseason uses talent-only fallback; missing talent yields nondifferentiating zero z-scores',
      'TeamClassCommits is additive via commitsSignal; persistence remains unsafe due /recruiting/teams schema mismatch',
      'Unit grades are derived_after_games — not a Core V1 preseason prerequisite',
      'Do not compute or persist ratings in this phase',
    ],
  };
}

export function buildConferenceRecruitingDiagnostic(options: {
  fbsIds: string[];
  teamsFbsRaw: RawTeamsFbsRow[];
  recruitingRaw: RawRecruitingRow[];
  conferenceByTeamId: Record<string, string | null | undefined>;
  resolveTeamId: ResolveTeamId;
  resolveDetailed?: ResolveDetailed;
  providerRequestCount?: number;
  providerEndpoints?: string[];
}): ConferenceRecruitingDiagnosticResult {
  const fbsIds = sortedUnique(options.fbsIds);
  const findings: AuditFinding[] = [];
  let structuralOk = fbsIds.length === EXPECTED_FBS_COUNT;
  if (!structuralOk) {
    findings.push({
      code: 'fbs_count_mismatch',
      severity: 'structural',
      message: `DB FBS count ${fbsIds.length} != ${EXPECTED_FBS_COUNT}`,
    });
  }

  const conference = diagnoseConferenceMap({
    fbsIds,
    teamsFbsRaw: options.teamsFbsRaw,
    conferenceByTeamId: options.conferenceByTeamId,
    resolveTeamId: options.resolveTeamId,
    resolveDetailed: options.resolveDetailed,
  });

  const providerFbsSchoolNames: string[] = [];
  for (const row of options.teamsFbsRaw) {
    const school = providerSchoolName(row);
    if (!school) continue;
    providerFbsSchoolNames.push(school);
  }

  const recruiting = diagnoseRecruitingMapping({
    fbsIds,
    recruitingRaw: options.recruitingRaw,
    providerFbsSchoolNames,
    resolveTeamId: options.resolveTeamId,
    resolveDetailed: options.resolveDetailed,
  });

  const coreV1 = classifyCoreV1Prerequisites({ conference });

  findings.push(...conference.findings, ...recruiting.findings);

  // Provider cannot redefine membership
  if (conference.providerFbsOutsideDb.length > 0) {
    findings.push({
      code: 'provider_fbs_outside_db_membership',
      severity: 'info',
      message: `${conference.providerFbsOutsideDb.length} provider-mapped ID(s) outside DB FBS set — membership unchanged`,
    });
  }

  // Consistency: structural findings only when structuralOk is false (DB FBS count)
  if (structuralOk) {
    for (const f of findings) {
      if (f.severity === 'structural') {
        f.severity = 'review';
      }
    }
  }

  return {
    ok: structuralOk,
    structuralOk,
    previewCompleted: true,
    mutationsInvoked: false,
    ratingsComputed: false,
    ratingsPersisted: false,
    talentWrites: false,
    commitWrites: false,
    teamWrites: false,
    membershipWrites: false,
    oddsInvoked: false,
    ratingsComputeAuthorized: false,
    recruitingResolverSafe: recruiting.recruitingResolverSafe,
    targetSeason: TARGET_SEASON,
    dbFbsCount: fbsIds.length,
    providerRequestCount: options.providerRequestCount ?? 2,
    providerEndpoints: options.providerEndpoints ?? [
      '/teams/fbs?year=2026',
      '/recruiting/teams?year=2026',
    ],
    conference,
    recruiting,
    coreV1,
    findings,
  };
}

export function parseConferenceRecruitingDiagnosticArgs(
  argv: string[]
): ParseArgsResult {
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
      errors.push(`${arg} is not allowed on the read-only diagnostic CLI`);
      continue;
    }
    if (arg.startsWith('-')) {
      errors.push(`Unknown flag: ${arg}`);
      continue;
    }
    errors.push(`Unexpected positional argument: ${arg}`);
  }

  if (!preview) errors.push('--preview is required (read-only boundary)');
  if (season === undefined) {
    errors.push('--season is required (must be 2026)');
  } else if (season !== TARGET_SEASON) {
    errors.push(`--season must be ${TARGET_SEASON} (got ${season})`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, season: TARGET_SEASON, preview: true };
}

export function sanitizeConferenceRecruitingDiagnosticError(
  _err?: unknown
): string {
  return 'Conference/recruiting diagnostic failed; connection and secret details suppressed';
}

export function formatConferenceRecruitingDiagnosticReport(
  result: ConferenceRecruitingDiagnosticResult
): string {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);
  const c = result.conference;
  const r = result.recruiting;
  push('============================================');
  push('2026 CONFERENCE & RECRUITING DIAGNOSTIC (READ ONLY)');
  push('============================================');
  push(`  mode: READ_ONLY`);
  push(`  targetSeason: ${result.targetSeason}`);
  push(`  dbFbsCount: ${result.dbFbsCount}`);
  push(`  previewCompleted: ${result.previewCompleted}`);
  push(`  structuralOk: ${result.structuralOk}`);
  push(`  ok: ${result.ok}`);
  push(`  recruitingResolverSafe: ${result.recruitingResolverSafe}`);
  push(`  ratingsComputeAuthorized: ${result.ratingsComputeAuthorized}`);
  push(`  providerRequestCount: ${result.providerRequestCount}`);
  push(`  providerEndpoints: [${result.providerEndpoints.join(', ')}]`);
  push(`  mutationsInvoked: ${result.mutationsInvoked}`);
  push(`  ratingsComputed: ${result.ratingsComputed}`);
  push(`  ratingsPersisted: ${result.ratingsPersisted}`);
  push(`  talentWrites: ${result.talentWrites}`);
  push(`  commitWrites: ${result.commitWrites}`);
  push(`  teamWrites: ${result.teamWrites}`);
  push(`  membershipWrites: ${result.membershipWrites}`);
  push(`  oddsInvoked: ${result.oddsInvoked}`);
  push('');
  push('--- /teams/fbs conference ---');
  push(`  rawProviderFbsRows: ${c.rawProviderFbsRows}`);
  push(`  normalizedUniqueTeamIds: ${c.normalizedUniqueTeamIds}`);
  push(`  matchedDbFbs: ${c.matchedDbFbsCount}/${EXPECTED_FBS_COUNT}`);
  push(`  providerFbsSetExact: ${c.providerFbsSetExact}`);
  push(`  dbFbsMissingFromProvider (${c.dbFbsMissingFromProvider.length}):`);
  for (const id of c.dbFbsMissingFromProvider) push(`    - ${id}`);
  push(`  providerFbsOutsideDb (${c.providerFbsOutsideDb.length}):`);
  for (const id of c.providerFbsOutsideDb) push(`    - ${id}`);
  push(`  unresolvedProviderSchools (${c.unresolvedProviderSchools.length}):`);
  for (const s of c.unresolvedProviderSchools) push(`    - ${s}`);
  push(`  duplicateTeamIds (${c.duplicateTeamIds.length}):`);
  for (const id of c.duplicateTeamIds) push(`    - ${id}`);
  push(`  mappingCollisions (${c.mappingCollisions.length}):`);
  for (const m of c.mappingCollisions) {
    push(`    - ${m.teamId} <= [${m.providerSchools.join(', ')}]`);
  }
  push(
    `  providerClassificationValues: [${c.providerClassificationValues.join(', ')}]`
  );
  push(
    `  providerConferenceValues: [${c.providerConferenceValues.join(', ')}]`
  );
  push('  providerConferenceCounts:');
  for (const key of Object.keys(c.providerConferenceCounts).sort()) {
    push(`    ${key}: ${c.providerConferenceCounts[key]}`);
  }
  push(`  providerConferenceCoverage: ${c.providerConferenceCoverage}/${EXPECTED_FBS_COUNT}`);
  push(`  currentIndependentCount: ${c.currentIndependentCount}`);
  push(`  differFromProviderCount: ${c.differFromProviderCount}`);
  push(
    `  independentButProviderHasConference: ${c.independentButProviderHasConference}`
  );
  push(
    `  unrecognizedProviderConferences: [${c.unrecognizedProviderConferences.join(', ')}]`
  );
  push(
    `  providerConferenceCoverageComplete: ${c.providerConferenceCoverageComplete}`
  );
  push(
    `  providerConferenceMapSafeForV1: ${c.providerConferenceMapSafeForV1}`
  );
  push(
    `  currentTeamConferenceSafeFor2026: ${c.currentTeamConferenceSafeFor2026}`
  );
  push(
    `  seasonAwareConferenceSolutionRequired: ${c.seasonAwareConferenceSolutionRequired}`
  );
  push(`  conferenceDifferences (${c.conferenceDifferences.length}):`);
  for (const d of c.conferenceDifferences) {
    const row = c.matchedRows.find((r) => r.teamId === d.teamId);
    const normalized = row?.providerConferenceNormalized ?? null;
    push(
      `    - ${d.teamId}: current=${d.currentConference ?? '(null)'} provider=${d.providerConference ?? '(null)'} normalized=${normalized ?? '(null)'}`
    );
  }
  push(
    `  NDSU: present=${c.ndsu.presentInProviderFbs} school=${c.ndsu.providerSchool} conf=${c.ndsu.providerConference}`
  );
  push(
    `  SacState: present=${c.sacramentoState.presentInProviderFbs} school=${c.sacramentoState.providerSchool} conf=${c.sacramentoState.providerConference}`
  );
  push('');
  push('--- /recruiting/teams resolver ---');
  push(`  rawRowCount: ${r.rawRowCount}`);
  push(`  unresolvedCount: ${r.unresolvedCount}`);
  push(`  mappedRowCount: ${r.mappedRowCount}`);
  push(`  normalizedUniqueTeamIds: ${r.normalizedUniqueTeamIds}`);
  push(`  resolverMatchedFbsCount: ${r.resolverMatchedFbsCount}`);
  push(
    `  providerFbsValidatedMatchedCount: ${r.providerFbsValidatedMatchedCount}`
  );
  push(`  recruitingResolverSafe: ${r.recruitingResolverSafe}`);
  push(`  missingDbFbsIds (${r.missingDbFbsIds.length}):`);
  for (const id of r.missingDbFbsIds) push(`    - ${id}`);
  push(`  excessMappedRows: ${r.excessMappedRows.length}`);
  push(`  falsePositiveMappings: ${r.falsePositiveMappings.length}`);
  push(
    `  unresolvedProviderFbsSchools (${r.unresolvedProviderFbsSchools.length}):`
  );
  for (const s of r.unresolvedProviderFbsSchools) push(`    - ${s}`);
  push(`  bucketCounts: ${JSON.stringify(r.bucketCounts)}`);
  for (const ex of r.excessMappedRows) {
    push(
      `  EXCESS: name="${ex.providerTeamName}" rank=${ex.rank} points=${ex.points} -> ${ex.resolvedTeamId} others=[${ex.otherProviderNamesForCanonical.join(', ')}] method=${ex.resolveMethod}`
    );
  }
  for (const fp of r.falsePositiveMappings) {
    push(
      `  FALSE_POS: name="${fp.providerTeamName}" -> ${fp.resolvedTeamId} method=${fp.resolveMethod}`
    );
  }
  push(
    `  NDSU recruiting: inFbs=${r.ndsu.presentInProviderFbs} inRecruiting=${r.ndsu.presentInRecruiting} school=${r.ndsu.providerSchool} team=${r.ndsu.recruitingProviderTeam} resolved=${r.ndsu.resolvedTeamId} missingAliasLikely=${r.ndsu.unresolvedLikelyMissingAlias}`
  );
  push(
    `  SacState recruiting: inFbs=${r.sacramentoState.presentInProviderFbs} inRecruiting=${r.sacramentoState.presentInRecruiting} school=${r.sacramentoState.providerSchool} team=${r.sacramentoState.recruitingProviderTeam} resolved=${r.sacramentoState.resolvedTeamId} missingAliasLikely=${r.sacramentoState.unresolvedLikelyMissingAlias}`
  );
  push('');
  push('--- Core V1 prerequisites (static) ---');
  push(`  talentAvailableFor2026: ${result.coreV1.talentAvailableFor2026}`);
  push(`  coreV1TalentReady: ${result.coreV1.coreV1TalentReady}`);
  push(`  currentConferenceReady: ${result.coreV1.currentConferenceReady}`);
  push(
    `  providerConferenceCandidateReady: ${result.coreV1.providerConferenceCandidateReady}`
  );
  push(
    `  recruitingPersistenceReady: ${result.coreV1.recruitingPersistenceReady}`
  );
  push(
    `  unitGradesExpectedPreseason: ${result.coreV1.unitGradesExpectedPreseason}`
  );
  push(
    `  ratingsComputeAuthorized: ${result.coreV1.ratingsComputeAuthorized}`
  );
  for (const n of result.coreV1.notes) push(`  note: ${n}`);
  push('');
  push('--- Findings ---');
  for (const f of result.findings) {
    push(`  [${f.severity}] ${f.code}: ${f.message}`);
  }
  push('============================================');
  return lines.join('\n');
}

export function buildFbsFixture(count = EXPECTED_FBS_COUNT): string[] {
  const base = Array.from({ length: count - 2 }, (_, i) =>
    `team-${String(i + 1).padStart(3, '0')}`
  );
  // Keep regular IDs first so tests can use fbs[0] as a standard resolvable team
  return [...base, 'north-dakota-state', 'sacramento-state'];
}

export function buildIdentityResolver(
  nameToId: Record<string, string>
): ResolveTeamId {
  return (name: string) => nameToId[name] ?? null;
}
