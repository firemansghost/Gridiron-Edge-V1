/**
 * Labs: Portal Continuity Dashboard
 * 
 * Displays continuity scores for all teams in a season.
 * Continuity Score measures roster stability based on returning production and transfer portal activity.
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import { ErrorState } from '@/components/ErrorState';

interface PortalContinuityRow {
  teamId: string;
  teamName: string;
  conference?: string | null;
  continuityScore: number; // 0–1
}

export default function PortalLabsPage() {
  const [rows, setRows] = useState<PortalContinuityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<number>(2025);

  useEffect(() => {
    fetchContinuityData();
  }, [season]);

  const fetchContinuityData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/labs/portal-continuity?season=${season}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch continuity data: ${response.statusText}`);
      }
      
      const data = await response.json();
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const getContinuityBand = (score: number): { label: string; color: string } => {
    if (score >= 0.80) {
      return { label: 'High', color: 'bg-green-100 text-green-800' };
    } else if (score >= 0.60) {
      return { label: 'Mid', color: 'bg-yellow-100 text-yellow-800' };
    } else {
      return { label: 'Low', color: 'bg-red-100 text-red-800' };
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Portal Continuity (Labs)
            </h1>
            <p className="text-gray-600">
              Roster stability scores based on returning production and transfer portal activity.
              Higher scores indicate more stable rosters.
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Season
            </label>
            <input
              type="number"
              value={season}
              onChange={(e) => setSeason(parseInt(e.target.value, 10) || 2025)}
              className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              min="2020"
              max="2030"
            />
          </div>

          {error && <ErrorState message={error} />}

          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Loading continuity data...</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">
                No continuity scores found for {season}. Run sync_portal_indices.ts first.
              </p>
            </div>
          ) : (
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Team
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Conference
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Continuity Score
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Band
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rows.map((row) => {
                    const band = getContinuityBand(row.continuityScore);
                    return (
                      <tr key={row.teamId}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {row.teamName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {row.conference || '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {(row.continuityScore * 100).toFixed(1)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${band.color}`}>
                            {band.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 text-sm text-gray-600">
            <p>
              <strong>Note:</strong> This is a Labs-only feature. Continuity scores are not used in production models (Hybrid V2, etc.).
              See <Link href="/docs/data-inventory" className="text-blue-600 hover:text-blue-700 underline">Data Inventory</Link> for more details.
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

