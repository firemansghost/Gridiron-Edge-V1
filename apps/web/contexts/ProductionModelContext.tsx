/**
 * Production Model Context
 *
 * Dual-model selector plumbing (Hybrid V2 vs Core V1). Inert until Phase D wires slate/picks.
 * Separate from ModelViewModeContext (official vs raw).
 */

'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import {
  DEFAULT_PRODUCTION_MODEL,
  PRODUCTION_MODEL_LABELS,
  type ProductionModelId,
} from '@/lib/config/production-models';
import {
  PRODUCTION_MODEL_QUERY_PARAM,
  PRODUCTION_MODEL_STORAGE_KEY,
  isValidProductionModelId,
  resolveProductionModelFromSources,
} from '@/lib/config/production-model-preference';

interface ProductionModelContextType {
  model: ProductionModelId;
  setModel: (model: ProductionModelId) => void;
  modelLabel: string;
}

const ProductionModelContext = createContext<ProductionModelContextType | undefined>(
  undefined
);

function readUrlModelParam(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return new URLSearchParams(window.location.search).get(PRODUCTION_MODEL_QUERY_PARAM);
}

function readStoredModel(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(PRODUCTION_MODEL_STORAGE_KEY);
}

function resolveCurrentModel(): ProductionModelId {
  return resolveProductionModelFromSources({
    urlModel: readUrlModelParam(),
    storedModel: readStoredModel(),
  });
}

export function ProductionModelProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [model, setModelState] = useState<ProductionModelId>(DEFAULT_PRODUCTION_MODEL);

  useEffect(() => {
    setModelState(resolveCurrentModel());
  }, [pathname]);

  useEffect(() => {
    const onPopState = () => {
      setModelState(resolveCurrentModel());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const setModel = useCallback((next: ProductionModelId) => {
    if (!isValidProductionModelId(next)) {
      return;
    }

    setModelState(next);
    localStorage.setItem(PRODUCTION_MODEL_STORAGE_KEY, next);

    const url = new URL(window.location.href);
    url.searchParams.set(PRODUCTION_MODEL_QUERY_PARAM, next);
    window.history.replaceState({}, '', url.toString());
  }, []);

  return (
    <ProductionModelContext.Provider
      value={{
        model,
        setModel,
        modelLabel: PRODUCTION_MODEL_LABELS[model],
      }}
    >
      {children}
    </ProductionModelContext.Provider>
  );
}

export function useProductionModel() {
  const context = useContext(ProductionModelContext);
  if (context === undefined) {
    throw new Error('useProductionModel must be used within a ProductionModelProvider');
  }
  return context;
}
