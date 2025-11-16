/**
 * Model View Mode Toggle
 * 
 * Segmented control for switching between "Official (Trust-Market)" and "Raw Model" views.
 */

'use client';

import React from 'react';
import { useModelViewMode, ModelViewMode } from '@/contexts/ModelViewModeContext';

export function ModelViewModeToggle() {
  const { mode, setMode } = useModelViewMode();

  return (
    <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
      <button
        onClick={() => setMode('official')}
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          mode === 'official'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        Official picks
      </button>
      <button
        onClick={() => setMode('raw')}
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

