/**
 * M3 Home Page - Seed Slate
 *
 * Displays this week's seed games with implied vs market data and spread tiers.
 * Phase 2C-2J-6D-3: public slate truthfulness + UX compression (presentation only).
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import SlateTable from '@/components/SlateTable';
import { ProductionModelSelector } from '@/components/ProductionModelSelector';
import { useProductionModel } from '@/contexts/ProductionModelContext';
import { InfoTooltip } from '@/components/InfoTooltip';
import { ErrorState } from '@/components/ErrorState';
import {
  buildSlateApiUrl,
  computeSlateSpreadTierSummary,
  getProductionModelDisplayLabel,
  normalizeSlateApiResponse,
  type SlateResponseMeta,
} from '@/lib/config/slate-model';
import type { ProductionModelId } from '@/lib/config/production-models';
import {
  formatSlateStatusLabel,
  summarizeSlateStatus,
} from '@/lib/slate-status-summary';
import { summarizeMarketSnapshotFreshness } from '@/lib/market-snapshot-freshness';
import { resolveHeldProductionModelIds } from '@/lib/config/held-production-models';

interface HomeSlateGame {
  status?: string | null;
  confidence?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  awayTeamId?: string;
  homeTeamId?: string;
  awayTeamName?: string;
  homeTeamName?: string;
  closingSpread?: { timestamp?: string | null } | null;
  closingTotal?: { timestamp?: string | null } | null;
  picks?: {
    spread?: { edge?: number | null; grade?: string | null } | null;
    total?: { edge?: number | null; grade?: string | null } | null;
    moneyline?: { value?: number | null; grade?: string | null } | null;
  } | null;
}

interface HomeSlateState {
  season: number;
  week: number;
  games: HomeSlateGame[];
  summary: ReturnType<typeof computeSlateSpreadTierSummary>;
  meta: SlateResponseMeta | null;
}

export default function HomePage() {
  const { model } = useProductionModel();
  const [slate, setSlate] = useState<HomeSlateState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveModel: ProductionModelId =
    slate?.meta?.activeModel ?? model;
  const effectiveModelLabel = getProductionModelDisplayLabel(effectiveModel);
  // Hold from shared authorization (season/week), not merely activationOverride /
  // preferred model — Hybrid stays held for 2026 even when preference is core_v1.
  const heldModelIds: ProductionModelId[] = resolveHeldProductionModelIds(
    slate?.season,
    slate?.week
  );

  const statusSummary = useMemo(
    () => summarizeSlateStatus(slate?.games),
    [slate?.games]
  );
  const statusLabel = formatSlateStatusLabel(statusSummary);
  const marketFreshness = useMemo(
    () => summarizeMarketSnapshotFreshness(slate?.games),
    [slate?.games]
  );

  useEffect(() => {
    fetchSlate();
  }, [model]);

  const fetchSlate = async () => {
    try {
      setLoading(true);
      setError(null);

      const weeksResponse = await fetch('/api/weeks');
      if (!weeksResponse.ok) {
        throw new Error('Failed to fetch current week');
      }
      const weeksData = await weeksResponse.json();
      const season = weeksData.season || 2025;
      const week = weeksData.week || 13;

      const response = await fetch(buildSlateApiUrl(season, week, model));
      if (!response.ok) {
        throw new Error('Failed to fetch slate data');
      }

      const raw = await response.json();
      const { games, meta } = normalizeSlateApiResponse<HomeSlateGame>(raw);

      setSlate({
        season,
        week,
        games,
        summary: computeSlateSpreadTierSummary(games),
        meta,
      });
    } catch (err) {
      setError('Network error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <HeaderNav />
        <div className="flex-1 flex items-center justify-center px-4">
          <ErrorState
            title="Unable to Load Current Slate"
            message={error.includes('Network') 
              ? "We couldn't connect to the server. Please check your internet connection and try again."
              : "We couldn't load this week's games. This might be temporary - please try again in a moment."}
            onRetry={fetchSlate}
            helpLink={{
              label: 'Check System Status',
              href: '/docs/status'
            }}
            fullScreen={false}
          />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Compact 2026 season status + historical link */}
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50/80 px-4 py-2.5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <p className="text-sm text-gray-800">
              <span className="font-semibold text-emerald-900">2026 Season Live</span>
              <span className="text-gray-500"> · </span>
              Core V1 production spread
              <span className="text-gray-500"> · </span>
              Hybrid V2 held
            </p>
            <p className="text-sm">
              <Link
                href="/labs/portfolio?season=2025"
                className="text-blue-600 hover:text-blue-800 underline font-medium"
              >
                2025 results &amp; Labs what-ifs →
              </Link>
              <span className="text-xs text-gray-500 italic ml-2">
                Historical simulations/records, not future guarantees.
              </span>
            </p>
          </div>
        </div>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold text-gray-900">Current Slate</h1>
              <div className="relative group">
                <button className="text-gray-400 hover:text-gray-600" type="button" aria-label="Slate glossary">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                </button>
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 max-w-xs">
                  <div className="mb-1"><strong>Spread:</strong> Home team&apos;s advantage. Negative = home favored</div>
                  <div><strong>Spread edge:</strong> Difference between our model and the market, in points.</div>
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <ProductionModelSelector
                effectiveModel={slate ? effectiveModel : null}
                heldModelIds={heldModelIds}
              />
              <Link 
                href={`/weeks?season=${slate?.season}&week=${slate?.week}`}
                className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
              >
                Review Previous Weeks
              </Link>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-2">
            <div className="text-sm text-gray-500">
              Today: {new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </div>
            <div className="text-sm text-gray-500">
              {slate?.season && slate?.week ? (
                `Showing: Season ${slate.season}, Week ${slate.week}`
              ) : (
                <span className="text-yellow-600">No games found - Select a different week</span>
              )}
            </div>
          </div>
          
          {slate && (
            <div className="flex flex-col gap-1 mt-2">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-gray-600">
                  {slate.week && slate.season ? (
                    <>
                      Week {slate.week} • {slate.season} Season • Spread model: {effectiveModelLabel}
                      {slate.meta?.modelScope.total === 'current' && (
                        <span className="text-gray-500"> (totals/ML: current logic)</span>
                      )}
                    </>
                  ) : (
                    <span className="text-yellow-600">Season/Week detection failed - try selecting manually</span>
                  )}
                </p>
                {statusLabel && (
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      statusSummary.allFinal
                        ? 'bg-green-100 text-green-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {statusLabel}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">{marketFreshness.label}</p>
            </div>
          )}
        </div>

        {/* What is Edge? — collapsed by default */}
        <details className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-400 rounded-r-lg mb-6 group">
          <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-900">What is Edge?</h3>
              <InfoTooltip content="Spread and total edges are in points. Moneyline value is a separate probability/price measure." />
            </span>
            <span className="text-xs text-blue-700 group-open:hidden">Show</span>
            <span className="text-xs text-blue-700 hidden group-open:inline">Hide</span>
          </summary>
          <div className="px-4 pb-4">
            <p className="text-sm text-gray-700 mb-2">
              Spread and total edges are measured in points. Moneyline value is a probability/
              price-value measure and is shown separately. The summary below reflects spread
              tiers.
            </p>
            <Link href="/getting-started" className="text-blue-600 hover:text-blue-800 underline font-medium text-sm">
              Learn more →
            </Link>
          </div>
        </details>

        {/* Spread-tier summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-blue-600">{slate?.summary?.totalGames || 0}</div>
            <div className="text-sm text-gray-600 flex items-center gap-1">
              Total Games
              <InfoTooltip content="Total games on this week&apos;s slate. Tier counts use spread grade only." />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-green-600">{slate?.summary?.spreadTier?.A || 0}</div>
            <div className="text-sm text-gray-600 flex items-center gap-1">
              Spread Tier A
              <InfoTooltip content="Games with a spread pick graded A." />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-yellow-600">{slate?.summary?.spreadTier?.B || 0}</div>
            <div className="text-sm text-gray-600 flex items-center gap-1">
              Spread Tier B
              <InfoTooltip content="Games with a spread pick graded B." />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-red-600">{slate?.summary?.spreadTier?.C || 0}</div>
            <div className="text-sm text-gray-600 flex items-center gap-1">
              Spread Tier C
              <InfoTooltip content="Games with a spread pick graded C." />
            </div>
          </div>
        </div>

        {/* Empty State Message */}
        {(!slate || !slate.games || slate.games.length === 0) && !loading && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 mb-8 rounded-r-lg">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-lg font-medium text-yellow-800 mb-2">No Games Found</h3>
                <p className="text-sm text-yellow-700 mb-4">
                  {slate?.season && slate?.week
                    ? `No games are scheduled for Season ${slate.season}, Week ${slate.week}.`
                    : 'Unable to determine the current week. Games may not be loaded yet.'}
                </p>
                <div className="flex gap-3">
                  <Link
                    href="/weeks"
                    className="inline-flex items-center px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 text-sm font-medium"
                  >
                    Browse All Weeks →
                  </Link>
                  <Link
                    href="/docs/status"
                    className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm font-medium"
                  >
                    Check Data Status →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Games Table */}
        {slate && (
          <SlateTable 
            season={slate.season} 
            week={slate.week} 
            title="This Week's Slate"
            showDateHeaders={true}
            showAdvanced={false}
            model={model}
            providedGames={slate.games as any}
            slateMeta={slate.meta}
          />
        )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
