/**
 * Helper functions for computing and formatting picks
 * 
 * CONVENTION: All spreads are favorite-centric (favorite always shows -X.X)
 * Input spreads are in home-minus-away format (negative = home favored, positive = away favored)
 */

/**
 * Rounds a number to the nearest 0.5
 * Examples: 48.6126 → 48.5, 48.3 → 48.5, 48.1 → 48.0
 */
export function roundToHalf(x: number): number {
  return Math.round(x * 2) / 2;
}

/**
 * Determines the favored side based on implied spread (home-minus-away convention)
 * Negative spread means home team is favored, positive means away team is favored
 */
export function getFavoredSide(impliedSpread: number): 'home' | 'away' {
  return impliedSpread < 0 ? 'home' : 'away';
}

/**
 * Converts a home-minus-away spread to favorite-centric format
 * Returns: { favoriteTeamId, favoriteTeamName, favoriteSpread }
 * where favoriteSpread is always negative (e.g., -3.5 for favorite laying 3.5)
 */
export function convertToFavoriteCentric(
  spread: number, // home-minus-away convention
  homeTeamId: string,
  homeTeamName: string,
  awayTeamId: string,
  awayTeamName: string
): {
  favoriteTeamId: string;
  favoriteTeamName: string;
  favoriteSpread: number; // Always negative (favorite laying points)
  underdogTeamId: string;
  underdogTeamName: string;
  underdogSpread: number; // Always positive (underdog getting points)
} {
  const favoredSide = getFavoredSide(spread);
  const line = roundToHalf(Math.abs(spread));
  
  if (favoredSide === 'home') {
    return {
      favoriteTeamId: homeTeamId,
      favoriteTeamName: homeTeamName,
      favoriteSpread: -line, // Favorite always negative
      underdogTeamId: awayTeamId,
      underdogTeamName: awayTeamName,
      underdogSpread: line, // Underdog always positive
    };
  } else {
    return {
      favoriteTeamId: awayTeamId,
      favoriteTeamName: awayTeamName,
      favoriteSpread: -line, // Favorite always negative
      underdogTeamId: homeTeamId,
      underdogTeamName: homeTeamName,
      underdogSpread: line, // Underdog always positive
    };
  }
}

/**
 * Formats a favorite-centric spread for display
 * Examples: formatFavoriteSpread("Alabama", -3.5) → "Alabama -3.5"
 *           formatFavoriteSpread("Navy", -25.5) → "Navy -25.5"
 */
export function formatFavoriteSpread(teamName: string, spread: number): string {
  return `${teamName} ${spread.toFixed(1)}`;
}

/**
 * Formats an underdog spread for display (always positive)
 * Examples: formatUnderdogSpread("Navy", 25.5) → "Navy +25.5"
 */
export function formatUnderdogSpread(teamName: string, spread: number): string {
  return `${teamName} +${spread.toFixed(1)}`;
}

/**
 * Computes ATS edge between model and market (favorite-centric)
 * Returns the edge in points: positive means model thinks favorite should lay more
 * 
 * Edge = (Model favorite spread) - (Market favorite spread)
 * 
 * If model and market favor different teams, we flip one to compare apples-to-apples.
 */
