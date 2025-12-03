/**
 * Labs: Portfolio What-Ifs Dashboard
 * 
 * Displays portfolio statistics for various filter scenarios
 */

'use client';

import { useState, useEffect } from 'react';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import { ErrorState } from '@/components/ErrorState';
import { LabsNav } from '@/components/LabsNav';

interface PortfolioStats {
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  roi: number;
  pnl: number;
  avgEdge: number | null;
  avgClv: number | null;
}

interface PortfolioScenario {
  name: string;
  description: string;
  stats: PortfolioStats;
}

export default function PortfolioLabsPage() {
  const [scenarios, setScenarios] = useState<PortfolioScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<number>(2025);

  useEffect(() => {
    fetchPortfolioData();
  }, [season]);

  const fetchPortfolioData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/labs/portfolio-whatifs?season=${season}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch portfolio data: ${response.statusText}`);
      }
      
      const data = await response.json();
      setScenarios(data.scenarios || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatRecord = (stats: PortfolioStats): string => {
    return `${stats.wins}W-${stats.losses}L${stats.pushes > 0 ? `-${stats.pushes}P` : ''}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <HeaderNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-600">Loading portfolio scenarios...</div>
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <HeaderNav />
        <div className="flex-1">
          <ErrorState message={error} />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Portfolio What-Ifs (Labs)
            </h1>
            <p className="text-gray-600 mb-4">
              Labs-only portfolio experiments based on {season} data. These are what-if filters applied to the official card and Hybrid V2 — not production rules (yet).
            </p>
          </div>
          <LabsNav />

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Season
            </label>
            <input
              type="number"
              value={season}
              onChange={(e) => setSeason(parseInt(e.target.value, 10))}
              className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <div className="space-y-4">
            {scenarios.map((scenario, idx) => (
              <div
                key={idx}
                className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm"
              >
                <div className="mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {scenario.name}
                  </h3>
                  <p className="text-sm text-gray-600">{scenario.description}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div>
                    <div className="text-sm text-gray-600">Bets</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {scenario.stats.bets}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Record</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {formatRecord(scenario.stats)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Win Rate</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {scenario.stats.winRate.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">ROI</div>
                    <div
                      className={`text-lg font-semibold ${
                        scenario.stats.roi >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {scenario.stats.roi >= 0 ? '+' : ''}
                      {scenario.stats.roi.toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">PnL</div>
                    <div
                      className={`text-lg font-semibold ${
                        scenario.stats.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {scenario.stats.pnl >= 0 ? '+' : ''}$
                      {scenario.stats.pnl.toFixed(2)}
                    </div>
                  </div>
                  {scenario.stats.avgEdge !== null && (
                    <div>
                      <div className="text-sm text-gray-600">Avg Edge</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {scenario.stats.avgEdge.toFixed(2)}
                      </div>
                    </div>
                  )}
                  {scenario.stats.avgClv !== null && (
                    <div>
                      <div className="text-sm text-gray-600">Avg CLV</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {scenario.stats.avgClv >= 0 ? '+' : ''}
                        {scenario.stats.avgClv.toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}


