/**
 * M3 Home Page - Seed Slate
 * 
 * Displays this week's seed games with implied vs market data and confidence tiers.
 */

'use client';

import { useState, useEffect } from 'react';
import { SlateData } from '@/types';
import { TeamLogo } from '@/components/TeamLogo';

export default function HomePage() {
  const [slate, setSlate] = useState<SlateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSlate();
  }, []);

  const fetchSlate = async () => {
    try {
      const response = await fetch('/api/seed-slate');
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading seed slate...</p>
        </div>
      </div>
    );
  }

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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold text-gray-900">Gridiron Edge</h1>
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
            <a 
              href="/weeks?season=2024&week=1"
              className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
            >
              Review Previous Weeks
            </a>
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

        {/* Games Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">This Week's Slate</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Matchup
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Kickoff (CT)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Market Close
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Model Line
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pick (Spread)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pick (Total)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Max Edge
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {slate?.games?.map((game) => (
                  <tr key={game.gameId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2">
                          <TeamLogo 
                            teamName={game.awayTeam.name}
                            logoUrl={game.awayTeam.logoUrl}
                            primaryColor={game.awayTeam.primaryColor}
                            teamId={game.awayTeam.id}
                            size="sm"
                          />
                          <span className="text-sm font-medium text-gray-900">
                            {game.awayTeam.name}
                          </span>
                        </div>
                        <span className="text-gray-400">@</span>
                        <div className="flex items-center space-x-2">
                          <TeamLogo 
                            teamName={game.homeTeam.name}
                            logoUrl={game.homeTeam.logoUrl}
                            primaryColor={game.homeTeam.primaryColor}
                            teamId={game.homeTeam.id}
                            size="sm"
                          />
                          <span className="text-sm font-medium text-gray-900">
                            {game.homeTeam.name}
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {game.venue} {game.neutralSite && '(Neutral)'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {game.kickoff}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>Spread: {game.marketSpread > 0 ? '+' : ''}{game.marketSpread.toFixed(1)}</div>
                      <div>Total: {game.marketTotal.toFixed(1)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="font-medium">{game.spreadPickLabel}</div>
                      <div className="text-xs text-gray-500">model line</div>
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
                      <div className="font-medium">
                        {formatEdge(game.maxEdge)} pts
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getConfidenceColor(game.confidence)}`}>
                        {game.confidence}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>M3 Seed Mode • Linear Ratings • Constant HFA = 2.0 pts</p>
          <p>Confidence Tiers: A ≥ 4.0 pts, B ≥ 3.0 pts, C ≥ 2.0 pts</p>
        </div>
      </div>
    </div>
  );
}
