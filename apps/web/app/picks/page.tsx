/**
 * Best Bets / My Picks Page
 * 
 * Displays all active spread bets for the current week, grouped by confidence grade (A, B, C).
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import { TeamLogo } from '@/components/TeamLogo';
import { ErrorState } from '@/components/ErrorState';

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
  maxEdge?: number | null;
  confidence?: string | null;
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
      
      // First, get current week from weeks API (it returns season and week)
      const weeksResponse = await fetch('/api/weeks');
      if (!weeksResponse.ok) {
        throw new Error(`Failed to fetch current week: ${weeksResponse.statusText}`);
      }
      const weeksData = await weeksResponse.json();
      // The weeks API returns { success: true, season, week, ... } in the response
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
      
      // Filter to only games with active spread bets (pickSpread exists and maxEdge >= 0.1)
      const activeBets = data.filter(game => 
        game.pickSpread !== null && 
        game.pickSpread !== undefined &&
        game.maxEdge !== null && 
        game.maxEdge !== undefined &&
        game.maxEdge >= 0.1
      );
      
      setGames(activeBets);
    } catch (err) {
      setError('Network error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Group games by confidence tier
  const groupedGames = {
    A: games.filter(g => g.confidence === 'A').sort((a, b) => (b.maxEdge || 0) - (a.maxEdge || 0)),
    B: games.filter(g => g.confidence === 'B').sort((a, b) => (b.maxEdge || 0) - (a.maxEdge || 0)),
    C: games.filter(g => g.confidence === 'C').sort((a, b) => (b.maxEdge || 0) - (a.maxEdge || 0)),
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

  const renderGameCard = (game: SlateGame) => {
    // Model spread from API is in HMA format, convert to favorite-centric for display
    // If modelSpread is positive (e.g., +9.4), that means home is favored by 9.4
    // In favorite-centric: home favorite = negative, so -9.4
    const modelSpreadFC = game.modelSpread !== null ? -game.modelSpread : null;
    
    return (
      <Link
        key={game.gameId}
        href={`/game/${game.gameId}`}
        className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all"
      >
        <div className="flex items-start justify-between">
          {/* Left: Matchup */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <TeamLogo teamName={game.awayTeamName} teamId={game.awayTeamId} size="sm" />
              <span className="font-semibold text-gray-900">{game.awayTeamName}</span>
              <span className="text-gray-500">@</span>
              <TeamLogo teamName={game.homeTeamName} teamId={game.homeTeamId} size="sm" />
              <span className="font-semibold text-gray-900">{game.homeTeamName}</span>
            </div>
            <div className="text-sm text-gray-500">
              {formatKickoff(game.kickoffLocal)}
            </div>
          </div>

          {/* Right: Pick Details */}
          <div className="text-right ml-4">
            <div className="mb-2">
              <div className="text-sm text-gray-600 mb-1">The Pick</div>
              <div className="text-lg font-bold text-blue-600">{game.pickSpread}</div>
            </div>
            {modelSpreadFC !== null && (
              <div className="mb-2">
                <div className="text-sm text-gray-600 mb-1">Model</div>
                <div className="text-sm font-semibold text-gray-900">
                  Model says {modelSpreadFC > 0 ? '+' : ''}{modelSpreadFC.toFixed(1)}
                </div>
              </div>
            )}
            {game.maxEdge !== null && (
              <div>
                <div className="text-sm text-gray-600 mb-1">Edge</div>
                <div className="text-lg font-bold text-green-600">
                  {game.maxEdge.toFixed(1)} pts
                </div>
              </div>
            )}
          </div>
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
            onRetry={fetchSlate}
          />
        </div>
        <Footer />
      </div>
    );
  }

  const totalBets = games.length;
  const hasAnyBets = totalBets > 0;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Official Spread Picks{week !== null ? ` - Week ${week}` : ''}
            </h1>
            <p className="text-gray-600">
              {hasAnyBets 
                ? `${totalBets} active ${totalBets === 1 ? 'bet' : 'bets'} found${season !== null && week !== null ? ` for ${season} Week ${week}` : ''}`
                : `No active bets found${season !== null && week !== null ? ` for ${season} Week ${week}` : ''}. All edges are below the 0.1 pt threshold.`
              }
            </p>
          </div>

          {loading ? (
            <div className="space-y-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
                  <div className="h-20 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          ) : !hasAnyBets ? (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
              <p className="text-gray-500 text-lg">
                No active spread bets for this week.
              </p>
              <p className="text-gray-400 text-sm mt-2">
                The model requires at least a 0.1 point edge to recommend a bet.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Grade A */}
              {groupedGames.A.length > 0 && (
                <div>
                  <div className={`flex items-center gap-2 mb-4 px-4 py-2 rounded-lg border ${getConfidenceConfig('A').color}`}>
                    <span className="text-2xl">{getConfidenceConfig('A').emoji}</span>
                    <h2 className="text-xl font-bold">
                      {getConfidenceConfig('A').title} (Grade A)
                    </h2>
                    <span className={`ml-auto px-2 py-1 rounded text-xs font-semibold ${getConfidenceConfig('A').badgeColor}`}>
                      {groupedGames.A.length} {groupedGames.A.length === 1 ? 'pick' : 'picks'}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {groupedGames.A.map(renderGameCard)}
                  </div>
                </div>
              )}

              {/* Grade B */}
              {groupedGames.B.length > 0 && (
                <div>
                  <div className={`flex items-center gap-2 mb-4 px-4 py-2 rounded-lg border ${getConfidenceConfig('B').color}`}>
                    <span className="text-2xl">{getConfidenceConfig('B').emoji}</span>
                    <h2 className="text-xl font-bold">
                      {getConfidenceConfig('B').title} (Grade B)
                    </h2>
                    <span className={`ml-auto px-2 py-1 rounded text-xs font-semibold ${getConfidenceConfig('B').badgeColor}`}>
                      {groupedGames.B.length} {groupedGames.B.length === 1 ? 'pick' : 'picks'}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {groupedGames.B.map(renderGameCard)}
                  </div>
                </div>
              )}

              {/* Grade C */}
              {groupedGames.C.length > 0 && (
                <div>
                  <div className={`flex items-center gap-2 mb-4 px-4 py-2 rounded-lg border ${getConfidenceConfig('C').color}`}>
                    <span className="text-2xl">{getConfidenceConfig('C').emoji}</span>
                    <h2 className="text-xl font-bold">
                      {getConfidenceConfig('C').title} (Grade C)
                    </h2>
                    <span className={`ml-auto px-2 py-1 rounded text-xs font-semibold ${getConfidenceConfig('C').badgeColor}`}>
                      {groupedGames.C.length} {groupedGames.C.length === 1 ? 'pick' : 'picks'}
                    </span>
                  </div>
                  <div className="space-y-3">
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

