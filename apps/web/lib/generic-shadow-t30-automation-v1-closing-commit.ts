/**
 * Generic Shadow T-30 Automation V1 — schedule-disabled closing COMMIT.
 *
 * Pure decision/report helpers only.
 * No Prisma, providers, system clock, or writes.
 *
 * Stage A planner semantics stay frozen. This layer decides whether the
 * existing Generic T-30 closing COMMIT boundary may be invoked at most
 * once per eligible DUE capture run.
 *
 * Multiple capture runs for the same physical game are NOT deduplicated.
 * COMMIT writer authorization uses the fresh pre-COMMIT plan only.
 */

import type {
  GenericShadowT30AutomationOutcome,
  GenericShadowT30AutomationPlan,
  GenericShadowT30AutomationRunPlan,
} from './generic-shadow-t30-automation-v1';
import { expectedGenericShadowT30WriteConfirmation } from './shadow-model-t30-closing-v1';

export const GENERIC_SHADOW_T30_CLOSING_COMMIT_CAPABILITY =
  'generic_shadow_t30_automation_v1_closing_commit' as const;
export const GENERIC_SHADOW_T30_CLOSING_COMMIT_STAGE =
  'D_CLOSING_COMMIT_SCHEDULE_DISABLED' as const;
export const GENERIC_SHADOW_T30_CLOSING_COMMIT_SCHEDULE_ENABLED = false as const;
export const GENERIC_SHADOW_T30_CLOSING_COMMIT_PRODUCTION_EXECUTION_AUTHORIZED =
  false as const;

export type GenericShadowT30ClosingCommitMode = 'PLAN' | 'COMMIT';

export type GenericShadowT30ClosingCommitCycleOutcome =
  | 'NO_ACTION'
  | 'PREVIEW_ONLY'
  | 'CLOSINGS_CAPTURED'
  | 'MISSED_TARGET_PRESENT'
  | 'BLOCKED'
  | 'FAILED';

export type GenericShadowT30ClosingCommitAction =
  | 'NO_CLOSING_COMMIT'
  | 'REQUEST_DUE_CLOSING_COMMITS';

export type GenericShadowT30ClosingMutationTarget = 'ShadowModelClosingMarketSnapshot';

export type GenericShadowT30ClosingPersistenceStatus =
  | 'NOT_ATTEMPTED'
  | 'NOT_PERSISTED'
  | 'PERSISTED'
  | 'UNKNOWN';

export type GenericShadowT30ClosingPostwriteVerificationStatus =
  | 'PASSED'
  | 'FAILED'
  | 'NOT_APPLICABLE'
  | 'COMMIT_BLOCKED'
  | 'NOT_ATTEMPTED'
  | 'UNKNOWN';

export type GenericShadowT30ClosingReportKind = 'PLAN' | 'TERMINAL';

export function expectedGenericShadowT30ClosingCommitConfirmation(week: number): string {
  return `CAPTURE_2026_WEEK_${week}_GENERIC_SHADOW_T30_AUTOMATED_CLOSINGS`;
}

export function expectedGenericShadowT30ClosingChildConfirmation(
  week: number,
  captureRunId: string
): string {
  return expectedGenericShadowT30WriteConfirmation(week, captureRunId);
}

export interface GenericShadowT30ClosingCommitDecision {
  action: GenericShadowT30ClosingCommitAction;
  closingCommitRequested: boolean;
  failClosed: boolean;
  reasons: string[];
  dueCaptureRunIds: string[];
}

