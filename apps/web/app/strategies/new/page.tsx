/**
 * M6 New Ruleset Page
 * 
 * Create a new betting strategy ruleset
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NewRulesetPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [minSpreadEdge, setMinSpreadEdge] = useState('2.0');
  const [minTotalEdge, setMinTotalEdge] = useState('2.0');
  const [confidenceA, setConfidenceA] = useState(true);
  const [confidenceB, setConfidenceB] = useState(true);
  const [confidenceC, setConfidenceC] = useState(false);
  const [maxGamesPerWeek, setMaxGamesPerWeek] = useState('');
  const [includeTeams, setIncludeTeams] = useState('');
  const [excludeTeams, setExcludeTeams] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const confidenceIn = [];
      if (confidenceA) confidenceIn.push('A');
      if (confidenceB) confidenceIn.push('B');
      if (confidenceC) confidenceIn.push('C');

      const ruleset = {
        name,
        description: description || null,
        parameters: {
          minSpreadEdge: parseFloat(minSpreadEdge) || 0,
          minTotalEdge: parseFloat(minTotalEdge) || 0,
          confidenceIn: confidenceIn.length > 0 ? confidenceIn : ['A', 'B', 'C'],
          maxGamesPerWeek: maxGamesPerWeek ? parseInt(maxGamesPerWeek) : null,
          includeTeams: includeTeams ? includeTeams.split(',').map(t => t.trim()) : [],
          excludeTeams: excludeTeams ? excludeTeams.split(',').map(t => t.trim()) : [],
        },
        active: true,
      };

      const response = await fetch('/api/strategies/rulesets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleset),
      });

      const data = await response.json();

      if (data.success) {
        router.push('/strategies');
      } else {
        setError(data.error || 'Failed to create ruleset');
      }
    } catch (err) {
      setError('Network error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/strategies" className="text-blue-600 hover:text-blue-700 text-sm mb-2 inline-block">
            ← Back to Strategies
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">New Ruleset</h1>
          <p className="text-gray-600 mt-1">Define rules for automated bet selection</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
          {/* Basic Info */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Ruleset Name *
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="e.g., Conservative Spread Edges"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="Optional description of your strategy"
            />
          </div>

          {/* Edge Thresholds */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Edge Thresholds</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="minSpreadEdge" className="block text-sm font-medium text-gray-700">
                  Min Spread Edge (pts)
                </label>
                <input
                  type="number"
                  id="minSpreadEdge"
                  step="0.1"
                  value={minSpreadEdge}
                  onChange={(e) => setMinSpreadEdge(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="minTotalEdge" className="block text-sm font-medium text-gray-700">
                  Min Total Edge (pts)
                </label>
                <input
                  type="number"
                  id="minTotalEdge"
                  step="0.1"
                  value={minTotalEdge}
                  onChange={(e) => setMinTotalEdge(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Confidence Tiers */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Confidence Tiers</h3>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={confidenceA}
                  onChange={(e) => setConfidenceA(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  A Tier (≥3.5 pts) - Highest confidence
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={confidenceB}
                  onChange={(e) => setConfidenceB(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  B Tier (≥2.5 pts) - Medium confidence
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={confidenceC}
                  onChange={(e) => setConfidenceC(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  C Tier (≥1.5 pts) - Lower confidence
                </span>
              </label>
            </div>
          </div>

          {/* Limits */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Limits</h3>
            <div>
              <label htmlFor="maxGamesPerWeek" className="block text-sm font-medium text-gray-700">
                Max Games Per Week
              </label>
              <input
                type="number"
                id="maxGamesPerWeek"
                value={maxGamesPerWeek}
                onChange={(e) => setMaxGamesPerWeek(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Leave blank for unlimited"
              />
            </div>
          </div>

          {/* Team Filters */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Team Filters</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="includeTeams" className="block text-sm font-medium text-gray-700">
                  Include Only Teams (comma-separated IDs)
                </label>
                <input
                  type="text"
                  id="includeTeams"
                  value={includeTeams}
                  onChange={(e) => setIncludeTeams(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="e.g., alabama, ohio-state, georgia"
                />
                <p className="mt-1 text-xs text-gray-500">Leave blank to include all teams</p>
              </div>
              <div>
                <label htmlFor="excludeTeams" className="block text-sm font-medium text-gray-700">
                  Exclude Teams (comma-separated IDs)
                </label>
                <input
                  type="text"
                  id="excludeTeams"
                  value={excludeTeams}
                  onChange={(e) => setExcludeTeams(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="e.g., fcs-teams, group-of-five"
                />
                <p className="mt-1 text-xs text-gray-500">Leave blank to exclude none</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="border-t pt-6 flex justify-end gap-3">
            <Link
              href="/strategies"
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Create Ruleset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
