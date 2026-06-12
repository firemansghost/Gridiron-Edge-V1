import { getDefaultStrategyTag, getStrategyLabel, STRATEGY_LABELS } from '@/lib/strategy-utils';

describe('strategy-utils', () => {
  describe('getStrategyLabel', () => {
    it('labels hybrid_v2 as Hybrid V2', () => {
      expect(getStrategyLabel('hybrid_v2')).toBe('Hybrid V2 (Flat $100)');
    });

    it('labels official_flat_100 as Core V1, not Hybrid', () => {
      expect(getStrategyLabel('official_flat_100')).toBe('Core V1 Card (Flat $100)');
      expect(getStrategyLabel('official_flat_100')).not.toMatch(/Hybrid V2/i);
    });

    it('labels labs strategies correctly', () => {
      expect(getStrategyLabel('v4_labs')).toBe('V4 Labs (Flat $100)');
      expect(getStrategyLabel('fade_v4_labs')).toBe('Fade V4 Labs (Flat $100)');
    });

    it('exposes STRATEGY_LABELS alias with corrected semantics', () => {
      expect(STRATEGY_LABELS.hybrid_v2).toBe('Hybrid V2 (Flat $100)');
      expect(STRATEGY_LABELS.official_flat_100).toBe('Core V1 Card (Flat $100)');
    });
  });

  describe('getDefaultStrategyTag (review pages — legacy until Phase E)', () => {
    it('prefers official_flat_100 when available', () => {
      expect(getDefaultStrategyTag(['official_flat_100', 'hybrid_v2', 'v4_labs'])).toBe(
        'official_flat_100'
      );
    });

    it('falls back to all when official_flat_100 is absent', () => {
      expect(getDefaultStrategyTag(['hybrid_v2', 'v4_labs'])).toBe('all');
      expect(getDefaultStrategyTag([])).toBe('all');
    });
  });
});
