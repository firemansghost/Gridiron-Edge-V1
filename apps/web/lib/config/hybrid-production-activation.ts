/**
 * Hybrid V2 production activation gate (Phase 2C-2I-2).
 *
 * OPERATIONAL AUTHORIZATION only — does not change Hybrid or Core V1 math.
 * Hybrid V2 remains the intended future in-season primary spread model once
 * same-season inputs are proven ready and activation is explicitly authorized.
 *
 * Current policy: season >= 2026 → not authorized (all weeks held).
 * Historical seasons (<=2025) remain authorized so existing comparison surfaces
 * continue to work.
 */

export const HYBRID_V2_PRODUCTION_HOLD_REASON =
  'Hybrid V2 is not production-authorized for 2026; Core V1 is the effective spread model.';

/**
 * Whether Hybrid V2 may be the effective production spread model for a slate.
 * Week is accepted for future per-week activation; current policy ignores week.
 */
export function isHybridV2ProductionAuthorized(
  season: number,
  _week?: number
): boolean {
  if (!Number.isFinite(season)) return false;
  // Hold all 2026+ weeks until a future reviewed activation phase.
  if (season >= 2026) return false;
  return true;
}
