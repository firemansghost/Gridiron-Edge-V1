/**
 * M3 Game Detail Page
 * 
 * Shows detailed game information including factor breakdown from components_json.
 */

'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import { abbrevSource, formatSourceTooltip } from '@/lib/market-badges';

export default function GameDetailPage() {
  const params = useParams();
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.gameId) {
      fetchGameDetail();
    }
  }, [params.gameId]);

  const fetchGameDetail = async () => {
    try {
      const response = await fetch(`/api/game/${params.gameId}`);
      const data = await response.json();
      
      if (data.success) {
        setGame(data);
      } else {
        setError(data.error || 'Failed to fetch game detail');
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
          <p className="mt-4 text-gray-600">Loading game detail...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Game</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={fetchGameDetail}
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
              <h1 className="text-3xl font-bold text-gray-900">{game.game.matchup}</h1>
              <p className="text-gray-600 mt-2">
                {game.game.kickoff} • {game.game.venue} {game.game.neutralSite && '(Neutral)'}
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Model Version</div>
              <div className="text-lg font-semibold text-gray-900">{game.model.version}</div>
            </div>
          </div>
        </div>

        {/* Game Status */}
        {game.game.status !== 'scheduled' && (
          <div className="mb-8 bg-white p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Game Status</h3>
            <div className="text-2xl font-bold text-gray-900">
              {game.game.awayTeam} {game.game.awayScore} - {game.game.homeScore} {game.game.homeTeam}
            </div>
          </div>
        )}

        {/* Model vs Market Card */}
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Model vs Market</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Spread Comparison */}
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">Spread</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500">Model Line</div>
                  <div className="text-lg font-semibold text-gray-900">{game.picks?.spread?.spreadPickLabel}</div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500">Market Line</div>
                  <div className="flex items-center">
                    <div className="text-lg font-semibold text-gray-900">
                      {game.market.spread > 0 ? '+' : ''}{game.market.spread.toFixed(1)}
                    </div>
                    {game.market.meta?.spread?.source && (
                      <span 
                        className="ml-2 text-xs rounded px-2 py-0.5 bg-blue-100 text-blue-700 font-medium"
                        title={formatSourceTooltip(game.market.meta.spread.source, game.market.meta.spread.timestamp)}
                      >
                        ({abbrevSource(game.market.meta.spread.source)})
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500">Edge</div>
                  <div className="text-sm font-medium text-blue-600">+{game.picks?.spread?.edgePts?.toFixed(1)} pts</div>
                </div>
              </div>
            </div>

            {/* Total Comparison */}
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">Total</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500">Model Total</div>
                  <div className="text-lg font-semibold text-gray-900">{game.implied.total.toFixed(1)}</div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500">Market Total</div>
                  <div className="flex items-center">
                    <div className="text-lg font-semibold text-gray-900">{game.market.total.toFixed(1)}</div>
                    {game.market.meta?.total?.source && (
                      <span 
                        className="ml-2 text-xs rounded px-2 py-0.5 bg-blue-100 text-blue-700 font-medium"
                        title={formatSourceTooltip(game.market.meta.total.source, game.market.meta.total.timestamp)}
                      >
                        ({abbrevSource(game.market.meta.total.source)})
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500">Edge</div>
                  <div className="text-sm font-medium text-blue-600">+{game.picks?.total?.edgePts?.toFixed(1)} pts</div>
                </div>
              </div>
            </div>

            {/* Moneyline */}
            {game.market.moneyline?.price != null && (
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3">Moneyline</h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-gray-500">Pick (ML)</div>
                    <div className="text-lg font-semibold text-gray-900">{game.market.moneyline.pickLabel}</div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-gray-500">Market ML</div>
                    <div className="flex items-center">
                      <div 
                        className="text-lg font-semibold text-gray-900 cursor-help"
                        title={game.market.moneyline.impliedProb != null 
                          ? `Implied prob: ${(game.market.moneyline.impliedProb * 100).toFixed(1)}%` 
                          : ''
                        }
                      >
                        {game.market.moneyline.price > 0 ? '+' : ''}{game.market.moneyline.price}
                      </div>
                      {game.market.moneyline.meta?.source && (
                        <span 
                          className="ml-2 text-xs rounded px-2 py-0.5 bg-blue-100 text-blue-700 font-medium"
                          title={formatSourceTooltip(game.market.moneyline.meta.source, game.market.moneyline.meta.timestamp)}
                        >
                          ({abbrevSource(game.market.moneyline.meta.source)})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-gray-500">Implied Prob</div>
                    <div className="text-sm font-medium text-gray-900">
                      {game.market.moneyline.impliedProb != null 
                        ? `${(game.market.moneyline.impliedProb * 100).toFixed(1)}%` 
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Recommended Picks */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h4 className="text-md font-medium text-gray-900 mb-3">Recommended Picks</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-gray-500">Spread Pick</div>
                <div className="text-lg font-semibold text-gray-900">{game.picks?.spread?.spreadPickLabel}</div>
                <div className="text-sm text-blue-600">Edge: +{game.picks?.spread?.edgePts?.toFixed(1)} pts</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-gray-500">Total Pick</div>
                <div className="text-lg font-semibold text-gray-900">{game.picks?.total?.totalPickLabel || 'No edge'}</div>
                {game.picks?.total?.totalPickLabel && (
                  <div className="text-sm text-green-600">Edge: +{game.picks?.total?.edgePts?.toFixed(1)} pts</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Edge Analysis */}
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Edge Analysis</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-sm text-gray-500">Spread Edge</div>
              <div className="text-xl font-bold text-gray-900">{formatEdge(game.edge.spreadEdge)} pts</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-500">Total Edge</div>
              <div className="text-xl font-bold text-gray-900">{formatEdge(game.edge.totalEdge)} pts</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-500">Max Edge</div>
              <div className="text-xl font-bold text-gray-900">{formatEdge(game.edge.maxEdge)} pts</div>
            </div>
          </div>
        </div>

        {/* Power Ratings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Home Team */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{game.ratings.home.team}</h3>
            <div className="space-y-4">
              <div>
                <div className="text-sm text-gray-500">Power Rating</div>
                <div className="text-2xl font-bold text-gray-900">{game.ratings.home.rating.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Confidence</div>
                <div className="text-lg text-gray-900">{game.ratings.home.confidence.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Away Team */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{game.ratings.away.team}</h3>
            <div className="space-y-4">
              <div>
                <div className="text-sm text-gray-500">Power Rating</div>
                <div className="text-2xl font-bold text-gray-900">{game.ratings.away.rating.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Confidence</div>
                <div className="text-lg text-gray-900">{game.ratings.away.confidence.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Factor Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Home Team Factors */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{game.ratings.home.team} - Top Factors</h3>
            <div className="space-y-3">
              {game.ratings.home.factors.map((factor: any, index: number) => (
                <div key={index} className="flex justify-between items-center">
                  <div className="text-sm text-gray-900 capitalize">{factor.factor.replace('_', ' ')}</div>
                  <div className="text-sm text-gray-600">
                    {factor.contribution.toFixed(3)} ({factor.weight.toFixed(2)} × {factor.zScore.toFixed(2)})
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Away Team Factors */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{game.ratings.away.team} - Top Factors</h3>
            <div className="space-y-3">
              {game.ratings.away.factors.map((factor: any, index: number) => (
                <div key={index} className="flex justify-between items-center">
                  <div className="text-sm text-gray-900 capitalize">{factor.factor.replace('_', ' ')}</div>
                  <div className="text-sm text-gray-600">
                    {factor.contribution.toFixed(3)} ({factor.weight.toFixed(2)} × {factor.zScore.toFixed(2)})
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Model Info */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Model Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-500">Home Field Advantage</div>
              <div className="text-lg text-gray-900">{game.model.hfa} points</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Confidence Thresholds</div>
              <div className="text-sm text-gray-900">
                A ≥ {game.model.thresholds.A} pts, B ≥ {game.model.thresholds.B} pts, C ≥ {game.model.thresholds.C} pts
              </div>
            </div>
          </div>
        </div>

        {/* Back Link */}
        <div className="mt-8">
          <Link 
            href="/"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            ← Back to Slate
          </Link>
        </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
