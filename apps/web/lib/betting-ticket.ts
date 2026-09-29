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

export const BETTING_TICKET_SPREAD_TOTAL_A = 4.0;
export const BETTING_TICKET_SPREAD_TOTAL_B = 3.0;
export const BETTING_TICKET_SPREAD_TOTAL_C = 0.1;

export const BETTING_TICKET_ML_A = 10.0;
export const BETTING_TICKET_ML_B = 5.0;
export const BETTING_TICKET_ML_C = 1.0;

const EPS = 1e-9;
const KICKOFF_GATE_MS = 30 * 60 * 1000;

export interface BettingTicketClassificationInput {
  marketType: string;
  side: string;
  modelPrice: number;
  lockedPrice: number | null;
  lockedGrade: string | null;
  currentPrice: number | null;
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

  const label = formatTicketPrice(marketType, price);
  if (marketType === 'spread') {
    return grade === 'A'
      ? `A-grade at ${label} or better`
      : `Playable to ${label}`;
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
