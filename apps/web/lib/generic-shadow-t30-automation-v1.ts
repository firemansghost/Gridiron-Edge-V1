/**
 * Generic Shadow T-30 Automation V1 — pure coordinator planner.
 *
 * Stage A only:
 * - in-memory frames only
 * - PREVIEW closing plans only
 * - providerCalls=0
 * - zero writes
 * - no system clock reads
 */

import {
  GENERIC_SHADOW_T30_AUTHORIZED_SOURCE,
  GENERIC_SHADOW_T30_CAPTURE_SEASON,
  GENERIC_SHADOW_T30_SUPPORTED_MODEL_IDS,
  planGenericShadowT30Closing,
  selectGenericShadowT30ClosingMarket,
  type GenericShadowT30Counts,
  type GenericShadowT30OperationalFrame,
  type GenericShadowT30Plan,
} from './shadow-model-t30-closing-v1';

export const GENERIC_SHADOW_T30_AUTOMATION_VERSION = 1 as const;
export const GENERIC_SHADOW_T30_AUTOMATION_SCHEDULER_CADENCE_MINUTES = 5 as const;
export const GENERIC_SHADOW_T30_AUTOMATION_MARKET_WINDOW_OPEN_MINUTES = 45 as const;
export const GENERIC_SHADOW_T30_AUTOMATION_MARKET_WINDOW_CLOSE_MINUTES = 35 as const;
export const GENERIC_SHADOW_T30_AUTOMATION_PROVIDER_ENABLED = false as const;
export const GENERIC_SHADOW_T30_AUTOMATION_WRITES_ENABLED = false as const;

const MARKET_WINDOW_OPEN_MS =
  GENERIC_SHADOW_T30_AUTOMATION_MARKET_WINDOW_OPEN_MINUTES * 60 * 1000;
const MARKET_WINDOW_CLOSE_MS =
  GENERIC_SHADOW_T30_AUTOMATION_MARKET_WINDOW_CLOSE_MINUTES * 60 * 1000;

export type GenericShadowT30AutomationOutcome =
  | 'NO_ACTION'
  | 'PREVIEW_ONLY'
  | 'MARKET_REFRESH_NOT_NEEDED'
  | 'MISSED_TARGET_PRESENT'
  | 'BLOCKED';

export type GenericShadowT30FreshEvidenceStatus =
  | 'fresh_coherent_pair_present'
  | 'missing_fresh_market'
  | 'incoherent_fresh_market';

export interface GenericShadowT30AutomationRequest {
  season: number;
  week: number;
  observedTimestamp: Date;
  frames: GenericShadowT30OperationalFrame[];
}

export interface GenericShadowT30AutomationRunPlan {
  captureRunId: string;
  modelDefinitionId: string;
  captureContext: string;
  writeSafe: boolean;
  writeBlockers: string[];
  counts: GenericShadowT30Counts;
  predictions: GenericShadowT30Plan['predictions'];
  rowsToInsert: GenericShadowT30Plan['rowsToInsert'];
}

export interface GenericShadowT30AutomationMarketGame {
  gameId: string;
  kickoffTimestamp: Date;
  targetTimestamp: Date;
  marketRefreshWindowOpensAt: Date;
  marketRefreshWindowClosesAt: Date;
  captureRunIds: string[];
  modelDefinitionIds: string[];
  predictionIds: string[];
  freshEvidenceStatus: GenericShadowT30FreshEvidenceStatus;
  freshMarketObservationTimestamp: Date | null;
}

export interface GenericShadowT30AutomationTargetGroup {
  targetTimestamp: Date;
  kickoffTimestamp: Date;
  gameIds: string[];
  captureRunIds: string[];
  modelDefinitionIds: string[];
}

export interface GenericShadowT30AutomationPlan {
  version: typeof GENERIC_SHADOW_T30_AUTOMATION_VERSION;
  season: number;
  week: number;
  observedTimestamp: Date;
  outcome: GenericShadowT30AutomationOutcome;
  writeSafe: boolean;
  blockers: string[];
  eligibleCaptureRunIds: string[];
  eligibleModelDefinitionIds: string[];
  runPlans: GenericShadowT30AutomationRunPlan[];
  counts: GenericShadowT30Counts;
  upcomingTargetGroups: GenericShadowT30AutomationTargetGroup[];
  marketRefreshGames: GenericShadowT30AutomationMarketGame[];
  marketRefreshWindowOpenCount: number;
  marketRefreshNeeded: boolean;
  marketRefreshNeededGameIds: string[];
  providerEnabled: false;
  providerCallsAttempted: 0;
  providerCallsSucceeded: 0;
  writesEnabled: false;
  mutationTargetsInvoked: [];
  closingRowsPlanned: number;
  closingAvailablePlanned: number;
  closingUnavailablePlanned: number;
  missedCount: number;
}

function parseDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function emptyCounts(): GenericShadowT30Counts {
  return {
    totalPredictions: 0,
    existingCount: 0,
    futureCount: 0,
    dueCount: 0,
    missedCount: 0,
    plannedAvailableCount: 0,
    plannedUnavailableCount: 0,
    plannedInsertCount: 0,
  };
}

function addCounts(total: GenericShadowT30Counts, next: GenericShadowT30Counts): void {
  total.totalPredictions += next.totalPredictions;
  total.existingCount += next.existingCount;
  total.futureCount += next.futureCount;
  total.dueCount += next.dueCount;
  total.missedCount += next.missedCount;
  total.plannedAvailableCount += next.plannedAvailableCount;
  total.plannedUnavailableCount += next.plannedUnavailableCount;
  total.plannedInsertCount += next.plannedInsertCount;
}

function evidenceRank(status: GenericShadowT30FreshEvidenceStatus): number {
  if (status === 'fresh_coherent_pair_present') return 2;
  if (status === 'incoherent_fresh_market') return 1;
  return 0;
}

function mergeEvidenceStatus(
  a: GenericShadowT30FreshEvidenceStatus,
  b: GenericShadowT30FreshEvidenceStatus
): GenericShadowT30FreshEvidenceStatus {
  return evidenceRank(a) >= evidenceRank(b) ? a : b;
}

/**
 * Headline outcome favors work that can still be acted on now. Historical
 * MISSED evidence remains visible in counts, but must not hide a current
 * refresh window or DUE closing window later in the same week.
 */
export function determineGenericShadowT30AutomationOutcome(input: {
  blockers: string[];
  counts: GenericShadowT30Counts;
  marketRefreshWindowOpenCount: number;
  marketRefreshNeeded: boolean;
}): GenericShadowT30AutomationOutcome {
  if (input.blockers.length > 0) return 'BLOCKED';
  if (
    input.counts.dueCount > 0 ||
    (input.marketRefreshWindowOpenCount > 0 && input.marketRefreshNeeded)
  ) {
    return 'PREVIEW_ONLY';
  }
  if (input.marketRefreshWindowOpenCount > 0) return 'MARKET_REFRESH_NOT_NEEDED';
  if (input.counts.missedCount > 0) return 'MISSED_TARGET_PRESENT';
  return 'NO_ACTION';
}

