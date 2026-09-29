'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import { ErrorState } from '@/components/ErrorState';

type TicketBucket = 'bet' | 'watch' | 'pass';

interface TicketItem {
  betId: string;
  gameId: string;
  season: number;
  week: number;
  kickoffIso: string;
  kickoffChicago: string;
  status: string;
  awayTeamName: string;
  homeTeamName: string;
  marketType: string;
  side: string;
  selectedTeamName: string | null;
  pickLabel: string;
  modelPriceLabel: string;
  lockedPriceLabel: string;
  lockedGrade: string | null;
  lockedEdgeOrValue: number | null;
  currentPriceLabel: string;
  currentBook: string | null;
  currentTimestamp: string | null;
  marketAgeMinutes: number | null;
  currentEdgeOrValue: number | null;
  currentGrade: string | null;
  movement: number | null;
  movementLabel: string;
  playableToLabel: string;
  priorityPriceLabel: string;
  bucket: TicketBucket;
  reason: string;
  actionLabel: string;
  operatorTier: 'primary' | 'secondary' | 'alternate' | null;
  strengthMultiple: number | null;
  priorityReason: string | null;
}

interface TicketResponse {
  ok: boolean;
  season: number;
  week: number;
  generatedAt: string;
  policy: {
    bet: string;
    watch: string;
    pass: string;
    playableTo: string;
    primary: string;
    secondary: string;
    alternate: string;
  };
  summary: {
    total: number;
    bet: number;
    watch: number;
    pass: number;
    primary: number;
    secondary: number;
    alternate: number;
    freshMarket: number;
    staleMarket: number;
    unavailableMarket: number;
  };
  items: TicketItem[];
  error?: string;
}

const bucketMeta: Record<
  TicketBucket,
  { title: string; badge: string; border: string; text: string; description: string }
> = {
  bet: {
    title: 'BET NOW',
    badge: 'bg-green-100 text-green-800',
    border: 'border-green-200',
    text: 'text-green-800',
    description: 'Locked A, still A, and the current number is not worse than the locked price.',
  },
  watch: {
    title: 'WATCH',
    badge: 'bg-amber-100 text-amber-800',
    border: 'border-amber-200',
    text: 'text-amber-800',
    description: 'Still A/B value, but wait for a better number or stronger price confirmation.',
  },
  pass: {
    title: 'PASS / NO CHASE',
    badge: 'bg-gray-100 text-gray-700',
    border: 'border-gray-200',
    text: 'text-gray-700',
    description: 'Only C/no qualifying value remains, the market is unavailable, or the kickoff gate is closed.',
  },
};

function marketLabel(value: string): string {
  if (value === 'spread') return 'Spread';
  if (value === 'moneyline') return 'Moneyline';
  if (value === 'total') return 'Total';
  return value;
}

function currentPickLabel(item: TicketItem): string {
  if (item.currentPriceLabel === '—') return 'Unavailable';
  if (item.marketType === 'total') {
    const side = item.side === 'under' ? 'Under' : 'Over';
    return `${side} ${item.currentPriceLabel}`;
  }
  if (item.selectedTeamName) {
    return `${item.selectedTeamName} ${item.currentPriceLabel}`;
  }
  return item.currentPriceLabel;
}

function edgeLabel(item: TicketItem): string {
  if (item.currentEdgeOrValue === null) return '—';
  return item.marketType === 'moneyline'
    ? `${item.currentEdgeOrValue.toFixed(1)}% value`
    : `${item.currentEdgeOrValue.toFixed(1)} pts`;
}

function lockedEdgeLabel(item: TicketItem): string {
  if (item.lockedEdgeOrValue === null) return '—';
  return item.marketType === 'moneyline'
    ? `${item.lockedEdgeOrValue.toFixed(1)}% value`
    : `${item.lockedEdgeOrValue.toFixed(1)} pts`;
}

