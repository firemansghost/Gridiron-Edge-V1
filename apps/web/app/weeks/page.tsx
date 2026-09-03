/**
 * /weeks — 2026 Week Archive (persisted Game + Official Card bets)
 *         and <=2025 legacy reconstructed slate view.
 */

'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import SlateTable from '@/components/SlateTable';
import { WeekArchiveTable } from '@/components/WeekArchiveTable';
import type { WeekArchiveGameView, WeekArchiveSummary } from '@/lib/week-archive';

interface WeekData {
  gameId: string;
  matchup: string;
  homeTeam: {
    id: string;
    name: string;
    logoUrl?: string | null;
    primaryColor?: string | null;
  };
  awayTeam: {
    id: string;
    name: string;
    logoUrl?: string | null;
    primaryColor?: string | null;
  };
  kickoff: string;
  venue: string;
  neutralSite: boolean;
  marketSpread: number;
  marketTotal: number;
  marketMeta?: {
    spread?: { source?: string | null; timestamp?: Date | string | null } | null;
    total?: { source?: string | null; timestamp?: Date | string | null } | null;
  };
  marketFallback?: {
    spread: boolean;
    total: boolean;
  };
  moneyline?: {
    price: number | null;
    pickLabel: string | null;
    impliedProb: number | null;
    meta?: { source?: string | null; timestamp?: Date | string | null } | null;
  };
  impliedSpread: number;
  impliedTotal: number;
  spreadEdge: number;
  totalEdge: number;
  maxEdge: number;
  confidence: string;
  modelVersion: string;
  favoredSide: 'home' | 'away';
  favoredTeamId: string;
  favoredTeamName: string;
  modelSpreadPick: {
    teamId: string;
    teamName: string;
    line: number;
  };
  spreadPickLabel: string;
  spreadEdgePts: number;
  totalPick: 'Over' | 'Under' | null;
  totalPickLabel: string | null;
  totalEdgePts: number;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  adjustments?: {
    injuryAdjPts: number;
    weatherAdjPts: number;
    totalAdjPts: number;
    breakdown: {
      injuries: string[];
      weather: string[];
    };
  } | null;
  adjustmentsEnabled?: {
    injuries: boolean;
    weather: boolean;
  };
}

