/**
 * Phase 1B — persisted Official Card truth.
 * Read-only helpers over official_flat_100 Bet rows. No live model, live market
 * lines, or slate recalculation.
 */

export const OFFICIAL_CARD_SEASON = 2026;
export const OFFICIAL_CARD_STRATEGY_TAG = 'official_flat_100' as const;
export const OFFICIAL_CARD_SOURCE = 'strategy_run' as const;

export const OFFICIAL_CARD_EMPTY_MESSAGE = (week: number) =>
  `No official card has been locked for ${OFFICIAL_CARD_SEASON} Week ${week} yet.`;

export class OfficialCardIntegrityError extends Error {
  readonly duplicates: OfficialCardDuplicate[];

  constructor(duplicates: OfficialCardDuplicate[]) {
    const keys = duplicates
      .map((d) => `${d.gameId}/${d.marketType} x${d.count}`)
      .join(', ');
    super(
      `Official card data integrity error: duplicate official rows for the same game and market (${keys}).`
    );
    this.name = 'OfficialCardIntegrityError';
    this.duplicates = duplicates;
    Object.setPrototypeOf(this, OfficialCardIntegrityError.prototype);
  }
}

export type OfficialCardMarketType = 'spread' | 'total' | 'moneyline';
export type OfficialCardSide = 'home' | 'away' | 'over' | 'under';
export type OfficialCardResult = 'win' | 'loss' | 'push' | null;
export type OfficialCardGameStatus = 'scheduled' | 'in_progress' | 'final' | string;

export interface OfficialCardDuplicate {
  gameId: string;
  marketType: string;
  count: number;
  betIds: string[];
}

export interface OfficialCardNotesMetadata {
  metadataAvailable: boolean;
  warning: string | null;
  modelLabel: string | null;
  grade: string | null;
  edgePts: number | null;
  valuePercent: number | null;
  ouEdgePts: number | null;
  book: string | null;
  marketTimestamp: string | null;
}

export interface OfficialCardBetInput {
  id: string;
  season: number;
  week: number;
  gameId: string;
  marketType: OfficialCardMarketType | string;
  side: OfficialCardSide | string;
  modelPrice: number | string | { toString(): string };
  closePrice: number | string | { toString(): string } | null;
  stake: number | string | { toString(): string };
  result: OfficialCardResult | string | null;
  pnl: number | string | { toString(): string } | null;
  clv: number | string | { toString(): string } | null;
  strategyTag: string;
  source: string;
  notes: string | null;
  createdAt: Date | string;
  game: {
    id: string;
    season: number;
    week: number;
    date: Date | string;
    status: OfficialCardGameStatus;
    homeScore: number | null;
    awayScore: number | null;
    homeTeamId: string;
    awayTeamId: string;
    homeTeam: { id?: string; name: string };
    awayTeam: { id?: string; name: string };
  };
}

export interface OfficialCardWager {
  id: string;
  season: number;
  week: number;
  gameId: string;
  marketType: string;
  side: string;
  modelPrice: number;
  closePrice: number | null;
  stake: number;
  result: string | null;
  pnl: number | null;
  clv: number | null;
  strategyTag: string;
  source: string;
  notes: string | null;
  createdAt: string;
  pickLabel: string;
  lockedLineLabel: string;
  modelLineLabel: string;
  selectedTeamName: string | null;
  awaitingGrading: boolean;
  notesMeta: OfficialCardNotesMetadata;
}

export interface OfficialCardGameView {
  gameId: string;
  season: number;
  week: number;
  kickoffIso: string;
  kickoffChicago: string;
  status: OfficialCardGameStatus;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  markets: OfficialCardWager[];
}

export interface OfficialCardSummary {
  totalBets: number;
  gameCount: number;
  spreadBets: number;
  totalsBets: number;
  moneylineBets: number;
  pendingBets: number;
  gradedBets: number;
  wins: number;
  losses: number;
  pushes: number;
  gradedStake: number;
  totalPnL: number;
  roi: number | null;
  hitRate: number | null;
  avgCLV: number | null;
  finalGameCount: number;
  scheduledGameCount: number;
  inProgressGameCount: number;
}

export function buildOfficialCardWhere(week: number) {
  return {
    season: OFFICIAL_CARD_SEASON,
    week,
    strategyTag: OFFICIAL_CARD_STRATEGY_TAG,
    source: OFFICIAL_CARD_SOURCE,
  };
}

