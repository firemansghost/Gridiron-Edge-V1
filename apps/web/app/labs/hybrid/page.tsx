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

export default function HybridLabsPage() {
  const [games, setGames] = useState<HybridGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [week, setWeek] = useState<number | null>(null);

  useEffect(() => {
    fetchHybridSlate();
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
          <p className="text-gray-600">
            Comparing V1 (Composite), V2 (Matchup), and Hybrid (70% V1 + 30% V2) spread predictions
            {season && week && ` - ${season} Week ${week}`}
          </p>
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
                    Market
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {games.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No games found for this week.
                    </td>
                  </tr>
                ) : (
                  games.map((game) => {
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
                  })
                )}
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

