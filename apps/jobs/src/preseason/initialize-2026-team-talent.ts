/**
 * Phase 2C-2H-2 — Guarded one-time 2026 TeamSeasonTalent initializer (pure logic).
 *
 * Reuses 2C-2H-1 talent normalization (school/year/talent). No Prisma/network.
 * Writes talentComposite only; blueChipsPct/sourceUpdatedAt null; star fields
 * remain unsourced schema defaults (0). Never authorizes ratings.
 */

import {
  EXPECTED_FBS_COUNT,
  TARGET_SEASON,
  previewTalentInputs,
  type RawTalentRow,
  type ResolveTeamId,
  type TalentPreviewSummary,
} from './ratings-input-provider-preview';
import { classifyTalentStructuralCompleteness } from './talent-availability-probe';

export { EXPECTED_FBS_COUNT, TARGET_SEASON };

export const WRITE_CONFIRM_PHRASE = 'WRITE_2026_TALENT' as const;
export const PROVIDER_BUDGET = 1 as const;
export const PROVIDER_ENDPOINT = '/talent?year=2026' as const;
export const TALENT_COMPOSITE_EPS = 1e-6;

export const LEGACY_STAR_FIELDS_SOURCE = 'UNSOURCED_SCHEMA_DEFAULTS' as const;
export const LEGACY_STAR_FIELDS_EXPECTED_VALUE = 0 as const;
export const BLUE_CHIPS_PCT_SOURCE = 'NOT_AVAILABLE_FROM_/talent' as const;
export const SOURCE_UPDATED_AT_SOURCE = 'NOT_AVAILABLE' as const;

export type InitMode = 'PREVIEW' | 'COMMIT';

export interface TalentCandidateRow {
  season: number;
  teamId: string;
  talentComposite: number;
  blueChipsPct: null;
  sourceUpdatedAt: null;
}

export interface ExistingTalentRow {
  season: number;
  teamId: string;
  talentComposite: number;
  blueChipsPct: number | null;
  sourceUpdatedAt: Date | string | null;
  fiveStar: number;
  fourStar: number;
  threeStar: number;
  unrated: number;
}

export interface TargetTalentState {
  targetExistingRows: number;
  targetExistingDistinctTeamIds: number;
  targetExistingFbsRows: number;
  targetExistingNonFbsRows: number;
  pristineEmptyTarget: boolean;
}

export interface TalentInitAssessment {
  structurallyComplete: boolean;
  writeEligible: boolean;
  commitEligible: boolean;
  candidateSetExact: boolean;
  providerBudgetOk: boolean;
  target: TargetTalentState;
  findings: string[];
  candidates: TalentCandidateRow[];
  talent: TalentPreviewSummary;
  talentMin: number | null;
  talentAvg: number | null;
  talentMax: number | null;
  top5: Array<{ teamId: string; talentComposite: number }>;
  bottom5: Array<{ teamId: string; talentComposite: number }>;
}

export interface TalentWriteVerification {
  ok: boolean;
  verificationExact: boolean;
  rowsInserted: number;
  storedRowCount: number;
  storedDistinctTeamIds: number;
  storedTeamSetExact: boolean;
  storedTalentCompositeFinite: number;
  storedTalentCompositeMatchesCandidate: number;
  blueChipsPctNullCount: number;
  sourceUpdatedAtNullCount: number;
  fiveStarZeroCount: number;
  fourStarZeroCount: number;
  threeStarZeroCount: number;
  unratedZeroCount: number;
  findings: string[];
}

export interface TalentInitTransactionStore {
  loadFbsTeamIds(season: number): Promise<string[]>;
  loadExistingTalent(season: number): Promise<ExistingTalentRow[]>;
  /** Insert exactly one row; must not upsert. Returns 1 on success. */
  insertTalentRow(row: TalentCandidateRow): Promise<number>;
}

export interface TalentInitWriteDeps {
  transaction<T>(
    fn: (tx: TalentInitTransactionStore) => Promise<T>
  ): Promise<T>;
  loadExistingTalent(season: number): Promise<ExistingTalentRow[]>;
  loadFbsTeamIds(season: number): Promise<string[]>;
}

export type ParseTalentInitArgsResult =
  | { ok: true; season: number; mode: InitMode; confirm?: string }
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

function sortedUnique(ids: string[]): string[] {
  return [...new Set(ids.map((s) => s.trim()).filter(Boolean))].sort();
}

