/**
 * CLI — Generic Shadow CORE_EVAL_V1 read-only evaluator.
 *
 * Production DB SELECTs only.
 * providerCalls=0.
 * No evaluation persistence or other production writes.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import {
  GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_HASH,
  GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_ID,
  GENERIC_SHADOW_CORE_EVAL_V1_PROTOCOL,
  evaluateGenericShadowCoreEvalV1,
} from '../web/lib/generic-shadow-core-eval-v1';
import { loadGenericShadowCoreEvalFrame } from './src/generic-shadow-core-eval-v1-adapter';

function parseArgs(argv: string[]): { captureRunId: string; reportPath?: string } {
  let captureRunId = '';
  let reportPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--capture-run-id') captureRunId = String(argv[++i] ?? '').trim();
    else if (arg === '--report') reportPath = String(argv[++i] ?? '').trim();
  }
  return { captureRunId, reportPath };
}

function safeName(value: string): string {
  const out = value.replace(/[^A-Za-z0-9_.-]+/g, '_');
  return out.length ? out : 'unknown';
}

function defaultReportPath(captureRunId: string): string {
  return path.join(
    process.cwd(),
    'reports',
    `generic-shadow-core-eval-v1-${safeName(captureRunId)}-READONLY.json`
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
  if (!args.captureRunId) throw new Error('capture_run_id is required');

  const url = process.env.DIRECT_URL;
  if (!url) throw new Error('DIRECT_URL required');

  const evaluatedAt = new Date();
  const runtimeRepoCommitSha = readRepoCommitSha();
  const reportPath = args.reportPath ?? defaultReportPath(args.captureRunId);

  console.log('============================================================');
  console.log('GENERIC SHADOW CORE_EVAL_V1 — READ-ONLY EVALUATOR');
  console.log('============================================================');
  console.log(`capture_run_id=${args.captureRunId}`);
  console.log(`evaluatorDefinitionId=${GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_ID}`);
  console.log(`evaluatorDefinitionHash=${GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_HASH}`);
  console.log(`evaluationProtocol=${GENERIC_SHADOW_CORE_EVAL_V1_PROTOCOL}`);
  console.log('production DB SELECTs only; providerCalls=0; mutationsInvoked=false');

  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const loaded = await loadGenericShadowCoreEvalFrame(prisma, args.captureRunId);
    if (!loaded.frame) {
      const failureReport = {
        evaluatorDefinitionId: GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_ID,
        evaluatorDefinitionHash: GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_HASH,
        evaluationProtocol: GENERIC_SHADOW_CORE_EVAL_V1_PROTOCOL,
        evaluatedAt: evaluatedAt.toISOString(),
        runtimeRepoCommitSha,
        githubRef: process.env.GITHUB_REF ?? null,
        captureRunId: args.captureRunId,
        readOnly: true,
        providerCalls: 0,
        mutationsInvoked: false,
        reportValid: false,
        blockers: loaded.blockers,
        captureRun: null,
        counts: null,
        atsWinRate: null,
        totalGradedStake: 0,
        totalResearchPnl: 0,
        researchRoi: null,
        averageClvPoints: null,
        perPrediction: [],
        evaluationWrites: false,
        predictionWrites: false,
        closingWrites: false,
        hybridWrites: false,
        betWrites: false,
        matchupOutputWrites: false,
        gameWrites: false,
        prismaMigrateInvoked: false,
      };
      writeReport(reportPath, failureReport);
      console.error(`BLOCKED: ${loaded.blockers.join(' | ')}`);
      process.exitCode = 1;
      return;
    }

    const evaluated = evaluateGenericShadowCoreEvalV1({
      frame: loaded.frame,
      evaluatedAt,
    });

    const report = {
      ...evaluated,
      runtimeRepoCommitSha,
      githubRef: process.env.GITHUB_REF ?? null,
      adapterBlockers: loaded.blockers,
      evaluationWrites: false,
      predictionWrites: false,
      closingWrites: false,
      hybridWrites: false,
      betWrites: false,
      matchupOutputWrites: false,
      gameWrites: false,
      prismaMigrateInvoked: false,
    };

    writeReport(reportPath, report);
    console.log(
      `reportValid=${report.reportValid} total=${report.counts.totalPredictions} graded=${report.counts.atsGradedCount} clvAvailable=${report.counts.clvAvailableCount}`
    );
    console.log(
      `W-L-P=${report.counts.atsWinCount}-${report.counts.atsLossCount}-${report.counts.atsPushCount} ROI=${report.researchRoi ?? 'null'} avgCLV=${report.averageClvPoints ?? 'null'}`
    );
    if (report.blockers.length) console.log(`blockers=${report.blockers.join(' | ')}`);
    console.log('READ-ONLY evaluation complete — production DB unchanged');
    process.exitCode = report.reportValid ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
