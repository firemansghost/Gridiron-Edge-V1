'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { InfoTooltip } from '@/components/InfoTooltip';

interface Bet {
  id: string;
  season: number;
  week: number;
  gameId: string;
  marketType: string;
  side: string;
  modelPrice: number;
  closePrice: number | null;
  stake: number;
  result: string | null;
  pnl: number | null;
  clv: number | null;
  strategyTag: string;
  source: string;
  notes: string | null;
  createdAt: string;
  currentBestLine: number | null;
  currentBestLineBook: string | null;
  currentBestLineTimestamp: string | null;
  edgeVsCurrent: number | null;
  gameStatus: string;
  gameDate: string;
  game: {
    homeTeam: { id: string; name: string };
    awayTeam: { id: string; name: string };
  };
}

interface Summary {
  total: number;
  pending: number;
  graded: number;
  totalStake: number;
  totalPnL: number;
  winCount: number;
  lossCount: number;
  pushCount: number;
  hitRate: number;
}

export default function MyCardPage() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [season, setSeason] = useState<number>(2025);
  const [week, setWeek] = useState<number | null>(null);
  const [status, setStatus] = useState<'all' | 'pending' | 'graded'>('pending');
  const [marketType, setMarketType] = useState<string>('');

  // Load filters from URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const seasonParam = params.get('season');
      if (seasonParam) setSeason(parseInt(seasonParam));
      const weekParam = params.get('week');
      if (weekParam) setWeek(parseInt(weekParam));
      const statusParam = params.get('status');
      if (statusParam && ['all', 'pending', 'graded'].includes(statusParam)) {
        setStatus(statusParam as 'all' | 'pending' | 'graded');
      }
      const marketParam = params.get('marketType');
      if (marketParam) setMarketType(marketParam);
    }
  }, []);

  // Update URL when filters change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams();
      params.set('season', season.toString());
      if (week) params.set('week', week.toString());
      if (status !== 'all') params.set('status', status);
      if (marketType) params.set('marketType', marketType);
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    }
  }, [season, week, status, marketType]);

  const fetchMyCard = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        season: season.toString(),
        ...(week && { week: week.toString() }),
        ...(status !== 'all' && { status }),
        ...(marketType && { marketType }),
      });
      
      const response = await fetch(`/api/my-card?${params}`);
      if (!response.ok) throw new Error('Failed to fetch my card');
      
      const result = await response.json();
      if (result.success) {
        setBets(result.bets || []);
        setSummary(result.summary || null);
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyCard();
  }, [season, week, status, marketType]);

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getResultBadge = (result: string | null) => {
    switch (result) {
      case 'win': return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">✅ Win</span>;
      case 'loss': return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">❌ Loss</span>;
      case 'push': return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">🤝 Push</span>;
      default: return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">⏳ Pending</span>;
    }
  };

  const getCLVColor = (clv: number | null) => {
    if (clv === null) return 'text-gray-500';
    return clv > 0 ? 'text-green-600' : 'text-red-600';
  };

  const exportCSV = () => {
    const headers = [
      'Season',
      'Week',
      'Matchup',
      'Market',
      'Side',
      'Bet Line',
      'Current Best Line',
      'Closing Line',
      'CLV',
      'Edge vs Current',
      'Stake',
      'Result',
      'PnL',
      'Strategy',
    ];

    const rows = bets.map(bet => [
      bet.season,
      bet.week,
      `${bet.game.awayTeam.name} @ ${bet.game.homeTeam.name}`,
      bet.marketType,
      bet.side,
      bet.modelPrice,
      bet.currentBestLine || '',
      bet.closePrice || '',
      bet.clv?.toFixed(3) || '',
      bet.edgeVsCurrent?.toFixed(1) || '',
      bet.stake,
      bet.result || 'Pending',
      bet.pnl || '',
      bet.strategyTag,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-card-${season}${week ? `-w${week}` : ''}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">My Card</h1>
            <p className="text-gray-600">Track your bets with live line updates and CLV tracking</p>
          </div>
          <button
            onClick={exportCSV}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Export CSV
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Season</label>
              <select 
                value={season} 
                onChange={(e) => setSeason(parseInt(e.target.value))}
                className="w-full border rounded px-3 py-2"
              >
                <option value={2024}>2024</option>
                <option value={2025}>2025</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Week</label>
              <select 
                value={week || ''} 
                onChange={(e) => setWeek(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">Current Week</option>
                {Array.from({ length: 16 }, (_, i) => i + 1).map(w => (
                  <option key={w} value={w}>Week {w}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select 
                value={status} 
                onChange={(e) => setStatus(e.target.value as 'all' | 'pending' | 'graded')}
                className="w-full border rounded px-3 py-2"
              >
                <option value="pending">Pending</option>
                <option value="graded">Graded</option>
                <option value="all">All</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Market Type</label>
              <select 
                value={marketType} 
                onChange={(e) => setMarketType(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">All Markets</option>
                <option value="spread">Spread</option>
                <option value="total">Total</option>
                <option value="moneyline">Moneyline</option>
              </select>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">Total Bets</h3>
              <p className="text-2xl font-bold text-blue-600">{summary.total}</p>
              <p className="text-xs text-gray-500 mt-1">
                {summary.pending} pending, {summary.graded} graded
              </p>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">Total Stake</h3>
              <p className="text-2xl font-bold text-purple-600">{formatCurrency(summary.totalStake)}</p>
            </div>

            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">Hit Rate</h3>
              <p className="text-2xl font-bold text-green-600">
                {(summary.hitRate * 100).toFixed(1)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {summary.winCount}W-{summary.lossCount}L-{summary.pushCount}P
              </p>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">Total PnL</h3>
              <p className={`text-2xl font-bold ${summary.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(summary.totalPnL)}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            Error: {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading your card...</p>
          </div>
        ) : bets.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-gray-400 text-5xl mb-4">📋</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No bets found</h3>
            <p className="text-gray-600 mb-4">
              No bets match the current filters. Try adjusting your selection.
            </p>
            <Link href="/bets" className="text-blue-600 hover:underline">
              View all bets →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bets.map((bet) => (
              <div key={bet.id} className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
                {/* Header */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">
                      {bet.season} Week {bet.week}
                    </div>
                    <Link 
                      href={`/game/${bet.gameId}`}
                      className="text-lg font-semibold text-gray-900 hover:text-blue-600"
                    >
                      {bet.game.awayTeam.name} @ {bet.game.homeTeam.name}
                    </Link>
                    <div className="text-sm text-gray-500 mt-1">
                      {new Date(bet.gameDate).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                  {getResultBadge(bet.result)}
                </div>

                {/* Bet Details */}
                <div className="space-y-3 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Market</span>
                    <span className="text-sm font-medium text-gray-900 capitalize">
                      {bet.marketType} - {bet.side}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Bet Line</span>
                    <span className="text-sm font-medium text-gray-900">{bet.modelPrice}</span>
                  </div>

                  {bet.currentBestLine !== null && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 flex items-center gap-1">
                        Current Best Line
                        <InfoTooltip content="The best available line right now. Compare to your bet line to see if line movement is in your favor." />
                      </span>
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900">{bet.currentBestLine}</div>
                        {bet.currentBestLineBook && (
                          <div className="text-xs text-gray-500">
                            {bet.currentBestLineBook}
                            {bet.currentBestLineTimestamp && ` • ${formatTimestamp(bet.currentBestLineTimestamp)}`}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {bet.closePrice !== null && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Closing Line</span>
                      <span className="text-sm font-medium text-gray-900">{bet.closePrice}</span>
                    </div>
                  )}

                  {bet.clv !== null && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 flex items-center gap-1">
                        CLV
                        <InfoTooltip content="Closing Line Value: Difference between your bet line and the closing line. Positive CLV means you got a better line than closed." />
                      </span>
                      <span className={`text-sm font-medium ${getCLVColor(bet.clv)}`}>
                        {bet.clv > 0 ? '+' : ''}{bet.clv.toFixed(2)}
                      </span>
                    </div>
                  )}

                  {bet.edgeVsCurrent !== null && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 flex items-center gap-1">
                        Edge vs Current
                        <InfoTooltip content="How your bet line compares to the current best available line." />
                      </span>
                      <span className={`text-sm font-medium ${bet.edgeVsCurrent > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {bet.edgeVsCurrent > 0 ? '+' : ''}{bet.edgeVsCurrent.toFixed(1)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm text-gray-600">Stake</span>
                    <span className="text-sm font-medium text-gray-900">{formatCurrency(bet.stake)}</span>
                  </div>

                  {bet.pnl !== null && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">PnL</span>
                      <span className={`text-sm font-bold ${bet.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(bet.pnl)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="pt-3 border-t text-xs text-gray-500">
                  <div className="flex justify-between">
                    <span>Strategy: {bet.strategyTag}</span>
                    <span>{bet.source === 'manual' ? 'Manual' : 'Auto'}</span>
                  </div>
                  {bet.notes && (
                    <div className="mt-2 text-gray-600 italic">"{bet.notes}"</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

