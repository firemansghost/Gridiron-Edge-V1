import {
  buildSlateApiUrl,
  buildSlateResponseMeta,
  computeSlateConfidenceSummary,
  getProductionModelDisplayLabel,
  normalizeSlateApiResponse,
  resolveSlateModelParam,
  shouldLoadCoreHybridComparisonMetadata,
  shouldShowHybridPlaybookFilters,
} from '@/lib/config/slate-model';

describe('slate-model helpers', () => {
  it('param-only omitted model prefers hybrid_v2 (DEFAULT)', () => {
    expect(resolveSlateModelParam(null).preferredModel).toBe('hybrid_v2');
    expect(resolveSlateModelParam(null).activeModel).toBe('hybrid_v2');
    expect(resolveSlateModelParam(undefined).activeModel).toBe('hybrid_v2');
  });

  it('2026 omitted/default Hybrid request resolves effective Core V1', () => {
    const omitted = resolveSlateModelParam(null, 2026, 1);
    expect(omitted.preferredModel).toBe('hybrid_v2');
    expect(omitted.activeModel).toBe('core_v1');
    expect(omitted.activationHold).toBe(true);
  });

  it('accepts core_v1 and hybrid_v2 model params (preferred)', () => {
    expect(resolveSlateModelParam('core_v1').activeModel).toBe('core_v1');
    expect(resolveSlateModelParam('hybrid_v2').activeModel).toBe('hybrid_v2');
    expect(resolveSlateModelParam('hybrid_v2', 2025, 9).activeModel).toBe(
      'hybrid_v2'
    );
  });

  it('falls back invalid model params to hybrid_v2 preferred', () => {
    const result = resolveSlateModelParam('v4_labs');
    expect(result.preferredModel).toBe('hybrid_v2');
    expect(result.activeModel).toBe('hybrid_v2');
    expect(result.invalidRequest).toBe(true);
  });

  it('2026 invalid param still holds Hybrid preferred to Core V1 effective', () => {
    const result = resolveSlateModelParam('v4_labs', 2026, 1);
    expect(result.invalidRequest).toBe(true);
    expect(result.preferredModel).toBe('hybrid_v2');
    expect(result.activeModel).toBe('core_v1');
    expect(result.activationHold).toBe(true);
  });

  it('builds response meta with spread scope and current totals/ML', () => {
    const meta = buildSlateResponseMeta({ activeModel: 'hybrid_v2' });
    expect(meta.activeModel).toBe('hybrid_v2');
    expect(meta.defaultModel).toBe('hybrid_v2');
    expect(meta.availableModels).toEqual(['hybrid_v2', 'core_v1']);
    expect(meta.modelScope).toEqual({
      spread: 'hybrid_v2',
      total: 'current',
      moneyline: 'current',
    });
  });

  it('labels core_v1 spread scope in meta', () => {
    const meta = buildSlateResponseMeta({ activeModel: 'core_v1' });
    expect(meta.modelScope.spread).toBe('core_v1');
    expect(meta.modelScope.total).toBe('current');
    expect(meta.modelScope.moneyline).toBe('current');
  });

  it('includes explicit hybrid fallback metadata when provided', () => {
    const meta = buildSlateResponseMeta({
      activeModel: 'hybrid_v2',
      fallback: {
        used: true,
        from: 'hybrid_v2',
        to: 'core_v1',
        reason: 'missing grades',
        gamesAffected: 2,
      },
    });
    expect(meta.fallback?.used).toBe(true);
    expect(meta.fallback?.to).toBe('core_v1');
  });

  it('includes activation override metadata for 2026 hold', () => {
    const meta = buildSlateResponseMeta({
      activeModel: 'core_v1',
      requestedModel: 'hybrid_v2',
      activationOverride: {
        used: true,
        requested: 'hybrid_v2',
        effective: 'core_v1',
        reason: 'held',
      },
    });
    expect(meta.activeModel).toBe('core_v1');
    expect(meta.modelScope.spread).toBe('core_v1');
    expect(meta.activationOverride?.used).toBe(true);
    expect(meta.invalidModelFallback).toBe(false);
  });

  it('builds slate fetch URL with model param', () => {
    expect(buildSlateApiUrl(2025, 9, 'hybrid_v2')).toBe(
      '/api/weeks/slate?season=2025&week=9&model=hybrid_v2'
    );
    expect(buildSlateApiUrl(2025, 9, 'core_v1')).toContain('model=core_v1');
  });

  it('normalizes wrapped and legacy array slate responses', () => {
    const legacy = [{ gameId: 'g1' }];
    expect(normalizeSlateApiResponse(legacy).games).toEqual(legacy);
    expect(normalizeSlateApiResponse(legacy).meta).toBeNull();

    const wrapped = {
      games: [{ gameId: 'g2' }],
      meta: buildSlateResponseMeta({ activeModel: 'hybrid_v2' }),
    };
    const parsed = normalizeSlateApiResponse(wrapped);
    expect(parsed.games).toHaveLength(1);
    expect(parsed.meta?.activeModel).toBe('hybrid_v2');
  });

  it('computes confidence summary from slate games', () => {
    const summary = computeSlateConfidenceSummary([
      { confidence: 'A' },
      { confidence: 'B' },
      { confidence: 'A' },
      { confidence: null },
    ]);
    expect(summary.totalGames).toBe(4);
    expect(summary.confidenceBreakdown).toEqual({ A: 2, B: 1, C: 0 });
  });

  it('display label helper maps production model ids', () => {
    expect(getProductionModelDisplayLabel('core_v1')).toBe('Core V1');
    expect(getProductionModelDisplayLabel('hybrid_v2')).toBe('Hybrid V2');
  });

  it('Hybrid playbook filters only when effective model is Hybrid', () => {
    expect(shouldShowHybridPlaybookFilters('hybrid_v2')).toBe(true);
    expect(shouldShowHybridPlaybookFilters('core_v1')).toBe(false);
  });

  it('Core Hybrid comparison metadata only when explicit Core V1 (not activation hold)', () => {
    expect(shouldLoadCoreHybridComparisonMetadata('core_v1', false)).toBe(true);
    expect(shouldLoadCoreHybridComparisonMetadata('core_v1', true)).toBe(false);
    expect(shouldLoadCoreHybridComparisonMetadata('hybrid_v2', false)).toBe(false);
  });
});
