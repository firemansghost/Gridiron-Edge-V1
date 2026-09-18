/**
 * CLI — Generic Shadow T-30 Automation V1 closing COMMIT.
 *
 * PLAN: production DB SELECTs only. No provider secret. No writes.
 * COMMIT: may invoke the existing guarded Generic T-30 closing COMMIT
 * boundary at most once per eligible DUE capture run.
 *
 * No Live Odds. No ODDS_API_KEY. No MarketLine writes.
 * No prediction, Hybrid, Official Card, evaluation, Game, or MatchupOutput writes.
 * No Prisma migrate.
 * Schedule remains disabled.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { GENERIC_SHADOW_T30_AUTOMATION_VERSION } from '../web/lib/generic-shadow-t30-automation-v1';
import type { GenericShadowT30AutomationPlan } from '../web/lib/generic-shadow-t30-automation-v1';
import {
  GENERIC_SHADOW_T30_CLOSING_COMMIT_STAGE,
  expectedGenericShadowT30ClosingCommitConfirmation,
  type GenericShadowT30ClosingCommitCycleReport,
  type GenericShadowT30ClosingCommitMode,
} from '../web/lib/generic-shadow-t30-automation-v1-closing-commit';
import { GENERIC_SHADOW_T30_CAPTURE_SEASON } from '../web/lib/shadow-model-t30-closing-v1';
import {
  defaultClosingChildReportPath,
  discoverWithPrisma,
  invokeGuardedGenericShadowT30ClosingCommit,
  runGenericShadowT30ClosingCommitCycle,
} from './src/generic-shadow-t30-automation-v1-closing-commit-adapter';

function parseArgs(argv: string[]): {
  season: number;
  week: number;
  mode: GenericShadowT30ClosingCommitMode;
  confirmation: string;
  reportPath?: string;
  childReportDir?: string;
  initialReportPath?: string;
} {
  let season = GENERIC_SHADOW_T30_CAPTURE_SEASON;
  let week = NaN;
  let mode: GenericShadowT30ClosingCommitMode = 'PLAN';
  let confirmation = '';
  let reportPath: string | undefined;
  let childReportDir: string | undefined;
  let initialReportPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--season') season = Number(argv[++i]);
    else if (arg === '--week') week = Number(argv[++i]);
    else if (arg === '--mode') {
      const raw = String(argv[++i] ?? '').toUpperCase();
      mode = raw === 'COMMIT' ? 'COMMIT' : raw === 'PLAN' ? 'PLAN' : (raw as GenericShadowT30ClosingCommitMode);
    } else if (arg === '--confirm' || arg === '--confirmation') confirmation = String(argv[++i] ?? '');
    else if (arg === '--report') reportPath = String(argv[++i]);
    else if (arg === '--child-report-dir') childReportDir = String(argv[++i]);
    else if (arg === '--initial-report') initialReportPath = String(argv[++i]);
  }
  return { season, week, mode, confirmation, reportPath, childReportDir, initialReportPath };
}

function defaultReportPath(
  season: number,
  week: number,
  mode: GenericShadowT30ClosingCommitMode
): string {
  return path.join(
    process.cwd(),
    'reports',
    `generic-shadow-t30-automation-v1-2026-${season}-week-${week}-closing-commit-${mode}.json`
  );
}

function readRepoCommitSha(): string {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error('repoCommitSha must be obtained from git rev-parse HEAD');
  }
  return sha;
}

function writeReport(reportPath: string, report: unknown): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`report=${reportPath}`);
}

function writeGithubOutputs(outputs: Record<string, string>): void {
  const target = process.env.GITHUB_OUTPUT;
  if (!target) return;
  const lines: string[] = [];
  const keys = Object.keys(outputs);
  for (let i = 0; i < keys.length; i++) {
    lines.push(`${keys[i]}=${outputs[keys[i]]}`);
  }
  fs.appendFileSync(target, `${lines.join('\n')}\n`, 'utf8');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log('============================================================');
  console.log('GENERIC SHADOW T-30 AUTOMATION V1 — CLOSING COMMIT');
  console.log('============================================================');
  console.log(`season=${args.season} week=${args.week} mode=${args.mode}`);
  console.log(`automationVersion=${GENERIC_SHADOW_T30_AUTOMATION_VERSION}`);
  console.log(`stage=${GENERIC_SHADOW_T30_CLOSING_COMMIT_STAGE}`);
  console.log('true closing target remains kickoff-30m');
  console.log('scheduleEnabled=false productionExecutionAuthorized=false');
  console.log('PLAN: DIRECT_URL SELECTs only; providerCalls=0; zero writes');
  console.log('COMMIT: at most one existing Generic closing COMMIT per DUE capture run');
  console.log('no Live Odds; no ODDS_API_KEY; no MarketLine writes');
  console.log(
    `expectedConfirmation=${expectedGenericShadowT30ClosingCommitConfirmation(
      Number.isInteger(args.week) ? args.week : 0
    )} (value not echoed from input)`
  );

  if (args.season !== GENERIC_SHADOW_T30_CAPTURE_SEASON) {
    throw new Error(`season must be ${GENERIC_SHADOW_T30_CAPTURE_SEASON}`);
  }
  if (!Number.isInteger(args.week) || args.week < 1) {
    throw new Error('week must be a positive integer');
  }
  if (args.mode !== 'PLAN' && args.mode !== 'COMMIT') {
    throw new Error('mode must be PLAN or COMMIT');
  }

  const url = process.env.DIRECT_URL;
  if (!url) throw new Error('DIRECT_URL required');

  const reportPath = args.reportPath ?? defaultReportPath(args.season, args.week, args.mode);
  const childReportDir = args.childReportDir ?? path.join(process.cwd(), 'reports');
  const repoCommitSha = readRepoCommitSha();
  let loadedInitial: GenericShadowT30ClosingCommitCycleReport | null = null;
  if (args.initialReportPath) {
    loadedInitial = JSON.parse(
      fs.readFileSync(args.initialReportPath, 'utf8')
    ) as GenericShadowT30ClosingCommitCycleReport;
  }
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const report = await runGenericShadowT30ClosingCommitCycle({
      season: args.season,
      week: args.week,
      mode: args.mode,
      confirmation: args.confirmation,
      repoCommitSha,
      githubRef: process.env.GITHUB_REF ?? null,
      childReportDir,
      now: () => new Date(),
      discover: () => discoverWithPrisma(prisma, { season: args.season, week: args.week }),
      initialPlan: loadedInitial?.initialPlan as GenericShadowT30AutomationPlan | undefined,
      initialObservedTimestamp: loadedInitial?.initialObservedTimestamp
        ? new Date(loadedInitial.initialObservedTimestamp)
        : undefined,
      initialDiscoveryBlockers: loadedInitial?.initialPlan?.blockers,
      runClosingCommit:
        args.mode === 'COMMIT'
          ? async (request) => invokeGuardedGenericShadowT30ClosingCommit(request)
          : undefined,
    });

    writeReport(reportPath, {
      ...report,
      researchOnly: true,
      prismaMigrateInvoked: false,
      closingWrites: report.mutationTargetsInvoked,
      predictionWrites: false,
      captureRunWrites: false,
      hybridShadowWrites: false,
      betWrites: false,
      matchupOutputWrites: false,
      evaluationWrites: false,
      gameWrites: false,
      marketLineWrites: false,
      liveOddsInvoked: false,
    });
    writeGithubOutputs({
      should_commit: report.closingCommitRequested ? 'true' : 'false',
      write_safe: report.writeSafe ? 'true' : 'false',
      blocked: report.outcome === 'BLOCKED' ? 'true' : 'false',
      outcome: report.outcome,
      due_count: String(report.dueCaptureRunIds.length),
    });

    console.log(
      `outcome=${report.outcome} initial=${report.initialOutcome} dueRuns=${report.dueCaptureRunIds.length} closingCommitRequested=${report.closingCommitRequested}`
    );
    console.log(
      `providerCalls=0 mutationTargetsInvoked=${
        report.mutationTargetsInvoked == null
          ? 'UNKNOWN'
          : report.mutationTargetsInvoked.join(',') || 'none'
      } closingRowsInserted=${report.closingRowsInserted}`
    );
    if (report.blockers.length > 0) console.log(`blockers=${report.blockers.join(' | ')}`);
    for (let i = 0; i < report.runResults.length; i++) {
      const run = report.runResults[i];
      console.log(
        `run=${run.captureRunId} invoked=${run.invocationAttempted} persistence=${run.persistenceStatus} inserted=${run.insertedClosingCount}`
      );
      if (run.childReportPath) {
        console.log(`childReport=${run.childReportPath}`);
      }
    }
    console.log(`childReportDir=${childReportDir}`);
    console.log(`exampleChildReport=${defaultClosingChildReportPath(childReportDir, '<capture_run_id>')}`);

    if (report.outcome === 'BLOCKED' || report.outcome === 'FAILED') {
      process.exitCode = 1;
      return;
    }
    process.exitCode = report.writeSafe ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
