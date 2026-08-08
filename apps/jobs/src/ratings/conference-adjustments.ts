/**
 * Core V1 conference strength adjustments (SRS-like).
 * Phase 2C-2G-4: values must remain unchanged — only the conference *source* moves.
 */

export const CONFERENCE_ADJUSTMENTS: Record<string, number> = {
  // Power 5 - Top Tier
  SEC: 5.0,
  'Big Ten': 5.0,
  B1G: 5.0,

  // Power 5 - Upper Tier
  ACC: 2.0,
  'Big 12': 2.0,
  'Pac-12': 2.0,
  'Pac-10': 2.0,

  // Group of 5 - Mid Tier
  'American Athletic': -2.0,
  AAC: -2.0,
  'Mountain West': -2.0,
  MWC: -2.0,
  'Sun Belt': -2.0,

  // Group of 5 - Lower Tier
  'Mid-American': -3.5,
  MAC: -3.5,
  'Conference USA': -3.5,
  'C-USA': -3.5,
  'C-USA (FCS)': -3.5,

  // Independent / FCS
  Independent: -5.0,
  Unknown: -5.0,

  // FCS Conferences (if any slip through)
  'Big Sky': -6.0,
  'Big Sky (FCS)': -6.0,
  FCS: -6.0,
};

/**
 * Get conference adjustment for a team
 */
export function getConferenceAdjustment(conference: string | null): number {
  if (!conference) return CONFERENCE_ADJUSTMENTS['Unknown'] || 0;
  return (
    CONFERENCE_ADJUSTMENTS[conference] ||
    CONFERENCE_ADJUSTMENTS['Independent'] ||
    -5.0
  );
}
