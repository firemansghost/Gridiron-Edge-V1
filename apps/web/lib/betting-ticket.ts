/**
 * Betting Ticket — read-only operator synthesis over persisted Official Card truth
 * plus the current persisted market snapshot.
 *
 * This module does NOT recalculate Core V1 or write Bet/MarketLine rows.
 * It answers whether a locked official wager is still attractive at the
 * currently stored market number.
 */

import {
  formatAmericanOdds,
  formatLineNumber,
  formatSignedSpread,
} from './official-card';
import { americanToProb } from './market-line-helpers';

export type BettingTicketBucket = 'bet' | 'watch' | 'pass';
export type BettingTicketGrade = 'A' | 'B' | 'C' | null;
export type BettingTicketOperatorTier = 'primary' | 'secondary' | 'alternate' | null;

export const BETTING_TICKET_SPREAD_TOTAL_A = 4.0;
export const BETTING_TICKET_SPREAD_TOTAL_B = 3.0;
export const BETTING_TICKET_SPREAD_TOTAL_C = 0.1;

export const BETTING_TICKET_ML_A = 10.0;
export const BETTING_TICKET_ML_B = 5.0;
export const BETTING_TICKET_ML_C = 1.0;

/**
 * Operator-priority overlay only. This does not change Core V1 grade or stake.
 * "Primary" means the current value cushion is at least 2x the existing A-grade floor.
 */
export const BETTING_TICKET_PRIMARY_A_MULTIPLE = 2.0;

const EPS = 1e-9;
const KICKOFF_GATE_MS = 30 * 60 * 1000;

/**
 * Operator freshness gate only.
 *
 * This is intentionally looser than the prospective T-30 research freshness
 * contract. The ticket is an early-week decision surface, but it must not
 * label an old persisted number BET NOW.
 */
export const BETTING_TICKET_MAX_MARKET_AGE_MINUTES = 180;

export interface BettingTicketClassificationInput {
  marketType: string;
  side: string;
  modelPrice: number;
  lockedPrice: number | null;
  lockedGrade: string | null;
  currentPrice: number | null;
  marketAgeMinutes?: number | null;
  gameStatus: string;
  kickoffIso: string;
  nowIso: string;
}

export interface BettingTicketClassification {
  bucket: BettingTicketBucket;
  currentEdgeOrValue: number | null;
  currentGrade: BettingTicketGrade;
  movement: number | null;
  priceNotWorse: boolean | null;
  playableToPrice: number | null;
  priorityPrice: number | null;
  reason: string;
  actionLabel: string;
}

export function probabilityToAmerican(probability: number): number | null {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) {
    return null;
  }
  if (probability >= 0.5) {
    return -Math.round((probability / (1 - probability)) * 100);
  }
  return Math.round(((1 - probability) / probability) * 100);
}

export function ticketCurrentEdge(options: {
  marketType: string;
  side: string;
  modelPrice: number;
  currentPrice: number | null;
}): number | null {
  const { marketType, side, modelPrice, currentPrice } = options;
  if (
    !Number.isFinite(modelPrice) ||
    currentPrice === null ||
    !Number.isFinite(currentPrice)
  ) {
    return null;
  }

  if (marketType === 'spread') {
    return currentPrice - modelPrice;
  }

  if (marketType === 'total') {
    if (side === 'over') return modelPrice - currentPrice;
    if (side === 'under') return currentPrice - modelPrice;
    return null;
  }

  if (marketType === 'moneyline') {
    const modelProb = americanToProb(modelPrice);
    const currentImplied = americanToProb(currentPrice);
    if (modelProb === null || currentImplied === null) return null;
    return (modelProb - currentImplied) * 100;
  }

  return null;
}

export function ticketGrade(
  marketType: string,
  edgeOrValue: number | null
): BettingTicketGrade {
  if (edgeOrValue === null || !Number.isFinite(edgeOrValue)) return null;

  if (marketType === 'moneyline') {
    if (edgeOrValue >= BETTING_TICKET_ML_A) return 'A';
    if (edgeOrValue >= BETTING_TICKET_ML_B) return 'B';
    if (edgeOrValue >= BETTING_TICKET_ML_C) return 'C';
    return null;
  }

  if (marketType === 'spread' || marketType === 'total') {
    if (edgeOrValue >= BETTING_TICKET_SPREAD_TOTAL_A) return 'A';
    if (edgeOrValue >= BETTING_TICKET_SPREAD_TOTAL_B) return 'B';
    if (edgeOrValue >= BETTING_TICKET_SPREAD_TOTAL_C) return 'C';
    return null;
  }

  return null;
}

