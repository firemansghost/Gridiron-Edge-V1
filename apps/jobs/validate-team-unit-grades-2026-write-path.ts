#!/usr/bin/env node
/**
 * Manual rollback-only validator for the guarded 2026 TeamUnitGrades writer.
 *
 * This is NOT PREVIEW and NOT COMMIT. It deliberately exercises the same
 * planner -> persistence-boundary canonicalization -> 138 TeamUnitGrades
 * creates -> in-transaction exact comparison path inside one Serializable
 * transaction, then throws a sentinel so the transaction MUST roll back.
 * A post-rollback SELECT must confirm zero 2026 TeamUnitGrades rows before
 * validation can succeed.
 *
 * No providers. No source-table, priors, Shadow, Bet, MatchupOutput, ratings,
 * or Prisma migrate writes. No legacy compute writer.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  createTeamUnitGrades2026ReadStore,
  runTeamUnitGrades2026Preview,
} from './preview-team-unit-grades-2026';
import {
  TEAM_UNIT_GRADES_2026_CANONICALIZATION_EPSILON_FACTOR,
  TEAM_UNIT_GRADES_2026_EXPECTED_GRADE_VALUE_COUNT,
  TEAM_UNIT_GRADES_2026_PERSISTED_SIGNIFICANT_DIGITS,
  TEAM_UNIT_GRADES_2026_TRANSACTION_TIMEOUT_MS,
  canonicalizeProposedGradeRows,
  validatePlanForTeamUnitGradesWrite,
} from './write-team-unit-grades-2026';
import type {
  TeamUnitGradeKey,
  TeamUnitGradesCanonicalizationSummary,
} from './write-team-unit-grades-2026';
import type { ProposedGradeRow, TeamUnitGrades2026Plan } from './src/v2/team-unit-grades-2026-planner';
import {
  EXPECTED_FBS_COUNT,
  TARGET_SEASON,
  stableStringify,
} from './src/v2/unit-grade-source-readiness';

export const TEAM_UNIT_GRADES_2026_ROLLBACK_VALIDATION_CONFIRMATION =
  'VALIDATE_2026_TEAM_UNIT_GRADES_ROLLBACK';

type ValidationStage =
  | 'initializing'
  | 'planning'
  | 'validating_plan'
  | 'canonicalizing_rows'
  | 'inserting_rows'
  | 'in_transaction_select'
  | 'in_transaction_compare'
  | 'intentional_rollback'
  | 'post_rollback_select'
  | 'complete';

interface PersistedGradeRow extends ProposedGradeRow {
  season: number;
}

interface ParsedArgs {
  season: number;
  confirm: string;
  reportPath: string | null;
}

interface MismatchDetail {
  reason: 'row_count' | 'season' | 'team_id' | 'grade_value';
  index?: number;
  teamId?: string;
  field?: TeamUnitGradeKey;
  proposed?: number;
  persisted?: number;
  absoluteDelta?: number;
  proposedRowCount?: number;
  persistedRowCount?: number;
}

class RollbackOnlyValidationComplete extends Error {
  constructor() {
    super('ROLLBACK_ONLY_VALIDATION_COMPLETE');
    this.name = 'RollbackOnlyValidationComplete';
  }
}

function readRepoCommitSha(): string {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error('repoCommitSha must be obtained from git rev-parse HEAD');
  }
  return sha;
}

export function parseRollbackValidationArgs(argv: string[]):
  | { ok: true; value: ParsedArgs }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let season: number | null = null;
  let confirm = '';
  let reportPath: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--season') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n)) errors.push(`invalid season: ${argv[i]}`);
      else season = n;
    } else if (arg.startsWith('--season=')) {
      const n = Number(arg.slice('--season='.length));
      if (!Number.isInteger(n)) errors.push(`invalid season: ${arg}`);
      else season = n;
    } else if (arg === '--confirm') {
      confirm = String(argv[++i] ?? '');
    } else if (arg.startsWith('--confirm=')) {
      confirm = arg.slice('--confirm='.length);
    } else if (arg === '--report') {
      reportPath = String(argv[++i] ?? '').trim() || null;
    } else if (arg.startsWith('--report=')) {
      reportPath = arg.slice('--report='.length).trim() || null;
    } else {
      errors.push(`unknown arg: ${arg}`);
    }
  }

  if (season === null) season = TARGET_SEASON;
  if (season !== TARGET_SEASON) errors.push(`season must be ${TARGET_SEASON}`);
  if (confirm !== TEAM_UNIT_GRADES_2026_ROLLBACK_VALIDATION_CONFIRMATION) {
    errors.push(
      `validation requires confirm=${TEAM_UNIT_GRADES_2026_ROLLBACK_VALIDATION_CONFIRMATION}`
    );
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { season, confirm, reportPath } };
}

function defaultReportPath(): string {
  return path.join(
    process.cwd(),
    'reports',
    'team-unit-grades-2026-rollback-validation.json'
  );
}

function safeErrorClassification(err: unknown): { name: string; prismaCode: string | null } {
  const name = err instanceof Error ? err.name : typeof err;
  let prismaCode: string | null = null;
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const raw = (err as { code?: unknown }).code;
    if (typeof raw === 'string' && /^P\d{4}$/.test(raw)) prismaCode = raw;
  }
  return { name, prismaCode };
}

function compareTeamId(a: { teamId: string }, b: { teamId: string }): number {
  if (a.teamId < b.teamId) return -1;
  if (a.teamId > b.teamId) return 1;
  return 0;
}

export function firstGradeMismatch(
  proposedRows: readonly ProposedGradeRow[],
  persistedRows: readonly PersistedGradeRow[],
  season: number
): MismatchDetail | null {
  if (proposedRows.length !== persistedRows.length || proposedRows.length !== EXPECTED_FBS_COUNT) {
    return {
      reason: 'row_count',
      proposedRowCount: proposedRows.length,
      persistedRowCount: persistedRows.length,
    };
  }

  const proposed = proposedRows.slice().sort(compareTeamId);
  const persisted = persistedRows.slice().sort(compareTeamId);

  for (let i = 0; i < proposed.length; i++) {
    if (persisted[i].season !== season) {
      return { reason: 'season', index: i, teamId: proposed[i].teamId };
    }
    if (proposed[i].teamId !== persisted[i].teamId) {
      return { reason: 'team_id', index: i, teamId: proposed[i].teamId };
    }
    for (const field of [
      'offRunGrade',
      'defRunGrade',
      'offPassGrade',
      'defPassGrade',
      'offExplosiveness',
      'defExplosiveness',
      'havocGrade',
    ] as const) {
      const proposedValue = proposed[i][field];
      const persistedValue = persisted[i][field];
      if (proposedValue !== persistedValue) {
        return {
          reason: 'grade_value',
          index: i,
          teamId: proposed[i].teamId,
          field,
          proposed: proposedValue,
          persisted: persistedValue,
          absoluteDelta: Math.abs(proposedValue - persistedValue),
        };
      }
    }
  }

  return null;
}

async function selectPersistedRows(
  db: PrismaClient | Prisma.TransactionClient,
  season: number
): Promise<PersistedGradeRow[]> {
  return db.teamUnitGrades.findMany({
    where: { season },
    select: {
      teamId: true,
      season: true,
      offRunGrade: true,
      defRunGrade: true,
      offPassGrade: true,
      defPassGrade: true,
      offExplosiveness: true,
      defExplosiveness: true,
      havocGrade: true,
    },
    orderBy: { teamId: 'asc' },
  });
}

function writeReport(reportPath: string, report: object): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, stableStringify(report), 'utf8');
  console.log(`report=${reportPath}`);
}

async function main() {
  const parsed = parseRollbackValidationArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.errors.join('\n'));
    process.exit(1);
  }

  const url = process.env.DIRECT_URL;
  if (!url) {
    console.error('DIRECT_URL required');
    process.exit(1);
  }

  const args = parsed.value;
  const repoCommitSha = readRepoCommitSha();
  const observedAt = new Date().toISOString();
  const reportPath = args.reportPath || defaultReportPath();
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  let stage: ValidationStage = 'initializing';
  let failureStage: ValidationStage | null = null;
  let plan: TeamUnitGrades2026Plan | null = null;
  let writeBlockers: string[] = [];
  let canonicalization: TeamUnitGradesCanonicalizationSummary | null = null;
  let mutationCallsAttempted = 0;
  let insertCallsCompleted = 0;
  let inTransactionRowCount = 0;
  let inTransactionExactMatch = false;
  let firstMismatch: MismatchDetail | null = null;
  let rollbackSentinelObserved = false;
  let transactionRolledBack = false;
  let postRollbackRowCount: number | null = null;
  let rollbackVerified = false;
  let errorClassification: { name: string; prismaCode: string | null } | null = null;
  let validationSucceeded = false;

  try {
    try {
      await prisma.$transaction(
        async (tx) => {
          stage = 'planning';
          const store = createTeamUnitGrades2026ReadStore(tx as unknown as PrismaClient);
          plan = await runTeamUnitGrades2026Preview(store, {
            season: args.season,
            repoCommitSha,
            observedAt,
          });

          stage = 'validating_plan';
          writeBlockers = validatePlanForTeamUnitGradesWrite(plan);
          if (writeBlockers.length > 0) throw new Error('write_path_validation_blocked');

          stage = 'canonicalizing_rows';
          const canonicalized = canonicalizeProposedGradeRows(plan.planning.proposedGradeRows);
          canonicalization = canonicalized.summary;
          if (canonicalized.summary.valueCount !== TEAM_UNIT_GRADES_2026_EXPECTED_GRADE_VALUE_COUNT) {
            writeBlockers = [...writeBlockers, 'canonicalized_grade_value_count_not_966'];
          }
          if (!canonicalized.summary.withinDeltaGuard) {
            writeBlockers = [...writeBlockers, 'canonicalization_delta_guard_exceeded'];
          }
          if (writeBlockers.length > 0) throw new Error('canonicalization_validation_blocked');

          stage = 'inserting_rows';
          for (const row of canonicalized.rows) {
            mutationCallsAttempted += 1;
            await tx.teamUnitGrades.create({
              data: {
                teamId: row.teamId,
                season: args.season,
                offRunGrade: row.offRunGrade,
                defRunGrade: row.defRunGrade,
                offPassGrade: row.offPassGrade,
                defPassGrade: row.defPassGrade,
                offExplosiveness: row.offExplosiveness,
                defExplosiveness: row.defExplosiveness,
                havocGrade: row.havocGrade,
              },
            });
            insertCallsCompleted += 1;
          }

          stage = 'in_transaction_select';
          const persisted = await selectPersistedRows(tx, args.season);
          inTransactionRowCount = persisted.length;

          stage = 'in_transaction_compare';
          firstMismatch = firstGradeMismatch(
            canonicalized.rows,
            persisted,
            args.season
          );
          inTransactionExactMatch = firstMismatch === null;
          if (!inTransactionExactMatch) throw new Error('in_transaction_exact_match_failed');

          stage = 'intentional_rollback';
          throw new RollbackOnlyValidationComplete();
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: TEAM_UNIT_GRADES_2026_TRANSACTION_TIMEOUT_MS,
        }
      );

      failureStage = stage;
      errorClassification = { name: 'UnexpectedTransactionCommit', prismaCode: null };
    } catch (err) {
      transactionRolledBack = true;
      if (err instanceof RollbackOnlyValidationComplete) {
        rollbackSentinelObserved = true;
      } else {
        failureStage = stage;
        errorClassification = safeErrorClassification(err);
      }
    }

    stage = 'post_rollback_select';
    const postRollbackRows = await selectPersistedRows(prisma, args.season);
    postRollbackRowCount = postRollbackRows.length;
    rollbackVerified = postRollbackRowCount === 0;

    validationSucceeded =
      rollbackSentinelObserved &&
      transactionRolledBack &&
      rollbackVerified &&
      insertCallsCompleted === EXPECTED_FBS_COUNT &&
      inTransactionRowCount === EXPECTED_FBS_COUNT &&
      inTransactionExactMatch &&
      firstMismatch === null &&
      writeBlockers.length === 0 &&
      canonicalization !== null &&
      canonicalization.valueCount === TEAM_UNIT_GRADES_2026_EXPECTED_GRADE_VALUE_COUNT &&
      canonicalization.withinDeltaGuard;

    if (validationSucceeded) stage = 'complete';
  } catch (err) {
    if (failureStage === null) failureStage = stage;
    if (errorClassification === null) errorClassification = safeErrorClassification(err);
  } finally {
    const persistentRowsDetectedAfterValidation =
      postRollbackRowCount === null ? null : postRollbackRowCount > 0;
    const persistenceProvenAbsent = rollbackVerified && postRollbackRowCount === 0;

    const report = {
      season: args.season,
      mode: 'ROLLBACK_ONLY_VALIDATION',
      repoCommitSha,
      observedAt,
      stage,
      failureStage,
      plannerStatus: plan?.plannerStatus ?? null,
      sourceReadinessStatus: plan?.sourceReadinessStatus ?? null,
      planner: plan,
      writeBlockers,
      writeSafe:
        plan !== null &&
        writeBlockers.length === 0 &&
        canonicalization !== null &&
        canonicalization.valueCount === TEAM_UNIT_GRADES_2026_EXPECTED_GRADE_VALUE_COUNT &&
        canonicalization.withinDeltaGuard,
      persistenceContract: {
        exactEqualityRequired: true,
        comparisonTarget: 'canonicalized_planner_values',
        significantDigits: TEAM_UNIT_GRADES_2026_PERSISTED_SIGNIFICANT_DIGITS,
        epsilonFactorGuard: TEAM_UNIT_GRADES_2026_CANONICALIZATION_EPSILON_FACTOR,
        expectedGradeValueCount: TEAM_UNIT_GRADES_2026_EXPECTED_GRADE_VALUE_COUNT,
      },
      canonicalization,
      providersInvoked: false,
      providerCalls: 0,
      mutationsInvoked: mutationCallsAttempted > 0,
      mutationCallsAttempted,
      insertCallsCompleted,
      inTransactionRowCount,
      inTransactionExactMatch,
      firstMismatch,
      rollbackSentinelObserved,
      transactionRolledBack,
      transactionIsolation: 'Serializable',
      transactionTimeoutMs: TEAM_UNIT_GRADES_2026_TRANSACTION_TIMEOUT_MS,
      postRollbackRowCount,
      rollbackVerified,
      persistentRowsDetectedAfterValidation,
      persistedWrites: persistenceProvenAbsent ? false : null,
      teamUnitGradesWritesPersisted: persistenceProvenAbsent ? false : null,
      cfbdSourceWrites: false,
      priorsWrites: false,
      shadowWrites: false,
      betWrites: false,
      matchupOutputWrites: false,
      ratingsWrites: false,
      prismaMigrateInvoked: false,
      computeUnitGradesTsInvoked: false,
      errorClassification,
      validationSucceeded,
    };

    console.log(stableStringify(report));
    writeReport(reportPath, report);
    await prisma.$disconnect();
  }

  process.exit(validationSucceeded ? 0 : 1);
}

if (require.main === module) {
  void main();
}
