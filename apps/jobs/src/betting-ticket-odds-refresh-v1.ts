/**
 * Betting Ticket Odds Refresh V1 — pure freshness planner.
 *
 * Purpose:
 * - keep the operator Betting Ticket market snapshot fresh enough to support
 *   the 3-hour BET NOW freshness guard;
 * - avoid provider calls when the board is already fresh;
 * - hand off the final hour before kickoff to the existing Generic T-30
 *   Stage C refresh path.
 *
 * This module contains no provider calls and no database writes.
 */

export const BETTING_TICKET_ODDS_REFRESH_STALE_MINUTES = 150;
export const BETTING_TICKET_ODDS_REFRESH_T30_HANDOFF_MINUTES = 60;

export const BETTING_TICKET_REQUIRED_MARKETS = [
  'spread',
  'total',
  'moneyline',
] as const;

export type BettingTicketRequiredMarket =
  (typeof BETTING_TICKET_REQUIRED_MARKETS)[number];

export type BettingTicketOddsRefreshOutcome =
  | 'NO_FUTURE_GAMES'
  | 'T30_HANDOFF'
  | 'BOARD_FRESH'
  | 'REFRESH_NEEDED';

export interface BettingTicketOddsRefreshFrame {
  gameId: string;
  kickoffIso: string;
  status: string;
  recentMarketTypes: string[];
}

export interface BettingTicketOddsRefreshPlan {
  observedTimestamp: string;
  staleAfterMinutes: number;
  t30HandoffMinutes: number;
  futureScheduledGameCount: number;
  handoffGameIds: string[];
  staleGameIds: string[];
  freshGameIds: string[];
  missingMarketsByGame: Record<string, string[]>;
  shouldRefresh: boolean;
  outcome: BettingTicketOddsRefreshOutcome;
  providerCalls: 0;
  databaseWrites: false;
  writeSafe: true;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function planBettingTicketOddsRefresh(options: {
  now: Date;
  frames: BettingTicketOddsRefreshFrame[];
}): BettingTicketOddsRefreshPlan {
  const nowMs = options.now.getTime();
  const handoffCutoff =
    nowMs + BETTING_TICKET_ODDS_REFRESH_T30_HANDOFF_MINUTES * 60_000;

  const future = options.frames
    .filter((frame) => {
      const kickoffMs = new Date(frame.kickoffIso).getTime();
      return (
        String(frame.status).toLowerCase() === 'scheduled' &&
        Number.isFinite(kickoffMs) &&
        kickoffMs > nowMs
      );
    })
    .sort(
      (a, b) =>
        new Date(a.kickoffIso).getTime() - new Date(b.kickoffIso).getTime()
    );

  if (future.length === 0) {
    return {
      observedTimestamp: options.now.toISOString(),
      staleAfterMinutes: BETTING_TICKET_ODDS_REFRESH_STALE_MINUTES,
      t30HandoffMinutes: BETTING_TICKET_ODDS_REFRESH_T30_HANDOFF_MINUTES,
      futureScheduledGameCount: 0,
      handoffGameIds: [],
      staleGameIds: [],
      freshGameIds: [],
      missingMarketsByGame: {},
      shouldRefresh: false,
      outcome: 'NO_FUTURE_GAMES',
      providerCalls: 0,
      databaseWrites: false,
      writeSafe: true,
    };
  }

  const handoffGameIds = uniqueSorted(
    future
      .filter(
        (frame) => new Date(frame.kickoffIso).getTime() <= handoffCutoff
      )
      .map((frame) => frame.gameId)
  );

  const missingMarketsByGame: Record<string, string[]> = {};
  const staleGameIds: string[] = [];
  const freshGameIds: string[] = [];

  for (const frame of future) {
    const recent = new Set(frame.recentMarketTypes.map(String));
    const missing = BETTING_TICKET_REQUIRED_MARKETS.filter(
      (market) => !recent.has(market)
    );
    if (missing.length > 0) {
      missingMarketsByGame[frame.gameId] = [...missing];
      staleGameIds.push(frame.gameId);
    } else {
      freshGameIds.push(frame.gameId);
    }
  }

  if (handoffGameIds.length > 0) {
    return {
      observedTimestamp: options.now.toISOString(),
      staleAfterMinutes: BETTING_TICKET_ODDS_REFRESH_STALE_MINUTES,
      t30HandoffMinutes: BETTING_TICKET_ODDS_REFRESH_T30_HANDOFF_MINUTES,
      futureScheduledGameCount: future.length,
      handoffGameIds,
      staleGameIds: uniqueSorted(staleGameIds),
      freshGameIds: uniqueSorted(freshGameIds),
      missingMarketsByGame,
      shouldRefresh: false,
      outcome: 'T30_HANDOFF',
      providerCalls: 0,
      databaseWrites: false,
      writeSafe: true,
    };
  }

  const shouldRefresh = staleGameIds.length > 0;

  return {
    observedTimestamp: options.now.toISOString(),
    staleAfterMinutes: BETTING_TICKET_ODDS_REFRESH_STALE_MINUTES,
    t30HandoffMinutes: BETTING_TICKET_ODDS_REFRESH_T30_HANDOFF_MINUTES,
    futureScheduledGameCount: future.length,
    handoffGameIds,
    staleGameIds: uniqueSorted(staleGameIds),
    freshGameIds: uniqueSorted(freshGameIds),
    missingMarketsByGame,
    shouldRefresh,
    outcome: shouldRefresh ? 'REFRESH_NEEDED' : 'BOARD_FRESH',
    providerCalls: 0,
    databaseWrites: false,
    writeSafe: true,
  };
}
