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
import { SkeletonTable } from '@/components/SkeletonRow';
import { SyncScrollX } from '@/components/SyncScrollX';
import { abbrevSource, formatSourceTooltip } from '@/lib/market-badges';
import { MoneylineInfo, MarketMeta } from '@/types';

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
    spread?: MarketMeta | null;
    total?: MarketMeta | null;
  };
  marketFallback?: {
    spread: boolean;
    total: boolean;
  };
  moneyline?: MoneylineInfo;
  impliedSpread: number;
  impliedTotal: number;
  spreadEdge: number;
  totalEdge: number;
  maxEdge: number;
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
  confidence: string;
  modelVersion: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}

interface WeekResponse {
  success: boolean;
  season: number;
  week: number;
  filters: {
    confidence: string | null;
    market: string | null;
  };
  games: WeekData[];
  summary: {
    totalGames: number;
    confidenceBreakdown: {
      A: number;
      B: number;
      C: number;
    };
    hasResults: boolean;
    roi: {
      wins: number;
      losses: number;
      pushes: number;
      totalBets: number;
      winRate: number;
      roi: number;
    } | null;
    avgClv: number | null;
  };
}

function WeeksPageContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<WeekResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filter states
  const [season, setSeason] = useState(searchParams.get('season') || new Date().getFullYear().toString());
  const [week, setWeek] = useState(searchParams.get('week') || '1');
  const [confidence, setConfidence] = useState(searchParams.get('confidence') || '');
  const [market, setMarket] = useState(searchParams.get('market') || '');

  useEffect(() => {
    fetchWeekData();
  }, [season, week, confidence, market]);

  const fetchWeekData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (season) params.set('season', season);
      if (week) params.set('week', week);
      if (confidence) params.set('confidence', confidence);
      if (market) params.set('market', market);
      
      const response = await fetch(`/api/weeks?${params.toString()}`);
      const result = await response.json();
      
      if (result.success) {
        setData(result);
      } else {
        setError(result.error || 'Failed to fetch week data');
      }
    } catch (err) {
      setError('Network error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = async () => {
    try {
      const params = new URLSearchParams();
      if (season) params.set('season', season);
      if (week) params.set('week', week);
      if (confidence) params.set('confidence', confidence);
      if (market) params.set('market', market);
      
      const response = await fetch(`/api/weeks/csv?${params.toString()}`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `week-${week}-${season}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        setError('Failed to download CSV');
      }
    } catch (err) {
      setError('Error downloading CSV: ' + (err instanceof Error ? err.message : 'Unknown error'));
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
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Week Data</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={fetchWeekData}
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
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Review Previous Weeks</h1>
              <p className="text-gray-600 mt-2">
                Week {data?.week} • {data?.season} Season
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={downloadCSV}
                className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                📥 Download CSV
              </button>
              <a 
                href="/"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                ← Back to Current Week
              </a>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Filters */}
            <div className="bg-white p-6 rounded-lg shadow mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Season</label>
                  <select
                    value={season}
                    onChange={(e) => setSeason(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={new Date().getFullYear().toString()}>{new Date().getFullYear()}</option>
                    <option value={(new Date().getFullYear() - 1).toString()}>{new Date().getFullYear() - 1}</option>
                    <option value={(new Date().getFullYear() - 2).toString()}>{new Date().getFullYear() - 2}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Week</label>
                  <select
                    value={week}
                    onChange={(e) => setWeek(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Array.from({ length: 15 }, (_, i) => i + 1).map(w => (
                      <option key={w} value={w.toString()}>Week {w}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Confidence</label>
                  <select
                    value={confidence}
                    onChange={(e) => setConfidence(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All</option>
                    <option value="A">Tier A</option>
                    <option value="B">Tier B</option>
                    <option value="C">Tier C</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Market</label>
                  <select
                    value={market}
                    onChange={(e) => setMarket(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All</option>
                    <option value="spread">Spread Only</option>
                    <option value="total">Total Only</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Games Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  Week {data?.week} Games ({data?.games?.length || 0} games)
                </h2>
              </div>
              
              <SyncScrollX>
                <div className="max-h-[70vh] overflow-y-auto">
                  <table className="min-w-[1200px] divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Matchup
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Kickoff (CT)
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Score
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Model Line
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ML
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Pick (Spread)
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Pick (Total)
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Market Close
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Edges
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Confidence
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {loading ? (
                      <SkeletonTable rows={5} columns={12} />
                    ) : (
                      data?.games?.map((game) => (
                      <tr key={game.gameId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            <Link href={`/team/${game.awayTeam.id}`} className="hover:text-blue-600 transition-colors">
                              {game.awayTeam.name}
                            </Link>
                            <span className="text-gray-400 mx-1">@</span>
                            <Link href={`/team/${game.homeTeam.id}`} className="hover:text-blue-600 transition-colors">
                              {game.homeTeam.name}
                            </Link>
                          </div>
                          <div className="text-sm text-gray-500">
                            <Link href={`/game/${game.gameId}`} className="hover:text-blue-600 transition-colors">
                              {game.venue} {game.neutralSite && '(Neutral)'}
                            </Link>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {game.kickoff}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {game.homeScore !== null && game.awayScore !== null ? (
                            <div className="font-medium">
                              <span className="text-blue-600">{game.awayScore}</span>
                              <span className="mx-1 text-gray-400">@</span>
                              <span className="text-red-600">{game.homeScore}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="font-medium">{game.spreadPickLabel}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {game.moneyline?.price != null ? (
                            <div className="flex items-center">
                              <span 
                                className="font-medium cursor-help"
                                title={game.moneyline.impliedProb != null 
                                  ? `Implied prob: ${(game.moneyline.impliedProb * 100).toFixed(1)}%` 
                                  : ''
                                }
                              >
                                {game.moneyline.price > 0 ? '+' : ''}{game.moneyline.price}
                              </span>
                              {game.moneyline.meta?.source && (
                                <span 
                                  className="ml-2 text-xs rounded px-2 py-0.5 bg-blue-100 text-blue-700 font-medium"
                                  title={formatSourceTooltip(game.moneyline.meta.source, game.moneyline.meta.timestamp)}
                                >
                                  ({abbrevSource(game.moneyline.meta.source)})
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="font-medium">{game.spreadPickLabel}</div>
                          <div className="text-xs text-gray-500">edge +{game.spreadEdgePts.toFixed(1)}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="font-medium">{game.totalPickLabel || '—'}</div>
                          {game.totalPickLabel && (
                            <div className="text-xs text-gray-500">edge +{game.totalEdgePts.toFixed(1)}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex items-center">
                            <span>Spread: {game.marketSpread > 0 ? '+' : ''}{game.marketSpread.toFixed(1)}</span>
                            {game.marketFallback?.spread && (
                              <span 
                                className="ml-2 text-xs rounded px-2 py-0.5 bg-orange-100 text-orange-700 font-medium"
                                title="Using latest snapshot (closing line not available)"
                              >
                                Latest
                              </span>
                            )}
                            {game.marketMeta?.spread?.source && (
                              <span 
                                className="ml-2 text-xs rounded px-2 py-0.5 bg-blue-100 text-blue-700 font-medium"
                                title={formatSourceTooltip(game.marketMeta.spread.source, game.marketMeta.spread.timestamp)}
                              >
                                ({abbrevSource(game.marketMeta.spread.source)})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center">
                            <span>Total: {game.marketTotal.toFixed(1)}</span>
                            {game.marketFallback?.total && (
                              <span 
                                className="ml-2 text-xs rounded px-2 py-0.5 bg-orange-100 text-orange-700 font-medium"
                                title="Using latest snapshot (closing line not available)"
                              >
                                Latest
                              </span>
                            )}
                            {game.marketMeta?.total?.source && (
                              <span 
                                className="ml-2 text-xs rounded px-2 py-0.5 bg-blue-100 text-blue-700 font-medium"
                                title={formatSourceTooltip(game.marketMeta.total.source, game.marketMeta.total.timestamp)}
                              >
                                ({abbrevSource(game.marketMeta.total.source)})
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div>Spread: +{game.spreadEdge.toFixed(1)}</div>
                          <div>Total: +{game.totalEdge.toFixed(1)}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getConfidenceColor(game.confidence)}`}>
                            {game.confidence}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <Link 
                            href={`/game/${game.gameId}`}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                      ))
                    )}
                  </tbody>
                  </table>
                </div>
              </SyncScrollX>
            </div>
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
        </div>
      </div>
      <Footer />
    </div>
  );
}

export default function WeeksPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <WeeksPageContent />
    </Suspense>
  );
}
