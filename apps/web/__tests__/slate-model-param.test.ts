/**
 * Slate API model parameter tests (Phase D).
 * Route integration tests requiring live DB are pending — helpers are covered in slate-model.test.ts.
 */

import {
  buildSlateResponseMeta,
  resolveSlateModelParam,
} from '@/lib/config/slate-model';

describe('/api/weeks/slate model parameter', () => {
  describe('model=hybrid_v2', () => {
    it('resolves hybrid_v2 as active model with hybrid spread scope', () => {
      const { activeModel, invalidRequest } = resolveSlateModelParam('hybrid_v2');
      expect(activeModel).toBe('hybrid_v2');
      expect(invalidRequest).toBe(false);

      const meta = buildSlateResponseMeta({ activeModel });
      expect(meta.modelScope.spread).toBe('hybrid_v2');
      expect(meta.modelScope.total).toBe('current');
      expect(meta.modelScope.moneyline).toBe('current');
    });
  });

  describe('model=core_v1', () => {
    it('resolves core_v1 with core spread scope for regression path', () => {
      const { activeModel } = resolveSlateModelParam('core_v1');
      expect(activeModel).toBe('core_v1');

      const meta = buildSlateResponseMeta({ activeModel });
      expect(meta.modelScope.spread).toBe('core_v1');
    });
  });

  describe('default model when param omitted', () => {
    it('defaults to hybrid_v2 after Phase D', () => {
      expect(resolveSlateModelParam(null).activeModel).toBe('hybrid_v2');
      expect(buildSlateResponseMeta({ activeModel: 'hybrid_v2' }).defaultModel).toBe(
        'hybrid_v2'
      );
    });
  });

  describe('invalid model param', () => {
    it('falls back to hybrid_v2 and flags invalidModelFallback in meta', () => {
      const resolved = resolveSlateModelParam('fade_v4_labs');
      expect(resolved.activeModel).toBe('hybrid_v2');
      expect(resolved.invalidRequest).toBe(true);

      const meta = buildSlateResponseMeta({
        activeModel: resolved.activeModel,
        requestedModel: 'fade_v4_labs',
        invalidModelFallback: true,
      });
      expect(meta.invalidModelFallback).toBe(true);
      expect(meta.availableModels).not.toContain('v4_labs' as any);
    });
  });
});

/**
 * Pending: full HTTP/route tests against GET /api/weeks/slate with mocked Prisma.
 * Avoids fragile dependency on production database state.
 */