export function ticketAStrengthMultiple(
  marketType: string,
  edgeOrValue: number | null
): number | null {
  if (edgeOrValue === null || !Number.isFinite(edgeOrValue)) return null;
  if (marketType === 'moneyline') return edgeOrValue / BETTING_TICKET_ML_A;
  if (marketType === 'spread' || marketType === 'total') {
    return edgeOrValue / BETTING_TICKET_SPREAD_TOTAL_A;
  }
  return null;
}

export interface BettingTicketPriorityInput {
  betId: string;
  gameId: string;
  bucket: BettingTicketBucket;
  marketType: string;
  currentEdgeOrValue: number | null;
}

export interface BettingTicketPriorityResult {
  operatorTier: BettingTicketOperatorTier;
  strengthMultiple: number | null;
  priorityReason: string | null;
}

/**
 * Builds a compact operator hierarchy without changing model grade/stake.
 *
 * - one preferred BET NOW expression per game
 * - Primary: preferred expression is >= 2x the existing A-grade floor
 * - Secondary: preferred expression remains BET NOW but is < 2x A
 * - Alternate: another BET NOW market on a game already represented above
 */
export function buildBettingTicketPriority(
  items: BettingTicketPriorityInput[]
): Map<string, BettingTicketPriorityResult> {
  const out = new Map<string, BettingTicketPriorityResult>();

  for (const item of items) {
    out.set(item.betId, {
      operatorTier: null,
      strengthMultiple: ticketAStrengthMultiple(
        item.marketType,
        item.currentEdgeOrValue
      ),
      priorityReason: null,
    });
  }

  const byGame = new Map<string, BettingTicketPriorityInput[]>();
  for (const item of items) {
    if (item.bucket !== 'bet') continue;
    const group = byGame.get(item.gameId) ?? [];
    group.push(item);
    byGame.set(item.gameId, group);
  }

  byGame.forEach((group) => {
    const ranked = [...group].sort((a, b) => {
      const aStrength =
        ticketAStrengthMultiple(a.marketType, a.currentEdgeOrValue) ?? -Infinity;
      const bStrength =
        ticketAStrengthMultiple(b.marketType, b.currentEdgeOrValue) ?? -Infinity;
      if (bStrength !== aStrength) return bStrength - aStrength;
      return a.betId.localeCompare(b.betId);
    });

    ranked.forEach((item, index) => {
      const strengthMultiple = ticketAStrengthMultiple(
        item.marketType,
        item.currentEdgeOrValue
      );

      if (index > 0) {
        out.set(item.betId, {
          operatorTier: 'alternate',
          strengthMultiple,
          priorityReason:
            'Same-game BET NOW exposure; keep one preferred expression on the main card unless intentionally doubling exposure.',
        });
        return;
      }

      const isPrimary =
        strengthMultiple !== null &&
        strengthMultiple >= BETTING_TICKET_PRIMARY_A_MULTIPLE;

      out.set(item.betId, {
        operatorTier: isPrimary ? 'primary' : 'secondary',
        strengthMultiple,
        priorityReason: isPrimary
          ? 'Current edge/value cushion is at least 2x the existing A-grade floor.'
          : 'Still BET NOW, but current edge/value cushion is below 2x the A-grade floor.',
      });
    });
  });

  return out;
}

/**
 * Positive movement = the currently stored price/line is better for the
 * already-locked betting side. Negative = worse.
 *
 * Spread/total units are points. Moneyline units are implied-probability
 * percentage points, which avoids comparing raw American prices across signs.
 */
export function ticketPriceMovement(options: {
  marketType: string;
  side: string;
  lockedPrice: number | null;
  currentPrice: number | null;
}): number | null {
  const { marketType, side, lockedPrice, currentPrice } = options;
  if (
    lockedPrice === null ||
    currentPrice === null ||
    !Number.isFinite(lockedPrice) ||
    !Number.isFinite(currentPrice)
  ) {
    return null;
  }

  if (marketType === 'spread') {
    return currentPrice - lockedPrice;
  }

  if (marketType === 'total') {
    if (side === 'over') return lockedPrice - currentPrice;
    if (side === 'under') return currentPrice - lockedPrice;
    return null;
  }

  if (marketType === 'moneyline') {
    const lockedImplied = americanToProb(lockedPrice);
    const currentImplied = americanToProb(currentPrice);
    if (lockedImplied === null || currentImplied === null) return null;
    return (lockedImplied - currentImplied) * 100;
  }

  return null;
}