function setsEqual(a: string[], b: string[]): boolean {
  const aa = sortedUnique(a);
  const bb = sortedUnique(b);
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) {
    if (aa[i] !== bb[i]) return false;
  }
  return true;
}

export function talentCompositesEqual(
  a: number,
  b: number,
  eps = TALENT_COMPOSITE_EPS
): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= eps;
}

export function assessTargetTalentState(
  existing: ExistingTalentRow[],
  fbsIds: string[]
): TargetTalentState {
  const fbsSet = new Set(fbsIds);
  const distinct = sortedUnique(existing.map((r) => r.teamId));
  let fbsRows = 0;
  let nonFbsRows = 0;
  for (const r of existing) {
    if (fbsSet.has(r.teamId)) fbsRows += 1;
    else nonFbsRows += 1;
  }
  return {
    targetExistingRows: existing.length,
    targetExistingDistinctTeamIds: distinct.length,
    targetExistingFbsRows: fbsRows,
    targetExistingNonFbsRows: nonFbsRows,
    pristineEmptyTarget: existing.length === 0,
  };
}

export function buildTalentCandidates(options: {
  fbsIds: string[];
  talent: TalentPreviewSummary;
}): {
  candidates: TalentCandidateRow[];
  candidateSetExact: boolean;
  findings: string[];
} {
  const findings: string[] = [];
  const fbsIds = sortedUnique(options.fbsIds);
  const fbsSet = new Set(fbsIds);
  const byTeam = new Map<string, number>();

  for (const row of options.talent.wouldBeRows) {
    if (!fbsSet.has(row.teamId)) continue;
    if (
      row.talentComposite === null ||
      !Number.isFinite(row.talentComposite)
    ) {
      continue;
    }
    if (byTeam.has(row.teamId)) {
      findings.push(`Duplicate candidate mapping for ${row.teamId}`);
      continue;
    }
    byTeam.set(row.teamId, row.talentComposite);
  }

  const candidates: TalentCandidateRow[] = [...byTeam.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([teamId, talentComposite]) => ({
      season: TARGET_SEASON,
      teamId,
      talentComposite,
      blueChipsPct: null,
      sourceUpdatedAt: null,
    }));

  const candidateSetExact =
    candidates.length === EXPECTED_FBS_COUNT &&
    setsEqual(
      candidates.map((c) => c.teamId),
      fbsIds
    );

  if (!candidateSetExact) {
    findings.push(
      `Candidate team set mismatch: unique=${candidates.length} expected=${EXPECTED_FBS_COUNT}`
    );
  }

  return { candidates, candidateSetExact, findings };
}

/**
 * Assess structural completeness + write eligibility (preview classification).
 * writeEligible requires pristine empty target + full structural gates.
 * commitEligible is only meaningful when mode=COMMIT and confirmation is valid
 * (caller gates confirmation separately).
 */
