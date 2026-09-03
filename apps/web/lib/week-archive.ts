/**
 * Phase 2B — 2026 Week Archive persisted-history truth.
 * Read-only Game frame + official_flat_100 / strategy_run Bet rows.
 * Reuses Official Card wager mapping and integrity; does not recalculate
 * result, PnL, CLV, or edge from live model or market.
 */

import {
  OFFICIAL_CARD_SOURCE,
  OFFICIAL_CARD_STRATEGY_TAG,
  assertOfficialCardIntegrity,
  formatKickoffChicago,
  mapOfficialCardWager,
  toFiniteNumber,
  type OfficialCardBetInput,
  type OfficialCardGameStatus,
  type OfficialCardGameView,
  type OfficialCardWager,
} from '@/lib/official-card';

export const WEEK_ARCHIVE_MIN_SEASON = 2026;
export const WEEK_ARCHIVE_STRATEGY_TAG = OFFICIAL_CARD_STRATEGY_TAG;
export const WEEK_ARCHIVE_SOURCE = OFFICIAL_CARD_SOURCE;
export const WEEK_ARCHIVE_NO_WAGER_MESSAGE = 'No official wager';
export const WEEK_ARCHIVE_AWAITING_GRADING = 'Awaiting grading';

export function buildWeekArchiveBetWhere(season: number, week: number) {
  return {
    season,
    week,
    strategyTag: WEEK_ARCHIVE_STRATEGY_TAG,
    source: WEEK_ARCHIVE_SOURCE,
  };
}

export function weekArchiveGamePrismaSelect() {
  return {
    id: true,
    season: true,
    week: true,
    date: true,
    status: true,
    homeScore: true,
    awayScore: true,
    venue: true,
    city: true,
    neutralSite: true,
    homeTeamId: true,
    awayTeamId: true,
    homeTeam: { select: { id: true, name: true } },
    awayTeam: { select: { id: true, name: true } },
  } as const;
}

export function parseWeekArchiveWeekParam(raw: string | null): number | null {
  if (raw == null || raw.trim() === '') return null;
  const week = Number.parseInt(raw, 10);
  if (!Number.isInteger(week) || week < 1 || week > 16) return null;
  return week;
}

export function parseWeekArchiveSeasonParam(raw: string | null): number | null {
  if (raw == null || raw.trim() === '') return null;
  const season = Number.parseInt(raw, 10);
  if (!Number.isInteger(season) || season < WEEK_ARCHIVE_MIN_SEASON) return null;
  return season;
}

export interface WeekArchiveGameInput {
  id: string;
  season: number;
  week: number;
  date: Date | string;
  status: OfficialCardGameStatus;
  homeScore: number | null;
  awayScore: number | null;
  venue: string;
  city?: string | null;
  neutralSite: boolean;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: { id?: string; name: string };
  awayTeam: { id?: string; name: string };
}

export interface WeekArchiveGameView extends OfficialCardGameView {
  venue: string;
  city: string | null;
  neutralSite: boolean;
  hasOfficialWager: boolean;
}

export interface WeekArchiveSummary {
  gamesScheduled: number;
  gamesFinal: number;
  gamesInProgress: number;
  officialGames: number;
  gamesWithoutOfficialWager: number;
  totalBets: number;
  gradedBets: number;
  pendingBets: number;
  wins: number;
  losses: number;
  pushes: number;
  gradedStake: number;
  totalPnL: number;
  roi: number | null;
  hitRate: number | null;
  spreadBets: number;
  moneylineBets: number;
  totalsBets: number;
  avgCLV: number | null;
}

const MARKET_ORDER: Record<string, number> = {
  spread: 0,
  moneyline: 1,
  total: 2,
};

function iso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

export function selectWeekArchiveOfficialRows<
  T extends { season: number; strategyTag: string; source: string },
>(rows: T[], season: number): T[] {
  return rows.filter(
    (row) =>
      row.season === season &&
      row.strategyTag === WEEK_ARCHIVE_STRATEGY_TAG &&
      row.source === WEEK_ARCHIVE_SOURCE
  );
}

