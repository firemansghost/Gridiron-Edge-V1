/**
 * Helper functions for computing and formatting picks
 */

/**
 * Rounds a number to the nearest 0.5
 * Examples: 48.6126 → 48.5, 48.3 → 48.5, 48.1 → 48.0
 */
export function roundToHalf(x: number): number {
  return Math.round(x * 2) / 2;
}

/**
 * Formats a spread value for a team
 * Examples: formatSpread("Alabama", -3.0) → "Alabama -3.0"
 *           formatSpread("Western Kentucky", 3.0) → "Western Kentucky +3.0"
 */
export function formatSpread(teamName: string, value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${teamName} ${sign}${value.toFixed(1)}`;
}

/**
 * Determines the favored side based on implied spread
 * Negative spread means home team is favored, positive means away team is favored
 */
export function getFavoredSide(impliedSpread: number): 'home' | 'away' {
  return impliedSpread < 0 ? 'home' : 'away';
}

/**
 * Computes spread pick details
 */
export function computeSpreadPick(
  impliedSpread: number,
  homeTeamName: string,
  awayTeamName: string,
  homeTeamId: string,
  awayTeamId: string
) {
  const favoredSide = getFavoredSide(impliedSpread);
  const line = roundToHalf(Math.abs(impliedSpread));
  const signedLine = impliedSpread < 0 ? -line : line;
  
  const favoredTeamId = favoredSide === 'home' ? homeTeamId : awayTeamId;
  const favoredTeamName = favoredSide === 'home' ? homeTeamName : awayTeamName;
  
  return {
    favoredSide,
    favoredTeamId,
    favoredTeamName,
    modelSpreadPick: {
      teamId: favoredTeamId,
      teamName: favoredTeamName,
      line: signedLine
    },
    spreadPickLabel: formatSpread(favoredTeamName, signedLine)
  };
}

/**
 * Computes total pick details
 */
export function computeTotalPick(impliedTotal: number, marketTotal: number) {
  if (impliedTotal === marketTotal) {
    return {
      totalPick: null,
      totalPickLabel: null
    };
  }
  
  const pick = impliedTotal > marketTotal ? 'Over' : 'Under';
  const roundedTotal = roundToHalf(marketTotal);
  
  return {
    totalPick: pick as 'Over' | 'Under',
    totalPickLabel: `${pick} ${roundedTotal.toFixed(1)}`
  };
}