export function assessTalentInitialization(options: {
  fbsIds: string[];
  talentRaw: RawTalentRow[];
  resolveTeamId: ResolveTeamId;
  existingTalent: ExistingTalentRow[];
  providerRequestCount: number;
  commitRequested: boolean;
  confirmationValid: boolean;
}): TalentInitAssessment {
  const fbsIds = sortedUnique(options.fbsIds);
  const findings: string[] = [];

  const talent = previewTalentInputs({
    fbsIds,
    rawRows: options.talentRaw,
    resolveTeamId: options.resolveTeamId,
    requestedSeason: TARGET_SEASON,
  });

  const base = classifyTalentStructuralCompleteness({
    dbFbsCount: fbsIds.length,
    matchedFbsCount: talent.matchedFbsCount,
    missingFbsCount: talent.missingFbsIds.length,
    unresolvedRelevantCount: talent.unresolvedProviderNames.length,
    duplicateTeamIds: talent.duplicateTeamIds.length,
    seasonMismatch: talent.seasonMismatch,
    talentCompositeFinite: talent.talentCompositeFiniteCount,
  });
  findings.push(...base.findings);

  const providerBudgetOk = options.providerRequestCount === PROVIDER_BUDGET;
  if (!providerBudgetOk) {
    findings.push(
      `providerRequestCount ${options.providerRequestCount} != ${PROVIDER_BUDGET}`
    );
  }

  if (talent.rawRowCount !== EXPECTED_FBS_COUNT) {
    findings.push(
      `rawTalentRows ${talent.rawRowCount} != ${EXPECTED_FBS_COUNT}`
    );
  }
  if (talent.normalizedTeamCount !== EXPECTED_FBS_COUNT) {
    findings.push(
      `normalizedTeamCount ${talent.normalizedTeamCount} != ${EXPECTED_FBS_COUNT}`
    );
  }
  if (talent.unexpectedNonFbsIds.length !== 0) {
    findings.push(
      `unexpectedNonFbsCount ${talent.unexpectedNonFbsIds.length} != 0`
    );
  }
  const seasonValuesOk =
    talent.providerSeasonValues.length === 1 &&
    talent.providerSeasonValues[0] === TARGET_SEASON;
  if (!seasonValuesOk) {
    findings.push(
      `providerSeasonValues=[${talent.providerSeasonValues.join(', ')}] requires [${TARGET_SEASON}]`
    );
  }

  const { candidates, candidateSetExact, findings: candFindings } =
    buildTalentCandidates({ fbsIds, talent });
  findings.push(...candFindings);

  const structurallyComplete =
    base.structurallyComplete &&
    providerBudgetOk &&
    talent.rawRowCount === EXPECTED_FBS_COUNT &&
    talent.normalizedTeamCount === EXPECTED_FBS_COUNT &&
    talent.unexpectedNonFbsIds.length === 0 &&
    seasonValuesOk &&
    candidateSetExact &&
    candidates.length === EXPECTED_FBS_COUNT;

  const target = assessTargetTalentState(options.existingTalent, fbsIds);
  if (!target.pristineEmptyTarget) {
    findings.push(
      `Target team_season_talent season=${TARGET_SEASON} is not empty (rows=${target.targetExistingRows}); one-time initializer refuses overwrite/update/partial fill`
    );
  }

  const writeEligible =
    structurallyComplete && target.pristineEmptyTarget;

  const commitEligible =
    writeEligible &&
    options.commitRequested &&
    options.confirmationValid;

  const sortedByTalent = [...candidates].sort(
    (a, b) => b.talentComposite - a.talentComposite
  );
  const top5 = sortedByTalent.slice(0, 5).map((c) => ({
    teamId: c.teamId,
    talentComposite: c.talentComposite,
  }));
  const bottom5 = [...sortedByTalent]
    .reverse()
    .slice(0, 5)
    .map((c) => ({
      teamId: c.teamId,
      talentComposite: c.talentComposite,
    }));

  return {
    structurallyComplete,
    writeEligible,
    commitEligible,
    candidateSetExact,
    providerBudgetOk,
    target,
    findings: [...new Set(findings)],
    candidates,
    talent,
    talentMin: talent.talentMin,
    talentAvg: talent.talentAvg,
    talentMax: talent.talentMax,
    top5,
    bottom5,
  };
}

