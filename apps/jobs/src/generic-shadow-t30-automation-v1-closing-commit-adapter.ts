/**
 * Generic Shadow T-30 Automation V1 — schedule-disabled closing COMMIT cycle.
 *
 * Composes Stage A discovery/planner with the existing guarded Generic
 * T-30 closing COMMIT CLI. Live Odds / MarketLine are never invoked.
 *
 * Tests inject discover/now/runClosingCommit. Production CLI supplies
 * Prisma discovery and one spawn of capture-shadow-model-t30-closing-v1-2026.ts
 * per eligible DUE capture run, in captureRunId order.
 *
 * After the first failed or UNKNOWN child, remaining writers are not invoked.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { PrismaClient } from '@prisma/client';
import {
  planGenericShadowT30Automation,
  type GenericShadowT30AutomationPlan,
} from '../../web/lib/generic-shadow-t30-automation-v1';
import {
  buildGenericShadowT30ClosingCommitCycleReport,
  childClosingCommitFailed,
  decideGenericShadowT30ClosingCommit,
  expectedGenericShadowT30ClosingChildConfirmation,
  expectedGenericShadowT30ClosingCommitConfirmation,
  notAttemptedRunResult,
  runResultFromChildSummary,
  type GenericShadowT30ClosingChildSummary,
  type GenericShadowT30ClosingCommitCycleReport,
  type GenericShadowT30ClosingCommitMode,
  type GenericShadowT30ClosingCommitRunResult,
  type GenericShadowT30ClosingPersistenceStatus,
} from '../../web/lib/generic-shadow-t30-automation-v1-closing-commit';
import {
  discoverGenericShadowT30AutomationFrames,
  type GenericShadowT30AutomationDiscovery,
} from './generic-shadow-t30-automation-v1-adapter';

export interface GenericShadowT30ClosingCommitRequest {
  season: number;
  week: number;
  captureRunId: string;
  confirmation: string;
  reportPath: string;
}

export interface GenericShadowT30ClosingCommitCycleInput {
  season: number;
  week: number;
  mode: GenericShadowT30ClosingCommitMode;
  confirmation: string;
  repoCommitSha: string;
  githubRef: string | null;
  childReportDir: string;
  now: () => Date;
  discover: () => Promise<GenericShadowT30AutomationDiscovery>;
  runClosingCommit?: (
    request: GenericShadowT30ClosingCommitRequest
  ) => Promise<GenericShadowT30ClosingChildSummary>;
  initialPlan?: GenericShadowT30AutomationPlan;
  initialObservedTimestamp?: Date;
  initialDiscoveryBlockers?: string[];
}

function uniqueSorted(values: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < values.length; i++) {
    if (out.indexOf(values[i]) === -1) out.push(values[i]);
  }
  out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return out;
}

function mergeDiscovery(
  plan: GenericShadowT30AutomationPlan,
  discoveryBlockers: string[]
): GenericShadowT30AutomationPlan {
  const blockers = uniqueSorted([...discoveryBlockers, ...plan.blockers]);
  return {
    ...plan,
    blockers,
    writeSafe: blockers.length === 0 && plan.writeSafe,
    outcome: blockers.length > 0 ? 'BLOCKED' : plan.outcome,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function sanitizePathToken(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-');
}

export function defaultClosingChildReportPath(
  childReportDir: string,
  captureRunId: string
): string {
  return path.join(
    childReportDir,
    `generic-shadow-t30-automation-v1-closing-child-${sanitizePathToken(captureRunId)}.json`
  );
}

function unknownClosingChild(
  captureRunId: string,
  error: string,
  extras: Partial<GenericShadowT30ClosingChildSummary> = {}
): GenericShadowT30ClosingChildSummary {
  return {
    captureRunId,
    modelDefinitionId: extras.modelDefinitionId ?? '',
    observedTimestamp: extras.observedTimestamp ?? null,
    existingCount: extras.existingCount ?? 0,
    futureCount: extras.futureCount ?? 0,
    dueCount: extras.dueCount ?? 0,
    missedCount: extras.missedCount ?? 0,
    plannedInsertCount: extras.plannedInsertCount ?? 0,
    plannedAvailableCount: extras.plannedAvailableCount ?? 0,
    plannedUnavailableCount: extras.plannedUnavailableCount ?? 0,
    writeSafe: false,
    transactionStarted: extras.transactionStarted ?? null,
    transactionalNoOp: extras.transactionalNoOp ?? null,
    persistenceStatus: 'UNKNOWN',
    persistenceCommitted: null,
    mutationsInvoked: null,
    insertedClosingCount: extras.insertedClosingCount ?? 0,
    insertedClosingIds: extras.insertedClosingIds ?? [],
    verificationOk: null,
    verificationReasons: extras.verificationReasons ?? [],
    rolledBack: extras.rolledBack ?? null,
    commitSucceeded: extras.commitSucceeded ?? null,
    providerCalls: 0,
    blockers: uniqueSorted(['persistence_state_unknown', ...(extras.blockers ?? [error])]),
    error,
  };
}

function countsFromRaw(raw: Record<string, unknown>): {
  existingCount: number;
  futureCount: number;
  dueCount: number;
  missedCount: number;
  plannedInsertCount: number;
  plannedAvailableCount: number;
  plannedUnavailableCount: number;
} {
  const counts = isRecord(raw.counts) ? raw.counts : {};
  return {
    existingCount: asNumber(counts.existingCount),
    futureCount: asNumber(counts.futureCount),
    dueCount: asNumber(counts.dueCount),
    missedCount: asNumber(counts.missedCount),
    plannedInsertCount: asNumber(counts.plannedInsertCount),
    plannedAvailableCount: asNumber(counts.plannedAvailableCount),
    plannedUnavailableCount: asNumber(counts.plannedUnavailableCount),
  };
}

export function summarizeGuardedClosingReport(
  raw: unknown,
  captureRunId: string
): GenericShadowT30ClosingChildSummary {
  if (!isRecord(raw)) {
    return unknownClosingChild(captureRunId, 'child_report_insufficient');
  }
  const mutationsInvoked = raw.mutationsInvoked;
  if (typeof mutationsInvoked !== 'boolean') {
    return unknownClosingChild(captureRunId, 'persistence_state_unknown', {
      modelDefinitionId: typeof raw.modelDefinitionId === 'string' ? raw.modelDefinitionId : '',
      blockers: Array.isArray(raw.writeBlockers) ? raw.writeBlockers.map(String) : [],
      ...countsFromRaw(raw),
    });
  }
  const persistenceCommitted =
    typeof raw.persistenceCommitted === 'boolean' ? raw.persistenceCommitted : null;
  const rolledBack = typeof raw.rolledBack === 'boolean' ? raw.rolledBack : null;
  let persistenceStatus: GenericShadowT30ClosingPersistenceStatus = 'NOT_PERSISTED';
  if (mutationsInvoked === true) {
    if (persistenceCommitted == null && rolledBack == null) {
      return unknownClosingChild(captureRunId, 'persistence_state_unknown', {
        modelDefinitionId: typeof raw.modelDefinitionId === 'string' ? raw.modelDefinitionId : '',
        mutationsInvoked: true,
        ...countsFromRaw(raw),
      });
    }
    if (persistenceCommitted === true && rolledBack !== true) {
      persistenceStatus = 'PERSISTED';
    }
  }
  const observed =
    typeof raw.observedTimestamp === 'string' || raw.observedTimestamp instanceof Date
      ? new Date(raw.observedTimestamp as string | Date)
      : null;
  const counts = countsFromRaw(raw);
  const writeBlockers = Array.isArray(raw.writeBlockers) ? raw.writeBlockers.map(String) : [];
  const providerCalls = raw.providerCalls;
  if (providerCalls != null && providerCalls !== 0) {
    return unknownClosingChild(captureRunId, 'child_provider_calls_nonzero', {
      modelDefinitionId: typeof raw.modelDefinitionId === 'string' ? raw.modelDefinitionId : '',
      blockers: writeBlockers,
      ...counts,
    });
  }
  return {
    captureRunId: typeof raw.captureRunId === 'string' ? raw.captureRunId : captureRunId,
    modelDefinitionId: typeof raw.modelDefinitionId === 'string' ? raw.modelDefinitionId : '',
    observedTimestamp: observed && Number.isFinite(observed.getTime()) ? observed : null,
    ...counts,
    writeSafe: raw.writeSafe === true,
    transactionStarted: typeof raw.transactionStarted === 'boolean' ? raw.transactionStarted : null,
    transactionalNoOp: typeof raw.transactionalNoOp === 'boolean' ? raw.transactionalNoOp : null,
    persistenceStatus,
    persistenceCommitted,
    mutationsInvoked,
    insertedClosingCount: asNumber(raw.insertedClosingCount),
    insertedClosingIds: asStringArray(raw.insertedClosingIds),
    verificationOk: typeof raw.verificationOk === 'boolean' ? raw.verificationOk : null,
    verificationReasons: asStringArray(raw.verificationReasons),
    rolledBack,
    commitSucceeded: typeof raw.commitSucceeded === 'boolean' ? raw.commitSucceeded : null,
    providerCalls: 0,
    blockers: writeBlockers,
    error: typeof raw.error === 'string' ? raw.error : null,
  };
}

export function readGuardedClosingChildReport(
  reportPath: string,
  captureRunId: string
): GenericShadowT30ClosingChildSummary {
  if (!fs.existsSync(reportPath)) {
    return unknownClosingChild(captureRunId, 'child_report_missing');
  }
  try {
    const raw = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    return summarizeGuardedClosingReport(raw, captureRunId);
  } catch (err) {
    return unknownClosingChild(
      captureRunId,
      `child_report_unreadable:${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export function invokeGuardedGenericShadowT30ClosingCommit(
  request: GenericShadowT30ClosingCommitRequest
): GenericShadowT30ClosingChildSummary {
  const result = spawnSync(
    'npx',
    [
      'tsx',
      'apps/jobs/capture-shadow-model-t30-closing-v1-2026.ts',
      '--season',
      String(request.season),
      '--week',
      String(request.week),
      '--capture-run-id',
      request.captureRunId,
      '--mode',
      'COMMIT',
      '--confirm',
      request.confirmation,
      '--report',
      request.reportPath,
    ],
    {
      encoding: 'utf8',
      cwd: process.cwd(),
      env: process.env,
      timeout: 20 * 60 * 1000,
    }
  );

  if (fs.existsSync(request.reportPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(request.reportPath, 'utf8'));
      return summarizeGuardedClosingReport(raw, request.captureRunId);
    } catch (err) {
      return unknownClosingChild(
        request.captureRunId,
        `child_report_unreadable:${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const message = (result.stderr || result.stdout || result.error?.message || 'closing_commit_failed')
    .toString()
    .trim()
    .slice(0, 500);
  return unknownClosingChild(request.captureRunId, message || 'child_report_missing');
}

export async function discoverWithPrisma(
  prisma: PrismaClient,
  args: { season: number; week: number }
): Promise<GenericShadowT30AutomationDiscovery> {
  return discoverGenericShadowT30AutomationFrames(prisma, args);
}

export async function runGenericShadowT30ClosingCommitCycle(
  input: GenericShadowT30ClosingCommitCycleInput
): Promise<GenericShadowT30ClosingCommitCycleReport> {
  const initialObservedTimestamp = input.initialObservedTimestamp ?? input.now();
  const initialDiscovery = input.initialPlan
    ? { blockers: input.initialDiscoveryBlockers ?? [], frames: [] }
    : await input.discover();
  const initialPlan = mergeDiscovery(
    input.initialPlan ??
      planGenericShadowT30Automation({
        season: input.season,
        week: input.week,
        observedTimestamp: initialObservedTimestamp,
        frames: initialDiscovery.frames,
      }),
    input.initialDiscoveryBlockers ?? initialDiscovery.blockers
  );

  const extraBlockers: string[] = [];
  if (input.mode === 'COMMIT') {
    const expected = expectedGenericShadowT30ClosingCommitConfirmation(input.week);
    if (input.confirmation !== expected) {
      extraBlockers.push('closing_commit_confirmation_invalid');
    }
  }

  const gatedPlan =
    extraBlockers.length > 0 ? mergeDiscovery(initialPlan, extraBlockers) : initialPlan;
  const decision = decideGenericShadowT30ClosingCommit(gatedPlan);

  const runResults: GenericShadowT30ClosingCommitRunResult[] = gatedPlan.runPlans.map((run) =>
    notAttemptedRunResult(run)
  );
  let finalPlan: GenericShadowT30AutomationPlan | null = null;
  let finalObservedTimestamp: Date | null = null;

  const mayCommit =
    input.mode === 'COMMIT' && extraBlockers.length === 0 && decision.closingCommitRequested;

  if (mayCommit) {
    let stopFurther = false;
    for (let i = 0; i < decision.dueCaptureRunIds.length; i++) {
      const captureRunId = decision.dueCaptureRunIds[i];
      const runIndex = runResults.findIndex((run) => run.captureRunId === captureRunId);
      const runPlan = gatedPlan.runPlans.filter((run) => run.captureRunId === captureRunId)[0];
      if (!runPlan || runIndex < 0) continue;
      const childReportPath = defaultClosingChildReportPath(input.childReportDir, captureRunId);
      if (stopFurther) {
        runResults[runIndex] = notAttemptedRunResult(runPlan, {
          childReportPath,
          skippedAfterPriorChildFailure: true,
          error: 'skipped_after_prior_child_failure',
        });
        continue;
      }
      const childConfirmation = expectedGenericShadowT30ClosingChildConfirmation(
        input.week,
        captureRunId
      );
      let child: GenericShadowT30ClosingChildSummary;
      try {
        if (!input.runClosingCommit) {
          child = unknownClosingChild(captureRunId, 'closing_commit_boundary_missing');
        } else {
          child = await input.runClosingCommit({
            season: input.season,
            week: input.week,
            captureRunId,
            confirmation: childConfirmation,
            reportPath: childReportPath,
          });
        }
      } catch (err) {
        child = readGuardedClosingChildReport(childReportPath, captureRunId);
        if (child.persistenceStatus === 'UNKNOWN') {
          child = unknownClosingChild(
            captureRunId,
            err instanceof Error ? err.message : String(err)
          );
        }
      }
      runResults[runIndex] = runResultFromChildSummary(runPlan, child, { childReportPath });
      if (childClosingCommitFailed(child)) {
        stopFurther = true;
      }
    }

    const anyPersisted = runResults.some((run) => run.persistenceStatus === 'PERSISTED');
    if (anyPersisted) {
      try {
        finalObservedTimestamp = input.now();
        const finalDiscovery = await input.discover();
        finalPlan = mergeDiscovery(
          planGenericShadowT30Automation({
            season: input.season,
            week: input.week,
            observedTimestamp: finalObservedTimestamp,
            frames: finalDiscovery.frames,
          }),
          finalDiscovery.blockers
        );
      } catch (err) {
        extraBlockers.push(
          `post_commit_replan_failed:${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else if (!finalObservedTimestamp) {
      finalObservedTimestamp = input.now();
    }
  } else if (input.mode === 'COMMIT') {
    finalObservedTimestamp = input.now();
  }

  return buildGenericShadowT30ClosingCommitCycleReport({
    season: input.season,
    week: input.week,
    mode: input.mode,
    repoCommitSha: input.repoCommitSha,
    githubRef: input.githubRef,
    initialObservedTimestamp,
    finalObservedTimestamp,
    initialPlan: gatedPlan,
    finalPlan,
    runResults,
    extraBlockers,
  });
}
