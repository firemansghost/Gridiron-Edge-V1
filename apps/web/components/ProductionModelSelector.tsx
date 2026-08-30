/**
 * Production Model Selector
 *
 * Switches between Hybrid V2 and Core V1. Labs models are not included.
 * Can distinguish preferred (stored) vs effective production vs held models
 * without rewriting the user's stored preference during an activation hold.
 */

'use client';

import React from 'react';
import { useProductionModel } from '@/contexts/ProductionModelContext';
import { getProductionModelSelectorOptions } from '@/lib/config/production-model-preference';
import type { ProductionModelId } from '@/lib/config/production-models';

const SELECTOR_OPTIONS = getProductionModelSelectorOptions();

export interface ProductionModelSelectorProps {
  /** Model currently powering production output (from slate meta). */
  effectiveModel?: ProductionModelId | null;
  /** Models that are catalogued but not actionable for production right now. */
  heldModelIds?: ReadonlyArray<ProductionModelId>;
}

export function ProductionModelSelector({
  effectiveModel = null,
  heldModelIds = [],
}: ProductionModelSelectorProps = {}) {
  const { model, setModel } = useProductionModel();
  const held = new Set(heldModelIds);
  const visualActive: ProductionModelId = effectiveModel ?? model;
  const holdActive = held.size > 0;

  return (
    <div
      className="flex flex-col gap-1"
      role="group"
      aria-label="Production model selector"
    >
      <span className="text-xs font-medium text-gray-500">Model</span>
      <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
        {SELECTOR_OPTIONS.map((option) => {
          const isHeld = held.has(option.id);
          const isEffective = visualActive === option.id;
          const isPreferred = model === option.id;

          let suffix: string | null = null;
          if (holdActive) {
            if (isHeld) suffix = 'HELD';
            else if (isEffective) suffix = 'LIVE';
          }

          const label = suffix ? `${option.label} · ${suffix}` : option.label;

          return (
            <button
              key={option.id}
              type="button"
              disabled={isHeld}
              onClick={() => {
                if (isHeld) return;
                setModel(option.id);
              }}
              aria-pressed={isEffective}
              aria-disabled={isHeld}
              title={
                isHeld
                  ? `${option.label} is held for production; preference retained as ${isPreferred ? 'selected preference' : 'available when authorized'}`
                  : undefined
              }
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                isHeld
                  ? 'text-gray-400 cursor-not-allowed opacity-80'
                  : isEffective
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
