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

function emptyLiveOddsFailure(
  error: string,
  extras: Partial<GenericShadowT30LiveOddsCommitSummary> = {}
): GenericShadowT30LiveOddsCommitSummary {
  return {
    providerCallAttempted: true,
    providerCallSucceeded: false,
    providerCalls: extras.providerCalls ?? 0,
    providerCredits: extras.providerCredits ?? null,
    writeSafe: false,
    blockers: extras.blockers ?? [error],
    proposedInsertCount: extras.proposedInsertCount ?? 0,
    insertedCount: extras.insertedCount ?? null,
    persistenceInvoked: extras.persistenceInvoked ?? false,
    postwriteVerificationStatus: extras.postwriteVerificationStatus ?? 'PROVIDER_FAILED',
    verificationOk: extras.verificationOk ?? false,
    error,
  };
}

export function summarizeGuardedLiveOddsReport(
  raw: unknown,
  spawnStatus: number
): GenericShadowT30LiveOddsCommitSummary {
  const report = raw as {
    plan?: {
      providerCalls?: number;
      requestCreditsLast?: number | null;
      providerUsage?: {
        requestsLast?: string | null;
        requestsUsed?: string | null;
        requestsRemaining?: string | null;
      };
      writeSafe?: boolean;
      writeBlockers?: string[];
      proposedInsert?: unknown[];
    };
    execution?: {
      marketLinePersistenceInvoked?: boolean;
      commitSucceeded?: boolean;
      proposedBeforeTransaction?: number;
      insertedThisRun?: number | null;
      createManyCount?: number | null;
      postWriteVerificationSucceeded?: boolean | null;
      error?: string | null;
    };
    verification?: { ok?: boolean } | null;
  } | null;

  const plan = report?.plan;
  const execution = report?.execution;
  const verification = report?.verification;
  const providerCalls = plan?.providerCalls ?? 0;
  const providerCallSucceeded = providerCalls === 1;
  const persistenceInvoked = !!execution?.marketLinePersistenceInvoked;
  const verificationOk =
    verification && typeof verification.ok === 'boolean'
      ? verification.ok
      : execution?.postWriteVerificationSucceeded ?? null;

  let postwriteVerificationStatus: GenericShadowT30PostwriteVerificationStatus =
    'NOT_ATTEMPTED';
  if (!providerCallSucceeded) {
    postwriteVerificationStatus = providerCalls > 0 ? 'PROVIDER_FAILED' : 'COMMIT_BLOCKED';
  } else if (persistenceInvoked) {
    postwriteVerificationStatus = verificationOk === true ? 'PASSED' : 'FAILED';
  } else {
    postwriteVerificationStatus = 'COMMIT_BLOCKED';
  }

  const error =
    execution?.error ||
    (spawnStatus !== 0 && !persistenceInvoked
      ? `live_odds_commit_exited_${spawnStatus}`
      : null);

  return {
    providerCallAttempted: providerCalls > 0 || spawnStatus !== 0,
    providerCallSucceeded,
    providerCalls,
    providerCredits: {
      requestsLast: plan?.providerUsage?.requestsLast ?? null,
      requestsUsed: plan?.providerUsage?.requestsUsed ?? null,
      requestsRemaining: plan?.providerUsage?.requestsRemaining ?? null,
      requestCreditsLast: plan?.requestCreditsLast ?? null,
    },
    writeSafe: !!plan?.writeSafe,
    blockers: Array.isArray(plan?.writeBlockers) ? plan.writeBlockers.map(String) : [],
    proposedInsertCount: Array.isArray(plan?.proposedInsert)
      ? plan.proposedInsert.length
      : execution?.proposedBeforeTransaction ?? 0,
    insertedCount: execution?.insertedThisRun ?? execution?.createManyCount ?? null,
    persistenceInvoked,
    postwriteVerificationStatus,
    verificationOk,
    error,
  };
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
      return emptyLiveOddsFailure(
        `live_odds_report_unreadable:${err instanceof Error ? err.message : String(err)}`
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
  return emptyLiveOddsFailure(message || `live_odds_commit_exited_${result.status ?? 1}`);
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
        liveOdds = emptyLiveOddsFailure('live_odds_commit_boundary_missing');
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
          liveOdds = emptyLiveOddsFailure(
            err instanceof Error ? err.message : String(err)
          );
        }
      }
      if (liveOddsInvoked && liveOdds.providerCallSucceeded && liveOdds.verificationOk === true) {
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
}

export function defaultLiveOddsReportPath(season: number, week: number): string {
  return path.join(
    process.cwd(),
    'reports',
    `live-odds-2026-${season}-week-${week}-generic-shadow-t30-market-refresh.json`
  );
}
