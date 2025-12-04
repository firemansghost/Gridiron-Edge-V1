/**
 * Best Bets / My Picks Page
 * 
 * Displays all active bets grouped by game, with Spread, Total, and Moneyline picks.
 * Games are grouped by their highest confidence grade.
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import { TeamLogo } from '@/components/TeamLogo';
import { ErrorState } from '@/components/ErrorState';
import { downloadAsCsv } from '@/lib/csv-export';

interface GamePick {
  label: string | null;
  edge: number | null;
  grade: string | null;
  // 2026 playbook fields
  hybridConflictType?: string | null;
  tierBucket?: string;
  isSuperTierA?: boolean;
  clv?: number | null;
  // Continuity fields (Labs-only)
  betTeamContinuity?: number | null;
  oppContinuity?: number | null;
  continuityDiff?: number | null;
  isDog?: boolean | null;
  isLowContinuityDog?: boolean;
}

interface MoneylinePick {
  label: string | null;
  value: number | null;
  grade: string | null;
}

interface SlateGame {
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
  closingSpread: {
    value: number;
    book: string;
    timestamp: string;
  } | null;
  modelSpread?: number | null;
  pickSpread?: string | null;
  pickTotal?: string | null;
  pickMoneyline?: string | null;
  maxEdge?: number | null;
  confidence?: string | null;
  picks?: {
    spread?: GamePick;
    total?: GamePick;
    moneyline?: MoneylinePick;
  };
  favoritesDisagree?: boolean;
}

export default function PicksPage() {
  const [games, setGames] = useState<SlateGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  // 2026 playbook filters
  const [showOnlySuperTierA, setShowOnlySuperTierA] = useState(false);
  const [showOnlyHybridStrong, setShowOnlyHybridStrong] = useState(false);

  useEffect(() => {
    fetchCurrentWeekAndSlate();
  }, []);

  const fetchCurrentWeekAndSlate = async () => {
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
      
      // Then fetch the slate for current week
      const slateResponse = await fetch(`/api/weeks/slate?season=${currentSeason}&week=${currentWeek}`);
      if (!slateResponse.ok) {
        throw new Error(`Failed to fetch slate: ${slateResponse.statusText}`);
      }
      
      const data: SlateGame[] = await slateResponse.json();
      
      // Filter to only games with at least ONE active bet (Spread OR Total OR Moneyline)
      const gamesWithBets = data.filter(game => {
        const hasSpread = game.picks?.spread?.label !== null && game.picks?.spread?.label !== undefined;
        const hasTotal = game.picks?.total?.label !== null && game.picks?.total?.label !== undefined;
        const hasMoneyline = game.picks?.moneyline?.label !== null && game.picks?.moneyline?.label !== undefined;
        return hasSpread || hasTotal || hasMoneyline;
      });
      
      setGames(gamesWithBets);
    } catch (err) {
      setError('Network error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Apply 2026 playbook filters
  const filteredGames = games.filter(game => {
    const spreadPick = game.picks?.spread;
    
    if (showOnlySuperTierA) {
      return spreadPick?.isSuperTierA === true;
    }
    
    if (showOnlyHybridStrong) {
      return spreadPick?.hybridConflictType === 'hybrid_strong';
    }
    
    return true;
  });

  // Group games by highest confidence grade
  const groupedGames = {
    A: filteredGames.filter(g => g.confidence === 'A').sort((a, b) => (b.maxEdge ?? 0) - (a.maxEdge ?? 0)),
    B: filteredGames.filter(g => g.confidence === 'B').sort((a, b) => (b.maxEdge ?? 0) - (a.maxEdge ?? 0)),
    C: filteredGames.filter(g => g.confidence === 'C').sort((a, b) => (b.maxEdge ?? 0) - (a.maxEdge ?? 0)),
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

  const getConfidenceConfig = (grade: string) => {
    switch (grade) {
      case 'A':
        return {
          emoji: '🔥',
          title: 'High Confidence',
          color: 'text-green-600 bg-green-50 border-green-200',
          badgeColor: 'bg-green-100 text-green-800'
        };
      case 'B':
        return {
          emoji: '✅',
          title: 'Medium Confidence',
          color: 'text-yellow-600 bg-yellow-50 border-yellow-200',
          badgeColor: 'bg-yellow-100 text-yellow-800'
        };
      case 'C':
        return {
          emoji: '⚠️',
          title: 'Low Confidence',
          color: 'text-orange-600 bg-orange-50 border-orange-200',
          badgeColor: 'bg-orange-100 text-orange-800'
        };
      default:
        return {
          emoji: '📊',
          title: 'Other',
          color: 'text-gray-600 bg-gray-50 border-gray-200',
          badgeColor: 'bg-gray-100 text-gray-800'
        };
    }
  };

  const getGradeBadge = (grade: string | null | undefined) => {
    if (!grade) return null;
    const config = getConfidenceConfig(grade);
    return (
      <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${config.badgeColor}`}>
        {grade}
      </span>
    );
  };

  const getConflictBadge = (conflictType: string | null | undefined) => {
    if (!conflictType) return null;
    
    const configs: Record<string, { text: string; className: string }> = {
      hybrid_strong: { text: 'Strong', className: 'bg-green-100 text-green-800' },
      hybrid_weak: { text: 'Weak', className: 'bg-yellow-100 text-yellow-800' },
      hybrid_only: { text: 'Only', className: 'bg-gray-100 text-gray-800' },
    };
    
    const config = configs[conflictType];
    if (!config) return null;
    
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.className}`}>
        {config.text}
      </span>
    );
  };

  const getTierLabel = (tierBucket: string | undefined, conflictType: string | null | undefined) => {
    if (!tierBucket || tierBucket === 'none') return null;
    if (conflictType !== 'hybrid_strong') return null; // Only show tier labels for hybrid_strong
    
    const labels: Record<string, string> = {
      super_tier_a: 'Super Tier A',
      tier_a: 'Tier A (Strong)',
      tier_b: 'Tier B (Strong)',
    };
    
    const label = labels[tierBucket];
    if (!label) return null;
    
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
        {label}
      </span>
    );
  };

  const handleExportCsv = () => {
    // Flatten all picks from all games
    const csvRows: Record<string, any>[] = [];

    games.forEach(game => {
      const gameName = `${game.awayTeamName} @ ${game.homeTeamName}`;
      const kickoff = formatKickoff(game.kickoffLocal);
      const modelSpread = game.modelSpread !== null && game.modelSpread !== undefined
        ? game.modelSpread.toFixed(1)
        : '—';

      // Spread pick
      if (game.picks?.spread?.label) {
        csvRows.push({
          Game: gameName,
          Time: kickoff,
          Type: 'Spread',
          Pick: game.picks.spread.label,
          Model: `Model says ${modelSpread}`,
          Edge: game.picks.spread.edge !== null ? `${game.picks.spread.edge.toFixed(1)} pts` : '—',
          Grade: game.picks.spread.grade || '—',
        });
      }

      // Total pick
      if (game.picks?.total?.label) {
        csvRows.push({
          Game: gameName,
          Time: kickoff,
          Type: 'Total',
          Pick: game.picks.total.label,
          Model: '—', // Total model value not available in current structure
          Edge: game.picks.total.edge !== null ? `${game.picks.total.edge.toFixed(1)} pts` : '—',
          Grade: game.picks.total.grade || '—',
        });
      }

      // Moneyline pick
      if (game.picks?.moneyline?.label) {
        csvRows.push({
          Game: gameName,
          Time: kickoff,
          Type: 'Moneyline',
          Pick: game.picks.moneyline.label,
          Model: '—',
          Edge: game.picks.moneyline.value !== null ? `${game.picks.moneyline.value.toFixed(1)}%` : '—',
          Grade: game.picks.moneyline.grade || '—',
        });
      }
    });

    const filename = `gridiron-picks-week-${week || 'unknown'}`;
    downloadAsCsv(filename, csvRows);
  };

  const renderGameCard = (game: SlateGame) => {
    const spreadPick = game.picks?.spread;
    const totalPick = game.picks?.total;
    const moneylinePick = game.picks?.moneyline;
    
    return (
      <Link
        key={game.gameId}
        href={`/game/${game.gameId}`}
        className="block bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-400 hover:shadow-sm transition-all"
      >
        {/* Header: Matchup */}
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
          <TeamLogo teamName={game.awayTeamName} teamId={game.awayTeamId} size="sm" />
          <span className="font-semibold text-sm text-gray-900">{game.awayTeamName}</span>
          <span className="text-gray-400 text-xs">@</span>
          <TeamLogo teamName={game.homeTeamName} teamId={game.homeTeamId} size="sm" />
          <span className="font-semibold text-sm text-gray-900">{game.homeTeamName}</span>
          <span className="ml-auto text-xs text-gray-500">{formatKickoff(game.kickoffLocal)}</span>
        </div>

        {/* Body: Active Bets (Compact List) */}
        <div className="space-y-1.5">
          {/* Spread Bet */}
          {spreadPick?.label && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-gray-600 font-medium">Spread:</span>
                  <span className="text-gray-900 font-semibold">{spreadPick.label}</span>
                  {getConflictBadge(spreadPick.hybridConflictType)}
                  {getTierLabel(spreadPick.tierBucket, spreadPick.hybridConflictType)}
                </div>
                <div className="flex items-center gap-2">
                  {spreadPick.edge !== null && (
                    <span className="text-gray-600">Edge: <span className="font-semibold text-green-600">{spreadPick.edge.toFixed(1)} pts</span></span>
                  )}
                  {getGradeBadge(spreadPick.grade)}
                </div>
              </div>
              {spreadPick.clv !== null && spreadPick.clv !== undefined && (
                <div className="text-xs text-gray-500 ml-0">
                  CLV: <span className={spreadPick.clv >= 0 ? 'text-green-600' : 'text-red-600'}>{spreadPick.clv >= 0 ? '+' : ''}{spreadPick.clv.toFixed(1)}</span>
                </div>
              )}
              {spreadPick.betTeamContinuity !== null && spreadPick.betTeamContinuity !== undefined && (
                <div className="text-xs text-gray-500 ml-0 mt-1">
                  Continuity: {(() => {
                    const getBand = (score: number) => {
                      if (score >= 0.80) return 'High';
                      if (score >= 0.60) return 'Mid';
                      return 'Low';
                    };
                    const betBand = getBand(spreadPick.betTeamContinuity!);
                    if (spreadPick.oppContinuity !== null && spreadPick.oppContinuity !== undefined) {
                      const oppBand = getBand(spreadPick.oppContinuity);
                      const diff = spreadPick.continuityDiff ?? 0;
                      return `${betBand} vs ${oppBand} (Δ ${diff >= 0 ? '+' : ''}${diff.toFixed(2)})`;
                    }
                    return `${betBand} (bet team only)`;
                  })()}
                </div>
              )}
              {spreadPick.isLowContinuityDog && (
                <div className="mt-1">
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                    Low-Continuity Dog
                  </span>
                </div>
              )}
              {game.favoritesDisagree && (
                <div className="mt-1">
                  <span 
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200"
                    title="Model and market favor different teams — treat as Labs-only, not an official edge."
                  >
                    Favs Disagree
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Moneyline Bet */}
          {moneylinePick?.label && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-600 font-medium">Moneyline:</span>
                <span className="text-gray-900 font-semibold">{moneylinePick.label}</span>
              </div>
              <div className="flex items-center gap-2">
                {moneylinePick.value !== null && (
                  <span className="text-gray-600">Value: <span className="font-semibold text-green-600">{moneylinePick.value.toFixed(1)}%</span></span>
                )}
                {getGradeBadge(moneylinePick.grade)}
              </div>
            </div>
          )}

          {/* Total Bet */}
          {totalPick?.label && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-600 font-medium">Total:</span>
                <span className="text-gray-900 font-semibold">{totalPick.label}</span>
              </div>
              <div className="flex items-center gap-2">
                {totalPick.edge !== null && (
                  <span className="text-gray-600">Edge: <span className="font-semibold text-green-600">{totalPick.edge.toFixed(1)} pts</span></span>
                )}
                {getGradeBadge(totalPick.grade)}
              </div>
            </div>
          )}
        </div>
      </Link>
    );
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <HeaderNav />
        <div className="flex-1 flex items-center justify-center px-4">
          <ErrorState
            title="Unable to Load Picks"
            message={error}
            onRetry={fetchCurrentWeekAndSlate}
          />
        </div>
        <Footer />
      </div>
    );
  }

  const totalGames = filteredGames.length;
  const hasAnyBets = games.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-1">
              <h1 className="text-2xl font-bold text-gray-900">
                Official Picks{week !== null ? ` - Week ${week}` : ''}
              </h1>
              {hasAnyBets && (
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
            <p className="text-sm text-gray-600">
              {hasAnyBets 
                ? `${totalGames} ${totalGames === 1 ? 'game' : 'games'} with active bets${season !== null && week !== null ? ` for ${season} Week ${week}` : ''}`
                : `No active bets found${season !== null && week !== null ? ` for ${season} Week ${week}` : ''}. All edges are below the 0.1 pt threshold.`
              }
            </p>
          </div>

          {/* 2026 Playbook Filters */}
          {hasAnyBets && (
            <div className="mb-4 flex items-center gap-4 p-3 bg-white border border-gray-200 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Filters:</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOnlySuperTierA}
                  onChange={(e) => {
                    setShowOnlySuperTierA(e.target.checked);
                    if (e.target.checked) setShowOnlyHybridStrong(false); // Super Tier A implies Hybrid Strong
                  }}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Show only Super Tier A</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOnlyHybridStrong}
                  onChange={(e) => {
                    setShowOnlyHybridStrong(e.target.checked);
                    if (e.target.checked && showOnlySuperTierA) setShowOnlySuperTierA(false); // Hybrid Strong is broader
                  }}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Show only Hybrid Strong</span>
              </label>
              {(showOnlySuperTierA || showOnlyHybridStrong) && (
                <button
                  onClick={() => {
                    setShowOnlySuperTierA(false);
                    setShowOnlyHybridStrong(false);
                  }}
                  className="ml-auto text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* Labs Note Banner */}
          <div className="mb-4 bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-yellow-800">
                  Labs Note – Low-Continuity Dogs
                </h3>
                <p className="mt-1 text-sm text-yellow-700">
                  Red "Low-Continuity Dog" pills mark underdogs with high roster churn (low continuity score). Historically these have been a major drag on ROI. Strongly discouraged for the official card unless explicitly whitelisted.
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white border border-gray-200 rounded-lg p-3 animate-pulse">
                  <div className="h-16 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          ) : !hasAnyBets ? (
            <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
              <p className="text-gray-500">No active bets for this week.</p>
              <p className="text-gray-400 text-sm mt-1">
                The model requires at least a 0.1 point edge to recommend a bet.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Grade A */}
              {groupedGames.A.length > 0 && (
                <div>
                  <div className={`flex items-center gap-2 mb-3 px-3 py-1.5 rounded-lg border ${getConfidenceConfig('A').color}`}>
                    <span className="text-xl">{getConfidenceConfig('A').emoji}</span>
                    <h2 className="text-lg font-bold">
                      {getConfidenceConfig('A').title} (Grade A)
                    </h2>
                    <span className={`ml-auto px-2 py-0.5 rounded text-xs font-semibold ${getConfidenceConfig('A').badgeColor}`}>
                      {groupedGames.A.length} {groupedGames.A.length === 1 ? 'game' : 'games'}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {groupedGames.A.map(renderGameCard)}
                  </div>
                </div>
              )}

              {/* Grade B */}
              {groupedGames.B.length > 0 && (
                <div>
                  <div className={`flex items-center gap-2 mb-3 px-3 py-1.5 rounded-lg border ${getConfidenceConfig('B').color}`}>
                    <span className="text-xl">{getConfidenceConfig('B').emoji}</span>
                    <h2 className="text-lg font-bold">
                      {getConfidenceConfig('B').title} (Grade B)
                    </h2>
                    <span className={`ml-auto px-2 py-0.5 rounded text-xs font-semibold ${getConfidenceConfig('B').badgeColor}`}>
                      {groupedGames.B.length} {groupedGames.B.length === 1 ? 'game' : 'games'}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {groupedGames.B.map(renderGameCard)}
                  </div>
                </div>
              )}

              {/* Grade C */}
              {groupedGames.C.length > 0 && (
                <div>
                  <div className={`flex items-center gap-2 mb-3 px-3 py-1.5 rounded-lg border ${getConfidenceConfig('C').color}`}>
                    <span className="text-xl">{getConfidenceConfig('C').emoji}</span>
                    <h2 className="text-lg font-bold">
                      {getConfidenceConfig('C').title} (Grade C)
                    </h2>
                    <span className={`ml-auto px-2 py-0.5 rounded text-xs font-semibold ${getConfidenceConfig('C').badgeColor}`}>
                      {groupedGames.C.length} {groupedGames.C.length === 1 ? 'game' : 'games'}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {groupedGames.C.map(renderGameCard)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