export function verifyStoredTalentRows(options: {
  stored: ExistingTalentRow[];
  candidates: TalentCandidateRow[];
  rowsInserted: number;
  fbsIds: string[];
}): TalentWriteVerification {
  const findings: string[] = [];
  const candidateMap = new Map(
    options.candidates.map((c) => [c.teamId, c.talentComposite])
  );
  const fbsIds = sortedUnique(options.fbsIds);
  const storedIds = sortedUnique(options.stored.map((r) => r.teamId));
  const storedTeamSetExact = setsEqual(storedIds, fbsIds);

  let storedTalentCompositeFinite = 0;
  let storedTalentCompositeMatchesCandidate = 0;
  let blueChipsPctNullCount = 0;
  let sourceUpdatedAtNullCount = 0;
  let fiveStarZeroCount = 0;
  let fourStarZeroCount = 0;
  let threeStarZeroCount = 0;
  let unratedZeroCount = 0;

  for (const row of options.stored) {
    if (Number.isFinite(row.talentComposite)) {
      storedTalentCompositeFinite += 1;
      const expected = candidateMap.get(row.teamId);
      if (
        expected !== undefined &&
        talentCompositesEqual(row.talentComposite, expected)
      ) {
        storedTalentCompositeMatchesCandidate += 1;
      }
    }
    if (row.blueChipsPct === null || row.blueChipsPct === undefined) {
      blueChipsPctNullCount += 1;
    }
    if (row.sourceUpdatedAt === null || row.sourceUpdatedAt === undefined) {
      sourceUpdatedAtNullCount += 1;
    }
    if (row.fiveStar === 0) fiveStarZeroCount += 1;
    if (row.fourStar === 0) fourStarZeroCount += 1;
    if (row.threeStar === 0) threeStarZeroCount += 1;
    if (row.unrated === 0) unratedZeroCount += 1;
  }

  const checks: Array<[boolean, string]> = [
    [
      options.rowsInserted === EXPECTED_FBS_COUNT,
      `rowsInserted ${options.rowsInserted} != ${EXPECTED_FBS_COUNT}`,
    ],
    [
      options.stored.length === EXPECTED_FBS_COUNT,
      `storedRowCount ${options.stored.length} != ${EXPECTED_FBS_COUNT}`,
    ],
    [
      storedIds.length === EXPECTED_FBS_COUNT,
      `storedDistinctTeamIds ${storedIds.length} != ${EXPECTED_FBS_COUNT}`,
    ],
    [storedTeamSetExact, 'storedTeamSetExact=false'],
    [
      storedTalentCompositeFinite === EXPECTED_FBS_COUNT,
      `storedTalentCompositeFinite ${storedTalentCompositeFinite} != ${EXPECTED_FBS_COUNT}`,
    ],
    [
      storedTalentCompositeMatchesCandidate === EXPECTED_FBS_COUNT,
      `storedTalentCompositeMatchesCandidate ${storedTalentCompositeMatchesCandidate}/${EXPECTED_FBS_COUNT}`,
    ],
    [
      blueChipsPctNullCount === EXPECTED_FBS_COUNT,
      `blueChipsPctNullCount ${blueChipsPctNullCount} != ${EXPECTED_FBS_COUNT}`,
    ],
    [
      sourceUpdatedAtNullCount === EXPECTED_FBS_COUNT,
      `sourceUpdatedAtNullCount ${sourceUpdatedAtNullCount} != ${EXPECTED_FBS_COUNT}`,
    ],
    [
      fiveStarZeroCount === EXPECTED_FBS_COUNT,
      `fiveStarZeroCount ${fiveStarZeroCount} != ${EXPECTED_FBS_COUNT}`,
    ],
    [
      fourStarZeroCount === EXPECTED_FBS_COUNT,
      `fourStarZeroCount ${fourStarZeroCount} != ${EXPECTED_FBS_COUNT}`,
    ],
    [
      threeStarZeroCount === EXPECTED_FBS_COUNT,
      `threeStarZeroCount ${threeStarZeroCount} != ${EXPECTED_FBS_COUNT}`,
    ],
    [
      unratedZeroCount === EXPECTED_FBS_COUNT,
      `unratedZeroCount ${unratedZeroCount} != ${EXPECTED_FBS_COUNT}`,
    ],
  ];

  for (const [ok, msg] of checks) {
    if (!ok) findings.push(msg);
  }

  const verificationExact = findings.length === 0;
  return {
    ok: verificationExact,
    verificationExact,
    rowsInserted: options.rowsInserted,
    storedRowCount: options.stored.length,
    storedDistinctTeamIds: storedIds.length,
    storedTeamSetExact,
    storedTalentCompositeFinite,
    storedTalentCompositeMatchesCandidate,
    blueChipsPctNullCount,
    sourceUpdatedAtNullCount,
    fiveStarZeroCount,
    fourStarZeroCount,
    threeStarZeroCount,
    unratedZeroCount,
    findings,
  };
}

/**
 * Fail-closed candidate integrity: season/composite/null policies + exact set.
 * Safe to call before any transaction/mutation. Throws a fixed whitelist message.
 */
