/**
 * Official Card (/picks)
 *
 * Persisted Core V1 official_flat_100 selections locked before kickoff.
 * Does not recalculate from the live slate or current market.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import { TeamLogo } from '@/components/TeamLogo';
import { ErrorState } from '@/components/ErrorState';
import { downloadAsCsv } from '@/lib/csv-export';
import {
  OFFICIAL_CARD_CSV_HEADERS,
  OFFICIAL_CARD_EMPTY_MESSAGE,
  OFFICIAL_CARD_SEASON,
  buildOfficialCardCsvRows,
  formatKickoffChicago,
  type OfficialCardGameView,
  type OfficialCardSummary,
  type OfficialCardWager,
} from '@/lib/official-card';

interface OfficialCardResponse {
  ok: boolean;
  season: number;
  week: number;
  empty?: boolean;
  emptyMessage?: string | null;
  summary?: OfficialCardSummary;
  games?: OfficialCardGameView[];
  error?: string;
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

function resultBadge(wager: OfficialCardWager) {
  if (wager.awaitingGrading) {
    return (
      <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">
        Awaiting grading
      </span>
    );
  }
  if (!wager.result) {
    return (
      <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700">
        Pending
      </span>
    );
  }
  const styles: Record<string, string> = {
    win: 'bg-green-100 text-green-800',
    loss: 'bg-red-100 text-red-800',
    push: 'bg-yellow-100 text-yellow-800',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${styles[wager.result] || 'bg-gray-100 text-gray-700'}`}>
      {wager.result}
    </span>
  );
}

function marketTitle(marketType: string): string {
  if (marketType === 'spread') return 'Spread';
  if (marketType === 'moneyline') return 'Moneyline';
  if (marketType === 'total') return 'Total';
  return marketType;
}

function lockedFieldLabel(marketType: string): string {
  return marketType === 'moneyline' ? 'Locked price' : 'Locked line';
}

function modelFieldLabel(marketType: string): string {
  return marketType === 'moneyline' ? 'Model fair price' : 'Model line';
}

export default function OfficialCardPage() {
  const [week, setWeek] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<OfficialCardSummary | null>(null);
  const [games, setGames] = useState<OfficialCardGameView[]>([]);

  const loadCard = async (nextWeek?: number) => {
    try {
      setLoading(true);
      setError(null);
      setEmptyMessage(null);
      const params = new URLSearchParams();
      if (nextWeek != null) params.set('week', String(nextWeek));
      const qs = params.toString();
      const response = await fetch(qs ? `/api/official-card?${qs}` : '/api/official-card');
      const data = (await response.json()) as OfficialCardResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Failed to load Official Card (${response.status})`);
      }
      setWeek(data.week);
      setSummary(data.summary ?? null);
      setGames(data.games ?? []);
      if (data.empty) {
        setEmptyMessage(data.emptyMessage || OFFICIAL_CARD_EMPTY_MESSAGE(data.week));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setGames([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('week');
    const parsed = fromUrl ? Number.parseInt(fromUrl, 10) : NaN;
    void loadCard(Number.isInteger(parsed) && parsed >= 1 && parsed <= 16 ? parsed : undefined);
  }, []);

  const handleExportCsv = () => {
    const rows = buildOfficialCardCsvRows(games);
    if (rows.length === 0) return;
    downloadAsCsv(
      `official-card-${OFFICIAL_CARD_SEASON}-week-${week ?? 'unknown'}`,
      rows,
      [...OFFICIAL_CARD_CSV_HEADERS]
    );
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <HeaderNav />
        <div className="flex-1 flex items-center justify-center px-4">
          <ErrorState
            title="Unable to Load Official Card"
            message={error}
            onRetry={() => loadCard(week ?? undefined)}
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Official Card</h1>
                <p className="text-sm font-semibold text-blue-800 mt-1">
                  Core V1 — OFFICIAL / LOCKED
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm text-gray-700">
                  Week
                  <select
                    className="ml-2 border rounded px-2 py-1 bg-white"
                    value={week ?? ''}
                    onChange={(e) => {
                      const next = Number.parseInt(e.target.value, 10);
                      setWeek(next);
                      void loadCard(next);
                    }}
                    disabled={loading || week == null}
                  >
                    {Array.from({ length: 16 }, (_, i) => i + 1).map((w) => (
                      <option key={w} value={w}>
                        Week {w}
                      </option>
                    ))}
                  </select>
                </label>
                {games.length > 0 && (
                  <button
                    onClick={handleExportCsv}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    Export CSV
                  </button>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-600">
              Season {OFFICIAL_CARD_SEASON}. These are persisted selections locked before kickoff.
              They do not change when the current model or market moves.
            </p>
            <p className="text-sm mt-2">
              <Link href="/" className="text-blue-600 hover:text-blue-800 underline">
                View Live Model / Current Slate
              </Link>
            </p>
          </div>

          {summary && games.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="text-xs text-gray-500">Bets / Games</div>
                <div className="text-lg font-semibold text-gray-900">
                  {summary.totalBets} / {summary.gameCount}
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="text-xs text-gray-500">Graded record</div>
                <div className="text-lg font-semibold text-gray-900">
                  {summary.wins}-{summary.losses}-{summary.pushes}
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="text-xs text-gray-500">Graded PnL</div>
                <div className={`text-lg font-semibold ${summary.totalPnL >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {formatCurrency(summary.totalPnL)}
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="text-xs text-gray-500">ROI (graded stake)</div>
                <div className="text-lg font-semibold text-gray-900">{formatPercent(summary.roi)}</div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-lg p-3 animate-pulse">
                  <div className="h-16 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          ) : emptyMessage ? (
            <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
              <p className="text-gray-700">
                {emptyMessage ?? `No official card has been locked for ${OFFICIAL_CARD_SEASON} Week ${week} yet.`}
              </p>
              <p className="text-gray-500 text-sm mt-2">
                Current Slate is still available for live/dynamic model and market views.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {games.map((game) => (
                <Link
                  key={game.gameId}
                  href={`/game/${game.gameId}`}
                  className="block bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-400 hover:shadow-sm transition-all"
                >
                  <div className="flex flex-wrap items-center gap-2 mb-2 pb-2 border-b border-gray-100">
                    <TeamLogo teamName={game.awayTeamName} teamId={game.awayTeamId} size="sm" />
                    <span className="font-semibold text-sm text-gray-900">{game.awayTeamName}</span>
                    <span className="text-gray-400 text-xs">@</span>
                    <TeamLogo teamName={game.homeTeamName} teamId={game.homeTeamId} size="sm" />
                    <span className="font-semibold text-sm text-gray-900">{game.homeTeamName}</span>
                    <span className="ml-auto text-xs text-gray-500">{game.kickoffChicago}</span>
                  </div>
                  {(game.status === 'final' || game.status === 'in_progress') && (
                    <p className="text-xs text-gray-600 mb-2">
                      {game.status === 'final' ? 'Final' : 'In progress'}
                      {game.awayScore != null && game.homeScore != null
                        ? `: ${game.awayTeamName} ${game.awayScore} – ${game.homeTeamName} ${game.homeScore}`
                        : ''}
                    </p>
                  )}
                  <div className="space-y-2">
                    {game.markets.map((wager) => (
                      <div key={wager.id} className="text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-gray-600 font-medium">{marketTitle(wager.marketType)}:</span>{' '}
                            <span className="text-gray-900 font-semibold">{wager.pickLabel}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {resultBadge(wager)}
                            {wager.result && wager.pnl != null && (
                              <span className={wager.pnl >= 0 ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>
                                {formatCurrency(wager.pnl)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                          <span>
                            {lockedFieldLabel(wager.marketType)}:{' '}
                            <span className="font-medium text-gray-800">{wager.lockedLineLabel}</span>
                          </span>
                          <span>
                            {modelFieldLabel(wager.marketType)}:{' '}
                            <span className="font-medium text-gray-800">{wager.modelLineLabel}</span>
                          </span>
                          {wager.notesMeta.metadataAvailable && wager.marketType === 'spread' && wager.notesMeta.edgePts != null && (
                            <span>Edge: {wager.notesMeta.edgePts.toFixed(1)} pts</span>
                          )}
                          {wager.notesMeta.metadataAvailable && wager.marketType === 'moneyline' && wager.notesMeta.valuePercent != null && (
                            <span>Value: {wager.notesMeta.valuePercent.toFixed(1)}%</span>
                          )}
                          {wager.notesMeta.metadataAvailable && wager.marketType === 'total' && wager.notesMeta.ouEdgePts != null && (
                            <span>Edge: {wager.notesMeta.ouEdgePts.toFixed(1)} pts</span>
                          )}
                          {wager.notesMeta.metadataAvailable && wager.notesMeta.grade && (
                            <span>Grade {wager.notesMeta.grade}</span>
                          )}
                          {wager.notesMeta.metadataAvailable && wager.notesMeta.book && (
                            <span>{wager.notesMeta.book}</span>
                          )}
                          {wager.notesMeta.metadataAvailable && wager.notesMeta.marketTimestamp && (
                            <span>{formatKickoffChicago(wager.notesMeta.marketTimestamp)}</span>
                          )}
                          {wager.clv != null && (
                            <span>
                              CLV:{' '}
                              <span className={wager.clv >= 0 ? 'text-green-700' : 'text-red-700'}>
                                {wager.clv > 0 ? '+' : ''}
                                {wager.clv.toFixed(3)}
                              </span>
                            </span>
                          )}
                        </div>
                        {wager.notesMeta.warning && (
                          <p className="text-xs text-amber-700 mt-1">{wager.notesMeta.warning}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
