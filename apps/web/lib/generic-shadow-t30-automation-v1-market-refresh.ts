/**
 * Generic Shadow T-30 Automation V1 — schedule-disabled market refresh.
 *
 * Pure decision/report helpers only.
 * No Prisma, providers, system clock, or writes.
 *
 * Stage A planner semantics stay frozen (providerEnabled=false).
 * This layer decides whether the existing Live Odds COMMIT boundary
 * may be invoked at most once for a coordinator cycle.
 */

import type {
  GenericShadowT30AutomationOutcome,
  GenericShadowT30AutomationPlan,
} from './generic-shadow-t30-automation-v1';

export const GENERIC_SHADOW_T30_MARKET_REFRESH_CAPABILITY =
  'generic_shadow_t30_automation_v1_market_refresh' as const;
export const GENERIC_SHADOW_T30_MARKET_REFRESH_STAGE =
  'C_MARKET_REFRESH_SCHEDULE_DISABLED' as const;
export const GENERIC_SHADOW_T30_MARKET_REFRESH_SCHEDULE_ENABLED = false as const;
export const GENERIC_SHADOW_T30_MARKET_REFRESH_PRODUCTION_EXECUTION_AUTHORIZED =
  false as const;

export type GenericShadowT30MarketRefreshMode = 'PLAN' | 'COMMIT';

export type GenericShadowT30MarketRefreshCycleOutcome =
  | GenericShadowT30AutomationOutcome
  | 'MARKET_REFRESHED'
  | 'FAILED';

export type GenericShadowT30MarketRefreshAction =
  | 'NO_PROVIDER_CALL'
  | 'REQUEST_ONE_BOARD_REFRESH';

export type GenericShadowT30MutationTarget = 'MarketLine';

export type GenericShadowT30PostwriteVerificationStatus =
  | 'PASSED'
  | 'FAILED'
  | 'NOT_APPLICABLE'
  | 'COMMIT_BLOCKED'
  | 'PROVIDER_FAILED'
  | 'NOT_ATTEMPTED'
  | 'UNKNOWN';

export type GenericShadowT30PersistenceStatus =
  | 'NOT_ATTEMPTED'
  | 'NOT_PERSISTED'
  | 'PERSISTED'
  | 'UNKNOWN';

export type GenericShadowT30ReportKind = 'PLAN' | 'TERMINAL';

export function expectedGenericShadowT30MarketRefreshConfirmation(
  week: number
): string {
  return `REFRESH_2026_WEEK_${week}_GENERIC_SHADOW_T30_MARKET`;
}

export interface GenericShadowT30MarketRefreshDecision {
  action: GenericShadowT30MarketRefreshAction;
  providerCallRequested: boolean;
  failClosed: boolean;
  reasons: string[];
  marketRefreshNeededGameIds: string[];
}

export interface GenericShadowT30LiveOddsCommitSummary {
  providerCallAttempted: boolean;
  providerCallSucceeded: boolean;
  providerCalls: number;
  providerCredits: {
    requestsLast: string | null;
    requestsUsed: string | null;
    requestsRemaining: string | null;
    requestCreditsLast: number | null;
  } | null;
  writeSafe: boolean;
  blockers: string[];
  proposedInsertCount: number;
  insertedCount: number | null;
  persistenceInvoked: boolean | null;
  persistenceStatus: GenericShadowT30PersistenceStatus;
  postwriteVerificationStatus: GenericShadowT30PostwriteVerificationStatus;
  verificationOk: boolean | null;
  error: string | null;
}