export function computeATSEdge(
  modelSpread: number, // home-minus-away
  marketSpread: number, // home-minus-away
  homeTeamId: string,
  awayTeamId: string
): number {
  const modelFC = convertToFavoriteCentric(
    modelSpread,
    homeTeamId,
    '', // Names not needed for edge calc
    awayTeamId,
    ''
  );
  
  const marketFC = convertToFavoriteCentric(
    marketSpread,
    homeTeamId,
    '',
    awayTeamId,
    ''
  );
  
  // If same team is favored, simple subtraction
  if (modelFC.favoriteTeamId === marketFC.favoriteTeamId) {
    return modelFC.favoriteSpread - marketFC.favoriteSpread;
  }
  
  // If different teams favored, flip one to compare
  // Model favorite spread vs Market underdog spread (flipped)
  // Example: Model favors Home -3, Market favors Away -7
  // Edge = (-3) - (-7) = +4 (model thinks home should be favored by 4 more than market thinks away should be)
  // But we need to think: if market says away -7, that's home +7
  // So model home -3 vs market home +7 = edge of -10 (model thinks home should be favored by 10 less)
  // Actually: Model home -3 means home by 3, Market away -7 means away by 7 (home by -7)
  // Edge = Model favorite spread - Market favorite spread (flipped)
  // If market favors away by 7, that's home by -7, so model home -3 vs market home -(-7) = -3 - 7 = -10
  // More clearly: convert both to same reference (home team)
  const modelHomeSpread = modelSpread; // Already home-minus-away
  const marketHomeSpread = marketSpread; // Already home-minus-away
  
  // Edge from home perspective: model - market
  // Positive = model thinks home should be favored more
  return modelHomeSpread - marketHomeSpread;
}

/**
 * Computes spread pick details (favorite-centric)
 * Returns the model's favorite team and spread
 */
export function computeSpreadPick(
  impliedSpread: number,
  homeTeamName: string,
  awayTeamName: string,
  homeTeamId: string,
  awayTeamId: string
) {
  const fc = convertToFavoriteCentric(
    impliedSpread,
    homeTeamId,
    homeTeamName,
    awayTeamId,
    awayTeamName
  );
  
  return {
    favoredSide: fc.favoriteTeamId === homeTeamId ? 'home' : 'away',
    favoredTeamId: fc.favoriteTeamId,
    favoredTeamName: fc.favoriteTeamName,
    favoriteSpread: fc.favoriteSpread,
    underdogTeamId: fc.underdogTeamId,
    underdogTeamName: fc.underdogTeamName,
    underdogSpread: fc.underdogSpread,
    modelSpreadPick: {
      teamId: fc.favoriteTeamId,
      teamName: fc.favoriteTeamName,
      line: fc.favoriteSpread
    },
    spreadPickLabel: formatFavoriteSpread(fc.favoriteTeamName, fc.favoriteSpread)
  };
}

/**
 * Computes the actual bettable pick based on model vs market edge
 * When model and market favor different teams, determines which side to bet
 * Returns: { teamId, teamName, line, label, edgePts }
 */
