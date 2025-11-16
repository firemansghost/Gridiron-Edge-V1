'use client';

import { ModelViewModeProvider } from '@/contexts/ModelViewModeContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ModelViewModeProvider>
      {children}
    </ModelViewModeProvider>
  );
}

