import {
  buildSlateApiUrl,
  buildSlateResponseMeta,
  computeSlateConfidenceSummary,
  normalizeSlateApiResponse,
  resolveSlateModelParam,
} from '@/lib/config/slate-model';

describe('slate-model helpers', () => {
  it('defaults omitted model param to hybrid_v2', () => {
    expect(resolveSlateModelParam(null).activeModel).toBe('hybrid_v2');
    expect(resolveSlateModelParam(undefined).activeModel).toBe('hybrid_v2');
  });

  it('accepts core_v1 and hybrid_v2 model params', () => {
    expect(resolveSlateModelParam('core_v1').activeModel).toBe('core_v1');
    expect(resolveSlateModelParam('hybrid_v2').activeModel).toBe('hybrid_v2');
  });

  it('falls back invalid model params to hybrid_v2', () => {
    const result = resolveSlateModelParam('v4_labs');
    expect(result.activeModel).toBe('hybrid_v2');
    expect(result.invalidRequest).toBe(true);
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
});
