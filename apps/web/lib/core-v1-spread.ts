/**
 * Core V1 Spread Helper
 * 
 * Single source of truth for Core V1 OLS spread predictions.
 * 
 * Model: y_hma = β₀ + β_rating * ratingDiffBlend + β_hfa * hfaPoints
 * 
 * Where:
 * - ratingDiffBlend = homeRatingBlend - awayRatingBlend (denormalized, in V2 scale)
 * - hfaPoints = 2.0 for true home games, 0.0 for neutral
 * - Frame: HMA (Home minus Away)
 *   - Positive = home should be favored
 *   - Negative = away should be favored
 */

import { prisma } from './prisma';
// Static imports - bundled by Next.js/Vercel
import coreCoefficients2025 from './data/core_coefficients_2025_fe_v1.json';
import blendConfig from './data/rating_blend_config.json';
import mftrRatings from './data/mftr_ratings_ridge.json';
import hfaConfig from './data/core_v1_hfa_config.json';

interface BlendConfig {
  optimalWeight: number;
  normalization: {
    v2Mean: number;
    v2Std: number;
    mftrMean: number;
    mftrStd: number;
  };
}

// Static data - no caching needed, already loaded at build time
const BLEND_CONFIG: BlendConfig = blendConfig as BlendConfig;
const MFTR_RATINGS_MAP: Map<string, number> = new Map(Object.entries(mftrRatings as Record<string, number>));

interface HfaConfig {
  baseHfaPoints: number;
  teamAdjustments: Record<string, number>;
  neutralSiteOverrides: Record<string, number>;
  clipRange: {
    min: number;
    max: number;
  };
  version: string;
  timestamp: string;
  note?: string;
}

const HFA_CONFIG: HfaConfig = hfaConfig as HfaConfig;

interface CoreCoefficients {
  beta0: number;
  betaRatingDiff: number;
  betaHfa: number;
  season: number;
  featureVersion: string;
  calibratedOnSet: 'A';
  timestamp: string;
}

// Static coefficients - no caching needed, already loaded at build time
const CORE_V1_COEFFS_2025: CoreCoefficients = coreCoefficients2025 as CoreCoefficients;

/**
 * Get blend configuration (static import, no file I/O)
 */
function getBlendConfig(): BlendConfig | null {
  return BLEND_CONFIG;
}

/**
 * Get MFTR ratings (static import, no file I/O)
 */
function getMFTRRatings(): Map<string, number> | null {
  return MFTR_RATINGS_MAP;
}

/**
 * Compute ratingDiffBlend from V2 ratings and MFTR
 * 
 * @param homeTeamId - Home team ID
 * @param awayTeamId - Away team ID
 * @param homeV2 - Home team V2 rating
 * @param awayV2 - Away team V2 rating
 * @returns ratingDiffBlend in HMA frame (denormalized, V2 scale)
 */
export function computeRatingDiffBlend(
  homeTeamId: string,
  awayTeamId: string,
  homeV2: number,
  awayV2: number
): number {
  const blendConfig = getBlendConfig();
  const mftrRatings = getMFTRRatings();

  // If no blend config or MFTR, fall back to raw V2 difference
  if (!blendConfig || !mftrRatings) {
    return homeV2 - awayV2;
  }

  const homeMFTR = mftrRatings.get(homeTeamId);
  const awayMFTR = mftrRatings.get(awayTeamId);

  if (homeMFTR === undefined || awayMFTR === undefined) {
    return homeV2 - awayV2;
  }

  // Normalize V2 and MFTR
  const homeV2Norm = (homeV2 - blendConfig.normalization.v2Mean) / blendConfig.normalization.v2Std;
  const awayV2Norm = (awayV2 - blendConfig.normalization.v2Mean) / blendConfig.normalization.v2Std;
  const homeMFTRNorm = (homeMFTR - blendConfig.normalization.mftrMean) / blendConfig.normalization.mftrStd;
  const awayMFTRNorm = (awayMFTR - blendConfig.normalization.mftrMean) / blendConfig.normalization.mftrStd;

  // Blend
  const w = blendConfig.optimalWeight;
  const homeBlend = w * homeV2Norm + (1 - w) * homeMFTRNorm;
  const awayBlend = w * awayV2Norm + (1 - w) * awayMFTRNorm;

  // Denormalize back to V2 scale
  const blendDiffNorm = homeBlend - awayBlend;
  const blendDiffDenorm = blendDiffNorm * blendConfig.normalization.v2Std + blendConfig.normalization.v2Mean;

  return blendDiffDenorm;
}

/**
 * Get Core V1 coefficients (static import, no file I/O)
 */
function getCoreCoefficients(): CoreCoefficients {
  // Validate
  if (typeof CORE_V1_COEFFS_2025.beta0 !== 'number' || 
      typeof CORE_V1_COEFFS_2025.betaRatingDiff !== 'number' || 
      typeof CORE_V1_COEFFS_2025.betaHfa !== 'number') {
    throw new Error('Invalid Core V1 coefficients format');
  }
  
  return CORE_V1_COEFFS_2025;
}

