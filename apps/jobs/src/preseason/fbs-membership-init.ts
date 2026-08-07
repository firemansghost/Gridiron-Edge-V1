/**
 * Phase 2C-2B — Preview and guarded initialization of 2026 FBS TeamMembership.
 *
 * Pure logic: no Prisma, no providers, no mutations.
 *
 * Candidate set = 2025 FBS membership ∪ {north-dakota-state, sacramento-state}
 * Must exactly equal distinct 2026 Game home/away team IDs before any write.
 */

export const TARGET_SEASON = 2026 as const;
export const BASE_SEASON = 2025 as const;
export const EXPECTED_BASE_FBS_COUNT = 136 as const;
export const EXPECTED_CANDIDATE_COUNT = 138 as const;
export const WRITE_CONFIRM_PHRASE = 'WRITE_2026_FBS_MEMBERSHIP' as const;

export const APPROVED_2026_ADDITIONS: readonly string[] = [
  'north-dakota-state',
  'sacramento-state',
] as const;

export type FindingSeverity = 'info' | 'review' | 'structural';

export interface AuditFinding {
  code: string;
  severity: FindingSeverity;
  message: string;
}

export interface MembershipRow {
  season: number;
  teamId: string;
  level: string;
}

export interface TeamIdRow {
  id: string;
}

export interface ScheduleTeamSource {
  homeTeamId: string;
  awayTeamId: string;
}

/** Narrow read-store — SELECT only. */
export interface FbsMembershipReadStore {
  loadFbsMembership(season: number): Promise<MembershipRow[]>;
  loadAllMembership(season: number): Promise<MembershipRow[]>;
  loadScheduleTeamIds(season: number): Promise<ScheduleTeamSource[]>;
  loadTeamsByIds(ids: string[]): Promise<TeamIdRow[]>;
}

/**
 * Transaction-scoped store — the only surface allowed for mutation-path reads/writes.
 * Must be backed by Prisma's interactive transaction client (`tx`), not the outer client.
 */
export interface FbsMembershipTransactionStore {
  loadAllMembership(season: number): Promise<MembershipRow[]>;
  createMembershipRows(
    rows: Array<{ season: number; teamId: string; level: string }>
  ): Promise<number>;
}

/**
 * Narrow write deps — mutations run only via transaction-scoped store.
 * Outer `loadAllMembership` is for fresh post-commit verification only.
 */
export interface FbsMembershipWriteDeps {
  transaction<T>(
    fn: (tx: FbsMembershipTransactionStore) => Promise<T>
  ): Promise<T>;
  /** Fresh post-commit reload for verification — not for mutation. */
  loadAllMembership(season: number): Promise<MembershipRow[]>;
}

export interface MembershipInitSnapshot {
  baseFbsIds: string[];
  approvedAdditions: string[];
  candidateIds: string[];
  scheduleTeamIds: string[];
  existingTargetMembership: MembershipRow[];
  teamIdsPresent: string[];
}

export interface MembershipPreviewResult {
  ok: boolean;
  writeEligible: boolean;
  mutationsInvoked: false;
  targetSeason: number;
  baseSeason: number;
  baseFbsCount: number;
  approvedAdditions: string[];
  candidateCount: number;
  scheduleTeamCount: number;
  exactSetMatch: boolean;
  existingTargetMembershipCount: number;
  existingTargetFbsCount: number;
  existingTargetNonFbsCount: number;
  candidateAbsentFromSchedule: string[];
  scheduleAbsentFromCandidate: string[];
  candidateMissingFromTeam: string[];
  duplicateCandidateIds: string[];
  unexpectedAdditionsVsBase: string[];
  missingApprovedAdditions: string[];
  findings: AuditFinding[];
  candidateIds: string[];
  scheduleTeamIds: string[];
}

export interface MembershipWriteVerification {
  ok: boolean;
  targetFbsCount: number;
  distinctTargetFbsIds: number;
  exactMatchCandidate: boolean;
  exactMatchSchedule: boolean;
  unexpectedRows: string[];
  missingRows: string[];
  nonFbsRows: string[];
  findings: AuditFinding[];
}

