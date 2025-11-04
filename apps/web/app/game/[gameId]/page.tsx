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
import { GameDetailSkeleton } from '@/components/GameDetailSkeleton';
import { TOOLTIP_CONTENT } from '@/lib/tooltip-content';
import { TeamLogo } from '@/components/TeamLogo';

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

  // Helper to render rank chips with freshness tooltip
  const renderRankChips = (rankings: any, week?: number, season?: number) => {
    if (!rankings) return null;
    
    const chips = [];
    const tooltipContent = week && season 
      ? `Week ${week}, ${season} season. Rankings update weekly.`
      : 'Rankings update weekly.';
    
    if (rankings.AP) {
      chips.push(
        <span key="AP" className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
          <span>AP #{rankings.AP.rank}</span>
          <InfoTooltip content={`AP Poll #${rankings.AP.rank}${rankings.AP.points ? ` (${rankings.AP.points} pts)` : ''}. ${tooltipContent}`} />
        </span>
      );
    }
    if (rankings.CFP) {
      chips.push(
        <span key="CFP" className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
          <span>CFP #{rankings.CFP.rank}</span>
          <InfoTooltip content={`College Football Playoff Rankings #${rankings.CFP.rank}${rankings.CFP.points ? ` (${rankings.CFP.points} pts)` : ''}. ${tooltipContent}`} />
        </span>
      );
    }
    if (rankings.COACHES) {
      chips.push(
        <span key="COACHES" className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
          <span>Coaches #{rankings.COACHES.rank}</span>
          <InfoTooltip content={`Coaches Poll #${rankings.COACHES.rank}${rankings.COACHES.points ? ` (${rankings.COACHES.points} pts)` : ''}. ${tooltipContent}`} />
        </span>
      );
    }
    
    if (chips.length === 0) {
      return <span className="text-xs text-gray-400">NR</span>;
    }
    
    return <div className="flex items-center gap-1">{chips}</div>;
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
          {/* Matchup Header */}
          <div className="mb-6">
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
                  <InfoTooltip content={TOOLTIP_CONTENT.MODEL_VERSION} />
                </div>
                <Link 
                  href="/docs/changelog"
                  className="text-lg font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors inline-block"
                >
                  {game.modelConfig.version}
                </Link>
              </div>
            </div>
          </div>

          {/* Validation Warnings (if any flags raised) */}
          {game.validation && (game.validation.invalidModelTotal || game.validation.favoritesDisagree || game.validation.edgeAbsGt20) && (
            <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-sm font-semibold text-yellow-900">Data Quality Warning</h4>
                    <InfoTooltip content={`This warning appears when data quality checks detect unusual values. The specific issues are listed below. Invalid Model Total: Model total outside realistic range [20-90 points]. Favorites Disagree: Model and market favor different teams (may indicate model disagreement or market inefficiency). Edge Magnitude > 20: Edge value exceeds 20 points (may indicate calculation error or significant market inefficiency).`} />
                  </div>
                  <div className="text-sm text-yellow-800 space-y-1">
                    {game.validation.invalidModelTotal && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">⚠️ Invalid Model Total:</span>
                        <span>Model total outside realistic range [20-90 points]</span>
                      </div>
                    )}
                    {game.validation.favoritesDisagree && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">⚠️ Favorites Disagree:</span>
                        <span>Model favors {game.model?.favorite?.teamName || 'one team'} while market favors {game.market?.favorite?.teamName || 'another team'}</span>
                      </div>
                    )}
                    {game.validation.edgeAbsGt20 && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">⚠️ Large Edge Detected:</span>
                        <span>Edge magnitude exceeds 20 points (ATS: {game.edge?.atsEdge?.toFixed(1)} pts, Total: {game.edge?.totalEdge?.toFixed(1)} pts)</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-yellow-700 mt-2">
                    This game may have unusual data. Review carefully before making betting decisions.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Team Strips with Logos, Ranks, Records, Form */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Away Team Strip */}
              <div className="flex items-center gap-4">
                <TeamLogo 
                  teamName={game.teams?.away?.team?.name || game.game.awayTeam}
                  teamId={game.teams?.away?.team?.id}
                  size="lg"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="text-xl font-bold text-gray-900">{game.teams?.away?.team?.name || game.game.awayTeam}</div>
                    {renderRankChips(game.rankings?.away, game.game?.week, game.game?.season)}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <span className="font-medium">
                      {game.teams?.away?.record ? `${game.teams.away.record.wins}-${game.teams.away.record.losses}` : '—'}
                    </span>
                    <span className="text-gray-400">•</span>
                    <span className="font-mono tracking-wider">{game.teams?.away?.form || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Home Team Strip */}
              <div className="flex items-center gap-4">
                <TeamLogo 
                  teamName={game.teams?.home?.team?.name || game.game.homeTeam}
                  teamId={game.teams?.home?.team?.id}
                  size="lg"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="text-xl font-bold text-gray-900">{game.teams?.home?.team?.name || game.game.homeTeam}</div>
                    {renderRankChips(game.rankings?.home, game.game?.week, game.game?.season)}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <span className="font-medium">
                      {game.teams?.home?.record ? `${game.teams.home.record.wins}-${game.teams.home.record.losses}` : '—'}
                    </span>
                    <span className="text-gray-400">•</span>
                    <span className="font-mono tracking-wider">{game.teams?.home?.form || '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Game Status (if not scheduled) */}
          {game.game.status !== 'scheduled' && (
            <div className="mb-6 bg-white p-4 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Game Status</h3>
              <div className="text-2xl font-bold text-gray-900">
                {game.game.awayTeam} {game.game.awayScore} - {game.game.homeScore} {game.game.homeTeam}
              </div>
            </div>
          )}

          {/* Betting Lines Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
              Betting Lines
              <InfoTooltip content={TOOLTIP_CONTENT.MARKET_LINES} />
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-3 rounded border border-blue-100">
                <div className="text-xs text-gray-600 mb-1">Spread</div>
                <div className="text-xl font-bold text-gray-900">
                  {game.market.spread > 0 ? '+' : ''}{game.market.spread.toFixed(1)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {game.market.favorite ? `${game.market.favorite.teamName} favored` : game.market.spread < 0 ? game.game.homeTeam : game.game.awayTeam} favored
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

          {/* CLV Hint - if market moved toward model */}
          {game.clvHint && game.clvHint.hasCLV && (game.clvHint.spreadMoved || game.clvHint.totalMoved) && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-green-900 mb-1">CLV Drift Detected</div>
                  <div className="text-xs text-green-800">
                    {game.clvHint.spreadMoved && game.lineHistory?.statistics?.spread && (
                      <div>
                        Spread: {game.lineHistory.statistics.spread.opening.value.toFixed(1)} → {game.lineHistory.statistics.spread.closing.value.toFixed(1)}, 
                        drifting toward model ({game.model?.favorite?.spread.toFixed(1) || game.model?.spread?.toFixed(1)})
                      </div>
                    )}
                    {game.clvHint.totalMoved && game.lineHistory?.statistics?.total && (
                      <div>
                        Total: {game.lineHistory.statistics.total.opening.value.toFixed(1)} → {game.lineHistory.statistics.total.closing.value.toFixed(1)}, 
                        drifting toward model ({game.model?.total?.toFixed(1)})
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-green-700 mt-1 italic">
                    Market movement suggests the model's view is gaining traction
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recommended Picks - Ticket Style */}
          {(game.picks?.spread?.grade || game.picks?.total?.grade) && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Recommended Picks</h3>
                <InfoTooltip content={TOOLTIP_CONTENT.RECOMMENDED_PICKS + ' ' + TOOLTIP_CONTENT.GRADE_THRESHOLDS} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* ATS Pick Card */}
                {game.picks?.spread?.grade && game.picks?.spread?.bettablePick && (
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-lg p-5 shadow-md">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-medium text-blue-900 uppercase tracking-wide">Against the Spread</div>
                      <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                        game.picks.spread.grade === 'A' ? 'bg-green-500 text-white' :
                        game.picks.spread.grade === 'B' ? 'bg-yellow-500 text-white' :
                        'bg-orange-500 text-white'
                      }`}>
                        Grade {game.picks.spread.grade}
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 mb-2">
                      {game.picks.spread.bettablePick.label}
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-gray-600">
                        Edge: <span className={`font-semibold ${game.picks.spread.edgePts >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                          {game.picks.spread.edgePts >= 0 ? '+' : ''}{game.picks.spread.edgePts?.toFixed(1)} pts
                        </span>
                      </div>
                      <InfoTooltip content={`${TOOLTIP_CONTENT.ATS_EDGE_FORMULA} ${game.picks.spread.grade === 'A' ? TOOLTIP_CONTENT.GRADE_A : game.picks.spread.grade === 'B' ? TOOLTIP_CONTENT.GRADE_B : TOOLTIP_CONTENT.GRADE_C}`} />
                    </div>
                    {/* Edge Rationale Line */}
                    {game.picks.spread.bettablePick.reasoning && (
                      <div className="text-xs text-gray-700 mt-2 italic border-t border-blue-200 pt-2">
                        {game.picks.spread.bettablePick.reasoning}
                      </div>
                    )}
                    {!game.picks.spread.bettablePick.reasoning && game.model?.favorite && game.market?.favorite && (
                      <div className="text-xs text-gray-700 mt-2 italic border-t border-blue-200 pt-2">
                        Edge {game.picks.spread.edgePts >= 0 ? '+' : ''}{game.picks.spread.edgePts?.toFixed(1)} because model favors {game.model.favorite.teamName} {game.model.favorite.spread.toFixed(1)} vs market {game.market.favorite.teamName} {game.market.favorite.spread.toFixed(1)} (value on {game.picks.spread.bettablePick.label}).
                      </div>
                    )}
                  </div>
                )}

                {/* Total Pick Card */}
                {game.picks?.total?.grade && !game.picks?.total?.hidden && (
                  <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300 rounded-lg p-5 shadow-md">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-medium text-green-900 uppercase tracking-wide">Total (Over/Under)</div>
                      <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                        game.picks.total.grade === 'A' ? 'bg-green-500 text-white' :
                        game.picks.total.grade === 'B' ? 'bg-yellow-500 text-white' :
                        'bg-orange-500 text-white'
                      }`}>
                        Grade {game.picks.total.grade}
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 mb-2">
                      {game.picks.total.totalPickLabel}
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-gray-600">
                        Edge: <span className={`font-semibold ${game.picks.total.edgePts >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {game.picks.total.edgePts >= 0 ? '+' : ''}{game.picks.total.edgePts?.toFixed(1)} pts
                          {game.picks.total.edgePts && (
                            <span className="ml-1">({game.picks.total.edgePts >= 0 ? 'Over' : 'Under'})</span>
                          )}
                        </span>
                      </div>
                      <InfoTooltip content={`${TOOLTIP_CONTENT.TOTAL_EDGE_FORMULA} ${game.picks.total.grade === 'A' ? TOOLTIP_CONTENT.GRADE_A : game.picks.total.grade === 'B' ? TOOLTIP_CONTENT.GRADE_B : TOOLTIP_CONTENT.GRADE_C}`} />
                    </div>
                    {/* Edge Rationale Line */}
                    {game.picks.total.edgeDisplay && (
                      <div className="text-xs text-gray-700 mt-2 italic border-t border-green-200 pt-2">
                        {game.picks.total.edgeDisplay}
                      </div>
                    )}
                  </div>
                )}

                {/* Hidden Total Message */}
                {game.picks?.total?.hidden && (
                  <div className="md:col-span-2 bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">
                      Total pick hidden — model total failed sanity checks (outside [20-90] range)
                    </div>
                    <div className="text-xs text-gray-500">
                      Using market total only. Model total: {game.model?.total?.toFixed(1) || 'N/A'}
                    </div>
                  </div>
                )}

                {/* No picks message */}
                {!game.picks?.spread?.grade && !game.picks?.total?.grade && (
                  <div className="md:col-span-2 bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                    <div className="text-gray-600 mb-2">
                      No recommended picks (edge below 2.0 pts threshold)
                    </div>
                    <div className="text-xs text-gray-500">
                      Picks are only shown when edge meets minimum threshold (Grade C = 2.0+ pts)
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Implied Score Breakdown (optional but powerful) */}
          {game.model?.impliedScores?.home !== null && game.model?.impliedScores?.away !== null && (
            <div className="bg-white p-6 rounded-lg shadow mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                Model Implied Score
                <InfoTooltip content="Predicted final scores derived from model spread and total. These are the model's expected point totals for each team." />
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-2">{game.model.impliedScores.awayTeam}</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {game.model.impliedScores.away?.toFixed(1) || '—'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Predicted score</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-2">{game.model.impliedScores.homeTeam}</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {game.model.impliedScores.home?.toFixed(1) || '—'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Predicted score</div>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-3 text-center">
                Derived from model spread ({game.model?.spread?.toFixed(1) || '—'}) + model total ({game.model?.total?.toFixed(1) || '—'})
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
                <InfoTooltip content={TOOLTIP_CONTENT.SPREAD_FORMAT} />
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    Model favorite
                    <InfoTooltip content={TOOLTIP_CONTENT.MODEL_FAVORITE} />
                  </div>
                  <div className="text-lg font-semibold text-gray-900">
                    {game.model?.favorite ? `Model favorite: ${game.model.favorite.teamName} ${game.model.favorite.spread.toFixed(1)}` : '—'}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    Market Favorite
                    <InfoTooltip content={TOOLTIP_CONTENT.MARKET_FAVORITE} />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-3">
                      <div className="text-lg font-semibold text-gray-900">
                        {game.market?.favorite ? `${game.market.favorite.teamName} ${game.market.favorite.spread.toFixed(1)}` : '—'}
                      </div>
                      {game.lineHistory?.history?.spread && game.lineHistory.history.spread.length > 0 && (
                        <LineSparkline 
                          data={game.lineHistory.history.spread} 
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
                    <InfoTooltip content={TOOLTIP_CONTENT.ATS_EDGE_FORMULA} />
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
                <InfoTooltip content={TOOLTIP_CONTENT.TOTAL_EXPLANATION} />
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    Model Total
                    <InfoTooltip content={TOOLTIP_CONTENT.MODEL_TOTAL} />
                  </div>
                  <div className="text-lg font-semibold text-gray-900">{game.model?.total?.toFixed(1) || '—'}</div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    Market Total
                    <InfoTooltip content={TOOLTIP_CONTENT.MARKET_TOTAL} />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-3">
                      <div className="text-lg font-semibold text-gray-900">{game.market.total.toFixed(1)}</div>
                      {game.lineHistory?.history?.total && game.lineHistory.history.total.length > 0 && (
                        <LineSparkline 
                          data={game.lineHistory.history.total} 
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
                    <InfoTooltip content={TOOLTIP_CONTENT.TOTAL_EDGE_FORMULA} />
                  </div>
                  <div className={`text-sm font-medium ${game.edge?.totalEdge >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {game.edge?.totalEdge && game.market?.total && (
                      <>
                        {game.edge.totalEdge >= 0 ? 'Over' : 'Under'} {game.market.total.toFixed(1)} (edge {game.edge.totalEdge >= 0 ? '+' : ''}{game.edge.totalEdge.toFixed(1)} pts)
                      </>
                    )}
                    {!game.edge?.totalEdge && (
                      <>
                        {game.edge?.totalEdge >= 0 ? '+' : ''}{game.edge?.totalEdge?.toFixed(1)} pts
                        {game.edge?.totalEdge && (
                          <span className="ml-1 text-xs">({game.edge.totalEdge >= 0 ? 'Over' : 'Under'})</span>
                        )}
                      </>
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
                <InfoTooltip content={TOOLTIP_CONTENT.WEATHER} />
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
              <InfoTooltip content={TOOLTIP_CONTENT.INJURIES} />
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

          {game.lineHistory && (game.lineHistory.history?.spread?.length > 0 || game.lineHistory.history?.total?.length > 0) && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-md font-medium text-gray-900">Line Movement</h4>
                <InfoTooltip content={TOOLTIP_CONTENT.LINE_MOVEMENT} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {game.lineHistory.history?.spread && game.lineHistory.history.spread.length > 0 && game.lineHistory.statistics?.spread && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm font-medium text-gray-700 mb-3">Spread Movement</div>
                    <LineSparkline 
                      data={game.lineHistory.history.spread} 
                      lineType="spread"
                      width={280}
                      height={60}
                      openingValue={game.lineHistory.statistics.spread.opening.value}
                      closingValue={game.lineHistory.statistics.spread.closing.value}
                      movement={game.lineHistory.statistics.spread.movement}
                      showLabels={true}
                      showCaption={true}
                      favoriteTeamName={game.market?.favorite?.teamName}
                    />
                  </div>
                )}
                {game.lineHistory.history?.total && game.lineHistory.history.total.length > 0 && game.lineHistory.statistics?.total && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm font-medium text-gray-700 mb-3">Total Movement</div>
                    <LineSparkline 
                      data={game.lineHistory.history.total} 
                      lineType="total"
                      width={280}
                      height={60}
                      openingValue={game.lineHistory.statistics.total.opening.value}
                      closingValue={game.lineHistory.statistics.total.closing.value}
                      movement={game.lineHistory.statistics.total.movement}
                      showLabels={true}
                      showCaption={true}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Edge Analysis */}
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Edge Analysis</h3>
            <InfoTooltip content={TOOLTIP_CONTENT.EDGE_GENERAL} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-sm text-gray-500 flex items-center justify-center gap-1 mb-1">
                Spread Edge
                <InfoTooltip content={TOOLTIP_CONTENT.SPREAD_EDGE} />
              </div>
              <div className={`text-xl font-bold ${game.edge?.atsEdge >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {game.edge?.atsEdge >= 0 ? '+' : ''}{game.edge?.atsEdge?.toFixed(1)} pts
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-500 flex items-center justify-center gap-1 mb-1">
                Total Edge
                <InfoTooltip content={TOOLTIP_CONTENT.TOTAL_EDGE_VALUE} />
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
                <InfoTooltip content={TOOLTIP_CONTENT.MAX_EDGE} />
              </div>
              <div className="text-xl font-bold text-gray-900">{game.edge?.maxEdge?.toFixed(1)} pts</div>
            </div>
          </div>
        </div>

        {/* Talent Component - Clear and Separate from HFA */}
        {(game.ratings?.home?.talentComponent !== null || game.ratings?.away?.talentComponent !== null) && (
          <div className="bg-white p-6 rounded-lg shadow mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Talent Component</h3>
              <InfoTooltip content={TOOLTIP_CONTENT.TALENT_COMPONENT} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-2 flex items-center gap-1">
                  {game.teams?.home?.team?.name || game.game.homeTeam}
                  <InfoTooltip content={`${TOOLTIP_CONTENT.TALENT_SOURCE} ${TOOLTIP_CONTENT.TALENT_DECAY}`} />
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {game.ratings.home.talentComponent !== null ? 
                    `${game.ratings.home.talentComponent >= 0 ? '+' : ''}${game.ratings.home.talentComponent.toFixed(1)} pts` :
                    '—'
                  }
                </div>
                {game.ratings.home.decay !== null && (
                  <div className="text-xs text-gray-500 mt-2">
                    Decay factor: {(game.ratings.home.decay * 100).toFixed(0)}% 
                    <span className="ml-1 text-gray-400">(weeks played: {Math.round((1 - game.ratings.home.decay) * 8)})</span>
                  </div>
                )}
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-2 flex items-center gap-1">
                  {game.teams?.away?.team?.name || game.game.awayTeam}
                  <InfoTooltip content={`${TOOLTIP_CONTENT.TALENT_SOURCE} ${TOOLTIP_CONTENT.TALENT_DECAY}`} />
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {game.ratings.away.talentComponent !== null ? 
                    `${game.ratings.away.talentComponent >= 0 ? '+' : ''}${game.ratings.away.talentComponent.toFixed(1)} pts` :
                    '—'
                  }
                </div>
                {game.ratings.away.decay !== null && (
                  <div className="text-xs text-gray-500 mt-2">
                    Decay factor: {(game.ratings.away.decay * 100).toFixed(0)}%
                    <span className="ml-1 text-gray-400">(weeks played: {Math.round((1 - game.ratings.away.decay) * 8)})</span>
                  </div>
                )}
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-2 flex items-center gap-1">
                  Talent Differential
                  <InfoTooltip content={`Home team talent advantage = (Home talent component) - (Away talent component). This is independent of Home Field Advantage (HFA). Positive means home team has more roster talent. ${TOOLTIP_CONTENT.TALENT_SOURCE}`} />
                </div>
                <div className={`text-2xl font-bold ${game.ratings.talentDifferential >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {game.ratings.talentDifferential >= 0 ? '+' : ''}{game.ratings.talentDifferential.toFixed(1)} pts
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Home advantage (independent of HFA)
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="text-xs text-gray-500">
                <strong>Data Source:</strong> 247 Sports Composite Talent Ratings (via CFBD API). 
                <strong className="ml-2">Decay:</strong> Talent influence decreases linearly from 100% at week 0 to 0% at week 8+ as game statistics become more reliable indicators of team strength.
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
                  <InfoTooltip content={TOOLTIP_CONTENT.POWER_RATING} />
                </div>
                <div className="text-2xl font-bold text-gray-900">{game.ratings.home.rating.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 flex items-center gap-1">
                  Confidence
                  <InfoTooltip content={TOOLTIP_CONTENT.CONFIDENCE} />
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
                  <InfoTooltip content={TOOLTIP_CONTENT.POWER_RATING} />
                </div>
                <div className="text-2xl font-bold text-gray-900">{game.ratings.away.rating.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 flex items-center gap-1">
                  Confidence
                  <InfoTooltip content={TOOLTIP_CONTENT.CONFIDENCE} />
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
          <div className="text-sm text-gray-500 flex items-center gap-1">
            Home Field Advantage (HFA)
            <InfoTooltip content={TOOLTIP_CONTENT.HFA} />
          </div>
              <div className="text-lg text-gray-900">{game.modelConfig?.hfa || 2.0} points</div>
              <div className="text-xs text-gray-500 mt-1">Separate from talent component</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Confidence Thresholds</div>
              <div className="text-sm text-gray-900">
                {game.modelConfig?.thresholds ? (
                  <>A ≥ {game.modelConfig.thresholds.A} pts, B ≥ {game.modelConfig.thresholds.B} pts, C ≥ {game.modelConfig.thresholds.C} pts</>
                ) : (
                  <>A ≥ 4.0 pts, B ≥ 3.0 pts, C ≥ 2.0 pts</>
                )}
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