function marketSnapshotLabel(item: TicketItem): string {
  if (!item.currentTimestamp) return 'Market snapshot unavailable';
  const d = new Date(item.currentTimestamp);
  const stamp = Number.isNaN(d.getTime())
    ? item.currentTimestamp
    : d.toLocaleString('en-US', {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Chicago',
      });
  if (item.marketAgeMinutes === null) return stamp;
  const age =
    item.marketAgeMinutes < 60
      ? `${Math.round(item.marketAgeMinutes)}m old`
      : `${(item.marketAgeMinutes / 60).toFixed(1)}h old`;
  return `${stamp} · ${age}`;
}

function TicketCard({ item }: { item: TicketItem }) {
  const meta = bucketMeta[item.bucket];
  const stale = item.marketAgeMinutes !== null && item.marketAgeMinutes > 180;

  return (
    <Link
      href={`/game/${item.gameId}`}
      className={`block bg-white border ${meta.border} rounded-lg p-4 hover:shadow-sm transition-shadow`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${meta.badge}`}>
              {meta.title}
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700">
              {marketLabel(item.marketType)}
            </span>
            {item.currentGrade && (
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">
                Now Grade {item.currentGrade}
              </span>
            )}
          </div>
          <div className="mt-2 font-semibold text-gray-900">
            {item.awayTeamName} @ {item.homeTeamName}
          </div>
          <div className="text-sm text-gray-500">{item.kickoffChicago}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Current edge/value</div>
          <div className="font-bold text-gray-900">{edgeLabel(item)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Locked pick</div>
          <div className="font-semibold text-gray-900">{item.pickLabel}</div>
          <div className="text-xs text-gray-500">
            Grade {item.lockedGrade ?? '—'} · {lockedEdgeLabel(item)}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Current number</div>
          <div className="font-semibold text-gray-900">{currentPickLabel(item)}</div>
          <div className={`text-xs ${stale ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
            {item.currentBook ? `${item.currentBook} · ${marketSnapshotLabel(item)}` : marketSnapshotLabel(item)}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Movement</div>
          <div
            className={`font-semibold ${
              item.movement === null
                ? 'text-gray-700'
                : item.movement >= 0
                  ? 'text-green-700'
                  : 'text-red-700'
            }`}
          >
            {item.movementLabel}
          </div>
          <div className="text-xs text-gray-500">{item.reason}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Action range</div>
          <div className={`font-semibold ${meta.text}`}>{item.actionLabel}</div>
          <div className="text-xs text-gray-500">Frozen model: {item.modelPriceLabel}</div>
        </div>
      </div>
    </Link>
  );
}

function BetNowSection({
  primary,
  secondary,
  alternates,
}: {
  primary: TicketItem[];
  secondary: TicketItem[];
  alternates: TicketItem[];
}) {
  return (
    <section>
      <h2 className="text-xl font-bold text-green-800">
        BET NOW ({primary.length + secondary.length + alternates.length})
      </h2>
      <p className="text-sm text-gray-600">
        All rows still satisfy the strict BET NOW rule. The priority overlay only compresses
        the operator card; it does not change Core V1 grade or stake.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 mb-5">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-green-800">Primary Card</div>
          <div className="text-2xl font-bold text-green-900">{primary.length}</div>
          <div className="text-xs text-green-800 mt-1">Preferred game expression with ≥2× the existing A-grade floor.</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-800">Secondary Plays</div>
          <div className="text-2xl font-bold text-blue-900">{secondary.length}</div>
          <div className="text-xs text-blue-800 mt-1">Still BET NOW, but below the 2× A operator-priority cutoff.</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Alternates</div>
          <div className="text-2xl font-bold text-slate-900">{alternates.length}</div>
          <div className="text-xs text-slate-700 mt-1">Same-game duplicate exposure; use intentionally, not accidentally.</div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-base font-bold text-green-900">Primary Card</h3>
        {primary.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
            No current BET NOW wager clears the Primary Card cutoff.
          </div>
        ) : (
          primary.map((item) => <TicketCard key={item.betId} item={item} />)
        )}
      </div>

      <div className="space-y-3 mt-6">
        <h3 className="text-base font-bold text-blue-900">Secondary Plays</h3>
        {secondary.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
            No current secondary BET NOW plays.
          </div>
        ) : (
          secondary.map((item) => <TicketCard key={item.betId} item={item} />)
        )}
      </div>

      {alternates.length > 0 && (
        <details className="mt-6 group">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Correlated / Same-Game Alternates ({alternates.length})
              </h3>
              <p className="text-sm text-gray-600">
                These also qualify BET NOW, but another market from the same game has the stronger
                normalized A-grade cushion.
              </p>
            </div>
            <span className="text-sm font-medium text-gray-500 group-open:hidden">Show</span>
            <span className="text-sm font-medium text-gray-500 hidden group-open:inline">Hide</span>
          </summary>
          <div className="space-y-3 mt-3">
            {alternates.map((item) => <TicketCard key={item.betId} item={item} />)}
          </div>
        </details>
      )}
    </section>
  );
}