export function officialCardPrismaSelect() {
  return {
    id: true,
    season: true,
    week: true,
    gameId: true,
    marketType: true,
    side: true,
    modelPrice: true,
    closePrice: true,
    stake: true,
    result: true,
    pnl: true,
    clv: true,
    strategyTag: true,
    source: true,
    notes: true,
    createdAt: true,
    game: {
      select: {
        id: true,
        season: true,
        week: true,
        date: true,
        status: true,
        homeScore: true,
        awayScore: true,
        homeTeamId: true,
        awayTeamId: true,
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
      },
    },
  } as const;
}

export function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(String(value));
  return Number.isFinite(n) ? n : null;
}

function iso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

export function formatLineNumber(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-9) return '0';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatSignedSpread(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-9) return 'PK';
  const abs = formatLineNumber(Math.abs(value));
  return value > 0 ? `+${abs}` : `-${abs}`;
}

export function formatAmericanOdds(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

export function formatSpreadPick(teamName: string, closePrice: number | null): string {
  if (closePrice === null || !Number.isFinite(closePrice)) {
    return teamName;
  }
  const signed = formatSignedSpread(closePrice);
  return signed === 'PK' ? `${teamName} PK` : `${teamName} ${signed}`;
}

export function formatMoneylinePick(teamName: string, closePrice: number | null): string {
  if (closePrice === null || !Number.isFinite(closePrice)) {
    return teamName;
  }
  return `${teamName} ${formatAmericanOdds(closePrice)}`;
}

export function formatTotalPick(side: string, closePrice: number | null): string {
  const label = side === 'under' ? 'Under' : 'Over';
  if (closePrice === null || !Number.isFinite(closePrice)) {
    return label;
  }
  return `${label} ${formatLineNumber(closePrice)}`;
}

export function formatKickoffChicago(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Chicago',
  });
}

export function parseOfficialCardNotes(notes: string | null | undefined): OfficialCardNotesMetadata {
  const empty: OfficialCardNotesMetadata = {
    metadataAvailable: false,
    warning: null,
    modelLabel: null,
    grade: null,
    edgePts: null,
    valuePercent: null,
    ouEdgePts: null,
    book: null,
    marketTimestamp: null,
  };

  if (notes == null || notes.trim() === '') {
    return empty;
  }

  const pairs = new Map<string, string>();
  const segments = notes.split(';');
  for (const raw of segments) {
    const segment = raw.trim();
    if (!segment) continue;
    const eq = segment.indexOf('=');
    if (eq <= 0) {
      return {
        ...empty,
        warning: 'Persisted notes metadata is malformed; wager fields were preserved without inferred grade/edge/book.',
      };
    }
    const key = segment.slice(0, eq).trim();
    const value = segment.slice(eq + 1).trim();
    if (!key) {
      return {
        ...empty,
        warning: 'Persisted notes metadata is malformed; wager fields were preserved without inferred grade/edge/book.',
      };
    }
    pairs.set(key, value);
  }

  if (pairs.size === 0) {
    return {
      ...empty,
      warning: 'Persisted notes metadata is malformed; wager fields were preserved without inferred grade/edge/book.',
    };
  }

  const rawGrade = pairs.get('grade');
  const grade = rawGrade && rawGrade.length > 0 ? rawGrade : null;

  return {
    metadataAvailable: true,
    warning: null,
    modelLabel: pairs.get('model') || null,
    grade,
    edgePts: toFiniteNumber(pairs.get('edgePts') ?? null),
    valuePercent: toFiniteNumber(pairs.get('valuePercent') ?? null),
    ouEdgePts: toFiniteNumber(pairs.get('ouEdgePts') ?? null),
    book: pairs.get('book') || null,
    marketTimestamp: pairs.get('marketTimestamp') || null,
  };
}

export function selectOfficialCardRows<T extends {
  season: number;
  strategyTag: string;
  source: string;
}>(rows: T[]): T[] {
  return rows.filter(
    (row) =>
      row.season === OFFICIAL_CARD_SEASON &&
      row.strategyTag === OFFICIAL_CARD_STRATEGY_TAG &&
      row.source === OFFICIAL_CARD_SOURCE
  );
}

export function findOfficialCardDuplicates(
  rows: Array<{ id: string; gameId: string; marketType: string }>
): OfficialCardDuplicate[] {
  const grouped: Record<string, { gameId: string; marketType: string; betIds: string[] }> = {};
  for (const row of rows) {
    const key = `${row.gameId}::${row.marketType}`;
    if (grouped[key]) {
      grouped[key].betIds.push(row.id);
    } else {
      grouped[key] = {
        gameId: row.gameId,
        marketType: row.marketType,
        betIds: [row.id],
      };
    }
  }
  const duplicates: OfficialCardDuplicate[] = [];
  for (const key of Object.keys(grouped)) {
    const g = grouped[key];
    if (g.betIds.length > 1) {
      duplicates.push({
        gameId: g.gameId,
        marketType: g.marketType,
        count: g.betIds.length,
        betIds: g.betIds,
      });
    }
  }
  return duplicates;
}

