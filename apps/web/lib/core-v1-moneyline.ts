/**
 * Pure Core V1 / Week Slate moneyline pick helpers.
 * Divisor 14.5 and thresholds match apps/web/app/api/weeks/slate/route.ts exactly.
 * Do not change calibration here without an explicit model-policy phase.
 */

import { americanToProb } from './market-line-helpers';

/** Suppress ML when |coreSpreadHma| exceeds this (Week Slate contract). */
export const ML_MAX_ABS_SPREAD = 24.0;

/** Minimum value as probability delta (1 percentage point). */
export const HARD_MIN_ML_VALUE = 0.01;

export function modelWinProbsFromCoreSpreadHma(coreSpreadHma: number): {
  modelHomeWinProb: number;
  modelAwayWinProb: number;
} {
  // Positive HMA = home favored → flip for home-win sigmoid input.
  const spreadForHome = -coreSpreadHma;
  const homeProbRaw = 1 / (1 + Math.pow(10, spreadForHome / 14.5));
  const modelHomeWinProb = Math.max(0.01, Math.min(0.99, homeProbRaw));
  return {
    modelHomeWinProb,
    modelAwayWinProb: 1 - modelHomeWinProb,
  };
}

/** Probability (0–1) → American odds. Matches game-detail fair-ML rounding. */
export function probToAmerican(prob: number): number {
  const p = Math.max(0.01, Math.min(0.99, prob));
  if (p >= 0.5) {
    return Math.round((-100 * p) / (1 - p));
  }
  return Math.round((100 * (1 - p)) / p);
}

export function gradeMoneylineValuePercent(
  valuePercent: number
): 'A' | 'B' | 'C' | null {
  if (!Number.isFinite(valuePercent) || valuePercent < 1.0) return null;
  if (valuePercent >= 10.0) return 'A';
  if (valuePercent >= 5.0) return 'B';
  if (valuePercent >= 1.0) return 'C';
  return null;
}

export interface CoreV1MoneylinePick {
  side: 'home' | 'away';
  teamId: string;
  teamName: string;
  /** Sportsbook American price for the bet side. */
  closePrice: number;
  /** Model fair American price for the bet side. */
  modelPrice: number;
  modelWinProb: number;
  valuePercent: number;
  grade: 'A' | 'B' | 'C';
  label: string;
}

/**
 * Week Slate ML selection: greatest positive value > 1pp; home wins ties (>=).
 */
export function selectCoreV1MoneylinePick(options: {
  coreSpreadHma: number;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeAmericanPrice: number;
  awayAmericanPrice: number;
}): CoreV1MoneylinePick | null {
  const {
    coreSpreadHma,
    homeTeamId,
    awayTeamId,
    homeTeamName,
    awayTeamName,
    homeAmericanPrice,
    awayAmericanPrice,
  } = options;

  if (!Number.isFinite(coreSpreadHma)) return null;
  if (Math.abs(coreSpreadHma) > ML_MAX_ABS_SPREAD) return null;
  if (
    !Number.isFinite(homeAmericanPrice) ||
    !Number.isFinite(awayAmericanPrice)
  ) {
    return null;
  }

  const { modelHomeWinProb, modelAwayWinProb } =
    modelWinProbsFromCoreSpreadHma(coreSpreadHma);

  const impliedHome = americanToProb(homeAmericanPrice);
  const impliedAway = americanToProb(awayAmericanPrice);
  if (impliedHome === null || impliedAway === null) return null;

  const homeValue = modelHomeWinProb - impliedHome;
  const awayValue = modelAwayWinProb - impliedAway;
  const homeValuePercent = homeValue * 100;
  const awayValuePercent = awayValue * 100;

  let selectedSide: 'home' | 'away' | null = null;
  let selectedValuePercent: number | null = null;

  if (homeValuePercent > HARD_MIN_ML_VALUE * 100) {
    if (awayValuePercent <= HARD_MIN_ML_VALUE * 100 || homeValuePercent >= awayValuePercent) {
      selectedSide = 'home';
      selectedValuePercent = homeValuePercent;
    }
  }
  if (awayValuePercent > HARD_MIN_ML_VALUE * 100) {
    if (selectedSide === null || awayValuePercent > selectedValuePercent!) {
      selectedSide = 'away';
      selectedValuePercent = awayValuePercent;
    }
  }

  if (selectedSide === null || selectedValuePercent === null) return null;

  const grade = gradeMoneylineValuePercent(selectedValuePercent);
  if (!grade) return null;

  const isHome = selectedSide === 'home';
  const closePrice = isHome ? homeAmericanPrice : awayAmericanPrice;
  const modelWinProb = isHome ? modelHomeWinProb : modelAwayWinProb;
  const modelPrice = probToAmerican(modelWinProb);
  const teamName = isHome ? homeTeamName : awayTeamName;
  const teamId = isHome ? homeTeamId : awayTeamId;
  const priceStr = closePrice < 0 ? String(closePrice) : `+${closePrice}`;

  return {
    side: selectedSide,
    teamId,
    teamName,
    closePrice,
    modelPrice,
    modelWinProb,
    valuePercent: selectedValuePercent,
    grade,
    label: `${teamName} ${priceStr}`,
  };
}
