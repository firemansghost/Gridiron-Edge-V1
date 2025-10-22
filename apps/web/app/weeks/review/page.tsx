'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface BetSummary {
  totalBets: number;
  gradedBets: number;
  hitRate: number;
  totalPnL: number;
  roi: number;
  avgEdge: number;
  avgCLV: number;
}

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
  game: {
    homeTeam: { name: string };
    awayTeam: { name: string };
    date: string;
  };
}

interface WeekReviewData {
  summary: BetSummary;
  bets: Bet[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export default function WeekReviewPage() {
  const router = useRouter();
  const [season, setSeason] = useState(2025);
  const [week, setWeek] = useState(9);
  const [strategy, setStrategy] = useState('');
  const [data, setData] = useState<WeekReviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        season: season.toString(),
        week: week.toString(),
        ...(strategy && { strategy }),
        page: '1',
        pageSize: '50'
      });
      
      const response = await fetch(`/api/bets/summary?${params}`);
      if (!response.ok) throw new Error('Failed to fetch data');
      
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [season, week, strategy]);

  const exportCSV = () => {
    if (!data?.bets) return;
    
    const headers = [
      'Matchup', 'Market', 'Side', 'Model Price', 'Close Price', 'CLV', 
      'Result', 'Stake', 'PnL', 'Strategy', 'Created'
    ];
    
    const rows = data.bets.map(bet => [
      `${bet.game.awayTeam.name} @ ${bet.game.homeTeam.name}`,
      bet.marketType,
      bet.side,
      bet.modelPrice,
      bet.closePrice || '',
      bet.clv || '',
      bet.result || '',
      bet.stake,
      bet.pnl || '',
      bet.strategyTag,
      new Date(bet.createdAt).toLocaleDateString()
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bets-${season}-w${week}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  const formatPercent = (value: number) => 
    `${(value * 100).toFixed(1)}%`;

  const getResultColor = (result: string | null) => {
    switch (result) {
      case 'win': return 'text-green-600';
      case 'loss': return 'text-red-600';
      case 'push': return 'text-yellow-600';
      default: return 'text-gray-500';
    }
  };

  const getResultIcon = (result: string | null) => {
    switch (result) {
      case 'win': return '✅';
      case 'loss': return '❌';
      case 'push': return '🤝';
      default: return '⏳';
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Week Review</h1>
        
        {/* Controls */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-1">Season</label>
            <select 
              value={season} 
              onChange={(e) => setSeason(parseInt(e.target.value))}
              className="border rounded px-3 py-2"
            >
              <option value={2024}>2024</option>
              <option value={2025}>2025</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Week</label>
            <select 
              value={week} 
              onChange={(e) => setWeek(parseInt(e.target.value))}
              className="border rounded px-3 py-2"
            >
              {Array.from({ length: 16 }, (_, i) => i + 1).map(w => (
                <option key={w} value={w}>Week {w}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Strategy</label>
            <select 
              value={strategy} 
              onChange={(e) => setStrategy(e.target.value)}
              className="border rounded px-3 py-2"
            >
              <option value="">All Strategies</option>
              <option value="TestStrategy1">Test Strategy 1</option>
              <option value="TestStrategy2">Test Strategy 2</option>
            </select>
          </div>
          
          <div className="flex items-end">
            <button 
              onClick={fetchData}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            Error: {error}
          </div>
        )}
      </div>

      {data && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Total Bets</h3>
              <p className="text-3xl font-bold text-blue-600">{data.summary.totalBets}</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Hit Rate</h3>
              <p className="text-3xl font-bold text-green-600">
                {formatPercent(data.summary.hitRate)}
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">ROI</h3>
              <p className={`text-3xl font-bold ${data.summary.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatPercent(data.summary.roi / 100)}
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Total PnL</h3>
              <p className={`text-3xl font-bold ${data.summary.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(data.summary.totalPnL)}
              </p>
            </div>
          </div>

          {/* Additional Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Avg Edge</h3>
              <p className="text-2xl font-bold text-blue-600">
                {data.summary.avgEdge.toFixed(2)}
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Avg CLV</h3>
              <p className="text-2xl font-bold text-purple-600">
                {data.summary.avgCLV.toFixed(3)}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Bets ({data.pagination.totalItems})</h2>
            <button
              onClick={exportCSV}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Export CSV
            </button>
          </div>

          {/* Bets Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Matchup
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Market
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Side
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Model Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Close Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      CLV
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Result
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Stake
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      PnL
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Strategy
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.bets.map((bet) => (
                    <tr 
                      key={bet.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/game/${bet.gameId}?asOf=close`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {bet.game.awayTeam.name} @ {bet.game.homeTeam.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(bet.game.date).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {bet.marketType}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {bet.side}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {bet.modelPrice}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {bet.closePrice || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {bet.clv ? bet.clv.toFixed(3) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center text-sm font-medium ${getResultColor(bet.result)}`}>
                          {getResultIcon(bet.result)} {bet.result || 'Pending'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(bet.stake)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {bet.pnl ? (
                          <span className={bet.pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {formatCurrency(bet.pnl)}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {bet.strategyTag}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <div className="mt-6 flex justify-center">
              <div className="flex space-x-2">
                {Array.from({ length: data.pagination.totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => {
                      // TODO: Implement pagination
                    }}
                    className={`px-3 py-2 rounded ${
                      page === data.pagination.currentPage 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
