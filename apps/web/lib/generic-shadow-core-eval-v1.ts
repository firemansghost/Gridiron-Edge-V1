/**
 * Generic Shadow CORE_EVAL_V1 — deterministic read-only evaluator.
 *
 * Pure computation only. No Prisma, providers, writes, system clock, or I/O.
 * Consumers supply one persisted Generic Shadow capture-run frame plus canonical
 * Game result rows and any legitimately persisted Generic T-30 close rows.
 */

import { sha256CanonicalJson } from './shadow-model-capture-v1';
import {
  GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH,
  GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID,
} from './shadow-model-t30-closing-v1';

export const GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_ID =
  'generic_shadow_core_eval_v1_readonly_v1' as const;
export const GENERIC_SHADOW_CORE_EVAL_V1_PROTOCOL = 'CORE_EVAL_V1' as const;
export const GENERIC_SHADOW_CORE_EVAL_V1_SEASON = 2026;
export const GENERIC_SHADOW_CORE_EVAL_V1_EPSILON = 1e-9;
export const GENERIC_SHADOW_CORE_EVAL_V1_STAKE = 100;
export const GENERIC_SHADOW_CORE_EVAL_V1_ASSUMED_PRICE = -110;
export const GENERIC_SHADOW_CORE_EVAL_V1_WIN_PNL = 90.9;
export const GENERIC_SHADOW_CORE_EVAL_V1_LOSS_PNL = -100;
export const GENERIC_SHADOW_CORE_EVAL_V1_PUSH_PNL = 0;

export const GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_MANIFEST = {
  id: GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_ID,
  evaluationProtocol: GENERIC_SHADOW_CORE_EVAL_V1_PROTOCOL,
  season: GENERIC_SHADOW_CORE_EVAL_V1_SEASON,
  scope: {
    captureRunScoped: true,
    marketType: 'SPREAD',
    readOnly: true,
    providerCalls: 0,
    mutationsInvoked: false,
  },
  resultSource: {
    canonical: 'Game',
    gradeableStatus: 'final',
    requireIntegerHomeAwayScores: true,
  },
  atsSettlement: {
    homeSideMargin: 'homeScore - awayScore',
    awaySideMargin: 'awayScore - homeScore',
    coverMargin: 'sideMargin + predictionPickValue',
    win: 'coverMargin > 0',
    push: 'coverMargin = 0',
    loss: 'coverMargin < 0',
    epsilon: GENERIC_SHADOW_CORE_EVAL_V1_EPSILON,
    noOfficialBetHalfPointPushBand: true,
  },
  clv: {
    homeClosingTeamLine: '-closingMarketHma',
    awayClosingTeamLine: '+closingMarketHma',
    clvPoints: 'predictionPickValue - closingTeamLine',
    positiveClv: 'better captured ATS number',
    noSelection: 'NOT_APPLICABLE',
    missingT30OnSelectedSide: 'UNAVAILABLE',
    closingDefinitionId: GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID,
    closingDefinitionHash: GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH,
    noRetrospectiveRepair: true,
  },
  researchRoi: {
    researchOnly: true,
    flatStake: GENERIC_SHADOW_CORE_EVAL_V1_STAKE,
    assumedAmericanPrice: GENERIC_SHADOW_CORE_EVAL_V1_ASSUMED_PRICE,
    winPnl: GENERIC_SHADOW_CORE_EVAL_V1_WIN_PNL,
    lossPnl: GENERIC_SHADOW_CORE_EVAL_V1_LOSS_PNL,
    pushPnl: GENERIC_SHADOW_CORE_EVAL_V1_PUSH_PNL,
    roi: 'graded shadow PnL / graded shadow stake',
    noSelectionExcludedFromGradedStake: true,
    unavailableExcludedFromGradedStake: true,
  },
} as const;

export const GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_HASH =
  sha256CanonicalJson(GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_MANIFEST);

export type GenericShadowAtsResult =
  | 'WIN'
  | 'LOSS'
  | 'PUSH'
  | 'NOT_APPLICABLE'
  | 'UNAVAILABLE';

export type GenericShadowClvStatus =
  | 'AVAILABLE'
  | 'NOT_APPLICABLE'
  | 'UNAVAILABLE';

