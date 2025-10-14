/**
 * Edit Ruleset Page
 * 
 * Edit an existing betting strategy ruleset
 */

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';

interface Ruleset {
  id: string;
  name: string;
  description: string | null;
  parameters: {
    markets?: string[];
    minSpreadEdge?: number;
    minTotalEdge?: number;
    confidenceIn?: ('A' | 'B' | 'C')[];
    maxGamesPerWeek?: number;
    includeTeams?: string[];
    excludeTeams?: string[];
  };
  active: boolean;
}

export default function EditRulesetPage() {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [minSpreadEdge, setMinSpreadEdge] = useState('');
  const [minTotalEdge, setMinTotalEdge] = useState('');
  const [confidenceA, setConfidenceA] = useState(false);
  const [confidenceB, setConfidenceB] = useState(false);
  const [confidenceC, setConfidenceC] = useState(false);
  const [maxGamesPerWeek, setMaxGamesPerWeek] = useState('');
  const [includeTeams, setIncludeTeams] = useState('');
  const [excludeTeams, setExcludeTeams] = useState('');
  const [active, setActive] = useState(true);
  const [markets, setMarkets] = useState({
    spread: true,
    total: true,
    moneyline: false,
  });

  useEffect(() => {
    if (params.id) {
      fetchRuleset();
    }
  }, [params.id]);

  const fetchRuleset = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/strategies/rulesets/${params.id}`);
      const data = await response.json();
      
      if (data.success && data.ruleset) {
        const ruleset = data.ruleset;
        setName(ruleset.name);
        setDescription(ruleset.description || '');
        
        const p = ruleset.parameters || {};
        setMinSpreadEdge(p.minSpreadEdge?.toString() || '');
        setMinTotalEdge(p.minTotalEdge?.toString() || '');
        setConfidenceA(p.confidenceIn?.includes('A') || false);
        setConfidenceB(p.confidenceIn?.includes('B') || false);
        setConfidenceC(p.confidenceIn?.includes('C') || false);
        setMaxGamesPerWeek(p.maxGamesPerWeek?.toString() || '');
        setIncludeTeams(p.includeTeams?.join(', ') || '');
        setExcludeTeams(p.excludeTeams?.join(', ') || '');
        setActive(ruleset.active);
        
        // Load markets
        const marketsList = p.markets || ['spread', 'total'];
        setMarkets({
          spread: marketsList.includes('spread'),
          total: marketsList.includes('total'),
          moneyline: marketsList.includes('moneyline'),
        });
      } else {
        setError(data.error || 'Failed to load ruleset');
      }
    } catch (err) {
      setError('Network error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Ruleset name is required');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const confidenceIn: ('A' | 'B' | 'C')[] = [];
      if (confidenceA) confidenceIn.push('A');
      if (confidenceB) confidenceIn.push('B');
      if (confidenceC) confidenceIn.push('C');

      const selectedMarkets = [];
      if (markets.spread) selectedMarkets.push('spread');
      if (markets.total) selectedMarkets.push('total');
      if (markets.moneyline) selectedMarkets.push('moneyline');

      const parameters = {
        markets: selectedMarkets,
        minSpreadEdge: minSpreadEdge ? parseFloat(minSpreadEdge) : undefined,
        minTotalEdge: minTotalEdge ? parseFloat(minTotalEdge) : undefined,
        confidenceIn: confidenceIn.length > 0 ? confidenceIn : undefined,
        maxGamesPerWeek: maxGamesPerWeek ? parseInt(maxGamesPerWeek) : undefined,
        includeTeams: includeTeams ? includeTeams.split(',').map(t => t.trim()).filter(t => t) : undefined,
        excludeTeams: excludeTeams ? excludeTeams.split(',').map(t => t.trim()).filter(t => t) : undefined,
      };

      const response = await fetch(`/api/strategies/rulesets/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || null,
          parameters,
          active,
        }),
      });

      const data = await response.json();

      if (data.success) {
        router.push('/strategies');
      } else {
        setError(data.error || 'Failed to update ruleset');
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
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading ruleset...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Edit Ruleset</h1>
            <p className="text-gray-600 mt-1">Modify your betting strategy parameters</p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Ruleset Name *
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Conservative A-Tier Strategy"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Optional description of your strategy"
              />
            </div>

            {/* Edge Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="minSpreadEdge" className="block text-sm font-medium text-gray-700 mb-2">
                  Min Spread Edge (pts)
                </label>
                <input
                  type="number"
                  id="minSpreadEdge"
                  value={minSpreadEdge}
                  onChange={(e) => setMinSpreadEdge(e.target.value)}
                  step="0.1"
                  min="0"
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., 2.5"
                />
              </div>

              <div>
                <label htmlFor="minTotalEdge" className="block text-sm font-medium text-gray-700 mb-2">
                  Min Total Edge (pts)
                </label>
                <input
                  type="number"
                  id="minTotalEdge"
                  value={minTotalEdge}
                  onChange={(e) => setMinTotalEdge(e.target.value)}
                  step="0.1"
                  min="0"
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., 3.0"
                />
              </div>
            </div>

            {/* Markets */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Markets
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={markets.spread}
                    onChange={(e) => setMarkets({...markets, spread: e.target.checked})}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Spread - Point spread betting
                  </span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={markets.total}
                    onChange={(e) => setMarkets({...markets, total: e.target.checked})}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Total - Over/Under betting
                  </span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={markets.moneyline}
                    onChange={(e) => setMarkets({...markets, moneyline: e.target.checked})}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Moneyline - Win/loss betting
                  </span>
                </label>
              </div>
            </div>

            {/* Confidence Tiers */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confidence Tiers
              </label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={confidenceA}
                    onChange={(e) => setConfidenceA(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">Tier A</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={confidenceB}
                    onChange={(e) => setConfidenceB(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">Tier B</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={confidenceC}
                    onChange={(e) => setConfidenceC(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">Tier C</span>
                </label>
              </div>
            </div>

            {/* Max Games */}
            <div>
              <label htmlFor="maxGamesPerWeek" className="block text-sm font-medium text-gray-700 mb-2">
                Max Games Per Week
              </label>
              <input
                type="number"
                id="maxGamesPerWeek"
                value={maxGamesPerWeek}
                onChange={(e) => setMaxGamesPerWeek(e.target.value)}
                min="1"
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., 5"
              />
            </div>

            {/* Team Filters */}
            <div>
              <label htmlFor="includeTeams" className="block text-sm font-medium text-gray-700 mb-2">
                Include Teams (comma-separated IDs)
              </label>
              <input
                type="text"
                id="includeTeams"
                value={includeTeams}
                onChange={(e) => setIncludeTeams(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., alabama, georgia, ohio-state"
              />
            </div>

            <div>
              <label htmlFor="excludeTeams" className="block text-sm font-medium text-gray-700 mb-2">
                Exclude Teams (comma-separated IDs)
              </label>
              <input
                type="text"
                id="excludeTeams"
                value={excludeTeams}
                onChange={(e) => setExcludeTeams(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., team-a, team-b"
              />
            </div>

            {/* Active Toggle */}
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">Active</span>
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Inactive rulesets won't be shown in run screens
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <Link
                href="/strategies"
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  );
}