export function assertOfficialCardIntegrity(
  rows: Array<{ id: string; gameId: string; marketType: string }>
): void {
  const duplicates = findOfficialCardDuplicates(rows);
  if (duplicates.length > 0) {
    throw new OfficialCardIntegrityError(duplicates);
  }
}

function selectedTeamName(row: OfficialCardBetInput): string | null {
  if (row.side === 'home') return row.game.homeTeam.name;
  if (row.side === 'away') return row.game.awayTeam.name;
  return null;
}

function pickLabelForRow(row: OfficialCardBetInput, closePrice: number | null): string {
  const team = selectedTeamName(row);
  if (row.marketType === 'spread') {
    return formatSpreadPick(team || 'Unknown', closePrice);
  }
  if (row.marketType === 'moneyline') {
    return formatMoneylinePick(team || 'Unknown', closePrice);
  }
  return formatTotalPick(row.side, closePrice);
}

function lockedLineLabel(row: OfficialCardBetInput, closePrice: number | null): string {
  if (closePrice === null) return '—';
  if (row.marketType === 'moneyline') return formatAmericanOdds(closePrice);
  if (row.marketType === 'spread') return formatSignedSpread(closePrice);
  return formatLineNumber(closePrice);
}

function modelLineLabel(row: OfficialCardBetInput, modelPrice: number): string {
  if (row.marketType === 'moneyline') return formatAmericanOdds(modelPrice);
  if (row.marketType === 'spread') return formatSignedSpread(modelPrice);
  return formatLineNumber(modelPrice);
}

export function mapOfficialCardWager(row: OfficialCardBetInput): OfficialCardWager {
  const modelPrice = toFiniteNumber(row.modelPrice) ?? 0;
  const closePrice = toFiniteNumber(row.closePrice);
  const notesMeta = parseOfficialCardNotes(row.notes);
  const result = row.result == null ? null : String(row.result);
  const status = String(row.game.status);

  return {
    id: row.id,
    season: row.season,
    week: row.week,
    gameId: row.gameId,
    marketType: String(row.marketType),
    side: String(row.side),
    modelPrice,
    closePrice,
    stake: toFiniteNumber(row.stake) ?? 0,
    result,
    pnl: toFiniteNumber(row.pnl),
    clv: toFiniteNumber(row.clv),
    strategyTag: row.strategyTag,
    source: row.source,
    notes: row.notes,
    createdAt: iso(row.createdAt),
    pickLabel: pickLabelForRow(row, closePrice),
    lockedLineLabel: lockedLineLabel(row, closePrice),
    modelLineLabel: modelLineLabel(row, modelPrice),
    selectedTeamName: selectedTeamName(row),
    awaitingGrading: status === 'final' && result == null,
    notesMeta,
  };
}

const MARKET_ORDER: Record<string, number> = {
  spread: 0,
  moneyline: 1,
  total: 2,
};

export function summarizeOfficialCard(rows: OfficialCardBetInput[]): OfficialCardSummary {
  const official = selectOfficialCardRows(rows);
  const gameIds: Record<string, true> = {};
  const statusByGame: Record<string, string> = {};
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
    gameIds[row.gameId] = true;
    statusByGame[row.gameId] = String(row.game.status);
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

  let finalGameCount = 0;
  let scheduledGameCount = 0;
  let inProgressGameCount = 0;
  const statusKeys = Object.keys(statusByGame);
  for (let i = 0; i < statusKeys.length; i += 1) {
    const status = statusByGame[statusKeys[i]];
    if (status === 'final') finalGameCount += 1;
    else if (status === 'in_progress') inProgressGameCount += 1;
    else scheduledGameCount += 1;
  }

  const decided = wins + losses;
  return {
    totalBets: official.length,
    gameCount: Object.keys(gameIds).length,
    spreadBets,
    totalsBets,
    moneylineBets,
    pendingBets,
    gradedBets,
    wins,
    losses,
    pushes,
    gradedStake,
    totalPnL,
    roi: gradedStake > 0 ? totalPnL / gradedStake : null,
    hitRate: decided > 0 ? wins / decided : null,
    avgCLV: clvs.length > 0 ? clvs.reduce((sum, v) => sum + v, 0) / clvs.length : null,
    finalGameCount,
    scheduledGameCount,
    inProgressGameCount,
  };
}