/**
 * Compute effective HFA for a game using HFA v2 config
 * 
 * @param homeTeamId - Home team ID
 * @param neutralSite - Whether game is at neutral site
 * @returns Effective HFA points (0.0 for neutral, otherwise base + adjustment, clipped)
 */
export function computeEffectiveHfa(
  homeTeamId: string,
  neutralSite: boolean
): {
  effectiveHfa: number;
  baseHfa: number;
  teamAdjustment: number;
  rawHfa: number;
} {
  // Neutral site: HFA = 0
  if (neutralSite) {
    return {
      effectiveHfa: 0.0,
      baseHfa: HFA_CONFIG.baseHfaPoints,
      teamAdjustment: 0.0,
      rawHfa: 0.0,
    };
  }
  
  // True home game: base + team adjustment
  const baseHfa = HFA_CONFIG.baseHfaPoints;
  const teamAdjustment = HFA_CONFIG.teamAdjustments[homeTeamId] ?? 0.0;
  const rawHfa = baseHfa + teamAdjustment;
  
  // Clip to range
  const effectiveHfa = Math.max(
    HFA_CONFIG.clipRange.min,
    Math.min(HFA_CONFIG.clipRange.max, rawHfa)
  );
  
  return {
    effectiveHfa,
    baseHfa,
    teamAdjustment,
    rawHfa,
  };
}

/**
 * Compute Core V1 spread prediction in HMA frame
 * 
 * @param ratingDiffBlend - Home rating blend minus away rating blend (denormalized, V2 scale)
 * @param hfaPoints - Home field advantage points (from computeEffectiveHfa or legacy 2.0 for home, 0.0 for neutral)
 * @returns Predicted spread in HMA frame (positive = home favored, negative = away favored)
 */
export function computeCoreV1Spread(
  ratingDiffBlend: number,
  hfaPoints: number
): number {
  const coeffs = getCoreCoefficients();
  
  // Core V1 OLS: y_hma = β₀ + β_rating * ratingDiffBlend + β_hfa * hfaPoints
  const spreadHma = coeffs.beta0 + coeffs.betaRatingDiff * ratingDiffBlend + coeffs.betaHfa * hfaPoints;
  
  return spreadHma;
}

/**
 * Get Core V1 spread and favorite/dog information
 * 
 * @param ratingDiffBlend - Home rating blend minus away rating blend
 * @param hfaPoints - Home field advantage points (2.0 for home, 0.0 for neutral)
 * @param homeTeamId - Home team ID
 * @param awayTeamId - Away team ID
 * @param homeTeamName - Home team name
 * @param awayTeamName - Away team name
 * @returns Core V1 spread prediction and favorite/dog info
 */
export function getCoreV1SpreadInfo(
  ratingDiffBlend: number,
  hfaPoints: number,
  homeTeamId: string,
  awayTeamId: string,
  homeTeamName: string,
  awayTeamName: string
): {
  coreSpreadHma: number;
  favoriteTeamId: string;
  dogTeamId: string;
  favoriteName: string;
  dogName: string;
  favoriteSpread: number; // Favorite-centric (always negative)
  dogSpread: number; // Dog spread (always positive)
  favoriteLine: string; // e.g., "Alabama -4.5"
  dogLine: string; // e.g., "Oklahoma +4.5"
} {
  const coreSpreadHma = computeCoreV1Spread(ratingDiffBlend, hfaPoints);
  
  // Determine favorite and dog based on HMA frame
  const isHomeFavorite = coreSpreadHma > 0;
  const favoriteTeamId = isHomeFavorite ? homeTeamId : awayTeamId;
  const dogTeamId = isHomeFavorite ? awayTeamId : homeTeamId;
  const favoriteName = isHomeFavorite ? homeTeamName : awayTeamName;
  const dogName = isHomeFavorite ? awayTeamName : homeTeamName;
  
  // Convert to favorite-centric frame (favorite always negative, dog always positive)
  const favoriteSpread = -Math.abs(coreSpreadHma);
  const dogSpread = Math.abs(coreSpreadHma);
  
  // Format lines
  const favoriteLine = `${favoriteName} ${favoriteSpread.toFixed(1)}`;
  const dogLine = `${dogName} +${dogSpread.toFixed(1)}`;
  
  return {
    coreSpreadHma,
    favoriteTeamId,
    dogTeamId,
    favoriteName,
    dogName,
    favoriteSpread,
    dogSpread,
    favoriteLine,
    dogLine,
  };
}

/**
 * Compute ATS edge in HMA frame
 * 
 * @param coreSpreadHma - Core V1 spread in HMA frame
 * @param marketSpreadHma - Market spread in HMA frame (home minus away)
 * @returns ATS edge in HMA frame
 *   - Positive: model thinks home should be more favored than market
 *   - Negative: model thinks away should be more favored than market
 */
export function computeATSEdgeHma(
  coreSpreadHma: number,
  marketSpreadHma: number
): number {
  return coreSpreadHma - marketSpreadHma;
}

