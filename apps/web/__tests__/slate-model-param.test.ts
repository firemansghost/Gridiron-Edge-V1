/**
 * Slate API model parameter tests (Phase D + 2C-2I-2).
 * Route integration tests requiring live DB are pending — helpers are covered here.
 */

import {
  buildSlateResponseMeta,
  resolveSlateModelParam,
} from '@/lib/config/slate-model';

describe('/api/weeks/slate model parameter', () => {
  describe('model=hybrid_v2', () => {
    it('2025 resolves hybrid_v2 as active model with hybrid spread scope', () => {
      const { activeModel, invalidRequest, activationHold } =
        resolveSlateModelParam('hybrid_v2', 2025, 9);
      expect(activeModel).toBe('hybrid_v2');
      expect(invalidRequest).toBe(false);
      expect(activationHold).toBe(false);

      const meta = buildSlateResponseMeta({ activeModel });
      expect(meta.modelScope.spread).toBe('hybrid_v2');
      expect(meta.modelScope.total).toBe('current');
      expect(meta.modelScope.moneyline).toBe('current');
    });

    it('2026 Hybrid request is authorization-held to Core V1 (not invalid)', () => {
      const resolved = resolveSlateModelParam('hybrid_v2', 2026, 1);
      expect(resolved.activeModel).toBe('core_v1');
      expect(resolved.preferredModel).toBe('hybrid_v2');
      expect(resolved.activationHold).toBe(true);
      expect(resolved.invalidRequest).toBe(false);

      const meta = buildSlateResponseMeta({
        activeModel: resolved.activeModel,
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
      expect(meta.invalidModelFallback).toBe(false);
      expect(meta.activationOverride?.used).toBe(true);
    });
  });

  describe('model=core_v1', () => {
    it('resolves core_v1 with core spread scope for regression path', () => {
      const { activeModel } = resolveSlateModelParam('core_v1', 2026, 1);
      expect(activeModel).toBe('core_v1');

      const meta = buildSlateResponseMeta({ activeModel });
      expect(meta.modelScope.spread).toBe('core_v1');
    });
  });

  describe('default model when param omitted', () => {
    it('prefers hybrid_v2 config default; 2026 effective Core V1', () => {
      expect(resolveSlateModelParam(null).preferredModel).toBe('hybrid_v2');
      expect(resolveSlateModelParam(null, 2026, 1).activeModel).toBe('core_v1');
      expect(buildSlateResponseMeta({ activeModel: 'hybrid_v2' }).defaultModel).toBe(
        'hybrid_v2'
      );
    });
  });

  describe('invalid model param', () => {
    it('falls back preferred to hybrid_v2 and flags invalidModelFallback in meta', () => {
      const resolved = resolveSlateModelParam('fade_v4_labs');
      expect(resolved.preferredModel).toBe('hybrid_v2');
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

  describe('2026 Week1 effective model identity', () => {
    it('omitted / core_v1 / hybrid-held all resolve effective Core V1', () => {
      const omitted = resolveSlateModelParam(null, 2026, 1);
      const core = resolveSlateModelParam('core_v1', 2026, 1);
      const hybridHeld = resolveSlateModelParam('hybrid_v2', 2026, 1);
      expect(omitted.activeModel).toBe('core_v1');
      expect(core.activeModel).toBe('core_v1');
      expect(hybridHeld.activeModel).toBe('core_v1');
      expect(hybridHeld.activationHold).toBe(true);
      expect(omitted.activationHold).toBe(true);
      expect(core.activationHold).toBe(false);
    });
  });
});

/**
 * Pending: full HTTP/route tests against GET /api/weeks/slate with mocked Prisma.
 * Avoids fragile dependency on production database state.
 */
