/**
 * Week Archive table — persisted 2026 Game frame + Official Card wagers.
 * Historical/read-only. Does not fetch Current Slate or live model data.
 */

import Link from 'next/link';
import { TeamLogo } from '@/components/TeamLogo';
import { formatKickoffChicago, type OfficialCardWager } from '@/lib/official-card';
import {
  WEEK_ARCHIVE_AWAITING_GRADING,
  WEEK_ARCHIVE_NO_WAGER_MESSAGE,
  type WeekArchiveGameView,
} from '@/lib/week-archive';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function resultBadge(wager: OfficialCardWager) {
  if (wager.awaitingGrading) {
    return (
      <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">
        {WEEK_ARCHIVE_AWAITING_GRADING}
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
  if (marketType === 'spread') return 'SPREAD';
  if (marketType === 'moneyline') return 'MONEYLINE';
  if (marketType === 'total') return 'TOTAL';
  return marketType.toUpperCase();
}

function lockedFieldLabel(): string {
  return 'Locked Price';
}

function modelFieldLabel(marketType: string): string {
  return marketType === 'moneyline' ? 'Model Fair' : 'Model Line';
}

function statusLabel(status: string): string {
  if (status === 'final') return 'Final';
  if (status === 'in_progress') return 'In progress';
  return 'Scheduled';
}

export function WeekArchiveTable({ games }: { games: WeekArchiveGameView[] }) {
  if (games.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-600">
        No persisted games for this week.
      </div>
    );
  }

  return (
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
            <span className="ml-auto text-xs text-gray-500">{game.kickoffChicago} CT</span>
          </div>
          <p className="text-xs text-gray-600 mb-2">
            {statusLabel(String(game.status))}
            {game.awayScore != null && game.homeScore != null
              ? `: ${game.awayTeamName} ${game.awayScore}, ${game.homeTeamName} ${game.homeScore}`
              : ''}
            {game.venue ? ` · ${game.venue}` : ''}
            {game.neutralSite ? ' · Neutral site' : ''}
          </p>
          {!game.hasOfficialWager ? (
            <p className="text-sm font-medium text-gray-700">{WEEK_ARCHIVE_NO_WAGER_MESSAGE}</p>
          ) : (
            <div className="space-y-2">
              {game.markets.map((wager) => (
                <div key={wager.id} className="text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-gray-600 font-medium">{marketTitle(wager.marketType)}</span>
                      {' '}
                      <span className="text-gray-900 font-semibold">{wager.pickLabel}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {resultBadge(wager)}
                      {wager.result != null && wager.pnl != null && (
                        <span className={wager.pnl >= 0 ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>
                          {formatCurrency(wager.pnl)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                      {lockedFieldLabel()}:{' '}
                      <span className="font-medium text-gray-800">{wager.lockedLineLabel}</span>
                    </span>
                    <span>
                      {modelFieldLabel(wager.marketType)}:{' '}
                      <span className="font-medium text-gray-800">{wager.modelLineLabel}</span>
                    </span>
                    {wager.notesMeta.metadataAvailable && wager.marketType === 'spread' && wager.notesMeta.edgePts != null && (
                      <span>Edge {wager.notesMeta.edgePts.toFixed(1)} pts</span>
                    )}
                    {wager.notesMeta.metadataAvailable && wager.marketType === 'moneyline' && wager.notesMeta.valuePercent != null && (
                      <span>Value: {wager.notesMeta.valuePercent.toFixed(1)}%</span>
                    )}
                    {wager.notesMeta.metadataAvailable && wager.marketType === 'total' && wager.notesMeta.ouEdgePts != null && (
                      <span>Edge {wager.notesMeta.ouEdgePts.toFixed(1)} pts</span>
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
          )}
        </Link>
      ))}
    </div>
  );
}
