'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import { getStrategyLabel } from '@/lib/strategy-utils';
import { calculateEdge, matchesTierFilter } from '@/lib/bet-tier-helpers';

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
  meta?: {
    totalStrategyRunBets: number;
    demoTagsPresent: string[];
  };
}

export default function WeekReviewPage() {
  const router = useRouter();
  const [season, setSeason] = useState(2025);
  const [week, setWeek] = useState(9);
  const [strategy, setStrategy] = useState('official_flat_100');
  const [selectedTier, setSelectedTier] = useState<'All' | 'A' | 'B' | 'C'>('All');
  const [data, setData] = useState<WeekReviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [grading, setGrading] = useState(false);
  const [strategies, setStrategies] = useState<Array<{ id: string; name: string; active: boolean; source: 'ruleset' | 'bet' }>>([]);
  const [strategiesLoading, setStrategiesLoading] = useState(true);

  // Fetch available strategies from both rulesets and actual bets
  useEffect(() => {
    const fetchStrategies = async () => {
      setStrategiesLoading(true);
      try {
        // Fetch rulesets
        const rulesetsResponse = await fetch('/api/strategies/rulesets');
        const rulesetsData = rulesetsResponse.ok ? await rulesetsResponse.json() : null;
        
        // Fetch strategy tags from bets for this season/week
        const betsParams = new URLSearchParams({
          season: season.toString(),
          week: week.toString(),
          strategy: 'all', // Get all strategies to see breakdown
        });
        const betsResponse = await fetch(`/api/bets/summary?${betsParams}`);
        const betsData = betsResponse.ok ? await betsResponse.json() : null;

        const strategyMap = new Map<string, { id: string; name: string; active: boolean; source: 'ruleset' | 'bet' }>();

        // Add rulesets
        if (rulesetsData?.success && rulesetsData.rulesets) {
          rulesetsData.rulesets
            .filter((r: { active: boolean }) => r.active)
            .forEach((r: { id: string; name: string }) => {
              strategyMap.set(r.id, {
                id: r.id,
                name: r.name,
                active: true,
                source: 'ruleset',
              });
            });
        }

        // Add strategy tags from bets (these may not have rulesets)
        if (betsData?.success && betsData.strategyBreakdown) {
          betsData.strategyBreakdown.forEach((s: { strategy: string }) => {
            if (s.strategy && !strategyMap.has(s.strategy)) {
              // Use strategyTag as both id and name, with label formatting
              strategyMap.set(s.strategy, {
                id: s.strategy,
                name: getStrategyLabel(s.strategy),
                active: true,
                source: 'bet',
              });
            }
          });
        }

        // Always include official_flat_100 if it exists in bets
        if (betsData?.success && betsData.strategyBreakdown?.some((s: { strategy: string }) => s.strategy === 'official_flat_100')) {
          if (!strategyMap.has('official_flat_100')) {
            strategyMap.set('official_flat_100', {
              id: 'official_flat_100',
              name: getStrategyLabel('official_flat_100'),
              active: true,
              source: 'bet',
            });
          }
        }

        // Sort strategies: rulesets first, then bet tags, both alphabetically
        const sortedStrategies = Array.from(strategyMap.values()).sort((a, b) => {
          if (a.source !== b.source) {
            return a.source === 'ruleset' ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
        setStrategies(sortedStrategies);
      } catch (err) {
        console.error('Failed to fetch strategies:', err);
      } finally {
        setStrategiesLoading(false);
      }
    };
    fetchStrategies();
  }, [season, week]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        season: season.toString(),
        week: week.toString(),
        page: '1',
        limit: '50'
      });
      // Only add strategy if it's not empty (not "All Strategies")
      // The strategy value is now the strategyTag (id) from either rulesets or bets
      if (strategy && strategy.trim() !== '' && strategy !== 'all') {
        params.append('strategy', strategy);
      }
      
      const response = await fetch(`/api/bets/summary?${params}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.detail || errorData.error || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(`Week Review API error: ${errorMessage}`);
      }
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || result.detail || 'API returned unsuccessful response');
      }
      
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Week Review fetch error:', err);
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
      // Use the new serverless-friendly grading API
      const response = await fetch('/api/admin/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season, week }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        const { graded, pushes, failed, filledClosePrice } = result.summary;
        alert(`Grading complete: ${graded} bets graded, ${pushes} pushes, ${failed} failed, ${filledClosePrice} close prices filled`);
        fetchData(); // Refresh the data
      } else {
        alert(`Error: ${result.error || result.detail || 'Grading failed'}`);
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
      // Call the new serverless-friendly sync-week endpoint
      // This endpoint uses services directly (no child processes)
      const response = await fetch('/api/admin/sync-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season, week, gradeAfterSync: true }),
      });
      
      const result = await response.json();
      
      if (result.ok) {
        const { updatedGames, graded, pushes, failed, filledClosePrices } = result;
        alert(`Sync & Grade complete: ${updatedGames || 0} games updated, ${graded || 0} bets graded, ${pushes || 0} pushes, ${failed || 0} failed, ${filledClosePrices || 0} close prices filled`);
        fetchData(); // Refresh the data
      } else {
        alert(`Error: ${result.error || result.detail || 'Sync & Grade failed'}`);
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

  // Use the centralized strategy label helper
  const formatStrategyName = getStrategyLabel;

  const getCLVColor = (clv: number | null) => {
    if (clv === null) return 'bg-gray-100 text-gray-600';
    return clv > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  const getEdgeColor = (edge: number | null) => {
    if (edge === null) return 'bg-gray-100 text-gray-600';
    return edge > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  // Use shared calculateEdge from bet-tier-helpers

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

  // Filter bets by confidence tier based on edge (using shared utility)
  const filteredBets = data?.bets.filter(bet => {
    if (selectedTier === 'All') return true;
    
    // Use shared matchesTierFilter function
    return matchesTierFilter(
      { modelPrice: bet.modelPrice, closePrice: bet.closePrice, marketType: bet.marketType },
      selectedTier as 'A' | 'B' | 'C'
    );
  }) || [];

  // Calculate summary from filtered bets
  const calculateSummary = (bets: Bet[]) => {
    const totalBets = bets.length;
    const gradedBets = bets.filter(bet => bet.result !== null);
    const wins = gradedBets.filter(bet => bet.result === 'win').length;
    const losses = gradedBets.filter(bet => bet.result === 'loss').length;
    const pushes = gradedBets.filter(bet => bet.result === 'push').length;
    const hitRate = gradedBets.length > 0 ? wins / gradedBets.length : 0;
    
    const totalPnL = bets.reduce((sum, bet) => sum + Number(bet.pnl || 0), 0);
    const totalStake = bets.reduce((sum, bet) => sum + Number(bet.stake), 0);
    const roi = totalStake > 0 ? (totalPnL / totalStake) * 100 : 0;
    
    // Calculate average edge (only for bets with edge values)
    const betsWithEdge = bets.filter(bet => calculateEdge(bet) !== null);
    const avgEdge = betsWithEdge.length > 0
      ? betsWithEdge.reduce((sum, bet) => sum + Math.abs(calculateEdge(bet)!), 0) / betsWithEdge.length
      : 0;
    
    // Calculate average CLV
    const betsWithCLV = bets.filter(bet => bet.clv !== null);
    const avgCLV = betsWithCLV.length > 0
      ? betsWithCLV.reduce((sum, bet) => sum + Number(bet.clv), 0) / betsWithCLV.length
      : 0;
    
    return {
      totalBets,
      gradedBets: gradedBets.length,
      wins,
      losses,
      pushes,
      hitRate,
      totalPnL,
      roi,
      avgEdge,
      avgCLV,
    };
  };

  // Calculate dynamic summary from filtered bets
  const dynamicSummary = data ? calculateSummary(filteredBets) : null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Week Review</h1>
        <p className="text-gray-600 mb-4">
          Week Review looks back at strategy-run picks for this week — how they performed vs the closing line and the final score. Use the Strategy filter to slice by ruleset or strategy tag.
        </p>
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
              onChange={(e) => {
                const val = e.target.value;
                // Normalize empty string and "all" to empty for API
                setStrategy(val === 'all' ? '' : val);
              }}
              className="border rounded px-3 py-2"
              disabled={strategiesLoading}
            >
              <option value="">{getStrategyLabel('all')}</option>
              {strategies.length === 0 && !strategiesLoading ? (
                <option disabled>No strategies configured</option>
              ) : (
                strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))
              )}
            </select>
            {strategiesLoading && (
              <div className="text-xs text-gray-500 mt-1">Loading strategies...</div>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Confidence</label>
            <select 
              value={selectedTier} 
              onChange={(e) => setSelectedTier(e.target.value as 'All' | 'A' | 'B' | 'C')}
              className="border rounded px-3 py-2"
            >
              <option value="All">All Tiers</option>
              <option value="A">Tier A (Edge ≥ 4.0)</option>
              <option value="B">Tier B (Edge 3.0 - 3.9)</option>
              <option value="C">Tier C (Edge &lt; 3.0)</option>
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
          {/* Week Summary v1 - Official Trust-Market Picks */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4">Week Summary</h2>
            
            {/* Info banner for demo/test bets present */}
            {data.meta && data.meta.demoTagsPresent.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-amber-800">
                      Demo/test strategies present
                    </h3>
                    <div className="mt-2 text-sm text-amber-700">
                      <p>
                        This week includes bets from demo/test strategies (tags: {data.meta.demoTagsPresent.join(', ')}). 
                        Stats include these bets — mainly useful for dev/testing.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {/* ATS Card */}
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">ATS – Strategy-run picks</h3>
                {(() => {
                  // Filter to ATS/spread market type from filtered bets
                  const atsBets = filteredBets.filter(bet => bet.marketType === 'spread');
                  const gradedAts = atsBets.filter(bet => bet.result !== null);
                  const wins = gradedAts.filter(bet => bet.result === 'win').length;
                  const losses = gradedAts.filter(bet => bet.result === 'loss').length;
                  const pushes = gradedAts.filter(bet => bet.result === 'push').length;
                  const totalPnL = atsBets.reduce((sum, bet) => sum + Number(bet.pnl || 0), 0);
                  
                  if (atsBets.length === 0) {
                    return (
                      <div className="text-sm text-gray-500">
                        No ATS picks {selectedTier !== 'All' ? `in ${selectedTier} tier` : 'this week'}.
                      </div>
                    );
                  }
                  
                  return (
                    <>
                      <div className="text-3xl font-bold text-gray-900 mb-2">
                        {wins}-{losses}{pushes > 0 ? `-${pushes}` : ''}
                      </div>
                      <div className="text-sm text-gray-600 mb-2">
                        {atsBets.length} {atsBets.length === 1 ? 'play' : 'plays'}
                      </div>
                      {totalPnL !== 0 && (
                        <div className={`text-sm font-medium ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)} units
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-2">
                        {selectedTier !== 'All' ? `Filtered by ${selectedTier} tier. ` : ''}Counts all strategy-run ATS picks for this week.
                      </div>
                    </>
                  );
                })()}
              </div>
              
              {/* Moneyline Card */}
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Moneyline – Strategy-run picks</h3>
                {(() => {
                  // Filter to moneyline market type from filtered bets
                  const mlBets = filteredBets.filter(bet => bet.marketType === 'moneyline');
                  const gradedMl = mlBets.filter(bet => bet.result !== null);
                  const wins = gradedMl.filter(bet => bet.result === 'win').length;
                  const losses = gradedMl.filter(bet => bet.result === 'loss').length;
                  const pushes = gradedMl.filter(bet => bet.result === 'push').length;
                  const totalPnL = mlBets.reduce((sum, bet) => sum + Number(bet.pnl || 0), 0);
                  
                  if (mlBets.length === 0) {
                    return (
                      <div className="text-sm text-gray-500">
                        No moneyline picks {selectedTier !== 'All' ? `in ${selectedTier} tier` : 'this week'}.
                      </div>
                    );
                  }
                  
                  return (
                    <>
                      <div className="text-3xl font-bold text-gray-900 mb-2">
                        {wins}-{losses}{pushes > 0 ? `-${pushes}` : ''}
                      </div>
                      <div className="text-sm text-gray-600 mb-2">
                        {mlBets.length} {mlBets.length === 1 ? 'play' : 'plays'}
                      </div>
                      {totalPnL !== 0 && (
                        <div className={`text-sm font-medium ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)} units
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-2">
                        {selectedTier !== 'All' ? `Filtered by ${selectedTier} tier. ` : ''}Counts all strategy-run moneyline picks for this week.
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Summary Cards - Dynamic based on filtered bets */}
          {dynamicSummary && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-white p-6 rounded-lg shadow">
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">Total Bets</h3>
                  <p className="text-3xl font-bold text-blue-600">{dynamicSummary.totalBets}</p>
                  {selectedTier !== 'All' && (
                    <p className="text-xs text-gray-500 mt-1">Filtered by {selectedTier}</p>
                  )}
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow">
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">Hit Rate</h3>
                  <p className="text-3xl font-bold text-green-600">
                    {formatPercent(dynamicSummary.hitRate)}
                  </p>
                  {selectedTier !== 'All' && (
                    <p className="text-xs text-gray-500 mt-1">Filtered by {selectedTier}</p>
                  )}
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow">
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">ROI</h3>
                  <p className={`text-3xl font-bold ${dynamicSummary.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatPercent(dynamicSummary.roi / 100)}
                  </p>
                  {selectedTier !== 'All' && (
                    <p className="text-xs text-gray-500 mt-1">Filtered by {selectedTier}</p>
                  )}
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow">
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">Total PnL</h3>
                  <p className={`text-3xl font-bold ${dynamicSummary.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(dynamicSummary.totalPnL)}
                  </p>
                  {selectedTier !== 'All' && (
                    <p className="text-xs text-gray-500 mt-1">Filtered by {selectedTier}</p>
                  )}
                </div>
              </div>

              {/* Additional Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div className="bg-white p-6 rounded-lg shadow">
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">Avg Edge</h3>
                  <p className="text-2xl font-bold text-blue-600">
                    {dynamicSummary.avgEdge.toFixed(2)}
                  </p>
                  {selectedTier !== 'All' && (
                    <p className="text-xs text-gray-500 mt-1">Filtered by {selectedTier}</p>
                  )}
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow">
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">Avg CLV</h3>
                  <p className="text-2xl font-bold text-purple-600">
                    {dynamicSummary.avgCLV.toFixed(3)}
                  </p>
                  {selectedTier !== 'All' && (
                    <p className="text-xs text-gray-500 mt-1">Filtered by {selectedTier}</p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">
              Bets ({filteredBets.length}{selectedTier !== 'All' ? ` of ${data.pagination.totalItems} (${selectedTier} tier)` : ` of ${data.pagination.totalItems}`})
            </h2>
            <button
              onClick={exportCSV}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Export CSV
            </button>
          </div>

          {/* Bets Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {filteredBets.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="text-gray-400 text-5xl mb-4">📊</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {data.summary.gradedBets === 0 ? 'No graded bets yet' : selectedTier !== 'All' ? `No bets found in ${selectedTier} tier` : 'No bets found'}
                </h3>
                <p className="text-gray-600 mb-4">
                  {(() => {
                    // Case: Filtered by tier but no matches
                    if (selectedTier !== 'All' && data.bets.length > 0) {
                      return `No bets match the ${selectedTier} tier filter (${selectedTier === 'A' ? 'Edge ≥ 4.0' : selectedTier === 'B' ? 'Edge 3.0 - 3.9' : 'Edge < 3.0'}) for ${season} Week ${week}${strategy ? ` with strategy "${strategy}"` : ''}. Try selecting a different tier or "All Tiers".`;
                    }
                    // Case A: No strategy-run bets at all
                    if (data.meta && data.meta.totalStrategyRunBets === 0) {
                      return `No strategy-run bets found for ${season} Week ${week}${strategy ? ` with strategy "${strategy}"` : ''}. Your strategies haven't generated any picks yet.`;
                    }
                    // Case B: Strategy-run bets exist but not graded yet
                    if (data.summary.gradedBets === 0 && data.summary.totalBets > 0) {
                      return `No graded bets yet for ${season} Week ${week}${strategy ? ` with strategy "${strategy}"` : ''}. Bets may still be pending grading.`;
                    }
                    return `No strategy-run bets found for ${season} Week ${week}${strategy ? ` with strategy "${strategy}"` : ''}. Try adjusting your selection.`;
                  })()}
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
                    {filteredBets.map((bet) => (
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
                          {formatStrategyName(bet.strategyTag)}
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
      </div>
      <Footer />
    </div>
  );
}
