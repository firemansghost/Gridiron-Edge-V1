/**
 * Labs: Hybrid V2 Shadow Dashboard
 *
 * Live/mutable research comparison. Not the official 2026 card.
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import { TeamLogo } from '@/components/TeamLogo';
import { ErrorState } from '@/components/ErrorState';
import { LabsNav } from '@/components/LabsNav';
import { downloadAsCsv } from '@/lib/csv-export';
import {
  CORE_V1_EFFECTIVE_PRODUCTION_LABEL,
  HYBRID_LIVE_MUTABLE_SHADOW,
  HYBRID_NOT_OFFICIAL_2026_BET,
  HYBRID_SHADOW_STATUS_LABEL,
  SUPER_TIER_A_FROZEN_QUALIFICATION,
  SUPER_TIER_A_SHADOW_STATUS,
  V4_FADE_HISTORICAL_STATUS,
  hybridShadowEmptyMessage,
  type HybridShadowCoverage,
  type HybridShadowCoverageKind,
  type HybridShadowGame,
  type HybridShadowStatus,
} from '@/lib/labs/hybrid-shadow-truth';

interface HybridGame extends HybridShadowGame {
  kickoffLocal?: string;
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

interface HybridSlateResponse {
  season: number;
  week: number;
  liveMutable?: string;
  status?: HybridShadowStatus;
  coverage?: HybridShadowCoverage;
  games: HybridGame[];
  count: number;
  error?: string;
}

export default function HybridLabsPage() {
  const [games, setGames] = useState<HybridGame[]>([]);
  const [coverage, setCoverage] = useState<HybridShadowCoverage | null>(null);
  const [hybridStatus, setHybridStatus] = useState<HybridShadowStatus | null>(
    null
  );
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

      const currentResponse = await fetch('/api/current-season-week');
      if (!currentResponse.ok) {
        throw new Error(
          `Failed to fetch current season/week: ${currentResponse.statusText}`
        );
      }
      const current = await currentResponse.json();
      const currentSeason = current.season;
      const currentWeek = current.week;
      if (!currentSeason || !currentWeek) {
        throw new Error('Current season/week was not returned');
      }

      setSeason(currentSeason);
      setWeek(currentWeek);

      const response = await fetch(
        `/api/labs/hybrid-slate?season=${currentSeason}&week=${currentWeek}`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch hybrid slate: ${response.statusText}`);
      }

      const data = (await response.json()) as HybridSlateResponse;
      if (data.error) {
        throw new Error(data.error);
      }
      setGames(data.games || []);
      setCoverage(data.coverage || null);
      setHybridStatus(data.status || null);
    } catch (err) {
      setError(
        'Network error: ' + (err instanceof Error ? err.message : 'Unknown error')
      );
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
      timeZone: 'America/Chicago',
    });
  };

  const formatSpread = (spread: number) => {
    if (spread === 0) return 'PK';
    return spread > 0 ? `+${spread.toFixed(1)}` : spread.toFixed(1);
  };

  const getDiffColor = (diff: number | null) => {
    if (diff == null) return '';
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
    if (
      !game.hybridAvailable ||
      !game.hybridSpread ||
      !game.marketSpread ||
      game.marketSpread.spreadHma == null
    ) {
      return null;
    }

    const hybridMargin = game.hybridSpread.hma;
    const marketMargin = game.marketSpread.spreadHma;
    const edge = hybridMargin - marketMargin;
    const pickHome = edge > 0;
    const pickTeamId = pickHome ? game.homeTeamId : game.awayTeamId;
    const pickTeamName = pickHome ? game.homeTeamName : game.awayTeamName;
    const absEdge = Math.abs(edge);

    return {
      teamId: pickTeamId,
      teamName: pickTeamName,
      marketSpreadHma: marketMargin,
      marketFavoriteTeamId: game.marketSpread.favoriteTeamId,
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

  const renderSpreadCell = (
    spread: HybridGame['v1Spread'],
    unavailable: boolean
  ) => {
    if (unavailable || !spread) {
      return <span className="text-xs text-gray-400">—</span>;
    }
    return (
      <>
        <div className="text-sm font-medium text-gray-900">
          {spread.favoriteName}
        </div>
        <div className="text-sm text-gray-600">
          {formatSpread(spread.favoriteSpread)}
        </div>
      </>
    );
  };

  const handleExportCsv = () => {
    const visibleGames = games.filter((game) => {
      if (hideNoOdds) {
        return (
          game.marketSpread !== null &&
          game.marketSpread !== undefined &&
          game.marketSpread.value !== null
        );
      }
      return true;
    });

    const csvRows = visibleGames.map((game) => {
      const pick = calculateHybridPick(game);
      return {
        Away_Team: game.awayTeamName,
        Home_Team: game.homeTeamName,
        Kickoff: formatKickoff(game.date),
        Hybrid_Available: game.hybridAvailable ? 'yes' : 'no',
        Unavailable: game.unavailableLabel || '',
        Core_V1_Spread: game.v1Spread
          ? `${game.v1Spread.favoriteName} ${formatSpread(game.v1Spread.favoriteSpread)}`
          : '—',
        V2_Spread: game.v2Spread
          ? `${game.v2Spread.favoriteName} ${formatSpread(game.v2Spread.favoriteSpread)}`
          : '—',
        Hybrid_Spread: game.hybridSpread
          ? `${game.hybridSpread.favoriteName} ${formatSpread(game.hybridSpread.favoriteSpread)}`
          : '—',
        Diff_Hybrid_Core_V1:
          game.diff == null
            ? '—'
            : game.diff > 0
              ? `+${game.diff.toFixed(1)}`
              : game.diff.toFixed(1),
        Market_HMA:
          game.marketSpread && game.marketSpread.spreadHma != null
            ? game.marketSpread.spreadHma.toFixed(1)
            : '—',
        Market_Favorite: game.marketSpread?.favoriteName
          ? `${game.marketSpread.favoriteName} ${
              game.marketSpread.spreadHma != null && game.marketSpread.spreadHma !== 0
                ? formatSpread(-Math.abs(game.marketSpread.spreadHma))
                : 'PK'
            }`
          : '—',
        Market_Row_TeamId: game.marketSpread?.teamId || '—',
        Market_Row_Value:
          game.marketSpread && game.marketSpread.value !== null
            ? formatSpread(game.marketSpread.value)
            : '—',
        Market_Book: game.marketSpread?.book || '—',
        Market_Timestamp: game.marketSpread?.timestamp || '—',
        Market_Source: game.marketSpread?.source || '—',
        Hybrid_Pick: pick ? pick.teamName : '—',
        Pick_Line: pick ? pick.marketSpreadHma.toFixed(1) : '—',
        Edge: pick ? pick.edge.toFixed(1) : '—',
      };
    });

    const filename = `hybrid-shadow-week-${week || 'unknown'}`;
    downloadAsCsv(filename, csvRows);
  };

  const coverageKind: HybridShadowCoverageKind =
    coverage?.coverageKind ||
    (games.length === 0 ? 'no_games' : 'games_without_hybrid');
  const totalGames = coverage?.totalGames ?? games.length;
  const emptyMessage = hybridShadowEmptyMessage(coverageKind, totalGames);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <HeaderNav />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading hybrid shadow data...</p>
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
            Models: Hybrid V2 Shadow
          </h1>
          <p className="text-gray-600 mb-4">
            {CORE_V1_EFFECTIVE_PRODUCTION_LABEL} is the effective official 2026
            production spread model. Hybrid V2 is held and shown here only as a
            shadow/research comparison.
            {season && week && ` — ${season} Week ${week}`}
          </p>
          <LabsNav />

          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-flex items-center rounded px-2 py-1 text-xs font-bold tracking-wide bg-amber-200 text-amber-950">
                {hybridStatus?.statusLabel || HYBRID_SHADOW_STATUS_LABEL}
              </span>
              <span className="inline-flex items-center rounded px-2 py-1 text-xs font-bold tracking-wide bg-red-100 text-red-800">
                {hybridStatus?.notOfficialBetLabel || HYBRID_NOT_OFFICIAL_2026_BET}
              </span>
              <span className="inline-flex items-center rounded px-2 py-1 text-xs font-bold tracking-wide bg-slate-200 text-slate-800">
                {HYBRID_LIVE_MUTABLE_SHADOW}
              </span>
            </div>
            <ul className="text-sm text-amber-950 space-y-1 list-disc list-inside">
              <li>
                Effective 2026 production spread model:{' '}
                <strong>
                  {hybridStatus?.effectiveProductionModel === 'hybrid_v2'
                    ? 'Hybrid V2'
                    : CORE_V1_EFFECTIVE_PRODUCTION_LABEL}
                </strong>
                . Official strategy tag remains <code>official_flat_100</code>.
              </li>
              <li>
                Hybrid production authorized:{' '}
                <strong>
                  {hybridStatus?.hybridProductionAuthorized ? 'true' : 'false'}
                </strong>
                {hybridStatus?.holdReason ? ` — ${hybridStatus.holdReason}` : ''}
              </li>
              <li>
                This page is a live recomputation from currently persisted model
                inputs and current market data. It is not a frozen pregame
                prediction, not the Official Card, and not a prospective 2026
                Hybrid performance record.
              </li>
              <li>
                Nothing on this page changes the Official Card. Hybrid selections
                shown here, when available, are not official wagers.
              </li>
              <li>
                Super Tier A is {SUPER_TIER_A_SHADOW_STATUS}. Frozen
                qualification remains actual Hybrid V2 spread selection,{' '}
                <code>{SUPER_TIER_A_FROZEN_QUALIFICATION.hybridConflictType}</code>
                , and absolute spread edge {'>='}{' '}
                {SUPER_TIER_A_FROZEN_QUALIFICATION.minAbsSpreadEdge.toFixed(1)}.
                This live shadow view does not claim a 2026 Super Tier A record.
              </li>
            </ul>
          </div>

          {coverage && (
            <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-800">
              <div className="font-semibold mb-1">Game frame / Hybrid coverage</div>
              <p>
                {coverage.totalGames} football games in this week.{' '}
                {coverage.computedGames} Hybrid predictions available.{' '}
                {coverage.unavailableGames} Hybrid unavailable.
              </p>
              <p className="mt-1 text-slate-600">{emptyMessage}</p>
            </div>
          )}

          {!v4SummaryLoading && v4Summary.length > 0 && (
            <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-yellow-900 mb-3">
                V4 (Labs) vs Fade V4 — {V4_FADE_HISTORICAL_STATUS}
              </h3>
              <div className="space-y-3">
                {[2024, 2025].map((s) => {
                  const seasonData = v4Summary.filter((sum) => sum.season === s);
                  if (seasonData.length === 0) return null;

                  const v4Data = seasonData.find(
                    (sum) => sum.strategy === 'v4_labs'
                  );
                  const fadeData = seasonData.find(
                    (sum) => sum.strategy === 'fade_v4_labs'
                  );

                  return (
                    <div
                      key={s}
                      className="bg-white rounded p-3 border border-yellow-200"
                    >
                      <div className="text-xs font-semibold text-yellow-800 mb-2">
                        {s} Season
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="font-medium text-gray-700 mb-1">
                            V4 (Labs)
                          </div>
                          <div className="space-y-0.5 text-gray-600">
                            <div>Bets: {v4Data?.bets ?? '—'}</div>
                            <div>
                              Win Rate:{' '}
                              {v4Data &&
                              v4Data.winRate !== null &&
                              v4Data.winRate !== undefined
                                ? `${v4Data.winRate.toFixed(1)}%`
                                : '—'}
                            </div>
                            <div
                              className={
                                v4Data?.roi !== undefined && v4Data.roi < 0
                                  ? 'text-red-600 font-medium'
                                  : 'text-gray-600'
                              }
                            >
                              ROI:{' '}
                              {v4Data?.roi !== undefined
                                ? `${v4Data.roi.toFixed(2)}%`
                                : '—'}
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="font-medium text-gray-700 mb-1">
                            Fade V4 (Labs)
                          </div>
                          <div className="space-y-0.5 text-gray-600">
                            <div>Bets: {fadeData?.bets ?? '—'}</div>
                            <div>
                              Win Rate:{' '}
                              {fadeData &&
                              fadeData.winRate !== null &&
                              fadeData.winRate !== undefined
                                ? `${fadeData.winRate.toFixed(1)}%`
                                : '—'}
                            </div>
                            <div
                              className={
                                fadeData?.roi !== undefined && fadeData.roi > 0
                                  ? 'text-green-600 font-medium'
                                  : 'text-gray-600'
                              }
                            >
                              ROI:{' '}
                              {fadeData?.roi !== undefined
                                ? `${fadeData.roi.toFixed(2)}%`
                                : '—'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-yellow-700 mt-3 italic">
                V4 and Fade V4 are historical Labs/backtest strategies for
                2024–2025 only. They are not 2026 production models and are not
                official wagers.
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
              <label
                htmlFor="hideNoOdds"
                className="text-sm font-medium text-gray-700 select-none cursor-pointer"
              >
                Hide games without market odds
              </label>
            </div>
            {games.length > 0 && (
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
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
                    Core V1
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    V2 (Matchup)
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hybrid V2 Shadow
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Diff (Hybrid − Core V1 HMA)
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Shadow Pick
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Current Market
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(() => {
                  const visibleGames = games.filter((game) => {
                    if (hideNoOdds) {
                      return (
                        game.marketSpread !== null &&
                        game.marketSpread !== undefined &&
                        game.marketSpread.value !== null
                      );
                    }
                    return true;
                  });

                  if (visibleGames.length === 0) {
                    const message =
                      games.length === 0
                        ? emptyMessage
                        : hideNoOdds
                          ? 'No games with current market odds are shown.'
                          : emptyMessage;
                    return (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-8 text-center text-gray-500"
                        >
                          {message}
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
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {!game.hybridAvailable && (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                                {game.unavailableLabel || 'Hybrid unavailable'}
                              </span>
                            )}
                            {game.hybridAvailable && (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-900 border border-amber-200">
                                {HYBRID_NOT_OFFICIAL_2026_BET}
                              </span>
                            )}
                            {game.favoritesDisagree && (
                              <span
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200"
                                title="Shadow model and current market favor different teams — not an official edge."
                              >
                                Favs Disagree
                              </span>
                            )}
                            <div className="text-xs text-gray-500">
                              {formatKickoff(game.date)}
                            </div>
                          </div>
                          {game.status === 'final' && (
                            <div className="text-xs font-semibold text-gray-700 mt-1">
                              {game.awayScore} - {game.homeScore}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          {renderSpreadCell(game.v1Spread, false)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          {renderSpreadCell(game.v2Spread, !game.hybridAvailable)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          {game.hybridAvailable && game.hybridSpread ? (
                            <>
                              <div className="text-sm font-semibold text-blue-900">
                                {game.hybridSpread.favoriteName}
                              </div>
                              <div className="text-sm font-semibold text-blue-600">
                                {formatSpread(game.hybridSpread.favoriteSpread)}
                              </div>
                            </>
                          ) : (
                            <div className="text-xs text-slate-600 max-w-[12rem] mx-auto">
                              {game.unavailableLabel || 'Hybrid unavailable'}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          {game.diff == null ? (
                            <span className="text-xs text-gray-400">—</span>
                          ) : (
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getDiffBadge(game.diff)}`}
                            >
                              {game.diff > 0 ? '+' : ''}
                              {game.diff.toFixed(1)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          {(() => {
                            const pick = calculateHybridPick(game);
                            if (!pick) {
                              return (
                                <span className="text-xs text-gray-400">—</span>
                              );
                            }
                            return (
                              <div className="space-y-1">
                                <div className="text-sm font-medium text-gray-900">
                                  {pick.teamName}
                                </div>
                                <div className="text-sm text-gray-600">
                                  HMA {pick.marketSpreadHma.toFixed(1)}
                                </div>
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getEdgeBadgeColor(pick.edge)}`}
                                >
                                  Edge: {pick.edge.toFixed(1)}
                                </span>
                                <div className="text-[10px] uppercase tracking-wide text-amber-800">
                                  Not official
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          {game.marketSpread &&
                          game.marketSpread.spreadHma != null ? (
                            <div className="text-sm text-gray-600">
                              <div className="font-medium text-gray-900">
                                {game.marketSpread.favoriteName
                                  ? `${game.marketSpread.favoriteName} ${
                                      game.marketSpread.spreadHma === 0
                                        ? 'PK'
                                        : formatSpread(
                                            -Math.abs(game.marketSpread.spreadHma)
                                          )
                                    }`
                                  : `HMA ${game.marketSpread.spreadHma.toFixed(1)}`}
                              </div>
                              <div className="text-[11px] text-gray-500">
                                HMA {game.marketSpread.spreadHma.toFixed(1)}
                              </div>
                              {game.marketSpread.teamId &&
                                game.marketSpread.value != null && (
                                  <div className="text-[11px] text-gray-400">
                                    row{' '}
                                    {game.marketSpread.teamId === game.homeTeamId
                                      ? game.homeTeamName
                                      : game.marketSpread.teamId === game.awayTeamId
                                        ? game.awayTeamName
                                        : game.marketSpread.teamId}{' '}
                                    {formatSpread(game.marketSpread.value)}
                                  </div>
                                )}
                              <div className="text-[11px] text-gray-500 mt-1">
                                {game.marketSpread.book || 'book n/a'}
                              </div>
                              <div className="text-[11px] text-gray-400">
                                {game.marketSpread.timestamp
                                  ? new Date(
                                      game.marketSpread.timestamp
                                    ).toLocaleString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      timeZone: 'America/Chicago',
                                    })
                                  : 'time n/a'}
                              </div>
                              <div className="text-[11px] text-gray-400">
                                {game.marketSpread.source || 'source n/a'} ·
                                current/live
                              </div>
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
          <h3 className="text-sm font-semibold text-blue-900 mb-2">
            Shadow comparison details
          </h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>
              <strong>Core V1:</strong> production Core V1 from persisted V1
              ratings and season-aware HFA, matching Current Slate. Not Hybrid&apos;s
              internal simple V1 component.
            </li>
            <li>
              <strong>Diff:</strong> Hybrid HMA minus production Core V1 HMA.
              Positive means Hybrid favors the home side more than Core V1.
            </li>
            <li>
              <strong>V2 / Hybrid:</strong> shown only when Hybrid inputs exist.
              Missing unit grades or ratings make Hybrid unavailable. Core is
              never labeled Hybrid.
            </li>
            <li>
              <strong>Current market:</strong> latest persisted MarketLine for
              this Labs selection. Book, timestamp, and source are shown when
              available. This is current/live, not a prediction-time or closing
              line unless that contract is separately satisfied.
            </li>
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