function thresholdEdge(marketType: string, grade: 'A' | 'B'): number {
  if (marketType === 'moneyline') {
    return grade === 'A' ? BETTING_TICKET_ML_A : BETTING_TICKET_ML_B;
  }
  return grade === 'A'
    ? BETTING_TICKET_SPREAD_TOTAL_A
    : BETTING_TICKET_SPREAD_TOTAL_B;
}

/**
 * Price/line required to retain a requested grade using the persisted frozen
 * modelPrice. This is an operator threshold, not a model recalculation.
 */
export function ticketThresholdPrice(options: {
  marketType: string;
  side: string;
  modelPrice: number;
  grade: 'A' | 'B';
}): number | null {
  const { marketType, side, modelPrice, grade } = options;
  if (!Number.isFinite(modelPrice)) return null;
  const target = thresholdEdge(marketType, grade);

  if (marketType === 'spread') {
    return modelPrice + target;
  }

  if (marketType === 'total') {
    if (side === 'over') return modelPrice - target;
    if (side === 'under') return modelPrice + target;
    return null;
  }

  if (marketType === 'moneyline') {
    const modelProb = americanToProb(modelPrice);
    if (modelProb === null) return null;
    return probabilityToAmerican(modelProb - target / 100);
  }

  return null;
}

export function formatTicketPrice(
  marketType: string,
  price: number | null
): string {
  if (price === null || !Number.isFinite(price)) return '—';
  if (marketType === 'moneyline') return formatAmericanOdds(price);
  if (marketType === 'spread') return formatSignedSpread(price);
  if (marketType === 'total') return formatLineNumber(price);
  return String(price);
}

/**
 * Presentation-only formatter for operator-facing threshold labels.
 *
 * Raw threshold math remains unchanged. Spread thresholds are rounded upward
 * to the next common half-point because spread value improves as the selected
 * team's line increases. This makes the displayed action range conservative:
 * it never permits a worse line than the raw threshold.
 */
export function formatTicketThresholdPrice(
  marketType: string,
  price: number | null
): string {
  if (price === null || !Number.isFinite(price)) return '—';
  if (marketType !== 'spread') return formatTicketPrice(marketType, price);

  const conservativeHalfPoint = Math.ceil((price - EPS) * 2) / 2;
  if (Math.abs(conservativeHalfPoint) < EPS) return 'PK';
  return formatSignedSpread(conservativeHalfPoint);
}

function thresholdActionLabel(options: {
  marketType: string;
  side: string;
  price: number | null;
  grade: 'A' | 'B';
}): string {
  const { marketType, side, price, grade } = options;
  if (price === null || !Number.isFinite(price)) {
    return grade === 'A' ? 'Watch for A-grade value' : 'Wait for B-grade value';
  }

  const label = formatTicketThresholdPrice(marketType, price);
  if (marketType === 'spread') {
    return grade === 'A'
      ? `A-grade at ${label} or better`
      : `Playable to ${label} or better`;
  }
  if (marketType === 'moneyline') {
    return grade === 'A'
      ? `A-grade at ${label} or better`
      : `Playable to ${label} or better`;
  }
  if (marketType === 'total') {
    if (side === 'over') {
      return grade === 'A'
        ? `A-grade at Over ${label} or lower`
        : `Playable to Over ${label}`;
    }
    if (side === 'under') {
      return grade === 'A'
        ? `A-grade at Under ${label} or higher`
        : `Playable to Under ${label}`;
    }
  }
  return grade === 'A' ? 'Watch for A-grade value' : 'Wait for B-grade value';
}

function normalizeLockedGrade(value: string | null): BettingTicketGrade {
  return value === 'A' || value === 'B' || value === 'C' ? value : null;
}

