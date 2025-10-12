/**
 * M6 Strategies Page
 * 
 * List and manage betting strategy rulesets
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Ruleset {
  id: string;
  name: string;
  description: string | null;
  parameters: any;
  active: boolean;
  createdAt: string;
}

interface StrategyRun {
  id: string;
  rulesetId: string;
  ruleset: {
    name: string;
  };
  startDate: string;
  endDate: string;
  totalBets: number;
  winRate: number;
  roi: number;
  clv: number;
  createdAt: string;
}

export default function StrategiesPage() {
  const [rulesets, setRulesets] = useState<Ruleset[]>([]);
  const [runs, setRuns] = useState<StrategyRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'rulesets' | 'runs'>('rulesets');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [rulesetsRes, runsRes] = await Promise.all([
        fetch('/api/strategies/rulesets'),
        fetch('/api/strategies/runs'),
      ]);

      const rulesetsData = await rulesetsRes.json();
      const runsData = await runsRes.json();

      if (rulesetsData.success) setRulesets(rulesetsData.rulesets);
      if (runsData.success) setRuns(runsData.runs);
    } catch (err) {
      setError('Failed to load strategies');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading strategies...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Betting Strategies</h1>
              <p className="text-gray-600 mt-1">Create and run rules-based betting strategies</p>
            </div>
            <Link
              href="/strategies/new"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              + New Ruleset
            </Link>
          </div>

          {/* Tabs */}
          <div className="flex space-x-4 mt-6 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('rulesets')}
              className={`px-4 py-2 font-medium ${
                activeTab === 'rulesets'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Rulesets ({rulesets.length})
            </button>
            <button
              onClick={() => setActiveTab('runs')}
              className={`px-4 py-2 font-medium ${
                activeTab === 'runs'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Past Runs ({runs.length})
            </button>
          </div>
        </div>

        {/* Rulesets Tab */}
        {activeTab === 'rulesets' && (
          <div className="space-y-4">
            {rulesets.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-600">
                No rulesets yet. Create your first strategy ruleset!
              </div>
            ) : (
              rulesets.map((ruleset) => (
                <div key={ruleset.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-900">{ruleset.name}</h3>
                        {ruleset.active ? (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            Inactive
                          </span>
                        )}
                      </div>
                      {ruleset.description && (
                        <p className="text-gray-600 mt-2">{ruleset.description}</p>
                      )}
                      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Min Spread Edge:</span>
                          <span className="ml-2 font-medium">{ruleset.parameters.minSpreadEdge || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Min Total Edge:</span>
                          <span className="ml-2 font-medium">{ruleset.parameters.minTotalEdge || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Confidence:</span>
                          <span className="ml-2 font-medium">
                            {ruleset.parameters.confidenceIn?.join(', ') || 'Any'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Max/Week:</span>
                          <span className="ml-2 font-medium">{ruleset.parameters.maxGamesPerWeek || 'Unlimited'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Link
                        href={`/strategies/run?rulesetId=${ruleset.id}&season=2024&week=1`}
                        className="px-3 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 text-sm font-medium"
                      >
                        Run
                      </Link>
                      <Link
                        href={`/strategies/edit/${ruleset.id}`}
                        className="px-3 py-1 bg-gray-50 text-gray-600 rounded hover:bg-gray-100 text-sm font-medium"
                      >
                        Edit
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Runs Tab */}
        {activeTab === 'runs' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {runs.length === 0 ? (
              <div className="p-8 text-center text-gray-600">
                No strategy runs yet. Run a ruleset to see results here!
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ruleset</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bets</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Win Rate</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ROI</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">CLV</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {runs.map((run) => (
                    <tr key={run.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{run.ruleset.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {new Date(run.startDate).toLocaleDateString()} - {new Date(run.endDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{run.totalBets}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {(run.winRate * 100).toFixed(1)}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-medium ${run.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {(run.roi * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm ${run.clv >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {run.clv >= 0 ? '+' : ''}{run.clv.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {new Date(run.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
