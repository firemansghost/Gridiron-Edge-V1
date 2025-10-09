export interface Game {
  gameId: string;
  matchup: string;
  kickoff: string;
  venue: string;
  neutralSite: boolean;
  marketSpread: number;
  marketTotal: number;
  impliedSpread: number;
  impliedTotal: number;
  spreadEdge: number;
  totalEdge: number;
  maxEdge: number;
  confidence: string;
  modelVersion: string;
}

export interface SlateData {
  success: boolean;
  week: number;
  season: number;
  modelVersion: string;
  games: Game[];
  summary: {
    totalGames: number;
    confidenceBreakdown: {
      A: number;
      B: number;
      C: number;
    };
  };
}
