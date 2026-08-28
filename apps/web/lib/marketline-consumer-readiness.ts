/**
 * Pure structural gate for append-only MarketLine consumer readiness.
 * No DB / no providers.
 */

import type { GameMarketSelection } from './market-line-snapshot';

export interface ConsumerReadinessGameInput {
  gameId: string;
  selection: GameMarketSelection | undefined;
}

export interface ConsumerReadinessGameResult {
  gameId: string;
  hasCoherentSpread: boolean;
  hasTotal: boolean;
  hasCoherentMoneyline: boolean;
  hasRequiredMarkets: boolean;
  structurallySelectable: boolean;
}

export interface ConsumerReadinessSummary {
  games: number;
  selectableGames: number;
  gamesMissingCoherentSpread: number;
  gamesMissingCoherentTotal: number;
  gamesMissingCoherentMl: number;
  allGamesHaveCoherentSpread: boolean;
  allGamesHaveTotal: boolean;
  allGamesHaveCoherentMoneyline: boolean;
  allGamesStructurallySelectable: boolean;
  pass: boolean;
  gameResults: ConsumerReadinessGameResult[];
}

export function evaluateGameConsumerReadiness(
  selection: GameMarketSelection | undefined
): Omit<ConsumerReadinessGameResult, 'gameId'> {
  const hasCoherentSpread = (selection?.spreadByBook.length ?? 0) > 0;
  const hasTotal = (selection?.totalByBook.length ?? 0) > 0;
  const hasCoherentMoneyline = (selection?.moneylineByBook.length ?? 0) > 0;
  const hasRequiredMarkets =
    hasCoherentSpread && hasTotal && hasCoherentMoneyline;
  return {
    hasCoherentSpread,
    hasTotal,
    hasCoherentMoneyline,
    hasRequiredMarkets,
    structurallySelectable: hasRequiredMarkets,
  };
}

export function evaluateMarketlineConsumerReadiness(
  games: ConsumerReadinessGameInput[]
): ConsumerReadinessSummary {
  const gameResults: ConsumerReadinessGameResult[] = games.map((g) => ({
    gameId: g.gameId,
    ...evaluateGameConsumerReadiness(g.selection),
  }));

  const selectableGames = gameResults.filter((g) => g.structurallySelectable)
    .length;
  const gamesMissingCoherentSpread = gameResults.filter(
    (g) => !g.hasCoherentSpread
  ).length;
  const gamesMissingCoherentTotal = gameResults.filter((g) => !g.hasTotal)
    .length;
  const gamesMissingCoherentMl = gameResults.filter(
    (g) => !g.hasCoherentMoneyline
  ).length;

  const allGamesHaveCoherentSpread =
    games.length > 0 && gamesMissingCoherentSpread === 0;
  const allGamesHaveTotal = games.length > 0 && gamesMissingCoherentTotal === 0;
  const allGamesHaveCoherentMoneyline =
    games.length > 0 && gamesMissingCoherentMl === 0;
  const allGamesStructurallySelectable =
    games.length > 0 && selectableGames === games.length;

  return {
    games: games.length,
    selectableGames,
    gamesMissingCoherentSpread,
    gamesMissingCoherentTotal,
    gamesMissingCoherentMl,
    allGamesHaveCoherentSpread,
    allGamesHaveTotal,
    allGamesHaveCoherentMoneyline,
    allGamesStructurallySelectable,
    pass: allGamesStructurallySelectable,
    gameResults,
  };
}
