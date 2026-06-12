/**
 * Game detail presentation labels (Phase F).
 * Display only — does not change model math or DB strategy tags.
 */

import { PRODUCTION_MODEL_LABELS, getStrategyTagLabel } from './production-models';

export const GAME_DETAIL_LABELS = {
  hybridV2: {
    title: `${PRODUCTION_MODEL_LABELS.hybrid_v2} Spread`,
    badge: 'Primary · 2026',
    tab: PRODUCTION_MODEL_LABELS.hybrid_v2,
    atsHeader: `${PRODUCTION_MODEL_LABELS.hybrid_v2} ATS`,
    badgeDetail: 'Primary spread model',
    scopeNote: 'Spreads only; totals and moneyline use current logic.',
    unavailable: 'Hybrid V2 spread data unavailable',
  },
  coreV1: {
    title: `${PRODUCTION_MODEL_LABELS.core_v1} Spread`,
    badge: 'Comparison',
    tab: `${PRODUCTION_MODEL_LABELS.core_v1} (Comparison)`,
    intro: 'Core V1 comparison view — original spread model used for official_flat_100 graded bets.',
    unavailable: 'No Core V1 spread pick',
  },
  officialCard: {
    title: getStrategyTagLabel('official_flat_100'),
    badge: 'Graded bet',
    sourceNote: 'Source: official_flat_100 (DB tag)',
    empty: 'No synced Core V1 card bet for this game.',
  },
  labsOnlyNote: 'V4 and Fade V4 remain Labs-only models.',
} as const;

/** Hybrid V2 game detail label must not imply Labs. */
export function isLabsMislabelForHybridV2(label: string): boolean {
  return /\blabs\b/i.test(label);
}
