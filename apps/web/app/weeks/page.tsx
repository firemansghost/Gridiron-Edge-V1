/**
 * M4 Review Previous Weeks Page
 * 
 * Shows historical week data with filters and profitability analysis.
 */

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import SlateTable from '@/components/SlateTable';

interface WeekData {
  gameId: string;
  matchup: string;
  homeTeam: {
    id: string;
    name: string;
    logoUrl?: string | null;
    primaryColor?: string | null;
  };
  awayTeam: {
    id: string;
    name: string;
    logoUrl?: string | null;
    primaryColor?: string | null;
  };
  kickoff: string;
  venue: string;
  neutralSite: boolean;
  marketSpread: number;
  marketTotal: number;
  marketMeta?: {
    spread?: { source?: string | null; timestamp?: Date | string | null } | null;
    total?: { source?: string | null; timestamp?: Date | string | null } | null;
  };
  marketFallback?: {
    spread: boolean;
    total: boolean;
  };
  moneyline?: {
    price: number | null;
    pickLabel: string | null;
    impliedProb: number | null;
    meta?: { source?: string | null; timestamp?: Date | string | null } | null;
  };
  impliedSpread: number;
  impliedTotal: number;
  spreadEdge: number;
  totalEdge: number;
  maxEdge: number;
  confidence: string;
  modelVersion: string;
  
  // New explicit pick fields
  favoredSide: 'home' | 'away';
  favoredTeamId: string;
  favoredTeamName: string;
  modelSpreadPick: {
    teamId: string;
    teamName: string;
    line: number;
  };
  spreadPickLabel: string;
  spreadEdgePts: number;
  totalPick: 'Over' | 'Under' | null;
  totalPickLabel: string | null;
  totalEdgePts: number;
  
  // Game results (if available)
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  
  // M6 Adjustments
  adjustments?: {
    injuryAdjPts: number;
    weatherAdjPts: number;
    totalAdjPts: number;
    breakdown: {
      injuries: string[];
      weather: string[];
    };
  } | null;
  adjustmentsEnabled?: {
    injuries: boolean;
    weather: boolean;
  };
}

interface WeekSummary {
    totalGames: number;
    confidenceBreakdown: {
      A: number;
      B: number;
      C: number;
    };
    hasResults: boolean;
  roi?: {
      wins: number;
      losses: number;
      pushes: number;
      winRate: number;
      roi: number;
    } | null;
    avgClv: number | null;
}

function WeekPageContent() {
  const [data, setData] = useState<{ week: number; season: number; games: WeekData[]; summary: WeekSummary } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState(2025);
  const [week, setWeek] = useState(9);

  const searchParams = useSearchParams();

  useEffect(() => {
    const seasonParam = searchParams.get('season');
    const weekParam = searchParams.get('week');
    
    if (seasonParam) setSeason(parseInt(seasonParam, 10));
    if (weekParam) setWeek(parseInt(weekParam, 10));
  }, [searchParams]);

  // Update URL when filters change
  const updateURL = (newSeason: number, newWeek: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set('season', newSeason.toString());
    url.searchParams.set('week', newWeek.toString());
    window.history.pushState({}, '', url.toString());
  };

  useEffect(() => {
    fetchWeekData();
  }, [season, week]);

  const fetchWeekData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/weeks?season=${season}&week=${week}`);
      const data = await response.json();
      
      if (data.success) {
        setData(data);
      } else {
        setError(data.error || 'Failed to fetch week data');
      }
    } catch (err) {
      setError('Network error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'A': return 'bg-green-100 text-green-800';
      case 'B': return 'bg-yellow-100 text-yellow-800';
      case 'C': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error Loading Week Data</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                </div>
                <div className="mt-4">
                  <button 
                    onClick={fetchWeekData}
                    className="bg-red-100 text-red-800 px-3 py-2 rounded-md text-sm font-medium hover:bg-red-200"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Browse Weeks</h1>
          <p className="mt-2 text-gray-600">
            Historical week data with profitability analysis
          </p>
        </div>

        {/* Filter Controls */}
        <div className="mb-6 bg-white p-4 rounded-lg shadow">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <label htmlFor="season-select" className="text-sm font-medium text-gray-700">
                Season:
              </label>
              <select
                id="season-select"
                value={season}
                onChange={(e) => {
                  const newSeason = parseInt(e.target.value, 10);
                  setSeason(newSeason);
                  updateURL(newSeason, week);
                }}
                className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value={2022}>2022</option>
                <option value={2023}>2023</option>
                <option value={2024}>2024</option>
                <option value={2025}>2025</option>
              </select>
            </div>
            
            <div className="flex items-center space-x-2">
              <label htmlFor="week-select" className="text-sm font-medium text-gray-700">
                Week:
              </label>
              <select
                id="week-select"
                value={week}
                onChange={(e) => {
                  const newWeek = parseInt(e.target.value, 10);
                  setWeek(newWeek);
                  updateURL(season, newWeek);
                }}
                className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                {Array.from({ length: 15 }, (_, i) => i + 1).map(w => (
                  <option key={w} value={w}>Week {w}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">
                {loading ? 'Loading...' : `${data?.games?.length || 0} games`}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Games Table */}
          <div className="lg:col-span-3">
            <SlateTable 
              season={season} 
              week={week} 
              title={`Week ${week} Games`}
              showDateHeaders={true}
              showAdvanced={false}
            />
          </div>

          {/* Summary Card */}
          <div className="lg:col-span-1">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Summary</h3>
              
              {/* Confidence Breakdown */}
              <div className="mb-6">
                <h4 className="text-md font-medium text-gray-900 mb-3">Confidence Tiers</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Tier A</span>
                    <span className="text-lg font-semibold text-green-600">{data?.summary?.confidenceBreakdown?.A || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Tier B</span>
                    <span className="text-lg font-semibold text-yellow-600">{data?.summary?.confidenceBreakdown?.B || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Tier C</span>
                    <span className="text-lg font-semibold text-red-600">{data?.summary?.confidenceBreakdown?.C || 0}</span>
                  </div>
                </div>
              </div>

              {/* ROI Analysis */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3">Performance</h4>
                {data?.summary?.hasResults ? (
                  data.summary.roi ? (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Wins</span>
                        <span className="text-sm font-semibold text-green-600">{data.summary.roi.wins}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Losses</span>
                        <span className="text-sm font-semibold text-red-600">{data.summary.roi.losses}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Pushes</span>
                        <span className="text-sm font-semibold text-gray-600">{data.summary.roi.pushes}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Win Rate</span>
                        <span className="text-sm font-semibold text-gray-900">{(data.summary.roi.winRate * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">ROI</span>
                        <span className={`text-sm font-semibold ${data.summary.roi.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {(data.summary.roi.roi * 100).toFixed(1)}%
                        </span>
                      </div>
                      {data.summary.avgClv !== null && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Avg CLV</span>
                          <span className={`text-sm font-semibold ${data.summary.avgClv >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {data.summary.avgClv >= 0 ? '+' : ''}{data.summary.avgClv.toFixed(1)}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">No spread picks with sufficient edge</div>
                  )
                ) : (
                  <div className="text-sm text-gray-500">No results yet — scores not seeded</div>
                )}
            </div>
          </div>
        </div>
      </div>
  );
}

export default function WeekPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <Suspense fallback={
        <div className="flex-1">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
              <div className="h-64 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      }>
        <WeekPageContent />
      </Suspense>
      <Footer />
    </div>
  );
}
