/**
 * Pure grading settlement helpers (2C-2J-6A) — jobs copy.
 *
 * Keep in sync with apps/web/lib/grading/settlement.ts.
 * Duplicated because apps/jobs tsconfig.build rootDir cannot compile web imports.
 */

export type GradeMarketType = 'spread' | 'total' | 'moneyline';
export type GradeSide = 'home' | 'away' | 'over' | 'under';
export type GradeResult = 'win' | 'loss' | 'push';

export function americanToProb(price: number): number {
  if (price === 0 || !Number.isFinite(price)) return 0;
  return price > 0
    ? 100 / (price + 100)
    : Math.abs(price) / (Math.abs(price) + 100);
}

export function isValidAmericanOdds(price: number): boolean {
  return Number.isFinite(price) && price !== 0;
}

export function americanOddsWinPnl(
  stake: number,
  sportsbookAmerican: number
): number {
  if (!isValidAmericanOdds(sportsbookAmerican)) {
    throw new Error(
      `invalid sportsbook American odds for payout: ${sportsbookAmerican}`
    );
  }
  if (sportsbookAmerican < 0) {
    return stake * (100 / Math.abs(sportsbookAmerican));
  }
  return stake * (sportsbookAmerican / 100);
}

export function resolveSideTeamId(options: {
  marketType: GradeMarketType;
  side: GradeSide | string;
  homeTeamId: string;
  awayTeamId: string;
}): string | null {
  if (options.marketType === 'total') return null;
  if (options.side === 'home') return options.homeTeamId;
  if (options.side === 'away') return options.awayTeamId;
  return null;
}

export function isOfficial2026MissingClosePrice(options: {
  season: number;
  strategyTag: string | null | undefined;
  closePrice: number | null | undefined;
}): boolean {
  return (
    options.season >= 2026 &&
    options.strategyTag === 'official_flat_100' &&
    (options.closePrice === null || options.closePrice === undefined)
  );
}

export function gradeSpreadTotal(
  marketType: Exclude<GradeMarketType, 'moneyline'>,
  side: GradeSide | string,
  modelLine: number,
  closeLine: number,
  margin: number,
  totalPts: number,
  stake: number
): { result: GradeResult; pnl: number; clv: number } {
  let result: GradeResult;
  if (marketType === 'spread') {
    const sideMargin = side === 'home' ? margin : -margin;
    // closeLine is the selected side's signed wager line (underdog +, favorite −).
    const diff = sideMargin + closeLine;
    if (Math.abs(diff) < 0.5) {
      result = 'push';
    } else {
      result = diff > 0 ? 'win' : 'loss';
    }
  } else {
    const diff = side === 'over' ? totalPts - closeLine : closeLine - totalPts;
    if (Math.abs(diff) < 0.5) {
      result = 'push';
    } else {
      result = diff > 0 ? 'win' : 'loss';
    }
  }

  const pnl = result === 'win' ? stake * 0.909 : result === 'loss' ? -stake : 0;

  let clv: number;
  if (marketType === 'spread') {
    // Both modelLine and closeLine are the selected team's signed spread.
    clv = closeLine - modelLine;
  } else {
    clv = side === 'over' ? modelLine - closeLine : closeLine - modelLine;
  }

  return { result, pnl, clv };
}

export function gradeMoneyline(
  side: GradeSide | string,
  modelPrice: number,
  closePrice: number,
  margin: number,
  stake: number
): { result: GradeResult; pnl: number; clv: number } {
  if (!isValidAmericanOdds(closePrice)) {
    throw new Error(
      `moneyline grading refused: invalid sportsbook closePrice=${closePrice}`
    );
  }

  let winner: 'home' | 'away' | 'push';
  if (margin > 0) winner = 'home';
  else if (margin < 0) winner = 'away';
  else winner = 'push';

  let result: GradeResult;
  if (winner === 'push') result = 'push';
  else result = side === winner ? 'win' : 'loss';

  let pnl = 0;
  if (result === 'win') {
    pnl = americanOddsWinPnl(stake, closePrice);
  } else if (result === 'loss') {
    pnl = -stake;
  }

  const pModel = americanToProb(modelPrice);
  const pClose = americanToProb(closePrice);
  const clv = pModel - pClose;

  return { result, pnl, clv };
}

export type CloseLineLookupRow = { lineValue: unknown; id?: string };

export type CloseLineLookupDeps = {
  findFirst: (args: {
    where: Record<string, unknown>;
    orderBy: Array<Record<string, 'asc' | 'desc'>>;
  }) => Promise<CloseLineLookupRow | null>;
};

export async function findCloseLineAtCutoff(
  deps: CloseLineLookupDeps,
  options: {
    gameId: string;
    marketType: GradeMarketType;
    side: GradeSide | string;
    homeTeamId: string;
    awayTeamId: string;
    cutoff: Date;
  }
): Promise<number | null> {
  const lineType =
    options.marketType === 'moneyline' ? 'moneyline' : options.marketType;

  const where: Record<string, unknown> = {
    gameId: options.gameId,
    lineType,
    timestamp: { lte: options.cutoff },
  };

  if (options.marketType === 'spread' || options.marketType === 'moneyline') {
    const teamId = resolveSideTeamId({
      marketType: options.marketType,
      side: options.side,
      homeTeamId: options.homeTeamId,
      awayTeamId: options.awayTeamId,
    });
    if (!teamId) return null;
    where.teamId = teamId;
  }

  const row = await deps.findFirst({
    where,
    orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
  });

  if (!row) return null;
  const value = Number(row.lineValue);
  return Number.isFinite(value) ? value : null;
}
