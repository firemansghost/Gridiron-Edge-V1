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
  
  // New explicit pick fields
  favoredSide: 'home' | 'away';
  favoredTeamId: string;
  favoredTeamName: string;
  modelSpreadPick: {
    teamId: string;
    teamName: string;
    line: number;
  };
  spreadPickLabel: string;
  spreadEdgePts: number;
  totalPick: 'Over' | 'Under' | null;
  totalPickLabel: string | null;
  totalEdgePts: number;
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
  signConvention: {
    spread: string;
    hfaPoints: number;
  };
}
