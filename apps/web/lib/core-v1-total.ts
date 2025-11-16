/**
 * Core V1 Totals Helper
 * 
 * Computes model total using spread-driven overlay:
 * modelTotal = marketTotal + clamp(β * (modelSpread - marketSpread), -maxOverlay, +maxOverlay)
 * 
 * Where β is learned from historical data.
 */

// Static import - bundled by Next.js/Vercel
import totalsConfigData from './data/core_v1_totals_config.json';

interface TotalsConfig {
  beta_spread_diff_to_total: number;
  max_overlay_points: number;
  min_edge_for_pick: number;
  grade_thresholds: {
    A: number;
    B: number;
    C: number;
  };
  training_stats?: {
    sample_size: number;
    r_squared: number;
    mean_abs_error: number;
  };
}

const TOTALS_CONFIG: TotalsConfig = totalsConfigData as TotalsConfig;

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute Core V1 model total from market total and spread disagreement
 * 
 * @param marketTotal - Market closing total
 * @param marketSpreadHma - Market closing spread in HMA format
 * @param modelSpreadHma - Core V1 model spread in HMA format
 * @returns Model total or null if inputs are invalid
 */
export function computeCoreV1Total(
  marketTotal: number | null,
  marketSpreadHma: number | null,
  modelSpreadHma: number | null
): number | null {
  // All inputs must be valid
  if (marketTotal === null || !Number.isFinite(marketTotal)) {
    return null;
  }
  if (marketSpreadHma === null || !Number.isFinite(marketSpreadHma)) {
    return null;
  }
  if (modelSpreadHma === null || !Number.isFinite(modelSpreadHma)) {
    return null;
  }

  // Compute spread difference (model - market) in HMA format
  const spreadDiff = modelSpreadHma - marketSpreadHma;

  // Compute raw overlay: β * spreadDiff
  const overlayRaw = TOTALS_CONFIG.beta_spread_diff_to_total * spreadDiff;

  // Clamp overlay to max_overlay_points
  const overlay = clamp(overlayRaw, -TOTALS_CONFIG.max_overlay_points, TOTALS_CONFIG.max_overlay_points);

  // Model total = market total + overlay
  const modelTotal = marketTotal + overlay;

  return modelTotal;
}

/**
 * Compute OU edge (model total - market total)
 * 
 * @param modelTotal - Model total
 * @param marketTotal - Market total
 * @returns OU edge in points (positive = lean Over, negative = lean Under)
 */
export function computeOUEdge(
  modelTotal: number | null,
  marketTotal: number | null
): number | null {
  if (modelTotal === null || !Number.isFinite(modelTotal)) {
    return null;
  }
  if (marketTotal === null || !Number.isFinite(marketTotal)) {
    return null;
  }

  return modelTotal - marketTotal;
}

/**
 * Get OU pick label (Over/Under)
 * 
 * @param ouEdge - OU edge in points
 * @param marketTotal - Market total
 * @returns Pick label like "Over 45.5" or "Under 52.5", or null if no edge
 */
export function getOUPickLabel(
  ouEdge: number | null,
  marketTotal: number | null
): string | null {
  if (ouEdge === null || !Number.isFinite(ouEdge)) {
    return null;
  }
  if (marketTotal === null || !Number.isFinite(marketTotal)) {
    return null;
  }

  // Use min_edge_for_pick threshold
  if (Math.abs(ouEdge) < TOTALS_CONFIG.min_edge_for_pick) {
    return null; // No pick if edge is too small
  }

  // Positive edge = model thinks total will be higher = Over
  // Negative edge = model thinks total will be lower = Under
  const side = ouEdge > 0 ? 'Over' : 'Under';
  return `${side} ${marketTotal.toFixed(1)}`;
}

/**
 * Get OU confidence grade (A/B/C or null)
 * 
 * @param ouEdge - OU edge in points (absolute value used)
 * @returns Grade or null if edge is too small
 */
export function getOUGrade(ouEdge: number | null): 'A' | 'B' | 'C' | null {
  if (ouEdge === null || !Number.isFinite(ouEdge)) {
    return null;
  }

  const absEdge = Math.abs(ouEdge);
  const thresholds = TOTALS_CONFIG.grade_thresholds;

  if (absEdge >= thresholds.A) {
    return 'A';
  } else if (absEdge >= thresholds.B) {
    return 'B';
  } else if (absEdge >= thresholds.C) {
    return 'C';
  } else {
    return null; // Below minimum threshold
  }
}

/**
 * Get complete OU pick info
 * 
 * @param marketTotal - Market closing total
 * @param marketSpreadHma - Market closing spread in HMA format
 * @param modelSpreadHma - Core V1 model spread in HMA format
 * @returns Complete OU pick information
 */
export function getOUPick(
  marketTotal: number | null,
  marketSpreadHma: number | null,
  modelSpreadHma: number | null
): {
  modelTotal: number | null;
  ouEdgePts: number | null;
  pickLabel: string | null;
  grade: 'A' | 'B' | 'C' | null;
} {
  const modelTotal = computeCoreV1Total(marketTotal, marketSpreadHma, modelSpreadHma);
  const ouEdgePts = computeOUEdge(modelTotal, marketTotal);
  const pickLabel = getOUPickLabel(ouEdgePts, marketTotal);
  const grade = getOUGrade(ouEdgePts);

  return {
    modelTotal,
    ouEdgePts,
    pickLabel,
    grade,
  };
}