export interface GenericShadowEvalCaptureRun {
  id: string;
  season: number;
  week: number;
  captureContext: string;
  evaluationProtocol: string;
  modelFamily: string;
  modelDefinitionId: string;
  modelDefinitionHash: string;
  featureDefinitionId: string;
  featureDefinitionHash: string;
  policyDefinitionId: string;
  policyDefinitionHash: string;
  repoCommitSha: string;
  captureTimestamp: Date | string;
  expectedGameIds: unknown;
  totalGames: number;
  availableCount: number;
  unavailableCount: number;
  selectionCount: number;
  noSelectionCount: number;
  status: string;
}

export interface GenericShadowEvalPrediction {
  id: string;
  captureRunId: string;
  gameId: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  kickoffTimestamp: Date | string;
  predictionTimestamp: Date | string;
  predictionStatus: string;
  unavailableReasons: string[];
  marketType: string;
  selectedSide: string | null;
  selectedTeamId: string | null;
  predictionPickValue: number | null;
}

export interface GenericShadowEvalClosing {
  id: string;
  predictionId: string;
  gameId: string;
  evaluationProtocol: string;
  closingDefinitionId: string;
  closingDefinitionHash: string;
  status: string;
  unavailableReason: string | null;
  canonicalMarketHma: number | null;
}

