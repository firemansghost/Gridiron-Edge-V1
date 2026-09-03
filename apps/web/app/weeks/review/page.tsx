'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import {
  getStrategyLabel,
  getDefaultReviewStrategyTag,
  getPreferredReviewStrategyTagForSeason,
  preserveExplicitReviewStrategyRequest,
  resolveReviewStrategyAfterAvailability,
  reviewStrategyToWeekReviewState,
} from '@/lib/strategy-utils';
import {
  parseOfficialCardNotes,
  formatAmericanOdds,
  formatLineNumber,
  formatSignedSpread,
} from '@/lib/official-card';

interface BetSummary {
  totalBets: number;
  gradedBets: number;
  hitRate: number;
  totalPnL: number;
  roi: number;
  avgEdge: number | null;
  avgCLV: number;
}

interface MarketBreakdown {
  totalBets: number;
  gradedBets: number;
  pendingBets: number;
  wins: number;
  losses: number;
  pushes: number;
  gradedStake: number;
  pnl: number;
  roi: number;
  hitRate: number;
}

interface Bet {
  id: string;
  season: number;
  week: number;
  gameId: string;
  marketType: string;
  side: string;
  modelPrice: number;
  closePrice: number | null;
  stake: number;
  result: string | null;
  pnl: number | null;
  clv: number | null;
  strategyTag: string;
  source: string;
  notes: string | null;
  createdAt: string;
  game: {
    homeTeam: { name: string };
    awayTeam: { name: string };
    date: string;
  };
}

interface WeekReviewData {
  summary: BetSummary;
  bets: Bet[];
  byMarketType?: Record<string, MarketBreakdown>;
  pagination: {
    currentPage: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  meta?: {
    totalStrategyRunBets: number;
    demoTagsPresent: string[];
    strategyTagsAvailable?: string[];
    conflictBreakdown?: Record<string, {
      bets: number;
      wins: number;
      losses: number;
      pushes: number;
      winRate: number;
      stake: number;
      pnl: number;
      roi: number;
    }>;
  };
}

export default function WeekReviewPage() {
  const router = useRouter();
  const [season, setSeason] = useState<number>(0);
  const [week, setWeek] = useState<number>(0);
  const [strategy, setStrategy] = useState<string>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<WeekReviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defaultStrategySet = useRef(false);
  const urlParamsApplied = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || urlParamsApplied.current) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const seasonParam = params.get('season');
    const weekParam = params.get('week');
    const strategyParam = params.get('strategy');

    const hasSeasonAndWeek = seasonParam !== null && weekParam !== null;
    if (hasSeasonAndWeek) {
      setSeason(parseInt(seasonParam!, 10));
      setWeek(parseInt(weekParam!, 10));
    }

    if (strategyParam !== null) {
      const preserved = preserveExplicitReviewStrategyRequest(strategyParam);
      setStrategy(reviewStrategyToWeekReviewState(preserved ?? 'all'));
      defaultStrategySet.current = true;
    }

    if (!hasSeasonAndWeek) {
      // Default to the current DB-derived season/week (read-only).
      fetch('/api/current-season-week')
        .then((r) => r.json())
        .then((cur) => {
          if (cur?.season && cur?.week) {
            setSeason(cur.season);
            setWeek(cur.week);
          }
        })
        .catch(() => {
          // If this read-only endpoint fails, fall back to a safe placeholder.
          setSeason((s) => (s || 2026));
          setWeek((w) => (w || 1));
        });
    }