export interface GenericShadowT30ClosingChildSummary {
  captureRunId: string;
  modelDefinitionId: string;
  observedTimestamp: Date | null;
  existingCount: number;
  futureCount: number;
  dueCount: number;
  missedCount: number;
  plannedInsertCount: number;
  plannedAvailableCount: number;
  plannedUnavailableCount: number;
  writeSafe: boolean;
  transactionStarted: boolean | null;
  transactionalNoOp: boolean | null;
  persistenceStatus: GenericShadowT30ClosingPersistenceStatus;
  persistenceCommitted: boolean | null;
  mutationsInvoked: boolean | null;
  insertedClosingCount: number | null;
  insertedClosingIds: string[] | null;
  verificationOk: boolean | null;
  verificationReasons: string[];
  rolledBack: boolean | null;
  commitSucceeded: boolean | null;
  providerCalls: number;
  blockers: string[];
  error: string | null;
}

export interface GenericShadowT30ClosingCommitRunResult {
  captureRunId: string;
  modelDefinitionId: string;
  invocationAttempted: boolean;
  childConfirmationGenerated: boolean;
  childReportPath: string | null;
  observedTimestamp: Date | null;
  existingCount: number;
  futureCount: number;
  dueCount: number;
  missedCount: number;
  plannedInsertCount: number;
  plannedAvailableCount: number;
  plannedUnavailableCount: number;
  transactionStarted: boolean | null;
  transactionalNoOp: boolean | null;
  persistenceStatus: GenericShadowT30ClosingPersistenceStatus;
  persistenceCommitted: boolean | null;
  insertedClosingCount: number | null;
  insertedClosingIds: string[] | null;
  verificationOk: boolean | null;
  verificationReasons: string[];
  rolledBack: boolean | null;
  commitSucceeded: boolean | null;
  providerCalls: number;
  blockers: string[];
  error: string | null;
  skippedAfterPriorChildFailure: boolean;
}

export interface GenericShadowT30ClosingCommitCycleReport {
  automationVersion: 1;
  capability: typeof GENERIC_SHADOW_T30_CLOSING_COMMIT_CAPABILITY;
  stage: typeof GENERIC_SHADOW_T30_CLOSING_COMMIT_STAGE;
  implementationStatus: 'IMPLEMENTED';
  scheduleEnabled: false;
  productionExecutionAuthorized: false;
  season: number;
  week: number;
  mode: GenericShadowT30ClosingCommitMode;
  requestedMode: GenericShadowT30ClosingCommitMode;
  reportKind: GenericShadowT30ClosingReportKind;
  repoCommitSha: string;
  githubRef: string | null;
  initialObservedTimestamp: Date;
  preCommitObservedTimestamp: Date | null;
  finalObservedTimestamp: Date | null;
  eligibleCaptureRunIds: string[];
  eligibleModelDefinitionIds: string[];
  initialOutcome: GenericShadowT30AutomationOutcome;
  initialCounts: GenericShadowT30AutomationPlan['counts'];
  dueCaptureRunIds: string[];
  closingCommitRequested: boolean;
  runResults: GenericShadowT30ClosingCommitRunResult[];
  closingRowsPlanned: number;
  plannedAvailableCount: number;
  plannedUnavailableCount: number;
  persistedAvailableCount: number;
  persistedUnavailableCount: number;
  closingRowsInsertedKnown: number;
  closingRowsInsertedExact: number | null;
  missedCount: number;
  providerCalls: number;
  mutationTargetsInvoked: GenericShadowT30ClosingMutationTarget[] | null;
  blockers: string[];
  writeSafe: boolean;
  postwriteVerificationStatus: GenericShadowT30ClosingPostwriteVerificationStatus;
  outcome: GenericShadowT30ClosingCommitCycleOutcome;
  initialPlan: GenericShadowT30AutomationPlan;
  preCommitPlan: GenericShadowT30AutomationPlan | null;
  finalPlan: GenericShadowT30AutomationPlan | null;
}

function uniqueSorted(values: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < values.length; i++) {
    if (out.indexOf(values[i]) === -1) out.push(values[i]);
  }
  out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return out;
}

