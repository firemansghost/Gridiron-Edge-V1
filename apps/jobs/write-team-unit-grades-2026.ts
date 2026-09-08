#!/usr/bin/env node
/**
 * Manual guarded 2026 TeamUnitGrades PREVIEW/COMMIT writer.
 *
 * PREVIEW: SELECT-only; recomputes the proven planner proposal and reports
 * whether a first-write COMMIT would be safe.
 *
 * COMMIT: recomputes the complete proposal inside the same Serializable
 * transaction that performs the inserts, writes TeamUnitGrades only, verifies
 * exact agreement before commit, then independently post-verifies persisted
 * rows after commit.
 *
 * No providers. No CFBD/Odds keys. No legacy compute writer. No Shadow.
 * No source-table, priors, Bet, MatchupOutput, ratings, or Prisma migrate writes.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  createTeamUnitGrades2026ReadStore,
  runTeamUnitGrades2026Preview,
} from './preview-team-unit-grades-2026';
import type {
  ProposedGradeRow,
  TeamUnitGrades2026Plan,
} from './src/v2/team-unit-grades-2026-planner';
import {
  EXPECTED_FBS_COUNT,
  TARGET_SEASON,
  stableStringify,
} from './src/v2/unit-grade-source-readiness';

export const TEAM_UNIT_GRADES_2026_CONFIRMATION = 'WRITE_2026_TEAM_UNIT_GRADES';
export const TEAM_UNIT_GRADES_2026_TRANSACTION_TIMEOUT_MS = 120_000;

type WriterMode = 'PREVIEW' | 'COMMIT';

interface ParsedArgs {
  season: number;
  mode: WriterMode;
  confirm: string;
  reportPath: string | null;
}

const GRADE_KEYS = [
  'offRunGrade',
  'defRunGrade',
  'offPassGrade',
  'defPassGrade',
  'offExplosiveness',
  'defExplosiveness',
  'havocGrade',
] as const;

interface PersistedGradeRow extends ProposedGradeRow {
  season: number;
}

class TeamUnitGradesCommitFailure extends Error {
  readonly plan: TeamUnitGrades2026Plan | null;
  readonly writeBlockers: string[];
  readonly mutationCallsAttempted: number;

  constructor(options: {
    plan: TeamUnitGrades2026Plan | null;
    writeBlockers: string[];
    mutationCallsAttempted: number;
  }) {
    super('2026 TeamUnitGrades COMMIT transaction failed');
    this.name = 'TeamUnitGradesCommitFailure';
    this.plan = options.plan;
    this.writeBlockers = options.writeBlockers;
    this.mutationCallsAttempted = options.mutationCallsAttempted;
  }
}

function readRepoCommitSha(): string {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error('repoCommitSha must be obtained from git rev-parse HEAD');
  }
  return sha;
}

export function parseTeamUnitGrades2026WriterArgs(argv: string[]):
  | { ok: true; value: ParsedArgs }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let season: number | null = null;
  let mode: WriterMode | null = null;
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
    } else if (arg === '--mode') {
      const raw = String(argv[++i] ?? '').toUpperCase();
      if (raw !== 'PREVIEW' && raw !== 'COMMIT') errors.push(`invalid mode: ${raw}`);
      else mode = raw;
    } else if (arg.startsWith('--mode=')) {
      const raw = arg.slice('--mode='.length).toUpperCase();
      if (raw !== 'PREVIEW' && raw !== 'COMMIT') errors.push(`invalid mode: ${raw}`);
      else mode = raw;
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
  if (mode === null) mode = 'PREVIEW';
  if (season !== TARGET_SEASON) errors.push(`season must be ${TARGET_SEASON}`);
  if (mode === 'COMMIT' && confirm !== TEAM_UNIT_GRADES_2026_CONFIRMATION) {
    errors.push(`COMMIT requires confirm=${TEAM_UNIT_GRADES_2026_CONFIRMATION}`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { season, mode, confirm, reportPath } };
}

function defaultReportPath(mode: WriterMode): string {
  return path.join(
    process.cwd(),
    'reports',
    `team-unit-grades-2026-${mode.toLowerCase()}.json`
  );
}

function sanitizeError(_err: unknown): string {
  return '2026 TeamUnitGrades guarded writer failed; connection and secret details suppressed';
}

function compareTeamId(a: { teamId: string }, b: { teamId: string }): number {
  if (a.teamId < b.teamId) return -1;
  if (a.teamId > b.teamId) return 1;
  return 0;
}

export function validatePlanForTeamUnitGradesWrite(plan: TeamUnitGrades2026Plan): string[] {
  const blockers: string[] = [];
  const rows = plan.planning.proposedGradeRows;
  const seen = new Set<string>();

  if (plan.season !== TARGET_SEASON) blockers.push('season_must_be_2026');
  if (plan.plannerStatus !== 'PLANNING_ELIGIBLE') blockers.push(`planner_status:${plan.plannerStatus}`);
  if (plan.planning.authoritativePlanningAllowed !== true) blockers.push('authoritative_planning_not_allowed');
  if (plan.failClosed !== false) blockers.push('planner_fail_closed');
  if (plan.blockers.length !== 0) blockers.push('planner_blockers_present');
  if (plan.coverage.rawMetricCoverageComplete !== true) blockers.push('raw_metric_coverage_incomplete');
  if (plan.coverage.legacyComputeCompatibleCoverageComplete !== true) {
    blockers.push('legacy_compatible_coverage_incomplete');
  }
  if (plan.fbs.expected !== EXPECTED_FBS_COUNT) blockers.push('expected_fbs_count_changed');
  if (plan.fbs.actual !== EXPECTED_FBS_COUNT || plan.fbs.unique !== EXPECTED_FBS_COUNT) {
    blockers.push('fbs_population_not_exactly_138');
  }
  if (
    plan.sourceInventory.existingTeamUnitGradesRows !== 0 ||
    plan.sourceInventory.existingTeamUnitGradesTeams !== 0
  ) {
    blockers.push('existing_team_unit_grades_not_empty');
  }
  if (plan.calculation.attempted !== true) blockers.push('calculation_not_attempted');
  if (plan.calculation.inputRowCount !== EXPECTED_FBS_COUNT) blockers.push('calculation_input_count_not_138');
  if (plan.calculation.proposedRowCount !== EXPECTED_FBS_COUNT) blockers.push('calculation_proposed_count_not_138');
  if (plan.planning.proposedGradeRowCount !== EXPECTED_FBS_COUNT) blockers.push('planning_proposed_count_not_138');
  if (rows.length !== EXPECTED_FBS_COUNT) blockers.push('proposed_rows_not_138');

  for (const row of rows) {
    if (typeof row.teamId !== 'string' || row.teamId.trim() === '') {
      blockers.push('blank_team_id');
      continue;
    }
    if (seen.has(row.teamId)) blockers.push(`duplicate_team_id:${row.teamId}`);
    seen.add(row.teamId);
    for (const key of GRADE_KEYS) {
      if (!Number.isFinite(row[key])) blockers.push(`nonfinite_grade:${row.teamId}:${key}`);
    }
  }

  if (seen.size !== EXPECTED_FBS_COUNT) blockers.push('unique_proposed_team_count_not_138');
  return Array.from(new Set(blockers));
}

export function exactGradeRowsMatch(
  proposedRows: readonly ProposedGradeRow[],
  persistedRows: readonly PersistedGradeRow[],
  season: number
): boolean {
  if (proposedRows.length !== EXPECTED_FBS_COUNT || persistedRows.length !== EXPECTED_FBS_COUNT) {
    return false;
  }
  const proposed = proposedRows.slice().sort(compareTeamId);
  const persisted = persistedRows.slice().sort(compareTeamId);
  for (let i = 0; i < proposed.length; i++) {
    if (persisted[i].season !== season || proposed[i].teamId !== persisted[i].teamId) return false;
    for (const key of GRADE_KEYS) {
      if (proposed[i][key] !== persisted[i][key]) return false;
    }
  }
  return true;
}

function writeReport(reportPath: string, report: object): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, stableStringify(report), 'utf8');
  console.log(`report=${reportPath}`);
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

async function runPreview(
  prisma: PrismaClient,
  args: ParsedArgs,
  repoCommitSha: string,
  observedAt: string
) {
  const plan = await runTeamUnitGrades2026Preview(createTeamUnitGrades2026ReadStore(prisma), {
    season: args.season,
    repoCommitSha,
    observedAt,
  });
  const writeBlockers = validatePlanForTeamUnitGradesWrite(plan);
  return { plan, writeBlockers, writeSafe: writeBlockers.length === 0 };
}

async function runCommit(
  prisma: PrismaClient,
  args: ParsedArgs,
  repoCommitSha: string,
  observedAt: string
) {
  let planForFailure: TeamUnitGrades2026Plan | null = null;
  let blockersForFailure: string[] = [];
  let mutationCallsAttempted = 0;

  let txResult: {
    plan: TeamUnitGrades2026Plan;
    committedRowCount: number;
    transactionVerified: boolean;
  };

  try {
    txResult = await prisma.$transaction(
      async (tx) => {
        const store = createTeamUnitGrades2026ReadStore(tx as unknown as PrismaClient);
        const plan = await runTeamUnitGrades2026Preview(store, {
          season: args.season,
          repoCommitSha,
          observedAt,
        });
        planForFailure = plan;
        const writeBlockers = validatePlanForTeamUnitGradesWrite(plan);
        blockersForFailure = writeBlockers;
        if (writeBlockers.length > 0) {
          throw new Error('team_unit_grades_write_blocked');
        }

        for (const row of plan.planning.proposedGradeRows) {
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
        }

        const persistedInsideTransaction = await selectPersistedRows(tx, args.season);
        const transactionVerified = exactGradeRowsMatch(
          plan.planning.proposedGradeRows,
          persistedInsideTransaction,
          args.season
        );
        if (!transactionVerified) throw new Error('transaction_postwrite_exact_match_failed');

        return {
          plan,
          committedRowCount: plan.planning.proposedGradeRows.length,
          transactionVerified,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: TEAM_UNIT_GRADES_2026_TRANSACTION_TIMEOUT_MS,
      }
    );
  } catch (_err) {
    throw new TeamUnitGradesCommitFailure({
      plan: planForFailure,
      writeBlockers: blockersForFailure,
      mutationCallsAttempted,
    });
  }

  const postWriteRows = await selectPersistedRows(prisma, args.season);
  const postWriteExactMatch = exactGradeRowsMatch(
    txResult.plan.planning.proposedGradeRows,
    postWriteRows,
    args.season
  );

  return {
    plan: txResult.plan,
    writeBlockers: [],
    writeSafe: true,
    mutationCallsAttempted,
    committedRowCount: txResult.committedRowCount,
    transactionVerified: txResult.transactionVerified,
    postWriteSelectRowCount: postWriteRows.length,
    postWriteExactMatch,
  };
}

async function main() {
  const parsed = parseTeamUnitGrades2026WriterArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.errors.join('\n'));
    process.exit(1);
  }

  const args = parsed.value;
  const url = process.env.DIRECT_URL;
  if (!url) {
    console.error('DIRECT_URL required');
    process.exit(1);
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const repoCommitSha = readRepoCommitSha();
  const observedAt = new Date().toISOString();
  const reportPath = args.reportPath || defaultReportPath(args.mode);

  let plan: TeamUnitGrades2026Plan | null = null;
  let writeBlockers: string[] = [];
  let writeSafe = false;
  let mutationsInvoked = false;
  let mutationCallsAttempted = 0;
  let mutationCount = 0;
  let commitAttempted = false;
  let commitSucceeded = false;
  let transactionRolledBack = false;
  let transactionVerified = false;
  let committedRowCount = 0;
  let postWriteSelectRowCount = 0;
  let postWriteExactMatch = false;
  let error: string | null = null;

  try {
    if (args.mode === 'PREVIEW') {
      const result = await runPreview(prisma, args, repoCommitSha, observedAt);
      plan = result.plan;
      writeBlockers = result.writeBlockers;
      writeSafe = result.writeSafe;
    } else {
      commitAttempted = true;
      try {
        const result = await runCommit(prisma, args, repoCommitSha, observedAt);
        plan = result.plan;
        writeBlockers = result.writeBlockers;
        writeSafe = result.writeSafe;
        mutationCallsAttempted = result.mutationCallsAttempted;
        mutationsInvoked = mutationCallsAttempted > 0;
        mutationCount = result.committedRowCount;
        committedRowCount = result.committedRowCount;
        transactionVerified = result.transactionVerified;
        postWriteSelectRowCount = result.postWriteSelectRowCount;
        postWriteExactMatch = result.postWriteExactMatch;
        commitSucceeded = true;
        if (!postWriteExactMatch) error = 'postcommit_exact_match_failed';
      } catch (err) {
        transactionRolledBack = true;
        if (err instanceof TeamUnitGradesCommitFailure) {
          plan = err.plan;
          writeBlockers = err.writeBlockers;
          mutationCallsAttempted = err.mutationCallsAttempted;
          mutationsInvoked = mutationCallsAttempted > 0;
        }
        error = sanitizeError(err);
      }
    }
  } catch (err) {
    error = sanitizeError(err);
  } finally {
    const report = {
      season: args.season,
      mode: args.mode,
      repoCommitSha,
      observedAt,
      plannerStatus: plan?.plannerStatus ?? null,
      sourceReadinessStatus: plan?.sourceReadinessStatus ?? null,
      planner: plan,
      writeBlockers,
      writeSafe,
      writerAuthorization: {
        seasonAuthorized: args.season === TARGET_SEASON,
        confirmationSatisfied:
          args.mode === 'PREVIEW' || args.confirm === TEAM_UNIT_GRADES_2026_CONFIRMATION,
      },
      providersInvoked: false,
      providerCalls: 0,
      mutationsInvoked,
      mutationCallsAttempted,
      mutationCount,
      commitAttempted,
      commitSucceeded,
      transactionRolledBack,
      transactionVerified,
      transactionIsolation: 'Serializable',
      transactionTimeoutMs: TEAM_UNIT_GRADES_2026_TRANSACTION_TIMEOUT_MS,
      committedRowCount,
      postWriteSelectRowCount,
      postWriteExactMatch,
      teamUnitGradesWrites: commitSucceeded,
      cfbdSourceWrites: false,
      priorsWrites: false,
      shadowWrites: false,
      betWrites: false,
      matchupOutputWrites: false,
      ratingsWrites: false,
      prismaMigrateInvoked: false,
      computeUnitGradesTsInvoked: false,
      error,
    };
    console.log(stableStringify(report));
    writeReport(reportPath, report);
    await prisma.$disconnect();
  }

  if (args.mode === 'PREVIEW') process.exit(writeSafe ? 0 : 1);
  process.exit(commitSucceeded && postWriteExactMatch ? 0 : 1);
}

if (require.main === module) {
  void main();
}
