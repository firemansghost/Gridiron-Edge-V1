/**
 * Closing / primary display MarketLine selection.
 *
 * Uses the shared append-only snapshot layer (timestamp DESC, id DESC).
 * CLOSING: latest coherent per-book observation at/before kickoff
 *   (fallback to latest overall only when no pre-kick rows exist).
 * Spread `value` is canonical HMA (positive = home favored).
 */

import { prisma } from './prisma';
import {
  selectGameMarketSnapshots,
  type MarketLineObservation,
} from './market-line-snapshot';

export interface ClosingLine {
  value: number;
  book: string;
  timestamp: string;
  /** Present for spreads — team-specific provenance. */
  homeLine?: number;
  awayLine?: number;
  marketSpreadHma?: number;
  usedPreKickFallback?: boolean;
}

function toObservation(line: {
  id: string;
  gameId: string;
  lineType: string;
  lineValue: unknown;
  closingLine?: unknown;
  bookName: string;
  timestamp: Date;
  teamId?: string | null;
  source?: string | null;
}): MarketLineObservation {
  return {
    id: line.id,
    gameId: line.gameId,
    lineType: line.lineType,
    lineValue: Number(line.lineValue),
    closingLine:
      line.closingLine !== null && line.closingLine !== undefined
        ? Number(line.closingLine)
        : null,
    bookName: line.bookName,
    timestamp: line.timestamp,
    teamId: line.teamId ?? null,
    source: line.source ?? null,
  };
}

/**
 * Selects the closing (or best-available) line for a game and line type.
 *
 * Deterministic: timestamp DESC, id DESC; coherent home/away pairs for spreads.
 */
export async function selectClosingLine(
  gameId: string,
  lineType: 'spread' | 'total'
): Promise<ClosingLine | null> {
  try {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        date: true,
        homeTeamId: true,
        awayTeamId: true,
      },
    });

    if (!game?.date) {
      console.warn(`[CLOSING_LINE] Game ${gameId} not found or has no date`);
      return null;
    }

    const lines = await prisma.marketLine.findMany({
      where: { gameId, lineType },
      select: {
        id: true,
        gameId: true,
        lineType: true,
        lineValue: true,
        closingLine: true,
        bookName: true,
        timestamp: true,
        teamId: true,
        source: true,
      },
    });

    if (lines.length === 0) {
      console.log(`[CLOSING_LINE] No lines found for ${gameId} ${lineType}`);
      return null;
    }

    const sel = selectGameMarketSnapshots({
      rows: lines.map(toObservation),
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      kickoff: game.date,
      mode: 'closing',
    });

    if (lineType === 'spread') {
      const snap = sel.displaySpread;
      if (!snap) {
        console.log(`[CLOSING_LINE] No coherent closing spread for ${gameId}`);
        return null;
      }
      console.log(
        `[CLOSING_LINE] Closing spread for ${gameId}: HMA ${snap.marketSpreadHma} @ ${snap.bookName} ${snap.timestamp}` +
          (sel.usedPreKickFallback ? ' (fallback: no pre-kick)' : '')
      );
      return {
        value: snap.marketSpreadHma,
        book: snap.bookName,
        timestamp: snap.timestamp,
        homeLine: snap.homeLine,
        awayLine: snap.awayLine,
        marketSpreadHma: snap.marketSpreadHma,
        usedPreKickFallback: sel.usedPreKickFallback,
      };
    }

    const snap = sel.displayTotal;
    if (!snap) {
      console.log(`[CLOSING_LINE] No closing total for ${gameId}`);
      return null;
    }
    console.log(
      `[CLOSING_LINE] Closing total for ${gameId}: ${snap.total} @ ${snap.bookName} ${snap.timestamp}` +
        (sel.usedPreKickFallback ? ' (fallback: no pre-kick)' : '')
    );
    return {
      value: snap.total,
      book: snap.bookName,
      timestamp: snap.timestamp,
      usedPreKickFallback: sel.usedPreKickFallback,
    };
  } catch (error) {
    console.error(
      `[CLOSING_LINE] Error selecting closing line for ${gameId} ${lineType}:`,
      error
    );
    return null;
  }
}

export async function getClosingLines(gameId: string): Promise<{
  spread: ClosingLine | null;
  total: ClosingLine | null;
}> {
  const [spread, total] = await Promise.all([
    selectClosingLine(gameId, 'spread'),
    selectClosingLine(gameId, 'total'),
  ]);

  return { spread, total };
}

export async function getBatchClosingLines(
  gameIds: string[],
  lineType: 'spread' | 'total'
): Promise<Map<string, ClosingLine | null>> {
  const results = new Map<string, ClosingLine | null>();

  const promises = gameIds.map(async (gameId) => {
    const closingLine = await selectClosingLine(gameId, lineType);
    return { gameId, closingLine };
  });

  const resolved = await Promise.all(promises);

  for (const { gameId, closingLine } of resolved) {
    results.set(gameId, closingLine);
  }

  return results;
}
