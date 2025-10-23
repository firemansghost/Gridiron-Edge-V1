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
  const [seeding, setSeeding] = useState(false);
  const [grading, setGrading] = useState(false);

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

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const response = await fetch('/api/bets/seed', { method: 'GET' });
      const result = await response.json();
      
      if (result.success) {
        alert(`Seeded ${result.inserted} demo bets`);
        fetchData(); // Refresh the data
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSeeding(false);
    }
  };

  const handleGrade = async () => {
    setGrading(true);
    try {
      const response = await fetch('/api/bets/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season, week }),
      });
      const result = await response.json();
      
      if (result.success) {
        const { graded, pushes, failed, filledClosePrice } = result.summary;
        alert(`Grading complete: ${graded} graded, ${pushes} pushes, ${failed} failed, ${filledClosePrice} close prices filled`);
        fetchData(); // Refresh the data
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setGrading(false);
    }
  };

  const handleSyncAndGrade = async () => {
    setGrading(true);
    try {
      const response = await fetch('/api/review/grade-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season, week }),
      });
      const result = await response.json();
      
      if (result.ok) {
        const { updatedGames, graded, pushes, failed, filledClosePrices } = result;
        alert(`Sync & Grade complete: ${updatedGames} games updated, ${graded} bets graded, ${pushes} pushes, ${failed} failed, ${filledClosePrices} close prices filled`);
        fetchData(); // Refresh the data
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setGrading(false);
    }
  };

  const exportCSV = () => {
    const params = new URLSearchParams({
      season: season.toString(),
      ...(week && { week: week.toString() }),
      ...(strategy && { strategy }),
    });
    
    const url = `/api/bets/export?${params}`;
    window.open(url, '_blank');
  };

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  const formatPercent = (value: number) => 
    `${(value * 100).toFixed(1)}%`;

  const getCLVColor = (clv: number | null) => {
    if (clv === null) return 'bg-gray-100 text-gray-600';
    return clv > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  const getEdgeColor = (edge: number | null) => {
    if (edge === null) return 'bg-gray-100 text-gray-600';
    return edge > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  const calculateEdge = (bet: any) => {
    if (!bet.closePrice || bet.marketType === 'moneyline') return null;
    const modelLine = Number(bet.modelPrice);
    const closeLine = Number(bet.closePrice);
    return modelLine - closeLine;
  };

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
        <h1 className="text-3xl font-bold mb-2">Week Review</h1>
        <p className="text-gray-600 mb-4">Review betting performance for a specific week</p>
        <p className="text-sm text-gray-500 mb-4">
          Close prices and CLV calculations use the latest market lines as of kickoff time. 
          <a href="/docs/selections-profitability" className="text-blue-600 hover:underline ml-1">
            Learn more about grading
          </a>
        </p>
        
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
          
          <div className="flex items-end gap-2">
            <button 
              onClick={fetchData}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            {process.env.NEXT_PUBLIC_ENABLE_BETS_SEED === 'true' && (
              <button 
                onClick={handleSeed}
                disabled={seeding}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
              >
                {seeding ? 'Seeding...' : 'Insert Demo Bets'}
              </button>
            )}
            {process.env.NEXT_PUBLIC_ENABLE_GRADE_UI === 'true' && (
              <button 
                onClick={handleGrade}
                disabled={grading}
                className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:opacity-50"
              >
                {grading ? 'Grading...' : 'Run Grading'}
              </button>
            )}
            <button 
              onClick={handleSyncAndGrade}
              disabled={grading}
              className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 disabled:opacity-50"
            >
              {grading ? 'Syncing & Grading...' : 'Sync Results & Grade'}
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
            {data.bets.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="text-gray-400 text-5xl mb-4">📊</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No bets found</h3>
                <p className="text-gray-600 mb-4">
                  No bets found for the current filters. Try adjusting your selection or add some demo bets.
                </p>
                <div className="space-y-2 mb-6">
                  <p className="text-sm text-gray-500">
                    <a href="/docs/selections-profitability" className="text-blue-600 hover:underline">
                      How grading works
                    </a>
                  </p>
                  <p className="text-sm text-gray-500">
                    <a href="/strategies" className="text-blue-600 hover:underline">
                      View strategies
                    </a>
                  </p>
                </div>
                {process.env.NEXT_PUBLIC_ENABLE_BETS_SEED === 'true' && (
                  <button 
                    onClick={handleSeed}
                    disabled={seeding}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    {seeding ? 'Seeding...' : 'Insert Demo Bets'}
                  </button>
                )}
              </div>
            ) : (
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
                        Edge
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {bet.clv ? (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCLVColor(bet.clv)}`}>
                              {bet.clv > 0 ? '+' : ''}{bet.clv.toFixed(3)}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {calculateEdge(bet) !== null ? (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getEdgeColor(calculateEdge(bet))}`}>
                              {calculateEdge(bet)! > 0 ? '+' : ''}{calculateEdge(bet)!.toFixed(1)}
                            </span>
                          ) : '-'}
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
            )}
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
