/**
 * Season Review Page
 * 
 * Expected URL: /season-review
 * 
 * Displays season-wide performance summary for strategy-run bets.
 * Includes summary cards, cumulative PnL chart, per-week breakdown, and market type breakdown.
 * Clicking a week row navigates to Week Review for that week.
 */
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getStrategyLabel, getDefaultStrategyTag } from '@/lib/strategy-utils';

interface WeekBreakdown {
  week: number;
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  stake: number;
  pnl: number;
  roi: number;
}

interface MarketTypeBreakdown {
  marketType: string;
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  stake: number;
  pnl: number;
  roi: number;
}

interface SeasonSummaryData {
  summary: {
    totalBets: number;
    wins: number;
    losses: number;
    pushes: number;
    totalStake: number;
    totalPnl: number;
    roi: number;
    winRate: number;
    avgEdge: number | null;
  };
  byWeek: WeekBreakdown[];
  byMarketType: MarketTypeBreakdown[];
  meta: {
    seasonsAvailable: number[];
    strategyTagsAvailable: string[];
    pendingBets: number;
  };
}

export default function SeasonReviewPage() {
  const router = useRouter();
  const [season, setSeason] = useState<number>(2025);
  const [strategyTag, setStrategyTag] = useState<string>('official_flat_100');
  const [selectedMarket, setSelectedMarket] = useState<string>('ALL');
  const [data, setData] = useState<SeasonSummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Version banner for deployment verification
  // Shows build timestamp to verify new deployments
  const buildTime = typeof window !== 'undefined' 
    ? new Date().toISOString().split('T')[0]
    : 'server';

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        season: season.toString(),
        strategyTag: strategyTag === 'all' ? 'all' : strategyTag,
        marketType: selectedMarket,
      });

      const response = await fetch(`/api/bets/season-summary?${params}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.detail || errorData.error || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(`Season Summary API error: ${errorMessage}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Season Review fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [season, strategyTag, selectedMarket]);

  // Initialize season and strategy from available data on first load
  useEffect(() => {
    if (data?.meta.seasonsAvailable && data.meta.seasonsAvailable.length > 0) {
      // Default to latest season (last in array since sorted ascending)
      const latestSeason = data.meta.seasonsAvailable[data.meta.seasonsAvailable.length - 1];
      if (!data.meta.seasonsAvailable.includes(season)) {
        setSeason(latestSeason);
      }
    }
    
    // Set default strategy to official_flat_100 if available, otherwise 'all'
    if (data?.meta.strategyTagsAvailable && data.meta.strategyTagsAvailable.length > 0) {
      const defaultTag = getDefaultStrategyTag(data.meta.strategyTagsAvailable);
      if (strategyTag === 'official_flat_100' && !data.meta.strategyTagsAvailable.includes('official_flat_100')) {
        setStrategyTag(defaultTag);
      } else if (strategyTag === 'all' && data.meta.strategyTagsAvailable.includes('official_flat_100')) {
        setStrategyTag('official_flat_100');
      }
    }
  }, [data?.meta.seasonsAvailable, data?.meta.strategyTagsAvailable]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  // Use the centralized strategy label helper
  const formatStrategyName = getStrategyLabel;

  const handleWeekClick = (week: number) => {
    // Week Review uses 'strategy' param, not 'strategyTag'
    // For 'official_flat_100', we pass it directly; for 'all', we omit it
    const strategyParam = strategyTag === 'all' ? '' : strategyTag;
    const url = `/weeks/review?season=${season}&week=${week}${strategyParam ? `&strategy=${strategyParam}` : ''}`;
    router.push(url);
  };

  // Calculate cumulative PnL for chart
  const chartData = data?.byWeek.map((week, index) => {
    const cumulativePnl = data.byWeek
      .slice(0, index + 1)
      .reduce((sum, w) => sum + w.pnl, 0);
    return {
      week: week.week,
      pnl: week.pnl,
      cumulativePnl,
    };
  }) || [];

  const winRate = data?.summary.winRate ? data.summary.winRate * 100 : 0;

  const weeksWithBets = data?.byWeek.filter(w => w.bets > 0).length || 0;
  const avgStake = data?.summary.totalBets
    ? data.summary.totalStake / data.summary.totalBets
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <p className="text-xs text-gray-400 mb-2">
              Season Review v1.0
            </p>
            <h1 className="text-3xl font-bold mb-2">Season Review</h1>
            <p className="text-gray-600 mb-4">
              Season-wide performance summary for strategy-run bets. View cumulative PnL, per-week breakdowns, and performance by market type.
            </p>

            {/* Controls */}
            <div className="flex flex-wrap gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-1">Season</label>
                <select
                  value={season}
                  onChange={(e) => setSeason(parseInt(e.target.value))}
                  className="border rounded px-3 py-2"
                >
                  {data?.meta.seasonsAvailable.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  )) || (
                    <>
                      <option value={2024}>2024</option>
                      <option value={2025}>2025</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Strategy</label>
                <select
                  value={strategyTag}
                  onChange={(e) => setStrategyTag(e.target.value)}
                  className="border rounded px-3 py-2"
                >
                  <option value="all">{getStrategyLabel('all')}</option>
                  {data?.meta.strategyTagsAvailable.map((tag) => (
                    <option key={tag} value={tag}>
                      {getStrategyLabel(tag)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Market Type</label>
                <select
                  value={selectedMarket}
                  onChange={(e) => setSelectedMarket(e.target.value)}
                  className="border rounded px-3 py-2"
                >
                  <option value="ALL">All Markets</option>
                  <option value="ATS">Spread (ATS)</option>
                  <option value="TOTAL">Total (O/U)</option>
                  <option value="MONEYLINE">Moneyline</option>
                </select>
              </div>
            </div>
          </div>

          {loading && (
            <div className="text-center py-12">
              <p className="text-gray-500">Loading season summary...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-4 mb-6">
              <p className="text-red-800">Error: {error}</p>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {/* Card 1: Season PnL */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Season PnL</h3>
                  <p className={`text-3xl font-bold ${
                    data.summary.totalPnl > 0 ? 'text-green-600' : 
                    data.summary.totalPnl < 0 ? 'text-red-600' : 
                    'text-gray-500'
                  }`}>
                    {formatCurrency(data.summary.totalPnl)}
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    From {data.summary.totalBets} bets at {formatCurrency(avgStake)} each
                  </p>
                </div>

                {/* Card 2: ROI */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">ROI</h3>
                  <p className={`text-3xl font-bold ${
                    data.summary.roi > 0 ? 'text-green-600' : 
                    data.summary.roi < 0 ? 'text-red-600' : 
                    'text-gray-500'
                  }`}>
                    {formatPercent(data.summary.roi)}
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    Total stake {formatCurrency(data.summary.totalStake)}, profit {formatCurrency(data.summary.totalPnl)}
                  </p>
                </div>

                {/* Card 3: Record */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Record</h3>
                  <p className="text-3xl font-bold text-gray-900">
                    {data.summary.wins}-{data.summary.losses}-{data.summary.pushes}
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    Win rate: {winRate.toFixed(1)}%
                  </p>
                </div>

                {/* Card 4: Weeks with Action */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Weeks</h3>
                  <p className="text-3xl font-bold text-gray-900">{weeksWithBets}</p>
                  <p className="text-sm text-gray-600 mt-2">
                    Season weeks with at least 1 graded bet
                  </p>
                </div>
              </div>

              {/* Cumulative PnL Chart */}
              {chartData.length > 0 ? (
                <div className="bg-white rounded-lg shadow p-6 mb-8">
                  <h2 className="text-xl font-semibold mb-4">Cumulative PnL by Week</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="week" label={{ value: 'Week', position: 'insideBottom', offset: -5 }} />
                      <YAxis label={{ value: 'Cumulative PnL ($)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(label) => `Week ${label}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="cumulativePnl"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow p-6 mb-8">
                  <p className="text-gray-500 text-center py-8">
                    No graded bets available for this season/strategy combination.
                  </p>
                </div>
              )}

              {/* Per-Week Breakdown Table */}
              {data.byWeek.length > 0 ? (
                <div className="bg-white rounded-lg shadow mb-8">
                  <div className="p-6 border-b">
                    <h2 className="text-xl font-semibold">Per-Week Breakdown</h2>
                    <p className="text-sm text-gray-600 mt-1">Click a row to view Week Review for that week</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Week
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Bets
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            W
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            L
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            P
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Stake
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            PnL
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            ROI
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {data.byWeek.map((week) => (
                          <tr
                            key={week.week}
                            onClick={() => handleWeekClick(week.week)}
                            className="hover:bg-blue-50 cursor-pointer transition-colors"
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {week.week}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {week.bets}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                              {week.wins}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">
                              {week.losses}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-600 font-medium">
                              {week.pushes}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatCurrency(week.stake)}
                            </td>
                            <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                              week.pnl > 0 ? 'text-green-600' : 
                              week.pnl < 0 ? 'text-red-600' : 
                              'text-gray-500'
                            }`}>
                              {formatCurrency(week.pnl)}
                            </td>
                            <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                              week.roi > 0 ? 'text-green-600' : 
                              week.roi < 0 ? 'text-red-600' : 
                              'text-gray-500'
                            }`}>
                              {formatPercent(week.roi)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow p-6 mb-8">
                  <p className="text-gray-500 text-center py-8">
                    No weekly breakdown available.
                  </p>
                </div>
              )}

              {/* By Market Type Breakdown - Only show when viewing all markets */}
              {selectedMarket === 'ALL' && data.byMarketType.length > 0 && (
                <div className="bg-white rounded-lg shadow mb-8">
                  <div className="p-6 border-b">
                    <h2 className="text-xl font-semibold">Breakdown by Market Type</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Market Type
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Bets
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            W-L-P
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Stake
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            PnL
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            ROI
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {data.byMarketType.map((market) => (
                          <tr key={market.marketType}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {market.marketType.toUpperCase()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {market.bets}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <span className="text-green-600 font-medium">{market.wins}</span>-
                              <span className="text-red-600 font-medium">{market.losses}</span>-
                              <span className="text-yellow-600 font-medium">{market.pushes}</span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatCurrency(market.stake)}
                            </td>
                            <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                              market.pnl > 0 ? 'text-green-600' : 
                              market.pnl < 0 ? 'text-red-600' : 
                              'text-gray-500'
                            }`}>
                              {formatCurrency(market.pnl)}
                            </td>
                            <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                              market.roi > 0 ? 'text-green-600' : 
                              market.roi < 0 ? 'text-red-600' : 
                              'text-gray-500'
                            }`}>
                              {formatPercent(market.roi)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Meta Info */}
              {data.meta.pendingBets > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                  <p className="text-sm text-yellow-800">
                    ⚠️ {data.meta.pendingBets} pending bet(s) not included in summary (awaiting grading).
                  </p>
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

