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
import { InfoTooltip } from '@/components/InfoTooltip';
import { LoadingState } from '@/components/LoadingState';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { ErrorState } from '@/components/ErrorState';
import { LineSparkline } from '@/components/LineSparkline';

export default function GameDetailPage() {
  const params = useParams();
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lineHistory, setLineHistory] = useState<any>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

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
        // Fetch line history
        fetchLineHistory(params.gameId as string);
      } else {
        setError(data.error || 'Failed to fetch game detail');
      }
    } catch (err) {
      setError('Network error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const fetchLineHistory = async (gameId: string) => {
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/lines/history?gameId=${gameId}`);
      const data = await response.json();
      
      if (data.success) {
        setLineHistory(data);
      }
    } catch (err) {
      console.error('Failed to fetch line history:', err);
    } finally {
      setLoadingHistory(false);
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
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <HeaderNav />
        <div className="flex-1">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <LoadingState message="Loading game details..." />
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <HeaderNav />
        <div className="flex-1 flex items-center justify-center px-4">
          <ErrorState
            title="Unable to Load Game"
            message="We couldn't load the game details. The game may not exist or there was a connection issue."
            onRetry={fetchGameDetail}
            helpLink={{
              label: 'Browse All Weeks',
              href: '/weeks'
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
              <div className="text-sm text-gray-500 flex items-center justify-end gap-1">
                Model Version
                <InfoTooltip content="Ratings Model v1 uses feature-based power ratings calculated from offensive and defensive statistics. Click version number to view changelog." />
              </div>
              <Link 
                href="/docs/changelog"
                className="text-lg font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors inline-block"
              >
                {game.model.version}
              </Link>
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
              <h4 className="text-md font-medium text-gray-900 mb-3 flex items-center gap-2">
                Spread
                <InfoTooltip content="The point spread indicates how many points one team is expected to win by. Negative values mean the home team is favored. Our model calculates its own spread prediction based on team ratings." />
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    Model Line
                    <InfoTooltip content="Our model's predicted point spread for this game, calculated using team power ratings and home field advantage." />
                  </div>
                  <div className="text-lg font-semibold text-gray-900">{game.picks?.spread?.spreadPickLabel}</div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    Market Line
                    <InfoTooltip content="The betting market's consensus spread, reflecting what sportsbooks are offering. This is what you'd actually bet against." />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-lg font-semibold text-gray-900">
                      {game.market.spread > 0 ? '+' : ''}{game.market.spread.toFixed(1)}
                    </div>
                    {game.market.meta?.spread?.source && (
                      <span 
                        className="text-xs rounded px-2 py-0.5 bg-blue-100 text-blue-700 font-medium"
                        title={formatSourceTooltip(game.market.meta.spread.source, game.market.meta.spread.timestamp)}
                      >
                        ({abbrevSource(game.market.meta.spread.source)})
                      </span>
                    )}
                    {lineHistory?.history?.spread && lineHistory.history.spread.length > 0 && (
                      <LineSparkline 
                        data={lineHistory.history.spread} 
                        lineType="spread"
                        width={150}
                        height={30}
                      />
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    Edge
                    <InfoTooltip content="The difference between our model's prediction and the market line (in points). Positive edge means our model thinks the market is mispriced, creating a betting opportunity." />
                  </div>
                  <div className="text-sm font-medium text-blue-600">+{game.picks?.spread?.edgePts?.toFixed(1)} pts</div>
                </div>
              </div>
            </div>

            {/* Total Comparison */}
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3 flex items-center gap-2">
                Total
                <InfoTooltip content="The total points expected to be scored by both teams combined. You can bet over or under this number." />
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    Model Total
                    <InfoTooltip content="Our model's predicted total points for this game, based on team offensive/defensive ratings and pace." />
                  </div>
                  <div className="text-lg font-semibold text-gray-900">{game.implied.total.toFixed(1)}</div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    Market Total
                    <InfoTooltip content="The betting market's consensus total points line, reflecting what sportsbooks are offering." />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-lg font-semibold text-gray-900">{game.market.total.toFixed(1)}</div>
                    {game.market.meta?.total?.source && (
                      <span 
                        className="text-xs rounded px-2 py-0.5 bg-blue-100 text-blue-700 font-medium"
                        title={formatSourceTooltip(game.market.meta.total.source, game.market.meta.total.timestamp)}
                      >
                        ({abbrevSource(game.market.meta.total.source)})
                      </span>
                    )}
                    {lineHistory?.history?.total && lineHistory.history.total.length > 0 && (
                      <LineSparkline 
                        data={lineHistory.history.total} 
                        lineType="total"
                        width={150}
                        height={30}
                      />
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    Edge
                    <InfoTooltip content="The difference between our model's predicted total and the market total. Positive edge suggests betting over, negative suggests under." />
                  </div>
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

          {/* Line Movement History */}
          {lineHistory && (lineHistory.history?.spread?.length > 0 || lineHistory.history?.total?.length > 0) && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-md font-medium text-gray-900">Line Movement</h4>
                <InfoTooltip content="Shows how the betting lines have moved over time. Green dot = opening line, Red dot = closing line. Line movement can indicate where sharp money is going." />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {lineHistory.history?.spread && lineHistory.history.spread.length > 0 && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-600 mb-2">Spread Movement</div>
                    <LineSparkline 
                      data={lineHistory.history.spread} 
                      lineType="spread"
                      width={250}
                      height={50}
                    />
                    {lineHistory.statistics?.spread && (
                      <div className="text-xs text-gray-500 mt-2">
                        Opening: {lineHistory.statistics.spread.opening.value.toFixed(1)} → 
                        Closing: {lineHistory.statistics.spread.closing.value.toFixed(1)} 
                        ({lineHistory.statistics.spread.movement > 0 ? '+' : ''}{lineHistory.statistics.spread.movement.toFixed(1)})
                      </div>
                    )}
                  </div>
                )}
                {lineHistory.history?.total && lineHistory.history.total.length > 0 && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-600 mb-2">Total Movement</div>
                    <LineSparkline 
                      data={lineHistory.history.total} 
                      lineType="total"
                      width={250}
                      height={50}
                    />
                    {lineHistory.statistics?.total && (
                      <div className="text-xs text-gray-500 mt-2">
                        Opening: {lineHistory.statistics.total.opening.value.toFixed(1)} → 
                        Closing: {lineHistory.statistics.total.closing.value.toFixed(1)} 
                        ({lineHistory.statistics.total.movement > 0 ? '+' : ''}{lineHistory.statistics.total.movement.toFixed(1)})
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recommended Picks */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-md font-medium text-gray-900">Recommended Picks</h4>
              <InfoTooltip content="These are our model's betting recommendations based on comparing our predictions to the market. Higher edge means stronger opportunity. Always do your own research before placing bets." />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-gray-500 flex items-center gap-1 mb-1">
                  Spread Pick
                  <InfoTooltip content="Our model recommends this team against the spread. The edge shows how much our prediction differs from the market line." />
                </div>
                <div className="text-lg font-semibold text-gray-900">{game.picks?.spread?.spreadPickLabel}</div>
                <div className="text-sm text-blue-600">Edge: +{game.picks?.spread?.edgePts?.toFixed(1)} pts</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-gray-500 flex items-center gap-1 mb-1">
                  Total Pick
                  <InfoTooltip content="Our model recommends over or under the total. Only shown when there's a meaningful edge (2.0+ points)." />
                </div>
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
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Edge Analysis</h3>
            <InfoTooltip content="Edge is the difference between our model's prediction and the betting market (in points). Positive edge means our model thinks the market is mispriced, creating a betting opportunity." />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-sm text-gray-500 flex items-center justify-center gap-1 mb-1">
                Spread Edge
                <InfoTooltip content="Difference between our model's spread prediction and the market spread. Higher positive edge = stronger betting opportunity on the spread." />
              </div>
              <div className="text-xl font-bold text-gray-900">{formatEdge(game.edge.spreadEdge)} pts</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-500 flex items-center justify-center gap-1 mb-1">
                Total Edge
                <InfoTooltip content="Difference between our model's total prediction and the market total. Positive edge suggests over, negative suggests under." />
              </div>
              <div className="text-xl font-bold text-gray-900">{formatEdge(game.edge.totalEdge)} pts</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-500 flex items-center justify-center gap-1 mb-1">
                Max Edge
                <InfoTooltip content="The larger of spread edge or total edge. This is the strongest betting opportunity for this game." />
              </div>
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
                <div className="text-sm text-gray-500 flex items-center gap-1">
                  Power Rating
                  <InfoTooltip content="A team's overall strength rating combining offensive and defensive capabilities. Higher numbers indicate stronger teams. Used to predict game outcomes and calculate point spreads." />
                </div>
                <div className="text-2xl font-bold text-gray-900">{game.ratings.home.rating.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 flex items-center gap-1">
                  Confidence
                  <InfoTooltip content="A measure (0-1 scale) of how reliable this rating is, based on data quality and coverage. Higher confidence means more reliable predictions." />
                </div>
                <div className="text-lg text-gray-900">{game.ratings.home.confidence.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Away Team */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{game.ratings.away.team}</h3>
            <div className="space-y-4">
              <div>
                <div className="text-sm text-gray-500 flex items-center gap-1">
                  Power Rating
                  <InfoTooltip content="A team's overall strength rating combining offensive and defensive capabilities. Higher numbers indicate stronger teams. Used to predict game outcomes and calculate point spreads." />
                </div>
                <div className="text-2xl font-bold text-gray-900">{game.ratings.away.rating.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 flex items-center gap-1">
                  Confidence
                  <InfoTooltip content="A measure (0-1 scale) of how reliable this rating is, based on data quality and coverage. Higher confidence means more reliable predictions." />
                </div>
                <div className="text-lg text-gray-900">{game.ratings.away.confidence.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Factor Breakdown - Collapsible for progressive disclosure */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Home Team Factors */}
          <CollapsibleSection 
            title={`${game.ratings.home.team} - Top Factors`}
            defaultOpen={false}
          >
            <div className="space-y-3">
              <p className="text-xs text-gray-500 mb-3">
                These factors show which statistics contributed most to the team's power rating. 
                Higher values indicate stronger contribution.
              </p>
              {game.ratings.home.factors.map((factor: any, index: number) => (
                <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                  <div className="text-sm text-gray-900 capitalize">{factor.factor.replace('_', ' ')}</div>
                  <div className="text-sm text-gray-600">
                    {factor.contribution.toFixed(3)} ({factor.weight.toFixed(2)} × {factor.zScore.toFixed(2)})
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* Away Team Factors */}
          <CollapsibleSection 
            title={`${game.ratings.away.team} - Top Factors`}
            defaultOpen={false}
          >
            <div className="space-y-3">
              <p className="text-xs text-gray-500 mb-3">
                These factors show which statistics contributed most to the team's power rating. 
                Higher values indicate stronger contribution.
              </p>
              {game.ratings.away.factors.map((factor: any, index: number) => (
                <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                  <div className="text-sm text-gray-900 capitalize">{factor.factor.replace('_', ' ')}</div>
                  <div className="text-sm text-gray-600">
                    {factor.contribution.toFixed(3)} ({factor.weight.toFixed(2)} × {factor.zScore.toFixed(2)})
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
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
