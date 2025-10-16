'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Breadcrumbs() {
  const pathname = usePathname();

  // Get page title from pathname
  const getPageTitle = (path: string) => {
    if (path === '/docs') return 'Documentation';
    if (path === '/docs/runbook') return 'Runbook';
    if (path === '/docs/methodology') return 'Methodology';
    if (path === '/docs/status') return 'Status';
    return 'Documentation';
  };

  const pageTitle = getPageTitle(pathname);

  return (
    <nav className="text-sm text-gray-500 mb-4">
      <ol className="flex items-center space-x-2">
        <li>
          <Link 
            href="/" 
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            Home
          </Link>
        </li>
        <li className="text-gray-400">›</li>
        <li>
          <Link 
            href="/docs" 
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            Docs
          </Link>
        </li>
        {pathname !== '/docs' && (
          <>
            <li className="text-gray-400">›</li>
            <li className="text-gray-900 font-medium">
              {pageTitle}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}