export interface GenericShadowT30MarketRefreshCycleReport {
  automationVersion: 1;
  capability: typeof GENERIC_SHADOW_T30_MARKET_REFRESH_CAPABILITY;
  stage: typeof GENERIC_SHADOW_T30_MARKET_REFRESH_STAGE;
  implementationStatus: 'IMPLEMENTED';
  scheduleEnabled: false;
  productionExecutionAuthorized: false;
  season: number;
  week: number;
  mode: GenericShadowT30MarketRefreshMode;
  requestedMode: GenericShadowT30MarketRefreshMode;
  reportKind: GenericShadowT30ReportKind;
  repoCommitSha: string;
  githubRef: string | null;
  initialObservedTimestamp: Date;
  postRefreshObservedTimestamp: Date | null;
  eligibleCaptureRunIds: string[];
  eligibleModelDefinitionIds: string[];
  initialOutcome: GenericShadowT30AutomationOutcome;
  initialCounts: GenericShadowT30AutomationPlan['counts'];
  upcomingTargetGroups: GenericShadowT30AutomationPlan['upcomingTargetGroups'];
  marketRefreshWindowOpenCount: number;
  marketRefreshNeeded: boolean;
  marketRefreshNeededGameIds: string[];
  marketRefreshRequested: boolean;
  providerCallAttempted: boolean;
  providerCallSucceeded: boolean;
  providerCallsAttempted: number;
  providerCallsSucceeded: number;
  providerCredits: GenericShadowT30LiveOddsCommitSummary['providerCredits'];
  liveOddsWriteSafe: boolean | null;
  liveOddsBlockers: string[];
  marketLineProposedCount: number;
  marketLineInsertedCount: number | null;
  persistenceInvoked: boolean | null;
  persistenceStatus: GenericShadowT30PersistenceStatus;
  postwriteVerificationStatus: GenericShadowT30PostwriteVerificationStatus;
  finalOutcome: GenericShadowT30AutomationOutcome | null;
  finalFreshEvidenceStatus: GenericShadowT30AutomationPlan['marketRefreshGames'];
  mutationTargetsInvoked: GenericShadowT30MutationTarget[];
  closingRowsInserted: 0;
  closingWriterInvoked: false;
  blockers: string[];
  writeSafe: boolean;
  outcome: GenericShadowT30MarketRefreshCycleOutcome;
  initialPlan: GenericShadowT30AutomationPlan;
  finalPlan: GenericShadowT30AutomationPlan | null;
  liveOdds: GenericShadowT30LiveOddsCommitSummary | null;
}

function uniqueSorted(values: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < values.length; i++) {
    if (out.indexOf(values[i]) === -1) out.push(values[i]);
  }
  out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return out;
}

export function decideGenericShadowT30MarketRefresh(plan: {
  blockers: string[];
  writeSafe: boolean;
  marketRefreshWindowOpenCount: number;
  marketRefreshNeeded: boolean;
  marketRefreshNeededGameIds: string[];
}): GenericShadowT30MarketRefreshDecision {
  if (plan.blockers.length > 0 || !plan.writeSafe) {
    return {
      action: 'NO_PROVIDER_CALL',
      providerCallRequested: false,
      failClosed: true,
      reasons: plan.blockers.length > 0 ? uniqueSorted(plan.blockers) : ['write_not_safe'],
      marketRefreshNeededGameIds: [],
    };
  }
  if (plan.marketRefreshWindowOpenCount <= 0 || !plan.marketRefreshNeeded) {
    return {
      action: 'NO_PROVIDER_CALL',
      providerCallRequested: false,
      failClosed: false,
      reasons:
        plan.marketRefreshWindowOpenCount > 0
          ? ['fresh_coherent_pair_present']
          : ['market_refresh_window_not_open'],
      marketRefreshNeededGameIds: [],
    };
  }
  return {
    action: 'REQUEST_ONE_BOARD_REFRESH',
    providerCallRequested: true,
    failClosed: false,
    reasons: ['missing_or_incoherent_fresh_market'],
    marketRefreshNeededGameIds: uniqueSorted(plan.marketRefreshNeededGameIds),
  };
}

export function determineGenericShadowT30MarketRefreshCycleOutcome(input: {
  initialOutcome: GenericShadowT30AutomationOutcome;
  finalOutcome: GenericShadowT30AutomationOutcome | null;
  blockers: string[];
  providerCallAttempted: boolean;
  providerCallSucceeded: boolean;
  persistenceStatus: GenericShadowT30PersistenceStatus;
  verificationOk: boolean | null;
}): GenericShadowT30MarketRefreshCycleOutcome {
  if (input.persistenceStatus === 'UNKNOWN') return 'FAILED';
  if (input.providerCallAttempted) {
    if (input.persistenceStatus === 'PERSISTED' && input.verificationOk === true) {
      return input.blockers.length > 0 ? 'FAILED' : 'MARKET_REFRESHED';
    }
    return 'FAILED';
  }
  if (input.blockers.length > 0) return 'BLOCKED';
  if (input.finalOutcome) return input.finalOutcome;
  return input.initialOutcome;
}

