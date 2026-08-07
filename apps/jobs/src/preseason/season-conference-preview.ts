/**
 * Phase 2C-2F — Read-only 2026 season-aware conference persistence preview.
 *
 * Pure logic: no Prisma, no network.
 * Provider budget (CLI): exactly 1 CFBD call — GET /teams/fbs?year=2026.
 * Does not write Team.conference, TeamMembership, talent, recruiting, or ratings.
 *
 * Recommended persistence (deferred to 2C-2G): nullable `conference` on TeamMembership.
 * This phase does NOT modify prisma/schema.prisma (merge would auto-run migrate deploy).
 */

import {
  EXPECTED_FBS_COUNT,
  TARGET_SEASON,
  V1_CONFERENCE_ADJUSTMENT_KEYS,
  canonicalizeConferenceForPersistence,
  isRecognizedV1Conference,
  normalizeCfbdConferenceForV1,
  type AuditFinding,
  type RawTeamsFbsRow,
  type ResolveTeamId,
} from './conference-recruiting-diagnostic';

export {
  TARGET_SEASON,
  EXPECTED_FBS_COUNT,
  canonicalizeConferenceForPersistence,
  normalizeCfbdConferenceForV1,
  isRecognizedV1Conference,
};

/** Proposed storage — not yet in schema; preview only. */
export const PROPOSED_STORAGE = 'TeamMembership.conference' as const;

export interface SeasonConferenceCandidateRow {
  season: number;
  teamId: string;
  level: 'fbs';
  conference: string;
  rawProviderConference: string;
  providerSchool: string;
}

