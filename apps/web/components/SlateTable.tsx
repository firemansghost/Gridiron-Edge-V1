'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

interface SlateGame {
  gameId: string;
  date: string;
  kickoffLocal: string;
  status: 'final' | 'scheduled' | 'in_progress';
  awayTeamId: string;
  homeTeamId: string;
  awayScore: number | null;
  homeScore: number | null;
  closingSpread: {
    value: number;
    book: string;
    timestamp: string;
  } | null;
  closingTotal: {
    value: number;
    book: string;
    timestamp: string;
  } | null;
  // Advanced columns (optional)
  modelSpread?: number | null;
  modelTotal?: number | null;
  pickSpread?: string | null;
  pickTotal?: string | null;
  maxEdge?: number | null;
  confidence?: string | null;
}

interface SlateTableProps {
  season: number;
  week: number;
  title?: string;
  showDateHeaders?: boolean;
  showAdvanced?: boolean;
  onAdvancedToggle?: (show: boolean) => void;
}

export default function SlateTable({ 
  season, 
  week, 
  title = `Week ${week} Games`,
  showDateHeaders = true,
  showAdvanced = false,
  onAdvancedToggle
}: SlateTableProps) {
  const [games, setGames] = useState<SlateGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdvancedColumns, setShowAdvancedColumns] = useState(showAdvanced);

  useEffect(() => {
    fetchSlate();
  }, [season, week]);

  // Load advanced columns preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('slateTable-showAdvanced');
    if (saved !== null) {
      setShowAdvancedColumns(JSON.parse(saved));
    }
  }, []);

  // Save advanced columns preference to localStorage
  const handleAdvancedToggle = (show: boolean) => {
    setShowAdvancedColumns(show);
    localStorage.setItem('slateTable-showAdvanced', JSON.stringify(show));
    onAdvancedToggle?.(show);
  };

  const fetchSlate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/weeks/slate?season=${season}&week=${week}`);
      if (!response.ok) throw new Error('Failed to fetch slate');
      
      const data = await response.json();
      setGames(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (kickoffLocal: string) => {
    try {
      const date = new Date(kickoffLocal);
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    } catch {
      return 'TBD';
    }
  };

  const formatDate = (date: string) => {
    try {
      const d = new Date(date);
      return d.toLocaleDateString('en-US', { 
        weekday: 'long',
        month: 'short', 
        day: 'numeric' 
      });
    } catch {
      return 'TBD';
    }
  };

  const formatSpread = (spread: { value: number; book: string; timestamp: string } | null) => {
    if (!spread) return '—';
    const sign = spread.value > 0 ? '+' : '';
    return `${sign}${spread.value}`;
  };

  const formatTotal = (total: { value: number; book: string; timestamp: string } | null) => {
    if (!total) return '—';
    return total.value.toString();
  };

  const formatTooltip = (line: { book: string; timestamp: string } | null) => {
    if (!line) return '';
    const date = new Date(line.timestamp);
    const localTime = date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return `${line.book} @ ${localTime}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'final':
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">FINAL</span>;
      case 'in_progress':
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">LIVE</span>;
      case 'scheduled':
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">SCHEDULED</span>;
      default:
        return null;
    }
  };

  const getScoreDisplay = (game: SlateGame) => {
    if (game.status === 'final' && game.awayScore !== null && game.homeScore !== null) {
      const awayWon = game.awayScore > game.homeScore;
      const homeWon = game.homeScore > game.awayScore;
      
      return (
        <div className="text-center">
          <div className="font-bold">
            <span className={awayWon ? 'font-bold' : ''}>{game.awayScore}</span>
            <span className="mx-1">–</span>
            <span className={homeWon ? 'font-bold' : ''}>{game.homeScore}</span>
          </div>
        </div>
      );
    } else {
      return (
        <div className="text-center text-gray-600">
          {formatTime(game.kickoffLocal)}
        </div>
      );
    }
  };

  // Group games by date with performance optimization
  const groupedGames = useMemo(() => {
    return games.reduce((acc, game) => {
      const date = formatDate(game.date);
      if (!acc[date]) acc[date] = [];
      acc[date].push(game);
      return acc;
    }, {} as Record<string, SlateGame[]>);
  }, [games]);

  // Performance: Show first 3 dates initially, then load more
  const [visibleDates, setVisibleDates] = useState(3);
  const dateEntries = Object.entries(groupedGames);
  const visibleDateEntries = dateEntries.slice(0, visibleDates);
  const hasMoreDates = dateEntries.length > visibleDates;

  const loadMoreDates = () => {
    setVisibleDates(prev => Math.min(prev + 3, dateEntries.length));
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        </div>
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading games...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        </div>
        <div className="p-8 text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Games</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={fetchSlate}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        </div>
        <div className="p-8 text-center">
          <div className="text-gray-400 text-5xl mb-4">📅</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Games Found</h3>
          <p className="text-gray-600">No games scheduled for {season} Week {week}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-600 mt-1">{games.length} games</p>
          </div>
          <div className="flex items-center space-x-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showAdvancedColumns}
                onChange={(e) => handleAdvancedToggle(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Show advanced columns</span>
            </label>
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px]">
                Matchup
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]">
                Time / Score
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                Spread
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                Total
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                Status
              </th>
              {showAdvancedColumns && (
                <>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                    Model Spread
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                    Model Total
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]">
                    Pick (ATS)
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]">
                    Pick (Total)
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                    Max Edge
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                    Confidence
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                    Action
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {visibleDateEntries.map(([date, dateGames]) => (
              <React.Fragment key={date}>
                {showDateHeaders && (
                  <tr className="bg-gray-100">
                    <td colSpan={showAdvancedColumns ? 12 : 5} className="px-6 py-3 text-sm font-medium text-gray-700">
                      {date}
                    </td>
                  </tr>
                )}
                {dateGames.map((game) => (
                  <tr 
                    key={game.gameId} 
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => window.location.href = `/game/${game.gameId}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        <Link href={`/team/${game.awayTeamId}`} className="hover:text-blue-600 transition-colors">
                          {game.awayTeamId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </Link>
                        <span className="text-gray-400 mx-1">@</span>
                        <Link href={`/team/${game.homeTeamId}`} className="hover:text-blue-600 transition-colors">
                          {game.homeTeamId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </Link>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getScoreDisplay(game)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div 
                        className="text-sm font-medium text-gray-900 cursor-help"
                        title={formatTooltip(game.closingSpread)}
                      >
                        {formatSpread(game.closingSpread)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div 
                        className="text-sm font-medium text-gray-900 cursor-help"
                        title={formatTooltip(game.closingTotal)}
                      >
                        {formatTotal(game.closingTotal)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {getStatusBadge(game.status)}
                    </td>
                    {showAdvancedColumns && (
                      <>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="text-sm text-gray-900">
                            {game.modelSpread !== null && game.modelSpread !== undefined ? game.modelSpread.toFixed(1) : '—'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="text-sm text-gray-900">
                            {game.modelTotal !== null && game.modelTotal !== undefined ? game.modelTotal.toFixed(1) : '—'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="text-sm text-gray-900">
                            {game.pickSpread || '—'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="text-sm text-gray-900">
                            {game.pickTotal || '—'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="text-sm text-gray-900">
                            {game.maxEdge !== null && game.maxEdge !== undefined ? game.maxEdge.toFixed(1) : '—'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="text-sm text-gray-900">
                            {game.confidence || '—'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <Link 
                            href={`/game/${game.gameId}`}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                            onClick={(e) => e.stopPropagation()}
                          >
                            View →
                          </Link>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      
      {hasMoreDates && (
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={loadMoreDates}
            className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Load more dates ({dateEntries.length - visibleDates} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
