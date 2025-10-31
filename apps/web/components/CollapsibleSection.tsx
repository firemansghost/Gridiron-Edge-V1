/**
 * CollapsibleSection Component
 * 
 * Progressive disclosure component for hiding/showing dense information
 */

'use client';

import { useState } from 'react';

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function CollapsibleSection({ 
  title, 
  children, 
  defaultOpen = false,
  className = '' 
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors rounded-t-lg"
      >
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="p-4 pt-0 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  );
}