export interface SeasonConferencePreviewResult {
  ok: boolean;
  structuralOk: boolean;
  previewCompleted: true;
  mutationsInvoked: false;
  writeEligible: boolean;
  ratingsComputeAuthorized: false;
  targetSeason: number;
  proposedStorage: typeof PROPOSED_STORAGE;
  schemaChanged: false;
  migrationCreated: false;
  existingTargetSeasonConferenceDataCount: number;
  dbFbsCount: number;
  rawProviderFbsRows: number;
  candidateCount: number;
  exactSetMatch: boolean;
  providerRequestCount: number;
  providerEndpoints: string[];
  candidates: SeasonConferenceCandidateRow[];
  rawConferenceCounts: Record<string, number>;
  normalizedConferenceCounts: Record<string, number>;
  missingConferences: string[];
  unrecognizedConferences: string[];
  dbFbsMissingFromProvider: string[];
  providerFbsOutsideDb: string[];
  unresolvedProviderSchools: string[];
  duplicateTeamIds: string[];
  mappingCollisions: Array<{ teamId: string; providerSchools: string[] }>;
  currentTeamConferenceDifferences: Array<{
    teamId: string;
    currentConference: string | null;
    proposedConference: string | null;
  }>;
  currentTeamConferenceSafeFor2026: boolean;
  ndsu: {
    teamId: string;
    providerSchool: string | null;
    rawConference: string | null;
    conference: string | null;
  };
  sacramentoState: {
    teamId: string;
    providerSchool: string | null;
    rawConference: string | null;
    conference: string | null;
  };
  findings: AuditFinding[];
  notes: string[];
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

function nonblank(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function sortedUnique(ids: string[]): string[] {
  return [...new Set(ids.map((s) => s.trim()).filter(Boolean))].sort();
}

function providerSchoolName(row: RawTeamsFbsRow): string | null {
  return nonblank(row.school) ?? nonblank(row.team);
}

function countLabels(labels: Array<string | null | undefined>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const label of labels) {
    const key = label && label.trim() !== '' ? label.trim() : '(missing)';
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/**
 * Build would-be season conference rows from authoritative DB FBS + /teams/fbs.
 */
export function buildSeasonConferencePreview(options: {
  fbsIds: string[];
  teamsFbsRaw: RawTeamsFbsRow[];
  conferenceByTeamId: Record<string, string | null | undefined>;
  resolveTeamId: ResolveTeamId;
  providerRequestCount?: number;
  providerEndpoints?: string[];
  /** Count of already-persisted season conference values if storage exists (0 until 2C-2G). */
  existingTargetSeasonConferenceDataCount?: number;
}): SeasonConferencePreviewResult {
  const findings: AuditFinding[] = [];
  const fbsIds = sortedUnique(options.fbsIds);
  const fbsSet = new Set(fbsIds);
  const existingCount = options.existingTargetSeasonConferenceDataCount ?? 0;

  let structuralOk = fbsIds.length === EXPECTED_FBS_COUNT;
  if (!structuralOk) {
    findings.push({
      code: 'fbs_count_mismatch',
      severity: 'structural',
      message: `DB FBS count ${fbsIds.length} != ${EXPECTED_FBS_COUNT}`,
    });
  }

  const mapped: Array<{
    teamId: string;
    school: string;
    rawConference: string | null;
  }> = [];
  const unresolved: string[] = [];

  for (const row of options.teamsFbsRaw) {
    const school = providerSchoolName(row);
    if (!school) {
      unresolved.push('(blank)');
      continue;
    }
    const teamId = options.resolveTeamId(school);
    if (!teamId) {
      unresolved.push(school);
      continue;
    }
    mapped.push({
      teamId,
      school,
      rawConference: nonblank(row.conference),
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
  const unresolvedProviderSchools = sortedUnique(unresolved);

  const firstByTeam = new Map<string, (typeof mapped)[0]>();
  for (const m of mapped) {
    if (!firstByTeam.has(m.teamId)) firstByTeam.set(m.teamId, m);
  }

  const candidates: SeasonConferenceCandidateRow[] = [];
  const missingConferences: string[] = [];
  const unrecognizedConferences: string[] = [];

  for (const id of matchedDbFbsIds) {
    const m = firstByTeam.get(id)!;
    const canonical = canonicalizeConferenceForPersistence(m.rawConference);
    if (!m.rawConference || !canonical) {
      missingConferences.push(id);
      continue;
    }
    if (!isRecognizedV1Conference(canonical)) {
      unrecognizedConferences.push(`${id}:${canonical}`);
      continue;
    }
    candidates.push({
      season: TARGET_SEASON,
      teamId: id,
      level: 'fbs',
      conference: canonical,
      rawProviderConference: m.rawConference,
      providerSchool: m.school,
    });
  }

  const exactSetMatch =
    structuralOk &&
    options.teamsFbsRaw.length === EXPECTED_FBS_COUNT &&
    matchedDbFbsIds.length === EXPECTED_FBS_COUNT &&
    dbFbsMissingFromProvider.length === 0 &&
    providerFbsOutsideDb.length === 0 &&
    unresolvedProviderSchools.length === 0 &&
    duplicateTeamIds.length === 0 &&
    mappingCollisions.length === 0;

  const writeEligible =
    exactSetMatch &&
    candidates.length === EXPECTED_FBS_COUNT &&
    missingConferences.length === 0 &&
    unrecognizedConferences.length === 0;

  if (!exactSetMatch) {
    findings.push({
      code: 'provider_fbs_set_not_exact',
      severity: 'review',
      message: `Provider/DB FBS set not exact 138 (matched=${matchedDbFbsIds.length}, missing=${dbFbsMissingFromProvider.length}, outside=${providerFbsOutsideDb.length}, unresolved=${unresolvedProviderSchools.length}, duplicates=${duplicateTeamIds.length})`,
    });
  }
  if (missingConferences.length > 0) {
    findings.push({
      code: 'missing_provider_conference',
      severity: 'review',
      message: `${missingConferences.length} matched team(s) missing provider conference`,
    });
  }
  if (unrecognizedConferences.length > 0) {
    findings.push({
      code: 'unrecognized_canonical_conference',
      severity: 'review',
      message: `Unrecognized canonical conferences: ${unrecognizedConferences.join(', ')}`,
    });
  }

  const currentTeamConferenceDifferences: SeasonConferencePreviewResult['currentTeamConferenceDifferences'] =
    [];
  for (const id of fbsIds) {
    const currentRaw = options.conferenceByTeamId[id];
    const current =
      currentRaw === null ||
      currentRaw === undefined ||
      String(currentRaw).trim() === ''
        ? null
        : String(currentRaw).trim();
    const proposed =
      candidates.find((c) => c.teamId === id)?.conference ?? null;
    const currentCanon = canonicalizeConferenceForPersistence(current);
    if ((currentCanon ?? null) !== (proposed ?? null)) {
      currentTeamConferenceDifferences.push({
        teamId: id,
        currentConference: current,
        proposedConference: proposed,
      });
    }
  }
  currentTeamConferenceDifferences.sort((a, b) =>
    a.teamId.localeCompare(b.teamId)
  );

  const currentTeamConferenceSafeFor2026 =
    writeEligible && currentTeamConferenceDifferences.length === 0;

  if (!currentTeamConferenceSafeFor2026) {
    findings.push({
      code: 'static_team_conference_unsafe',
      severity: 'review',
      message: `Static Team.conference differs from proposed season map (${currentTeamConferenceDifferences.length} differences) — do not mutate Team.conference`,
    });
  }

  if (writeEligible) {
    findings.push({
      code: 'write_eligible_classification_only',
      severity: 'info',
      message:
        'Candidate is writeEligible for future 2C-2G persistence — no write authorized in this phase',
    });
  }

  const ndsuCand = candidates.find((c) => c.teamId === 'north-dakota-state');
  const sacCand = candidates.find((c) => c.teamId === 'sacramento-state');
  const ndsuMapped = firstByTeam.get('north-dakota-state');
  const sacMapped = firstByTeam.get('sacramento-state');

  return {
    ok: structuralOk,
    structuralOk,
    previewCompleted: true,
    mutationsInvoked: false,
    writeEligible,
    ratingsComputeAuthorized: false,
    targetSeason: TARGET_SEASON,
    proposedStorage: PROPOSED_STORAGE,
    schemaChanged: false,
    migrationCreated: false,
    existingTargetSeasonConferenceDataCount: existingCount,
    dbFbsCount: fbsIds.length,
    rawProviderFbsRows: options.teamsFbsRaw.length,
    candidateCount: candidates.length,
    exactSetMatch,
    providerRequestCount: options.providerRequestCount ?? 1,
    providerEndpoints: options.providerEndpoints ?? ['/teams/fbs?year=2026'],
    candidates,
    rawConferenceCounts: countLabels(mapped.map((m) => m.rawConference)),
    normalizedConferenceCounts: countLabels(
      candidates.map((c) => c.conference)
    ),
    missingConferences: missingConferences.sort(),
    unrecognizedConferences: unrecognizedConferences.sort(),
    dbFbsMissingFromProvider,
    providerFbsOutsideDb,
    unresolvedProviderSchools,
    duplicateTeamIds: duplicateTeamIds.sort(),
    mappingCollisions,
    currentTeamConferenceDifferences,
    currentTeamConferenceSafeFor2026,
    ndsu: {
      teamId: 'north-dakota-state',
      providerSchool: ndsuCand?.providerSchool ?? ndsuMapped?.school ?? null,
      rawConference:
        ndsuCand?.rawProviderConference ?? ndsuMapped?.rawConference ?? null,
      conference: ndsuCand?.conference ?? null,
    },
    sacramentoState: {
      teamId: 'sacramento-state',
      providerSchool: sacCand?.providerSchool ?? sacMapped?.school ?? null,
      rawConference:
        sacCand?.rawProviderConference ?? sacMapped?.rawConference ?? null,
      conference: sacCand?.conference ?? null,
    },
    findings,
    notes: [
      'Recommended storage: nullable TeamMembership.conference (season-aware); deferred — prisma-migrate.yml auto-deploys on main prisma/** pushes',
      'Do not mutate Team.conference; static source remains unsafe when differences > 0',
      'ratingsComputeAuthorized=false — /talent still unavailable; recruiting schema mismatch separate',
      `V1 recognized conference keys: ${V1_CONFERENCE_ADJUSTMENT_KEYS.join(', ')}`,
    ],
  };
}

/**
 * Future V1 season-aware conference loader helper (pure).
 * For targetSeason >= 2026: fail closed — no Team.conference fallback.
 * For historical seasons: optional legacy fallback may be allowed by caller.
 */
export function resolveSeasonAwareConferenceMap(options: {
  targetSeason: number;
  expectedFbsIds: string[];
  seasonConferenceByTeamId: Record<string, string | null | undefined>;
  legacyTeamConferenceByTeamId?: Record<string, string | null | undefined>;
  allowLegacyTeamConferenceFallback?: boolean;
}): {
  ok: boolean;
  conferenceByTeamId: Record<string, string>;
  missingTeamIds: string[];
  unrecognizedTeamIds: string[];
  usedLegacyFallback: boolean;
  error: string | null;
} {
  const expected = sortedUnique(options.expectedFbsIds);
  const conferenceByTeamId: Record<string, string> = {};
  const missingTeamIds: string[] = [];
  const unrecognizedTeamIds: string[] = [];
  let usedLegacyFallback = false;

  const prohibitLegacy =
    options.targetSeason >= TARGET_SEASON ||
    options.allowLegacyTeamConferenceFallback === false;

  for (const id of expected) {
    let conf = options.seasonConferenceByTeamId[id];
    if (
      (conf === null || conf === undefined || String(conf).trim() === '') &&
      !prohibitLegacy &&
      options.legacyTeamConferenceByTeamId
    ) {
      conf = options.legacyTeamConferenceByTeamId[id];
      if (conf !== null && conf !== undefined && String(conf).trim() !== '') {
        usedLegacyFallback = true;
      }
    }

    const canonical = canonicalizeConferenceForPersistence(
      conf === null || conf === undefined ? null : String(conf)
    );
    if (!canonical) {
      missingTeamIds.push(id);
      continue;
    }
    if (!isRecognizedV1Conference(canonical)) {
      unrecognizedTeamIds.push(id);
      continue;
    }
    conferenceByTeamId[id] = canonical;
  }

  if (missingTeamIds.length > 0 || unrecognizedTeamIds.length > 0) {
    return {
      ok: false,
      conferenceByTeamId: {},
      missingTeamIds: missingTeamIds.sort(),
      unrecognizedTeamIds: unrecognizedTeamIds.sort(),
      usedLegacyFallback,
      error:
        options.targetSeason >= TARGET_SEASON
          ? 'Season-aware conference map incomplete; Team.conference fallback prohibited for 2026+'
          : 'Conference map incomplete',
    };
  }

  return {
    ok: true,
    conferenceByTeamId,
    missingTeamIds: [],
    unrecognizedTeamIds: [],
    usedLegacyFallback,
    error: null,
  };
}

export function parseSeasonConferencePreviewArgs(
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
      errors.push(`${arg} is not allowed on the read-only preview CLI`);
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

export function sanitizeSeasonConferencePreviewError(_err?: unknown): string {
  return 'Season conference preview failed; connection and secret details suppressed';
}

export function formatSeasonConferencePreviewReport(
  result: SeasonConferencePreviewResult
): string {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);
  push('============================================');
  push('2026 SEASON CONFERENCE PERSISTENCE PREVIEW (READ ONLY)');
  push('============================================');
  push(`  mode: READ_ONLY`);
  push(`  targetSeason: ${result.targetSeason}`);
  push(`  proposedStorage: ${result.proposedStorage}`);
  push(`  schemaChanged: ${result.schemaChanged}`);
  push(`  migrationCreated: ${result.migrationCreated}`);
  push(
    `  existingTargetSeasonConferenceDataCount: ${result.existingTargetSeasonConferenceDataCount}`
  );
  push(`  dbFbsCount: ${result.dbFbsCount}`);
  push(`  rawProviderFbsRows: ${result.rawProviderFbsRows}`);
  push(`  candidateCount: ${result.candidateCount}`);
  push(`  exactSetMatch: ${result.exactSetMatch}`);
  push(`  writeEligible: ${result.writeEligible}`);
  push(`  structuralOk: ${result.structuralOk}`);
  push(`  ok: ${result.ok}`);
  push(`  mutationsInvoked: ${result.mutationsInvoked}`);
  push(`  ratingsComputeAuthorized: ${result.ratingsComputeAuthorized}`);
  push(`  providerRequestCount: ${result.providerRequestCount}`);
  push(`  providerEndpoints: [${result.providerEndpoints.join(', ')}]`);
  push(
    `  currentTeamConferenceSafeFor2026: ${result.currentTeamConferenceSafeFor2026}`
  );
  push(
    `  currentTeamConferenceDifferences: ${result.currentTeamConferenceDifferences.length}`
  );
  push('  rawConferenceCounts:');
  for (const k of Object.keys(result.rawConferenceCounts).sort()) {
    push(`    ${k}: ${result.rawConferenceCounts[k]}`);
  }
  push('  normalizedConferenceCounts:');
  for (const k of Object.keys(result.normalizedConferenceCounts).sort()) {
    push(`    ${k}: ${result.normalizedConferenceCounts[k]}`);
  }
  push(`  dbFbsMissingFromProvider (${result.dbFbsMissingFromProvider.length}):`);
  for (const id of result.dbFbsMissingFromProvider) push(`    - ${id}`);
  push(`  providerFbsOutsideDb (${result.providerFbsOutsideDb.length}):`);
  for (const id of result.providerFbsOutsideDb) push(`    - ${id}`);
  push(
    `  unresolvedProviderSchools (${result.unresolvedProviderSchools.length}):`
  );
  for (const s of result.unresolvedProviderSchools) push(`    - ${s}`);
  push(`  duplicateTeamIds (${result.duplicateTeamIds.length}):`);
  for (const id of result.duplicateTeamIds) push(`    - ${id}`);
  push(`  mappingCollisions (${result.mappingCollisions.length}):`);
  for (const m of result.mappingCollisions) {
    push(`    - ${m.teamId} <= [${m.providerSchools.join(', ')}]`);
  }
  push(`  missingConferences (${result.missingConferences.length}):`);
  for (const id of result.missingConferences) push(`    - ${id}`);
  push(
    `  unrecognizedConferences (${result.unrecognizedConferences.length}):`
  );
  for (const u of result.unrecognizedConferences) push(`    - ${u}`);
  push(
    `  NDSU: school=${result.ndsu.providerSchool} raw=${result.ndsu.rawConference} canonical=${result.ndsu.conference}`
  );
  push(
    `  SacState: school=${result.sacramentoState.providerSchool} raw=${result.sacramentoState.rawConference} canonical=${result.sacramentoState.conference}`
  );
  if (result.currentTeamConferenceDifferences.length > 0) {
    push(
      `  conferenceDifferences (first 20 of ${result.currentTeamConferenceDifferences.length}):`
    );
    for (const d of result.currentTeamConferenceDifferences.slice(0, 20)) {
      push(
        `    - ${d.teamId}: current=${d.currentConference ?? '(null)'} proposed=${d.proposedConference ?? '(null)'}`
      );
    }
  }
  push('');
  push('--- Findings ---');
  for (const f of result.findings) {
    push(`  [${f.severity}] ${f.code}: ${f.message}`);
  }
  push('--- Notes ---');
  for (const n of result.notes) push(`  note: ${n}`);
  push('============================================');
  return lines.join('\n');
}

export function buildFbsFixture(count = EXPECTED_FBS_COUNT): string[] {
  const base = Array.from({ length: count - 2 }, (_, i) =>
    `team-${String(i + 1).padStart(3, '0')}`
  );
  return [...base, 'north-dakota-state', 'sacramento-state'];
}

export function buildIdentityResolver(
  nameToId: Record<string, string>
): ResolveTeamId {
  return (name: string) => nameToId[name] ?? null;
}