export function dueCaptureRunIdsFromPlan(
  plan: Pick<GenericShadowT30AutomationPlan, 'runPlans'>
): string[] {
  const ids: string[] = [];
  for (let i = 0; i < plan.runPlans.length; i++) {
    const run = plan.runPlans[i];
    if (run.counts.dueCount > 0) ids.push(run.captureRunId);
  }
  ids.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return ids;
}

export function decideGenericShadowT30ClosingCommit(
  plan: Pick<GenericShadowT30AutomationPlan, 'blockers' | 'writeSafe' | 'runPlans'>
): GenericShadowT30ClosingCommitDecision {
  const dueCaptureRunIds = dueCaptureRunIdsFromPlan(plan);
  if (plan.blockers.length > 0 || !plan.writeSafe) {
    return {
      action: 'NO_CLOSING_COMMIT',
      closingCommitRequested: false,
      failClosed: true,
      reasons: plan.blockers.length > 0 ? uniqueSorted(plan.blockers) : ['write_not_safe'],
      dueCaptureRunIds: [],
    };
  }
  if (dueCaptureRunIds.length === 0) {
    return {
      action: 'NO_CLOSING_COMMIT',
      closingCommitRequested: false,
      failClosed: false,
      reasons: ['no_due_capture_runs'],
      dueCaptureRunIds: [],
    };
  }
  return {
    action: 'REQUEST_DUE_CLOSING_COMMITS',
    closingCommitRequested: true,
    failClosed: false,
    reasons: ['due_uncaptured_predictions'],
    dueCaptureRunIds,
  };
}

export function childClosingCommitFailed(
  child: Pick<
    GenericShadowT30ClosingChildSummary,
    'persistenceStatus' | 'rolledBack' | 'commitSucceeded' | 'verificationOk' | 'providerCalls'
  >
): boolean {
  if (child.persistenceStatus === 'UNKNOWN') return true;
  if (child.rolledBack === true) return true;
  if (child.commitSucceeded === false) return true;
  if (child.persistenceStatus === 'PERSISTED' && child.verificationOk !== true) return true;
  if (child.providerCalls > 0) return true;
  return false;
}

export function mutationTargetsInvokedForClosingPersistence(
  runResults: Array<Pick<GenericShadowT30ClosingCommitRunResult, 'persistenceStatus'>>
): GenericShadowT30ClosingMutationTarget[] | null {
  let anyPersisted = false;
  let anyUnknown = false;
  for (let i = 0; i < runResults.length; i++) {
    if (runResults[i].persistenceStatus === 'PERSISTED') anyPersisted = true;
    if (runResults[i].persistenceStatus === 'UNKNOWN') anyUnknown = true;
  }
  if (anyPersisted) return ['ShadowModelClosingMarketSnapshot'];
  if (anyUnknown) return null;
  return [];
}

export function determineGenericShadowT30ClosingCommitCycleOutcome(input: {
  mode: GenericShadowT30ClosingCommitMode;
  blockers: string[];
  decisionCounts: GenericShadowT30AutomationPlan['counts'];
  closingCommitRequested: boolean;
  runResults: GenericShadowT30ClosingCommitRunResult[];
  providerCalls: number;
}): GenericShadowT30ClosingCommitCycleOutcome {
  const invoked = input.runResults.filter((run) => run.invocationAttempted);
  const anyFailed = invoked.some((run) =>
    childClosingCommitFailed({
      persistenceStatus: run.persistenceStatus,
      rolledBack: run.rolledBack,
      commitSucceeded: run.commitSucceeded,
      verificationOk: run.verificationOk,
      providerCalls: run.providerCalls,
    })
  );
  const anyPersisted = input.runResults.some((run) => run.persistenceStatus === 'PERSISTED');
  if (anyFailed || input.providerCalls > 0) return 'FAILED';
  if (anyPersisted && input.blockers.length > 0) return 'FAILED';
  if (input.mode === 'PLAN') {
    if (input.blockers.length > 0) return 'BLOCKED';
    if (input.decisionCounts.dueCount > 0) return 'PREVIEW_ONLY';
    if (input.decisionCounts.missedCount > 0) return 'MISSED_TARGET_PRESENT';
    return 'NO_ACTION';
  }
  if (input.blockers.length > 0 && invoked.length === 0) return 'BLOCKED';
  if (anyPersisted) return 'CLOSINGS_CAPTURED';
  const anyChildMissedOnly =
    invoked.length > 0 &&
    invoked.every(
      (run) =>
        run.persistenceStatus === 'NOT_PERSISTED' &&
        run.missedCount > 0 &&
        run.dueCount === 0 &&
        run.insertedClosingCount === 0
    );
  if (anyChildMissedOnly) return 'MISSED_TARGET_PRESENT';
  if (input.decisionCounts.dueCount === 0 && input.decisionCounts.missedCount > 0) {
    return 'MISSED_TARGET_PRESENT';
  }
  return 'NO_ACTION';
}

