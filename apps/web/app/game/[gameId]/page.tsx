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
          <div className="flex items-center justify-between mb-4">
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
                {game.modelConfig.version}
              </Link>
            </div>
          </div>

          {/* Betting Lines Summary - Clear at top */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
              Betting Lines
              <InfoTooltip content="Current betting market lines for this game. These are the lines you would bet against at sportsbooks." />
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-3 rounded border border-blue-100">
                <div className="text-xs text-gray-600 mb-1">Spread</div>
                <div className="text-xl font-bold text-gray-900">
                  {game.market.spread > 0 ? '+' : ''}{game.market.spread.toFixed(1)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {game.market.spread < 0 ? game.game.homeTeam : game.game.awayTeam} favored
                </div>
              </div>
              <div className="bg-white p-3 rounded border border-blue-100">
                <div className="text-xs text-gray-600 mb-1">Total (Over/Under)</div>
                <div className="text-xl font-bold text-gray-900">
                  {game.market.total.toFixed(1)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Combined points
                </div>
              </div>
              <div className="bg-white p-3 rounded border border-blue-100">
                <div className="text-xs text-gray-600 mb-1">Moneyline</div>
                {game.market.moneyline ? (
                  <>
                    <div className="text-xl font-bold text-gray-900">
                      {game.market.moneyline.pickLabel}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {game.market.moneyline.price > 0 ? '+' : ''}{game.market.moneyline.price}
                      {game.market.moneyline.impliedProb && ` (${(game.market.moneyline.impliedProb * 100).toFixed(1)}%)`}
                    </div>
                  </>
                ) : (
                  <div className="text-lg text-gray-400">Not available</div>
                )}
              </div>
            </div>
            {game.market.meta?.spread && (
              <div className="text-xs text-gray-500 mt-3 text-center">
                Source: {game.market.meta.spread.source || 'Unknown'} • 
                {game.market.meta.spread.timestamp && 
                  ` Updated: ${new Date(game.market.meta.spread.timestamp).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: 'America/Chicago'
                  })}`
                }
              </div>
            )}
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
                <InfoTooltip content="Spread is shown in favorite-centric format: the favorite always shows -X.X (laying points). Our model calculates its own spread prediction based on team ratings." />
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    Model Favorite
                    <InfoTooltip content="Our model's predicted favorite team and spread. The favorite always shows -X.X (laying points)." />
                  </div>
                  <div className="text-lg font-semibold text-gray-900">
                    {game.model?.favorite ? `${game.model.favorite.teamName} ${game.model.favorite.spread.toFixed(1)}` : '—'}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    Market Favorite
                    <InfoTooltip content="The betting market's favorite team and spread. This is what you'd actually bet against." />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-3">
                      <div className="text-lg font-semibold text-gray-900">
                        {game.market?.favorite ? `${game.market.favorite.teamName} ${game.market.favorite.spread.toFixed(1)}` : '—'}
                      </div>
                      {lineHistory?.history?.spread && lineHistory.history.spread.length > 0 && (
                        <LineSparkline 
                          data={lineHistory.history.spread} 
                          lineType="spread"
                          width={150}
                          height={30}
                        />
                      )}
                    </div>
                    {game.market.meta?.spread && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-gray-700">
                          {game.market.meta.spread.source || 'Unknown'}
                        </span>
                        <span className="text-gray-500">
                          {game.market.meta.spread.timestamp 
                            ? new Date(game.market.meta.spread.timestamp).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true,
                                timeZone: 'America/Chicago'
                              })
                            : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    ATS Edge
                    <InfoTooltip content="ATS Edge = (Model favorite spread) - (Market favorite spread). Positive means model thinks the favorite should lay more points. Negative means model thinks favorite should lay fewer points." />
                  </div>
                  <div className={`text-sm font-medium ${game.edge?.atsEdge >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {game.edge?.atsEdge >= 0 ? '+' : ''}{game.edge?.atsEdge?.toFixed(1)} pts
                  </div>
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
                  <div className="text-lg font-semibold text-gray-900">{game.model?.total?.toFixed(1) || '—'}</div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    Market Total
                    <InfoTooltip content="The best available total points line from the betting market (prefers SGO source, then latest). This is what you'd actually bet against." />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-3">
                      <div className="text-lg font-semibold text-gray-900">{game.market.total.toFixed(1)}</div>
                      {lineHistory?.history?.total && lineHistory.history.total.length > 0 && (
                        <LineSparkline 
                          data={lineHistory.history.total} 
                          lineType="total"
                          width={150}
                          height={30}
                        />
                      )}
                    </div>
                    {game.market.meta?.total && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-gray-700">
                          {game.market.meta.total.source || 'Unknown'}
                        </span>
                        <span className="text-gray-500">
                          {game.market.meta.total.timestamp 
                            ? new Date(game.market.meta.total.timestamp).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true,
                                timeZone: 'America/Chicago'
                              })
                            : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    Total Edge
                    <InfoTooltip content="Total Edge = Model Total - Market Total. Positive means model thinks Over (higher scoring), negative means model thinks Under (lower scoring)." />
                  </div>
                  <div className={`text-sm font-medium ${game.edge?.totalEdge >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {game.edge?.totalEdge >= 0 ? '+' : ''}{game.edge?.totalEdge?.toFixed(1)} pts
                    {game.edge?.totalEdge && (
                      <span className="ml-1 text-xs">({game.edge.totalEdge >= 0 ? 'Over' : 'Under'})</span>
                    )}
                  </div>
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
                    <div className="text-sm text-gray-500">Best Available Moneyline</div>
                    <div className="flex flex-col items-end gap-1">
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
                      </div>
                      {game.market.moneyline.meta && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-gray-700">
                            {game.market.moneyline.meta.source || 'Unknown'}
                          </span>
                          <span className="text-gray-500">
                            {game.market.moneyline.meta.timestamp 
                              ? new Date(game.market.moneyline.meta.timestamp).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true,
                                  timeZone: 'America/Chicago'
                                })
                              : ''}
                          </span>
                        </div>
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
          {/* Weather Data */}
          {game.weather && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-md font-medium text-gray-900">Weather Conditions</h4>
                <InfoTooltip content="Game-time weather forecast from Visual Crossing for the game date and kickoff time. Weather can affect scoring, especially wind and precipitation." />
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-3">
                <div className="text-xs text-blue-700 font-medium">
                  ⏰ Game Day Forecast: {game.game.kickoff}
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  Forecast generated: {game.weather.forecastTime ? new Date(game.weather.forecastTime).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: 'America/Chicago'
                  }) : 'Unknown'}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Temperature</div>
                  <div className="text-lg font-semibold text-gray-900">{game.weather.temperature}°F</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Wind Speed</div>
                  <div className="text-lg font-semibold text-gray-900">{game.weather.windSpeed} mph</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Precipitation</div>
                  <div className="text-lg font-semibold text-gray-900">{game.weather.precipitationProb}%</div>
                </div>
                {game.weather.conditions && (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Conditions</div>
                    <div className="text-lg font-semibold text-gray-900">{game.weather.conditions}</div>
                  </div>
                )}
              </div>
              {game.weather.humidity && (
                <div className="text-xs text-gray-500 mt-2">
                  Humidity: {game.weather.humidity}% • Source: {game.weather.source}
                </div>
              )}
            </div>
          )}

          {/* Injury Data */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-md font-medium text-gray-900">Injuries</h4>
              <InfoTooltip content="Player injury reports from ESPN. OUT = confirmed out, QUESTIONABLE = may not play, PROBABLE = likely to play, DOUBTFUL = unlikely to play." />
            </div>
            {game.injuries && game.injuries.length > 0 ? (
              <div className="space-y-2">
                {game.injuries.map((injury: any) => (
                  <div key={injury.id} className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-900">{injury.teamName}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            injury.severity === 'OUT' ? 'bg-red-100 text-red-800' :
                            injury.severity === 'QUESTIONABLE' ? 'bg-yellow-100 text-yellow-800' :
                            injury.severity === 'PROBABLE' ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {injury.severity}
                          </span>
                        </div>
                        {injury.playerName && (
                          <div className="text-sm text-gray-700">
                            {injury.playerName} ({injury.position})
                          </div>
                        )}
                        {!injury.playerName && injury.position && (
                          <div className="text-sm text-gray-700">{injury.position}</div>
                        )}
                        {injury.bodyPart && (
                          <div className="text-xs text-gray-500">Body Part: {injury.bodyPart}</div>
                        )}
                        {injury.injuryType && (
                          <div className="text-xs text-gray-500">Type: {injury.injuryType}</div>
                        )}
                        {injury.status && (
                          <div className="text-xs text-gray-500 mt-1">{injury.status}</div>
                        )}
                      </div>
                      {injury.reportedAt && (
                        <div className="text-xs text-gray-400 ml-4">
                          {new Date(injury.reportedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-600">
                  ✓ No injuries reported for this game
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Injury data is automatically synced from ESPN. If you notice missing injuries, they may not have been reported yet.
                </p>
              </div>
            )}
          </div>

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
                  <InfoTooltip content="Our model recommends over or under the total. Total Edge = Model Total - Market Total. Positive means Over (higher scoring), negative means Under (lower scoring)." />
                </div>
                <div className="text-lg font-semibold text-gray-900">{game.picks?.total?.totalPickLabel || 'No edge'}</div>
                {game.picks?.total?.totalPickLabel && game.picks?.total?.edgeDisplay && (
                  <div className={`text-sm mt-1 ${game.picks?.total?.edgePts >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {game.picks.total.edgeDisplay}
                  </div>
                )}
                {game.picks?.total?.totalPickLabel && !game.picks?.total?.edgeDisplay && (
                  <div className={`text-sm ${game.picks?.total?.edgePts >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    Edge: {game.picks?.total?.edgePts >= 0 ? '+' : ''}{game.picks?.total?.edgePts?.toFixed(1)} pts
                    {game.picks?.total?.edgePts && (
                      <span className="ml-1 text-xs">({game.picks.total.edgePts >= 0 ? 'Over' : 'Under'})</span>
                    )}
                  </div>
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
              <div className={`text-xl font-bold ${game.edge?.atsEdge >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {game.edge?.atsEdge >= 0 ? '+' : ''}{game.edge?.atsEdge?.toFixed(1)} pts
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-500 flex items-center justify-center gap-1 mb-1">
                Total Edge
                <InfoTooltip content="Difference between our model's total prediction and the market total. Positive edge suggests over, negative suggests under." />
              </div>
              <div className={`text-xl font-bold ${game.edge?.totalEdge >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {game.edge?.totalEdge >= 0 ? '+' : ''}{game.edge?.totalEdge?.toFixed(1)} pts
                {game.edge?.totalEdge && (
                  <div className="text-xs mt-1">({game.edge.totalEdge >= 0 ? 'Over' : 'Under'})</div>
                )}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-500 flex items-center justify-center gap-1 mb-1">
                Max Edge
                <InfoTooltip content="The larger of ATS edge or Total edge (absolute value). This is the strongest betting opportunity for this game." />
              </div>
              <div className="text-xl font-bold text-gray-900">{game.edge?.maxEdge?.toFixed(1)} pts</div>
            </div>
          </div>
        </div>

        {/* Talent Differential (Phase 3) */}
        {game.ratings?.talentDifferential !== null && game.ratings?.talentDifferential !== undefined && (
          <div className="bg-white p-6 rounded-lg shadow mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Talent Advantage</h3>
              <InfoTooltip content="Talent differential shows how much roster talent advantage contributes to the home team's edge. This decays as the season progresses (100% at week 0, 0% at week 8+)." />
            </div>
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <div className="text-sm text-gray-500 mb-1">Home Team Talent Component</div>
                <div className="text-2xl font-bold text-gray-900">
                  {game.ratings.home.talentComponent !== null ? 
                    `${game.ratings.home.talentComponent >= 0 ? '+' : ''}${game.ratings.home.talentComponent.toFixed(1)} pts` :
                    '—'
                  }
                </div>
                {game.ratings.home.decay !== null && (
                  <div className="text-xs text-gray-400 mt-1">
                    Decay: {(game.ratings.home.decay * 100).toFixed(0)}%
                  </div>
                )}
              </div>
              <div className="text-3xl text-gray-400">−</div>
              <div className="text-center">
                <div className="text-sm text-gray-500 mb-1">Away Team Talent Component</div>
                <div className="text-2xl font-bold text-gray-900">
                  {game.ratings.away.talentComponent !== null ? 
                    `${game.ratings.away.talentComponent >= 0 ? '+' : ''}${game.ratings.away.talentComponent.toFixed(1)} pts` :
                    '—'
                  }
                </div>
                {game.ratings.away.decay !== null && (
                  <div className="text-xs text-gray-400 mt-1">
                    Decay: {(game.ratings.away.decay * 100).toFixed(0)}%
                  </div>
                )}
              </div>
              <div className="text-3xl text-gray-400">=</div>
              <div className="text-center">
                <div className="text-sm text-gray-500 mb-1">Talent Differential</div>
                <div className={`text-3xl font-bold ${game.ratings.talentDifferential >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {game.ratings.talentDifferential >= 0 ? '+' : ''}{game.ratings.talentDifferential.toFixed(1)} pts
                </div>
                <div className="text-xs text-gray-400 mt-1">(Home advantage)</div>
              </div>
            </div>
          </div>
        )}

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