interface WeekSummary {
  totalGames: number;
  confidenceBreakdown: {
    A: number;
    B: number;
    C: number;
  };
  hasResults: boolean;
  roi?: {
    wins: number;
    losses: number;
    pushes: number;
    winRate: number;
    roi: number;
  } | null;
  avgClv: number | null;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(2)}%`;
}

function WeekPageContent() {
  const [legacyData, setLegacyData] = useState<{
    week: number;
    season: number;
    games: WeekData[];
    summary: WeekSummary;
  } | null>(null);
  const [archiveGames, setArchiveGames] = useState<WeekArchiveGameView[]>([]);
  const [archiveSummary, setArchiveSummary] = useState<WeekArchiveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState(0);
  const [week, setWeek] = useState(0);
  const [paramsReady, setParamsReady] = useState(false);
  const urlParamsApplied = useRef(false);

  const searchParams = useSearchParams();
  const isArchiveSeason = season >= 2026;

  useEffect(() => {
    if (urlParamsApplied.current) return;
    const seasonParam = searchParams.get('season');
    const weekParam = searchParams.get('week');

    if (seasonParam && weekParam) {
      setSeason(parseInt(seasonParam, 10));
      setWeek(parseInt(weekParam, 10));
      urlParamsApplied.current = true;
      setParamsReady(true);
      return;
    }

    fetch('/api/current-season-week')
      .then((r) => r.json())
      .then((cur) => {
        setSeason(seasonParam ? parseInt(seasonParam, 10) : cur?.season || 2026);
        setWeek(weekParam ? parseInt(weekParam, 10) : cur?.week || 1);
      })
      .catch(() => {
        setSeason((s) => s || 2026);
        setWeek((w) => w || 1);
      })
      .finally(() => {
        urlParamsApplied.current = true;
        setParamsReady(true);
      });
  }, [searchParams]);

  const updateURL = (newSeason: number, newWeek: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set('season', newSeason.toString());
    url.searchParams.set('week', newWeek.toString());
    window.history.pushState({}, '', url.toString());
  };

  const fetchWeekData = async (nextSeason: number, nextWeek: number) => {
    if (!nextSeason || !nextWeek) return;
    setLoading(true);
    setError(null);
    try {
      if (nextSeason >= 2026) {
        const response = await fetch(`/api/weeks/archive?season=${nextSeason}&week=${nextWeek}`);
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || 'Failed to fetch week archive');
        }
        setArchiveGames(payload.games || []);
        setArchiveSummary(payload.summary || null);
        setLegacyData(null);
      } else {
        const response = await fetch(`/api/weeks?season=${nextSeason}&week=${nextWeek}`);
        const payload = await response.json();
        if (payload.success) {
          setLegacyData(payload);
          setArchiveGames([]);
          setArchiveSummary(null);
        } else {
          throw new Error(payload.error || 'Failed to fetch week data');
        }
      }
    } catch (err) {
      setError('Network error: ' + (err instanceof Error ? err.message : 'Unknown error'));
      setArchiveGames([]);
      setArchiveSummary(null);
      setLegacyData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!paramsReady) return;
    if (!season || !week) return;
    void fetchWeekData(season, week);
  }, [paramsReady, season, week]);

  if (!paramsReady || loading) {
    return (
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error Loading Week Data</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                </div>
                <div className="mt-4">
                  <button
                    onClick={() => void fetchWeekData(season, week)}
                    className="bg-red-100 text-red-800 px-3 py-2 rounded-md text-sm font-medium hover:bg-red-200"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          {isArchiveSeason ? (
            <>
              <h1 className="text-3xl font-bold text-gray-900">Week Archive</h1>
              <p className="mt-2 text-gray-600">
                2026 archive data comes from the persisted schedule and locked Official
                Card. Wagers, results, PnL and CLV are historical records and are not
                recalculated from today&apos;s model or market.
              </p>
              <p className="mt-3 text-sm text-gray-700">
                <span className="font-semibold">Week Archive</span>
                {' '}
                = game-by-game historical record.
                {' '}
                <span className="font-semibold">Week Review</span>
                {' '}
                = betting-performance analysis.
                {' '}
                <span className="font-semibold">Current Slate</span>
                {' '}
                = live/dynamic recalculation.
              </p>
              <p className="mt-3 text-sm flex flex-wrap gap-x-4 gap-y-1">
                <Link href="/picks" className="text-blue-600 hover:text-blue-800 underline">
                  Official Card
                </Link>
                <Link href="/weeks/review" className="text-blue-600 hover:text-blue-800 underline">
                  Week Review
                </Link>
                <Link href="/season-review" className="text-blue-600 hover:text-blue-800 underline">
                  Season Review
                </Link>
                <Link href="/" className="text-blue-600 hover:text-blue-800 underline">
                  Current Slate
                </Link>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-gray-900">Browse Weeks</h1>
              <p className="mt-2 text-sm font-semibold text-amber-800">
                LEGACY / RECONSTRUCTED
              </p>
              <p className="mt-2 text-gray-600">
                Historical seasons through 2025 use the legacy reconstructed model
                view and are not persisted Official Card records.
              </p>
            </>
          )}
        </div>

        <div className="mb-6 bg-white p-4 rounded-lg shadow">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <label htmlFor="season-select" className="text-sm font-medium text-gray-700">
                Season:
              </label>
              <select
                id="season-select"
                value={season}
                onChange={(e) => {
                  const newSeason = parseInt(e.target.value, 10);
                  setSeason(newSeason);
                  updateURL(newSeason, week);
                }}
                className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value={2022}>2022</option>
                <option value={2023}>2023</option>
                <option value={2024}>2024</option>
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <label htmlFor="week-select" className="text-sm font-medium text-gray-700">
                Week:
              </label>
              <select
                id="week-select"
                value={week}
                onChange={(e) => {
                  const newWeek = parseInt(e.target.value, 10);
                  setWeek(newWeek);
                  updateURL(season, newWeek);
                }}
                className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                {Array.from({ length: 16 }, (_, i) => i + 1).map((w) => (
                  <option key={w} value={w}>Week {w}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">
                {isArchiveSeason
                  ? `${archiveGames.length} games`
                  : `${legacyData?.games?.length || 0} games`}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            {season >= 2026 ? (
              <WeekArchiveTable games={archiveGames} />
            ) : (
              <SlateTable
                season={season}
                week={week}
                title={`Week ${week} Games`}
                showDateHeaders={true}
                showAdvanced={false}
              />
            )}
          </div>

          <div className="lg:col-span-1">
            {isArchiveSeason && archiveSummary ? (
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Archive Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-600">Games scheduled</span><span className="font-semibold">{archiveSummary.gamesScheduled}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Final</span><span className="font-semibold">{archiveSummary.gamesFinal}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">In progress</span><span className="font-semibold">{archiveSummary.gamesInProgress}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Official games</span><span className="font-semibold">{archiveSummary.officialGames}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">No official wager</span><span className="font-semibold">{archiveSummary.gamesWithoutOfficialWager}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Official bets</span><span className="font-semibold">{archiveSummary.totalBets}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Graded / pending</span><span className="font-semibold">{archiveSummary.gradedBets} / {archiveSummary.pendingBets}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Record</span><span className="font-semibold">{archiveSummary.wins}-{archiveSummary.losses}-{archiveSummary.pushes}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Spread / ML / Total</span><span className="font-semibold">{archiveSummary.spreadBets} / {archiveSummary.moneylineBets} / {archiveSummary.totalsBets}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Graded stake</span><span className="font-semibold">{formatCurrency(archiveSummary.gradedStake)}</span></div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">PnL</span>
                    <span className={`font-semibold ${archiveSummary.totalPnL >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(archiveSummary.totalPnL)}
                    </span>
                  </div>
                  <div className="flex justify-between"><span className="text-gray-600">ROI</span><span className="font-semibold">{formatPercent(archiveSummary.roi)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Hit rate</span><span className="font-semibold">{formatPercent(archiveSummary.hitRate)}</span></div>
                  {archiveSummary.avgCLV !== null && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Avg CLV</span>
                      <span className={`font-semibold ${archiveSummary.avgCLV >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {archiveSummary.avgCLV > 0 ? '+' : ''}
                        {archiveSummary.avgCLV.toFixed(3)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Summary</h3>
                <p className="text-xs font-semibold text-amber-800 mb-4">LEGACY / RECONSTRUCTED</p>
                <div className="mb-6">
                  <h4 className="text-md font-medium text-gray-900 mb-3">Confidence Tiers</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Tier A</span>
                      <span className="text-lg font-semibold text-green-600">{legacyData?.summary?.confidenceBreakdown?.A || 0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Tier B</span>
                      <span className="text-lg font-semibold text-yellow-600">{legacyData?.summary?.confidenceBreakdown?.B || 0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Tier C</span>
                      <span className="text-lg font-semibold text-red-600">{legacyData?.summary?.confidenceBreakdown?.C || 0}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-md font-medium text-gray-900 mb-3">Performance</h4>
                  {legacyData?.summary?.hasResults ? (
                    legacyData.summary.roi ? (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Wins</span>
                          <span className="text-sm font-semibold text-green-600">{legacyData.summary.roi.wins}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Losses</span>
                          <span className="text-sm font-semibold text-red-600">{legacyData.summary.roi.losses}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Pushes</span>
                          <span className="text-sm font-semibold text-gray-600">{legacyData.summary.roi.pushes}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Win Rate</span>
                          <span className="text-sm font-semibold text-gray-900">{(legacyData.summary.roi.winRate * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">ROI</span>
                          <span className={`text-sm font-semibold ${legacyData.summary.roi.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {(legacyData.summary.roi.roi * 100).toFixed(1)}%
                          </span>
                        </div>
                        {legacyData.summary.avgClv !== null && (
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Avg CLV</span>
                            <span className={`text-sm font-semibold ${legacyData.summary.avgClv >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {legacyData.summary.avgClv >= 0 ? '+' : ''}{legacyData.summary.avgClv.toFixed(1)}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">No spread picks with sufficient edge</div>
                    )
                  ) : (
                    <div className="text-sm text-gray-500">No results yet — scores not seeded</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WeekPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <Suspense fallback={
        <div className="flex-1">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
              <div className="h-64 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      }>
        <WeekPageContent />
      </Suspense>
      <Footer />
    </div>
  );
}