function TicketSection({
  bucket,
  items,
  collapse = false,
}: {
  bucket: TicketBucket;
  items: TicketItem[];
  collapse?: boolean;
}) {
  const meta = bucketMeta[bucket];
  const body = (
    <div className="space-y-3 mt-3">
      {items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
          No wagers in this section.
        </div>
      ) : (
        items.map((item) => <TicketCard key={item.betId} item={item} />)
      )}
    </div>
  );

  if (collapse) {
    return (
      <details className="group">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
          <div>
            <h2 className={`text-xl font-bold ${meta.text}`}>
              {meta.title} ({items.length})
            </h2>
            <p className="text-sm text-gray-600">{meta.description}</p>
          </div>
          <span className="text-sm font-medium text-gray-500 group-open:hidden">Show</span>
          <span className="text-sm font-medium text-gray-500 hidden group-open:inline">Hide</span>
        </summary>
        {body}
      </details>
    );
  }

  return (
    <section>
      <h2 className={`text-xl font-bold ${meta.text}`}>
        {meta.title} ({items.length})
      </h2>
      <p className="text-sm text-gray-600">{meta.description}</p>
      {body}
    </section>
  );
}

export default function BettingTicketPage() {
  const [week, setWeek] = useState<number | null>(null);
  const [data, setData] = useState<TicketResponse | null>(null);
  const [market, setMarket] = useState<'all' | 'spread' | 'moneyline' | 'total'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTicket = async (nextWeek?: number) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (nextWeek != null) params.set('week', String(nextWeek));
      const qs = params.toString();
      const response = await fetch(qs ? `/api/betting-ticket?${qs}` : '/api/betting-ticket', {
        cache: 'no-store',
      });
      const body = (await response.json()) as TicketResponse;
      if (!response.ok || !body.ok) {
        throw new Error(body.error || `Failed to load Betting Ticket (${response.status})`);
      }
      setWeek(body.week);
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('week');
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    void loadTicket(Number.isInteger(parsed) && parsed >= 1 && parsed <= 16 ? parsed : undefined);
  }, []);

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    return market === 'all' ? items : items.filter((item) => item.marketType === market);
  }, [data, market]);

  const groups = useMemo(
    () => ({
      primary: filtered.filter((item) => item.bucket === 'bet' && item.operatorTier === 'primary'),
      secondary: filtered.filter((item) => item.bucket === 'bet' && item.operatorTier === 'secondary'),
      alternate: filtered.filter((item) => item.bucket === 'bet' && item.operatorTier === 'alternate'),
      watch: filtered.filter((item) => item.bucket === 'watch'),
      pass: filtered.filter((item) => item.bucket === 'pass'),
    }),
    [filtered]
  );

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <HeaderNav />
        <div className="flex-1 flex items-center justify-center px-4">
          <ErrorState title="Unable to Load Betting Ticket" message={error} onRetry={() => loadTicket(week ?? undefined)} />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Betting Ticket</h1>
              <p className="text-sm font-semibold text-green-800 mt-1">
                Core V1 Official Card + Current Persisted Market
              </p>
              <p className="text-sm text-gray-600 mt-2 max-w-3xl">
                Fast operator view. The Official Card stays locked; this page only asks whether each
                frozen wager is still worth taking at the currently stored market number.
              </p>
              <p className="text-xs text-gray-500 mt-2">
                BET NOW is intentionally selective. WATCH is not a rejection—it is a price-monitoring list.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-gray-700">
                Week
                <select
                  className="ml-2 border rounded px-2 py-1 bg-white"
                  value={week ?? ''}
                  disabled={loading || week == null}
                  onChange={(e) => {
                    const next = Number.parseInt(e.target.value, 10);
                    setWeek(next);
                    void loadTicket(next);
                  }}
                >
                  {Array.from({ length: 16 }, (_, i) => i + 1).map((w) => (
                    <option key={w} value={w}>Week {w}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={loading}
                onClick={() => void loadTicket(week ?? undefined)}
                className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                Refresh
              </button>
            </div>
          </div>

          {data && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Official wagers</div>
                  <div className="text-2xl font-bold text-gray-900">{data.summary.total}</div>
                </div>
                <div className="bg-white border border-green-200 rounded-lg p-3">
                  <div className="text-xs text-green-700">BET NOW</div>
                  <div className="text-2xl font-bold text-green-800">{data.summary.bet}</div>
                </div>
                <div className="bg-white border border-amber-200 rounded-lg p-3">
                  <div className="text-xs text-amber-700">WATCH</div>
                  <div className="text-2xl font-bold text-amber-800">{data.summary.watch}</div>
                </div>
                <div className="bg-white border border-gray-300 rounded-lg p-3">
                  <div className="text-xs text-gray-600">PASS / NO CHASE</div>
                  <div className="text-2xl font-bold text-gray-800">{data.summary.pass}</div>
                </div>
              </div>

              {(data.summary.staleMarket > 0 || data.summary.unavailableMarket > 0) && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-5 text-sm text-amber-900">
                  <div className="font-semibold">Market freshness guard active</div>
                  <div className="mt-1">
                    {data.summary.staleMarket > 0
                      ? `${data.summary.staleMarket} wager${data.summary.staleMarket === 1 ? '' : 's'} use market snapshots older than 3 hours. `
                      : ''}
                    {data.summary.unavailableMarket > 0
                      ? `${data.summary.unavailableMarket} wager${data.summary.unavailableMarket === 1 ? '' : 's'} have no current persisted market. `
                      : ''}
                    Those rows cannot be labeled BET NOW until fresh persisted odds are available.
                  </div>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5 text-sm text-blue-900">
                <div className="font-semibold">Ticket rule</div>
                <div className="mt-1">{data.policy.bet}</div>
                <div>{data.policy.watch}</div>
                <div>{data.policy.pass}</div>
                <div className="mt-1 text-blue-800">
                  “Playable to” is the B-grade threshold calculated from the frozen persisted model price.
                </div>
                <div className="mt-2 border-t border-blue-200 pt-2">
                  <span className="font-semibold">Primary Card overlay:</span> {data.policy.primary}. {data.policy.alternate}.
                  This is an operator ranking only—not a new model grade, confidence score, or stake change.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-6">
                {[
                  ['all', 'All markets'],
                  ['spread', 'Spreads'],
                  ['moneyline', 'Moneylines'],
                  ['total', 'Totals'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMarket(value as typeof market)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
                      market === value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <span className="ml-auto text-xs text-gray-500">
                  Generated {new Date(data.generatedAt).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: 'America/Chicago',
                  })} CT
                </span>
              </div>

              <div className="space-y-8">
                <BetNowSection
                  primary={groups.primary}
                  secondary={groups.secondary}
                  alternates={groups.alternate}
                />
                <TicketSection bucket="watch" items={groups.watch} />
                <TicketSection bucket="pass" items={groups.pass} collapse />
              </div>

              <div className="mt-8 text-sm text-gray-600 flex flex-wrap gap-x-4 gap-y-2">
                <Link href="/picks" className="text-blue-600 hover:text-blue-800 underline">
                  View locked Official Card
                </Link>
                <Link href="/" className="text-blue-600 hover:text-blue-800 underline">
                  View full Current Slate
                </Link>
              </div>
            </>
          )}

          {loading && (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 bg-white border border-gray-200 rounded-lg animate-pulse" />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
