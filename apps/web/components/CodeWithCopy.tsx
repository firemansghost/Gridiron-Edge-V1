'use client';

import { useState } from 'react';

interface CodeWithCopyProps {
  code: string;
  language?: string;
}

export function CodeWithCopy({ code, language = 'sql' }: CodeWithCopyProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className="relative group">
      <pre className="bg-gray-100 rounded-lg p-4 overflow-x-auto">
        <code className={`language-${language}`}>
          {code}
        </code>
      </pre>
      
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
        title="Copy to clipboard"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}
