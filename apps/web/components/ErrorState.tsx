/**
 * Standardized Error State Component
 * 
 * Consistent error messaging with helpful next steps
 */

'use client';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  fullScreen?: boolean;
  helpLink?: {
    label: string;
    href: string;
  };
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try Again',
  fullScreen = false,
  helpLink,
}: ErrorStateProps) {
  const content = (
    <div className="bg-red-50 border-l-4 border-red-400 p-6 rounded-r-lg max-w-2xl">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-lg font-medium text-red-800 mb-2">{title}</h3>
          <p className="text-sm text-red-700 mb-4">{message}</p>
          <div className="flex gap-3">
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium transition-colors"
              >
                {retryLabel}
              </button>
            )}
            {helpLink && (
              <a
                href={helpLink.href}
                className="px-4 py-2 bg-white text-red-600 border border-red-300 rounded-md hover:bg-red-50 text-sm font-medium transition-colors"
              >
                {helpLink.label} →
              </a>
            )}
          </div>
          {!onRetry && !helpLink && (
            <p className="text-xs text-red-600 mt-4">
              If this problem persists, please check the <a href="/docs/status" className="underline">system status</a> or try refreshing the page.
            </p>
          )}
        </div>
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        {content}
      </div>
    );
  }

  return content;
}

