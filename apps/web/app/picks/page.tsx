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

  // Group games by highest confidence grade
  const groupedGames = {
    A: games.filter(g => g.confidence === 'A').sort((a, b) => (b.maxEdge ?? 0) - (a.maxEdge ?? 0)),
    B: games.filter(g => g.confidence === 'B').sort((a, b) => (b.maxEdge ?? 0) - (a.maxEdge ?? 0)),
    C: games.filter(g => g.confidence === 'C').sort((a, b) => (b.maxEdge ?? 0) - (a.maxEdge ?? 0)),
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
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-600 font-medium">Spread:</span>
                <span className="text-gray-900 font-semibold">{spreadPick.label}</span>
              </div>
              <div className="flex items-center gap-2">
                {spreadPick.edge !== null && (
                  <span className="text-gray-600">Edge: <span className="font-semibold text-green-600">{spreadPick.edge.toFixed(1)} pts</span></span>
                )}
                {getGradeBadge(spreadPick.grade)}
              </div>
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

  const totalGames = games.length;
  const hasAnyBets = totalGames > 0;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              Official Picks{week !== null ? ` - Week ${week}` : ''}
            </h1>
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
