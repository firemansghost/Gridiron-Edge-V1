/**
 * Generic Shadow T-30 Automation V1 — schedule-disabled market-refresh cycle.
 *
 * Composes Stage A discovery/planner with the existing guarded Live Odds
 * COMMIT CLI. Closing COMMIT is never invoked.
 *
 * Tests inject discover/now/runLiveOddsCommit. Production CLI supplies
 * Prisma discovery and a one-shot spawn of write-live-odds-2026.ts.
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
  buildGenericShadowT30MarketRefreshCycleReport,
  decideGenericShadowT30MarketRefresh,
  expectedGenericShadowT30MarketRefreshConfirmation,
  type GenericShadowT30LiveOddsCommitSummary,
  type GenericShadowT30MarketRefreshCycleReport,
  type GenericShadowT30MarketRefreshMode,
  type GenericShadowT30PersistenceStatus,
  type GenericShadowT30PostwriteVerificationStatus,
} from '../../web/lib/generic-shadow-t30-automation-v1-market-refresh';
import { expectedWriteConfirmation } from './odds/live-odds-2026';
import {
  discoverGenericShadowT30AutomationFrames,
  type GenericShadowT30AutomationDiscovery,
} from './generic-shadow-t30-automation-v1-adapter';

export interface GenericShadowT30LiveOddsCommitRequest {
  season: number;
  week: number;
  confirmation: string;
  reportPath: string;
}

export interface GenericShadowT30MarketRefreshCycleInput {
  season: number;
  week: number;
  mode: GenericShadowT30MarketRefreshMode;
  confirmation: string;
  repoCommitSha: string;
  githubRef: string | null;
  liveOddsReportPath: string;
  now: () => Date;
  discover: () => Promise<GenericShadowT30AutomationDiscovery>;
  runLiveOddsCommit?: (
    request: GenericShadowT30LiveOddsCommitRequest
  ) => Promise<GenericShadowT30LiveOddsCommitSummary>;
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

function unknownLiveOddsChild(
  error: string,
  extras: Partial<GenericShadowT30LiveOddsCommitSummary> = {}
): GenericShadowT30LiveOddsCommitSummary {
  return {
    providerCallAttempted: true,
    providerCallSucceeded: extras.providerCallSucceeded ?? false,
    providerCalls: extras.providerCalls ?? 0,
    providerCredits: extras.providerCredits ?? null,
    writeSafe: false,
    blockers: uniqueSorted([
      'persistence_state_unknown',
      ...(extras.blockers ?? [error]),
    ]),
    proposedInsertCount: extras.proposedInsertCount ?? 0,
    insertedCount: extras.insertedCount ?? null,
    persistenceInvoked: null,
    persistenceStatus: 'UNKNOWN',
    postwriteVerificationStatus: 'UNKNOWN',
    verificationOk: null,
    error,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function summarizeGuardedLiveOddsReport(
  raw: unknown,
  spawnStatus: number
): GenericShadowT30LiveOddsCommitSummary {
  if (!isRecord(raw) || !isRecord(raw.plan)) {
    return unknownLiveOddsChild('child_report_insufficient', {
      providerCalls: 0,
    });
  }

  const plan = raw.plan;
  const execution = isRecord(raw.execution) ? raw.execution : null;
  const verification = isRecord(raw.verification) ? raw.verification : null;
  const providerCalls = typeof plan.providerCalls === 'number' ? plan.providerCalls : 0;
  const providerCallSucceeded = providerCalls === 1;
  const providerUsage = isRecord(plan.providerUsage) ? plan.providerUsage : null;
  const writeBlockers = Array.isArray(plan.writeBlockers)
    ? plan.writeBlockers.map(String)
    : [];
  const proposedInsertCount = Array.isArray(plan.proposedInsert)
    ? plan.proposedInsert.length
    : typeof execution?.proposedBeforeTransaction === 'number'
      ? execution.proposedBeforeTransaction
      : 0;
  const persistenceFlag = execution?.marketLinePersistenceInvoked;
  if (typeof persistenceFlag !== 'boolean') {
    return unknownLiveOddsChild('persistence_state_unknown', {
      providerCallSucceeded,
      providerCalls,
      providerCredits: {
        requestsLast: typeof providerUsage?.requestsLast === 'string' ? providerUsage.requestsLast : null,
        requestsUsed: typeof providerUsage?.requestsUsed === 'string' ? providerUsage.requestsUsed : null,
        requestsRemaining:
          typeof providerUsage?.requestsRemaining === 'string' ? providerUsage.requestsRemaining : null,
        requestCreditsLast:
          typeof plan.requestCreditsLast === 'number' ? plan.requestCreditsLast : null,
      },
      blockers: writeBlockers.length > 0 ? writeBlockers : ['persistence_state_unknown'],
      proposedInsertCount,
    });
  }

  const persistenceStatus: GenericShadowT30PersistenceStatus = persistenceFlag
    ? 'PERSISTED'
    : 'NOT_PERSISTED';
  const verificationOk =
    verification && typeof verification.ok === 'boolean'
      ? verification.ok
      : typeof execution?.postWriteVerificationSucceeded === 'boolean'
        ? execution.postWriteVerificationSucceeded
        : null;

  let postwriteVerificationStatus: GenericShadowT30PostwriteVerificationStatus = 'NOT_ATTEMPTED';
  if (persistenceStatus === 'PERSISTED') {
    postwriteVerificationStatus = verificationOk === true ? 'PASSED' : 'FAILED';
  } else if (!providerCallSucceeded) {
    postwriteVerificationStatus = providerCalls > 0 ? 'PROVIDER_FAILED' : 'COMMIT_BLOCKED';
  } else {
    postwriteVerificationStatus = 'COMMIT_BLOCKED';
  }

  const insertedCount =
    typeof execution?.insertedThisRun === 'number'
      ? execution.insertedThisRun
      : typeof execution?.createManyCount === 'number'
        ? execution.createManyCount
        : null;
  const error =
    (typeof execution?.error === 'string' && execution.error) ||
    (spawnStatus !== 0 && persistenceStatus !== 'PERSISTED'
      ? `live_odds_commit_exited_${spawnStatus}`
      : null);

  return {
    providerCallAttempted: providerCalls > 0 || spawnStatus !== 0,
    providerCallSucceeded,
    providerCalls,
    providerCredits: {
      requestsLast: typeof providerUsage?.requestsLast === 'string' ? providerUsage.requestsLast : null,
      requestsUsed: typeof providerUsage?.requestsUsed === 'string' ? providerUsage.requestsUsed : null,
      requestsRemaining:
        typeof providerUsage?.requestsRemaining === 'string' ? providerUsage.requestsRemaining : null,
      requestCreditsLast: typeof plan.requestCreditsLast === 'number' ? plan.requestCreditsLast : null,
    },
    writeSafe: plan.writeSafe === true,
    blockers: writeBlockers,
    proposedInsertCount,
    insertedCount,
    persistenceInvoked: persistenceFlag,
    persistenceStatus,
    postwriteVerificationStatus,
    verificationOk,
    error,
  };
}

export function readGuardedLiveOddsChildReport(
  reportPath: string,
  spawnStatus = 1
): GenericShadowT30LiveOddsCommitSummary {
  if (!fs.existsSync(reportPath)) {
    return unknownLiveOddsChild('child_report_missing');
  }
  try {
    const raw = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    return summarizeGuardedLiveOddsReport(raw, spawnStatus);
  } catch (err) {
    return unknownLiveOddsChild(
      `child_report_unreadable:${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export function invokeGuardedLiveOddsCommit(
  request: GenericShadowT30LiveOddsCommitRequest
): GenericShadowT30LiveOddsCommitSummary {
  const result = spawnSync(
    'npx',
    [
      'tsx',
      'apps/jobs/write-live-odds-2026.ts',
      '--season',
      String(request.season),
      '--week',
      String(request.week),
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

  let raw: unknown = null;
  if (fs.existsSync(request.reportPath)) {
    try {
      raw = JSON.parse(fs.readFileSync(request.reportPath, 'utf8'));
    } catch (err) {
      return unknownLiveOddsChild(
        `child_report_unreadable:${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  if (raw) {
    return summarizeGuardedLiveOddsReport(raw, result.status ?? 1);
  }

  const message = (result.stderr || result.stdout || result.error?.message || 'live_odds_commit_failed')
    .toString()
    .trim()
    .slice(0, 500);
  return unknownLiveOddsChild(message || `child_report_missing`);
}

export async function discoverWithPrisma(
  prisma: PrismaClient,
  args: { season: number; week: number }
): Promise<GenericShadowT30AutomationDiscovery> {
  return discoverGenericShadowT30AutomationFrames(prisma, args);
}

export async function runGenericShadowT30MarketRefreshCycle(
  input: GenericShadowT30MarketRefreshCycleInput
): Promise<GenericShadowT30MarketRefreshCycleReport> {
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
    const expected = expectedGenericShadowT30MarketRefreshConfirmation(input.week);
    if (input.confirmation !== expected) {
      extraBlockers.push('market_refresh_confirmation_invalid');
    }
  }

  const gatedPlan =
    extraBlockers.length > 0
      ? mergeDiscovery(initialPlan, extraBlockers)
      : initialPlan;
  const initialDecision = decideGenericShadowT30MarketRefresh(gatedPlan);

  let liveOdds: GenericShadowT30LiveOddsCommitSummary | null = null;
  let postRefreshObservedTimestamp: Date | null = null;
  let finalPlan: GenericShadowT30AutomationPlan | null = null;
  let liveOddsInvoked = false;

  try {
    const mayRefresh =
      input.mode === 'COMMIT' &&
      extraBlockers.length === 0 &&
      initialDecision.providerCallRequested &&
      !initialDecision.failClosed;

    if (mayRefresh) {
    const preRefreshObserved = input.now();
    const preDiscovery = await input.discover();
    const prePlan = mergeDiscovery(
      planGenericShadowT30Automation({
        season: input.season,
        week: input.week,
        observedTimestamp: preRefreshObserved,
        frames: preDiscovery.frames,
      }),
      preDiscovery.blockers
    );
    const preDecision = decideGenericShadowT30MarketRefresh(prePlan);
    if (preDecision.failClosed) {
      extraBlockers.push(...preDecision.reasons);
      finalPlan = prePlan;
    } else if (preDecision.providerCallRequested) {
      if (!input.runLiveOddsCommit) {
        liveOdds = unknownLiveOddsChild('live_odds_commit_boundary_missing');
      } else {
        liveOddsInvoked = true;
        try {
          liveOdds = await input.runLiveOddsCommit({
            season: input.season,
            week: input.week,
            confirmation: expectedWriteConfirmation(input.week),
            reportPath: input.liveOddsReportPath,
          });
        } catch (err) {
          liveOdds = readGuardedLiveOddsChildReport(input.liveOddsReportPath, 1);
          if (liveOdds.persistenceStatus === 'UNKNOWN') {
            liveOdds = unknownLiveOddsChild(
              err instanceof Error ? err.message : String(err)
            );
          }
        }
      }
      const persistedAndVerified =
        liveOdds.persistenceStatus === 'PERSISTED' && liveOdds.verificationOk === true;
      if (liveOddsInvoked && persistedAndVerified) {
        try {
          postRefreshObservedTimestamp = input.now();
          const finalDiscovery = await input.discover();
          finalPlan = mergeDiscovery(
            planGenericShadowT30Automation({
              season: input.season,
              week: input.week,
              observedTimestamp: postRefreshObservedTimestamp,
              frames: finalDiscovery.frames,
            }),
            finalDiscovery.blockers
          );
        } catch (err) {
          extraBlockers.push(
            `post_refresh_replan_failed:${err instanceof Error ? err.message : String(err)}`
          );
          finalPlan = prePlan;
        }
      } else {
        finalPlan = prePlan;
      }
    } else {
      finalPlan = prePlan;
    }
    }

    return buildGenericShadowT30MarketRefreshCycleReport({
      season: input.season,
      week: input.week,
      mode: input.mode,
      repoCommitSha: input.repoCommitSha,
      githubRef: input.githubRef,
      initialObservedTimestamp,
      postRefreshObservedTimestamp,
      initialPlan: gatedPlan,
      finalPlan,
      liveOdds,
      extraBlockers,
    });
  } catch (err) {
    if (
      liveOdds &&
      (liveOdds.persistenceStatus === 'PERSISTED' || liveOdds.persistenceStatus === 'UNKNOWN')
    ) {
      extraBlockers.push(
        `coordinator_exception:${err instanceof Error ? err.message : String(err)}`
      );
      return buildGenericShadowT30MarketRefreshCycleReport({
        season: input.season,
        week: input.week,
        mode: input.mode,
        repoCommitSha: input.repoCommitSha,
        githubRef: input.githubRef,
        initialObservedTimestamp,
        postRefreshObservedTimestamp,
        initialPlan: gatedPlan,
        finalPlan,
        liveOdds,
        extraBlockers,
      });
    }
    throw err;
  }
}

export function defaultLiveOddsReportPath(season: number, week: number): string {
  return path.join(
    process.cwd(),
    'reports',
    `live-odds-2026-${season}-week-${week}-generic-shadow-t30-market-refresh.json`
  );
}
