/**
 * Bookmaker Name Normalization
 * 
 * Normalizes bookmaker names from various sources to consistent identifiers.
 * Handles aliases, case folding, and trimming.
 */

const BOOKMAKER_ALIASES: Record<string, string> = {
  // Common aliases
  'lowvig.ag': 'LowVig',
  'lowvig': 'LowVig',
  'betonline.ag': 'BetOnline',
  'betonline': 'BetOnline',
  'betmgm': 'BetMGM',
  'mgm': 'BetMGM',
  'draftkings': 'DraftKings',
  'dk': 'DraftKings',
  'fanduel': 'FanDuel',
  'fd': 'FanDuel',
  'caesars': 'Caesars',
  'caesars sportsbook': 'Caesars',
  'betrivers': 'BetRivers',
  'pointsbet': 'PointsBet',
  'unibet': 'Unibet',
  'wynnbet': 'WynnBet',
  'wynn': 'WynnBet',
  'barstool': 'Barstool',
  'barstool sportsbook': 'Barstool',
  'sugarhouse': 'SugarHouse',
  'sugar house': 'SugarHouse',
  'fox bet': 'FoxBet',
  'foxbet': 'FoxBet',
  'twinspires': 'TwinSpires',
  'twin spires': 'TwinSpires',
  'betfair': 'Betfair',
  'pinnacle': 'Pinnacle',
  'pinny': 'Pinnacle',
  '5dimes': '5Dimes',
  '5d': '5Dimes',
  'bovada': 'Bovada',
  'mybookie': 'MyBookie',
  'mybookie.ag': 'MyBookie',
  'bookmaker': 'Bookmaker',
  'bookmaker.eu': 'Bookmaker',
  'intertops': 'Intertops',
  'gtbets': 'GTBets',
  'gt bets': 'GTBets',
  'heritage': 'Heritage',
  'heritage sports': 'Heritage',
  'youwager': 'YouWager',
  'you wager': 'YouWager',
  'sportsbetting.ag': 'SportsBetting',
  'sportsbetting': 'SportsBetting',
  'xbet': 'XBet',
  'x bet': 'XBet',
  'betus': 'BetUS',
  'bet us': 'BetUS',
  'betnow': 'BetNow',
  'bet now': 'BetNow',
  'betanysports': 'BetAnySports',
  'bet any sports': 'BetAnySports',
};

/**
 * Normalize a bookmaker name to a consistent identifier
 * 
 * @param rawName - Raw bookmaker name from API (e.g., "FanDuel", "fanduel", "LowVig.ag")
 * @returns Normalized bookmaker name (e.g., "FanDuel", "LowVig")
 */
export function normalizeBookmakerName(rawName: string | null | undefined): string {
  if (!rawName) {
    return 'Unknown';
  }

  // Trim and case-fold
  const normalized = rawName.trim().toLowerCase();

  // Check aliases first
  if (BOOKMAKER_ALIASES[normalized]) {
    return BOOKMAKER_ALIASES[normalized];
  }

  // Remove common suffixes
  let cleaned = normalized
    .replace(/\.ag$/i, '')
    .replace(/\.com$/i, '')
    .replace(/\.net$/i, '')
    .replace(/\.eu$/i, '')
    .replace(/\s+sportsbook$/i, '')
    .replace(/\s+book$/i, '');

  // Check aliases again after cleaning
  if (BOOKMAKER_ALIASES[cleaned]) {
    return BOOKMAKER_ALIASES[cleaned];
  }

  // Title case the result (capitalize first letter of each word)
  const titleCased = cleaned
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return titleCased || 'Unknown';
}

/**
 * Validate that a bookmaker name is not "Unknown" or empty
 */
export function isValidBookmakerName(name: string | null | undefined): boolean {
  const normalized = normalizeBookmakerName(name);
  return normalized !== 'Unknown' && normalized.length > 0;
}

