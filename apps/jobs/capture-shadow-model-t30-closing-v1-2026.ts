/**
 * CLI — Guarded 2026 Generic Shadow Model T-30 Closing V1 capture.
 *
 * PREVIEW:
 *   production DB SELECT only
 *   providerCalls=0
 *   zero writes
 *
 * COMMIT:
 *   serializable append-only insert into
 *   ShadowModelClosingMarketSnapshot only
 *
 * no providers
 * no prediction writes
 * no Hybrid writes
 * no Bet writes
 * no MatchupOutput writes
 * no evaluation writes
 * no migration
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import {
  GENERIC_SHADOW_T30_CAPTURE_SEASON,
  GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH,
  GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID,
  GENERIC_SHADOW_T30_EVALUATION_PROTOCOL,
  expectedGenericShadowT30WriteConfirmation,
  type GenericShadowT30Mode,
} from '../web/lib/shadow-model-t30-closing-v1';
import {
  createPrismaGenericShadowT30Adapter,
  executeGenericShadowT30ClosingCapture,
} from './src/shadow-model-t30-closing-v1-adapter';

function parseArgs(argv: string[]): {
  season: number;
  week: number;
  captureRunId: string;
  mode: GenericShadowT30Mode;
  confirmation: string;
  reportPath?: string;
} {
  let season = GENERIC_SHADOW_T30_CAPTURE_SEASON;
  let week = NaN;
  let captureRunId = '';
  let mode: GenericShadowT30Mode = 'PREVIEW';
  let confirmation = '';
  let reportPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--season') season = Number(argv[++i]);
    else if (arg === '--week') week = Number(argv[++i]);
    else if (arg === '--capture-run-id') captureRunId = String(argv[++i] ?? '');
    else if (arg === '--mode') mode = String(argv[++i]).toUpperCase() as GenericShadowT30Mode;
    else if (arg === '--confirm' || arg === '--confirmation') confirmation = String(argv[++i] ?? '');
    else if (arg === '--report') reportPath = String(argv[++i]);
  }
  return { season, week, captureRunId, mode, confirmation, reportPath };
}

function sanitizePathToken(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-');
}

function defaultReportPath(
  season: number,
  week: number,
  captureRunId: string,
  mode: GenericShadowT30Mode
): string {
  return path.join(
    process.cwd(),
    'reports',
    `generic-shadow-model-t30-closing-v1-2026-${season}-week-${week}-${sanitizePathToken(captureRunId)}-${mode}.json`
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const expectedConfirmation = Number.isInteger(args.week) && args.captureRunId
    ? expectedGenericShadowT30WriteConfirmation(args.week, args.captureRunId)
    : 'CAPTURE_2026_WEEK_<week>_SHADOW_MODEL_T30_<captureRunId>';

  console.log('============================================================');
  console.log('GUARDED 2026 GENERIC SHADOW MODEL T-30 CLOSING V1 CAPTURE');
  console.log('============================================================');
  console.log(`season=${args.season} week=${args.week} mode=${args.mode}`);
  console.log(`captureRunId=${args.captureRunId || '(missing)'}`);
  console.log(`closingDefinitionId=${GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID}`);
  console.log(`closingDefinitionHash=${GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH}`);
  console.log(`evaluationProtocol=${GENERIC_SHADOW_T30_EVALUATION_PROTOCOL}`);
  console.log(`expectedConfirmation=${expectedConfirmation} (value not echoed from input)`);
  console.log('PREVIEW: production DB SELECT only; providerCalls=0; zero writes');
  console.log('COMMIT: serializable append-only insert into ShadowModelClosingMarketSnapshot only');
  console.log('no providers; no prediction writes; no Hybrid writes; no Bet writes');
  console.log('no MatchupOutput writes; no evaluation writes; no migration');
  console.log('PREVIEW timestamp will NOT become the COMMIT capture timestamp');

  if (args.season !== GENERIC_SHADOW_T30_CAPTURE_SEASON) {
    throw new Error(`season must be ${GENERIC_SHADOW_T30_CAPTURE_SEASON}`);
  }
  if (!Number.isInteger(args.week) || args.week < 1) {
    throw new Error('week must be a positive integer');
  }
  if (!args.captureRunId.trim()) {
    throw new Error('capture-run-id is required');
  }
  if (args.mode !== 'PREVIEW' && args.mode !== 'COMMIT') {
    throw new Error('mode must be PREVIEW or COMMIT');
  }
  if (args.mode === 'COMMIT') {
    const expected = expectedGenericShadowT30WriteConfirmation(args.week, args.captureRunId);
    if (args.confirmation !== expected) {
      throw new Error(`COMMIT requires confirm=${expected}`);
    }
  }

  const url = process.env.DIRECT_URL;
  if (!url) throw new Error('DIRECT_URL required');

  const reportPath = args.reportPath ?? defaultReportPath(
    args.season,
    args.week,
    args.captureRunId,
    args.mode
  );
  const repoCommitSha = readRepoCommitSha();
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url,
      },
    },
  });

  try {
    const adapter = createPrismaGenericShadowT30Adapter(prisma, {
      captureRunId: args.captureRunId,
    });
    const { plan, execution, report } = await executeGenericShadowT30ClosingCapture({
      season: args.season,
      week: args.week,
      captureRunId: args.captureRunId,
      mode: args.mode,
      confirmation: args.confirmation,
      adapter,
    });

    writeReport(reportPath, {
      ...report,
      repoCommitSha,
      providerCalls: 0,
      predictionWrites: false,
      captureRunWrites: false,
      betWrites: false,
      matchupOutputWrites: false,
      hybridShadowWrites: false,
      evaluationWrites: false,
      gameWrites: false,
      marketLineWrites: false,
      prismaMigrateInvoked: false,
      researchOnly: true,
      authorizationMustBeExternal: true,
      previewTimestampWillNotBecomeCommitTimestamp: true,
    });

    console.log(
      `writeSafe=${plan.writeSafe} total=${plan.counts.totalPredictions} existing=${plan.counts.existingCount} future=${plan.counts.futureCount} due=${plan.counts.dueCount} missed=${plan.counts.missedCount} planned=${plan.counts.plannedInsertCount} mutationsInvoked=${execution.mutationsInvoked} providerCalls=0`
    );
    if (plan.writeBlockers.length > 0) console.log(`writeBlockers=${plan.writeBlockers.join(' | ')}`);

    if (args.mode === 'PREVIEW') {
      console.log('PREVIEW complete — DB unchanged; PREVIEW timestamp will NOT become COMMIT timestamp');
      process.exitCode = plan.writeSafe ? 0 : 1;
      return;
    }

    if (execution.rolledBack || !execution.commitSucceeded || !execution.verificationOk) {
      console.error(
        execution.rolledBack
          ? 'COMMIT rolled back — no new Generic closing rows persisted'
          : 'COMMIT verification failed — see report; no repair attempted'
      );
      process.exitCode = 1;
      return;
    }
    if (execution.transactionalNoOp) {
      console.log('COMMIT transactional no-op — no currently DUE rows');
      return;
    }
    console.log(`COMMIT succeeded: closingSnapshots=${execution.insertedClosingCount}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