export function classifyBettingTicketWager(
  input: BettingTicketClassificationInput
): BettingTicketClassification {
  const currentEdgeOrValue = ticketCurrentEdge(input);
  const currentGrade = ticketGrade(input.marketType, currentEdgeOrValue);
  const movement = ticketPriceMovement(input);
  const priceNotWorse = movement === null ? null : movement >= -EPS;
  const playableToPrice = ticketThresholdPrice({
    marketType: input.marketType,
    side: input.side,
    modelPrice: input.modelPrice,
    grade: 'B',
  });
  const priorityPrice = ticketThresholdPrice({
    marketType: input.marketType,
    side: input.side,
    modelPrice: input.modelPrice,
    grade: 'A',
  });

  const nowMs = new Date(input.nowIso).getTime();
  const kickoffMs = new Date(input.kickoffIso).getTime();
  const status = String(input.gameStatus || '').toLowerCase();

  if (status !== 'scheduled' || !Number.isFinite(kickoffMs)) {
    return {
      bucket: 'pass',
      currentEdgeOrValue,
      currentGrade,
      movement,
      priceNotWorse,
      playableToPrice,
      priorityPrice,
      reason: status === 'final' ? 'Game final' : 'Game no longer scheduled',
      actionLabel: 'Closed',
    };
  }

  if (Number.isFinite(nowMs) && kickoffMs <= nowMs + KICKOFF_GATE_MS) {
    return {
      bucket: 'pass',
      currentEdgeOrValue,
      currentGrade,
      movement,
      priceNotWorse,
      playableToPrice,
      priorityPrice,
      reason: kickoffMs <= nowMs ? 'Kickoff has passed' : 'Inside 30-minute kickoff gate',
      actionLabel: 'Do not chase',
    };
  }

  if (input.currentPrice === null || currentEdgeOrValue === null) {
    return {
      bucket: 'watch',
      currentEdgeOrValue,
      currentGrade,
      movement,
      priceNotWorse,
      playableToPrice,
      priorityPrice,
      reason: 'Current persisted market price unavailable',
      actionLabel: 'Refresh market before betting',
    };
  }

  if (
    input.marketAgeMinutes !== null &&
    input.marketAgeMinutes !== undefined &&
    Number.isFinite(input.marketAgeMinutes) &&
    input.marketAgeMinutes > BETTING_TICKET_MAX_MARKET_AGE_MINUTES
  ) {
    const ageHours = input.marketAgeMinutes / 60;
    return {
      bucket: 'watch',
      currentEdgeOrValue,
      currentGrade,
      movement,
      priceNotWorse,
      playableToPrice,
      priorityPrice,
      reason: `Persisted market snapshot is ${ageHours.toFixed(1)}h old; refresh odds before betting`,
      actionLabel: 'Refresh market before betting',
    };
  }

  const lockedGrade = normalizeLockedGrade(input.lockedGrade);
  if (
    lockedGrade === 'A' &&
    currentGrade === 'A' &&
    priceNotWorse === true
  ) {
    return {
      bucket: 'bet',
      currentEdgeOrValue,
      currentGrade,
      movement,
      priceNotWorse,
      playableToPrice,
      priorityPrice,
      reason: 'Locked A, still A, and current price is not worse than lock',
      actionLabel: thresholdActionLabel({
        marketType: input.marketType,
        side: input.side,
        price: playableToPrice,
        grade: 'B',
      }),
    };
  }

  if (currentGrade === 'A' || currentGrade === 'B') {
    const lostLockedPrice =
      lockedGrade === 'A' && currentGrade === 'A' && priceNotWorse === false;

    return {
      bucket: 'watch',
      currentEdgeOrValue,
      currentGrade,
      movement,
      priceNotWorse,
      playableToPrice,
      priorityPrice,
      reason: lostLockedPrice
        ? 'Still A-grade, but the current price is worse than the locked price'
        : `Still ${currentGrade}-grade value, but outside the strict BET NOW filter`,
      actionLabel: lostLockedPrice && input.lockedPrice !== null
        ? `Watch for ${formatTicketPrice(input.marketType, input.lockedPrice)} or better`
        : thresholdActionLabel({
            marketType: input.marketType,
            side: input.side,
            price: priorityPrice,
            grade: 'A',
          }),
    };
  }

  return {
    bucket: 'pass',
    currentEdgeOrValue,
    currentGrade,
    movement,
    priceNotWorse,
    playableToPrice,
    priorityPrice,
    reason:
      currentGrade === 'C'
        ? 'Only C-grade value remains at the current number'
        : 'Current number no longer clears the minimum official edge/value floor',
    actionLabel: thresholdActionLabel({
      marketType: input.marketType,
      side: input.side,
      price: playableToPrice,
      grade: 'B',
    }),
  };
}