export function assertTalentCandidatesIntegrity(options: {
  candidates: TalentCandidateRow[];
  expectedFbsIds: string[];
}): void {
  const expectedFbsIds = sortedUnique(options.expectedFbsIds);
  const candidates = options.candidates;

  if (candidates.length !== EXPECTED_FBS_COUNT) {
    throw new Error(
      `COMMIT refused: candidateRows ${candidates.length} != ${EXPECTED_FBS_COUNT}`
    );
  }
  if (expectedFbsIds.length !== EXPECTED_FBS_COUNT) {
    throw new Error(
      `COMMIT refused: expectedFbsIds ${expectedFbsIds.length} != ${EXPECTED_FBS_COUNT}`
    );
  }

  const teamIds = candidates.map((c) => c.teamId);
  const uniqueTeamIds = sortedUnique(teamIds);
  if (uniqueTeamIds.length !== EXPECTED_FBS_COUNT) {
    throw new Error(
      `COMMIT refused: unique candidate team IDs ${uniqueTeamIds.length} != ${EXPECTED_FBS_COUNT}`
    );
  }
  if (!setsEqual(uniqueTeamIds, expectedFbsIds)) {
    throw new Error(
      'COMMIT refused: candidate team set must exactly equal authoritative FBS membership IDs'
    );
  }

  for (const c of candidates) {
    if (c.season !== TARGET_SEASON) {
      throw new Error(
        `COMMIT refused: candidate season must be ${TARGET_SEASON}`
      );
    }
    if (!Number.isFinite(c.talentComposite)) {
      throw new Error(
        'COMMIT refused: candidate talentComposite must be finite'
      );
    }
    if (c.blueChipsPct !== null) {
      throw new Error(
        'COMMIT refused: candidate blueChipsPct must be null'
      );
    }
    if (c.sourceUpdatedAt !== null) {
      throw new Error(
        'COMMIT refused: candidate sourceUpdatedAt must be null'
      );
    }
  }
}

/**
 * Atomic COMMIT write. Fail-closed: any mismatch throws and rolls back.
 */
export async function writeTeamTalent(
  options: {
    candidates: TalentCandidateRow[];
    expectedFbsIds: string[];
    deps: TalentInitWriteDeps;
  }
): Promise<{
  rowsInserted: number;
  verification: TalentWriteVerification;
  postCommit: TalentWriteVerification;
}> {
  const expectedFbsIds = sortedUnique(options.expectedFbsIds);

  // Pre-mutation integrity: reject bad candidates before any mutation API.
  assertTalentCandidatesIntegrity({
    candidates: options.candidates,
    expectedFbsIds,
  });

  const verification = await options.deps.transaction(async (tx) => {
    const membership = await tx.loadFbsTeamIds(TARGET_SEASON);
    const membershipIds = sortedUnique(membership);
    if (
      membershipIds.length !== EXPECTED_FBS_COUNT ||
      !setsEqual(membershipIds, expectedFbsIds)
    ) {
      throw new Error(
        `In-transaction membership mismatch: count=${membershipIds.length}`
      );
    }

    const existing = await tx.loadExistingTalent(TARGET_SEASON);
    if (existing.length !== 0) {
      throw new Error(
        `In-transaction target not empty: rows=${existing.length}`
      );
    }

    if (
      !setsEqual(
        options.candidates.map((c) => c.teamId),
        membershipIds
      )
    ) {
      throw new Error(
        'In-transaction candidate set does not equal membership set'
      );
    }

    // Re-check immediately before the first insert.
    assertTalentCandidatesIntegrity({
      candidates: options.candidates,
      expectedFbsIds: membershipIds,
    });

    let rowsInserted = 0;
    for (const row of options.candidates) {
      const n = await tx.insertTalentRow(row);
      if (n !== 1) {
        throw new Error(
          `Insert affected ${n} rows for ${row.teamId} (expected 1)`
        );
      }
      rowsInserted += 1;
    }
    if (rowsInserted !== EXPECTED_FBS_COUNT) {
      throw new Error(
        `rowsInserted ${rowsInserted} != ${EXPECTED_FBS_COUNT}`
      );
    }

    const stored = await tx.loadExistingTalent(TARGET_SEASON);
    const v = verifyStoredTalentRows({
      stored,
      candidates: options.candidates,
      rowsInserted,
      fbsIds: membershipIds,
    });
    if (!v.verificationExact) {
      throw new Error(
        `In-transaction verification failed: ${v.findings.join('; ')}`
      );
    }
    return { rowsInserted, verification: v };
  });

  const postStored = await options.deps.loadExistingTalent(TARGET_SEASON);
  const postFbs = await options.deps.loadFbsTeamIds(TARGET_SEASON);
  const postCommit = verifyStoredTalentRows({
    stored: postStored,
    candidates: options.candidates,
    rowsInserted: verification.rowsInserted,
    fbsIds: postFbs,
  });
  if (!postCommit.verificationExact) {
    throw new Error(
      `Post-commit verification failed: ${postCommit.findings.join('; ')}`
    );
  }

  return {
    rowsInserted: verification.rowsInserted,
    verification: verification.verification,
    postCommit,
  };
}

