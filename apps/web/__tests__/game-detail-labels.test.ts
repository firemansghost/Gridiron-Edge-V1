import {
  GAME_DETAIL_LABELS,
  isLabsMislabelForHybridV2,
} from '@/lib/config/game-detail-labels';
import { getStrategyTagLabel } from '@/lib/config/production-models';

describe('game-detail-labels', () => {
  it('presents Hybrid V2 as primary 2026 spread model without Labs', () => {
    expect(GAME_DETAIL_LABELS.hybridV2.title).toMatch(/Hybrid V2/i);
    expect(GAME_DETAIL_LABELS.hybridV2.badge).toMatch(/Primary/i);
    expect(isLabsMislabelForHybridV2(GAME_DETAIL_LABELS.hybridV2.title)).toBe(false);
    expect(isLabsMislabelForHybridV2(GAME_DETAIL_LABELS.hybridV2.tab)).toBe(false);
    expect(isLabsMislabelForHybridV2(GAME_DETAIL_LABELS.hybridV2.badgeDetail)).toBe(false);
  });

  it('presents Core V1 as comparison, not primary', () => {
    expect(GAME_DETAIL_LABELS.coreV1.title).toMatch(/Core V1/i);
    expect(GAME_DETAIL_LABELS.coreV1.badge).toBe('Comparison');
    expect(GAME_DETAIL_LABELS.coreV1.tab).toMatch(/Comparison/i);
  });

  it('labels official_flat_100 as Core V1 Card for graded bet display', () => {
    expect(GAME_DETAIL_LABELS.officialCard.title).toBe('Core V1 Card (Flat $100)');
    expect(getStrategyTagLabel('official_flat_100')).toBe('Core V1 Card (Flat $100)');
    expect(GAME_DETAIL_LABELS.officialCard.title).not.toMatch(/Hybrid V2/i);
  });

  it('keeps labs labels for actual labs models only', () => {
    expect(getStrategyTagLabel('v4_labs')).toMatch(/V4 Labs/i);
    expect(getStrategyTagLabel('fade_v4_labs')).toMatch(/Fade V4 Labs/i);
    expect(isLabsMislabelForHybridV2(getStrategyTagLabel('v4_labs'))).toBe(true);
    expect(isLabsMislabelForHybridV2(getStrategyTagLabel('fade_v4_labs'))).toBe(true);
  });

  it('does not mark Hybrid V2 as auto-bet disclaimer text', () => {
    const hybridCopy = JSON.stringify(GAME_DETAIL_LABELS.hybridV2);
    expect(hybridCopy).not.toMatch(/not auto-bet/i);
    expect(hybridCopy).not.toMatch(/labs page only/i);
  });
});