function emptyRunResult(
  run: GenericShadowT30AutomationRunPlan,
  extra: Partial<GenericShadowT30ClosingCommitRunResult> = {}
): GenericShadowT30ClosingCommitRunResult {
  return {
    captureRunId: run.captureRunId,
    modelDefinitionId: run.modelDefinitionId,
    invocationAttempted: false,
    childConfirmationGenerated: false,
    childReportPath: extra.childReportPath ?? null,
    observedTimestamp: extra.observedTimestamp ?? null,
    existingCount: run.counts.existingCount,
    futureCount: run.counts.futureCount,
    dueCount: run.counts.dueCount,
    missedCount: run.counts.missedCount,
    plannedInsertCount: run.counts.plannedInsertCount,
    plannedAvailableCount: run.counts.plannedAvailableCount,
    plannedUnavailableCount: run.counts.plannedUnavailableCount,
    transactionStarted: null,
    transactionalNoOp: null,
    persistenceStatus: 'NOT_ATTEMPTED',
    persistenceCommitted: null,
    insertedClosingCount: 0,
    insertedClosingIds: [],
    verificationOk: null,
    verificationReasons: [],
    rolledBack: null,
    commitSucceeded: null,
    providerCalls: 0,
    blockers: [...run.writeBlockers],
    error: null,
    skippedAfterPriorChildFailure: false,
    ...extra,
  };
}

export function runResultFromChildSummary(
  run: GenericShadowT30AutomationRunPlan,
  child: GenericShadowT30ClosingChildSummary,
  extras: {
    childReportPath: string;
    skippedAfterPriorChildFailure?: boolean;
  }
): GenericShadowT30ClosingCommitRunResult {
  return {
    captureRunId: run.captureRunId,
    modelDefinitionId: child.modelDefinitionId || run.modelDefinitionId,
    invocationAttempted: true,
    childConfirmationGenerated: true,
    childReportPath: extras.childReportPath,
    observedTimestamp: child.observedTimestamp,
    existingCount: child.existingCount,
    futureCount: child.futureCount,
    dueCount: child.dueCount,
    missedCount: child.missedCount,
    plannedInsertCount: child.plannedInsertCount,
    plannedAvailableCount: child.plannedAvailableCount,
    plannedUnavailableCount: child.plannedUnavailableCount,
    transactionStarted: child.transactionStarted,
    transactionalNoOp: child.transactionalNoOp,
    persistenceStatus: child.persistenceStatus,
    persistenceCommitted: child.persistenceCommitted,
    insertedClosingCount: child.insertedClosingCount,
    insertedClosingIds: child.insertedClosingIds == null ? null : child.insertedClosingIds.slice(),
    verificationOk: child.verificationOk,
    verificationReasons: child.verificationReasons.slice(),
    rolledBack: child.rolledBack,
    commitSucceeded: child.commitSucceeded,
    providerCalls: child.providerCalls,
    blockers: child.blockers.slice(),
    error: child.error,
    skippedAfterPriorChildFailure: extras.skippedAfterPriorChildFailure === true,
  };
}

