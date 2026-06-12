import {
  AVAILABLE_PRODUCTION_MODELS,
  DEFAULT_PRODUCTION_MODEL,
  PRODUCTION_MODEL_LABELS,
  PRODUCTION_MODEL_STRATEGY_TAGS,
  STRATEGY_TAG_LABELS,
  getDefaultProductionStrategyTag,
  getProductionModelStrategyTag,
  getStrategyTagLabel,
  isLabsStrategyTag,
} from '@/lib/config/production-models';

describe('production-models config', () => {
  it('defaults to hybrid_v2 as primary production model', () => {
    expect(DEFAULT_PRODUCTION_MODEL).toBe('hybrid_v2');
  });

  it('exposes exactly hybrid_v2 and core_v1 as production models', () => {
    expect(AVAILABLE_PRODUCTION_MODELS).toEqual(['hybrid_v2', 'core_v1']);
    expect(AVAILABLE_PRODUCTION_MODELS).not.toContain('v4_labs');
    expect(AVAILABLE_PRODUCTION_MODELS).not.toContain('fade_v4_labs');
  });

  it('maps production model ids to persisted strategy tags', () => {
    expect(getProductionModelStrategyTag('hybrid_v2')).toBe('hybrid_v2');
    expect(getProductionModelStrategyTag('core_v1')).toBe('official_flat_100');
    expect(PRODUCTION_MODEL_STRATEGY_TAGS).toEqual({
      hybrid_v2: 'hybrid_v2',
      core_v1: 'official_flat_100',
    });
  });

  it('provides production model display labels', () => {
    expect(PRODUCTION_MODEL_LABELS.hybrid_v2).toBe('Hybrid V2');
    expect(PRODUCTION_MODEL_LABELS.core_v1).toBe('Core V1');
  });

  it('labels strategy tags for reporting without renaming DB tags', () => {
    expect(getStrategyTagLabel('hybrid_v2')).toBe('Hybrid V2 (Flat $100)');
    expect(getStrategyTagLabel('official_flat_100')).toBe('Core V1 Card (Flat $100)');
    expect(getStrategyTagLabel('v4_labs')).toBe('V4 Labs (Flat $100)');
    expect(getStrategyTagLabel('fade_v4_labs')).toBe('Fade V4 Labs (Flat $100)');
    expect(getStrategyTagLabel('demo_seed')).toBe('Demo Data (Seed)');
  });

  it('identifies labs strategy tags', () => {
    expect(isLabsStrategyTag('v4_labs')).toBe(true);
    expect(isLabsStrategyTag('fade_v4_labs')).toBe(true);
    expect(isLabsStrategyTag('hybrid_v2')).toBe(false);
    expect(isLabsStrategyTag('official_flat_100')).toBe(false);
  });

  it('formats unknown strategy tags as readable fallback', () => {
    expect(getStrategyTagLabel('custom_strategy_tag')).toBe('Custom Strategy Tag');
  });

  it('keeps STRATEGY_TAG_LABELS in sync with approved semantics', () => {
    expect(STRATEGY_TAG_LABELS.official_flat_100).not.toMatch(/Hybrid V2/i);
    expect(STRATEGY_TAG_LABELS.hybrid_v2).toMatch(/Hybrid V2/i);
  });

  describe('getDefaultProductionStrategyTag', () => {
    it('prefers hybrid_v2 when available', () => {
      expect(
        getDefaultProductionStrategyTag(['official_flat_100', 'hybrid_v2', 'v4_labs'])
      ).toBe('hybrid_v2');
    });

    it('falls back to official_flat_100 when hybrid_v2 is absent', () => {
      expect(getDefaultProductionStrategyTag(['official_flat_100', 'v4_labs'])).toBe(
        'official_flat_100'
      );
    });

    it('falls back to all when neither hybrid_v2 nor official_flat_100 exist', () => {
      expect(getDefaultProductionStrategyTag(['v4_labs', 'fade_v4_labs'])).toBe('all');
      expect(getDefaultProductionStrategyTag([])).toBe('all');
    });
  });
});
