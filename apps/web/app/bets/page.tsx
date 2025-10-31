'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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

interface BetFilters {
  season: number;
  week: number | null;
  marketType: string;
  side: string;
  strategyTag: string;
}

export default function BetsPage() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChart, setShowChart] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [filters, setFilters] = useState<BetFilters>({
    season: 2025,
    week: null,
    marketType: '',
    side: '',
    strategyTag: ''
  });

  const fetchBets = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        season: filters.season.toString(),
        ...(filters.week && { week: filters.week.toString() }),
        ...(filters.marketType && { marketType: filters.marketType }),
        ...(filters.side && { side: filters.side }),
        ...(filters.strategyTag && { strategyTag: filters.strategyTag }),
        limit: '100',
        offset: '0'
      });
      
      const response = await fetch(`/api/bets/list?${params}`);
      if (!response.ok) throw new Error('Failed to fetch bets');
      
      const result = await response.json();
      setBets(result.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBets();
  }, [filters]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const response = await fetch('/api/bets/seed', { method: 'GET' });
      const result = await response.json();
      
      if (result.success) {
        alert(`Seeded ${result.inserted} demo bets`);
        fetchBets(); // Refresh the data
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSeeding(false);
    }
  };

  const exportCSV = () => {
    const params = new URLSearchParams({
      season: filters.season.toString(),
      ...(filters.week && { week: filters.week.toString() }),
      ...(filters.marketType && { marketType: filters.marketType }),
      ...(filters.side && { side: filters.side }),
      ...(filters.strategyTag && { strategy: filters.strategyTag }),
    });
    
    const url = `/api/bets/export?${params}`;
    window.open(url, '_blank');
  };

  const generateChartData = () => {
    const sortedBets = [...bets].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    let cumulativePnL = 0;
    
    return sortedBets.map((bet, index) => {
      if (bet.pnl !== null) {
        cumulativePnL += bet.pnl;
      }
      return {
        index: index + 1,
        date: new Date(bet.createdAt).toLocaleDateString(),
        cumulativePnL: Math.round(cumulativePnL * 100) / 100,
        bet: `${bet.game.awayTeam.name} @ ${bet.game.homeTeam.name}`,
        pnl: bet.pnl || 0
      };
    });
  };

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

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

  const totalPnL = bets.reduce((sum, bet) => sum + (bet.pnl || 0), 0);
  const gradedBets = bets.filter(bet => bet.result !== null);
  const hitRate = gradedBets.length > 0 
    ? gradedBets.filter(bet => bet.result === 'win').length / gradedBets.length 
    : 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Bets Ledger</h1>
        
        {/* Filters */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-lg font-semibold mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Season</label>
              <select 
                value={filters.season} 
                onChange={(e) => setFilters(prev => ({ ...prev, season: parseInt(e.target.value) }))}
                className="w-full border rounded px-3 py-2"
              >
                <option value={2024}>2024</option>
                <option value={2025}>2025</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Week</label>
              <select 
                value={filters.week || ''} 
                onChange={(e) => setFilters(prev => ({ ...prev, week: e.target.value ? parseInt(e.target.value) : null }))}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">All Weeks</option>
                {Array.from({ length: 16 }, (_, i) => i + 1).map(w => (
                  <option key={w} value={w}>Week {w}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Market Type</label>
              <select 
                value={filters.marketType} 
                onChange={(e) => setFilters(prev => ({ ...prev, marketType: e.target.value }))}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">All Markets</option>
                <option value="spread">Spread</option>
                <option value="total">Total</option>
                <option value="moneyline">Moneyline</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Side</label>
              <select 
                value={filters.side} 
                onChange={(e) => setFilters(prev => ({ ...prev, side: e.target.value }))}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">All Sides</option>
                <option value="home">Home</option>
                <option value="away">Away</option>
                <option value="over">Over</option>
                <option value="under">Under</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Strategy</label>
              <select 
                value={filters.strategyTag} 
                onChange={(e) => setFilters(prev => ({ ...prev, strategyTag: e.target.value }))}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">All Strategies</option>
                <option value="TestStrategy1">Test Strategy 1</option>
                <option value="TestStrategy2">Test Strategy 2</option>
              </select>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Total Bets</h3>
            <p className="text-2xl font-bold text-blue-600">{bets.length}</p>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Hit Rate</h3>
            <p className="text-2xl font-bold text-green-600">
              {(hitRate * 100).toFixed(1)}%
            </p>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Total PnL</h3>
            <p className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(totalPnL)}
            </p>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Graded</h3>
            <p className="text-2xl font-bold text-purple-600">
              {gradedBets.length}/{bets.length}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-4">
            <h2 className="text-2xl font-bold">Bets ({bets.length})</h2>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showChart}
                onChange={(e) => setShowChart(e.target.checked)}
                className="mr-2"
              />
              Show PnL Chart
            </label>
          </div>
          <div className="flex gap-2">
            {process.env.NEXT_PUBLIC_ENABLE_BETS_SEED === 'true' && (
              <button 
                onClick={handleSeed}
                disabled={seeding}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {seeding ? 'Seeding...' : 'Insert Demo Bets'}
              </button>
            )}
            <button
              onClick={exportCSV}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Export CSV
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            Error: {error}
          </div>
        )}

        {/* PnL Chart */}
        {showChart && bets.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <h3 className="text-lg font-semibold mb-4">Cumulative PnL Over Time</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={generateChartData()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="index" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: any, name: string) => [
                      name === 'cumulativePnL' ? formatCurrency(value) : value,
                      name === 'cumulativePnL' ? 'Cumulative PnL' : name
                    ]}
                    labelFormatter={(label: any, payload: any) => {
                      if (payload && payload[0]) {
                        return `Bet ${label}: ${payload[0].payload.bet}`;
                      }
                      return `Bet ${label}`;
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="cumulativePnL" 
                    stroke="#3B82F6" 
                    strokeWidth={2}
                    dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Bets Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {bets.length === 0 ? (
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
                      Season/Week
                    </th>
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
                  {bets.map((bet) => (
                  <tr key={bet.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {bet.season} W{bet.week}
                    </td>
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
                      {bet.strategyTag === 'demo_seed' ? (
                        <span className="text-gray-500 italic">Demo</span>
                      ) : (
                        bet.strategyTag
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
