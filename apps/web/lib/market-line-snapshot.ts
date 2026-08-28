/**
 * Append-only MarketLine snapshot selection (Phase 2C-2J-3).
 *
 * CURRENT market: each book's latest coherent observation.
 * CLOSING market: each book's latest coherent observation at/before kickoff
 *   (fallback to latest overall only when no pre-kick rows exist).
 *
 * Deterministic order: timestamp DESC, then id DESC.
 * Never rely on input-array / DB return order.
 */

export interface MarketLineObservation {
  id: string;
  gameId: string;
  lineType: string;
  lineValue: number;
  closingLine?: number | null;
  bookName: string;
  timestamp: Date | string;
  teamId?: string | null;
  source?: string | null;
}

export interface BookSpreadSnapshot {
  bookName: string;
  timestamp: string;
  homeTeamId: string;
  awayTeamId: string;
  homeLine: number;
  awayLine: number;
  /** Home-minus-away: positive = home favored. */
  marketSpreadHma: number;
  /** Favorite-centric (always <= 0). */
  favoriteCentric: number;
  homeRowId: string;
  awayRowId: string;
  coherent: true;
}

export interface IncoherentSpreadPair {
  bookName: string;
  timestamp: string;
  homeLine: number | null;
  awayLine: number | null;
  reason: string;
}

export interface BookTotalSnapshot {
  bookName: string;
  timestamp: string;
  total: number;
  rowId: string;
}

export interface BookMoneylineSnapshot {
  bookName: string;
  timestamp: string;
  homeTeamId: string;
  awayTeamId: string;
  homePrice: number;
  awayPrice: number;
  homeRowId: string;
  awayRowId: string;
  coherent: true;
}

export interface IncoherentMoneylinePair {
  bookName: string;
  timestamp: string;
  homePrice: number | null;
  awayPrice: number | null;
  reason: string;
}

export interface MarketConsensusResult {
  value: number | null;
  books: string[];
  perBookCount: number;
  rawHistoricalRows: number;
  currentSnapshotRows: number;
  discardedHistoricalObservations: number;
}

export interface GameMarketSelection {
  mode: 'current' | 'closing';
  kickoff: string | null;
  usedPreKickFallback: boolean;
  spreadByBook: BookSpreadSnapshot[];
  totalByBook: BookTotalSnapshot[];
  moneylineByBook: BookMoneylineSnapshot[];
  incoherentSpreads: IncoherentSpreadPair[];
  incoherentMoneylines: IncoherentMoneylinePair[];
  displaySpread: BookSpreadSnapshot | null;
  displayTotal: BookTotalSnapshot | null;
  displayMoneyline: BookMoneylineSnapshot | null;
  spreadConsensus: MarketConsensusResult;
  totalConsensus: MarketConsensusResult;
  rawCounts: {
    spread: number;
    total: number;
    moneyline: number;
  };
  sameTimestampTies: number;
}

const EPS = 1e-6;

function toMs(ts: Date | string): number {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.getTime();
}

function toIso(ts: Date | string): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toISOString();
}

