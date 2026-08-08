/**
 * Phase 2C-2G-3 — Guarded population of 2026 TeamMembership.conference.
 *
 * Pure logic: no Prisma, no network.
 * Reuses Phase 2C-2F `buildSeasonConferencePreview` candidate rules.
 * Does not mutate Team.conference, ratings, talent, recruiting, or Odds.
 */

import type { AuditFinding } from './conference-recruiting-diagnostic';
import {
  EXPECTED_FBS_COUNT,
  TARGET_SEASON,
  type SeasonConferenceCandidateRow,
  type SeasonConferencePreviewResult,
} from './season-conference-preview';

export {
  EXPECTED_FBS_COUNT,
  TARGET_SEASON,
} from './season-conference-preview';

export const WRITE_CONFIRM_PHRASE = 'WRITE_2026_CONFERENCES' as const;
export const PROVIDER_BUDGET = 1 as const;
export const PROVIDER_ENDPOINT = '/teams/fbs?year=2026' as const;

export interface MembershipConferenceRow {
  season: number;
  teamId: string;
  level: string;
  conference: string | null;
}

export interface TargetConferenceState {
  fbsCount: number;
  distinctTeamIds: number;
  nullConferenceCount: number;
  populatedConferenceCount: number;
  /** True only when exactly 138 FBS rows and all conference values are NULL. */
  pristineNullTarget: boolean;
}

export interface SeasonConferenceCommitAssessment {
  commitEligible: boolean;
  writeEligible: boolean;
  specialCasesOk: boolean;
  providerBudgetOk: boolean;
  target: TargetConferenceState;
  findings: AuditFinding[];
}

export interface SeasonConferenceWriteVerification {
  ok: boolean;
  verificationExact: boolean;
  rowCount: number;
  nullConferenceCount: number;
  populatedConferenceCount: number;
  missingTeamIds: string[];
  extraTeamIds: string[];
  mismatchedConferences: Array<{
    teamId: string;
    expected: string;
    actual: string | null;
  }>;
  distributionMismatch: boolean;
  ndsuOk: boolean;
  sacramentoStateOk: boolean;
  findings: AuditFinding[];
}

/**
 * Transaction-scoped store — mutation-path ops MUST use this, not outer client.
 */
export interface SeasonConferenceTransactionStore {
  loadFbsMembershipWithConference(
    season: number
  ): Promise<MembershipConferenceRow[]>;
  /**
   * Update one row where season/teamId/level=fbs and conference IS NULL.
   * Returns affected row count.
   */
  updateConferenceIfNull(options: {
    season: number;
    teamId: string;
    conference: string;
  }): Promise<number>;
}

export interface SeasonConferenceWriteDeps {
  transaction<T>(
    fn: (tx: SeasonConferenceTransactionStore) => Promise<T>
  ): Promise<T>;
  /** Fresh post-commit verification only. */
  loadFbsMembershipWithConference(
    season: number
  ): Promise<MembershipConferenceRow[]>;
}

export type ParseInitArgsResult =
  | { ok: true; season: number; mode: 'READ_ONLY' | 'COMMIT'; confirm?: string }
  | { ok: false; errors: string[] };

function sortedUnique(ids: string[]): string[] {
  return [...new Set(ids.map((s) => s.trim()).filter(Boolean))].sort();
}

