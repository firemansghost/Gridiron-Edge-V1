/**
 * Model View Mode Toggle
 *
 * Segmented control for switching between production (market-adjusted) presentation
 * and raw model presentation. Internal mode id remains `official` | `raw`.
 */

'use client';

import React from 'react';
import { useModelViewMode } from '@/contexts/ModelViewModeContext';

export function ModelViewModeToggle() {
  const { mode, setMode } = useModelViewMode();

  return (
    <div
      className="flex items-center gap-2 bg-gray-100 rounded-lg p-1"
      role="group"
      aria-label="Model view mode"
    >
      <button
        type="button"
        onClick={() => setMode('official')}
        aria-pressed={mode === 'official'}
        aria-label="Production view"
        title="Market-adjusted production presentation (not the locked Official Card)"
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          mode === 'official'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        Production view
      </button>
      <button
        type="button"
        onClick={() => setMode('raw')}
        aria-pressed={mode === 'raw'}
        aria-label="Raw model"
        title="Unadjusted raw model presentation"
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          mode === 'raw'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        Raw model
      </button>
    </div>
  );
}