export function buildGenericShadowT30ClosingCommitCycleReport(input: {
  season: number;
  week: number;
  mode: GenericShadowT30ClosingCommitMode;
  repoCommitSha: string;
  githubRef: string | null;
  initialObservedTimestamp: Date;
  preCommitObservedTimestamp: Date | null;
  finalObservedTimestamp: Date | null;
  initialPlan: GenericShadowT30AutomationPlan;
  preCommitPlan: GenericShadowT30AutomationPlan | null;
  finalPlan: GenericShadowT30AutomationPlan | null;
  runResults: GenericShadowT30ClosingCommitRunResult[];
  extraBlockers?: string[];
}): GenericShadowT30ClosingCommitCycleReport {
  const decisionPlan =
    input.mode === 'COMMIT' && input.preCommitPlan ? input.preCommitPlan : input.initialPlan;
  const decision = decideGenericShadowT30ClosingCommit(decisionPlan);
  const closingCommitRequested =
    input.mode === 'COMMIT' &&
    !!input.preCommitPlan &&
    decision.closingCommitRequested &&
    !decision.failClosed;
  const dueCaptureRunIds =
    input.mode === 'PLAN'
      ? decideGenericShadowT30ClosingCommit(input.initialPlan).dueCaptureRunIds
      : input.preCommitPlan
        ? decision.dueCaptureRunIds
        : [];
  const unknownPersistenceBlockers = input.runResults
    .filter((run) => run.persistenceStatus === 'UNKNOWN')
    .map((run) => `persistence_state_unknown:${run.captureRunId}`);
  const providerCallBlockers = input.runResults
    .filter((run) => run.providerCalls > 0)
    .map((run) => `child_provider_calls_nonzero:${run.captureRunId}`);
  const reportBlockers =
    input.mode === 'PLAN'
      ? input.initialPlan.blockers
      : input.preCommitPlan
        ? input.preCommitPlan.blockers
        : [];
  const blockers = uniqueSorted([
    ...reportBlockers,
    ...(input.extraBlockers ?? []),
    ...(input.finalPlan?.blockers ?? []),
    ...unknownPersistenceBlockers,
    ...providerCallBlockers,
  ]);
  const sourcePlans =
    input.mode === 'COMMIT' && input.preCommitPlan
      ? input.preCommitPlan.runPlans
      : input.initialPlan.runPlans;
  const runResults =
    input.runResults.length > 0 ? input.runResults : sourcePlans.map((run) => emptyRunResult(run));
  let providerCalls = 0;
  for (let i = 0; i < runResults.length; i++) {
    providerCalls += runResults[i].providerCalls;
  }
  const outcome = determineGenericShadowT30ClosingCommitCycleOutcome({
    mode: input.mode,
    blockers,
    decisionCounts: decisionPlan.counts,
    closingCommitRequested,
    runResults,
    providerCalls,
  });
  let closingRowsInsertedKnown = 0;
  let anyUnknownInserts = false;
  let persistedAvailableCount = 0;
  let persistedUnavailableCount = 0;
  let missedCount = decisionPlan.counts.missedCount;
  if (runResults.some((run) => run.invocationAttempted)) {
    missedCount = 0;
    for (let i = 0; i < runResults.length; i++) {
      missedCount += runResults[i].missedCount;
    }
  }
  for (let i = 0; i < runResults.length; i++) {
    const run = runResults[i];
    if (run.persistenceStatus === 'UNKNOWN') {
      anyUnknownInserts = true;
    } else if (run.persistenceStatus === 'PERSISTED') {
      closingRowsInsertedKnown += run.insertedClosingCount ?? 0;
      persistedAvailableCount += run.plannedAvailableCount;
      persistedUnavailableCount += run.plannedUnavailableCount;
    }
  }
  const plannedAvailableCount = decisionPlan.counts.plannedAvailableCount;
  const plannedUnavailableCount = decisionPlan.counts.plannedUnavailableCount;
  const closingRowsInsertedExact = anyUnknownInserts ? null : closingRowsInsertedKnown;
  const anyUnknown = runResults.some((run) => run.persistenceStatus === 'UNKNOWN');
  const anyPersisted = runResults.some((run) => run.persistenceStatus === 'PERSISTED');
  const anyVerificationFailed = runResults.some(
    (run) => run.invocationAttempted && run.verificationOk === false
  );
  let postwriteVerificationStatus: GenericShadowT30ClosingPostwriteVerificationStatus =
    'NOT_ATTEMPTED';
  if (anyUnknown) postwriteVerificationStatus = 'UNKNOWN';
  else if (anyVerificationFailed) postwriteVerificationStatus = 'FAILED';
  else if (anyPersisted) postwriteVerificationStatus = 'PASSED';
  else if (closingCommitRequested) postwriteVerificationStatus = 'NOT_APPLICABLE';
  const decisionWriteSafe = input.mode === 'PLAN' ? input.initialPlan.writeSafe : !!input.preCommitPlan && input.preCommitPlan.writeSafe;
  const writeSafe =
    blockers.length === 0 &&
    decisionWriteSafe &&
    (!input.finalPlan || input.finalPlan.writeSafe) &&
    outcome !== 'FAILED' &&
    outcome !== 'BLOCKED' &&
    !anyUnknown &&
    providerCalls === 0;

  return {
    automationVersion: 1,
    capability: GENERIC_SHADOW_T30_CLOSING_COMMIT_CAPABILITY,
    stage: GENERIC_SHADOW_T30_CLOSING_COMMIT_STAGE,
    implementationStatus: 'IMPLEMENTED',
    scheduleEnabled: GENERIC_SHADOW_T30_CLOSING_COMMIT_SCHEDULE_ENABLED,
    productionExecutionAuthorized:
      GENERIC_SHADOW_T30_CLOSING_COMMIT_PRODUCTION_EXECUTION_AUTHORIZED,
    season: input.season,
    week: input.week,
    mode: input.mode,
    requestedMode: input.mode,
    reportKind: input.mode === 'COMMIT' ? 'TERMINAL' : 'PLAN',
    repoCommitSha: input.repoCommitSha,
    githubRef: input.githubRef,
    initialObservedTimestamp: input.initialObservedTimestamp,
    preCommitObservedTimestamp: input.preCommitObservedTimestamp,
    finalObservedTimestamp: input.finalObservedTimestamp,
    eligibleCaptureRunIds: decisionPlan.eligibleCaptureRunIds,
    eligibleModelDefinitionIds: decisionPlan.eligibleModelDefinitionIds,
    initialOutcome: input.initialPlan.outcome,
    initialCounts: input.initialPlan.counts,
    dueCaptureRunIds,
    closingCommitRequested,
    runResults,
    closingRowsPlanned: decisionPlan.closingRowsPlanned,
    plannedAvailableCount,
    plannedUnavailableCount,
    persistedAvailableCount,
    persistedUnavailableCount,
    closingRowsInsertedKnown,
    closingRowsInsertedExact,
    missedCount,
    providerCalls,
    mutationTargetsInvoked: mutationTargetsInvokedForClosingPersistence(runResults),
    blockers,
    writeSafe,
    postwriteVerificationStatus,
    outcome,
    initialPlan: input.initialPlan,
    preCommitPlan: input.preCommitPlan,
    finalPlan: input.finalPlan,
  };
}

export function notAttemptedRunResult(
  run: GenericShadowT30AutomationRunPlan,
  extra: Partial<GenericShadowT30ClosingCommitRunResult> = {}
): GenericShadowT30ClosingCommitRunResult {
  return emptyRunResult(run, extra);
}
