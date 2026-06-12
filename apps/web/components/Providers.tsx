'use client';

import { ModelViewModeProvider } from '@/contexts/ModelViewModeContext';
import { ProductionModelProvider } from '@/contexts/ProductionModelContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ModelViewModeProvider>
      <ProductionModelProvider>{children}</ProductionModelProvider>
    </ModelViewModeProvider>
  );
}