export function parseTalentInitArgs(
  argv: string[]
): ParseTalentInitArgsResult {
  const errors: string[] = [];
  let season: number | null = null;
  let mode: InitMode | null = null;
  let confirm: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (WRITE_FLAGS.has(a)) {
      errors.push(`Write flag rejected: ${a}`);
      continue;
    }
    if (a === '--season') {
      if (season !== null) {
        errors.push('--season specified more than once');
        continue;
      }
      const raw = argv[++i];
      const n = Number(raw);
      if (!Number.isInteger(n)) {
        errors.push(`--season requires integer (got ${raw})`);
      } else {
        season = n;
      }
      continue;
    }
    if (a === '--mode') {
      if (mode !== null) {
        errors.push('--mode specified more than once');
        continue;
      }
      const raw = argv[++i];
      if (raw === 'PREVIEW' || raw === 'COMMIT') {
        mode = raw;
      } else {
        errors.push(`--mode must be PREVIEW or COMMIT (got ${raw})`);
      }
      continue;
    }
    if (a === '--confirm') {
      if (confirm !== undefined) {
        errors.push('--confirm specified more than once');
        continue;
      }
      confirm = argv[++i];
      continue;
    }
    // Compatibility aliases used by conference initializer style
    if (a === '--commit') {
      if (mode !== null && mode !== 'COMMIT') {
        errors.push('--commit conflicts with --mode');
      } else {
        mode = 'COMMIT';
      }
      continue;
    }
    if (a === '--preview') {
      if (mode !== null && mode !== 'PREVIEW') {
        errors.push('--preview conflicts with --mode');
      } else {
        mode = 'PREVIEW';
      }
      continue;
    }
    errors.push(`Unknown argument: ${a}`);
  }

  if (season === null) errors.push('--season is required');
  else if (season !== TARGET_SEASON) {
    errors.push(`--season must be ${TARGET_SEASON} (got ${season})`);
  }
  if (mode === null) errors.push('--mode is required (PREVIEW or COMMIT)');
  if (mode === 'COMMIT') {
    if (confirm !== WRITE_CONFIRM_PHRASE) {
      errors.push(
        `COMMIT requires --confirm ${WRITE_CONFIRM_PHRASE} (got ${confirm ?? '(missing)'})`
      );
    }
  } else if (confirm !== undefined && confirm !== '') {
    errors.push('--confirm is only valid with --mode COMMIT');
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    season: TARGET_SEASON,
    mode: mode!,
    confirm,
  };
}

export function sanitizeTalentInitError(_err?: unknown): string {
  return '2026 team talent initializer failed; connection and secret details suppressed';
}

