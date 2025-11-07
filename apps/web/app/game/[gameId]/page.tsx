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
    const fetchStart = Date.now();
    try {
      const response = await fetch(`/api/game/${params.gameId}`);
      const fetchTime = Date.now() - fetchStart;
      const payloadTime = parseInt(response.headers.get('X-Payload-Time') || '0', 10);
      const isRevalidated = response.headers.get('X-Revalidated') === 'true';
      
      const data = await response.json();
      
      if (data.success) {
        const renderStart = Date.now();
        setGame(data);
        const renderTime = Date.now() - renderStart;
        
        // Calculate ticket render metrics
        const ticketRenderStart = Date.now();
        // Ticket is rendered synchronously, so we measure after setGame
        const ticketRenderTime = Date.now() - ticketRenderStart;
        
        // Performance telemetry (dev only)
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Game Detail] Performance: Fetch ${fetchTime}ms | Payload ${payloadTime}ms | Render ${renderTime}ms | Revalidated: ${isRevalidated}`);
          console.log(`[Betting Ticket] Render: ${ticketRenderTime}ms | Cards shown: ${[
            data.picks?.spread?.grade ? 'Spread' : null,
            data.picks?.total?.grade && !data.picks?.total?.hidden ? 'Total' : null,
            data.picks?.moneyline ? 'Moneyline' : null
          ].filter(Boolean).join(', ') || 'None'}`);
        }
        
        // Log ticket telemetry event (production)
        const ticketTelemetry = {
          ticket_render_ms: ticketRenderTime,
          api_latency_ms: payloadTime,
          fetch_time_ms: fetchTime,
          render_time_ms: renderTime,
          revalidated: isRevalidated,
          flags: {
            invalidModelTotal: data.validation?.invalidModelTotal || false,
            favoritesDisagree: data.validation?.favoritesDisagree || false,
            edgeAbsGt20: data.validation?.edgeAbsGt20 || false
          },
          cards_shown: {
            spread: !!data.picks?.spread?.grade,
            total: !!(data.picks?.total?.grade && !data.picks?.total?.hidden),
            moneyline: !!data.picks?.moneyline
          }
        };
        
        // Log structured event (in production, this could go to analytics)
        console.log('[Ticket Telemetry]', JSON.stringify(ticketTelemetry));
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

  // Helper to render rank chips with freshness tooltip and source/timestamp
  const renderRankChips = (rankings: any, week?: number, season?: number, source?: string, timestamp?: string) => {
    if (!rankings) return null;
    
    const chips = [];
    const timestampStr = timestamp ? new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Chicago'
    }) : null;
    const tooltipContent = week && season 
      ? `Week ${week}, ${season} season. Rankings update weekly.${source ? ` Source: ${source}.` : ''}${timestampStr ? ` Generated: ${timestampStr}.` : ''}`
      : `Rankings update weekly.${source ? ` Source: ${source}.` : ''}${timestampStr ? ` Generated: ${timestampStr}.` : ''}`;
    
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

  const snapshot = game.market_snapshot;
  const diagnostics = game.diagnostics ?? {};
  const allDiagnosticsMessages: string[] = Array.isArray(diagnostics.messages) ? diagnostics.messages : [];
  const modelView = game.model_view ?? {};
  const atsEdgePts = modelView.edges?.atsEdgePts ?? null;
  const ouEdgePts = modelView.edges?.ouEdgePts ?? null;
  const atsEdgeValue = atsEdgePts;
  const ouEdgeValue = ouEdgePts;
  const atsEdgeForDisplay = atsEdgeValue ?? game.picks?.spread?.edgePts ?? 0;
  const ouEdgeForDisplay = ouEdgeValue ?? game.picks?.total?.edgePts ?? 0;
  const atsEdgeMagnitude = Math.abs(atsEdgeForDisplay);
  const ouEdgeMagnitude = Math.abs(ouEdgeForDisplay);
  const atsEdgeSign = atsEdgeValue ?? 0;
  const ouEdgeSign = ouEdgeValue ?? 0;
  const atsValueSide = atsEdgeValue !== null
    ? (atsEdgeValue > 0.5 ? 'dog' : atsEdgeValue < -0.5 ? 'favorite' : null)
    : null;
  const ouValueSide = ouEdgeValue !== null
    ? (ouEdgeValue > 0.5 ? 'Over' : ouEdgeValue < -0.5 ? 'Under' : null)
    : null;
  const formatUpdated = (iso: string | undefined | null) => {
    if (!iso) return 'Unknown';
    try {
      const date = new Date(iso);
      return date.toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (err) {
      return 'Unknown';
    }
  };
  const bookStamp = snapshot
    ? `${snapshot.bookSource || 'Unknown'} • Updated ${formatUpdated(snapshot.updatedAt)} • Snapshot ${snapshot.snapshotId}`
    : null;
  const totalsReason = diagnostics.totalsUnits?.reason;
  const totalsCaution = allDiagnosticsMessages.find((msg) => msg.includes('Model total is far from market'));
  const diagnosticsMessages = totalsCaution
    ? allDiagnosticsMessages.filter((msg) => msg !== totalsCaution)
    : allDiagnosticsMessages;
  const formatMoneyline = (price: number | null | undefined) => {
    if (price === null || price === undefined) return '—';
    return `${price > 0 ? '+' : ''}${price}`;
  };
  const spreadBetTo = game.picks?.spread?.betTo ?? null;
  const totalBetTo = game.picks?.total?.betTo ?? null;
  const maxEdgeValue = Math.max(atsEdgeMagnitude, ouEdgeMagnitude);
  const strongerEdgeLabel = atsEdgeMagnitude >= ouEdgeMagnitude ? 'ATS' : 'OU';
  const hasEdgeData = (atsEdgeValue !== null && !Number.isNaN(atsEdgeValue)) || (ouEdgeValue !== null && !Number.isNaN(ouEdgeValue));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Matchup Header - Compact on mobile */}
          <div className="mb-4 md:mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="flex-1">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{game.game.matchup}</h1>
                <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2">
                  {game.game.kickoff} • {game.game.venue} {game.game.neutralSite && '(Neutral)'}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-xs sm:text-sm text-gray-500 flex items-center gap-1">
                  Model Version
                  <InfoTooltip content={TOOLTIP_CONTENT.MODEL_VERSION} />
                </div>
                <Link 
                  href="/docs/changelog"
                  className="text-base sm:text-lg font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors inline-block"
                >
                  {game.modelConfig.version}
                </Link>
              </div>
            </div>
          </div>

          {/* Validation Warnings (if any flags raised) - only show specific warnings */}
          {game.validation && (game.validation.modelTotalWarning || game.validation.favoritesDisagree || game.validation.edgeAbsGt20) && (
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
                    <InfoTooltip content="This warning appears when data quality checks detect specific issues. The exact problems are listed below." />
                  </div>
                  <div className="text-sm text-yellow-800 space-y-1">
                    {game.validation.modelTotalWarning && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">⚠️</span>
                        <span>{game.validation.modelTotalWarning}</span>
                      </div>
                    )}
                    {game.validation.favoritesDisagree && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">⚠️ Price Mismatch:</span>
                        <span>
                          {game.model_view?.modelFavoriteName && game.market_snapshot?.favoriteTeamName && game.model_view?.edges?.atsEdgePts !== null ? (
                            <>
                              Model prices {game.model_view.modelFavoriteName} {game.model_view.modelFavoriteLine.toFixed(1)} while market prices {game.market_snapshot.favoriteTeamName} {game.market_snapshot.favoriteLine.toFixed(1)} — value exists on {game.model_view.edges.atsEdgePts > 0.5 ? game.market_snapshot.dogTeamName : game.model_view.edges.atsEdgePts < -0.5 ? game.market_snapshot.favoriteTeamName : 'no edge'} {game.model_view.edges.atsEdgePts > 0.5 ? `+${game.market_snapshot.dogLine.toFixed(1)}` : game.model_view.edges.atsEdgePts < -0.5 ? game.market_snapshot.favoriteLine.toFixed(1) : ''}
                              {game.picks.spread.betTo !== null && game.picks.spread.betTo !== undefined && (
                                <> (up to {game.picks.spread.betTo >= 0 ? '+' : ''}{game.picks.spread.betTo.toFixed(1)})</>
                              )}
                            </>
                          ) : (
                            'Model and market favor different teams'
                          )}
                        </span>
                      </div>
                    )}
                    {game.validation.edgeAbsGt20 && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">⚠️ Large Edge Detected:</span>
                        <span>Edge magnitude exceeds 20 points (ATS: {atsEdgeValue !== null ? atsEdgeValue.toFixed(1) : '0.0'} pts, Total: {ouEdgeValue !== null ? ouEdgeValue.toFixed(1) : '0.0'} pts)</span>
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

          {diagnosticsMessages.length > 0 && (
            <div className="space-y-2 mb-6">
              {diagnosticsMessages.map((msg, index) => (
                <div
                  key={index}
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                >
                  {msg}
                </div>
              ))}
            </div>
          )}

          {/* Team Strips with Logos, Ranks, Records, Form - Priority above fold */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 mb-4 md:mb-6 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {/* Away Team Strip */}
              <div className="flex items-center gap-4">
                <TeamLogo 
                  teamName={game.teams?.away?.team?.name || game.game.awayTeam}
                  teamId={game.teams?.away?.team?.id}
                  size="lg"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Link 
                      href={`/team/${game.teams?.away?.team?.id || game.game.awayTeam.toLowerCase().replace(/\s+/g, '-')}`}
                      className="text-xl font-bold text-gray-900 hover:text-blue-600 hover:underline transition-colors"
                      aria-label={`View ${game.teams?.away?.team?.name || game.game.awayTeam} team details`}
                    >
                      {game.teams?.away?.team?.name || game.game.awayTeam}
                    </Link>
                    {/* Rank chips or Unranked */}
                    {renderRankChips(game.rankings?.away, game.game?.week, game.game?.season, 'CFBD', undefined) || (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        Unranked
                      </span>
                    )}
                    {/* Record chip */}
                    {game.teams?.away?.record && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        <InfoTooltip content="Overall record" />
                        Record: {game.teams.away.record.wins}–{game.teams.away.record.losses}
                      </span>
                    )}
                    {/* Last 5 chip */}
                    {game.teams?.away?.form && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 font-mono tracking-wider">
                        <InfoTooltip content="Last five results" />
                        Last 5: {game.teams.away.form}
                      </span>
                    )}
                    {/* Streak chip */}
                    {game.teams?.away?.streak && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                        <InfoTooltip content="Current streak" />
                        Streak: {game.teams.away.streak}
                      </span>
                    )}
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
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Link 
                      href={`/team/${game.teams?.home?.team?.id || game.game.homeTeam.toLowerCase().replace(/\s+/g, '-')}`}
                      className="text-xl font-bold text-gray-900 hover:text-blue-600 hover:underline transition-colors"
                      aria-label={`View ${game.teams?.home?.team?.name || game.game.homeTeam} team details`}
                    >
                      {game.teams?.home?.team?.name || game.game.homeTeam}
                    </Link>
                    {/* Rank chips or Unranked */}
                    {renderRankChips(game.rankings?.home, game.game?.week, game.game?.season, 'CFBD', undefined) || (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        Unranked
                      </span>
                    )}
                    {/* Record chip */}
                    {game.teams?.home?.record && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        <InfoTooltip content="Overall record" />
                        Record: {game.teams.home.record.wins}–{game.teams.home.record.losses}
                      </span>
                    )}
                    {/* Last 5 chip */}
                    {game.teams?.home?.form && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 font-mono tracking-wider">
                        <InfoTooltip content="Last five results" />
                        Last 5: {game.teams.home.form}
                      </span>
                    )}
                    {/* Streak chip */}
                    {game.teams?.home?.streak && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                        <InfoTooltip content="Current streak" />
                        Streak: {game.teams.home.streak}
                      </span>
                    )}
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

          {/* Betting Lines Summary - Priority above fold */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-4 md:mb-6">
            <h3 className="text-base sm:text-lg font-semibold text-blue-900 mb-2 sm:mb-3 flex items-center gap-2">
              Betting Lines
              <InfoTooltip content={TOOLTIP_CONTENT.MARKET_LINES} />
            </h3>
            {bookStamp && (
              <div className="text-xs text-blue-700 mb-2 sm:mb-3">{bookStamp}</div>
            )}
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div className="bg-white p-3 rounded border border-blue-100">
                <div className="text-xs text-gray-600 mb-1">Spread</div>
                <div className="text-xl font-bold text-gray-900">
                  {snapshot?.favoriteLine !== undefined && snapshot?.favoriteLine !== null
                    ? snapshot.favoriteLine.toFixed(1)
                    : '—'}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {game.market_snapshot?.favoriteTeamName ? `${game.market_snapshot.favoriteTeamName} favored` : 'Favorite unavailable'}
                </div>
                {/* Dev diagnostic (only in dev mode) */}
                {process.env.NODE_ENV !== 'production' && game.market_snapshot && (
                  <div className="text-xs text-gray-400 mt-1 font-mono">
                    snapshot: {game.market_snapshot.favoriteTeamName} {game.market_snapshot.favoriteLine.toFixed(1)} | {game.market_snapshot.dogTeamName} +{game.market_snapshot.dogLine.toFixed(1)} | snapshotId: {game.diagnostics?.snapshotId?.substring(0, 19)}
                  </div>
                )}
              </div>
              <div className="bg-white p-3 rounded border border-blue-100">
                <div className="text-xs text-gray-600 mb-1">Total (Over/Under)</div>
                <div className="text-xl font-bold text-gray-900">
                  {snapshot?.marketTotal !== undefined && snapshot?.marketTotal !== null
                    ? snapshot.marketTotal.toFixed(1)
                    : '—'}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {snapshot?.marketTotal !== undefined && snapshot?.marketTotal !== null
                    ? `Market total ${snapshot.marketTotal.toFixed(1)}`
                    : 'Total unavailable'}
                </div>
              </div>
              <div className="bg-white p-3 rounded border border-blue-100">
                <div className="text-xs text-gray-600 mb-1">Moneyline</div>
                {snapshot && (snapshot.moneylineFavorite !== null || snapshot.moneylineDog !== null) ? (
                  <>
                    <div className="text-sm text-gray-700">
                      {snapshot.favoriteTeamName}: <span className="font-semibold text-gray-900">{formatMoneyline(snapshot.moneylineFavorite)}</span>
                    </div>
                    <div className="text-sm text-gray-700 mt-1">
                      {snapshot.dogTeamName}: <span className="font-semibold text-gray-900">{formatMoneyline(snapshot.moneylineDog)}</span>
                    </div>
                  </>
                ) : game.market.moneyline ? (
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
            {bookStamp && (
              <div className="text-xs text-gray-500 mt-3 text-center">{bookStamp}</div>
            )}
          </div>

          {/* Betting Ticket - Single unified block above fold */}
          <div className="mb-4 md:mb-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Betting Ticket</h2>
                {/* Trust-Market Mode Badge */}
                {game.modelConfig?.mode === 'trust_market' && (
                  <div className="bg-blue-50 border border-blue-300 rounded-md px-3 py-1 flex items-center gap-2">
                    <span className="text-xs font-semibold text-blue-800">
                      Mode: Trust-Market
                    </span>
                    <InfoTooltip content={game.modelConfig?.description || "Trust-Market mode: Uses market as baseline with small model overlays (capped at ±3.0 pts)"} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {game.modelConfig?.version && (
                  <span className="text-xs text-gray-500">
                    Model {game.modelConfig.version}
                  </span>
                )}
                {renderRankChips(game.rankings?.home, game.game?.week, game.game?.season, 'CFBD', undefined)}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Spread Card - Independent Validation */}
              {game.validation?.ats_inputs_ok ? (
                game.picks?.spread?.grade && game.picks?.spread?.bettablePick ? (
                  <div className="bg-white border-2 border-blue-300 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">AGAINST THE SPREAD</h3>
                      <div className="flex items-center gap-2">
                        {game.picks.spread.favoritesDisagree && (
                          <div className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                            <InfoTooltip content={`Model rates ${game.model?.favorite?.teamName || 'one team'} ${game.model?.favorite?.spread.toFixed(1) || ''} on neutral. Market price is ${game.market?.favorite?.teamName || 'another team'} ${game.market?.favorite?.spread.toFixed(1) || ''}. Value exists on ${game.picks?.spread?.bettablePick?.teamName || 'the underdog'} at ${game.picks?.spread?.bettablePick?.line?.toFixed(1) || ''} or better.`} />
                            <span>Model vs Market Mismatch</span>
                          </div>
                        )}
                        <div 
                          className={`px-2 py-1 rounded text-xs font-bold ${
                            game.picks.spread.grade === 'A' ? 'bg-green-500 text-white' :
                            game.picks.spread.grade === 'B' ? 'bg-yellow-500 text-white' :
                            'bg-orange-500 text-white'
                          }`}
                          aria-label={`Grade ${game.picks.spread.grade} spread pick`}
                        >
                          Grade {game.picks.spread.grade}
                        </div>
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 mb-2" aria-label={`Spread pick ${game.picks.spread.bettablePick.label || 'No edge'}`}>
                      {game.picks.spread.bettablePick?.suppressHeadline || game.picks.spread.bettablePick?.extremeFavoriteBlocked ? (
                        /* EXTREME FAVORITE: Suppress dog headline, show market line instead */
                        snapshot ? `No edge at current number — market ${snapshot.favoriteTeamName} ${snapshot.favoriteLine.toFixed(1)}` : 'No edge at current number.'
                      ) : snapshot && atsValueSide ? (
                        atsValueSide === 'dog'
                          ? `${snapshot.dogTeamName} +${snapshot.dogLine.toFixed(1)}`
                          : `${snapshot.favoriteTeamName} ${snapshot.favoriteLine.toFixed(1)}`
                      ) : (
                        'No edge at current number.'
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-gray-600">
                        Edge: <span className="font-semibold text-blue-600">{atsEdgeMagnitude.toFixed(1)} pts</span>
                      </span>
                      <InfoTooltip content="ATS Edge = Model line vs market line, expressed in points of advantage for this ticket's side. A ≥ 4.0 pts, B ≥ 3.0 pts, C ≥ 2.0 pts." />
                    </div>
                    {snapshot && atsValueSide && spreadBetTo !== null && spreadBetTo !== undefined && (
                      <div className="text-xs text-gray-500 mt-1 mb-2">
                        Bet to: {atsValueSide === 'dog' ? `+${spreadBetTo.toFixed(1)}` : spreadBetTo.toFixed(1)} (edge floor 2.0 pts)
                      </div>
                    )}
                    {/* RANGE: Flip Point - Show when we have flip data, even if headline suppressed */}
                    {game.picks.spread.bettablePick?.flip !== null && game.picks.spread.bettablePick?.flip !== undefined && game.picks.spread.bettablePick?.betTo !== null && game.picks.spread.bettablePick?.betTo !== undefined && snapshot && (
                      <div className="text-xs text-gray-600 mt-1 mb-2 border-t border-gray-200 pt-2">
                        <span className="font-semibold">Range:</span> Value on {snapshot.favoriteTeamName} to {game.picks.spread.bettablePick.betTo.toFixed(1)}; flips to {snapshot.dogTeamName} at {game.picks.spread.bettablePick.flip > 0 ? `+${game.picks.spread.bettablePick.flip.toFixed(1)}` : game.picks.spread.bettablePick.flip.toFixed(1)}
                      </div>
                    )}
                  {game.picks.spread.rationale && (
                    <div className="text-xs text-gray-700 mt-2 italic border-t border-gray-200 pt-2">
                      {game.picks.spread.rationale}
                    </div>
                  )}
                  {/* Trust-Market Overlay Note */}
                  {game.picks.spread.overlay && (
                    <div className="text-xs text-gray-600 mt-2 border-t border-gray-200 pt-2">
                      <div className="mb-1">
                        <span className="font-semibold">Model overlay:</span> {game.picks.spread.overlay.overlayValue >= 0 ? '+' : ''}{game.picks.spread.overlay.overlayValue.toFixed(1)} pts (cap ±{game.picks.spread.overlay.cap})
                      </div>
                      {/* Yellow banner for extreme favorite dog picks */}
                      {game.picks.spread.bettablePick?.extremeFavoriteBlocked && (
                        <div className="mt-2 text-yellow-800 bg-yellow-50 border border-yellow-300 rounded p-2 flex items-start gap-2">
                          <span className="text-lg">🚫</span>
                          <span className="flex-1">
                            <span className="font-semibold">Extreme favorite game:</span> Model overlay favors the underdog, but we don't recommend 20+ point dogs. Range guidance provided.
                          </span>
                        </div>
                      )}
                      {game.picks.spread.overlay.confidenceDegraded && (
                        <div className="mt-2 text-yellow-800 bg-yellow-50 border border-yellow-300 rounded p-2 flex items-start gap-2">
                          <span className="text-lg">⚠️</span>
                          <span className="flex-1">
                            <span className="font-semibold">Large raw disagreement:</span> Model spread differs from market by {game.picks.spread.overlay.rawDisagreement.toFixed(1)} pts. Overlay capped in Trust-Market mode.
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  {game.clvHint?.spreadDrift?.significant && (
                    <div className="text-xs text-green-700 mt-2 italic" aria-label={`Closing line value drift ${game.clvHint.spreadDrift.drift >= 0 ? '+' : ''}${game.clvHint.spreadDrift.drift.toFixed(1)} points`}>
                      Line drift: {game.clvHint.spreadDrift.opening.toFixed(1)} → {game.clvHint.spreadDrift.closing.toFixed(1)} ({game.clvHint.spreadDrift.drift >= 0 ? '+' : ''}{game.clvHint.spreadDrift.drift.toFixed(1)}) toward model.
                    </div>
                  )}
                  {/* Dev diagnostic - ATS decision trace */}
                  {process.env.NODE_ENV !== 'production' && snapshot && (
                    <div className="text-xs text-gray-400 mt-2 font-mono border-t border-gray-200 pt-2">
                      <div>atsEdgePts: {atsEdgePts?.toFixed(1) ?? 'null'} | edgeFloor: 2.0</div>
                      <div>marketFav: {snapshot.favoriteTeamName} {snapshot.favoriteLine.toFixed(1)} | marketDog: {snapshot.dogTeamName} +{snapshot.dogLine.toFixed(1)}</div>
                      <div>modelFav: {game.model_view?.modelFavoriteName ?? 'pick\'em'} {game.model_view?.modelFavoriteLine?.toFixed(1) ?? '0.0'}</div>
                      <div>valueSide: {atsValueSide ?? 'none'} → headline: {atsValueSide === 'dog' ? `${snapshot.dogTeamName} +${snapshot.dogLine.toFixed(1)}` : atsValueSide === 'favorite' ? `${snapshot.favoriteTeamName} ${snapshot.favoriteLine.toFixed(1)}` : 'No edge'}</div>
                    </div>
                  )}
                </div>
                ) : (
                  /* No Edge State - ats_inputs_ok but overlay < floor */
                  <div className="bg-white border-2 border-gray-300 rounded-lg p-4 shadow-sm">
                    <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">AGAINST THE SPREAD</h3>
                    <div className="text-lg font-semibold text-gray-900 mb-2">
                      No edge at current number — market {snapshot ? (atsValueSide === 'dog' ? `+${snapshot.dogLine.toFixed(1)}` : snapshot.favoriteLine.toFixed(1)) : 'N/A'}
                    </div>
                    {game.picks?.spread?.overlay && (
                      <div className="text-xs text-gray-600">
                        Model overlay {game.picks.spread.overlay.overlayValue >= 0 ? '+' : ''}{game.picks.spread.overlay.overlayValue.toFixed(1)} pts ({'<'} 2.0 threshold)
                      </div>
                    )}
                  </div>
                )
              ) : (
                /* Invalid Inputs State - !ats_inputs_ok */
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">AGAINST THE SPREAD</h3>
                  <div className="text-lg font-semibold text-gray-900 mb-2">
                    ATS unavailable
                  </div>
                  <div className="text-sm text-gray-600">
                    {game.validation?.ats_reason || 'Model spread unavailable this week.'}
                  </div>
                </div>
              )}

              {/* Total Card - Independent Validation */}
              {game.validation?.ou_inputs_ok ? (
                game.picks?.total?.totalState === 'pick' && game.picks?.total?.grade ? (
                  /* Pick State - Has edge */
                <div className="bg-white border-2 border-green-300 rounded-lg p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">TOTAL (Over/Under)</h3>
                    {game.picks.total.grade && (
                      <div 
                        className={`px-2 py-1 rounded text-xs font-bold ${
                          game.picks.total.grade === 'A' ? 'bg-green-500 text-white' :
                          game.picks.total.grade === 'B' ? 'bg-yellow-500 text-white' :
                          'bg-orange-500 text-white'
                        }`}
                        aria-label={`Grade ${game.picks.total.grade} total pick`}
                      >
                        Grade {game.picks.total.grade}
                      </div>
                    )}
                  </div>
                  {/* Headline: ALWAYS market total (not model) */}
                  <div className="text-2xl font-bold text-gray-900 mb-2" aria-label={`Market total ${game.picks.total.headlineTotal?.toFixed(1)}`}>
                    Total {game.picks.total.headlineTotal?.toFixed(1)}
                    <InfoTooltip content="The current market total. Model predictions are used only to assess edge, not displayed in headline." />
                  </div>
                  {/* Subhead: Pick/Edge/Bet-to */}
                  <div className="text-sm text-gray-600 mb-2">
                    {ouValueSide && snapshot?.marketTotal !== undefined && snapshot?.marketTotal !== null ? (
                      <>
                        Pick: <span className="font-semibold text-gray-900">{ouValueSide} {snapshot.marketTotal.toFixed(1)}</span>
                        {' • '}
                        Edge: <span className="font-semibold text-green-600">{ouEdgeMagnitude.toFixed(1)} pts</span>
                        {totalBetTo !== null && totalBetTo !== undefined && (
                          <>
                            {' • '}
                            Bet to: <span className="font-semibold text-gray-900">{totalBetTo.toFixed(1)}</span>
                            {' '}(edge floor 2.0 pts)
                          </>
                        )}
                      </>
                    ) : (
                      <>No edge at current number — market {snapshot?.marketTotal?.toFixed(1) ?? 'N/A'}</>
                    )}
                  </div>
                  {/* RANGE: Flip Point */}
                  {game.picks.total?.flip !== null && game.picks.total?.flip !== undefined && ouValueSide && totalBetTo !== null && (
                    <div className="text-xs text-gray-600 mt-1 mb-2 border-t border-gray-200 pt-2">
                      <span className="font-semibold">Range:</span> Value now to {totalBetTo.toFixed(1)}; flips to {ouValueSide === 'Over' ? 'Under' : 'Over'} at {game.picks.total.flip.toFixed(1)}
                    </div>
                  )}
                  {ouValueSide && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mb-2">
                      <InfoTooltip content="Edge = difference between model total and current market total." />
                      <span>Edge from model-vs-market; Bet to enforces the 2.0 pt edge floor.</span>
                    </div>
                  )}
                  {totalsCaution && (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
                      {totalsCaution}
                    </div>
                  )}
                  {/* Rationale line */}
                  {game.picks.total.rationale && (
                    <div className="text-xs text-gray-500 mt-2 italic border-t border-gray-200 pt-2">
                      {game.picks.total.rationale}
                    </div>
                  )}
                  {/* Trust-Market Overlay Note */}
                  {game.picks.total.overlay && (
                    <div className="text-xs text-gray-600 mt-2 border-t border-gray-200 pt-2">
                      <div className="mb-1">
                        <span className="font-semibold">Model overlay:</span> {game.picks.total.overlay.overlayValue >= 0 ? '+' : ''}{game.picks.total.overlay.overlayValue.toFixed(1)} pts (cap ±{game.picks.total.overlay.cap})
                      </div>
                      {game.picks.total.overlay.confidenceDegraded && (
                        <div className="mt-2 text-yellow-800 bg-yellow-50 border border-yellow-300 rounded p-2 flex items-start gap-2">
                          <span className="text-lg">⚠️</span>
                          <span className="flex-1">
                            <span className="font-semibold">Large raw disagreement:</span> Model total differs from market by {game.picks.total.overlay.rawDisagreement.toFixed(1)} pts. Overlay capped in Trust-Market mode.
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  {/* CLV hint */}
                  {game.clvHint?.totalDrift?.significant && (
                    <div className="text-xs text-green-700 mt-2 italic" aria-label={`Closing line value drift ${game.clvHint.totalDrift.drift >= 0 ? '+' : ''}${game.clvHint.totalDrift.drift.toFixed(1)} points`}>
                      Drift toward model ({game.clvHint.totalDrift.drift >= 0 ? '+' : ''}{game.clvHint.totalDrift.drift.toFixed(1)})
                    </div>
                  )}
                  {/* Dev diagnostics (only in dev mode) */}
                  {process.env.NODE_ENV !== 'production' && game.total_diag && (
                    <details className="mt-3 pt-3 border-t border-gray-200">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">Diagnostics</summary>
                      <div className="mt-2 text-xs font-mono bg-gray-50 p-2 rounded overflow-auto max-h-64">
                        <pre>{JSON.stringify(game.total_diag, null, 2)}</pre>
                      </div>
                    </details>
                  )}
                </div>
                ) : (
                  /* No Edge State - ou_inputs_ok but overlay < floor */
                  <div className="bg-white border-2 border-gray-300 rounded-lg p-4 shadow-sm">
                    <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">TOTAL (Over/Under)</h3>
                    <div className="text-lg font-semibold text-gray-900 mb-2">
                      Total {game.picks?.total?.headlineTotal?.toFixed(1) || snapshot?.marketTotal?.toFixed(1) || 'N/A'}
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      No edge at current number — market {snapshot?.marketTotal?.toFixed(1) ?? 'N/A'}
                    </div>
                    {game.picks?.total?.overlay && (
                      <div className="text-xs text-gray-600">
                        Model overlay {game.picks.total.overlay.overlayValue >= 0 ? '+' : ''}{game.picks.total.overlay.overlayValue.toFixed(1)} pts ({'<'} 2.0 threshold)
                      </div>
                    )}
                  </div>
                )
              ) : (
                /* Invalid Inputs State - !ou_inputs_ok */
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">TOTAL (Over/Under)</h3>
                  <div className="text-lg font-semibold text-gray-900 mb-2">
                    Total unavailable
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    {game.validation?.ou_reason || 'Model total unavailable this week.'}
                  </div>
                  <div className="text-xs text-gray-500">
                    Headline shows market number: {snapshot?.marketTotal?.toFixed(1) ?? 'N/A'}
                  </div>
                </div>
              )}

              {/* Moneyline Card */}
              {game.picks?.moneyline && game.picks.moneyline.pickLabel ? (
                <div className="bg-white border-2 border-purple-300 rounded-lg p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">MONEYLINE</h3>
                    {game.picks.moneyline.grade && (
                      <div 
                        className={`px-2 py-1 rounded text-xs font-bold ${
                          game.picks.moneyline.grade === 'A' ? 'bg-green-500 text-white' :
                          game.picks.moneyline.grade === 'B' ? 'bg-yellow-500 text-white' :
                          'bg-orange-500 text-white'
                        }`}
                        aria-label={`Moneyline value ${game.picks.moneyline.valuePercent?.toFixed(1)} percent, grade ${game.picks.moneyline.grade}`}
                      >
                        Grade {game.picks.moneyline.grade}
                      </div>
                    )}
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mb-2">
                    {game.picks.moneyline.pickLabel}
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    Market: {game.picks.moneyline.price! > 0 ? '+' : ''}{game.picks.moneyline.price}
                  </div>
                  {game.picks.moneyline.valuePercent != null && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-sm font-semibold ${game.picks.moneyline.valuePercent >= 0 ? 'text-green-600' : 'text-gray-600'}`}>
                        Value: {game.picks.moneyline.valuePercent >= 0 ? '+' : ''}{game.picks.moneyline.valuePercent.toFixed(1)}%
                      </span>
                      <InfoTooltip content="Value % = Model probability minus market implied probability. A ≥ 4.0% value, B ≥ 2.5%, C ≥ 1.5%." />
                    </div>
                  )}
                  {game.picks.moneyline.rationale && (
                    <div className="text-xs text-gray-700 mt-2 italic border-t border-gray-200 pt-2">
                      {game.picks.moneyline.rationale}
                    </div>
                  )}
                </div>
              ) : game.picks?.moneyline && game.picks.moneyline.isModelFairLineOnly ? (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">MONEYLINE</h3>
                  <div className="text-xl font-bold text-gray-900 mb-1">
                    {game.picks.moneyline.modelFavoriteTeam} — Model fair ML
                  </div>
                  <div className="text-lg font-semibold text-gray-700 mb-2">
                    {game.picks.moneyline.modelFairML! > 0 ? '+' : ''}{game.picks.moneyline.modelFairML}
                  </div>
                  <div className="text-xs text-gray-500 italic">
                    (No book ML available yet)
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">MONEYLINE</h3>
                  <div className="text-sm text-gray-600">
                    <div className="mb-2">
                      {snapshot && (snapshot.moneylineFavorite !== null || snapshot.moneylineDog !== null) ? (
                        <>
                          <div className="text-sm text-gray-700 mb-1">
                            {snapshot.favoriteTeamName}: <span className="font-semibold">{formatMoneyline(snapshot.moneylineFavorite)}</span>
                          </div>
                          <div className="text-sm text-gray-700">
                            {snapshot.dogTeamName}: <span className="font-semibold">{formatMoneyline(snapshot.moneylineDog)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-gray-500 italic">No market moneylines available</div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 italic border-t border-gray-300 pt-2 mt-2">
                      No moneyline bet recommended. Model does not see sufficient value at these odds, or the odds are too long (extreme longshot).
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer with sources and tooltips */}
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-gray-500">
                <span>
                  Odds: {game.market?.meta?.spread?.source || 'Unknown'}
                  {game.market?.meta?.spread?.timestamp && ` • ${new Date(game.market.meta.spread.timestamp).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: 'America/Chicago'
                  })}`}
                </span>
                <span>•</span>
                <span>Rankings: CFBD (AP/Coaches/CFP)</span>
                <span>•</span>
                <span>Talent: 247 Composite via CFBD</span>
                {game.weather && (
                  <>
                    <span>•</span>
                    <span>
                      Weather: {game.weather.source || 'VisualCrossing'}
                      {game.weather.forecastTime && ` • ${new Date(game.weather.forecastTime).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                        timeZone: 'America/Chicago'
                      })}`}
                    </span>
                  </>
                )}
                <span>•</span>
                <InfoTooltip content="Spreads are shown with the favorite team attached to the number (favorite-centric display), never by home/away." />
                <span className="text-gray-400 cursor-help">Favorite-centric display</span>
              </div>
            </div>
          </div>

          {/* Implied Score Breakdown (only when valid) */}
          {game.model?.impliedScores && game.model.impliedScores.home !== null && game.model.impliedScores.away !== null ? (
            <div className="bg-white p-6 rounded-lg shadow mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                Model Implied Score
                <InfoTooltip content="We split the model total using the model spread to produce predicted team scores." />
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-2">{game.model.impliedScores.awayTeam}</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {game.model.impliedScores.away?.toFixed(1) || '—'}
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-2">{game.model.impliedScores.homeTeam}</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {game.model.impliedScores.home?.toFixed(1) || '—'}
                  </div>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-3 text-center italic">
                Scores derived from model spread and model total.
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 p-4 rounded-lg mb-8">
              <div className="text-sm text-gray-600 italic">
                Implied score unavailable — inputs not reliable this week.
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
                        {game.market_snapshot?.favoriteTeamName ? `${game.market_snapshot.favoriteTeamName} ${game.market_snapshot.favoriteLine.toFixed(1)}` : '—'}
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
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    ATS Edge
                    <InfoTooltip content={TOOLTIP_CONTENT.ATS_EDGE_FORMULA} />
                  </div>
                  <div className={`text-sm font-medium flex items-center gap-1 ${atsEdgeSign >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {atsEdgeSign >= 0 ? (
                      <>
                        <span aria-hidden="true">↑</span>
                        <span className="sr-only">Positive edge</span>
                      </>
                    ) : (
                      <>
                        <span aria-hidden="true">↓</span>
                        <span className="sr-only">Negative edge</span>
                      </>
                    )}
                    {atsEdgeSign >= 0 ? '+' : ''}{atsEdgeForDisplay.toFixed(1)} pts
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
                  <div className="text-lg font-semibold text-gray-900">
                    {modelView.modelTotal !== null && modelView.modelTotal !== undefined ? modelView.modelTotal.toFixed(1) : '—'}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    Market Total
                    <InfoTooltip content={TOOLTIP_CONTENT.MARKET_TOTAL} />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-3">
                    <div className="text-lg font-semibold text-gray-900">{snapshot?.marketTotal !== null && snapshot?.marketTotal !== undefined ? snapshot.marketTotal.toFixed(1) : '—'}</div>
                      {game.lineHistory?.history?.total && game.lineHistory.history.total.length > 0 && (
                        <LineSparkline 
                          data={game.lineHistory.history.total} 
                          lineType="total"
                          width={150}
                          height={30}
                        />
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    Total Edge
                    <InfoTooltip content={TOOLTIP_CONTENT.TOTAL_EDGE_FORMULA} />
                  </div>
                  <div className={`text-sm font-medium flex items-center gap-1 ${ouEdgeSign >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {ouValueSide ? (
                      <>
                        <span aria-hidden="true">{ouEdgeSign >= 0 ? '↑ Over' : '↓ Under'}</span>
                        <span className="sr-only">{ouEdgeSign >= 0 ? 'Over edge' : 'Under edge'}</span>
                        {ouValueSide} {snapshot?.marketTotal !== undefined && snapshot?.marketTotal !== null ? snapshot.marketTotal.toFixed(1) : 'N/A'} (edge {ouEdgeSign >= 0 ? '+' : ''}{ouEdgeForDisplay.toFixed(1)} pts)
                      </>
                    ) : (
                      <>No edge at current number</>
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
              <div className="text-xs text-gray-500 mt-2">
                {game.weather.humidity && `Humidity: ${game.weather.humidity}% • `}
                Source: {game.weather.source || 'VisualCrossing'} • 
                {game.weather.forecastTime && ` Generated: ${new Date(game.weather.forecastTime).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                  timeZone: 'America/Chicago'
                })}`}
              </div>
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
                      openingValue={game.lineHistory.statistics.spread.opening.favoriteCentricValue ?? game.lineHistory.statistics.spread.opening.value}
                      closingValue={game.lineHistory.statistics.spread.closing.favoriteCentricValue ?? game.lineHistory.statistics.spread.closing.value}
                      movement={game.lineHistory.statistics.spread.movement}
                      showLabels={true}
                      showCaption={true}
                      favoriteTeamName={game.market_snapshot?.favoriteTeamName}
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
            {/* ATS Edge Chip */}
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 text-center">
              <div className="text-sm text-gray-600 flex items-center justify-center gap-1 mb-2">
                ATS Edge
                <InfoTooltip content="Difference between market spread and model spread expressed as points of value. Positive = more value at current number." />
              </div>
              <div className={`text-2xl font-bold flex items-center justify-center gap-1 ${atsEdgeSign >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {atsEdgeSign >= 0 ? (
                  <>
                    <span aria-hidden="true">↑</span>
                    <span className="sr-only">Positive edge</span>
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">↓</span>
                    <span className="sr-only">Negative edge</span>
                  </>
                )}
                {atsEdgeSign >= 0 ? '+' : ''}{atsEdgeForDisplay.toFixed(1)} pts
              </div>
              {game.model_view?.modelFavoriteName && game.market_snapshot?.favoriteTeamName && (
                <div className="text-xs text-gray-500 mt-2">
                  Model: {game.model_view.modelFavoriteName} {game.model_view.modelFavoriteLine.toFixed(1)} • Market: {game.market_snapshot.favoriteTeamName} {game.market_snapshot.favoriteLine.toFixed(1)}
                </div>
              )}
            </div>
            
            {/* OU Edge Chip */}
            <div className={`bg-green-50 border-2 rounded-lg p-4 text-center ${game.picks?.total?.totalState === 'no_model_total' ? 'border-amber-300 bg-amber-50' : 'border-green-200'}`}>
              <div className="text-sm text-gray-600 flex items-center justify-center gap-1 mb-2">
                OU Edge
                <InfoTooltip content="Difference between market total and model total, in points. Positive = more value at current number." />
              </div>
              {game.picks?.total?.totalState === 'no_model_total' ? (
                <>
                  <div className="text-lg text-gray-400 mb-1">—</div>
                  <div className="text-xs text-amber-700 mt-2">
                    {totalsReason ? (
                      <span>No model total — {totalsReason}</span>
                    ) : (
                      <span>No model total — missing inputs</span>
                    )}
                  </div>
                </>
              ) : ouEdgeValue !== null ? (
                <>
                  <div className={`text-2xl font-bold flex items-center justify-center gap-1 ${ouEdgeSign >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {ouEdgeSign >= 0 ? (
                      <>
                        <span aria-hidden="true">↑</span>
                        <span className="sr-only">Over edge</span>
                      </>
                    ) : (
                      <>
                        <span aria-hidden="true">↓</span>
                        <span className="sr-only">Under edge</span>
                      </>
                    )}
                    {ouEdgeSign >= 0 ? '+' : ''}{ouEdgeForDisplay.toFixed(1)} pts
                  </div>
                  <div className="text-sm font-semibold text-gray-700 mt-1">
                    {ouValueSide && snapshot?.marketTotal !== undefined && snapshot?.marketTotal !== null
                      ? `${ouValueSide} ${snapshot.marketTotal.toFixed(1)} → ${modelView.modelTotal !== null && modelView.modelTotal !== undefined ? modelView.modelTotal.toFixed(1) : 'N/A'}`
                      : 'No edge at current number'}
                  </div>
                  {modelView.modelTotal !== null && modelView.modelTotal !== undefined && snapshot?.marketTotal !== null && snapshot?.marketTotal !== undefined && (
                    <div className="text-xs text-gray-500 mt-2">
                      Model total: {modelView.modelTotal.toFixed(1)} • Market: {snapshot.marketTotal.toFixed(1)}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-lg text-gray-400 mb-1">—</div>
                  <div className="text-xs text-gray-500 mt-2">No model total available</div>
                </>
              )}
            </div>
            
            {/* Stronger Edge Chip */}
            <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4 text-center">
              <div className="text-sm text-gray-600 flex items-center justify-center gap-1 mb-2">
                Stronger Edge
                <InfoTooltip content="The larger of ATS/OU edges this game, based on the SSOT snapshot." />
              </div>
              {hasEdgeData ? (
                <>
                  <div className="text-2xl font-bold text-purple-600">
                    {maxEdgeValue.toFixed(1)} pts
                  </div>
                  <div className="text-sm font-semibold text-gray-700 mt-1">
                    {strongerEdgeLabel} edge
                  </div>
                </>
              ) : (
                <div className="text-lg text-gray-400">No edge data</div>
              )}
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
      {bookStamp && (
        <div className="mt-6 text-xs text-gray-500 text-center">{bookStamp}</div>
      )}
    </div>
  );
}