function summarizeWeekArchiveBets(official: OfficialCardBetInput[]): {
  totalBets: number;
  gradedBets: number;
  pendingBets: number;
  wins: number;
  losses: number;
  pushes: number;
  gradedStake: number;
  totalPnL: number;
  roi: number | null;
  hitRate: number | null;
  spreadBets: number;
  moneylineBets: number;
  totalsBets: number;
  avgCLV: number | null;
} {
  let spreadBets = 0;
  let totalsBets = 0;
  let moneylineBets = 0;
  let pendingBets = 0;
  let gradedBets = 0;
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let gradedStake = 0;
  let totalPnL = 0;
  const clvs: number[] = [];

  for (const row of official) {
    if (row.marketType === 'spread') spreadBets += 1;
    else if (row.marketType === 'total') totalsBets += 1;
    else if (row.marketType === 'moneyline') moneylineBets += 1;

    const result = row.result == null ? null : String(row.result);
    const stake = toFiniteNumber(row.stake) ?? 0;
    const pnl = toFiniteNumber(row.pnl);
    const clv = toFiniteNumber(row.clv);
    if (clv !== null) clvs.push(clv);

    if (result == null) {
      pendingBets += 1;
    } else {
      gradedBets += 1;
      gradedStake += stake;
      totalPnL += pnl ?? 0;
      if (result === 'win') wins += 1;
      else if (result === 'loss') losses += 1;
      else if (result === 'push') pushes += 1;
    }
  }

  const decided = wins + losses;
  return {
    totalBets: official.length,
    gradedBets,
    pendingBets,
    wins,
    losses,
    pushes,
    gradedStake,
    totalPnL,
    roi: gradedStake > 0 ? totalPnL / gradedStake : null,
    hitRate: decided > 0 ? wins / decided : null,
    spreadBets,
    moneylineBets,
    totalsBets,
    avgCLV: clvs.length > 0 ? clvs.reduce((sum, v) => sum + v, 0) / clvs.length : null,
  };
}

function summarizeWeekArchiveFrame(
  games: WeekArchiveGameInput[],
  officialGameCount: number,
  betSummary: ReturnType<typeof summarizeWeekArchiveBets>
): WeekArchiveSummary {
  let gamesFinal = 0;
  let gamesInProgress = 0;
  for (const game of games) {
    const status = String(game.status);
    if (status === 'final') gamesFinal += 1;
    else if (status === 'in_progress') gamesInProgress += 1;
  }

  return {
    gamesScheduled: games.length,
    gamesFinal,
    gamesInProgress,
    officialGames: officialGameCount,
    gamesWithoutOfficialWager: games.length - officialGameCount,
    ...betSummary,
  };
}

export function buildWeekArchiveView(
  games: WeekArchiveGameInput[],
  bets: OfficialCardBetInput[],
  season: number
): {
  summary: WeekArchiveSummary;
  games: WeekArchiveGameView[];
} {
  const official = selectWeekArchiveOfficialRows(bets, season);
  assertOfficialCardIntegrity(official);

  const wagersByGame: Record<string, OfficialCardWager[]> = {};
  for (const row of official) {
    const wager = mapOfficialCardWager(row);
    if (wagersByGame[row.gameId]) {
      wagersByGame[row.gameId].push(wager);
    } else {
      wagersByGame[row.gameId] = [wager];
    }
  }

  const views: WeekArchiveGameView[] = games.map((game) => {
    const markets = (wagersByGame[game.id] || []).map((wager) => ({
      ...wager,
      awaitingGrading: String(game.status) === 'final' && wager.result == null,
    }));
    markets.sort(
      (a, b) => (MARKET_ORDER[a.marketType] ?? 9) - (MARKET_ORDER[b.marketType] ?? 9)
    );
    return {
      gameId: game.id,
      season: game.season,
      week: game.week,
      kickoffIso: iso(game.date),
      kickoffChicago: formatKickoffChicago(game.date),
      status: game.status,
      homeTeamId: game.homeTeamId,
      homeTeamName: game.homeTeam.name,
      awayTeamId: game.awayTeamId,
      awayTeamName: game.awayTeam.name,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      markets,
      venue: game.venue,
      city: game.city ?? null,
      neutralSite: Boolean(game.neutralSite),
      hasOfficialWager: markets.length > 0,
    };
  });

  views.sort(
    (a, b) => new Date(a.kickoffIso).getTime() - new Date(b.kickoffIso).getTime()
  );

  const officialGames = views.filter((game) => game.hasOfficialWager).length;
  return {
    summary: summarizeWeekArchiveFrame(
      games,
      officialGames,
      summarizeWeekArchiveBets(official)
    ),
    games: views,
  };
}
