/**
 * Production Model Selector
 *
 * Switches between Hybrid V2 and Core V1. Labs models are not included.
 * Wired in Phase D on homepage/picks; provider is available globally from Phase C.
 */

'use client';

import React from 'react';
import { useProductionModel } from '@/contexts/ProductionModelContext';
import { getProductionModelSelectorOptions } from '@/lib/config/production-model-preference';

const SELECTOR_OPTIONS = getProductionModelSelectorOptions();

export function ProductionModelSelector() {
  const { model, setModel } = useProductionModel();

  return (
    <div
      className="flex flex-col gap-1"
      role="group"
      aria-label="Production model selector"
    >
      <span className="text-xs font-medium text-gray-500">Model</span>
      <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
        {SELECTOR_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setModel(option.id)}
            aria-pressed={model === option.id}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              model === option.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