export function computeBettableSpreadPick(
  modelSpread: number, // home-minus-away
  marketSpread: number, // home-minus-away
  homeTeamId: string,
  homeTeamName: string,
  awayTeamId: string,
  awayTeamName: string,
  atsEdge: number
) {
  const modelFC = convertToFavoriteCentric(modelSpread, homeTeamId, homeTeamName, awayTeamId, awayTeamName);
  const marketFC = convertToFavoriteCentric(marketSpread, homeTeamId, homeTeamName, awayTeamId, awayTeamName);
  
  // If same team favored, bet the model's favorite at market line
  if (modelFC.favoriteTeamId === marketFC.favoriteTeamId) {
    // Model and market both favor same team
    // If edge is positive, model thinks favorite should lay more → take underdog +market
    // If edge is negative, model thinks favorite should lay less → take favorite -market
    if (atsEdge > 0) {
      // Model thinks favorite should lay more → take underdog getting points
      return {
        teamId: marketFC.underdogTeamId,
        teamName: marketFC.underdogTeamName,
        line: marketFC.underdogSpread, // Positive (underdog getting points)
        label: formatUnderdogSpread(marketFC.underdogTeamName, marketFC.underdogSpread),
        edgePts: atsEdge,
        reasoning: `Model thinks ${modelFC.favoriteTeamName} should lay more than market, so take ${marketFC.underdogTeamName} +${marketFC.underdogSpread}`
      };
    } else {
      // Model thinks favorite should lay less → take favorite laying points
      return {
        teamId: marketFC.favoriteTeamId,
        teamName: marketFC.favoriteTeamName,
        line: marketFC.favoriteSpread, // Negative (favorite laying points)
        label: formatFavoriteSpread(marketFC.favoriteTeamName, marketFC.favoriteSpread),
        edgePts: Math.abs(atsEdge),
        reasoning: `Model thinks ${modelFC.favoriteTeamName} should lay less than market, so take ${marketFC.favoriteTeamName} ${marketFC.favoriteSpread}`
      };
    }
  }
  
  // If different teams favored, determine which side has the edge
  // Edge = modelHomeSpread - marketHomeSpread (from home perspective)
  // Positive edge = model favors home more → take home +market (if market favors away)
  // Negative edge = model favors away more → take away +market (if market favors home)
  
  if (atsEdge > 0) {
    // Model favors home more than market does
    // If market favors away, take home +market
    // If market favors home, take home -market (but this shouldn't happen if edge is positive)
    if (marketFC.favoriteTeamId === awayTeamId) {
      // Market favors away, model favors home → take home +market
      return {
        teamId: homeTeamId,
        teamName: homeTeamName,
        line: -marketSpread, // Flip market spread: if market says away -10, home gets +10
        label: formatUnderdogSpread(homeTeamName, -marketSpread),
        edgePts: atsEdge,
        reasoning: `Model favors ${homeTeamName} more than market favors ${awayTeamName}, so take ${homeTeamName} +${-marketSpread}`
      };
    } else {
      // Market also favors home, but model more so → take home -market (less than model thinks)
      return {
        teamId: homeTeamId,
        teamName: homeTeamName,
        line: marketFC.favoriteSpread,
        label: formatFavoriteSpread(homeTeamName, marketFC.favoriteSpread),
        edgePts: atsEdge,
        reasoning: `Model favors ${homeTeamName} more than market, so take ${homeTeamName} ${marketFC.favoriteSpread}`
      };
    }
  } else {
    // Model favors away more than market does (or market favors home more)
    if (marketFC.favoriteTeamId === homeTeamId) {
      // Market favors home, model favors away → take away +market
      return {
        teamId: awayTeamId,
        teamName: awayTeamName,
        line: marketSpread, // Market spread is positive (away favored), so away gets +market
        label: formatUnderdogSpread(awayTeamName, marketSpread),
        edgePts: Math.abs(atsEdge),
        reasoning: `Model favors ${awayTeamName} more than market favors ${homeTeamName}, so take ${awayTeamName} +${marketSpread}`
      };
    } else {
      // Market also favors away, but model more so → take away -market (less than model thinks)
      return {
        teamId: awayTeamId,
        teamName: awayTeamName,
        line: marketFC.favoriteSpread,
        label: formatFavoriteSpread(awayTeamName, marketFC.favoriteSpread),
        edgePts: Math.abs(atsEdge),
        reasoning: `Model favors ${awayTeamName} more than market, so take ${awayTeamName} ${marketFC.favoriteSpread}`
      };
    }
  }
}

/**
 * Computes total pick details
 * Returns pick with clear Over/Under direction and edge display
 */
export function computeTotalPick(impliedTotal: number, marketTotal: number) {
  if (impliedTotal === marketTotal) {
    return {
      totalPick: null,
      totalPickLabel: null,
      edgeDisplay: null
    };
  }
  
  const pick = impliedTotal > marketTotal ? 'Over' : 'Under';
  const roundedTotal = roundToHalf(marketTotal);
  const edge = Math.abs(impliedTotal - marketTotal);
  
  // Format: "Over 55.5 by 3.5 (Model 59.0 vs Market 55.5)"
  const totalPickLabel = `${pick} ${roundedTotal.toFixed(1)}`;
  const edgeDisplay = `${pick} by ${edge.toFixed(1)} (Model ${impliedTotal.toFixed(1)} vs Market ${marketTotal.toFixed(1)})`;
  
  return {
    totalPick: pick as 'Over' | 'Under',
    totalPickLabel,
    edgeDisplay
  };
}