export interface GenericShadowEvalGame {
  id: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface GenericShadowCoreEvalFrame {
  captureRun: GenericShadowEvalCaptureRun;
  predictions: GenericShadowEvalPrediction[];
  closings: GenericShadowEvalClosing[];
  games: GenericShadowEvalGame[];
}

export interface GenericShadowCoreEvalRow {
  predictionId: string;
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoffTimestamp: string;
  predictionTimestamp: string;
  predictionStatus: string;
  unavailableReasons: string[];
  marketType: string;
  selectedSide: string | null;
  selectedTeamId: string | null;
  predictionPickValue: number | null;
  finalGameStatus: string | null;
  finalHomeScore: number | null;
  finalAwayScore: number | null;
  resultAvailable: boolean;
  atsResult: GenericShadowAtsResult;
  sideMargin: number | null;
  coverMargin: number | null;
  closingSnapshotId: string | null;
  closingStatus: string | null;
  closingUnavailableReason: string | null;
  closingMarketHma: number | null;
  closingTeamLine: number | null;
  clvStatus: GenericShadowClvStatus;
  clvPoints: number | null;
  shadowStake: number | null;
  shadowPnl: number | null;
  validationReasons: string[];
}

export interface GenericShadowCoreEvalCounts {
  totalPredictions: number;
  predictionAvailableCount: number;
  predictionUnavailableCount: number;
  selectionCount: number;
  noSelectionCount: number;
  atsWinCount: number;
  atsLossCount: number;
  atsPushCount: number;
  atsNotApplicableCount: number;
  atsUnavailableCount: number;
  atsGradedCount: number;
  clvAvailableCount: number;
  clvNotApplicableCount: number;
  clvUnavailableCount: number;
  finalScoreAvailableCount: number;
  finalScoreUnavailableCount: number;
  closingRowPresentCount: number;
  closingAvailableCount: number;
  closingUnavailableCount: number;
}

export interface GenericShadowCoreEvalReport {
  evaluatorDefinitionId: typeof GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_ID;
  evaluatorDefinitionHash: string;
  evaluatorDefinitionManifest: typeof GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_MANIFEST;
  evaluationProtocol: typeof GENERIC_SHADOW_CORE_EVAL_V1_PROTOCOL;
  evaluatedAt: string;
  readOnly: true;
  providerCalls: 0;
  mutationsInvoked: false;
  reportValid: boolean;
  blockers: string[];
  captureRun: {
    id: string;
    season: number;
    week: number;
    captureContext: string;
    modelFamily: string;
    modelDefinitionId: string;
    modelDefinitionHash: string;
    featureDefinitionId: string;
    featureDefinitionHash: string;
    policyDefinitionId: string;
    policyDefinitionHash: string;
    repoCommitSha: string;
    captureTimestamp: string;
    expectedGameIds: string[];
  };
  counts: GenericShadowCoreEvalCounts;
  atsWinRate: number | null;
  totalGradedStake: number;
  totalResearchPnl: number;
  researchRoi: number | null;
  averageClvPoints: number | null;
  perPrediction: GenericShadowCoreEvalRow[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIntegerScore(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

function toIso(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : String(value);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.some((v) => typeof v !== 'string' || v.length === 0)) return null;
  return value as string[];
}

function sameSet(a: string[], b: string[]): boolean {
  const aa = uniqueSorted(a);
  const bb = uniqueSorted(b);
  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
}

function validSelectedPrediction(prediction: GenericShadowEvalPrediction): {
  valid: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (prediction.selectedSide !== 'HOME' && prediction.selectedSide !== 'AWAY') {
    reasons.push('selected_side_not_home_or_away');
  }
  if (!isFiniteNumber(prediction.predictionPickValue)) {
    reasons.push('prediction_pick_value_invalid');
  }
  if (prediction.selectedSide === 'HOME' && prediction.selectedTeamId !== prediction.homeTeamId) {
    reasons.push('selected_team_home_mismatch');
  }
  if (prediction.selectedSide === 'AWAY' && prediction.selectedTeamId !== prediction.awayTeamId) {
    reasons.push('selected_team_away_mismatch');
  }
  return { valid: reasons.length === 0, reasons };
}

function emptyCounts(): GenericShadowCoreEvalCounts {
  return {
    totalPredictions: 0,
    predictionAvailableCount: 0,
    predictionUnavailableCount: 0,
    selectionCount: 0,
    noSelectionCount: 0,
    atsWinCount: 0,
    atsLossCount: 0,
    atsPushCount: 0,
    atsNotApplicableCount: 0,
    atsUnavailableCount: 0,
    atsGradedCount: 0,
    clvAvailableCount: 0,
    clvNotApplicableCount: 0,
    clvUnavailableCount: 0,
    finalScoreAvailableCount: 0,
    finalScoreUnavailableCount: 0,
    closingRowPresentCount: 0,
    closingAvailableCount: 0,
    closingUnavailableCount: 0,
  };
}

function researchPnlFor(result: GenericShadowAtsResult): {
  stake: number | null;
  pnl: number | null;
} {
  if (result === 'WIN') {
    return {
      stake: GENERIC_SHADOW_CORE_EVAL_V1_STAKE,
      pnl: GENERIC_SHADOW_CORE_EVAL_V1_WIN_PNL,
    };
  }
  if (result === 'LOSS') {
    return {
      stake: GENERIC_SHADOW_CORE_EVAL_V1_STAKE,
      pnl: GENERIC_SHADOW_CORE_EVAL_V1_LOSS_PNL,
    };
  }
  if (result === 'PUSH') {
    return {
      stake: GENERIC_SHADOW_CORE_EVAL_V1_STAKE,
      pnl: GENERIC_SHADOW_CORE_EVAL_V1_PUSH_PNL,
    };
  }
  return { stake: null, pnl: null };
}

export function evaluateGenericShadowCoreEvalV1(input: {
  frame: GenericShadowCoreEvalFrame;
  evaluatedAt: Date;
}): GenericShadowCoreEvalReport {
  const { captureRun, predictions, closings, games } = input.frame;
  const blockers: string[] = [];

  const expectedGameIds = stringArray(captureRun.expectedGameIds);
  if (!expectedGameIds) blockers.push('capture_run_expected_game_ids_invalid');
  if (captureRun.season !== GENERIC_SHADOW_CORE_EVAL_V1_SEASON) {
    blockers.push('capture_run_season_not_2026');
  }
  if (captureRun.evaluationProtocol !== GENERIC_SHADOW_CORE_EVAL_V1_PROTOCOL) {
    blockers.push('capture_run_evaluation_protocol_mismatch');
  }
  if (captureRun.status !== 'COMPLETE') blockers.push('capture_run_not_complete');

  const predictionGameIds = predictions.map((p) => p.gameId);
  if (new Set(predictionGameIds).size !== predictionGameIds.length) {
    blockers.push('duplicate_prediction_game_id');
  }
  if (expectedGameIds && !sameSet(expectedGameIds, predictionGameIds)) {
    blockers.push('capture_run_prediction_game_set_mismatch');
  }

  const derivedAvailable = predictions.filter((p) => p.predictionStatus === 'AVAILABLE').length;
  const derivedUnavailable = predictions.length - derivedAvailable;
  const derivedSelections = predictions.filter(
    (p) =>
      p.predictionStatus === 'AVAILABLE' &&
      (p.selectedSide === 'HOME' || p.selectedSide === 'AWAY')
  ).length;
  const derivedNoSelections = predictions.filter(
    (p) => p.predictionStatus === 'AVAILABLE' && p.selectedSide === 'NO_SELECTION'
  ).length;
  if (captureRun.totalGames !== predictions.length) blockers.push('capture_run_total_games_mismatch');
  if (captureRun.availableCount !== derivedAvailable) blockers.push('capture_run_available_count_mismatch');
  if (captureRun.unavailableCount !== derivedUnavailable) blockers.push('capture_run_unavailable_count_mismatch');
  if (captureRun.selectionCount !== derivedSelections) blockers.push('capture_run_selection_count_mismatch');
  if (captureRun.noSelectionCount !== derivedNoSelections) blockers.push('capture_run_no_selection_count_mismatch');

  for (const p of predictions) {
    if (p.captureRunId !== captureRun.id) blockers.push(`prediction_capture_run_mismatch:${p.id}`);
    if (p.season !== captureRun.season) blockers.push(`prediction_season_mismatch:${p.id}`);
    if (p.week !== captureRun.week) blockers.push(`prediction_week_mismatch:${p.id}`);
    if (p.marketType !== 'SPREAD') blockers.push(`prediction_market_type_not_spread:${p.id}`);
  }

  const gameById = new Map<string, GenericShadowEvalGame>();
  for (const game of games) {
    if (gameById.has(game.id)) blockers.push(`duplicate_canonical_game:${game.id}`);
    gameById.set(game.id, game);
  }

  const closingsByPrediction = new Map<string, GenericShadowEvalClosing[]>();
  for (const closing of closings) {
    const rows = closingsByPrediction.get(closing.predictionId) ?? [];
    rows.push(closing);
    closingsByPrediction.set(closing.predictionId, rows);
  }
  for (const [predictionId, rows] of closingsByPrediction.entries()) {
    if (rows.length > 1) blockers.push(`duplicate_closing_for_prediction:${predictionId}`);
  }

  const perPrediction: GenericShadowCoreEvalRow[] = [];
  const counts = emptyCounts();

  for (const prediction of [...predictions].sort((a, b) =>
    a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : a.id.localeCompare(b.id)
  )) {
    counts.totalPredictions += 1;
    const reasons: string[] = [];
    const game = gameById.get(prediction.gameId) ?? null;

    if (!game) {
      blockers.push(`canonical_game_missing:${prediction.gameId}`);
      reasons.push('canonical_game_missing');
    } else {
      if (game.season !== captureRun.season) {
        blockers.push(`canonical_game_season_mismatch:${prediction.gameId}`);
        reasons.push('canonical_game_season_mismatch');
      }
      if (game.week !== captureRun.week) {
        blockers.push(`canonical_game_week_mismatch:${prediction.gameId}`);
        reasons.push('canonical_game_week_mismatch');
      }
      if (game.homeTeamId !== prediction.homeTeamId || game.awayTeamId !== prediction.awayTeamId) {
        blockers.push(`canonical_game_team_identity_mismatch:${prediction.gameId}`);
        reasons.push('canonical_game_team_identity_mismatch');
      }
    }

    const resultAvailable =
      game != null &&
      game.status === 'final' &&
      isIntegerScore(game.homeScore) &&
      isIntegerScore(game.awayScore) &&
      !reasons.includes('canonical_game_team_identity_mismatch') &&
      !reasons.includes('canonical_game_season_mismatch') &&
      !reasons.includes('canonical_game_week_mismatch');

    if (resultAvailable) counts.finalScoreAvailableCount += 1;
    else counts.finalScoreUnavailableCount += 1;

    const predictionAvailable = prediction.predictionStatus === 'AVAILABLE';
    if (predictionAvailable) counts.predictionAvailableCount += 1;
    else counts.predictionUnavailableCount += 1;

    const noSelection =
      predictionAvailable && prediction.selectedSide === 'NO_SELECTION';
    if (noSelection) counts.noSelectionCount += 1;

    const selected =
      predictionAvailable &&
      (prediction.selectedSide === 'HOME' || prediction.selectedSide === 'AWAY');
    if (selected) counts.selectionCount += 1;

    let atsResult: GenericShadowAtsResult = 'UNAVAILABLE';
    let sideMargin: number | null = null;
    let coverMargin: number | null = null;

    if (!predictionAvailable) {
      reasons.push('prediction_unavailable');
    } else if (noSelection) {
      atsResult = 'NOT_APPLICABLE';
    } else if (selected) {
      const validation = validSelectedPrediction(prediction);
      reasons.push(...validation.reasons);
      if (validation.valid && resultAvailable && game) {
        sideMargin =
          prediction.selectedSide === 'HOME'
            ? (game.homeScore as number) - (game.awayScore as number)
            : (game.awayScore as number) - (game.homeScore as number);
        coverMargin = sideMargin + (prediction.predictionPickValue as number);
        if (Math.abs(coverMargin) <= GENERIC_SHADOW_CORE_EVAL_V1_EPSILON) {
          atsResult = 'PUSH';
          coverMargin = 0;
        } else {
          atsResult = coverMargin > 0 ? 'WIN' : 'LOSS';
        }
      } else if (!resultAvailable) {
        reasons.push('final_score_unavailable');
      }
    } else {
      reasons.push('available_prediction_invalid_selection_state');
    }

    if (atsResult === 'WIN') counts.atsWinCount += 1;
    else if (atsResult === 'LOSS') counts.atsLossCount += 1;
    else if (atsResult === 'PUSH') counts.atsPushCount += 1;
    else if (atsResult === 'NOT_APPLICABLE') counts.atsNotApplicableCount += 1;
    else counts.atsUnavailableCount += 1;

    const closingRows = closingsByPrediction.get(prediction.id) ?? [];
    const closing = closingRows.length === 1 ? closingRows[0] : null;
    if (closing) {
      counts.closingRowPresentCount += 1;
      if (closing.status === 'AVAILABLE') counts.closingAvailableCount += 1;
      else counts.closingUnavailableCount += 1;
      if (closing.gameId !== prediction.gameId) {
        blockers.push(`closing_game_mismatch:${prediction.id}`);
        reasons.push('closing_game_mismatch');
      }
      if (closing.predictionId !== prediction.id) {
        blockers.push(`closing_prediction_mismatch:${prediction.id}`);
        reasons.push('closing_prediction_mismatch');
      }
    }

    let clvStatus: GenericShadowClvStatus = 'UNAVAILABLE';
    let closingTeamLine: number | null = null;
    let clvPoints: number | null = null;

    if (!predictionAvailable) {
      clvStatus = 'UNAVAILABLE';
    } else if (noSelection) {
      clvStatus = 'NOT_APPLICABLE';
    } else if (selected) {
      const validation = validSelectedPrediction(prediction);
      if (!validation.valid) {
        reasons.push(...validation.reasons);
      } else if (!closing) {
        reasons.push('missing_t30_closing');
      } else if (
        closing.gameId !== prediction.gameId ||
        closing.predictionId !== prediction.id
      ) {
        // Cohort blocker already recorded above.
      } else if (closing.status !== 'AVAILABLE') {
        reasons.push(
          closing.unavailableReason
            ? `t30_closing_unavailable:${closing.unavailableReason}`
            : 't30_closing_unavailable'
        );
      } else if (closing.evaluationProtocol !== GENERIC_SHADOW_CORE_EVAL_V1_PROTOCOL) {
        reasons.push('closing_evaluation_protocol_mismatch');
      } else if (
        closing.closingDefinitionId !== GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID ||
        closing.closingDefinitionHash !== GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH
      ) {
        reasons.push('closing_definition_mismatch');
      } else if (!isFiniteNumber(closing.canonicalMarketHma)) {
        reasons.push('closing_market_hma_invalid');
      } else {
        closingTeamLine =
          prediction.selectedSide === 'HOME'
            ? -closing.canonicalMarketHma
            : closing.canonicalMarketHma;
        clvPoints =
          (prediction.predictionPickValue as number) - closingTeamLine;
        clvStatus = 'AVAILABLE';
      }
    }

    if (clvStatus === 'AVAILABLE') counts.clvAvailableCount += 1;
    else if (clvStatus === 'NOT_APPLICABLE') counts.clvNotApplicableCount += 1;
    else counts.clvUnavailableCount += 1;

    const roi = researchPnlFor(atsResult);
    perPrediction.push({
      predictionId: prediction.id,
      gameId: prediction.gameId,
      homeTeamId: prediction.homeTeamId,
      awayTeamId: prediction.awayTeamId,
      kickoffTimestamp: toIso(prediction.kickoffTimestamp),
      predictionTimestamp: toIso(prediction.predictionTimestamp),
      predictionStatus: prediction.predictionStatus,
      unavailableReasons: [...prediction.unavailableReasons],
      marketType: prediction.marketType,
      selectedSide: prediction.selectedSide,
      selectedTeamId: prediction.selectedTeamId,
      predictionPickValue: prediction.predictionPickValue,
      finalGameStatus: game?.status ?? null,
      finalHomeScore: game?.homeScore ?? null,
      finalAwayScore: game?.awayScore ?? null,
      resultAvailable,
      atsResult,
      sideMargin,
      coverMargin,
      closingSnapshotId: closing?.id ?? null,
      closingStatus: closing?.status ?? null,
      closingUnavailableReason: closing?.unavailableReason ?? null,
      closingMarketHma: closing?.canonicalMarketHma ?? null,
      closingTeamLine,
      clvStatus,
      clvPoints,
      shadowStake: roi.stake,
      shadowPnl: roi.pnl,
      validationReasons: uniqueSorted(reasons),
    });
  }

  counts.atsGradedCount =
    counts.atsWinCount + counts.atsLossCount + counts.atsPushCount;

  const totalGradedStake = perPrediction.reduce(
    (sum, row) => sum + (row.shadowStake ?? 0),
    0
  );
  const totalResearchPnl = perPrediction.reduce(
    (sum, row) => sum + (row.shadowPnl ?? 0),
    0
  );
  const winLossDenom = counts.atsWinCount + counts.atsLossCount;
  const atsWinRate =
    winLossDenom > 0 ? counts.atsWinCount / winLossDenom : null;
  const availableClv = perPrediction
    .filter((row) => row.clvStatus === 'AVAILABLE' && row.clvPoints != null)
    .map((row) => row.clvPoints as number);
  const averageClvPoints =
    availableClv.length > 0
      ? availableClv.reduce((sum, value) => sum + value, 0) / availableClv.length
      : null;
  const researchRoi =
    totalGradedStake > 0 ? totalResearchPnl / totalGradedStake : null;

  return {
    evaluatorDefinitionId: GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_ID,
    evaluatorDefinitionHash: GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_HASH,
    evaluatorDefinitionManifest: GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_MANIFEST,
    evaluationProtocol: GENERIC_SHADOW_CORE_EVAL_V1_PROTOCOL,
    evaluatedAt: input.evaluatedAt.toISOString(),
    readOnly: true,
    providerCalls: 0,
    mutationsInvoked: false,
    reportValid: uniqueSorted(blockers).length === 0,
    blockers: uniqueSorted(blockers),
    captureRun: {
      id: captureRun.id,
      season: captureRun.season,
      week: captureRun.week,
      captureContext: captureRun.captureContext,
      modelFamily: captureRun.modelFamily,
      modelDefinitionId: captureRun.modelDefinitionId,
      modelDefinitionHash: captureRun.modelDefinitionHash,
      featureDefinitionId: captureRun.featureDefinitionId,
      featureDefinitionHash: captureRun.featureDefinitionHash,
      policyDefinitionId: captureRun.policyDefinitionId,
      policyDefinitionHash: captureRun.policyDefinitionHash,
      repoCommitSha: captureRun.repoCommitSha,
      captureTimestamp: toIso(captureRun.captureTimestamp),
      expectedGameIds: expectedGameIds ? uniqueSorted(expectedGameIds) : [],
    },
    counts,
    atsWinRate,
    totalGradedStake,
    totalResearchPnl,
    researchRoi,
    averageClvPoints,
    perPrediction,
  };
}
