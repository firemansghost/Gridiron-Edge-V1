import {
  DEFAULT_PRODUCTION_MODEL,
  AVAILABLE_PRODUCTION_MODELS,
} from '@/lib/config/production-models';
import {
  PRODUCTION_MODEL_STORAGE_KEY,
  PRODUCTION_MODEL_QUERY_PARAM,
  getProductionModelSelectorOptions,
  isValidProductionModelId,
  resolveProductionModelFromSources,
} from '@/lib/config/production-model-preference';

describe('production-model-preference', () => {
  it('uses hybrid_v2 as default production model', () => {
    expect(DEFAULT_PRODUCTION_MODEL).toBe('hybrid_v2');
    expect(
      resolveProductionModelFromSources({ urlModel: null, storedModel: null })
    ).toBe('hybrid_v2');
  });

  it('selects core_v1 from URL param', () => {
    expect(
      resolveProductionModelFromSources({ urlModel: 'core_v1', storedModel: 'hybrid_v2' })
    ).toBe('core_v1');
  });

  it('selects hybrid_v2 from URL param', () => {
    expect(
      resolveProductionModelFromSources({ urlModel: 'hybrid_v2', storedModel: 'core_v1' })
    ).toBe('hybrid_v2');
  });

  it('falls back to hybrid_v2 for invalid URL model values', () => {
    expect(
      resolveProductionModelFromSources({ urlModel: 'v4_labs', storedModel: 'core_v1' })
    ).toBe('core_v1');
    expect(
      resolveProductionModelFromSources({ urlModel: 'fade_v4_labs', storedModel: null })
    ).toBe('hybrid_v2');
    expect(
      resolveProductionModelFromSources({ urlModel: 'not-a-model', storedModel: null })
    ).toBe('hybrid_v2');
  });

  it('respects localStorage when URL param is absent', () => {
    expect(
      resolveProductionModelFromSources({ urlModel: null, storedModel: 'core_v1' })
    ).toBe('core_v1');
  });

  it('gives URL param precedence over localStorage', () => {
    expect(
      resolveProductionModelFromSources({ urlModel: 'hybrid_v2', storedModel: 'core_v1' })
    ).toBe('hybrid_v2');
    expect(
      resolveProductionModelFromSources({ urlModel: 'core_v1', storedModel: 'hybrid_v2' })
    ).toBe('core_v1');
  });

  it('rejects labs models as production model ids', () => {
    expect(isValidProductionModelId('v4_labs')).toBe(false);
    expect(isValidProductionModelId('fade_v4_labs')).toBe(false);
    expect(isValidProductionModelId('hybrid_v2')).toBe(true);
    expect(isValidProductionModelId('core_v1')).toBe(true);
  });

  it('exposes storage key and query param constants', () => {
    expect(PRODUCTION_MODEL_STORAGE_KEY).toBe('ge:productionModel');
    expect(PRODUCTION_MODEL_QUERY_PARAM).toBe('model');
  });

  describe('getProductionModelSelectorOptions', () => {
    it('includes Hybrid V2 and Core V1 labels only', () => {
      const options = getProductionModelSelectorOptions();
      expect(options).toEqual([
        { id: 'hybrid_v2', label: 'Hybrid V2' },
        { id: 'core_v1', label: 'Core V1' },
      ]);
    });

    it('does not include labs models in selector options', () => {
      const optionIds = getProductionModelSelectorOptions().map((o) => o.id);
      expect(optionIds).toEqual([...AVAILABLE_PRODUCTION_MODELS]);
      expect(optionIds).not.toContain('v4_labs');
      expect(optionIds).not.toContain('fade_v4_labs');
    });
  });
});

/**
 * Pending: React integration tests for ProductionModelContext and ProductionModelSelector
 * require @testing-library/react (not installed). Phase C covers resolution via pure helpers above.
 */