/**
 * Get ATS pick recommendation
 * 
 * @param coreSpreadHma - Core V1 spread in HMA frame
 * @param marketSpreadHma - Market spread in HMA frame
 * @param homeTeamName - Home team name
 * @param awayTeamName - Away team name
 * @param homeTeamId - Home team ID
 * @param awayTeamId - Away team ID
 * @param edgeFloor - Minimum edge to show a pick (default 2.0)
 * @returns Pick recommendation or null if edge too small
 */
export function getATSPick(
  coreSpreadHma: number,
  marketSpreadHma: number,
  homeTeamName: string,
  awayTeamName: string,
  homeTeamId: string,
  awayTeamId: string,
  edgeFloor: number = 2.0
): {
  pickLabel: string | null;
  edgePts: number;
  recommendedTeamId: string | null;
  recommendedTeamName: string | null;
  recommendedLine: string | null;
} {
  const edge = computeATSEdgeHma(coreSpreadHma, marketSpreadHma);
  const absEdge = Math.abs(edge);
  
  if (absEdge < edgeFloor) {
    return {
      pickLabel: null,
      edgePts: absEdge,
      recommendedTeamId: null,
      recommendedTeamName: null,
      recommendedLine: null,
    };
  }
  
  // Determine recommended side
  // Positive edge: model thinks home should be more favored → bet home at market line
  // Negative edge: model thinks away should be more favored → bet away at market line
  const isHomeRecommended = edge > 0;
  const recommendedTeamId = isHomeRecommended ? homeTeamId : awayTeamId;
  const recommendedTeamName = isHomeRecommended ? homeTeamName : awayTeamName;
  
  // Format market line for recommended side (favorite-centric)
  const marketFavoriteSpread = -Math.abs(marketSpreadHma);
  const marketDogSpread = Math.abs(marketSpreadHma);
  
  // Determine which side is market favorite
  const isHomeMarketFavorite = marketSpreadHma > 0;
  const recommendedLine = isHomeRecommended
    ? (isHomeMarketFavorite ? `${homeTeamName} ${marketFavoriteSpread.toFixed(1)}` : `${homeTeamName} +${marketDogSpread.toFixed(1)}`)
    : (isHomeMarketFavorite ? `${awayTeamName} +${marketDogSpread.toFixed(1)}` : `${awayTeamName} ${marketFavoriteSpread.toFixed(1)}`);
  
  return {
    pickLabel: recommendedLine,
    edgePts: absEdge,
    recommendedTeamId,
    recommendedTeamName,
    recommendedLine,
  };
}

/**
 * Get Core V1 spread from team IDs and ratings
 * 
 * Convenience function that loads V2 ratings from DB and computes everything
 * 
 * @param season - Season year
 * @param homeTeamId - Home team ID
 * @param awayTeamId - Away team ID
 * @param neutralSite - Whether game is at neutral site
 * @param homeTeamName - Home team name
 * @param awayTeamName - Away team name
 * @returns Core V1 spread info
 */
export async function getCoreV1SpreadFromTeams(
  season: number,
  homeTeamId: string,
  awayTeamId: string,
  neutralSite: boolean,
  homeTeamName: string,
  awayTeamName: string
): Promise<{
  coreSpreadHma: number;
  ratingDiffBlend: number;
  favoriteTeamId: string;
  dogTeamId: string;
  favoriteName: string;
  dogName: string;
  favoriteSpread: number;
  dogSpread: number;
  favoriteLine: string;
  dogLine: string;
  hfaInfo: {
    effectiveHfa: number;
    baseHfa: number;
    teamAdjustment: number;
    rawHfa: number;
  };
}> {
  // Load V2 ratings from database
  const [homeRating, awayRating] = await Promise.all([
    prisma.teamSeasonRating.findUnique({
      where: {
        season_teamId_modelVersion: {
          season,
          teamId: homeTeamId,
          modelVersion: 'v2',
        },
      },
    }),
    prisma.teamSeasonRating.findUnique({
      where: {
        season_teamId_modelVersion: {
          season,
          teamId: awayTeamId,
          modelVersion: 'v2',
        },
      },
    }),
  ]);

  if (!homeRating || !awayRating) {
    throw new Error(`Missing V2 ratings for ${homeTeamId} or ${awayTeamId}`);
  }

  const homeV2 = Number(homeRating.powerRating || homeRating.rating || 0);
  const awayV2 = Number(awayRating.powerRating || awayRating.rating || 0);

  // Compute ratingDiffBlend
  const ratingDiffBlend = computeRatingDiffBlend(homeTeamId, awayTeamId, homeV2, awayV2);

  // Get HFA points using HFA v2
  const hfaInfo = computeEffectiveHfa(homeTeamId, neutralSite);
  const hfaPoints = hfaInfo.effectiveHfa;

  // Get spread info
  const spreadInfo = getCoreV1SpreadInfo(
    ratingDiffBlend,
    hfaPoints,
    homeTeamId,
    awayTeamId,
    homeTeamName,
    awayTeamName
  );

  return {
    ...spreadInfo,
    ratingDiffBlend,
    hfaInfo, // Expose HFA breakdown for UI
  };
}