export function groupOfficialCardByGame(rows: OfficialCardBetInput[]): OfficialCardGameView[] {
  const official = selectOfficialCardRows(rows);
  assertOfficialCardIntegrity(official);

  const games: Record<string, OfficialCardGameView> = {};
  for (const row of official) {
    const existing = games[row.gameId];
    const wager = mapOfficialCardWager(row);
    if (existing) {
      existing.markets.push(wager);
      continue;
    }
    games[row.gameId] = {
      gameId: row.gameId,
      season: row.game.season,
      week: row.game.week,
      kickoffIso: iso(row.game.date),
      kickoffChicago: formatKickoffChicago(row.game.date),
      status: row.game.status,
      homeTeamId: row.game.homeTeamId,
      homeTeamName: row.game.homeTeam.name,
      awayTeamId: row.game.awayTeamId,
      awayTeamName: row.game.awayTeam.name,
      homeScore: row.game.homeScore,
      awayScore: row.game.awayScore,
      markets: [wager],
    };
  }

  const grouped = Object.keys(games).map((key) => games[key]);
  grouped.sort(
    (a, b) => new Date(a.kickoffIso).getTime() - new Date(b.kickoffIso).getTime()
  );
  for (const game of grouped) {
    game.markets.sort(
      (a, b) => (MARKET_ORDER[a.marketType] ?? 9) - (MARKET_ORDER[b.marketType] ?? 9)
    );
  }
  return grouped;
}

export function buildOfficialCardView(rows: OfficialCardBetInput[]): {
  summary: OfficialCardSummary;
  games: OfficialCardGameView[];
} {
  const official = selectOfficialCardRows(rows);
  return {
    summary: summarizeOfficialCard(official),
    games: groupOfficialCardByGame(official),
  };
}

export const OFFICIAL_CARD_CSV_HEADERS = [
  'Season',
  'Week',
  'Kickoff',
  'Game',
  'Market',
  'Pick',
  'Locked Line/Price',
  'Model Line/Fair Price',
  'Edge/Value',
  'Grade',
  'Book',
  'Market Timestamp',
  'Stake',
  'Result',
  'PnL',
  'CLV',
] as const;

function edgeValueForCsv(wager: OfficialCardWager): string {
  const meta = wager.notesMeta;
  if (!meta.metadataAvailable) return '';
  if (wager.marketType === 'moneyline' && meta.valuePercent !== null) {
    return `${meta.valuePercent}`;
  }
  if (wager.marketType === 'total' && meta.ouEdgePts !== null) {
    return `${meta.ouEdgePts}`;
  }
  if (meta.edgePts !== null) return `${meta.edgePts}`;
  return '';
}

export function buildOfficialCardCsvRows(
  games: OfficialCardGameView[]
): Array<Record<(typeof OFFICIAL_CARD_CSV_HEADERS)[number], string | number>> {
  const rows: Array<Record<(typeof OFFICIAL_CARD_CSV_HEADERS)[number], string | number>> = [];
  for (const game of games) {
    const matchup = `${game.awayTeamName} @ ${game.homeTeamName}`;
    for (const wager of game.markets) {
      rows.push({
        Season: wager.season,
        Week: wager.week,
        Kickoff: game.kickoffChicago,
        Game: matchup,
        Market: wager.marketType,
        Pick: wager.pickLabel,
        'Locked Line/Price': wager.lockedLineLabel,
        'Model Line/Fair Price': wager.modelLineLabel,
        'Edge/Value': edgeValueForCsv(wager),
        Grade: wager.notesMeta.metadataAvailable ? wager.notesMeta.grade || '' : '',
        Book: wager.notesMeta.metadataAvailable ? wager.notesMeta.book || '' : '',
        'Market Timestamp': wager.notesMeta.metadataAvailable
          ? wager.notesMeta.marketTimestamp || ''
          : '',
        Stake: wager.stake,
        Result: wager.result ?? '',
        PnL: wager.pnl ?? '',
        CLV: wager.clv ?? '',
      });
    }
  }
  return rows;
}

export function parseOfficialCardWeekParam(raw: string | null): number | null {
  if (raw == null || raw.trim() === '') return null;
  const week = Number.parseInt(raw, 10);
  if (!Number.isInteger(week) || week < 1 || week > 16) return null;
  return week;
}
