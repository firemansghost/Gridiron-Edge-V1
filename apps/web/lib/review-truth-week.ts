export type ReviewBetMarketType = 'spread' | 'moneyline' | 'total' | string;

export interface ReviewBetRow {
  marketType: ReviewBetMarketType;
  result: 'win' | 'loss' | 'push' | null;
  stake: number;
  pnl: number | null;
  clv: number | null;
}

export interface ReviewSummaryMetrics {
  totalBets: number;
  gradedBets: number;
  pendingBets: number;
  wins: number;
  losses: number;
  pushes: number;
  gradedStake: number;
  totalPnL: number;
  roi: number; // decimal, not percent
  hitRate: number; // decimal, pushes excluded
  avgCLV: number;
}

export interface MarketBreakdownMetrics extends ReviewSummaryMetrics {
  pnl: number; // alias for clarity at the byMarketType level
}

function computeSummaryFromBets(bets: ReviewBetRow[]): ReviewSummaryMetrics {
  const totalBets = bets.length;
  const gradedBets = bets.filter((b) => b.result !== null);
  const pendingBets = totalBets - gradedBets.length;

  const wins = gradedBets.filter((b) => b.result === 'win').length;
  const losses = gradedBets.filter((b) => b.result === 'loss').length;
  const pushes = gradedBets.filter((b) => b.result === 'push').length;

  const gradedStake = gradedBets.reduce((sum, b) => sum + Number(b.stake), 0);
  const totalPnL = gradedBets.reduce((sum, b) => sum + Number(b.pnl ?? 0), 0);

  const roi = gradedStake > 0 ? totalPnL / gradedStake : 0;

  // Hit rate excludes pushes: wins / (wins + losses)
  const hitDenom = wins + losses;
  const hitRate = hitDenom > 0 ? wins / hitDenom : 0;

  const clvValues = gradedBets
    .filter((b) => b.clv !== null)
    .map((b) => Number(b.clv));
  const avgCLV =
    clvValues.length > 0
      ? clvValues.reduce((sum, v) => sum + v, 0) / clvValues.length
      : 0;

  return {
    totalBets,
    gradedBets: gradedBets.length,
    pendingBets,
    wins,
    losses,
    pushes,
    gradedStake,
    totalPnL,
    roi,
    hitRate,
    avgCLV,
  };
}

export function computeWeekReviewMetrics(bets: ReviewBetRow[]): ReviewSummaryMetrics {
  return computeSummaryFromBets(bets);
}

export function computeMarketBreakdownByMarketType(
  bets: ReviewBetRow[]
): Record<string, MarketBreakdownMetrics> {
  const groups: Record<string, ReviewBetRow[]> = {};
  for (const bet of bets) {
    const mt = String(bet.marketType);
    if (!groups[mt]) groups[mt] = [];
    groups[mt].push(bet);
  }

  const out: Record<string, MarketBreakdownMetrics> = {};
  for (const mt of Object.keys(groups)) {
    const metrics = computeSummaryFromBets(groups[mt]);
    out[mt] = {
      ...metrics,
      pnl: metrics.totalPnL,
    };
  }
  return out;
}

