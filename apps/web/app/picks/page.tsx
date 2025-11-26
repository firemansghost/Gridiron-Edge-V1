/**
 * Best Bets / My Picks Page
 * 
 * Displays all active bets grouped by game, with Spread, Total, and Moneyline picks.
 * Redesigned to prioritize Tier A picks in "Best Bets" section, with Tier B/C in "Leans" section.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
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
}

export default function PicksPage() {
  const [games, setGames] = useState<SlateGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [week, setWeek] = useState<number | null>(null);

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

  // Helper: Check if a game has any Tier A pick
  const hasTierAPick = (game: SlateGame): boolean => {
    return (
      game.picks?.spread?.grade === 'A' ||
      game.picks?.total?.grade === 'A' ||
      game.picks?.moneyline?.grade === 'A'
    );
  };

  // Helper: Check if a pick is Tier B or C
  const isTierBOrC = (grade: string | null | undefined): boolean => {
    return grade === 'B' || grade === 'C';
  };

  // Helper: Check if a total pick is Tier B/C (for warning label)
  const isTotalTierBOrC = (pick: GamePick | undefined): boolean => {
    return pick !== undefined && isTierBOrC(pick.grade);
  };

  // Group games into Best Bets (Tier A) and Leans (Tier B/C)
  const { bestBets, leans } = useMemo(() => {
    const bestBetsGames: SlateGame[] = [];
    const leansGames: SlateGame[] = [];

    games.forEach(game => {
      if (hasTierAPick(game)) {
        bestBetsGames.push(game);
      } else {
        // Only include in Leans if it has at least one pick (even if B/C)
        const hasAnyPick = game.picks?.spread?.label || game.picks?.total?.label || game.picks?.moneyline?.label;
        if (hasAnyPick) {
          leansGames.push(game);
        }
      }
    });

    // Sort by kickoff time (earliest first)
    const sortByKickoff = (a: SlateGame, b: SlateGame) => {
      return new Date(a.kickoffLocal).getTime() - new Date(b.kickoffLocal).getTime();
    };

    return {
      bestBets: bestBetsGames.sort(sortByKickoff),
      leans: leansGames.sort(sortByKickoff),
    };
  }, [games]);

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

  const renderGameCard = (game: SlateGame, isBestBet: boolean = false) => {
    const spreadPick = game.picks?.spread;
    const totalPick = game.picks?.total;
    const moneylinePick = game.picks?.moneyline;
    
    // Determine if this card should have muted styling (only for Leans section)
    const isMuted = !isBestBet;
    
    return (
      <Link
        key={game.gameId}
        href={`/game/${game.gameId}`}
        className={`block border rounded-lg p-3 transition-all ${
          isBestBet
            ? 'bg-white border-green-200 hover:border-green-400 hover:shadow-sm'
            : 'bg-gray-50 border-gray-200 hover:border-gray-300 hover:shadow-sm'
        }`}
      >
        {/* Header: Matchup */}
        <div className={`flex items-center gap-2 mb-2 pb-2 border-b ${isMuted ? 'border-gray-200' : 'border-gray-100'}`}>
          <TeamLogo teamName={game.awayTeamName} teamId={game.awayTeamId} size="sm" />
          <span className={`font-semibold text-sm ${isMuted ? 'text-gray-700' : 'text-gray-900'}`}>
            {game.awayTeamName}
          </span>
          <span className="text-gray-400 text-xs">@</span>
          <TeamLogo teamName={game.homeTeamName} teamId={game.homeTeamId} size="sm" />
          <span className={`font-semibold text-sm ${isMuted ? 'text-gray-700' : 'text-gray-900'}`}>
            {game.homeTeamName}
          </span>
          <span className={`ml-auto text-xs ${isMuted ? 'text-gray-400' : 'text-gray-500'}`}>
            {formatKickoff(game.kickoffLocal)}
          </span>
        </div>

        {/* Body: Active Bets (Compact List) */}
        <div className="space-y-1.5">
          {/* Spread Bet */}
          {spreadPick?.label && (
            <div className={`flex items-center justify-between text-sm ${isMuted ? 'text-gray-600' : ''}`}>
              <div className="flex items-center gap-2">
                <span className={`font-medium ${isMuted ? 'text-gray-500' : 'text-gray-600'}`}>Spread:</span>
                <span className={`font-semibold ${isMuted ? 'text-gray-700' : 'text-gray-900'}`}>
                  {spreadPick.label}
                </span>
                {spreadPick.grade === 'A' && (
                  <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">
                    Tier A
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {spreadPick.edge !== null && (
                  <span className={isMuted ? 'text-gray-500' : 'text-gray-600'}>
                    Edge: <span className={`font-semibold ${isMuted ? 'text-green-700' : 'text-green-600'}`}>
                      {spreadPick.edge.toFixed(1)} pts
                    </span>
                  </span>
                )}
                {getGradeBadge(spreadPick.grade)}
              </div>
            </div>
          )}

          {/* Moneyline Bet */}
          {moneylinePick?.label && (
            <div className={`flex items-center justify-between text-sm ${isMuted ? 'text-gray-600' : ''}`}>
              <div className="flex items-center gap-2">
                <span className={`font-medium ${isMuted ? 'text-gray-500' : 'text-gray-600'}`}>Moneyline:</span>
                <span className={`font-semibold ${isMuted ? 'text-gray-700' : 'text-gray-900'}`}>
                  {moneylinePick.label}
                </span>
                {moneylinePick.grade === 'A' && (
                  <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">
                    Tier A
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {moneylinePick.value !== null && (
                  <span className={isMuted ? 'text-gray-500' : 'text-gray-600'}>
                    Value: <span className={`font-semibold ${isMuted ? 'text-green-700' : 'text-green-600'}`}>
                      {moneylinePick.value.toFixed(1)}%
                    </span>
                  </span>
                )}
                {getGradeBadge(moneylinePick.grade)}
              </div>
            </div>
          )}

          {/* Total Bet */}
          {totalPick?.label && (
            <div className={`flex items-center justify-between text-sm ${isMuted ? 'text-gray-600' : ''}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-medium ${isMuted ? 'text-gray-500' : 'text-gray-600'}`}>Total:</span>
                <span className={`font-semibold ${isMuted ? 'text-gray-700' : 'text-gray-900'}`}>
                  {totalPick.label}
                </span>
                {totalPick.grade === 'A' && (
                  <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">
                    Tier A
                  </span>
                )}
                {/* Warning label for V3 Totals Tier B/C */}
                {isTotalTierBOrC(totalPick) && (
                  <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
                    ⚠️ Experimental – High Risk
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {totalPick.edge !== null && (
                  <span className={isMuted ? 'text-gray-500' : 'text-gray-600'}>
                    Edge: <span className={`font-semibold ${isMuted ? 'text-green-700' : 'text-green-600'}`}>
                      {totalPick.edge.toFixed(1)} pts
                    </span>
                  </span>
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

  const totalGames = games.length;
  const hasAnyBets = totalGames > 0;

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
            <div className="space-y-8">
              {/* Best Bets Section (Tier A) */}
              {bestBets.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4 px-4 py-2 rounded-lg bg-green-50 border border-green-200">
                    <span className="text-2xl">🔥</span>
                    <h2 className="text-xl font-bold text-green-900">
                      Best Bets (Tier A)
                    </h2>
                    <span className="ml-auto px-3 py-1 rounded text-sm font-semibold bg-green-100 text-green-800">
                      {bestBets.length} {bestBets.length === 1 ? 'game' : 'games'}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {bestBets.map(game => renderGameCard(game, true))}
                  </div>
                </div>
              )}

              {/* Leans / Action Section (Tier B & C) */}
              {leans.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4 px-4 py-2 rounded-lg bg-gray-100 border border-gray-300">
                    <span className="text-2xl">👀</span>
                    <h2 className="text-xl font-bold text-gray-700">
                      Leans / Action (Tier B & C)
                    </h2>
                    <span className="ml-auto px-3 py-1 rounded text-sm font-semibold bg-gray-200 text-gray-700">
                      {leans.length} {leans.length === 1 ? 'game' : 'games'}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {leans.map(game => renderGameCard(game, false))}
                  </div>
                </div>
              )}

              {/* Empty state if no picks */}
              {bestBets.length === 0 && leans.length === 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
                  <p className="text-gray-500">No active bets for this week.</p>
                  <p className="text-gray-400 text-sm mt-1">
                    The model requires at least a 0.1 point edge to recommend a bet.
                  </p>
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