export function compareMarketLineRecency(
  a: Pick<MarketLineObservation, 'timestamp' | 'id'>,
  b: Pick<MarketLineObservation, 'timestamp' | 'id'>
): number {
  const ta = toMs(a.timestamp);
  const tb = toMs(b.timestamp);
  if (tb !== ta) return tb - ta; // timestamp DESC
  // id DESC — lexicographic is fine for cuid; still deterministic
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

export function sortMarketLinesByRecency<T extends Pick<MarketLineObservation, 'timestamp' | 'id'>>(
  rows: T[]
): T[] {
  return [...rows].sort(compareMarketLineRecency);
}

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPS;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function normalizeBook(name: string | null | undefined): string {
  return (name || 'unknown').trim();
}

function filterAsOf(
  rows: MarketLineObservation[],
  asOf: Date | string | null | undefined
): { rows: MarketLineObservation[]; usedFallback: boolean } {
  if (asOf == null) {
    return { rows, usedFallback: false };
  }
  const cutoff = toMs(asOf);
  const pre = rows.filter((r) => toMs(r.timestamp) <= cutoff);
  if (pre.length > 0) {
    return { rows: pre, usedFallback: false };
  }
  // No pre-kick observations — fallback to full history (documented).
  return { rows, usedFallback: true };
}

/**
 * Canonical HMA from a coherent home/away point pair.
 * home -7 / away +7 → HMA +7 (home favored)
 * home +7 / away -7 → HMA -7 (away favored)
 */
export function canonicalSpreadHma(homeLine: number, awayLine: number): number | null {
  if (!Number.isFinite(homeLine) || !Number.isFinite(awayLine)) return null;
  if (!approxEqual(homeLine, -awayLine)) return null;
  return -homeLine;
}

function countSameTimestampTies(rows: MarketLineObservation[]): number {
  const byKey = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.gameId}|${r.lineType}|${normalizeBook(r.bookName)}|${toIso(r.timestamp)}`;
    byKey.set(key, (byKey.get(key) || 0) + 1);
  }
  let ties = 0;
  for (const n of Array.from(byKey.values())) {
    if (n > 1) ties += n - 1;
  }
  return ties;
}

export function selectBookSpreadSnapshots(
  rows: MarketLineObservation[],
  homeTeamId: string,
  awayTeamId: string
): {
  snapshots: BookSpreadSnapshot[];
  incoherent: IncoherentSpreadPair[];
} {
  const spreads = rows.filter((r) => r.lineType === 'spread');
  const byBook = new Map<string, MarketLineObservation[]>();
  for (const r of spreads) {
    const book = normalizeBook(r.bookName);
    if (!byBook.has(book)) byBook.set(book, []);
    byBook.get(book)!.push(r);
  }

  const snapshots: BookSpreadSnapshot[] = [];
  const incoherent: IncoherentSpreadPair[] = [];

  // Array.from: Jest/ts-jest targets ES5 where for-of over Map is broken.
  for (const [bookName, bookRows] of Array.from(byBook.entries())) {
    const byTs = new Map<string, MarketLineObservation[]>();
    for (const r of bookRows) {
      const ts = toIso(r.timestamp);
      if (!byTs.has(ts)) byTs.set(ts, []);
      byTs.get(ts)!.push(r);
    }
    const timestamps = Array.from(byTs.keys()).sort(
      (a, b) => toMs(b) - toMs(a)
    );

    let placed = false;
    for (const latestTs of timestamps) {
      const atTs = sortMarketLinesByRecency(byTs.get(latestTs)!);
      const homeRow = atTs.find((r) => r.teamId === homeTeamId) ?? null;
      const awayRow = atTs.find((r) => r.teamId === awayTeamId) ?? null;
      if (!homeRow || !awayRow) {
        continue; // try older timestamp for a coherent pair
      }
      const homeLine = Number(homeRow.lineValue);
      const awayLine = Number(awayRow.lineValue);
      const hma = canonicalSpreadHma(homeLine, awayLine);
      if (hma == null) {
        incoherent.push({
          bookName,
          timestamp: latestTs,
          homeLine,
          awayLine,
          reason: `incoherent spread pair (${homeLine} / ${awayLine}); sides not opposite`,
        });
        placed = true;
        break;
      }
      snapshots.push({
        bookName,
        timestamp: latestTs,
        homeTeamId,
        awayTeamId,
        homeLine,
        awayLine,
        marketSpreadHma: hma,
        favoriteCentric: -Math.abs(hma),
        homeRowId: homeRow.id,
        awayRowId: awayRow.id,
        coherent: true,
      });
      placed = true;
      break;
    }

    if (!placed) {
      const latestTs = timestamps[0];
      if (latestTs) {
        incoherent.push({
          bookName,
          timestamp: latestTs,
          homeLine: null,
          awayLine: null,
          reason: 'spread snapshot missing coherent team pair at any timestamp',
        });
      }
    }
  }

  snapshots.sort((a, b) => {
    const t = toMs(b.timestamp) - toMs(a.timestamp);
    if (t !== 0) return t;
    return a.bookName.localeCompare(b.bookName);
  });

  return { snapshots, incoherent };
}

export function selectBookTotalSnapshots(
  rows: MarketLineObservation[]
): BookTotalSnapshot[] {
  const totals = rows.filter((r) => r.lineType === 'total');
  const byBook = new Map<string, MarketLineObservation[]>();
  for (const r of totals) {
    const book = normalizeBook(r.bookName);
    if (!byBook.has(book)) byBook.set(book, []);
    byBook.get(book)!.push(r);
  }

  const snapshots: BookTotalSnapshot[] = [];
  for (const [bookName, bookRows] of Array.from(byBook.entries())) {
    const sorted = sortMarketLinesByRecency(bookRows);
    const latest = sorted[0];
    if (!latest) continue;
    const total = Number(latest.lineValue);
    if (!Number.isFinite(total)) continue;
    snapshots.push({
      bookName,
      timestamp: toIso(latest.timestamp),
      total,
      rowId: latest.id,
    });
  }

  snapshots.sort((a, b) => {
    const t = toMs(b.timestamp) - toMs(a.timestamp);
    if (t !== 0) return t;
    return a.bookName.localeCompare(b.bookName);
  });
  return snapshots;
}

export function selectBookMoneylineSnapshots(
  rows: MarketLineObservation[],
  homeTeamId: string,
  awayTeamId: string
): {
  snapshots: BookMoneylineSnapshot[];
  incoherent: IncoherentMoneylinePair[];
} {
  const mls = rows.filter((r) => r.lineType === 'moneyline');
  const byBook = new Map<string, MarketLineObservation[]>();
  for (const r of mls) {
    const book = normalizeBook(r.bookName);
    if (!byBook.has(book)) byBook.set(book, []);
    byBook.get(book)!.push(r);
  }

  const snapshots: BookMoneylineSnapshot[] = [];
  const incoherent: IncoherentMoneylinePair[] = [];

  for (const [bookName, bookRows] of Array.from(byBook.entries())) {
    const byTs = new Map<string, MarketLineObservation[]>();
    for (const r of bookRows) {
      const ts = toIso(r.timestamp);
      if (!byTs.has(ts)) byTs.set(ts, []);
      byTs.get(ts)!.push(r);
    }
    const timestamps = Array.from(byTs.keys()).sort((a, b) => toMs(b) - toMs(a));

    let placed = false;
    for (const latestTs of timestamps) {
      const atTs = sortMarketLinesByRecency(byTs.get(latestTs)!);
      const homeRow = atTs.find((r) => r.teamId === homeTeamId) ?? null;
      const awayRow = atTs.find((r) => r.teamId === awayTeamId) ?? null;
      if (!homeRow || !awayRow) {
        continue;
      }
      const homePrice = Number(homeRow.lineValue);
      const awayPrice = Number(awayRow.lineValue);
      if (
        !Number.isFinite(homePrice) ||
        !Number.isFinite(awayPrice) ||
        homePrice === 0 ||
        awayPrice === 0
      ) {
        incoherent.push({
          bookName,
          timestamp: latestTs,
          homePrice,
          awayPrice,
          reason: 'moneyline prices nonfinite or zero',
        });
        placed = true;
        break;
      }
      snapshots.push({
        bookName,
        timestamp: latestTs,
        homeTeamId,
        awayTeamId,
        homePrice,
        awayPrice,
        homeRowId: homeRow.id,
        awayRowId: awayRow.id,
        coherent: true,
      });
      placed = true;
      break;
    }

    if (!placed && timestamps[0]) {
      incoherent.push({
        bookName,
        timestamp: timestamps[0],
        homePrice: null,
        awayPrice: null,
        reason: 'moneyline snapshot missing coherent team pair at any timestamp',
      });
    }
  }

  snapshots.sort((a, b) => {
    const t = toMs(b.timestamp) - toMs(a.timestamp);
    if (t !== 0) return t;
    return a.bookName.localeCompare(b.bookName);
  });
  return { snapshots, incoherent };
}

function consensusFromValues(
  values: number[],
  books: string[],
  rawHistoricalRows: number,
  currentSnapshotRows: number
): MarketConsensusResult {
  return {
    value: median(values),
    books: [...books].sort(),
    perBookCount: values.length,
    rawHistoricalRows,
    currentSnapshotRows,
    discardedHistoricalObservations: Math.max(
      0,
      rawHistoricalRows - currentSnapshotRows
    ),
  };
}

export function pickDisplaySpread(
  snapshots: BookSpreadSnapshot[]
): BookSpreadSnapshot | null {
  if (snapshots.length === 0) return null;
  return [...snapshots].sort((a, b) => {
    const t = toMs(b.timestamp) - toMs(a.timestamp);
    if (t !== 0) return t;
    // Deterministic id tie-break via homeRowId DESC
    if (a.homeRowId === b.homeRowId) return a.bookName.localeCompare(b.bookName);
    return a.homeRowId < b.homeRowId ? 1 : -1;
  })[0];
}

export function pickDisplayTotal(
  snapshots: BookTotalSnapshot[]
): BookTotalSnapshot | null {
  if (snapshots.length === 0) return null;
  return [...snapshots].sort((a, b) => {
    const t = toMs(b.timestamp) - toMs(a.timestamp);
    if (t !== 0) return t;
    if (a.rowId === b.rowId) return a.bookName.localeCompare(b.bookName);
    return a.rowId < b.rowId ? 1 : -1;
  })[0];
}

export function pickDisplayMoneyline(
  snapshots: BookMoneylineSnapshot[]
): BookMoneylineSnapshot | null {
  if (snapshots.length === 0) return null;
  return [...snapshots].sort((a, b) => {
    const t = toMs(b.timestamp) - toMs(a.timestamp);
    if (t !== 0) return t;
    if (a.homeRowId === b.homeRowId) return a.bookName.localeCompare(b.bookName);
    return a.homeRowId < b.homeRowId ? 1 : -1;
  })[0];
}

export function selectGameMarketSnapshots(options: {
  rows: MarketLineObservation[];
  homeTeamId: string;
  awayTeamId: string;
  /** When set, prefer observations at/before kickoff (closing). */
  kickoff?: Date | string | null;
  mode?: 'current' | 'closing';
}): GameMarketSelection {
  const mode =
    options.mode ?? (options.kickoff != null ? 'closing' : 'current');
  const kickoff = options.kickoff ?? null;
  const filtered =
    mode === 'closing'
      ? filterAsOf(options.rows, kickoff)
      : { rows: options.rows, usedFallback: false };

  const working = filtered.rows;
  const spreadRaw = working.filter((r) => r.lineType === 'spread').length;
  const totalRaw = working.filter((r) => r.lineType === 'total').length;
  const mlRaw = working.filter((r) => r.lineType === 'moneyline').length;

  const { snapshots: spreadByBook, incoherent: incoherentSpreads } =
    selectBookSpreadSnapshots(working, options.homeTeamId, options.awayTeamId);
  const totalByBook = selectBookTotalSnapshots(working);
  const { snapshots: moneylineByBook, incoherent: incoherentMoneylines } =
    selectBookMoneylineSnapshots(
      working,
      options.homeTeamId,
      options.awayTeamId
    );

  const spreadConsensus = consensusFromValues(
    spreadByBook.map((s) => s.marketSpreadHma),
    spreadByBook.map((s) => s.bookName),
    spreadRaw,
    // each coherent snapshot uses 2 rows
    spreadByBook.length * 2
  );
  const totalConsensus = consensusFromValues(
    totalByBook.map((s) => s.total),
    totalByBook.map((s) => s.bookName),
    totalRaw,
    totalByBook.length
  );

  return {
    mode,
    kickoff: kickoff != null ? toIso(kickoff) : null,
    usedPreKickFallback: filtered.usedFallback,
    spreadByBook,
    totalByBook,
    moneylineByBook,
    incoherentSpreads,
    incoherentMoneylines,
    displaySpread: pickDisplaySpread(spreadByBook),
    displayTotal: pickDisplayTotal(totalByBook),
    displayMoneyline: pickDisplayMoneyline(moneylineByBook),
    spreadConsensus,
    totalConsensus,
    rawCounts: {
      spread: spreadRaw,
      total: totalRaw,
      moneyline: mlRaw,
    },
    sameTimestampTies: countSameTimestampTies(working),
  };
}

/** Index selections for many games (slate). */
export function indexGameMarketSelections(options: {
  rows: MarketLineObservation[];
  games: Array<{
    gameId: string;
    homeTeamId: string;
    awayTeamId: string;
    kickoff?: Date | string | null;
    status?: string | null;
  }>;
}): Map<string, GameMarketSelection> {
  const byGame = new Map<string, MarketLineObservation[]>();
  for (const row of options.rows) {
    if (!byGame.has(row.gameId)) byGame.set(row.gameId, []);
    byGame.get(row.gameId)!.push(row);
  }

  const out = new Map<string, GameMarketSelection>();
  for (const g of options.games) {
    const rows = byGame.get(g.gameId) || [];
    const isFinal = g.status === 'final';
    out.set(
      g.gameId,
      selectGameMarketSnapshots({
        rows,
        homeTeamId: g.homeTeamId,
        awayTeamId: g.awayTeamId,
        kickoff: isFinal ? g.kickoff ?? null : null,
        mode: isFinal ? 'closing' : 'current',
      })
    );
  }
  return out;
}
