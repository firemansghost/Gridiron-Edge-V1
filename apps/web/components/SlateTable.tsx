'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { InfoTooltip } from './InfoTooltip';
import { ModelViewModeToggle } from './ModelViewModeToggle';
import { useModelViewMode } from '@/contexts/ModelViewModeContext';

/**
 * Terminology:
 * - ATS = Against the Spread (side bets, using point spread)
 * - OU = Over/Under (totals, using game total points)
 */

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
  hasOdds?: boolean; // Indicates if game has any market lines
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
  const [hideGamesWithoutOdds, setHideGamesWithoutOdds] = useState(false);
  
  // Enhanced filter state
  const [minEdge, setMinEdge] = useState<number>(0);
  const [confidenceTier, setConfidenceTier] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [timeRange, setTimeRange] = useState<'all' | 'today' | 'tomorrow' | 'thisWeek'>('all');
  const [sortBy, setSortBy] = useState<'time' | 'edge' | 'confidence'>('time');
  
  // Get model view mode from context
  const { mode: modelViewMode } = useModelViewMode();
  
  // Refs for scroll synchronization
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const dateHeaderRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const datePillsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSlate();
  }, [season, week]);

  // Handle URL hash for deep linking
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#date-')) {
        const dateKey = hash.replace('#date-', '');
        const header = dateHeaderRefs.current.get(dateKey);
        if (header && bodyScrollRef.current) {
          const offset = header.offsetTop - bodyScrollRef.current.offsetTop;
          bodyScrollRef.current.scrollTo({ top: offset, behavior: 'smooth' });
          setActiveDate(dateKey);
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

  // Load filters from URL on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const minEdgeParam = params.get('minEdge');
      if (minEdgeParam) {
        setMinEdge(parseFloat(minEdgeParam));
      }
      const confidenceParam = params.get('confidence');
      if (confidenceParam && ['all', 'A', 'B', 'C'].includes(confidenceParam)) {
        setConfidenceTier(confidenceParam as 'all' | 'A' | 'B' | 'C');
      }
      const timeRangeParam = params.get('timeRange');
      if (timeRangeParam && ['all', 'today', 'tomorrow', 'thisWeek'].includes(timeRangeParam)) {
        setTimeRange(timeRangeParam as 'all' | 'today' | 'tomorrow' | 'thisWeek');
      }
      const sortByParam = params.get('sortBy');
      if (sortByParam && ['time', 'edge', 'confidence'].includes(sortByParam)) {
        setSortBy(sortByParam as 'time' | 'edge' | 'confidence');
      }
    }
  }, []);

  // Update URL when filters change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      
      if (minEdge > 0) {
        params.set('minEdge', minEdge.toString());
      } else {
        params.delete('minEdge');
      }
      
      if (confidenceTier !== 'all') {
        params.set('confidence', confidenceTier);
      } else {
        params.delete('confidence');
      }
      
      if (timeRange !== 'all') {
        params.set('timeRange', timeRange);
      } else {
        params.delete('timeRange');
      }
      
      if (sortBy !== 'time') {
        params.set('sortBy', sortBy);
      } else {
        params.delete('sortBy');
      }
      
      const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, [minEdge, confidenceTier, timeRange, sortBy]);

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

  // Auto-scroll date pills container to show active date
  useEffect(() => {
    if (activeDate && datePillsRef.current) {
      const activeButton = datePillsRef.current.querySelector(`[data-date-key="${activeDate}"]`) as HTMLElement;
      if (activeButton) {
        activeButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeDate]);

  // Navigate to next/previous date
  const navigateToDate = (direction: 'next' | 'prev') => {
    const currentIndex = dateEntries.findIndex(([dateKey]) => dateKey === activeDate);
    if (currentIndex === -1) return;

    const newIndex = direction === 'next' 
      ? Math.min(currentIndex + 1, dateEntries.length - 1)
      : Math.max(currentIndex - 1, 0);

    const [newDateKey] = dateEntries[newIndex];
    const header = dateHeaderRefs.current.get(newDateKey);
    if (header && bodyScrollRef.current) {
      const offset = header.offsetTop - bodyScrollRef.current.offsetTop;
      bodyScrollRef.current.scrollTo({ top: offset, behavior: 'smooth' });
      setActiveDate(newDateKey);
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
    // Sort by position to check in order
    const sortedHeaders = Array.from(dateHeaderRefs.current.entries())
      .sort(([, a], [, b]) => {
        const offsetA = a.offsetTop - bodyScrollRef.current!.offsetTop;
        const offsetB = b.offsetTop - bodyScrollRef.current!.offsetTop;
        return offsetA - offsetB;
      });
    
    for (const [dateKey, header] of sortedHeaders) {
      if (header) {
        const offset = header.offsetTop - bodyScrollRef.current.offsetTop;
        if (offset <= scrollTop + headerHeight) {
          const nextHeader = sortedHeaders.find(([, h]) => {
            const nextOffset = h.offsetTop - bodyScrollRef.current!.offsetTop;
            return nextOffset > scrollTop + headerHeight;
          });
          
          if (!nextHeader || header === nextHeader[1]) {
            setActiveDate(dateKey);
            break;
          }
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
      
      // Dev logging
      if (process.env.NODE_ENV !== 'production') {
        console.log('[CoreV1 Slate] Received games:', data.length);
        data.slice(0, 3).forEach((game: SlateGame) => {
          console.log('[CoreV1 Slate Row]', {
            matchup: `${game.awayTeamId} @ ${game.homeTeamId}`,
            modelSpread: game.modelSpread,
            pickSpread: game.pickSpread,
            maxEdge: game.maxEdge,
            confidence: game.confidence,
          });
        });
      }
      
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
      // Format using America/Chicago timezone (CST/CDT)
      const timeStr = date.toLocaleTimeString('en-US', { 
        timeZone: 'America/Chicago',
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
      // Determine if CST or CDT (daylight saving)
      const isDST = date.toLocaleString('en-US', { 
        timeZone: 'America/Chicago',
        timeZoneName: 'short'
      }).includes('CDT');
      const tzLabel = isDST ? 'CDT' : 'CST';
      return `${timeStr} ${tzLabel}`;
    } catch {
      return 'TBD';
    }
  };

  // Get ISO date string (YYYY-MM-DD) for grouping and comparison
  // IMPORTANT: Convert to America/Chicago timezone first to get correct local date
  const getDateKey = (dateString: string) => {
    try {
      const d = new Date(dateString);
      // Convert to America/Chicago timezone first, then extract date
      const localDateStr = d.toLocaleDateString('en-US', { 
        timeZone: 'America/Chicago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      // Format as YYYY-MM-DD
      const [month, day, year] = localDateStr.split('/');
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } catch {
      return 'unknown';
    }
  };

  // Format date for display (using America/Chicago timezone)
  const formatDate = (date: string) => {
    try {
      const d = new Date(date);
      return d.toLocaleDateString('en-US', { 
        timeZone: 'America/Chicago',
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

  // Format timestamp for display (relative time if recent, otherwise formatted date)
  const formatTimestamp = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      // If less than 1 hour ago, show "X min ago"
      if (diffHours < 1) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        return `${diffMins}m ago`;
      }
      // If less than 24 hours ago, show "X hours ago"
      if (diffHours < 24) {
        const hours = Math.floor(diffHours);
        return `${hours}h ago`;
      }
      // If less than 7 days ago, show "X days ago"
      if (diffDays < 7) {
        const days = Math.floor(diffDays);
        return `${days}d ago`;
      }
      // Otherwise show formatted date/time
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Chicago'
      });
    } catch {
      return '';
    }
  };

  const getStatusBadge = (game: SlateGame) => {
    // Check if game has scores (even if status isn't updated to 'final')
    const hasScores = game.awayScore !== null && game.homeScore !== null;
    // Compare dates properly - both should be in same timezone context
    const gameDate = new Date(game.date);
    const now = new Date();
    const isPast = gameDate < now;
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
    // Compare dates properly
    const gameDate = new Date(game.date);
    const now = new Date();
    const isPast = gameDate < now;
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
  // Apply all filters and sorting
  // Check if all games have null totals (totals disabled)
  const allGamesHaveNullTotals = useMemo(() => {
    if (games.length === 0) return false;
    return games.every(game => game.modelTotal === null && game.pickTotal === null);
  }, [games]);

  const groupedGames = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    let filteredGames = games;

    // Filter: Hide games without odds
    if (hideGamesWithoutOdds) {
      filteredGames = filteredGames.filter(game => game.hasOdds === true);
    }

    // Filter: Min edge
    if (minEdge > 0) {
      filteredGames = filteredGames.filter(game => 
        game.maxEdge !== null && game.maxEdge !== undefined && game.maxEdge >= minEdge
      );
    }

    // Filter: Confidence tier
    if (confidenceTier !== 'all') {
      filteredGames = filteredGames.filter(game => game.confidence === confidenceTier);
    }

    // Filter: Time range
    if (timeRange !== 'all') {
      filteredGames = filteredGames.filter(game => {
        const gameDate = new Date(game.date);
        switch (timeRange) {
          case 'today':
            return gameDate >= today && gameDate < tomorrow;
          case 'tomorrow':
            return gameDate >= tomorrow && gameDate < new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000);
          case 'thisWeek':
            return gameDate >= today && gameDate < nextWeek;
          default:
            return true;
        }
      });
    }

    // Sort games
    filteredGames = [...filteredGames].sort((a, b) => {
      switch (sortBy) {
        case 'edge':
          const edgeA = a.maxEdge ?? -Infinity;
          const edgeB = b.maxEdge ?? -Infinity;
          return edgeB - edgeA; // Descending (highest edge first)
        case 'confidence':
          const confOrder = { 'A': 3, 'B': 2, 'C': 1, null: 0 };
          const confA = confOrder[a.confidence as keyof typeof confOrder] ?? 0;
          const confB = confOrder[b.confidence as keyof typeof confOrder] ?? 0;
          return confB - confA; // Descending (A first)
        case 'time':
        default:
          // Sort by date/time
          return new Date(a.date).getTime() - new Date(b.date).getTime();
      }
    });
    
    // Group by date after filtering and sorting
    return filteredGames.reduce((acc, game) => {
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
  }, [games, hideGamesWithoutOdds, minEdge, confidenceTier, timeRange, sortBy]);

  // Show all dates (no lazy loading to ensure all games show)
  const dateEntries = Object.entries(groupedGames).sort(([a], [b]) => a.localeCompare(b));

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <ModelViewModeToggle />
          </div>
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
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <ModelViewModeToggle />
          </div>
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
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <ModelViewModeToggle />
          </div>
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
            <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <ModelViewModeToggle />
          </div>
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
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={hideGamesWithoutOdds}
                onChange={(e) => setHideGamesWithoutOdds(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Hide games without odds</span>
            </label>
          </div>
        </div>
      </div>
      
      {/* Enhanced Filters */}
      {showAdvancedColumns && (
        <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Min Edge Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Min Edge
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={minEdge}
                onChange={(e) => setMinEdge(parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.0"
              />
            </div>

            {/* Confidence Tier Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Confidence Tier
              </label>
              <select
                value={confidenceTier}
                onChange={(e) => setConfidenceTier(e.target.value as 'all' | 'A' | 'B' | 'C')}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Tiers</option>
                <option value="A">Tier A</option>
                <option value="B">Tier B</option>
                <option value="C">Tier C</option>
              </select>
            </div>

            {/* Time Range Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Time Range
              </label>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as 'all' | 'today' | 'tomorrow' | 'thisWeek')}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Games</option>
                <option value="today">Today</option>
                <option value="tomorrow">Tomorrow</option>
                <option value="thisWeek">This Week</option>
              </select>
            </div>

            {/* Sort By */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Sort By
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'time' | 'edge' | 'confidence')}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="time">Time</option>
                <option value="edge">Edge (High to Low)</option>
                <option value="confidence">Confidence (A→C)</option>
              </select>
            </div>
          </div>
        </div>
      )}
      
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
      
      {/* Enhanced date navigation with arrows and game counts */}
      {dateEntries.length > 1 && (
        <div className="sticky top-[17px] z-19 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2 px-4 py-2">
            {/* Left arrow button */}
            <button
              onClick={() => {
                const currentIndex = dateEntries.findIndex(([dateKey]) => dateKey === activeDate || dateKey === dateEntries[0][0]);
                if (currentIndex > 0) {
                  const [prevDateKey] = dateEntries[currentIndex - 1];
                  const header = dateHeaderRefs.current.get(prevDateKey);
                  if (header && bodyScrollRef.current) {
                    const offset = header.offsetTop - bodyScrollRef.current.offsetTop;
                    bodyScrollRef.current.scrollTo({ top: offset, behavior: 'smooth' });
                    window.history.replaceState(null, '', `#date-${prevDateKey}`);
                    setActiveDate(prevDateKey);
                  }
                }
              }}
              disabled={activeDate === dateEntries[0][0]}
              className="flex-shrink-0 p-1.5 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Previous date"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Date pills with horizontal scroll */}
            <div 
              ref={datePillsRef}
              className="flex-1 flex space-x-2 overflow-x-auto pb-2 scrollbar-hide"
            >
              {dateEntries.map(([dateKey, dateData]) => {
                const isActive = activeDate === dateKey;
                const isToday = dateKey === getTodayDate();
                const gameCount = dateData.games.length;
                // Parse the formatted date to extract day of week and date
                const formattedParts = dateData.formattedDate.split(',');
                const dayOfWeek = formattedParts[0]; // "Friday"
                const monthDay = formattedParts[1]?.trim() || ''; // "Oct 31"
                return (
                  <button
                    key={dateKey}
                    data-date-key={dateKey}
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
                    className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap transition-colors cursor-pointer ${
                      isActive 
                        ? 'bg-blue-600 text-white shadow-md' 
                        : isToday 
                          ? 'bg-yellow-100 text-yellow-800 border border-yellow-300 hover:bg-yellow-200'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                    title={`${dateData.formattedDate} - ${gameCount} game${gameCount !== 1 ? 's' : ''}`}
                  >
                    <div className="flex flex-col items-center">
                      <span>{dayOfWeek.substring(0, 3)} {monthDay}</span>
                      {gameCount > 0 && (
                        <span className={`text-[10px] mt-0.5 ${isActive ? 'text-blue-100' : 'text-gray-500'}`}>
                          {gameCount} game{gameCount !== 1 ? 's' : ''}
                        </span>
                      )}
                      {isToday && !isActive && (
                        <span className="text-[10px] mt-0.5 text-yellow-600">Today</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right arrow button */}
            <button
              onClick={() => {
                const currentIndex = dateEntries.findIndex(([dateKey]) => dateKey === activeDate || dateKey === dateEntries[0][0]);
                if (currentIndex < dateEntries.length - 1) {
                  const [nextDateKey] = dateEntries[currentIndex + 1];
                  const header = dateHeaderRefs.current.get(nextDateKey);
                  if (header && bodyScrollRef.current) {
                    const offset = header.offsetTop - bodyScrollRef.current.offsetTop;
                    bodyScrollRef.current.scrollTo({ top: offset, behavior: 'smooth' });
                    window.history.replaceState(null, '', `#date-${nextDateKey}`);
                    setActiveDate(nextDateKey);
                  }
                }
              }}
              disabled={activeDate === dateEntries[dateEntries.length - 1][0]}
              className="flex-shrink-0 p-1.5 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Next date"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Date range indicator and jump to last date */}
            {dateEntries.length > 0 && (
              <div className="flex-shrink-0 flex items-center gap-2">
                <div className="text-xs text-gray-500 px-2">
                  {dateEntries.length} day{dateEntries.length !== 1 ? 's' : ''}
                </div>
                {dateEntries.length > 1 && (
                  <button
                    onClick={() => {
                      const [lastDateKey] = dateEntries[dateEntries.length - 1];
                      const header = dateHeaderRefs.current.get(lastDateKey);
                      if (header && bodyScrollRef.current) {
                        const offset = header.offsetTop - bodyScrollRef.current.offsetTop;
                        bodyScrollRef.current.scrollTo({ top: offset, behavior: 'smooth' });
                        window.history.replaceState(null, '', `#date-${lastDateKey}`);
                        setActiveDate(lastDateKey);
                      }
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 underline px-2"
                    title="Jump to last date"
                  >
                    Last →
                  </button>
                )}
              </div>
            )}
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
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                <div className="flex items-center justify-center gap-1">
                  Best Spread
                  <InfoTooltip content="The best available point spread from the betting market (prefers SGO source, then latest). Negative values mean the home team is favored." position="bottom" />
                </div>
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                <div className="flex items-center justify-center gap-1">
                  Best Total
                  <InfoTooltip content="The best available total points line from the betting market (prefers SGO source, then latest). This is the combined points both teams are expected to score." position="bottom" />
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
                  {!allGamesHaveNullTotals && (
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                      <div className="flex items-center justify-center gap-1">
                        Model Total
                        <InfoTooltip content="Our model's predicted total points for this game. Compare to Market Total to find edge opportunities." position="bottom" />
                      </div>
                    </th>
                  )}
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]">
                    <div className="flex items-center justify-center gap-1">
                      Pick (ATS)
                      <InfoTooltip content="Model's pick against the spread. Shows which team to bet based on our spread prediction vs. the market." position="bottom" />
                    </div>
                  </th>
                  {!allGamesHaveNullTotals && (
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]">
                      <div className="flex items-center justify-center gap-1">
                        Pick (Total)
                        <InfoTooltip content="Model's pick for the total (over/under). Based on our total prediction vs. the market line." position="bottom" />
                      </div>
                    </th>
                  )}
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                    <div className="flex flex-col items-center justify-center gap-1">
                      <div className="flex items-center justify-center gap-1">
                        Max Edge
                        <InfoTooltip content={modelViewMode === 'raw' ? "Raw model edge (before Trust-Market caps). Higher edge means stronger betting opportunity." : "The larger of spread edge or total edge (in points), after Trust-Market caps. Higher edge means stronger betting opportunity."} position="bottom" />
                      </div>
                      {modelViewMode === 'raw' && (
                        <div className="text-xs text-amber-600 font-normal">
                          Raw mode — Trust-Market caps not applied
                        </div>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                    <div className="flex items-center justify-center gap-1">
                      Confidence
                      <InfoTooltip content={modelViewMode === 'raw' ? "Raw confidence tier (A/B/C) based on raw edge size. A = 4.0+ pts (highest), B = 3.0-3.9 pts, C = 2.0-2.9 pts (lowest)." : "Confidence tier (A/B/C) based on edge size after Trust-Market caps. A = 4.0+ pts (highest), B = 3.0-3.9 pts, C = 2.0-2.9 pts (lowest)."} position="bottom" />
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
                      {game.closingSpread ? (
                        <div className="text-center">
                          <div 
                            className="text-sm font-semibold text-gray-900"
                            title={formatTooltip(game.closingSpread)}
                          >
                            {formatSpread(game.closingSpread)}
                          </div>
                          <div className="text-xs text-gray-600 font-medium mt-0.5">
                            {game.closingSpread.book}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {formatTimestamp(game.closingSpread.timestamp)}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400 italic">
                          No odds
                        </div>
                      )}
                    </td>
                    <td className={`px-6 whitespace-nowrap text-center ${compactMode ? 'py-1' : 'py-4'}`}>
                      {game.closingTotal ? (
                        <div className="text-center">
                          <div 
                            className="text-sm font-semibold text-gray-900"
                            title={formatTooltip(game.closingTotal)}
                          >
                            {formatTotal(game.closingTotal)}
                          </div>
                          <div className="text-xs text-gray-600 font-medium mt-0.5">
                            {game.closingTotal.book}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {formatTimestamp(game.closingTotal.timestamp)}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400 italic">
                          No odds
                        </div>
                      )}
                    </td>
                    <td className={`px-6 whitespace-nowrap text-center ${compactMode ? 'py-1' : 'py-4'}`}>
                      {getStatusBadge(game)}
                    </td>
                    {showAdvancedColumns && (
                      <>
                        <td className={`px-6 whitespace-nowrap text-center ${compactMode ? 'py-1' : 'py-4'}`}>
                          <div className="text-sm text-gray-900">
                            {Number.isFinite(game.modelSpread) ? game.modelSpread!.toFixed(1) : '—'}
                          </div>
                          {process.env.NODE_ENV !== 'production' && (
                            <div className="text-xs text-gray-400">
                              {game.modelSpread !== null && game.modelSpread !== undefined 
                                ? `raw: ${game.modelSpread}, finite: ${Number.isFinite(game.modelSpread)}` 
                                : 'null/undefined'}
                            </div>
                          )}
                        </td>
                        {!allGamesHaveNullTotals && (
                          <td className={`px-6 whitespace-nowrap text-center ${compactMode ? 'py-1' : 'py-4'}`}>
                            <div className="text-sm text-gray-900">
                              {Number.isFinite(game.modelTotal) ? game.modelTotal!.toFixed(1) : '—'}
                            </div>
                          </td>
                        )}
                        <td className={`px-6 whitespace-nowrap text-center ${compactMode ? 'py-1' : 'py-4'}`}>
                          <div className="text-sm text-gray-900">
                            {game.pickSpread || '—'}
                          </div>
                          {process.env.NODE_ENV !== 'production' && (
                            <div className="text-xs text-gray-400">
                              pickSpread: {game.pickSpread ?? 'null/undefined'}
                            </div>
                          )}
                        </td>
                        {!allGamesHaveNullTotals && (
                          <td className={`px-6 whitespace-nowrap text-center ${compactMode ? 'py-1' : 'py-4'}`}>
                            <div className="text-sm text-gray-900">
                              {game.pickTotal || '—'}
                            </div>
                          </td>
                        )}
                        <td className={`px-6 whitespace-nowrap text-center ${compactMode ? 'py-1' : 'py-4'}`}>
                          {(() => {
                            // Compute raw edge if in raw mode
                            let displayEdge: number | null = null;
                            
                            if (modelViewMode === 'raw') {
                              // Compute raw edge from modelSpread and closingSpread
                              if (game.modelSpread !== null && game.modelSpread !== undefined && Number.isFinite(game.modelSpread) && 
                                  game.closingSpread !== null && game.closingSpread.value !== null && Number.isFinite(game.closingSpread.value)) {
                                const rawEdge = Math.abs(game.modelSpread - game.closingSpread.value);
                                displayEdge = Math.round(rawEdge * 10) / 10;
                              }
                            } else {
                              // Official mode: use Trust-Market values
                              displayEdge = game.maxEdge ?? null;
                            }
                            
                            return (
                              <div className="text-sm text-gray-900">
                                {displayEdge !== null && Number.isFinite(displayEdge) ? displayEdge.toFixed(1) : '—'}
                              </div>
                            );
                          })()}
                          {process.env.NODE_ENV !== 'production' && (
                            <div className="text-xs text-gray-400">
                              {game.maxEdge !== null && game.maxEdge !== undefined 
                                ? `raw: ${game.maxEdge}, finite: ${Number.isFinite(game.maxEdge)}` 
                                : 'null/undefined'}
                            </div>
                          )}
                        </td>
                        <td className={`px-6 whitespace-nowrap text-center ${compactMode ? 'py-1' : 'py-4'}`}>
                          {(() => {
                            // Compute raw confidence if in raw mode
                            let displayConfidence: string | null = null;
                            
                            if (modelViewMode === 'raw') {
                              // Compute raw edge and confidence
                              if (game.modelSpread !== null && game.modelSpread !== undefined && Number.isFinite(game.modelSpread) && 
                                  game.closingSpread !== null && game.closingSpread.value !== null && Number.isFinite(game.closingSpread.value)) {
                                const rawEdge = Math.abs(game.modelSpread - game.closingSpread.value);
                                const roundedEdge = Math.round(rawEdge * 10) / 10;
                                
                                if (roundedEdge >= 4.0) displayConfidence = 'A';
                                else if (roundedEdge >= 3.0) displayConfidence = 'B';
                                else if (roundedEdge >= 2.0) displayConfidence = 'C';
                              }
                            } else {
                              // Official mode: use Trust-Market confidence
                              displayConfidence = game.confidence ?? null;
                            }
                            
                            return (
                              <div className="text-sm text-gray-900">
                                {displayConfidence || '—'}
                              </div>
                            );
                          })()}
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
      
      {/* Totals disabled note */}
      {allGamesHaveNullTotals && (
        <p className="mt-4 text-xs text-slate-500 text-center">
          Totals model is disabled for the 2025 season — spread model only for now.
        </p>
      )}
    </div>
  );
}
