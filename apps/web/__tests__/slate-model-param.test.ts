/**
 * Slate API model parameter — pending tests for Phase D.
 *
 * `/api/weeks/slate` does not yet accept `?model=hybrid_v2|core_v1`.
 * These tests document expected behavior and are skipped until Phase D implements
 * the model param without changing spread/total/ML math.
 */

describe('/api/weeks/slate model parameter (Phase D — pending)', () => {
  describe.skip('model=hybrid_v2', () => {
    it('returns spread picks computed from Hybrid V2 math', () => {
      // TODO Phase D: fetch slate with model=hybrid_v2; assert meta.activeModel and spread picks.
    });

    it('keeps totals and moneyline on Core V1 logic with clear meta labeling', () => {
      // TODO Phase D: totals/ML fields unchanged vs current slate; meta notes spread-only Hybrid.
    });
  });

  describe.skip('model=core_v1', () => {
    it('matches current Core V1 slate behavior (regression)', () => {
      // TODO Phase D: compare pick fields to pre-Phase-D baseline fixtures.
    });
  });

  describe.skip('default model when param omitted', () => {
    it('defaults to hybrid_v2 after Phase D', () => {
      // TODO Phase D: omitted model => meta.activeModel === 'hybrid_v2'.
    });
  });

  it('documents that model param is not implemented yet', () => {
    expect(true).toBe(true);
  });
});
