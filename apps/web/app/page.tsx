/**
 * M3 Home Page - Seed Slate
 * 
 * Displays this week's seed games with implied vs market data and confidence tiers.
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SlateData } from '@/types';
import { TeamLogo } from '@/components/TeamLogo';
import { DataModeBadge } from '@/components/DataModeBadge';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import { SkeletonTable } from '@/components/SkeletonRow';
import { SyncScrollX } from '@/components/SyncScrollX';
import SlateTable from '@/components/SlateTable';
import { abbrevSource, formatSourceTooltip } from '@/lib/market-badges';
import { InfoTooltip } from '@/components/InfoTooltip';
import { ErrorState } from '@/components/ErrorState';

export default function HomePage() {
  const [slate, setSlate] = useState<SlateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [injuriesOn, setInjuriesOn] = useState(false);
  const [weatherOn, setWeatherOn] = useState(false);

  useEffect(() => {
    fetchSlate();
  }, [injuriesOn, weatherOn]);

  const fetchSlate = async () => {
    try {
      const params = new URLSearchParams();
      if (injuriesOn) params.append('injuries', 'on');
      if (weatherOn) params.append('weather', 'on');
      
      const response = await fetch(`/api/seed-slate?${params.toString()}`);
      const data = await response.json();
      
      if (data.success) {
        setSlate(data);
      } else {
        setError(data.error || 'Failed to fetch slate data');
      }
    } catch (err) {
      setError('Network error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'A': return 'text-green-600 bg-green-100';
      case 'B': return 'text-yellow-600 bg-yellow-100';
      case 'C': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatEdge = (edge: number) => {
    return edge >= 1.0 ? `+${edge.toFixed(1)}` : edge.toFixed(1);
  };

  // Removed old full-page loading spinner - now shows skeleton in-place

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <HeaderNav />
        <div className="flex-1 flex items-center justify-center px-4">
          <ErrorState
            title="Unable to Load Current Slate"
            message={error.includes('Network') 
              ? "We couldn't connect to the server. Please check your internet connection and try again."
              : "We couldn't load this week's games. This might be temporary - please try again in a moment."}
            onRetry={fetchSlate}
            helpLink={{
              label: 'Check System Status',
              href: '/docs/status'
            }}
            fullScreen={false}
          />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Season Update Banner */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-amber-400 p-6 rounded-r-lg mb-8">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Season Update (Dec 22, 2025)</h3>
              <p className="text-sm text-gray-700 mb-2">
                Regular season: ✅ complete. Bowl season: 💤 (limited updates).
              </p>
              <p className="text-sm text-gray-700 mb-3">
                Gridiron Edge will be back for the 2026 season with improvements and updated models.
              </p>
              <p className="text-sm text-gray-700 mb-2">
                Want receipts? See how the different models performed this year on{' '}
                <Link 
                  href="https://gridiron-edge-v1.vercel.app/labs/portfolio"
                  className="text-blue-600 hover:text-blue-800 underline font-medium"
                >
                  Portfolio What-Ifs (Labs)
                </Link>:
              </p>
              <p className="text-xs text-gray-500 italic mb-3">
                Labs results are historical simulations — not guarantees, not financial advice, and definitely not a promise you'll stop doing degenerate things on Saturdays.
              </p>
              <p className="text-xs text-gray-600">
                Offseason plan: tuning the model, cleaning data, and making the site faster/cleaner for 2026.
              </p>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold text-gray-900">Current Slate</h1>
              <div className="relative group">
                <button className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                </button>
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 max-w-xs">
                  <div className="mb-1"><strong>Spread:</strong> Home team's advantage. Negative = home favored</div>
                  <div><strong>Edge:</strong> Difference between our model's prediction and the betting market (in points). Higher edge = stronger opportunity.</div>
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </div>
            <Link 
              href={`/weeks?season=${slate?.season}&week=${slate?.week}`}
              className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
            >
              Review Previous Weeks
            </Link>
          </div>
          
          {/* Subheader with today's date and auto-selected season/week */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-2">
            <div className="text-sm text-gray-500">
              Today: {new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </div>
            <div className="text-sm text-gray-500">
              {slate?.season && slate?.week ? (
                `Showing: Season ${slate.season}, Week ${slate.week}`
              ) : (
                <span className="text-yellow-600">No games found - Select a different week</span>
              )}
            </div>
          </div>
          
          {slate && (
            <div className="flex items-center gap-3 mt-2">
              <p className="text-gray-600">
                {slate.week && slate.season ? (
                  <>Week {slate.week} • {slate.season} Season • Model {slate.modelVersion || 'v0.0.1'}</>
                ) : (
                  <span className="text-yellow-600">Season/Week detection failed - try selecting manually</span>
                )}
              </p>
              {slate?.games?.some(game => game.homeScore !== null && game.awayScore !== null) && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Final
                </span>
              )}
            </div>
          )}
          
          {/* M6 Adjustment Toggles - REMOVED: Non-functional, hidden until feature is built */}
        </div>

        {/* What is Edge? - Prominent explanation */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-400 p-6 rounded-r-lg mb-8">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-lg font-semibold text-gray-900">What is Edge?</h3>
                <InfoTooltip content="Edge is the difference between our model's prediction and the betting market (in points). Higher edge = stronger betting opportunity." />
              </div>
              <p className="text-sm text-gray-700 mb-3">
                <strong>Edge</strong> shows how much our model disagrees with the betting market. When our model thinks the market is wrong, 
                that creates a betting opportunity. The numbers below show games where we found meaningful edges (2.0+ points difference).
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="bg-green-100 text-green-800 px-2 py-1 rounded font-medium">High (A) ≥ 4.0 pts</span>
                <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-medium">Medium (B) ≥ 3.0 pts</span>
                <span className="bg-red-100 text-red-800 px-2 py-1 rounded font-medium">Low (C) ≥ 2.0 pts</span>
                <Link href="/getting-started" className="text-blue-600 hover:text-blue-800 underline font-medium">
                  Learn more →
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-blue-600">{slate?.summary?.totalGames || 0}</div>
            <div className="text-sm text-gray-600 flex items-center gap-1">
              Total Games
              <InfoTooltip content="Total number of games scheduled for this week. Edge counts show games where our model's prediction differs from the betting market by 2.0+ points." />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-green-600">{slate?.summary?.confidenceBreakdown?.A || 0}</div>
            <div className="text-sm text-gray-600 flex items-center gap-1">
              High Confidence (A)
              <InfoTooltip content="Games where our model differs from the betting market by 4.0+ points. These represent the strongest betting opportunities with high confidence in the model's advantage." />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-yellow-600">{slate?.summary?.confidenceBreakdown?.B || 0}</div>
            <div className="text-sm text-gray-600 flex items-center gap-1">
              Medium Confidence (B)
              <InfoTooltip content="Games where our model differs from the betting market by 3.0-3.9 points. Moderate betting opportunities with good model advantage." />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-red-600">{slate?.summary?.confidenceBreakdown?.C || 0}</div>
            <div className="text-sm text-gray-600 flex items-center gap-1">
              Low Confidence (C)
              <InfoTooltip content="Games where our model differs from the betting market by 2.0-2.9 points. Lower confidence opportunities - use with caution." />
            </div>
          </div>
        </div>

        {/* Empty State Message */}
        {(!slate || !slate.games || slate.games.length === 0) && !loading && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 mb-8 rounded-r-lg">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-lg font-medium text-yellow-800 mb-2">No Games Found</h3>
                <p className="text-sm text-yellow-700 mb-4">
                  {slate?.season && slate?.week
                    ? `No games are scheduled for Season ${slate.season}, Week ${slate.week}.`
                    : 'Unable to determine the current week. Games may not be loaded yet.'}
                </p>
                <div className="flex gap-3">
                  <Link
                    href="/weeks"
                    className="inline-flex items-center px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 text-sm font-medium"
                  >
                    Browse All Weeks →
                  </Link>
                  <Link
                    href="/docs/status"
                    className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm font-medium"
                  >
                    Check Data Status →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions - Simplified from "Selections & Profitability" */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg shadow mb-8 border border-blue-100">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Quick Actions</h2>
              <p className="text-sm text-gray-600">Review past weeks and track your selections</p>
            </div>
            <div className="flex gap-3">
              <Link 
                href="/weeks"
                className="px-4 py-2 bg-white text-blue-600 rounded-md hover:bg-blue-50 border border-blue-200 text-sm font-medium transition-colors"
              >
                Browse Weeks
              </Link>
              <Link 
                href="/weeks/review"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium transition-colors"
              >
                Week Review
              </Link>
            </div>
          </div>
        </div>

        {/* Games Table */}
        {slate && (
          <SlateTable 
            season={slate.season} 
            week={slate.week} 
            title="This Week's Slate"
            showDateHeaders={true}
            showAdvanced={false}
          />
        )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