export function planGenericShadowT30Automation(
  input: GenericShadowT30AutomationRequest
): GenericShadowT30AutomationPlan {
  const blockers: string[] = [];
  const observed = input.observedTimestamp;
  const observedMs = observed instanceof Date ? observed.getTime() : NaN;

  if (input.season !== GENERIC_SHADOW_T30_CAPTURE_SEASON) {
    blockers.push('season_must_be_2026');
  }
  if (!Number.isInteger(input.week) || input.week < 1) {
    blockers.push('week_must_be_positive_integer');
  }
  if (!Number.isFinite(observedMs)) blockers.push('observed_timestamp_invalid');

  const sortedFrames = [...input.frames].sort((a, b) =>
    a.captureRun.id < b.captureRun.id ? -1 : a.captureRun.id > b.captureRun.id ? 1 : 0
  );
  const runIds = sortedFrames.map((frame) => frame.captureRun.id);
  if (uniqueSorted(runIds).length !== runIds.length) blockers.push('duplicate_capture_run_id');

  const runPlans: GenericShadowT30AutomationRunPlan[] = [];
  const aggregate = emptyCounts();
  let previewIdCounter = 0;

  for (const frame of sortedFrames) {
    const run = frame.captureRun;
    if (run.season !== input.season || run.week !== input.week) {
      blockers.push(`capture_run_frame_mismatch:${run.id}`);
    }
    if (run.status !== 'COMPLETE') blockers.push(`capture_run_not_complete:${run.id}`);
    if (!(GENERIC_SHADOW_T30_SUPPORTED_MODEL_IDS as readonly string[]).includes(run.modelDefinitionId)) {
      blockers.push(`capture_run_model_not_supported:${run.id}`);
    }

    const closingPlan = planGenericShadowT30Closing({
      season: input.season,
      week: input.week,
      captureRunId: run.id,
      mode: 'PREVIEW',
      confirmation: '',
      observedTimestamp: observed,
      frame,
      createId: () => `automation-preview-${++previewIdCounter}`,
    });

    if (!closingPlan.writeSafe) {
      for (const blocker of closingPlan.writeBlockers) {
        blockers.push(`closing_plan:${run.id}:${blocker}`);
      }
    }
    addCounts(aggregate, closingPlan.counts);
    runPlans.push({
      captureRunId: run.id,
      modelDefinitionId: run.modelDefinitionId,
      captureContext: run.captureContext,
      writeSafe: closingPlan.writeSafe,
      writeBlockers: [...closingPlan.writeBlockers],
      counts: { ...closingPlan.counts },
      predictions: closingPlan.predictions,
      rowsToInsert: closingPlan.rowsToInsert,
    });
  }

  const marketGamesById = new Map<string, GenericShadowT30AutomationMarketGame>();
  const targetGroupsByKey = new Map<string, GenericShadowT30AutomationTargetGroup>();

  for (let frameIndex = 0; frameIndex < sortedFrames.length; frameIndex++) {
    const frame = sortedFrames[frameIndex];
    const runPlan = runPlans[frameIndex];
    const predictionById = new Map(frame.predictions.map((prediction) => [prediction.id, prediction]));

    for (const predictionPlan of runPlan.predictions) {
      if (predictionPlan.state !== 'FUTURE') continue;
      const kickoff = parseDate(predictionPlan.closingKickoffTimestamp);
      const target = parseDate(predictionPlan.targetTimestamp);
      if (!kickoff || !target) {
        blockers.push(`automation_prediction_timestamp_invalid:${predictionPlan.predictionId}`);
        continue;
      }

      const targetKey = target.toISOString();
      const existingGroup = targetGroupsByKey.get(targetKey);
      if (!existingGroup) {
        targetGroupsByKey.set(targetKey, {
          targetTimestamp: target,
          kickoffTimestamp: kickoff,
          gameIds: [predictionPlan.gameId],
          captureRunIds: [runPlan.captureRunId],
          modelDefinitionIds: [runPlan.modelDefinitionId],
        });
      } else {
        if (existingGroup.kickoffTimestamp.getTime() !== kickoff.getTime()) {
          blockers.push(`target_group_kickoff_mismatch:${targetKey}`);
        }
        existingGroup.gameIds = uniqueSorted([...existingGroup.gameIds, predictionPlan.gameId]);
        existingGroup.captureRunIds = uniqueSorted([
          ...existingGroup.captureRunIds,
          runPlan.captureRunId,
        ]);
        existingGroup.modelDefinitionIds = uniqueSorted([
          ...existingGroup.modelDefinitionIds,
          runPlan.modelDefinitionId,
        ]);
      }

      const windowOpen = new Date(kickoff.getTime() - MARKET_WINDOW_OPEN_MS);
      const windowClose = new Date(kickoff.getTime() - MARKET_WINDOW_CLOSE_MS);
      const inRefreshWindow =
        Number.isFinite(observedMs) &&
        observedMs >= windowOpen.getTime() &&
        observedMs <= windowClose.getTime();
      if (!inRefreshWindow) continue;

      const rawPrediction = predictionById.get(predictionPlan.predictionId);
      if (!rawPrediction) {
        blockers.push(`prediction_missing_from_frame:${predictionPlan.predictionId}`);
        continue;
      }

      const freshRows = frame.marketLines.filter((row) => {
        if (row.gameId !== predictionPlan.gameId) return false;
        if (String(row.lineType) !== 'spread') return false;
        if (String(row.source) !== GENERIC_SHADOW_T30_AUTHORIZED_SOURCE) return false;
        const ts = parseDate(row.timestamp);
        return !!ts && ts.getTime() >= windowOpen.getTime() && ts.getTime() <= observedMs;
      });
      const selected = selectGenericShadowT30ClosingMarket({
        rows: freshRows,
        gameId: predictionPlan.gameId,
        homeTeamId: rawPrediction.homeTeamId,
        awayTeamId: rawPrediction.awayTeamId,
        targetTimestamp: observed,
      });
      const freshEvidenceStatus: GenericShadowT30FreshEvidenceStatus =
        selected.status === 'selected'
          ? 'fresh_coherent_pair_present'
          : selected.status === 'incoherent_market_at_or_before_t30'
            ? 'incoherent_fresh_market'
            : 'missing_fresh_market';
      const freshTimestamp =
        selected.status === 'selected' ? selected.selected.marketObservationTimestamp : null;

      const existingGame = marketGamesById.get(predictionPlan.gameId);
      if (!existingGame) {
        marketGamesById.set(predictionPlan.gameId, {
          gameId: predictionPlan.gameId,
          kickoffTimestamp: kickoff,
          targetTimestamp: target,
          marketRefreshWindowOpensAt: windowOpen,
          marketRefreshWindowClosesAt: windowClose,
          captureRunIds: [runPlan.captureRunId],
          modelDefinitionIds: [runPlan.modelDefinitionId],
          predictionIds: [predictionPlan.predictionId],
          freshEvidenceStatus,
          freshMarketObservationTimestamp: freshTimestamp,
        });
      } else {
        if (
          existingGame.kickoffTimestamp.getTime() !== kickoff.getTime() ||
          existingGame.targetTimestamp.getTime() !== target.getTime()
        ) {
          blockers.push(`market_game_timing_mismatch:${predictionPlan.gameId}`);
        }
        existingGame.captureRunIds = uniqueSorted([
          ...existingGame.captureRunIds,
          runPlan.captureRunId,
        ]);
        existingGame.modelDefinitionIds = uniqueSorted([
          ...existingGame.modelDefinitionIds,
          runPlan.modelDefinitionId,
        ]);
        existingGame.predictionIds = uniqueSorted([
          ...existingGame.predictionIds,
          predictionPlan.predictionId,
        ]);
        existingGame.freshEvidenceStatus = mergeEvidenceStatus(
          existingGame.freshEvidenceStatus,
          freshEvidenceStatus
        );
        if (
          freshTimestamp &&
          (!existingGame.freshMarketObservationTimestamp ||
            freshTimestamp.getTime() > existingGame.freshMarketObservationTimestamp.getTime())
        ) {
          existingGame.freshMarketObservationTimestamp = freshTimestamp;
        }
      }
    }
  }

  const upcomingTargetGroups = [...targetGroupsByKey.values()].sort(
    (a, b) => a.targetTimestamp.getTime() - b.targetTimestamp.getTime()
  );
  const marketRefreshGames = [...marketGamesById.values()].sort((a, b) =>
    a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0
  );
  const marketRefreshNeededGameIds = marketRefreshGames
    .filter((game) => game.freshEvidenceStatus !== 'fresh_coherent_pair_present')
    .map((game) => game.gameId);
  const marketRefreshNeeded = marketRefreshNeededGameIds.length > 0;
  const uniqueBlockers = uniqueSorted(blockers);
  const outcome = determineGenericShadowT30AutomationOutcome({
    blockers: uniqueBlockers,
    counts: aggregate,
    marketRefreshWindowOpenCount: marketRefreshGames.length,
    marketRefreshNeeded,
  });

  return {
    version: GENERIC_SHADOW_T30_AUTOMATION_VERSION,
    season: input.season,
    week: input.week,
    observedTimestamp: observed,
    outcome,
    writeSafe: uniqueBlockers.length === 0 && runPlans.every((run) => run.writeSafe),
    blockers: uniqueBlockers,
    eligibleCaptureRunIds: uniqueSorted(runPlans.map((run) => run.captureRunId)),
    eligibleModelDefinitionIds: uniqueSorted(runPlans.map((run) => run.modelDefinitionId)),
    runPlans,
    counts: aggregate,
    upcomingTargetGroups,
    marketRefreshGames,
    marketRefreshWindowOpenCount: marketRefreshGames.length,
    marketRefreshNeeded,
    marketRefreshNeededGameIds,
    providerEnabled: GENERIC_SHADOW_T30_AUTOMATION_PROVIDER_ENABLED,
    providerCallsAttempted: 0,
    providerCallsSucceeded: 0,
    writesEnabled: GENERIC_SHADOW_T30_AUTOMATION_WRITES_ENABLED,
    mutationTargetsInvoked: [],
    closingRowsPlanned: aggregate.plannedInsertCount,
    closingAvailablePlanned: aggregate.plannedAvailableCount,
    closingUnavailablePlanned: aggregate.plannedUnavailableCount,
    missedCount: aggregate.missedCount,
  };
}
