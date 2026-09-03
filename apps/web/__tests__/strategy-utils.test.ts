import {
  getDefaultStrategyTag,
  getStrategyLabel,
  resolveReviewStrategySelection,
  reviewStrategyToWeekReviewState,
  STRATEGY_LABELS,
} from '@/lib/strategy-utils';

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

  describe('getDefaultStrategyTag (review pages — Phase E)', () => {
    it('prefers hybrid_v2 when available', () => {
      expect(getDefaultStrategyTag(['official_flat_100', 'hybrid_v2', 'v4_labs'])).toBe(
        'hybrid_v2'
      );
    });

    it('falls back to official_flat_100 when hybrid_v2 is absent', () => {
      expect(getDefaultStrategyTag(['official_flat_100', 'v4_labs'])).toBe('official_flat_100');
    });

    it('falls back to all when neither hybrid_v2 nor official_flat_100 exist', () => {
      expect(getDefaultStrategyTag(['v4_labs', 'fade_v4_labs'])).toBe('all');
      expect(getDefaultStrategyTag([])).toBe('all');
    });

    it('does not default to labs strategies', () => {
      expect(getDefaultStrategyTag(['v4_labs', 'fade_v4_labs'])).not.toBe('v4_labs');
      expect(getDefaultStrategyTag(['v4_labs', 'fade_v4_labs'])).not.toBe('fade_v4_labs');
    });
  });

  describe('resolveReviewStrategySelection', () => {
    const available = ['hybrid_v2', 'official_flat_100', 'v4_labs'];

    it('defaults to hybrid_v2 when URL strategy is absent', () => {
      expect(resolveReviewStrategySelection(null, available)).toBe('hybrid_v2');
      expect(resolveReviewStrategySelection('', available)).toBe('hybrid_v2');
    });

    it('honors explicit hybrid_v2 URL param', () => {
      expect(resolveReviewStrategySelection('hybrid_v2', available)).toBe('hybrid_v2');
    });

    it('honors explicit official_flat_100 URL param (Core V1)', () => {
      expect(resolveReviewStrategySelection('official_flat_100', available)).toBe(
        'official_flat_100'
      );
    });

    it('honors explicit all URL param', () => {
      expect(resolveReviewStrategySelection('all', available)).toBe('all');
    });

    it('preserves a custom persisted tag until available tags are known', () => {
      expect(resolveReviewStrategySelection('custom_ruleset_v1', [])).toBe(
        'custom_ruleset_v1'
      );
    });

    it('keeps historical official_flat_100 queryable when present in available tags', () => {
      expect(resolveReviewStrategySelection('official_flat_100', available)).toBe(
        'official_flat_100'
      );
      expect(getStrategyLabel('official_flat_100')).toBe('Core V1 Card (Flat $100)');
    });
  });

  describe('reviewStrategyToWeekReviewState', () => {
    it('maps all to empty string for Week Review dropdown', () => {
      expect(reviewStrategyToWeekReviewState('all')).toBe('');
      expect(reviewStrategyToWeekReviewState('hybrid_v2')).toBe('hybrid_v2');
    });
  });
});
