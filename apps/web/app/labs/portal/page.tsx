/**
 * Labs: Portal Continuity Dashboard
 * 
 * Displays continuity scores for all teams in a season.
 * Continuity Score measures roster stability based on returning production and transfer portal activity.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import { ErrorState } from '@/components/ErrorState';
import { LabsNav } from '@/components/LabsNav';

interface PortalContinuityRow {
  teamId: string;
  teamName: string;
  conference?: string | null;
  continuityScore: number; // 0–1
  positionalShock?: number | null; // 0–1
  mercenaryIndex?: number | null; // 0–1
  portalAggressor?: number | null; // 0–1
  riskLabel: string;
  riskBand: "low" | "medium" | "high";
}

export default function PortalLabsPage() {
  const [rows, setRows] = useState<PortalContinuityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<number>(2025);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const [continuityFilter, setContinuityFilter] = useState<"all" | "low" | "mid" | "high">("all");

  useEffect(() => {
    fetchContinuityData();
  }, [season]);

  // Check for horizontal overflow to show mobile swipe hint
  useEffect(() => {
    const checkOverflow = () => {
      if (!scrollRef.current) return;
      const el = scrollRef.current;
      const hasOverflow = el.scrollWidth > el.clientWidth;
      setShowSwipeHint(hasOverflow);
    };

    // Check initially and after data loads
    checkOverflow();
    
    // Check on resize/orientation change
    window.addEventListener('resize', checkOverflow);
    
    // Also check when rows change (data loaded)
    if (rows.length > 0) {
      // Small delay to ensure DOM is updated
      setTimeout(checkOverflow, 100);
    }

    return () => {
      window.removeEventListener('resize', checkOverflow);
    };
  }, [rows]);

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

  const getIndexBand = (score: number | null | undefined): { label: string; color: string } | null => {
    if (score === null || score === undefined) return null;
    if (score >= 0.67) {
      return { label: 'High', color: 'bg-red-100 text-red-800' };
    } else if (score >= 0.33) {
      return { label: 'Mid', color: 'bg-yellow-100 text-yellow-800' };
    } else {
      return { label: 'Low', color: 'bg-green-100 text-green-800' };
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
            <p className="text-gray-600 mb-4">
              Continuity Score measures roster stability on a 0–100 scale (displayed as 0.0–100.0).
              Higher scores indicate more stable rosters with less turnover.
            </p>
            <p className="text-gray-600 mb-4">
              <strong>Inputs:</strong> Returning production percentage (offense/defense) + transfer portal activity.
              High returning production and low churn → higher continuity score. The formula combines offense and defense equally, accounting for transfer impact.
            </p>
            <p className="text-gray-600 mb-4">
              <strong>Status:</strong> Labs-only metric. Not used in Hybrid V2 or official picks. Candidate feature for future Hybrid V5.
            </p>
            <div className="bg-gray-50 border-l-4 border-gray-400 p-4 mb-4">
              <p className="text-sm font-medium text-gray-900 mb-2">Continuity Bands:</p>
              <ul className="text-sm text-gray-700 space-y-1">
                <li><strong>High (≥ 0.80 / 80+):</strong> Stable / veteran roster</li>
                <li><strong>Mid (0.60–0.79):</strong> Typical modern churn</li>
                <li><strong>Low (&lt; 0.60):</strong> High churn / new pieces</li>
              </ul>
            </div>
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
              <p className="text-sm font-medium text-gray-900 mb-2">Portal Meta v2 Indices (Labs-only):</p>
              <ul className="text-sm text-gray-700 space-y-1">
                <li><strong>PositionalShock:</strong> Measures how much key position groups (QB, OL, LB, DB) were rebuilt. Higher = more turnover at critical positions.</li>
                <li><strong>MercenaryIndex:</strong> Measures reliance on 1-year transfers / short-term portal rentals. Higher = roster heavily driven by mercenary-style transfers.</li>
                <li><strong>PortalAggressor:</strong> Measures how aggressively the team uses the portal to ADD talent. Higher = net talent gainer via transfers.</li>
              </ul>
              <p className="text-xs text-gray-600 mt-2">
                <strong>Note:</strong> These indices are Labs-only and not used in Hybrid V2 or official card (yet).
              </p>
            </div>
          </div>
          <LabsNav />

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
            <div className="bg-white shadow sm:rounded-md">
              {/* Legend for bands + indices */}
              <div className="px-3 pt-3 pb-1 text-xs text-gray-500 space-y-1">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold">Legend:</span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>Low (0.00–0.33)</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span>Mid (0.33–0.67)</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    <span>High (0.67–1.00)</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-1">
                    <span className="font-mono">PS</span>
                    <span>= Positional Shock</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="font-mono">MI</span>
                    <span>= Mercenary Index</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="font-mono">PA</span>
                    <span>= Portal Aggressor</span>
                  </span>
                </div>
              </div>

              {/* Mobile swipe hint */}
              {showSwipeHint && (
                <div className="md:hidden px-3 pt-3 text-xs text-gray-500 flex items-center justify-between">
                  <span>← Swipe to see continuity & portal columns</span>
                  <span className="text-[10px] uppercase tracking-wide opacity-70">
                    Labs tip
                  </span>
                </div>
              )}
              <div
                ref={scrollRef}
                className="w-full overflow-x-auto md:overflow-visible"
              >
                <table className="min-w-[1000px] md:min-w-0 w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Team
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Conference
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Continuity
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Risk
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Portal Meta
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {rows
                      .filter((row) => {
                        if (continuityFilter === "all") return true;
                        const c = row.continuityScore;
                        if (c == null) return false;

                        if (continuityFilter === "low") return c < 0.6;
                        if (continuityFilter === "mid") return c >= 0.6 && c < 0.8;
                        if (continuityFilter === "high") return c >= 0.8;
                        return true;
                      })
                      .map((row) => {
                        const continuityBand = getContinuityBand(row.continuityScore);
                        const psBand = getIndexBand(row.positionalShock);
                        const miBand = getIndexBand(row.mercenaryIndex);
                        const paBand = getIndexBand(row.portalAggressor);
                        return (
                          <tr key={row.teamId}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {row.teamName}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {row.conference || '—'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {(row.continuityScore * 100).toFixed(1)}
                              </div>
                              <div className="mt-1">
                                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${continuityBand.color}`}>
                                  {continuityBand.label}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              {row.riskLabel ? (
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                                    row.riskBand === "low"
                                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                      : row.riskBand === "medium"
                                      ? "bg-amber-50 text-amber-800 border-amber-200"
                                      : "bg-rose-50 text-rose-800 border-rose-200"
                                  }`}
                                >
                                  {row.riskLabel}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">–</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-wrap gap-1">
                              {psBand ? (
                                <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${psBand.color}`} title={`PositionalShock: ${((row.positionalShock || 0) * 100).toFixed(1)}`}>
                                  PS: {psBand.label}
                                </span>
                              ) : null}
                              {miBand ? (
                                <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${miBand.color}`} title={`MercenaryIndex: ${((row.mercenaryIndex || 0) * 100).toFixed(1)}`}>
                                  MI: {miBand.label}
                                </span>
                              ) : null}
                              {paBand ? (
                                <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${paBand.color}`} title={`PortalAggressor: ${((row.portalAggressor || 0) * 100).toFixed(1)}`}>
                                  PA: {paBand.label}
                                </span>
                              ) : null}
                              {!psBand && !miBand && !paBand && (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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

