'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DataModeBadge } from './DataModeBadge';

export function HeaderNav() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(path);
  };

  const linkClass = (path: string) => {
    const base = "px-3 py-2 rounded-md text-sm font-medium transition-colors";
    return isActive(path)
      ? `${base} bg-blue-100 text-blue-700`
      : `${base} text-gray-700 hover:bg-gray-100 hover:text-gray-900`;
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Logo/Title */}
          <div className="flex-shrink-0">
            <Link href="/" className="flex items-center">
              <span className="text-2xl font-bold text-blue-600">Gridiron Edge</span>
            </Link>
          </div>

          {/* Center: Navigation Links */}
          <div className="hidden md:flex items-center space-x-1">
            <Link href="/" className={linkClass('/')} title="View current week's slate of games">
              Current Slate
            </Link>
            <Link href="/weeks" className={linkClass('/weeks')} title="Browse all weeks and seasons">
              Browse Weeks
            </Link>
            <Link href="/weeks/review" className={linkClass('/weeks/review')} title="Review past week performance">
              Week Review
            </Link>
            <Link href="/bets" className={linkClass('/bets')}>
              Bets
            </Link>
            <Link href="/strategies" className={linkClass('/strategies')}>
              Strategies
            </Link>
            <Link href="/backtests" className={linkClass('/backtests')}>
              Backtests
            </Link>
            <Link href="/ratings/config" className={linkClass('/ratings')}>
              Ratings
            </Link>
            {process.env.NEXT_PUBLIC_SHOW_DOCS === 'true' && (
              <Link href="/docs" className={linkClass('/docs')}>
                Docs
              </Link>
            )}
          </div>

          {/* Right: Data Mode Badge */}
          <div className="flex items-center">
            <DataModeBadge />
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden pb-3">
          <div className="flex flex-wrap gap-2">
            <Link href="/" className={linkClass('/')} title="View current week's slate of games">
              Current Slate
            </Link>
            <Link href="/weeks" className={linkClass('/weeks')} title="Browse all weeks and seasons">
              Browse Weeks
            </Link>
            <Link href="/weeks/review" className={linkClass('/weeks/review')} title="Review past week performance">
              Week Review
            </Link>
            <Link href="/bets" className={linkClass('/bets')}>
              Bets
            </Link>
            <Link href="/strategies" className={linkClass('/strategies')}>
              Strategies
            </Link>
            <Link href="/backtests" className={linkClass('/backtests')}>
              Backtests
            </Link>
            <Link href="/ratings/config" className={linkClass('/ratings')}>
              Ratings
            </Link>
            {process.env.NEXT_PUBLIC_SHOW_DOCS === 'true' && (
              <Link href="/docs" className={linkClass('/docs')}>
                Docs
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
