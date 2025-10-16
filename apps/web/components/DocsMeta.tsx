'use client';

import { useEffect, useState } from 'react';

interface DocsMetaProps {
  gitSha?: string;
  repoUrl?: string;
}

export function DocsMeta({ gitSha, repoUrl }: DocsMetaProps) {
  const [lastUpdated, setLastUpdated] = useState<string>('');

  useEffect(() => {
    // Set the last updated time on the client side to avoid SSR time skew
    setLastUpdated(new Date().toLocaleString());
  }, []);

  if (!lastUpdated && !gitSha) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mb-6">
      {lastUpdated && (
        <div className="inline-flex items-center px-2 py-1 rounded-md border border-gray-200 bg-gray-50">
          <span className="font-medium">Last updated:</span>
          <span className="ml-1">{lastUpdated}</span>
        </div>
      )}
      
      {gitSha && (
        <div className="inline-flex items-center px-2 py-1 rounded-md border border-gray-200 bg-gray-50">
          <span className="font-medium">Commit:</span>
          {repoUrl ? (
            <a
              href={`${repoUrl}/commit/${gitSha}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 text-blue-600 hover:text-blue-800 underline"
            >
              {gitSha.substring(0, 7)}
            </a>
          ) : (
            <span className="ml-1 font-mono">{gitSha.substring(0, 7)}</span>
          )}
        </div>
      )}
    </div>
  );
}