export type ParsePreviewArgsResult =
  | { ok: true; season: number; preview: true }
  | { ok: false; errors: string[] };

export type ParseWriteArgsResult =
  | { ok: true; season: number; confirmWrite: string }
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

function sortedUnique(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
}

function setEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function diffAbsent(from: string[], present: Set<string>): string[] {
  return from.filter((id) => !present.has(id));
}

export function buildCandidateSet(baseFbsIds: string[]): {
  candidateIds: string[];
  duplicateCandidateIds: string[];
  unexpectedAdditionsVsBase: string[];
  missingApprovedAdditions: string[];
} {
  const baseSorted = sortedUnique(baseFbsIds);
  const baseSet = new Set(baseSorted);
  const combined = [...baseSorted, ...APPROVED_2026_ADDITIONS];
  const seen = new Map<string, number>();
  for (const id of combined) {
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  const duplicateCandidateIds = [...seen.entries()]
    .filter(([, c]) => c > 1)
    .map(([id]) => id)
    .sort();
  // Duplicates only if an approved addition was already in base — still ok set-wise
  const candidateIds = sortedUnique(combined);
  const missingApprovedAdditions = APPROVED_2026_ADDITIONS.filter(
    (id) => !candidateIds.includes(id)
  );
  // "Unexpected additions" relative to base+approved: none by construction;
  // expose any approved id already in base as informational via duplicates.
  const unexpectedAdditionsVsBase = candidateIds.filter(
    (id) => !baseSet.has(id) && !APPROVED_2026_ADDITIONS.includes(id)
  );
  return {
    candidateIds,
    duplicateCandidateIds,
    unexpectedAdditionsVsBase,
    missingApprovedAdditions,
  };
}

export function collectScheduleTeamIds(
  games: ScheduleTeamSource[]
): string[] {
  const ids: string[] = [];
  for (const g of games) {
    ids.push(g.homeTeamId, g.awayTeamId);
  }
  return sortedUnique(ids);
}

export function parsePreviewMembershipArgs(
  argv: string[]
): ParsePreviewArgsResult {
  const errors: string[] = [];
  let season: number | undefined;
  let seasonSeen = false;
  let preview = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (WRITE_FLAGS.has(arg)) {
      errors.push(
        `${arg} is not allowed — membership preview is read-only`
      );
      continue;
    }
    if (arg === '--preview') {
      preview = true;
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
  } else if (season !== TARGET_SEASON) {
    errors.push(`--season must be ${TARGET_SEASON} (got ${season})`);
  }
  if (!preview) {
    errors.push('--preview is required for the membership preview CLI');
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, season: TARGET_SEASON, preview: true };
}

export function parseWriteMembershipArgs(
  argv: string[]
): ParseWriteArgsResult {
  const errors: string[] = [];
  let season: number | undefined;
  let seasonSeen = false;
  let confirmWrite: string | undefined;
  let confirmWriteSeen = false;

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
    if (arg === '--confirm-write') {
      if (confirmWriteSeen) {
        errors.push('--confirm-write may be provided exactly once');
        i += 1;
        continue;
      }
      confirmWriteSeen = true;
      const raw = argv[++i];
      if (raw === undefined || raw === '') {
        errors.push('--confirm-write requires the exact confirmation phrase');
        continue;
      }
      confirmWrite = raw;
      continue;
    }
    if (
      arg === '--write' ||
      arg === '--execute' ||
      arg === '--upsert' ||
      arg === '--persist' ||
      arg === '--force' ||
      arg === '--force-write' ||
      arg === '--allow-write' ||
      arg === '--preview'
    ) {
      errors.push(
        `${arg} is not allowed on the write CLI (use --confirm-write ${WRITE_CONFIRM_PHRASE})`
      );
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
  } else if (season !== TARGET_SEASON) {
    errors.push(`--season must be ${TARGET_SEASON} (got ${season})`);
  }
  if (confirmWrite === undefined) {
    errors.push(
      `--confirm-write is required (exact phrase ${WRITE_CONFIRM_PHRASE})`
    );
  } else if (confirmWrite !== WRITE_CONFIRM_PHRASE) {
    errors.push(
      `--confirm-write must be exactly ${WRITE_CONFIRM_PHRASE}`
    );
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    season: TARGET_SEASON,
    confirmWrite: WRITE_CONFIRM_PHRASE,
  };
}

/**
 * Pure preview / pre-write validation of the 2026 FBS membership candidate set.
 */
export function previewFbsMembership(
  snapshot: MembershipInitSnapshot
): MembershipPreviewResult {
  const findings: AuditFinding[] = [];
  const baseFbsIds = sortedUnique(snapshot.baseFbsIds);
  const scheduleTeamIds = sortedUnique(snapshot.scheduleTeamIds);
  const built = buildCandidateSet(baseFbsIds);
  const { candidateIds, duplicateCandidateIds, unexpectedAdditionsVsBase, missingApprovedAdditions } =
    built;

  const existing = snapshot.existingTargetMembership;
  const existingTargetFbs = existing.filter(
    (m) => m.level.toLowerCase() === 'fbs'
  );
  const existingTargetNonFbs = existing.filter(
    (m) => m.level.toLowerCase() !== 'fbs'
  );

  const teamPresent = new Set(snapshot.teamIdsPresent);
  const scheduleSet = new Set(scheduleTeamIds);
  const candidateSet = new Set(candidateIds);

  const candidateAbsentFromSchedule = diffAbsent(candidateIds, scheduleSet);
  const scheduleAbsentFromCandidate = diffAbsent(scheduleTeamIds, candidateSet);
  const candidateMissingFromTeam = diffAbsent(candidateIds, teamPresent);

  if (baseFbsIds.length !== EXPECTED_BASE_FBS_COUNT) {
    findings.push({
      code: 'wrong_base_fbs_count',
      severity: 'structural',
      message: `Base ${BASE_SEASON} FBS count ${baseFbsIds.length} !== ${EXPECTED_BASE_FBS_COUNT}`,
    });
  }

  if (candidateIds.length !== EXPECTED_CANDIDATE_COUNT) {
    findings.push({
      code: 'wrong_candidate_count',
      severity: 'structural',
      message: `Candidate count ${candidateIds.length} !== ${EXPECTED_CANDIDATE_COUNT}`,
    });
  }

  if (scheduleTeamIds.length !== EXPECTED_CANDIDATE_COUNT) {
    findings.push({
      code: 'wrong_schedule_team_count',
      severity: 'structural',
      message: `Schedule team count ${scheduleTeamIds.length} !== ${EXPECTED_CANDIDATE_COUNT}`,
    });
  }

  if (duplicateCandidateIds.length > 0) {
    // Approved additions already in 2025 base would duplicate in concat before unique —
    // after unique this list is empty unless blank/duplicate raw base rows.
    findings.push({
      code: 'duplicate_candidate_ids',
      severity: 'structural',
      message: `Duplicate candidate IDs before dedupe: ${duplicateCandidateIds.join(', ')}`,
    });
  }

  // Detect if approved additions were already in base (info only — still valid set)
  const additionsAlreadyInBase = APPROVED_2026_ADDITIONS.filter((id) =>
    baseFbsIds.includes(id)
  );
  if (additionsAlreadyInBase.length > 0) {
    findings.push({
      code: 'approved_addition_already_in_base',
      severity: 'structural',
      message: `Approved 2026 additions already present in ${BASE_SEASON} FBS: ${additionsAlreadyInBase.join(', ')}`,
    });
  }

  if (unexpectedAdditionsVsBase.length > 0) {
    findings.push({
      code: 'unexpected_candidate_addition',
      severity: 'structural',
      message: `Non-approved candidate additions vs base: ${unexpectedAdditionsVsBase.join(', ')}`,
    });
  }

  if (missingApprovedAdditions.length > 0) {
    findings.push({
      code: 'missing_approved_addition',
      severity: 'structural',
      message: `Missing approved additions: ${missingApprovedAdditions.join(', ')}`,
    });
  }

  if (candidateAbsentFromSchedule.length > 0) {
    findings.push({
      code: 'candidate_absent_from_schedule',
      severity: 'structural',
      message: `Candidate teams absent from schedule: ${candidateAbsentFromSchedule.join(', ')}`,
    });
  }

  if (scheduleAbsentFromCandidate.length > 0) {
    findings.push({
      code: 'schedule_absent_from_candidate',
      severity: 'structural',
      message: `Schedule teams absent from candidate set: ${scheduleAbsentFromCandidate.join(', ')}`,
    });
  }

  if (candidateMissingFromTeam.length > 0) {
    findings.push({
      code: 'candidate_missing_from_team',
      severity: 'structural',
      message: `Candidate IDs missing from Team: ${candidateMissingFromTeam.join(', ')}`,
    });
  }

  if (existing.length > 0) {
    findings.push({
      code: 'existing_target_membership',
      severity: 'structural',
      message: `${TARGET_SEASON} TeamMembership already has ${existing.length} row(s) — write blocked (must be empty)`,
    });
  }

  if (existingTargetNonFbs.length > 0) {
    findings.push({
      code: 'existing_target_non_fbs',
      severity: 'structural',
      message: `${TARGET_SEASON} has non-FBS membership rows: ${existingTargetNonFbs.map((m) => `${m.teamId}:${m.level}`).join(', ')}`,
    });
  }

  const blankIds = candidateIds.filter((id) => !id || !id.trim());
  if (blankIds.length > 0) {
    findings.push({
      code: 'blank_candidate_id',
      severity: 'structural',
      message: 'Candidate list contains blank team IDs',
    });
  }

  const exactSetMatch = setEqual(candidateIds, scheduleTeamIds);
  if (!exactSetMatch && candidateAbsentFromSchedule.length === 0 && scheduleAbsentFromCandidate.length === 0) {
    findings.push({
      code: 'exact_set_mismatch',
      severity: 'structural',
      message: 'Candidate set and schedule set are not exactly equal',
    });
  }

  const structuralFail = findings.some((f) => f.severity === 'structural');
  const writeEligible =
    !structuralFail &&
    exactSetMatch &&
    existing.length === 0 &&
    candidateIds.length === EXPECTED_CANDIDATE_COUNT &&
    scheduleTeamIds.length === EXPECTED_CANDIDATE_COUNT &&
    baseFbsIds.length === EXPECTED_BASE_FBS_COUNT;

  if (writeEligible) {
    findings.push({
      code: 'write_eligible',
      severity: 'info',
      message:
        'Preview classification writeEligible=true — does not authorize automatic write; use guarded write CLI with confirmation',
    });
  }

  findings.push({
    code: 'conference_metadata_note',
    severity: 'info',
    message:
      'Team.conference for north-dakota-state and sacramento-state may still report Independent; Team rows are NOT modified in this phase',
  });

  return {
    ok: !structuralFail,
    writeEligible,
    mutationsInvoked: false,
    targetSeason: TARGET_SEASON,
    baseSeason: BASE_SEASON,
    baseFbsCount: baseFbsIds.length,
    approvedAdditions: [...APPROVED_2026_ADDITIONS],
    candidateCount: candidateIds.length,
    scheduleTeamCount: scheduleTeamIds.length,
    exactSetMatch,
    existingTargetMembershipCount: existing.length,
    existingTargetFbsCount: existingTargetFbs.length,
    existingTargetNonFbsCount: existingTargetNonFbs.length,
    candidateAbsentFromSchedule,
    scheduleAbsentFromCandidate,
    candidateMissingFromTeam,
    duplicateCandidateIds,
    unexpectedAdditionsVsBase,
    missingApprovedAdditions,
    findings,
    candidateIds,
    scheduleTeamIds,
  };
}

export function verifyMembershipWrite(options: {
  writtenMembership: MembershipRow[];
  candidateIds: string[];
  scheduleTeamIds: string[];
}): MembershipWriteVerification {
  const findings: AuditFinding[] = [];
  const rows = options.writtenMembership;
  const fbs = rows.filter((m) => m.level.toLowerCase() === 'fbs');
  const nonFbs = rows.filter((m) => m.level.toLowerCase() !== 'fbs');
  const ids = sortedUnique(fbs.map((m) => m.teamId));
  const candidateIds = sortedUnique(options.candidateIds);
  const scheduleTeamIds = sortedUnique(options.scheduleTeamIds);
  const idSet = new Set(ids);
  const candidateSet = new Set(candidateIds);

  const unexpectedRows = diffAbsent(ids, candidateSet);
  const missingRows = diffAbsent(candidateIds, idSet);
  const nonFbsRows = nonFbs.map((m) => `${m.teamId}:${m.level}`);

  if (fbs.length !== EXPECTED_CANDIDATE_COUNT) {
    findings.push({
      code: 'post_write_count',
      severity: 'structural',
      message: `Post-write FBS count ${fbs.length} !== ${EXPECTED_CANDIDATE_COUNT}`,
    });
  }
  if (ids.length !== EXPECTED_CANDIDATE_COUNT) {
    findings.push({
      code: 'post_write_distinct',
      severity: 'structural',
      message: `Post-write distinct FBS IDs ${ids.length} !== ${EXPECTED_CANDIDATE_COUNT}`,
    });
  }
  if (rows.length !== fbs.length) {
    findings.push({
      code: 'post_write_unexpected_levels',
      severity: 'structural',
      message: `Unexpected non-FBS or extra rows present (${nonFbsRows.join(', ')})`,
    });
  }
  if (unexpectedRows.length > 0) {
    findings.push({
      code: 'post_write_unexpected_ids',
      severity: 'structural',
      message: `Unexpected membership IDs: ${unexpectedRows.join(', ')}`,
    });
  }
  if (missingRows.length > 0) {
    findings.push({
      code: 'post_write_missing_ids',
      severity: 'structural',
      message: `Missing membership IDs: ${missingRows.join(', ')}`,
    });
  }

  const exactMatchCandidate = setEqual(ids, candidateIds);
  const exactMatchSchedule = setEqual(ids, scheduleTeamIds);
  if (!exactMatchCandidate) {
    findings.push({
      code: 'post_write_candidate_mismatch',
      severity: 'structural',
      message: 'Post-write membership set does not exactly equal candidate set',
    });
  }
  if (!exactMatchSchedule) {
    findings.push({
      code: 'post_write_schedule_mismatch',
      severity: 'structural',
      message: 'Post-write membership set does not exactly equal schedule team set',
    });
  }

  return {
    ok: findings.length === 0,
    targetFbsCount: fbs.length,
    distinctTargetFbsIds: ids.length,
    exactMatchCandidate,
    exactMatchSchedule,
    unexpectedRows,
    missingRows,
    nonFbsRows,
    findings,
  };
}

/**
 * Perform guarded write: validate → one transaction insert → verify.
 * Throws before mutation if transaction support is unavailable.
 */
export async function writeFbsMembership(options: {
  snapshot: MembershipInitSnapshot;
  deps: FbsMembershipWriteDeps;
}): Promise<{
  preview: MembershipPreviewResult;
  inserted: number;
  verification: MembershipWriteVerification | null;
  ok: boolean;
}> {
  const preview = previewFbsMembership(options.snapshot);
  if (!preview.writeEligible || !preview.ok) {
    return { preview, inserted: 0, verification: null, ok: false };
  }

  if (typeof options.deps.transaction !== 'function') {
    throw new Error(
      'transaction support unavailable - refusing nontransactional write'
    );
  }

  const rows = preview.candidateIds.map((teamId) => ({
    season: TARGET_SEASON,
    teamId,
    level: 'fbs',
  }));

  const inserted = await options.deps.transaction(async (tx) => {
    // Emptiness check + insert MUST use transaction-scoped store only
    const existing = await tx.loadAllMembership(TARGET_SEASON);
    if (existing.length > 0) {
      throw new Error(
        `${TARGET_SEASON} membership no longer empty inside transaction (${existing.length} rows)`
      );
    }
    return tx.createMembershipRows(rows);
  });

  if (inserted !== EXPECTED_CANDIDATE_COUNT) {
    const verification = verifyMembershipWrite({
      writtenMembership: await options.deps.loadAllMembership(TARGET_SEASON),
      candidateIds: preview.candidateIds,
      scheduleTeamIds: preview.scheduleTeamIds,
    });
    verification.findings.push({
      code: 'insert_count_mismatch',
      severity: 'structural',
      message: `createMembershipRows returned ${inserted}, expected ${EXPECTED_CANDIDATE_COUNT}`,
    });
    return {
      preview,
      inserted,
      verification: { ...verification, ok: false },
      ok: false,
    };
  }

  const writtenMembership = await options.deps.loadAllMembership(TARGET_SEASON);
  const verification = verifyMembershipWrite({
    writtenMembership,
    candidateIds: preview.candidateIds,
    scheduleTeamIds: preview.scheduleTeamIds,
  });

  return {
    preview,
    inserted,
    verification,
    ok: verification.ok,
  };
}

export function formatMembershipPreviewReport(
  result: MembershipPreviewResult
): string {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);
  push('============================================');
  push('2026 FBS MEMBERSHIP PREVIEW (READ ONLY)');
  push('============================================');
  push(`  targetSeason: ${result.targetSeason}`);
  push(`  baseSeason: ${result.baseSeason}`);
  push(`  baseFbsCount: ${result.baseFbsCount}`);
  push(`  approvedAdditions: [${result.approvedAdditions.join(', ')}]`);
  push(`  candidateCount: ${result.candidateCount}`);
  push(`  scheduleTeamCount: ${result.scheduleTeamCount}`);
  push(`  exactSetMatch: ${result.exactSetMatch}`);
  push(
    `  existingTargetMembershipCount: ${result.existingTargetMembershipCount}`
  );
  push(`  existingTargetFbsCount: ${result.existingTargetFbsCount}`);
  push(`  existingTargetNonFbsCount: ${result.existingTargetNonFbsCount}`);
  push(
    `  candidateAbsentFromSchedule: [${result.candidateAbsentFromSchedule.join(', ')}]`
  );
  push(
    `  scheduleAbsentFromCandidate: [${result.scheduleAbsentFromCandidate.join(', ')}]`
  );
  push(
    `  candidateMissingFromTeam: [${result.candidateMissingFromTeam.join(', ')}]`
  );
  push(`  writeEligible: ${result.writeEligible}`);
  push(`  mutationsInvoked: ${result.mutationsInvoked}`);
  push('  findings:');
  for (const f of result.findings) {
    push(`    [${f.severity}/${f.code}] ${f.message}`);
  }
  return lines.join('\n');
}

/** Deterministic fixture helpers for tests. */
export function buildBaseFbsFixture(count: number = EXPECTED_BASE_FBS_COUNT): string[] {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(`team-${String(i + 1).padStart(3, '0')}`);
  }
  return ids;
}

export function buildHealthyMembershipSnapshot(
  overrides: Partial<MembershipInitSnapshot> = {}
): MembershipInitSnapshot {
  const baseFbsIds = overrides.baseFbsIds ?? buildBaseFbsFixture();
  const candidateIds =
    overrides.candidateIds ??
    buildCandidateSet(baseFbsIds).candidateIds;
  const scheduleTeamIds = overrides.scheduleTeamIds ?? [...candidateIds];
  const teamIdsPresent = overrides.teamIdsPresent ?? [...candidateIds];
  return {
    baseFbsIds,
    approvedAdditions: [...APPROVED_2026_ADDITIONS],
    candidateIds,
    scheduleTeamIds,
    existingTargetMembership: overrides.existingTargetMembership ?? [],
    teamIdsPresent,
  };
}
