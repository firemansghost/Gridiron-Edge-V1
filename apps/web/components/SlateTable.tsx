'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { InfoTooltip } from './InfoTooltip';

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

interface SearchResult extends SlateGame {
  score: number;
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
  const [compactMode, setCompactMode] = useState(false);
  const [showFloatingButtons, setShowFloatingButtons] = useState(false);
  const [activeDate, setActiveDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  
  // Refs for scroll synchronization
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const dateHeaderRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSlate();
  }, [season, week]);

  // Handle URL hash for deep linking
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#date-')) {
        const date = hash.replace('#date-', '');
        const header = dateHeaderRefs.current.get(date);
        if (header && bodyScrollRef.current) {
          const offset = header.offsetTop - bodyScrollRef.current.offsetTop;
          bodyScrollRef.current.scrollTo({ top: offset, behavior: 'smooth' });
        }
      } else if (hash.startsWith('#game-')) {
        const gameId = hash.replace('#game-', '');
        const gameRow = document.getElementById(`game-${gameId}`);
        if (gameRow && bodyScrollRef.current) {
          const offset = gameRow.offsetTop - bodyScrollRef.current.offsetTop;
          bodyScrollRef.current.scrollTo({ top: offset, behavior: 'smooth' });
          
          // Highlight the row briefly
          gameRow.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
          setTimeout(() => {
            gameRow.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2');
          }, 1500);
        }
      }
    };

    // Handle initial hash on mount
    handleHashChange();
    
    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [games]);

  // Load preferences from localStorage
  useEffect(() => {
    const savedAdvanced = localStorage.getItem('slateTable-showAdvanced');
    if (savedAdvanced !== null) {
      setShowAdvancedColumns(JSON.parse(savedAdvanced));
    }
    
    const savedCompact = localStorage.getItem('slateTable-compactMode');
    if (savedCompact !== null) {
      setCompactMode(JSON.parse(savedCompact));
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle shortcuts when the table container is focused or hovered
      if (!bodyScrollRef.current?.matches(':hover') && !bodyScrollRef.current?.matches(':focus-within')) {
        return;
      }

      // Check for reduced motion preference
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const behavior = prefersReducedMotion ? 'auto' : 'smooth';

      switch (event.key.toLowerCase()) {
        case 't':
          event.preventDefault();
          scrollToTop();
          break;
        case 'd':
          event.preventDefault();
          if (hasTodayGames()) {
            scrollToToday();
          }
          break;
        case 'j':
          event.preventDefault();
          navigateToDate('next');
          break;
        case 'k':
          event.preventDefault();
          navigateToDate('prev');
          break;
        case '/':
          event.preventDefault();
          // Focus search input if it exists (for S5g)
          const searchInput = document.querySelector('[data-search-input]') as HTMLInputElement;
          if (searchInput) {
            searchInput.focus();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeDate]);

  // Navigate to next/previous date
  const navigateToDate = (direction: 'next' | 'prev') => {
    const currentIndex = dateEntries.findIndex(([date]) => date === activeDate);
    if (currentIndex === -1) return;

    const newIndex = direction === 'next' 
      ? Math.min(currentIndex + 1, dateEntries.length - 1)
      : Math.max(currentIndex - 1, 0);

    const [newDate] = dateEntries[newIndex];
    const header = dateHeaderRefs.current.get(newDate);
    if (header && bodyScrollRef.current) {
      const offset = header.offsetTop - bodyScrollRef.current.offsetTop;
      bodyScrollRef.current.scrollTo({ top: offset, behavior: 'smooth' });
    }
  };

  // Build in-memory game index
  const buildGameIndex = useMemo(() => {
    const index: Array<{
      game: SlateGame;
      searchTerms: string[];
      awayName: string;
      homeName: string;
    }> = [];

    games.forEach(game => {
      const awayName = game.awayTeamId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const homeName = game.homeTeamId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      
      const searchTerms = [
        game.awayTeamId,
        game.homeTeamId,
        awayName,
        homeName,
        awayName.toLowerCase(),
        homeName.toLowerCase(),
        // Add common nicknames
        ...(game.awayTeamId.includes('alabama') ? ['bama', 'crimson tide'] : []),
        ...(game.homeTeamId.includes('alabama') ? ['bama', 'crimson tide'] : []),
        ...(game.awayTeamId.includes('michigan') ? ['wolverines'] : []),
        ...(game.homeTeamId.includes('michigan') ? ['wolverines'] : []),
        ...(game.awayTeamId.includes('ohio-state') ? ['buckeyes', 'ohio state'] : []),
        ...(game.homeTeamId.includes('ohio-state') ? ['buckeyes', 'ohio state'] : []),
      ];

      index.push({
        game,
        searchTerms,
        awayName,
        homeName
      });
    });

    return index;
  }, [games]);

  // Search games
  const searchGames = (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    const normalizedQuery = query.toLowerCase().trim();
    const results: SearchResult[] = [];

    buildGameIndex.forEach(({ game, searchTerms, awayName, homeName }) => {
      let score = 0;
      
      // Check for exact matches
      if (searchTerms.some(term => term.toLowerCase() === normalizedQuery)) {
        score += 100;
      }
      
      // Check for substring matches
      if (searchTerms.some(term => term.toLowerCase().includes(normalizedQuery))) {
        score += 50;
      }
      
      // Check for matchup format (team1 @ team2 or team1 vs team2)
      if (normalizedQuery.includes('@') || normalizedQuery.includes('vs') || normalizedQuery.includes(' v ')) {
        const parts = normalizedQuery.split(/[@vs]/).map(p => p.trim());
        if (parts.length === 2) {
          const [part1, part2] = parts;
          if ((awayName.toLowerCase().includes(part1) && homeName.toLowerCase().includes(part2)) ||
              (awayName.toLowerCase().includes(part2) && homeName.toLowerCase().includes(part1))) {
            score += 200;
          }
        }
      }
      
      if (score > 0) {
        results.push({ ...game, score });
      }
    });

    // Sort by score and limit to 8 results
    const sortedResults = results
      .sort((a, b) => (b as any).score - (a as any).score)
      .slice(0, 8);

    setSearchResults(sortedResults);
    setShowSearchResults(true);
    setSelectedResultIndex(0);
  };

  // Handle search input
  const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    searchGames(query);
  };

  // Handle search result selection
  const selectSearchResult = (game: SlateGame) => {
    const gameRow = document.getElementById(`game-${game.gameId}`);
    if (gameRow && bodyScrollRef.current) {
      const offset = gameRow.offsetTop - bodyScrollRef.current.offsetTop;
      bodyScrollRef.current.scrollTo({ top: offset, behavior: 'smooth' });
      
      // Highlight the row briefly
      gameRow.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
      setTimeout(() => {
        gameRow.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2');
      }, 1500);
      
      // Update URL hash
      window.history.replaceState(null, '', `#game-${game.gameId}`);
    }
    
    setShowSearchResults(false);
    setSearchQuery('');
  };

  // Handle keyboard navigation in search results
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSearchResults) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedResultIndex(prev => Math.min(prev + 1, searchResults.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedResultIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (searchResults[selectedResultIndex]) {
          selectSearchResult(searchResults[selectedResultIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowSearchResults(false);
        setSearchQuery('');
        break;
    }
  };

  // Save advanced columns preference to localStorage
  const handleAdvancedToggle = (show: boolean) => {
    setShowAdvancedColumns(show);
    localStorage.setItem('slateTable-showAdvanced', JSON.stringify(show));
    onAdvancedToggle?.(show);
  };

  // Save compact mode preference to localStorage
  const handleCompactToggle = (compact: boolean) => {
    setCompactMode(compact);
    localStorage.setItem('slateTable-compactMode', JSON.stringify(compact));
  };

  // Scroll synchronization between top and body scrollbars
  const handleTopScroll = () => {
    if (topScrollRef.current && bodyScrollRef.current) {
      if (topScrollRef.current.scrollLeft !== bodyScrollRef.current.scrollLeft) {
        bodyScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
      }
    }
  };

  const handleBodyScroll = () => {
    if (topScrollRef.current && bodyScrollRef.current) {
      if (bodyScrollRef.current.scrollLeft !== topScrollRef.current.scrollLeft) {
        topScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft;
      }
    }
    
    // Show floating buttons after scrolling 200px
    if (bodyScrollRef.current) {
      setShowFloatingButtons(bodyScrollRef.current.scrollTop > 200);
    }
    
    // Update active date based on scroll position
    updateActiveDate();
  };

  // Update active date based on scroll position
  const updateActiveDate = () => {
    if (!bodyScrollRef.current) return;
    
    const scrollTop = bodyScrollRef.current.scrollTop;
    const headerHeight = 48; // Approximate header height
    
    // Find the date header that's currently visible
    for (const [date, header] of Array.from(dateHeaderRefs.current.entries())) {
      if (header) {
        const offset = header.offsetTop - bodyScrollRef.current.offsetTop;
        if (offset <= scrollTop + headerHeight) {
          setActiveDate(date);
        }
      }
    }
  };

  // Get today's date in YYYY-MM-DD format for comparison
  const getTodayDate = () => {
    const today = new Date();
    // Use local date, not UTC
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Check if today has games
  const hasTodayGames = () => {
    const today = getTodayDate();
    return dateEntries.some(([date]) => date === today);
  };

  // Scroll to today's games
  const scrollToToday = () => {
    const today = getTodayDate();
    const header = dateHeaderRefs.current.get(today);
    if (header && bodyScrollRef.current) {
      const offset = header.offsetTop - bodyScrollRef.current.offsetTop;
      bodyScrollRef.current.scrollTo({ top: offset, behavior: 'smooth' });
      setActiveDate(today);
    }
  };

  // Scroll to top
  const scrollToTop = () => {
    if (bodyScrollRef.current) {
      bodyScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
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

  // Get ISO date string (YYYY-MM-DD) for grouping and comparison
  const getDateKey = (dateString: string) => {
    try {
      const d = new Date(dateString);
      return d.toISOString().split('T')[0];
    } catch {
      return 'unknown';
    }
  };

  // Format date for display
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

  const getStatusBadge = (game: SlateGame) => {
    // Check if game has scores (even if status isn't updated to 'final')
    const hasScores = game.awayScore !== null && game.homeScore !== null;
    const isPast = new Date(game.date) < new Date();
    const isFinal = game.status === 'final' || (hasScores && isPast);
    const isLive = game.status === 'in_progress';
    
    if (isFinal) {
      return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">FINAL</span>;
    } else if (isLive) {
      return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">LIVE</span>;
    } else {
      return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">SCHEDULED</span>;
    }
  };

  const getScoreDisplay = (game: SlateGame) => {
    // Check if game has scores (even if status isn't updated to 'final')
    const hasScores = game.awayScore !== null && game.homeScore !== null;
    const isPast = new Date(game.date) < new Date();
    const isFinal = game.status === 'final' || (hasScores && isPast);
    
    if (isFinal && hasScores) {
      const awayWon = game.awayScore! > game.homeScore!;
      const homeWon = game.homeScore! > game.awayScore!;
      
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

  // Group games by date using ISO date strings as keys
  const groupedGames = useMemo(() => {
    return games.reduce((acc, game) => {
      const dateKey = getDateKey(game.date);
      if (!acc[dateKey]) {
        acc[dateKey] = {
          dateKey,
          formattedDate: formatDate(game.date),
          games: []
        };
      }
      acc[dateKey].games.push(game);
      return acc;
    }, {} as Record<string, { dateKey: string; formattedDate: string; games: SlateGame[] }>);
  }, [games]);

  // Show all dates by default (no lazy loading for now to ensure all games show)
  const dateEntries = Object.entries(groupedGames).sort(([a], [b]) => a.localeCompare(b));

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
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={compactMode}
                onChange={(e) => handleCompactToggle(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Compact rows</span>
            </label>
          </div>
        </div>
      </div>
      
      {/* Search bar */}
      <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
        <div className="relative">
          <div className="flex items-center space-x-2">
            <div className="flex-1 relative">
              <input
                ref={searchInputRef}
                data-search-input
                type="text"
                value={searchQuery}
                onChange={handleSearchInput}
                onKeyDown={handleSearchKeyDown}
                placeholder="Jump to game… (type a team)"
                className="w-full px-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                role="combobox"
                aria-expanded={showSearchResults}
                aria-controls="search-results"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setShowSearchResults(false);
                  }}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <div className="text-xs text-gray-500">
              Press <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">/</kbd> to focus
            </div>
          </div>
          
          {/* Search results dropdown */}
          {showSearchResults && (
            <div
              id="search-results"
              className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-64 overflow-y-auto"
              role="listbox"
            >
              {searchResults.length > 0 ? (
                searchResults.map((game, index) => {
                  const awayName = game.awayTeamId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                  const homeName = game.homeTeamId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                  
                  return (
                    <button
                      key={game.gameId}
                      onClick={() => selectSearchResult(game)}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 focus:outline-none focus:bg-gray-50 ${
                        index === selectedResultIndex ? 'bg-blue-50' : ''
                      }`}
                      role="option"
                      aria-selected={index === selectedResultIndex}
                    >
                      <div className="font-medium">{awayName} @ {homeName}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(game.date).toLocaleDateString('en-US', { 
                          weekday: 'short', 
                          month: 'short', 
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="px-4 py-2 text-sm text-gray-500" role="option" aria-disabled="true">
                  No games found
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Top horizontal scrollbar */}
      <div 
        ref={topScrollRef}
        onScroll={handleTopScroll}
        className="sticky top-0 z-20 overflow-x-auto bg-gray-50 border-b border-gray-200"
        style={{ height: '17px' }}
      >
        <div 
          className="h-full"
          style={{ 
            width: showAdvancedColumns ? '1400px' : '1100px',
            minWidth: showAdvancedColumns ? '1400px' : '1100px'
          }}
        />
      </div>
      
      {/* Mini day-nav with active highlighting */}
      {dateEntries.length > 1 && (
        <div className="sticky top-[17px] z-19 bg-gray-50 border-b border-gray-200 px-4 py-2">
          <div className="flex space-x-2 overflow-x-auto pb-2">
            {dateEntries.map(([dateKey, dateData]) => {
              const isActive = activeDate === dateKey;
              const isToday = dateKey === getTodayDate();
              // Parse the formatted date to extract day of week and date
              const formattedParts = dateData.formattedDate.split(',');
              const dayOfWeek = formattedParts[0]; // "Friday"
              const monthDay = formattedParts[1]?.trim() || ''; // "Oct 31"
              return (
                <button
                  key={dateKey}
                  onClick={() => {
                    const header = dateHeaderRefs.current.get(dateKey);
                    if (header && bodyScrollRef.current) {
                      const offset = header.offsetTop - bodyScrollRef.current.offsetTop;
                      bodyScrollRef.current.scrollTo({ top: offset, behavior: 'smooth' });
                      
                      // Update URL hash and active date
                      window.history.replaceState(null, '', `#date-${dateKey}`);
                      setActiveDate(dateKey);
                    }
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap transition-colors cursor-pointer ${
                    isActive 
                      ? 'bg-blue-600 text-white' 
                      : isToday 
                        ? 'bg-yellow-100 text-yellow-800 border border-yellow-300 hover:bg-yellow-200'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {dayOfWeek.substring(0, 3)} {monthDay}
                  {isToday && ' (Today)'}
                </button>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Fixed-height scroll container */}
      <div 
        ref={bodyScrollRef}
        onScroll={handleBodyScroll}
        className="overflow-auto"
        style={{ height: '70vh', maxHeight: '70vh' }}
      >
        <table className="min-w-full divide-y divide-gray-200" style={{ minWidth: showAdvancedColumns ? '1400px' : '1100px' }}>
          <thead className="bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70 sticky top-0 z-10 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px]">
                Matchup
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]">
                Time / Score
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                <div className="flex items-center justify-center gap-1">
                  Market Spread
                  <InfoTooltip content="The betting market's point spread. Negative values mean the home team is favored. This is the line you'd bet against." position="bottom" />
                </div>
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                <div className="flex items-center justify-center gap-1">
                  Market Total
                  <InfoTooltip content="The betting market's total points line (over/under). This is the combined points both teams are expected to score." position="bottom" />
                </div>
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                Status
              </th>
              {showAdvancedColumns && (
                <>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                    <div className="flex items-center justify-center gap-1">
                      Model Spread
                      <InfoTooltip content="Our model's predicted point spread based on team power ratings. Compare this to Market Spread to find edge opportunities." position="bottom" />
                    </div>
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                    <div className="flex items-center justify-center gap-1">
                      Model Total
                      <InfoTooltip content="Our model's predicted total points for this game. Compare to Market Total to find edge opportunities." position="bottom" />
                    </div>
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]">
                    <div className="flex items-center justify-center gap-1">
                      Pick (ATS)
                      <InfoTooltip content="Model's pick against the spread. Shows which team to bet based on our spread prediction vs. the market." position="bottom" />
                    </div>
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]">
                    <div className="flex items-center justify-center gap-1">
                      Pick (Total)
                      <InfoTooltip content="Model's pick for the total (over/under). Based on our total prediction vs. the market line." position="bottom" />
                    </div>
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                    <div className="flex items-center justify-center gap-1">
                      Max Edge
                      <InfoTooltip content="The larger of spread edge or total edge (in points). Higher edge means stronger betting opportunity." position="bottom" />
                    </div>
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                    <div className="flex items-center justify-center gap-1">
                      Confidence
                      <InfoTooltip content="Confidence tier (A/B/C) based on edge size. A = 4.0+ pts (highest), B = 3.0-3.9 pts, C = 2.0-2.9 pts (lowest)." position="bottom" />
                    </div>
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                    Action
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {dateEntries.map(([dateKey, dateData]) => (
              <React.Fragment key={dateKey}>
                {showDateHeaders && (
                  <tr 
                    ref={(el) => {
                      if (el) {
                        dateHeaderRefs.current.set(dateKey, el);
                      }
                    }}
                    className="bg-white/90 sticky top-[var(--header-height,48px)] z-9 border-b"
                  >
                    <td colSpan={showAdvancedColumns ? 12 : 5} className="px-6 py-3 text-sm font-medium text-gray-700">
                      {dateData.formattedDate}
                    </td>
                  </tr>
                )}
                {dateData.games.map((game) => (
                  <tr 
                    key={game.gameId} 
                    id={`game-${game.gameId}`}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => window.location.href = `/game/${game.gameId}`}
                  >
                    <td className={`px-6 whitespace-nowrap ${compactMode ? 'py-1' : 'py-4'}`}>
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
                    <td className={`px-6 whitespace-nowrap ${compactMode ? 'py-1' : 'py-4'}`}>
                      {getScoreDisplay(game)}
                    </td>
                    <td className={`px-6 whitespace-nowrap text-center ${compactMode ? 'py-1' : 'py-4'}`}>
                      <div 
                        className="text-sm font-medium text-gray-900 cursor-help"
                        title={formatTooltip(game.closingSpread)}
                      >
                        {formatSpread(game.closingSpread)}
                      </div>
                    </td>
                    <td className={`px-6 whitespace-nowrap text-center ${compactMode ? 'py-1' : 'py-4'}`}>
                      <div 
                        className="text-sm font-medium text-gray-900 cursor-help"
                        title={formatTooltip(game.closingTotal)}
                      >
                        {formatTotal(game.closingTotal)}
                      </div>
                    </td>
                    <td className={`px-6 whitespace-nowrap text-center ${compactMode ? 'py-1' : 'py-4'}`}>
                      {getStatusBadge(game)}
                    </td>
                    {showAdvancedColumns && (
                      <>
                        <td className={`px-6 whitespace-nowrap text-center ${compactMode ? 'py-1' : 'py-4'}`}>
                          <div className="text-sm text-gray-900">
                            {game.modelSpread !== null && game.modelSpread !== undefined ? game.modelSpread.toFixed(1) : '—'}
                          </div>
                        </td>
                        <td className={`px-6 whitespace-nowrap text-center ${compactMode ? 'py-1' : 'py-4'}`}>
                          <div className="text-sm text-gray-900">
                            {game.modelTotal !== null && game.modelTotal !== undefined ? game.modelTotal.toFixed(1) : '—'}
                          </div>
                        </td>
                        <td className={`px-6 whitespace-nowrap text-center ${compactMode ? 'py-1' : 'py-4'}`}>
                          <div className="text-sm text-gray-900">
                            {game.pickSpread || '—'}
                          </div>
                        </td>
                        <td className={`px-6 whitespace-nowrap text-center ${compactMode ? 'py-1' : 'py-4'}`}>
                          <div className="text-sm text-gray-900">
                            {game.pickTotal || '—'}
                          </div>
                        </td>
                        <td className={`px-6 whitespace-nowrap text-center ${compactMode ? 'py-1' : 'py-4'}`}>
                          <div className="text-sm text-gray-900">
                            {game.maxEdge !== null && game.maxEdge !== undefined ? game.maxEdge.toFixed(1) : '—'}
                          </div>
                        </td>
                        <td className={`px-6 whitespace-nowrap text-center ${compactMode ? 'py-1' : 'py-4'}`}>
                          <div className="text-sm text-gray-900">
                            {game.confidence || '—'}
                          </div>
                        </td>
                        <td className={`px-6 whitespace-nowrap text-center ${compactMode ? 'py-1' : 'py-4'}`}>
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
        
        {/* Floating action buttons */}
        {showFloatingButtons && (
          <div className="absolute bottom-4 right-4 flex flex-col space-y-2 z-30">
            <button
              onClick={scrollToTop}
              aria-label="Back to top"
              title="Back to top"
              className="p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
            {hasTodayGames() && (
              <button
                onClick={scrollToToday}
                aria-label="Scroll to today"
                title="Scroll to today"
                className="p-3 bg-green-600 text-white rounded-full shadow-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
            )}
          </div>
        )}
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
      
      {/* View all columns link */}
      <div className="px-6 py-3 border-t border-gray-200 bg-gray-50">
        <div className="flex justify-between items-center">
          <button
            onClick={() => handleAdvancedToggle(!showAdvancedColumns)}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            {showAdvancedColumns ? 'Hide advanced columns' : 'View all columns'}
          </button>
          <div className="text-xs text-gray-500">
            {showAdvancedColumns ? 'Showing model data, picks, and edge calculations' : 'Click to show model data, picks, and edge calculations'}
          </div>
        </div>
      </div>
      
      {/* Legend */}
      <div className="px-6 py-3 border-t border-gray-200 bg-gray-50">
        <div className="text-xs text-gray-600 space-y-1">
          <div className="font-medium text-gray-700 mb-2">Legend:</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <span className="font-medium">Tooltips:</span> Hover over spread/total values to see book name and timestamp
            </div>
            <div>
              <span className="font-medium">Status badges:</span> 
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-green-100 text-green-800 rounded">FINAL</span> = Game complete, 
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-100 text-red-800 rounded">LIVE</span> = In progress, 
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-100 text-gray-800 rounded">SCHEDULED</span> = Upcoming
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