function countLabels(labels: Array<string | null | undefined>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const label of labels) {
    const key = label && label.trim() !== '' ? label.trim() : '(missing)';
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function distributionsEqual(
  a: Record<string, number>,
  b: Record<string, number>
): boolean {
  const keys = sortedUnique([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if ((a[k] ?? 0) !== (b[k] ?? 0)) return false;
  }
  return true;
}

export function assessTargetConferenceState(
  rows: MembershipConferenceRow[]
): TargetConferenceState {
  const fbs = rows.filter((r) => r.level.toLowerCase() === 'fbs');
  const distinctTeamIds = sortedUnique(fbs.map((r) => r.teamId)).length;
  let nullConferenceCount = 0;
  let populatedConferenceCount = 0;
  for (const r of fbs) {
    if (r.conference === null || String(r.conference).trim() === '') {
      nullConferenceCount += 1;
    } else {
      populatedConferenceCount += 1;
    }
  }
  const pristineNullTarget =
    fbs.length === EXPECTED_FBS_COUNT &&
    distinctTeamIds === EXPECTED_FBS_COUNT &&
    nullConferenceCount === EXPECTED_FBS_COUNT &&
    populatedConferenceCount === 0;

  return {
    fbsCount: fbs.length,
    distinctTeamIds,
    nullConferenceCount,
    populatedConferenceCount,
    pristineNullTarget,
  };
}

export function assertSpecialCaseConferences(
  preview: SeasonConferencePreviewResult
): { ok: boolean; findings: AuditFinding[] } {
  const findings: AuditFinding[] = [];
  if (preview.ndsu.conference !== 'Mountain West') {
    findings.push({
      code: 'ndsu_conference_mismatch',
      severity: 'structural',
      message: `north-dakota-state must be Mountain West (got ${preview.ndsu.conference ?? 'null'})`,
    });
  }
  if (preview.sacramentoState.conference !== 'Mid-American') {
    findings.push({
      code: 'sacramento_state_conference_mismatch',
      severity: 'structural',
      message: `sacramento-state must be Mid-American (got ${preview.sacramentoState.conference ?? 'null'})`,
    });
  }
  return { ok: findings.length === 0, findings };
}

/**
 * COMMIT eligibility: preview writeEligible + pristine NULL target + special cases + budget.
 */
export function assessSeasonConferenceCommit(
  options: {
    preview: SeasonConferencePreviewResult;
    membershipRows: MembershipConferenceRow[];
  }
): SeasonConferenceCommitAssessment {
  const findings: AuditFinding[] = [];
  const target = assessTargetConferenceState(options.membershipRows);
  const special = assertSpecialCaseConferences(options.preview);
  findings.push(...special.findings);

  const providerBudgetOk =
    options.preview.providerRequestCount === PROVIDER_BUDGET;
  if (!providerBudgetOk) {
    findings.push({
      code: 'provider_budget_exceeded',
      severity: 'structural',
      message: `providerRequestCount ${options.preview.providerRequestCount} != ${PROVIDER_BUDGET}`,
    });
  }

  if (!options.preview.writeEligible) {
    findings.push({
      code: 'preview_not_write_eligible',
      severity: 'structural',
      message: 'Candidate preview writeEligible=false — refusing COMMIT',
    });
  }

  if (target.fbsCount !== EXPECTED_FBS_COUNT) {
    findings.push({
      code: 'db_fbs_count_mismatch',
      severity: 'structural',
      message: `DB FBS count ${target.fbsCount} != ${EXPECTED_FBS_COUNT}`,
    });
  }
  if (target.distinctTeamIds !== EXPECTED_FBS_COUNT) {
    findings.push({
      code: 'db_fbs_distinct_mismatch',
      severity: 'structural',
      message: `Distinct FBS team IDs ${target.distinctTeamIds} != ${EXPECTED_FBS_COUNT}`,
    });
  }
  if (!target.pristineNullTarget) {
    findings.push({
      code: 'target_not_pristine_null',
      severity: 'structural',
      message: `COMMIT requires ${EXPECTED_FBS_COUNT} NULL conferences (null=${target.nullConferenceCount}, populated=${target.populatedConferenceCount}) — refusing overwrite/partial repair`,
    });
  }

  const distTotal = Object.values(
    options.preview.normalizedConferenceCounts
  ).reduce((a, b) => a + b, 0);
  if (distTotal !== EXPECTED_FBS_COUNT) {
    findings.push({
      code: 'canonical_distribution_total',
      severity: 'structural',
      message: `Canonical distribution total ${distTotal} != ${EXPECTED_FBS_COUNT}`,
    });
  }

  const commitEligible =
    options.preview.writeEligible &&
    special.ok &&
    providerBudgetOk &&
    target.pristineNullTarget &&
    distTotal === EXPECTED_FBS_COUNT;

  if (commitEligible) {
    findings.push({
      code: 'commit_eligible',
      severity: 'info',
      message:
        'COMMIT eligibility true — still requires explicit --commit + confirmation token',
    });
  }

  return {
    commitEligible,
    writeEligible: options.preview.writeEligible,
    specialCasesOk: special.ok,
    providerBudgetOk,
    target,
    findings,
  };
}

export function verifySeasonConferenceWrite(options: {
  writtenRows: MembershipConferenceRow[];
  candidates: SeasonConferenceCandidateRow[];
  expectedDistribution: Record<string, number>;
}): SeasonConferenceWriteVerification {
  const findings: AuditFinding[] = [];
  const fbs = options.writtenRows.filter(
    (r) => r.level.toLowerCase() === 'fbs'
  );
  const candidateMap = new Map(
    options.candidates.map((c) => [c.teamId, c.conference])
  );
  const writtenIds = sortedUnique(fbs.map((r) => r.teamId));
  const candidateIds = sortedUnique(options.candidates.map((c) => c.teamId));
  const writtenSet = new Set(writtenIds);
  const candidateSet = new Set(candidateIds);

  const missingTeamIds = candidateIds.filter((id) => !writtenSet.has(id));
  const extraTeamIds = writtenIds.filter((id) => !candidateSet.has(id));

  let nullConferenceCount = 0;
  let populatedConferenceCount = 0;
  const mismatchedConferences: SeasonConferenceWriteVerification['mismatchedConferences'] =
    [];

  for (const row of fbs) {
    const expected = candidateMap.get(row.teamId) ?? null;
    const actual =
      row.conference === null || String(row.conference).trim() === ''
        ? null
        : String(row.conference).trim();
    if (actual === null) nullConferenceCount += 1;
    else populatedConferenceCount += 1;
    if (expected === null || actual !== expected) {
      mismatchedConferences.push({
        teamId: row.teamId,
        expected: expected ?? '(missing-candidate)',
        actual,
      });
    }
  }

  const actualDist = countLabels(fbs.map((r) => r.conference));
  // Drop '(missing)' key comparison if none
  const distributionMismatch = !distributionsEqual(
    options.expectedDistribution,
    Object.fromEntries(
      Object.entries(actualDist).filter(([k]) => k !== '(missing)')
    )
  );

  const ndsu = fbs.find((r) => r.teamId === 'north-dakota-state');
  const sac = fbs.find((r) => r.teamId === 'sacramento-state');
  const ndsuOk = ndsu?.conference === 'Mountain West';
  const sacramentoStateOk = sac?.conference === 'Mid-American';

  if (fbs.length !== EXPECTED_FBS_COUNT) {
    findings.push({
      code: 'post_write_row_count',
      severity: 'structural',
      message: `Post-write FBS count ${fbs.length} != ${EXPECTED_FBS_COUNT}`,
    });
  }
  if (nullConferenceCount !== 0) {
    findings.push({
      code: 'post_write_null_remaining',
      severity: 'structural',
      message: `Post-write NULL conferences remaining: ${nullConferenceCount}`,
    });
  }
  if (populatedConferenceCount !== EXPECTED_FBS_COUNT) {
    findings.push({
      code: 'post_write_populated_count',
      severity: 'structural',
      message: `Post-write populated ${populatedConferenceCount} != ${EXPECTED_FBS_COUNT}`,
    });
  }
  if (missingTeamIds.length > 0) {
    findings.push({
      code: 'post_write_missing_ids',
      severity: 'structural',
      message: `Missing team IDs: ${missingTeamIds.join(', ')}`,
    });
  }
  if (extraTeamIds.length > 0) {
    findings.push({
      code: 'post_write_extra_ids',
      severity: 'structural',
      message: `Extra team IDs: ${extraTeamIds.join(', ')}`,
    });
  }
  if (mismatchedConferences.length > 0) {
    findings.push({
      code: 'post_write_conference_mismatch',
      severity: 'structural',
      message: `${mismatchedConferences.length} team(s) mismatch candidate map`,
    });
  }
  if (distributionMismatch) {
    findings.push({
      code: 'post_write_distribution_mismatch',
      severity: 'structural',
      message: 'Post-write canonical distribution does not match candidate',
    });
  }
  if (!ndsuOk) {
    findings.push({
      code: 'post_write_ndsu',
      severity: 'structural',
      message: `NDSU conference ${ndsu?.conference ?? 'null'} != Mountain West`,
    });
  }
  if (!sacramentoStateOk) {
    findings.push({
      code: 'post_write_sac',
      severity: 'structural',
      message: `Sacramento State conference ${sac?.conference ?? 'null'} != Mid-American`,
    });
  }

  const verificationExact =
    findings.length === 0 &&
    fbs.length === EXPECTED_FBS_COUNT &&
    nullConferenceCount === 0 &&
    populatedConferenceCount === EXPECTED_FBS_COUNT &&
    mismatchedConferences.length === 0 &&
    !distributionMismatch &&
    ndsuOk &&
    sacramentoStateOk;

  return {
    ok: verificationExact,
    verificationExact,
    rowCount: fbs.length,
    nullConferenceCount,
    populatedConferenceCount,
    missingTeamIds,
    extraTeamIds,
    mismatchedConferences,
    distributionMismatch,
    ndsuOk,
    sacramentoStateOk,
    findings,
  };
}

/**
 * Guarded atomic write of 138 season conferences.
 * Throws inside the transaction callback to roll back on any mismatch.
 */
export async function writeSeasonConferences(options: {
  preview: SeasonConferencePreviewResult;
  membershipRows: MembershipConferenceRow[];
  deps: SeasonConferenceWriteDeps;
}): Promise<{
  assessment: SeasonConferenceCommitAssessment;
  rowsUpdated: number;
  writeCommitted: boolean;
  verification: SeasonConferenceWriteVerification | null;
  mutationsInvoked: boolean;
  ok: boolean;
}> {
  const assessment = assessSeasonConferenceCommit({
    preview: options.preview,
    membershipRows: options.membershipRows,
  });

  if (!assessment.commitEligible) {
    return {
      assessment,
      rowsUpdated: 0,
      writeCommitted: false,
      verification: null,
      mutationsInvoked: false,
      ok: false,
    };
  }

  if (typeof options.deps.transaction !== 'function') {
    throw new Error(
      'transaction support unavailable — refusing nontransactional write'
    );
  }

  const candidates = options.preview.candidates;
  if (candidates.length !== EXPECTED_FBS_COUNT) {
    throw new Error(
      `candidate count ${candidates.length} != ${EXPECTED_FBS_COUNT}`
    );
  }

  const rowsUpdated = await options.deps.transaction(async (tx) => {
    const inside = await tx.loadFbsMembershipWithConference(TARGET_SEASON);
    const insideState = assessTargetConferenceState(inside);
    if (!insideState.pristineNullTarget) {
      throw new Error(
        `In-transaction target no longer pristine NULL (fbs=${insideState.fbsCount}, null=${insideState.nullConferenceCount}, populated=${insideState.populatedConferenceCount})`
      );
    }

    let updated = 0;
    for (const c of candidates) {
      const count = await tx.updateConferenceIfNull({
        season: TARGET_SEASON,
        teamId: c.teamId,
        conference: c.conference,
      });
      if (count !== 1) {
        throw new Error(
          `Conference update affected ${count} rows for ${c.teamId} (expected 1) — rolling back`
        );
      }
      updated += 1;
    }
    if (updated !== EXPECTED_FBS_COUNT) {
      throw new Error(
        `Updated ${updated} != ${EXPECTED_FBS_COUNT} — rolling back`
      );
    }

    const after = await tx.loadFbsMembershipWithConference(TARGET_SEASON);
    const verification = verifySeasonConferenceWrite({
      writtenRows: after,
      candidates,
      expectedDistribution: options.preview.normalizedConferenceCounts,
    });
    if (!verification.ok) {
      throw new Error(
        `In-transaction post-write verification failed: ${verification.findings
          .map((f) => f.code)
          .join(', ')}`
      );
    }
    return updated;
  });

  const written = await options.deps.loadFbsMembershipWithConference(
    TARGET_SEASON
  );
  const verification = verifySeasonConferenceWrite({
    writtenRows: written,
    candidates,
    expectedDistribution: options.preview.normalizedConferenceCounts,
  });

  return {
    assessment,
    rowsUpdated,
    writeCommitted: verification.ok,
    verification,
    mutationsInvoked: true,
    ok: verification.ok,
  };
}

export function parseSeasonConferenceInitArgs(
  argv: string[]
): ParseInitArgsResult {
  const errors: string[] = [];
  let season: number | undefined;
  let seasonSeen = false;
  let commit = false;
  let confirm: string | undefined;
  let confirmSeen = false;

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
    if (arg === '--commit') {
      commit = true;
      continue;
    }
    if (arg === '--confirm') {
      if (confirmSeen) {
        errors.push('--confirm may be provided exactly once');
        i += 1;
        continue;
      }
      confirmSeen = true;
      const raw = argv[++i];
      if (raw === undefined || raw === '') {
        errors.push('--confirm requires a value');
        continue;
      }
      confirm = raw;
      continue;
    }
    if (arg === '--preview') {
      // Allowed alias for READ_ONLY clarity
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

  if (commit) {
    if (confirm !== WRITE_CONFIRM_PHRASE) {
      errors.push(
        `--commit requires --confirm ${WRITE_CONFIRM_PHRASE} (got ${confirm ?? '(missing)'})`
      );
    }
  } else if (confirmSeen) {
    errors.push('--confirm is only valid with --commit');
  }

  if (errors.length > 0) return { ok: false, errors };
  return commit
    ? { ok: true, season: TARGET_SEASON, mode: 'COMMIT', confirm }
    : { ok: true, season: TARGET_SEASON, mode: 'READ_ONLY' };
}

export function sanitizeSeasonConferenceInitError(_err?: unknown): string {
  return 'Season conference initializer failed; connection and secret details suppressed';
}

export function formatSeasonConferenceInitReport(options: {
  mode: 'READ_ONLY' | 'COMMIT';
  preview: SeasonConferencePreviewResult;
  assessment: SeasonConferenceCommitAssessment;
  writeCommitted?: boolean;
  rowsUpdated?: number;
  verification?: SeasonConferenceWriteVerification | null;
  mutationsInvoked: boolean;
}): string {
  const { preview, assessment } = options;
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);
  push('============================================');
  push('2026 SEASON CONFERENCE INITIALIZER');
  push('============================================');
  push(`  mode=${options.mode}`);
  push(`  targetSeason=${preview.targetSeason}`);
  push(`  table=team_membership`);
  push(`  column=conference`);
  push(`  expectedRows=${EXPECTED_FBS_COUNT}`);
  push(`  staticTeamConferenceMutation=false`);
  push(`  ratingsCompute=false`);
  push(`  talentWrite=false`);
  push(`  recruitingWrite=false`);
  push(`  Odds=false`);
  push(`  provider=${PROVIDER_ENDPOINT}`);
  push(`  providerBudget=${PROVIDER_BUDGET}`);
  push(`  providerRequestCount=${preview.providerRequestCount}`);
  push(`  writeEligible=${preview.writeEligible}`);
  push(`  commitEligible=${assessment.commitEligible}`);
  push(
    `  targetNull=${assessment.target.nullConferenceCount} populated=${assessment.target.populatedConferenceCount}`
  );
  push(`  mutationsInvoked=${options.mutationsInvoked}`);
  push(`  writeCommitted=${options.writeCommitted ?? false}`);
  push(`  rowsUpdated=${options.rowsUpdated ?? 0}`);
  if (options.verification) {
    push(`  verificationExact=${options.verification.verificationExact}`);
    push(
      `  conferenceNullCount=${options.verification.nullConferenceCount}`
    );
    push(
      `  conferencePopulatedCount=${options.verification.populatedConferenceCount}`
    );
  }
  push(
    `  NDSU=${preview.ndsu.conference} SacState=${preview.sacramentoState.conference}`
  );
  push('  normalizedConferenceCounts:');
  for (const k of Object.keys(preview.normalizedConferenceCounts).sort()) {
    push(`    ${k}: ${preview.normalizedConferenceCounts[k]}`);
  }
  push('  findings:');
  for (const f of [...preview.findings, ...assessment.findings]) {
    push(`    [${f.severity}/${f.code}] ${f.message}`);
  }
  if (options.verification) {
    for (const f of options.verification.findings) {
      push(`    [verify/${f.severity}/${f.code}] ${f.message}`);
    }
  }
  push('============================================');
  return lines.join('\n');
}
