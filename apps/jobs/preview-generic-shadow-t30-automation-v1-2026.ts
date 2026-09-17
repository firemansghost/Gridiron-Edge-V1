/**
 * CLI — Generic Shadow T-30 Automation V1 Stage A PREVIEW.
 *
 * Production DB SELECTs only.
 * providerCalls=0.
 * No MarketLine writes.
 * No Generic closing writes.
 * No prediction, Hybrid, Official Card, evaluation, Game, or MatchupOutput writes.
 * No Prisma migrate.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import {
  GENERIC_SHADOW_T30_AUTOMATION_MARKET_WINDOW_CLOSE_MINUTES,
  GENERIC_SHADOW_T30_AUTOMATION_MARKET_WINDOW_OPEN_MINUTES,
  GENERIC_SHADOW_T30_AUTOMATION_PROVIDER_ENABLED,
  GENERIC_SHADOW_T30_AUTOMATION_SCHEDULER_CADENCE_MINUTES,
  GENERIC_SHADOW_T30_AUTOMATION_VERSION,
  GENERIC_SHADOW_T30_AUTOMATION_WRITES_ENABLED,
  planGenericShadowT30Automation,
  type GenericShadowT30AutomationOutcome,
} from '../web/lib/generic-shadow-t30-automation-v1';
import { GENERIC_SHADOW_T30_CAPTURE_SEASON } from '../web/lib/shadow-model-t30-closing-v1';
import { discoverGenericShadowT30AutomationFrames } from './src/generic-shadow-t30-automation-v1-adapter';

function parseArgs(argv: string[]): { season: number; week: number; reportPath?: string } {
  let season = GENERIC_SHADOW_T30_CAPTURE_SEASON;
  let week = NaN;
  let reportPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--season') season = Number(argv[++i]);
    else if (arg === '--week') week = Number(argv[++i]);
    else if (arg === '--report') reportPath = String(argv[++i]);
  }
  return { season, week, reportPath };
}

function defaultReportPath(season: number, week: number): string {
  return path.join(
    process.cwd(),
    'reports',
    `generic-shadow-t30-automation-v1-2026-${season}-week-${week}-PREVIEW.json`
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

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log('============================================================');
  console.log('GENERIC SHADOW T-30 AUTOMATION V1 — STAGE A PREVIEW');
  console.log('============================================================');
  console.log(`season=${args.season} week=${args.week}`);
  console.log(`automationVersion=${GENERIC_SHADOW_T30_AUTOMATION_VERSION}`);
  console.log(
    `marketRefreshWindow=kickoff-${GENERIC_SHADOW_T30_AUTOMATION_MARKET_WINDOW_OPEN_MINUTES}m..kickoff-${GENERIC_SHADOW_T30_AUTOMATION_MARKET_WINDOW_CLOSE_MINUTES}m`
  );
  console.log(`futureSchedulerCadenceMinutes=${GENERIC_SHADOW_T30_AUTOMATION_SCHEDULER_CADENCE_MINUTES}`);
  console.log('true closing target remains kickoff-30m');
  console.log('PREVIEW ONLY: production DB SELECTs; providerCalls=0; zero production writes');
  console.log('no provider secrets; no schedule; no COMMIT path; no Prisma migrate');

  if (args.season !== GENERIC_SHADOW_T30_CAPTURE_SEASON) {
    throw new Error(`season must be ${GENERIC_SHADOW_T30_CAPTURE_SEASON}`);
  }
  if (!Number.isInteger(args.week) || args.week < 1) {
    throw new Error('week must be a positive integer');
  }
  if (GENERIC_SHADOW_T30_AUTOMATION_PROVIDER_ENABLED || GENERIC_SHADOW_T30_AUTOMATION_WRITES_ENABLED) {
    throw new Error('Stage A invariant violated: provider and writes must remain disabled');
  }

  const url = process.env.DIRECT_URL;
  if (!url) throw new Error('DIRECT_URL required');

  const observedTimestamp = new Date();
  const repoCommitSha = readRepoCommitSha();
  const reportPath = args.reportPath ?? defaultReportPath(args.season, args.week);
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const discovery = await discoverGenericShadowT30AutomationFrames(prisma, {
      season: args.season,
      week: args.week,
    });
    const planned = planGenericShadowT30Automation({
      season: args.season,
      week: args.week,
      observedTimestamp,
      frames: discovery.frames,
    });

    const blockers = uniqueSorted([...discovery.blockers, ...planned.blockers]);
    const outcome: GenericShadowT30AutomationOutcome =
      blockers.length > 0 ? 'BLOCKED' : planned.outcome;
    const writeSafe = blockers.length === 0 && planned.writeSafe;

    const report = {
      ...planned,
      outcome,
      writeSafe,
      blockers,
      observedTimestamp: observedTimestamp.toISOString(),
      repoCommitSha,
      githubRef: process.env.GITHUB_REF ?? null,
      discovery: {
        discoveredSupportedRunIds: discovery.discoveredSupportedRunIds,
        eligibleCaptureRunIds: discovery.eligibleCaptureRunIds,
        skippedIncompleteRunIds: discovery.skippedIncompleteRunIds,
      },
      providerCallsAttempted: 0,
      providerCallsSucceeded: 0,
      providerCredits: null,
      providerSecretExposed: false,
      marketLineWrites: false,
      closingWrites: false,
      predictionWrites: false,
      captureRunWrites: false,
      hybridShadowWrites: false,
      betWrites: false,
      matchupOutputWrites: false,
      evaluationWrites: false,
      gameWrites: false,
      prismaMigrateInvoked: false,
      mutationTargetsInvoked: [],
      postwriteVerificationStatus: 'NOT_APPLICABLE_PREVIEW_ONLY',
      researchOnly: true,
      scheduleEnabled: false,
      stage: 'A_PREVIEW_ONLY',
    };

    writeReport(reportPath, report);
    console.log(
      `outcome=${outcome} runs=${planned.eligibleCaptureRunIds.length} total=${planned.counts.totalPredictions} existing=${planned.counts.existingCount} future=${planned.counts.futureCount} due=${planned.counts.dueCount} missed=${planned.counts.missedCount}`
    );
    console.log(
      `marketRefreshWindowOpen=${planned.marketRefreshWindowOpenCount} marketRefreshNeeded=${planned.marketRefreshNeeded} closingRowsPlanned=${planned.closingRowsPlanned} providerCalls=0 mutationsInvoked=false`
    );
    if (blockers.length > 0) console.log(`blockers=${blockers.join(' | ')}`);
    console.log('PREVIEW complete — production DB unchanged');
    process.exitCode = writeSafe ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
