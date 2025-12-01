/**
 * Labs: Hybrid Model Dashboard
 * 
 * Displays V1, V2, and Hybrid spread predictions side-by-side for comparison.
 * Highlights games where Hybrid differs significantly from V1 (> 3 points).
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import { TeamLogo } from '@/components/TeamLogo';
import { ErrorState } from '@/components/ErrorState';
import { downloadAsCsv } from '@/lib/csv-export';

interface SpreadInfo {
  hma: number;
  favoriteSpread: number;
  favoriteTeamId: string | null;
  favoriteName: string | null;
}

interface HybridGame {
  gameId: string;
  date: string;
  kickoffLocal: string;
  status: 'final' | 'scheduled' | 'in_progress';
  awayTeamId: string;
  awayTeamName: string;
  homeTeamId: string;
  homeTeamName: string;
  awayScore: number | null;
  homeScore: number | null;
  neutralSite: boolean;
  v1Spread: SpreadInfo;
  v2Spread: SpreadInfo;
  hybridSpread: SpreadInfo;
  diff: number; // Hybrid - V1 (in favorite-centric terms)
  marketSpread: {
    value: number | null;
    favoriteTeamId: string | null;
  } | null;
}

interface V4OverlaySummary {
  season: number;
  strategy: string;
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number | null;
  totalStake: number;
  pnl: number;
  roi: number;
  tierABets: number;
  tierARoi: number | null;
}

export default function HybridLabsPage() {
  const [games, setGames] = useState<HybridGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [hideNoOdds, setHideNoOdds] = useState(false);
  const [v4Summary, setV4Summary] = useState<V4OverlaySummary[]>([]);
  const [v4SummaryLoading, setV4SummaryLoading] = useState(true);

  useEffect(() => {
    fetchHybridSlate();
    fetchV4OverlaySummary();
  }, []);

  const fetchHybridSlate = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // First, get current week from weeks API
      const weeksResponse = await fetch('/api/weeks');
      if (!weeksResponse.ok) {
        throw new Error(`Failed to fetch current week: ${weeksResponse.statusText}`);
      }
      const weeksData = await weeksResponse.json();
      if (!weeksData.success) {
        throw new Error(weeksData.error || 'Failed to get current week');
      }
      const currentWeek = weeksData.week || 13;
      const currentSeason = weeksData.season || 2025;
      
      setSeason(currentSeason);
      setWeek(currentWeek);
      
      // Fetch hybrid slate
      const response = await fetch(`/api/labs/hybrid-slate?season=${currentSeason}&week=${currentWeek}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch hybrid slate: ${response.statusText}`);
      }
      
      const data = await response.json();
      setGames(data.games || []);
    } catch (err) {
      setError('Network error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const fetchV4OverlaySummary = async () => {
    try {
      setV4SummaryLoading(true);
      const response = await fetch('/api/labs/v4-overlay-summary');
      if (!response.ok) {
        console.warn('Failed to fetch V4 overlay summary:', response.statusText);
        return;
      }
      const data = await response.json();
      if (data.success && data.summaries) {
        setV4Summary(data.summaries);
      }
    } catch (err) {
      console.warn('Error fetching V4 overlay summary:', err);
    } finally {
      setV4SummaryLoading(false);
    }
  };

  const formatKickoff = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Chicago'
    });
  };

  const formatSpread = (spread: number) => {
    if (spread === 0) return 'PK';
    return spread > 0 ? `+${spread.toFixed(1)}` : spread.toFixed(1);
  };

  const getDiffColor = (diff: number) => {
    const absDiff = Math.abs(diff);
    if (absDiff >= 3.0) return 'bg-red-50 border-red-200';
    if (absDiff >= 1.5) return 'bg-yellow-50 border-yellow-200';
    return '';
  };

  const getDiffBadge = (diff: number) => {
    const absDiff = Math.abs(diff);
    if (absDiff >= 3.0) return 'bg-red-100 text-red-800';
    if (absDiff >= 1.5) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  const calculateHybridPick = (game: HybridGame) => {
    if (!game.marketSpread || game.marketSpread.value === null) {
      return null;
    }

    // Hybrid margin: Home Minus Away (positive = home wins)
    const hybridMargin = game.hybridSpread.hma;

    // Market spread is favorite-centric (negative for favorite)
    // Convert to market margin (Home Minus Away)
    const marketValue = game.marketSpread.value;
    const marketFavoriteTeamId = game.marketSpread.favoriteTeamId;
    
    let marketMargin: number;
    if (marketFavoriteTeamId === game.homeTeamId) {
      // Home is favorite: value is negative (e.g., -7 means home -7)
      // Market expects home to win by |value|, so margin = -value
      marketMargin = -marketValue;
    } else if (marketFavoriteTeamId === game.awayTeamId) {
      // Away is favorite: value is negative (e.g., -7 means away -7)
      // Market expects away to win by |value|, so home margin = value (negative)
      marketMargin = marketValue;
    } else {
      // Fallback: assume value is already in HMA format
      marketMargin = marketValue;
    }

    // Calculate edge: positive = home has value, negative = away has value
    const edge = hybridMargin - marketMargin;

    // Determine pick side
    const pickHome = edge > 0;
    const pickTeamId = pickHome ? game.homeTeamId : game.awayTeamId;
    const pickTeamName = pickHome ? game.homeTeamName : game.awayTeamName;
    const absEdge = Math.abs(edge);

    return {
      teamId: pickTeamId,
      teamName: pickTeamName,
      marketSpread: marketValue,
      marketFavoriteTeamId,
      edge: absEdge,
      edgeRaw: edge,
    };
  };

  const getEdgeBadgeColor = (edge: number) => {
    if (edge >= 3.0) return 'bg-green-100 text-green-800';
    if (edge >= 1.5) return 'bg-yellow-100 text-yellow-800';
    if (edge >= 0.5) return 'bg-blue-100 text-blue-800';
    return 'bg-gray-100 text-gray-800';
  };

  const handleExportCsv = () => {
    // Get visible games (respecting the filter)
    const visibleGames = games.filter(game => {
      if (hideNoOdds) {
        return game.marketSpread !== null && game.marketSpread !== undefined && game.marketSpread.value !== null;
      }
      return true;
    });

    const csvRows = visibleGames.map(game => {
      const pick = calculateHybridPick(game);
      
      return {
        Away_Team: game.awayTeamName,
        Home_Team: game.homeTeamName,
        Kickoff: formatKickoff(game.date),
        V1_Spread: `${game.v1Spread.favoriteName} ${formatSpread(game.v1Spread.favoriteSpread)}`,
        V2_Spread: `${game.v2Spread.favoriteName} ${formatSpread(game.v2Spread.favoriteSpread)}`,
        Hybrid_Spread: `${game.hybridSpread.favoriteName} ${formatSpread(game.hybridSpread.favoriteSpread)}`,
        Diff_Hybrid_V1: game.diff > 0 ? `+${game.diff.toFixed(1)}` : game.diff.toFixed(1),
        Market_Line: game.marketSpread && game.marketSpread.value !== null
          ? formatSpread(game.marketSpread.value)
          : '—',
        Hybrid_Pick: pick ? pick.teamName : '—',
        Pick_Line: pick ? formatSpread(pick.marketSpread) : '—',
        Edge: pick ? pick.edge.toFixed(1) : '—',
      };
    });

    const filename = `hybrid-analysis-week-${week || 'unknown'}`;
    downloadAsCsv(filename, csvRows);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <HeaderNav />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading hybrid model data...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <HeaderNav />
        <div className="container mx-auto px-4 py-8">
          <ErrorState message={error} onRetry={fetchHybridSlate} />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <HeaderNav />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🔬 Labs: Hybrid Model Dashboard
          </h1>
          <p className="text-gray-600 mb-4">
            Comparing V1 (Composite), V2 (Matchup), and Hybrid (70% V1 + 30% V2) spread predictions
            {season && week && ` - ${season} Week ${week}`}
          </p>

          {/* V4 Overlay Summary Card */}
          {!v4SummaryLoading && v4Summary.length > 0 && (
            <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-yellow-900 mb-3">
                📊 V4 (Labs) vs Fade V4 — Backtest Snapshot
              </h3>
              <div className="space-y-3">
                {[2024, 2025].map((s) => {
                  const seasonData = v4Summary.filter(sum => sum.season === s);
                  if (seasonData.length === 0) return null;
                  
                  const v4Data = seasonData.find(sum => sum.strategy === 'v4_labs');
                  const fadeData = seasonData.find(sum => sum.strategy === 'fade_v4_labs');
                  
                  return (
                    <div key={s} className="bg-white rounded p-3 border border-yellow-200">
                      <div className="text-xs font-semibold text-yellow-800 mb-2">{s} Season</div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="font-medium text-gray-700 mb-1">V4 (Labs)</div>
                          <div className="space-y-0.5 text-gray-600">
                            <div>Bets: {v4Data?.bets ?? '—'}</div>
                            <div>Win Rate: {v4Data && v4Data.winRate !== null && v4Data.winRate !== undefined ? `${v4Data.winRate.toFixed(1)}%` : '—'}</div>
                            <div className={v4Data?.roi !== undefined && v4Data.roi < 0 ? 'text-red-600 font-medium' : 'text-gray-600'}>
                              ROI: {v4Data?.roi !== undefined ? `${v4Data.roi.toFixed(2)}%` : '—'}
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="font-medium text-gray-700 mb-1">Fade V4 (Labs)</div>
                          <div className="space-y-0.5 text-gray-600">
                            <div>Bets: {fadeData?.bets ?? '—'}</div>
                            <div>Win Rate: {fadeData && fadeData.winRate !== null && fadeData.winRate !== undefined ? `${fadeData.winRate.toFixed(1)}%` : '—'}</div>
                            <div className={fadeData?.roi !== undefined && fadeData.roi > 0 ? 'text-green-600 font-medium' : 'text-gray-600'}>
                              ROI: {fadeData?.roi !== undefined ? `${fadeData.roi.toFixed(2)}%` : '—'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-yellow-700 mt-3 italic">
                V4 and Fade V4 are Labs-only strategies based on backtested data. Hybrid V2 remains the only production spread model used for My Picks.
              </p>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="hideNoOdds"
                checked={hideNoOdds}
                onChange={(e) => setHideNoOdds(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="hideNoOdds" className="text-sm font-medium text-gray-700 select-none cursor-pointer">
                Hide games without market odds
              </label>
            </div>
            {games.length > 0 && (
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export CSV
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Matchup
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    V1 (Composite)
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    V2 (Matchup)
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hybrid (70/30)
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Diff (Hybrid - V1)
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hybrid Pick
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Market
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(() => {
                  const visibleGames = games.filter(game => {
                    if (hideNoOdds) {
                      return game.marketSpread !== null && game.marketSpread !== undefined && game.marketSpread.value !== null;
                    }
                    return true;
                  });

                  if (visibleGames.length === 0) {
                    return (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                          {games.length === 0
                            ? 'No games found for this week.'
                            : hideNoOdds
                            ? 'No games with market odds found.'
                            : 'No games found for this week.'}
                        </td>
                      </tr>
                    );
                  }

                  return visibleGames.map((game) => {
                    const rowClass = getDiffColor(game.diff);
                    return (
                      <tr key={game.gameId} className={rowClass}>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <div className="flex items-center space-x-1">
                              <TeamLogo
                                teamId={game.awayTeamId}
                                teamName={game.awayTeamName}
                                size="sm"
                              />
                              <span className="font-medium text-gray-900">
                                {game.awayTeamName}
                              </span>
                            </div>
                            <span className="text-gray-400">@</span>
                            <div className="flex items-center space-x-1">
                              <TeamLogo
                                teamId={game.homeTeamId}
                                teamName={game.homeTeamName}
                                size="sm"
                              />
                              <span className="font-medium text-gray-900">
                                {game.homeTeamName}
                              </span>
                            </div>
                            {game.neutralSite && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                N
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {formatKickoff(game.date)}
                          </div>
                          {game.status === 'final' && (
                            <div className="text-xs font-semibold text-gray-700 mt-1">
                              {game.awayScore} - {game.homeScore}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          <div className="text-sm font-medium text-gray-900">
                            {game.v1Spread.favoriteName}
                          </div>
                          <div className="text-sm text-gray-600">
                            {formatSpread(game.v1Spread.favoriteSpread)}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          <div className="text-sm font-medium text-gray-900">
                            {game.v2Spread.favoriteName}
                          </div>
                          <div className="text-sm text-gray-600">
                            {formatSpread(game.v2Spread.favoriteSpread)}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          <div className="text-sm font-semibold text-blue-900">
                            {game.hybridSpread.favoriteName}
                          </div>
                          <div className="text-sm font-semibold text-blue-600">
                            {formatSpread(game.hybridSpread.favoriteSpread)}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getDiffBadge(game.diff)}`}>
                            {game.diff > 0 ? '+' : ''}{game.diff.toFixed(1)}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          {(() => {
                            const pick = calculateHybridPick(game);
                            if (!pick) {
                              return <span className="text-xs text-gray-400">—</span>;
                            }
                            return (
                              <div className="space-y-1">
                                <div className="text-sm font-medium text-gray-900">
                                  {pick.teamName}
                                </div>
                                <div className="text-sm text-gray-600">
                                  {formatSpread(pick.marketSpread)}
                                </div>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getEdgeBadgeColor(pick.edge)}`}>
                                  Edge: {pick.edge.toFixed(1)}
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          {game.marketSpread && game.marketSpread.value !== null ? (
                            <div className="text-sm text-gray-600">
                              {formatSpread(game.marketSpread.value)}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">📊 Model Details</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li><strong>V1 (Composite):</strong> Power ratings from Talent, Efficiency, Scoring, and Record (25% each)</li>
            <li><strong>V2 (Matchup):</strong> Unit grades (Run 40%, Pass 40%, Explosiveness 20%) scaled by 9.0</li>
            <li><strong>Hybrid:</strong> 70% V1 + 30% V2 blend (optimized from backtesting)</li>
            <li><strong>Diff:</strong> Difference between Hybrid and V1 predictions. Highlighted rows show significant disagreements (&gt;3 pts).</li>
          </ul>
        </div>

        <div className="mt-4 text-sm text-gray-600">
          <Link href="/" className="text-blue-600 hover:text-blue-800">
            ← Back to Home
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}