    urlParamsApplied.current = true;
  }, []);

  const fetchData = async () => {
    if (!season || !week) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        season: season.toString(),
        week: week.toString(),
        page: page.toString(),
        limit: '50',
      });
      // Only add strategy if it's not empty (not "All Strategies")
      // Note: The API expects strategyTag, but we're using strategy ID from rulesets
      // We may need to map strategy ID to strategyTag, or update the API to accept both
      if (strategy && strategy.trim() !== '' && strategy !== 'all') {
        params.append('strategy', strategy);
      }
      
      const response = await fetch(`/api/bets/summary?${params}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.detail || errorData.error || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(`Week Review API error: ${errorMessage}`);
      }
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || result.detail || 'API returned unsuccessful response');
      }
      
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Week Review fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [season, week, strategy, page]);

  // Default to Hybrid V2 when no URL strategy; validate explicit URL against available tags
  useEffect(() => {
    if (!data?.meta?.strategyTagsAvailable || data.meta.strategyTagsAvailable.length === 0) {
      return;
    }

    const available = data.meta.strategyTagsAvailable;

    if (defaultStrategySet.current) {
      const requested = strategy === '' ? 'all' : strategy;
      const resolved = resolveReviewStrategyAfterAvailability(requested, season, available);
      if (resolved !== requested) {
        setStrategy(reviewStrategyToWeekReviewState(resolved));
      }
      return;
    }

    const defaultTag = getDefaultReviewStrategyTag(season, available);
    setStrategy(reviewStrategyToWeekReviewState(defaultTag));
    defaultStrategySet.current = true;
  }, [data?.meta?.strategyTagsAvailable, strategy, season]);

  // Pagination: whenever we change the underlying review scope, go back to page 1.
  useEffect(() => {
    setPage(1);
  }, [season, week, strategy]);

  const exportCSV = () => {
    const params = new URLSearchParams({
      season: season.toString(),
      source: 'strategy_run',
      ...(week && { week: week.toString() }),
      ...(strategy && { strategy }),
    });
    
    const url = `/api/bets/export?${params}`;
    window.open(url, '_blank');
  };

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  const formatPercent = (value: number) => 
    `${(value * 100).toFixed(1)}%`;

  // Use the centralized strategy label helper
  const formatStrategyName = getStrategyLabel;

  const getCLVColor = (clv: number | null) => {
    if (clv === null) return 'bg-gray-100 text-gray-600';
    return clv > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  const getEdgeColor = (edge: number | null) => {
    if (edge === null) return 'bg-gray-100 text-gray-600';
    return edge > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  const calculateEdge = (bet: any) => {
    // Edge (pts) for historical/non-official strategies is derived from model-close.
    // For 2026 official_flat_100, we show persisted note metadata instead.
    const isOfficial =
      season >= 2026 &&
      bet.strategyTag === 'official_flat_100' &&
      bet.source === 'strategy_run';
    if (isOfficial) return null;
    if (bet.marketType === 'moneyline') return null;
    if (bet.closePrice === null || bet.closePrice === undefined) return null;
    const modelLine = Number(bet.modelPrice);
    const closeLine = Number(bet.closePrice);
    return modelLine - closeLine;
  };

  const formatOfficialLockedLinePrice = (bet: any): string => {
    if (bet.closePrice === null || bet.closePrice === undefined) return '-';
    const close = Number(bet.closePrice);
    if (bet.marketType === 'spread') return formatSignedSpread(close);
    if (bet.marketType === 'moneyline') return formatAmericanOdds(close);
    if (bet.marketType === 'total') return formatLineNumber(close);
    return String(close);
  };

  const getOfficialPersistedEdgeNumeric = (bet: any): number | null => {
    const meta = parseOfficialCardNotes(bet.notes);
    if (!meta.metadataAvailable) return null;
    if (bet.marketType === 'spread') return meta.edgePts;
    if (bet.marketType === 'total') return meta.ouEdgePts;
    if (bet.marketType === 'moneyline') return meta.valuePercent;
    return null;
  };

  const getResultColor = (result: string | null) => {
    switch (result) {
      case 'win': return 'text-green-600';
      case 'loss': return 'text-red-600';
      case 'push': return 'text-yellow-600';
      default: return 'text-gray-500';
    }
  };

  const getResultIcon = (result: string | null) => {
    switch (result) {
      case 'win': return '✅';
      case 'loss': return '❌';
      case 'push': return '🤝';
      default: return '⏳';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Week Review</h1>
        <p className="text-gray-600 mb-4">
          Week Review looks back at strategy-run picks for this week — how they performed vs the closing line and the final score. Use the Strategy filter to slice by ruleset or strategy tag.
        </p>
        <p className="text-sm text-gray-500 mb-4">
          Reviews read persisted wager + grading fields from the locked bet record (result, PnL, and CLV are not recomputed from today's market).
          <a href="/docs/selections-profitability" className="text-blue-600 hover:underline ml-1">
            Learn more about grading
          </a>
        </p>
        
        {/* Controls */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-1">Season</label>
            <select 
              value={season} 
              onChange={(e) => {
                const nextSeason = parseInt(e.target.value, 10);
                const preferred = getPreferredReviewStrategyTagForSeason(nextSeason);
                setData(null);
                setPage(1);
                setStrategy(reviewStrategyToWeekReviewState(preferred));
                defaultStrategySet.current = true;
                setSeason(nextSeason);
              }}
              className="border rounded px-3 py-2"
            >
              <option value={2024}>2024</option>
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Week</label>
            <select 
              value={week} 
              onChange={(e) => {
                const nextWeek = parseInt(e.target.value, 10);
                const preferred = getPreferredReviewStrategyTagForSeason(season);
                setData(null);
                setPage(1);
                setStrategy(reviewStrategyToWeekReviewState(preferred));
                defaultStrategySet.current = true;
                setWeek(nextWeek);
              }}
              className="border rounded px-3 py-2"
            >
              {Array.from({ length: 16 }, (_, i) => i + 1).map(w => (
                <option key={w} value={w}>Week {w}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Strategy</label>
            <select 
              value={strategy || ''} 
              onChange={(e) => {
                const val = e.target.value;
                defaultStrategySet.current = true;
                // Normalize empty string and "all" to empty for API
                setStrategy(val === 'all' || val === '' ? '' : val);
              }}
              className="border rounded px-3 py-2"
            >
              <option value="">{getStrategyLabel('all')}</option>
              {data?.meta?.strategyTagsAvailable && data.meta.strategyTagsAvailable.length > 0 ? (
                data.meta.strategyTagsAvailable.map((tag) => (
                  <option key={tag} value={tag}>
                    {getStrategyLabel(tag)}
                  </option>
                ))
              ) : (
                <option disabled>No strategies available for this week</option>
              )}
            </select>
          </div>
          
          <div className="flex items-end gap-2">
            <button 
              onClick={fetchData}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            Error: {error}
          </div>
        )}
      </div>

      {data && (
        <>
          {/* Week Summary v1 - Official Trust-Market Picks */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4">Week Summary</h2>
            
            {/* Info banner for demo/test bets present */}
            {data.meta && data.meta.demoTagsPresent.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-amber-800">
                      Demo/test strategies present
                    </h3>
                    <div className="mt-2 text-sm text-amber-700">
                      <p>
                        This week includes bets from demo/test strategies (tags: {data.meta.demoTagsPresent.join(', ')}). 
                        Stats include these bets — mainly useful for dev/testing.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {/* ATS Card */}
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">ATS – Strategy-run picks</h3>
                {(() => {
                  const spread = data.byMarketType?.spread;
                  if (!spread || spread.totalBets === 0) {
                    return (
                      <div className="text-sm text-gray-500">
                        No ATS picks this week.
                      </div>
                    );
                  }
                  
                  return (
                    <>
                      <div className="text-3xl font-bold text-gray-900 mb-2">
                        {spread.wins}-{spread.losses}
                        {spread.pushes > 0 ? `-${spread.pushes}` : ''}
                      </div>
                      <div className="text-sm text-gray-600 mb-2">
                        {spread.totalBets} {spread.totalBets === 1 ? 'play' : 'plays'} · {spread.gradedBets} graded · {spread.pendingBets} pending
                      </div>
                      <div
                        className={`text-sm font-medium ${spread.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {spread.pnl > 0 ? '+' : ''}
                        {formatCurrency(spread.pnl)}
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        Counts all strategy-run ATS picks for this week.
                      </div>
                    </>
                  );
                })()}
              </div>
              
              {/* Moneyline Card */}
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Moneyline – Strategy-run picks</h3>
                {(() => {
                  const moneyline = data.byMarketType?.moneyline;
                  if (!moneyline || moneyline.totalBets === 0) {
                    return (
                      <div className="text-sm text-gray-500">
                        No moneyline picks this week.
                      </div>
                    );
                  }
                  
                  return (
                    <>
                      <div className="text-3xl font-bold text-gray-900 mb-2">
                        {moneyline.wins}-{moneyline.losses}
                        {moneyline.pushes > 0 ? `-${moneyline.pushes}` : ''}
                      </div>
                      <div className="text-sm text-gray-600 mb-2">
                        {moneyline.totalBets} {moneyline.totalBets === 1 ? 'play' : 'plays'} · {moneyline.gradedBets} graded · {moneyline.pendingBets} pending
                      </div>
                      <div
                        className={`text-sm font-medium ${moneyline.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {moneyline.pnl > 0 ? '+' : ''}
                        {formatCurrency(moneyline.pnl)}
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        Counts all strategy-run moneyline picks for this week.
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Total Bets</h3>
              <p className="text-3xl font-bold text-blue-600">{data.summary.totalBets}</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Hit Rate</h3>
              <p className="text-3xl font-bold text-green-600">
                {formatPercent(data.summary.hitRate)}
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">ROI</h3>
              <p className={`text-3xl font-bold ${data.summary.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatPercent(data.summary.roi)}
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Total PnL</h3>
              <p className={`text-3xl font-bold ${data.summary.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(data.summary.totalPnL)}
              </p>
            </div>
          </div>

          {/* Additional Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Avg Edge</h3>
              <p className="text-2xl font-bold text-blue-600">
                {data.summary.avgEdge === null ? 'N/A' : data.summary.avgEdge.toFixed(2)}
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Avg CLV</h3>
              <p className="text-2xl font-bold text-purple-600">
                {data.summary.avgCLV.toFixed(3)}
              </p>
            </div>
          </div>

          {/* Conflict Breakdown Panel (Labs) */}
          {data.meta?.conflictBreakdown && 
           Object.keys(data.meta.conflictBreakdown).length > 0 &&
           (strategy === 'hybrid_v2' || strategy === 'fade_v4_labs' || strategy === '') && (
            <div className="bg-white p-6 rounded-lg shadow mb-8 border-l-4 border-blue-500">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                Performance by Hybrid Conflict Type (Labs)
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Conflict types are Labs-only diagnostics comparing Hybrid V2 vs V4 (Labs). They do not change which bets are shown, only how we slice performance.
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Conflict Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Bets
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Win%
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ROI
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        PnL
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(data.meta.conflictBreakdown)
                      .sort(([a], [b]) => {
                        // Sort: hybrid_strong, hybrid_weak, hybrid_only
                        const order: Record<string, number> = {
                          hybrid_strong: 0,
                          hybrid_weak: 1,
                          hybrid_only: 2,
                        };
                        return (order[a] ?? 999) - (order[b] ?? 999);
                      })
                      .map(([type, stats]) => {
                        const rowBg = type === 'hybrid_strong' && stats.roi > 0
                          ? 'bg-green-50'
                          : type === 'hybrid_weak' && stats.roi < 0
                          ? 'bg-red-50'
                          : '';
                        return (
                          <tr key={type} className={rowBg}>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                              {type === 'hybrid_strong' ? 'Hybrid Strong (disagree)' :
                               type === 'hybrid_weak' ? 'Hybrid Weak (agree)' :
                               'Hybrid Only'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                              {stats.bets}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                              {stats.winRate.toFixed(1)}%
                            </td>
                            <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${
                              stats.roi >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {stats.roi >= 0 ? '+' : ''}{stats.roi.toFixed(2)}%
                            </td>
                            <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${
                              stats.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {stats.pnl >= 0 ? '+' : ''}{formatCurrency(stats.pnl)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Bets ({data.pagination.totalItems})</h2>
            <button
              onClick={exportCSV}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Export CSV
            </button>
          </div>

          {/* Bets Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {data.bets.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="text-gray-400 text-5xl mb-4">📊</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {data.summary.gradedBets === 0 ? 'No graded bets yet' : 'No bets found'}
                </h3>
                <p className="text-gray-600 mb-4">
                  {(() => {
                    // Case A: No strategy-run bets at all
                    if (data.meta && data.meta.totalStrategyRunBets === 0) {
                      return `No strategy-run bets found for ${season} Week ${week}${strategy ? ` with strategy "${strategy}"` : ''}. Your strategies haven't generated any picks yet.`;
                    }
                    // Case B: Strategy-run bets exist but not graded yet
                    if (data.summary.gradedBets === 0 && data.summary.totalBets > 0) {
                      return `No graded bets yet for ${season} Week ${week}${strategy ? ` with strategy "${strategy}"` : ''}. Bets may still be pending grading.`;
                    }
                    return `No strategy-run bets found for ${season} Week ${week}${strategy ? ` with strategy "${strategy}"` : ''}. Try adjusting your selection.`;
                  })()}
                </p>
                <div className="space-y-2 mb-6">
                  <p className="text-sm text-gray-500">
                    <a href="/docs/selections-profitability" className="text-blue-600 hover:underline">
                      How grading works
                    </a>
                  </p>
                  <p className="text-sm text-gray-500">
                    <a href="/strategies" className="text-blue-600 hover:underline">
                      View strategies
                    </a>
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Matchup
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Market
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Side
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Model Price
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Locked Line / Price
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        CLV
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Edge (pts) / Value (%)
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Result
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Stake
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        PnL
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Strategy
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.bets.map((bet) => (
                      <tr 
                        key={bet.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => router.push(`/game/${bet.gameId}?asOf=close`)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {bet.game.awayTeam.name} @ {bet.game.homeTeam.name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {new Date(bet.game.date).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {bet.marketType}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {bet.side}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {bet.modelPrice}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {season >= 2026 &&
                          bet.strategyTag === 'official_flat_100' &&
                          bet.source === 'strategy_run'
                            ? formatOfficialLockedLinePrice(bet)
                            : bet.closePrice === null || bet.closePrice === undefined
                              ? '-'
                              : bet.closePrice}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {bet.clv !== null && bet.clv !== undefined ? (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCLVColor(bet.clv)}`}>
                              {bet.clv > 0 ? '+' : ''}{bet.clv.toFixed(3)}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {(() => {
                            const isOfficial =
                              season >= 2026 &&
                              bet.strategyTag === 'official_flat_100' &&
                              bet.source === 'strategy_run';

                            if (isOfficial) {
                              const edgeNumeric = getOfficialPersistedEdgeNumeric(bet);
                              if (edgeNumeric === null) {
                                return (
                                  <span
                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getEdgeColor(null)}`}
                                  >
                                    N/A
                                  </span>
                                );
                              }

                              const sign = edgeNumeric > 0 ? '+' : '';
                              if (bet.marketType === 'moneyline') {
                                return (
                                  <span
                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getEdgeColor(edgeNumeric)}`}
                                  >
                                    {sign}
                                    {edgeNumeric.toFixed(1)}%
                                  </span>
                                );
                              }

                              // spread/total -> points
                              return (
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getEdgeColor(edgeNumeric)}`}
                                >
                                  {sign}
                                  {edgeNumeric.toFixed(1)} pts
                                </span>
                              );
                            }

                            const edge = calculateEdge(bet);
                            if (edge === null) return '-';
                            return (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getEdgeColor(edge)}`}>
                                {edge > 0 ? '+' : ''}
                                {edge.toFixed(1)}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center text-sm font-medium ${getResultColor(bet.result)}`}>
                            {getResultIcon(bet.result)} {bet.result || 'Pending'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(bet.stake)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {bet.pnl !== null && bet.pnl !== undefined ? (
                            <span className={bet.pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {formatCurrency(bet.pnl)}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatStrategyName(bet.strategyTag)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <div className="mt-6 flex justify-center">
              <div className="flex space-x-2">
                {Array.from({ length: data.pagination.totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => {
                      setPage(page);
                    }}
                    className={`px-3 py-2 rounded ${
                      page === data.pagination.currentPage 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
