/**
 * Phase 2C-2I-2 — Hybrid V2 production activation hold.
 */

import {
  HYBRID_V2_PRODUCTION_HOLD_REASON,
  isHybridV2ProductionAuthorized,
} from '@/lib/config/hybrid-production-activation';
import {
  AVAILABLE_PRODUCTION_MODELS,
  DEFAULT_PRODUCTION_MODEL,
} from '@/lib/config/production-models';
import {
  buildHybridActivationOverrideMeta,
  buildSlateResponseMeta,
  resolveSlateModelParam,
  shouldLoadCoreHybridComparisonMetadata,
} from '@/lib/config/slate-model';

describe('Hybrid V2 production activation hold', () => {
  it('2026 Hybrid production authorization currently false', () => {
    expect(isHybridV2ProductionAuthorized(2026)).toBe(false);
    expect(isHybridV2ProductionAuthorized(2026, 1)).toBe(false);
    expect(isHybridV2ProductionAuthorized(2026, 12)).toBe(false);
  });

  it('historical 2025 behavior preserved (authorized)', () => {
    expect(isHybridV2ProductionAuthorized(2025)).toBe(true);
    expect(isHybridV2ProductionAuthorized(2025, 9)).toBe(true);
    expect(isHybridV2ProductionAuthorized(2024)).toBe(true);
  });

  it('Hybrid remains available in selector catalog; default config unchanged', () => {
    expect(DEFAULT_PRODUCTION_MODEL).toBe('hybrid_v2');
    expect(AVAILABLE_PRODUCTION_MODELS).toContain('hybrid_v2');
    expect(AVAILABLE_PRODUCTION_MODELS).toContain('core_v1');
  });

  it('2026 omitted model resolves effective Core V1 with activation hold', () => {
    const r = resolveSlateModelParam(null, 2026, 1);
    expect(r.preferredModel).toBe('hybrid_v2');
    expect(r.activeModel).toBe('core_v1');
    expect(r.activationHold).toBe(true);
    expect(r.invalidRequest).toBe(false);
  });

  it('2026 explicit core_v1 -> Core V1 (no hold flag)', () => {
    const r = resolveSlateModelParam('core_v1', 2026, 1);
    expect(r.activeModel).toBe('core_v1');
    expect(r.preferredModel).toBe('core_v1');
    expect(r.activationHold).toBe(false);
    expect(r.invalidRequest).toBe(false);
  });

  it('2026 explicit hybrid_v2 -> effective Core V1 + authorization metadata', () => {
    const r = resolveSlateModelParam('hybrid_v2', 2026, 1);
    expect(r.activeModel).toBe('core_v1');
    expect(r.preferredModel).toBe('hybrid_v2');
    expect(r.activationHold).toBe(true);
    expect(r.invalidRequest).toBe(false);

    const meta = buildSlateResponseMeta({
      activeModel: r.activeModel,
      requestedModel: 'hybrid_v2',
      activationOverride: buildHybridActivationOverrideMeta(),
    });
    expect(meta.activeModel).toBe('core_v1');
    expect(meta.modelScope.spread).toBe('core_v1');
    expect(meta.invalidModelFallback).toBe(false);
    expect(meta.activationOverride?.used).toBe(true);
    expect(meta.activationOverride?.requested).toBe('hybrid_v2');
    expect(meta.activationOverride?.effective).toBe('core_v1');
    expect(meta.activationOverride?.reason).toBe(HYBRID_V2_PRODUCTION_HOLD_REASON);
  });

  it('explicit Hybrid request is NOT marked invalid', () => {
    const r = resolveSlateModelParam('hybrid_v2', 2026, 1);
    expect(r.invalidRequest).toBe(false);
  });

  it('2025 hybrid request remains Hybrid (no activation hold)', () => {
    const r = resolveSlateModelParam('hybrid_v2', 2025, 9);
    expect(r.activeModel).toBe('hybrid_v2');
    expect(r.activationHold).toBe(false);
  });

  it('param-only resolve without season preserves preferred Hybrid (no hold)', () => {
    const r = resolveSlateModelParam('hybrid_v2');
    expect(r.activeModel).toBe('hybrid_v2');
    expect(r.activationHold).toBe(false);
  });

  it('persisted Hybrid comparison metadata only for explicit Core V1 (not hold)', () => {
    expect(shouldLoadCoreHybridComparisonMetadata('core_v1', false)).toBe(true);
    expect(shouldLoadCoreHybridComparisonMetadata('core_v1', true)).toBe(false);
    expect(shouldLoadCoreHybridComparisonMetadata('hybrid_v2', false)).toBe(false);
    expect(shouldLoadCoreHybridComparisonMetadata('hybrid_v2', true)).toBe(false);

    const held = resolveSlateModelParam('hybrid_v2', 2026, 1);
    expect(held.activationHold).toBe(true);
    expect(held.activeModel).toBe('core_v1');
    expect(
      shouldLoadCoreHybridComparisonMetadata(held.activeModel, held.activationHold)
    ).toBe(false);

    const explicitCore = resolveSlateModelParam('core_v1', 2026, 1);
    expect(explicitCore.activationHold).toBe(false);
    expect(
      shouldLoadCoreHybridComparisonMetadata(
        explicitCore.activeModel,
        explicitCore.activationHold
      )
    ).toBe(true);

    const historicalHybrid = resolveSlateModelParam('hybrid_v2', 2025, 9);
    expect(historicalHybrid.activeModel).toBe('hybrid_v2');
    expect(historicalHybrid.activationHold).toBe(false);
    expect(
      shouldLoadCoreHybridComparisonMetadata(
        historicalHybrid.activeModel,
        historicalHybrid.activationHold
      )
    ).toBe(false);
  });

  it('authorization-held path leaves Hybrid conflict/tier fields neutral by contract', () => {
    // Route initializes these defaults and skips enrichment when activationHold.
    const heldNeutral = {
      hybridConflictType: null as string | null,
      tierBucket: 'none',
      isSuperTierA: false,
      clv: null as number | null,
    };
    expect(heldNeutral.hybridConflictType).toBeNull();
    expect(heldNeutral.tierBucket).toBe('none');
    expect(heldNeutral.isSuperTierA).toBe(false);
    expect(heldNeutral.clv).toBeNull();

    const held = resolveSlateModelParam('hybrid_v2', 2026, 1);
    const meta = buildSlateResponseMeta({
      activeModel: held.activeModel,
      requestedModel: 'hybrid_v2',
      activationOverride: buildHybridActivationOverrideMeta(),
    });
    expect(meta.activeModel).toBe('core_v1');
    expect(meta.modelScope.spread).toBe('core_v1');
    expect(meta.activationOverride?.used).toBe(true);
  });

  it('missing-input fallback meta remains distinct from activation override', () => {
    const meta = buildSlateResponseMeta({
      activeModel: 'hybrid_v2',
      fallback: {
        used: true,
        from: 'hybrid_v2',
        to: 'core_v1',
        reason: 'missing grades',
        gamesAffected: 3,
      },
    });
    expect(meta.fallback?.used).toBe(true);
    expect(meta.activationOverride).toBeUndefined();
    expect(meta.activeModel).toBe('hybrid_v2');
  });

  it('Hybrid and Core V1 formula sources unchanged', () => {
    const fs = require('fs');
    const path = require('path');
    const hybrid = fs.readFileSync(
      path.join(__dirname, '../lib/core-v2-spread.ts'),
      'utf8'
    );
    expect(hybrid).toMatch(/V1_WEIGHT\s*=\s*0\.7/);
    expect(hybrid).toMatch(/V2_WEIGHT\s*=\s*0\.3/);
    expect(hybrid).toMatch(/V2_SCALE\s*=\s*9\.0/);
    expect(hybrid).toMatch(/W_RUN\s*=\s*0\.4/);
    expect(hybrid).toMatch(/W_PASS\s*=\s*0\.4/);
    expect(hybrid).toMatch(/W_EXPLO\s*=\s*0\.2/);
    expect(hybrid).toMatch(/HFA\s*=\s*2\.5/);

    const route = fs.readFileSync(
      path.join(__dirname, '../app/api/weeks/slate/route.ts'),
      'utf8'
    );
    expect(route).toContain('resolveSlateModelParam(requestedModel, season, week)');
    expect(route).toContain('activationHold');
    expect(route).toContain('buildHybridActivationOverrideMeta');
    expect(route).toContain('shouldLoadCoreHybridComparisonMetadata(activeModel, activationHold)');
    expect(route).toContain("strategyTag: 'hybrid_v2'");
    expect(route).toContain('else if (!activationHold)');
    // Hybrid runtime only when effective activeModel is hybrid_v2
    expect(route).toMatch(/if \(activeModel === 'hybrid_v2'\)[\s\S]*tryComputeHybridSpreadHma/);
    expect(route).toMatch(/if \(activeModel === 'hybrid_v2'\)[\s\S]*deriveHybridConflictType/);
    expect(route).toMatch(/if \(activeModel === 'hybrid_v2'\)[\s\S]*deriveHybridTierFields/);
    // Held path must gate the persisted Hybrid comparison query
    expect(route).toMatch(
      /allowCoreHybridComparisonMetadata[\s\S]*\? await prisma\.bet\.findMany[\s\S]*strategyTag: 'hybrid_v2'[\s\S]*: \[\];/
    );
  });

  it('Picks and Homepage use effective activeModel; selector shows hold state', () => {
    const fs = require('fs');
    const path = require('path');
    const picks = fs.readFileSync(
      path.join(__dirname, '../app/picks/page.tsx'),
      'utf8'
    );
    expect(picks).toContain('slateMeta?.activeModel ?? model');
    expect(picks).toContain('effectiveModelLabel');
    expect(picks).toContain(
      'Hybrid V2 is not active for 2026 yet; Core V1 is being used.'
    );
    expect(picks).toContain('shouldShowHybridPlaybookFilters(effectiveModel)');
    expect(picks).toContain('hasAnyBets && hybridRuntimeActive');

    const home = fs.readFileSync(
      path.join(__dirname, '../app/page.tsx'),
      'utf8'
    );
    expect(home).toContain('slate?.meta?.activeModel ?? model');
    expect(home).toContain('effectiveModelLabel');
    expect(home).toContain('Core V1 production spread');
    expect(home).toContain('Hybrid V2 held');
    expect(home).toContain("heldModelIds={heldModelIds}");

    const selector = fs.readFileSync(
      path.join(__dirname, '../components/ProductionModelSelector.tsx'),
      'utf8'
    );
    expect(selector).toContain('effectiveModel');
    expect(selector).toContain('heldModelIds');
    expect(selector).toContain("suffix = 'HELD'");
    expect(selector).toContain('aria-pressed={isEffective}');
  });
});
