/**
 * Derive which production models are held (non-actionable) for a slate season/week.
 * Reuses isHybridV2ProductionAuthorized — does not duplicate hold policy.
 * Display/availability only; does not rewrite stored preference.
 */

import { isHybridV2ProductionAuthorized } from './hybrid-production-activation';
import {
  PRODUCTION_MODEL_LABELS,
  type ProductionModelId,
} from './production-models';

/**
 * Models that must appear HELD/disabled for the given slate season/week.
 * Empty when Hybrid (and any future gated models) are production-authorized.
 * When season/week are unknown, returns [] (hold applies once slate context is known).
 */
export function resolveHeldProductionModelIds(
  season: number | null | undefined,
  week?: number | null
): ProductionModelId[] {
  if (season == null || !Number.isFinite(season)) return [];
  const weekArg =
    week != null && Number.isFinite(week) ? week : undefined;
  if (!isHybridV2ProductionAuthorized(season, weekArg)) {
    return ['hybrid_v2'];
  }
  return [];
}

export interface ProductionModelHoldOptionPresentation {
  id: ProductionModelId;
  /** Visible button label (may include · LIVE / · HELD). */
  label: string;
  disabled: boolean;
  /** Whether aria-pressed / visual active should be true. */
  ariaPressed: boolean;
}

/**
 * Pure presentation for selector options under hold / no-hold.
 * Preferred/stored model does not affect held/disabled state.
 */
export function resolveProductionModelHoldPresentation(options: {
  effectiveModel: ProductionModelId;
  heldModelIds: ReadonlyArray<ProductionModelId>;
  optionIds?: ReadonlyArray<ProductionModelId>;
}): ProductionModelHoldOptionPresentation[] {
  const held = new Set(options.heldModelIds);
  const holdActive = held.size > 0;
  const ids = options.optionIds ?? (['hybrid_v2', 'core_v1'] as const);

  return ids.map((id) => {
    const isHeld = held.has(id);
    const isEffective = options.effectiveModel === id;
    let suffix: string | null = null;
    if (holdActive) {
      if (isHeld) suffix = 'HELD';
      else if (isEffective) suffix = 'LIVE';
    }
    const base = PRODUCTION_MODEL_LABELS[id];
    return {
      id,
      label: suffix ? `${base} · ${suffix}` : base,
      disabled: isHeld,
      ariaPressed: isEffective,
    };
  });
}
