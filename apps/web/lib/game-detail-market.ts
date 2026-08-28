/**
 * Authoritative current/closing market derivation for game detail.
 * Uses append-only marketSelection only — never legacy snapshot groups.
 */

import type {
  BookMoneylineSnapshot,
  BookSpreadSnapshot,
  BookTotalSnapshot,
  GameMarketSelection,
} from './market-line-snapshot';

export interface GameDetailMarketDerivation {
  /** Signed HMA consensus (positive = home favored). */
  spreadHma: number | null;
  /** Favorite-centric consensus (<= 0). */
  marketSpread: number | null;
  homePrice: number | null;
  awayPrice: number | null;
  favoriteTeamId: string | null;
  favoriteTeamName: string | null;
  isPickEm: boolean;
  marketTotal: number | null;
  /** Team-specific ML consensus from coherent per-book snapshots. */
  homeMoneylinePrice: number | null;
  awayMoneylinePrice: number | null;
  moneylineFavoriteTeamId: string | null;
  moneylineDogTeamId: string | null;
  moneylineFavoritePrice: number | null;
  moneylineDogPrice: number | null;
  moneylinePerBookCount: number;
  displaySpread: BookSpreadSnapshot | null;
  displayTotal: BookTotalSnapshot | null;
  displayMoneyline: BookMoneylineSnapshot | null;
  source: 'marketSelection';
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Derive market orientation from signed HMA consensus.
 * Does NOT consult legacy snapshot rows.
 */
export function deriveGameDetailMarketFromSelection(options: {
  marketSelection: GameMarketSelection;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
}): GameDetailMarketDerivation {
  const { marketSelection, homeTeamId, awayTeamId, homeTeamName, awayTeamName } =
    options;

  const spreadHma = marketSelection.spreadConsensus.value;
  let homePrice: number | null = null;
  let awayPrice: number | null = null;
  let marketSpread: number | null = null;
  let favoriteTeamId: string | null = null;
  let favoriteTeamName: string | null = null;
  let isPickEm = false;

  if (spreadHma !== null && Number.isFinite(spreadHma)) {
    const abs = Math.abs(spreadHma);
    if (abs < 1e-9) {
      // Pick'em: no favorite; both sides even. Normalize -0 → 0.
      isPickEm = true;
      homePrice = 0;
      awayPrice = 0;
      marketSpread = 0;
      favoriteTeamId = null;
      favoriteTeamName = null;
    } else if (spreadHma > 0) {
      favoriteTeamId = homeTeamId;
      favoriteTeamName = homeTeamName;
      homePrice = -abs;
      awayPrice = abs;
      marketSpread = -abs;
    } else {
      favoriteTeamId = awayTeamId;
      favoriteTeamName = awayTeamName;
      awayPrice = -abs;
      homePrice = abs;
      marketSpread = -abs;
    }
  }

  const totalRaw = marketSelection.totalConsensus.value;
  const marketTotal =
    totalRaw !== null && Number.isFinite(totalRaw) && totalRaw >= 0
      ? Math.abs(totalRaw)
      : null;

  const mlBooks = marketSelection.moneylineByBook;
  const homeMlPrices = mlBooks
    .map((s) => s.homePrice)
    .filter((p) => Number.isFinite(p) && Math.abs(p) >= 100);
  const awayMlPrices = mlBooks
    .map((s) => s.awayPrice)
    .filter((p) => Number.isFinite(p) && Math.abs(p) >= 100);

  const homeMoneylinePrice = median(homeMlPrices);
  const awayMoneylinePrice = median(awayMlPrices);

  let moneylineFavoriteTeamId: string | null = null;
  let moneylineDogTeamId: string | null = null;
  let moneylineFavoritePrice: number | null = null;
  let moneylineDogPrice: number | null = null;

  if (homeMoneylinePrice !== null && awayMoneylinePrice !== null) {
    if (homeMoneylinePrice < awayMoneylinePrice) {
      moneylineFavoriteTeamId = homeTeamId;
      moneylineDogTeamId = awayTeamId;
      moneylineFavoritePrice = homeMoneylinePrice;
      moneylineDogPrice = awayMoneylinePrice;
    } else if (awayMoneylinePrice < homeMoneylinePrice) {
      moneylineFavoriteTeamId = awayTeamId;
      moneylineDogTeamId = homeTeamId;
      moneylineFavoritePrice = awayMoneylinePrice;
      moneylineDogPrice = homeMoneylinePrice;
    } else {
      // Equal prices — leave unset rather than invent a favorite
      moneylineFavoritePrice = homeMoneylinePrice;
      moneylineDogPrice = awayMoneylinePrice;
    }
  }

  return {
    spreadHma:
      spreadHma !== null && Number.isFinite(spreadHma)
        ? Object.is(spreadHma, -0) || Math.abs(spreadHma) < 1e-9
          ? 0
          : spreadHma
        : null,
    marketSpread,
    homePrice,
    awayPrice,
    favoriteTeamId,
    favoriteTeamName,
    isPickEm,
    marketTotal,
    homeMoneylinePrice,
    awayMoneylinePrice,
    moneylineFavoriteTeamId,
    moneylineDogTeamId,
    moneylineFavoritePrice,
    moneylineDogPrice,
    moneylinePerBookCount: mlBooks.length,
    displaySpread: marketSelection.displaySpread,
    displayTotal: marketSelection.displayTotal,
    displayMoneyline: marketSelection.displayMoneyline,
    source: 'marketSelection',
  };
}

export interface MarketFavoriteInvariantResult {
  ok: boolean;
  isPickEm: boolean;
  favoriteLineValid: boolean;
  pricesCorrectlySigned: boolean;
  favoriteMatchesPrices: boolean;
  reason: string | null;
}

/** Validate favorite mapping; pick'em is a first-class valid state. */
export function validateMarketFavoriteInvariant(options: {
  isPickEm: boolean;
  marketSpread: number | null;
  homePrice: number | null;
  awayPrice: number | null;
  favoriteTeamId: string | null;
  homeTeamId: string;
  awayTeamId: string;
}): MarketFavoriteInvariantResult {
  const {
    isPickEm,
    marketSpread,
    homePrice,
    awayPrice,
    favoriteTeamId,
    homeTeamId,
    awayTeamId,
  } = options;

  if (isPickEm) {
    const pickEmOk =
      marketSpread === 0 &&
      homePrice === 0 &&
      awayPrice === 0 &&
      favoriteTeamId == null;
    return {
      ok: pickEmOk,
      isPickEm: true,
      favoriteLineValid: true,
      pricesCorrectlySigned: true,
      favoriteMatchesPrices: true,
      reason: pickEmOk
        ? null
        : 'pickem_requires_zero_prices_and_no_favorite',
    };
  }

  if (
    marketSpread === null ||
    homePrice === null ||
    awayPrice === null ||
    favoriteTeamId == null
  ) {
    return {
      ok: false,
      isPickEm: false,
      favoriteLineValid: false,
      pricesCorrectlySigned: false,
      favoriteMatchesPrices: false,
      reason: 'missing_market_spread_or_favorite',
    };
  }

  const favoriteLineValid = marketSpread < 0;
  const pricesCorrectlySigned =
    (homePrice < 0 && awayPrice > 0) || (homePrice > 0 && awayPrice < 0);
  const favoriteMatchesPrices =
    (homePrice < awayPrice && favoriteTeamId === homeTeamId) ||
    (awayPrice < homePrice && favoriteTeamId === awayTeamId);

  const ok =
    favoriteLineValid && pricesCorrectlySigned && favoriteMatchesPrices;
  return {
    ok,
    isPickEm: false,
    favoriteLineValid,
    pricesCorrectlySigned,
    favoriteMatchesPrices,
    reason: ok ? null : 'favorite_mismatch',
  };
}

export interface AuthoritativeMarketProvenance {
  spread: {
    bookName: string;
    timestamp: string;
    homeLine: number;
    awayLine: number;
    marketSpreadHma: number;
    source: 'marketSelection.displaySpread';
  } | null;
  total: {
    bookName: string;
    timestamp: string;
    total: number;
    source: 'marketSelection.displayTotal';
  } | null;
  moneyline: {
    bookName: string;
    timestamp: string;
    homePrice: number;
    awayPrice: number;
    source: 'marketSelection.displayMoneyline';
  } | null;
  bookSource: string;
  snapshotId: string;
  updatedAt: string;
}

/** Provenance from display snapshots only — never legacy group rows. */
export function buildAuthoritativeMarketProvenance(
  selection: GameMarketSelection
): AuthoritativeMarketProvenance {
  const spread = selection.displaySpread
    ? {
        bookName: selection.displaySpread.bookName,
        timestamp: selection.displaySpread.timestamp,
        homeLine: selection.displaySpread.homeLine,
        awayLine: selection.displaySpread.awayLine,
        marketSpreadHma: selection.displaySpread.marketSpreadHma,
        source: 'marketSelection.displaySpread' as const,
      }
    : null;
  const total = selection.displayTotal
    ? {
        bookName: selection.displayTotal.bookName,
        timestamp: selection.displayTotal.timestamp,
        total: selection.displayTotal.total,
        source: 'marketSelection.displayTotal' as const,
      }
    : null;
  const moneyline = selection.displayMoneyline
    ? {
        bookName: selection.displayMoneyline.bookName,
        timestamp: selection.displayMoneyline.timestamp,
        homePrice: selection.displayMoneyline.homePrice,
        awayPrice: selection.displayMoneyline.awayPrice,
        source: 'marketSelection.displayMoneyline' as const,
      }
    : null;

  const bookSource =
    spread?.bookName || total?.bookName || moneyline?.bookName || 'Unknown';
  const tsCandidates = [
    spread?.timestamp,
    total?.timestamp,
    moneyline?.timestamp,
  ].filter((t): t is string => !!t);
  const updatedAt =
    tsCandidates.length > 0
      ? new Date(
          Math.max(...tsCandidates.map((t) => new Date(t).getTime()))
        ).toISOString()
      : new Date(0).toISOString();
  const snapshotId = `${bookSource}::${updatedAt}`;

  return { spread, total, moneyline, bookSource, snapshotId, updatedAt };
}

/** Hybrid tier closePrice: the selected BET SIDE's team line. */
export function resolveBetSideClosePrice(options: {
  betTeamId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeLine: number | null | undefined;
  awayLine: number | null | undefined;
  /** Fallback only when side provenance missing (e.g. favorite-centric HMA). */
  fallbackHma?: number | null;
}): number | null {
  const {
    betTeamId,
    homeTeamId,
    awayTeamId,
    homeLine,
    awayLine,
    fallbackHma,
  } = options;

  if (betTeamId === homeTeamId) {
    if (homeLine !== null && homeLine !== undefined && Number.isFinite(homeLine)) {
      return Number(homeLine);
    }
  } else if (betTeamId === awayTeamId) {
    if (awayLine !== null && awayLine !== undefined && Number.isFinite(awayLine)) {
      return Number(awayLine);
    }
  }

  if (fallbackHma !== null && fallbackHma !== undefined && Number.isFinite(fallbackHma)) {
    // Convert HMA to the bet team's line: home line = -HMA, away line = +HMA
    if (betTeamId === homeTeamId) return -Number(fallbackHma);
    if (betTeamId === awayTeamId) return Number(fallbackHma);
  }

  return null;
}
