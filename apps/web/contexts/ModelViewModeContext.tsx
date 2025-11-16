/**
 * Model View Mode Context
 * 
 * Global state for toggling between "Official (Trust-Market)" and "Raw Model" views.
 */

'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

export type ModelViewMode = 'official' | 'raw';

interface ModelViewModeContextType {
  mode: ModelViewMode;
  setMode: (mode: ModelViewMode) => void;
}

const ModelViewModeContext = createContext<ModelViewModeContextType | undefined>(undefined);

export function ModelViewModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ModelViewMode>('official');

  return (
    <ModelViewModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ModelViewModeContext.Provider>
  );
}

export function useModelViewMode() {
  const context = useContext(ModelViewModeContext);
  if (context === undefined) {
    throw new Error('useModelViewMode must be used within a ModelViewModeProvider');
  }
  return context;
}

