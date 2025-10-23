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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Slate</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={fetchSlate}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold text-gray-900">This Week</h1>
              <div className="relative group">
                <button className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                </button>
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                  Spread: Home minus Away (negative = home favored)<br/>
                  Edge: |Model - Market| points
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
              Showing: Season {slate?.season || '—'}, Week {slate?.week || '—'}
            </div>
          </div>
          
          <div className="flex items-center gap-3 mt-2">
            <p className="text-gray-600">
              Week {slate?.week} • {slate?.season} Season • Model {slate?.modelVersion}
            </p>
            {slate?.games?.some(game => game.homeScore !== null && game.awayScore !== null) && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Final
              </span>
            )}
          </div>
          
          {/* M6 Adjustment Toggles */}
          <div className="flex items-center gap-4 mt-3">
            <span className="text-sm font-medium text-gray-700">Adjustments:</span>
            <button
              onClick={() => setInjuriesOn(!injuriesOn)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                injuriesOn 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Injuries {injuriesOn ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => setWeatherOn(!weatherOn)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                weatherOn 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Weather {weatherOn ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-blue-600">{slate?.summary?.totalGames || 0}</div>
            <div className="text-sm text-gray-600">Total Games</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-green-600">{slate?.summary?.confidenceBreakdown?.A || 0}</div>
            <div className="text-sm text-gray-600">Tier A Edges</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-yellow-600">{slate?.summary?.confidenceBreakdown?.B || 0}</div>
            <div className="text-sm text-gray-600">Tier B Edges</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-red-600">{slate?.summary?.confidenceBreakdown?.C || 0}</div>
            <div className="text-sm text-gray-600">Tier C Edges</div>
          </div>
        </div>

        {/* Selections & Profitability Card */}
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Selections & Profitability</h2>
          <p className="text-gray-600 mb-4">Track your betting performance and review past selections.</p>
          <div className="flex gap-4">
            <Link 
              href="/weeks/review"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Week Review
            </Link>
            <Link 
              href="/bets"
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Bets Ledger
            </Link>
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

        {/* Info Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>M3 Seed Mode • Linear Ratings • Constant HFA = 2.0 pts</p>
          <p>Confidence Tiers: A ≥ 4.0 pts, B ≥ 3.0 pts, C ≥ 2.0 pts</p>
        </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