export function buildGenericShadowT30MarketRefreshCycleReport(input: {
  season: number;
  week: number;
  mode: GenericShadowT30MarketRefreshMode;
  repoCommitSha: string;
  githubRef: string | null;
  initialObservedTimestamp: Date;
  postRefreshObservedTimestamp: Date | null;
  initialPlan: GenericShadowT30AutomationPlan;
  finalPlan: GenericShadowT30AutomationPlan | null;
  liveOdds: GenericShadowT30LiveOddsCommitSummary | null;
  extraBlockers?: string[];
}): GenericShadowT30MarketRefreshCycleReport {
  const liveOdds = input.liveOdds;
  const refreshDecision = decideGenericShadowT30MarketRefresh(input.initialPlan);
  const providerCallAttempted = !!liveOdds?.providerCallAttempted;
  const providerCallSucceeded = !!liveOdds?.providerCallSucceeded;
  const persistenceStatus: GenericShadowT30PersistenceStatus =
    liveOdds?.persistenceStatus ?? 'NOT_ATTEMPTED';
  const persistenceInvoked =
    persistenceStatus === 'UNKNOWN' ? null : persistenceStatus === 'PERSISTED';
  const verificationOk = liveOdds ? liveOdds.verificationOk : null;
  const unknownPersistenceBlockers =
    persistenceStatus === 'UNKNOWN' ? ['persistence_state_unknown'] : [];
  const blockers = uniqueSorted([
    ...input.initialPlan.blockers,
    ...(input.extraBlockers ?? []),
    ...(input.finalPlan?.blockers ?? []),
    ...(liveOdds && !liveOdds.providerCallSucceeded ? liveOdds.blockers : []),
    ...(liveOdds && liveOdds.error ? [liveOdds.error] : []),
    ...unknownPersistenceBlockers,
  ]);
  const outcome = determineGenericShadowT30MarketRefreshCycleOutcome({
    initialOutcome: input.initialPlan.outcome,
    finalOutcome: input.finalPlan?.outcome ?? null,
    blockers,
    providerCallAttempted,
    providerCallSucceeded,
    persistenceStatus,
    verificationOk,
  });
  const writeSafe =
    blockers.length === 0 &&
    input.initialPlan.writeSafe &&
    (!input.finalPlan || input.finalPlan.writeSafe) &&
    outcome !== 'FAILED' &&
    outcome !== 'BLOCKED' &&
    persistenceStatus !== 'UNKNOWN';

  return {
    automationVersion: 1,
    capability: GENERIC_SHADOW_T30_MARKET_REFRESH_CAPABILITY,
    stage: GENERIC_SHADOW_T30_MARKET_REFRESH_STAGE,
    implementationStatus: 'IMPLEMENTED',
    scheduleEnabled: GENERIC_SHADOW_T30_MARKET_REFRESH_SCHEDULE_ENABLED,
    productionExecutionAuthorized:
      GENERIC_SHADOW_T30_MARKET_REFRESH_PRODUCTION_EXECUTION_AUTHORIZED,
    season: input.season,
    week: input.week,
    mode: input.mode,
    requestedMode: input.mode,
    reportKind: input.mode === 'COMMIT' ? 'TERMINAL' : 'PLAN',
    repoCommitSha: input.repoCommitSha,
    githubRef: input.githubRef,
    initialObservedTimestamp: input.initialObservedTimestamp,
    postRefreshObservedTimestamp: input.postRefreshObservedTimestamp,
    eligibleCaptureRunIds: input.initialPlan.eligibleCaptureRunIds,
    eligibleModelDefinitionIds: input.initialPlan.eligibleModelDefinitionIds,
    initialOutcome: input.initialPlan.outcome,
    initialCounts: input.initialPlan.counts,
    upcomingTargetGroups: input.initialPlan.upcomingTargetGroups,
    marketRefreshWindowOpenCount: input.initialPlan.marketRefreshWindowOpenCount,
    marketRefreshNeeded: input.initialPlan.marketRefreshNeeded,
    marketRefreshNeededGameIds: input.initialPlan.marketRefreshNeededGameIds,
    marketRefreshRequested: refreshDecision.providerCallRequested,
    providerCallAttempted,
    providerCallSucceeded,
    providerCallsAttempted: liveOdds?.providerCalls ?? 0,
    providerCallsSucceeded: providerCallSucceeded ? 1 : 0,
    providerCredits: liveOdds?.providerCredits ?? null,
    liveOddsWriteSafe: liveOdds ? liveOdds.writeSafe : null,
    liveOddsBlockers: liveOdds?.blockers ?? [],
    marketLineProposedCount: liveOdds?.proposedInsertCount ?? 0,
    marketLineInsertedCount: liveOdds?.insertedCount ?? null,
    persistenceInvoked,
    persistenceStatus,
    postwriteVerificationStatus: liveOdds?.postwriteVerificationStatus ?? 'NOT_ATTEMPTED',
    finalOutcome: input.finalPlan?.outcome ?? null,
    finalFreshEvidenceStatus: input.finalPlan?.marketRefreshGames ?? [],
    mutationTargetsInvoked: persistenceStatus === 'PERSISTED' ? ['MarketLine'] : [],
    closingRowsInserted: 0,
    closingWriterInvoked: false,
    blockers,
    writeSafe,
    outcome,
    initialPlan: input.initialPlan,
    finalPlan: input.finalPlan,
    liveOdds,
  };
}
