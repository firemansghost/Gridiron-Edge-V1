'use client';

import { useEffect, useRef, ReactNode } from 'react';

interface SyncScrollXProps {
  children: ReactNode;
}

export function SyncScrollX({ children }: SyncScrollXProps) {
  const topBarRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const phantomRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  useEffect(() => {
    const topBar = topBarRef.current;
    const main = mainRef.current;
    const phantom = phantomRef.current;

    if (!topBar || !main || !phantom) return;

    // Function to update phantom width
    const updatePhantomWidth = () => {
      if (phantom && main) {
        phantom.style.width = `${main.scrollWidth}px`;
      }
    };

    // Function to sync scroll positions
    const syncScroll = (source: HTMLElement, target: HTMLElement) => {
      if (isScrollingRef.current) return;
      isScrollingRef.current = true;
      target.scrollLeft = source.scrollLeft;
      requestAnimationFrame(() => {
        isScrollingRef.current = false;
      });
    };

    // Set up scroll listeners
    const handleTopScroll = () => {
      if (main) syncScroll(topBar, main);
    };

    const handleMainScroll = () => {
      if (topBar) syncScroll(main, topBar);
    };

    // Initial setup
    updatePhantomWidth();

    // Add scroll listeners
    topBar.addEventListener('scroll', handleTopScroll);
    main.addEventListener('scroll', handleMainScroll);

    // Set up ResizeObserver to update phantom width when table changes
    const resizeObserver = new ResizeObserver(() => {
      updatePhantomWidth();
    });

    resizeObserver.observe(main);

    // Cleanup
    return () => {
      topBar.removeEventListener('scroll', handleTopScroll);
      main.removeEventListener('scroll', handleMainScroll);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="relative">
      {/* Top scrollbar mirror */}
      <div 
        ref={topBarRef} 
        className="h-4 overflow-x-auto mb-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100" 
        aria-hidden="true"
      >
        <div ref={phantomRef} className="h-full" />
      </div>
      
      {/* Main scrollable content */}
      <div ref={mainRef} className="overflow-x-auto">
        {children}
      </div>
    </div>
  );
}