export function formatTalentInitReport(options: {
  mode: InitMode;
  dbFbsCount: number;
  assessment: TalentInitAssessment;
  providerRequestCount: number;
  endpoint: string;
  confirmationValid?: boolean;
  mutationsInvoked: boolean;
  rowsInserted?: number;
  writeCommitted?: boolean;
  transactionVerificationExact?: boolean;
  postCommit?: TalentWriteVerification;
}): string {
  const a = options.assessment;
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);
  push('============================================');
  push('2026 TEAM TALENT INITIALIZER');
  push('============================================');
  push(`mode=${options.mode}`);
  push(`targetSeason=${TARGET_SEASON}`);
  push(`dbFbsCount=${options.dbFbsCount}`);
  push(`providerRequestCount=${options.providerRequestCount}`);
  push(`endpoint=${options.endpoint}`);
  push(`rawTalentRows=${a.talent.rawRowCount}`);
  push(`normalizedTeamCount=${a.talent.normalizedTeamCount}`);
  push(`matchedFbsCount=${a.talent.matchedFbsCount}`);
  push(`missingFbsCount=${a.talent.missingFbsIds.length}`);
  push(`unresolvedCount=${a.talent.unresolvedProviderNames.length}`);
  push(`duplicateTeamIds=${a.talent.duplicateTeamIds.length}`);
  push(`unexpectedNonFbsCount=${a.talent.unexpectedNonFbsIds.length}`);
  push(
    `providerSeasonValues=[${a.talent.providerSeasonValues.join(', ')}]`
  );
  push(`seasonMismatch=${a.talent.seasonMismatch}`);
  push(`talentCompositeFinite=${a.talent.talentCompositeFiniteCount}`);
  push(`talentMin=${a.talentMin}`);
  push(`talentAvg=${a.talentAvg}`);
  push(`talentMax=${a.talentMax}`);
  push(`targetExistingRows=${a.target.targetExistingRows}`);
  push(
    `targetExistingDistinctTeamIds=${a.target.targetExistingDistinctTeamIds}`
  );
  push(`targetExistingFbsRows=${a.target.targetExistingFbsRows}`);
  push(`targetExistingNonFbsRows=${a.target.targetExistingNonFbsRows}`);
  push(`candidateRows=${a.candidates.length}`);
  push(`candidateUniqueTeams=${a.candidates.length}`);
  push(`candidateSetExact=${a.candidateSetExact}`);
  push(`blueChipsPctPolicy=NULL`);
  push(`blueChipsPctSource=${BLUE_CHIPS_PCT_SOURCE}`);
  push(`blueChipsPctExpected=NULL`);
  push(`sourceUpdatedAtPolicy=NULL`);
  push(`sourceUpdatedAtSource=${SOURCE_UPDATED_AT_SOURCE}`);
  push(`sourceUpdatedAtExpected=NULL`);
  push(`legacyStarFieldsSource=${LEGACY_STAR_FIELDS_SOURCE}`);
  push(
    `legacyStarFieldsExpectedValue=${LEGACY_STAR_FIELDS_EXPECTED_VALUE}`
  );
  push(
    'legacyStarFieldsNote=schema defaults only; not CFBD observations; do not infer zero star counts from provider'
  );
  push(`structurallyComplete=${a.structurallyComplete}`);
  push(`writeEligible=${a.writeEligible}`);
  push(`commitRequested=${options.mode === 'COMMIT'}`);
  push(
    `confirmationValid=${options.confirmationValid ?? options.mode !== 'COMMIT'}`
  );
  push(`commitEligible=${a.commitEligible}`);
  push(`mutationsInvoked=${options.mutationsInvoked}`);
  if (options.rowsInserted !== undefined) {
    push(`rowsInserted=${options.rowsInserted}`);
  }
  if (options.transactionVerificationExact !== undefined) {
    push(
      `transactionVerificationExact=${options.transactionVerificationExact}`
    );
  }
  if (options.writeCommitted !== undefined) {
    push(`writeCommitted=${options.writeCommitted}`);
  }
  if (options.postCommit) {
    const p = options.postCommit;
    push(`postCommitRowCount=${p.storedRowCount}`);
    push(`postCommitDistinctTeamIds=${p.storedDistinctTeamIds}`);
    push(`postCommitExactTeamSet=${p.storedTeamSetExact}`);
    push(
      `postCommitTalentCompositeFinite=${p.storedTalentCompositeFinite}`
    );
    push(
      `postCommitTalentCompositeMatchesCandidate=${p.storedTalentCompositeMatchesCandidate}/${EXPECTED_FBS_COUNT}`
    );
    push(`postCommitBlueChipsPctNull=${p.blueChipsPctNullCount}`);
    push(`postCommitSourceUpdatedAtNull=${p.sourceUpdatedAtNullCount}`);
    push(
      `postCommitLegacyStarDefaultsZero=${Math.min(p.fiveStarZeroCount, p.fourStarZeroCount, p.threeStarZeroCount, p.unratedZeroCount)}`
    );
    push(`blueChipsPctNullCount=${p.blueChipsPctNullCount}`);
    push(`sourceUpdatedAtNullCount=${p.sourceUpdatedAtNullCount}`);
    push(
      `legacyStarDefaultsZeroCount=${Math.min(p.fiveStarZeroCount, p.fourStarZeroCount, p.threeStarZeroCount, p.unratedZeroCount)}`
    );
  }
  push(`ratingsComputeAuthorized=false`);
  push(`ratingsComputed=false`);
  push(`ratingsPersisted=false`);
  push(`oddsInvoked=false`);
  push('operatorReviewSample top5:');
  for (const r of a.top5) {
    push(`  ${r.teamId}=${r.talentComposite}`);
  }
  push('operatorReviewSample bottom5:');
  for (const r of a.bottom5) {
    push(`  ${r.teamId}=${r.talentComposite}`);
  }
  if (a.findings.length > 0) {
    push('findings:');
    for (const f of a.findings) push(`  - ${f}`);
  }
  push('============================================');
  return lines.join('\n');
}
