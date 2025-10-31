/**
 * Info Tooltip Component
 * 
 * Reusable tooltip for explaining technical terms
 */

'use client';

import { useState } from 'react';

interface InfoTooltipProps {
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function InfoTooltip({ content, position = 'top', className = '' }: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 transform -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 transform -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 transform -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 transform -translate-y-1/2 ml-2',
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 hover:text-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="More information"
      >
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
      </button>
      {isOpen && (
        <div
          className={`absolute ${positionClasses[position]} z-50 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg pointer-events-none`}
          role="tooltip"
        >
          <div className="whitespace-normal">{content}</div>
          {/* Arrow */}
          <div
            className={`absolute ${
              position === 'top' ? 'top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900' :
              position === 'bottom' ? 'bottom-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-b-gray-900' :
              position === 'left' ? 'left-full top-1/2 transform -translate-y-1/2 border-4 border-transparent border-l-gray-900' :
              'right-full top-1/2 transform -translate-y-1/2 border-4 border-transparent border-r-gray-900'
            }`}
          />
        </div>
      )}
    </div>
  );
}

