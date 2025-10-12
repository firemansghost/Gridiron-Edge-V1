/**
 * M6 Strategy Run Page
 * 
 * Execute a ruleset against a specific week and save results
 */

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface QualifyingGame {
  gameId: string;
  matchup: string;
  kickoff: string;
  spreadEdge: number;
  totalEdge: number;
  maxEdge: number;
  confidence: string;
  spreadPickLabel: string;
  totalPickLabel: string | null;
}

interface RunResult {
  success: boolean;
  ruleset: {
    id: string;
    name: string;
    parameters: any;
  };
  week: number;
  season: number;
  qualifyingGames: QualifyingGame[];
  summary: {
    totalGames: number;
    avgEdge: number;
    confidenceBreakdown: {
      A: number;
      B: number;
      C: number;
    };
  };
}

function StrategyRunContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const rulesetId = searchParams.get('rulesetId');
  const season = parseInt(searchParams.get('season') || '2024');
  const week = parseInt(searchParams.get('week') || '1');

  const [result, setResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (rulesetId) {
      runStrategy();
    }
  }, [rulesetId, season, week]);

  const runStrategy = async () => {
    try {
      const response = await fetch(
        `/api/strategies/run?rulesetId=${rulesetId}&season=${season}&week=${week}`
      );
      const data = await response.json();

      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || 'Failed to run strategy');
      }
    } catch (err) {
      setError('Network error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const saveRun = async () => {
    if (!result) return;

    setSaving(true);
    try {
      const response = await fetch('/api/strategies/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rulesetId: result.ruleset.id,
          season,
          week,
          totalBets: result.summary.totalGames,
          avgEdge: result.summary.avgEdge,
          confidenceBreakdown: result.summary.confidenceBreakdown,
        }),
      });

      const data = await response.json();

      if (data.success) {
        router.push('/strategies');
      } else {
        setError(data.error || 'Failed to save run');
      }
    } catch (err) {
      setError('Network error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Running strategy...</div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 mb-4">{error || 'No results'}</div>
          <Link href="/strategies" className="text-blue-600 hover:text-blue-700">
            ← Back to Strategies
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/strategies" className="text-blue-600 hover:text-blue-700 text-sm mb-2 inline-block">
            ← Back to Strategies
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Strategy Run Results</h1>
              <p className="text-gray-600 mt-1">
                {result.ruleset.name} • {season} Week {week}
              </p>
            </div>
            <button
              onClick={saveRun}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save as StrategyRun'}
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-blue-600">{result.summary.totalGames}</div>
            <div className="text-sm text-gray-600">Qualifying Bets</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-green-600">{result.summary.avgEdge.toFixed(2)}</div>
            <div className="text-sm text-gray-600">Average Edge (pts)</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-green-600">{result.summary.confidenceBreakdown.A}</div>
            <div className="text-sm text-gray-600">A Tier Bets</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-yellow-600">{result.summary.confidenceBreakdown.B}</div>
            <div className="text-sm text-gray-600">B Tier Bets</div>
          </div>
        </div>

        {/* Ruleset Parameters */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Ruleset Parameters</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Min Spread Edge:</span>
              <span className="ml-2 font-medium">{result.ruleset.parameters.minSpreadEdge} pts</span>
            </div>
            <div>
              <span className="text-gray-500">Min Total Edge:</span>
              <span className="ml-2 font-medium">{result.ruleset.parameters.minTotalEdge} pts</span>
            </div>
            <div>
              <span className="text-gray-500">Confidence:</span>
              <span className="ml-2 font-medium">{result.ruleset.parameters.confidenceIn.join(', ')}</span>
            </div>
            <div>
              <span className="text-gray-500">Max/Week:</span>
              <span className="ml-2 font-medium">
                {result.ruleset.parameters.maxGamesPerWeek || 'Unlimited'}
              </span>
            </div>
          </div>
        </div>

        {/* Qualifying Games */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Qualifying Games</h2>
          </div>
          {result.qualifyingGames.length === 0 ? (
            <div className="p-8 text-center text-gray-600">
              No games match this ruleset for the selected week.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Matchup</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kickoff</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Spread Pick</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Pick</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Spread Edge</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Edge</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {result.qualifyingGames.map((game) => (
                  <tr key={game.gameId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{game.matchup}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{game.kickoff}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {game.spreadPickLabel}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {game.totalPickLabel || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      +{game.spreadEdge.toFixed(1)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {game.totalEdge > 0 ? `+${game.totalEdge.toFixed(1)}` : '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          game.confidence === 'A'
                            ? 'bg-green-100 text-green-800'
                            : game.confidence === 'B'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {game.confidence}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StrategyRunPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-600">Loading...</div>
    </div>}>
      <StrategyRunContent />
    </Suspense>
  );
}
